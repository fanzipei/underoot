import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { BIN_DIR, projectDir, resolveInside, normalizeRelPath, which } from './paths.js';
import { digest, snapshot, failure } from './project-history.js';
import { recordVersion, touchProject } from './db.js';
import { flushProject, syncExternalWrite, broadcastProject } from './collab.js';
const supported = (name) => /\.(md|markdown|tex)$/i.test(name);
let conversions = 0;
export function readDocument(project, rel) {
 const name = normalizeRelPath(rel || project.main_file);
 if (!supported(name)) throw failure(400, '仅支持 Markdown / TeX 文件');
 flushProject(project.id);
 const full = resolveInside(projectDir(project.id), name);
 if (!fs.existsSync(full)) throw failure(404, '文件不存在');
 if (fs.statSync(full).size > 150000) throw failure(413, '文档编辑上限为 150 KB');
 const content = fs.readFileSync(full, 'utf8'); return { path: name, content, hash: digest(content) };
}
export function writeDocument(project, user, input) {
 const name = normalizeRelPath(input.path || '');
 if (!supported(name) || typeof input.content !== 'string' || Buffer.byteLength(input.content) > 150000) throw failure(400, '文档路径或内容无效（限 150 KB）');
 flushProject(project.id);
 const full = resolveInside(projectDir(project.id), name);
 const exists = fs.existsSync(full);
 if (exists ? digest(fs.readFileSync(full)) !== input.hash : input.hash !== null) throw failure(409, '文件已被协作者修改或同名文件已存在，请重新读取/另存');
 snapshot(project.id, user, `插件保存前：${name}`, 'document', true);
 fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, input.content);
 recordVersion({ projectId: project.id, path: name, content: input.content, authorId: user, force: true });
 syncExternalWrite(project.id, name, input.content); touchProject(project.id);
 snapshot(project.id, user, `插件保存：${name}`, 'document', true);
 broadcastProject(project.id, { type: 'file:changed', path: name });
 return { path: name, content: input.content, hash: digest(input.content) };
}
export function convertDocument(input) {
 const from = input.from === 'tex' ? 'latex' : input.from === 'markdown' ? 'markdown+tex_math_dollars+citations' : null;
 if (!from || typeof input.content !== 'string' || Buffer.byteLength(input.content) > 150000) throw failure(400, '转换参数无效');
 const bundled = path.join(BIN_DIR, process.platform === 'win32' ? 'pandoc.exe' : 'pandoc');
 const binary = fs.existsSync(bundled) ? bundled : which('pandoc');
 if (!binary) throw failure(503, '请先运行 node scripts/install-pandoc.mjs 安装转换器');
 if (conversions >= 2) throw failure(429, '转换器正忙，请稍后重试');
 const to = input.from === 'tex' ? 'markdown+tex_math_dollars+raw_tex' : 'latex';
 conversions++;
 return new Promise((resolve, reject) => {
  const args = ['--sandbox', '--from', from, '--to', to, '--wrap=none'];
  if (input.from === 'markdown') args.push('--standalone', '--variable=documentclass:ctexart', '--variable=classoption:UTF8', '--pdf-engine=xelatex');
  // The Markdown conversion emits a self-contained article source, without
  // evaluating TeX, shell commands, filters, includes or external resources.
  const proc = spawn(binary, args, { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
  proc.stdout.setEncoding('utf8'); proc.stderr.setEncoding('utf8');
  let out = ''; let errors = ''; let bytes = 0;
  const timer = setTimeout(() => { proc.kill(); reject(failure(504, '转换超时')); }, 15000);
  proc.on('error', () => { clearTimeout(timer); reject(failure(503, '无法启动 Pandoc')); });
  proc.stdout.on('data', (b) => { bytes += b.length; if (bytes > 500000) { proc.kill(); reject(failure(413, '转换结果过大')); } else out += b; });
  proc.stderr.on('data', (b) => { errors += b.toString().slice(0, 5000 - errors.length); });
  proc.stdin.on('error', () => {}); proc.stdin.end(input.content);
  proc.on('close', (code) => {
   clearTimeout(timer);
   if (code !== 0) { reject(failure(400, `Pandoc 转换失败：${errors.slice(0, 500)}`)); return; }
   resolve({ content: out, extension: input.from === 'tex' ? 'md' : 'tex', warnings: ['复杂宏、会议模板和版式可能无法无损互转；原文件保持保留。', ...(errors ? [errors.slice(0,1000)] : [])] });
  });
 }).finally(() => { conversions--; });
}
