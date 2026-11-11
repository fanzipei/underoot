/**
 * 账号相关配置（全部可用环境变量 / 项目根目录 .env 覆盖）
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';
import { db, getSetting, setSetting } from './db.js';

const OPEN_REGISTRATION_KEY = 'open_registration';

/** 环境变量作为「管理员未在后台设置过」时的默认值，默认需要审批 */
function defaultApprovalRequired() {
  return process.env.LATEXSTUDIO_REQUIRE_APPROVAL !== '0';
}

/**
 * 注册设置状态。后台开关（数据库）优先，未设置时回退到环境变量。
 * openRegistration=true 表示注册后直接可用，无需管理员审批。
 */
export function registrationSettings() {
  const row = getSetting(OPEN_REGISTRATION_KEY);
  if (row) {
    return {
      openRegistration: row.value === '1',
      approvalRequired: row.value !== '1',
      source: 'setting',
      envDefault: !defaultApprovalRequired(),
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }
  const envOpen = !defaultApprovalRequired();
  return {
    openRegistration: envOpen,
    approvalRequired: !envOpen,
    source: envOpen ? 'env' : 'default',
    envDefault: envOpen,
    updatedAt: null,
    updatedBy: null,
  };
}

/** 新注册账号是否需要管理员审批后才能登录 */
export const approvalRequired = () => registrationSettings().approvalRequired;

/** 管理员在后台切换开放注册（写入数据库，覆盖环境变量默认值） */
export function setOpenRegistration(enabled, userId = null) {
  setSetting(OPEN_REGISTRATION_KEY, enabled ? '1' : '0', userId);
  return registrationSettings();
}

/** 清除后台设置，回到环境变量 / 系统默认（供「恢复默认」或测试还原使用） */
export function clearOpenRegistration() {
  db.prepare('DELETE FROM settings WHERE key = ?').run(OPEN_REGISTRATION_KEY);
  return registrationSettings();
}

/** 内置管理员账号 */
export const adminEmail = () => (process.env.LATEXSTUDIO_ADMIN_EMAIL || 'admin@latex.studio').trim().toLowerCase();

/** 管理员初始密码；设置后每次启动都会把该账号密码重置成这个值（可用于找回） */
export const adminPassword = () => process.env.LATEXSTUDIO_ADMIN_PASSWORD || '';

/** 随机生成的管理员初始密码会落到这个文件，避免错过启动日志就再也进不去 */
export const adminPasswordFile = () => path.join(DATA_DIR, 'admin-password.txt');

export function writeAdminPasswordFile(email, password) {
  const file = adminPasswordFile();
  try {
    fs.writeFileSync(file, `管理员账号：${email}\n初始密码：${password}\n首次登录后请立即修改密码，修改成功后本文件会自动删除。\n`, { mode: 0o600 });
  } catch (err) {
    console.warn('[admin] 无法写入初始密码文件：', err.message);
  }
  return file;
}

export function removeAdminPasswordFile() {
  try {
    fs.rmSync(adminPasswordFile(), { force: true });
  } catch { /* ignore */ }
}

/**
 * 安全相关配置（面向公网暴露）
 */

/** 是否给认证 Cookie 加 secure 标记。设 LATEXSTUDIO_SECURE_COOKIE=1 强制开启；
 * 否则由反向代理透传的 HTTPS（req.secure）自动决定，本地 http 调试时不加。 */
export const secureCookie = () => process.env.LATEXSTUDIO_SECURE_COOKIE === '1';

/** 是否输出 HSTS 头（仅在站点已通过 HTTPS 反向代理对外提供服务时开启） */
export const hsts = process.env.LATEXSTUDIO_HSTS === '1';

/** 反向代理信任配置：1/loopback/具体 IP 或 CIDR。空表示不信任（req.ip 取直连 IP） */
export const trustProxy = process.env.LATEXSTUDIO_TRUST_PROXY || '';

export const config = { hsts, trustProxy };
