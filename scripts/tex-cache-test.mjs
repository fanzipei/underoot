import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {TexResourceCache} from '../server/tex-resource-cache.js';import{browserDriver,isBrowserEngine}from'../src/client/wasm-compiler.js';
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'underoot-tex-cache-'));let calls=0;let mode='ok';let lastURL;let count=0;
const check=(name,value)=>{assert.ok(value,name);console.log('✓',name);count++;};
const fetcher=async(url,options)=>{calls++;lastURL=url;assert.equal(options.redirect,'error');await new Promise(r=>setTimeout(r,10));return mode==='missing'?new Response('',{status:404}):mode==='error'?new Response('',{status:503}):mode==='oversize'?new Response('x'.repeat(33),{headers:{'content-length':'33'}}):mode==='html'?new Response('<!doctype html><html>Failure</html>'):new Response('a'.repeat(16),{headers:{fileid:'example.sty'}});};
try{
 const cache=new TexResourceCache({directory,fetcher,maxFile:32,maxBytes:48});
 const a=await cache.get(26,'example.sty');check('缺失宏包按需下载且标记来源',a.cache==='download'&&a.bytes.length===16&&calls===1);
 check('请求仅向固定源发送宏包名',lastURL==='https://texlive2026.texlyre.org/26/example.sty');
 check('重复请求复用持久缓存',(await cache.get(26,'example.sty')).cache==='hit'&&calls===1);
 check('实例重启后缓存仍可用',(await new TexResourceCache({directory,fetcher}).get(26,'example.sty')).cache==='hit'&&calls===1);
 const before=calls;await Promise.all(Array.from({length:5},()=>cache.get(26,'shared.sty')));check('并行请求合并下载',calls===before+1);
 for(const name of ['../secret','https://evil.test','a/b.sty','a\\b','bad\r\nheader'])await assert.rejects(()=>cache.get(26,name),{status:400});
 check('拒绝路径、URL 与非法名称',true);
 mode='missing';const misses=calls;assert.equal(await cache.get(26,'missing.sty'),null);assert.equal(await cache.get(26,'missing.sty'),null);check('真实 404 短期缓存避免重复下载',calls===misses+1);
 mode='error';const errors=calls;await assert.rejects(()=>cache.get(26,'retry.sty'),{status:502});await assert.rejects(()=>cache.get(26,'retry.sty'),{status:502});check('网络错误不缓存为缺失宏包',calls===errors+2);
 mode='oversize';await assert.rejects(()=>cache.get(26,'large.sty'),{status:502});check('限制下载大小',true);
 mode='html';await assert.rejects(()=>cache.get(26,'gateway.sty'),{status:502});check('拒绝网关 HTML 污染缓存',true);
 mode='ok';await cache.get(26,'four.sty');await cache.get(26,'five.sty');const files=await fs.readdir(directory);check('按容量淘汰旧缓存',files.filter(n=>n.endsWith('.bin')).length<=3);
 const offline=new TexResourceCache({directory,fetcher,downloads:false});check('离线模式保留已缓存资源',(await offline.get(26,'five.sty')).cache==='hit');await assert.rejects(()=>offline.get(26,'unknown.sty'),{status:503});check('关闭下载后未缓存资源明确报错',true);
 const tex=(content)=>[{path:'main.tex',content}];
 check('英文会议自动使用 pdfLaTeX',browserDriver(tex('\\documentclass{IEEEtran}'))==='pdftex_bibtex8');
 check('中文注释不会误触发 XeLaTeX',browserDriver(tex('% 会议模板说明\n\\documentclass{acmart}'))==='pdftex_bibtex8');
 check('中文稿自动使用 XeLaTeX',browserDriver(tex('\\documentclass{ctexart}中文'))==='xetex_bibtex8_dvipdfmx');
 check('fontspec 自动使用 XeLaTeX',browserDriver(tex('\\usepackage{fontspec}'))==='xetex_bibtex8_dvipdfmx');
 check('显式 XeLaTeX 优先',browserDriver(tex('English'),'wasm-xetex')==='xetex_bibtex8_dvipdfmx');
 check('两个浏览器引擎保持独立于服务器',isBrowserEngine('wasm-pdftex')&&isBrowserEngine('wasm-xetex')&&!isBrowserEngine('xelatex'));
 console.log(`TeX resource cache: ${count}/${count} passed`);
}finally{await fs.rm(directory,{recursive:true,force:true});}
