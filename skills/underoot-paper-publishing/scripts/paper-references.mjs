import fs from'node:fs';import path from'node:path';import{plainText}from'./chunk-paper.mjs';
const bibText=s=>plainText(s.replace(/\\(["'`^~=.uvHckr])\s*\{?([A-Za-z])\}?/g,(_,a,c)=>c+({'"':'\u0308',"'":'\u0301','`':'\u0300','^':'\u0302','~':'\u0303','=':'\u0304','.':'\u0307',u:'\u0306',v:'\u030c',H:'\u030b',c:'\u0327',k:'\u0328',r:'\u030a'}[a]||''))).normalize('NFC');
function braced(s,at){if(s[at]!=='{')return null;let depth=1,i=at+1;for(;i<s.length&&depth;i++){if(s[i]==='\\'){i++;continue;}if(s[i]==='{')depth++;if(s[i]==='}')depth--;}return depth?null:{value:s.slice(at+1,i-1),to:i};}
export function parseReferences(text){
 const entries=[];for(const match of text.matchAll(/@([a-z]+)\s*\{\s*([^,\s]+)\s*,/gi)){
  if(/string|comment|preamble/i.test(match[1]))continue;const body=braced(text,text.indexOf('{',match.index));if(!body)continue;
  const fields={};const source=body.value.slice(body.value.indexOf(',')+1);let i=0;
  while(i<source.length){const m=/^\s*,?\s*([a-z]+)\s*=\s*/i.exec(source.slice(i));if(!m)break;i+=m[0].length;let value;
   if(source[i]==='{'){const b=braced(source,i);if(!b)break;value=b.value;i=b.to;}
   else if(source[i]==='"'){let end=i+1;while(end<source.length&&(source[end]!=='"'||source[end-1]==='\\'))end++;value=source.slice(i+1,end);i=end+1;}
   else{const end=source.indexOf(',',i);value=source.slice(i,end<0?source.length:end);i=end<0?source.length:end;}
   fields[m[1].toLowerCase()]=bibText(value);
  }
  if(fields.title&&fields.author){const authors=fields.author.split(/\s+and\s+/).map(a=>a.includes(',')?a.split(',').slice(1).join(' ').trim()+' '+a.split(',')[0].trim():a).join(', '),venue=fields.booktitle||fields.journal||'';
   const people=fields.author.split(/\s+and\s+/),words=people[0].trim().split(/\s+/),first=people[0].includes(',')?people[0]:words.length>1?words.at(-1)+', '+words.slice(0,-1).join(' '):people[0];
   const slideText=(people.length>2?first+', et al.':people.length===2?first+', and '+authors.split(', ').slice(-1)[0]:first)+'. “'+fields.title+'.” '+[venue,fields.year].filter(Boolean).join(', ')+'.';
   entries.push({key:match[2],title:fields.title,authors,year:fields.year||'',venue,slideText:slideText.replace('et al..','et al.'),text:[authors,fields.year,fields.title,venue].filter(Boolean).join('. ')+'.'});
  }
 }return entries;
}
export function paperReferences(root,source,chunks){
 const base=fs.realpathSync(root),files=[...source.matchAll(/\\(?:bibliography|addbibresource)(?:\[[^\]]*\])?\{([^}]+)\}/g)].flatMap(m=>m[1].split(',')),refs=[];
 for(let file of files){file=file.trim();if(!file.endsWith('.bib'))file+='.bib';const full=path.resolve(base,file);if(!full.startsWith(base+path.sep)||!fs.existsSync(full)||!fs.realpathSync(full).startsWith(base+path.sep)||fs.statSync(full).size>2000000)continue;
  for(const ref of parseReferences(fs.readFileSync(full,'utf8'))){if(refs.some(r=>r.key===ref.key))continue;ref.sourceIds=chunks.filter(c=>[...c.text.matchAll(/\\cite\w*\*?(?:\[[^\]]*\])*\{([^}]+)\}/g)].some(m=>m[1].split(',').map(k=>k.trim()).includes(ref.key))).map(c=>c.id);refs.push(ref);}
 }return refs;
}
export function relatedReferences(page,plan){const normalized=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');const names=(page.tables||[]).flatMap(t=>t.rows.flat()).flatMap(s=>String(s).split(/[,;]/)).map(normalized).filter(n=>n.length>=5);const rank=r=>names.filter(n=>normalized(r.key+' '+r.title).includes(n)).length;
 return(plan.references||[]).filter(r=>r.sourceIds.some(id=>page.sourceIds.includes(id))).sort((a,b)=>rank(b)-rank(a)).slice(0,1);}
