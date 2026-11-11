/**
 * 协作评论（含 Overleaf 没有的 PDF 圈选评论）
 *
 * 两类锚点：
 *  - source：CodeMirror 里选中的一段文字（文件路径 + 字符偏移 + 原文引用）
 *  - pdf：在右侧 PDF 页面上用鼠标拖出的矩形（页码 + 归一化坐标，缩放不失效）
 *
 * 评论线程（多人回复）、解决 / 重新打开、删除，均走 REST；
 * 在线成员通过项目事件通道收到 comment:changed 后重新拉取列表。
 */
import { EditorView, Decoration } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import { api } from '../api.js';
import {
  icon, escapeHtml, avatarHtml, timeAgo, toast, modal, confirmDialog,
} from '../ui.js';

const setCommentsEffect = StateEffect.define();
const MAX_QUOTE = 140;

function sourceDecorations(state, comments, activePath) {
  if (!comments.length) return Decoration.none;
  const len = state.doc.length;
  const ranges = [];
  for (const c of comments) {
    if (c.anchorType !== 'source' || c.path !== activePath) continue;
    let from = Number(c.from) || 0;
    let to = Number(c.to) || 0;
    // 协作编辑后偏移可能漂移：优先用引用文本在当前文档中重新定位
    if (c.quote && state.doc.sliceString(from, to) !== c.quote) {
      const found = state.doc.toString().indexOf(c.quote);
      if (found >= 0) { from = found; to = found + c.quote.length; }
    }
    from = Math.max(0, Math.min(len, from));
    to = Math.max(from, Math.min(len, to));
    if (to <= from) continue;
    ranges.push(Decoration.mark({
      class: `cm-comment-range${c.resolved ? ' resolved' : ''}`,
      attributes: { 'data-comment-id': c.id, title: c.body.slice(0, 80) },
    }).range(from, to));
    // 起始行加一个左侧色条，便于长文档里找到评论
    const line = state.doc.lineAt(from);
    ranges.push(Decoration.line({
      class: `cm-comment-line${c.resolved ? ' resolved' : ''}`,
      attributes: { 'data-comment-id': c.id },
    }).range(line.from));
  }
  ranges.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  try { return Decoration.set(ranges, true); } catch { return Decoration.none; }
}

const commentField = StateField.define({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setCommentsEffect)) {
        return sourceDecorations(tr.state, e.value.comments || [], e.value.activePath);
      }
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function createComments({
  root, projectId, user, view, pdfViewer,
  getActivePath, openFile, onCount,
}) {
  let comments = [];
  let filter = 'open';           // open | all
  let expanded = new Set();
  let panelOpen = false;
  let selectMode = false;
  let destroyed = false;

  const base = `/api/projects/${projectId}/comments`;
  const panel = root.querySelector('#comments-panel');
  const host = root.querySelector('#ed-host');
  const pdfToggleBtn = root.querySelector('#pdf-comment-select');
  const toolbarBtn = root.querySelector('#btn-comments');

  /* ---------- 浮动「+ 评论」按钮（源码选区） ---------- */
  // 挂在 body 上并用 fixed 定位：切换二进制预览会清空 .ed-host，宿主会被移除
  const floatBtn = document.createElement('button');
  floatBtn.className = 'cm-comment-add';
  floatBtn.type = 'button';
  floatBtn.innerHTML = `${icon('message')}<span>添加评论</span>`;
  floatBtn.style.display = 'none';
  document.body.appendChild(floatBtn);

  function updateFloatButton() {
    const sel = view.state.selection.main;
    if (!host.isConnected || !view.dom.isConnected || !selectablePath() || sel.empty) {
      floatBtn.style.display = 'none'; return;
    }
    const quote = view.state.doc.sliceString(sel.from, sel.to).trim();
    if (!quote) { floatBtn.style.display = 'none'; return; }
    const coords = view.coordsAtPos(sel.to);
    if (!coords) { floatBtn.style.display = 'none'; return; }
    floatBtn.style.display = 'flex';
    floatBtn.style.left = `${Math.max(4, Math.min(window.innerWidth - 130, coords.left + 8))}px`;
    floatBtn.style.top = `${Math.max(4, Math.min(window.innerHeight - 36, coords.bottom + 6))}px`;
    floatBtn.dataset.from = String(sel.from);
    floatBtn.dataset.to = String(sel.to);
  }

  const selectablePath = () => {
    const p = getActivePath();
    return p && !/\.(png|jpe?g|gif|svg|webp|bmp|pdf)$/i.test(p);
  };

  floatBtn.onclick = () => {
    const sel = view.state.selection.main;
    if (sel.empty) return;
    const quote = view.state.doc.sliceString(sel.from, sel.to);
    promptComment('给选中的文字添加评论', quote, async (text) => {
      await api.post(base, {
        body: text,
        anchorType: 'source',
        path: getActivePath(),
        from: sel.from,
        to: sel.to,
        quote: quote.slice(0, 500),
      });
      await load();
      openPanel();
      toast('评论已添加', 'ok');
    });
  };

  /* ---------- CodeMirror 扩展 ---------- */
  const extension = [
    commentField,
    EditorView.domEventHandlers({
      mousedown(event) {
        const el = event.target.closest?.('.cm-comment-range, .cm-comment-line');
        if (!el) return false;
        const id = el.dataset.commentId;
        if (id) { openPanel(); focusThread(id); }
        return false;
      },
    }),
    EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged) updateFloatButton();
    }),
  ];

  function refreshDecorations() {
    view.dispatch({ effects: setCommentsEffect.of({ comments, activePath: getActivePath() }) });
  }

  /* ---------- PDF 圈选 ---------- */
  let drag = null;

  function rectFromEvent(wrapper, e) {
    const box = wrapper.getBoundingClientRect();
    return {
      x: (e.clientX - box.left) / box.width,
      y: (e.clientY - box.top) / box.height,
    };
  }

  function onPointerDown(e) {
    if (!selectMode || e.button !== 0) return;
    const layer = e.currentTarget;
    const wrapper = layer.parentElement;   // .pdf-page 才是坐标与页码的来源
    if (!wrapper?.dataset.page) return;
    const start = rectFromEvent(wrapper, e);
    const box = document.createElement('div');
    box.className = 'pdf-select-rect';
    layer.appendChild(box);
    drag = { wrapper, layer, start, box };
    layer.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!drag) return;
    const now = rectFromEvent(drag.wrapper, e);
    const x1 = Math.max(0, Math.min(1, drag.start.x));
    const y1 = Math.max(0, Math.min(1, drag.start.y));
    const x2 = Math.max(0, Math.min(1, now.x));
    const y2 = Math.max(0, Math.min(1, now.y));
    const r = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
    Object.assign(drag.box.style, {
      left: `${r.x * 100}%`, top: `${r.y * 100}%`,
      width: `${r.w * 100}%`, height: `${r.h * 100}%`,
    });
    drag.rect = r;
  }

  function onPointerUp(e) {
    if (!drag) return;
    const { rect, wrapper, layer, box } = drag;
    box?.remove();
    drag = null;
    try { layer.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    // 太小的拖拽视为误触
    if (!rect || rect.w < 0.008 || rect.h < 0.008) return;
    const page = Number(wrapper.dataset.page);
    promptComment(`给第 ${page} 页的圈选区域添加评论`, null, async (text) => {
      await api.post(base, { body: text, anchorType: 'pdf', page, rect });
      await load();
      openPanel();
      toast('圈选评论已添加', 'ok');
    });
  }

  function paintPdfMarks() {
    if (!pdfViewer) return;
    const pagesEl = pdfViewer.getPagesElement?.();
    if (!pagesEl) return;
    pagesEl.querySelectorAll('.pdf-comment-layer').forEach((layer) => {
      layer.querySelectorAll('.pdf-comment-mark, .pdf-select-rect').forEach((n) => n.remove());
      layer.classList.toggle('selectable', selectMode);
      // 重新绑定（页面可能刚重建）
      const wrapper = layer.parentElement;
      layer.onpointerdown = onPointerDown;
      layer.onpointermove = onPointerMove;
      layer.onpointerup = onPointerUp;
      wrapper.dataset.hasLayer = '1';
    });
    // 为尚未建层的页面补一层
    pagesEl.querySelectorAll('.pdf-page').forEach((wrapper) => {
      if (wrapper.querySelector('.pdf-comment-layer')) return;
      const layer = document.createElement('div');
      layer.className = 'pdf-comment-layer';
      layer.classList.toggle('selectable', selectMode);
      layer.onpointerdown = onPointerDown;
      layer.onpointermove = onPointerMove;
      layer.onpointerup = onPointerUp;
      wrapper.appendChild(layer);
    });
    comments.filter((c) => c.anchorType === 'pdf' && c.rect).forEach((c, idx) => {
      const wrapper = pdfViewer.getPageElement?.(c.page);
      if (!wrapper) return;
      const layer = wrapper.querySelector('.pdf-comment-layer');
      if (!layer) return;
      const mark = document.createElement('button');
      mark.type = 'button';
      mark.className = `pdf-comment-mark${c.resolved ? ' resolved' : ''}`;
      mark.style.left = `${c.rect.x * 100}%`;
      mark.style.top = `${c.rect.y * 100}%`;
      mark.style.width = `${c.rect.w * 100}%`;
      mark.style.height = `${c.rect.h * 100}%`;
      mark.title = `${c.authorName}：${c.body.slice(0, 80)}`;
      const badge = document.createElement('span');
      badge.className = 'pdf-comment-badge';
      badge.textContent = String(idx + 1);
      mark.appendChild(badge);
      mark.onclick = (e) => { e.stopPropagation(); openPanel(); focusThread(c.id); };
      layer.appendChild(mark);
    });
  }

  function setSelectMode(on) {
    selectMode = !!on;
    pdfToggleBtn?.classList.toggle('active', selectMode);
    if (pdfToggleBtn) pdfToggleBtn.title = selectMode ? '退出圈选评论' : '圈选 PDF 区域添加评论';
    paintPdfMarks();
    if (selectMode) {
      root.querySelector('#pane-pdf').style.display = 'flex';
      toast('在 PDF 上按住鼠标拖出一个区域即可添加评论', 'ok');
    }
  }

  /* ---------- 新建评论输入框 ---------- */
  function promptComment(title, quote, submit) {
    const quoteHtml = quote
      ? `<div class="comment-quote">${escapeHtml(quote.slice(0, MAX_QUOTE))}${quote.length > MAX_QUOTE ? '…' : ''}</div>`
      : '';
    const { root: m, close } = modal({
      title,
      bodyHtml: `${quoteHtml}<div class="field" style="margin:0">
        <label>评论内容</label>
        <textarea class="input" id="comment-input" rows="4" maxlength="8000" placeholder="写下你的意见，其他成员可以回复…"></textarea>
      </div>`,
      footerHtml: '<button class="btn" data-act="cancel">取消</button><button class="btn btn-primary" data-act="ok">添加评论</button>',
      onMount: (backdrop) => {
        backdrop.querySelector('#comment-input')?.focus();
      },
    });
    const input = m.querySelector('#comment-input');
    m.querySelector('[data-act="cancel"]').onclick = close;
    m.querySelector('[data-act="ok"]').onclick = async () => {
      const text = String(input.value || '').trim();
      if (!text) { toast('请输入评论内容', 'err'); input.focus(); return; }
      const btn = m.querySelector('[data-act="ok"]');
      btn.disabled = true;
      try {
        await submit(text);
        close();
      } catch (err) {
        toast(err.message, 'err');
        btn.disabled = false;
      }
    };
  }

  /* ---------- 面板渲染 ---------- */
  function openPanel() { panelOpen = true; panel.classList.add('open'); paint(); }
  function closePanel() { panelOpen = false; panel.classList.remove('open'); }
  function togglePanel() { panelOpen ? closePanel() : openPanel(); }

  function anchorLabel(c) {
    return c.anchorType === 'pdf'
      ? `PDF 第 ${c.page} 页 · 圈选区域`
      : `${escapeHtml(c.path || '')}${c.from != null ? ` · 第 ${c.from} 字符` : ''}`;
  }

  function threadHtml(c, index) {
    const isOpen = expanded.has(c.id);
    const canDelete = c.authorId === user.id || c.authorEmail === user.email;
    const replies = c.replies.length;
    return `
      <div class="comment-thread${c.resolved ? ' resolved' : ''}${isOpen ? ' expanded' : ''}" data-id="${c.id}">
        <div class="comment-main" data-act="toggle" data-id="${c.id}">
          <div class="comment-avatar">${avatarHtml({ name: c.authorName, color: c.authorColor }, 'sm')}</div>
          <div class="comment-content">
            <div class="comment-meta"><b>${escapeHtml(c.authorName)}</b><span>${timeAgo(c.createdAt)}</span></div>
            <div class="comment-body">${escapeHtml(c.body)}</div>
            <div class="comment-anchor">${icon(c.anchorType === 'pdf' ? 'file' : 'file')}${anchorLabel(c)}</div>
            ${c.quote ? `<div class="comment-quote small">${escapeHtml(c.quote.slice(0, 90))}${c.quote.length > 90 ? '…' : ''}</div>` : ''}
            <div class="comment-stats">${icon('message')}${replies ? `${replies} 条回复` : '暂无回复'}${c.resolved ? '<span class="badge badge-green">已解决</span>' : ''}</div>
          </div>
          <span class="comment-index">${index + 1}</span>
        </div>
        ${isOpen ? `
          <div class="comment-replies">
            ${c.replies.map((r) => `
              <div class="comment-reply">
                ${avatarHtml({ name: r.authorName, color: r.authorColor }, 'sm')}
                <div><div class="comment-meta"><b>${escapeHtml(r.authorName)}</b><span>${timeAgo(r.createdAt)}</span></div>
                <div class="comment-body">${escapeHtml(r.body)}</div></div>
              </div>`).join('')}
            <div class="comment-reply-form">
              <input class="input" data-reply="${c.id}" placeholder="回复 ${escapeHtml(c.authorName)}…" maxlength="8000" />
              <button class="btn btn-primary btn-sm" data-act="reply" data-id="${c.id}">发送</button>
            </div>
            <div class="comment-actions">
              <button class="btn btn-ghost btn-sm" data-act="locate" data-id="${c.id}">${icon('arrow-right')}定位</button>
              <button class="btn btn-ghost btn-sm" data-act="resolve" data-id="${c.id}">${c.resolved ? '重新打开' : '标记已解决'}</button>
              ${canDelete ? `<button class="btn btn-ghost btn-sm danger-text" data-act="delete" data-id="${c.id}">删除</button>` : ''}
            </div>
          </div>` : ''}
      </div>`;
  }

  function paint() {
    if (!panelOpen) { paintBadge(); return; }
    const shown = filter === 'all' ? comments : comments.filter((c) => !c.resolved);
    panel.innerHTML = `
      <div class="comments-head">
        <b>${icon('message')}评论 <span class="comments-count">${comments.length}</span></b>
        <div class="spacer"></div>
        <button class="btn btn-ghost btn-icon btn-sm" id="comments-close" title="关闭">${icon('close')}</button>
      </div>
      <div class="comments-filters">
        <button data-filter="open" class="${filter === 'open' ? 'active' : ''}">未解决 ${comments.filter((c) => !c.resolved).length}</button>
        <button data-filter="all" class="${filter === 'all' ? 'active' : ''}">全部 ${comments.length}</button>
      </div>
      <div class="comments-list">
        ${shown.length ? shown.map((c, i) => threadHtml(c, i)).join('')
          : `<div class="comments-empty">${comments.length ? '未解决的评论都处理完了 🎉' : '还没有评论。<br />在左侧文件里选中一段文字，或点 PDF 工具栏的框选按钮圈一块区域。'}</div>`}
      </div>
      <div class="comments-foot">选中文字 →「添加评论」；PDF 圈选 → 拖出区域</div>`;

    panel.querySelector('#comments-close').onclick = closePanel;
    panel.querySelectorAll('[data-filter]').forEach((b) => {
      b.onclick = () => { filter = b.dataset.filter; paint(); };
    });
    panel.querySelectorAll('[data-act="toggle"]').forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.id;
        expanded.has(id) ? expanded.delete(id) : expanded.add(id);
        paint();
      };
    });
    panel.querySelectorAll('[data-act="locate"]').forEach((b) => { b.onclick = () => locate(b.dataset.id); });
    panel.querySelectorAll('[data-act="resolve"]').forEach((b) => { b.onclick = () => toggleResolve(b.dataset.id); });
    panel.querySelectorAll('[data-act="delete"]').forEach((b) => { b.onclick = () => remove(b.dataset.id); });
    panel.querySelectorAll('[data-act="reply"]').forEach((b) => { b.onclick = () => sendReply(b.dataset.id); });
    panel.querySelectorAll('[data-reply]').forEach((inp) => {
      inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(inp.dataset.reply); } };
    });
    paintBadge();
  }

  function paintBadge() {
    if (!toolbarBtn) return;
    const n = comments.filter((c) => !c.resolved).length;
    let badge = toolbarBtn.querySelector('.comments-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'comments-badge';
      toolbarBtn.appendChild(badge);
    }
    badge.textContent = n ? String(n) : '';
    badge.style.display = n ? '' : 'none';
    onCount?.(n);
  }

  function focusThread(id) {
    expanded.add(id);
    filter = 'all';
    paint();
    const el = panel.querySelector(`.comment-thread[data-id="${id}"]`);
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    el?.classList.add('flash');
    setTimeout(() => el?.classList.remove('flash'), 1200);
  }

  /* ---------- 动作 ---------- */
  async function locate(id) {
    const c = comments.find((x) => x.id === id);
    if (!c) return;
    if (c.anchorType === 'pdf') {
      const wrapper = pdfViewer?.getPageElement?.(c.page);
      if (!wrapper) { toast('请先编译生成 PDF 预览', 'err'); return; }
      root.querySelector('#pane-pdf').style.display = 'flex';
      wrapper.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const mark = wrapper.querySelector(`.pdf-comment-mark[title*="${c.id}"]`) || wrapper.querySelector('.pdf-comment-mark');
      mark?.classList.add('flash');
      setTimeout(() => mark?.classList.remove('flash'), 1200);
      return;
    }
    if (c.path && c.path !== getActivePath()) {
      try { await openFile(c.path); } catch { /* ignore */ }
    }
    let from = Number(c.from) || 0;
    let to = Number(c.to) || from;
    if (c.quote && view.state.doc.sliceString(from, to) !== c.quote) {
      const found = view.state.doc.toString().indexOf(c.quote);
      if (found >= 0) { from = found; to = found + c.quote.length; }
    }
    from = Math.min(from, view.state.doc.length);
    to = Math.min(Math.max(from, to), view.state.doc.length);
    view.dispatch({
      selection: { anchor: from, head: to },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    });
    view.focus();
    refreshDecorations();
  }

  async function toggleResolve(id) {
    const c = comments.find((x) => x.id === id);
    if (!c) return;
    try {
      await api.patch(`${base}/${id}`, { resolved: !c.resolved });
      await load();
      toast(c.resolved ? '已重新打开' : '已标记解决', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  async function sendReply(id) {
    const input = panel.querySelector(`[data-reply="${id}"]`);
    const text = String(input?.value || '').trim();
    if (!text) { input?.focus(); return; }
    try {
      input.disabled = true;
      await api.post(`${base}/${id}/replies`, { body: text });
      await load();
      expanded.add(id);
      paint();
    } catch (err) { toast(err.message, 'err'); input.disabled = false; }
  }

  async function remove(id) {
    const ok = await confirmDialog({
      title: '删除评论',
      message: '将删除这条评论及其所有回复，其他成员也会同步移除。',
      confirmText: '删除', danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`${base}/${id}`);
      expanded.delete(id);
      await load();
      toast('评论已删除', 'ok');
    } catch (err) { toast(err.message, 'err'); }
  }

  /* ---------- 数据 ---------- */
  async function load() {
    if (destroyed) return;
    try {
      const data = await api.get(base);
      comments = data.comments || [];
      refreshDecorations();
      paintPdfMarks();
      paint();
    } catch { /* 离线时保留已有列表 */ }
  }

  function handleEvent(msg) {
    if (msg?.type === 'comment:changed') load();
  }

  if (pdfToggleBtn) pdfToggleBtn.onclick = () => setSelectMode(!selectMode);
  if (toolbarBtn) toolbarBtn.onclick = togglePanel;

  return {
    extension,
    load,
    handleEvent,
    openPanel,
    closePanel,
    togglePanel,
    setSelectMode,
    refreshDecorations,
    repaintPdf: paintPdfMarks,
    onActivePathChange() { refreshDecorations(); updateFloatButton(); },
    getCount: () => comments.filter((c) => !c.resolved).length,
    destroy() {
      destroyed = true;
      floatBtn.remove();
      panel.classList.remove('open');
    },
  };
}
