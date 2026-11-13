import{portableTable}from'./portable-table.mjs';
import {plainText}from'./chunk-paper.mjs';
const captionText=v=>plainText(v.replace(/\\pm\b/g,' ± ').replace(/\\downarrow\b/g,' ↓ ').replace(/\\uparrow\b/g,' ↑ ').replace(/\$([^$]*)\$/g,(whole,math)=>/\\(?:frac|sum|prod|int)\b/.test(math)?whole:math)).replace(/_\s*(?=±)/g,' ');
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
  const caption=captionText(argument(match[0],'caption')?.value||'');const label=argument(match[0],'label')?.value||'';
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
 const tables=[];let portableCount=0;
 for(const match of source.matchAll(/\\begin\{table\*?\}(?:\[[^\]]*\])?[\s\S]*?\\end\{table\*?\}/g)){
  const parsed=portableTable(match[0],source);if(!parsed)continue;portableCount++;
  const caption=captionText(argument(match[0],'caption')?.value||'');const same=tables.find(t=>JSON.stringify([t.caption,t.headers,t.rows])===JSON.stringify([caption,parsed.headers,parsed.rows]));if(same)same.sourceIds=[...new Set([...same.sourceIds,...ids(match.index,match.index+match[0].length)])];else tables.push({id:'table-'+(tables.length+1),caption,...parsed,sourceIds:ids(match.index,match.index+match[0].length)});
 }
 // Expand only explicitly defined dataset abbreviations, never guess a legend.
 const definitions=new Map(),ambiguous=new Set();for(const t of tables)for(const m of t.caption.matchAll(/((?:[A-Z]{2,5}(?:,|\s|and)+){1,7}[A-Z]{2,5})\s+(?:denote|refer to|stand for)\s+(.+?),\s*respectively\./g)){const codes=m[1].match(/\b[A-Z]{2,5}\b/g)||[],names=m[2].split(/,\s*(?:and\s+)?/);if(codes.length!==names.length)continue;codes.forEach((c,i)=>{if(definitions.has(c)&&definitions.get(c)!==names[i])ambiguous.add(c);definitions.set(c,names[i]);});}
 for(const t of tables){const expand=v=>String(v).replace(/\b[A-Z]{2,5}\b/g,c=>definitions.has(c)&&!ambiguous.has(c)?definitions.get(c):c);if(/matched|transfer|region|phase|event/i.test(t.caption))t.headers=t.headers.map(expand);t.rows=t.rows.map(row=>row.map((v,i)=>i===0&&/[→↔←]/.test(v)?expand(v):v));}
 const skippedTables=[...source.matchAll(/\\begin\{(?:tabular\*?|tabularx|longtable|tabulary)\}/g)].length-portableCount;
 const omittedEquations=equationCount-Math.min(24,equations.length)+[...source.matchAll(/\\begin\{(?:align|gather|multline|eqnarray)\*?\}/g)].length;
 return{visuals,tables,equations:equations.slice(0,24),evidenceWarnings:[...figures.filter(f=>!visuals.some(v=>v.path===f)).map(f=>'插图路径存在歧义，未自动放置：'+f),...(skippedTables>0?[`${skippedTables} 个复杂表格未自动移植；请根据原稿表头、数值和单位重新组织，或保留来源引用。`]:[]),...(omittedEquations>0?[`${omittedEquations} 个公式未直接移植（自定义宏、过长或展示数量限制）；请对照保留的原稿适配。`]:[])]};
}
