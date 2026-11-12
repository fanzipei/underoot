import {posterFontFor}from'./render-editorial.mjs';
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
export function measurements(log){
 const blocks=Object.fromEntries([...String(log).matchAll(/UNDEROOT:BLOCK:([\w-]+):([\d.]+)pt/g)].map(m=>[m[1],Number(m[2])]));
 const slides=Object.fromEntries([...String(log).matchAll(/UNDEROOT:SLIDE:([\w-]+):([\d.]+)pt:([\d.]+)pt/g)].map(m=>[m[1],{height:Number(m[2]),available:Number(m[3])}]));
 return{blocks,slides,available:Number(String(log).match(/UNDEROOT:BODY:([\d.]+)pt/)?.[1])||null};
}
/** Partition actual box heights, retaining the approved reading order. */
export function measuredColumns(pages,heights,count,gap=34.143307){
 const n=pages.length,k=Math.min(count,n),sum=[0];for(const p of pages)sum.push(sum.at(-1)+(heights[p.id]||0));
 const dp=Array.from({length:k+1},()=>Array(n+1).fill(Infinity)),cuts=Array.from({length:k+1},()=>Array(n+1).fill(0));dp[0][0]=0;
 for(let c=1;c<=k;c++)for(let end=c;end<=n;end++)for(let start=c-1;start<end;start++){const value=Math.max(dp[c-1][start],sum[end]-sum[start]+Math.max(0,end-start-1)*gap);if(value<dp[c][end]){dp[c][end]=value;cuts[c][end]=start;}}
 const columns=[];let end=n;for(let c=k;c>0;c--){const start=cuts[c][end];columns.unshift(pages.slice(start,end).map(p=>p.id));end=start;}while(columns.length<count)columns.push([]);
 return columns;
}
export function layoutUsage(story,options,measured){
 if(options.kind==='poster'){
  if(!measured.available||story.pages.some(p=>!measured.blocks[p.id]))return null;
  const loads=story.columns.map(ids=>ids.reduce((s,id)=>s+measured.blocks[id],0)+Math.max(0,ids.length-1)*34.143307);
  return{maximum:Math.max(...loads)/measured.available,minimum:Math.min(...loads)/measured.available,columns:loads.map(v=>v/measured.available),available:measured.available};
 }
 const pages=Object.entries(measured.slides||{}).map(([id,m])=>({id,fill:m.height/m.available}));
 return pages.length===story.pages.length?{pages,minimum:Math.min(...pages.map(p=>p.fill)),maximum:Math.max(...pages.map(p=>p.fill))}:null;
}
export function adjustLayout(story,options,measured,usage,overflow=false){
 if(!usage)return false;const before=JSON.stringify(story);
 if(options.kind==='poster'){
  if(!story.posterColumns&&options.columns===3&&story.pages.length<9&&usage.minimum<.60&&usage.maximum<.88){story.posterColumns=2;if(story.pages.at(-1)?.role==='conclusion'&&story.pages.length>=5)story.posterFooter=story.pages.at(-1).id;story.columns=measuredColumns(story.pages.filter(p=>p.id!==story.posterFooter),measured.blocks,2);return true;}
  const previous=JSON.stringify(story.columns);story.columns=measuredColumns(story.pages.filter(p=>p.id!==story.posterFooter),measured.blocks,story.posterColumns||options.columns);
  if(previous!==JSON.stringify(story.columns))return true; // Measure this new partition before changing typography.
  const factor=overflow||usage.maximum>1?clamp(.90/usage.maximum,.78,.95):usage.maximum<.88?clamp(Math.sqrt(.92/Math.max(.12,usage.maximum)),1.06,1.30):1;
  story.posterFont=clamp(Math.round((story.posterFont||36)*factor),32,64);
  if(overflow&&story.posterFont===32)story.posterLeading=story.posterFont+5;
  story.posterFigureHeight=clamp(Number(((story.posterFigureHeight||(options.orientation==='landscape'?14:19))*factor).toFixed(1)),10,options.orientation==='landscape'?30:38);
 }else for(const page of story.pages){
  const fill=usage.pages.find(p=>p.id===page.id)?.fill;if(!fill)continue;
  const factor=fill>.96?clamp(.88/fill,.8,.96):fill<.68?clamp(Math.sqrt(.78/fill),1.06,1.3):1;
  const base=page.slideFont||(page.figures.length?12:page.layout==='statement'?22:14);
  page.slideFont=clamp(Math.round(base*factor),page.figures.length?12:14,page.figures.length?20:page.layout==='statement'?30:24);
  page.figureHeight=clamp(Number(((page.figureHeight||.42)*factor).toFixed(2)),.30,.64);
  page.centered=fill<.65;
 }
 return before!==JSON.stringify(story);
}
/** Real compile/measure loop; never uses paid model calls or edits research claims. */
export async function fitPublication(info,options,{render,write,audit,check=()=>{},progress=()=>{},maxRounds=8}){
 let story=info.editorial,best=null,lastContent;const rounds=[];
 for(const page of story.pages){delete page.posterShare;delete page.posterGaps;delete page.posterBoxCorrection;}
 if(options.kind==='poster')story.posterFont=posterFontFor(story,options,options.customTemplate||{});
 const limit=Math.max(1,Math.min(8,Math.floor(maxRounds))),trials=options.kind==='poster'?Math.max(1,limit-2):limit;
 for(let round=1;round<=trials;round++){
  check();progress({phase:'layout',message:`自动排版 ${round}/${trials}：编译并测量实际内容高度`});
  const content=render({...info,editorial:story},options);lastContent=content;write(content);const result=await audit();check();
  const usage=layoutUsage(story,options,result.measurements||{});
  const valid=result.status==='passed'&&(!usage||usage.maximum<=1.01);
  const sparse=usage&&(options.kind==='poster'?usage.maximum<.85||usage.minimum<.62:usage.pages.some(p=>p.fill<.48));
  const score=valid?(options.kind==='poster'&&usage?Math.min(.9,usage.minimum)+Math.min(.9,usage.maximum):usage?usage.pages.reduce((n,p)=>n+Math.min(.82,p.fill),0)/usage.pages.length:0):-100-100*Math.max(0,(usage?.maximum||1)-1)-1000*(result.errors?.length||0)-(result.issues?.length||0);
  rounds.push({round,status:result.status,usage,posterFont:story.posterFont,figureHeight:story.posterFigureHeight,columns:story.columns,footer:story.posterFooter,pageFormats:options.kind==='slides'?story.pages.map(p=>({id:p.id,font:p.slideFont,figureHeight:p.figureHeight})):undefined,issues:result.issues||[],errors:result.errors||[]});
  if(!best||score>best.score)best={score,content,story:structuredClone(story),result,usage};
  if(result.status==='unavailable'||(!sparse&&valid)||round===trials)break;
  if(!adjustLayout(story,options,result.measurements||{},usage,!valid))break;
 }
 for(const key of Object.keys(info.editorial))delete info.editorial[key];Object.assign(info.editorial,best.story);write(best.content);
 // If a later trial was rejected, rebuild the selected candidate so its PDF matches the saved TeX.
 let final=best.content!==lastContent?await audit():best.result;
 let panelFill=null;
 if(options.kind==='poster'&&final.status==='passed'&&best.usage&&best.usage.maximum<=1&&rounds.length<limit){
  const natural=structuredClone(info.editorial);
  for(const ids of info.editorial.columns){const total=ids.reduce((sum,id)=>sum+best.result.measurements.blocks[id],0);for(const id of ids){const page=info.editorial.pages.find(p=>p.id===id);page.posterShare=best.result.measurements.blocks[id]/total;page.posterGaps=Math.max(0,ids.length-1);}}
  progress({phase:'layout',message:'自动排版：将模块边框对齐版心，分配段落、要点与图文间距并复检'});
  let accepted=false;
  const alignments=Math.min(2,limit-rounds.length);
  for(let alignment=0;alignment<alignments;alignment++){
   const filled=render(info,options);write(filled);const inspected=await audit();check();const framed=layoutUsage(info.editorial,options,inspected.measurements||{});
   rounds.push({round:rounds.length+1,phase:alignment?'panel-align':'panel-fill',status:inspected.status,usage:framed,naturalUsage:best.usage,issues:inspected.issues,errors:inspected.errors});
   if(inspected.status==='passed'&&framed?.maximum<=1.001&&framed.minimum>=.999){final=inspected;panelFill={enabled:true,naturalUsage:best.usage,framedUsage:framed};accepted=true;break;}
   if(inspected.status!=='passed'||!framed||alignment)break;
   for(const page of info.editorial.pages.filter(p=>p.posterShare)){const target=page.posterShare*(framed.available-page.posterGaps*34.143307),actual=inspected.measurements.blocks[page.id];page.posterBoxCorrection=(page.posterBoxCorrection||0)+actual-target;}
  }
  if(!accepted){for(const key of Object.keys(info.editorial))delete info.editorial[key];Object.assign(info.editorial,natural);write(best.content);final=await audit();}

 }
 const issues=[...(final.issues||[])];if(best.usage&&options.kind==='poster'&&best.usage.minimum<.45)issues.push('部分栏位仍较空，请补充已核实的视觉证据或精简版式');
 if(best.usage&&best.usage.maximum>1.01)issues.push('实际内容高度超过可用区域');
 return{...final,status:issues.length?'needs-review':final.status,issues,usage:best.usage,panelFill,iterations:rounds,selectedScore:best.score};
}
