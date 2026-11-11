import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { DB_FILE } from './paths.js';

export const db = new DatabaseSync(DB_FILE);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  password    TEXT NOT NULL,
  color       TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  main_file   TEXT NOT NULL DEFAULT 'main.tex',
  template    TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'owner',
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS compiles (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     TEXT,
  ok          INTEGER NOT NULL,
  ms          INTEGER NOT NULL,
  engine      TEXT,
  log         TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS versions (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  content     TEXT NOT NULL,
  author_id   TEXT,
  created_at  INTEGER NOT NULL
);

-- 站点级设置（管理员可在后台动态修改，无需改 .env 重启）
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  updated_by  TEXT
);

-- 协作评论。锚点分两类：
--   source: 文件内选区（path + from/to 字符偏移 + quote 原文，便于内容漂移后重新定位）
--   pdf:    PDF 页面上的框选区域（page + rect 归一化坐标，缩放/换 PDF 后位置不失效）
CREATE TABLE IF NOT EXISTS comments (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id    TEXT NOT NULL,
  body         TEXT NOT NULL,
  anchor_type  TEXT NOT NULL DEFAULT 'source',
  path         TEXT,
  from_pos     INTEGER,
  to_pos       INTEGER,
  quote        TEXT,
  page         INTEGER,
  rect         TEXT,
  resolved     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS comment_replies (
  id           TEXT PRIMARY KEY,
  comment_id   TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  author_id    TEXT NOT NULL,
  body         TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_replies_comment ON comment_replies(comment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_versions_file ON versions(project_id, path, created_at DESC);
`);

// 轻量迁移：老库补上 disabled 字段，用于停用共享的演示账号
const userColumns = db.prepare('PRAGMA table_info(users)').all();
const hasColumn = (name) => userColumns.some((c) => c.name === name);

if (!hasColumn('disabled')) {
  db.exec('ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0');
}

/** 账号体系：角色 / 审批状态 / 微信绑定（保留列以兼容老库）/ 登录锁定（外网暴露加固） */
const USER_MIGRATIONS = [
  ['role', "TEXT NOT NULL DEFAULT 'member'"],
  ['status', "TEXT NOT NULL DEFAULT 'active'"],
  ['wechat_openid', 'TEXT'],
  ['wechat_unionid', 'TEXT'],
  ['wechat_name', 'TEXT'],
  ['must_change_password', 'INTEGER NOT NULL DEFAULT 0'],
  ['reviewed_at', 'INTEGER'],
  ['reviewed_by', 'TEXT'],
  ['login_failures', 'INTEGER NOT NULL DEFAULT 0'],
  ['locked_until', 'INTEGER'],
];
for (const [name, type] of USER_MIGRATIONS) {
  if (!hasColumn(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
}
// 一个微信号只能绑定一个账号（NULL 不参与唯一性，已不再新增绑定，保留以兼容老库）
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_openid ON users(wechat_openid) WHERE wechat_openid IS NOT NULL');

// 历史数据修正：没有状态的账号一律视为已通过审批
db.exec("UPDATE users SET status = 'active' WHERE status IS NULL OR status = ''");
db.exec("UPDATE users SET role = 'member' WHERE role IS NULL OR role = ''");

// 项目级编译引擎偏好（NULL = 跟随服务端默认）
const projectColumns = db.prepare('PRAGMA table_info(projects)').all();
if (!projectColumns.some((c) => c.name === 'engine')) {
  db.exec('ALTER TABLE projects ADD COLUMN engine TEXT');
}


/** 站点级设置：读取（无记录时返回 null） */
export function getSetting(key) {
  const row = db.prepare('SELECT value, updated_at, updated_by FROM settings WHERE key = ?').get(key);
  return row || null;
}

/** 站点级设置：写入（记录修改人与时间，便于审计） */
export function setSetting(key, value, userId = null) {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).run(key, String(value), now(), userId);
  return getSetting(key);
}

export function now() {
  return Date.now();
}

export function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);
}

export function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

/** 账号锁定策略（外网暴露时的暴力破解防护） */
export const LOCK_THRESHOLD = 5;        // 连续失败达到该次数即临时锁定
export const LOCK_DURATION_MS = 15 * 60 * 1000; // 锁定 15 分钟

/** 账号当前是否被临时锁定 */
export function isAccountLocked(row) {
  if (!row) return false;
  if (row.locked_until && row.locked_until > Date.now()) return true;
  return false;
}

/** 登录失败后累加计数，达到阈值则写入锁定到期时间 */
export function recordLoginFailure(id) {
  const row = getUserById(id);
  if (!row) return;
  const failures = (row.login_failures || 0) + 1;
  if (failures >= LOCK_THRESHOLD) {
    db.prepare('UPDATE users SET login_failures = ?, locked_until = ? WHERE id = ?')
      .run(failures, Date.now() + LOCK_DURATION_MS, id);
  } else {
    db.prepare('UPDATE users SET login_failures = ? WHERE id = ?').run(failures, id);
  }
}

/** 登录成功后清空失败计数与锁定 */
export function clearLoginFailures(id) {
  db.prepare('UPDATE users SET login_failures = 0, locked_until = NULL WHERE id = ?').run(id);
}

export function createUser({
  email,
  name,
  password,
  role = 'member',
  status = 'active',
  color,
  mustChangePassword = 0,
}) {
  const user = {
    id: crypto.randomUUID(),
    email,
    name,
    password,
    color: color || '#16794a',
    created_at: now(),
  };
  db.prepare(`INSERT INTO users
      (id,email,name,password,color,created_at,role,status,wechat_openid,wechat_unionid,wechat_name,must_change_password)
      VALUES (?,?,?,?,?,?,?,?,NULL,NULL,NULL,?)`)
    .run(user.id, user.email, user.name, user.password, user.color, user.created_at,
      role, status, mustChangePassword ? 1 : 0);
  return getUserById(user.id);
}

export function setUserStatus(userId, status, reviewerId = null) {
  db.prepare('UPDATE users SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?')
    .run(status, now(), reviewerId, userId);
}

export function countUsersByStatus() {
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM users GROUP BY status').all();
  const counts = { pending: 0, active: 0, rejected: 0 };
  for (const row of rows) counts[row.status] = row.n;
  return counts;
}

/** 管理员列表：默认按「待审批优先 + 注册时间倒序」 */
export function listUsers(status = '') {
  const where = status && status !== 'all' ? 'WHERE status = ?' : '';
  const sql = `
    SELECT id, email, name, color, created_at, role, status, disabled,
           wechat_openid, wechat_name, reviewed_at, must_change_password
    FROM users ${where}
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
             created_at DESC`;
  return status && status !== 'all' ? db.prepare(sql).all(status) : db.prepare(sql).all();
}

export function adminUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    role: row.role,
    status: row.status,
    disabled: Boolean(row.disabled),
    reviewedAt: row.reviewed_at || null,
    mustChangePassword: Boolean(row.must_change_password),
  };
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    role: row.role || 'member',
    status: row.status || 'active',
    mustChangePassword: Boolean(row.must_change_password),
  };
}

/** 返回用户可见的项目（自己创建或被邀请） */
export function listProjectsForUser(userId) {
  return db.prepare(`
    SELECT p.*, u.name AS owner_name,
           (SELECT role FROM members m WHERE m.project_id = p.id AND m.user_id = ?) AS role
    FROM projects p
    JOIN users u ON u.id = p.owner_id
    JOIN members m ON m.project_id = p.id AND m.user_id = ?
    ORDER BY p.updated_at DESC
  `).all(userId, userId);
}

export function memberRole(projectId, userId) {
  const row = db.prepare('SELECT role FROM members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
  return row ? row.role : null;
}

export function touchProject(projectId) {
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(Date.now(), projectId);
}

/** 写入一个文件快照；内容未变或 12 秒内已有快照时跳过（force 可绕过节流） */
export function recordVersion({ projectId, path, content, authorId = null, force = false, keep = 40 }) {
  const last = db.prepare(
    'SELECT content, created_at FROM versions WHERE project_id = ? AND path = ? ORDER BY created_at DESC LIMIT 1',
  ).get(projectId, path);
  if (last) {
    if (last.content === content) return null;
    if (!force && Date.now() - last.created_at < 12000) return null;
  }
  const id = crypto.randomUUID();
  const ts = Date.now();
  db.prepare('INSERT INTO versions (id, project_id, path, content, author_id, created_at) VALUES (?,?,?,?,?,?)')
    .run(id, projectId, path, content, authorId, ts);
  db.prepare(`DELETE FROM versions WHERE project_id = ? AND path = ? AND id NOT IN
    (SELECT id FROM versions WHERE project_id = ? AND path = ? ORDER BY created_at DESC LIMIT ?)`)
    .run(projectId, path, projectId, path, keep);
  return id;
}

export function listVersions(projectId, filePath) {
  return db.prepare(`
    SELECT v.id, v.path, v.created_at, length(v.content) AS size, u.name AS author
    FROM versions v LEFT JOIN users u ON u.id = v.author_id
    WHERE v.project_id = ? AND (? = '' OR v.path = ?)
    ORDER BY v.created_at DESC LIMIT 60
  `).all(projectId, filePath || '', filePath || '');
}

export function getVersion(projectId, versionId) {
  return db.prepare('SELECT * FROM versions WHERE project_id = ? AND id = ?').get(projectId, versionId);
}

/* ---------------- 协作评论 ---------------- */

const COMMENT_JOIN = `
  SELECT c.*, u.name AS author_name, u.color AS author_color, u.email AS author_email
  FROM comments c LEFT JOIN users u ON u.id = c.author_id
`;

function commentJson(row, replies) {
  let rect = null;
  try { rect = row.rect ? JSON.parse(row.rect) : null; } catch { /* 忽略损坏的 rect */ }
  return {
    id: row.id,
    projectId: row.project_id,
    authorId: row.author_id,
    authorName: row.author_name || '已删除用户',
    authorColor: row.author_color || null,
    authorEmail: row.author_email || null,
    body: row.body,
    anchorType: row.anchor_type,
    path: row.path || null,
    from: row.from_pos == null ? null : Number(row.from_pos),
    to: row.to_pos == null ? null : Number(row.to_pos),
    quote: row.quote || '',
    page: row.page == null ? null : Number(row.page),
    rect,
    resolved: !!row.resolved,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    replies,
  };
}

function repliesFor(commentIds) {
  if (!commentIds.length) return new Map();
  const placeholders = commentIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT r.*, u.name AS author_name, u.color AS author_color, u.email AS author_email
    FROM comment_replies r LEFT JOIN users u ON u.id = r.author_id
    WHERE r.comment_id IN (${placeholders}) ORDER BY r.created_at ASC
  `).all(...commentIds);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.comment_id)) map.set(r.comment_id, []);
    map.get(r.comment_id).push({
      id: r.id,
      authorId: r.author_id,
      authorName: r.author_name || '已删除用户',
      authorColor: r.author_color || null,
      body: r.body,
      createdAt: r.created_at,
    });
  }
  return map;
}

export function listComments(projectId) {
  const rows = db.prepare(`${COMMENT_JOIN} WHERE c.project_id = ? ORDER BY c.created_at ASC`).all(projectId);
  const replies = repliesFor(rows.map((r) => r.id));
  return rows.map((r) => commentJson(r, replies.get(r.id) || []));
}

export function getComment(projectId, commentId) {
  const row = db.prepare(`${COMMENT_JOIN} WHERE c.project_id = ? AND c.id = ?`).get(projectId, commentId);
  if (!row) return null;
  return commentJson(row, repliesFor([row.id]).get(row.id) || []);
}

export function createComment({ projectId, authorId, body, anchorType, path, from, to, quote, page, rect }) {
  const id = crypto.randomUUID();
  const ts = Date.now();
  db.prepare(`
    INSERT INTO comments (id, project_id, author_id, body, anchor_type, path, from_pos, to_pos,
      quote, page, rect, resolved, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?)
  `).run(
    id, projectId, authorId, body, anchorType || 'source',
    path || null,
    Number.isFinite(from) ? from : null,
    Number.isFinite(to) ? to : null,
    quote || '',
    Number.isInteger(page) ? page : null,
    rect ? JSON.stringify(rect) : null,
    ts, ts,
  );
  return getComment(projectId, id);
}

export function addReply({ projectId, commentId, authorId, body }) {
  if (!getComment(projectId, commentId)) return null;
  db.prepare('INSERT INTO comment_replies (id, comment_id, author_id, body, created_at) VALUES (?,?,?,?,?)')
    .run(crypto.randomUUID(), commentId, authorId, body, Date.now());
  db.prepare('UPDATE comments SET updated_at = ? WHERE id = ?').run(Date.now(), commentId);
  return getComment(projectId, commentId);
}

export function setCommentResolved(projectId, commentId, resolved) {
  const row = getComment(projectId, commentId);
  if (!row) return null;
  db.prepare('UPDATE comments SET resolved = ?, updated_at = ? WHERE id = ?')
    .run(resolved ? 1 : 0, Date.now(), commentId);
  return getComment(projectId, commentId);
}

export function deleteComment(projectId, commentId) {
  return db.prepare('DELETE FROM comments WHERE project_id = ? AND id = ?').run(projectId, commentId).changes > 0;
}
