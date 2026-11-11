/**
 * 账号运维命令行（服务运行时也可用）
 *
 * 用法：
 *   node scripts/admin.mjs list                    # 列出所有账号及状态
 *   node scripts/admin.mjs approve <邮箱或ID>      # 通过审批
 *   node scripts/admin.mjs reject  <邮箱或ID>      # 拒绝
 *   node scripts/admin.mjs pending <邮箱或ID>      # 退回待审批
 *   node scripts/admin.mjs promote <邮箱或ID>      # 设为管理员
 *   node scripts/admin.mjs disable <邮箱或ID>      # 停用
 *   node scripts/admin.mjs enable  <邮箱或ID>      # 启用
 *   node scripts/admin.mjs passwd  <邮箱或ID> [新密码]
 *   node scripts/admin.mjs delete  <邮箱或ID>      # 删除账号（连同其项目）
 *
 * 典型用途：管理员忘记密码时 `passwd admin@latex.studio 新密码`；
 * 或审批接口不方便访问时（例如没登录管理后台）直接放行某个账号。
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db, getUserByEmail, getUserById } from '../server/db.js';
import { writeAdminPasswordFile } from '../server/config.js';

const [command, target, extra] = process.argv.slice(2);

function findUser(value) {
  if (!value) return null;
  return getUserByEmail(value) || getUserById(value) || null;
}

function fmt(user) {
  const status = { pending: '待审批', active: '正常', rejected: '已拒绝' }[user.status] || user.status;
  const flags = [
    user.role === 'admin' ? '管理员' : '',
    user.disabled ? '已停用' : '',
  ].filter(Boolean).join(' / ');
  return `${(user.email || '').padEnd(32)} ${user.name.padEnd(12)} ${status.padEnd(4)} ${
    new Date(user.created_at).toLocaleString('zh-CN')}${flags ? `  [${flags}]` : ''}`;
}

function requireUser() {
  const user = findUser(target);
  if (!user) {
    console.error(`找不到账号：${target || '(未指定)'}`);
    process.exit(1);
  }
  return user;
}

function review(status) {
  const user = requireUser();
  db.prepare('UPDATE users SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?')
    .run(status, Date.now(), 'cli', user.id);
  console.log(`已更新 ${user.email} 的状态为 ${status}`);
}

switch (command) {
  case 'list': {
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    if (!rows.length) {
      console.log('（没有账号）');
      break;
    }
    console.log(fmt({ email: '邮箱', name: '昵称', status: '状态', created_at: Date.now() }));
    for (const row of rows) console.log(fmt(row));
    const pending = rows.filter((r) => r.status === 'pending').length;
    console.log(`\n共 ${rows.length} 个账号，其中待审批 ${pending} 个`);
    break;
  }
  case 'approve':
    review('active');
    break;
  case 'reject':
    review('rejected');
    break;
  case 'pending':
    review('pending');
    break;
  case 'promote': {
    const user = requireUser();
    db.prepare("UPDATE users SET role = 'admin', status = 'active', disabled = 0 WHERE id = ?").run(user.id);
    console.log(`${user.email} 已设为管理员`);
    break;
  }
  case 'disable':
  case 'enable': {
    const user = requireUser();
    if (command === 'disable' && user.role === 'admin') {
      console.error('不能停用管理员账号');
      process.exit(1);
    }
    db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(command === 'disable' ? 1 : 0, user.id);
    console.log(`${user.email} 已${command === 'disable' ? '停用' : '启用'}`);
    break;
  }
  case 'passwd': {
    const user = requireUser();
    const password = extra || crypto.randomBytes(6).toString('base64url');
    db.prepare('UPDATE users SET password = ?, must_change_password = 1 WHERE id = ?')
      .run(bcrypt.hashSync(password, 10), user.id);
    // 管理员密码单独落盘，避免错过终端输出就进不去后台
    if (user.role === 'admin') {
      const file = writeAdminPasswordFile(user.email, password);
      console.log(`${user.email} 的新密码：${password}（已写入 ${file}）`);
    } else {
      console.log(`${user.email} 的新密码：${password}`);
    }
    break;
  }
  case 'delete': {
    const user = requireUser();
    if (user.role === 'admin') {
      console.error('拒绝删除管理员账号');
      process.exit(1);
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    console.log(`${user.email} 已删除`);
    break;
  }
  default:
    console.log(`用法：node scripts/admin.mjs <list|approve|reject|pending|promote|disable|enable|passwd|delete> [邮箱或ID] [参数]`);
}

db.close();
