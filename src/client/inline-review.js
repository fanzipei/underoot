import { escapeHtml as e } from './ui.js';
/** Explicit, contextual review actions. No ghost text or automatic source writes. */
export function createInlineReview({view,getPath,onAccept,onReject,onRequest,editable=true}){
 let items=[];let current=null;let popup=null;
 const chip=document.createElement('button');chip.className='ai-review-chip';chip.type='button';chip.textContent='AI 段落编辑 · Alt+K';document.body.appendChild(chip);
 const close=()=>{popup?.remove();popup=null;current=null;};
 const place=()=>{if(!popup)return;const box=view.coordsAtPos(view.state.selection.main.head);popup.style.left=Math.max(12,Math.min(innerWidth-420,box?.left||240))+'px';popup.style.top=Math.max(12,Math.min(innerHeight-360,(box?.bottom||150)+10))+'px';};
 const show=(item)=>{
  close();if(!item||item.stale||item.path!==getPath())return;current=item;
  popup=document.createElement('section');popup.className='ai-inline-review';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','就地修改预览');
  popup.innerHTML=`<div class="ai-inline-head"><b>${e(item.title)}</b><button class="btn btn-ghost btn-sm" data-close>×</button></div><p>${e(item.detail)}</p>${item.before?`<pre class="diff-removed">${e(item.before)}</pre>`:''}${item.after!==null?`<pre class="diff-added">${e(item.after)}</pre>`:''}<div class="assistant-buttons"><button class="btn btn-primary btn-sm" data-accept>${item.canApply?'接受 · Alt+Enter':'接受为手动建议'}</button><button class="btn btn-sm" data-reject>忽略</button></div><small>Esc 关闭预览 · 正文只在确认接受后修改</small>`;
  document.body.appendChild(popup);place();popup.querySelector('[data-close]').onclick=close;
  if(!editable){popup.querySelector('[data-accept]').disabled=true;popup.querySelector('[data-reject]').disabled=true;}
  popup.querySelector('[data-accept]').onclick=()=>{const value=current;close();onAccept(value.id);};popup.querySelector('[data-reject]').onclick=()=>{const value=current;close();onReject(value.id);};
 };
 const request=()=>{
  close();const sel=view.state.selection.main;const range={from:sel.from,to:sel.to};
  popup=document.createElement('section');popup.className='ai-inline-review';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','AI 段落编辑');
  popup.innerHTML='<div class="ai-inline-head"><b>AI 段落编辑</b><button class="btn btn-ghost btn-sm" data-close>×</button></div><textarea class="input" rows="2" maxlength="400" aria-label="修改要求" placeholder="更清楚地说明方法；检查这一段是否过度推断…"></textarea><p class="src-note">仅预览当前段落或选区；先查看发送范围，再调用模型。</p><button class="btn btn-primary btn-sm" data-preview>预览发送范围</button>';
  document.body.appendChild(popup);place();popup.querySelector('[data-close]').onclick=close;popup.querySelector('[data-preview]').onclick=()=>{const focus=popup.querySelector('textarea').value;close();onRequest({focus,range});};popup.querySelector('textarea').focus();
 };
 chip.onclick=()=>{const next=items.find((s)=>s.status==='pending'&&!s.stale&&s.path===getPath());next?show(next):request();};
 const key=(event)=>{if(event.altKey&&event.key.toLowerCase()==='k'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();request();}else if(popup&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close();view.focus();}else if(popup&&current&&editable&&event.altKey&&event.key==='Enter'){event.preventDefault();const item=current;close();onAccept(item.id);}};
 document.addEventListener('keydown',key,true);
 return{show,close,request,setItems(values){items=values;const count=items.filter((s)=>s.status==='pending'&&!s.stale&&s.path===getPath()).length;chip.textContent=count?`${count} 条就地建议 · Alt+K`:'AI 段落编辑 · Alt+K';},status(text){chip.title=text;},destroy(){close();chip.remove();document.removeEventListener('keydown',key,true);}};
}
