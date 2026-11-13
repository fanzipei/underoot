/** Frozen v0.9 renderer for safe existing-document baseline comparisons. */
const tex=(v)=>String(v??'').replace(/[\\{}$&#_%~^]/g,c=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','_':'\\_','%':'\\%','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[c]));
const lines=v=>String(v||'').split(/\n/).filter(Boolean).map(tex).join('\\\\{}');
const names=v=>String(v||'').split(/\n/).filter(Boolean).map(tex).join(' \\quad ');
function identityHeader(identity,author){
 const logos=identity.logos||[],code=identity.qrPath||identity.reserveCode;
 const marks=logos.length?`\\begin{minipage}[c]{.18\\linewidth}\\centering ${logos.map((p,i)=>`\\includegraphics[width=${logos.length>2?'.44':'.9'}\\linewidth,height=2.6cm,keepaspectratio]{${p}}${i%2||logos.length<=2?'\\par\\smallskip':'\\hfill'}`).join('')}\\end{minipage}\\hfill`:'';
 const authorFont=(identity.authors||author||'').length>400?36:44,affiliationFont=(identity.affiliations||'').length>500?28:34;
 const side=logos.length||code;
 const details=`\\begin{minipage}[c]{${side?'.60':'.99'}\\linewidth}\\centering {\\fontsize{${authorFont}}{${authorFont+8}}\\selectfont ${names(identity.authors||author)}}\\par\\vspace{.35cm} ${identity.affiliations?`{\\fontsize{${affiliationFont}}{${affiliationFont+8}}\\selectfont ${lines(identity.affiliations)}}\\par\\smallskip`:''}${identity.contact?`{\\fontsize{24}{30}\\selectfont ${tex(identity.contact)}}\\par`:''}\\end{minipage}`;
 const left=side?(marks||'\\begin{minipage}[c]{.18\\linewidth}\\mbox{}\\end{minipage}\\hfill'):'';
 const qr=side?`\\hfill\\begin{minipage}[c]{.18\\linewidth}\\centering ${identity.qrPath?`\\includegraphics[width=6cm,height=6cm,keepaspectratio]{${identity.qrPath}}`:code?'\\fbox{\\parbox[c][5cm][c]{5cm}{\\centering\\fontsize{22}{28}\\selectfont Project link\\par QR reserved}}':'\\mbox{}'}\\par{\\fontsize{20}{25}\\selectfont ${identity.projectUrl?'Code / Project':''}}\\end{minipage}`:'';
 return left+details+qr+'\\par\\vspace{.65cm}';
}
const items=(page)=>{const rest=page.bullets.filter(b=>b!==page.takeaway);return rest.length?'\\begin{itemize}'+(page.posterShare?'\\setlength{\\itemsep}{.25em plus .25fill}':'')+'\n'+rest.map(b=>'\\item '+tex(b)).join('\n')+'\n\\end{itemize}':'';};
const equation=(page)=>page.equations.map(e=>'\\[ '+e.tex+' \\]').join('\n');
const caption=(visual)=>{const full=visual.caption||'';const first=full.split(/(?<=[。！？])|(?<=[.!?])\s+/)[0];return tex(first.length<=220?first||'Source figure · verify caption':'Full figure caption is retained in the source notes.');};
const short=(text,max=42)=>String(text).length>max?String(text).slice(0,max).replace(/\s+\S*$/,'')+'…':String(text);
const tables=(page,kind,bodyFont=28)=> (page.tables||[]).map(t=>`\\par\\medskip{\\fontsize{${kind==='slides'?Math.min(20,page.slideFont||12):Math.min(48,bodyFont)}}{${kind==='slides'?Math.min(20,page.slideFont||12)+3:Math.min(48,bodyFont)+6}}\\selectfont\\begin{tabularx}{\\linewidth}{@{}${t.headers.map(()=>'X').join('')}@{}}\\toprule\n${t.headers.map(h=>'\\textbf{'+tex(h)+'}').join(' & ')}\\\\\\midrule\n${t.rows.map(row=>row.map(tex).join(' & ')+'\\\\').join('\n')}\n\\bottomrule\\end{tabularx}\\par\\smallskip ${caption(t)}}\\par`).join('\n');
export function posterFontFor(story,options,style){
 const load=Math.max(0,...(story.rounds[3].metrics.columnWeights||[]));
 return story.posterFont||(options.style==='compact'||style.density==='compact'?32:load<(options.orientation==='portrait'?1500:1000)?44:36);
}
export function renderEditorial(info,options,style){
 const story=info.editorial;const identity=story.identity||info.identity||{authors:info.author,affiliations:'',contact:'',logos:[]};const accent=style.accent.slice(1);const bg=(style.background||'#ffffff').slice(1);const fg=(style.foreground||'#1c2933').slice(1);
 const rgb=[1,3,5].map(p=>parseInt(style.accent.slice(p,p+2),16));const bandInk=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>160?'black':'white';
 if(options.kind==='slides'){
  const frames=story.pages.map(page=>{
   const visual=page.figures[0];const key=page.takeaway?`\\textbf{${tex(page.takeaway)}}\\par\\medskip\n`:'';
   const text=key+items(page)+equation(page)+tables(page,'slides');
   const font=page.slideFont||(page.figures.length?12:page.layout==='statement'?22:14);
   const layout=page.layout||(visual?'visual':'split');
   const graphic=visual?`\\centering\\includegraphics[width=\\linewidth,height=${page.figureHeight||.42}\\textheight,keepaspectratio]{${visual.path}}\\par\\smallskip{\\fontsize{9}{11}\\selectfont ${caption(visual)}}`:'';
   let body;
   if(visual&&layout==='visual'&&style.theme!=='Berkeley')body=`{\\fontsize{${Math.min(font,18)}}{${Math.min(font,18)+3}}\\selectfont ${key}}\\begin{columns}[T,onlytextwidth]\\begin{column}{.60\\textwidth}${graphic}\\end{column}\\begin{column}{.36\\textwidth}\\fontsize{${font}}{${font+3}}\\selectfont ${items(page)}${equation(page)}${tables(page,'slides')}\\end{column}\\end{columns}`;
   else if(visual)body=`\\begin{columns}[T,onlytextwidth]\\begin{column}{.47\\textwidth}\\fontsize{${font}}{${font+3}}\\selectfont ${text}\\end{column}\\begin{column}{.49\\textwidth}${graphic}\\end{column}\\end{columns}`;
   else if(layout==='comparison'&&page.bullets.length>=2){const cut=Math.ceil(page.bullets.length/2);body=key+`\\begin{columns}[T,onlytextwidth]${[page.bullets.slice(0,cut),page.bullets.slice(cut)].map(b=>`\\begin{column}{.47\\textwidth}\\fontsize{${Math.min(font,24)}}{${Math.min(font,24)+4}}\\selectfont ${items({...page,takeaway:'',bullets:b})}\\end{column}`).join('')}\\end{columns}`+equation(page)+tables(page,'slides');}
   else if(layout==='statement')body=`\\vspace{.07\\textheight}{\\fontsize{${font}}{${font+6}}\\selectfont\\color{underootaccent}${tex(page.takeaway)}}\\par\\bigskip{\\fontsize{${Math.min(font,24)}}{${Math.min(font,24)+4}}\\selectfont ${items(page)}}${equation(page)}${tables(page,'slides')}`;
   else body=`\\fontsize{${Math.min(font,24)}}{${Math.min(font,24)+4}}\\selectfont\n${text}`;
   return`% underoot:block:${page.id}:start\n\\begin{frame}[${page.centered?'c':'t'}]{${tex(page.title)}}\n\\begin{lrbox}{\\underootslidebox}\\begin{minipage}{\\textwidth}\n${body}\n\\end{minipage}\\end{lrbox}\n\\typeout{UNDEROOT:SLIDE:${page.id}:\\the\\dimexpr\\ht\\underootslidebox+\\dp\\underootslidebox\\relax:\\the\\dimexpr\\textheight-3\\baselineskip\\relax}\n\\usebox{\\underootslidebox}\n\\end{frame}\n% underoot:block:${page.id}:end`;
  }).join('\n\n');
  return`\\documentclass[aspectratio=${options.ratio},fontset=fandol]{ctexbeamer}
\\usepackage{graphicx,amsmath,amssymb,booktabs,tabularx}\n\\newsavebox{\\underootslidebox}
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
\\title[{${tex(short(info.title))}}]{${tex(info.title)}}
\\author[{${tex(short(identity.authors||info.author,28))}}]{${names(identity.authors||info.author)}}\n\\institute{${lines(identity.affiliations||'')}}\n\\titlegraphic{${(identity.logos||[]).map(p=>`\\includegraphics[height=.7cm,width=2cm,keepaspectratio]{${p}}\\hspace{.3cm}`).join('')}${identity.qrPath?`\\includegraphics[height=1cm]{${identity.qrPath}}`:''}}
\\date{}
\\begin{document}
\\begin{frame}\\titlepage\\end{frame}
${frames}
\\end{document}
`;
 }
 const font=posterFontFor(story,options,style);const columnsCount=story.posterColumns||options.columns;
 const block=(page)=>{
  const visual=page.figures[0];
  const graphic=visual?`\\begin{center}\\includegraphics[width=.96\\linewidth,height=${story.posterFigureHeight||(options.orientation==='landscape'?14:19)}cm,keepaspectratio]{${visual.path}}\\par\\smallskip{\\fontsize{${Math.max(24,font-8)}}{${Math.max(29,font-3)}}\\selectfont ${caption(visual)}}\\end{center}`:'';
  const emphasis=page.role==='result'||page.role==='conclusion';
  const stretch=page.posterShare?'\\vspace{.35cm plus 1fill}':'\\par\\medskip';
  const boxHeight=page.posterShare?`[t][\\dimexpr ${page.posterShare.toFixed(7)}\\posterbodyheight-${(page.posterShare*(page.posterGaps||0)*1.2).toFixed(7)}cm-2\\fboxsep-2\\fboxrule-${(page.posterBoxCorrection||0).toFixed(5)}pt\\relax][s]`:'';
  const points=page.layout==='comparison'&&page.bullets.length>=2?`\\begin{minipage}[t]{.47\\linewidth}${items({...page,takeaway:'',bullets:page.bullets.slice(0,Math.ceil(page.bullets.length/2))})}\\end{minipage}\\hfill\\begin{minipage}[t]{.47\\linewidth}${items({...page,takeaway:'',bullets:page.bullets.slice(Math.ceil(page.bullets.length/2))})}\\end{minipage}`:items(page);
  return`% underoot:block:${page.id}:start\n\\begin{lrbox}{\\underootblockbox}\\fcolorbox{posterline}{posterpanel}{\\begin{minipage}${boxHeight}{\\dimexpr\\linewidth-2\\fboxsep-2\\fboxrule\\relax}\\raggedright
{\\fontsize{${font+7}}{${font+15}}\\selectfont\\sffamily\\bfseries\\color{posterblue}${tex(page.title)}}\\par\\vspace{.2cm}\\textcolor{${emphasis?'posterblue':'posterline'}}{\\rule{\\linewidth}{${emphasis?1.6:.7}pt}}\\par\\vspace{.4cm}
${page.takeaway?`{${page.layout==='statement'?`\\fontsize{${font+5}}{${font+12}}\\selectfont\\color{posterblue}`:''}\\textbf{${tex(page.takeaway)}}}${stretch}`:''}
${style.imagesFirst||page.layout==='visual'?graphic+(graphic?stretch:''):''}
${points}${equation(page)}${tables(page,'poster',font)}
${style.imagesFirst||page.layout==='visual'?'':(graphic?stretch+graphic:'')}
\\end{minipage}}\\end{lrbox}\n\\typeout{UNDEROOT:BLOCK:${page.id}:\\the\\dimexpr\\ht\\underootblockbox+\\dp\\underootblockbox\\relax}\n\\noindent\\usebox{\\underootblockbox}\\par\n% underoot:block:${page.id}:end`;
 };
 const footer=story.posterFooter?story.pages.find(p=>p.id===story.posterFooter):null;
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
\\colorlet{posterpanel}{posterbackground!98!posterforeground}
\\colorlet{posterline}{posterblue!23!posterbackground}
${style.font!=='serif'?'\\renewcommand{\\familydefault}{\\sfdefault}':''}
\\setlength{\\columnsep}{1.6cm}
\\setlength{\\parindent}{0pt}
\\setlength{\\fboxsep}{1cm}
\\setlength{\\fboxrule}{.7pt}
\\pagestyle{empty}
\\newsavebox{\\posterheader}\n\\newsavebox{\\underootblockbox}
\\newsavebox{\\underootfooterbox}
\\newlength{\\posterbodyheight}
\\newlength{\\postercolumnwidth}
\\newcommand{\\postercolumns}{${columnsCount}}
\\begin{document}
\\pagecolor{posterbackground}\\color{posterforeground}
\\begin{lrbox}{\\posterheader}\\begin{minipage}{\\textwidth}\\centering
{\\fontsize{${Math.round(76*(style.titleScale||2.3)/2.3)}}{88}\\selectfont\\bfseries\\color{posterblue}${tex(info.title)}}\\par\\vspace{.8cm}
${identityHeader(identity,info.author)}
\\textcolor{posterblue}{\\rule{\\textwidth}{4pt}}\\par\\vspace{.5cm}
\\end{minipage}\\end{lrbox}
\\noindent\\usebox{\\posterheader}\\par
\\setlength{\\postercolumnwidth}{\\dimexpr(\\textwidth-${columnsCount-1}\\columnsep)/${columnsCount}\\relax}
\\fontsize{${font}}{${font+11}}\\selectfont
\\setlength{\\leftmargini}{1.05em}\\setlength{\\labelsep}{.35em}
\\renewcommand{\\labelitemi}{\\raisebox{.15ex}{\\textcolor{posterblue}{\\rule{.13em}{.13em}}}}
${footer?`\\begin{lrbox}{\\underootfooterbox}\\begin{minipage}{\\textwidth}${block(footer)}
\\end{minipage}\\end{lrbox}`:''}
\\setlength{\\posterbodyheight}{\\dimexpr\\textheight-\\ht\\posterheader-\\dp\\posterheader-2cm${footer?'-\\ht\\underootfooterbox-\\dp\\underootfooterbox-2cm':''}\\relax}
\\typeout{UNDEROOT:BODY:\\the\\posterbodyheight}
\\noindent
${footer?'\\begin{minipage}[t][\\posterbodyheight][t]{\\textwidth}':''}
${columns}
${footer?'\\end{minipage}\\par\\vspace{1.2cm}\\noindent\\usebox{\\underootfooterbox}':''}
\\par
\\end{document}
`;
}
