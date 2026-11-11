import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import archiver from 'archiver';
import { projectDir, resolveInside, isTextFile, normalizeRelPath } from './paths.js';
import {
  db, now, memberRole, publicUser, getUserByEmail, touchProject, recordVersion, listVersions, getVersion,
  listComments, getComment, createComment, addReply, setCommentResolved, deleteComment,
} from './db.js';
import { requireAuth } from './auth.js';
import { getTemplate } from './templates.js';
import { compileProject, parseLog, hashProject, detectEngines, pickEngine, engineLabel } from './compile.js';
import { syncExternalWrite, closeProjectDocs, closeFileDocs, flushProject, broadcastProject, revokeProjectAccess } from './collab.js';
import { unpackZipTo, parseGithubInput, downloadGithubZip } from './import.js';
import { detectClashes, buildFixedMain, buildFixedBoldGreek, detectBoldGreek } from './latex-fixes.js';
import { notifyDiscussion, updateDiscussion } from './discussions.js';
import { snapshot } from './project-history.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024, files: 60 } });

/** Overleaf 中不显示在文件树里的中间产物 */
const GENERATED = new Set([
  '.aux', '.log', '.out', '.toc', '.fls', '.fdb_latexmk', '.synctex.gz', '.synctex',
  '.nav', '.snm', '.vrb', '.bcf', '.blg', '.run.xml', '.lof', '.lot', '.idx', '.ind',
  '.ilg', '.glo', '.gls', '.xdv', '.dvi', '.bbl', '.spl', '.loa', '.acn', '.acr',
]);

function isGenerated(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.synctex.gz')) return true;
  return GENERATED.has(path.extname(lower)) || lower.endsWith('.run.xml') || lower.endsWith('.synctex.gz');
}

function buildTree(dir, rel = '') {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.latexmkrc') continue;
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'dir',
        children: buildTree(path.join(dir, entry.name), relPath),
      });
    } else {
      if (isGenerated(entry.name)) continue;
      const st = fs.statSync(path.join(dir, entry.name));
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'file',
        size: st.size,
        mtime: st.mtimeMs,
        binary: !isTextFile(entry.name),
      });
    }
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-CN', { numeric: true });
  });
  return nodes;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function createProject({ ownerId, name, templateId, skipTemplate = false, source = null }) {
  const id = crypto.randomUUID();
  const dir = projectDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const initialVersions = [];
  let mainFile = 'main.tex';
  // 导入场景需要空目录，否则 blank 模板自带的 main.tex 会污染主文件识别
  if (!skipTemplate) {
    const template = getTemplate(templateId || 'blank');
    if (template) {
      for (const file of template.files) {
        const target = resolveInside(dir, file.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (file.buffer) {
          fs.writeFileSync(target, file.buffer);
          continue;
        }
        fs.writeFileSync(target, file.content, 'utf8');
        initialVersions.push({ path: file.path, content: file.content });
      }
      mainFile = template.meta.main || 'main.tex';
    }
    if (!fs.existsSync(path.join(dir, mainFile))) {
      const fallback = '\\documentclass{article}\n\\begin{document}\nHello, \\LaTeX!\n\\end{document}\n';
      fs.writeFileSync(path.join(dir, 'main.tex'), fallback, 'utf8');
      initialVersions.push({ path: 'main.tex', content: fallback });
      mainFile = 'main.tex';
    }
  }
  const ts = now();
  db.prepare('INSERT INTO projects (id,owner_id,name,main_file,template,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, ownerId, String(name || '未命名项目').slice(0, 80), mainFile, source || templateId || 'blank', ts, ts);
  db.prepare('INSERT INTO members (project_id,user_id,role,created_at) VALUES (?,?,?,?)')
    .run(id, ownerId, 'owner', ts);
  for (const v of initialVersions) {
    recordVersion({ projectId: id, path: v.path, content: v.content, authorId: ownerId });
  }
  if (!skipTemplate) snapshot(id, ownerId, '项目创建', 'initial');
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

/** 项目名净化：去掉文件系统非法字符与 .zip 后缀 */
function importName(value, fallback = '未命名项目') {
  const clean = String(value || '')
    .replace(/\.zip$/i, '')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '')
    .trim()
    .slice(0, 80)
    .trim();
  return clean || fallback;
}

/** 导入失败时清理已建的目录与数据库记录，避免留下空项目 */
function rollbackProject(id) {
  try { fs.rmSync(projectDir(id), { recursive: true, force: true }); } catch { /* ignore */ }
  try {
    db.prepare('DELETE FROM versions WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM members WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM compiles WHERE project_id = ?').run(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  } catch { /* ignore */ }
}

/**
 * 一次体检并修复两类常见编译错误：
 *  - 宏包选项冲突（Option clash）
 *  - unicode-math 下 \boldsymbol{\希腊字母} 触发 Improper alphabetic constant
 * files 传入时（导入场景）同步更新内存内容，避免版本快照记录修复前的文本。
 * 返回 { fixed, clashes, boldGreek, warning, added }
 */
function repairProject({ projectId, mainFile, authorId, files = null }) {
  const dir = projectDir(projectId);
  const rel = normalizeRelPath(mainFile);
  const full = resolveInside(dir, rel);
  if (!fs.existsSync(full)) {
    return { fixed: false, clashes: [], boldGreek: [], warning: '', added: [] };
  }
  const before = fs.readFileSync(full, 'utf8');
  const { clashes } = detectClashes(dir, rel);
  const clashFix = buildFixedMain(before, clashes);
  const boldFix = buildFixedBoldGreek(clashFix.content);
  const content = boldFix.content;
  if (content === before) {
    return { fixed: false, clashes, boldGreek: boldFix, warning: '', added: [] };
  }

  fs.writeFileSync(full, content, 'utf8');
  syncExternalWrite(projectId, rel, content);
  recordVersion({ projectId, path: rel, content, authorId, force: true });
  touchProject(projectId);
  if (files) {
    const hit = files.find((f) => f.rel === rel);
    if (hit) hit.content = content;
  }
  const notes = [];
  if (clashFix.added.length) {
    const pkgs = [...new Set(clashes.map((c) => c.pkg))].join('、');
    notes.push(`宏包选项冲突（${pkgs}）：已在 \\documentclass 前加入 \\PassOptionsToPackage`);
  }
  if (boldFix.replaced) {
    notes.push(`${boldFix.replaced} 处粗体希腊字母：已改为 \\symbf 并加兼容兜底（修复 Improper alphabetic constant）`);
  }
  return {
    fixed: true,
    added: [...clashFix.added],
    clashes,
    boldGreek: boldFix,
    warning: notes.join('；'),
  };
}

/**
 * 从 ZIP 二进制新建一个项目（ZIP 上传与 GitHub 下载共用）。
 * 返回 { project, warning, files, clashes }
 */
function createProjectFromZip({ ownerId, name, buffer, source }) {
  const project = createProject({ ownerId, name: importName(name), skipTemplate: true, source });
  const dir = projectDir(project.id);
  let unpacked;
  try {
    unpacked = unpackZipTo(dir, buffer);
  } catch (err) {
    rollbackProject(project.id);
    throw err;
  }
  let mainFile = unpacked.mainFile;
  if (!mainFile) {
    // 压缩包里没有 .tex：补一个最小入口，保证项目可直接编译
    const fallback = '\\documentclass{article}\n\\begin{document}\nHello, \\LaTeX!\n\\end{document}\n';
    fs.writeFileSync(path.join(dir, 'main.tex'), fallback, 'utf8');
    unpacked.files.push({ rel: 'main.tex', content: fallback });
    mainFile = 'main.tex';
  }
  db.prepare('UPDATE projects SET main_file = ?, updated_at = ? WHERE id = ?').run(mainFile, now(), project.id);

  // 导入即体检：把迁移项目里常见的编译错误修掉，避免一打开就编译失败
  let clashInfo = { fixed: false, clashes: [], warning: '' };
  try {
    clashInfo = repairProject({
      projectId: project.id, mainFile, authorId: ownerId, files: unpacked.files,
    });
  } catch { /* 预检失败不阻断导入，编译诊断仍会兜底 */ }

  for (const file of unpacked.files) {
    if (file.content === null) continue;
    try {
      recordVersion({
        projectId: project.id, path: file.rel, content: file.content,
        authorId: ownerId, force: true,
      });
    } catch { /* 版本快照失败不影响导入 */ }
  }
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id);
  snapshot(project.id, ownerId, '导入项目', 'initial');
  const notes = [];
  if (unpacked.skipped) notes.push(`已跳过 ${unpacked.skipped} 个不安全或无法解压的文件`);
  if (clashInfo.warning) notes.push(clashInfo.warning);
  return {
    project: projectJson(row, 'owner'),
    warning: notes.join('；'),
    files: unpacked.files.length,
    clashes: clashInfo.clashes.map((c) => ({ pkg: c.pkg, options: c.options, fixed: clashInfo.fixed, hint: c.hint })),
  };
}

function projectJson(row, role) {
  return {
    id: row.id,
    name: row.name,
    mainFile: row.main_file,
    template: row.template,
    ownerId: row.owner_id,
    ownerName: row.owner_name || null,
    role: role || row.role || 'owner',
    memberCount: row.member_count == null ? 1 : Number(row.member_count),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    engine: row.engine || 'auto',
    epoch: row.collab_epoch || 0,
    activeBranch: row.active_branch || null,
  };
}

export const projectsRouter = express.Router();
projectsRouter.use(requireAuth);

function loadProject(req, res, next) {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: '项目不存在' });
  const role = memberRole(row.id, req.user.id);
  if (!role) return res.status(403).json({ error: '无权访问该项目' });
  if (!['GET', 'HEAD'].includes(req.method) && !['owner', 'editor'].includes(role)) {
    const isDiscussion = /\/comments(?:\/|$)/.test(req.path);
    if (role !== 'reviewer' || !isDiscussion) return res.status(403).json({ error: role === 'viewer' ? '此项目为只读权限' : '审阅者可以评论，不能修改项目内容' });
  }
  req.project = row;
  req.role = role;
  next();
}

projectsRouter.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, u.name AS owner_name,
           (SELECT role FROM members m WHERE m.project_id = p.id AND m.user_id = ?) AS role,
           (SELECT COUNT(*) FROM members mc WHERE mc.project_id = p.id) AS member_count
    FROM projects p
    JOIN users u ON u.id = p.owner_id
    JOIN members m ON m.project_id = p.id AND m.user_id = ?
    ORDER BY p.updated_at DESC
  `).all(req.user.id, req.user.id);
  res.json({ projects: rows.map((r) => projectJson(r)) });
});

projectsRouter.post('/', (req, res) => {
  const project = createProject({
    ownerId: req.user.id,
    name: req.body?.name,
    templateId: req.body?.template,
  });
  res.json({ project: projectJson(project) });
});

projectsRouter.get('/:id', loadProject, (req, res) => {
  const memberCount = db.prepare('SELECT COUNT(*) AS n FROM members WHERE project_id = ?').get(req.project.id).n;
  // 打开项目时顺带体检，前端可提前提示，不必等编译失败
  let inspected = { clashes: [], boldGreek: [], issues: [] };
  try {
    inspected = inspectProject(req.project.id, req.project.main_file);
  } catch { /* 体检失败不影响打开项目 */ }
  let engines = [];
  try { engines = detectEngines().engines.map((e) => ({ id: e.id, name: e.name, kind: e.kind })); } catch { /* ignore */ }
  res.json({
    project: projectJson({ ...req.project, member_count: memberCount }, req.role),
    tree: buildTree(projectDir(req.project.id)),
    clashes: inspected.clashes,
    boldGreek: inspected.boldGreek,
    issues: inspected.issues,
    engines,
  });
});

projectsRouter.patch('/:id', loadProject, (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const mainFile = req.body?.mainFile ? normalizeRelPath(req.body.mainFile) : null;
  if (name) db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name.slice(0, 80), req.project.id);
  if (mainFile) db.prepare('UPDATE projects SET main_file = ? WHERE id = ?').run(mainFile, req.project.id);
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'engine')) {
    const want = String(req.body.engine || 'auto').trim();
    const valid = want === 'auto' || detectEngines().engines.some((e) => e.id === want);
    if (!valid) return res.status(400).json({ error: `未知的编译引擎：${want}` });
    db.prepare('UPDATE projects SET engine = ? WHERE id = ?').run(want === 'auto' ? null : want, req.project.id);
    compileCache.delete(req.project.id);   // 换引擎必须重编
  }
  touchProject(req.project.id);
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.project.id);
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'engine')) {
    broadcastProject(req.project.id, { type: 'project:engine', engine: row.engine || 'auto' });
  }
  res.json({ project: projectJson(row, req.role) });
});

projectsRouter.delete('/:id', loadProject, (req, res) => {
  if (req.role !== 'owner') return res.status(403).json({ error: '只有项目所有者可以删除项目' });
  closeProjectDocs(req.project.id);
  revokeProjectAccess(req.project.id); // 断开所有在线连接
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.project.id);
  try { fs.rmSync(projectDir(req.project.id), { recursive: true, force: true }); } catch { /* ignore */ }
  res.json({ ok: true });
});

projectsRouter.post('/:id/duplicate', loadProject, (req, res) => {
  const copy = createProject({
    ownerId: req.user.id,
    name: `${req.project.name} 副本`,
    templateId: req.project.template || 'blank',
  });
  const src = projectDir(req.project.id);
  const dest = projectDir(copy.id);
  fs.rmSync(dest, { recursive: true, force: true });
  copyDir(src, dest);
  db.prepare('UPDATE projects SET main_file = ?, engine=? WHERE id = ?').run(req.project.main_file, req.project.engine, copy.id);
  snapshot(copy.id, req.user.id, '复制项目', 'initial');
  res.json({ project: projectJson({ ...copy, main_file: req.project.main_file, engine: req.project.engine }, 'owner') });
});

projectsRouter.get('/:id/tree', loadProject, (req, res) => {
  res.json({ tree: buildTree(projectDir(req.project.id)), mainFile: req.project.main_file });
});

/* ---------------- 文件读写 ---------------- */

function readFileHandler(req, res) {
  const rel = normalizeRelPath(req.query.path);
  const full = resolveInside(projectDir(req.project.id), rel);
  if (!fs.existsSync(full)) return res.status(404).json({ error: '文件不存在' });
  const st = fs.statSync(full);
  if (st.isDirectory()) return res.status(400).json({ error: '这是一个文件夹' });
  if (!isTextFile(rel)) return res.status(415).json({ error: '二进制文件不支持在线编辑' });
  res.json({ path: rel, content: fs.readFileSync(full, 'utf8'), size: st.size, mtime: st.mtimeMs });
}

projectsRouter.get('/:id/file', loadProject, readFileHandler);

projectsRouter.put('/:id/file', loadProject, (req, res) => {
  const rel = normalizeRelPath(req.query.path);
  const content = String(req.body?.content ?? '');
  const full = resolveInside(projectDir(req.project.id), rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  syncExternalWrite(req.project.id, rel, content);
  recordVersion({ projectId: req.project.id, path: rel, content, authorId: req.user.id, force: true });
  touchProject(req.project.id);
  res.json({ ok: true, mtime: fs.statSync(full).mtimeMs });
});

projectsRouter.post('/:id/file', loadProject, (req, res) => {
  const rel = normalizeRelPath(req.body?.path);
  const type = req.body?.type === 'dir' ? 'dir' : 'file';
  const full = resolveInside(projectDir(req.project.id), rel);
  if (fs.existsSync(full)) return res.status(409).json({ error: '同名文件或文件夹已存在' });
  if (type === 'dir') {
    fs.mkdirSync(full, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const content = req.body?.content ?? defaultFileContent(rel);
    fs.writeFileSync(full, String(content), 'utf8');
    recordVersion({ projectId: req.project.id, path: rel, content: String(content), authorId: req.user.id, force: true });
  }
  touchProject(req.project.id);
  res.json({ ok: true, path: rel, type });
});

function defaultFileContent(rel) {
  const ext = path.extname(rel).toLowerCase();
  if (ext === '.bib') return '@article{key,\n  title = {标题},\n  author = {作者},\n  year = {2024}\n}\n';
  if (ext === '.tex') return '';
  return '';
}

projectsRouter.delete('/:id/file', loadProject, (req, res) => {
  const rel = normalizeRelPath(req.query.path);
  const full = resolveInside(projectDir(req.project.id), rel);
  if (!fs.existsSync(full)) return res.status(404).json({ error: '文件不存在' });
  snapshot(req.project.id, req.user.id, `删除前：${rel}`, 'files');
  closeFileDocs(req.project.id, rel);
  fs.rmSync(full, { recursive: true, force: true });
  if (req.project.main_file === rel || req.project.main_file.startsWith(rel + '/')) {
    const fallback = buildTree(projectDir(req.project.id)).some((n) => n.name === 'main.tex') ? 'main.tex' : req.project.main_file;
    db.prepare('UPDATE projects SET main_file = ? WHERE id = ?').run(fallback, req.project.id);
  }
  touchProject(req.project.id);
  broadcastProject(req.project.id, { type: 'file:deleted', path: rel });
  res.json({ ok: true });
});

projectsRouter.post('/:id/rename', loadProject, (req, res) => {
  const from = normalizeRelPath(req.body?.from);
  const to = normalizeRelPath(req.body?.to);
  const dir = projectDir(req.project.id);
  const src = resolveInside(dir, from);
  const dest = resolveInside(dir, to);
  if (!fs.existsSync(src)) return res.status(404).json({ error: '源文件不存在' });
  if (fs.existsSync(dest)) return res.status(409).json({ error: '目标已存在' });
  if (to.startsWith(from + '/')) return res.status(400).json({ error: '不能移动到自身子目录' });
  snapshot(req.project.id, req.user.id, `重命名前：${from}`, 'files');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  closeFileDocs(req.project.id, from);
  fs.renameSync(src, dest);
  if (req.project.main_file === from) {
    db.prepare('UPDATE projects SET main_file = ? WHERE id = ?').run(to, req.project.id);
  } else if (req.project.main_file.startsWith(from + '/')) {
    db.prepare('UPDATE projects SET main_file = ? WHERE id = ?').run(req.project.main_file.replace(from, to), req.project.id);
  }
  touchProject(req.project.id);
  broadcastProject(req.project.id, { type: 'file:renamed', from, to });
  res.json({ ok: true, path: to });
});

projectsRouter.get('/:id/raw', loadProject, (req, res) => {
  const rel = normalizeRelPath(req.query.path);
  const full = resolveInside(projectDir(req.project.id), rel);
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) return res.status(404).json({ error: '文件不存在' });
  res.sendFile(full, { headers: { 'Cache-Control': 'no-store' } });
});

/* ---------------- 上传 ---------------- */

projectsRouter.post('/:id/upload', loadProject, upload.array('files', 60), (req, res) => {
  const dir = projectDir(req.project.id);
  let claimed = [];
  try { claimed = JSON.parse(req.body?.paths || '[]'); } catch { claimed = []; }
  const saved = [];
  const files = req.files || [];
  files.forEach((file, index) => {
    const raw = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const rel = normalizeRelPath(claimed[index] || raw);
    const full = resolveInside(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.buffer);
    if (isTextFile(rel)) {
      const text = file.buffer.toString('utf8');
      syncExternalWrite(req.project.id, rel, text);
      recordVersion({ projectId: req.project.id, path: rel, content: text, authorId: req.user.id, force: true });
    }
    saved.push(rel);
  });
  touchProject(req.project.id);
  res.json({ ok: true, saved });
});

/* ---------------- 从 ZIP / GitHub 新建项目 ---------------- */

// multer 错误单独转成 413，避免超大文件落到 Express 默认 500
const uploadSingleZip = (req, res, next) => upload.single('file')(req, res, (err) => {
  if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
    .json({ error: err.code === 'LIMIT_FILE_SIZE' ? '文件超过 30 MB 上限' : err.message });
  next();
});

projectsRouter.post('/import', uploadSingleZip, (req, res) => {
  if (!req.file) return res.status(400).json({ error: '缺少文件' });
  const rawName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  if (!rawName.toLowerCase().endsWith('.zip')) return res.status(400).json({ error: '请上传 .zip 压缩包' });
  try {
    const name = req.body?.name || rawName;
    res.json(createProjectFromZip({
      ownerId: req.user.id, name, buffer: req.file.buffer, source: 'zip',
    }));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || '导入失败' });
  }
});

projectsRouter.post('/from-github', async (req, res) => {
  try {
    const parsed = parseGithubInput(req.body?.url);
    const { buffer } = await downloadGithubZip(parsed);
    res.json(createProjectFromZip({
      ownerId: req.user.id,
      name: req.body?.name || parsed.name,
      buffer,
      source: 'github',
    }));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || '导入失败' });
  }
});

/* ---------------- 下载 ---------------- */

projectsRouter.get('/:id/download', loadProject, (req, res) => {
  const dir = projectDir(req.project.id);
  const name = `${req.project.name}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', () => res.end());
  archive.pipe(res);
  archive.directory(dir, false, (entry) => (isGenerated(entry.name) ? false : entry));
  archive.finalize();
});

/* ---------------- 编译 ---------------- */

// 同一项目、同一份源码的编译结果缓存，用于多人协作时避免重复编译
const compileCache = new Map();

function resultToJson(result, projectId) {
  return {
    ok: !!result.ok,
    engine: result.engine || null,
    ms: result.ms || 0,
    log: result.log || '',
    errors: result.errors || [],
    warnings: result.warnings || [],
    needsSetup: !!result.needsSetup,
    pdf: result.pdf ? `/api/projects/${projectId}/pdf?file=${encodeURIComponent(result.pdf)}&t=${Date.now()}` : null,
    by: result.by || null,
    cached: !!result.cached,
  };
}

projectsRouter.post('/:id/compile', loadProject, async (req, res) => {
  const mainFile = req.body?.mainFile ? normalizeRelPath(req.body.mainFile) : req.project.main_file;
  const force = req.body?.force === true;
  // 项目级引擎优先，其次本次请求（前端临时切换），最后 auto 跟随服务端默认
  const requestedEngine = req.body?.engine || req.project.engine || 'auto';
  const engine = pickEngine(requestedEngine);
  const engineKey = engine ? engine.id : String(requestedEngine);
  const dir = projectDir(req.project.id);
  flushProject(req.project.id);
  const hash = hashProject(dir);
  const hit = compileCache.get(req.project.id);
  // 缓存必须绑定引擎：换 pdfLaTeX / Tectonic 不能复用上一引擎的 PDF
  const stillFresh = hit && hit.epoch === req.project.collab_epoch && hit.hash === hash && hit.mainFile === mainFile && hit.engine === engineKey && Date.now() - hit.at < 10 * 60 * 1000;
  let result;

  if (!force && stillFresh) {
    result = { ...hit.result, cached: true };
  } else {
    broadcastProject(req.project.id, { type: 'compile:start', by: req.user.name, at: Date.now() });
    const raw = await compileProject({ projectId: req.project.id, mainFile, engine: requestedEngine });
    result = resultToJson(raw, req.project.id);
    result.by = req.user.name;
    result.engineLabel = raw.engine ? engineLabel(raw.engine) : null;
    compileCache.set(req.project.id, { hash, mainFile, engine: engineKey, epoch: req.project.collab_epoch, at: Date.now(), result });
    try {
      db.prepare('INSERT INTO compiles (id,project_id,user_id,ok,ms,engine,log,created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(crypto.randomUUID(), req.project.id, req.user.id, raw.ok ? 1 : 0,
          raw.ms || 0, raw.engine || null, (raw.log || '').slice(0, 200000), now());
    } catch { /* ignore */ }
  }

  touchProject(req.project.id);
  broadcastProject(req.project.id, { type: 'compile:result', result, cached: !!result.cached });
  res.json(result);
});

/* ---------------- 协作评论 ---------------- */

const COMMENT_MAX = 8000;
const REPLY_MAX = 8000;

function commentBody(value, max = COMMENT_MAX) {
  const text = String(value ?? '').trim();
  if (!text) return { error: '评论内容不能为空' };
  if (text.length > max) return { error: `内容过长（最多 ${max} 字）` };
  return { text };
}

function broadcastComment(projectId, action, comment) {
  broadcastProject(projectId, { type: 'comment:changed', action, comment, at: Date.now() });
}

/** 校验并归一化锚点：source 需文件内选区，pdf 需页码 + 归一化矩形 */
function normalizeAnchor(body, projectId) {
  const type = body?.anchorType === 'pdf' ? 'pdf' : 'source';
  if (type === 'pdf') {
    const page = Number(body?.page);
    const r = body?.rect;
    if (!Number.isInteger(page) || page < 1 || page > 5000) return { error: 'PDF 页码不合法' };
    if (!r || !['x', 'y', 'w', 'h'].every((k) => Number.isFinite(Number(r[k])))) {
      return { error: '框选区域坐标不合法' };
    }
    const rect = {
      x: Math.min(1, Math.max(0, Number(r.x))),
      y: Math.min(1, Math.max(0, Number(r.y))),
      w: Math.min(1, Math.max(0.004, Number(r.w))),
      h: Math.min(1, Math.max(0.004, Number(r.h))),
    };
    return { anchor: { anchorType: 'pdf', page, rect, path: null, from: null, to: null, quote: '' } };
  }
  const rel = normalizeRelPath(body?.path || '');
  resolveInside(projectDir(projectId), rel);   // 路径穿越会直接抛错
  const from = Number(body?.from);
  const to = Number(body?.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from) {
    return { error: '请先在文件里选中一段文字' };
  }
  return {
    anchor: {
      anchorType: 'source', path: rel, from: Math.floor(from), to: Math.floor(to),
      quote: String(body?.quote || '').slice(0, 500), page: null, rect: null,
    },
  };
}

projectsRouter.get('/:id/comments', loadProject, (req, res) => {
  res.json({ comments: listComments(req.project.id) });
});

projectsRouter.post('/:id/comments', loadProject, (req, res) => {
  const { text, error } = commentBody(req.body?.body);
  if (error) return res.status(400).json({ error });
  let anchor;
  try {
    const result = normalizeAnchor(req.body, req.project.id);
    if (result.error) return res.status(400).json({ error: result.error });
    anchor = result.anchor;
  } catch {
    return res.status(400).json({ error: '评论锚点不合法' });
  }
  const comment = createComment({ projectId: req.project.id, authorId: req.user.id, body: text, ...anchor });
  notifyDiscussion(req.project.id, comment.id, req.user.id, text);
  touchProject(req.project.id);
  broadcastComment(req.project.id, 'created', comment);
  res.status(201).json({ comment });
});

projectsRouter.post('/:id/comments/:cid/replies', loadProject, (req, res) => {
  const { text, error } = commentBody(req.body?.body, REPLY_MAX);
  if (error) return res.status(400).json({ error });
  const replyTo = req.body?.replyTo || null;
  if (replyTo && !db.prepare('SELECT id FROM comment_replies WHERE id=? AND comment_id=?').get(replyTo, req.params.cid)) return res.status(400).json({ error: '引用的回复不属于此评论' });
  const comment = addReply({
    projectId: req.project.id, commentId: req.params.cid, authorId: req.user.id, body: text,
    replyTo,
  });
  if (!comment) return res.status(404).json({ error: '评论不存在' });
  notifyDiscussion(req.project.id, comment.id, req.user.id, text);
  touchProject(req.project.id);
  broadcastComment(req.project.id, 'replied', comment);
  res.status(201).json({ comment });
});

projectsRouter.patch('/:id/comments/:cid', loadProject, (req, res) => {
  const comment = updateDiscussion(req.project.id, req.params.cid, req.body || {}, req.user, req.role);
  touchProject(req.project.id);
  broadcastComment(req.project.id, comment.resolved ? 'resolved' : 'reopened', comment);
  res.json({ comment });
});

projectsRouter.delete('/:id/comments/:cid', loadProject, (req, res) => {
  const row = getComment(req.project.id, req.params.cid);
  if (!row) return res.status(404).json({ error: '评论不存在' });
  // 作者本人或项目所有者可删除；解决/回复对所有成员开放
  if (row.authorId !== req.user.id && req.role !== 'owner') {
    return res.status(403).json({ error: '只能删除自己的评论' });
  }
  deleteComment(req.project.id, req.params.cid);
  touchProject(req.project.id);
  broadcastComment(req.project.id, 'deleted', { id: row.id });
  res.json({ ok: true });
});

/* ---------------- 常见编译错误：检测 / 一键修复 ---------------- */

/** 汇总两类静态体检结果，供打开项目时提前提示 */
function inspectProject(projectId, mainFile) {
  const dir = projectDir(projectId);
  const { clashes, scanned } = detectClashes(dir, mainFile);
  let boldGreek = [];
  try {
    const full = resolveInside(dir, mainFile);
    if (fs.existsSync(full)) boldGreek = detectBoldGreek(fs.readFileSync(full, 'utf8')).issues;
  } catch { /* ignore */ }
  return {
    scanned,
    mainFile,
    clashes: clashes.map((c) => ({ pkg: c.pkg, options: c.options, hint: c.hint, fixable: c.fixable, sites: c.sites })),
    boldGreek,
    issues: [
      ...clashes.map((c) => ({ code: 'option-clash', title: `宏包选项冲突：${c.pkg}`, hint: c.hint })),
      ...boldGreek.map((b) => ({
        code: 'unicode-math-bold',
        title: `粗体希腊字母：第 ${b.line} 行 ${b.command}{${b.greek}}`,
        hint: 'unicode-math 文档类下会触发 Improper alphabetic constant，改用 \\symbf 即可，可一键修复。',
      })),
    ],
  };
}

projectsRouter.get('/:id/clashes', loadProject, (req, res) => {
  try {
    res.json(inspectProject(req.project.id, req.project.main_file));
  } catch (err) {
    res.status(400).json({ error: err.message || '检测失败' });
  }
});

projectsRouter.post('/:id/fix-clashes', loadProject, (req, res) => {
  try {
    const info = repairProject({
      projectId: req.project.id,
      mainFile: req.project.main_file,
      authorId: req.user.id,
    });
    // 源码变了，编译缓存必须失效
    compileCache.delete(req.project.id);
    res.json({
      ok: true,
      fixed: info.fixed,
      warning: info.warning,
      added: info.fixed ? info.added : [],
      clashes: info.clashes.map((c) => ({ pkg: c.pkg, options: c.options, hint: c.hint })),
      boldGreek: info.boldGreek || null,
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || '修复失败' });
  }
});

/* 项目事件通道（REST 探测用，实际数据走 WebSocket /events/<id>） */
projectsRouter.get('/:id/events', loadProject, (req, res) => {
  res.json({ channel: `/events/${req.project.id}`, events: ['compile:start', 'compile:result', 'file:changed'] });
});

/* ---------------- 版本历史 ---------------- */

projectsRouter.get('/:id/versions', loadProject, (req, res) => {
  const rel = String(req.query.path || '');
  let versions = listVersions(req.project.id, rel);
  // 兼容升级前创建的项目：首次查看历史时，用当前磁盘内容补一个初始快照
  if (!versions.length && rel) {
    try {
      const full = resolveInside(projectDir(req.project.id), rel);
      if (fs.existsSync(full) && isTextFile(rel)) {
        const content = fs.readFileSync(full, 'utf8');
        recordVersion({ projectId: req.project.id, path: rel, content, authorId: req.user.id, force: true });
        versions = listVersions(req.project.id, rel);
      }
    } catch { /* ignore */ }
  }
  res.json({ versions });
});

projectsRouter.post('/:id/versions', loadProject, (req, res) => {
  const rel = normalizeRelPath(req.body?.path);
  const content = String(req.body?.content ?? '');
  const id = recordVersion({
    projectId: req.project.id, path: rel, content, authorId: req.user.id, force: true,
  });
  res.json({ ok: true, id });
});

projectsRouter.get('/:id/versions/:vid', loadProject, (req, res) => {
  const row = getVersion(req.project.id, req.params.vid);
  if (!row) return res.status(404).json({ error: '版本不存在' });
  res.json({ id: row.id, path: row.path, content: row.content, createdAt: row.created_at, authorId: row.author_id });
});

projectsRouter.post('/:id/versions/:vid/restore', loadProject, (req, res) => {
  const row = getVersion(req.project.id, req.params.vid);
  if (!row) return res.status(404).json({ error: '版本不存在' });
  const full = resolveInside(projectDir(req.project.id), row.path);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, row.content, 'utf8');
  syncExternalWrite(req.project.id, row.path, row.content);
  recordVersion({ projectId: req.project.id, path: row.path, content: row.content, authorId: req.user.id, force: true });
  compileCache.delete(req.project.id);
  broadcastProject(req.project.id, { type: 'file:changed', path: row.path, by: req.user.name });
  touchProject(req.project.id);
  res.json({ ok: true, path: row.path });
});

projectsRouter.get('/:id/pdf', loadProject, (req, res) => {
  const rel = req.query.file ? String(req.query.file) : `${path.basename(req.project.main_file, path.extname(req.project.main_file))}.pdf`;
  const full = resolveInside(projectDir(req.project.id), rel);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'PDF 尚未生成' });
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(full);
});

projectsRouter.get('/:id/log', loadProject, (req, res) => {
  const base = path.basename(req.project.main_file, path.extname(req.project.main_file));
  const full = path.join(projectDir(req.project.id), `${base}.log`);
  if (!fs.existsSync(full)) return res.json({ log: '', errors: [], warnings: [] });
  const log = fs.readFileSync(full, 'utf8');
  res.json({ log, ...parseLog(log) });
});

/* ---------------- 成员 ---------------- */

projectsRouter.get('/:id/members', loadProject, (req, res) => {
  const rows = db.prepare(`
    SELECT u.*, m.role FROM members m JOIN users u ON u.id = m.user_id
    WHERE m.project_id = ? ORDER BY m.created_at
  `).all(req.project.id);
  res.json({ members: rows.map((r) => ({ ...publicUser(r), role: r.role })) });
});

projectsRouter.post('/:id/members', loadProject, (req, res) => {
  if (req.role !== 'owner') return res.status(403).json({ error: '只有所有者可以邀请成员' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = getUserByEmail(email);
  if (!user) return res.status(404).json({ error: '该邮箱尚未注册' });
  if (memberRole(req.project.id, user.id)) return res.status(409).json({ error: '该用户已在项目中' });
  const role = req.body?.role || 'editor';
  if (!['editor', 'reviewer', 'viewer'].includes(role)) return res.status(400).json({ error: '成员角色不合法' });
  db.prepare('INSERT INTO members (project_id,user_id,role,created_at) VALUES (?,?,?,?)')
    .run(req.project.id, user.id, role, now());
  broadcastProject(req.project.id, { type: 'members:changed' });
  res.json({ ok: true, member: { ...publicUser(user), role } });
});

projectsRouter.patch('/:id/members/:userId', loadProject, (req, res) => {
  if (req.role !== 'owner') return res.status(403).json({ error: '只有所有者可以修改成员角色' });
  if (req.params.userId === req.project.owner_id) return res.status(400).json({ error: '不能修改所有者角色' });
  if (!['editor', 'reviewer', 'viewer'].includes(req.body?.role)) return res.status(400).json({ error: '成员角色不合法' });
  if (!memberRole(req.project.id, req.params.userId)) return res.status(404).json({ error: '成员不存在' });
  db.prepare('UPDATE members SET role=? WHERE project_id=? AND user_id=?').run(req.body.role, req.project.id, req.params.userId);
  broadcastProject(req.project.id, { type: 'members:changed' });
  revokeProjectAccess(req.project.id, req.params.userId);
  res.json({ ok: true });
});

projectsRouter.delete('/:id/members/:userId', loadProject, (req, res) => {
  if (req.role !== 'owner') return res.status(403).json({ error: '只有所有者可以移除成员' });
  if (req.params.userId === req.project.owner_id) return res.status(400).json({ error: '不能移除项目所有者' });
  db.prepare('DELETE FROM members WHERE project_id = ? AND user_id = ?').run(req.project.id, req.params.userId);
  // 立即踢掉该用户的协同与事件连接，避免移除后仍能收到编译结果/编辑内容
  revokeProjectAccess(req.project.id, req.params.userId);
  broadcastProject(req.project.id, { type: 'members:changed', by: req.user.name });
  res.json({ ok: true });
});
