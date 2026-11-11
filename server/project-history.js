import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, now, onVersionRecorded } from './db.js';
import { DATA_DIR, projectDir, resolveInside } from './paths.js';
import { flushProject, closeProjectDocs, broadcastProject } from './collab.js';
import { isCompiling } from './compile.js';

const BLOBS = path.join(DATA_DIR, 'revision-blobs');
const GENERATED = /\.(?:aux|log|out|toc|fls|fdb_latexmk|nav|snm|vrb|bcf|blg|bbl|xdv|dvi|lof|lot|idx|ind|ilg|glo|gls|spl|loa|acn|acr|synctex(?:\.gz)?)$|\.run\.xml$/i;
export const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
export function failure(status, message) { return Object.assign(new Error(message), { status }); }

export function sourceFiles(project) {
  const files = [];
  const output = `${path.basename(project.main_file, path.extname(project.main_file))}.pdf`;
  let bytes = 0;
  const walk = (dir, prefix = '') => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.latexmkrc') continue;
      const rel = prefix + entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { walk(path.join(dir, entry.name), rel + '/'); continue; }
      if (!entry.isFile() || GENERATED.test(rel) || rel === output) continue;
      const full = resolveInside(projectDir(project.id), rel);
      const size = fs.statSync(full).size;
      bytes += size;
      if (size > 30 * 1024 * 1024 || bytes > 120 * 1024 * 1024 || files.length >= 4000) {
        throw failure(413, '项目快照上限为 4000 个文件、总计 120 MB、单文件 30 MB');
      }
      files.push({ path: rel, buffer: fs.readFileSync(full) });
    }
  };
  walk(projectDir(project.id));
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function manifestFor(project) {
  fs.mkdirSync(BLOBS, { recursive: true, mode: 0o700 });
  const manifest = Object.create(null);
  for (const file of sourceFiles(project)) {
    const hash = digest(file.buffer);
    const target = path.join(BLOBS, hash);
    if (!fs.existsSync(target)) {
      try { fs.writeFileSync(target, file.buffer, { mode: 0o600, flag: 'wx' }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    manifest[file.path] = { hash, size: file.buffer.length };
  }
  return manifest;
}

function branchFor(project) {
  let branch = db.prepare('SELECT * FROM project_branches WHERE id=? AND project_id=?').get(project.active_branch, project.id);
  if (branch) return branch;
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO project_branches(id,project_id,name,created_at) VALUES(?,?,?,?)').run(id, project.id, 'main', now());
  db.prepare('UPDATE projects SET active_branch=? WHERE id=?').run(id, project.id);
  return db.prepare('SELECT * FROM project_branches WHERE id=?').get(id);
}

export function snapshot(projectId, authorId, title = '自动保存', kind = 'auto', force = false) {
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
  if (!project || !fs.existsSync(projectDir(projectId))) return null;
  flushProject(projectId);
  const branch = branchFor(project);
  const manifest = JSON.stringify(manifestFor(project));
  const head = branch.head && db.prepare('SELECT * FROM project_revisions WHERE id=?').get(branch.head);
  if (!force && head && head.manifest === manifest && head.main_file === project.main_file && head.engine === project.engine) return head;
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO project_revisions(id,project_id,branch_id,parent_id,title,manifest,main_file,engine,author_id,kind,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id, projectId, branch.id, branch.head || null, String(title).slice(0, 180), manifest,
    project.main_file, project.engine, authorId || null, kind, now());
  db.prepare('UPDATE project_branches SET head=? WHERE id=?').run(id, branch.id);
  broadcastProject(projectId, { type: 'history:changed' });
  return db.prepare('SELECT * FROM project_revisions WHERE id=?').get(id);
}

export function revision(projectId, id) {
  const row = db.prepare('SELECT * FROM project_revisions WHERE id=? AND project_id=?').get(id, projectId);
  if (!row) throw failure(404, '项目版本不存在');
  return row;
}

export function materialize(row, target) {
  for (const [rel, info] of Object.entries(JSON.parse(row.manifest))) {
    if (!/^[a-f0-9]{64}$/.test(info.hash)) throw failure(500, '版本文件校验失败');
    const buffer = fs.readFileSync(path.join(BLOBS, info.hash));
    if (digest(buffer) !== info.hash) throw failure(500, '版本内容校验失败');
    const full = resolveInside(target, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, buffer);
  }
}

export function history(projectId) {
  snapshot(projectId, null, '当前工作区', 'auto');
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
  return {
    activeBranch: project.active_branch,
    branches: db.prepare('SELECT * FROM project_branches WHERE project_id=? ORDER BY created_at').all(projectId),
    revisions: db.prepare(`SELECT r.id,r.branch_id,r.parent_id,r.merge_parent_id,r.title,r.main_file,r.engine,r.author_id,r.kind,r.created_at,u.name AS author
      FROM project_revisions r LEFT JOIN users u ON u.id=r.author_id WHERE r.project_id=? ORDER BY r.created_at DESC,r.rowid DESC LIMIT 500`).all(projectId),
  };
}

export function createBranch(projectId, name, revisionId) {
  const title = String(name || '').trim();
  if (!title || title.length > 80) throw failure(400, '分支名称需为 1–80 个字符');
  if (db.prepare('SELECT id FROM project_branches WHERE project_id=? AND name=?').get(projectId, title)) throw failure(409, '同名分支已存在');
  const source = revision(projectId, revisionId);
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO project_branches(id,project_id,name,head,created_at) VALUES(?,?,?,?,?)').run(id, projectId, title, source.id, now());
  return db.prepare('SELECT * FROM project_branches WHERE id=?').get(id);
}

/** Stage the whole tree first; rollback filesystem and database together on failure. */
export function replaceWorkspace(projectId, staged, mainFile, engine, branchId) {
  if (isCompiling(projectId)) throw failure(409, '编译进行中，请完成后再切换项目版本');
  const dir = projectDir(projectId);
  const backup = `${dir}.previous-${crypto.randomUUID()}`;
  const main = resolveInside(staged, mainFile);
  if (!fs.existsSync(main) || !fs.statSync(main).isFile()) throw failure(400, '新版本缺少主文件，请检查合并选择或模板');
  closeProjectDocs(projectId);
  fs.renameSync(dir, backup);
  try {
    fs.renameSync(staged, dir);
    db.prepare('UPDATE projects SET main_file=?,engine=?,active_branch=?,collab_epoch=collab_epoch+1,updated_at=? WHERE id=?')
      .run(mainFile, engine || null, branchId, now(), projectId);
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(backup, dir);
    throw error;
  }
  fs.rmSync(backup, { recursive: true, force: true });
  broadcastProject(projectId, { type: 'project:reset', reason: '项目版本已切换，请重新连接' });
}

export function checkout(projectId, authorId, revisionId, branchId = null) {
  const source = revision(projectId, revisionId);
  snapshot(projectId, authorId, '切换前自动保留', 'checkpoint');
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
  const staged = fs.mkdtempSync(`${projectDir(projectId)}.checkout-`);
  try {
    materialize(source, staged);
    replaceWorkspace(projectId, staged, source.main_file, source.engine, branchId || project.active_branch);
    if (!branchId) snapshot(projectId, authorId, `恢复：${source.title}`, 'restore', true);
  } finally { fs.rmSync(staged, { recursive: true, force: true }); }
}

export function revisionDiff(projectId, id, relPath = '') {
  const source = revision(projectId, id);
  const before = JSON.parse(source.manifest);
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
  flushProject(projectId);
  const after = manifestFor(project);
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    .filter((key) => before[key]?.hash !== after[key]?.hash)
    .map((key) => ({ path: key, kind: !before[key] ? 'added' : !after[key] ? 'deleted' : 'modified', before: before[key]?.size || 0, after: after[key]?.size || 0 }));
  const read = (info) => !info || info.size > 1024 * 1024 ? '' : fs.readFileSync(path.join(BLOBS, info.hash), 'utf8');
  return { changed, metadata: { before: { mainFile: source.main_file, engine: source.engine || 'auto' },
    after: { mainFile: project.main_file, engine: project.engine || 'auto' } },
    ...(relPath ? { path: relPath, before: read(before[relPath]), after: read(after[relPath]) } : {}) };
}

export function mergePreview(projectId, userId, branchId) {
  const ours = snapshot(projectId, userId, '合并前的当前稿', 'merge');
  const activeBranch = db.prepare('SELECT active_branch FROM projects WHERE id=?').get(projectId).active_branch;
  const branch = db.prepare('SELECT * FROM project_branches WHERE id=? AND project_id=?').get(branchId, projectId);
  if (!branch?.head || branch.id === activeBranch) throw failure(400, '请选择另一个有版本的分支');
  const theirs = revision(projectId, branch.head);
  const rows = db.prepare('SELECT id,parent_id,merge_parent_id FROM project_revisions WHERE project_id=?').all(projectId);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ancestors = new Set();
  let queue = [ours.id];
  while (queue.length) {
    const id = queue.shift();
    if (!id || ancestors.has(id)) continue;
    ancestors.add(id); const row = byId.get(id); queue.push(row?.parent_id, row?.merge_parent_id);
  }
  let common = null; const visited = new Set(); queue = [theirs.id];
  while (queue.length) {
    const id = queue.shift(); if (!id || visited.has(id)) continue; visited.add(id);
    if (ancestors.has(id)) { common = revision(projectId, id); break; }
    const row = byId.get(id); queue.push(row?.parent_id, row?.merge_parent_id);
  }
  const baseline = JSON.parse(common?.manifest || '{}');
  const a = JSON.parse(ours.manifest); const b = JSON.parse(theirs.manifest);
  const conflicts = []; const changes = []; const merged = Object.create(null);
  for (const rel of new Set([...Object.keys(baseline), ...Object.keys(a), ...Object.keys(b)])) {
    const old = baseline[rel]?.hash; const left = a[rel]?.hash; const right = b[rel]?.hash;
    let chosen = a[rel];
    if (left === right || right === old) chosen = a[rel];
    else if (left === old) { chosen = b[rel]; changes.push(rel); }
    else conflicts.push({ path: rel, ours: a[rel]?.size ?? null, theirs: b[rel]?.size ?? null });
    if (chosen) merged[rel] = chosen;
  }
  const metadata = {};
  for (const key of ['main_file', 'engine']) {
    const old = common?.[key] || null; const left = ours[key] || null; const right = theirs[key] || null;
    metadata[key] = left === old ? right : left;
    if (left !== right && left !== old && right !== old) conflicts.push({ path: '$' + key, ours: left, theirs: right });
  }
  return { ours: ours.id, theirs: theirs.id, currentBranch: activeBranch, common: common?.id || null, branchName: branch.name, conflicts, changes, merged, metadata };
}

export function mergeBranch(projectId, userId, branchId, body) {
  const plan = mergePreview(projectId, userId, branchId);
  if (body.ours !== plan.ours || body.theirs !== plan.theirs || body.currentBranch !== plan.currentBranch) throw failure(409, '分支内容已变化，请重新预览合并');
  const incoming = revision(projectId, plan.theirs);
  const current = revision(projectId, plan.ours);
  const incomingManifest = JSON.parse(incoming.manifest);
  for (const conflict of plan.conflicts) {
    const choice = body.resolutions?.[conflict.path];
    if (!['ours', 'theirs'].includes(choice)) throw failure(409, `请明确选择冲突的处理方式：${conflict.path}`);
    if (conflict.path.startsWith('$')) plan.metadata[conflict.path.slice(1)] = choice === 'ours' ? current[conflict.path.slice(1)] : incoming[conflict.path.slice(1)];
    else if (choice === 'theirs') {
      if (incomingManifest[conflict.path]) plan.merged[conflict.path] = incomingManifest[conflict.path];
      else delete plan.merged[conflict.path];
    }
  }
  const staged = fs.mkdtempSync(`${projectDir(projectId)}.merge-`);
  try {
    materialize({ manifest: JSON.stringify(plan.merged) }, staged);
    replaceWorkspace(projectId, staged, plan.metadata.main_file, plan.metadata.engine, plan.currentBranch);
    const merged = snapshot(projectId, userId, `合并分支：${plan.branchName}`, 'merge', true);
    db.prepare('UPDATE project_revisions SET merge_parent_id=? WHERE id=?').run(plan.theirs, merged.id);
    return { ok: true, revisionId: merged.id };
  } finally { fs.rmSync(staged, { recursive: true, force: true }); }
}

const pending = new Map();
onVersionRecorded((projectId, authorId) => {
  if (pending.has(projectId)) return;
  const timer = setTimeout(() => {
    pending.delete(projectId);
    try { snapshot(projectId, authorId); } catch (error) { console.error('[history]', error.message); }
  }, 20000);
  timer.unref();
  pending.set(projectId, timer);
});
