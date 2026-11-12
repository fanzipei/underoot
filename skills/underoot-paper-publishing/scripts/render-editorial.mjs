const tex=(v)=>String(v??'').replace(/[\\{}$&#_%~^]/g,c=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','_':'\\_','%':'\\%','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[c]));
const items=(page)=>{const rest=page.bullets.filter(b=>b!==page.takeaway);return rest.length?'\\begin{itemize}\n'+rest.map(b=>'\\item '+tex(b)).join('\n')+'\n\\end{itemize}':'';};
const equation=(page)=>page.equations.map(e=>'\\[ '+e.tex+' \\]').join('\n');
const caption=(visual)=>{const full=visual.caption||'';const first=full.split(/(?<=[。！？])|(?<=[.!?])\s+/)[0];return tex(first.length<=220?first||'Source figure · verify caption':'Full figure caption is retained in the source notes.');};
const short=(text,max=42)=>String(text).length>max?String(text).slice(0,max).replace(/\s+\S*$/,'')+'…':String(text);
const tables=(page,kind)=> (page.tables||[]).map(t=>`\\par\\medskip{\\fontsize{${kind==='slides'?12:28}}{${kind==='slides'?15:34}}\\selectfont\\begin{tabularx}{\\linewidth}{@{}${t.headers.map(()=>'X').join('')}@{}}\\toprule\n${t.headers.map(h=>'\\textbf{'+tex(h)+'}').join(' & ')}\\\\\\midrule\n${t.rows.map(row=>row.map(tex).join(' & ')+'\\\\').join('\n')}\n\\bottomrule\\end{tabularx}\\par\\smallskip ${caption(t)}}\\par`).join('\n');
export function renderEditorial(info,options,style){
 const story=info.editorial;const accent=style.accent.slice(1);const bg=(style.background||'#ffffff').slice(1);const fg=(style.foreground||'#1c2933').slice(1);
 const rgb=[1,3,5].map(p=>parseInt(style.accent.slice(p,p+2),16));const bandInk=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>160?'black':'white';
 if(options.kind==='slides'){
  const frames=story.pages.map(page=>{
   const visual=page.figures[0];const key=page.takeaway?`\\textbf{${tex(page.takeaway)}}\\par\\medskip\n`:'';
   const text=key+items(page)+equation(page)+tables(page,'slides');
   const body=visual?`\\begin{columns}[T,onlytextwidth]\n\\begin{column}{.47\\textwidth}\\fontsize{12}{15}\\selectfont\n${text}\n\\end{column}\n\\begin{column}{.49\\textwidth}\\centering\\includegraphics[width=\\linewidth,height=.54\\textheight,keepaspectratio]{${visual.path}}\\par\\smallskip{\\fontsize{9}{11}\\selectfont ${caption(visual)}}\\end{column}\n\\end{columns}`:`\\fontsize{14}{18}\\selectfont\n${text}`;
   return`\\begin{frame}[t]{${tex(page.title)}}\n${body}\n\\end{frame}`;
  }).join('\n\n');
  return`\\documentclass[aspectratio=${options.ratio},fontset=fandol]{ctexbeamer}
\\usepackage{graphicx,amsmath,amssymb,booktabs,tabularx}
\\usetheme{${style.theme||'default'}}
${style.font==='serif'?'\\usefonttheme{serif}':''}
\\definecolor{underootaccent}{HTML}{${accent}}
\\definecolor{templatebg}{HTML}{${bg}}
\\definecolor{templatefg}{HTML}{${fg}}
\\setbeamercolor{background canvas}{bg=templatebg}
\\setbeamercolor{normal text}{fg=templatefg}
\\setbeamercolor{structure}{fg=underootaccent}
\\setbeamercolor{frametitle}{fg=${options.style==='contrast'||style.header==='band'?bandInk:'underootaccent'},bg=${options.style==='contrast'||style.header==='band'?'underootaccent':'templatebg'}}
\\setbeamertemplate{navigation symbols}{}
\\setbeamertemplate{itemize items}[circle]
\\setlength{\\parskip}{.35em}
\\title[${tex(short(info.title))}]{${tex(info.title)}}
\\author[${tex(short(info.author,28))}]{${tex(info.author)}}
\\date{}
\\begin{document}
\\begin{frame}\\titlepage\\end{frame}
${frames}
\\end{document}
`;
 }
 const load=Math.max(0,...(story.rounds[3].metrics.columnWeights||[]));
 const font=story.posterFont||(options.style==='compact'||style.density==='compact'?32:load<(options.orientation==='portrait'?1500:1000)?44:36);
 const block=(page)=>{
  const visual=page.figures[0];
  const graphic=visual?`\\begin{center}\\includegraphics[width=.96\\linewidth,height=${options.orientation==='landscape'?14:19}cm,keepaspectratio]{${visual.path}}\\par\\smallskip{\\fontsize{${Math.max(24,font-8)}}{${Math.max(29,font-3)}}\\selectfont ${caption(visual)}}\\end{center}`:'';
  return`\\noindent\\fcolorbox{posterline}{posterpanel}{\\begin{minipage}{\\dimexpr\\linewidth-2\\fboxsep-2\\fboxrule\\relax}
{\\fontsize{${font+8}}{${font+14}}\\selectfont\\bfseries\\color{posterblue}${tex(page.title)}}\\par\\vspace{.5cm}
${page.takeaway?`\\textbf{${tex(page.takeaway)}}\\par\\medskip`:''}
${style.imagesFirst?graphic:''}
${items(page)}${equation(page)}${tables(page,'poster')}
${style.imagesFirst?'':graphic}
\\end{minipage}}\\par`;
 };
 const columns=story.columns.map(ids=>{
  const pages=ids.map(id=>story.pages.find(p=>p.id===id)).filter(Boolean);
  return`\\begin{minipage}[t]{\\postercolumnwidth}\\vspace{0pt}
${pages.map(block).join('\n\\vspace{1.2cm}\n')}
\\end{minipage}`;
 }).join('%\n\\hfill\n');
 return`\\documentclass[fontset=fandol]{ctexart}
\\usepackage[a0paper,${options.orientation},margin=2.6cm]{geometry}
\\usepackage{multicol,graphicx,xcolor,amsmath,amssymb,booktabs,tabularx}
\\definecolor{posterblue}{HTML}{${accent}}
\\definecolor{posterbackground}{HTML}{${bg}}
\\definecolor{posterforeground}{HTML}{${fg}}
\\colorlet{posterpanel}{posterbackground!96!posterforeground}
\\colorlet{posterline}{posterblue!35!posterbackground}
${style.font==='sans'?'\\renewcommand{\\familydefault}{\\sfdefault}':''}
\\setlength{\\columnsep}{1.6cm}
\\setlength{\\parindent}{0pt}
\\setlength{\\fboxsep}{.7cm}
\\setlength{\\fboxrule}{1pt}
\\pagestyle{empty}
\\newsavebox{\\posterheader}
\\newlength{\\posterbodyheight}
\\newlength{\\postercolumnwidth}
\\newcommand{\\postercolumns}{${options.columns}}
\\begin{document}
\\pagecolor{posterbackground}\\color{posterforeground}
\\begin{lrbox}{\\posterheader}\\begin{minipage}{\\textwidth}\\centering
{\\fontsize{${Math.round(76*(style.titleScale||2.3)/2.3)}}{88}\\selectfont\\bfseries\\color{posterblue}${tex(info.title)}}\\par\\vspace{.8cm}
{\\fontsize{32}{40}\\selectfont ${tex(info.author)}}\\par\\vspace{.7cm}
\\textcolor{posterblue}{\\rule{\\textwidth}{4pt}}\\par\\vspace{.5cm}
\\end{minipage}\\end{lrbox}
\\noindent\\usebox{\\posterheader}\\par
\\setlength{\\posterbodyheight}{\\dimexpr\\textheight-\\ht\\posterheader-\\dp\\posterheader-2cm\\relax}
\\setlength{\\postercolumnwidth}{\\dimexpr(\\textwidth-${options.columns-1}\\columnsep)/${options.columns}\\relax}
\\fontsize{${font}}{${font+9}}\\selectfont
\\noindent
${columns}
\\par
\\end{document}
`;
}
