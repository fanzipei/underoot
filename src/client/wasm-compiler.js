import { wasmDiagnostics } from './wasm-diagnostics.js';
/** SwiftLaTeX pdfTeX in a reusable Worker; no source is sent to a compiler service. */
export class BrowserTeX {
 constructor() { this.worker = null; this.ready = null; this.waiter = null; }
 destroy() { this.worker?.terminate(); this.worker = null; this.ready = null; this.waiter?.reject(new Error('本地编译已取消')); this.waiter = null; }
 async load() {
  if (this.ready) return this.ready;
  this.ready = new Promise((resolve, reject) => {
   const worker = this.worker = new Worker('/wasm/pdftex/swiftlatexpdftex.js');
   const timeout = setTimeout(() => { this.destroy(); reject(new Error('WASM 引擎加载超时')); }, 30000);
   worker.onerror = () => { clearTimeout(timeout); this.destroy(); reject(new Error('无法启动 WASM 引擎，请确认浏览器支持 WebAssembly 和站点安全策略')); };
   worker.onmessage = ({ data }) => {
    if (!data.cmd && data.result === 'ok') { clearTimeout(timeout); worker.postMessage({ cmd: 'settexliveurl', url: location.origin + '/api/wasm/texlive/v2/' }); resolve(); }
    else if (data.cmd === 'compile' && this.waiter) { const wait = this.waiter; this.waiter = null; data.result === 'ok' ? wait.resolve(data) : wait.reject(Object.assign(new Error('本地 TeX 编译失败'), { log: data.log })); }
    else if (data.result === 'failed' && this.waiter) { const wait = this.waiter; this.waiter = null; wait.reject(new Error('写入 WASM 文件系统失败')); }
   };
  });
  return this.ready;
 }
 async compile(mainFile, files) {
  const started = performance.now();
  try {
  await this.load();
  this.worker.postMessage({ cmd: 'flushcache' });
  const folders = new Set();
  for (const file of files) {
   const parts = file.path.split('/'); parts.pop(); let dir = '';
   for (const part of parts) { dir = dir ? dir + '/' + part : part; if (!folders.has(dir)) { this.worker.postMessage({ cmd: 'mkdir', url: dir }); folders.add(dir); } }
   const src = file.content !== undefined ? file.content : Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
   this.worker.postMessage({ cmd: 'writefile', url: file.path, src });
  }
  this.worker.postMessage({ cmd: 'setmainfile', url: mainFile });
  const pass = () => new Promise((resolve, reject) => {
   const timer = setTimeout(() => { this.destroy(); reject(new Error('本地编译超过 45 秒，已终止；可切换服务器引擎')); }, 45000);
   this.waiter = { resolve: (r) => { clearTimeout(timer); resolve(r); }, reject: (e) => { clearTimeout(timer); reject(e); } };
   this.worker.postMessage({ cmd: 'compilelatex' });
  });
   await pass(); const result = await pass();
   const bytes = new Uint8Array(result.pdf);
   if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('本地引擎没有生成有效 PDF');
   return { ok: true, engine: 'wasm-pdftex', ms: Math.round(performance.now()-started), pdf: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), log: result.log, errors: [], warnings: [] };
  } catch (error) { return { ok: false, engine: 'wasm-pdftex', ms: Math.round(performance.now()-started), log: error.log || error.message, errors: wasmDiagnostics(error.log || error.message, mainFile), warnings: [] }; }
 }
}
