import {excelCells, configureEmptyGrid, pasteTableCells} from '../src/plugins/table-starter.js';
import assert from 'node:assert/strict';
import {findTables,parseTable,serializeTable,replaceTable,escapeCell,validateCell} from '../src/plugins/table-model.js';
let n=0;const test=(name,fn)=>{fn();n++;console.log('✓ '+name);};
const tex=String.raw`\documentclass{article}
\usepackage{booktabs}
\begin{document}
Intro & outside.
\begin{table}[t]\caption{Keep caption}\label{tab:keep}
\begin{tabular}{lcc}
\toprule
Method & Accuracy & Cost \\
\midrule
\textbf{Ours} & $0.92 \pm 0.01$ & 12 \\
A \& B & \multicolumn{2}{c}{Shared {value}} \\
\bottomrule
\end{tabular}
\end{table}
End.
\end{document}`;
test('unchanged table is byte-for-byte preserved',()=>{const m=parseTable(tex);assert.equal(replaceTable(m),tex);assert.equal(m.rows.length,3);assert.equal(m.rows[2][1].span,2);});
test('one edited cell preserves captions, rules, macros and all surrounding bytes',()=>{const m=parseTable(tex);m.rows[1][1].tex='$0.93 \\pm 0.01$';assert.equal(replaceTable(m),tex.replace('$0.92','$0.93'));});
test('merged column content is editable without flattening the span',()=>{const m=parseTable(tex);m.rows[2][1].tex='New {value}';assert.equal(replaceTable(m),tex.replace('Shared {value}','New {value}'));});
test('single-column multicolumn alignment survives editing',()=>{const s=String.raw`\begin{tabular}{lc}\multicolumn{1}{r}{A} & B \\ \end{tabular}`,m=parseTable(s);m.rows[0][0].tex='New';assert.equal(replaceTable(m),s.replace('{A}','{New}'));});
test('generated wrappers do not comment out inline table suffixes',()=>{const s=String.raw`\begin{table}\begin{tabular}{lc}A & B \\\end{tabular}\end{table}`,m=parseTable(s);m.structural=true;assert.ok(replaceTable(m).includes('% underoot-table:end\n\\end{table}'));});
test('grid, plain and three-line styles survive TeX -> grid -> TeX',()=>{for(const style of ['grid','plain','booktabs']){const m=parseTable(tex);m.structural=true;m.style=style;m.padding=8;m.stretch=1.2;const out=replaceTable(m),again=parseTable(out);assert.equal(again.style,style);assert.equal(again.padding,8);assert.equal(again.stretch,1.2);assert.equal(again.rows[1][1].tex,'$0.92 \\pm 0.01$');assert.equal(replaceTable(again),out);assert.equal(findTables(out).length,1);}});
test('repeated style edits do not accumulate wrappers',()=>{let text=tex;for(let i=0;i<4;i++){const m=parseTable(text);m.structural=true;m.padding=7;text=replaceTable(m);}assert.equal(text.match(/underoot-table:start/g).length,1);assert.equal(text.match(/\\begingroup/g).length,1);assert.ok(text.includes('\\caption{Keep caption}'));});
test('multiple tables retain exact target positions',()=>{const s=tex+tex;const t=findTables(s);assert.equal(t.length,2);const m=parseTable(s,t[1]);m.rows[0][0].tex='Name';assert.equal(replaceTable(m).slice(0,tex.length),tex);});
test('commented and verbatim examples are not mistaken for real tables',()=>{const s=String.raw`% \begin{tabular}{c} X \\ \end{tabular}
\begin{verbatim}\begin{tabular}{c} X \\ \end{tabular}\end{verbatim}
`+tex;assert.equal(findTables(s).length,1);});
test('escaped ampersands, grouped line breaks and formulas remain inside cells',()=>{const m=parseTable(String.raw`\begin{tabular}{lc} A \& B & \makecell{x \\ y} \\ $x_1$ & {nested {text}} \\ \end{tabular}`);assert.equal(m.rows.length,2);assert.equal(m.rows[0].length,2);});
test('tabularx width, optional alignment and X columns are preserved',()=>{const s=String.raw`\begin{tabularx}{\linewidth}[t]{lX} A & B \\ C & D \\ \end{tabularx}`,m=parseTable(s);assert.equal(m.width,'\\linewidth');assert.deepEqual(m.cols,['l','X']);assert.equal(replaceTable(m),s);});
test('custom spacing and partial rules permit lossless cells but refuse style reconstruction',()=>{const s=String.raw`\begin{tabular}{@{}lc@{}} A & B \\ \cmidrule(lr){1-2} C & D \\ \end{tabular}`,m=parseTable(s);m.rows[1][1].tex='E';assert.equal(replaceTable(m),s.replace('D','E'));m.structural=true;assert.throws(()=>serializeTable(m),/仅允许/);});
test('comments and row spacing are preserved on cell edits',()=>{const s=String.raw`\begin{tabular}{lc} A & B \\[2pt] % note
C & D \\ \end{tabular}`,m=parseTable(s);m.rows[1][1].tex='E';assert.equal(replaceTable(m),s.replace('D','E'));});
test('multirow content edits retain every wrapper, optional argument and partial rule',()=>{const s=String.raw`\begin{tabular}{@{}lcc@{}}\toprule
\multirow[t]{2}[1]{*}[-2pt]{\textbf{Group}} & A & 1 \\ \cmidrule(lr){2-3}
 & B & 2 \\ \bottomrule\end{tabular}`,m=parseTable(s);assert.equal(m.custom,true);assert.equal(m.rows[0][0].rowSpan,2);assert.equal(m.rows[1][0].covered,true);m.rows[0][0].tex='\\textbf{New group}';m.rows[1][2].tex='3';assert.equal(replaceTable(m),s.replace('Group','New group').replace('& 2','& 3'));m.structural=true;assert.throws(()=>serializeTable(m),/仅允许/);});
test('nested table and aligned math stay inside one editable outer cell',()=>{for(const cell of [String.raw`\begin{tabular}{cc}X & Y \\ Z & W\end{tabular}`,String.raw`$\begin{aligned}x &= y \\ z &= w\end{aligned}$`]){const s='\\begin{tabular}{lc} A & '+cell+' \\\\ \\end{tabular}',m=parseTable(s);assert.equal(findTables(s).length,1);assert.equal(m.rows.length,1);assert.equal(m.rows[0][1].tex,cell);m.rows[0][1].tex=cell.replace('X','New X').replace('x','newx');assert.equal(replaceTable(m),s.replace(cell,m.rows[0][1].tex));}});
test('custom column directives allow content-only edits',()=>{for(const spec of [String.raw`>{\raggedright\arraybackslash}p{2cm}S[table-format=2.1]`,'SQ']){const s='\\begin{tabular}{'+spec+'} A & B \\\\ \\end{tabular}',m=parseTable(s);assert.equal(m.custom,true);m.rows[0][1].tex='C';assert.equal(replaceTable(m),s.replace('& B','& C'));}});
test('combined row/column spans retain placeholders and exact source',()=>{const s=String.raw`\begin{tabular}{ccc}\multicolumn{2}{c}{\multirow{2}{*}{Shared}} & A \\ & & B \\ \end{tabular}`,m=parseTable(s);assert.equal(m.rows[0][0].span,2);assert.equal(m.rows[0][0].rowSpan,2);assert.ok(m.rows[1][0].covered&&m.rows[1][1].covered);m.rows[0][0].tex='Edited';assert.equal(replaceTable(m),s.replace('Shared','Edited'));});
test('conference repeated centered p-columns preserve grouped headers and numerical formatting',()=>{const s=String.raw`\begin{tabular}{l *{3}{>{\centering\arraybackslash}p{1cm}}}\toprule & \multicolumn{3}{c}{Results} \\ \cmidrule(lr){2-4} Method & MAE & RMSE & CRPS \\ \midrule \textbf{Ours} & \textbf{5.81}{\scriptsize$_{\pm0.14}$} & 10.25 & 4.66 \\ \bottomrule\end{tabular}`,m=parseTable(s);assert.deepEqual(m.columnAlignments,['l','c','c','c']);assert.equal(m.rows[0][1].span,3);m.rows[2][1].tex=m.rows[2][1].tex.replace('5.81','5.80');assert.equal(replaceTable(m),s.replace('5.81','5.80'));assert.equal(m.custom,true);});
test('unsafe commands, overlapping spans and mismatched rows are refused',()=>{for(const s of [String.raw`\begin{tabular}{lc}\multirow{2}{*}{A} & B \\ C & D \\ \end{tabular}`,String.raw`\begin{tabular}{lc} A & \input{x} \\ \end{tabular}`,String.raw`\begin{tabular}{lc} A & B & C \\ \end{tabular}`])assert.throws(()=>parseTable(s));});
test('new cells reject unbalanced syntax and unescaped delimiters',()=>{for(const s of ['A & B','bad %comment','{missing','$missing',String.raw`\input{x}`,String.raw`a \\ b`])assert.throws(()=>validateCell(s));validateCell(String.raw`\textbf{A \& B} $x_1$`);});
test('ordinary text escaping preserves special characters without adding columns',()=>{const s=escapeCell('A&B_50% $cost {x}');validateCell(s);assert.equal(s,String.raw`A\&B\_50\% \$cost \{x\}`);});
test('empty tabular preserves its column spec, comments and closing rule when filled',()=>{
 const source=String.raw`\begin{tabular}{lc}
% starter
\toprule
\bottomrule
\end{tabular}`;
 const model=parseTable(source);
 assert.equal(replaceTable(model),source);
 model.rows[0][1].tex='12';
 const updated=replaceTable(model);
 assert.ok(updated.indexOf(' & 12')<updated.indexOf('\\bottomrule'));
 assert.equal(parseTable(updated).rows[0][1].tex,'12');
});
test('Excel TSV preserves quoted delimiters, Excel quotes, CRLF and trailing cells',()=>{
 assert.deepEqual(excelCells('A\t"two\tparts"\t\r\n"x""y\r\nz"\t12\t\r\n'),
  [['A','two\tparts',''],['x"y\r\nz','12','']]);
 assert.throws(()=>excelCells('x\t'.repeat(24)),/24 列/);
 assert.throws(()=>excelCells('x\n'.repeat(201)),/200 行/);
});
test('empty-grid sizing keeps pending data and does not replace custom column definitions',()=>{
 const source=String.raw`\begin{tabular}{>{\centering}p{3cm}c}
% original row comment
\end{tabular}`;
 const initial=parseTable(source);
 assert.throws(()=>configureEmptyGrid(initial, 2, 3),/自定义列/);
 const draft=configureEmptyGrid(initial,2,2,excelCells('R&D\t10%\n\t#2'));
 const filled=replaceTable(draft), parsed=parseTable(filled);
 assert.equal(parsed.spec,initial.spec);
 assert.ok(filled.includes('% original row comment'));
 assert.deepEqual(parsed.rows.map(row=>row.map(cell=>cell.tex)),[
  [String.raw`R\&D`,String.raw`10\%`],['',String.raw`\#2`],
 ]);
 assert.throws(()=>configureEmptyGrid(draft,1,2),/移除已填写/);
 assert.throws(()=>configureEmptyGrid(draft,2,2,[['replacement']]),/已有内容/);
});
test('Excel paste uses logical columns and retains TeX outside the replaced values',()=>{
 const source=String.raw`\begin{tabular}{lccc}
\multicolumn{2}{c}{Group} & \textbf{\underline{Old}} & \textcolor[rgb]{1,0,0}{Clear me} \\
Keep & 21 & 22 & 23 \\
\end{tabular}`;
 const model=parseTable(source);
 const updated=replaceTable(pasteTableCells(model,[0,1],excelCells('R&D\t\r\n10%\t13')));
 assert.equal(updated,source.replace('Old',String.raw`R\&D`).replace('Clear me','')
  .replace('22 & 23',String.raw`10\% & 13`));
 assert.equal(replaceTable(model),source);
 assert.throws(()=>pasteTableCells(model,[0,0],excelCells('x\ty')),/合并单元格/);
 assert.throws(()=>pasteTableCells(model,[1,3],excelCells('x\ty')),/超出表格/);
});
test('Excel paste rejects covered positions in both directions of a cross-row span',()=>{
 for(const span of ['2','-2']){
  const source=String.raw`\begin{tabular}{lc}`+'\n'+(span==='2'?
    String.raw`\multirow{2}{*}{Name} & A \\ & B \\`:
    String.raw` & A \\ \multirow{-2}{*}{Name} & B \\`)+String.raw`\end{tabular}`;
  const model=parseTable(source);
  assert.throws(()=>pasteTableCells(model,[span==='2'?1:0,0],[['Covered']]),/合并单元格/);
  assert.equal(replaceTable(pasteTableCells(model,[span==='2'?0:1,0],[['New']])),source.replace('Name','New'));
 }
});
test('clearing a final one-column cell keeps its row',()=>{
 const model=parseTable(String.raw`\begin{tabular}{l}A \\ B\end{tabular}`);
 const output=replaceTable(pasteTableCells(model,[1,0],[['']]));
 assert.equal(parseTable(output).rows.length,2);
});
console.log(`Table model: ${n}/${n} passed`);
