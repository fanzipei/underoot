import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DATA_DIR } from './paths.js';
import {
  db, getUserByEmail, getUserById, createUser,
  publicUser, isAccountLocked, recordLoginFailure, clearLoginFailures,
} from './db.js';
import { approvalRequired, adminEmail, removeAdminPasswordFile, secureCookie } from './config.js';

const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
function loadSecret() {
  if (process.env.LATEXSTUDIO_SECRET) return process.env.LATEXSTUDIO_SECRET;
  try {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
    return secret;
  }
}
const SECRET = loadSecret();
export const COOKIE_NAME = 'ls_token';

export const AVATAR_COLORS = ['#1f8a4c', '#2563eb', '#b45309', '#9333ea', '#0e7490', '#be123c', '#4d7c0f', '#7c3aed'];
export const pickColor = (seed) => AVATAR_COLORS[Math.abs([...String(seed)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % AVATAR_COLORS.length];

export function signToken(user) {
  return jwt.sign({ uid: user.id, email: user.email }, SECRET, { expiresIn: '30d' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

/** 待审批账号不允许登录，也不会拿到会话 */
export function loginBlockReason(row) {
  if (!row) return null;
  if (row.status === 'pending') return '账号正在等待管理员审批，通过后即可登录';
  if (row.status === 'rejected') return '注册申请未通过审批，如有疑问请联系管理员';
  if (row.disabled) return '该账号已被停用';
  return null;
}

export function userFromRequest(req) {
  let token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) token = auth.slice(7);
  }
  if (!token && req.query?.token) token = String(req.query.token);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const row = getUserById(payload.uid);
  if (!row || row.disabled || (row.status && row.status !== 'active')) return null;
  return row;
}

export function requireAuth(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: '请先登录' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: '请先登录' });
  if (user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  req.user = user;
  next();
}

export function setAuthCookie(res, token, req) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(req?.secure) || secureCookie(),
    maxAge: 30 * 24 * 3600 * 1000,
    path: '/',
  });
}

export const authRouter = express.Router();

/** 简单的登录失败限速：同一 IP + 邮箱 5 分钟内最多 8 次失败 */
const failedLogins = new Map();
const WINDOW = 5 * 60 * 1000;
const MAX_FAILURES = 8;

function loginBlocked(key) {
  const rec = failedLogins.get(key);
  if (!rec) return false;
  if (Date.now() > rec.resetAt) {
    failedLogins.delete(key);
    return false;
  }
  return rec.count >= MAX_FAILURES;
}

function noteFailure(key) {
  const rec = failedLogins.get(key);
  if (!rec || Date.now() > rec.resetAt) {
    failedLogins.set(key, { count: 1, resetAt: Date.now() + WINDOW });
  } else {
    rec.count += 1;
  }
}

// 定期清理过期记录，避免内存无限增长
const cleanupTimer = setInterval(() => {
  for (const [key, rec] of failedLogins) {
    if (Date.now() > rec.resetAt) failedLogins.delete(key);
  }
}, WINDOW);
cleanupTimer.unref?.();

/* ---------- 表单校验 ---------- */
const isEmail = (value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);

// 外网暴露场景下提高密码强度要求：至少 8 位、不超过 64 位、至少含 3 类不同字符，
// 且不在常见弱口令黑名单内。
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 64;
const COMMON_PASSWORDS = new Set([
  'password', '12345678', '123456789', 'qwerty123', 'abcd1234', 'latex123',
  'latexstudio', 'admin1234', '11111111', '00000000', 'password1', 'letmein1',
]);
function isPassword(value) {
  if (typeof value !== 'string') return false;
  if (value.length < PASSWORD_MIN_LENGTH || value.length > PASSWORD_MAX_LENGTH) return false;
  if (/^\s+$/.test(value)) return false;
  // 至少 3 类不同字符，避免 aaaaaaaa 这类弱口令
  if (new Set(value.split('')).size < 3) return false;
  const lower = value.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) return false;
  return true;
}
const passwordHint = `密码需 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位，至少包含 3 个不同字符，且不能是常见弱口令`;

/** 账号创建后的响应：需要审批时不下发会话 */
function respondCreated(res, req, row) {
  if (row.status === 'active') {
    setAuthCookie(res, signToken(row), req);
    return res.json({ user: publicUser(row) });
  }
  return res.status(201).json({
    pending: true,
    user: { email: row.email, name: row.name, status: row.status },
    message: '注册申请已提交，等待管理员审批',
  });
}

/* ---------- 前端需要的公开配置 ---------- */
authRouter.get('/config', (req, res) => {
  res.json({
    approvalRequired: approvalRequired(),
    openRegistration: !approvalRequired(),
    adminEmail: adminEmail(),
  });
});

/* ---------- 邮箱注册 / 登录 ---------- */
// 注册限流：同一 IP 10 分钟内最多 5 次注册，防止外网批量注册刷审批队列。
// 内网 / 回归测试可通过 LATEXSTUDIO_REGISTER_MAX 放宽，设 0 关闭（不建议公网使用）。
const regAttempts = new Map();
const REG_WINDOW = 10 * 60 * 1000;
const REG_MAX = (() => {
  const raw = Number(process.env.LATEXSTUDIO_REGISTER_MAX ?? 5);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5;
})();

function registerThrottled(ip) {
  if (REG_MAX === 0) return false;
  const rec = regAttempts.get(ip);
  if (!rec || Date.now() > rec.resetAt) {
    regAttempts.set(ip, { count: 1, resetAt: Date.now() + REG_WINDOW });
    return false;
  }
  rec.count += 1;
  return rec.count > REG_MAX;
}

authRouter.post('/register', (req, res) => {
  const clientIp = req.ip || 'unknown';
  if (registerThrottled(clientIp)) {
    return res.status(429).json({ error: '注册请求过于频繁，请稍后再试' });
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  const name = String(req.body?.name || '').trim();
  const password = String(req.body?.password || '');
  if (!isEmail(email)) return res.status(400).json({ error: '邮箱格式不正确' });
  if (!isPassword(password)) return res.status(400).json({ error: passwordHint });
  if (getUserByEmail(email)) return res.status(409).json({ error: '该邮箱已被注册' });

  const row = createUser({
    email,
    name: name.slice(0, 40) || email.split('@')[0],
    password: bcrypt.hashSync(password, 10),
    color: pickColor(email),
    status: approvalRequired() ? 'pending' : 'active',
  });
  respondCreated(res, req, row);
});

authRouter.post('/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const key = `${req.ip || 'unknown'}:${email}`;
  if (loginBlocked(key)) {
    return res.status(429).json({ error: '尝试次数过多，请 5 分钟后再试' });
  }
  const row = getUserByEmail(email);
  if (!row) {
    // 不存在的账号：只记内存限速，不暴露账号是否存在
    noteFailure(key);
    return res.status(401).json({ error: '邮箱或密码不正确' });
  }
  // 已锁定的账号直接拒绝，避免继续试密码，同时给出明确提示
  if (isAccountLocked(row)) {
    return res.status(429).json({ error: '该账号已被临时锁定，请 15 分钟后再试，或联系管理员' });
  }
  if (!bcrypt.compareSync(password, row.password)) {
    noteFailure(key);
    recordLoginFailure(row.id); // 仅对存在的账号累加，避免被用来探测邮箱是否存在
    // 记录失败后立即用最新行判断是否已达锁定阈值，命中则给 429 而非普通 401
    if (isAccountLocked(getUserById(row.id))) {
      return res.status(429).json({ error: '该账号已被临时锁定，请 15 分钟后再试，或联系管理员' });
    }
    return res.status(401).json({ error: '邮箱或密码不正确' });
  }
  const blocked = loginBlockReason(row);
  if (blocked) {
    noteFailure(key);
    return res.status(403).json({ error: blocked });
  }
  clearLoginFailures(row.id);
  failedLogins.delete(key);
  setAuthCookie(res, signToken(row), req);
  res.json({ user: publicUser(row) });
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

authRouter.patch('/me', requireAuth, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const color = String(req.body?.color || '').trim();
  if (name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.slice(0, 40), req.user.id);
  if (/^#[0-9a-f]{6}$/i.test(color)) db.prepare('UPDATE users SET color = ? WHERE id = ?').run(color, req.user.id);
  res.json({ user: publicUser(getUserById(req.user.id)) });
});

authRouter.post('/password', requireAuth, (req, res) => {
  const current = String(req.body?.current || '');
  const next = String(req.body?.next || '');
  if (!bcrypt.compareSync(current, req.user.password)) return res.status(400).json({ error: '当前密码不正确' });
  if (!isPassword(next)) return res.status(400).json({ error: passwordHint });
  db.prepare('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?')
    .run(bcrypt.hashSync(next, 10), req.user.id);
  // 管理员已自行改密，初始密码文件不再需要
  if (req.user.role === 'admin') removeAdminPasswordFile();
  setAuthCookie(res, signToken(getUserById(req.user.id)), req);
  res.json({ user: publicUser(getUserById(req.user.id)) });
});

authRouter.get('/ws-token', requireAuth, (req, res) => {
  res.json({ token: signToken(req.user) });
});

export { bcrypt };
