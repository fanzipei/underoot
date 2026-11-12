import {execFile}from'node:child_process';import{promisify}from'node:util';import path from'node:path';
import{compileProject,detectEngines}from'../../../server/compile.js';import{projectDir,which}from'../../../server/paths.js';
import{measurements}from'../../../skills/underoot-paper-publishing/scripts/fit-layout.mjs';
const execute=promisify(execFile);
export async function auditDraft(id,entry,options,{check=()=>{},progress=()=>{}}={}){
 if(!detectEngines().engines.some(e=>e.id==='xelatex'))return{status:'unavailable',reason:'主机未安装 XeLaTeX；请在浏览器用本地 WASM XeLaTeX 编译，再运行 skill 的 PDF 检查。',visualInspection:'not-run'};
 check();progress({phase:'compile',message:'正在真实编译并检查 PDF 页数与 TeX 溢出；视觉内容仍需核对'});
 const compiled=await compileProject({projectId:id,mainFile:entry,engine:'xelatex',timeout:30000});check();
 const overflows=[...compiled.log.matchAll(/Overfull \\([hv])box \(([\d.]+)pt too (?:wide|high)\)/g)].map(m=>({axis:m[1],points:Number(m[2])}));
 let pages=null;let outside=0;let boundsStatus='unavailable';
 if(compiled.ok&&which('pdftotext')){
  try{
   const pdf=path.join(projectDir(id),compiled.pdf);const{stdout}=await execute(which('pdftotext'),['-bbox-layout',pdf,'-'],{timeout:15000,maxBuffer:4000000,windowsHide:true});
   const sheets=[...stdout.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)];pages=sheets.length;
   for(const page of sheets)for(const word of page[3].matchAll(/<word xMin="(-?[\d.]+)" yMin="(-?[\d.]+)" xMax="(-?[\d.]+)" yMax="(-?[\d.]+)"/g))if(Number(word[1])< -2||Number(word[2])< -2||Number(word[3])>Number(page[1])+2||Number(word[4])>Number(page[2])+2)outside++;
   boundsStatus='checked';
  }catch{boundsStatus='failed';}
 }
 const issues=[];if(!compiled.ok)issues.push('LaTeX 编译失败');if(overflows.some(w=>w.points>1))issues.push('TeX 检测到内容溢出');if(pages===0)issues.push('未能识别有效 PDF 页面');if(options.kind==='poster'&&pages!==null&&pages!==1)issues.push(`海报占用了 ${pages} 页`);if(outside)issues.push('文本超出 PDF 页面边界');
 return{status:issues.length?'needs-review':'passed',engine:'xelatex',pages,boundsStatus,outsideText:outside,overflowWarnings:overflows,measurements:measurements(compiled.log),issues,errors:compiled.errors.map(e=>e.message).slice(0,5),visualInspection:'not-run'};
}
