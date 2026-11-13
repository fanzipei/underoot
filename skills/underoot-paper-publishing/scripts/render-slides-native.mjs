import {renderDiagram} from './vector-diagram.mjs';
const tex=v=>String(v??'').replace(/[\\{}$&#_%~^]/g,c=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','_':'\\_','%':'\\%','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[c]));
const lines=v=>String(v||'').split(/\n/).filter(Boolean).map(tex).join('\\\\{}');
const names=v=>String(v||'').split(/\n/).filter(Boolean).map(tex).join(' \\quad ');
const short=v=>String(v||'').length>42?String(v).slice(0,42).replace(/\s+\S*$/,'')+'…':String(v||'');
function caption(asset,title){const first=String(asset.caption||'').split(/(?<=[。！？])|(?<=[.!?])\s+/)[0];if(first.length<=180)return tex(first);const condition=first.match(/(?:reported as|mean|averaged|均值|标准差)[\s\S]{0,180}(?:[.;]|$)/i)?.[0];return tex(condition&&condition.length<=180?condition:title);}
const points=page=>{const rest=page.bullets.filter(b=>b!==page.takeaway);return rest.length?'\\begin{itemize}\n'+rest.map(b=>'\\item '+tex(b)).join('\n')+'\n\\end{itemize}':'';};
const equations=page=>(page.equations||[]).map(e=>'\\[ '+e.tex+' \\]').join('\n');
function tables(page){return(page.tables||[]).map(t=>{const ids=t.identifierColumns||1;const spec=t.headers.map((_,i)=>i<ids?`>{\\raggedright\\arraybackslash}p{${ids===2?'.28':'.34'}\\linewidth}`:'X').join('');return`\\par\\medskip{\\small\\begin{tabularx}{\\linewidth}{@{}${spec}@{}}\\toprule
${t.headers.map(h=>'\\textbf{'+tex(h)+'}').join(' & ')}\\\\\\midrule
${t.rows.map(row=>row.map(tex).join(' & ')+'\\\\').join('\n')}
\\bottomrule\\end{tabularx}\\par\\smallskip{\\usebeamerfont{caption}${t.selection?'Selected comparison. ':''}${caption(t,page.title)}}}\\par`;}).join('\n');}

/** Use the chosen Beamer theme's native fonts, title page, colors and spacing. */
export function renderNativeSlides(info,options,style,story,identity){
 const frames=story.pages.map(original=>{
  const page={...original};if(page.appendix)page.title='Additional comparisons';
  if(page.takeaway&&page.bullets.some(b=>b.includes(page.takeaway)&&b.length>page.takeaway.length))page.takeaway='';
  const key=page.takeaway?'\\textbf{'+tex(page.takeaway)+'}\\par\\medskip\n':'';
  const prose=key+points(page)+equations(page)+tables(page)+renderDiagram(page.diagram,tex,true);
  const visual=page.figures[0],graphic=visual?`\\centering\\includegraphics[width=\\linewidth,height=${page.figureHeight||.50}\\textheight,keepaspectratio]{${visual.path}}\\par\\smallskip{\\usebeamerfont{caption}${caption(visual,page.title)}}`:'';
  let body=prose;
  if(visual&&(page.evidencePage||!page.bullets.length&&!page.takeaway))body=graphic+(page.takeaway?'\\par\\medskip\\raggedright '+key:'');
  else if(visual)body=`\\begin{columns}[T,onlytextwidth]\\begin{column}{.47\\textwidth}${prose}\\end{column}\\begin{column}{.49\\textwidth}${graphic}\\end{column}\\end{columns}`;
  else if(page.layout==='comparison'&&page.bullets.length>=2){const cut=Math.ceil(page.bullets.length/2);body=key+'\\begin{columns}[T,onlytextwidth]'+[page.bullets.slice(0,cut),page.bullets.slice(cut)].map(b=>'\\begin{column}{.47\\textwidth}'+points({...page,takeaway:'',bullets:b})+'\\end{column}').join('')+'\\end{columns}'+equations(page)+tables(page)+renderDiagram(page.diagram,tex,true);}
  return`% underoot:block:${page.id}:start
\\begin{frame}[t]{${tex(page.title)}}
\\begin{lrbox}{\\underootslidebox}\\begin{minipage}{\\textwidth}
${body}
\\end{minipage}\\end{lrbox}
\\typeout{UNDEROOT:SLIDE:${page.id}:\\the\\dimexpr\\ht\\underootslidebox+\\dp\\underootslidebox\\relax:\\the\\dimexpr\\textheight-3\\baselineskip\\relax}
\\usebox{\\underootslidebox}
\\end{frame}
% underoot:block:${page.id}:end`;
 }).join('\n\n');
 // Custom uploaded styles may explicitly request a palette; built-ins keep the
 // actual theme defaults rather than substituting underoot's old appearance.
 const palette=options.customTemplate?`\\definecolor{underootcustom}{HTML}{${style.accent.slice(1)}}\\setbeamercolor{structure}{fg=underootcustom}`:'';
 return`\\documentclass[aspectratio=${options.ratio},fontset=fandol]{ctexbeamer}
\\usepackage{graphicx,amsmath,amssymb,booktabs,tabularx,tikz}
\\usetikzlibrary{arrows.meta}
\\usetheme{${style.theme||'default'}}
${style.theme==='metropolis'?String.raw`% Metropolis 1.2 uses a paper-height title box inside a shorter frame.
% Fit that box to the actual frame; leave its font/style templates intact.
\makeatletter
\expandafter\patchcmd\csname beamer@@tmpl@title page\endcsname{\paperheight}{\textheight}{}{\PackageError{underoot}{Metropolis title-page compatibility patch failed}{Check the installed theme version.}}
\makeatother`:''}
${palette}
\\AtBeginDocument{\\usebeamercolor{structure}\\colorlet{underootaccent}{fg}}
\\newsavebox{\\underootslidebox}
\\title[{${tex(short(info.title))}}]{${tex(info.title)}}
\\author[{${tex(short(identity.authors||info.author))}}]{${names(identity.authors||info.author)}}
\\institute{${lines(identity.affiliations)}${identity.logos?.length?'\\par\\smallskip '+identity.logos.map(p=>`\\includegraphics[height=.5cm,width=2cm,keepaspectratio]{${p}}\\hspace{.3cm}`).join(''):''}}
\\date{}
\\begin{document}
\\maketitle
${frames}
\\end{document}
`;
}
