import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.LATEXSTUDIO_DATA || path.join(ROOT, 'data');
export const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
export const DB_FILE = path.join(DATA_DIR, 'app.db');
export const BIN_DIR = path.join(ROOT, 'bin');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const TEMPLATES_DIR = path.join(ROOT, 'server', 'templates');

for (const dir of [DATA_DIR, PROJECTS_DIR, BIN_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export function projectDir(projectId) {
  return path.join(PROJECTS_DIR, projectId);
}

/** 带 400 语义的路径错误，避免被 Express 当成 500 服务器故障 */
function badPath(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/** 规范化项目内的相对路径，拒绝越界 */
export function normalizeRelPath(input) {
  if (typeof input !== 'string' || !input.trim()) throw badPath('路径不能为空');
  const rel = input.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  const parts = [];
  for (const seg of rel.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') throw badPath('非法路径');
    parts.push(seg);
  }
  if (!parts.length) throw badPath('路径不能为空');
  return parts.join('/');
}

export function resolveInside(root, relPath) {
  const clean = normalizeRelPath(relPath);
  const full = path.resolve(root, clean);
  const base = path.resolve(root) + path.sep;
  if (!full.startsWith(base)) throw badPath('非法路径');
  return full;
}

/** 没有 shell 的 which */
export function which(cmd) {
  const isWin = os.platform() === 'win32';
  const exts = isWin ? (process.env.PATHEXT || '.EXE;.BAT;.CMD').split(';') : [''];
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, cmd + (isWin ? ext.toLowerCase() : ''));
      try {
        const st = fs.statSync(candidate);
        if (st.isFile()) return candidate;
      } catch { /* ignore */ }
      if (isWin) {
        const upper = path.join(dir, cmd + ext.toUpperCase());
        try {
          if (fs.statSync(upper).isFile()) return upper;
        } catch { /* ignore */ }
      }
    }
  }
  return null;
}

const TEXT_EXT = new Set([
  '.tex', '.bib', '.sty', '.cls', '.bst', '.txt', '.md', '.markdown', '.cfg', '.def',
  '.tikz', '.pgf', '.json', '.yaml', '.yml', '.csv', '.ltx', '.dtx', '.ins', '.bbx',
  '.cbx', '.lbx', '.js', '.css', '.html', '.py', '.sh', '.log', '.aux', '.out', '.toc',
]);

export function isTextFile(name) {
  return TEXT_EXT.has(path.extname(name).toLowerCase());
}

export function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
