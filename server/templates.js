import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATES_DIR } from './paths.js';

/** 模板中允许携带的二进制素材（示例插图） */
const BINARY = /\.(png|jpe?g|pdf|eps|gif|svg)$/i;

export function listTemplates() {
  const dirs = fs.existsSync(TEMPLATES_DIR) ? fs.readdirSync(TEMPLATES_DIR) : [];
  return dirs
    .map((id) => {
      const metaPath = path.join(TEMPLATES_DIR, id, 'meta.json');
      if (!fs.existsSync(metaPath)) return null;
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      return { id, ...meta };
    })
    .filter(Boolean);
}

export function getTemplate(id) {
  if (!/^[a-z0-9-]+$/i.test(String(id))) return null;
  const dir = path.join(TEMPLATES_DIR, id);
  if (!fs.existsSync(dir)) return null;
  const metaPath = path.join(dir, 'meta.json');
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};
  const files = [];
  const walk = (cur, rel) => {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(cur, entry.name), relPath);
      else if (entry.name !== 'meta.json') {
        // 图片等二进制素材按 Buffer 传递，避免模板里的示例插图被当作 UTF-8 读取损坏
        const full = path.join(cur, entry.name);
        if (BINARY.test(entry.name)) files.push({ path: relPath, buffer: fs.readFileSync(full) });
        else files.push({ path: relPath, content: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(dir, '');
  return { id, meta, files };
}
