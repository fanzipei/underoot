import{api}from'./api.js';import{modal,escapeHtml as e,toast,confirmDialog}from'./ui.js';
export async function openTemplateLibrary({kind='slides',onUse}={}){
 try{
  const base='/api/workspace/publishing-templates';const data=await api.get(base);let candidate=null;
  let done;const result=new Promise((resolve)=>{done=resolve;});
  const{root:m,close}=modal({title:'Slides / Poster 模板库',subtitle:'PDF 本地分析 · 视觉风格预览 · 插件可注册自定义模板',wide:true,
   bodyHtml:`<p class="src-note">每类至少 8 种内置模板在生成界面直接选择。这里保存你的个人风格。PDF 仅在当前服务器分析，不发送给大模型，不复制原稿图片或 Logo。</p>
    <div class="publishing-fields"><div class="field"><label for="template-kind">模板类型</label><select class="input" id="template-kind"><option value="slides">Slides</option><option value="poster">Poster</option></select></div><div class="field"><label for="template-name">模板名称</label><input class="input" id="template-name" maxlength="70" placeholder="我的会议风格"></div></div>
    <div class="field"><label for="template-pdf">上传参考 PDF（≤20 MB）</label><input class="input" type="file" id="template-pdf" accept="application/pdf,.pdf"></div><button class="btn" id="template-extract" ${data.tools.available?'':'disabled'}>本地分析 PDF 风格</button>${data.tools.available?'':'<p class="src-note">主机缺少 Poppler。请安装 pdftohtml / pdftoppm 或配置 UNDEROOT_POPPLER_BIN。</p>'}
    <div id="template-progress" role="status"></div><div id="template-candidate" hidden></div><details><summary>导入插件导出的风格 JSON</summary><input type="file" id="template-json" accept=".json"><button class="btn btn-sm" id="template-load-json">预览 JSON</button></details>
    <h4>我的模板（${data.templates.length}/40）</h4><div>${data.templates.map((t)=>`<article class="template-library-row"><span style="background:${t.accent}"></span><div><b>${e(t.name)}</b><small>${t.kind==='slides'?'Slides':'Poster'} · ${e(t.source)}</small></div><button class="btn btn-sm" data-use="${t.id}">使用</button><a class="btn btn-sm" href="${base}/${t.id}/download">导出 JSON</a><button class="btn btn-sm" data-remove="${t.id}">移除</button></article>`).join('')||'<p class="src-note">尚未保存自定义模板。</p>'}</div>`,
   footerHtml:'<button class="btn" id="template-close">关闭</button><button class="btn btn-primary" id="template-save" disabled>确认风格并保存</button>'});
  m.classList.add('template-library-dialog');const q=(id)=>m.querySelector('#template-'+id);q('kind').value=kind;
  const finish=(value)=>{done(value);close();};q('close').onclick=()=>finish(null);
  const observer=new MutationObserver(()=>{if(!m.isConnected){done(null);observer.disconnect();}});observer.observe(document.body,{childList:true});
  function preview(value,profile={},image=null,warnings=[]){
   candidate=value;q('name').value=value.name;q('kind').value=value.kind;q('candidate').hidden=false;
   q('candidate').innerHTML=`${image?`<img class="template-pdf-preview" src="${e(image)}" alt="上传 PDF 第一页预览">`:''}<p class="src-note">页面比例 ${profile.ratio||'自定义'} · 字体层级 ${profile.fontSizes?.join(' / ')||'自定义'}。${warnings.map(e).join(' ')}</p><div class="publishing-fields"><div class="field"><label for="template-accent">强调色</label><input class="input" type="color" id="template-accent" value="${e(value.accent)}"></div><div class="field"><label for="template-background">背景色</label><input class="input" type="color" id="template-background" value="${e(value.background)}"></div><div class="field"><label for="template-font">字体风格</label><select class="input" id="template-font"><option value="sans">无衬线</option><option value="serif">衬线</option></select></div><div class="field"><label for="template-density">信息密度</label><select class="input" id="template-density"><option value="comfortable">标准</option><option value="compact">紧凑</option></select></div></div><p class="src-note">提取结果是可编辑的近似视觉模板。复杂图形和原始 LaTeX 宏无法从 PDF 无损还原。</p>`;
   q('font').value=value.font;q('density').value=value.density;q('save').disabled=false;
  }
  q('extract').onclick=async()=>{
   const file=q('pdf').files[0];if(!file||file.size>20*1024*1024){toast('请选择 ≤20 MB PDF','err');return;}
   q('extract').disabled=true;q('progress').textContent='正在本地提取前三页的配色、字体与布局…';
   try{const form=new FormData();form.append('file',file);form.append('kind',q('kind').value);form.append('name',q('name').value||file.name.replace(/\.pdf$/i,''));const extracted=await api.upload(base+'/extract',form);preview(extracted.template,extracted.profile,extracted.preview,extracted.warnings);q('progress').textContent='分析完成；请核对并确认保存。';}
   catch(err){q('progress').textContent=err.message;}finally{q('extract').disabled=false;}
  };
  q('load-json').onclick=async()=>{try{const file=q('json').files[0];if(!file||file.size>10000)throw Error('请选择 ≤10 KB 风格 JSON');const value=JSON.parse(await file.text());preview(value);q('progress').textContent='请核对风格字段后保存。';}catch(err){toast(err.message,'err');}};
  q('save').onclick=async()=>{if(!candidate)return;q('save').disabled=true;try{const saved=await api.post(base,{confirmed:true,template:{...candidate,name:q('name').value.trim(),kind:q('kind').value,accent:q('accent').value,background:q('background').value,font:q('font').value,density:q('density').value}});toast('已保存个人模板','ok');await onUse?.(saved.template);finish(saved.template);}catch(err){toast(err.message,'err');q('save').disabled=false;}};
  m.querySelectorAll('[data-use]').forEach((button)=>button.onclick=async()=>{const template=data.templates.find((t)=>t.id===button.dataset.use);await onUse?.(template);finish(template);});
  m.querySelectorAll('[data-remove]').forEach((button)=>button.onclick=async()=>{if(!await confirmDialog({title:'移除个人模板',message:'只移除模板库条目，已生成的项目和原 PDF 不受影响。',confirmText:'移除'}))return;await api.delete(base+'/'+button.dataset.remove);button.closest('article').remove();});
  return result;
 }catch(err){toast(err.message,'err');return null;}
}
