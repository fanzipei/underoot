import{pdfRevision,textIndex,capturePdfAnchor,resolvePdfAnchor}from'../shared/pdf-anchors.js';
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

  let pdf = null;let revision=null,indexes=new Map();
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
      const data = new Uint8Array(await res.arrayBuffer());revision=pdfRevision(data);indexes=new Map();
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

  function sampleImage(canvas,r){if(!canvas)return{};const c=document.createElement('canvas');c.width=9;c.height=8;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,r.x*canvas.width,r.y*canvas.height,r.w*canvas.width,r.h*canvas.height,0,0,9,8);const pixels=ctx.getImageData(0,0,9,8).data,values=Array.from({length:72},(_,i)=>(pixels[i*4]+pixels[i*4+1]+pixels[i*4+2])/3),mean=values.reduce((a,b)=>a+b,0)/72;let hash='';for(let y=0;y<8;y++)for(let x=0;x<8;x++)hash+=values[y*9+x]>values[y*9+x+1]?'1':'0';return{hash,mean,contrast:Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/72)};}
  async function pageIndex(number){
   if(indexes.has(number))return indexes.get(number);const document=pdf,currentRevision=revision;const work=(async()=>{const page=await document.getPage(number),v=page.getViewport({scale:1}),content=await page.getTextContent();const items=content.items.filter(i=>i.str&&i.width).map(i=>{const m=pdfjsLib.Util.transform(v.transform,i.transform),h=Math.hypot(m[2],m[3])||i.height||10;return{str:i.str,x:Math.max(0,m[4]/v.width),y:Math.max(0,(m[5]-h)/v.height),w:Math.min(1,i.width/v.width),h:Math.min(1,h/v.height)};});const index={...textIndex(items),page:number,width:v.width,height:v.height,images:[]};
    try{const list=await page.getOperatorList(),stack=[];let m=[1,0,0,1,0,0];const canvas=pages.querySelector(`.pdf-page[data-page="${number}"] canvas`);for(let i=0;i<Math.min(list.fnArray.length,100000);i++){const op=list.fnArray[i],a=list.argsArray[i];if(op===pdfjsLib.OPS.save)stack.push([...m]);else if(op===pdfjsLib.OPS.restore)m=stack.pop()||[1,0,0,1,0,0];else if(op===pdfjsLib.OPS.transform)m=pdfjsLib.Util.transform(m,a);else if(op===pdfjsLib.OPS.paintFormXObjectBegin){stack.push([...m]);if(a?.[0])m=pdfjsLib.Util.transform(m,a[0]);}else if(op===pdfjsLib.OPS.paintFormXObjectEnd)m=stack.pop()||m;else if(op===pdfjsLib.OPS.paintImageXObject||op===pdfjsLib.OPS.paintInlineImageXObject){const t=pdfjsLib.Util.transform(v.transform,m),points=[[0,0],[1,0],[0,1],[1,1]].map(p=>{ /* PDF.js mutates this point in place. */ pdfjsLib.Util.applyTransform(p,t);return p;}),x=Math.max(0,Math.min(...points.map(p=>p[0]))/v.width),y=Math.max(0,Math.min(...points.map(p=>p[1]))/v.height),w=Math.min(1-x,(Math.max(...points.map(p=>p[0]))/v.width)-x),h=Math.min(1-y,(Math.max(...points.map(p=>p[1]))/v.height)-y);if(w>.025&&h>.02&&index.images.length<150){const r={x,y,w,h};index.images.push({...r,aspect:w*v.width/(h*v.height),...sampleImage(canvas,r)});}}}}
    catch{/* Keep text/source association when raster extraction is unavailable. */}if(currentRevision!==revision)throw Error('PDF 已更新，请重新定位');return index;})();indexes.set(number,work);try{return await work;}catch(e){indexes.delete(number);throw e;}
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
    getRevision:()=>revision,
    async captureAnchor(pageNumber,rect){if(!pdf)throw Error('请先显示 PDF');const index=await pageIndex(pageNumber);return{...capturePdfAnchor(index,pageNumber,rect,revision),width:index.width,height:index.height};},
    async resolveAnchors(comments){if(!pdf)return new Map();const document=pdf,rev=revision,list=comments.filter(c=>c.anchorType==='pdf'&&c.pdfAnchor),result=new Map();if(!list.length)return result;const loaded=[];for(let i=1;i<=Math.min(pageCount,300);i++){if(pdf!==document)return new Map();loaded.push(await pageIndex(i));}for(const c of list)result.set(c.id,resolvePdfAnchor(c.pdfAnchor,loaded,rev));return result;},
    async pageSize(number){const i=await pageIndex(number);return{width:i.width,height:i.height};},
    async getRegionContext(pageNumber, rect) {
      if (!pdf) throw new Error('请先编译并显示 PDF');
      const document = pdf;
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const text = await page.getTextContent();
      const selected = text.items.filter((item) => {
        if (!item.str) return false;
        const point = pdfjsLib.Util.transform(viewport.transform, item.transform);
        const x = point[4] / viewport.width;
        const y = point[5] / viewport.height;
        const w = item.width / viewport.width;
        const h = (item.height || 10) / viewport.height;
        return x + w >= rect.x && x <= rect.x + rect.w && y >= rect.y && y - h <= rect.y + rect.h;
      }).map((item) => item.str).join(' ');
      const canvas = pages.querySelector(`.pdf-page[data-page="${pageNumber}"] canvas`);
      let image = null;
      if (canvas) {
        const crop = window.document.createElement('canvas');
        const sourceWidth = Math.max(1, canvas.width * rect.w);
        const sourceHeight = Math.max(1, canvas.height * rect.h);
        const scale = Math.min(1, 1400 / Math.max(sourceWidth, sourceHeight));
        crop.width = Math.max(1, Math.round(sourceWidth * scale)); crop.height = Math.max(1, Math.round(sourceHeight * scale));
        crop.getContext('2d').drawImage(canvas, canvas.width * rect.x, canvas.height * rect.y, sourceWidth, sourceHeight, 0, 0, crop.width, crop.height);
        image = crop.toDataURL('image/png');
      }
      return { text: selected, image, page: pageNumber, rect };
    },
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
