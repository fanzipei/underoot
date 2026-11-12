export const publishingStyles = {
 slides: [
  { id: 'academic', name: '学术报告', description: 'Madrid 导航与蓝色标题，适合会议与组会', accent: '#234e78', theme: 'Madrid' },
  { id: 'minimal', name: '极简研究', description: '留白、绿色标题，适合方法讲解与答辩', accent: '#176653', theme: 'default' },
  { id: 'contrast', name: '重点聚焦', description: '深紫标题与高对比结构，突出发现与结论', accent: '#583477', theme: 'CambridgeUS' }
 ],
 poster: [
  { id: 'classic', name: '经典学术', description: '蓝色章节与三栏信息流，适合会议展板', accent: '#234e78' },
  { id: 'modern', name: '清晰现代', description: '青绿标题、浅色分隔，适合图文研究展示', accent: '#176653' },
  { id: 'compact', name: '紧凑数据', description: '酒红标题、更紧凑的字号，适合内容较多的论文', accent: '#84334c' }
 ]
};
export function publishingOptions(body = {}) {
 const kind = body.kind;
 if (!Object.hasOwn(publishingStyles, kind)) throw Object.assign(new Error('请选择 slides 或 poster'), { status: 400 });
 const style = body.style || publishingStyles[kind][0].id;
 if (!publishingStyles[kind].some((s) => s.id === style)) throw Object.assign(new Error('未知的生成风格'), { status: 400 });
 const ratio = body.ratio || '169'; const orientation = body.orientation || 'portrait'; const columns = body.columns ?? 3;
 const count = body.count ?? (kind === 'slides' ? 18 : 9);
 if (!['169','43'].includes(ratio) || !['portrait','landscape'].includes(orientation) || ![2,3].includes(columns)
  || !Number.isInteger(count) || count < (kind === 'slides' ? 6 : 4) || count > (kind === 'slides' ? 36 : 12)) throw Object.assign(new Error('版式或篇幅设置无效'), { status: 400 });
 return { kind, style, ratio, orientation, columns, count };
}
const tex = (v) => String(v).replace(/[\\{}$&#_%~^]/g, (c) => ({ '\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','_':'\\_','%':'\\%','~':'\\textasciitilde{}','^':'\\textasciicircum{}' }[c]));
export function renderPublication(info, options) {
 const style = publishingStyles[options.kind].find((s) => s.id === options.style);
 const color = style.accent.slice(1).toUpperCase();
 if (options.kind === 'slides') {
  const frames = info.sections.map((s) => `\\begin{frame}[allowframebreaks]{${tex(s.title)}}\n\\small ${tex(s.text)}\n\\end{frame}`).join('\n\n');
  const figures = info.figures.map((rel,i) => `\\begin{frame}{论文插图 ${i+1}}\\centering\\includegraphics[width=.9\\textwidth,height=.68\\textheight,keepaspectratio]{${rel}}\\end{frame}`).join('\n');
  return `\\documentclass[aspectratio=${options.ratio},fontset=fandol]{ctexbeamer}\n\\usepackage{graphicx}\n\\usetheme{${style.theme}}\n\\definecolor{underootaccent}{HTML}{${color}}\n\\setbeamercolor{structure}{fg=underootaccent}\n\\setbeamercolor{frametitle}{fg=${options.style==='contrast'?'white':'underootaccent'},bg=${options.style==='contrast'?'underootaccent':'white'}}\n\\setbeamertemplate{navigation symbols}{}\n\\title{${tex(info.title)}}\n\\author{${tex(info.author)}}\n\\date{\\today}\n\\begin{document}\n\\begin{frame}\\titlepage\\end{frame}\n${frames}\n${figures}\n\\end{document}\n`;
 }
 const size = options.style === 'compact' ? 22 : 26;
 const sectionSize = options.style === 'compact' ? 30 : 34;
 const sections = info.sections.map((s) => `\\par\\vspace{.5cm}{\\fontsize{${sectionSize}}{${sectionSize+6}}\\selectfont\\bfseries\\color{posterblue} ${tex(s.title)}}\\par\\smallskip\n${tex(s.text)}\\par\n`).join('\n');
 const figures = info.figures.slice(0,2).map((rel) => `\\begin{center}\\includegraphics[width=.95\\linewidth,height=${options.orientation==='landscape'?12:18}cm,keepaspectratio]{${rel}}\\end{center}`).join('\n');
 return `\\documentclass[fontset=fandol]{ctexart}\n\\usepackage[a0paper,${options.orientation},margin=3cm]{geometry}\n\\usepackage{multicol,graphicx,xcolor}\n\\definecolor{posterblue}{HTML}{${color}}\n\\setlength{\\columnsep}{2cm}\n\\setlength{\\parindent}{0pt}\n\\pagestyle{empty}\n\\begin{document}\n\\begin{center}{\\fontsize{60}{72}\\selectfont\\bfseries\\color{posterblue} ${tex(info.title)}}\\par\\vspace{1cm}{\\Huge ${tex(info.author)}}\\end{center}\n${options.style==='modern'?'\\noindent\\textcolor{posterblue}{\\rule{\\textwidth}{3pt}}\n':''}\\vspace{1cm}\\fontsize{${size}}{${size+9}}\\selectfont\n\\begin{multicols}{${options.columns}}\n${sections}\n${figures}\n\\end{multicols}\n\\end{document}\n`;
}
