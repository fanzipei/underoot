import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {cleanCompileFiles} from '../server/compile-clean.js';import {parseLog} from '../server/compile.js';
let count=0;const check=(label,value)=>{assert.ok(value,label);count++;console.log('✓ '+label);};
const root=fs.mkdtempSync(path.join(os.tmpdir(),'underoot-clean-')),outside=fs.mkdtempSync(path.join(os.tmpdir(),'underoot-outside-'));
try{
 for(const [name,text] of Object.entries({'main.tex':'SOURCE','refs.bib':'BIB','figure.pdf':'%PDF-asset','main.pdf':'%PDF-previous','main.aux':String.raw`\bibdata{refs}`,'main.blg':'This is BibTeX','main.bbl':'generated','main.fdb_latexmk':'old failure','included.aux':'aux','main.fls':'OUTPUT included.aux\nOUTPUT main.tex\nOUTPUT figure.pdf\nOUTPUT '+path.join(outside,'keep.aux')}))fs.writeFileSync(path.join(root,name),text);
 fs.writeFileSync(path.join(outside,'keep.aux'),'outside');
 if(process.platform!=='win32'){fs.symlinkSync(outside,path.join(root,'linked'));fs.appendFileSync(path.join(root,'main.fls'),'\nOUTPUT linked/keep.aux');}
 const removed=cleanCompileFiles(root,'main');check('clean removes job state and recorded aux output',removed.includes('main.fdb_latexmk')&&removed.includes('included.aux'));
 check('regenerable BibTeX output is cleaned',removed.includes('main.bbl'));
 check('source and PDF assets remain byte-identical',fs.readFileSync(path.join(root,'main.tex'),'utf8')==='SOURCE'&&fs.readFileSync(path.join(root,'refs.bib'),'utf8')==='BIB'&&fs.readFileSync(path.join(root,'figure.pdf'),'utf8')==='%PDF-asset'&&fs.readFileSync(path.join(root,'main.pdf'),'utf8')==='%PDF-previous');
 check('outside and symlink targets are never removed',fs.readFileSync(path.join(outside,'keep.aux'),'utf8')==='outside');
 fs.writeFileSync(path.join(root,'main.bbl'),'provided source');cleanCompileFiles(root,'main');check('standalone submitted bbl is retained',fs.readFileSync(path.join(root,'main.bbl'),'utf8')==='provided source');
 const diagnostic=parseLog('I was expecting a `,\' or a `}\'---line 12 of file refs.bib\nOutput written on main.pdf (1 page).');check('BibTeX errors identify the actual bib path and line',diagnostic.errors[0]?.file==='refs.bib'&&diagnostic.errors[0]?.line===12);
 check('CCS warning and PDF output alone are not TeX errors',parseLog('Class acmart Warning: CCS concepts are mandatory for papers over two pages.\nOutput written on main.pdf (13 pages).').errors.length===0);
}finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(outside,{recursive:true,force:true});}
if(process.env.BASE_URL){
 const BASE=process.env.BASE_URL;const req=async(url,cookie='',method='GET',body)=>{const r=await fetch(BASE+url,{method,headers:{cookie,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const owner=(await req('/api/auth/login','','POST',{email:'demo@latex.studio',password:'demo1234'})).cookie,p=(await req('/api/projects',owner,'POST',{name:'Compile recovery fixture',template:'blank'})).data.project;
 if((await req('/api/system/engines',owner)).data.engines.some(e=>e.id==='latexmk')){
  const tex=String.raw`\documentclass{article}\begin{document}Reference \cite{test}.\bibliographystyle{plain}\bibliography{refs}\end{document}`;
  await req(`/api/projects/${p.id}/file?path=main.tex`,owner,'PUT',{content:tex});await req(`/api/projects/${p.id}/file`,owner,'POST',{path:'refs.bib',type:'file'});
  await req(`/api/projects/${p.id}/file?path=refs.bib`,owner,'PUT',{content:'@article{test, title={Broken}\nTHIS IS INVALID'});
  const bad=await req(`/api/projects/${p.id}/compile`,owner,'POST',{engine:'latexmk',force:true});check('failed bibliography remains a failed compile even with a PDF',bad.data.ok===false&&(await fetch(BASE+`/api/projects/${p.id}/pdf?file=main.pdf`,{headers:{cookie:owner}})).ok);check('combined log retains latexmk output and bibliography errors',bad.data.log.includes('[本次编译器输出]')&&bad.data.errors.some(e=>e.file==='refs.bib'));
  const bib='@article{test, author={Researcher, A}, title={Valid paper}, journal={Research}, year={2026}}';await req(`/api/projects/${p.id}/file?path=refs.bib`,owner,'PUT',{content:bib});
  const fixed=await req(`/api/projects/${p.id}/compile`,owner,'POST',{engine:'latexmk',force:true});if(!fixed.data.ok)console.error(fixed.data.errors);check('manual compile reruns latexmk after fixing a prior BibTeX failure',fixed.data.ok&&fixed.data.log.includes('-g'));
  const rebuilt=await req(`/api/projects/${p.id}/compile`,owner,'POST',{engine:'latexmk',clean:true});check('clean compile bypasses app and latexmk caches',rebuilt.data.ok&&!rebuilt.data.cached&&rebuilt.data.log.includes('[清理后重新编译]'));
  check('clean compile preserves bibliography source',(await req(`/api/projects/${p.id}/file?path=refs.bib`,owner)).data.content===bib);
 }
}
console.log(`Compile recovery: ${count}/${count} passed`);
