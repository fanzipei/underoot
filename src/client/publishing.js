import { api } from './api.js';
import { modal, escapeHtml as e, toast } from './ui.js';
import {openTemplateLibrary}from'./template-library.js';
export async function openPublishing(project, initialKind='slides') {
 try {
  const base=`/api/workspace/projects/${project.id}/derive`;
  let [plan,status]=await Promise.all([api.get(base+'/plan'),api.get('/api/workspace/ai/status')]);
  let job=null; let timer; let checking=false; let shownJob;
  const key='underoot.publishing.'+project.id;
  const {root:m,close}=modal({title:'论文 → Slides / Poster',subtitle:'自动拆分全稿 · 确认风格后生成 · 原稿保留',wide:true,
   bodyHtml:`<div class="publishing-plan" id="publishing-plan"></div>
    <div id="publishing-controls"><div class="publishing-fields"><div class="field"><label for="publishing-kind">生成类型</label><select class="input" id="publishing-kind"><option value="slides">LaTeX Slides</option><option value="poster">学术 Poster</option></select></div><div class="field"><label for="publishing-ratio">Slides 画幅</label><select class="input" id="publishing-ratio"><option value="169">16:9 宽屏</option><option value="43">4:3 标准</option></select></div><div class="field"><label for="publishing-orientation">Poster 方向</label><select class="input" id="publishing-orientation"><option value="portrait">A0 竖版</option><option value="landscape">A0 横版</option></select></div><div class="field"><label for="publishing-columns">Poster 栏数</label><select class="input" id="publishing-columns"><option value="3">三栏</option><option value="2">两栏</option></select></div></div>
    <div class="assistant-buttons"><button class="btn btn-sm" id="publishing-import">模板库 / 从 PDF 提取风格</button></div><div class="publishing-styles" id="publishing-styles" role="group" aria-label="选择生成风格"></div>
    <div class="field"><label for="publishing-count" id="publishing-count-label">正文目标页数（封面与插图另计）</label><select class="input" id="publishing-count"></select></div>
    <label class="research-check"><input type="checkbox" id="publishing-ai" ${status.configured?'':'disabled'}>使用 AI 逐块摘要与分层汇总（发送全部论文分块）</label><p class="src-note" id="publishing-calls"></p></div>
    <p class="publishing-confirm" id="publishing-confirm"></p><div id="publishing-progress" role="status" aria-live="polite"></div><p class="src-note">每个分块都会处理并保存摘要记录。新建独立项目，复制原稿及素材；本地节选和 AI 初稿均需核对事实、公式、引用和版面。目标篇幅会受实际排版影响。</p>`,
   footerHtml:'<button class="btn" id="publishing-close">取消</button><button class="btn" id="publishing-cancel" hidden>停止生成</button><button class="btn btn-primary" id="publishing-submit">确认风格并生成</button>'});
  m.classList.add('publishing-dialog');
  const q=(id)=>m.querySelector('#publishing-'+id);
  let style; const kind=()=>q('kind').value;
  const options=()=>({kind:kind(),style,ratio:q('ratio').value,orientation:q('orientation').value,columns:Number(q('columns').value),count:Number(q('count').value)});
  function planView(){q('plan').innerHTML=`<b>自动拆分计划</b><p>展开稿件 ${plan.chars.toLocaleString()} 字符 · ${plan.files.length} 个源码文件 · ${plan.sectionCount} 个章节组 · <strong>${plan.chunkCount} 个分块</strong>（每块最多 ${plan.chunkChars.toLocaleString()} 字符）</p>${plan.warnings.map((w)=>`<p class="src-note">${e(w)}</p>`).join('')}<details><summary>查看全稿覆盖与分块范围</summary><div class="publishing-chunks">${plan.chunks.map((c)=>`<div>${e(c.id)} · ${e(c.title)} · ${c.from}–${c.to}${c.continuation?' · 续段':''}</div>`).join('')}</div></details>`;}
  function confirmView(){
   q('styles').dataset.columns=q('columns').value;q('styles').dataset.orientation=q('orientation').value;q('styles').dataset.ratio=q('ratio').value;
   const s=plan.styles[kind()].find((s)=>s.id===style);
   q('calls').textContent=q('ai').checked?`将发送全部 ${plan.chunkCount} 个分块，最多 ${plan.modelCalls} 次模型调用（含逐块摘要、分层汇总与最终组织），可能产生费用。`:'本地自动拆分与节选，不调用模型。'+(status.configured?'':' 管理员配置模型 API 后可启用 AI 摘要。');
   q('confirm').textContent=`确认生成：${kind()==='slides'?'Slides':'Poster'} · ${s.name} · ${kind()==='slides'?`${q('ratio').value==='169'?'16:9':'4:3'} / 正文约 ${q('count').value} 页`:`A0 ${q('orientation').value==='portrait'?'竖版':'横版'} / ${q('columns').value} 栏 / ${q('count').value} 个内容块`} · ${q('ai').checked?'AI 分层摘要':'本地节选'}`;
   if(!job||job.status!=='complete')q('submit').textContent=`确认 · ${s.name} · 生成`;
  }
  function styles(){
   style=plan.styles[kind()][0].id;
   q('styles').innerHTML=plan.styles[kind()].map((s)=>`<button type="button" class="publishing-style" data-style="${s.id}" aria-pressed="${s.id===style}" style="--publishing-accent:${s.accent};--publishing-bg:${s.background||'#f5f6f7'}"><span class="publishing-swatch ${kind()}" aria-hidden="true"><i></i><span><b></b><b></b><b></b></span></span><strong>${e(s.name)}</strong><span>${e(s.description)}</span></button>`).join('');
   q('styles').querySelectorAll('[data-style]').forEach((button)=>{button.onclick=()=>{style=button.dataset.style;q('styles').querySelectorAll('[data-style]').forEach((b)=>b.setAttribute('aria-pressed',String(b===button)));confirmView();};});
   q('ratio').closest('.field').hidden=kind()!=='slides';q('orientation').closest('.field').hidden=kind()!=='poster';q('columns').closest('.field').hidden=kind()!=='poster';
   q('count-label').textContent=kind()==='slides'?'正文目标页数（封面与插图另计）':'Poster 内容块数量';
   q('count').innerHTML=(kind()==='slides'?[12,18,24,30,36]:[6,9,12]).map((n)=>`<option value="${n}">${n}</option>`).join('');q('count').value=kind()==='slides'?'18':'9';confirmView();
  }
  function busy(value){q('controls').querySelectorAll('input,select,button').forEach((c)=>c.disabled=value||(c.id==='publishing-ai'&&!status.configured));q('submit').disabled=value;q('cancel').hidden=!value;q('close').textContent=value?'关闭窗口（后台继续）':'关闭';}
  async function poll(){
   if(!m.isConnected||checking||!job)return;checking=true;clearTimeout(timer);
   try{
    job=await api.get(base+'/jobs/'+job.id);
    if(shownJob!==job.id){shownJob=job.id;q('kind').value=job.options.kind;styles();style=job.options.style;q('styles').querySelectorAll('[data-style]').forEach((b)=>b.setAttribute('aria-pressed',String(b.dataset.style===style)));for(const id of ['ratio','orientation','columns','count'])q(id).value=String(job.options[id]);q('ai').checked=job.useAI;confirmView();busy(['running','queued'].includes(job.status));}
    q('progress').textContent=`${job.progress.message} · ${job.progress.modelCalls||0} 次模型调用`;
    if(job.status==='complete'){
     sessionStorage.removeItem(key);busy(true);q('cancel').hidden=true;q('close').textContent='关闭';q('submit').disabled=false;q('submit').textContent='打开生成项目';q('submit').onclick=()=>{close();location.hash=`#/p/${job.result.project.id}`;};
     q('progress').textContent=job.result.warning;toast('生成完成，全稿分块记录已保存','ok');return;
    }
    if(['failed','cancelled'].includes(job.status)){
     sessionStorage.removeItem(key);busy(false);q('ai').checked=false;confirmView();q('progress').textContent=job.error||'已取消，原稿保留';
     plan=await api.get(base+'/plan');planView();return;
    }
    timer=setTimeout(poll,1000);
   }catch(err){q('progress').textContent=err.message;busy(false);sessionStorage.removeItem(key);}finally{checking=false;}
  }
  q('kind').value=initialKind;planView();styles();q('kind').onchange=styles;
  q('import').onclick=()=>openTemplateLibrary({kind:kind(),onUse:async(template)=>{plan=await api.get(base+'/plan');q('kind').value=template.kind;styles();style=template.id;q('styles').querySelectorAll('[data-style]').forEach((b)=>b.setAttribute('aria-pressed',String(b.dataset.style===style)));for(const id of ['ratio','orientation','columns'])q(id).value=String(template[id]);confirmView();}});
  ['ratio','orientation','columns','count','ai'].forEach((id)=>q(id).onchange=confirmView);
  q('close').onclick=()=>{clearTimeout(timer);close();};
  q('cancel').onclick=async()=>{if(!job)return;q('cancel').disabled=true;try{await api.post(base+'/jobs/'+job.id+'/cancel',{});await poll();}catch(err){toast(err.message,'err');}finally{q('cancel').disabled=false;}};
  q('submit').onclick=async()=>{
   busy(true);q('progress').textContent='正在核对稿件版本与确认设置…';
   try{const useAI=q('ai').checked;job=await api.post(base+'/jobs',{...options(),confirmed:true,planDigest:plan.digest,useAI,consent:useAI,maxModelCalls:plan.modelCalls});sessionStorage.setItem(key,job.id);await poll();}
   catch(err){q('progress').textContent=err.message;busy(false);plan=await api.get(base+'/plan');planView();confirmView();}
  };
  const previous=sessionStorage.getItem(key);
  if(previous){job={id:previous};busy(true);await poll();}
 }catch(err){toast(err.message,'err');}
}
