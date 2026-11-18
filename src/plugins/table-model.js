/** Conservative LaTeX table editing. Cells remain TeX, never evaluated as HTML. */
export function mask(source) {
 const text=source.replace(/\\verb\*?([^A-Za-z\s])[^\n]*?\1|\\begin\{(?:verbatim|lstlisting|minted)\}[\s\S]*?\\end\{(?:verbatim|lstlisting|minted)\}/g,s=>s.replace(/[^\n]/g,' '));
 // Preserve UTF-16 offsets used by editor selections, including surrogate pairs.
 const out=text.split('');for(let i=0;i<text.length;i++){if(text[i]==='\\'){i++;continue;}if(text[i]==='%')for(;i<text.length&&text[i]!=='\n';i++)out[i]=' ';}return out.join('');
}
function group(s,i,open='{',close='}') {
 while(/\s/.test(s[i]||'')&&i<s.length)i++;
 if(s[i]!==open)throw Error('表格参数不完整');
 const start=i;let depth=1;
 for(i++;i<s.length;i++){if(s[i]==='\\'){i++;continue;}if(s[i]===open)depth++;if(s[i]===close&&!--depth)return{value:s.slice(start+1,i),from:start,to:i+1};}
 throw Error('表格括号未闭合');
}
export function findTables(source) {
 const s=mask(source),re=/\\begin\{(tabular\*?|tabularx)\}/g,tables=[];let m;
 while((m=re.exec(s))){const nested=/\\(begin|end)\{(tabular\*?|tabularx)\}/g;nested.lastIndex=re.lastIndex;let depth=1,end=-1,token;while((token=nested.exec(s))){depth+=token[1]==='begin'?1:-1;if(!depth){end=token.index;break;}}if(end<0)continue;
  let from=m.index,to=end+('\\end{'+m[1]+'}').length;
  const lead=source.slice(0,from),start=lead.lastIndexOf('% underoot-table:start');
  if(start>=0&&/^% underoot-table:start\r?\n\\begingroup\s*\\renewcommand\{\\arraystretch\}\{[\d.]+\}\s*\\setlength\{\\tabcolsep\}\{[\d.]+pt\}\s*$/.test(source.slice(start,from))&&!source.slice(start,from).includes('\\endgroup')){
   const tail=/^\s*\\endgroup\s*% underoot-table:end(?:\r?\n)?/.exec(source.slice(to));if(tail){from=start;to+=tail[0].length;}
  }
  tables.push({from,to,begin:m.index,end,env:m[1],label:'表格 '+(tables.length+1),source:source.slice(from,to)});re.lastIndex=to;
 }
 // Associate a float only when it contains a single grid. Keep the actual
 // grid as the edit target so captions and other float commands stay intact.
 const floats = /\\(begin|end)\{(table\*?)\}/g, stack = [];
 for (const token of s.matchAll(floats)) {
  if (token[1] === 'begin') {
   stack.push(token);
   continue;
  }
  const open = stack.pop();
  if (!open || open[2] !== token[2] || stack.length) continue;
  const end = token.index, to = end + token[0].length;
  const inside = tables.filter(table => table.from >= open.index && table.to <= end);
  if (inside.length === 1) {
   inside[0].float = { from: open.index, end, to };
   continue;
  }
  if (inside.length) continue;
  // A float skeleton may include ordinary metadata, but arbitrary commands
  // could already supply a table. Only seed recognized skeletons.
  let at = open.index + open[0].length;
  const whitespace = () => { while (at < end && /\s/.test(s[at])) at++; };
  try {
   whitespace();
   if (s[at] === '[') at = group(s, at, '[', ']').to;
   while (at < end) {
    whitespace();
    if (at === end) break;
    const command = /^\\(centering|caption|label)\b/.exec(s.slice(at));
    if (!command) break;
    at += command[0].length;
    whitespace();
    if (command[1] === 'caption' && s[at] === '[') at = group(s, at, '[', ']').to;
    if (command[1] !== 'centering') at = group(s, at).to;
   }
  } catch { continue; }
  if (at === end) tables.push({
   from: open.index, to, begin: open.index, end, env: open[2],
   emptyFloat: true, source: source.slice(open.index, to),
  });
 }
 return tables.sort((a,b) => a.from - b.from).map((table,i) => ({...table,label:'表格 '+(i+1)}));
}
function columns(spec){
 const clean=spec.replace(/\s/g,'');let cols=[],alignments=[],pending='';const add=c=>{cols.push(c);alignments.push(pending||(/^[crS]/.test(c)?(c==='r'?'r':'c'):'l'));pending='';};
 for(let i=0;i<clean.length;){const c=clean[i++];if(c==='|')continue;if('lcrX'.includes(c))add(c);else if('pmb'.includes(c)){const g=group(clean,i);add(c+'{'+g.value+'}');i=g.to;}else if('@!><'.includes(c)){const g=group(clean,i);if(c==='>')pending=/\\centering\b/.test(g.value)?'c':/\\raggedleft\b/.test(g.value)?'r':/\\raggedright\b/.test(g.value)?'l':pending;i=g.to;}else if(c==='*'){const n=group(clean,i),v=group(clean,n.to),nested=columns(v.value),count=Number(n.value);if(!Number.isInteger(count)||count<1||count>24)throw Error('重复列定义过大');for(let k=0;k<count;k++){cols.push(...nested);alignments.push(...nested.alignments);}i=v.to;}else if(/[A-Za-z]/.test(c)){add(c);while(clean[i]==='{'||clean[i]==='[')i=group(clean,i,clean[i],clean[i]==='{'?'}':']').to;}else throw Error('无法安全识别列定义，请保留源码');if(cols.length>24)throw Error('可视化编辑最多支持 24 列');}
 if(!cols.length)throw Error('未识别到表格列');Object.defineProperty(cols,'alignments',{value:alignments});return cols;
}
const safeEnvs=new Set(['tabular','tabular*','tabularx','array','aligned','alignedat','gathered','matrix','pmatrix','bmatrix','smallmatrix','cases','minipage','math','displaymath']);
export function parseTable(source,table=findTables(source)[0]){
 if(!table)throw Error('未找到 tabular / tabularx 表格');
 if (table.emptyFloat) {
  const model = parseTable('\\begin{tabular}{lc}\n\\end{tabular}');
  return { ...model, ...table, fullSource: source, floatModel: model };
 }
 const s=mask(source);let at=table.begin+('\\begin{'+table.env+'}').length;
 if(s.slice(at).trimStart().startsWith('['))at=group(s,at,'[',']').to;
 let width='';if(table.env!=='tabular'){const g=group(s,at);width=source.slice(g.from+1,g.to-1);at=g.to;if(s.slice(at).trimStart().startsWith('['))at=group(s,at,'[',']').to;}
 const spec=group(s,at),cols=columns(spec.value),start=spec.to,end=table.end,body=s.slice(start,end);
 if(/\\(?:input|include|catcode|verb|omit|span)\b/.test(body))throw Error('此表包含无法安全定位的指令，请使用源码，原表不会被改写');
 const rows=[],rules=[];let firstBottomRule=null,cells=[],cellStart=start,depth=0,math=false,envs=[];
 const addCell=stop=>{let from=cellStart,to=stop;while(/\s/.test(s[from]||'')&&from<to)from++;while(/\s/.test(s[to-1]||'')&&to>from)to--;
  let a=from,b=to,span=1,align='',rowSpan=1,multicolumn=false;
  // Keep all layout wrappers byte-for-byte and patch their innermost content only.
  for(let count=0;count<4;count++){
   const raw=s.slice(a,b);let match;
   if(/^\\multicolumn\b/.test(raw)){const n=group(s,a+12),al=group(s,n.to),v=group(s,al.to);if(s.slice(v.to,b).trim())break;span=Number(n.value);align=al.value;multicolumn=true;if(!Number.isInteger(span)||span<1||span>cols.length)throw Error('合并列范围无效');a=v.from+1;b=v.to-1;continue;}
   if(/^\\multirow\b/.test(raw)){let i=a+9;if(s.slice(i,b).trimStart().startsWith('['))i=group(s,i,'[',']').to;const n=group(s,i);i=n.to;if(s.slice(i,b).trimStart().startsWith('['))i=group(s,i,'[',']').to;const w=group(s,i);i=w.to;if(s.slice(i,b).trimStart().startsWith('['))i=group(s,i,'[',']').to;const v=group(s,i);if(s.slice(v.to,b).trim())break;rowSpan=Number(n.value);if(!Number.isInteger(rowSpan)||!rowSpan||Math.abs(rowSpan)>200)throw Error('合并行范围无效');a=v.from+1;b=v.to-1;continue;}
   if((match=/^\\cellcolor(?:\[[^\]]*\])?\{[^{}]*\}/.exec(raw))){a+=match[0].length;continue;}
   break;
  }
  const raw=source.slice(a,b);cells.push({tex:raw,original:raw,from:a,to:b,span,align,multicolumn,rowSpan,outer:source.slice(from,to)});
 };
 for(let i=start;i<end;i++){
  const c=s[i];if(c==='\\'){
   const env=/^\\(begin|end)\{([^{}]+)\}/.exec(s.slice(i));if(env){if(!safeEnvs.has(env[2]))throw Error('嵌套环境 '+env[2]+' 暂不支持安全内容编辑');if(env[1]==='begin')envs.push(env[2]);else if(envs.pop()!==env[2])throw Error('嵌套环境未闭合');i+=env[0].length-1;continue;}
   const rule=/^\\(toprule|midrule|bottomrule|hline|addlinespace|cline|cmidrule|hhline|hlinewd|noalign|rowcolor)\b(?:\([^)]*\))?(?:\[[^\]]*\])?/.exec(s.slice(i));
   if(!depth&&!envs.length&&rule){if(s.slice(cellStart,i).trim())throw Error('表格行间指令位置不支持');let to=i+rule[0].length,args='';if(s.slice(to,end).trimStart().startsWith('{')){const g=group(s,to);args=g.value;to=g.to;}if(rule[1]==='bottomrule'&&firstBottomRule===null)firstBottomRule=i;rules.push({row:rows.length,kind:rule[1],args});i=to-1;cellStart=to;continue;}
   if((s[i+1]==='\\'||/^\\tabularnewline\b/.test(s.slice(i)))&&!depth&&!math&&!envs.length){addCell(i);rows.push(cells);cells=[];i+=s[i+1]==='\\'?1:'\\tabularnewline'.length-1;if(s[i+1]==='*')i++;if(s[i+1]==='[')i=group(s,i+1,'[',']').to-1;cellStart=i+1;continue;}i++;continue;
  }
  if(c==='$')math=!math;if(c==='{')depth++;if(c==='}')depth--;if(depth<0)throw Error('表格花括号不平衡');if(c==='&'&&!depth&&!math&&!envs.length){addCell(i);cellStart=i+1;}
 }
 if(depth||math||envs.length)throw Error('单元格公式、环境或花括号未闭合');
 if(s.slice(cellStart,end).trim()||cells.length){addCell(end);rows.push(cells);}
 // Render a draft row for an empty grid. Only materialize it after editing.
 const emptyRowAt = rows.length ? null : (firstBottomRule ?? end);
 if (emptyRowAt !== null) rows.push(cols.map(() => ({ tex:'', original:'', span:1, rowSpan:1 })));
 if(rows.length>200||rows.some(r=>r.reduce((n,c)=>n+c.span,0)!==cols.length))throw Error('各行列数不一致或表格过大，请用源码检查');
 const occupied=Array.from({length:rows.length},()=>Array(cols.length).fill(null));
 rows.forEach((row,r)=>{let col=0;for(const cell of row){cell.col=col;const owner=occupied[r][col];if(owner){if(cell.tex.trim()||Array.from({length:cell.span},(_,k)=>occupied[r][col+k]).some(x=>x!==owner))throw Error('跨行单元格与其他内容重叠，请使用源码');cell.covered=true;cell.owner=owner;}
  if(cell.rowSpan>1){if(r+cell.rowSpan>rows.length)throw Error('跨行范围超过表格行数');for(let rr=r+1;rr<r+cell.rowSpan;rr++)for(let cc=col;cc<col+cell.span;cc++){if(occupied[rr][cc])throw Error('跨行范围重叠');occupied[rr][cc]=cell;}}
  col+=cell.span;}});
 const comments=/(?<!\\)%/.test(source.slice(start,end));
 const custom=/>|<|!|@|\*/.test(spec.value)||cols.some(c=>!/^([lcrX]|[pmb]\{.*\})$/.test(c))||/\\(?:multirow|begin|end|cmidrule|cline|addlinespace|hhline|hlinewd|noalign|rowcolor|cellcolor)\b/.test(body)||comments||rows.some(r=>r.some(c=>c.multicolumn&&!/^\|?[lcr]\|?$/.test(c.align)));
 const saved=source.slice(table.from,table.begin),stretch=/\\renewcommand\{\\arraystretch\}\{([\d.]+)\}/.exec(saved),padding=/\\setlength\{\\tabcolsep\}\{([\d.]+)pt\}/.exec(saved);
 return{...table,fullSource:source,header:source.slice(table.begin,spec.from),rows,cols,columnAlignments:cols.alignments,rules,spec:source.slice(spec.from+1,spec.to-1),width,bodyStart:start,bodyEnd:end,emptyRowAt,custom,style:/\\toprule\b/.test(body)?'booktabs':/\\hline\b/.test(body)?'grid':'plain',stretch:Number(stretch?.[1]||1),padding:Number(padding?.[1]||6),structural:false};
}
export function escapeCell(text){return String(text).replace(/[\\{}$&#_%~^]/g,c=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','_':'\\_','%':'\\%','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[c]));}
export function validateCell(s){
 if(s.length>10000||/(?<!\\)%|\\(?:input|include|write|openout|read|catcode|verb)\b/.test(s))throw Error('单元格请勿插入注释、外部文件或执行指令');let depth=0,math=false,envs=[];
 for(let i=0;i<s.length;i++){if(s[i]==='\\'){const env=/^\\(begin|end)\{([^{}]+)\}/.exec(s.slice(i));if(env){if(!safeEnvs.has(env[2]))throw Error('此嵌套环境暂不支持');if(env[1]==='begin')envs.push(env[2]);else if(envs.pop()!==env[2])throw Error('单元格环境未闭合');i+=env[0].length-1;continue;}if(s[i+1]==='\\'&&!depth&&!envs.length)throw Error('单元格内换行请用 \\makecell{...}');i++;continue;}if(s[i]==='{')depth++;if(s[i]==='}'&&--depth<0)throw Error('单元格花括号未闭合');if(s[i]==='$')math=!math;if(s[i]==='&'&&!depth&&!math&&!envs.length)throw Error('请将单元格中的 & 写为 \\&');}if(depth||math||envs.length)throw Error('单元格花括号、公式或环境未闭合');
}
export function serializeTable(model){
 if (model.floatModel) {
  const {floatModel} = model;
  const grid = serializeTable({...floatModel, rows:model.rows, cols:model.cols,
   style:model.style, stretch:model.stretch, padding:model.padding, structural:model.structural, emptyGridEdited:model.emptyGridEdited});
  if (grid === floatModel.fullSource) return model.source;
  const newline = model.source.includes('\r\n') ? '\r\n' : '\n';
  const at = model.end - model.from;
  const prefix = model.source.slice(0, at);
  return prefix + (prefix.endsWith('\n') ? '' : newline) +
   grid.trimEnd().replace(/\n/g, newline) + newline + model.source.slice(at);
 }
 if (!model.structural && model.emptyRowAt !== null) {
  const original = model.fullSource.slice(model.from, model.to);
  if (!model.emptyGridEdited && !model.rows.some(row => row.some(cell => cell.tex !== cell.original))) return original;
  for (const row of model.rows) for (const cell of row) validateCell(cell.tex);
  const at = model.emptyRowAt - model.from;
  const before = original.slice(0, at);
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const rows = model.rows.map(row => row.map(cell => cell.tex).join(' & ') + ' ' + '\\'.repeat(2));
  return before + (before.endsWith('\n') ? '' : newline) +
   rows.join(newline) + newline + original.slice(at);
 }
 for(const row of model.rows)for(const c of row)if(model.structural||c.tex!==c.original)validateCell(c.tex);
 if(!model.structural){let out=model.fullSource.slice(model.from,model.to);const edits=model.rows.flat().filter(c=>c.tex!==c.original).sort((a,b)=>b.from-a.from);for(const c of edits){const value=c.tex;out=out.slice(0,c.from-model.from)+value+out.slice(c.to-model.from);}return out;}
 if(model.custom)throw Error('此表含自定义列、行间规则或注释；为保留原稿，仅允许编辑单元格');
 if(!model.rows.length||!model.cols.length||model.rows.some(r=>r.reduce((n,c)=>n+c.span,0)!==model.cols.length))throw Error('表格列数不一致');
 if(!['booktabs','grid','plain'].includes(model.style)||!Number.isFinite(model.stretch)||!Number.isFinite(model.padding)||model.stretch<.8||model.stretch>2||model.padding<2||model.padding>16)throw Error('样式参数超出范围');
 const spec=model.style==='grid'?'|'+model.cols.join('|')+'|':model.cols.join('');
 const cell=c=>{const align=(c.align||'c').replace(/\|/g,'');return c.span>1||c.multicolumn?'\\multicolumn{'+c.span+'}{'+(model.style==='grid'?'|'+align+'|':align)+'}{'+c.tex+'}':c.tex;};
 const rows=model.rows.map((r,i)=>r.map(cell).join(' & ')+' \\\\'+(model.style==='grid'?'\n\\hline':model.style==='booktabs'&&i===0?'\n\\midrule':''));
 return'% underoot-table:start\n\\begingroup\n\\renewcommand{\\arraystretch}{'+model.stretch+'}\n\\setlength{\\tabcolsep}{'+model.padding+'pt}\n'+model.header+'{'+spec+'}\n'+(model.style==='booktabs'?'\\toprule\n':model.style==='grid'?'\\hline\n':'')+rows.join('\n')+(model.style==='booktabs'?'\n\\bottomrule':'')+'\n\\end{'+model.env+'}\n\\endgroup\n% underoot-table:end\n';
}
export function replaceTable(model){return model.fullSource.slice(0,model.from)+serializeTable(model)+model.fullSource.slice(model.to);}
export function requiredPackages(model){return[...(model.style==='booktabs'?['booktabs']:[]),...(model.env==='tabularx'?['tabularx']:[])];}
