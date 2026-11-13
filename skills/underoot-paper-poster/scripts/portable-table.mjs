import{plainText}from'./chunk-paper.mjs';
// Balanced literal arguments; no macro execution or raw table TeX is transferred.
function group(text,start=0){let i=start;while(/\s/.test(text[i]||'')&&i<text.length)i++;if(text[i]!=='{')return null;let depth=1,j=i+1;for(;j<text.length&&depth;j++){if(text[j]==='\\'){j++;continue;}if(text[j]==='{')depth++;if(text[j]==='}')depth--;}return depth?null:{value:text.slice(i+1,j-1),to:j};}
function unwrap(text,name,count,index){const regex=new RegExp('\\\\'+name+'\\b','g');let match;while((match=regex.exec(text))){let at=regex.lastIndex,args=[];const optional=/^\s*\[[^\]]*\]/.exec(text.slice(at));if(optional)at+=optional[0].length;for(let i=0;i<count;i++){const a=group(text,at);if(!a){args=[];break;}args.push(a.value);at=a.to;}if(args.length!==count)continue;if(name==='multicolumn'&&(!Number.isInteger(Number(args[0]))||Number(args[0])<1||Number(args[0])>24))continue;const replacement=args[index]+(name==='multicolumn'?' & '.repeat(Math.max(0,Math.min(23,Number(args[0])-1))):'');text=text.slice(0,match.index)+replacement+text.slice(at);regex.lastIndex=match.index+replacement.length;}return text;}
export function portableTable(environment,source=''){
 const definitions=new Map();for(const match of source.matchAll(/\\(?:newcommand|renewcommand|providecommand)\*?\s*(?:\{\\([A-Za-z]+)\}|\\([A-Za-z]+))\s*/g)){const arg=group(source,match.index+match[0].length);if(arg&&arg.value.length<2000)definitions.set(match[1]||match[2],arg.value);}
 for(let round=0;round<4;round++){let changed=false;environment=environment.replace(/\\([A-Za-z]+)\b/g,(all,name)=>{if(!definitions.has(name))return all;changed=true;return definitions.get(name);});if(!changed||environment.length>100000)break;}
 environment=environment.replace(/\\ding\s*\{51\}|\\checkmark\b/g,'Yes').replace(/\\ding\s*\{55\}/g,'No');
 const begin=/\\begin\{(tabular\*?|tabularx)\}(?:\[[^\]]*\])?/.exec(environment);if(!begin)return null;let at=begin.index+begin[0].length;
 if(begin[1]!=='tabular'){const width=group(environment,at);if(!width)return null;at=width.to;}
 const spec=group(environment,at);if(!spec)return null;let body=environment.slice(spec.to,environment.indexOf('\\end{'+begin[1]+'}',spec.to));
 if(/\\(?:input|include|write|read|openout|begin|end)\b/.test(body))return null;
 const hasSpans=/\\multicolumn/.test(body),hasMultirow=/\\multirow/.test(body);
 body=unwrap(unwrap(unwrap(body,'multicolumn',3,2),'multirow',3,2),'textcolor',2,1).replace(/\\(?:rowcolor|cellcolor)\s*\{[^}]*\}/g,'').replace(/\\(?:toprule|midrule|bottomrule|hline|addlinespace)(?:\[[^\]]*\])?/g,'').replace(/\\(?:cmidrule|cline)(?:\([^)]*\))?\{[^}]*\}/g,'');
 if(/\\(?:multicolumn|multirow|textcolor)\b/.test(body))return null;
 const allowed=new Set(['textbf','textit','emph','underline','makecell','num','SI','si','mathrm','mathbf','text','texttt','textrm','mathsf','mathit','footnotesize','scriptsize','small','bfseries','scshape','pm','uparrow','downarrow','times','to','rightarrow','leftarrow','leftrightarrow','quad','qquad']);if([...body.matchAll(/\\([A-Za-z]+)/g)].some(m=>!allowed.has(m[1])))return null;
 const cell=value=>plainText(value.replace(/\\[,;:!]/g,' ').replace(/\\pm(?![A-Za-z])/g,' ± ').replace(/\\uparrow\b/g,' ↑ ').replace(/\\downarrow\b/g,' ↓ ').replace(/\\times\b/g,' × ').replace(/\\(?:to|rightarrow)\b/g,' → ').replace(/\\leftarrow\b/g,' ← ').replace(/\\leftrightarrow\b/g,' ↔ ').replace(/\\(?:scriptsize|footnotesize|small)\b/g,'').replace(/\$([^$]*)\$/g,(m,v)=>/^(?:[A-Za-z\d_.,:/ +\-{}()±↑↓×→←↔]|\\(?:%|mathbf|mathrm|textbf))*$/.test(v)?v:m)).replace(/_\s*(?=±)/g,' ');
 const rowsOf=[];let row=[],value='',depth=0;
 for(let i=0;i<body.length;i++){const c=body[i];if(c==='\\'&&body[i+1]==='\\'){if(depth===0){row.push(cell(value));rowsOf.push(row);row=[];value='';i++;const skip=/^\[[^\]]*\]/.exec(body.slice(i+1));if(skip)i+=skip[0].length;continue;}value+=' ';i++;continue;}if(c==='\\'&&/[{}&]/.test(body[i+1]||'')){value+=c+body[++i];continue;}if(c==='{')depth++;if(c==='}')depth--;if(c==='&'&&depth===0){row.push(cell(value));value='';}else value+=c;}
 if(value.trim()||row.length){row.push(cell(value));rowsOf.push(row);}let rows=rowsOf.filter(r=>r.some(Boolean));
 const width=Math.max(0,...rows.map(r=>r.length));if(width<2||width>24||rows.length<2||rows.length>80||rows.some(r=>r.some(c=>c.length>160||c.includes('[公式见原稿]'))))return null;
 if(rows.some(r=>r.length!==width)){if(!hasSpans&&!hasMultirow)return null;rows=rows.map(r=>[...r,...Array(width-r.length).fill('')]);}
 let headers=rows.shift();while(hasSpans&&rows.length>1&&(!rows[0][0].trim()||/^(?:methods?|models?|datasets?|settings?|metrics?)$/i.test(rows[0][0].trim()))&&rows[0].some(Boolean)){let parent='';headers=headers.map((v,i)=>{if(v)parent=v;return[v||parent,rows[0][i]].filter(Boolean).join(' / ');});rows.shift();}
 if(hasMultirow)for(let i=1;i<rows.length;i++)if(!rows[i][0])rows[i][0]=rows[i-1][0];
 return{headers,rows};
}
/** Repeat identifier columns across readable table panels; preserve every value. */
export function tablePanels(table,kind){
 const ids=table.headers.length>2&&table.rows.some(r=>r[1]&&!/^[\d. +\-±]/.test(r[1]))?2:1,metrics=Array.from({length:table.headers.length-ids},(_,i)=>i+ids),groups=[];
 const step=kind==='slides'&&ids===2?2:3,rowLimit=kind==='slides'?(ids===2||table.rows.some(r=>r.slice(0,ids).some(v=>v.length>24))?3:6):7;
 for(let c=0;c<metrics.length;c+=step)for(let r=0;r<table.rows.length;r+=rowLimit){const cols=[...Array.from({length:ids},(_,i)=>i),...metrics.slice(c,c+step)];groups.push({...table,id:table.id+'-'+c+'-'+r,identifierColumns:ids,headers:cols.map(i=>table.headers[i]),rows:table.rows.slice(r,r+rowLimit).map(row=>cols.map(i=>row[i]))});}
 return groups;
}


function selectedRows(table,title,limit){
 const name=title.split(':')[0].trim(),own=row=>/\bours\b|our method|proposed|本方法|本文/i.test(row.join(' '))||(name.length>2&&name.length<30&&row.some(c=>c.includes(name))),chosen=new Set();
 const owners=table.rows.map((r,i)=>own(r)?i:-1).filter(i=>i>=0),ids=table.headers.length>2&&table.rows.some(r=>r[1]&&!/^[\d. +\-±]/.test(r[1]))?2:1;
 if(!owners.length&&/zero.shot|transfer|迁移/i.test(table.caption||'')){
  const off=table.rows.map((r,i)=>{const pair=r[0].split(/[→↔←]/).map(v=>v.trim());return pair.length===2&&pair[0]!==pair[1]?i:-1;}).filter(i=>i>=0),avg=table.rows.findIndex(r=>/\b(?:avg|average)\b|均值|平均/i.test(r[0])&&r.slice(1).some(v=>/\d/.test(v)));
  if(avg>=0)chosen.add(avg);if(off.length){chosen.add(off[0]);if(chosen.size<limit)chosen.add(off.at(-1));for(const i of off)if(chosen.size<limit)chosen.add(i);}
 }else if(owners.length){
  const group=ids===2?table.rows[owners[0]][0]:null;for(const i of owners)if((group===null||table.rows[i][0]===group)&&chosen.size<limit-1)chosen.add(i);
  const header=table.headers[ids]||'',direction=/↓/.test(header)?1:/↑/.test(header)?-1:0;
  const score=r=>Number(r[ids]?.match(/[-+]?\d+(?:\.\d+)?/)?.[0]);
  const candidates=table.rows.map((r,i)=>({r,i})).filter(({r,i})=>!owners.includes(i)&&(group===null||r[0]===group)&&! /\b(?:improvement|avg|average|mean)\b|提升|均值/i.test(r[0])&&r.slice(ids).some(v=>/\d/.test(v)));
  if(direction)candidates.sort((a,b)=>(score(a.r)-score(b.r))*direction);
  for(const{ i }of candidates)if(chosen.size<limit)chosen.add(i);
 }
 for(let i=0;i<table.rows.length&&chosen.size<limit;i++)chosen.add(i);
 return table.rows.filter((_,i)=>chosen.has(i));
}
function primaryColumns(table,title){
 const name=title.split(':')[0].trim(),own=table.headers.findIndex(h=>/\bours\b|our method|proposed|本方法/i.test(h)||(name.length>2&&name.length<30&&h.includes(name)));
 const average=table.rows.find(r=>/\b(?:avg|average)\b|平均/i.test(r[0]));if(own<1||!average)return table;
 const direction=/MAE|RMSE|CRPS|error|loss|↓/i.test(table.caption+' '+table.headers.join(' '))?1:/accuracy|↑/i.test(table.caption+' '+table.headers.join(' '))?-1:0;if(!direction)return table;
 const values=table.headers.map((_,i)=>({i,value:Number(average[i]?.match(/[-+]?\d+(?:\.\d+)?/)?.[0])})).filter(x=>x.i>0&&x.i!==own&&Number.isFinite(x.value)).sort((a,b)=>(a.value-b.value)*direction);
 const cols=[0,own,...values.slice(0,2).map(v=>v.i)];return{...table,headers:cols.map(i=>table.headers[i]),rows:table.rows.map(r=>cols.map(i=>r[i]))};
}
export function posterResultTable(table,title=''){const subset=primaryColumns(table,title);return{...subset,selection:{originalRows:table.rows.length,displayRows:Math.min(5,table.rows.length)},rows:selectedRows(subset,title,5)};}
export function presentationTables(table,title=''){const full=tablePanels(table,'slides');if(full.length===1)return full;const subset=primaryColumns(table,title),core=tablePanels({...subset,rows:selectedRows(subset,title,3)},'slides')[0];return[{...core,id:table.id+'-main',selection:{originalRows:table.rows.length,displayRows:core.rows.length}},...full.map(p=>({...p,appendix:true}))];}
