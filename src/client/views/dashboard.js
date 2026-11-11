import { api } from '../api.js';
import { openWorkspaceSearch, openNotifications, openAiSettings } from './research-tools.js';
import { loadExtensions, enabledExtension, extensionCommands, openExtensionsManager, closeExtensionWindows } from '../extensions.js';
import {
  icon, escapeHtml, avatarHtml, timeAgo, toast, modal, confirmDialog, promptDialog, dropdown,
} from '../ui.js';

const TPL_ICON = {
  doc: 'file',
  paper: 'log',
  language: 'terminal',
  slides: 'grid',
  user: 'users',
  conf: 'book',
  figure: 'image',
};

export function renderDashboard(root, { user, onLogout, onOpenProject, onOpenAdmin, onUserUpdate }) {
  let projects = [];
  let query = '';
  let templates = [];
  let pendingCount = 0;
  let extensionList = [];

  root.innerHTML = `
    <div class="topbar">
      <div class="brand"><span class="mark" aria-label="underoot"><svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true"><path d="M5 17l4-2 5 10 6-18h8" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span><span class="full">underoot</span></div>
      <div class="search">${icon('grid')}<input id="search" placeholder="搜索项目名称…" /></div>
      <div class="spacer"></div>
      <button class="btn" id="btn-workspace-search">全文搜索</button>
      <button class="btn" id="btn-notifications">讨论通知</button>
      <button class="btn" id="btn-extensions">插件</button>
      <button class="btn" id="btn-extension-tools">工具箱</button>
      <button class="btn" id="btn-import">${icon('archive')}导入项目</button>
      <button class="btn btn-primary" id="btn-new">${icon('plus')}新建项目</button>
      <div class="user-chip" id="user-chip">${avatarHtml(user)}</div>
    </div>
    <div class="page">
      <div class="page-head">
        <div>
          <h1>我的项目</h1>
          <div class="sub" id="project-sub">加载中…</div>
        </div>
      </div>
      <div id="project-list"><div class="empty-state">正在加载项目…</div></div>
    </div>`;

  const listEl = root.querySelector('#project-list');
  const subEl = root.querySelector('#project-sub');

  const thumb = (p) => {
    const color = (templates.find((t) => t.id === p.template) || {}).color || '#16794a';
    return `<div class="thumb" style="--pc:${color}">
        <div class="accent"></div>
        <div class="sheet">
          <div class="ln title"></div>
          <div class="ln w90"></div><div class="ln w80"></div><div class="ln w60"></div>
          <div class="ln w90"></div><div class="ln w80"></div>
        </div>
      </div>`;
  };

  const render = () => {
    const filtered = projects.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
    subEl.textContent = query
      ? `找到 ${filtered.length} 个匹配项目`
      : `共 ${projects.length} 个项目 · 所有文件保存在本地 data 目录`;
    if (!filtered.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          ${query ? '没有匹配的项目' : '还没有项目，从模板创建第一个吧'}
          ${query ? '' : `<div style="margin-top:14px"><button class="btn btn-primary" id="empty-new">${icon('plus')}新建项目</button></div>`}
        </div>`;
      const btn = listEl.querySelector('#empty-new');
      if (btn) btn.onclick = () => openTemplates();
      return;
    }
    listEl.innerHTML = `<div class="grid-projects">
      <div class="pcard-new" id="new-card">
        <span class="plus">${icon('plus')}</span>
        <span>新建项目</span>
      </div>
      ${filtered.map((p) => `
        <article class="pcard" data-id="${p.id}">
          ${thumb(p)}
          <button class="menu-btn" data-menu="${p.id}" title="更多操作">${icon('more')}</button>
          <div class="info">
            <div class="name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
            <div class="meta">
              <span class="privacy-tag" title="${p.memberCount > 1 ? (p.role === 'owner' ? '已共享给其他成员' : '由所有者共享给你') : '仅自己可见'}">
                ${p.memberCount > 1 ? icon('users') : icon('key')}
                ${p.memberCount > 1 ? (p.role === 'owner' ? '已共享' : '共享给我') : '私有'}
              </span>
              <span class="dot"></span>
              <span>${timeAgo(p.updatedAt)}</span>
            </div>
          </div>
        </article>`).join('')}
    </div>`;
    listEl.querySelector('#new-card').onclick = () => openTemplates();
    listEl.querySelectorAll('.pcard').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.menu-btn')) return;
        onOpenProject(card.dataset.id);
      });
    });
    listEl.querySelectorAll('[data-menu]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = projects.find((x) => x.id === btn.dataset.menu);
        dropdown(btn, [
          { meta: { title: p.name, sub: `最后修改 ${timeAgo(p.updatedAt)}` } },
          { key: 'open', label: '打开项目', icon: 'external', onClick: () => onOpenProject(p.id) },
          { key: 'rename', label: '重命名', icon: 'edit', onClick: () => renameProject(p) },
          { key: 'dup', label: '创建副本', icon: 'copy', onClick: () => duplicateProject(p) },
          { key: 'download', label: '下载 ZIP', icon: 'download', onClick: () => downloadProject(p) },
          { sep: true },
          { key: 'delete', label: '删除项目', icon: 'trash', danger: true, onClick: () => deleteProject(p) },
        ]);
      });
    });
  };

  async function load() {
    try {
      const [p, t] = await Promise.all([api.get('/api/projects'), api.get('/api/templates')]);
      projects = p.projects;
      templates = t.templates;
      extensionList = await loadExtensions();
      root.querySelector('#btn-workspace-search').hidden = !enabledExtension(extensionList, 'underoot.discovery');
      render();
    } catch (err) {
      listEl.innerHTML = `<div class="empty-state">加载失败：${escapeHtml(err.message)}</div>`;
    }
    if (user.role === 'admin') refreshPending();
  }

  /** 管理员：待审批数量显示在头像菜单上 */
  async function refreshPending() {
    try {
      const data = await api.get('/api/admin/users?status=pending');
      pendingCount = data.counts?.pending || 0;
      const chip = root.querySelector('#user-chip');
      if (chip && pendingCount) chip.classList.add('has-pending');
    } catch { /* 非管理员或接口异常时静默 */ }
  }

  async function openTemplates(initialSource = 'template') {
    // 直接作为 onclick 时参数会是 Event，这里做兜底
    let source = ['template', 'zip', 'github'].includes(initialSource) ? initialSource : 'template';
    let selected = templates[0]?.id || 'blank';
    let pickedFile = null;
    let busy = false;

    const body = `
      <div class="src-tabs" role="tablist">
        <button type="button" class="src-tab" data-src="template">${icon('grid')}模板</button>
        <button type="button" class="src-tab" data-src="zip">${icon('archive')}ZIP 文件</button>
        <button type="button" class="src-tab" data-src="github">${icon('github')}GitHub 链接</button>
      </div>

      <div class="src-pane" data-pane="template">
        <div class="field">
          <label for="new-name">项目名称</label>
          <input class="input" id="new-name" placeholder="例如：毕业论文初稿" />
        </div>
        <div class="field" style="margin-bottom:6px"><label>选择模板</label></div>
        <div class="tpl-grid">
          ${templates.map((t) => `
            <button type="button" class="tpl" data-tpl="${t.id}">
              <span class="ti" style="color:${t.color}">${icon(TPL_ICON[t.icon] || 'file')}</span>
              <span><b>${escapeHtml(t.name)}</b><span>${escapeHtml(t.description)}</span></span>
            </button>`).join('')}
        </div>
      </div>

      <div class="src-pane" data-pane="zip" hidden>
        <div class="field">
          <label for="zip-name">项目名称 <span class="opt">留空则用文件名</span></label>
          <input class="input" id="zip-name" placeholder="可选" />
        </div>
        <label class="drop-zone" id="zip-drop">
          <input type="file" id="zip-file" accept=".zip,application/zip" hidden />
          <span class="dz-icon">${icon('archive')}</span>
          <b id="zip-label">选择 ZIP 文件，或拖到这里</b>
          <span class="dz-hint">支持本平台导出的项目包、Overleaf / GitHub 下载的 ZIP，最大 30 MB</span>
        </label>
        <div class="src-note">自动剥离压缩包顶层的单一目录，并识别主文件（优先 main.tex）。</div>
      </div>

      <div class="src-pane" data-pane="github" hidden>
        <div class="field">
          <label for="gh-url">仓库链接</label>
          <input class="input" id="gh-url" placeholder="https://github.com/owner/repo" spellcheck="false" />
        </div>
        <div class="field">
          <label for="gh-name">项目名称 <span class="opt">留空则用仓库名</span></label>
          <input class="input" id="gh-name" placeholder="可选" />
        </div>
        <div class="src-note">支持仓库主页、<code>/tree/分支</code>、archive ZIP 链接或 <code>owner/repo</code> 简写。服务端下载整个仓库源码，私有仓库需配置 Token。</div>
      </div>`;

    const { root: m, close } = modal({
      title: '新建项目',
      subtitle: '从空白模板、ZIP 压缩包或 GitHub 仓库创建',
      bodyHtml: body,
      wide: true,
      footerHtml: `<button class="btn" data-act="cancel">取消</button>
                   <button class="btn btn-primary" data-act="create">创建项目</button>`,
      onMount: (backdrop) => {
        backdrop.querySelectorAll('.tpl').forEach((b) => {
          b.classList.toggle('active', b.dataset.tpl === selected);
          b.onclick = () => {
            selected = b.dataset.tpl;
            backdrop.querySelectorAll('.tpl').forEach((x) => x.classList.toggle('active', x === b));
          };
        });
      },
    });

    const submitBtn = m.querySelector('[data-act="create"]');
    const panes = m.querySelectorAll('.src-pane');
    const tabs = m.querySelectorAll('.src-tab');
    const setSource = (next) => {
      source = next;
      tabs.forEach((t) => t.classList.toggle('active', t.dataset.src === next));
      panes.forEach((p) => { p.hidden = p.dataset.pane !== next; });
      submitBtn.textContent = next === 'template' ? '创建项目' : '导入并创建';
      const focusId = { template: '#new-name', zip: '#zip-name', github: '#gh-url' }[next];
      const el = m.querySelector(focusId);
      if (el) setTimeout(() => el.focus(), 0);
    };
    tabs.forEach((t) => { t.onclick = () => setSource(t.dataset.src); });

    const fileInput = m.querySelector('#zip-file');
    const fileLabel = m.querySelector('#zip-label');
    const setFile = (file) => {
      if (!file) return;
      pickedFile = file;
      fileLabel.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
      m.querySelector('#zip-drop').classList.add('has-file');
      if (!m.querySelector('#zip-name').value.trim()) {
        m.querySelector('#zip-name').value = file.name.replace(/\.zip$/i, '');
      }
    };
    fileInput.onchange = () => setFile(fileInput.files?.[0]);
    const drop = m.querySelector('#zip-drop');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('drag');
      setFile(e.dataTransfer?.files?.[0]);
    });

    const create = async () => {
      if (busy) return;
      const payload = {};
      let endpoint = '/api/projects';
      let method = 'post';
      if (source === 'template') {
        payload.name = m.querySelector('#new-name').value.trim() || '未命名项目';
        payload.template = selected;
      } else if (source === 'zip') {
        if (!pickedFile) { toast('请先选择 ZIP 文件', 'err'); return; }
        const fd = new FormData();
        fd.append('file', pickedFile);
        const name = m.querySelector('#zip-name').value.trim();
        if (name) fd.append('name', name);
        endpoint = '/api/projects/import';
        method = 'upload';
        payload.formData = fd;
      } else {
        const url = m.querySelector('#gh-url').value.trim();
        if (!url) { toast('请填写 GitHub 仓库链接', 'err'); return; }
        endpoint = '/api/projects/from-github';
        payload.url = url;
        const name = m.querySelector('#gh-name').value.trim();
        if (name) payload.name = name;
      }
      busy = true;
      submitBtn.disabled = true;
      submitBtn.textContent = source === 'github' ? '正在下载仓库…' : '正在导入…';
      toast(source === 'github' ? '正在从 GitHub 下载仓库…' : '正在导入…');
      try {
        const res = method === 'upload'
          ? await api.upload(endpoint, payload.formData)
          : await api.post(endpoint, payload);
        await load();
        close();
        const open = () => onOpenProject(res.project.id);
        if (res.warning) {
          // 导入提示（含自动修复结果）需要用户确认，避免 toast 一闪而过
          const { root: notice, close: closeNotice } = modal({
            title: '项目已创建',
            bodyHtml: `<p class="import-note">${escapeHtml(res.warning)}</p>`
              + (res.clashes?.length
                ? `<div class="src-note">${res.clashes.map((c) => `· ${escapeHtml(c.pkg)}：${escapeHtml(c.options.join(', '))}`).join('<br />')}</div>`
                : ''),
            footerHtml: '<button class="btn btn-primary" data-act="ok">打开项目</button>',
          });
          notice.querySelector('[data-act="ok"]').onclick = () => { closeNotice(); open(); };
        } else {
          toast('项目已创建', 'ok');
          open();
        }
      } catch (err) {
        toast(err.message, 'err');
        busy = false;
        submitBtn.disabled = false;
        submitBtn.textContent = source === 'template' ? '创建项目' : '导入并创建';
      }
    };
    m.querySelector('[data-act="cancel"]').onclick = close;
    submitBtn.onclick = create;
    m.querySelectorAll('.src-pane input.input').forEach((el) => {
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
    });
    setSource(source);
  }

  async function renameProject(p) {
    const name = await promptDialog({ title: '重命名项目', label: '项目名称', value: p.name, selectBasename: false });
    if (!name || name === p.name) return;
    try {
      await api.patch(`/api/projects/${p.id}`, { name });
      await load();
      toast('已重命名', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  async function duplicateProject(p) {
    try {
      await api.post(`/api/projects/${p.id}/duplicate`);
      await load();
      toast('副本已创建', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  function downloadProject(p) {
    window.location.href = `/api/projects/${p.id}/download`;
  }

  async function deleteProject(p) {
    const ok = await confirmDialog({
      title: '删除项目',
      message: `确定要删除「${p.name}」吗？项目内的所有文件都会被永久删除，此操作无法撤销。`,
      confirmText: '永久删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/api/projects/${p.id}`);
      await load();
      toast('项目已删除', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  async function openSettings() {
    const { root: m, close } = modal({
      title: '账户设置',
      subtitle: '修改昵称、头像颜色与登录密码',
      bodyHtml: `
        <div class="field"><label>昵称</label><input class="input" id="set-name" value="${escapeHtml(user.name)}" /></div>
        <div class="field"><label>邮箱</label><input class="input" value="${escapeHtml(user.email)}" disabled /></div>
        <div class="field"><label>头像颜色</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap" id="colors">
            ${['#1f8a4c', '#2563eb', '#b45309', '#9333ea', '#0e7490', '#be123c', '#4d7c0f', '#7c3aed'].map((c) =>
              `<button data-color="${c}" style="width:26px;height:26px;border-radius:50%;border:2px solid ${c === user.color ? '#131a20' : 'transparent'};background:${c};cursor:pointer"></button>`).join('')}
          </div>
        </div>
        <div class="field"><label>修改密码</label>
          <input class="input" id="set-pass-old" type="password" placeholder="当前密码" style="margin-bottom:8px" />
          <input class="input" id="set-pass-new" type="password" placeholder="新密码（8–64 位，至少 3 个不同字符）" />
        </div>`,
      footerHtml: `<button class="btn" data-act="cancel">取消</button>
                   <button class="btn btn-primary" data-act="save">保存</button>`,
      onMount: (backdrop) => {
        let color = user.color;
        backdrop.querySelectorAll('[data-color]').forEach((b) => {
          b.onclick = () => {
            color = b.dataset.color;
            backdrop.querySelectorAll('[data-color]').forEach((x) => { x.style.borderColor = x === b ? '#131a20' : 'transparent'; });
          };
        });
        backdrop.__color = () => color;
      },
    });
    m.querySelector('[data-act="cancel"]').onclick = close;
    m.querySelector('[data-act="save"]').onclick = async () => {
      try {
        const name = m.querySelector('#set-name').value.trim();
        const color = m.__color();
        const res = await api.patch('/api/auth/me', { name, color });
        const oldPass = m.querySelector('#set-pass-old').value;
        const newPass = m.querySelector('#set-pass-new').value;
        if (oldPass && newPass) {
          await api.post('/api/auth/password', { current: oldPass, next: newPass });
        }
        close();
        onUserUpdate(res.user);
        toast('设置已保存', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    };
  }

  /** 输入密码的确认框（二次校验） */
  function askPassword(title, label) {
    return new Promise((resolve) => {
      const { root: m, close } = modal({
        title,
        bodyHtml: `<div class="field" style="margin:0"><label>${escapeHtml(label)}</label>
          <input class="input" id="ask-pwd" type="password" placeholder="当前登录密码" /></div>`,
        footerHtml: `<button class="btn" data-act="cancel">取消</button>
                     <button class="btn btn-primary" data-act="ok">确定</button>`,
      });
      const input = m.querySelector('#ask-pwd');
      input.focus();
      const done = (value) => { close(); resolve(value); };
      m.querySelector('[data-act="cancel"]').onclick = () => done(null);
      m.querySelector('[data-act="ok"]').onclick = () => done(input.value || null);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(input.value || null); });
    });
  }

  async function openEngineInfo() {
    let info;
    try { info = await api.get('/api/system/engines'); } catch { info = { engines: [], active: null }; }
    const { root: m, close } = modal({
      title: '编译环境',
      subtitle: '服务端可用引擎；每个项目可在「⋯ → 编译引擎」中单独选择',
      bodyHtml: info.engines.length
        ? `<div style="display:flex;flex-direction:column;gap:8px">
             ${info.engines.map((e) => `<div style="display:flex;align-items:center;gap:8px;font-size:13px">
               <span class="badge ${e.id === info.active ? 'badge-green' : ''}">${e.id === info.active ? '默认' : '可用'}</span>
               <b>${escapeHtml(e.name || e.id)}</b>
               <span style="color:var(--muted);font-size:11.5px;word-break:break-all">${escapeHtml(e.path)}</span>
             </div>`).join('')}
             <div class="src-note" style="margin-top:8px">Overleaf 默认使用 pdfLaTeX。若本地 PDF 的断行、字体或右边界与 Overleaf 不同，把该项目的编译引擎切到 <b>pdfLaTeX (latexmk)</b> 即可一致；Tectonic 使用 XeTeX + Unicode 字体，字体度量与 microtype 行为不同。</div>
           </div>`
        : `<div class="empty-state" style="padding:24px">
             <b>未检测到 LaTeX 编译器</b>
             <p style="margin:8px 0 0">可以一键下载内置的 Tectonic（约 21MB），或自行安装 TeX Live / MiKTeX 后重启服务。</p>
           </div>`,
      footerHtml: `<button class="btn" data-act="cancel">关闭</button>
        ${info.engines.length ? '' : '<button class="btn btn-primary" data-act="install">一键安装 Tectonic</button>'}`,
    });
    m.querySelector('[data-act="cancel"]').onclick = close;
    const installBtn = m.querySelector('[data-act="install"]');
    if (installBtn) {
      installBtn.onclick = async () => {
        installBtn.disabled = true;
        installBtn.innerHTML = '<span class="spinner"></span> 下载中…';
        try {
          await api.post('/api/system/install-tectonic');
          toast('编译器安装完成', 'ok');
          close();
        } catch (err) {
          toast(err.message, 'err');
          installBtn.disabled = false;
          installBtn.textContent = '一键安装 Tectonic';
        }
      };
    }
  }

  /* 事件绑定 */
  root.querySelector('#btn-new').onclick = () => openTemplates();
  root.querySelector('#btn-workspace-search').onclick = openWorkspaceSearch;
  root.querySelector('#btn-notifications').onclick = openNotifications;
  root.querySelector('#btn-extensions').onclick = () => openExtensionsManager(user);
  root.querySelector('#btn-extension-tools').onclick = async (event) => {
    const anchor = event.currentTarget;
    extensionList = await loadExtensions();
    const items = extensionCommands(extensionList, { 'discovery.search': openWorkspaceSearch });
    dropdown(anchor, items.length ? items : [{ key: 'manage', label: '安装或启用插件', onClick: () => openExtensionsManager(user) }]);
  };
  root.querySelector('#search').addEventListener('input', (e) => { query = e.target.value.trim(); render(); });

  root.querySelector('#btn-import').onclick = () => openTemplates('zip');

  root.querySelector('#user-chip').onclick = (e) => {
    const items = [{ meta: { title: user.name, sub: `${user.email}${user.role === 'admin' ? ' · 管理员' : ''}` } }];
    if (user.role === 'admin' && onOpenAdmin) {
      items.push({
        key: 'admin',
        label: pendingCount ? `账号审批（${pendingCount} 个待处理）` : '账号审批',
        icon: 'users',
        onClick: onOpenAdmin,
      });
    }
    items.push(
      { key: 'ai', label: 'AI API 配置', icon: 'settings', onClick: () => openAiSettings(user) },
      { key: 'settings', label: '账户设置', icon: 'settings', onClick: openSettings },
      { key: 'engine', label: '编译环境', icon: 'terminal', onClick: openEngineInfo },
      { sep: true },
      { key: 'logout', label: '退出登录', icon: 'logout', danger: true, onClick: async () => {
        await api.post('/api/auth/logout');
        onLogout();
      } },
    );
    dropdown(e.currentTarget, items);
  };

  load();
  return () => closeExtensionWindows();
}
