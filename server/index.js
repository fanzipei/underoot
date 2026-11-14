// 必须最先加载：从项目根目录 .env 读取配置（已存在的环境变量不覆盖）
import './env.js';

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { PUBLIC_DIR, DATA_DIR, projectDir, TEMPLATES_DIR } from './paths.js';
import { db, now, getUserByEmail, createUser } from './db.js';
import { authRouter, pickColor } from './auth.js';
import { adminRouter } from './admin.js';
import { adminEmail, adminPassword, writeAdminPasswordFile, removeAdminPasswordFile } from './config.js';
import { applySecurity, configureTrustProxy } from './security.js';
import { projectsRouter } from './projects.js';
import { systemRouter, detectEngines } from './compile.js';
import { listTemplates } from './templates.js';
import { attachCollab, flushAll } from './collab.js';
import { workspaceRouter } from './workspace.js';
import { extensionsRouter, extensionAssets } from './extensions.js';
import { wasmRouter } from './wasm.js';
import { publishingTemplatesRouter } from './publishing-templates.js';
import {agentApiRouter,agentTokensRouter} from './agent-api.js';
import {projectMcpRouter} from './project-mcp.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
configureTrustProxy(app);
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser());
applySecurity(app);

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/projects/:id/agent-tokens',agentTokensRouter);
app.use('/api/agent/v1',agentApiRouter);
app.use('/api/mcp/v1/projects/:id',projectMcpRouter);
app.use('/api/system', systemRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/extensions', extensionsRouter);
app.use('/extensions', extensionAssets);
app.use('/api/wasm', wasmRouter);
app.use('/api/workspace/publishing-templates',publishingTemplatesRouter);
app.get('/api/templates', (req, res) => res.json({ templates: listTemplates() }));
app.get('/favicon.ico', (req, res) => res.type('image/svg+xml').sendFile(path.join(PUBLIC_DIR, 'favicon.svg')));

app.use(express.static(PUBLIC_DIR, { index: false, maxAge: 0, setHeaders(res, filePath) {
  if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
  if (filePath.includes(path.join('wasm','tl2026-46ebb621')+path.sep)&&!filePath.endsWith('underoot-worker.js')) res.setHeader('Cache-Control','public, max-age=31536000, immutable');
} }));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  if (res.headersSent) return;
  if(err.status===429)res.setHeader('Retry-After','60');
  res.status(err.status || 500).json({ error: err.message || '服务器内部错误' });
});

/* ---------- 首次启动初始化演示账号 ---------- */
const DEMO_EMAIL = 'demo@latex.studio';

function seed() {
  const demo = db.prepare('SELECT id, disabled FROM users WHERE lower(email) = ?').get(DEMO_EMAIL);
  // 共享服务器上可停用这个人人都能登录的演示账号
  if (process.env.LATEXSTUDIO_DISABLE_DEMO === '1') {
    if (demo && !demo.disabled) db.prepare('UPDATE users SET disabled = 1 WHERE id = ?').run(demo.id);
    return;
  }
  // 误设过停用且系统里没有其他可用账号时，自动恢复，避免锁死
  if (demo && demo.disabled) {
    const enabled = db.prepare('SELECT COUNT(*) AS n FROM users WHERE disabled = 0').get().n;
    if (enabled === 0) db.prepare('UPDATE users SET disabled = 0 WHERE id = ?').run(demo.id);
    return;
  }
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;

  const userId = crypto.randomUUID();
  const email = 'demo@latex.studio';
  const ts = now();
  db.prepare('INSERT INTO users (id,email,name,password,color,created_at) VALUES (?,?,?,?,?,?)')
    .run(userId, email, '演示用户', bcrypt.hashSync('demo1234', 10), pickColor(email), ts);

  const projectId = crypto.randomUUID();
  const dir = projectDir(projectId);
  fs.mkdirSync(dir, { recursive: true });
  const templateDir = path.join(TEMPLATES_DIR, 'chinese');
  const source = fs.existsSync(templateDir) ? templateDir : null;
  if (source) {
    for (const entry of fs.readdirSync(source)) {
      if (entry === 'meta.json') continue;
      fs.copyFileSync(path.join(source, entry), path.join(dir, entry));
    }
  }
  const mainPath = path.join(dir, 'main.tex');
  if (!fs.existsSync(mainPath)) {
    fs.writeFileSync(mainPath, '\\documentclass{article}\n\\begin{document}\n你好，\\LaTeX!\n\\end{document}\n');
  }
  db.prepare('INSERT INTO projects (id,owner_id,name,main_file,template,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(projectId, userId, '欢迎使用 underoot', 'main.tex', 'chinese', ts, ts);
  db.prepare('INSERT INTO members (project_id,user_id,role,created_at) VALUES (?,?,?,?)')
    .run(projectId, userId, 'owner', ts);
  console.log('[seed] 已创建演示账号 demo@latex.studio / demo1234');
}

seed();

/* ---------- 内置管理员账号 ---------- */
function seedAdmin() {
  const email = adminEmail();
  const presetPassword = adminPassword();
  const existing = getUserByEmail(email);

  if (!existing) {
    const generated = presetPassword || crypto.randomBytes(9).toString('base64url');
    createUser({
      email,
      name: '管理员',
      password: bcrypt.hashSync(generated, 10),
      color: pickColor(email),
      role: 'admin',
      status: 'active',
      mustChangePassword: presetPassword ? 0 : 1,
    });
    const passFile = presetPassword ? null : writeAdminPasswordFile(email, generated);
    console.log('');
    console.log(`  [admin] 已创建管理员账号：${email}`);
    console.log(presetPassword
      ? '  [admin] 密码取自环境变量 LATEXSTUDIO_ADMIN_PASSWORD'
      : `  [admin] 初始密码：${generated}   （首次登录会要求修改）`);
    if (passFile) console.log(`  [admin] 也写入了 ${passFile} ，忘记可去该文件查看`);
    console.log('');
    return;
  }

  // 保证这个账号始终是可用状态的管理员
  if (existing.role !== 'admin' || existing.status !== 'active' || existing.disabled) {
    db.prepare("UPDATE users SET role = 'admin', status = 'active', disabled = 0 WHERE id = ?").run(existing.id);
  }
  // 设置了环境变量密码时视为「重置管理员密码」
  if (presetPassword && !bcrypt.compareSync(presetPassword, existing.password)) {
    db.prepare('UPDATE users SET password = ?, must_change_password = 0 WHERE id = ?')
      .run(bcrypt.hashSync(presetPassword, 10), existing.id);
    removeAdminPasswordFile();
    console.log(`  [admin] 已按环境变量重置 ${email} 的密码`);
  }
}

seedAdmin();

const server = http.createServer(app);
attachCollab(server);

server.listen(PORT, HOST, () => {
  const { engines } = detectEngines();
  const engineText = engines.length ? engines.map((e) => e.id).join(', ') : '未检测到（请在设置页一键安装）';
  console.log('');
  console.log('  underoot 已启动');
  console.log(`  地址      http://localhost:${PORT}`);
  console.log(`  数据目录  ${DATA_DIR}`);
  console.log(`  编译器    ${engineText}`);
  console.log('');
});

function shutdown() {
  console.log('\n[server] 正在保存未落盘的协同文档...');
  try { flushAll(); } catch { /* ignore */ }
  try { db.close(); } catch { /* ignore */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
