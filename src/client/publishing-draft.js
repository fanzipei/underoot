import{api}from'./api.js';import{modal,escapeHtml as e,toast}from'./ui.js';
/** Chat stays next to the real PDF; editing controls and outline forms are deliberately absent. */
export async function openPublishingDraft(project,id,{notice}={}){
 let base=`/api/workspace/projects/${project.id}/derive`,url=base+'/drafts/'+id;let draft=await api.get(url),busy=false;
 function attachDerived(){if(draft.projectId&&draft.projectId!==project.id){project={...project,id:draft.projectId};base=`/api/workspace/projects/${project.id}/derive`;url=base+'/drafts/'+id;location.hash=`#/p/${project.id}`;}}attachDerived();
 const{root,close}=modal({title:'打磨 '+(draft.options.kind==='slides'?'Slides':'Poster'),subtitle:'直接描述修改；保留其他页面和历史版本',bodyHtml:'<div class="publication-conversation" aria-live="polite"></div><p class="src-note" data-status role="status"></p><textarea class="input" data-request rows="3" aria-label="修改要求" placeholder="例如：第 3 页改成以核心结果图为主；把实验表格用上；撤销上次修改"></textarea><p class="src-note">发送时仅向已配置模型提供相关页面与有限来源摘要。作者、单位和项目链接也可直接在聊天中修改。</p><input type="file" data-logo accept="image/png,image/jpeg,application/pdf" hidden>',footerHtml:'<button class="btn" data-close>关闭</button><button class="btn" data-attach title="上传单位图标">＋图标</button><button class="btn btn-primary" data-send>发送</button>'});
 root.classList.add('publication-chat-drawer');const q=s=>root.querySelector(s),status=t=>q('[data-status]').textContent=t;
 const say=(role,text)=>{const el=document.createElement('div');el.className='publication-chat-turn '+role;el.innerHTML=`<b>${role==='user'?'你':'助手'}</b><p>${e(text).replace(/\n/g,'<br>')}</p>`;q('.publication-conversation').append(el);el.scrollIntoView({block:'nearest'});};
 say('assistant',draft.projectId?'已生成。可以直接说“第 3 页精简成两点”“把方法页换成流程图”或“把实验结果表加入结果页”。Slides 第 1 页为封面，正文从第 2 页开始。':'已保留内部草稿。发送“继续生成”即可完成，或先描述需要修改的内容。');
 if(draft.projectId&&draft.rendererVersion<6)say('assistant','这是旧版生成项目。发送“重新排版”可保留原主题并升级排版；发送“风格：metropolis”可切换原生主题；已有手工修改受保护。');
 if(notice)say('assistant',notice+' 可以直接在这里描述修改，再发送“继续生成”。');
 for(const message of draft.messages.slice(-8))say(message.role,message.content);
 async function job(body){const start=await api.post(base+'/jobs',{...body,draftId:id,version:draft.version,confirmed:true});let result=start;while(['queued','running'].includes(result.status)){status(result.progress.message);await new Promise(r=>setTimeout(r,1000));result=await api.get(base+'/jobs/'+start.id);}if(result.status!=='complete')throw Error(result.error||'操作未完成');draft=result.result.draft;attachDerived();return result;}
 async function refreshPDF(){if(!draft.projectId)return;status('正在编译当前项目…');const result=await api.post(`/api/projects/${draft.projectId}/compile`,{force:true});if(!result.ok)throw Error('修改已保存，编译需检查：'+(result.errors?.[0]?.message||'请查看编译日志'));}
 async function send(){const message=q('[data-request]').value.trim();if(!message||busy)return;busy=true;q('[data-send]').disabled=true;q('[data-request]').value='';say('user',message);
  try{
   draft=await api.get(url);
   const identity=message.match(/^(作者|单位|联系方式|项目链接)\s*[:：]\s*([\s\S]+)$/);
   if(identity){const key={作者:'authors',单位:'affiliations',联系方式:'contact',项目链接:'projectUrl'}[identity[1]],value={...draft.identity,[key]:identity[2]};if(draft.projectId)await job({phase:'reflow',identity:value});else draft=await api.put(url,{version:draft.version,identity:value,pages:draft.pages});say('assistant','已更新'+identity[1]+'，其他信息保留。');}
   else if(/^(?:风格|模板)\s*[:：]/.test(message)){const requested=message.replace(/^(?:风格|模板)\s*[:：]\s*/,''),names={Metropolis:'metropolis',metropolis:'metropolis',极简:'minimal',学术:'academic',图库:'gallery',现代:'modern',深色:'dark',蓝图:'blueprint',醒目:'bold',紧凑:'compact',编辑:'editorial',导航:'sidebar',会议:'conference',清爽:'clean',经典:'classic',大标题:'large-title'};await job({phase:'reflow',identity:draft.identity,style:names[requested]||requested});say('assistant','已切换风格并重新排版，正文与历史保留。');}
   else if(/^(?:重新排版|自动排版|统一字号|reflow)$/i.test(message)){await job({phase:'reflow',identity:draft.identity});say('assistant','已重新排版，保留原有内容与版本历史。');}
   else if(!draft.projectId&&/^(?:继续生成|生成|重新生成)[。！!]?$/u.test(message)){const result=await job({});say('assistant','已生成，可在项目列表打开。');location.hash=`#/p/${result.result.project.id}`;}
   else{status('正在定位相关页面并调整…');draft=await api.post(url+'/chat',{version:draft.version,message,consent:true});const proposal=draft.proposal;if(!proposal)throw Error('未形成修改，原项目保留');draft=await api.post(url+'/decide',{version:draft.version,proposalId:proposal.id,accept:true});const index=draft.pages.findIndex(p=>p.id===proposal.pageId)+(draft.options.kind==='slides'?2:1);say('assistant',`已修改${draft.options.kind==='slides'?'第 '+index+' 页':'模块 '+index}：${proposal.page.title}\n${proposal.explanation}\n可发送“撤销上次修改”恢复。`);}
   if(draft.projectId)await refreshPDF();status(draft.projectId?'已保存，PDF 已更新。':'已保存，发送“继续生成”即可完成。');
  }catch(error){say('assistant',error.message);status('原有内容与历史保留。');}finally{busy=false;q('[data-send]').disabled=false;q('[data-request]').focus();}
 }
 q('[data-send]').onclick=send;q('[data-request]').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();send();}};q('[data-close]').onclick=close;
 q('[data-attach]').onclick=()=>q('[data-logo]').click();q('[data-logo]').onchange=async()=>{const file=q('[data-logo]').files[0];if(!file||busy)return;busy=true;try{if(file.size>3*1024*1024)throw Error('图标应小于 3 MB');const form=new FormData();form.append('file',file);draft=await api.upload(url+'/logo',form);if(draft.projectId)await job({phase:'reflow',identity:draft.identity});say('assistant','已添加单位图标：'+file.name);if(draft.projectId)await refreshPDF();}catch(error){say('assistant',error.message);}finally{busy=false;}};
}
