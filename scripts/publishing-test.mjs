import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
const BASE=process.env.BASE_URL;let count=0;
const check=(name,value)=>{assert.ok(value,name);count++;console.log('✓',name);};
async function req(url,cookie='',method='GET',body){const r=await fetch(BASE+url,{method,headers:{cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json().catch(()=>({})),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const owner=(await req('/api/auth/login','','POST',{email:'demo@latex.studio',password:'demo1234'})).cookie;
const admin=(await req('/api/auth/login','','POST',{email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})).cookie;
const project=(await req('/api/projects',owner,'POST',{name:'Long manuscript publishing fixture',template:'blank'})).data.project;
const pid=project.id;const base=`/api/workspace/projects/${pid}/derive`;
let main='\\documentclass{article}\n\\title{Long-paper source coverage}\n\\author{Research Author}\n\\begin{document}\n\\input{chapters/long}\n\\section{Final findings}\nThe final measured result is 947 with the stated limitations.\n\\end{document}\n';
const chapter=Array.from({length:24},(_,i)=>`\\section{Study ${i+1}}\n`+`Study ${i+1} investigates a bounded method and reports measured result ${i+42}. A limitation is the restricted sample.\n\n`.repeat(75)).join('');
await req(`/api/projects/${pid}/file?path=main.tex`,owner,'PUT',{content:main});
await req(`/api/projects/${pid}/file`,owner,'POST',{path:'chapters/long.tex',content:chapter});
let plan=(await req(base+'/plan',owner)).data;
check('长稿超过 12 万字符仍可预览分块',plan.chars>120000&&plan.chunkCount>16);
check('预览提供风格和调用预算',plan.styles.slides.length>=8&&plan.styles.poster.length>=8&&plan.modelCalls>plan.chunkCount);
check('计划接口不返回全部稿件正文',plan.chunks.every((c)=>!Object.hasOwn(c,'text')));
check('未确认风格不能创建任务',(await req(base+'/jobs',owner,'POST',{kind:'slides',planDigest:plan.digest})).status===400);
check('未知风格被拒绝',(await req(base+'/jobs',owner,'POST',{kind:'slides',style:'wrong',confirmed:true,planDigest:plan.digest})).status===400);
main+='\n% changed after plan'; // Comment-only edits do not change scientific source.
await req(`/api/projects/${pid}/file?path=main.tex`,owner,'PUT',{content:main.replace('947','948')});
check('过期计划不能直接生成',(await req(base+'/jobs',owner,'POST',{kind:'slides',confirmed:true,planDigest:plan.digest})).status===409);
await req(`/api/projects/${pid}/file?path=main.tex`,owner,'PUT',{content:main});
plan=(await req(base+'/plan',owner)).data;
async function waitJob(id){for(let i=0;i<2400;i++){const j=await req(base+'/jobs/'+id,owner);if(['complete','failed','cancelled'].includes(j.data.status))return j.data;await new Promise((r)=>setTimeout(r,50));}throw Error('Job timeout');}
const sources=[];
for(const kind of ['slides','poster'])for(const style of plan.styles[kind]){
 const started=await req(base+'/jobs',owner,'POST',{kind,style:style.id,ratio:'43',orientation:'landscape',columns:2,count:kind==='slides'?12:6,confirmed:true,planDigest:plan.digest});
 check(`${kind} ${style.id} 任务接受确认设置`,started.status===202&&started.data.options.style===style.id);
 const job=await waitJob(started.data.id);check(`${kind} ${style.id} 完成全稿处理`,job.status==='complete'&&job.result.coverage.processed===plan.chunkCount);
 sources.push({kind,style:style.id,result:job.result});
 const report=(await req(`/api/projects/${job.result.project.id}/file?path=${encodeURIComponent(job.result.reportPath)}`,owner)).data.content;
 const record=JSON.parse(report);check(`${kind} ${style.id} 保留末尾发现和分块追溯`,record.notes.length===plan.chunkCount&&record.notes.some((n)=>n.summary.includes('947')));
 check(`${kind} ${style.id} 保存五步内容整理和实际检查状态`,record.editorial.rounds.length===5&&record.layout.status!=='needs-review');
 const tex=(await req(`/api/projects/${job.result.project.id}/file?path=${job.result.project.mainFile}`,owner)).data.content;
 check(`${kind} ${style.id} 按确认的版式生成`,kind==='slides'?tex.includes('aspectratio=43'):tex.includes('landscape')&&tex.includes('postercolumns}{2}'));
}
check('生成没有修改原稿',(await req(`/api/projects/${pid}/file?path=main.tex`,owner)).data.content===main);
const engines=(await req('/api/system/engines',owner)).data.engines;
if(engines.some((e)=>e.id==='xelatex'))for(const {kind,style,result} of sources){
 const compiled=await req(`/api/projects/${result.project.id}/compile`,owner,'POST',{force:true});
 if(!compiled.data.ok)console.error(compiled.data.errors,compiled.data.log?.slice(-3000));
 check(`${kind} ${style} 可真实编译`,compiled.data.ok===true);
 if(process.env.PUBLISHING_QA_OUT&&compiled.data.ok){fs.mkdirSync(process.env.PUBLISHING_QA_OUT,{recursive:true});const pdf=await fetch(BASE+compiled.data.pdf,{headers:{cookie:owner}});fs.writeFileSync(path.join(process.env.PUBLISHING_QA_OUT,`${kind}-${style}.pdf`),Buffer.from(await pdf.arrayBuffer()));fs.writeFileSync(path.join(process.env.PUBLISHING_QA_OUT,`${kind}-${style}.log`),compiled.data.log||'');}
}
let delayed=false;let modelCalls=0;let hold=false;let release;
const mock=http.createServer(async(r,res)=>{let body='';for await(const b of r)body+=b;const request=JSON.parse(body);const data=JSON.parse(request.messages[1].content);modelCalls++;if(hold){hold=false;await new Promise((r)=>{release=r;});}if(delayed)await new Promise((r)=>setTimeout(r,400));
 const content=data.nodes?{sections:[{title:'All studies',text:'Measured findings and original limitations.',sourceIds:data.nodes.flatMap((n)=>n.ids)}]}:{summary:data.text?`Source ${data.id}: ${data.text.slice(-90)}`:'Combined findings and limitations.'};
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(content)}}]}));});
mock.listen(0,'127.0.0.1');await once(mock,'listening');
try{
 await req('/api/workspace/ai/config',admin,'PUT',{baseUrl:`http://127.0.0.1:${mock.address().port}/v1`,model:'mock-publishing',apiKey:'fixture-key'});
 check('AI 任务需确认分块发送和调用数',(await req(base+'/jobs',owner,'POST',{kind:'slides',confirmed:true,planDigest:plan.digest,useAI:true,consent:true})).status===400);
 let start=await req(base+'/jobs',owner,'POST',{kind:'slides',style:'minimal',confirmed:true,planDigest:plan.digest,useAI:true,consent:true,maxModelCalls:plan.modelCalls});
 const result=await waitJob(start.data.id);check('AI 长稿按计划调用且没有只取前 8 万字符',result.status==='complete'&&modelCalls===plan.modelCalls&&result.result.coverage.processed===plan.chunkCount);
 hold=true;release=null;
 start=await req(base+'/jobs',owner,'POST',{kind:'slides',confirmed:true,planDigest:plan.digest,useAI:true,consent:true,maxModelCalls:plan.modelCalls});
 for(let i=0;i<100&&!release;i++)await new Promise((r)=>setTimeout(r,20));
 assert.ok(release,'Mock first chunk received');
 await req(`/api/projects/${pid}/file?path=main.tex`,owner,'PUT',{content:main.replace('947','999')});release();
 const immutable=await waitJob(start.data.id);
 check('生成时继续编辑不影响已确认的源快照',immutable.status==='complete'&&(await req(`/api/projects/${immutable.result.project.id}/file?path=main.tex`,owner)).data.content===main);
 check('生成不覆盖期间的新编辑',(await req(`/api/projects/${pid}/file?path=main.tex`,owner)).data.content.includes('999'));
 await req(`/api/projects/${pid}/file?path=main.tex`,owner,'PUT',{content:main});
 delayed=true;start=await req(base+'/jobs',owner,'POST',{kind:'poster',confirmed:true,planDigest:plan.digest,useAI:true,consent:true,maxModelCalls:plan.modelCalls});
 check('同项目生成任务不可重复启动',(await req(base+'/jobs',owner,'POST',{kind:'slides',confirmed:true,planDigest:plan.digest})).status===409);
 await req(base+'/jobs/'+start.data.id+'/cancel',owner,'POST',{});
 check('长任务可以取消并保留原稿',(await waitJob(start.data.id)).status==='cancelled'&&(await req(`/api/projects/${pid}/file?path=main.tex`,owner)).data.content===main);
}finally{await new Promise((r)=>mock.close(r));}
await req(`/api/projects/${pid}/members`,owner,'POST',{email:process.env.ADMIN_EMAIL,role:'viewer'});
check('只读成员不能访问生成计划',(await req(base+'/plan',admin)).status===403);
check('只读成员不能启动生成任务',(await req(base+'/jobs',admin,'POST',{kind:'slides',confirmed:true,planDigest:plan.digest})).status===403);
await req('/api/extensions/underoot.publishing',admin,'PATCH',{enabled:false});
check('插件停用时生成端点被阻止',(await req(base+'/jobs',owner,'POST',{kind:'slides',confirmed:true,planDigest:plan.digest})).status===409);
await req('/api/extensions/underoot.publishing',admin,'PATCH',{enabled:true});
check('未登录不能读取拆分计划',(await req(base+'/plan')).status===401);
console.log(`Publishing integration: ${count}/${count} passed`);
