import{composeSlidePage}from'./slide-composition.mjs';
import {renderDiagram} from './vector-diagram.mjs';
const tex=v=>String(v??'').replace(/[\\{}$&#_%~^]/g,c=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','_':'\\_','%':'\\%','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[c]));
const lines=v=>String(v||'').split(/\n/).filter(Boolean).map(tex).join('\\\\{}');
const names=v=>String(v||'').split(/\n/).filter(Boolean).map(tex).join(' \\quad ');
const short=v=>String(v||'').length>42?String(v).slice(0,42).replace(/\s+\S*$/,'')+'…':String(v||'');
const points=page=>{const rest=page.bullets.filter(b=>b!==page.takeaway);return rest.length?'\\begin{itemize}\n'+rest.map(b=>'\\item '+tex(b)).join('\n')+'\n\\end{itemize}':'';};
const equations=page=>(page.equations||[]).map(e=>'\\[ '+e.tex+' \\]').join('\n');
function tables(page){return(page.tables||[]).map(t=>{const ids=t.identifierColumns||1;const spec=t.headers.map((_,i)=>i<ids?`>{\\raggedright\\arraybackslash}p{${ids===2?(page.role==='gap'?(i===0?'.23':'.43'):'.28'):(t.headers.length>=5?'.28':'.34')}\\linewidth}`:'X').join('');const condition=/mean[\s\S]*?(?:std|standard deviation)/i.test(t.caption||'')?'mean ± std.':'';const note=[t.metricLabel||'',t.selection?'Selected comparisons':'',condition].filter(Boolean).join('; ');return`\\par\\medskip{\\small\\begin{tabularx}{\\linewidth}{@{}${spec}@{}}\\toprule
${t.headers.map(h=>'\\textbf{'+tex(h)+'}').join(' & ')}\\\\\\midrule
${t.rows.map(row=>row.map(tex).join(' & ')+'\\\\').join('\n')}
\\bottomrule\\end{tabularx}${note?'\\par\\smallskip{\\usebeamerfont{caption}'+tex(note)+'}':''}}\\par`;}).join('\n');}
const references=page=>page.references?.length?'\\par\\medskip{\\small '+page.references.map(r=>tex(r.slideText||r.text)+'\\par\\smallskip\n').join('')+'}':'';
function picture(page,graphic,notes){const scale=page.figureHeight?Math.max(.45,Math.min(1,page.figureHeight/.50)):1;return String.raw`\sbox{\underootnaturalgraphic}{\includegraphics{`+graphic.path+String.raw`}}
\setlength{\underootimagewidth}{.56\textwidth}\setlength{\underoottextwidth}{.40\textwidth}
\sbox{\underootnotebox}{\begin{minipage}{\underoottextwidth}\raggedright `+notes+String.raw`\end{minipage}}
\ifdim\dimexpr\ht\underootnotebox+\dp\underootnotebox\relax>.50\underootavailable
\setlength{\underootimagewidth}{.52\textwidth}\setlength{\underoottextwidth}{.44\textwidth}
\sbox{\underootnotebox}{\begin{minipage}{\underoottextwidth}\raggedright `+notes+String.raw`\end{minipage}}\fi
\long\def\underootportrait{
  \begin{columns}[c,onlytextwidth]
  \begin{column}{\underootimagewidth}\centering
  \includegraphics[width=\linewidth,height=${(.88*scale).toFixed(3)}\underootavailable,keepaspectratio]{`+graphic.path+String.raw`}
  \end{column}
  \begin{column}{\underoottextwidth}\usebox{\underootnotebox}\end{column}
  \end{columns}}
\long\def\underootwide{
  \sbox{\underootnotebox}{\begin{minipage}{.93\linewidth}\raggedright `+notes+String.raw`\end{minipage}}
  \setlength{\underootgraphicheight}{\dimexpr\underootavailable-\ht\underootnotebox-\dp\underootnotebox-10pt\relax}
  \ifdim\underootgraphicheight>${(.96*scale).toFixed(3)}\underootavailable\setlength{\underootgraphicheight}{${(.96*scale).toFixed(3)}\underootavailable}\fi
  \ifdim\underootgraphicheight<.45\underootavailable\setlength{\underootgraphicheight}{.45\underootavailable}\fi
  {\centering\includegraphics[width=\linewidth,height=\underootgraphicheight,keepaspectratio]{`+graphic.path+String.raw`}\par}
  \begin{tikzpicture}[remember picture,overlay]\node[anchor=south west,inner sep=0pt] at ([xshift=.06\paperwidth,yshift=9pt]current page.south west) {\usebox{\underootnotebox}};\end{tikzpicture}}
\ifdim\dimexpr\ht\underootnotebox+\dp\underootnotebox\relax>.82\underootavailable
\setlength{\underootimagewidth}{.48\textwidth}\setlength{\underoottextwidth}{.48\textwidth}
\sbox{\underootnotebox}{\begin{minipage}{\underoottextwidth}\raggedright `+notes+String.raw`\end{minipage}}\fi
\let\underootdrawing\underootwide\def\underootmode{stacked}
\ifdim\wd\underootnaturalgraphic<1.8\ht\underootnaturalgraphic\ifdim\dimexpr\ht\underootnotebox+\dp\underootnotebox\relax<.95\underootavailable\let\underootdrawing\underootportrait\def\underootmode{side}\fi\fi
\typeout{UNDEROOT:COMPOSITION:`+page.id+String.raw`:\underootmode:\the\underoottextwidth:\the\textwidth}
\underootdrawing`;}

/** Use the chosen Beamer theme's native fonts, title page, colors and spacing. */
export function renderNativeSlides(info,options,style,story,identity){
 const coverFirst=(info.title||'').split(/[:：]/)[0],cover=coverFirst.length<=38?coverFirst:(info.title||'').split(/\s+/).slice(0,5).join(' ');
 const coverTitle=cover.length<=42?cover:'Research talk';
 const frames=story.pages.map(original=>{
  const page=composeSlidePage(original);
  if(page.takeaway&&page.bullets.some(b=>b.includes(page.takeaway)&&b.length>page.takeaway.length))page.takeaway='';
  const key=page.takeaway?'\\textbf{'+tex(page.takeaway)+'}\\par\\medskip\n':'';
  const lead=page.lead?'\\noindent '+tex(page.lead)+'\\par\\smallskip':'';
  const prose=lead+key+points(page)+equations(page)+tables(page)+renderDiagram(page.diagram,tex,true)+references(page);
  const visual=page.figures[0];
  let body=prose;
  if(visual){const notes=page.findingPoints?.length?(page.findingIntro?tex(page.findingIntro)+'\\par\\smallskip':'')+'\\begin{itemize}'+page.findingPoints.map(p=>'\\item '+tex(p)).join('\n')+'\\end{itemize}':lead+(page.takeaway?tex(page.takeaway)+'\\par\\smallskip':'')+points(page);body=picture(page,visual,notes+references(page));}
  else if(page.layout==='comparison'&&page.bullets.length>=2){const cut=Math.ceil(page.bullets.length/2);body=key+'\\begin{columns}[c,onlytextwidth]'+[page.bullets.slice(0,cut),page.bullets.slice(cut)].map(b=>'\\begin{column}{.47\\textwidth}'+points({...page,takeaway:'',bullets:b})+'\\end{column}').join('')+'\\end{columns}'+equations(page)+tables(page)+renderDiagram(page.diagram,tex,true);}
  return`% underoot:block:${page.id}:start
\\def\\underootframetitle{${tex(page.title)}}
\\sbox{\\underootframetitlebox}{\\usebeamerfont{frametitle}\\underootframetitle}
\\ifdim\\wd\\underootframetitlebox>.92\\textwidth\\def\\underootframetitle{${tex(({question:'Research question',gap:'Related work',method:'Method',result:'Results',limitation:'Limitations',conclusion:'Take-home message'})[page.role]||'Research evidence')}}\\sbox{\\underootframetitlebox}{\\usebeamerfont{frametitle}\\underootframetitle}\\fi
\\typeout{UNDEROOT:TITLE:${page.id}:\\the\\wd\\underootframetitlebox:\\the\\textwidth}
\\begin{frame}[${visual?'t':'c'}]{\\underootframetitle}
\\setlength{\\underootavailable}{${visual?'\\dimexpr\\textheight-1.2\\baselineskip\\relax':'\\dimexpr\\textheight-2\\baselineskip\\relax'}}
\\begin{lrbox}{\\underootslidebox}\\begin{minipage}{\\textwidth}
${body}
\\end{minipage}\\end{lrbox}
\\typeout{UNDEROOT:SLIDE:${page.id}:\\the\\dimexpr\\ht\\underootslidebox+\\dp\\underootslidebox\\relax:\\the\\underootavailable}
${visual?'':'\\vspace*{3pt}'}\\usebox{\\underootslidebox}
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
\\newsavebox{\\underootframetitlebox}
\\newsavebox{\\underootnaturalgraphic}
\\newsavebox{\\underootnotebox}
\\newlength{\\underootavailable}
\\newlength{\\underootgraphicheight}
\\newlength{\\underootimagewidth}
\\newlength{\\underoottextwidth}
\\def\\underootcovertitle{${tex(coverTitle)}}
\\sbox{\\underootframetitlebox}{\\usebeamerfont{title}\\underootcovertitle}
\\ifdim\\wd\\underootframetitlebox>.92\\textwidth\\def\\underootcovertitle{Research talk}\\fi
\\title[{${tex(short(info.title))}}]{\\underootcovertitle}
${coverTitle!==info.title?'\\subtitle{'+tex(info.title)+'}':''}
\\author[{${tex(short(identity.authors||info.author))}}]{${names(identity.authors||info.author)}}
\\institute{${lines(identity.affiliations)}${identity.logos?.length?'\\par\\smallskip '+identity.logos.map(p=>`\\includegraphics[height=.5cm,width=2cm,keepaspectratio]{${p}}\\hspace{.3cm}`).join(''):''}}
\\date{}
\\begin{document}
\\maketitle
${frames}
\\end{document}
`;
}
