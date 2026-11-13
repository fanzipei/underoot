import{standaloneText}from'./standalone-copy.mjs';
const weight=s=>[...String(s)].reduce((n,c)=>n+(/[\u3400-\u9fff]/.test(c)?2:1),0);
const generic=/^(?:Source visual evidence|原稿图示|Additional comparisons)$/i;
export function shortSlideTitle(page){
 const original=String(page.shortTitle||page.title||'Research evidence').replace(/\s*·\s*(?:evidence table|表格证据).*$/i,'').replace(/[.。]+$/,'').trim();
 if(original&&!generic.test(original)&&weight(original)<=42&&original.split(/\s+/).length<=7)return original;
 const text=(page.figures?.[0]?.caption||page.tables?.[0]?.caption||original).toLowerCase(),zh=/[\u3400-\u9fff]/.test(original);
 if(page.role==='gap')return zh?'相关工作':'Related work';
 if(page.role==='conclusion')return zh?'核心结论':'Take-home message';
 if(page.role==='limitation')return zh?'局限':'Limitations';
 if(page.role==='question'&&!page.figures?.length&&!page.tables?.length)return zh?'研究问题':'Research question';
 if(page.role==='result'&&/performance|benchmark|ranks first|overall/i.test(text)&&!/transfer|recovery|ablation|dose[–—\s-]*response/i.test(text))return zh?'主要结果':'Main results';
 const patterns=[[/semi.synthetic|recovery|恢复/,'Recovery check','恢复验证'],[/event.driven mobility/,'Event-driven mobility','事件驱动出行'],[/dose[\s–—-]*response|剂量/,'Dose–response patterns','剂量响应'],[/hypothetical|unseen.*(?:site|location|venue)|not recorded as an event venue/,'Unseen event locations','未见场地'],[/ablation|消融/,'Ablation study','消融实验'],[/zero.shot|transfer|迁移/,'Transfer results','迁移结果'],[/semi.synthetic|recovery|恢复/,'Recovery check','恢复验证'],[/matched.*reference|no.event reference/,'Reference effects','参照效果'],[/framework|architecture|pipeline|框架/,'Method overview','方法框架'],[/case study|案例/,'Case study','案例分析'],[/venues.*regions|dataset|statistics|数据/,'Data and setting','数据与设置'],[/locality|travel.time|spatial.*effect/,'Spatial event effects','空间影响'],[/counterfactual|反事实/,'Counterfactual setting','反事实设置']];
 for(const[pattern,en,cn]of patterns)if(pattern.test(text))return zh?cn:en;
 return ({question:zh?'研究问题':'Research question',setting:zh?'数据与设置':'Data and setting',gap:zh?'相关工作':'Related work',method:zh?'方法概述':'Method overview',result:zh?'主要结果':'Main results',limitation:zh?'局限':'Limitations',conclusion:zh?'核心结论':'Take-home message',reference:zh?'参考文献':'Selected references'})[page.role]||(zh?'研究证据':'Research evidence');
}
export function composeSlidePage(original){
 const page={...original},title=shortSlideTitle(page);page.fullTitle=standaloneText(page.fullTitle||page.title);page.title=title;
 const evidence=page.figures?.length||page.tables?.length;
 if(!evidence&&page.fullTitle!==title&&!generic.test(page.fullTitle)&&!page.takeaway?.includes(page.fullTitle))page.lead=page.fullTitle;
 if(evidence&&!page.takeaway&&!page.bullets?.length){const caption=page.figures?.[0]?.caption||page.tables?.[0]?.caption||'';if(caption)page.takeaway=caption;}
 return page;
}
const score=p=>{const text=(p.fullTitle||p.title||'')+' '+(p.figures?.[0]?.caption||p.tables?.[0]?.caption||'');return (p.figures?.length?9:0)+(p.tables?.length?7:0)+(/framework|architecture|overall|main result|performance|benchmark|ranks first|ablation|dose[–—\s-]*response|zero.shot|transfer|主要|框架|消融/i.test(text)?12:0)-(/dataset|statistics|configuration|notation|venues|locality/i.test(text)?5:0)+(/zero.shot|transfer/i.test(text)?20:0)+(/ranks first in all|overall|benchmark|event.driven[\s\S]*performance/i.test(text)?30:0)+(p.takeaway?2:0);};
function displayTable(page,plan){return{...page,tables:(page.tables||[]).map(t=>{
 const original=(plan.tables||[]).find(s=>t.id===s.id||t.id.startsWith(s.id+'-'));if(!original)return t;
 const ids=t.identifierColumns||1,rows=t.rows.map(row=>original.rows.find(r=>r.slice(0,ids).every((v,i)=>v===row[i]))).filter(Boolean);if(rows.length!==t.rows.length)return t;
 let columns=null,metricLabel='';
 if(page.role==='gap'&&original.headers.length<=5&&original.rows.every(r=>r.slice(ids).every(v=>/^(?:Yes|No)$/i.test(v))))columns=original.headers.map((_,i)=>i);
 else if(original.headers.length>6&&original.headers[ids]?.includes(' / ')){const metric=original.headers[ids].split(' / ').at(-1);const matched=original.headers.map((h,i)=>i>=ids&&h.endsWith(' / '+metric)?i:-1).filter(i=>i>=0);if(matched.length>=2){columns=[...Array.from({length:ids},(_,i)=>i),...matched.slice(0,4)];metricLabel=metric;}}
 return columns?{...t,metricLabel,headers:columns.map(i=>metricLabel&&i>=ids?original.headers[i].slice(0,original.headers[i].lastIndexOf(' / ')):original.headers[i]),rows:rows.map(row=>columns.map(i=>row[i])),selection:{...t.selection,originalColumns:original.headers.length,displayColumns:columns.length}}:t;
 })};}
/** Select an authored talk, not a complete tabular appendix. Original pages stay archived. */
export function compactSlides(pages,plan,options){
 const budget=Math.max(5,Math.min(35,(options.count||18)-1)),all=pages.filter(p=>!p.appendix),chosen=new Set();
 const choose=p=>{if(p&&chosen.size<budget)chosen.add(p);};
 const roleFor=p=>{const title=String(p.fullTitle||p.title).replace(/\s*·\s*(?:evidence table|表格证据).*$/i,'').trim(),caption=p.figures?.[0]?.caption||p.tables?.[0]?.caption||'';
  if(/^(?:data[: ]|dataset|experimental setting|数据)/i.test(title))return'setting';
  if(/^(?:existing|prior|previous)\b|related work|相关工作/i.test(title))return'gap';
  if(/[?？]\s*$/.test(title))return'question';
  if(/framework|architecture|pipeline/i.test(caption))return'method';
  if(p.figures?.length&&/event.driven mobility|counterfactual.*(?:lower|higher)|under lower or higher/i.test(caption))return'question';
  if(/ablation|dose[–—\s-]*response|case study|performance|accuracy|recovery|transfer/i.test(caption))return'result';
  return p.role;
 };
 const best=role=>all.filter(p=>roleFor(p)===role).sort((a,b)=>(score(b)+((role==='setting'&&!b.figures?.length&&!b.tables?.length)||(role==='question'&&/\?|research question/i.test(b.title)&&!b.figures?.length&&!b.tables?.length)?20:0))-(score(a)+((role==='setting'&&!a.figures?.length&&!a.tables?.length)||(role==='question'&&/\?|research question/i.test(a.title)&&!a.figures?.length&&!a.tables?.length)?20:0)))[0];
 for(const role of['question','gap','setting','method','limitation','conclusion'])choose(best(role));
 const ranked=all.filter(p=>p.figures?.length||p.tables?.length).sort((a,b)=>score(b)-score(a));
 for(const p of ranked){const figure=p.figures?.[0]?.path,table=p.tables?.[0]?.id?.replace(/-(?:main|\d+-\d+)$/,'');
  if(figure&&[...chosen].some(x=>x.figures?.[0]?.path===figure))continue;
  if(table&&[...chosen].some(x=>x.tables?.[0]?.id?.replace(/-(?:main|\d+-\d+)$/,'')===table))continue;
  if(table&&[...chosen].filter(x=>x.tables?.length).length>=4)continue;
  if(figure&&[...chosen].filter(x=>x.figures?.length).length>=8)continue;
  choose(p);
 }
 const baseTitle=p=>String(p.fullTitle||p.title).replace(/\s*·\s*(?:evidence table|表格证据).*$/i,'').trim();
 for(const p of all){if(chosen.size>=budget)break;if(!p.tables?.length&&!p.figures?.length&&![...chosen].some(x=>baseTitle(x)===baseTitle(p)||x.role===p.role&&x.takeaway===p.takeaway))choose(p);}
 const order=['question','gap','setting','method','result','detail','limitation','conclusion','reference'];
 let selected=[...chosen].sort((a,b)=>order.indexOf(roleFor(a))-order.indexOf(roleFor(b))||pages.indexOf(a)-pages.indexOf(b));
 // A related-work comparison replaces its redundant prose page where possible.
 const gapTable=all.find(p=>p.role==='gap'&&p.tables?.length);if(gapTable&&!selected.includes(gapTable)){const old=selected.find(p=>p.role==='gap');if(old)selected[selected.indexOf(old)]=gapTable;}
 return{pages:selected.map(p=>{const page=composeSlidePage(displayTable({...p,role:roleFor(p)},plan));delete page.figureHeight;return page;}),archive:pages.filter(p=>!selected.includes(p)),budget};
}
