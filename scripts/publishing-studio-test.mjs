import assert from 'node:assert/strict';
import http from 'node:http';
import {once}from'node:events';
import {DatabaseSync}from'node:sqlite';
import path from'node:path';
import fs from'node:fs';
import {renderEditorial as legacyRender}from'../skills/underoot-paper-publishing/scripts/render-editorial-v2.mjs';
import {renderEditorial as v3Render}from'../skills/underoot-paper-publishing/scripts/render-editorial-v3.mjs';
import {renderEditorial as v5Render}from'../skills/underoot-paper-publishing/scripts/render-editorial-v5.mjs';
import {publishingStyles}from'../extensions/builtin/underoot.publishing/styles.mjs';
const BASE=process.env.BASE_URL;let checks=0,calls=0,lastInput,malformed=false,flowReply=false,badSummary=false,holdSummary=false;
const check=(name,value)=>{assert.ok(value,name);checks++;console.log('✓',name);};
async function req(url,cookie='',method='GET',body){const r=await fetch(BASE+url,{method,headers:{cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json().catch(()=>({})),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const owner=(await req('/api/auth/login','','POST',{email:'demo@latex.studio',password:'demo1234'})).cookie;
const admin=(await req('/api/auth/login','','POST',{email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})).cookie;
const mock=http.createServer(async(r,res)=>{let raw='';for await(const b of r)raw+=b;const request=JSON.parse(raw);calls++;const input=JSON.parse(request.messages[1].content);lastInput=input;if(holdSummary&&!input.nodes&&!input.request)await new Promise(r=>setTimeout(r,3800));
 const content=input.request?malformed?{page:{title:'unsafe',takeaway:'x',bullets:[],layout:'visual',figurePath:'../../secret'}}:{explanation:'Shortened the chosen block while retaining its experimental condition.',page:{title:'Measured result under stated conditions',takeaway:'Result 94 under the stated sample.',bullets:['Baseline 91; sample remains restricted.','Please verify uncertainty in source.','Figure~[fig:framework] summarizes SCaDiff.'],layout:'comparison',figurePath:'',...(flowReply?{diagram:{nodes:[{id:'input',label:'Source observations'},{id:'estimate',label:'Evaluated prediction'}],edges:[{from:'input',to:'estimate'}]}}:{})}}:input.nodes?{sections:input.nodes.map((n,i)=>({title:['Research question','Method','Results','Limitations'][i%4],takeaway:n.summary.slice(0,130),bullets:[n.summary.slice(0,160),'Figure~[fig:framework] summarizes SCaDiff.'],sourceIds:n.ids}))}:{summary:(badSummary===true||badSummary==='after-first'&&input.heading==='Bad response')?'x'.repeat(3001):input.text?'Result 94 with baseline 91; the restricted sample limits generalization.':'Restricted findings.'};
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(content)}}]}));});
mock.listen(0,'127.0.0.1');await once(mock,'listening');
try{
 await req('/api/workspace/ai/config',admin,'PUT',{baseUrl:`http://127.0.0.1:${mock.address().port}/v1`,model:'studio-mock',apiKey:'fixture'});
 for(const kind of ['slides','poster']){
 const project=(await req('/api/projects',owner,'POST',{name:'Outline studio '+kind,template:'blank'})).data.project;
 const base=`/api/workspace/projects/${project.id}/derive`;
 let main='\\documentclass{article}\n\\title{Bounded research communication}\n\\author{Test author}\n\\begin{document}\n\\section{Research question}\nWhat changes under a restricted sample?\n\\section{Method}\nWe compare two methods on the same sample.\n\\section{Results}\nMeasured result 94 with baseline 91.\n\\section{Limitations}\nThe sample is restricted; uncertainty is not estimated.\n\\end{document}';
 main=main.replace('\\author{Test author}\n','').replace('\\begin{document}','\\begin{document}\n\\author{Source Alice}\\affiliation{\\institution{Source University}}\n\\author{Source Bob}\\affiliation{\\institution{Source Lab}}\n\\maketitle');
 main=main.replace('\\end{document}',String.raw`\begin{table}\caption{Measured comparison.}\label{tab:studio}\begin{tabular}{lr}Method & Score \\ Baseline & 91 \\ Proposed & 94 \\ \end{tabular}\end{table} Table~\ref{tab:studio} shows a higher score for the proposed method on the same restricted sample.\end{document}`);
 await req(`/api/projects/${project.id}/file?path=main.tex`,owner,'PUT',{content:main});
 const plan=(await req(base+'/plan',owner)).data;
 const projectCount=()=>req('/api/projects',owner).then(r=>r.data.projects.length);
 const before=await projectCount(),beforeCalls=calls;
 const start=await req(base+'/jobs',owner,'POST',{phase:'outline',kind,style:kind==='slides'?'minimal':'gallery',count:kind==='slides'?12:6,useAI:true,consent:true,maxModelCalls:plan.modelCalls,confirmed:true,planDigest:plan.digest});
 check(kind+' outline job accepted',start.status===202);
 async function wait(id,endpoint=base){for(let i=0;i<1200;i++){const j=(await req(endpoint+'/jobs/'+id,owner)).data;if(['complete','failed','cancelled'].includes(j.status))return j;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout');}
 const job=await wait(start.data.id);if(job.status!=='complete')console.error(job);
 let draft=job.result?.draft;check(kind+' AI creates editable outline before project',draft?.pages.length>0&&!draft.projectId&&await projectCount()===before);
 check(kind+' table evidence retains a brief source-grounded conclusion',draft.pages.some(p=>p.tables?.length&&(kind==='poster'||(!p.bullets.length&&p.takeaway.includes('same restricted sample')))));
 check(kind+' whole-paper AI called only at outline stage',calls-beforeCalls<=plan.modelCalls);
 const url=base+'/drafts/'+draft.id;
 check(kind+' title block authors populate without manual input',draft.identity.authors.includes('Source Alice')&&draft.identity.authors.includes('Source Bob')&&draft.identity.affiliations.includes('Source Lab'));
 check(kind+' AI outline strips original paper figure navigation',!JSON.stringify(draft.pages).includes('summarizes SCaDiff'));
 check(kind+' outline does not expose manuscript chunks',!draft.plan&&!draft.summary);
 const repair=new DatabaseSync(path.join(process.env.LATEXSTUDIO_DATA,'app.db'));const repairPayload=JSON.parse(repair.prepare('SELECT payload FROM publishing_sessions WHERE id=?').get(draft.id).payload);repairPayload.editorial.identity={...repairPayload.editorial.identity,authors:'',affiliations:'',contact:''};repairPayload.plan.identity={...repairPayload.editorial.identity};repairPayload.plan.author='';repair.prepare('UPDATE publishing_sessions SET payload=? WHERE id=?').run(JSON.stringify(repairPayload),draft.id);repair.close();draft=(await req(url,owner)).data;
 check(kind+' existing incomplete draft recovers title metadata',draft.identity.authors.includes('Source Bob')&&draft.identity.affiliations.includes('Source University'));
 check(kind+' draft is discoverable',(await req(base+'/drafts',owner)).data.sessions.some(s=>s.id===draft.id));
 const persisted=new DatabaseSync(path.join(process.env.LATEXSTUDIO_DATA,'app.db'),{readOnly:true});const row=persisted.prepare('SELECT payload FROM publishing_sessions WHERE id=?').get(draft.id);persisted.close();check(kind+' review survives process memory loss',JSON.parse(row.payload).editorial.pages[0].title===draft.pages[0].title);
 check(kind+' unconfirmed outline cannot generate',(await req(base+'/jobs',owner,'POST',{draftId:draft.id,version:draft.version})).status===409);
 const old=draft.version;draft.pages[0].title='A user-reviewed research question';draft.pages[0].layout='statement';
 draft=(await req(url,owner,'PUT',{version:draft.version,pages:draft.pages})).data;
 check(kind+' editable title and layout persist',draft.pages[0].title==='A user-reviewed research question'&&draft.pages[0].layout==='statement');
 check(kind+' stale outline cannot overwrite',(await req(url,owner,'PUT',{version:old,pages:draft.pages})).status===409);
 check(kind+' stale confirmation rejected',(await req(base+'/jobs',owner,'POST',{draftId:draft.id,version:old,confirmed:true})).status===409);
 check(kind+' logo traversal is rejected',(await req(url,owner,'PUT',{version:draft.version,pages:draft.pages,identity:{...draft.identity,logos:['../../secret']}})).status===400);
 const form=new FormData();form.append('file',new Blob([fs.readFileSync('scripts/fixtures/publishing/accuracy.png')]),'unit-logo.png');const logoResponse=await fetch(BASE+url+'/logo',{method:'POST',headers:{cookie:owner},body:form});draft=await logoResponse.json();
 check(kind+' logo upload stores an authorized asset',logoResponse.status===200&&draft.identity.logos.length===1);
 const identity={...draft.identity,authors:'[1] Alice Example\n[2] Bob Example',affiliations:'[1] Example University\n[2] Example Institute',contact:'research@example.test',projectUrl:'https://github.com/fanzipei/underoot',reserveCode:true};
 draft=(await req(url,owner,'PUT',{version:draft.version,pages:draft.pages,identity})).data;
 check(kind+' all authors and affiliations persist',draft.identity.authors.includes('Bob Example')&&draft.identity.affiliations.includes('Example Institute'));
 // The immutable source snapshot remains the one used for this outline.
 await req(`/api/projects/${project.id}/file?path=main.tex`,owner,'PUT',{content:main+'\n% source edited after outline'});
 const countAtGenerate=calls;
 const generating=await req(base+'/jobs',owner,'POST',{draftId:draft.id,version:draft.version,confirmed:true});const generated=await wait(generating.data.id);
 if(generated.status!=='complete')console.error(generated);
 check(kind+' confirmed outline generates successfully',generated.status==='complete');
 check(kind+' confirmation does not call AI again',calls===countAtGenerate);
 draft=generated.result.draft;const derived=draft.projectId;const dest=`/api/workspace/projects/${derived}/derive/drafts/${draft.id}`;const file=`/api/projects/${derived}/file?path=${generated.result.project.mainFile}`;
 let original=(await req(file,owner)).data.content;
 check(kind+' generated identity contains all authors and units',['Alice Example','Bob Example','Example University','Example Institute'].every(s=>original.includes(s)));
 const qr=await fetch(BASE+`/api/projects/${derived}/raw?path=${encodeURIComponent(draft.identity.qrPath)}`,{headers:{cookie:owner}});const qrBytes=Buffer.from(await qr.arrayBuffer());check(kind+' QR is generated locally as a real PNG',qr.status===200&&qrBytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
 if(kind==='slides'){
  const prior=new DatabaseSync(path.join(process.env.LATEXSTUDIO_DATA,'app.db'));const saved=JSON.parse(prior.prepare('SELECT payload FROM publishing_sessions WHERE id=?').get(draft.id).payload);saved.rendererVersion=5;for(const page of saved.editorial.pages)if(page.tables?.length)page.takeaway='';
  const oldTex=v5Render({...saved.plan,editorial:saved.editorial},saved.options,publishingStyles.slides.find(s=>s.id===saved.options.style));prior.prepare('UPDATE publishing_sessions SET payload=? WHERE id=?').run(JSON.stringify(saved),draft.id);prior.close();await req(file,owner,'PUT',{content:oldTex});
  const upgraded=await req(`/api/workspace/projects/${derived}/derive/jobs`,owner,'POST',{phase:'reflow',draftId:draft.id,version:draft.version,confirmed:true,identity,style:'metropolis',withFindings:true});const native=await wait(upgraded.data.id,`/api/workspace/projects/${derived}/derive`);
  check('v5 output upgrades to native theme without a false manual-edit conflict',native.status==='complete');draft=native.result.draft;original=(await req(file,owner)).data.content;
  check('explicit enrichment recovers a source-grounded table conclusion',draft.pages.some(p=>p.tables?.length&&p.takeaway.includes('same restricted sample')));
  check('native upgrade retains content and removes absolute font overrides',draft.pages.some(p=>p.title==='A user-reviewed research question')&&original.includes('\\usetheme{metropolis}')&&!original.includes('\\fontsize'));
 }
 // Recreate the v0.8 session format to exercise upgrade/reflow of existing outputs.
 const migration=new DatabaseSync(path.join(process.env.LATEXSTUDIO_DATA,'app.db'));const payload=JSON.parse(migration.prepare('SELECT payload FROM publishing_sessions WHERE id=?').get(draft.id).payload);if(kind==='slides'){delete payload.rendererVersion;delete payload.editorial.identity;}else{payload.rendererVersion=3;payload.preamblePrefix='% retained package-option repair\n';}
 const legacy=(payload.preamblePrefix||'')+(kind==='slides'?legacyRender:v3Render)({...payload.plan,editorial:payload.editorial},payload.options,publishingStyles[kind].find(s=>s.id===payload.options.style));migration.prepare('UPDATE publishing_sessions SET payload=? WHERE id=?').run(JSON.stringify(payload),draft.id);migration.close();await req(file,owner,'PUT',{content:legacy});
 const derivedBase=`/api/workspace/projects/${derived}/derive`;
 const reflow=await req(derivedBase+'/jobs',owner,'POST',{phase:'reflow',draftId:draft.id,version:draft.version,confirmed:true,identity});const refitted=await wait(reflow.data.id,derivedBase);if(refitted.status!=='complete')console.error(refitted);
 check(kind+' legacy v0.8/v0.9 outputs can reflow in the same project',refitted.status==='complete'&&refitted.result.draft.projectId===derived);draft=refitted.result.draft;original=(await req(file,owner)).data.content;
 if(kind==='poster')check('tracked package-option preamble survives reflow',original.startsWith(payload.preamblePrefix));
 check(kind+' reflow retains every author and institution',['Alice Example','Bob Example','Example University','Example Institute'].every(s=>original.includes(s)));
 check(kind+' generated TeX contains approved content and stable markers',original.includes('A user-reviewed research question')&&original.includes('% underoot:block:'));
 check(kind+' source snapshot preserved',(await req(`/api/projects/${derived}/file?path=main.tex`,owner)).data.content===main);
 if(generated.result.editorial.layout.status!=='unavailable')check(kind+' confirmed outline native compile passes',generated.result.editorial.layout.errors.length===0&&generated.result.editorial.layout.pages>0&&!generated.result.editorial.layout.overflowWarnings.some(w=>w.points>1));
 check(kind+' generated project can reopen discussion',(await req(dest,owner)).data.projectId===derived);
 check(kind+' generated outline cannot silently overwrite whole TeX',(await req(dest,owner,'PUT',{version:draft.version,pages:draft.pages})).status===409);
 check(kind+' chat requires consent',(await req(dest+'/chat',owner,'POST',{version:draft.version,pageId:draft.pages[0].id,message:'shorten'})).status===400);
 draft=(await req(dest+'/chat',owner,'POST',{version:draft.version,pageId:draft.pages[0].id,message:'Use a comparison layout, retain experimental conditions.',consent:true})).data;
 check(kind+' chat proposal strips paper-only references',!JSON.stringify(draft.proposal.page).includes('summarizes SCaDiff'));
 check(kind+' proposal leaves TeX unchanged',(await req(file,owner)).data.content===original&&draft.proposal?.page.layout==='comparison');
 check(kind+' chat context contains only selected page and bounded evidence',lastInput.page.id===draft.pages[0].id&&!lastInput.nodes&&!lastInput.text&&lastInput.evidence.length<=3&&JSON.stringify(lastInput).length<12000);
 draft=(await req(dest+'/decide',owner,'POST',{version:draft.version,proposalId:draft.proposal.id,accept:false})).data;
 check(kind+' rejection preserves project',(await req(file,owner)).data.content===original&&!draft.proposal);
 const manual=original.replace('\\begin{document}','% custom preamble retained\n\\begin{document}')+'\n% hand-edited unselected content';
 await req(file,owner,'PUT',{content:manual});
 draft=(await req(dest+'/chat',owner,'POST',{version:draft.version,pageId:draft.pages[0].id,message:'Shorten selected block',consent:true})).data;
 const proposalId=draft.proposal.id;draft=(await req(dest+'/decide',owner,'POST',{version:draft.version,proposalId,accept:true})).data;
 const edited=(await req(file,owner)).data.content;
 check(kind+' accepted revision stays in same project',draft.projectId===derived&&await projectCount()===before+1);
 check(kind+' only chosen block changes',edited.includes('Measured result under stated conditions')&&edited.startsWith(manual.slice(0,manual.indexOf('% underoot:block:')))&&edited.endsWith('% hand-edited unselected content'));
 const chosen=draft.pages[0].id,startMarker=`% underoot:block:${chosen}:start`,endMarker=`% underoot:block:${chosen}:end`;
 const without=s=>s.slice(0,s.indexOf(startMarker))+s.slice(s.indexOf(endMarker)+endMarker.length);
 check(kind+' all unselected TeX bytes preserved',without(edited)===without(manual));
 check(kind+' stale acceptance cannot apply twice',(await req(dest+'/decide',owner,'POST',{version:draft.version-1,proposalId,accept:true})).status===409);
 draft=(await req(dest+'/chat',owner,'POST',{version:draft.version,pageId:chosen,message:'Adjust again',consent:true})).data;
 await req(file,owner,'PUT',{content:edited+'\n% concurrent collaborator edit'});
 check(kind+' concurrent TeX editing prevents overwrite',(await req(dest+'/decide',owner,'POST',{version:draft.version,proposalId:draft.proposal.id,accept:true})).status===409);
 check(kind+' concurrent edit remains',(await req(file,owner)).data.content.endsWith('% concurrent collaborator edit'));
 malformed=true;check(kind+' unknown figure path rejected',(await req(dest+'/chat',owner,'POST',{version:draft.version,pageId:chosen,message:'Add figure',consent:true})).status===400);malformed=false,flowReply=false,badSummary=false,holdSummary=false;
 await req(`/api/projects/${derived}/members`,owner,'POST',{email:process.env.ADMIN_EMAIL,role:'viewer'});
 check(kind+' viewer cannot see private review session',(await req(dest,admin)).status===403);
 check(kind+' viewer cannot apply proposal',(await req(dest+'/decide',admin,'POST',{version:draft.version,proposalId:draft.proposal.id,accept:true})).status===403);
 await req(`/api/projects/${project.id}/members`,owner,'POST',{email:process.env.ADMIN_EMAIL,role:'editor'});
 check(kind+' source editor cannot read private derived discussion',(await req(url,admin)).status===403);
 check(kind+' unauthenticated request blocked',(await req(dest)).status===401);
 check(kind+' original paper is intact',(await req(`/api/projects/${project.id}/file?path=main.tex`,owner)).data.content===main+'\n% source edited after outline');
 const history=(await req(`/api/workspace/projects/${derived}/history`,owner)).data;check(kind+' accepted modifications recorded in history',JSON.stringify(history).includes('插件保存'));
 const engines=(await req('/api/system/engines',owner)).data.engines;
 if(engines.some(e=>e.id==='xelatex')){const compiled=await req(`/api/projects/${derived}/compile`,owner,'POST',{force:true});check(kind+' accepted local edit compiles in existing project',compiled.data.ok===true);}
 const current=(await req(file,owner)).data.content;await req(file,owner,'PUT',{content:current.replace('Measured result under stated conditions','Manually edited target block')});const callCount=calls;
 check(kind+' pre-existing manual block edit is protected',(await req(dest+'/chat',owner,'POST',{version:draft.version,pageId:chosen,message:'Revise this block',consent:true})).status===409&&calls===callCount);
 const protectedTex=(await req(file,owner)).data.content;const rejected=await req(derivedBase+'/jobs',owner,'POST',{phase:'reflow',draftId:draft.id,version:draft.version,confirmed:true,identity});const refused=await wait(rejected.data.id,derivedBase);
 check(kind+' global reflow preserves manual edits',refused.status==='failed'&&(await req(file,owner)).data.content===protectedTex);
 await req(`/api/projects/${project.id}`,owner,'DELETE');
 check(kind+' derived discussion survives deletion of original project',(await req(dest,owner)).data.projectId===derived);
 }


 const quick=(await req('/api/projects',owner,'POST',{name:'One click generation fixture',template:'blank'})).data.project;
 const quickMain=String.raw`\documentclass{article}\title{Measured comparison}\author{Source Author}\begin{document}\section{Method}We compare two predictors under the same budget.\section{Results}Measured result 94 with baseline 91.\begin{table}\caption{Overall measured comparison.}\begin{tabular}{lrr}Method & Score & Cost \\ Baseline & 91 & 5 \\ Evaluated & 94 & 5 \\ \end{tabular}\end{table}\end{document}`;
 await req(`/api/projects/${quick.id}/file?path=main.tex`,owner,'PUT',{content:quickMain});
 const quickBase=`/api/workspace/projects/${quick.id}/derive`,quickPlan=(await req(quickBase+'/plan',owner)).data,quickCalls=calls;
 const instant=await req(quickBase+'/jobs',owner,'POST',{phase:'instant',kind:'slides',style:'minimal',count:12,confirmed:true,planDigest:quickPlan.digest,useAI:true,consent:true,maxModelCalls:quickPlan.modelCalls});
 check('one click starts generation without a separate outline confirmation',instant.status===202);
 let finished;for(let n=0;n<1800;n++){finished=(await req(quickBase+'/jobs/'+instant.data.id,owner)).data;if(['complete','failed','cancelled'].includes(finished.status))break;await new Promise(r=>setTimeout(r,100));}
 if(finished.status!=='complete')console.error(finished);
 check('one click produces a persistent editable project directly',finished.status==='complete'&&!!finished.result.draft.projectId);
 check('one click keeps the declared whole-paper model budget',calls-quickCalls<=quickPlan.modelCalls);
 let quickDraft=finished.result.draft;const quickDest=`/api/workspace/projects/${quickDraft.projectId}/derive/drafts/${quickDraft.id}`,quickFile=`/api/projects/${quickDraft.projectId}/file?path=${finished.result.project.mainFile}`,quickOriginal=(await req(quickFile,owner)).data.content;
 flowReply=true;quickDraft=(await req(quickDest+'/chat',owner,'POST',{version:quickDraft.version,message:'第 2 页改成来源支持的流程图',consent:true})).data;flowReply=false;
 check('chat resolves a PDF page number without a block selector',quickDraft.proposal.pageId===quickDraft.pages[0].id&&!!quickDraft.proposal.page.diagram);
 quickDraft=(await req(quickDest+'/decide',owner,'POST',{version:quickDraft.version,proposalId:quickDraft.proposal.id,accept:true})).data;
 check('grounded flowchart is editable vector TeX',(await req(quickFile,owner)).data.content.includes('tikzpicture'));
 const callsBeforeUndo=calls;quickDraft=(await req(quickDest+'/chat',owner,'POST',{version:quickDraft.version,message:'撤销上次修改',consent:true})).data;
 quickDraft=(await req(quickDest+'/decide',owner,'POST',{version:quickDraft.version,proposalId:quickDraft.proposal.id,accept:true})).data;
 check('chat undo restores the prior TeX without another model call',calls===callsBeforeUndo&&(await req(quickFile,owner)).data.content===quickOriginal);
 if((await req('/api/system/engines',owner)).data.engines.some(e=>e.id==='xelatex')){
  const project=(await req('/api/projects',owner,'POST',{name:'Oversized caption safety fixture',template:'blank'})).data.project;
  const source=String.raw`\documentclass{article}\author{Fixture Author}\begin{document}\section{Method}We evaluate the measured evidence.\begin{figure}\includegraphics{accuracy.png}\caption{`+'Measured caption words '.repeat(2000)+String.raw`}\end{figure}\end{document}`;
  await req(`/api/projects/${project.id}/file?path=main.tex`,owner,'PUT',{content:source});
  const upload=new FormData();upload.append('files',new Blob([fs.readFileSync('scripts/fixtures/publishing/accuracy.png')]),'accuracy.png');await fetch(BASE+`/api/projects/${project.id}/upload`,{method:'POST',headers:{cookie:owner},body:upload});
  const base=`/api/workspace/projects/${project.id}/derive`,plan=(await req(base+'/plan',owner)).data;
  async function waitSafety(id){for(let n=0;n<1800;n++){const job=(await req(base+'/jobs/'+id,owner)).data;if(['complete','failed','cancelled'].includes(job.status))return job;await new Promise(r=>setTimeout(r,100));}throw Error('Safety fixture timeout');}
  const start=await req(base+'/jobs',owner,'POST',{phase:'outline',kind:'poster',style:'gallery',count:6,columns:3,useAI:false,confirmed:true,planDigest:plan.digest});assert.equal(start.status,202,JSON.stringify(start.data));const outline=await waitSafety(start.data.id);
  check('oversized visual retains an editable outline',outline.status==='complete'&&outline.result.draft.pages.length>0);
  const draft=outline.result.draft,before=(await req('/api/projects',owner)).data.projects.length;
  const generate=await req(base+'/jobs',owner,'POST',{draftId:draft.id,version:draft.version,confirmed:true});const failed=await waitSafety(generate.data.id);
  check('known overflowing output is not published as completed',failed.status==='failed'&&(await req('/api/projects',owner)).data.projects.length===before);
  check('failed fitting preserves original manuscript and approved outline',(await req(`/api/projects/${project.id}/file?path=main.tex`,owner)).data.content===source&&!(await req(base+'/drafts/'+draft.id,owner)).data.projectId);
 }
 const stalledProject=(await req('/api/projects',owner,'POST',{name:'Model response progress fixture',template:'blank'})).data.project;
 await req(`/api/projects/${stalledProject.id}/file?path=main.tex`,owner,'PUT',{content:String.raw`\documentclass{article}\title{Progress Fixture}\begin{document}\section{Results}A source-supported finding under a fixed budget.\end{document}`});
 const tracking=`/api/workspace/projects/${stalledProject.id}/derive`,trackingPlan=(await req(tracking+'/plan',owner)).data;
 badSummary=true;holdSummary=true;const beforeFailureCalls=calls;
 const pending=(await req(tracking+'/jobs',owner,'POST',{phase:'instant',kind:'slides',useAI:true,consent:true,confirmed:true,planDigest:trackingPlan.digest,maxModelCalls:trackingPlan.modelCalls})).data;
 await new Promise(r=>setTimeout(r,3200));const running=(await req(tracking+'/jobs/'+pending.id,owner)).data;
 check('model wait has a live heartbeat and actual request count',running.status==='running'&&running.heartbeatAt>running.startedAt&&running.progress.modelCalls===1);
 check('active job discovery reconnects without another model request',(await req(tracking+'/jobs',owner)).data.jobs.some(j=>j.id===pending.id)&&calls===beforeFailureCalls+1);
 check('active job listing requires project access',(await req(tracking+'/jobs')).status===401);
 let failure;for(let n=0;n<180;n++){failure=(await req(tracking+'/jobs/'+pending.id,owner)).data;if(failure.status==='failed')break;await new Promise(r=>setTimeout(r,100));}
 badSummary=false;holdSummary=false;
 check('oversized model response is terminal with an actionable size error',failure.status==='failed'&&failure.progress.phase==='failed'&&failure.error.includes('3001')&&!!failure.finishedAt);
 check('failed job no longer appears active and makes no further API calls',!(await req(tracking+'/jobs',owner)).data.jobs.length&&calls===beforeFailureCalls+3);
 const resumeProject=(await req('/api/projects',owner,'POST',{name:'Partial summary recovery fixture',template:'blank'})).data.project;
 await req(`/api/projects/${resumeProject.id}/file?path=main.tex`,owner,'PUT',{content:String.raw`\section{Good source}A preserved first source statement.\section{Bad response}A second original statement under the same scope.`});
 const resumeBase=`/api/workspace/projects/${resumeProject.id}/derive`,resumePlan=(await req(resumeBase+'/plan',owner)).data,runBody={phase:'instant',kind:'slides',useAI:true,consent:true,confirmed:true,planDigest:resumePlan.digest,maxModelCalls:resumePlan.modelCalls};
 async function finishResume(id){for(let n=0;n<1800;n++){const j=(await req(resumeBase+'/jobs/'+id,owner)).data;if(['complete','failed','cancelled'].includes(j.status))return j;await new Promise(r=>setTimeout(r,100));}throw Error('Resume timeout');}
 badSummary='after-first';const firstResume=(await req(resumeBase+'/jobs',owner,'POST',runBody)).data;const partial=await finishResume(firstResume.id);badSummary=false;
 check('partial reading fails only after bounded model correction',partial.status==='failed');const resumeCalls=calls;
 const secondResume=(await req(resumeBase+'/jobs',owner,'POST',runBody)).data;const recovered=await finishResume(secondResume.id);
 check('retry reuses validated completed chunks from the private cache',recovered.status==='complete'&&calls-resumeCalls===2);
 console.log(`Publishing studio: ${checks}/${checks} passed`);
}finally{await new Promise(r=>mock.close(r));}
