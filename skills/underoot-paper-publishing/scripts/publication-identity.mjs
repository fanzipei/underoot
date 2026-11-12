import {argument} from './source-evidence.mjs';
import {plainText} from './chunk-paper.mjs';
const text=value=>{for(const name of ['thanks','footnote','samethanks']){let item;while((item=argument(value,name)))value=value.slice(0,item.from)+value.slice(item.to);}
 return plainText(value.replace(/\\\\|\\(?:and|And|AND)\b/g,' · ')).replace(/\s*·\s*$/,'').trim();};
function declarations(source,name){
 const result=[];let at=0,item;
 while((item=argument(source,name,at))){result.push({...item,marker:source.slice(item.from,item.to).match(/^\\[a-z]+\s*\[([^\]]+)\]/i)?.[1]||''});at=item.to;}
 return result;
}
/** Read title metadata including ACM's post-begin-document block, never body examples. */
export function publicationIdentity(source,fallback=''){
 let clean=String(source).replace(/\\begin\{(verbatim\*?|lstlisting|minted|comment)\}[\s\S]*?\\end\{\1\}/g,'').replace(/(?<!\\)%[^\n]*/g,'');
 clean=clean.split(/\\(?:begin\{abstract\}|abstract\b|maketitle\b|section\*?\s*[{[]|chapter\*?\s*\{)/)[0];
 // Bounded zero-argument text macros only; never execute TeX.
 const macros=new Map();
 const definitions=/\\(?:newcommand|renewcommand|providecommand)\*?\s*\{\\([A-Za-z]+)\}(?!\s*\[)/g;
 clean=clean.replace(definitions,(match,name,offset)=>{const value=argument('\\value'+clean.slice(offset+match.length),'value');if(value&&value.value.length<10000)macros.set(name,value.value);return match;});
 // Strip definitions before expanding usages, so declarations in definitions aren't duplicated.
 for(const match of [...clean.matchAll(definitions)].reverse()){const value=argument('\\value'+clean.slice(match.index+match[0].length),'value');if(value)clean=clean.slice(0,match.index)+clean.slice(match.index+match[0].length+value.to-6);}
 for(let round=0;round<4;round++){let changed=false;clean=clean.replace(/\\([A-Za-z]+)\b/g,(match,name)=>{if(!macros.has(name))return match;changed=true;return macros.get(name);});if(!changed||clean.length>1000000)break;}
 const affiliations=[],authors=[],contacts=[];
 const addAff=(value,marker='')=>{value=text(value);if(!value)return'';const existing=affiliations.find(a=>a.value===value&&(!marker||a.marker===marker));if(existing)return existing.marker;const id=marker||String(affiliations.length+1);affiliations.push({marker:id,value});return id;};
 for(const item of declarations(clean,'icmlaffiliation')){const second=argument('\\value'+clean.slice(item.to),'value');if(second)addAff(second.value,item.value);}
 const acm=declarations(clean,'author');
 const structured=acm.some((a,i)=>declarations(clean.slice(a.to,acm[i+1]?.from??clean.length),'affiliation').length);
 for(let index=0;index<acm.length;index++){
  const item=acm[index],segment=clean.slice(item.to,acm[index+1]?.from??clean.length),indices=[];
  if(structured)for(const aff of declarations(segment,'affiliation'))indices.push(addAff(aff.value));
  const blocks=declarations(item.value,'IEEEauthorblockN');
  if(blocks.length){for(const block of blocks)authors.push(text(block.value));for(const aff of declarations(item.value,'IEEEauthorblockA'))addAff(aff.value);}
  else for(const group of item.value.split(/\\(?:And|AND|and)\b/)){
   const groupIndices=[...indices];const lines=group.split(/\\\\(?:\[[^\]]*\])?/).map(v=>v.trim()).filter(Boolean);if(!lines.length)continue;
   for(const line of lines.slice(1))if(/@/.test(text(line)))contacts.push(text(line));else if(!/thanks\b/.test(line))groupIndices.push(addAff(line));
   authors.push((item.marker&&!structured?'['+item.marker+'] ':groupIndices.filter(Boolean).length?'['+[...new Set(groupIndices)].join(',')+'] ':'')+text(lines[0]));
  }
 }
 for(const item of declarations(clean,'icmlauthor')){const second=argument('\\value'+clean.slice(item.to),'value');authors.push((second?'['+text(second.value)+'] ':'')+text(item.value));}
 for(const name of ['affil','institute','address',...(!structured?['affiliation']:[])])for(const item of declarations(clean,name))addAff(item.value,item.marker);
 for(const item of declarations(clean,'icmlcorrespondingauthor')){const second=argument('\\value'+clean.slice(item.to),'value');if(second)contacts.push(text(second.value));}
 for(const item of declarations(clean,'email'))contacts.push(text(item.value));
 const indexed=structured||declarations(clean,'icmlauthor').length||declarations(clean,'affil').some(a=>a.marker)||authors.some(a=>/^\[/.test(a));
 return{authors:[...new Set(authors.filter(Boolean))].join('\n')||fallback,affiliations:affiliations.map(a=>(indexed?'['+a.marker+'] ':'')+a.value).join('\n'),contact:[...new Set(contacts.filter(Boolean))].join(' · '),logos:[],projectUrl:'',reserveCode:true};
}
