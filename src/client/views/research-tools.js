import { EditorView } from '@codemirror/view';
import { api } from '../api.js';
import { modal, toast, escapeHtml as e, confirmDialog, promptDialog, timeAgo } from '../ui.js';

export function navigateProject(id, options = {}) {
  const params = new URLSearchParams(options);
  location.hash = `#/p/${id}${params.size ? '?' + params : ''}`;
}

export async function openAiSettings(user) {
  try {
    if (user.role !== 'admin') {
      const status = await api.get('/api/workspace/ai/status');
      modal({ title: 'AI 服务', bodyHtml: `<p>${status.configured ? `当前模型：${e(status.model)}` : '管理员尚未配置模型 API。'}</p><p class="src-note">本地检查不需要 API；模型分析由作者主动开启。请联系管理员修改模型配置。</p>` });
      return;
    }
    const config = await api.get('/api/workspace/ai/config');
    const { root: m, close } = modal({ title: 'AI API 配置', subtitle: 'OpenAI 兼容接口 · 仅管理员可修改',
      bodyHtml: `<div class="field"><label for="ai-url">API Base URL</label><input class="input" id="ai-url" placeholder="https://api.example.com/v1" value="${e(config.baseUrl)}" /></div>
        <div class="field"><label for="ai-model">模型名称</label><input class="input" id="ai-model" placeholder="填写服务商提供的精确模型名称" value="${e(config.model)}" /></div>
        <div class="field"><label for="ai-key">API Key ${config.hasKey ? '（已配置；留空保留）' : ''}</label><input class="input" type="password" id="ai-key" autocomplete="off" placeholder="密钥仅加密保存在服务器，保存后不回显" /></div>
        <label class="research-check"><input type="checkbox" id="ai-vision" ${config.vision ? 'checked' : ''} />该模型支持图片输入</label>
        <label class="research-check"><input type="checkbox" id="ai-clear-key" />清除已保存密钥</label>
        <p class="src-note">Base URL 通常以 /v1 结尾，也可填写完整 /chat/completions 地址。更换地址时请重新填写密钥。先保存，再测试连接。</p><div id="ai-test-result" role="status"></div>`,
      footerHtml: '<button class="btn" id="ai-test">测试连接</button><button class="btn" id="ai-close">关闭</button><button class="btn btn-primary" id="ai-save">保存配置</button>',
    });
    m.querySelector('#ai-close').onclick = close;
    m.querySelector('#ai-save').onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await api.put('/api/workspace/ai/config', { baseUrl: m.querySelector('#ai-url').value.trim(), model: m.querySelector('#ai-model').value.trim(),
          apiKey: m.querySelector('#ai-clear-key').checked ? null : m.querySelector('#ai-key').value, vision: m.querySelector('#ai-vision').checked });
        m.querySelector('#ai-key').value = '';
        m.querySelector('#ai-test-result').textContent = '配置已保存，密钥不会回显。';
        toast('AI 配置已保存', 'ok');
      } catch (error) { toast(error.message, 'err'); }
      finally { button.disabled = false; }
    };
    m.querySelector('#ai-test').onclick = async (event) => {
      const button = event.currentTarget; button.disabled = true;
      m.querySelector('#ai-test-result').textContent = '正在测试已保存的配置…';
      try { const result = await api.post('/api/workspace/ai/test'); m.querySelector('#ai-test-result').textContent = `连接成功：${result.model}`; }
      catch (error) { m.querySelector('#ai-test-result').textContent = error.message; }
      finally { button.disabled = false; }
    };
  } catch (error) { toast(error.message, 'err'); }
}

export function openWorkspaceSearch() {
  const { root: m, close } = modal({ title: '跨项目搜索', subtitle: '检索你有权限访问的项目、正文、BibTeX 与讨论', wide: true,
    bodyHtml: `<div class="research-search"><input class="input" id="workspace-query" placeholder="输入术语、引用键、图注或评论内容…" /><select class="input" id="workspace-type"><option value="all">全部内容</option><option value="tex">LaTeX 正文</option><option value="bib">参考文献</option><option value="comments">评论与回复</option><option value="name">项目名称</option></select></div><div id="workspace-results" class="workspace-results">至少输入两个字符</div>`,
  });
  const input = m.querySelector('#workspace-query');
  let timer; let token = 0;
  const search = async () => {
    const request = ++token;
    const query = input.value.trim();
    if (query.length < 2) { m.querySelector('#workspace-results').textContent = '至少输入两个字符'; return; }
    try {
      const data = await api.get(`/api/workspace/search?q=${encodeURIComponent(query)}&type=${m.querySelector('#workspace-type').value}`);
      if (request !== token || !m.isConnected) return;
      m.querySelector('#workspace-results').innerHTML = data.results.length ? data.results.map((r, i) => `<button class="workspace-result" data-result="${i}"><b>${e(r.projectName)}</b><span>${e(r.path)} · ${r.kind === 'comment' ? '评论' : '第 ' + r.line + ' 行'}</span><pre>${e(r.snippet)}</pre></button>`).join('') + (data.truncated ? '<p class="src-note">结果已截断，请缩小搜索范围。</p>' : '') : '<p class="src-note">没有匹配结果</p>';
      m.querySelectorAll('[data-result]').forEach((button) => { button.onclick = () => {
        const r = data.results[Number(button.dataset.result)]; close();
        navigateProject(r.projectId, { file: r.path, line: String(r.line), ...(r.commentId ? { comment: r.commentId } : {}) });
      }; });
    } catch (error) { if (request === token) m.querySelector('#workspace-results').textContent = error.message; }
  };
  input.oninput = () => { clearTimeout(timer); timer = setTimeout(search, 300); };
  input.onkeydown = (event) => { if (event.key === 'Enter') { clearTimeout(timer); search(); } };
  m.querySelector('#workspace-type').onchange = search;
  input.focus();
}

export async function openNotifications() {
  try {
    const data = await api.get('/api/workspace/notifications');
    const { root: m, close } = modal({ title: '与我有关的讨论', wide: true,
      bodyHtml: `<p class="src-note">评论指派、@邮箱提醒，以及你参与过的讨论的新回复。</p><div class="workspace-results">${data.notifications.length ? data.notifications.map((n, i) => `<button class="workspace-result ${n.is_read ? '' : 'unread'}" data-notice="${i}"><b>${e(n.project_name)} ${n.is_read ? '' : '· 未读'}</b><pre>${e(n.message)}</pre><span>${timeAgo(n.created_at)}</span></button>`).join('') : '<p>暂无通知</p>'}</div>`,
      footerHtml: '<button class="btn" id="notices-read">全部标为已读</button><button class="btn" id="notices-close">关闭</button>',
    });
    m.querySelector('#notices-close').onclick = close;
    m.querySelector('#notices-read').onclick = async () => { await api.post('/api/workspace/notifications/read'); close(); };
    m.querySelectorAll('[data-notice]').forEach((button) => { button.onclick = async () => {
      const n = data.notifications[Number(button.dataset.notice)];
      await api.post('/api/workspace/notifications/read', { id: n.id }); close(); navigateProject(n.project_id, { comment: n.comment_id });
    }; });
  } catch (error) { toast(error.message, 'err'); }
}

function diffMarkup(before, after) {
  const a = before.split('\n'); const b = after.split('\n');
  let start = 0; let end = 0;
  while (start < Math.min(a.length, b.length) && a[start] === b[start]) start++;
  while (end < Math.min(a.length, b.length) - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const lines = [
    ...a.slice(Math.max(0, start - 3), start).map((line) => `<span> ${e(line)}</span>`),
    ...a.slice(start, a.length - end).slice(0, 200).map((line) => `<span class="diff-removed">−${e(line)}</span>`),
    ...b.slice(start, b.length - end).slice(0, 200).map((line) => `<span class="diff-added">+${e(line)}</span>`),
    ...b.slice(b.length - end, b.length - end + 3).map((line) => `<span> ${e(line)}</span>`),
  ];
  return `<pre class="revision-diff">${lines.join('')}</pre>${a.length - start - end > 200 || b.length - start - end > 200 ? '<p class="src-note">差异较长，仅展示前 200 行变化。</p>' : ''}`;
}

export function createResearchTools({ root, project, user, view, pdfViewer, getActivePath, openFile, compile, onOpen, assistantEnabled = true }) {
  const base = `/api/workspace/projects/${project.id}`;
  const panel = root.querySelector('#assistant-panel');
  const editable = ['owner', 'editor'].includes(project.role);
  const canReview = project.role !== 'viewer';
  let items = []; let opened = false; let destroyed = false; let busy = false; let timer;
  let filter = 'pending'; let category = 'all'; let aiStatus = { configured: false };
  let focus = ''; let selectedRegion = null; let automaticModel = false;
  const localAutoKey = `ls.assistant.auto.${user.id}.${project.id}`;
  let automaticLocal = localStorage.getItem(localAutoKey) !== '0';
  const roleLabel = { owner: '所有者', editor: '编辑者', reviewer: '审阅者', viewer: '只读成员' };

  async function refresh() {
    if (destroyed) return;
    const [data, status] = await Promise.all([api.get(`${base}/suggestions`), api.get('/api/workspace/ai/status')]);
    if (destroyed) return;
    items = data.suggestions; aiStatus = status;
    if (opened) paint();
    const count = items.filter((item) => item.status === 'pending' && !item.stale).length;
    root.querySelector('#btn-assistant')?.setAttribute('title', `论文助手 · ${count} 条待处理建议`);
  }
  function open() { opened = true; onOpen?.(); panel.classList.add('open'); paint(); refresh().catch((error) => toast(error.message, 'err')); }
  function close() { opened = false; panel.classList.remove('open'); }
  function paint() {
    const shown = items.filter((s) => (filter === 'all' || (filter === 'stale' && s.stale) || (s.status === filter && (filter !== 'pending' || !s.stale))) && (category === 'all' || s.category === category));
    panel.innerHTML = `<div class="comments-head"><b>${assistantEnabled ? '论文助手' : '修改建议中心'}</b><div class="spacer"></div><button class="btn btn-sm" id="assistant-config">API 配置</button><button class="btn btn-ghost btn-sm" id="assistant-close">×</button></div>
      <div class="assistant-controls" ${assistantEnabled ? '' : 'hidden'}><div class="src-note">${aiStatus.configured ? `模型：${e(aiStatus.model)}` : '尚未配置 API；本地检查可直接使用'} · ${roleLabel[project.role] || ''}</div>
      <textarea class="input" id="assistant-focus" rows="2" placeholder="例如：检查结论是否过度推断；图 2 与正文的说法是否一致…">${e(focus)}</textarea>
      <div class="assistant-buttons"><button class="btn btn-sm" id="assistant-local" ${!canReview || busy ? 'disabled' : ''}>本地检查</button><button class="btn btn-primary btn-sm" id="assistant-ai" ${!canReview || busy || !aiStatus.configured ? 'disabled' : ''}>${busy ? '检查中…' : 'AI 检查'}</button><button class="btn btn-sm" id="assistant-selection" ${!canReview || busy ? 'disabled' : ''}>选区建议</button><button class="btn btn-sm" id="assistant-literature" ${!canReview || busy ? 'disabled' : ''}>查找文献</button></div>
      <label class="research-check"><input type="checkbox" id="assistant-auto" ${automaticLocal ? 'checked' : ''} ${!canReview ? 'disabled' : ''} />编辑后自动本地检查</label>
      <label class="research-check"><input type="checkbox" id="assistant-auto-ai" ${automaticModel ? 'checked' : ''} ${!canReview || !aiStatus.configured ? 'disabled' : ''} />自动 AI 建议（会发送稿件）</label>
      <label class="research-check"><input type="checkbox" id="assistant-images" ${aiStatus.vision ? '' : 'disabled'} />向视觉模型发送圈选截图及项目插图</label>
      ${selectedRegion ? `<p class="assistant-region">已圈选 PDF 第 ${selectedRegion.page} 页 <button class="btn btn-ghost btn-sm" id="assistant-clear-region">清除</button></p>` : ''}
      <div class="research-search"><select class="input" id="assistant-filter"><option value="pending">当前待处理</option><option value="all">全部建议</option><option value="accepted">已接受</option><option value="rejected">已拒绝</option><option value="stale">原文已变化</option></select><select class="input" id="assistant-category"><option value="all">所有类型</option><option value="language">语言</option><option value="writing">论述</option><option value="citation">引用</option><option value="figure">插图</option><option value="consistency">一致性</option></select></div></div>
      <div class="assistant-list">${shown.length ? shown.map((s) => `<article class="assistant-card" data-suggestion="${s.id}"><button class="assistant-location" data-locate="${s.id}"><b>${e(s.title)}</b><span>${e(s.path)}${s.pdf ? ` · PDF 第 ${s.pdf.page} 页` : ''} · ${s.source === 'model' ? 'AI' : s.source === 'crossref' ? 'Crossref' : s.source === 'plugin' ? '插件：' + e(s.pluginName || s.pluginId) : '本地规则'}</span></button><p>${e(s.detail)}</p>
        ${s.references.map((r) => `<a href="${e(r.url)}" target="_blank" rel="noopener noreferrer">${e(r.title)}</a>`).join('')}
        ${s.before || s.after ? `<details><summary>查看修改位置与方式</summary><pre class="diff-removed">${e(s.before || '')}</pre>${s.after !== null ? `<pre class="diff-added">${e(s.after)}</pre>` : '<p class="src-note">这是一条审阅意见，需要作者手动修改。</p>'}</details>` : ''}
        ${s.stale ? '<p class="src-note">原文已变化，请重新检查后再应用此建议。</p>' : ''}
        ${s.status === 'pending' && editable ? `<div class="assistant-buttons"><button class="btn btn-primary btn-sm" data-accept="${s.id}" ${s.stale && s.canApply ? 'disabled' : ''}>${s.canApply ? '接受并应用' : '接受（手动落实）'}</button><button class="btn btn-sm" data-reject="${s.id}">不接受</button></div>` : `<span class="badge">${s.status === 'accepted' ? (s.canApply ? '已接受' : '已接受 · 待手动落实') : s.status === 'rejected' ? '未接受' : '待作者处理'}</span>`}</article>`).join('') : '<div class="comments-empty">没有待显示的建议。可检查全文、选中源码，或在 PDF 上圈选区域后提问。</div>'}</div>`;
    panel.querySelector('#assistant-close').onclick = close;
    panel.querySelector('#assistant-config').onclick = () => openAiSettings(user);
    panel.querySelector('#assistant-focus').oninput = (event) => { focus = event.target.value; };
    panel.querySelector('#assistant-filter').value = filter;
    panel.querySelector('#assistant-filter').onchange = (event) => { filter = event.target.value; paint(); };
    panel.querySelector('#assistant-category').value = category;
    panel.querySelector('#assistant-category').onchange = (event) => { category = event.target.value; paint(); };
    panel.querySelector('#assistant-auto').onchange = (event) => { automaticLocal = event.target.checked; localStorage.setItem(localAutoKey, automaticLocal ? '1' : '0'); };
    panel.querySelector('#assistant-auto-ai').onchange = async (event) => {
      automaticModel = event.target.checked && await confirmDialog({ title: '开启自动 AI 建议', message: '停止编辑后会定期将论文源码发送到管理员配置的模型服务，可能产生费用。自动建议不会自动修改正文。', confirmText: '开启' });
      paint();
    };
    panel.querySelector('#assistant-local').onclick = () => run(false);
    panel.querySelector('#assistant-ai').onclick = () => run(true);
    panel.querySelector('#assistant-selection').onclick = () => {
      const sel = view.state.selection.main;
      if (sel.empty && !selectedRegion) { toast('请先在源码中选择文字，或在 PDF 上圈选区域', 'err'); return; }
      run(aiStatus.configured, true);
    };
    panel.querySelector('#assistant-literature').onclick = findLiterature;
    panel.querySelector('#assistant-clear-region')?.addEventListener('click', () => { selectedRegion = null; paint(); });
    panel.querySelectorAll('[data-locate]').forEach((button) => { button.onclick = () => locate(items.find((s) => s.id === button.dataset.locate)); });
    panel.querySelectorAll('[data-accept],[data-reject]').forEach((button) => { button.onclick = () => decide(button.dataset.accept || button.dataset.reject, button.hasAttribute('data-accept') ? 'accepted' : 'rejected'); });
  }
  async function run(useAI, selectionOnly = false, automatic = false) {
    if (busy || destroyed || !canReview) return;
    const sendImages = panel.querySelector('#assistant-images')?.checked === true;
    if (useAI && !automatic && !await confirmDialog({ title: '向模型发送稿件进行审阅', message: `将发送当前项目中最多约 10 万字符的 LaTeX/BibTeX 源码${sendImages ? '、所选 PDF 截图及最多 4 张插图' : ''}。建议仅供参考，接受前可查看差异；事实和文献由作者核实。`, confirmText: '发送并审阅' })) return;
    const sel = view.state.selection.main;
    let selection = selectionOnly && !sel.empty ? view.state.doc.sliceString(sel.from, sel.to) : '';
    let region;
    if (selectedRegion) {
      try { region = await pdfViewer.getRegionContext(selectedRegion.page, selectedRegion.rect); selection = region.text; }
      catch (error) { toast(error.message, 'err'); return; }
    }
    if (useAI && selectedRegion && !selection.trim() && !sendImages) { toast('圈选区域未提取到文字，请勾选发送截图（需要视觉模型），或在问题中补充原文', 'err'); return; }
    busy = true; if (opened) paint();
    try {
      const result = await api.post(`${base}/review`, { useAI, consent: useAI, sendImages, focus, selection,
        path: /\.(tex|bib)$/i.test(getActivePath() || '') ? getActivePath() : project.mainFile, ...(selectedRegion ? { pdf: selectedRegion } : {}), ...(sendImages && region ? { image: region.image } : {}) });
      items = result.suggestions;
      if (!automatic) toast(useAI ? `审阅完成，收到 ${result.modelCount} 条模型意见` : `本地检查完成，发现 ${result.localCount} 条线索`, 'ok');
    } catch (error) { if (!automatic || useAI) toast(error.message, 'err'); }
    finally { busy = false; if (opened) paint(); }
  }
  async function findLiterature() {
    const query = await promptDialog({ title: '检索真实候选文献', label: '发送到 Crossref 的关键词（不要包含未公开敏感内容）', value: focus || project.name, confirmText: '检索' });
    if (!query) return;
    busy = true; paint();
    try { const result = await api.post(`${base}/literature`, { query, path: /\.(tex|bib)$/i.test(getActivePath() || '') ? getActivePath() : project.mainFile, consent: true }); items = result.suggestions; toast(`找到 ${result.count} 篇候选，请核对相关性与 DOI`, 'ok'); }
    catch (error) { toast(error.message, 'err'); }
    finally { busy = false; paint(); }
  }
  async function locate(suggestion) {
    if (!suggestion) return;
    if (suggestion.pdf) {
      const wrapper = pdfViewer.getPageElement(suggestion.pdf.page);
      if (wrapper) {
        root.querySelector('#pane-pdf').style.display = 'flex';
        wrapper.scrollIntoView({ block: 'center' });
        wrapper.querySelectorAll('.assistant-highlight').forEach((node) => node.remove());
        const mark = document.createElement('div'); mark.className = 'assistant-highlight';
        const rect = suggestion.pdf.rect;
        Object.assign(mark.style, { left: rect.x * 100 + '%', top: rect.y * 100 + '%', width: rect.w * 100 + '%', height: rect.h * 100 + '%' });
        wrapper.appendChild(mark); setTimeout(() => mark.remove(), 5000);
      }
    }
    try {
      await openFile(suggestion.path);
      const text = view.state.doc.toString();
      let from = suggestion.from;
      if (suggestion.before && text.slice(from, from + suggestion.before.length) !== suggestion.before) from = text.indexOf(suggestion.before);
      if (from < 0) { toast('原文已变化，请重新审阅以定位', 'err'); return; }
      from = Math.min(from, text.length);
      view.dispatch({ selection: { anchor: from, head: Math.min(text.length, from + suggestion.before.length) }, effects: EditorView.scrollIntoView(from, { y: 'center' }) });
      view.focus();
    } catch (error) { toast(error.message, 'err'); }
  }
  async function decide(id, status) {
    try {
      const result = await api.patch(`${base}/suggestions/${id}`, { status });
        if (result.applied && assistantEnabled) await api.post(`${base}/review`, {}).catch(() => {});
      await refresh();
      toast(result.applied ? '修改已应用，应用前版本已保留' : status === 'accepted' ? '已接受，请按建议手动落实' : '已保留原文', 'ok');
      if (result.applied) compile(false);
    } catch (error) { toast(error.message, 'err'); }
  }
  async function openHistory() {
    try {
      const data = await api.get(`${base}/history`);
      const branches = new Map(data.branches.map((b) => [b.id, b]));
      const rows = data.revisions;
      const positions = new Map(rows.map((r, i) => [r.id, { x: 12 + data.branches.findIndex((b) => b.id === r.branch_id) * 18, y: i * 66 + 25 }]));
      const lines = rows.flatMap((r) => [r.parent_id, r.merge_parent_id].filter((id) => positions.has(id)).map((parent) => ({ ...r, parent }))).map((r) => {
        const a = positions.get(r.id); const b = positions.get(r.parent);
        return `<path d="M${a.x},${a.y} C${a.x},${(a.y+b.y)/2} ${b.x},${(a.y+b.y)/2} ${b.x},${b.y}" fill="none" stroke="#9ab5c6" stroke-width="2" />`;
      }).join('');
      const dots = rows.map((r) => { const point = positions.get(r.id); return `<circle cx="${point.x}" cy="${point.y}" r="5" fill="${r.branch_id === data.activeBranch ? '#16794a' : '#5874bc'}"><title>${e(r.title)}</title></circle>`; }).join('');
      const { root: m, close: closeModal } = modal({ title: '项目版本与分支', subtitle: '完整项目快照 · 旧稿、素材与编译器设置一起保留', wide: true,
        bodyHtml: `<div class="revision-toolbar"><select class="input" id="revision-branch" ${editable ? '' : 'disabled'}>${data.branches.map((b) => `<option value="${b.id}" ${b.id === data.activeBranch ? 'selected' : ''}>${e(b.name)}</option>`).join('')}</select><button class="btn" id="revision-save" ${editable ? '' : 'disabled'}>保存检查点</button><button class="btn" id="revision-create" ${editable ? '' : 'disabled'}>从所选版本建分支</button><button class="btn" id="revision-merge" ${editable && data.branches.length > 1 ? '' : 'disabled'}>合并分支</button></div><div class="revision-browser"><div class="revision-timeline"><svg aria-label="分支关系图" width="${Math.max(42, data.branches.length * 18 + 20)}" height="${rows.length * 66}">${lines}${dots}</svg><div class="revision-rows">${rows.map((r) => `<button class="revision-row" data-revision="${r.id}"><b>${e(r.title)}</b><span>${e(branches.get(r.branch_id)?.name || '分支')} · ${r.id.slice(0,8)} · ${timeAgo(r.created_at)}</span><span>${e(r.author || '自动保存')}</span></button>`).join('')}</div></div><div class="revision-preview"><p id="revision-meta" class="src-note">选择一个版本，与当前工作区比较</p><div id="revision-files"></div><div id="revision-diff"></div></div></div>`,
        footerHtml: '<button class="btn" id="revision-close">关闭</button><button class="btn btn-primary" id="revision-restore" disabled>恢复所选版本</button>',
      });
      let selected = null; let requestId = 0;
      const show = async (id) => {
        const request = ++requestId; selected = id;
        const result = await api.get(`${base}/history/${id}/diff`);
        if (request !== requestId || !m.isConnected) return;
        m.querySelectorAll('[data-revision]').forEach((button) => button.classList.toggle('active', button.dataset.revision === id));
        m.querySelector('#revision-meta').textContent = `${rows.find((r) => r.id === id)?.title || ''} → 当前工作区：${result.changed.length} 个文件变化。主文件 ${result.metadata.before.mainFile} → ${result.metadata.after.mainFile}；编译器 ${result.metadata.before.engine} → ${result.metadata.after.engine}`;
        m.querySelector('#revision-restore').disabled = !editable;
        m.querySelector('#revision-diff').innerHTML = '';
        m.querySelector('#revision-files').innerHTML = result.changed.length ? result.changed.map((file) => `<button class="revision-file" data-path="${e(file.path)}">${{added:'新增',deleted:'删除',modified:'修改'}[file.kind]} ${e(file.path)} <span>${file.before} → ${file.after} B</span></button>`).join('') : '<p class="src-note">文件内容相同；主文件与编译器设置见上方。</p>';
        m.querySelectorAll('[data-path]').forEach((button) => { button.onclick = async () => {
          try {
            const result = await api.get(`${base}/history/${selected}/diff?path=${encodeURIComponent(button.dataset.path)}`);
            if (m.isConnected) m.querySelector('#revision-diff').innerHTML = /\.(tex|bib|sty|cls|txt|md|json|cfg)$/i.test(button.dataset.path) ? diffMarkup(result.before, result.after) : '<p class="src-note">二进制素材变化，请恢复到分支或导出后查看。</p>';
          } catch (error) { toast(error.message, 'err'); }
        }; });
      };
      m.querySelectorAll('[data-revision]').forEach((button) => { button.onclick = () => show(button.dataset.revision).catch((error) => toast(error.message, 'err')); });
      m.querySelector('#revision-close').onclick = closeModal;
      m.querySelector('#revision-merge').onclick = () => {
        const sources = data.branches.filter((b) => b.id !== data.activeBranch);
        const { root: dialog, close: closeMerge } = modal({ title: '合并到当前论文分支', wide: true,
          bodyHtml: `<div class="field"><label>来源分支</label><select class="input" id="merge-source">${sources.map((b) => `<option value="${b.id}">${e(b.name)}</option>`).join('')}</select></div><button class="btn" id="merge-preview">预览三方合并</button><div id="merge-plan"></div><div id="merge-diff"></div>`,
          footerHtml: '<button class="btn" id="merge-cancel">取消</button><button class="btn btn-primary" id="merge-submit" disabled>保存旧稿并合并</button>',
        });
        let plan = null; let source = null;
        dialog.querySelector('#merge-cancel').onclick = closeMerge;
        dialog.querySelector('#merge-source').onchange = () => { plan = null; dialog.querySelector('#merge-submit').disabled = true; dialog.querySelector('#merge-plan').innerHTML = ''; };
        dialog.querySelector('#merge-preview').onclick = async () => {
          source = dialog.querySelector('#merge-source').value;
          try {
            plan = await api.get(`${base}/branches/${source}/merge-preview`);
            dialog.querySelector('#merge-plan').innerHTML = `<p class="src-note">共同版本 ${plan.common?.slice(0,8) || '无'} · 自动合并 ${plan.changes.length} 个文件 · ${plan.conflicts.length} 个冲突。文件级冲突必须逐项选择，不会自动覆盖。</p>${plan.conflicts.map((c, i) => `<div class="merge-conflict"><button class="btn btn-sm" data-merge-diff="${e(c.path)}">${e(c.path)}</button><select class="input" data-conflict="${i}"><option value="">请选择处理方式</option><option value="ours">保留当前分支</option><option value="theirs">采用来源分支</option></select></div>`).join('')}`;
            dialog.querySelectorAll('[data-merge-diff]').forEach((button) => { button.onclick = async () => {
              if (button.dataset.mergeDiff.startsWith('$')) { dialog.querySelector('#merge-diff').textContent = JSON.stringify(plan.conflicts.find((c) => c.path === button.dataset.mergeDiff)); return; }
              const result = await api.get(`${base}/history/${plan.theirs}/diff?path=${encodeURIComponent(button.dataset.mergeDiff)}`);
              dialog.querySelector('#merge-diff').innerHTML = '<p class="src-note">来源分支（红）→ 当前分支（绿）</p>' + diffMarkup(result.before, result.after);
            }; });
            dialog.querySelector('#merge-submit').disabled = false;
          } catch (error) { toast(error.message, 'err'); }
        };
        dialog.querySelector('#merge-submit').onclick = async (event) => {
          if (!plan) return;
          const resolutions = Object.create(null);
          for (const select of dialog.querySelectorAll('[data-conflict]')) {
            if (!select.value) { toast('请逐项选择冲突处理方式', 'err'); return; }
            resolutions[plan.conflicts[Number(select.dataset.conflict)].path] = select.value;
          }
          event.currentTarget.disabled = true;
          try { await api.post(`${base}/branches/${source}/merge`, { ours: plan.ours, theirs: plan.theirs, currentBranch: plan.currentBranch, resolutions }); closeMerge(); closeModal(); location.reload(); }
          catch (error) { toast(error.message, 'err'); event.currentTarget.disabled = false; }
        };
      };
      m.querySelector('#revision-save').onclick = async () => {
        const title = await promptDialog({ title: '保存项目检查点', label: '版本说明', placeholder: '例如：提交 Nature 前终稿' });
        if (!title) return;
        try { await api.post(`${base}/history`, { title }); closeModal(); openHistory(); } catch (error) { toast(error.message, 'err'); }
      };
      m.querySelector('#revision-create').onclick = async () => {
        const name = await promptDialog({ title: '创建论文分支', label: '分支名称', placeholder: '例如：投稿-ICLR / 实验补充' });
        if (!name) return;
        try { await api.post(`${base}/branches`, { name, revisionId: selected || rows[0]?.id }); closeModal(); location.reload(); } catch (error) { toast(error.message, 'err'); }
      };
      m.querySelector('#revision-branch').onchange = async (event) => {
        const target = event.target.value;
        if (!await confirmDialog({ title: '切换论文分支', message: '当前未归档的修改会先保存为完整快照，再切换文件、素材和编译器设置。在线协作者也会重新加载。', confirmText: '保存并切换' })) { event.target.value = data.activeBranch; return; }
        try { await api.post(`${base}/branches/${target}/checkout`); closeModal(); location.reload(); } catch (error) { toast(error.message, 'err'); }
      };
      m.querySelector('#revision-restore').onclick = async () => {
        if (!selected || !await confirmDialog({ title: '恢复项目版本', message: '将恢复此版本的全部源码、素材和编译器设置。当前内容会先生成快照，恢复后仍可追溯。', confirmText: '保留当前稿并恢复' })) return;
        try { await api.post(`${base}/history/${selected}/restore`); closeModal(); location.reload(); } catch (error) { toast(error.message, 'err'); }
      };
      if (rows[0]) await show(rows[0].id);
    } catch (error) { toast(error.message, 'err'); }
  }
  async function openDerive(kind = 'slides') {
    const status = await api.get('/api/workspace/ai/status');
    const { root: m, close: closeModal } = modal({ title: '论文生成 Slides / Poster',
      bodyHtml: `<div class="field"><label>生成类型</label><select class="input" id="derive-kind"><option value="slides">LaTeX Slides（16:9）</option><option value="poster">学术 Poster（A0）</option></select></div><label class="research-check"><input type="checkbox" id="derive-ai" ${status.configured ? '' : 'disabled'} />使用模型整理内容（将发送论文源码）</label><p class="src-note">生成一个独立项目，复制素材并保留原稿版本。规则转换是可编辑节选初稿；AI 转换仍需核对数字、引用与版面。不会覆盖当前论文。</p>`,
      footerHtml: '<button class="btn" id="derive-cancel">取消</button><button class="btn btn-primary" id="derive-submit">生成新项目</button>',
    });
    m.querySelector('#derive-kind').value = kind;
    m.querySelector('#derive-cancel').onclick = closeModal;
    m.querySelector('#derive-submit').onclick = async (event) => {
      const button = event.currentTarget; button.disabled = true; button.textContent = '正在生成…';
      try {
        const useAI = m.querySelector('#derive-ai').checked;
        const result = await api.post(`${base}/derive`, { kind: m.querySelector('#derive-kind').value, useAI, consent: useAI });
        closeModal(); toast(result.warning, 'ok'); navigateProject(result.project.id);
      } catch (error) { toast(error.message, 'err'); button.disabled = false; button.textContent = '生成新项目'; }
    };
  }
  async function openTemplate() {
    const status = await api.get('/api/workspace/ai/status');
    const { root: m, close: closeModal } = modal({ title: '转投 · 更换论文模板',
      bodyHtml: `<div class="field"><label for="template-zip">新期刊 / 会议模板 ZIP（≤30 MB）</label><input class="input" type="file" id="template-zip" accept=".zip" /></div><div class="field"><label for="template-branch">新分支名称</label><input class="input" id="template-branch" placeholder="例如：转投-IEEE-第二稿" /></div><label class="research-check"><input type="checkbox" id="template-ai" ${status.configured ? '' : 'disabled'} />用 AI 适配模板（发送原稿和模板源码）</label><p class="src-note">先保存完整原稿，再创建投稿分支。规则模式迁移 document 正文；AI 模式适配模板格式。作者格式、宏包、参考文献与版面仍需编译检查。旧稿可从项目历史切回。</p>`,
      footerHtml: '<button class="btn" id="template-cancel">取消</button><button class="btn btn-primary" id="template-submit">保留旧稿并换模板</button>',
    });
    m.querySelector('#template-cancel').onclick = closeModal;
    m.querySelector('#template-submit').onclick = async (event) => {
      const file = m.querySelector('#template-zip').files[0];
      if (!file || file.size > 30 * 1024 * 1024) { toast('请选择小于 30 MB 的 ZIP 模板', 'err'); return; }
      const button = event.currentTarget; button.disabled = true; button.textContent = '正在迁移…';
      const form = new FormData(); form.append('file', file); form.append('branchName', m.querySelector('#template-branch').value);
      form.append('useAI', String(m.querySelector('#template-ai').checked)); form.append('consent', String(m.querySelector('#template-ai').checked));
      try { const result = await api.upload(`${base}/template`, form); toast(result.warning, 'ok'); closeModal(); location.reload(); }
      catch (error) { toast(error.message, 'err'); button.disabled = false; button.textContent = '保留旧稿并换模板'; }
    };
  }
  refresh().catch(() => {});
  return {
    open, close, openHistory, openDerive, openTemplate,
    onPdfRegion(region) { selectedRegion = region.source ? null : { page: region.page, rect: region.rect }; focus = region.question || '请检查选中区域的论述、引用与插图一致性'; open(); },
    async getPdfSelection() { if (!selectedRegion) throw new Error('请先在 PDF 中圈选区域并交给助手'); return pdfViewer.getRegionContext(selectedRegion.page, selectedRegion.rect); },
    scheduleReview() {
      if (!assistantEnabled || (!automaticLocal && !automaticModel) || !canReview || destroyed) return;
      clearTimeout(timer);
      timer = setTimeout(() => run(automaticModel, false, true), automaticModel ? 60000 : 12000);
    },
    handleEvent(message) { if (message.type === 'assistant:changed') refresh().catch(() => {}); },
    destroy() { destroyed = true; clearTimeout(timer); panel.classList.remove('open'); },
  };
}
