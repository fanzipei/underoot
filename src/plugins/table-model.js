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
 while((m=re.exec(s))){const end=s.indexOf('\\end{'+m[1]+'}',re.lastIndex);if(end<0)continue;
  let from=m.index,to=end+('\\end{'+m[1]+'}').length;
  const lead=source.slice(0,from),start=lead.lastIndexOf('% underoot-table:start');
  if(start>=0&&/^% underoot-table:start\r?\n\\begingroup\s*\\renewcommand\{\\arraystretch\}\{[\d.]+\}\s*\\setlength\{\\tabcolsep\}\{[\d.]+pt\}\s*$/.test(source.slice(start,from))&&!source.slice(start,from).includes('\\endgroup')){
   const tail=/^\s*\\endgroup\s*% underoot-table:end(?:\r?\n)?/.exec(source.slice(to));if(tail){from=start;to+=tail[0].length;}
  }
  tables.push({from,to,begin:m.index,end,env:m[1],label:'表格 '+(tables.length+1),source:source.slice(from,to)});re.lastIndex=to;
 }return tables;
}
function columns(spec){
 const clean=spec.replace(/[|\s]/g,'');let cols=[];
 for(let i=0;i<clean.length;){const c=clean[i++];if('lcrX'.includes(c))cols.push(c);else if('pmb'.includes(c)){const g=group(clean,i);cols.push(c+'{'+g.value+'}');i=g.to;}else if(c==='@'||c==='!'){i=group(clean,i).to;}else if(c==='*'){const n=group(clean,i),v=group(clean,n.to);const count=Number(n.value);if(!Number.isInteger(count)||count<1||count>24)throw Error('重复列定义过大');cols.push(...Array.from({length:count},()=>columns(v.value)).flat());i=v.to;}else throw Error('自定义列类型暂不支持可视化编辑，请保留源码');if(cols.length>24)throw Error('可视化编辑最多支持 24 列');}
 if(!cols.length)throw Error('未识别到表格列');return cols;
}
export function parseTable(source,table=findTables(source)[0]){
 if(!table)throw Error('未找到 tabular / tabularx 表格');
 const s=mask(source);let at=table.begin+('\\begin{'+table.env+'}').length;
 if(s.slice(at).trimStart().startsWith('['))at=group(s,at,'[',']').to;
 let width='';if(table.env!=='tabular'){const g=group(s,at);width=source.slice(g.from+1,g.to-1);at=g.to;if(s.slice(at).trimStart().startsWith('['))at=group(s,at,'[',']').to;}
 const spec=group(s,at),cols=columns(spec.value),start=spec.to,end=table.end;
 const body=s.slice(start,end);
 if(/\\(?:multirow|begin|end|input|include|catcode|verb|omit|span|noalign|hhline|hlinewd)\b/.test(body))throw Error('此表包含跨行、嵌套环境或自定义布局；请使用源码，原表不会被改写');
 const rows=[];let cells=[],cellStart=start,depth=0,math=false;
 const addCell=stop=>{let from=cellStart,to=stop;while(/\s/.test(s[from]||'')&&from<to)from++;while(/\s/.test(s[to-1]||'')&&to>from)to--;let raw=source.slice(from,to),span=1,align='';
  if(/^\\multicolumn\b/.test(raw)){let i='\\multicolumn'.length;const n=group(raw,i),a=group(raw,n.to),v=group(raw,a.to);if(raw.slice(v.to).trim())throw Error('合并列后还有额外指令，请用源码编辑');span=Number(n.value);align=a.value;if(!Number.isInteger(span)||span<1||span>cols.length||!/^\|?[lcr]\|?$/.test(align))throw Error('复杂合并列暂不支持');raw=v.value;}
  cells.push({tex:raw,original:raw,from,to,span,align,multicolumn:!!align});};
 for(let i=start;i<end;i++){
  const c=s[i];if(c==='\\'){
   const rule=/^\\(?:toprule|midrule|bottomrule|hline|addlinespace|cline|cmidrule)\b(?:\([^)]*\))?(?:\[[^\]]*\])?(?:\{[\d-]+\})?/.exec(s.slice(i));
   if(!depth&&rule){if(s.slice(cellStart,i).trim())throw Error('表格行间指令位置不支持');i+=rule[0].length-1;cellStart=i+1;continue;}
   if(s[i+1]==='\\'&&!depth&&!math){addCell(i);rows.push(cells);cells=[];i++;if(s[i+1]==='*')i++;if(s[i+1]==='[')i=group(s,i+1,'[',']').to-1;cellStart=i+1;continue;}i++;continue;
  }
  if(c==='$')math=!math;
  if(c==='{')depth++;if(c==='}')depth--;
  if(depth<0)throw Error('表格花括号不平衡');
  if(c==='&'&&!depth&&!math){addCell(i);cellStart=i+1;}
 }
 if(depth||math)throw Error('单元格公式或花括号未闭合');
 if(s.slice(cellStart,end).trim()||cells.length){addCell(end);rows.push(cells);}
 if(!rows.length||rows.length>200||rows.some(r=>r.reduce((n,c)=>n+c.span,0)!==cols.length))throw Error('各行列数不一致或表格过大，请用源码检查');
 const comments=/(?<!\\)%/.test(source.slice(start,end));
 const custom=/>|<|!|@|\*/.test(spec.value)||/\\(?:cmidrule|cline|addlinespace)\b/.test(body)||comments;
 const saved=source.slice(table.from,table.begin),stretch=/\\renewcommand\{\\arraystretch\}\{([\d.]+)\}/.exec(saved),padding=/\\setlength\{\\tabcolsep\}\{([\d.]+)pt\}/.exec(saved);
 return{...table,fullSource:source,header:source.slice(table.begin,spec.from),rows,cols,spec:source.slice(spec.from+1,spec.to-1),width,bodyStart:start,bodyEnd:end,custom,style:/\\toprule\b/.test(body)?'booktabs':/\\hline\b/.test(body)?'grid':'plain',stretch:Number(stretch?.[1]||1),padding:Number(padding?.[1]||6),structural:false};
}
export function escapeCell(text){return String(text).replace(/[\\{}$&#_%~^]/g,c=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','_':'\\_','%':'\\%','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[c]));}
export function validateCell(s){
 if(s.length>10000||/(?<!\\)%|\\(?:input|include|write|openout|read|begin|end)\b/.test(s))throw Error('单元格请勿插入注释、外部文件或环境');let depth=0,math=false;
 for(let i=0;i<s.length;i++){if(s[i]==='\\'){if(s[i+1]==='\\'&&!depth)throw Error('单元格内换行请用 \\makecell{...}');i++;continue;}if(s[i]==='{')depth++;if(s[i]==='}'&&--depth<0)throw Error('单元格花括号未闭合');if(s[i]==='$')math=!math;if(s[i]==='&'&&!depth&&!math)throw Error('请将单元格中的 & 写为 \\&');}if(depth||math)throw Error('单元格花括号或公式未闭合');
}
export function serializeTable(model){
 for(const row of model.rows)for(const c of row)if(model.structural||c.tex!==c.original)validateCell(c.tex);
 if(!model.structural){let out=model.fullSource.slice(model.from,model.to);const edits=model.rows.flat().filter(c=>c.tex!==c.original).sort((a,b)=>b.from-a.from);for(const c of edits){const value=c.span>1||c.multicolumn?'\\multicolumn{'+c.span+'}{'+c.align+'}{'+c.tex+'}':c.tex;out=out.slice(0,c.from-model.from)+value+out.slice(c.to-model.from);}return out;}
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
