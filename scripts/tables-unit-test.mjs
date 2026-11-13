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
test('multirow, nested environments, unknown columns and mismatched rows are refused',()=>{for(const s of [String.raw`\begin{tabular}{lc}\multirow{2}{*}{A} & B \\ C & D \\ \end{tabular}`,String.raw`\begin{tabular}{lc} A & \begin{tabular}{c}X\end{tabular} \\ \end{tabular}`,String.raw`\begin{tabular}{SQ} A & B \\ \end{tabular}`,String.raw`\begin{tabular}{lc} A & B & C \\ \end{tabular}`])assert.throws(()=>parseTable(s));});
test('new cells reject unbalanced syntax and unescaped delimiters',()=>{for(const s of ['A & B','bad %comment','{missing','$missing',String.raw`\input{x}`,String.raw`a \\ b`])assert.throws(()=>validateCell(s));validateCell(String.raw`\textbf{A \& B} $x_1$`);});
test('ordinary text escaping preserves special characters without adding columns',()=>{const s=escapeCell('A&B_50% $cost {x}');validateCell(s);assert.equal(s,String.raw`A\&B\_50\% \$cost \{x\}`);});
console.log(`Table model: ${n}/${n} passed`);
