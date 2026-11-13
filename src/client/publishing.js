import{api}from'./api.js';import{modal,toast}from'./ui.js';import{openPublishingDraft}from'./publishing-draft.js';
/** The menu action is the single generation action; no outline form or second confirmation. */
export async function openPublishing(project,kind='slides'){
 try{
  const base=`/api/workspace/projects/${project.id}/derive`,saved=await api.get(base+'/drafts');
  if(kind==='chat'){const previous=saved.sessions.find(s=>s.derived_project)||saved.sessions[0];if(previous)return openPublishingDraft(project,previous.id);toast('当前项目还没有生成记录，请先生成 Slides 或 Poster');return;}
  const existing=saved.sessions.find(s=>s.derived_project===project.id);if(existing)return openPublishingDraft(project,existing.id);
  const[plan,ai]=await Promise.all([api.get(base+'/plan'),api.get('/api/workspace/ai/status')]);
  const{root,close}=modal({title:kind==='slides'?'正在生成 Slides':'正在生成 Poster',subtitle:'自动整理研究故事与核心图表，完成后通过聊天继续修改',bodyHtml:`<p class="src-note">${ai.configured?`使用已配置的 AI 阅读全稿，最多 ${plan.modelCalls} 次调用，可能产生服务商费用。`:'未配置 AI，使用本地结构化草稿；可配置模型后改进叙事。'}原论文保留。</p><p class="publishing-run-status" role="status" aria-live="polite">正在准备…</p>`,footerHtml:'<button class="btn" data-close>关闭（后台继续）</button><button class="btn" data-cancel>停止生成</button>'});
  const label=root.querySelector('[role=status]'),key='underoot.publishing.instant.'+project.id;let job,closed=false;
  root.querySelector('[data-close]').onclick=()=>{closed=true;close();};root.querySelector('[data-cancel]').onclick=async()=>{if(job)await api.post(base+'/jobs/'+job.id+'/cancel',{});};
  try{
   const previous=sessionStorage.getItem(key);job=previous?await api.get(base+'/jobs/'+previous).catch(()=>null):null;
   if(!job||['failed','cancelled','complete'].includes(job.status))job=await api.post(base+'/jobs',{phase:'instant',kind,style:kind==='slides'?'metropolis':'gallery',ratio:'169',orientation:'landscape',columns:3,count:kind==='slides'?18:6,confirmed:true,planDigest:plan.digest,useAI:ai.configured,consent:ai.configured,maxModelCalls:plan.modelCalls});
   sessionStorage.setItem(key,job.id);
   while(['running','queued'].includes(job.status)){label.textContent=job.progress.message;await new Promise(r=>setTimeout(r,1000));job=await api.get(base+'/jobs/'+job.id);}
   sessionStorage.removeItem(key);
   if(job.status!=='complete'){if(job.draftId&&!closed){close();await openPublishingDraft(project,job.draftId,{notice:job.error});return;}throw Error(job.error||'生成已停止，原稿保留');}
   if(closed){toast('Slides / Poster 已生成，可在项目列表打开','ok');return;}
   close();location.hash=`#/p/${job.result.project.id}`;await openPublishingDraft({...project,id:job.result.project.id},job.result.draft.id);
  }catch(error){label.textContent=error.message;root.querySelector('[data-cancel]').hidden=true;root.querySelector('[data-close]').textContent='关闭';sessionStorage.removeItem(key);if(closed)toast(error.message,'err');}
 }catch(error){toast(error.message,'err');}
}
