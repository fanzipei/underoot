/** Execute the actual browser engine in a VM worker environment; no native TeX. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import assert from 'node:assert/strict';import {execFileSync}from'node:child_process';import{fileURLToPath}from'node:url';
import{browserDriver}from'../src/client/wasm-compiler.js';import{getTemplate}from'../server/templates.js';
const BASE=process.env.BASE_URL;assert.ok(BASE,'Run through test-isolated --modern-wasm');
const login=await fetch(BASE+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Connection:'close'},body:JSON.stringify({email:'demo@latex.studio',password:'demo1234'})});const cookie=login.headers.get('set-cookie').split(';')[0];
const root=fileURLToPath(new URL('../public/',import.meta.url));const build='/wasm/tl2026-46ebb621/';const temp=fs.mkdtempSync(path.join(os.tmpdir(),'underoot-wasm-http-'));let hits=0,downloads=0,count=0;
class XHR{
 open(method,url,async=true){this.url=new URL(url,'http://localhost'+build+'busytex.js');this.async=async;}
 getResponseHeader(key){return this.headers?.[key.toLowerCase()]||null;}
 send(){
  this.headers={};let buffer;
  if(this.url.pathname.startsWith(build)){buffer=fs.readFileSync(path.join(root,this.url.pathname));this.status=200;}
  else if(this.url.pathname.startsWith('/api/wasm/texlive/2026/')){
   const head=path.join(temp,'headers');buffer=execFileSync(process.platform==='win32'?'curl.exe':'curl',['-sS','--max-time','30','-H','Cookie: '+cookie,'-D',head,BASE+this.url.pathname],{maxBuffer:34*1024*1024,windowsHide:true});
   const raw=fs.readFileSync(head,'utf8');this.status=Number(raw.match(/HTTP\/\S+ (\d+)/g)?.at(-1)?.split(' ')[1]||0);for(const line of raw.split(/\r?\n/)){const match=line.match(/^([^:]+):\s*(.*)$/);if(match)this.headers[match[1].toLowerCase()]=match[2];}
   if(this.headers['x-underoot-cache']==='hit')hits++;if(this.headers['x-underoot-cache']==='download')downloads++;
  }else throw Error('Unexpected engine URL: '+this.url.pathname);
  this.response=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);this.responseText=buffer.toString();this.onload?.({target:this});
 }
}
const quiet={log(){},warn(){},error(...args){if(String(args[0]).includes('Aborted'))console.error(...args);}};
const context=vm.createContext({console:quiet,WebAssembly,TextDecoder,TextEncoder,Uint8Array,Int8Array,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,ArrayBuffer,BigInt64Array,BigUint64Array,URL,Response,Request,Headers,AbortController,performance,setTimeout,clearTimeout,XMLHttpRequest:XHR,location:{href:'http://localhost'+build+'busytex.js'},navigator:{userAgent:'underoot-wasm-test'},fetch:async(url)=>{const pathname=new URL(url,'http://localhost').pathname;assert.ok(pathname.startsWith(build));return new Response(fs.readFileSync(path.join(root,pathname)),{headers:{'Content-Type':pathname.endsWith('.wasm')?'application/wasm':'application/octet-stream'}});}});
context.location.pathname=build+'busytex.js';context.WorkerGlobalScope=function(){};
context.self=context;context.importScripts=(...urls)=>{for(const url of urls){const pathname=new URL(url,'http://localhost'+build+'busytex.js').pathname;vm.runInContext(fs.readFileSync(path.join(root,pathname),'utf8'),context,{filename:pathname});}};
let ready;const initialized=new Promise(r=>ready=r);context.readyForTest=ready;
const timer=setTimeout(()=>{console.error('Modern WASM test timeout');process.exit(1);},900000);
const check=(name,value)=>{assert.ok(value,name);console.log('✓',name);count++;};
try{
 context.importScripts('busytex_pipeline.js');
 vm.runInContext(`self.pipeline=new BusytexPipeline('${build}busytex.js','${build}busytex.wasm',['${build}texlive-basic.js'],['${build}texlive-basic.js'],[],()=>{},()=>self.readyForTest(),true,BusytexPipeline.ScriptLoaderWorker);`,context);
 await initialized;check('TeX Live 2026 WASM 初始化',true);
 context.endpoint=BASE+'/api/wasm/texlive/2026';
 async function compile(files,main='main.tex',engine){
  context.testFiles=files.map(f=>({path:f.path,contents:f.content??new Uint8Array(f.buffer)}));context.testMain=main;context.testDriver=browserDriver(files.map(f=>({path:f.path,content:f.content??f.buffer.toString()})),engine);
  return await vm.runInContext(`self.pipeline.compile(self.testFiles,self.testMain,null,null,null,true,'silent',self.testDriver,['${build}texlive-basic.js'],self.endpoint,false)`,context);
 }
 const fixtures=process.env.WASM_FIXTURES?.split(',')||['blank','chinese','ieee','acm','aaai','neurips','beamer','paper','cv','graphics'];
 for(const id of fixtures){
  const template=getTemplate(id);assert.ok(template,'Template '+id);const result=await compile(template.files,template.meta.mainFile||'main.tex');
  if(result.exit_code!==0)fs.writeFileSync(path.join(temp,id+'.log'),result.log);
  assert.equal(result.exit_code,0,`${id}: ${result.log.slice(-11000)} (log ${temp})`);
  check(`真实 WASM 编译模板 ${id}`,Buffer.from(result.pdf).subarray(0,5).toString()==='%PDF-');
  if(process.env.WASM_QA_OUT){fs.mkdirSync(process.env.WASM_QA_OUT,{recursive:true});fs.writeFileSync(path.join(process.env.WASM_QA_OUT,id+'.pdf'),result.pdf);fs.writeFileSync(path.join(process.env.WASM_QA_OUT,id+'.log'),result.log);}
 }
 const repeat=await compile(getTemplate('chinese').files);check('中文再次编译成功',repeat.exit_code===0);
 check('缺失资源已自动下载并持久缓存',downloads>0);
 // A second consumer bypasses the worker memory cache, verifying the host disk cache.
 const resource=await fetch(BASE+'/api/wasm/texlive/2026/26/ctexart.cls',{headers:{cookie}});check('中文宏包复用宿主持久缓存',resource.ok&&resource.headers.get('x-underoot-cache')==='hit');
 check('未登录不能触发下载',(await fetch(BASE+'/api/wasm/texlive/2026/26/ctexart.cls')).status===401);
 console.log(`Modern WASM: ${count}/${count} passed; downloaded=${downloads}, diskHits=${hits}`);
}finally{clearTimeout(timer);fs.rmSync(temp,{recursive:true,force:true});}
