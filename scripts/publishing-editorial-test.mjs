import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';
import{paperPlan}from'../skills/underoot-paper-publishing/scripts/chunk-paper.mjs';
import{editorialPlan}from'../skills/underoot-paper-publishing/scripts/editorial-plan.mjs';
import{sourceEvidence,argument}from'../skills/underoot-paper-publishing/scripts/source-evidence.mjs';
import{summarizePaper}from'../extensions/builtin/underoot.publishing/summarize.mjs';
import{renderPublication,publishingOptions}from'../extensions/builtin/underoot.publishing/styles.mjs';
let count=0;const check=(name,value)=>{assert.ok(value,name);console.log('✓',name);count++;};
const source=fs.readFileSync(new URL('./fixtures/publishing/main.tex',import.meta.url),'utf8');
const plan=paperPlan(source,{title:'Sparse Signals Improve Accuracy Under a Fixed Research Budget',author:'Synthetic Research Fixture'});Object.assign(plan,sourceEvidence(source,plan.chunks,['accuracy.png']));
check('平衡读取嵌套图注',plan.visuals[0].caption.includes('Measured accuracy')&&plan.visuals[0].caption.includes('87.1'));
check('公式保持原始源码',plan.equations[0].tex.includes('\\frac{1}{n}'));
check('表格保留表头、原值和百分号',plan.tables[0].headers[1]==='Accuracy'&&plan.tables[0].rows[1][1]==='84.0%');
const numericTable=source.replaceAll('84.0\\%','\u0024 84.0\\% \\pm 0.3 \u0024');
check('数学模式数值表格保留百分号与不确定性',sourceEvidence(numericTable,paperPlan(numericTable).chunks).tables[0].rows[1][1]==='84.0% ± 0.3');
check('标题嵌套命令不被截断',argument('\\title{A \\textbf{nested} title}','title').value==='A \\textbf{nested} title');
const ambiguous='\\begin{figure}\\includegraphics{same}\\caption{Unknown path}\\end{figure}';
check('同名图片有歧义时不猜测放置',sourceEvidence(ambiguous,paperPlan(ambiguous).chunks,['a/same.png','b/same.png']).visuals.length===0);
const explicit=ambiguous.replace('{same}','{b/same.png}');check('同名图片优先精确路径',sourceEvidence(explicit,paperPlan(explicit).chunks,['a/same.png','b/same.png']).visuals.some(v=>v.path==='b/same.png'&&v.caption==='Unknown path'));
const unsafeEquation=sourceEvidence('\\begin{equation}\\input{secret}\\end{equation}',[]);check('不移植包含文件读取命令的公式',unsafeEquation.equations.length===0&&unsafeEquation.evidenceWarnings.length>0);
for(const kind of['slides','poster']){
 const options=publishingOptions({kind,count:kind==='slides'?12:6});const summary=await summarizePaper(plan,options);const editorial=editorialPlan(plan,summary,options);
 check(`${kind} 完成五轮有记录的内容/版面预检`,editorial.rounds.length===5);
 check(`${kind} 保留所有来源与笔记`,editorial.metrics.sourceCoverage===plan.chunkCount&&editorial.notes.length===plan.chunkCount);
 check(`${kind} 保留方法与局限的独立主题`,editorial.pages.some(p=>p.role==='method')&&editorial.pages.some(p=>p.role==='limitation'));
 check(`${kind} 研究问题位于方法和结果之前`,editorial.pages.findIndex(p=>p.title==='Research question')>=0&&editorial.pages.findIndex(p=>p.title==='Research question')<editorial.pages.findIndex(p=>p.role==='method'));
 check(`${kind} 百分号后的基线与限定条件未被当作注释删除`,summary.sections.some(p=>p.text.includes('87.1% for the proposed method and 80.2% for the baseline.'))&&summary.sections.some(p=>p.text.includes('84.0%. This supports')));
 check(`${kind} 图片位于对应结果主题`,editorial.pages.some(p=>p.figures.some(f=>f.path==='accuracy.png')&&p.sourceIds.some(id=>plan.visuals[0].sourceIds.includes(id))));
 const tex=renderPublication({...plan,sections:summary.sections,editorial},options);
 check(`${kind} 使用要点排版而非连续原文`,tex.includes('\\begin{itemize}')&&!tex.includes('\\small '));
 check(`${kind} 图注保留实验条件`,tex.includes('identical annotation budget'));
 if(kind==='slides')check('不再使用 allowframebreaks 隐藏过密正文',!tex.includes('allowframebreaks'));
 if(kind==='slides')check('表格采用可编辑的证据页',tex.includes('\\begin{tabularx}')&&tex.includes('84.0\\%'));
 if(kind==='poster')check('Poster 覆盖至少两个栏位',editorial.columns.filter(c=>c.length).length>=2);
 if(kind==='poster')check('海报平衡栏位仍保持研究叙事顺序',editorial.columns.flat().join(',')===editorial.pages.map(p=>p.id).join(','));
 check(`${kind} 百分号不显示为反斜杠文本`,!tex.includes('textbackslash{}\\%'));
 if(process.env.EDITORIAL_QA_OUT){fs.mkdirSync(process.env.EDITORIAL_QA_OUT,{recursive:true});fs.writeFileSync(path.join(process.env.EDITORIAL_QA_OUT,kind+'.tex'),tex);fs.writeFileSync(path.join(process.env.EDITORIAL_QA_OUT,kind+'.json'),JSON.stringify(editorial,null,2));}
}
let modelCalls=0;const ai=await summarizePaper(plan,publishingOptions({kind:'slides'}),{useAI:true,model:async(_instruction,data)=>{
 modelCalls++;if(!data.nodes)return JSON.stringify({summary:'Source-linked evidence from '+(data.id||'group')});
 return JSON.stringify({sections:[{title:'Accuracy is 87.1% under the evaluated budget',takeaway:'The first-dataset gain is bounded by the tested conditions.',bullets:['The method reaches 87.1%; the baseline reaches 80.2%.','Results are restricted to the evaluated datasets.'],sourceIds:data.nodes.flatMap(n=>n.ids)}]});
}});
check('AI 支持主张句与结构化要点，不强制连续段落',ai.sections[0].bullets.length===2&&ai.sections[0].text.includes('87.1'));
check('五步预检不偷偷增加模型调用',modelCalls<=plan.modelCalls);
const bad=structuredClone(ai);bad.sections[0].bullets.push('Unreported accuracy is 999.9%.');const review=editorialPlan(plan,bad,publishingOptions({kind:'slides'}));
check('无源码原值的模型数字列入待核验项',review.warnings.some(w=>w.includes('999.9')));
console.log(`Publishing editorial: ${count}/${count} passed`);
