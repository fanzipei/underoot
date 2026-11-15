export function storedLog(log,limit=500000){log=String(log||'');return log.length<=limit?log:log.slice(0,50000)+'\n[日志过长，中间部分已省略；保留开头及最近输出]\n'+log.slice(-(limit-50100));}
export function recentLog(log){
 const text=String(log||''),driver=text.split(/\n\n\[TeX 日志/)[0],last=text.lastIndexOf('[TeX 日志');
 const latest=last>=0?text.slice(last).split(/\n\n\[参考文献编译日志\]/)[0]:text;
 const header=driver.split('\n').filter(l=>/^\[编译命令\]|^\[清理|^Latexmk:|^Collected error|^\s*(?:bibtex|biber).*error/i.test(l)).slice(-14);
 const lines=latest.split('\n'),keep=new Set();
 for(let i=0;i<lines.length;i++)if(/^\[|^!|warning|overfull|underfull|undefined control|fatal|emergency|Output written|^.*\.(?:tex|bib|sty|cls):\d+:/i.test(lines[i])){
  keep.add(i);if(/^!|warning|undefined control|fatal|emergency|\.(?:tex|bib|sty|cls):\d+:/i.test(lines[i]))for(let j=i+1;j<=Math.min(i+2,lines.length-1);j++)if(lines[j].trim())keep.add(j);
 }
 const tail=keep.size?[...keep].sort((a,b)=>a-b).map(i=>lines[i]).slice(-90):lines.filter(l=>l.trim()).slice(-30);
 return[...header,'','[最近一次运行摘要；完整输出及历史见「查看完整记录」]',...tail.map(l=>l.length>360?l.slice(0,360)+' …（长行见完整记录）':l)].join('\n');
}
export function filteredLog(log,query='',kind='all'){
 const lines=String(log||'').split(/\r?\n/),q=query.toLowerCase(),error=/^!|error|fatal|emergency|undefined control|---line|I was expecting/i,warning=/warning|overfull|underfull|undefined reference/i,event=/^\[|^This is|^Latexmk:|^Running|Output written|^Rc files|^Rule /i;
 return lines.map((text,i)=>({text,line:i+1})).filter(l=>(!q||l.text.toLowerCase().includes(q))&&(kind==='all'||(kind==='error'?error:kind==='warning'?warning:event).test(l.text)));
}
