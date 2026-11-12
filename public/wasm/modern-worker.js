/* Host progress bridge. Engine sources and licenses: /wasm/NOTICE.md. */
const NativeXHR = XMLHttpRequest;
let downloads = 0;
self.XMLHttpRequest = class extends NativeXHR {
 open(method,url,...args){this.resource=String(url).includes('/api/wasm/texlive/2026/')?String(url).split('/').pop():null;return super.open(method,url,...args);}
 send(...args){
  if(!this.resource)return super.send(...args);
  const name=decodeURIComponent(this.resource);postMessage({resource:{name,state:'loading',count:downloads}});
  try{return super.send(...args);}finally{if(this.status===200)downloads++;postMessage({resource:{name,state:this.status===200?'ready':this.status===404?'missing':'error',count:downloads,status:this.status,cache:this.getResponseHeader('x-underoot-cache')}});}
 }
};
importScripts('busytex_worker.js');
