import {mask} from '../plugins/table-model.js';
export const TEX_SNIPPETS=[
 {id:'figure',label:'图片',text:'\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{$0}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}'},
 {id:'table',label:'表格',text:'\\begin{table}[htbp]\n  \\centering\n  \\caption{}\n  \\label{tab:}\n  \\begin{tabular}{lc}\n    \\hline\n    $0 &  \\\\\n    \\hline\n     &  \\\\\n    \\hline\n  \\end{tabular}\n\\end{table}'},
 {id:'section',label:'标题 · section',text:'\\section{$0}\n\\label{sec:}'},
 {id:'subsection',label:'子标题 · subsection',text:'\\subsection{$0}'},
 {id:'equation',label:'编号公式',text:'\\begin{equation}\n  $0\n  \\label{eq:}\n\\end{equation}'},
 {id:'align',label:'多行公式',text:'\\begin{align}\n  $0 &=  \\\\\n    &= \n\\end{align}'},
 {id:'itemize',label:'分点列表',text:'\\begin{itemize}\n  \\item $0\n  \\item \n\\end{itemize}'}
];
export function texSymbols(text,bib=false){
 const s=mask(text),labels=[...s.matchAll(/\\label\s*\{([^{}\n]+)\}/g)].map(m=>m[1].trim());
 const citations=bib?[...text.matchAll(/^\s*@(?!comment\b|preamble\b|string\b)[a-z]+\s*[{(]\s*([^,\s]+)\s*,/gmi)].map(m=>m[1]):[...s.matchAll(/\\bibitem(?:\[[^\]]*\])?\s*\{([^{}\n]+)\}/g)].map(m=>m[1]);
 return{labels:[...new Set(labels)],citations:[...new Set(citations)]};
}
export function completionTarget(before,pos=before.length){
 const m=/\\(cite[a-zA-Z*]*|(?:eq|page|auto|[cC])?ref|label|includegraphics\*?|begin|end)(?:\s*\[[^\]]*\]){0,2}\s*\{([^{}]*)$/.exec(before.slice(-1600));if(!m)return null;
 const citation=m[1].startsWith('cite'),arg=m[2],offset=citation?arg.lastIndexOf(',')+1:0,tail=arg.slice(offset),space=tail.length-tail.trimStart().length;
 return{kind:m[1].replace(/\*$/,''),from:pos-tail.length+space,prefix:tail.trimStart()};
}

export function plainTex(text){return String(text).replace(/\\(?:label|cite\w*|(?:eq|page|auto|[cC])?ref|includegraphics)(?:\[[^\]]*\])?\{[^}]*\}/g,' ').replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g,' ').replace(/[{}$~]/g,' ').replace(/\\([&%_#])/g,'$1');}
