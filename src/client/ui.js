/* 图标：统一 16px 线性图标 */
const P = {
  plus: '<path d="M8 3.5v9M3.5 8h9"/>',
  folder: '<path d="M2 4.5h4l1.2 1.5H14v6.2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5Z"/>',
  'folder-open': '<path d="M2 4.5h4l1.2 1.5H14v1H4.6L2 13V4.5Z"/><path d="M2 13l2.6-6H15l-2.6 6H2Z"/>',
  file: '<path d="M4 1.8h5l3 3V14H4V1.8Z"/><path d="M9 1.8V5h3"/>',
  image: '<rect x="2.2" y="3" width="11.6" height="10" rx="1.2"/><circle cx="5.8" cy="6.4" r="1.1"/><path d="M3 11.5l3.4-3 2.6 2.4 2-1.8 2 2.4"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2a1 1 0 0 0 1 .8h3.8a1 1 0 0 0 1-.8l.6-8.2"/>',
  edit: '<path d="M11.2 2.4 13.6 4.8 6 12.4l-3 .6.6-3 7.6-7.6Z"/>',
  upload: '<path d="M8 10.5V2.5M5 5.5 8 2.5l3 3"/><path d="M2.5 10v2.6a.9.9 0 0 0 .9.9h9.2a.9.9 0 0 0 .9-.9V10"/>',
  download: '<path d="M8 2.5v8M5 7.5l3 3 3-3"/><path d="M2.5 10v2.6a.9.9 0 0 0 .9.9h9.2a.9.9 0 0 0 .9-.9V10"/>',
  play: '<path d="M4.5 3.2 12.5 8l-8 4.8V3.2Z"/>',
  chevron: '<path d="M6 4l4 4-4 4"/>',
  'chevron-down': '<path d="M4 6l4 4 4-4"/>',
  more: '<circle cx="3.4" cy="8" r="1.1"/><circle cx="8" cy="8" r="1.1"/><circle cx="12.6" cy="8" r="1.1"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  'arrow-left': '<path d="M12.5 8h-9M7 4.5 3.5 8 7 11.5"/>',
  users: '<circle cx="6" cy="5.5" r="2.4"/><path d="M1.8 13.2c0-2.3 1.9-3.8 4.2-3.8s4.2 1.5 4.2 3.8"/><path d="M10.4 3.4a2.4 2.4 0 0 1 0 4.5M11.6 9.6c1.6.3 2.6 1.6 2.6 3.6"/>',
  log: '<path d="M3 3h10v10H3z"/><path d="M5 6h6M5 8.5h6M5 11h3.5"/>',
  settings: '<circle cx="8" cy="8" r="2.1"/><path d="M8 1.8v1.4M8 12.8v1.4M2.4 8h1.4M12.2 8h1.4M4.1 4.1l1 1M10.9 10.9l1 1M11.9 4.1l-1 1M5.1 10.9l-1 1"/>',
  check: '<path d="M3.2 8.4 6.4 11.6 12.8 4.8"/>',
  alert: '<path d="M8 2.4 14.4 13.6H1.6L8 2.4Z"/><path d="M8 6.4v3.2M8 11.5v.6"/>',
  external: '<path d="M9.5 2.5H13.5V6.5"/><path d="M13.5 2.5 7.2 8.8"/><path d="M11.5 9.5v3.2a.8.8 0 0 1-.8.8H3.3a.8.8 0 0 1-.8-.8V5.3a.8.8 0 0 1 .8-.8h3.2"/>',
  refresh: '<path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13.2 2v3.2H10"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.2"/><path d="M10.5 5.5V3.3a1 1 0 0 0-1-1H3.3a1 1 0 0 0-1 1V9.5a1 1 0 0 0 1 1h2.2"/>',
  logout: '<path d="M6 13.5H3.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H6"/><path d="M10 11l3-3-3-3M13 8H6"/>',
  key: '<circle cx="5.5" cy="8" r="2.6"/><path d="M8 8h6M11.5 8v2.4M13.4 8v2"/>',
  logo: '<path d="M2 3.5h12M8 3.5v9.8M5.2 13.3h5.6"/>',
  grid: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
  clock: '<circle cx="8" cy="8" r="5.8"/><path d="M8 4.6V8l2.4 1.5"/>',
  terminal: '<rect x="2.2" y="3" width="11.6" height="10" rx="1.2"/><path d="M4.8 6.4 6.6 8l-1.8 1.6M8.2 9.6h3"/>',
  book: '<path d="M2.4 3.2c1.9-.7 3.8-.6 5.6.4 1.8-1 3.7-1.1 5.6-.4v9.2c-1.9-.7-3.8-.6-5.6.4-1.8-1-3.7-1.1-5.6-.4V3.2Z"/><path d="M8 3.6v9.2"/>',
  shield: '<path d="M8 1.8 13 3.6v4.1c0 3-2 5.1-5 6.5-3-1.4-5-3.5-5-6.5V3.6L8 1.8Z"/><path d="M5.8 7.9 7.3 9.4l3-3"/>',
  github: '<path d="M8 1.6a6.4 6.4 0 0 0-2.03 12.47c.32.06.44-.14.44-.31v-1.2c-1.78.39-2.16-.76-2.16-.76-.29-.74-.71-.94-.71-.94-.58-.4.04-.39.04-.39.64.05.98.66.98.66.57.98 1.5.7 1.87.53.06-.41.22-.7.41-.86-1.42-.16-2.92-.71-2.92-3.17 0-.7.25-1.27.66-1.72-.07-.16-.29-.82.06-1.7 0 0 .54-.17 1.77.66a6.1 6.1 0 0 1 3.22 0c1.23-.83 1.77-.66 1.77-.66.35.88.13 1.54.06 1.7.41.45.66 1.02.66 1.72 0 2.47-1.5 3.01-2.93 3.17.23.2.44.59.44 1.2v1.78c0 .17.12.37.44.31A6.4 6.4 0 0 0 8 1.6Z"/>',
  archive: '<rect x="2.2" y="2.6" width="11.6" height="3" rx=".8"/><path d="M3.3 5.6v6.3a1.1 1.1 0 0 0 1.1 1.1h7.2a1.1 1.1 0 0 0 1.1-1.1V5.6M6.4 8.4h3.2"/>',
  message: '<path d="M2.5 3.2h11a.9.9 0 0 1 .9.9v6.6a.9.9 0 0 1-.9.9H7.8L4.6 14v-2.4h-2.1a.9.9 0 0 1-.9-.9V4.1a.9.9 0 0 1 .9-.9Z"/><path d="M5 6.6h6M5 9h3.6"/>',
  'arrow-right': '<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5"/>',
  frame: '<path d="M5 2v12M11 2v12M2 5h12M2 11h12"/><rect x="2" y="2" width="12" height="12" rx="1"/>',
};

export function icon(name, cls = 'icon') {
  const path = P[name] || P.file;
  return `<svg class="${cls}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function initials(name = '?') {
  const trimmed = String(name).trim();
  if (!trimmed) return '?';
  if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(-2);
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarHtml(user, size = '') {
  if (!user) return '';
  const cls = size ? `avatar ${size}` : 'avatar';
  return `<span class="${cls}" style="background:${user.color || '#16794a'}" title="${escapeHtml(user.name)}">${escapeHtml(initials(user.name))}</span>`;
}

export function timeAgo(ts) {
  const diff = Date.now() - Number(ts || 0);
  const min = 60 * 1000, hour = 60 * min, day = 24 * hour;
  if (diff < min) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 2 * day) return '昨天';
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  const d = new Date(Number(ts));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function toast(message, type = '') {
  const host = document.getElementById('toasts');
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `${icon(type === 'err' ? 'alert' : 'check', 'icon')}<span>${escapeHtml(message)}</span>`;
  host.appendChild(node);
  setTimeout(() => {
    node.style.transition = 'opacity .25s, transform .25s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 260);
  }, type === 'err' ? 4000 : 2400);
}

/** 通用模态框，返回 {close} */
export function modal({ title, subtitle = '', bodyHtml, footerHtml, wide = false, onMount }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  backdrop.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h3>${escapeHtml(title)}</h3>
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-foot">${footerHtml}</div>` : ''}
    </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
  if (onMount) onMount(backdrop, close);
  return { root: backdrop, close };
}

export function confirmDialog({ title, message, confirmText = '确定', danger = false }) {
  return new Promise((resolve) => {
    const { root, close } = modal({
      title,
      bodyHtml: `<p style="margin:0;color:var(--text-2);font-size:13.5px">${escapeHtml(message)}</p>`,
      footerHtml: `<button class="btn" data-act="cancel">取消</button>
                   <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${escapeHtml(confirmText)}</button>`,
    });
    const done = (value) => { close(); resolve(value); };
    root.querySelector('[data-act="cancel"]').onclick = () => done(false);
    root.querySelector('[data-act="ok"]').onclick = () => done(true);
    root.querySelector('[data-act="ok"]').focus();
  });
}

export function promptDialog({ title, label, value = '', placeholder = '', confirmText = '确定', selectBasename = false }) {
  return new Promise((resolve) => {
    const { root, close } = modal({
      title,
      bodyHtml: `<div class="field" style="margin:0"><label>${escapeHtml(label)}</label>
        <input class="input" id="prompt-input" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" /></div>`,
      footerHtml: `<button class="btn" data-act="cancel">取消</button>
                   <button class="btn btn-primary" data-act="ok">${escapeHtml(confirmText)}</button>`,
    });
    const input = root.querySelector('#prompt-input');
    input.focus();
    if (selectBasename) {
      const base = value.replace(/\.[^.]+$/, '');
      input.setSelectionRange(0, base.length);
    } else {
      input.select();
    }
    const done = (v) => { close(); resolve(v); };
    root.querySelector('[data-act="cancel"]').onclick = () => done(null);
    root.querySelector('[data-act="ok"]').onclick = () => done(input.value.trim() || null);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(input.value.trim() || null);
    });
  });
}

let openMenu = null;
export function closeMenu() {
  if (openMenu) { openMenu.remove(); openMenu = null; }
}
document.addEventListener('mousedown', (e) => {
  if (openMenu && !openMenu.contains(e.target)) closeMenu();
});

export function dropdown(anchor, items, { align = 'right' } = {}) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'dropdown';
  menu.innerHTML = items.map((item) => {
    if (item.sep) return '<div class="sep"></div>';
    if (item.meta) return `<div class="meta"><b>${escapeHtml(item.meta.title)}</b><span>${escapeHtml(item.meta.sub || '')}</span></div>`;
    return `<button data-key="${escapeHtml(item.key)}" class="${item.danger ? 'danger' : ''}">
      ${item.icon ? icon(item.icon) : ''}<span>${escapeHtml(item.label)}</span></button>`;
  }).join('');
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  let left = align === 'right' ? rect.right - width : rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
  let top = rect.bottom + 6;
  if (top + menu.offsetHeight > window.innerHeight - 8) top = Math.max(8, rect.top - menu.offsetHeight - 6);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-key]');
    if (!btn) return;
    const item = items.find((i) => i.key === btn.dataset.key);
    closeMenu();
    if (item?.onClick) item.onClick();
  });
  openMenu = menu;
  return menu;
}

export function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
