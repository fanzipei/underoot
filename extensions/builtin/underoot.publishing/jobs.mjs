import crypto from 'node:crypto';
import { deriveProject, publishingPlan } from './server.js';
import { publishingOptions } from './styles.mjs';
import { failure } from '../../../server/project-history.js';
import { aiConfig } from '../../../server/ai-service.js';
import { listCustomTemplates } from '../../../server/publishing-templates.js';
const jobs = new Map();
const active = (job) => ['queued','running'].includes(job.status);
const expose = ({ controller, userId, ...job }) => job;
export function startPublishing(project, userId, body) {
 const options = publishingOptions(body,listCustomTemplates(userId));
 if (body.confirmed !== true || !body.planDigest) throw failure(400,'请先查看分块计划并确认生成风格');
 const plan = publishingPlan(project,userId);
 if (plan.digest !== body.planDigest) throw failure(409,'稿件或插图已变化，请重新预览后确认');
 if (body.useAI && (body.consent !== true || body.maxModelCalls !== plan.modelCalls)) throw failure(400,'请确认当前分块计划的模型调用次数');
 if (body.useAI && !aiConfig().configured) throw failure(503,'请先配置模型 API 或选择本地节选');
 for (const [id,job] of jobs) if (!active(job) && Date.now()-job.updatedAt>3600000) jobs.delete(id);
 if ([...jobs.values()].some((j)=>active(j)&&(j.projectId===project.id||j.userId===userId))) throw failure(409,'你或此项目已有生成任务，请先查看或取消');
 if ([...jobs.values()].filter(active).length>=2) throw failure(429,'生成队列正忙，请稍后重试');
 if (jobs.size>=80) for (const [id,job] of jobs) if (!active(job)) { jobs.delete(id); break; }
 const id=crypto.randomUUID();
 const job={id,projectId:project.id,userId,status:'queued',options,useAI:!!body.useAI,progress:{phase:'queued',message:'已确认风格，等待启动'},createdAt:Date.now(),updatedAt:Date.now(),controller:new AbortController()};
 jobs.set(id,job);
 setImmediate(async()=>{
  if (job.status==='cancelled') return;
  job.status='running';
  const timer=setTimeout(()=>job.controller.abort('timeout'),20*60*1000); timer.unref();
  try {
   job.result=await deriveProject(project,userId,body,{signal:job.controller.signal,progress:(progress)=>{job.progress={...job.progress,...progress};job.updatedAt=Date.now();}});
   job.status='complete'; job.progress={...job.progress,message:'已生成独立项目，原稿保留'};
  }catch(error){job.status=job.controller.signal.aborted?'cancelled':'failed';job.error=job.controller.signal.reason==='timeout'?'生成超过 20 分钟，已停止；原稿保留':job.controller.signal.aborted?'已取消生成，原稿保留':error.message;}
  finally{clearTimeout(timer);job.updatedAt=Date.now();}
 });
 return expose(job);
}
export function publishingJob(projectId,userId,id,cancel=false){
 const job=jobs.get(id);
 if (!job||job.projectId!==projectId||job.userId!==userId) throw failure(404,'生成任务不存在或服务已重启，请重新确认后生成');
 if(cancel&&active(job)){job.controller.abort('cancelled');if(job.status==='queued')job.status='cancelled';job.updatedAt=Date.now();}
 return expose(job);
}
