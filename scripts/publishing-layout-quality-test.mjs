import fs from'node:fs';import os from'node:os';import path from'node:path';import assert from'node:assert/strict';import{spawnSync}from'node:child_process';
import{paperPlan}from'../skills/underoot-paper-publishing/scripts/chunk-paper.mjs';
import{sourceEvidence}from'../skills/underoot-paper-publishing/scripts/source-evidence.mjs';
import{publicationIdentity}from'../skills/underoot-paper-publishing/scripts/publication-identity.mjs';
import{editorialPlan}from'../skills/underoot-paper-publishing/scripts/editorial-plan.mjs';
import{summarizePaper}from'../skills/underoot-paper-publishing/scripts/summarize.mjs';
import{fitPublication,layoutUsage}from'../skills/underoot-paper-publishing/scripts/fit-layout.mjs';
import{publishingOptions,renderPublication}from'../extensions/builtin/underoot.publishing/styles.mjs';
const qaRoot=process.env.LAYOUT_QA_DATA?path.resolve(process.env.LAYOUT_QA_DATA):fs.mkdtempSync(path.join(os.tmpdir(),'underoot-layout-qa-'));
if(!qaRoot.startsWith(path.resolve(os.tmpdir())+path.sep)||!path.basename(qaRoot).startsWith('underoot-'))throw Error('Layout QA data must use an underoot-* directory beneath the system temporary directory');
process.env.LATEXSTUDIO_DATA=qaRoot;
const{auditDraft}=await import('../extensions/builtin/underoot.publishing/layout-audit.mjs');const{projectDir}=await import('../server/paths.js');const{materializeBranding}=await import('../extensions/builtin/underoot.publishing/branding.mjs');
const source=fs.readFileSync('scripts/fixtures/publishing/main.tex','utf8').replace('\\author{Synthetic Research Fixture}','\\author[1]{Alice Example}\\author[2]{Bob Example}\\affil[1]{Example University}\\affil[2]{Example Institute}');
let count=0;
for(const kind of['poster','slides'])for(const style of(kind==='poster'?['gallery','dark']:['metropolis','minimal','sidebar'])){
 const id='fit-'+kind+'-'+style,dir=projectDir(id);fs.mkdirSync(dir,{recursive:true});fs.copyFileSync('scripts/fixtures/publishing/accuracy.png',path.join(dir,'accuracy.png'));
 const options=publishingOptions({kind,style,orientation:style==='dark'?'landscape':'portrait',columns:3,count:kind==='slides'?12:6});
 const plan=paperPlan(source,{title:'Source-grounded evidence and responsible research communication',author:'Alice Example; Bob Example'});Object.assign(plan,sourceEvidence(source,plan.chunks,['accuracy.png']));
 const summary=await summarizePaper(plan,options),editorial=editorialPlan(plan,summary,options);editorial.identity=publicationIdentity(source);editorial.identity.projectUrl='https://github.com/fanzipei/underoot';
 await materializeBranding(dir,editorial.identity);
 const initial=renderPublication({...plan,editorial},options);fs.writeFileSync(path.join(dir,'initial.tex'),initial);const first=await auditDraft(id,'initial.tex',options);
 assert.notEqual(first.status,'unavailable','Native XeLaTeX required for this quality suite');
 const initialUsage=layoutUsage(editorial,options,first.measurements||{});
 const result=await fitPublication({...plan,editorial},options,{render:renderPublication,write:text=>fs.writeFileSync(path.join(dir,'main.tex'),text),audit:()=>auditDraft(id,'main.tex',options)});
 fs.writeFileSync(path.join(dir,'fit-report.json'),JSON.stringify({initialUsage,result,editorial},null,2));
 console.log(id,JSON.stringify({status:result.status,initialUsage,usage:result.usage,iterations:result.iterations.length,issues:result.issues,errors:result.errors}));
 assert.equal(result.pages,kind==='poster'?1:editorial.pages.length+1);assert.equal(result.errors.length,0);assert.equal(result.outsideText,0);assert.ok(!result.overflowWarnings.some(w=>w.points>1));
 assert.ok(result.iterations.length>=(kind==='poster'?2:1)&&result.iterations.length<=8);assert.ok(result.usage.maximum<=1.01);
 if(kind==='poster'){assert.ok(result.usage.minimum>initialUsage.minimum+.15,'Poster should materially use more of its canvas');assert.ok(result.usage.minimum>=.45,'No almost-empty column');assert.ok(result.panelFill?.enabled&&result.panelFill.framedUsage.minimum>=.99&&result.panelFill.framedUsage.maximum<=1.01,'Panels fill the entire body height');}
 else assert.ok(result.usage.minimum<=initialUsage.minimum+.001,'Slides preserve whitespace instead of maximizing occupancy');
 for(const name of['Alice Example','Bob Example','Example University','Example Institute'])assert.ok(fs.readFileSync(path.join(dir,'main.tex'),'utf8').includes(name));
 if(kind==='slides'){
  const log=fs.readFileSync(path.join(dir,'main.log'),'utf8'),titles=[...log.matchAll(/UNDEROOT:TITLE:([^:]+):([\d.]+)pt:([\d.]+)pt/g)];assert.equal(titles.length,editorial.pages.length);assert.ok(titles.every(m=>Number(m[2])<=Number(m[3])*.92+1),'Native theme title text fits on one line');
  const images=spawnSync('pdfimages',['-list',path.join(dir,'main.pdf')],{encoding:'utf8'}).stdout||'';const sizes=images.split('\n').map(s=>s.trim().split(/\s+/)).filter(a=>a[2]==='image').map(a=>({width:Number(a[3])/Number(a[12])*72,height:Number(a[4])/Number(a[13])*72}));const bodyHeight=Math.max(...Object.values(result.measurements.slides).map(s=>s.available));assert.ok(sizes.some(s=>s.width>Number(titles[0][3])*.50||s.height>bodyHeight*.80),'Evidence graphic uses the available width or height according to its aspect ratio');
 }
 if(kind==='poster'){const xml=spawnSync('pdftotext',['-bbox',path.join(dir,'main.pdf'),'-'],{encoding:'utf8'}).stdout;const width=Number(xml.match(/<page width="([\d.]+)"/)?.[1]);const words=[...xml.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<\/word>/g)].map(m=>({x:Number(m[1]),y:Number(m[2]),right:Number(m[3]),bottom:Number(m[4]),text:m[5]}));const alice=words.find(w=>w.text==='Alice');const line=words.filter(w=>Math.abs(w.y-alice.y)<1);assert.ok(Math.abs((Math.min(...line.map(w=>w.x))+Math.max(...line.map(w=>w.right)))/2-width/2)<width*.02,'Authors are centered on the full poster');assert.ok(alice.bottom-alice.y>=40,'Author type is enlarged');}
 if(process.platform!=='win32')spawnSync('pdftoppm',['-scale-to','1400','-png',path.join(dir,'main.pdf'),path.join(dir,'preview')],{timeout:30000,maxBuffer:1000000});
 count++;
}
console.log(`Layout quality: ${count}/${count} real PDF cases passed; artifacts: ${qaRoot}`);
