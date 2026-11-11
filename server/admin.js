import express from 'express';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { db, getUserById, listUsers, countUsersByStatus, adminUser } from './db.js';
import { requireAdmin } from './auth.js';
import { projectDir } from './paths.js';
import { closeProjectDocs, revokeProjectAccess } from './collab.js';
import { registrationSettings, setOpenRegistration, clearOpenRegistration } from './config.js';

export const adminRouter = express.Router();
adminRouter.use(requireAdmin);

/** 站点注册设置：当前状态、生效来源、待审批数量 */
adminRouter.get('/settings', (req, res) => {
  const settings = registrationSettings();
  const pending = countUsersByStatus().pending || 0;
  res.json({ ...settings, pendingCount: pending });
});

/**
 * 切换开放注册。开启后新注册账号直接激活、无需审批；
 * 同时把已有待审批申请一并放行，避免开关打开后旧申请仍然卡住。
 * 关闭只影响之后的注册，不改变已有账号，管理员仍可删除 / 停用任何普通账号。
 */
adminRouter.put('/settings', (req, res) => {
  const want = req.body?.openRegistration;
  // null 表示清除后台设置、回到环境变量 / 系统默认
  if (want === null) {
    const settings = clearOpenRegistration();
    return res.json({
      ...settings,
      approvedPending: 0,
      pendingCount: countUsersByStatus().pending || 0,
      message: '已恢复为服务端默认设置',
    });
  }
  if (typeof want !== 'boolean') {
    return res.status(400).json({ error: '参数 openRegistration 必须是布尔值或 null' });
  }
  let approvedPending = 0;
  if (want) {
    approvedPending = db.prepare(
      "UPDATE users SET status = 'active', reviewed_at = ?, reviewed_by = ? WHERE status = 'pending'",
    ).run(Date.now(), req.user.id).changes;
  }
  const settings = setOpenRegistration(want, req.user.id);
  res.json({
    ...settings,
    approvedPending,
    pendingCount: countUsersByStatus().pending || 0,
    message: want
      ? `已开放注册${approvedPending ? `，并放行 ${approvedPending} 个待审批账号` : ''}`
      : '已恢复注册审批，之后的注册需管理员通过',
  });
});

/** 用户列表 + 各状态数量（默认全部） */
adminRouter.get('/users', (req, res) => {
  const status = String(req.query.status || 'all');
  const allowed = ['all', 'pending', 'active', 'rejected'];
  const users = listUsers(allowed.includes(status) ? status : 'all');
  res.json({ users: users.map(adminUser), counts: countUsersByStatus() });
});

/** 通过 / 拒绝 / 退回待审 */
adminRouter.post('/users/:id/review', (req, res) => {
  const target = getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: '账号不存在' });
  const status = String(req.body?.status || '');
  if (!['active', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: '状态不合法' });
  }
  if (target.role === 'admin' && status !== 'active') {
    return res.status(400).json({ error: '不能审批管理员账号' });
  }
  db.prepare('UPDATE users SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?')
    .run(status, Date.now(), req.user.id, target.id);
  res.json({ user: adminUser(getUserById(target.id)), counts: countUsersByStatus() });
});

/** 停用 / 启用（停用后立即失去访问权，管理员账号不可停用） */
adminRouter.post('/users/:id/disabled', (req, res) => {
  const target = getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: '账号不存在' });
  const disabled = Boolean(req.body?.disabled);
  if (disabled && target.role === 'admin') {
    return res.status(400).json({ error: '不能停用管理员账号' });
  }
  if (disabled && target.id === req.user.id) {
    return res.status(400).json({ error: '不能停用自己' });
  }
  db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, target.id);
  res.json({ user: adminUser(getUserById(target.id)) });
});

/** 删除账号（连同他拥有的项目文件；管理员账号不可删除） */
adminRouter.delete('/users/:id', (req, res) => {
  const target = getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: '账号不存在' });
  if (target.role === 'admin') return res.status(400).json({ error: '不能删除管理员账号' });
  if (target.id === req.user.id) return res.status(400).json({ error: '不能删除自己' });

  const owned = db.prepare('SELECT id FROM projects WHERE owner_id = ?').all(target.id);
  for (const p of owned) {
    closeProjectDocs(p.id);
    revokeProjectAccess(p.id);
    try { fs.rmSync(projectDir(p.id), { recursive: true, force: true }); } catch { /* ignore */ }
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
  res.json({ ok: true, counts: countUsersByStatus() });
});

/** 重置某个账号的密码（返回随机新密码，仅本次可见） */
adminRouter.post('/users/:id/reset-password', (req, res) => {
  const target = getUserById(req.params.id);
  if (!target) return res.status(404).json({ error: '账号不存在' });
  if (target.role === 'admin' && target.id !== req.user.id) {
    return res.status(400).json({ error: '不能重置其他管理员密码' });
  }
  const password = Math.random().toString(36).slice(2, 10);
  db.prepare('UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?')
    .run(bcrypt.hashSync(password, 10), target.id);
  res.json({ password });
});
