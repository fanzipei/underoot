import { wasmDiagnostics } from './wasm-diagnostics.js';
const BASE='/wasm/tl2026-46ebb621';
export const isBrowserEngine=(id)=>id==='wasm-pdftex'||id==='wasm-xetex';
export function browserDriver(files,engine='wasm-pdftex'){
 const source=files.filter((f)=>/\.tex$/i.test(f.path)).map((f)=>f.content!==undefined?f.content:new TextDecoder().decode(Uint8Array.from(atob(f.base64),(c)=>c.charCodeAt(0)))).join('\n').replace(/(?<!\\)%[^\n]*/g,'');
 return engine==='wasm-xetex'||/[\u3400-\u9fff\uf900-\ufaff]|\\(?:setCJKmainfont|setmainfont|setCJKsansfont)\b|\\(?:usepackage|documentclass)(?:\[[^\]]*\])?\{[^}]*\b(?:ctex\w*|xeCJK|fontspec|unicode-math)\b/.test(source)?'xetex_bibtex8_dvipdfmx':'pdftex_bibtex8';
}
/** TeX Live 2026 in a persistent Worker; manuscripts never leave the instance. */
export class BrowserTeX {
 constructor(onProgress=()=>{}){this.worker=null;this.ready=null;this.waiter=null;this.loading=null;this.onProgress=onProgress;this.transferErrors=[];}
 destroy(reason=Error('本地编译已取消')){const pending=this.waiter,loading=this.loading;this.waiter=null;this.loading=null;this.worker?.terminate();this.worker=null;this.ready=null;pending?.reject(reason);loading?.reject(reason);}
 async load(){
  if(this.ready)return this.ready;
  this.ready=new Promise((resolve,reject)=>{
   this.onProgress('正在加载 TeX Live 2026，首次约 128 MB；引擎与基础宏包会缓存');
   const worker=this.worker=new Worker(BASE+'/underoot-worker.js');
   const timeout=setTimeout(()=>this.destroy(Error('本地引擎加载超时，请检查网络后重试')),240000);
   this.loading={reject:(e)=>{clearTimeout(timeout);reject(e);}};
   worker.onerror=()=>{const error=Error('无法启动本地 TeX Live 2026 引擎，请检查浏览器 WebAssembly / CSP 支持');this.loading?.reject(error);this.waiter?.reject(error);this.destroy();};
   worker.onmessage=({data})=>{
    if(data.initialized){clearTimeout(timeout);this.loading=null;this.onProgress('本地引擎已就绪，首次编译会自动获取缺失宏包与字体');resolve();}
    else if(data.resource){const r=data.resource;if(r.state==='loading')this.onProgress(`正在获取宏包/字体：${r.name}`);if(r.state==='error')this.transferErrors.push(r.name);}
    else if(data.print&&/^(?:Preparing|Downloading data|All downloads complete)/.test(data.print))this.onProgress('首次加载 TeX Live 2026（约 128 MB，将缓存）：'+data.print);
    else if(data.exception){const error=Error(data.exception);this.loading?.reject(error);this.waiter?.reject(error);this.destroy();}
    else if(Object.hasOwn(data,'pdf')&&this.waiter){const waiter=this.waiter;this.waiter=null;waiter.resolve(data);}
   };
   worker.postMessage({busytex_js:location.origin+BASE+'/busytex.js',busytex_wasm:location.origin+BASE+'/busytex.wasm',preload_data_packages_js:[location.origin+BASE+'/texlive-basic.js'],data_packages_js:[location.origin+BASE+'/texlive-basic.js'],texmf_local:[],preload:true});
  });
  return this.ready;
 }
 async compile(mainFile,files,engine='wasm-pdftex'){
  const start=performance.now();let timer;
  try{
   await this.load();this.transferErrors=[];
   const driver=browserDriver(files,engine);this.onProgress(`正在本地运行 ${driver.startsWith('xetex')?'XeLaTeX':'pdfLaTeX'} · 缺失资源自动下载并缓存`);
   const result=await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>this.destroy(Error('本地编译超过 6 分钟，已停止；可重试以复用已下载缓存')),360000);
    this.waiter={resolve,reject};
    this.worker.postMessage({files:files.map((f)=>({path:f.path,contents:f.content!==undefined?f.content:Uint8Array.from(atob(f.base64),(c)=>c.charCodeAt(0))})),main_tex_path:mainFile,bibtex:null,makeindex:null,rerun:true,verbose:'silent',driver,data_packages_js:[location.origin+BASE+'/texlive-basic.js'],remote_endpoint:location.origin+'/api/wasm/texlive/2026',shell_escape:false});
   });
   const log=result.log||'';const bytes=new Uint8Array(result.pdf||[]);const ok=result.exit_code===0&&new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-';
   const warnings=this.transferErrors.length?[{message:'部分资源下载失败：'+[...new Set(this.transferErrors)].slice(0,5).join('、'),hint:'请检查网络后重试，已有缓存会保留。'}]:[];
   return{ok,engine,ms:Math.round(performance.now()-start),...(ok?{pdf:URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}))}:{}),log,errors:ok?[]:wasmDiagnostics(log,mainFile),warnings,localEngine:driver.startsWith('xetex')?'XeLaTeX':'pdfLaTeX'};
  }catch(error){this.destroy();return{ok:false,engine,ms:Math.round(performance.now()-start),log:error.message,errors:wasmDiagnostics(error.message,mainFile),warnings:[]};}
  finally{clearTimeout(timer);this.onProgress('');}
 }
}
