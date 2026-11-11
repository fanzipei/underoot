import { api } from '../api.js';
import {
  icon, escapeHtml, avatarHtml, timeAgo, toast, modal, confirmDialog,
} from '../ui.js';

const STATUS_TEXT = {
  pending: '待审批',
  active: '正常',
  rejected: '已拒绝',
};

const TABS = [
  { key: 'pending', label: '待审批' },
  { key: 'active', label: '正常' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'all', label: '全部账号' },
];

export function renderAdmin(root, { user, onExit, onPendingChange }) {
  let tab = 'pending';
  let users = [];
  let counts = { pending: 0, active: 0, rejected: 0 };
  let loading = false;
  let settings = { openRegistration: false, source: 'default', pendingCount: 0 };

  root.innerHTML = `
    <div class="topbar">
      <button class="btn btn-icon" id="admin-back" title="返回项目">${icon('arrow-left')}</button>
      <div class="brand"><span class="mark">T</span><span class="full">账号审批</span></div>
      <div class="spacer"></div>
      <button class="btn" id="admin-refresh">${icon('refresh')}刷新</button>
    </div>
    <div class="page">
      <div class="page-head">
        <div>
          <h1>账号管理</h1>
          <div class="sub" id="admin-sub">正在加载…</div>
        </div>
      </div>
      <div class="admin-settings" id="admin-settings"></div>
      <div class="admin-tabs" id="admin-tabs"></div>
      <div id="admin-list"><div class="empty-state">正在加载账号…</div></div>
    </div>`;

  const tabsEl = root.querySelector('#admin-tabs');
  const listEl = root.querySelector('#admin-list');
  const subEl = root.querySelector('#admin-sub');
  const settingsEl = root.querySelector('#admin-settings');

  function paintSettings() {
    const on = settings.openRegistration;
    const sourceText = settings.source === 'env'
      ? '（由服务端环境变量默认开启，可在下方覆盖）'
      : settings.source === 'setting' ? '（后台设置）' : '（系统默认）';
    settingsEl.innerHTML = `
      <div class="setting-card">
        <div class="setting-info">
          <div class="setting-title">开放注册 <span class="setting-source">${sourceText}</span></div>
          <div class="setting-desc">
            ${on
              ? '新注册账号立即生效，无需管理员审批。管理员仍可停用或删除任意普通账号。'
              : '新注册账号需管理员审批后才能登录。'}
            ${on && settings.pendingCount ? `<b>当前还有 ${settings.pendingCount} 个待审批账号</b>，可在此前的申请中手动处理。` : ''}
          </div>
        </div>
        <label class="switch" title="${on ? '点击恢复注册审批' : '点击开放注册'}">
          <input type="checkbox" id="open-reg" ${on ? 'checked' : ''} />
          <span class="switch-track"><span class="switch-thumb"></span></span>
          <span class="switch-label">${on ? '已开放' : '需审批'}</span>
        </label>
      </div>`;
    const input = settingsEl.querySelector('#open-reg');
    input.onchange = () => toggleOpenRegistration(input.checked, input);
  }

  async function toggleOpenRegistration(next, input) {
    const pending = settings.pendingCount || 0;
    const ok = await confirmDialog({
      title: next ? '开放注册' : '恢复注册审批',
      message: next
        ? `开放后新注册账号将直接可用，无需审批。${pending ? `现有 ${pending} 个待审批账号会一并放行。` : ''}管理员仍可随时停用或删除账号。`
        : '恢复后新注册账号需管理员审批才能登录；已有账号不受影响。',
      confirmText: next ? '确认开放' : '确认恢复',
      danger: !next,
    });
    if (!ok) { input.checked = !next; return; }
    input.disabled = true;
    try {
      const res = await api.put('/api/admin/settings', { openRegistration: next });
      settings = res;
      toast(res.message || (next ? '已开放注册' : '已恢复审批'), 'ok');
      await loadSettings();
      await load();
    } catch (err) {
      toast(err.message, 'err');
      input.checked = !next;
    } finally {
      input.disabled = false;
    }
  }

  async function loadSettings() {
    try {
      settings = await api.get('/api/admin/settings');
      paintSettings();
    } catch { /* 非管理员或接口异常时静默，不影响账号列表 */ }
  }

  function paintTabs() {
    tabsEl.innerHTML = TABS.map((t) => `
      <button class="admin-tab ${t.key === tab ? 'active' : ''}" data-tab="${t.key}">
        ${t.label}${t.key === 'pending' && counts.pending ? `<span class="count">${counts.pending}</span>` : ''}
      </button>`).join('');
    tabsEl.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.onclick = () => { tab = btn.dataset.tab; paintTabs(); load(); };
    });
  }

  function rowHtml(u) {
    const isSelf = u.id === user.id;
    const deletable = u.role !== 'admin' && !isSelf;
    const actions = [];
    if (u.status === 'pending') {
      actions.push(`<button class="btn btn-primary btn-sm" data-act="approve" data-id="${u.id}">${icon('check')}通过</button>`);
      actions.push(`<button class="btn btn-sm" data-act="reject" data-id="${u.id}">拒绝</button>`);
    } else if (u.status === 'rejected') {
      actions.push(`<button class="btn btn-sm" data-act="approve" data-id="${u.id}">重新通过</button>`);
    } else {
      actions.push(u.disabled
        ? `<button class="btn btn-sm" data-act="enable" data-id="${u.id}">启用</button>`
        : `<button class="btn btn-sm" data-act="disable" data-id="${u.id}" ${u.role === 'admin' ? 'disabled' : ''}>停用</button>`);
      actions.push(`<button class="btn btn-sm" data-act="reset" data-id="${u.id}">重置密码</button>`);
    }
    if (deletable) {
      actions.push(`<button class="btn btn-sm btn-danger" data-act="delete" data-id="${u.id}">删除</button>`);
    }
    const badges = [
      u.role === 'admin' ? '<span class="badge badge-green">管理员</span>' : '',
      u.disabled ? '<span class="badge">已停用</span>' : '',
      '<span class="badge">邮箱</span>',
    ].filter(Boolean).join(' ');

    return `<tr data-id="${u.id}">
      <td>
        <div class="admin-user">
          ${avatarHtml(u)}
          <div>
            <div class="name">${escapeHtml(u.name)}${isSelf ? ' <span class="muted">(你)</span>' : ''}</div>
            <div class="mail">${escapeHtml(u.email)}</div>
          </div>
        </div>
      </td>
      <td>${badges}</td>
      <td><span class="status-pill ${u.status}">${STATUS_TEXT[u.status] || u.status}</span></td>
      <td class="muted">${timeAgo(u.createdAt)}</td>
      <td class="admin-actions">${actions.join('')}</td>
    </tr>`;
  }

  function paint() {
    subEl.textContent = `待审批 ${counts.pending} 个 · 正常 ${counts.active} 个 · 已拒绝 ${counts.rejected} 个`;
    if (!users.length) {
      listEl.innerHTML = `<div class="empty-state">${
        tab === 'pending'
          ? (settings.openRegistration ? '已开放注册，新账号无需审批' : '没有待审批的申请，全部处理完了')
          : '这里还没有账号'
      }</div>`;
      return;
    }
    listEl.innerHTML = `<div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>账号</th><th>类型</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead>
        <tbody>${users.map(rowHtml).join('')}</tbody>
      </table>
    </div>`;
    listEl.querySelectorAll('[data-act]').forEach((btn) => {
      btn.onclick = () => act(btn.dataset.act, btn.dataset.id);
    });
  }

  async function load() {
    if (loading) return;
    loading = true;
    try {
      const data = await api.get(`/api/admin/users?status=${encodeURIComponent(tab)}`);
      users = data.users || [];
      counts = data.counts || counts;
      onPendingChange?.(counts.pending);
      settings.pendingCount = counts.pending;
      paintTabs();
      paintSettings();
      paint();
    } catch (err) {
      listEl.innerHTML = `<div class="empty-state">加载失败：${escapeHtml(err.message)}</div>`;
    } finally {
      loading = false;
    }
  }

  async function act(action, id) {
    const target = users.find((u) => u.id === id);
    if (!target) return;
    try {
      if (action === 'approve' || action === 'reject') {
        await api.post(`/api/admin/users/${id}/review`, { status: action === 'approve' ? 'active' : 'rejected' });
        toast(action === 'approve' ? `已通过 ${target.name} 的申请` : `已拒绝 ${target.name} 的申请`, 'ok');
      } else if (action === 'disable' || action === 'enable') {
        const disable = action === 'disable';
        const ok = await confirmDialog({
          title: disable ? '停用账号' : '启用账号',
          message: disable
            ? `停用后「${target.name}」将立即无法登录，已打开页面的会话也会失效。`
            : `启用后「${target.name}」可以重新登录。`,
          confirmText: disable ? '停用' : '启用',
          danger: disable,
        });
        if (!ok) return;
        await api.post(`/api/admin/users/${id}/disabled`, { disabled: disable });
        toast(disable ? '账号已停用' : '账号已启用', 'ok');
      } else if (action === 'delete') {
        const ok = await confirmDialog({
          title: '删除账号',
          message: `将永久删除「${target.name}」（${target.email}）及其名下的所有项目文件，此操作不可恢复。`,
          confirmText: '永久删除',
          danger: true,
        });
        if (!ok) return;
        await api.del(`/api/admin/users/${id}`);
        toast(`已删除 ${target.name}`, 'ok');
      } else if (action === 'reset') {
        const ok = await confirmDialog({
          title: '重置密码',
          message: `将为「${target.name}」生成一个随机密码，对方下次登录后需自行修改。`,
          confirmText: '重置',
        });
        if (!ok) return;
        const res = await api.post(`/api/admin/users/${id}/reset-password`);
        modal({
          title: '新密码',
          subtitle: '只显示一次，请复制后发给对方',
          bodyHtml: `<div class="pwd-box"><code>${escapeHtml(res.password)}</code></div>`,
          footerHtml: `<button class="btn btn-primary" data-act="ok">已复制</button>`,
          onMount: (backdrop, close) => {
            backdrop.querySelector('[data-act="ok"]').onclick = close;
          },
        });
      }
      await load();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  root.querySelector('#admin-back').onclick = onExit;
  root.querySelector('#admin-refresh').onclick = () => { loadSettings(); load(); };
  paintTabs();
  paintSettings();
  loadSettings();
  load();

  return () => {};
}
