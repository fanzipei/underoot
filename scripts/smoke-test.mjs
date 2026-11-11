/**
 * LaTeXStudio 回归测试（无需额外依赖，需要服务已启动）
 * 用法：npm test        或        BASE_URL=http://127.0.0.1:3000 npm test
 */
import fs from 'node:fs';
import AdmZip from 'adm-zip';
import WebSocket from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const WS_BASE = BASE.replace(/^http/, 'ws');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@latex.studio';
// 管理员密码：优先取环境变量，其次读首次启动生成的 data/admin-password.txt
const ADMIN_PASSWORD = (() => {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  try {
    const text = fs.readFileSync(new URL('../data/admin-password.txt', import.meta.url), 'utf8');
    const matched = text.match(/初始密码：(.+)/);
    if (matched) return matched[1].trim();
  } catch { /* 文件不存在：管理员密码已被修改 */ }
  return '';
})();
let cookie = '';
const results = [];
const createdProjects = [];

function check(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? `  (${detail})` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 探测 WebSocket 是否允许建连（用于验证非成员被拒绝） */
function wsAccess(url) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.terminate(); } catch { /* ignore */ }
      resolve(value);
    };
    const ws = new WebSocket(url);
    const timer = setTimeout(() => finish('timeout'), 8000);
    ws.on('open', () => finish('open'));
    ws.on('unexpected-response', () => finish('denied'));
    ws.on('error', () => finish('denied'));
  });
}

/** 用最小 y-websocket 协议连到协同房间，复用传入的 Y.Doc 模拟浏览器重连 */
function openYjs(url, doc) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error('协同连接超时')), 10000);
    ws.on('open', () => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, 0);
      syncProtocol.writeSyncStep1(enc, doc);
      ws.send(encoding.toUint8Array(enc));
    });
    ws.on('message', (raw) => {
      try {
        const dec = decoding.createDecoder(new Uint8Array(raw));
        if (decoding.readVarUint(dec) !== 0) return;
        const reply = encoding.createEncoder();
        encoding.writeVarUint(reply, 0);
        syncProtocol.readSyncMessage(dec, reply, doc, ws);
        if (encoding.length(reply) > 1) ws.send(encoding.toUint8Array(reply));
      } catch { /* ignore */ }
    });
    ws.on('error', (e) => { clearTimeout(timer); reject(e); });
    setTimeout(() => { clearTimeout(timer); resolve(ws); }, 1600);
  });
}

async function req(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: {
      ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(opts.headers || {}),
    },
  });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie?.includes('ls_token=')) cookie = setCookie.split(';')[0];
  let data = null;
  try { data = await r.json(); } catch { /* ignore */ }
  return { status: r.status, data };
}

async function main() {
  console.log(`\nunderoot 回归测试  ${BASE}\n`);

  // --- 编译日志诊断（纯函数，无需服务）---
  {
    const { parseLog } = await import('../server/compile.js');
    const log = [
      '! Improper alphabetic constant.',
      '<to be read again>                     \\mitPhi',
      'l.433 ... $\\boldsymbol{\\Phi}(c)$',
      '',
    ].join('\n');
    const parsed = parseLog(log);
    const err = parsed.errors.find((e) => /Improper alphabetic constant/i.test(e.message));
    check('parseLog 识别 unicode-math 粗体错误', err?.code === 'unicode-math-bold', err?.code);
    check('unicode-math 错误带修复建议', !!err?.hint && /symbf/.test(err.hint), '');
    const fileError = parseLog('./main.tex:7: LaTeX Error: Option clash for package xcolor.').errors[0];
    check('file-line-error 格式保留一键修复诊断', fileError?.code === 'option-clash' && fileError?.package === 'xcolor');
  }
  {
    const { detectEngines, pickEngine, engineLabel, enginePathDirs } = await import('../server/compile.js');
    const list = detectEngines().engines.map((e) => e.id);
    check('pickEngine 能选中已安装引擎', !!pickEngine() && list.includes(pickEngine().id), pickEngine()?.id);
    check('pickEngine 指定不可用引擎返回 null', pickEngine('definitely-not-installed') === null);
    check('pickEngine auto 走默认优先级', !!pickEngine('auto'), '');
    check('引擎有可读标签', engineLabel('latexmk').includes('pdfLaTeX') && engineLabel('tectonic').includes('Tectonic'));
    check('enginePathDirs 返回数组', Array.isArray(enginePathDirs()), `${enginePathDirs().length} 个目录`);
    const previous = process.env.LATEX_ENGINE;
    try {
      process.env.LATEX_ENGINE = list.at(-1);
      check('auto 尊重服务端默认引擎', pickEngine('auto')?.id === list.at(-1));
    } finally {
      if (previous === undefined) delete process.env.LATEX_ENGINE;
      else process.env.LATEX_ENGINE = previous;
    }
  }

  // --- 认证与安全 ---
  const login = await req('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: 'demo@latex.studio', password: 'demo1234' }),
  });
  check('演示账号登录', login.status === 200 && !!login.data?.user, login.data?.user?.email);
  if (login.status !== 200) throw new Error('无法登录，测试终止');

  const ownerCookie = cookie;
  cookie = '';
  check('未登录访问项目列表被拒绝', (await req('/api/projects')).status === 401);
  check('编译环境接口需鉴权', (await req('/api/system/engines')).status === 401);
  cookie = ownerCookie;
  const enginesRes = await req('/api/system/engines');
  check('编译环境接口登录后可访问', enginesRes.status === 200, enginesRes.data?.engines?.map((e) => e.id).join(','));
  const availableEngines = enginesRes.data?.engines || [];
  check('引擎列表带可读名称', availableEngines.length > 0 && availableEngines.every((e) => !!e.name), '');
  check('默认引擎已选出', !!enginesRes.data?.active, enginesRes.data?.active);

  // --- 项目与文件 ---
  const created = await req('/api/projects', {
    method: 'POST', body: JSON.stringify({ name: '回归测试项目', template: 'blank' }),
  });
  const pid = created.data?.project?.id;
  createdProjects.push(pid);
  check('创建项目', !!pid, pid?.slice(0, 8));

  // --- 项目级编译引擎 ---
  check('新项目默认引擎为 auto', created.data?.project?.engine === 'auto', created.data?.project?.engine);
  const projDetail = await req(`/api/projects/${pid}`);
  check('打开项目返回可用引擎列表', Array.isArray(projDetail.data?.engines) && projDetail.data.engines.length > 0,
    projDetail.data?.engines?.map((e) => e.id).join(','));
  check('未知引擎被拒绝', (await req(`/api/projects/${pid}`, {
    method: 'PATCH', body: JSON.stringify({ engine: 'not-an-engine' }),
  })).status === 400);
  if (availableEngines.length) {
    const target = availableEngines[0].id;
    const set = await req(`/api/projects/${pid}`, { method: 'PATCH', body: JSON.stringify({ engine: target }) });
    check('可设置项目级引擎', set.status === 200 && set.data?.project?.engine === target, target);
    check('重新打开项目保留编译器设置', (await req(`/api/projects/${pid}`)).data?.project?.engine === target);
    const other = await req('/api/projects', { method: 'POST', body: JSON.stringify({ name: '引擎隔离测试', template: 'blank' }) });
    const otherId = other.data?.project?.id;
    createdProjects.push(otherId);
    check('各项目编译器设置互相独立', other.data?.project?.engine === 'auto'
      && (await req(`/api/projects/${pid}`)).data?.project?.engine === target);
    const engineToken = (await req('/api/auth/ws-token')).data?.token;
    const settingEvent = await new Promise((resolve) => {
      const ws = new WebSocket(`${WS_BASE}/events/${pid}?token=${engineToken}`);
      const timer = setTimeout(() => { ws.terminate(); resolve(null); }, 5000);
      ws.on('open', () => req(`/api/projects/${pid}`, { method: 'PATCH', body: JSON.stringify({ engine: target }) }).catch(() => ws.terminate()));
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'project:engine') { clearTimeout(timer); ws.close(); resolve(msg.engine); }
      });
      ws.on('error', () => { clearTimeout(timer); resolve(null); });
    });
    check('编译器设置实时通知协作者', settingEvent === target);
    const back = await req(`/api/projects/${pid}`, { method: 'PATCH', body: JSON.stringify({ engine: 'auto' }) });
    check('可恢复 auto', back.status === 200 && back.data?.project?.engine === 'auto', '');
  }

  const bad = await req(`/api/projects/${pid}/file?path=${encodeURIComponent('../app.db')}`);
  check('路径穿越返回 400（不是 500）', bad.status === 400, String(bad.status));

  check('创建嵌套文件', (await req(`/api/projects/${pid}/file`, {
    method: 'POST', body: JSON.stringify({ path: 'chapters/intro.tex', type: 'file', content: '\\section{Intro}\n' }),
  })).status === 200);

  const fd = new FormData();
  fd.append('files', new Blob(['\\section{上传}\n']), '中文文件.tex');
  fd.append('paths', JSON.stringify(['中文文件.tex']));
  const up = await req(`/api/projects/${pid}/upload`, { method: 'POST', body: fd });
  check('上传中文名文件', up.status === 200 && up.data?.saved?.[0] === '中文文件.tex');

  // --- 版本历史 ---
  const versions = await req(`/api/projects/${pid}/versions?path=${encodeURIComponent('main.tex')}`);
  check('模板初始快照存在', versions.status === 200 && versions.data?.versions?.length >= 1,
    `${versions.data?.versions?.length} 个`);

  const rel = 'main.tex';
  const original = (await req(`/api/projects/${pid}/file?path=${rel}`)).data?.content;
  await req(`/api/projects/${pid}/file?path=${rel}`, {
    method: 'PUT', body: JSON.stringify({ content: '\\documentclass{article}\n\\begin{document}\nCHANGED\n\\end{document}\n' }),
  });
  const versions2 = await req(`/api/projects/${pid}/versions?path=${rel}`);
  const initialVersionId = versions2.data?.versions?.[versions2.data.versions.length - 1]?.id;
  check('写入后生成新版本', versions2.data?.versions?.length >= 2, `${versions2.data?.versions?.length} 个`);
  if (initialVersionId) {
    const restored = await req(`/api/projects/${pid}/versions/${initialVersionId}/restore`, { method: 'POST', body: '{}' });
    const after = (await req(`/api/projects/${pid}/file?path=${rel}`)).data?.content;
    check('一键恢复历史版本', restored.status === 200 && after === original);
  }

  // --- 编译 ---
  const good = await req(`/api/projects/${pid}/compile`, { method: 'POST', body: JSON.stringify({ force: true }) });
  check('强制编译成功', good.data?.ok === true, `${good.data?.ms} ms / ${good.data?.engine}${good.data?.ok ? '' : ' / ' + good.data?.errors?.[0]?.message}`);
  check('编译结果带有发起人', typeof good.data?.by === 'string', good.data?.by);

  const cached = await req(`/api/projects/${pid}/compile`, { method: 'POST', body: '{}' });
  check('相同源码复用编译结果（去重）', cached.data?.cached === true && cached.data?.ok === true);

  const channels = await req(`/api/projects/${pid}/events`);
  check('项目事件通道存在', channels.status === 200 && channels.data?.channel?.startsWith('/events/'));

  // --- 事件广播（WebSocket） ---
  const tokenRes = await req('/api/auth/ws-token');
  const wsResult = await new Promise((resolve) => {
    const ws = new WebSocket(`${WS_BASE}/events/${pid}?token=${encodeURIComponent(tokenRes.data?.token || '')}`);
    const seen = new Set();
    const timer = setTimeout(() => { ws.close(); resolve([...seen]); }, 12000);
    ws.on('open', async () => {
      await req(`/api/projects/${pid}/compile`, { method: 'POST', body: JSON.stringify({ force: true }) });
    });
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        seen.add(msg.type);
        if (msg.type === 'compile:result') {
          clearTimeout(timer);
          ws.close();
          resolve([...seen]);
        }
      } catch { /* ignore */ }
    });
    ws.on('error', () => { clearTimeout(timer); resolve([...seen]); });
  });
  check('WebSocket 广播 compile:start', wsResult.includes('compile:start'));
  check('WebSocket 广播 compile:result', wsResult.includes('compile:result'));

  // --- 协同重连不重复内容（服务端必须持久化 Y.Doc 状态） ---
  const wsToken = (await req('/api/auth/ws-token')).data?.token;
  const collabUrl = `${WS_BASE}/collab/${pid}::main.tex?token=${encodeURIComponent(wsToken || '')}`;
  const ydoc = new Y.Doc();
  const conn1 = await openYjs(collabUrl, ydoc);
  const lenBefore = ydoc.getText('content').toString().length;
  conn1.close();
  await sleep(1300); // 最后一个连接断开，服务端销毁房间并落盘协同状态
  const conn2 = await openYjs(collabUrl, ydoc);
  await sleep(600);
  const lenAfter = ydoc.getText('content').toString().length;
  conn2.close();
  check('断线重连不重复文档内容', lenBefore > 0 && lenAfter === lenBefore,
    `${lenBefore} -> ${lenAfter} 字符`);
  ydoc.destroy();

  // Invalid collaboration input must never take down the HTTP server.
  check('协同拒绝越界路径', await wsAccess(`${WS_BASE}/collab/${encodeURIComponent(`${pid}::../escape.tex`)}?token=${wsToken}`) === 'denied');
  check('协同拒绝不存在的文件', await wsAccess(`${WS_BASE}/collab/${pid}::missing.tex?token=${wsToken}`) === 'denied');
  const malformedClose = await new Promise((resolve) => {
    const ws = new WebSocket(collabUrl, { headers: { Cookie: 'broken=%ZZ' } });
    const timer = setTimeout(() => { ws.terminate(); resolve(null); }, 5000);
    ws.on('open', () => ws.send(Buffer.from([0])));
    ws.on('close', (code) => { clearTimeout(timer); resolve(code); });
    ws.on('error', () => { clearTimeout(timer); resolve(null); });
  });
  check('损坏 Cookie 与协同消息不会导致崩溃', malformedClose === 1003 && (await req('/api/auth/me')).status === 200);

  // Keep a room open while renaming/deleting a directory, including unsaved edits.
  await req(`/api/projects/${pid}/file`, { method: 'POST', body: JSON.stringify({ path: 'draft/note.tex', content: 'before' }) });
  const draft = new Y.Doc();
  const draftWs = await openYjs(`${WS_BASE}/collab/${pid}::draft/note.tex?token=${wsToken}`, draft);
  draft.getText('content').insert(draft.getText('content').length, ' pending');
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, 0);
  syncProtocol.writeUpdate(enc, Y.encodeStateAsUpdate(draft));
  draftWs.send(encoding.toUint8Array(enc));
  await sleep(100);
  check('文件夹不能移入自身', (await req(`/api/projects/${pid}/rename`, { method: 'POST', body: JSON.stringify({ from: 'draft', to: 'draft/child' }) })).status === 400);
  const renamed = await req(`/api/projects/${pid}/rename`, { method: 'POST', body: JSON.stringify({ from: 'draft', to: 'renamed' }) });
  await sleep(1000);
  check('协同重命名保留未落盘内容', renamed.status === 200 && (await req(`/api/projects/${pid}/file?path=renamed/note.tex`)).data?.content === 'before pending');
  check('重命名后旧路径不会复活', (await req(`/api/projects/${pid}/file?path=draft/note.tex`)).status === 404);
  draftWs.terminate();
  draft.destroy();
  const deletedDoc = new Y.Doc();
  const deletedWs = await openYjs(`${WS_BASE}/collab/${pid}::renamed/note.tex?token=${wsToken}`, deletedDoc);
  await req(`/api/projects/${pid}/file?path=renamed`, { method: 'DELETE' });
  await sleep(1000);
  check('协同删除后文件不会复活', (await req(`/api/projects/${pid}/file?path=renamed/note.tex`)).status === 404);
  deletedWs.terminate();
  deletedDoc.destroy();

  // Both main files exist before compiling: only the selected entry changes.
  await req(`/api/projects/${pid}/file`, { method: 'POST', body: JSON.stringify({ path: 'alternate.tex', content: '\\documentclass{article}\n\\begin{document}Alternate\\end{document}\n' }) });
  await req(`/api/projects/${pid}/compile`, { method: 'POST', body: JSON.stringify({ mainFile: 'main.tex' }) });
  const alternate = await req(`/api/projects/${pid}/compile`, { method: 'POST', body: JSON.stringify({ mainFile: 'alternate.tex' }) });
  check('切换主文件不复用错误 PDF 缓存', alternate.data?.ok && !alternate.data?.cached && alternate.data?.pdf?.includes('alternate.pdf'));

  // --- 错误诊断 ---
  await req(`/api/projects/${pid}/file?path=${rel}`, {
    method: 'PUT', body: JSON.stringify({ content: '\\documentclass{article}\n\\begin{document}\n\\undefinedcmd\n\\end{document}\n' }),
  });
  const broken = await req(`/api/projects/${pid}/compile`, { method: 'POST', body: JSON.stringify({ force: true }) });
  check('编译错误结构化输出', broken.data?.ok === false && broken.data?.errors?.length > 0,
    broken.data?.errors?.[0]?.message);

  // --- 宏包选项冲突（Option clash）诊断 / 检测 / 一键修复 ---
  // 构造真实冲突：自定义 .cls 先以 [prologue] 加载 xcolor，主文件再以 [table] 加载
  // 复刻 acmart 场景：文档类先以 [prologue] 加载 xcolor，主文件再以 [table] 加载
  // Use a classic package fixture: newer xcolor releases accept late options.
  await req(`/api/projects/${pid}/file`, {
    method: 'POST', body: JSON.stringify({
      path: 'xcolor.sty', type: 'file',
      content: '\\ProvidesPackage{xcolor}\n\\DeclareOption{prologue}{}\n\\DeclareOption{table}{}\n\\ProcessOptions\\relax\n\\endinput\n',
    }),
  });
  await req(`/api/projects/${pid}/file`, {
    method: 'POST', body: JSON.stringify({
      path: 'myclass.cls', type: 'file',
      content: '\\NeedsTeXFormat{LaTeX2e}\n\\ProvidesClass{myclass}\n\\LoadClass{article}\n\\RequirePackage[prologue]{xcolor}\n',
    }),
  });
  await req(`/api/projects/${pid}/file?path=${rel}`, {
    method: 'PUT', body: JSON.stringify({
      content: '\\documentclass{myclass}\n\\usepackage[table]{xcolor}\n\\begin{document}\nHi\n\\end{document}\n',
    }),
  });
  const clashCompile = await req(`/api/projects/${pid}/compile`, { method: 'POST', body: JSON.stringify({ force: true }) });
  const clashErr = (clashCompile.data?.errors || []).find((e) => e.code === 'option-clash');
  check('Option clash 编译报错被识别', clashCompile.data?.ok === false
    && (clashCompile.data?.errors || []).some((e) => /Option clash for package xcolor/i.test(e.message || '')),
    (clashCompile.data?.errors || [])[0]?.message || JSON.stringify({ ok: clashCompile.data?.ok, ms: clashCompile.data?.ms, log: clashCompile.data?.log?.slice(0, 1800) }));
  check('Option clash 带可操作建议', !!clashErr?.hint && clashErr.package === 'xcolor', clashErr?.package);

  const checked = await req(`/api/projects/${pid}/clashes`);
  check('静态检测接口发现 xcolor 冲突', checked.status === 200
    && checked.data?.clashes?.some((c) => c.pkg === 'xcolor'), JSON.stringify(checked.data?.clashes?.map((c) => c.pkg)));
  check('打开项目时返回 clashes', (await req(`/api/projects/${pid}`)).data?.clashes?.some((c) => c.pkg === 'xcolor') === true);

  // .cls 内部同一文件的条件分支不应被当成冲突（acmart.cls 的 libertine 就是这种）。
  // 用独立项目，避免引入本地引擎不存在的宏包而污染上面的真实编译。
  const branchProject = await req('/api/projects', {
    method: 'POST', body: JSON.stringify({ name: '分支误报检查', template: 'blank' }),
  });
  const bid = branchProject.data?.project?.id;
  createdProjects.push(bid);
  if (bid) {
    await req(`/api/projects/${bid}/file`, {
      method: 'POST', body: JSON.stringify({
        path: 'acmart.cls', type: 'file',
        content: '\\RequirePackage[prologue]{xcolor}\n\\RequirePackage[tt=false]{libertine}\n\\RequirePackage[tt=false,type1=true]{libertine}\n',
      }),
    });
    await req(`/api/projects/${bid}/file?path=main.tex`, {
      method: 'PUT', body: JSON.stringify({ content: '\\documentclass{article}\n\\usepackage[table]{xcolor}\n\\begin{document}\nHi\n\\end{document}\n' }),
    });
    const branchCheck = await req(`/api/projects/${bid}/clashes`);
    check('文档类内部条件分支不误报', branchCheck.data?.clashes?.length === 1
      && branchCheck.data.clashes[0].pkg === 'xcolor', JSON.stringify(branchCheck.data?.clashes?.map((c) => c.pkg)));
  }

  const fixed = await req(`/api/projects/${pid}/fix-clashes`, { method: 'POST', body: JSON.stringify({}) });
  check('一键修复返回 fixed', fixed.status === 200 && fixed.data?.fixed === true, String(fixed.data?.fixed));
  const mainAfter = await req(`/api/projects/${pid}/file?path=${rel}`);
  check('主文件已插入 PassOptionsToPackage', /\\PassOptionsToPackage\{[^}]*\}\{xcolor\}/.test(mainAfter.data?.content || ''), '');
  check('修复后静态检测不再报冲突', (await req(`/api/projects/${pid}/clashes`)).data?.clashes?.length === 0);
  const fixedAgain = await req(`/api/projects/${pid}/fix-clashes`, { method: 'POST', body: JSON.stringify({}) });
  check('修复接口幂等（重复调用不再改动）', fixedAgain.data?.fixed === false, String(fixedAgain.data?.fixed));
  const recompiled = await req(`/api/projects/${pid}/compile`, { method: 'POST', body: JSON.stringify({ force: true }) });
  check('修复后编译通过', recompiled.data?.ok === true, recompiled.data?.errors?.[0]?.message || recompiled.data?.engine);

  // --- unicode-math 下的粗体希腊字母（Improper alphabetic constant）---
  // 用独立项目，避免上面的自定义 myclass.cls 影响编译
  const ubProject = await req('/api/projects', {
    method: 'POST', body: JSON.stringify({ name: 'unicode-math 粗体检查', template: 'blank' }),
  });
  const uid = ubProject.data?.project?.id;
  createdProjects.push(uid);
  if (uid) {
    await req(`/api/projects/${uid}/file?path=main.tex`, {
      method: 'PUT', body: JSON.stringify({
        content: '\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{bm}\n\\begin{document}\n$\\boldsymbol{\\Phi}(c)$ and $\\bm{\\theta}$\n% \\boldsymbol{\\Phi} in comment\n\\end{document}\n',
      }),
    });
    const ubCheck = await req(`/api/projects/${uid}/clashes`);
    check('静态检测发现粗体希腊字母', ubCheck.data?.boldGreek?.length === 2,
      JSON.stringify(ubCheck.data?.boldGreek?.map((b) => b.greek)));
    check('打开项目时返回 issues', (await req(`/api/projects/${uid}`)).data?.issues?.some((i) => i.code === 'unicode-math-bold') === true);
    const ubFix = await req(`/api/projects/${uid}/fix-clashes`, { method: 'POST', body: JSON.stringify({}) });
    check('一键修复粗体希腊字母', ubFix.data?.fixed === true && /\\symbf/.test(ubFix.data?.warning || ''), ubFix.data?.warning);
    const ubMain = await req(`/api/projects/${uid}/file?path=main.tex`);
    const ubText = String(ubMain.data?.content || '');
    check('正文已改为 \\symbf', /\\symbf\{\\Phi\}/.test(ubText) && /\\symbf\{\\theta\}/.test(ubText));
    check('加了 \\providecommand 兜底', /\\providecommand\{\\symbf\}/.test(ubText));
    check('注释里的 \\boldsymbol 保持原样', /% \\boldsymbol\{\\Phi\} in comment/.test(ubText));
    check('修复后静态检测无问题', (await req(`/api/projects/${uid}/clashes`)).data?.issues?.length === 0);
    check('粗体修复接口幂等', (await req(`/api/projects/${uid}/fix-clashes`, { method: 'POST', body: JSON.stringify({}) })).data?.fixed === false);
  }

  // --- 账号审批与项目私有性 ---
  const editorEmail = `smoke-editor-${Date.now()}@example.com`;
  const editorPassword = 'test123456';
  const reg = await req('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ email: editorEmail, name: '测试编辑者', password: editorPassword }),
  });
  check('注册接口创建新账号', (reg.status === 200 || reg.status === 201) && !!reg.data?.user, `HTTP ${reg.status}`);

  let guestCookie = '';
  let editorId = reg.data?.user?.id || null;
  let adminCookie = '';
  let rejectId = null;
  if (reg.data?.pending) {
    // 需要管理员审批：先确认拦得住，再走完整审批闭环
    cookie = '';
    const blocked = await req('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email: editorEmail, password: editorPassword }),
    });
    check('待审批账号无法登录', blocked.status === 403, blocked.data?.error);

    cookie = '';
    const adminLogin = await req('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    if (adminLogin.status !== 200) {
      throw new Error(`需要管理员凭据才能完成审批流程测试，请用 ADMIN_PASSWORD=<管理员密码> npm test 重跑（当前 ${ADMIN_EMAIL}）`);
    }
    adminCookie = cookie;
    const pendingList = await req('/api/admin/users?status=pending');
    const target = pendingList.data?.users?.find((u) => u.email === editorEmail);
    check('管理员可读取待审批列表', pendingList.status === 200 && !!target, `pending=${pendingList.data?.counts?.pending}`);
    editorId = target?.id || null;

    const approved = await req(`/api/admin/users/${target?.id}/review`, {
      method: 'POST', body: JSON.stringify({ status: 'active' }),
    });
    check('管理员通过审批', approved.status === 200 && approved.data?.user?.status === 'active');

    cookie = '';
    const afterApproval = await req('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email: editorEmail, password: editorPassword }),
    });
    check('审批通过后可正常登录', afterApproval.status === 200 && !!afterApproval.data?.user);
    guestCookie = cookie;

    // 普通账号不能碰管理接口
    const forbidden = await req('/api/admin/users');
    check('普通账号访问管理接口被拒绝', forbidden.status === 403, `HTTP ${forbidden.status}`);

    // 拒绝流程
    const rejectEmail = `smoke-reject-${Date.now()}@example.com`;
    cookie = '';
    await req('/api/auth/register', {
      method: 'POST', body: JSON.stringify({ email: rejectEmail, name: '待拒绝', password: 'test123456' }),
    });
    cookie = adminCookie;
    const rejectTarget = (await req('/api/admin/users?status=pending')).data?.users
      ?.find((u) => u.email === rejectEmail);
    rejectId = rejectTarget?.id || null;
    await req(`/api/admin/users/${rejectTarget?.id}/review`, {
      method: 'POST', body: JSON.stringify({ status: 'rejected' }),
    });
    cookie = '';
    const rejected = await req('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email: rejectEmail, password: 'test123456' }),
    });
    check('被拒绝的账号无法登录', rejected.status === 403, rejected.data?.error);

    cookie = adminCookie;
    const removed = await req(`/api/admin/users/${rejectId}`, { method: 'DELETE' });
    check('管理员可删除账号', removed.status === 200);
    if (removed.status === 200) rejectId = null;
  } else {
    guestCookie = cookie;
  }

  // --- 开放注册开关（管理员后台，可动态切换） ---
  cookie = adminCookie;
  const settingsBefore = await req('/api/admin/settings');
  check('管理员可读取注册设置', settingsBefore.status === 200
    && typeof settingsBefore.data?.openRegistration === 'boolean', JSON.stringify(settingsBefore.data?.source));
  check('非管理员读取注册设置被拒绝', (await (async () => {
    const saved = cookie; cookie = guestCookie;
    const r = await req('/api/admin/settings'); cookie = saved; return r;
  })()).status === 403);
  check('设置参数类型校验', (await req('/api/admin/settings', {
    method: 'PUT', body: JSON.stringify({ openRegistration: 'yes' }),
  })).status === 400);
  const resetRes = await req('/api/admin/settings', {
    method: 'PUT', body: JSON.stringify({ openRegistration: null }),
  });
  check('可恢复服务端默认设置', resetRes.status === 200
    && ['default', 'env'].includes(resetRes.data?.source)
    && resetRes.data?.openRegistration === settingsBefore.data?.openRegistration,
  `${resetRes.data?.source} / ${resetRes.data?.openRegistration}`);

  const openRes = await req('/api/admin/settings', {
    method: 'PUT', body: JSON.stringify({ openRegistration: true }),
  });
  check('管理员可开启开放注册', openRes.status === 200 && openRes.data?.openRegistration === true,
    openRes.data?.message);
  check('开放注册后 config 同步', (await req('/api/auth/config')).data?.approvalRequired === false);

  const openEmail = `smoke-open-${Date.now()}@example.com`;
  cookie = '';
  const openReg = await req('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ email: openEmail, name: '开放注册', password: 'TestPass2026x' }),
  });
  check('开放注册时新账号直接激活', openReg.status === 200 && openReg.data?.user?.status === 'active' && !openReg.data?.pending,
    `HTTP ${openReg.status}`);
  const openLogin = await req('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: openEmail, password: 'TestPass2026x' }),
  });
  check('开放注册账号无需审批即可登录', openLogin.status === 200 && !!openLogin.data?.user, String(openLogin.status));

  cookie = adminCookie;
  const openUserId = (await req('/api/admin/users?status=active')).data?.users?.find((u) => u.email === openEmail)?.id;
  check('开放注册后管理员仍能停用账号', !!openUserId && (await req(`/api/admin/users/${openUserId}/disabled`, {
    method: 'POST', body: JSON.stringify({ disabled: true }),
  })).status === 200);
  check('停用后账号无法登录', (await (async () => {
    const saved = cookie; cookie = '';
    const r = await req('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ email: openEmail, password: 'TestPass2026x' }),
    }); cookie = saved; return r;
  })()).status === 403);
  check('开放注册后管理员仍能删除账号', (await req(`/api/admin/users/${openUserId}`, { method: 'DELETE' })).status === 200);

  const closeRes = await req('/api/admin/settings', {
    method: 'PUT', body: JSON.stringify({ openRegistration: false }),
  });
  check('管理员可恢复注册审批', closeRes.status === 200 && closeRes.data?.approvalRequired === true,
    closeRes.data?.message);
  cookie = '';
  const pendingEmail = `smoke-closed-${Date.now()}@example.com`;
  const afterClose = await req('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ email: pendingEmail, name: '恢复审批', password: 'TestPass2026x' }),
  });
  check('恢复审批后新账号回到待审批', afterClose.status === 201 && afterClose.data?.pending === true,
    `HTTP ${afterClose.status}`);

  // 开启开放注册时应把此前卡住的待审批账号一并放行
  cookie = adminCookie;
  const reopen = await req('/api/admin/settings', {
    method: 'PUT', body: JSON.stringify({ openRegistration: true }),
  });
  check('开启时放行已有待审批账号', reopen.status === 200 && reopen.data?.approvedPending >= 1,
    `放行 ${reopen.data?.approvedPending} 个`);
  check('放行后待审批数量归零', reopen.data?.pendingCount === 0, String(reopen.data?.pendingCount));
  cookie = '';
  const released = await req('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email: pendingEmail, password: 'TestPass2026x' }),
  });
  check('被放行的账号可登录', released.status === 200, String(released.status));
  cookie = adminCookie;
  const releasedId = (await req('/api/admin/users?status=active')).data?.users?.find((u) => u.email === pendingEmail)?.id;
  if (releasedId) await req(`/api/admin/users/${releasedId}`, { method: 'DELETE' });
  // 还原为服务端默认（清除后台设置），避免污染后续断言与真实部署
  await req('/api/admin/settings', {
    method: 'PUT', body: JSON.stringify({ openRegistration: null }),
  });

  cookie = guestCookie;
  const ownProjects = (await req('/api/projects')).data?.projects || [];
  check('新账号项目列表为空（账号间隔离）', ownProjects.length === 0, `${ownProjects.length} 个`);

  const leaks = [];
  for (const [label, path, opts] of [
    ['详情', `/api/projects/${pid}`, {}],
    ['文件树', `/api/projects/${pid}/tree`, {}],
    ['文件内容', `/api/projects/${pid}/file?path=main.tex`, {}],
    ['版本历史', `/api/projects/${pid}/versions?path=main.tex`, {}],
    ['事件通道', `/api/projects/${pid}/events`, {}],
    ['编译', `/api/projects/${pid}/compile`, { method: 'POST', body: '{}' }],
    ['PDF', `/api/projects/${pid}/pdf?file=main.pdf`, {}],
    ['评论列表', `/api/projects/${pid}/comments`, {}],
    ['新建评论', `/api/projects/${pid}/comments`, { method: 'POST', body: '{}' }],
  ]) {
    const r = await req(path, opts);
    if (r.status !== 403) leaks.push(`${label}:${r.status}`);
  }
  check('非成员无法访问项目任何数据与接口', leaks.length === 0, leaks.join(','));

  const guestWSToken = (await req('/api/auth/ws-token')).data?.token || '';
  check('非成员无法建立协同 WebSocket',
    (await wsAccess(`${WS_BASE}/collab/${pid}::main.tex?token=${encodeURIComponent(guestWSToken)}`)) === 'denied');
  check('非成员无法建立事件 WebSocket',
    (await wsAccess(`${WS_BASE}/events/${pid}?token=${encodeURIComponent(guestWSToken)}`)) === 'denied');

  cookie = ownerCookie;
  check('邀请协作者', (await req(`/api/projects/${pid}/members`, {
    method: 'POST', body: JSON.stringify({ email: editorEmail }),
  })).status === 200);
  const sharedProject = (await req(`/api/projects/${pid}`)).data?.project;
  check('分享后标记成员数', sharedProject?.memberCount === 2, `memberCount=${sharedProject?.memberCount}`);

  cookie = guestCookie;
  check('分享后成员可见项目', (await req(`/api/projects/${pid}`)).status === 200);
  check('分享后成员可读取文件', (await req(`/api/projects/${pid}/file?path=main.tex`)).status === 200);
  check('编辑者不可删除项目', (await req(`/api/projects/${pid}`, { method: 'DELETE' })).status === 403);

  // --- 协作评论：源码选区 + PDF 圈选 + 跨成员回复 ---
  const cBase = `/api/projects/${pid}/comments`;
  check('评论列表初始为空', (await req(cBase)).data?.comments?.length === 0);
  check('空内容被拒绝', (await req(cBase, {
    method: 'POST', body: JSON.stringify({ body: '  ', anchorType: 'source', path: 'main.tex', from: 1, to: 5 }),
  })).status === 400);
  check('无效选区被拒绝', (await req(cBase, {
    method: 'POST', body: JSON.stringify({ body: '没选区', anchorType: 'source', path: 'main.tex', from: 5, to: 2 }),
  })).status === 400);
  check('路径穿越被拒绝', (await req(cBase, {
    method: 'POST', body: JSON.stringify({ body: '越界', anchorType: 'source', path: '../../app.db', from: 1, to: 5 }),
  })).status === 400);
  check('PDF 锚点缺页码被拒绝', (await req(cBase, {
    method: 'POST', body: JSON.stringify({ body: '无页码', anchorType: 'pdf', rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }),
  })).status === 400);

  const srcComment = await req(cBase, {
    method: 'POST', body: JSON.stringify({
      body: '这段公式请复核', anchorType: 'source', path: 'main.tex',
      from: 2, to: 18, quote: 'documentclass',
    }),
  });
  const cid = srcComment.data?.comment?.id;
  check('协作者可添加源码评论', srcComment.status === 201 && !!cid
    && srcComment.data?.comment?.path === 'main.tex' && srcComment.data?.comment?.from === 2, `HTTP ${srcComment.status}`);

  const pdfComment = await req(cBase, {
    method: 'POST', body: JSON.stringify({
      body: '这个区域配色建议调整', anchorType: 'pdf', page: 2,
      rect: { x: 0.12, y: 0.3, w: 0.4, h: 0.15 },
    }),
  });
  check('协作者可添加 PDF 圈选评论', pdfComment.status === 201
    && pdfComment.data?.comment?.page === 2
    && Math.abs(pdfComment.data?.comment?.rect?.w - 0.4) < 1e-6,
  JSON.stringify(pdfComment.data?.comment?.rect));

  // 所有者回复协作者的评论
  cookie = ownerCookie;
  const replied = await req(`${cBase}/${cid}/replies`, {
    method: 'POST', body: JSON.stringify({ body: '收到，我来改' }),
  });
  check('跨成员可以回复评论', replied.status === 201
    && replied.data?.comment?.replies?.[0]?.body === '收到，我来改', `HTTP ${replied.status}`);
  const listed = await req(cBase);
  check('评论列表带作者与回复', listed.data?.comments?.length === 2
    && listed.data.comments.find((c) => c.id === cid)?.replies?.length === 1
    && !!listed.data.comments.find((c) => c.id === cid)?.authorName, '');

  const resolved = await req(`${cBase}/${cid}`, { method: 'PATCH', body: JSON.stringify({ resolved: true }) });
  check('可标记已解决', resolved.data?.comment?.resolved === true);
  check('非布尔 resolved 被拒绝', (await req(`${cBase}/${cid}`, {
    method: 'PATCH', body: JSON.stringify({ resolved: 'yes' }),
  })).status === 400);
  await req(`${cBase}/${cid}`, { method: 'PATCH', body: JSON.stringify({ resolved: false }) });

  // 权限边界：用所有者创建的评论来验证「不能删别人的」
  const ownerCid = (await req(cBase, {
    method: 'POST', body: JSON.stringify({
      body: '所有者补充', anchorType: 'source', path: 'main.tex', from: 1, to: 6, quote: 'docum',
    }),
  })).data?.comment?.id;
  cookie = guestCookie;
  check('协作者不能删除他人评论', (await req(`${cBase}/${ownerCid}`, { method: 'DELETE' })).status === 403);
  check('协作者可删除自己的评论', (await req(`${cBase}/${cid}`, { method: 'DELETE' })).status === 200);
  check('删除评论级联删除回复', (await req(cBase)).data?.comments?.find((c) => c.id === cid) === undefined);
  cookie = ownerCookie;
  check('所有者可删除任意评论', (await req(`${cBase}/${ownerCid}`, { method: 'DELETE' })).status === 200);
  check('删除后只剩 PDF 圈选评论', (await req(cBase)).data?.comments?.length === 1);
  check('不存在的评论返回 404', (await req(`${cBase}/no-such-id`, {
    method: 'PATCH', body: JSON.stringify({ resolved: true }),
  })).status === 404);

  cookie = ownerCookie;
  check('移除协作者', (await req(`/api/projects/${pid}/members/${editorId}`, { method: 'DELETE' })).status === 200);
  cookie = guestCookie;
  check('移除后立即失去访问权', (await req(`/api/projects/${pid}`)).status === 403);
  cookie = ownerCookie;

  // --- ZIP 往返 ---
  const zipRes = await fetch(`${BASE}/api/projects/${pid}/download`, { headers: { cookie } });
  const zipBuf = Buffer.from(await zipRes.arrayBuffer());
  check('导出 ZIP', zipRes.status === 200 && zipBuf.subarray(0, 2).toString() === 'PK', `${zipBuf.length} B`);
  const fd2 = new FormData();
  fd2.append('file', new Blob([zipBuf]), 'smoke-import.zip');
  fd2.append('name', 'smoke-import-named');
  const imported = await req('/api/projects/import', { method: 'POST', body: fd2 });
  createdProjects.push(imported.data?.project?.id);
  check('导入 ZIP 新建项目', imported.status === 200 && !!imported.data?.project?.id);
  check('导入支持自定义项目名', imported.data?.project?.name === 'smoke-import-named', imported.data?.project?.name);
  check('导入返回文件数', imported.data?.files >= 1, String(imported.data?.files));
  if (imported.data?.project?.id) {
    const iid = imported.data.project.id;
    const detail = await req(`/api/projects/${iid}`);
    check('导入后主文件为 main.tex', detail.data?.project?.mainFile === 'main.tex', detail.data?.project?.mainFile);
    const f = await req(`/api/projects/${iid}/file?path=${encodeURIComponent('中文文件.tex')}`);
    check('导入后中文名文件内容一致', f.status === 200 && f.data?.content?.includes('上传'), String(f.status));
  }

  // --- 迁移场景：顶层目录 + 没有 main.tex ---
  const migrate = new AdmZip();
  migrate.addFile('my-paper-main/paper.tex', Buffer.from('\\documentclass{article}\n\\begin{document}\nMigrated\n\\end{document}\n'));
  migrate.addFile('my-paper-main/sections/intro.tex', Buffer.from('\\section{Intro}\n'));
  migrate.addFile('my-paper-main/../evil.tex', Buffer.from('should be dropped'));
  const fd3 = new FormData();
  fd3.append('file', new Blob([migrate.toBuffer()]), 'my-paper-main.zip');
  const migrated = await req('/api/projects/import', { method: 'POST', body: fd3 });
  const mid = migrated.data?.project?.id;
  createdProjects.push(mid);
  check('GitHub 形态 ZIP 导入成功', migrated.status === 200 && !!mid);
  if (mid) {
    const d = await req(`/api/projects/${mid}`);
    check('顶层目录已剥离', JSON.stringify(d.data?.tree || []).includes('"paper.tex"') && !JSON.stringify(d.data?.tree || []).includes('my-paper-main'), '');
    check('自动识别主文件 paper.tex', d.data?.project?.mainFile === 'paper.tex', d.data?.project?.mainFile);
    const nested = await req(`/api/projects/${mid}/file?path=${encodeURIComponent('sections/intro.tex')}`);
    check('子目录文件完整导入', nested.status === 200 && nested.data?.content?.includes('Intro'), String(nested.status));
  }

  // --- 导入含 Option clash 的项目：应自动修复 ---
  const clashZip = new AdmZip();
  clashZip.addFile('repo-main/acmart.cls', Buffer.from('\\RequirePackage[prologue]{xcolor}\n'));
  clashZip.addFile('repo-main/main.tex', Buffer.from('\\documentclass{article}\n\\usepackage[table]{xcolor}\n\\begin{document}\nHi\n\\end{document}\n'));
  const fd4 = new FormData();
  fd4.append('file', new Blob([clashZip.toBuffer()]), 'repo-main.zip');
  const autoFixed = await req('/api/projects/import', { method: 'POST', body: fd4 });
  const aid = autoFixed.data?.project?.id;
  createdProjects.push(aid);
  check('导入含冲突项目仍成功', autoFixed.status === 200 && !!aid);
  check('导入时自动修复并给出 warning', /PassOptionsToPackage/.test(autoFixed.data?.warning || '')
    && autoFixed.data?.clashes?.some((c) => c.pkg === 'xcolor' && c.fixed), autoFixed.data?.warning);
  if (aid) {
    const amain = await req(`/api/projects/${aid}/file?path=main.tex`);
    check('导入后主文件含 PassOptionsToPackage', /\\PassOptionsToPackage\{[^}]*\}\{xcolor\}/.test(amain.data?.content || ''), '');
    check('导入后静态检测无冲突', (await req(`/api/projects/${aid}/clashes`)).data?.clashes?.length === 0);
  }

  // 真实踩过的坑：主文件由两份文档拼接，旧修复块落在第二份前，对第一份无效。
  // 修复必须清掉错位块并插到第一个 \documentclass 之前。
  const dupZip = new AdmZip();
  const doc = (tag) => `%% note\n\\documentclass[sigconf]{acmart}\n\\usepackage[table]{xcolor}\n\\begin{document}\n${tag}\n\\end{document}\n`;
  const stale = '% LaTeXStudio: 预先声明宏包选项，避免 Option clash（可安全删除）\n\\PassOptionsToPackage{prologue,table}{xcolor}\n';
  dupZip.addFile('dup/acmart.cls', Buffer.from('\\RequirePackage[prologue]{xcolor}\n'));
  dupZip.addFile('dup/main.tex', Buffer.from(doc('FIRST') + '\n' + stale + doc('SECOND')));
  const fd5 = new FormData();
  fd5.append('file', new Blob([dupZip.toBuffer()]), 'dup.zip');
  const dupImported = await req('/api/projects/import', { method: 'POST', body: fd5 });
  const did = dupImported.data?.project?.id;
  createdProjects.push(did);
  if (did) {
    const dm = await req(`/api/projects/${did}/file?path=main.tex`);
    const dl = String(dm.data?.content || '').split('\n');
    const firstPass = dl.findIndex((l) => l.includes('PassOptionsToPackage'));
    const firstDoc = dl.findIndex((l) => /^\\documentclass/.test(l));
    check('拼接文档：声明位于第一份 documentclass 之前', firstPass >= 0 && firstPass < firstDoc, `${firstPass} < ${firstDoc}`);
    check('拼接文档：兼容旧品牌且修复块只剩一份', dl.filter((l) => /LaTeXStudio:|underoot:/.test(l)).length === 1);
    check('拼接文档：修复后无冲突', (await req(`/api/projects/${did}/clashes`)).data?.clashes?.length === 0);
  }

  // --- 非法输入 ---
  const badZip = new FormData();
  badZip.append('file', new Blob(['not a zip']), 'bad.zip');
  check('非 ZIP 文件被拒绝', (await req('/api/projects/import', { method: 'POST', body: badZip })).status === 400);
  check('GitHub 非白名单域名被拒绝', (await req('/api/projects/from-github', {
    method: 'POST', body: JSON.stringify({ url: 'https://evil.example.com/a/b' }),
  })).status === 400);
  check('GitHub 内网地址被拒绝', (await req('/api/projects/from-github', {
    method: 'POST', body: JSON.stringify({ url: 'http://127.0.0.1:3000/' }),
  })).status === 400);
  check('GitHub 空链接被拒绝', (await req('/api/projects/from-github', {
    method: 'POST', body: JSON.stringify({}),
  })).status === 400);

  // --- 清理 ---
  for (const id of createdProjects.filter(Boolean)) {
    await req(`/api/projects/${id}`, { method: 'DELETE' });
  }
  // 删掉本次注册的测试账号，避免数据库里堆积垃圾账号
  if (adminCookie) {
    const saved = cookie;
    cookie = adminCookie;
    for (const accountId of [editorId, rejectId].filter(Boolean)) {
      await req(`/api/admin/users/${accountId}`, { method: 'DELETE' });
    }
    cookie = saved;
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n结果：${results.length - failed.length}/${results.length} 项通过`);
  if (failed.length) {
    console.log('失败项：' + failed.map((f) => f.name).join('、'));
    process.exit(1);
  }
  console.log('全部通过 ✓\n');
}

main().catch((err) => {
  console.error('\n测试异常：', err);
  process.exit(1);
});
