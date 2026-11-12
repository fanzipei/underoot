import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'underoot-git-test-'));
process.env.LATEXSTUDIO_DATA = temp; process.env.LATEXSTUDIO_SECRET = crypto.randomBytes(32).toString('hex');
const { db, createUser } = await import('../server/db.js');
const { saveGitConfig, gitConfig, syncGit } = await import('../server/git-sync.js');
const { projectDir } = await import('../server/paths.js');
let count = 0;
const check = (name, condition) => { assert.ok(condition, name); count++; console.log('✓', name); };
const sha = (b) => crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
const fixture = (provider, empty = false) => {
 let head = empty ? null : 'initial-commit'; let serial = 0; let committed;
 let remote = new Map(empty ? [] : [['README.md', Buffer.from('Keep remote README')], ['main.tex', Buffer.from('old manuscript')]]);
 const blobs = new Map(); let proposed;
 const calls = [];
 async function request(url, options = {}) {
  assert.equal(options.key, 'fixture-token'); calls.push({ url, ...options });
  const u = new URL(url); const suffix = provider === 'github' ? u.pathname.replace('/repos/example/paper', '') : u.pathname.replace('/api/v4/projects/example%2Fpaper', '');
  const body = options.body;
  if (!suffix) return { size: head ? 1 : 0, empty_repo: !head };
  if (suffix.startsWith('/git/ref/heads/') || suffix.startsWith('/repository/branches/')) return head ? provider === 'github' ? { object: { sha: head } } : { commit: { id: head } } : null;
  if (suffix.startsWith('/git/commits/') && !body) return { tree: { sha: 'tree-base' } };
  if (suffix.startsWith('/git/trees/') && !body) return { tree: [...remote].map(([path, b]) => ({ path, sha: sha(b), type: 'blob', mode: '100644' })) };
  if (suffix === '/repository/tree') return u.searchParams.get('page') !== '1' ? [] : [...remote].map(([path,b]) => ({ path, id: sha(b), type: 'blob', mode: '100644' }));
  if (suffix.startsWith('/repository/files/')) {
   const file = remote.get(decodeURIComponent(suffix.split('/repository/files/')[1])); return { blob_id: sha(file), last_commit_id: 'file-' + sha(file) };
  }
  if (suffix.startsWith('/contents/')) {
   const name = decodeURIComponent(suffix.slice('/contents/'.length)); assert.ok(!remote.has(name));
   remote.set(name, Buffer.from(body.content, 'base64')); head = `commit-${++serial}`; return { commit: { sha: head } };
  }
  if (suffix === '/git/blobs') { const buffer = Buffer.from(body.content,'base64'); blobs.set(sha(buffer),buffer); return { sha: sha(buffer) }; }
  if (suffix === '/git/trees') {
   proposed = new Map(remote);
   for (const entry of body.tree) if (entry.sha === null) proposed.delete(entry.path); else proposed.set(entry.path,blobs.get(entry.sha));
   return { sha: 'new-tree' };
  }
  if (suffix === '/git/commits') { assert.deepEqual(body.parents, head ? [head] : []); committed = `commit-${++serial}`; return { sha: committed }; }
  if (suffix.startsWith('/git/refs')) { assert.equal(body.force, false); remote = proposed; head = committed; return { object: { sha: head } }; }
  if (suffix === '/repository/commits') {
   for (const a of body.actions) {
    if (a.action === 'create') assert.ok(!remote.has(a.file_path));
    else assert.equal(a.last_commit_id, 'file-' + sha(remote.get(a.file_path)));
    if (a.action === 'delete') remote.delete(a.file_path); else remote.set(a.file_path, Buffer.from(a.content,'base64'));
   }
   head = `commit-${++serial}`; return { id: head };
  }
  throw new Error(`Unexpected API operation ${suffix}`);
 }
 return { request, calls, get remote() { return remote; }, change(name, content) { remote.set(name, Buffer.from(content)); head = `outside-${++serial}`; } };
};
try {
 const user = createUser({ email: 'git-test@underoot.local', name: 'Git fixture', password: 'not-a-login-password' });
 for (const provider of ['github','gitlab']) for (const empty of [false,true]) {
  const id = crypto.randomUUID(); const now = Date.now();
  db.prepare('INSERT INTO projects(id,owner_id,name,main_file,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,user.id,'Git fixture','main.tex',now,now);
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(id); fs.mkdirSync(projectDir(id));
  const body = '\\documentclass{article}\\begin{document}Updated paper\\end{document}';
  fs.writeFileSync(path.join(projectDir(id),'main.tex'), body);
  fs.writeFileSync(path.join(projectDir(id),'figure.png'), Buffer.from([0,255,128,2]));
  await saveGitConfig(id,user.id,{ provider,url: `https://${provider}.com/example/paper`,branch:'main',token:'fixture-token' });
  const mock = fixture(provider, empty);
  const preview = await syncGit(project,user.id,{},mock.request);
  check(`${provider} ${empty?'empty':'existing'}: preview performs no remote writes`, mock.calls.every((c) => !c.body));
  const result = await syncGit(project,user.id,{ push:true,digest:preview.digest,message:'Manuscript update' },mock.request);
  check(`${provider}: commit result returned`, result.commit?.startsWith('commit-'));
  check(`${provider}: exact TeX bytes published`, mock.remote.get('main.tex').toString() === body);
  check(`${provider}: binary data published intact`, mock.remote.get('figure.png').equals(Buffer.from([0,255,128,2])));
  if (!empty) check(`${provider}: unrelated remote README preserved`, mock.remote.get('README.md').toString() === 'Keep remote README');
  check(`${provider}: unchanged manuscript has no changes`, !(await syncGit(project,user.id,{},mock.request)).changes.length);
  fs.unlinkSync(path.join(projectDir(id),'figure.png'));
  const deletion = await syncGit(project,user.id,{},mock.request);
  check(`${provider}: local removal only deletes previously managed path`, deletion.changes.length===1 && deletion.changes[0].path==='figure.png' && deletion.changes[0].action==='delete');
  await syncGit(project,user.id,{push:true,digest:deletion.digest,message:'Remove figure'},mock.request);
  check(`${provider}: deletion is committed`, !mock.remote.has('figure.png'));
  fs.writeFileSync(path.join(projectDir(id),'main.tex'), body+' Local edit');
  const stale = await syncGit(project,user.id,{},mock.request);
  mock.change('README.md', 'Collaborator update');
  await assert.rejects(syncGit(project,user.id,{push:true,digest:stale.digest,message:'Stale'},mock.request),{status:409});
  check(`${provider}: stale preview cannot publish`, true);
  mock.change('main.tex','Remote edit');
  const conflict = await syncGit(project,user.id,{},mock.request);
  check(`${provider}: remote manuscript edit is a blocking conflict`, conflict.conflicts.includes('main.tex'));
  await assert.rejects(syncGit(project,user.id,{push:true,digest:conflict.digest,message:'Overwrite'},mock.request),{status:409});
  check(`${provider}: conflicting remote text remains intact`, mock.remote.get('main.tex').toString() === 'Remote edit');
  check(`${provider}: token encrypted at rest and absent in public response`, !db.prepare('SELECT config FROM git_connections WHERE project_id=?').get(id).config.includes('fixture-token') && !JSON.stringify(gitConfig(id,user.id)).includes('fixture-token'));
 }
 console.log(`Git provider protocol: ${count}/${count} passed`);
} finally { db.close(); fs.rmSync(temp,{recursive:true,force:true}); }
