import {renderEditorial}from'./render-editorial.mjs';
export const publishingStyles = {
 slides: [
  {id:'metropolis',name:'Metropolis 原生',description:'成熟的现代 Beamer 主题，保留原生字体、配色、标题页与间距',accent:'#23373b',theme:'metropolis'},
  { id: 'academic', name: '学术报告', description: 'Madrid 导航与蓝色标题，适合会议与组会', accent: '#234e78', theme: 'Madrid' },
  { id: 'minimal', name: '极简研究', description: '留白、绿色标题，适合方法讲解与答辩', accent: '#176653', theme: 'default' },
  { id: 'contrast', name: '重点聚焦', description: '深紫标题与高对比结构，突出发现与结论', accent: '#583477', theme: 'CambridgeUS' },
  { id:'sidebar',name:'导航答辩',description:'Berkeley 侧栏导航，适合长篇答辩',accent:'#37536b',theme:'Berkeley' },
  { id:'conference',name:'会议讲演',description:'Copenhagen 顶部结构导航，适合学术会议',accent:'#295f91',theme:'Copenhagen' },
  { id:'clean',name:'清爽组会',description:'Boadilla 简洁页脚，适合日常研究汇报',accent:'#337b78',theme:'Boadilla' },
  { id:'classic-talk',name:'经典讲义',description:'Warsaw 层次分明，适合课程与方法介绍',accent:'#7a4545',theme:'Warsaw' },
  { id:'large-title',name:'大标题叙事',description:'Pittsburgh 简洁大标题，适合短报告',accent:'#51456e',theme:'Pittsburgh' }
 ],
 poster: [
  { id: 'classic', name: '经典学术', description: '蓝色章节与三栏信息流，适合会议展板', accent: '#234e78' },
  { id: 'modern', name: '清晰现代', description: '青绿标题、浅色分隔，适合图文研究展示', accent: '#176653' },
  { id: 'compact', name: '紧凑数据', description: '酒红标题、更紧凑的字号，适合内容较多的论文', accent: '#84334c' },
  { id:'bold',name:'醒目展板',description:'实色横幅标题与章节分隔，适合展会',accent:'#8b5031',header:'band' },
  { id:'gallery',name:'图像优先',description:'插图置于正文前，适合视觉研究与实验展示',accent:'#5c527f',imagesFirst:true },
  { id:'editorial',name:'论文式海报',description:'衬线正文、细分隔线，适合理论研究',accent:'#334655',font:'serif',header:'rule' },
  { id:'dark',name:'深色展示',description:'深色背景与浅色文字，适合电子屏展示',accent:'#63d4c0',background:'#142c38',foreground:'#f0f5f7',header:'band' },
  { id:'blueprint',name:'技术蓝图',description:'浅蓝背景与技术感标题，适合工程方法',accent:'#185d88',background:'#edf5fa',header:'rule',font:'sans' }
 ]
};
export function publishingOptions(body = {},customStyles=[]) {
 const kind = body.kind;
 if (!Object.hasOwn(publishingStyles, kind)) throw Object.assign(new Error('请选择 slides 或 poster'), { status: 400 });
 const style = body.style || publishingStyles[kind][0].id;
 const custom=customStyles.find((s)=>s.id===style&&s.kind===kind);
 if (!publishingStyles[kind].some((s) => s.id === style)&&!custom) throw Object.assign(new Error('未知的生成风格'), { status: 400 });
 const ratio = body.ratio || '169'; const orientation = body.orientation || 'portrait'; const columns = body.columns ?? 3;
 const count = body.count ?? (kind === 'slides' ? 18 : 9);
 if (!['169','43'].includes(ratio) || !['portrait','landscape'].includes(orientation) || ![2,3].includes(columns)
  || !Number.isInteger(count) || count < (kind === 'slides' ? 6 : 4) || count > (kind === 'slides' ? 36 : 12)) throw Object.assign(new Error('版式或篇幅设置无效'), { status: 400 });
 return { kind, style, ratio, orientation, columns, count,...(custom?{customTemplate:custom}:{}) };
}
const tex = (v) => String(v).replace(/[\\{}$&#_%~^]/g, (c) => ({ '\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','_':'\\_','%':'\\%','~':'\\textasciitilde{}','^':'\\textasciicircum{}' }[c]));
export function renderPublication(info, options) {
 const style = options.customTemplate||publishingStyles[options.kind].find((s) => s.id === options.style);
 if(info.editorial)return renderEditorial(info,options,style);
 const color = style.accent.slice(1).toUpperCase();
 const rgb=[1,3,5].map((p)=>parseInt(style.accent.slice(p,p+2),16));const bandInk=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>160?'black':'white';
 if (options.kind === 'slides') {
  const frames = info.sections.map((s) => `\\begin{frame}[allowframebreaks]{${tex(s.title)}}\n\\small ${tex(s.text)}\n\\end{frame}`).join('\n\n');
  const figures = info.figures.map((rel,i) => `\\begin{frame}{论文插图 ${i+1}}\\centering\\includegraphics[width=.9\\textwidth,height=.68\\textheight,keepaspectratio]{${rel}}\\end{frame}`).join('\n');
   return `\\documentclass[aspectratio=${options.ratio},fontset=fandol]{ctexbeamer}\n\\usepackage{graphicx}\n\\usetheme{${style.theme||'default'}}\n${style.font==='serif'?'\\usefonttheme{serif}\n':''}\\definecolor{underootaccent}{HTML}{${color}}\n\\definecolor{templatebg}{HTML}{${(style.background||'#ffffff').slice(1)}}\n\\definecolor{templatefg}{HTML}{${(style.foreground||'#1c2933').slice(1)}}\n\\setbeamercolor{background canvas}{bg=templatebg}\n\\setbeamercolor{normal text}{fg=templatefg}\n\\setbeamercolor{structure}{fg=underootaccent}\n\\setbeamercolor{frametitle}{fg=${options.style==='contrast'||style.header==='band'?bandInk:'underootaccent'},bg=${options.style==='contrast'||style.header==='band'?'underootaccent':'templatebg'}}\n\\setbeamertemplate{navigation symbols}{}\n\\title{${tex(info.title)}}\n\\author{${tex(info.author)}}\n\\date{\\today}\n\\begin{document}\n\\begin{frame}\\titlepage\\end{frame}\n${frames}\n${figures}\n\\end{document}\n`;
 }
 const size = options.style === 'compact'||style.density==='compact' ? 22 : 26;
 const sectionSize = options.style === 'compact' ? 30 : 34;
 const sections = info.sections.map((s) => `\\par\\vspace{.5cm}{\\fontsize{${sectionSize}}{${sectionSize+6}}\\selectfont\\bfseries\\color{posterblue} ${tex(s.title)}}\\par\\smallskip\n${tex(s.text)}\\par\n`).join('\n');
 const figures = info.figures.slice(0,2).map((rel) => `\\begin{center}\\includegraphics[width=.95\\linewidth,height=${options.orientation==='landscape'?12:18}cm,keepaspectratio]{${rel}}\\end{center}`).join('\n');
 const background=style.background||'#ffffff';const foreground=style.foreground||'#1c2933';
 const titleSize=Math.round(size*(style.titleScale||2.3));
 const headerText=`{\\fontsize{${titleSize}}{${titleSize+12}}\\selectfont\\bfseries ${tex(info.title)}}\\par\\vspace{1cm}{\\Huge ${tex(info.author)}}`;
 const header=style.header==='band'?`\\colorbox{posterblue}{\\parbox{.96\\textwidth}{\\centering\\color{${bandInk}}\\vspace{.5cm}${headerText}\\vspace{.5cm}}}`:`\\color{posterblue}${headerText}`;
 return `\\documentclass[fontset=fandol]{ctexart}\n\\usepackage[a0paper,${options.orientation},margin=3cm]{geometry}\n\\usepackage{multicol,graphicx,xcolor}\n\\definecolor{posterblue}{HTML}{${color}}\n\\definecolor{posterbackground}{HTML}{${background.slice(1)}}\n\\definecolor{posterforeground}{HTML}{${foreground.slice(1)}}\n${style.font==='sans'?'\\renewcommand{\\familydefault}{\\sfdefault}\n':''}\\setlength{\\columnsep}{2cm}\n\\setlength{\\parindent}{0pt}\n\\pagestyle{empty}\n\\begin{document}\n\\pagecolor{posterbackground}\\color{posterforeground}\n\\begin{center}${header}\\end{center}\n${options.style==='modern'||style.header==='rule'?'\\noindent\\textcolor{posterblue}{\\rule{\\textwidth}{3pt}}\n':''}\\vspace{1cm}\\fontsize{${size}}{${size+9}}\\selectfont\n\\begin{multicols}{${options.columns}}\n${style.imagesFirst?figures+'\n'+sections:sections+'\n'+figures}\n\\end{multicols}\n\\end{document}\n`;
}
