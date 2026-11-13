import{api}from'./api.js';import{modal,toast,escapeHtml as e}from'./ui.js';import{openPublishingDraft}from'./publishing-draft.js';
const trackers=new Map(),active=j=>['queued','running'].includes(j?.status);
const steps=['准备稿件','阅读全文','整理叙事','编译与排版','保存项目'];
const phaseIndex=p=>({queued:0,prepare:0,chunks:1,reduce:2,compose:2,render:3,layout:3,compile:3,save:4,complete:5}[p]??0);
const duration=ms=>{const s=Math.max(0,Math.floor(ms/1000));return s>=60?`${Math.floor(s/60)} 分 ${String(s%60).padStart(2,'0')} 秒`:`${s} 秒`;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function activityHost(){let host=document.getElementById('publishing-activity');if(!host){host=document.createElement('div');host.id='publishing-activity';document.body.append(host);}return host;}
/** One click generates; the same tracker survives closing/reopening the dialog. */
export async function openPublishing(project,kind='slides'){
 if(kind==='chat'){try{const saved=await api.get(`/api/workspace/projects/${project.id}/derive/drafts`),previous=saved.sessions.find(s=>s.derived_project)||saved.sessions[0];if(previous)return openPublishingDraft(project,previous.id);toast('当前项目还没有生成记录，请先生成 Slides 或 Poster');}catch(error){toast(error.message,'err');}return;}
 if(trackers.has(project.id)){trackers.get(project.id).open();return;}
 const base=`/api/workspace/projects/${project.id}/derive`,key='underoot.publishing.instant.'+project.id;
 let job=null,view=null,offline='',lastContact=0,disposed=false,failedPolls=0,budget='正在检查稿件与模型配置…',started=Date.now();
 const badge=document.createElement('button');badge.type='button';badge.className='publishing-activity btn';activityHost().append(badge);
 function cleanup(){disposed=true;clearInterval(clock);view?.close();badge.remove();trackers.delete(project.id);}
 function removeSaved(){try{sessionStorage.removeItem(key);}catch{}}
 async function openResult(){if(!job?.result?.project)return;const result=job.result;removeSaved();cleanup();location.hash=`#/p/${result.project.id}`;await openPublishingDraft({...project,id:result.project.id},result.draft.id);}
 function show(){if(disposed)return;if(view?.root.isConnected){view.root.querySelector('textarea,button')?.focus();return;}
  view=modal({title:'正在准备 '+(kind==='slides'?'Slides':'Poster'),subtitle:'可关闭此窗口，右下角会持续显示进度；重新打开不会重复生成',bodyHtml:`<div class="publishing-progress"><p class="src-note" data-budget></p><ol class="publishing-steps">${steps.map((s,i)=>`<li data-step="${i}"><span>${i+1}</span>${s}</li>`).join('')}</ol><div class="publishing-current"><i data-pulse aria-hidden="true"></i><strong data-phase role="status" aria-live="polite">正在准备…</strong></div><progress data-chunks aria-label="当前阶段完成进度" hidden></progress><p class="publishing-count" data-count></p><div class="publishing-times"><span data-elapsed></span><span data-contact></span><span data-step-time></span></div><p class="publishing-error" data-error role="alert" hidden></p><details><summary>最近的处理记录</summary><ul data-events></ul></details><p class="src-note">阶段表示实际处理状态，不估算剩余时间。编译排版阶段可能不再调用 AI。</p></div>`,footerHtml:'<button class="btn" data-close>关闭（后台继续）</button><button class="btn" data-cancel>停止生成</button><button class="btn" data-draft hidden>查看保留草稿</button><button class="btn btn-primary" data-retry hidden>重新生成</button><button class="btn btn-primary" data-result hidden>打开结果</button>'});
  const q=s=>view.root.querySelector(s);q('[data-close]').onclick=()=>{view.close();draw();};q('[data-result]').onclick=openResult;
  q('[data-draft]').onclick=async()=>{const id=job.draftId;removeSaved();cleanup();await openPublishingDraft(project,id,{notice:job.error});};
  q('[data-retry]').onclick=()=>{removeSaved();cleanup();openPublishing(project,kind);};
  q('[data-cancel]').onclick=async()=>{if(!job?.id)return;q('[data-cancel]').disabled=true;try{job=await api.post(base+'/jobs/'+job.id+'/cancel',{});lastContact=Date.now();offline='';draw();}catch(error){offline='停止请求未确认：'+error.message;draw();}};
  draw();
 }
 function draw(){if(disposed)return;const running=!job||active(job),terminal=job&&!active(job),name=(job?.options?.kind||kind)==='slides'?'Slides':'Poster',idx=phaseIndex(job?.failedPhase||job?.progress?.phase),elapsed=duration((job?.finishedAt||Date.now())-(job?.startedAt||job?.createdAt||started));
  const phase=terminal?(job.status==='complete'?'项目与检查记录已保存':job.status==='cancelled'?'任务已停止，原稿保留':job.status==='unavailable'?'无法确认后台任务是否仍在运行':'本次生成已停止，后续模型调用未继续'):offline?'连接暂时中断，正在重新查询状态':job?.cancelling&&running?'正在停止，等待当前处理退出…':job?.progress?.message||'正在准备稿件和任务…';
  badge.textContent=`${running?'◌ ':job?.status==='complete'?'✓ ':'! '}${name} · ${terminal?(job.status==='complete'?'已完成':job.status==='cancelled'?'已停止':'需要处理'):offline?'连接中断':steps[Math.min(idx,4)]} · ${elapsed}`;
  badge.hidden=!!view?.root.isConnected;badge.classList.toggle('is-running',running&&!offline);badge.onclick=show;
  if(!view?.root.isConnected)return;const q=s=>view.root.querySelector(s);
  q('h3').textContent=terminal?(job.status==='complete'?name+' 已生成':job.status==='cancelled'?'生成已停止':job.status==='unavailable'?'无法确认任务状态':'生成失败'):'正在生成 '+name;
  q('[data-budget]').textContent=budget;if(q('[data-phase]').textContent!==phase)q('[data-phase]').textContent=phase;q('[data-pulse]').hidden=!!terminal||!!offline;
  for(const li of view.root.querySelectorAll('[data-step]')){const i=Number(li.dataset.step);li.classList.toggle('done',job?.status==='complete'||i<idx);li.classList.toggle('current',running&&i===idx);li.classList.toggle('failed',terminal&&job.status!=='complete'&&i===idx);li.querySelector('span').textContent=job?.status==='complete'||i<idx?'✓':String(i+1);}
  const p=job?.progress||{},quantified=running&&['chunks','reduce'].includes(p.phase)&&p.total>0;
  q('[data-chunks]').hidden=!quantified;if(quantified){q('[data-chunks]').max=p.total;q('[data-chunks]').value=Math.min(p.completed||0,p.total);}
  const counts=[];if(p.repairAttempt)counts.push(`${p.retryKind==='transport'?'请求重试':'当前步骤自动修正'} ${p.repairAttempt}/${p.maxRepairAttempts||2}`);if(quantified)counts.push(`当前阶段已完成 ${p.completed||0} / ${p.total}`);if(job?.useAI)counts.push(`模型已请求 ${p.modelCalls||0} 次${job.maxModelCalls?' / 上限 '+job.maxModelCalls+' 次':''}`);if(p.layoutRound&&phaseIndex(p.phase)===3)counts.push(`排版检查第 ${p.layoutRound} 轮`);q('[data-count]').textContent=counts.join(' · ');
  q('[data-elapsed]').textContent=(terminal?'总耗时 ':'已用时 ')+elapsed;
  q('[data-contact]').textContent=terminal?(job.status==='unavailable'?'任务状态尚未确认':'最终状态已确认'):lastContact?`状态连接：${duration(Date.now()-lastContact)}前收到回复`:'正在连接任务服务…';
  q('[data-step-time]').textContent=running&&job?.phaseStartedAt?'当前阶段已用 '+duration(Date.now()-job.phaseStartedAt)+(p.requestStartedAt&&['chunks','reduce','compose'].includes(p.phase)?'；本次请求已用 '+duration(Date.now()-p.requestStartedAt)+'（单次时限 '+duration(p.requestTimeoutMs)+'）':''):'';
  q('[data-error]').hidden=!offline&&!job?.error;q('[data-error]').textContent=offline||job?.error||'';
  q('[data-close]').textContent=terminal?'关闭':'关闭（后台继续）';q('[data-cancel]').hidden=!!terminal;q('[data-cancel]').disabled=!job?.id||!!job?.cancelling;
  q('[data-retry]').hidden=!terminal||job.status==='complete';q('[data-retry]').textContent=job?.status==='unavailable'?'重新查询／重试':'重试（复用已完成内容）';
  q('[data-draft]').hidden=!terminal||!job?.draftId||job.status==='complete';q('[data-result]').hidden=job?.status!=='complete';
  q('[data-events]').innerHTML=(job?.events||[]).slice(-6).reverse().map(event=>`<li>${e(event.message)}</li>`).join('')||'<li>任务启动后会记录实际阶段变化。</li>';
 }
 const clock=setInterval(draw,1000);trackers.set(project.id,{open:show});show();
 try{
  const [saved,live]=await Promise.all([api.get(base+'/drafts'),api.get(base+'/jobs')]);
  const existing=saved.sessions.find(s=>s.derived_project===project.id);if(existing){cleanup();return openPublishingDraft(project,existing.id);}
  job=live.jobs[0]||null;
  let previous;try{previous=sessionStorage.getItem(key);}catch{}
  if(!job&&previous){try{job=await api.get(base+'/jobs/'+previous);}catch(error){if(error.status===404)throw Error('任务记录已失效，服务可能已重启；原稿保留。请确认后重新生成。');throw error;}}
  if(!job){const[plan,ai]=await Promise.all([api.get(base+'/plan'),api.get('/api/workspace/ai/status')]);budget=ai.configured?`AI 阅读全稿，最多 ${plan.modelCalls} 次模型调用（包含至多 3 次自动修正），可能产生服务商费用；原论文保留。`:'未配置 AI，使用本地结构化草稿；原论文保留。';draw();job=await api.post(base+'/jobs',{phase:'instant',kind,style:kind==='slides'?'metropolis':'gallery',ratio:'169',orientation:'landscape',columns:3,count:kind==='slides'?18:6,confirmed:true,planDigest:plan.digest,useAI:ai.configured,consent:ai.configured,maxModelCalls:plan.modelCalls});}
  else budget=job.useAI?`AI 阅读全稿，最多 ${job.maxModelCalls||'已确认上限内的'} 次模型调用；已重新连接现有任务，不会重复生成。`:'已重新连接现有任务；原论文保留。';
  lastContact=Date.now();try{sessionStorage.setItem(key,job.id);}catch{}draw();
  while(active(job)&&!disposed){await pause(offline?3000:1000);try{job=await api.get(base+'/jobs/'+job.id,{signal:AbortSignal.timeout(15000)});lastContact=Date.now();offline='';failedPolls=0;}catch(error){if([401,403,404].includes(error.status)){job={...job,status:'unavailable',error:error.status===404?'任务记录已失效，服务可能已重启；原稿保留。':'无法读取任务状态，请重新登录或检查项目权限。后台任务状态尚未确认。'};break;}failedPolls++;offline=`状态连接中断，正在重试（${failedPolls}）。后台任务可能仍在运行，请勿重复生成。`; }draw();}
  if(disposed)return;draw();if(job.status==='complete'&&view?.root.isConnected)await openResult();else if(!view?.root.isConnected)toast(job.status==='complete'?nameOf(job)+' 已生成，点击右下角打开结果':job.error||'生成已停止',job.status==='complete'?'ok':'err');
 }catch(error){job={...job,status:'failed',error:error.message,finishedAt:Date.now(),progress:{...job?.progress,message:error.message}};draw();}
}
const nameOf=job=>job.options?.kind==='poster'?'Poster':'Slides';
