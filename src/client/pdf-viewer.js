/**
 * 轻量 PDF 渲染器：用 PDF.js 把页面画到 canvas 上，
 * 不使用浏览器自带的 PDF 插件界面（无工具栏、无缩略图侧栏、无浏览器菜单）。
 */
import './pdf-polyfill.js';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.min.mjs';
const STANDARD_FONT_URL = '/assets/standard_fonts/';
const CMAP_URL = '/assets/cmaps/';
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

export function createPdfViewer(host, { emptyEl = null, onState = () => {}, onPagesRendered = () => {} } = {}) {
  const pages = document.createElement('div');
  pages.className = 'pdf-pages';
  host.appendChild(pages);

  let pdf = null;
  let generation = 0;
  let zoom = 1;
  let pageCount = 0;
  let lastUrl = null;
  let renderTasks = [];
  let destroyed = false;
  let resizeTimer = null;
  let observer = null;

  const state = () => ({ zoom, pageCount, loading: false, error: null });
  const emit = (extra = {}) => onState({ ...state(), ...extra });

  function cancelRenders() {
    for (const task of renderTasks) {
      try { task.cancel(); } catch { /* ignore */ }
    }
    renderTasks = [];
  }

  function showNote(html, isError = false) {
    pages.innerHTML = `<div class="pdf-viewer-note ${isError ? 'error' : ''}">${html}</div>`;
  }

  function setEmpty(show) {
    if (emptyEl) emptyEl.style.display = show ? '' : 'none';
  }

  function computeScale(pdfDoc) {
    return pdfDoc.getPage(1).then((page) => {
      const baseWidth = page.getViewport({ scale: 1 }).width || 595;
      const available = Math.max(180, host.clientWidth - 44);
      return Math.min(2.4, Math.max(0.25, available / baseWidth));
    });
  }

  async function renderAll(gen) {
    if (!pdf || destroyed) return;
    const scrollTop = pages.scrollTop;
    cancelRenders();
    const fitScale = await computeScale(pdf);
    if (gen !== generation || destroyed) return;
    const scale = fitScale * zoom;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    pages.innerHTML = '';

    for (let i = 1; i <= pageCount; i++) {
      if (gen !== generation || destroyed) return;
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const width = Math.floor(viewport.width);
      const height = Math.floor(viewport.height);

      const wrapper = document.createElement('div');
      wrapper.className = 'pdf-page';
      wrapper.dataset.page = String(i);
      wrapper.style.position = 'relative';
      wrapper.style.width = `${width}px`;
      wrapper.style.height = `${height}px`;
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.setAttribute('aria-label', `第 ${i} 页`);
      wrapper.appendChild(canvas);
      pages.appendChild(wrapper);

      const ctx = canvas.getContext('2d', { alpha: false });
      const task = page.render({
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
        background: '#ffffff',
      });
      renderTasks.push(task);
      try {
        await task.promise;
      } catch (err) {
        if (gen !== generation || err?.name === 'RenderingCancelledException') return;
        throw err;
      }
    }
    pages.scrollTop = scrollTop;
    emit();
    // 页面 DOM 已重建（加载 / 缩放 / 窗口变化），通知外部重绘评论框选标记
    try { onPagesRendered(); } catch { /* ignore */ }
  }

  async function load(url, { force = false } = {}) {
    if (destroyed) return;
    if (!url) {
      generation += 1;
      cancelRenders();
      lastUrl = null;
      pdf?.destroy?.().catch?.(() => {});
      pdf = null;
      pageCount = 0;
      pages.innerHTML = '';
      setEmpty(true);
      emit();
      return;
    }
    if (url === lastUrl && !force) return;

    const gen = ++generation;
    cancelRenders();
    lastUrl = url;
    setEmpty(false);
    showNote('<span class="spinner spinner-dark"></span><span>正在渲染 PDF…</span>');
    emit({ loading: true });

    try {
      if (pdf) {
        try { await pdf.destroy(); } catch { /* ignore */ }
        pdf = null;
      }
      const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error(`PDF 加载失败 (${res.status})`);
      const data = new Uint8Array(await res.arrayBuffer());
      if (gen !== generation || destroyed) return;

      pdf = await pdfjsLib.getDocument({
        data,
        standardFontDataUrl: STANDARD_FONT_URL,
        cMapUrl: CMAP_URL,
        cMapPacked: true,
        useSystemFonts: false,
      }).promise;
      if (gen !== generation || destroyed) {
        pdf.destroy();
        pdf = null;
        return;
      }
      pageCount = pdf.numPages;
      await renderAll(gen);
    } catch (err) {
      if (gen !== generation || destroyed) return;
      pageCount = 0;
      showNote(`<div style="text-align:center">PDF 渲染失败：${String(err.message || err)}<br />
        <a href="${url}" target="_blank" rel="noopener" style="color:var(--primary)">在新标签页打开原文件</a></div>`, true);
      emit({ error: String(err.message || err) });
    }
  }

  function setZoom(next) {
    const value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    if (Math.abs(value - zoom) < 0.01) return;
    zoom = value;
    if (pdf) renderAll(++generation);
    emit();
  }

  function zoomBy(delta) {
    setZoom(Math.round((zoom + delta) * 100) / 100);
  }

  if (typeof ResizeObserver !== 'undefined') {
    let lastWidth = host.clientWidth;
    observer = new ResizeObserver(() => {
      const width = host.clientWidth;
      if (!pdf || Math.abs(width - lastWidth) < 12) return;
      lastWidth = width;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!destroyed && pdf) renderAll(++generation);
      }, 220);
    });
    observer.observe(host);
  }

  emit();

  return {
    load,
    setZoom,
    zoomBy,
    getZoom: () => zoom,
    getPageCount: () => pageCount,
    getPageElement: (n) => pages.querySelector(`.pdf-page[data-page="${n}"]`),
    getPagesElement: () => pages,
    onPagesRendered,
    destroy() {
      destroyed = true;
      generation += 1;
      clearTimeout(resizeTimer);
      observer?.disconnect();
      cancelRenders();
      try { pdf?.destroy?.(); } catch { /* ignore */ }
      pdf = null;
      pages.remove();
    },
  };
}
