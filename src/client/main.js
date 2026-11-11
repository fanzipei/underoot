import { api } from './api.js';
import { toast } from './ui.js';
import { renderAuth } from './views/auth.js';
import { renderDashboard } from './views/dashboard.js';
import { renderEditor } from './views/editor.js';
import { renderAdmin } from './views/admin.js';
import { renderForcePassword } from './views/force-password.js';

const app = document.getElementById('app');
let currentUser = null;
let cleanup = null;
let renderToken = 0;

function teardown() {
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch { /* ignore */ }
  }
  cleanup = null;
  app.innerHTML = '';
}

/** #/path?query → { path, query } */
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(qs || '') };
}

async function render() {
  const token = ++renderToken;
  teardown();
  if (token !== renderToken) return;

  const { path, query } = parseHash();

  if (!currentUser) {
    document.title = '登录 · LaTeXStudio';

    renderAuth(app, {
      notice: '',
      onSuccess: (user) => {
        currentUser = user;
        // 改变 hash 会触发 hashchange -> render()，无需重复渲染
        if (location.hash !== '#/') location.hash = '#/';
        else render();
      },
    });
    return;
  }

  // 初始密码 / 管理员重置过的密码，先改密再进系统
  if (currentUser.mustChangePassword) {
    document.title = '修改密码 · LaTeXStudio';
    renderForcePassword(app, {
      user: currentUser,
      onDone: (user) => { currentUser = user; render(); },
      onLogout: async () => {
        try { await api.post('/api/auth/logout'); } catch { /* ignore */ }
        currentUser = null;
        render();
      },
    });
    return;
  }

  if (path === '/admin') {
    if (currentUser.role !== 'admin') {
      history.replaceState(null, '', '#/');
      render();
      return;
    }
    document.title = '账号审批 · LaTeXStudio';
    cleanup = renderAdmin(app, {
      user: currentUser,
      onExit: () => { location.hash = '#/'; },
    });
    return;
  }

  const projectMatch = path.match(/^\/p\/([A-Za-z0-9-]+)/);
  if (projectMatch) {
    document.title = '编辑器 · LaTeXStudio';
    const fn = await renderEditor(app, projectMatch[1], {
      user: currentUser,
      onExit: () => { location.hash = '#/'; },
      onUserUpdate: (u) => { currentUser = u; },
    });
    if (token !== renderToken) { if (typeof fn === 'function') fn(); return; }
    cleanup = fn;
    return;
  }

  document.title = 'LaTeXStudio · 在线 LaTeX 编辑器';
  cleanup = renderDashboard(app, {
    user: currentUser,
    onLogout: () => {
      currentUser = null;
      if (location.hash) location.hash = '';
      else render();
    },
    onOpenProject: (id) => { location.hash = `#/p/${id}`; },
    onOpenAdmin: () => { location.hash = '#/admin'; },
    onUserUpdate: (u) => { currentUser = u; },
  });
}

async function boot() {
  try {
    const data = await api.get('/api/auth/me');
    currentUser = data.user;
  } catch {
    currentUser = null;
  }
  await render();
}

window.addEventListener('hashchange', () => { render(); });
boot();
