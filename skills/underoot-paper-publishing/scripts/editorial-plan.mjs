/** Source-linked editorial and layout passes, shared by the skill and host. */
import { plainText } from './chunk-paper.mjs';
const zh=(text)=>/[\u3400-\u9fff]/.test(text);
const unique=(items)=>[...new Set(items)];
const roles=['question','gap','method','result','limitation','conclusion','detail'];
export function editorialRole(title,text=''){
 const value=title+' '+text;
 for(const[role,pattern]of[
  ['limitation',/limitation|caveat|threat|局限|不足|边界/i],['conclusion',/conclu|take.?home|future work|结论|总结|展望/i],
  ['result',/result|finding|experiment|evaluat|ablation|accuracy|结果|实验|发现|消融|评估/i],['method',/method|approach|framework|model|算法|方法|模型|框架/i],
  ['gap',/related|prior work|challenge|gap|相关|挑战|差距/i],['question',/research question|problem statement|objective|hypothesis|abstract|introduc|background|motivat|overview|研究问题|研究目标|引言|背景|摘要|概述/i]
 ])if(pattern.test(value))return role;
 return'detail';
}
export function sentences(text){
 return unique(String(text).replace(/\[公式见原稿\]/g,'').replace(/\s+/g,' ').split(/(?<=[。！？!?])\s*|(?<=[.])\s+(?=[A-Z\u3400-\u9fff])|\n+/).map(s=>s.trim()).filter(Boolean));
}
const weight=(text)=>Array.from(text).reduce((n,c)=>n+(/[\u3400-\u9fff]/.test(c)?2:1),0);
const rank=(text)=>/limitation|only |restricted|局限|仅|条件|不足/i.test(text)?3:/\d|result|improv|发现|结果|贡献/i.test(text)?4:1;
function splitLong(text,limit){
 if(weight(text)<=limit)return[text];
 const pieces=text.split(/(?<=[;；])\s*|(?<=[,，])\s+(?=[A-Z])/).filter(Boolean);
 return pieces.length>1?pieces:[text]; // Do not silently cut a qualifier or a number.
}
function pack(bullets,limit,max=3){
 const groups=[];let group=[];let size=0;
 for(const bullet of bullets){if(group.length&&(size+weight(bullet)>limit||group.length>=max)){groups.push(group);group=[];size=0;}group.push(bullet);size+=weight(bullet);}
 if(group.length)groups.push(group);return groups;
}
/** Balanced contiguous columns preserve the intended left-to-right reading order. */
export function balanceColumns(pages,count){
 const size=pages.map(p=>p.bullets.reduce((n,b)=>n+weight(b),0)+p.figures.length*500+p.equations.length*180+(p.tables||[]).reduce((n,t)=>n+t.rows.length*100+100,0)+100);
 const n=pages.length,k=Math.min(count,n),prefix=[0];for(const s of size)prefix.push(prefix.at(-1)+s);
 const dp=Array.from({length:k+1},()=>Array(n+1).fill(Infinity));const cuts=Array.from({length:k+1},()=>Array(n+1).fill(0));dp[0][0]=0;
 for(let c=1;c<=k;c++)for(let end=c;end<=n;end++)for(let start=c-1;start<end;start++){const value=Math.max(dp[c-1][start],prefix[end]-prefix[start]);if(value<dp[c][end]){dp[c][end]=value;cuts[c][end]=start;}}
 const columns=[];let end=n;for(let c=k;c>0;c--){const start=cuts[c][end];columns.unshift(pages.slice(start,end).map(p=>p.id));end=start;}
 while(columns.length<count)columns.push([]);
 return{columns,weights:columns.map(ids=>ids.reduce((sum,id)=>sum+size[pages.findIndex(p=>p.id===id)],0))};
}
export function editorialPlan(plan,summary,options){
 const rounds=[];const archive=[];const warnings=[...(plan.evidenceWarnings||[])];const known=new Set(plan.chunks.map(c=>c.id));let duplicates=0;
 const seen=new Set();
 // 1. Inventory: retain complete source notes; remove repeated prose from the display.
 let cards=summary.sections.map((section,index)=>{
  const values=Array.isArray(section.bullets)&&section.bullets.length?section.bullets:sentences(section.text);
  const bullets=values.map(v=>String(v).trim()).filter(v=>{const key=v.toLocaleLowerCase().replace(/\s+/g,' ');if(seen.has(key)){duplicates++;return false;}seen.add(key);return!!v;});
  return{...section,id:'topic-'+(index+1),role:editorialRole(section.title),bullets,explicitTakeaway:typeof section.takeaway==='string'&&!!section.takeaway.trim(),takeaway:typeof section.takeaway==='string'?section.takeaway.trim():'',figures:[],equations:[],tables:[],sourceIds:unique(section.sourceIds||[])};
 });
 rounds.push({round:1,name:'来源与证据盘点',changes:[`保留全部 ${summary.notes.length} 个分块笔记`,`显示层去重 ${duplicates} 条重复句`],metrics:{sourceChunks:known.size,duplicates}});
 // 2. Narrative: question -> gap -> method -> evidence -> boundary -> conclusion.
 if(!summary.aiNarrative)cards=cards.map((c,i)=>({...c,originalOrder:i})).sort((a,b)=>roles.indexOf(a.role)-roles.indexOf(b.role)||a.originalOrder-b.originalOrder);
 const fullText=summary.notes.map(n=>n.summary).join(' ');
 const chinese=zh(plan.title||fullText);
 if(!chinese)for(const card of cards)card.title=card.title.replace(/^研究概述/,'Study overview');
 cards=cards.filter(card=>{
  if(card.bullets.length||[...(plan.visuals||[]),...(plan.tables||[]),...(plan.equations||[])].some(e=>e.sourceIds?.some(id=>card.sourceIds.includes(id))))return true;
  const target=cards.find(other=>other!==card&&other.bullets.length);
  if(target)target.sourceIds=unique([...target.sourceIds,...card.sourceIds]);return false;
 });
 for(const card of cards){
  // Claim titles are supplied by AI only when grounded. Local titles remain descriptive.
  card.takeaway=card.takeaway||[...card.bullets].sort((a,b)=>rank(b)-rank(a))[0]||'';
  card.speakerNotes=summary.notes.filter(n=>card.sourceIds.includes(n.id)).map(n=>({id:n.id,summary:n.summary}));
 }
 const present=new Set(cards.map(c=>c.role));
 for(const role of ['question','method','result','limitation'])if(!present.has(role))warnings.push((chinese?'提纲中未单列':'Outline lacks a separate')+' '+role+' '+(chinese?'主题；请核对源论文，勿补造内容。':'topic; check the source instead of inventing content.'));
 rounds.push({round:2,name:'研究叙事重组',changes:['按研究问题、方法、证据与边界组织内容','AI 主张标题与本地描述性标题明确区分'],metrics:{topics:cards.length,roles:[...present]}});
 // 3. Figure/equation grounding: place visuals next to their actual source topic.
 const unmatched=[];
 for(const visual of plan.visuals||[]){
  const target=cards.find(card=>card.sourceIds.some(id=>visual.sourceIds?.includes(id)));
  if(target)target.figures.push({...visual});else unmatched.push(visual.path);
 }
 for(const equation of plan.equations||[]){
  const target=cards.find(card=>card.sourceIds.some(id=>equation.sourceIds?.includes(id)));
  if(target&&target.equations.length<1)target.equations.push(equation);
 }
 for(const table of plan.tables||[]){const target=cards.find(card=>card.sourceIds.some(id=>table.sourceIds?.includes(id)));if(target)target.tables.push(table);}
 if(unmatched.length)warnings.push('未找到对应正文主题的插图留在原始素材中：'+unmatched.join('、'));
 rounds.push({round:3,name:'图文与公式关联',changes:['插图按来源段落邻接排版，保留图注','公式仅使用可安全移植的原稿公式；不臆造图像结论'],metrics:{placedFigures:cards.reduce((n,c)=>n+c.figures.length,0),unmatched}});
 // 4. Format-specific density: slides have a single idea; posters have balanced blocks.
 const pages=[];const textLimit=options.kind==='slides'?420:660;
 for(const card of cards){
  const ordered=options.kind==='poster'?[...card.bullets].sort((a,b)=>rank(b)-rank(a)):card.bullets;
  const pageLimit=options.kind==='slides'&&card.figures.length?260:textLimit;
  const groups=pack(ordered.flatMap(b=>splitLong(b,pageLimit)),Math.max(180,pageLimit-(card.explicitTakeaway?weight(card.takeaway):0)),options.kind==='slides'?3:4);
  if(!groups.length)groups.push([]);
  for(let i=0;i<groups.length;i++)pages.push({...card,id:card.id+'-'+(i+1),title:card.title+(i?(chinese?' · 续':' · continued'):''),bullets:groups[i],takeaway:i?'':card.explicitTakeaway?card.takeaway:[...groups[i]].sort((a,b)=>rank(b)-rank(a))[0]||'',figures:i===0?card.figures.slice(0,1):[],equations:i===0?card.equations:[],tables:options.kind==='poster'&&i===0?card.tables.slice(0,1):[]});
  // A source with several figures gets source-captioned visual pages, not a blind appendix.
  if(options.kind==='slides')for(const visual of card.figures.slice(1))pages.push({...card,id:card.id+'-figure-'+pages.length,title:card.title,bullets:[],takeaway:'',figures:[visual],equations:[],tables:[]});
  if(options.kind==='slides')for(const table of card.tables)pages.push({...card,id:card.id+'-table-'+pages.length,title:card.title+(chinese?' · 表格证据':' · evidence table'),bullets:[],takeaway:'',figures:[],equations:[],tables:[table]});
 }
 let displayed=pages;
 const displayLimit=options.kind==='poster'?options.count:Math.min(72,options.count*2);
 if(pages.length>displayLimit){
  // Select whole evidence statements, archiving unshown details without truncating facts.
  const chosen=new Set();
  for(const role of ['result','method','question','limitation','conclusion','gap','detail']){const page=role==='question'?(pages.find(p=>p.role===role&&/research question|研究问题/i.test(p.title))||pages.find(p=>p.role===role)):pages.find(p=>p.role===role);if(page&&chosen.size<displayLimit)chosen.add(page);}
  for(const page of pages){if(chosen.size>=displayLimit)break;chosen.add(page);}
  displayed=pages.filter(p=>chosen.has(p));
  for(const page of pages.filter(p=>!chosen.has(p))){
   archive.push(page);
  }
 }
 if(archive.length)warnings.push(`显示层选用 ${displayed.length} 个内容块，另有 ${archive.length} 个细节块保存在提纲记录中；分块 ID 覆盖不代表所有科学细节都显示在页面上。`);
 const {columns,weights:sizes}=balanceColumns(displayed,options.columns||3);
 if(options.kind==='slides'&&pages.length>options.count)warnings.push(`为保留可读字号，正文拆为 ${pages.length} 页，超过目标 ${options.count} 页；可在提纲中进一步精简。`);
 rounds.push({round:4,name:options.kind==='slides'?'单页信息密度与分页':'海报信息层级与栏位平衡',changes:['长段落转为有来源的要点，超量内容保留在笔记','不通过不断缩小字号掩盖溢出'],metrics:{pages:displayed.length,columnWeights:sizes,archivedDetails:archive.length}});
 // 5. Review: source coverage is a provenance invariant, not a claim of semantic completeness.
 const displayedSources=new Set(displayed.flatMap(p=>p.sourceIds));
 const covered=new Set([...displayed,...archive].flatMap(p=>p.sourceIds));
 const missing=[...known].filter(id=>!covered.has(id));const invalid=[...covered].filter(id=>!known.has(id));
 if(missing.length||invalid.length||!displayed.length)throw Object.assign(Error('发布提纲的来源覆盖无效，原稿保留'),{status:502});
 const dense=displayed.filter(p=>p.bullets.some(b=>weight(b)>textLimit));
 const sourceNumbers=new Set((plan.chunks.map(c=>c.text||'').join(' ').match(/\d+(?:\.\d+)?/g)||[]));
 const unverified=unique(displayed.flatMap(p=>(p.title+' '+p.bullets.join(' ')).match(/\d+(?:\.\d+)?/g)||[])).filter(n=>!sourceNumbers.has(n));
 if(unverified.length)warnings.push('显示内容中存在未能按原值匹配到源码的数字，需核验单位/换算或删除无依据主张：'+unverified.join('、'));
 if(dense.length)warnings.push(`${dense.length} 个内容块含不能安全拆分的长句，请人工压缩；原句保留，未截断限定条件。`);
 rounds.push({round:5,name:'事实、可读性与交付复核',changes:['核对来源 ID、原值数字和完整分块笔记','列出未解决项；真实编译/视觉检查另行记录，不以预检冒充'],metrics:{coverage:covered.size,displayedSources:displayedSources.size,total:known.size,denseBlocks:dense.length,unverifiedNumbers:unverified}});
 return{version:2,kind:options.kind,title:plan.title,author:plan.author,pages:displayed,columns,archive,rounds,warnings,metrics:{pages:displayed.length,sourceCoverage:covered.size,displayedSources:displayedSources.size,totalChunks:known.size,denseBlocks:dense.length},notes:summary.notes};
}
