import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expandPaper, splitPaper, paperPlan, CHUNK_CHARS, MAX_PAPER_CHARS, extractSummary } from '../skills/underoot-paper-publishing/scripts/chunk-paper.mjs';
import { summarizePaper } from '../extensions/builtin/underoot.publishing/summarize.mjs';
import { publishingOptions, publishingStyles, renderPublication } from '../extensions/builtin/underoot.publishing/styles.mjs';
let count=0; const check=(name,value)=>{assert.ok(value,name);count++;console.log('✓',name);};
const source='\\documentclass{article}\n\\begin{document}\n'+Array.from({length:42},(_,i)=>`\\section{Chapter ${i+1}}\n`+`Methods and evidence in study ${i+1}. Reported accuracy is ${80+i/10} percent. Limitations remain.\n\n`.repeat(65)+`Final finding for chapter ${i+1} is TAIL_${i+1}.\n\n`).join('')+'\\end{document}';
const plan=paperPlan(source);
check('超过旧 12 万字符的整稿可自动规划',plan.chars>120000&&plan.chunkCount>16);
check('所有分块拼接还原完整稿件',plan.chunks.map((c)=>c.text).join('')===source);
check('每块大小有界且不存在空块',plan.chunks.every((c)=>c.chars>0&&c.chars<=CHUNK_CHARS));
check('范围连续且覆盖稿件末尾',plan.chunks.every((c,i)=>c.from===(plan.chunks[i-1]?.to||0))&&plan.chunks.at(-1).to===source.length);
const unicode='😀中文'.repeat(14000);const unicodeChunks=splitPaper(unicode);
check('分块不会切断 Unicode 代理对',unicodeChunks.every((c)=>!/[\uD800-\uDBFF]$/.test(c.text)&&!/^[\uDC00-\uDFFF]/.test(c.text))&&unicodeChunks.map((c)=>c.text).join('')===unicode);
const oversized='\\begin{equation}\n'+'x'.repeat(60000)+'\n\\end{equation}';
check('超长环境标记续段但不丢失原文',splitPaper(oversized).map((c)=>c.text).join('')===oversized&&splitPaper(oversized).some((c)=>c.continuation));
assert.throws(()=>splitPaper('x'.repeat(MAX_PAPER_CHARS+1)),{status:413});check('保留明确的总资源上限',true);
check('极小展示预算也保留可见节选',extractSummary('LongSentence'.repeat(500),30).length>0);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'underoot-paper-skill-'));
try{
 fs.mkdirSync(path.join(root,'chapters'));fs.writeFileSync(path.join(root,'main.tex'),'\\title{Fixture}\n% \\input{missing-comment}\n\\input{chapters/a}\n\\input{b}\n');
 fs.writeFileSync(path.join(root,'chapters/a.tex'),'Chapter A. \\input{b}');fs.writeFileSync(path.join(root,'b.tex'),'Root-relative chapter B. \\input{main}');
 const expanded=expandPaper(root,'main.tex');
 check('展开多文件并允许根目录相对引用',expanded.source.includes('Chapter A')&&expanded.source.includes('Root-relative chapter B'));
 check('循环引用有明确记录',expanded.warnings.some((w)=>w.includes('循环')));
 check('注释中的引用不会读取',!expanded.warnings.some((w)=>w.includes('missing-comment')));
 fs.writeFileSync(path.join(root,'main.tex'),'\\input{methods.v1}\n\\input bare\n');fs.writeFileSync(path.join(root,'methods.v1.tex'),'Dotted filename works.');fs.writeFileSync(path.join(root,'bare.tex'),'Bare input works.');
 const varied=expandPaper(root,'main.tex');check('支持带点文件名与无括号 input',varied.source.includes('Dotted filename works')&&varied.source.includes('Bare input works'));
 fs.writeFileSync(path.join(root,'main.tex'),'\\input{../outside}');assert.throws(()=>expandPaper(root,'main.tex'),{status:400});check('拒绝引用越过项目目录',true);
}finally{fs.rmSync(root,{recursive:true,force:true});}
const options=publishingOptions({kind:'slides',style:'minimal',count:18});
const local=await summarizePaper(plan,options);
check('本地模式处理全部分块',local.notes.length===plan.chunkCount&&local.modelCalls===0);
check('不再丢弃第 16 章之后的内容',local.notes.some((n)=>n.summary.includes('TAIL_42')));
check('本地展示章节覆盖所有分块 ID',new Set(local.sections.flatMap((s)=>s.sourceIds)).size===plan.chunkCount);
let calls=0;let largest=0;
const model=async(_instruction,input)=>{
 calls++;largest=Math.max(largest,JSON.stringify(input).length);
 if(input.nodes)return JSON.stringify({sections:[{title:'Whole manuscript',text:'Evidence, methods, findings and limitations.',sourceIds:input.nodes.flatMap((n)=>n.ids)}]});
 return JSON.stringify({summary:input.text?`Chunk ${input.id}: ${input.text.slice(-100)}`:'Combined evidence and limitations.'});
};
const ai=await summarizePaper(plan,options,{useAI:true,model});
check('AI 实际调用次数不超过确认上限',calls<=plan.modelCalls&&ai.modelCalls===calls);
check('每次模型输入有界',largest<24000);
check('AI 最终叙事覆盖全部分块',new Set(ai.sections.flatMap((s)=>s.sourceIds)).size===plan.chunkCount);
await assert.rejects(summarizePaper(plan,options,{useAI:true,model:async(_i,input)=>input.nodes?JSON.stringify({sections:[{title:'Missing',text:'Missing chunks',sourceIds:['c0001']}]}):JSON.stringify({summary:'Evidence'})}),{status:502});check('模型遗漏分块时停止生成',true);
await assert.rejects(summarizePaper(plan,options,{useAI:true,model:async()=> 'not JSON'}),{status:502});check('模型异常响应不会退回只处理前半稿',true);
for(const kind of ['slides','poster'])for(const style of publishingStyles[kind]){
 const opts=publishingOptions({kind,style:style.id});const rendered=renderPublication({title:'Fixture',author:'Author',sections:local.sections,figures:[]},opts);
 check(`${kind} / ${style.id} 使用对应配色`,rendered.includes(style.accent.slice(1).toUpperCase()));
}
assert.throws(()=>publishingOptions({kind:'slides',style:'injected\\theme'}),{status:400});check('样式参数不能注入 LaTeX',true);
console.log(`Publishing unit: ${count}/${count} passed`);
