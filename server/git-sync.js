import crypto from 'node:crypto';
import { db } from './db.js';
import { seal, unseal, remoteJSON, validateEndpoint } from './ai-service.js';
import { sourceFiles, snapshot, digest, failure } from './project-history.js';
import { flushProject } from './collab.js';

db.exec(`CREATE TABLE IF NOT EXISTS git_connections (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 config TEXT NOT NULL, PRIMARY KEY(project_id,user_id))`);
const blobHash = (buffer) => crypto.createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
const read = (project, user) => JSON.parse(db.prepare('SELECT config FROM git_connections WHERE project_id=? AND user_id=?').get(project, user)?.config || '{}');
export function gitConfig(project, user) {
 const { token, base, ...publicConfig } = read(project, user);
 return { ...publicConfig, configured: !!token, synced: Object.keys(base || {}).length };
}
export async function saveGitConfig(project, user, input) {
 if (busy.has(`${project}:${user}`)) throw failure(409, '正在同步，稍后再修改仓库配置');
 const provider = input.provider;
 if (!['github','gitlab'].includes(provider)) throw failure(400, '请选择 GitHub 或 GitLab');
 let url; try { url = new URL(String(input.url || '').replace(/\.git\/?$/, '')); } catch { throw failure(400, '请填写 HTTPS 仓库网址'); }
 await validateEndpoint(url.href, { allowLocal: process.env.UNDEROOT_GIT_ALLOW_LOCAL === '1' });
 if (url.search || url.hash || url.username || url.password || (provider === 'github' && url.origin !== 'https://github.com')) throw failure(400, 'GitHub 仅支持 github.com；仓库 URL 不得包含凭据或查询参数');
 const repo = url.pathname.replace(/^\/+|\/+$/g, '');
 if (!/^[\w.-]+(?:\/[\w.-]+)+$/.test(repo) || repo.split('/').some((s) => s === '.' || s === '..') || (provider === 'github' && repo.split('/').length !== 2)) throw failure(400, '仓库路径无效');
 const branch = String(input.branch || 'main');
 if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(branch) || branch.includes('..') || branch.includes('//') || branch.endsWith('/') || branch.endsWith('.') || branch.endsWith('.lock')) throw failure(400, '分支名无效');
 const old = read(project, user); const canonical = `${url.origin}/${repo}`;
 const same = old.url === canonical && old.provider === provider && old.branch === branch;
 let token = same ? old.token : '';
 if (input.token === null) token = '';
 else if (typeof input.token === 'string' && input.token.trim()) {
  if (input.token.length > 4096 || /[\r\n]/.test(input.token)) throw failure(400, 'Token 无效');
  token = seal(input.token.trim());
 }
 const config = { provider, url: canonical, repo, branch, token, ...(same ? { base: old.base, lastCommit: old.lastCommit } : {}) };
 if (busy.has(`${project}:${user}`)) throw failure(409, '正在同步，稍后再修改仓库配置');
 db.prepare('INSERT INTO git_connections VALUES(?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET config=excluded.config').run(project, user, JSON.stringify(config));
 return gitConfig(project, user);
}

async function remoteState(config, request) {
 const enc = encodeURIComponent; const github = config.provider === 'github';
 const deadline = Date.now() + 120000;
 const root = github ? `https://api.github.com/repos/${config.repo}` : `${new URL(config.url).origin}/api/v4/projects/${enc(config.repo)}`;
 const api = (suffix, options = {}) => {
  if (Date.now() >= deadline) throw failure(504, 'Git 同步超过两分钟，请重新预览后重试');
  return request(root + suffix, { key: unseal(config.token), timeout: Math.min(30000, deadline-Date.now()), maxResponse: 8*1024*1024, allowLocal: process.env.UNDEROOT_GIT_ALLOW_LOCAL === '1', ...options });
 };
 const branch = enc(config.branch);
 // Validate repository access before treating a missing ref as a new branch.
 const repo = await api('');
 let head; let tree; let files = [];
 if (github) {
  const ref = await api(`/git/ref/heads/${branch}`, { allow404: true });
  head = ref?.object?.sha || null;
  if (head) {
   tree = (await api(`/git/commits/${head}`)).tree.sha;
   const result = await api(`/git/trees/${tree}?recursive=1`);
   if (result.truncated) throw failure(413, '远端仓库目录过大，请使用论文专用仓库');
   files = result.tree.filter((f) => f.type === 'blob').map((f) => ({ path: f.path, sha: f.sha, mode: f.mode }));
  }
 } else {
  const ref = await api(`/repository/branches/${branch}`, { allow404: true });
  head = ref?.commit?.id || null;
  if (head) for (let page = 1; page <= 11; page++) {
   const rows = await api(`/repository/tree?ref=${branch}&recursive=true&per_page=100&page=${page}`);
   if (page === 11 && rows.length) throw failure(413, '远端目录超过 1000 项，请使用论文专用仓库');
   files.push(...rows.filter((f) => f.type === 'blob').map((f) => ({ path: f.path, sha: f.id, mode: f.mode })));
   if (rows.length < 100) break;
  }
 }
 if (files.length > 1000) throw failure(413, '远端文件超过 1000 项，请使用论文专用仓库');
 const empty = repo.empty_repo === true || repo.size === 0;
 if (!head && !empty) throw failure(400, '远端分支不存在，请先在仓库创建此分支；空仓库可以直接初始化');
 return { api, github, head, tree, files, empty };
}

export function planGitSync(config, local, remote) {
 const files = new Map(remote.files.map((f) => [f.path, f]));
 const current = Object.fromEntries(local.map((f) => [f.path, blobHash(f.buffer)]));
 const base = config.base || {}; const changes = []; const conflicts = [];
 for (const name of new Set([...Object.keys(current), ...Object.keys(base)])) {
  const wanted = current[name]; const existing = files.get(name);
  if (wanted === existing?.sha) continue;
  if ((base[name] && existing?.sha !== base[name]) || (existing && existing.mode !== '100644' && existing.mode !== '100755')) { conflicts.push(name); continue; }
  if (!wanted && !existing) continue;
  changes.push({ path: name, action: !wanted ? 'delete' : existing ? 'update' : 'create', overwrite: !!existing && !base[name] });
 }
 return { head: remote.head, changes, conflicts, current, digest: digest(JSON.stringify({ head: remote.head, current, changes, conflicts, url: config.url, branch: config.branch })) };
}
const busy = new Set();
export async function syncGit(project, user, input = {}, request = remoteJSON) {
 const lock = `${project.id}:${user}`;
 if (busy.has(lock)) throw failure(409, '此仓库正在同步，请稍后重试');
 busy.add(lock);
 try {
  const config = read(project.id, user);
  if (!config.token) throw failure(400, '请先保存你自己的仓库和 Token');
  flushProject(project.id);
  const local = sourceFiles(project);
  if (local.length > 500 || local.reduce((n,f) => n+f.buffer.length, 0) > 20*1024*1024 || local.some((f) => f.buffer.length > 5*1024*1024)) throw failure(413, 'Git 同步限 500 文件、20 MB、单文件 5 MB');
  const remote = await remoteState(config, request);
  const plan = planGitSync(config, local, remote);
  if (!input.push) return { ...plan, current: undefined };
  if (input.digest !== plan.digest || plan.conflicts.length) throw failure(409, '本地或远端已变化/发生冲突，请重新预览；远端修改需先合并后再同步');
  if (plan.changes.length > 100) throw failure(413, '一次最多提交 100 个文件变化，请分批整理项目');
  if (!plan.changes.length) return { unchanged: true, commit: remote.head };
  const message = String(input.message || '').trim();
  if (!message || message.length > 300) throw failure(400, '请填写 1–300 字符的提交说明');
  snapshot(project.id, user, `Git 同步前：${message}`, 'git-sync', true);
  const buffers = new Map(local.map((f) => [f.path, f.buffer]));
  let commit;
  if (remote.github) {
   // GitHub's Git Data API cannot create objects in an entirely empty
   // repository. Bootstrap its first file via Contents, then batch the rest.
   let changes = plan.changes;
   if (!remote.head) {
    const first = changes.find((c) => c.action !== 'delete');
    const made = await remote.api(`/contents/${first.path.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', body: { message, content: buffers.get(first.path).toString('base64'), branch: config.branch } });
    commit = made.commit.sha; remote.head = commit;
    remote.tree = (await remote.api(`/git/commits/${commit}`)).tree.sha;
    // Preserve progress if a network failure occurs before the second commit.
    config.base = { [first.path]: plan.current[first.path] }; config.lastCommit = commit;
    db.prepare('UPDATE git_connections SET config=? WHERE project_id=? AND user_id=?').run(JSON.stringify(config), project.id, user);
    changes = changes.filter((c) => c !== first);
   }
   const entries = [];
   for (const change of changes) {
    if (change.action === 'delete') { entries.push({ path: change.path, mode: '100644', type: 'blob', sha: null }); continue; }
    const blob = await remote.api('/git/blobs', { body: { content: buffers.get(change.path).toString('base64'), encoding: 'base64' } });
    entries.push({ path: change.path, mode: '100644', type: 'blob', sha: blob.sha });
   }
   if (entries.length) {
   const tree = await remote.api('/git/trees', { body: { ...(remote.tree ? { base_tree: remote.tree } : {}), tree: entries } });
   const made = await remote.api('/git/commits', { body: { message, tree: tree.sha, parents: remote.head ? [remote.head] : [] } });
   if (remote.head) await remote.api(`/git/refs/heads/${encodeURIComponent(config.branch)}`, { method: 'PATCH', body: { sha: made.sha, force: false } });
   else await remote.api('/git/refs', { body: { ref: `refs/heads/${config.branch}`, sha: made.sha } });
   commit = made.sha;
   }
  } else {
   const actions = [];
   for (const change of plan.changes) {
    const action = { action: change.action, file_path: change.path };
    if (change.action !== 'create') {
     const file = await remote.api(`/repository/files/${encodeURIComponent(change.path)}?ref=${encodeURIComponent(config.branch)}`);
     if (file.blob_id !== remote.files.find((f) => f.path === change.path)?.sha) throw failure(409, '远端文件已变化，请重新预览');
     action.last_commit_id = file.last_commit_id;
    }
    if (change.action !== 'delete') { action.content = buffers.get(change.path).toString('base64'); action.encoding = 'base64'; }
    actions.push(action);
   }
   const check = await remote.api(`/repository/branches/${encodeURIComponent(config.branch)}`, { allow404: true });
   if ((check?.commit?.id || null) !== remote.head) throw failure(409, '远端分支已变化，请重新预览');
   const made = await remote.api('/repository/commits', { body: { branch: config.branch, commit_message: message, actions } });
   commit = made.id;
  }
  if (!commit) throw failure(502, '远端没有确认提交结果，请检查仓库');
  config.base = plan.current; config.lastCommit = commit;
  db.prepare('UPDATE git_connections SET config=? WHERE project_id=? AND user_id=?').run(JSON.stringify(config), project.id, user);
  return { commit, url: config.provider === 'github' ? `${config.url}/commit/${commit}` : `${config.url}/-/commit/${commit}`, count: plan.changes.length };
 } finally { busy.delete(lock); }
}
