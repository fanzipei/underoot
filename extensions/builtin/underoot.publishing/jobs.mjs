import crypto from 'node:crypto';
import { deriveProject, publishingPlan } from './server.js';
import { publishingOptions } from './styles.mjs';
import { failure } from '../../../server/project-history.js';
import { aiConfig } from '../../../server/ai-service.js';
import { listCustomTemplates } from '../../../server/publishing-templates.js';
import {prepareSession,generateSession,getSession,reflowSession} from './sessions.mjs';
const jobs = new Map();
const active = (job) => ['queued','running'].includes(job.status);
const expose = ({ controller, userId, ...job }) => job;
export function activePublishingJobs(projectId,userId){return{jobs:[...jobs.values()].filter(j=>j.projectId===projectId&&j.userId===userId&&active(j)).map(expose)};}
export function startPublishing(project, userId, body) {
 const draft=body.draftId?getSession(project,userId,body.draftId):null;
 if(draft&&(!body.confirmed||body.version!==draft.version))throw failure(409,'请保存并确认当前提纲');
 const reflowOptions=draft&&body.phase==='reflow'?publishingOptions({...draft.options,...Object.fromEntries(['style','orientation','ratio','columns','count'].filter(k=>body[k]!==undefined).map(k=>[k,body[k]]))},listCustomTemplates(userId)):null;
 const options = reflowOptions || draft?.options || publishingOptions(body,listCustomTemplates(userId));
 if(draft)body={...body,...options,useAI:false,planDigest:'approved'};
 if (body.confirmed !== true || !body.planDigest) throw failure(400,'请先查看分块计划并确认生成风格');
 const plan = draft?{digest:'approved'}:publishingPlan(project,userId);
 if (!draft&&plan.digest !== body.planDigest) throw failure(409,'稿件或插图已变化，请重新预览后确认');
 if (body.useAI && (body.consent !== true || body.maxModelCalls !== plan.modelCalls)) throw failure(400,'请确认当前分块计划的模型调用次数');
 if (body.useAI && !aiConfig().configured) throw failure(503,'请先配置模型 API 或选择本地结构化草稿');
 for (const [id,job] of jobs) if (!active(job) && Date.now()-job.updatedAt>3600000) jobs.delete(id);
 if ([...jobs.values()].some((j)=>active(j)&&(j.projectId===project.id||j.userId===userId))) throw failure(409,'你或此项目已有生成任务，请先查看或取消');
 if ([...jobs.values()].filter(active).length>=2) throw failure(429,'生成队列正忙，请稍后重试');
 if (jobs.size>=80) for (const [id,job] of jobs) if (!active(job)) { jobs.delete(id); break; }
 const id=crypto.randomUUID();
 const ts=Date.now();const job={id,projectId:project.id,userId,status:'queued',options,useAI:!!body.useAI,maxModelCalls:body.useAI?body.maxModelCalls:0,progress:{phase:'queued',message:'已确认风格，等待启动'},createdAt:ts,updatedAt:ts,phaseStartedAt:ts,heartbeatAt:ts,events:[],controller:new AbortController()};
 jobs.set(id,job);
 setImmediate(async()=>{
  if (job.status==='cancelled') return;
  job.status='running';job.startedAt=Date.now();job.heartbeatAt=job.startedAt;
  const heartbeat=setInterval(()=>{job.heartbeatAt=Date.now();},3000);heartbeat.unref();
  const timer=setTimeout(()=>job.controller.abort('timeout'),20*60*1000); timer.unref();
  try {
   const runtime={signal:job.controller.signal,progress:(progress)=>{const at=Date.now();if(progress.phase!==job.progress.phase)job.phaseStartedAt=at;job.progress={...job.progress,...progress};job.updatedAt=at;job.heartbeatAt=at;job.events.push({at,phase:progress.phase,message:progress.message});job.events=job.events.slice(-8);}};
   if(!draft&&body.phase==='instant'){const prepared=await prepareSession(project,userId,body,runtime);job.draftId=prepared.draft.id;job.result=await generateSession(project,userId,prepared.draft.id,{confirmed:true,version:prepared.draft.version},runtime);}
   else job.result=draft?await (body.phase==='reflow'?reflowSession:generateSession)(project,userId,body.draftId,body,runtime):body.phase==='outline'?await prepareSession(project,userId,body,runtime):await deriveProject(project,userId,body,runtime);
   job.status='complete'; job.progress={...job.progress,phase:'complete',message:body.phase==='outline'?'提纲已保存，请编辑并确认':body.phase==='reflow'?'已完成当前项目重排，历史版本保留':'已生成独立项目，原稿保留'};
  }catch(error){job.failedPhase=job.progress.phase;job.status=job.controller.signal.aborted?'cancelled':'failed';job.error=job.controller.signal.reason==='timeout'?'生成超过 20 分钟，已停止；原稿保留':job.controller.signal.aborted?'已取消生成，原稿保留':error.message;job.progress={...job.progress,phase:job.status,message:job.error};}
  finally{clearTimeout(timer);clearInterval(heartbeat);job.finishedAt=Date.now();job.updatedAt=job.finishedAt;job.heartbeatAt=job.finishedAt;}
 });
 return expose(job);
}
export function publishingJob(projectId,userId,id,cancel=false){
 const job=jobs.get(id);
 if (!job||job.projectId!==projectId||job.userId!==userId) throw failure(404,'生成任务不存在或服务已重启，请重新确认后生成');
 if(cancel&&active(job)){job.cancelling=true;job.controller.abort('cancelled');if(job.status==='queued'){job.status='cancelled';job.finishedAt=Date.now();job.error='已取消生成，原稿保留';}job.updatedAt=Date.now();}
 return expose(job);
}
