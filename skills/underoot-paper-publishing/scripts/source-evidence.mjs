import {plainText}from'./chunk-paper.mjs';
/** Balanced argument reader for captions/metadata; never executes TeX. */
export function argument(text,command,start=0){
 const pattern=new RegExp('\\\\'+command+'(?:\\[[^\\]]*\\])?\\s*\\{','g');pattern.lastIndex=start;const match=pattern.exec(text);if(!match)return null;
 let depth=1;let end=pattern.lastIndex;
 for(;end<text.length&&depth;end++){if(text[end]==='\\'){end++;continue;}if(text[end]==='{')depth++;if(text[end]==='}')depth--;}
 return depth?null:{value:text.slice(pattern.lastIndex,end-1),from:match.index,to:end};
}
export function sourceEvidence(source,chunks,figures=[]){
 const ids=(from,to)=>chunks.filter(c=>c.from<to&&c.to>from).map(c=>c.id);
 const visuals=[];
 for(const match of source.matchAll(/\\begin\{figure\*?\}(?:\[[^\]]*\])?[\s\S]*?\\end\{figure\*?\}/g)){
  const caption=plainText(argument(match[0],'caption')?.value||'');const label=argument(match[0],'label')?.value||'';
  for(const image of match[0].matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g)){
   const request=image[1].replace(/^\.\//,'');const exact=figures.find(f=>f===request||f.replace(/\.[^.]+$/,'')===request||f.endsWith('/'+request));
   const basename=figures.filter(f=>f.split('/').pop().replace(/\.[^.]+$/,'')===request.split('/').pop().replace(/\.[^.]+$/,''));const found=exact||(basename.length===1?basename[0]:null);
   if(found&&!visuals.some(v=>v.path===found))visuals.push({path:found,caption,label,sourceIds:ids(match.index,match.index+match[0].length)});
  }
 }
 // Inline graphics without a figure environment still carry their exact source range.
 const requests=[...source.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g)];
 for(const file of figures.filter(f=>!visuals.some(v=>v.path===f))){
  const stem=file.split('/').pop().replace(/\.[^.]+$/,'');const unambiguous=figures.filter(f=>f.split('/').pop().replace(/\.[^.]+$/,'')===stem).length===1;
  const match=requests.find(m=>file===m[1]||file.replace(/\.[^.]+$/,'')===m[1]||unambiguous&&stem===m[1].split('/').pop().replace(/\.[^.]+$/,''));
  if(match)visuals.push({path:file,caption:'',label:'',sourceIds:ids(match.index,match.index+match[0].length)});
 }
 const equations=[];let equationCount=0;
 const allowed=new Set('frac dfrac tfrac sqrt sum prod int iint lim left right alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega mathbb mathcal mathrm mathbf operatorname text exp log ln sin cos tan min max arg sup inf mid le leq ge geq neq approx sim simeq in notin subset subseteq cup cap forall exists partial nabla cdot times pm mp to rightarrow mapsto infty lVert rVert vert Vert quad qquad underbrace overbrace hat bar vec dot ddot ell'.split(' '));
 for(const match of source.matchAll(/\\begin\{equation\*?\}([\s\S]*?)\\end\{equation\*?\}|\\\[([\s\S]*?)\\\]/g)){
  equationCount++;
  const value=(match[1]||match[2]).replace(/\\label\{[^}]*\}/g,'').trim();const commands=[...value.matchAll(/\\([A-Za-z@]+)/g)].map(m=>m[1]);
  if(value.length<=320&&commands.every(c=>allowed.has(c))&&!/[#%]/.test(value)&&!value.includes('\\\\'))equations.push({tex:value,sourceIds:ids(match.index,match.index+match[0].length)});
 }
 const tables=[];
 for(const match of source.matchAll(/\\begin\{table\*?\}(?:\[[^\]]*\])?[\s\S]*?\\end\{table\*?\}/g)){
  const body=match[0].match(/\\begin\{tabular\}\{[^}\n]+\}([\s\S]*?)\\end\{tabular\}/)?.[1];
  if(!body||/\\(?:multirow|multicolumn|begin|end)\b/.test(body))continue;
  const cell=(value)=>plainText(value.replace(/\$([^$]*)\$/g,(whole,math)=>/^(?:[\d. +\-{}()eE]|\\(?:pm|%|mathbf|mathrm|textbf))*$/.test(math)?math.replace(/\\pm\b/g,' ± '):whole));
  const rows=body.replace(/\\(?:toprule|midrule|bottomrule|hline)\b/g,'').split(/\\\\(?:\[[^\]]*\])?/).map(row=>row.trim()).filter(Boolean).map(row=>row.split(/(?<!\\)&/).map(cell));
  if(rows.length<2||rows.length>8||rows[0].length<2||rows[0].length>4||rows.some(row=>row.length!==rows[0].length||row.some(cell=>cell.length>100||cell.includes('[公式见原稿]'))))continue;
  tables.push({id:'table-'+(tables.length+1),caption:plainText(argument(match[0],'caption')?.value||''),headers:rows[0],rows:rows.slice(1),sourceIds:ids(match.index,match.index+match[0].length)});
 }
 const skippedTables=[...source.matchAll(/\\begin\{(?:tabular\*?|tabularx|longtable|tabulary)\}/g)].length-tables.length;
 const omittedEquations=equationCount-Math.min(24,equations.length)+[...source.matchAll(/\\begin\{(?:align|gather|multline|eqnarray)\*?\}/g)].length;
 return{visuals,tables,equations:equations.slice(0,24),evidenceWarnings:[...figures.filter(f=>!visuals.some(v=>v.path===f)).map(f=>'插图路径存在歧义，未自动放置：'+f),...(skippedTables>0?[`${skippedTables} 个复杂表格未自动移植；请根据原稿表头、数值和单位重新组织，或保留来源引用。`]:[]),...(omittedEquations>0?[`${omittedEquations} 个公式未直接移植（自定义宏、过长或展示数量限制）；请对照保留的原稿适配。`]:[])]};
}
