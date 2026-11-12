import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const safeName=(name)=>typeof name==='string'&&/^[A-Za-z0-9][A-Za-z0-9._+ -]{0,254}$/.test(name)&&!name.includes('..');
const sha=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
export class TexResourceCache {
 constructor({directory,upstream='https://texlive2026.texlyre.org',maxBytes=512*1024*1024,maxFile=32*1024*1024,downloads=true,fetcher=fetch}={}){
  this.directory=directory;this.upstream=upstream.replace(/\/$/,'');this.maxBytes=maxBytes;this.maxFile=maxFile;this.downloads=downloads;this.fetcher=fetcher;this.inflight=new Map();this.misses=new Map();this.active=0;this.pruning=Promise.resolve();
 }
 async get(format,name){
  if(!/^\d{1,2}$/.test(String(format))||!safeName(name))throw Object.assign(Error('无效 TeX 资源名称'),{status:400});
  const key=sha(format+'/'+name);const bin=path.join(this.directory,key+'.bin');const meta=path.join(this.directory,key+'.json');
  try{
   const record=JSON.parse(await fs.readFile(meta,'utf8'));const stat=await fs.stat(bin);
   if(stat.size>this.maxFile||stat.size!==record.size)throw Error('Corrupt cache');
   const bytes=await fs.readFile(bin);if(sha(bytes)!==record.sha||!safeName(record.fileid))throw Error('Corrupt cache');
   await fs.utimes(meta,new Date(),new Date());return{bytes,fileid:record.fileid,cache:'hit'};
  }catch{/* A missing/corrupt cache record is replaced atomically after a verified fetch. */}
  if(this.misses.get(key)>Date.now())return null;
  if(this.inflight.has(key))return this.inflight.get(key);
  if(!this.downloads)throw Object.assign(Error('此资源尚未缓存，管理员已关闭在线下载'),{status:503});
  if(this.active>=8)throw Object.assign(Error('宏包下载繁忙，请稍后重试'),{status:503});
  const pending=this.download(format,name,key,bin,meta);this.inflight.set(key,pending);
  try{return await pending;}finally{this.inflight.delete(key);}
 }
 async download(format,name,key,bin,meta){
  this.active++;
  try{
   const response=await this.fetcher(this.upstream+'/'+format+'/'+encodeURIComponent(name),{redirect:'error',signal:AbortSignal.timeout(25000)});
   if(response.status===404){if(this.misses.size>=1000)this.misses.delete(this.misses.keys().next().value);this.misses.set(key,Date.now()+60000);return null;}
   if(!response.ok)throw Error('Upstream HTTP '+response.status);
   const expected=Number(response.headers.get('content-length'));
   if(expected>this.maxFile){await response.body?.cancel();throw Error('Resource too large');}
   const chunks=[];let length=0;
   for await(const chunk of response.body){length+=chunk.length;if(length>this.maxFile){throw Error('Resource too large');}chunks.push(chunk);}
   if(!length||expected&&length!==expected)throw Error('Incomplete resource');
   const bytes=Buffer.concat(chunks);const fileid=response.headers.get('fileid')||name;
   if(!safeName(fileid)||/^\s*<(?:!doctype\s+html|html)\b/i.test(bytes.subarray(0,200).toString()))throw Error('Invalid resource response');
   await fs.mkdir(this.directory,{recursive:true,mode:0o700});
   const token='.'+crypto.randomUUID()+'.tmp';
   try{
    await fs.writeFile(bin+token,bytes,{mode:0o600});await fs.rename(bin+token,bin);
    await fs.writeFile(meta+token,JSON.stringify({fileid,size:length,sha:sha(bytes)}),{mode:0o600});await fs.rename(meta+token,meta);
   }finally{await fs.rm(bin+token,{force:true});await fs.rm(meta+token,{force:true});}
   this.pruning=this.pruning.catch(()=>{}).then(()=>this.prune());await this.pruning;
   return{bytes,fileid,cache:'download'};
  }catch(error){if(error.status)throw error;throw Object.assign(Error('宏包或字体下载失败，请检查网络后重试；已有缓存保留'),{status:502});}
  finally{this.active--;}
 }
 async prune(){
  const entries=[];
  for(const name of await fs.readdir(this.directory))if(/^[a-f0-9]{64}\.json$/.test(name)){
   try{const meta=path.join(this.directory,name);const record=JSON.parse(await fs.readFile(meta,'utf8'));entries.push({meta,bin:meta.replace(/\.json$/,'.bin'),size:record.size,time:(await fs.stat(meta)).mtimeMs});}catch{/* Incomplete record is ignored. */}
  }
  let bytes=entries.reduce((n,e)=>n+e.size,0);let count=entries.length;
  for(const item of entries.sort((a,b)=>a.time-b.time)){if(bytes<=this.maxBytes&&count<=4000)break;await fs.rm(item.meta,{force:true});await fs.rm(item.bin,{force:true});bytes-=item.size;count--;}
 }
}
