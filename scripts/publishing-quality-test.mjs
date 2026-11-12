/** Round-five forward checks: real PDFs across all templates and Chinese text. */
import fs from'node:fs';import os from'node:os';import path from'node:path';import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';import assert from'node:assert/strict';
import{paperPlan}from'../skills/underoot-paper-publishing/scripts/chunk-paper.mjs';import{sourceEvidence}from'../skills/underoot-paper-publishing/scripts/source-evidence.mjs';import{editorialPlan}from'../skills/underoot-paper-publishing/scripts/editorial-plan.mjs';import{summarizePaper}from'../extensions/builtin/underoot.publishing/summarize.mjs';import{publishingStyles,publishingOptions,renderPublication}from'../extensions/builtin/underoot.publishing/styles.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));const out=process.env.EDITORIAL_QA_OUT||fs.mkdtempSync(path.join(os.tmpdir(),'underoot-publication-qa-'));fs.mkdirSync(out,{recursive:true});
const engine=process.env.EDITORIAL_XELATEX||'xelatex';const available=spawnSync(engine,['--version'],{windowsHide:true}).status===0;
const source=fs.readFileSync(new URL('./fixtures/publishing/main.tex',import.meta.url),'utf8');let count=0;const reports=[];
const fixtures=[];for(const kind of['slides','poster'])for(const[ordinal,style]of publishingStyles[kind].entries())fixtures.push({id:kind+'-'+style.id,source,kind,style:style.id,orientation:ordinal%2?'landscape':'portrait',columns:ordinal%2?2:3,title:'Sparse Signals Improve Accuracy Under a Fixed Research Budget'});
const chinese=String.raw`\documentclass{ctexart}\title{固定预算下的稀疏采样研究}\author{合成示例研究组}\begin{document}
\section{研究问题}在标注预算相同的条件下，如何减少冗余观测并提高分类准确率？本研究只检验两个数据集，不假定结论适用于所有领域。
\section{方法}方法先根据不确定性排序，再选择具有多样性的子集。基线使用相同模型、相同标注预算和五个随机种子。
\begin{equation}S=\frac{1}{n}\sum_{i=1}^{n}u_i\end{equation}
\section{实验结果}在第一个数据集上，方法准确率为87.1\%，基线为80.2\%，相差6.9个百分点。第二个数据集的改进较小，依赖所选子集。
\begin{figure}\includegraphics{accuracy.png}\caption{相同预算下，第一个数据集的准确率比较：基线80.2\%，方法87.1\%。图中没有误差线。}\end{figure}
\section{局限}实验只包含两个数据集和五个随机种子。尚未检验跨领域迁移、标注质量以及不同群体的公平性。
\section{结论}结果支持在已测试条件下使用稀疏观测。推广到新领域之前仍需进一步验证。\end{document}`;
for(const kind of['slides','poster'])fixtures.push({id:kind+'-chinese',source:chinese,kind,style:kind==='slides'?'minimal':'modern',orientation:'portrait',columns:3,title:'固定预算下的稀疏采样研究'});
for(const fixture of fixtures){
 const dir=path.join(out,fixture.id);fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(path.join(root,'scripts/fixtures/publishing/accuracy.png'),path.join(dir,'accuracy.png'));
 const options=publishingOptions({...fixture,count:fixture.kind==='slides'?12:6});const plan=paperPlan(fixture.source,{title:fixture.title,author:'Synthetic Research Fixture'});Object.assign(plan,sourceEvidence(fixture.source,plan.chunks,['accuracy.png']));
 const summary=await summarizePaper(plan,options);const editorial=editorialPlan(plan,summary,options);let audit={status:'not-run'};
 for(let attempt=1;attempt<=2;attempt++){
  fs.writeFileSync(path.join(dir,'main.tex'),renderPublication({...plan,sections:summary.sections,editorial},options));
  if(!available)break;
  for(let pass=0;pass<2;pass++){const result=spawnSync(engine,['-interaction=nonstopmode','-halt-on-error','-no-shell-escape','main.tex'],{cwd:dir,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4000000});assert.equal(result.status,0,fixture.id+': '+result.stdout?.slice(-2500));}
  const result=spawnSync(process.platform==='win32'?'python':'python3',[path.join(root,'skills/underoot-paper-publishing/scripts/audit-publication.py'),'--pdf',path.join(dir,'main.pdf'),'--log',path.join(dir,'main.log'),'--kind',fixture.kind,'--out',path.join(dir,'audit.json')],{encoding:'utf8',windowsHide:true});
  audit=JSON.parse(fs.readFileSync(path.join(dir,'audit.json'),'utf8'));audit.attempts=attempt;
  if(audit.status==='passed'||fixture.kind!=='poster'||attempt===2)break;
  editorial.posterFont=32;
 }
 assert.equal(editorial.metrics.sourceCoverage,plan.chunkCount);assert.ok(editorial.pages.some(p=>p.role==='limitation'));assert.ok(editorial.pages.some(p=>p.figures.length));
 if(available)assert.equal(audit.status,'passed',fixture.id+': '+JSON.stringify(audit));
 fs.writeFileSync(path.join(dir,'editorial.json'),JSON.stringify(editorial,null,2));reports.push({id:fixture.id,...audit});count++;console.log('✓ '+fixture.id+(available?` · ${audit.pages} pages · PDF bounds and overflow passed`:' · structural checks; XeLaTeX unavailable'));
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(reports,null,2));console.log(`Publication quality: ${count}/${count} passed; native PDF checks ${available?'executed':'NOT RUN'}; artifacts: ${out}`);
