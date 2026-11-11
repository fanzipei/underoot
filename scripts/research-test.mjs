/** End-to-end research workflows. Runs ONLY through the disposable test runner. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';

if (!process.env.LATEXSTUDIO_DATA?.includes('latexstudio-test-')) throw new Error('Run npm run test:research with disposable data');
const BASE = process.env.BASE_URL;
const WS = BASE.replace(/^http/, 'ws');
const results = [];
const sockets = new Set();
let lastModelRequest;
let modelText;
let modelStatus = 200;
function check(name, pass, detail = '') { results.push({ name, pass: !!pass }); console.log(` ${pass ? '✓' : '✗'} ${name}${detail ? ' / ' + detail : ''}`); }
async function req(url, cookie = '', method = 'GET', body) {
  const response = await fetch(BASE + url, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  let data;
  try { data = await response.json(); } catch { data = null; }
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}
const mock = http.createServer(async (request, response) => {
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  try { lastModelRequest = { body: JSON.parse(Buffer.concat(chunks).toString()), authorization: request.headers.authorization, url: request.url }; }
  catch { response.writeHead(400).end(); return; }
  response.writeHead(modelStatus, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ choices: [{ message: { content: modelText || 'OK' } }] }));
});
mock.listen(0, '127.0.0.1'); await once(mock, 'listening');
const mockBase = `http://127.0.0.1:${mock.address().port}/v1`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function collab(projectId, token, epoch = 0) {
  const doc = new Y.Doc();
  const socket = new WebSocket(`${WS}/collab/${projectId}::main.tex?token=${token}&epoch=${epoch}`); sockets.add(socket);
  socket.on('error', () => {});
  socket.on('message', (raw) => {
    const decoder = decoding.createDecoder(new Uint8Array(raw));
    if (decoding.readVarUint(decoder) !== 0) return;
    const reply = encoding.createEncoder(); encoding.writeVarUint(reply, 0);
    sync.readSyncMessage(decoder, reply, doc, socket);
    if (encoding.length(reply) > 1) socket.send(encoding.toUint8Array(reply));
  });
  await once(socket, 'open');
  const hello = encoding.createEncoder(); encoding.writeVarUint(hello, 0); sync.writeSyncStep1(hello, doc); socket.send(encoding.toUint8Array(hello));
  for (let i = 0; i < 30 && !doc.getText('content').length; i++) await sleep(40);
  return { socket, doc };
}
async function deniedSocket(projectId, token, epoch) {
  return new Promise((resolve) => {
    const socket = new WebSocket(`${WS}/collab/${projectId}::main.tex?token=${token}&epoch=${epoch}`);
    sockets.add(socket);
    const timer = setTimeout(() => { socket.terminate(); resolve(0); }, 3000);
    socket.on('unexpected-response', (_request, response) => { clearTimeout(timer); socket.terminate(); resolve(response.statusCode); });
    socket.on('open', () => { clearTimeout(timer); socket.terminate(); resolve(200); });
    socket.on('error', () => {});
  });
}

try {
  const ownerLogin = await req('/api/auth/login', '', 'POST', { email: 'demo@latex.studio', password: 'demo1234' });
  const owner = ownerLogin.cookie;
  const admin = (await req('/api/auth/login', '', 'POST', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })).cookie;
  check('隔离实例可登录', !!owner && !!admin);
  check('工作区接口需要登录', (await req('/api/workspace/search?q=hello')).status === 401);
  const newcomerEmail = `research-${Date.now()}@test.local`;
  await req('/api/auth/register', '', 'POST', { email: newcomerEmail, name: 'Research reviewer', password: 'ResearchPass42!' });
  const pending = (await req('/api/admin/users?status=pending', admin)).data.users.find((u) => u.email === newcomerEmail);
  await req(`/api/admin/users/${pending.id}/review`, admin, 'POST', { status: 'active' });
  const guest = (await req('/api/auth/login', '', 'POST', { email: newcomerEmail, password: 'ResearchPass42!' })).cookie;
  const project = (await req('/api/projects', owner, 'POST', { name: 'Research workspace test', template: 'blank' })).data.project;
  const pid = project.id;
  const base = `/api/workspace/projects/${pid}`;
  const source = '\\documentclass{article}\n\\usepackage{graphicx}\n\\title{Reliable research}\n\\author{Test Author}\n\\begin{document}\n\\maketitle\n\\section{Introduction}\nUNIQUE_WORKSPACE_ANCHOR and teh finding.\\cite{missing}\n\\begin{figure}\\includegraphics[width=.5\\linewidth]{figure.png}\\end{figure}\n\\section{Conclusion}\nThe measured result is 42.\n\\end{document}\n';
  await req(`/api/projects/${pid}/file?path=main.tex`, owner, 'PUT', { content: source });
  await req(`/api/projects/${pid}/file?path=refs.bib`, owner, 'PUT', { content: '@article{unused,title={Known research},year={2020}}\n' });
  const image = fs.readFileSync(new URL('../server/templates/graphics/figure.png', import.meta.url));
  const upload = new FormData(); upload.append('files', new Blob([image]), 'figure.png');
  await req(`/api/projects/${pid}/upload`, owner, 'POST', upload);
  check('项目创建时已有初始完整版本', (await req(base + '/history', owner)).data.revisions.some((r) => r.kind === 'initial'));
  const search = await req('/api/workspace/search?q=UNIQUE_WORKSPACE_ANCHOR', owner);
  check('跨项目搜索定位正文与行号', search.data.results.some((r) => r.projectId === pid && r.path === 'main.tex' && r.line === 8));
  check('搜索不泄露非成员项目', (await req('/api/workspace/search?q=UNIQUE_WORKSPACE_ANCHOR', guest)).data.results.length === 0);
  check('非成员无权读取项目版本', (await req(base + '/history', guest)).status === 403);
  check('非成员无权读取 AI 建议', (await req(base + '/suggestions', guest)).status === 403);
  const shared = await req(`/api/projects/${pid}/members`, owner, 'POST', { email: newcomerEmail, role: 'viewer' });
  check('可邀请只读成员', shared.data.member.role === 'viewer');
  check('只读成员可搜索共享正文', (await req('/api/workspace/search?q=UNIQUE_WORKSPACE_ANCHOR', guest)).data.results.length > 0);
  check('只读成员不能改文件', (await req(`/api/projects/${pid}/file?path=main.tex`, guest, 'PUT', { content: 'bad' })).status === 403);
  check('只读成员不能改编译器', (await req(`/api/projects/${pid}`, guest, 'PATCH', { engine: 'auto' })).status === 403);
  check('只读成员不能创建分支', (await req(base + '/branches', guest, 'POST', { name: 'bad' })).status === 403);
  check('只读成员不能触发 AI 审阅', (await req(base + '/review', guest, 'POST', {})).status === 403);
  check('只读成员不能发评论', (await req(`/api/projects/${pid}/comments`, guest, 'POST', { path: 'main.tex', from: 1, to: 5, body: 'bad' })).status === 403);
  const guestToken = (await req('/api/auth/ws-token', guest)).data.token;
  const readonly = await collab(pid, guestToken);
  check('只读协同连接可获取完整文本', readonly.doc.getText('content').toString() === source);
  readonly.doc.getText('content').insert(0, 'FORBIDDEN');
  const mutation = encoding.createEncoder(); encoding.writeVarUint(mutation, 0); sync.writeUpdate(mutation, Y.encodeStateAsUpdate(readonly.doc)); readonly.socket.send(encoding.toUint8Array(mutation));
  await sleep(850);
  check('只读 WebSocket 无法绕过 REST 写入保护', (await req(`/api/projects/${pid}/file?path=main.tex`, owner)).data.content === source);
  readonly.socket.close(); readonly.doc.destroy();
  check('所有者可调整成员为审阅者', (await req(`/api/projects/${pid}/members/${pending.id}`, owner, 'PATCH', { role: 'reviewer' })).status === 200);
  check('审阅者仍不能修改源码', (await req(`/api/projects/${pid}/file?path=main.tex`, guest, 'PUT', { content: 'bad' })).status === 403);
  const comment = (await req(`/api/projects/${pid}/comments`, guest, 'POST', { path: 'main.tex', from: 0, to: 10, quote: source.slice(0,10), body: 'Please verify @demo@latex.studio' })).data.comment;
  check('审阅者可提出源码评论', !!comment.id);
  const assigned = await req(`/api/projects/${pid}/comments/${comment.id}`, owner, 'PATCH', { assigneeId: pending.id, priority: 'high' });
  check('评论支持指派和优先级', assigned.data.comment.assigneeId === pending.id && assigned.data.comment.priority === 'high');
  check('@邮箱生成个人通知', (await req('/api/workspace/notifications', owner)).data.notifications.some((n) => n.comment_id === comment.id));
  check('指派通知仅本人可读', (await req('/api/workspace/notifications', guest)).data.notifications.every((n) => n.user_id === pending.id));
  check('评论更新可防止覆盖他人修改', (await req(`/api/projects/${pid}/comments/${comment.id}`, guest, 'PATCH', { body: 'race', expectedUpdatedAt: 1 })).status === 409);
  const ownerReply = (await req(`/api/projects/${pid}/comments/${comment.id}/replies`, owner, 'POST', { body: 'OWNER_REPLY_SEARCH_ANCHOR' })).data.comment.replies.at(-1);
  const quoted = (await req(`/api/projects/${pid}/comments/${comment.id}/replies`, guest, 'POST', { body: 'quoted reply', replyTo: ownerReply.id })).data.comment.replies.at(-1);
  check('支持回复指定回复', quoted.replyTo === ownerReply.id);
  check('审阅者不能编辑他人回复', (await req(`${base}/comments/${comment.id}/replies/${ownerReply.id}`, guest, 'PATCH', { body: 'bad' })).status === 403);
  check('作者可编辑自己的回复', (await req(`${base}/comments/${comment.id}/replies/${quoted.id}`, guest, 'PATCH', { body: 'edited', expectedUpdatedAt: quoted.updatedAt })).status === 200);
  check('作者可删除自己的回复', (await req(`${base}/comments/${comment.id}/replies/${quoted.id}`, guest, 'DELETE')).status === 200);
  check('跨项目搜索也搜索讨论回复', (await req('/api/workspace/search?q=OWNER_REPLY_SEARCH_ANCHOR&type=comments', owner)).data.results.some((r) => r.commentId === comment.id));
  await req('/api/workspace/notifications/read', guest, 'POST', {});
  check('可将个人通知标为已读', (await req('/api/workspace/notifications', guest)).data.notifications.every((n) => n.is_read));
  const checked = await req(base + '/review', owner, 'POST', {});
  check('不配置 API 也可执行本地审阅', checked.status === 200 && checked.data.suggestions.length > 0);
  check('本地检测缺失引用', checked.data.suggestions.some((s) => s.title.includes('缺少参考文献')));
  check('本地检测未引用 BibTeX', checked.data.suggestions.some((s) => s.title.includes('文献尚未引用')));
  check('本地检测插图缺图注与标签', checked.data.suggestions.filter((s) => s.category === 'figure').length >= 2);
  const typo = checked.data.suggestions.find((s) => s.before === 'teh');
  check('建议携带精确修改范围与替换预览', typo.canApply && source.slice(typo.from, typo.to) === 'teh' && typo.after === 'the');
  await req(`/api/projects/${pid}/file?path=main.tex`, owner, 'PUT', { content: source + '% concurrent edit\n' });
  check('内容变化后拒绝应用过期建议', (await req(`${base}/suggestions/${typo.id}`, owner, 'PATCH', { status: 'accepted' })).status === 409);
  await req(`/api/projects/${pid}/file?path=main.tex`, owner, 'PUT', { content: source });
  const accepted = await req(`${base}/suggestions/${typo.id}`, owner, 'PATCH', { status: 'accepted' });
  check('接受建议可应用精确补丁', accepted.data.applied && (await req(`/api/projects/${pid}/file?path=main.tex`, owner)).data.content.includes('the finding'));
  check('应用建议前后自动留存项目版本', (await req(base + '/history', owner)).data.revisions.filter((r) => r.kind === 'assistant').length >= 2);
  check('建议不能重复应用', (await req(`${base}/suggestions/${typo.id}`, owner, 'PATCH', { status: 'accepted' })).status === 409);
  const advisory = checked.data.suggestions.find((s) => !s.canApply);
  await req(`${base}/suggestions/${advisory.id}`, owner, 'PATCH', { status: 'rejected' });
  check('不接受建议保留原文', (await req(base + '/suggestions', owner)).data.suggestions.find((s) => s.id === advisory.id).status === 'rejected');
  check('普通成员无法读取 API 密钥配置', (await req('/api/workspace/ai/config', owner)).status === 403);
  check('普通成员无法修改 API 配置', (await req('/api/workspace/ai/config', guest, 'PUT', { baseUrl: mockBase })).status === 403);
  const saved = await req('/api/workspace/ai/config', admin, 'PUT', { baseUrl: mockBase, model: 'fixture-model', apiKey: 'fixture-key-DO-NOT-USE', vision: true });
  check('管理员可配置兼容 API', saved.data.configured && saved.data.hasKey);
  check('配置接口从不回显密钥', !JSON.stringify(saved.data).includes('fixture-key'));
  check('可测试兼容 API 连接', (await req('/api/workspace/ai/test', admin, 'POST', {})).data.ok);
  check('请求使用标准 chat/completions 路径与认证', lastModelRequest.url === '/v1/chat/completions' && lastModelRequest.authorization === 'Bearer fixture-key-DO-NOT-USE');
  await req(`/api/projects/${pid}/file?path=main.tex`, owner, 'PUT', { content: source + '% new revision\n' });
  modelText = JSON.stringify({ suggestions: [
    { title: '模型修改', detail: 'Improve spelling', path: 'main.tex', before: 'teh', after: 'the', category: 'language' },
    { title: '越界建议', path: '../escape.tex', before: 'teh', after: 'evil' },
    { title: '不确定定位', path: 'main.tex', before: 'NOT_PRESENT', after: 'invented', references: [{ title: 'bad', url: 'javascript:alert(1)' }] },
  ] });
  const modelReview = await req(base + '/review', owner, 'POST', { useAI: true, consent: true, sendImages: true, pdf: { page: 1, rect: { x: .1, y: .1, w: .2, h: .2 } }, image: 'data:image/png;base64,' + image.toString('base64') });
  check('模型意见解析并持久化', modelReview.status === 200 && modelReview.data.suggestions.some((s) => s.title === '模型修改'));
  check('模型无法写入越界路径', !modelReview.data.suggestions.some((s) => s.title === '越界建议'));
  check('无法精确定位的模型意见只作手动建议', modelReview.data.suggestions.some((s) => s.title === '不确定定位' && !s.canApply && s.references.length === 0));
  check('视觉模型请求包含图片与 PDF 选区上下文', lastModelRequest.body.messages[1].content.some((c) => c.type === 'image_url') && lastModelRequest.body.messages[1].content[0].text.includes('"page":1'));
  const { db } = await import('../server/db.js');
  const assistant = await import('../server/assistant.js');
  check('数据库密钥以密文保存', !db.prepare('SELECT value FROM settings WHERE key=?').get('assistant_config_v1').value.includes('fixture-key'));
  const localEnv = process.env.LATEXSTUDIO_AI_ALLOW_LOCAL;
  delete process.env.LATEXSTUDIO_AI_ALLOW_LOCAL;
  let privateDenied = false;
  try { await assistant.validateEndpoint('https://127.0.0.1/v1'); } catch (error) { privateDenied = error.status === 400; }
  process.env.LATEXSTUDIO_AI_ALLOW_LOCAL = localEnv;
  check('生产默认禁止 API 访问私网', privateDenied);
  const row = db.prepare('SELECT * FROM projects WHERE id=?').get(pid);
  let malformedDenied = false;
  modelText = 'not JSON';
  try { await assistant.review(row, { useAI: true, consent: true }); } catch (error) { malformedDenied = error.status === 502; }
  check('损坏模型响应明确报错，不修改文件', malformedDenied && (await req(`/api/projects/${pid}/file?path=main.tex`, owner)).data.content === source + '% new revision\n');
  const candidates = await assistant.literature(row, { query: 'graph neural networks survey', consent: true }, async () => ({ message: { items: [
    { DOI: '10.1234/test-paper', title: ['Fixture verified metadata'], author: [{ given: 'A', family: 'Author' }] }, { DOI: 'invalid', title: ['bad'] },
  ] } }));
  check('文献候选只使用检索返回的有效 DOI 元数据', candidates.count === 1 && candidates.suggestions.some((s) => s.references.some((r) => r.doi === '10.1234/test-paper')));
  check('未确认不会向文献服务发送论文关键词', (await req(base + '/literature', owner, 'POST', { query: 'test query' })).status === 400);
  const currentSource = (await req(`/api/projects/${pid}/file?path=main.tex`, owner)).data.content;
  const pointA = (await req(base + '/history', owner, 'POST', { title: 'Submission A' })).data.revision;
  const mainBranch = (await req(base + '/history', owner)).data.activeBranch;
  const branch = (await req(base + '/branches', owner, 'POST', { name: 'Submission B', revisionId: pointA.id })).data.branch;
  check('可从完整项目版本创建并切换分支', !!branch.id && (await req(base + '/history', owner)).data.activeBranch === branch.id);
  const epoch = (await req(`/api/projects/${pid}`, owner)).data.project.epoch;
  check('切换版本递增协作代次，隔离旧文档状态', epoch > 0);
  const ownerToken = (await req('/api/auth/ws-token', owner)).data.token;
  check('旧代次协作连接被拒绝', await deniedSocket(pid, ownerToken, epoch - 1) === 409);
  const fresh = await collab(pid, ownerToken, epoch);
  check('新代次协作连接恢复当前文本', fresh.doc.getText('content').toString() === currentSource);
  fresh.socket.close(); fresh.doc.destroy(); await sleep(100);
  await req(`/api/projects/${pid}/file?path=main.tex`, owner, 'PUT', { content: currentSource.replace('42', '43') });
  await req(`/api/projects/${pid}/file?path=branch-only.tex`, owner, 'PUT', { content: 'BRANCH_ONLY' });
  await req(`/api/projects/${pid}/file?path=figure.png`, owner, 'DELETE');
  const pointB = (await req(base + '/history', owner, 'POST', { title: 'Submission B changes' })).data.revision;
  const diff = await req(`${base}/history/${pointA.id}/diff?path=main.tex`, owner);
  check('项目差异含源码修改、新增和删除', ['main.tex','branch-only.tex','figure.png'].every((file) => diff.data.changed.some((r) => r.path === file)));
  check('可读取两个版本的文本差异', diff.data.before.includes('42') && diff.data.after.includes('43'));
  await req(`${base}/branches/${mainBranch}/checkout`, owner, 'POST', {});
  check('切回旧分支保留原结果', (await req(`/api/projects/${pid}/file?path=main.tex`, owner)).data.content === currentSource);
  check('分支切换正确删除其他分支独有文件', (await req(`/api/projects/${pid}/file?path=branch-only.tex`, owner)).status === 404);
  const rawImage = await fetch(`${BASE}/api/projects/${pid}/raw?path=figure.png`, { headers: { Cookie: owner } });
  check('二进制插图可随项目版本无损恢复', Buffer.from(await rawImage.arrayBuffer()).equals(image));
  await req(`${base}/branches/${branch.id}/checkout`, owner, 'POST', {});
  check('再次切换恢复分支的独立内容', (await req(`/api/projects/${pid}/file?path=main.tex`, owner)).data.content.includes('43'));
  await req(`${base}/history/${pointA.id}/restore`, owner, 'POST', {});
  check('恢复旧稿不会删除之后的项目版本', (await req(base + '/history', owner)).data.revisions.some((r) => r.id === pointB.id));
  check('不能恢复其他项目的版本', (await req(`/api/workspace/projects/${ownerLogin.data.user.id}/history/${pointA.id}/restore`, owner, 'POST', {})).status === 404);
  const originalBranch = (await req(base + '/history', owner)).data.activeBranch;
  const mergeCandidate = (await req(base + '/branches', owner, 'POST', { name: 'Merge candidate', revisionId: pointA.id })).data.branch;
  await req(`/api/projects/${pid}/file?path=main.tex`, owner, 'PUT', { content: currentSource.replace('42', '45') });
  await req(`/api/projects/${pid}/file?path=incoming-only.tex`, owner, 'PUT', { content: 'Incoming branch material' });
  await req(base + '/history', owner, 'POST', { title: 'Incoming changes' });
  await req(`${base}/branches/${originalBranch}/checkout`, owner, 'POST', {});
  await req(`/api/projects/${pid}/file?path=main.tex`, owner, 'PUT', { content: currentSource.replace('42', '44') });
  await req(`/api/projects/${pid}/file?path=ours-only.tex`, owner, 'PUT', { content: 'Current branch material' });
  let plan = (await req(`${base}/branches/${mergeCandidate.id}/merge-preview`, owner)).data;
  check('三方合并区分冲突与无冲突文件', plan.conflicts.some((c) => c.path === 'main.tex') && plan.changes.includes('incoming-only.tex'));
  check('审阅者无权合并分支', (await req(`${base}/branches/${mergeCandidate.id}/merge-preview`, guest)).status === 403);
  const attemptMerge = (payload) => req(`${base}/branches/${mergeCandidate.id}/merge`, owner, 'POST', payload);
  check('未处理冲突时拒绝合并且不覆盖原文', (await attemptMerge({ ...plan, resolutions: {} })).status === 409
    && (await req(`/api/projects/${pid}/file?path=main.tex`, owner)).data.content.includes('44'));
  await req(`/api/projects/${pid}/file?path=main.tex`, owner, 'PUT', { content: currentSource.replace('42', '44') + '% late edit\n' });
  check('合并预览过期时拒绝覆盖', (await attemptMerge({ ...plan, resolutions: { 'main.tex': 'theirs' } })).status === 409);
  plan = (await req(`${base}/branches/${mergeCandidate.id}/merge-preview`, owner)).data;
  const merged = await attemptMerge({ ...plan, resolutions: { 'main.tex': 'theirs' } });
  check('显式解决冲突后可合并分支', merged.status === 200 && (await req(`/api/projects/${pid}/file?path=main.tex`, owner)).data.content.includes('45'));
  check('合并同时保留两边互不冲突的文件', (await req(`/api/projects/${pid}/file?path=ours-only.tex`, owner)).status === 200
    && (await req(`/api/projects/${pid}/file?path=incoming-only.tex`, owner)).status === 200);
  check('合并版本记录双亲关系', (await req(base + '/history', owner)).data.revisions.some((r) => r.id === merged.data.revisionId && r.parent_id && r.merge_parent_id));
  await req(`${base}/history/${pointA.id}/restore`, owner, 'POST', {});
  modelText = null;
  const slides = await req(base + '/derive', owner, 'POST', { kind: 'slides' });
  const poster = await req(base + '/derive', owner, 'POST', { kind: 'poster' });
  check('一键生成独立 Slides 项目', !!slides.data.project?.id && slides.data.project.id !== pid);
  check('一键生成独立 Poster 项目', !!poster.data.project?.id && poster.data.project.id !== pid);
  const slidesTex = (await req(`/api/projects/${slides.data.project.id}/file?path=presentation.tex`, owner)).data.content;
  const posterTex = (await req(`/api/projects/${poster.data.project.id}/file?path=academic-poster.tex`, owner)).data.content;
  check('Slides 从论文内容生成，不是空白模板', slidesTex.includes('Reliable research') && slidesTex.includes('measured result is 42') && slidesTex.includes('figure.png'));
  check('Poster 包含正文与 A0 三栏版式', posterTex.includes('a0paper') && posterTex.includes('multicols}{3}') && posterTex.includes('measured result is 42'));
  check('派生项目保留来源版本记录', (await req(`/api/workspace/projects/${slides.data.project.id}/history`, owner)).data.revisions.some((r) => r.kind === 'derive'));
  const engines = (await req('/api/system/engines', owner)).data.engines;
  if (engines.some((engine) => engine.id === 'xelatex')) {
    const compiledSlides = await req(`/api/projects/${slides.data.project.id}/compile`, owner, 'POST', { force: true });
    const compiledPoster = await req(`/api/projects/${poster.data.project.id}/compile`, owner, 'POST', { force: true });
    check('生成的 Slides 可真实编译', compiledSlides.data.ok, compiledSlides.data.errors?.[0]?.message || '');
    check('生成的 Poster 可真实编译', compiledPoster.data.ok, compiledPoster.data.errors?.[0]?.message || '');
  }
  const template = new AdmZip();
  template.addFile('new-conference/main.tex', Buffer.from('\\documentclass[11pt]{article}\n\\usepackage{graphicx}\n\\title{Template}\n\\author{Template Author}\n\\begin{document}\nTEMPLATE_PLACEHOLDER\n\\end{document}\n'));
  template.addFile('new-conference/style-notes.txt', Buffer.from('Submission instructions'));
  const form = new FormData(); form.append('file', new Blob([template.toBuffer()]), 'template.zip'); form.append('branchName', 'New conference');
  const oldBranch = (await req(base + '/history', owner)).data.activeBranch;
  const retargeted = await req(base + '/template', owner, 'POST', form);
  check('上传新模板生成投稿分支', retargeted.status === 200 && retargeted.data.branch.name === 'New conference');
  const adapted = (await req(`/api/projects/${pid}/file?path=main.tex`, owner)).data.content;
  check('新模板保留旧稿正文并替换占位内容', adapted.includes('measured result is 42') && adapted.includes('documentclass[11pt]') && !adapted.includes('TEMPLATE_PLACEHOLDER'));
  check('模板辅助文件一起导入', (await req(`/api/projects/${pid}/file?path=style-notes.txt`, owner)).status === 200);
  await req(`${base}/branches/${oldBranch}/checkout`, owner, 'POST', {});
  check('转投后仍可切回完整旧模板旧正文', (await req(`/api/projects/${pid}/file?path=main.tex`, owner)).data.content === currentSource);
  check('旧分支不混入新模板文件', (await req(`/api/projects/${pid}/file?path=style-notes.txt`, owner)).status === 404);
  const homepage = await fetch(BASE + '/').then((response) => response.text());
  check('界面标题使用 underoot 新品牌', homepage.includes('<title>underoot') && !homepage.includes('LaTeXStudio'));
  const favicon = await fetch(BASE + '/favicon.svg').then((response) => response.text());
  check('根号图标使用本地 SVG 且替换旧 T 字母', favicon.includes('aria-label="underoot"') && favicon.includes('<path') && !favicon.includes('>T<'));
  const registry = await req('/api/extensions', owner);
  check('插件注册表包含三个独立的内置功能', ['underoot.assistant','underoot.discovery','underoot.publishing'].every((id) => registry.data.extensions.some((p) => p.id === id && p.enabled)));
  check('非管理员无权停用插件', (await req('/api/extensions/underoot.assistant', owner, 'PATCH', { enabled: false })).status === 403);
  await req('/api/extensions/underoot.assistant', admin, 'PATCH', { enabled: false });
  check('停用 AI 插件同时禁用其后端入口', (await req(base + '/review', owner, 'POST', {})).status === 409);
  check('AI 插件停用后核心建议审阅仍可读取', (await req(base + '/suggestions', owner)).status === 200);
  await req('/api/extensions/underoot.assistant', admin, 'PATCH', { enabled: true });
  await req('/api/extensions/underoot.discovery', admin, 'PATCH', { enabled: false });
  check('停用发现插件后搜索接口不可调用', (await req('/api/workspace/search?q=manuscript', owner)).status === 409);
  await req('/api/extensions/underoot.discovery', admin, 'PATCH', { enabled: true });
  await req('/api/extensions/underoot.publishing', admin, 'PATCH', { enabled: false });
  check('停用投稿插件后派生接口不可调用', (await req(base + '/derive', owner, 'POST', { kind: 'slides' })).status === 409);
  await req('/api/extensions/underoot.publishing', admin, 'PATCH', { enabled: true });
  check('内置插件禁止被卸载', (await req('/api/extensions/underoot.assistant', admin, 'DELETE')).status === 400);
  const selectionZip = new AdmZip(); selectionZip.addLocalFolder(fileURLToPath(new URL('../examples/plugins/selection-notes', import.meta.url)));
  const packBuffer = selectionZip.toBuffer();
  const zipRequest = async (endpoint, buffer, fields = {}, identity = admin) => {
    const form = new FormData(); form.append('file', new Blob([buffer]), 'plugin.zip');
    for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
    return req('/api/extensions/' + endpoint, identity, 'POST', form);
  };
  check('普通成员不能安装 ZIP 插件', (await zipRequest('inspect', packBuffer, {}, owner)).status === 403);
  const inspected = await zipRequest('inspect', packBuffer);
  check('插件检查展示完整权限与包指纹', inspected.status === 200 && inspected.data.manifest.id === 'community.selection-notes' && inspected.data.permissions.length === 3 && inspected.data.digest.length === 64);
  check('未确认权限不能安装插件', (await zipRequest('install', packBuffer)).status === 400);
  check('包变化后不能复用旧检查结果', (await zipRequest('install', packBuffer, { confirmed: true, digest: 'wrong' })).status === 400);
  check('确认后可从 ZIP 完成插件安装', (await zipRequest('install', packBuffer, { confirmed: true, digest: inspected.data.digest })).status === 200);
  check('安装后命令出现在注册表中', (await req('/api/extensions', owner)).data.extensions.some((p) => p.id === 'community.selection-notes' && p.contributes.commands[0].id === 'community.selection-notes.open'));
  const assets = await fetch(BASE + '/extensions/community.selection-notes/1.0.0/index.html');
  check('插件资源有独立的限制性 CSP', assets.status === 200 && assets.headers.get('content-security-policy').includes("connect-src 'none'") && !assets.headers.get('x-frame-options'));
  const rpc = (method, args = {}, identity = owner, plugin = 'community.selection-notes', more = {}) => req(`/api/extensions/${plugin}/rpc`, identity, 'POST', {
    method, args, projectId: pid, context: { selection: { path: 'main.tex', from: 0, to: 15 } }, ...more,
  });
  check('SDK 可读到经校验的源码选区', (await rpc('selection.read')).data.result.text === currentSource.slice(0,15));
  check('插件无法调用未声明的读取能力', (await rpc('project.read')).status === 403);
  check('插件无法调用任意宿主方法', (await rpc('shell.exec', { command: 'whoami' })).status === 400);
  check('插件无法越界读取会话文件', (await rpc('selection.read', {}, owner, 'community.selection-notes', { context: { selection: { path: '../secret.key', from: 0, to: 5 } } })).status === 400);
  const hiddenProject = (await req('/api/projects', owner, 'POST', { name: 'Plugin access isolation', template: 'blank' })).data.project;
  check('插件仍受调用者项目权限约束', (await rpc('selection.read', {}, guest, 'community.selection-notes', { projectId: hiddenProject.id })).status === 403);
  await rpc('storage.set', { key: 'note', value: 'owner note' });
  check('插件偏好设置可持久保存', (await rpc('storage.get', { key: 'note' })).data.result.value === 'owner note');
  check('插件存储在用户之间隔离', (await rpc('storage.get', { key: 'note' }, guest)).data.result.value === null);
  const pluginBefore = (await req(`/api/projects/${pid}/file?path=main.tex`, owner)).data.content;
  const proposed = await rpc('suggestions.propose', { title: 'Plugin review proposal', detail: 'Fixture proposal', path: 'main.tex', before: '42', after: '43' });
  check('插件只能提出待审阅修改，不能直接写稿', proposed.data.result.requiresReview && (await req(`/api/projects/${pid}/file?path=main.tex`, owner)).data.content === pluginBefore);
  check('插件建议保留可追溯的插件来源', (await req(base + '/suggestions', owner)).data.suggestions.some((s) => s.id === proposed.data.result.id && s.pluginId === 'community.selection-notes' && s.source === 'plugin'));
  check('作者接受后才应用插件建议', (await req(`${base}/suggestions/${proposed.data.result.id}`, owner, 'PATCH', { status: 'accepted' })).data.applied);
  await req('/api/extensions/community.selection-notes', admin, 'PATCH', { enabled: false });
  check('停用第三方插件后 RPC 被拒绝', (await rpc('selection.read')).status === 404);
  check('停用第三方插件后入口资源不可读取', (await fetch(BASE + '/extensions/community.selection-notes/1.0.0/index.html')).status === 404);
  await req('/api/extensions/community.selection-notes', admin, 'PATCH', { enabled: true });
  check('不能无确认覆盖同版本插件', (await zipRequest('install', packBuffer, { confirmed: true, digest: inspected.data.digest })).status === 409);
  const updatedZip = new AdmZip(packBuffer);
  const updatedManifest = JSON.parse(updatedZip.getEntry('underoot-plugin.json').getData().toString());
  updatedManifest.version = '1.1.0'; updatedZip.updateFile('underoot-plugin.json', Buffer.from(JSON.stringify(updatedManifest)));
  const updateBuffer = updatedZip.toBuffer(); const updateInspected = await zipRequest('inspect', updateBuffer);
  check('插件新版本通过重新确认后可更新', (await zipRequest('install', updateBuffer, { confirmed: true, digest: updateInspected.data.digest })).status === 200);
  check('插件更新保留该用户的个人设置', (await rpc('storage.get', { key: 'note' })).data.result.value === 'owner note');
  check('更新后旧版本入口不可继续运行', (await fetch(BASE + '/extensions/community.selection-notes/1.0.0/index.html')).status === 404);
  const manifest = JSON.parse(selectionZip.getEntry('underoot-plugin.json').getData().toString());
  const invalidZip = (modify) => { const zip = new AdmZip(packBuffer); const value = { ...manifest }; modify(value); zip.updateFile('underoot-plugin.json', Buffer.from(JSON.stringify(value))); return zip.toBuffer(); };
  check('插件不能申请未支持的权限', (await zipRequest('inspect', invalidZip((m) => { m.permissions = ['project.write']; }))).status === 400);
  check('插件 API 版本不兼容时明确拒绝', (await zipRequest('inspect', invalidZip((m) => { m.apiVersion = 99; }))).status === 400);
  check('上传包不能伪装为内置插件', (await zipRequest('inspect', invalidZip((m) => { m.runtime = 'builtin'; }))).status === 400);
  const binaryZip = new AdmZip(packBuffer); binaryZip.addFile('server.exe', Buffer.from('not executable'));
  check('插件包不能携带服务器可执行文件', (await zipRequest('inspect', binaryZip.toBuffer())).status === 400);
  const aiZip = new AdmZip(); aiZip.addLocalFolder(fileURLToPath(new URL('../examples/plugins/ai-claims', import.meta.url)));
  const aiPack = aiZip.toBuffer(); const aiInspected = await zipRequest('inspect', aiPack);
  await zipRequest('install', aiPack, { confirmed: true, digest: aiInspected.data.digest });
  check('AI 插件不能绕过作者确认调用模型', (await rpc('ai.complete', { input: 'test' }, owner, 'community.ai-claims')).status === 400);
  const aiReply = await rpc('ai.complete', { instruction: 'Reply OK', input: { publicFixture: true } }, owner, 'community.ai-claims', { consent: true });
  check('AI 插件可通过宿主调用已配置模型', aiReply.status === 200 && aiReply.data.result.text === 'OK');
  check('AI 插件从响应中拿不到模型密钥', !JSON.stringify(aiReply.data).includes('fixture-key'));
  check('用户可下载已安装插件进行分享', (await fetch(BASE + '/api/extensions/community.selection-notes/download', { headers: { Cookie: owner } })).status === 200);
  check('普通成员不能卸载实例插件', (await req('/api/extensions/community.selection-notes', owner, 'DELETE')).status === 403);
  check('管理员可卸载插件', (await req('/api/extensions/community.selection-notes', admin, 'DELETE')).status === 200);
  check('卸载后不能继续调用残留插件通道', (await rpc('storage.get', { key: 'note' })).status === 404);
  check('卸载插件不会删除已提出的论文建议', (await req(base + '/suggestions', owner)).data.suggestions.some((s) => s.id === proposed.data.result.id));
  const configChanged = await req('/api/workspace/ai/config', admin, 'PUT', { baseUrl: mockBase + '/new-host-path', model: 'fixture-model' });
  check('更换 API 地址不会沿用旧密钥', !configChanged.data.hasKey && !configChanged.data.configured);
  console.log(`\n研究工作流测试：${results.filter((r) => r.pass).length}/${results.length} 通过`);
  if (results.some((r) => !r.pass)) process.exitCode = 1;
} catch (error) { console.error(error); process.exitCode = 1; }
finally {
  for (const socket of sockets) socket.terminate();
  await new Promise((resolve) => mock.close(resolve));
}
