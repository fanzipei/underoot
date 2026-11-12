import {argument} from './source-evidence.mjs';
import {plainText} from './chunk-paper.mjs';
const commands=(source,name)=>{const values=[];let at=0,item;while((item=argument(source,name,at))){const marker=source.slice(item.from,item.to).match(/^\\[a-z]+\[([^\]]+)\]/i)?.[1];values.push((marker?'['+marker+'] ':'')+plainText(item.value.replace(/\\\\|\\and\b/g,' · ')));at=item.to;}return values.filter(Boolean);};
/** Extract all declarations, never execute manuscript macros or infer affiliations. */
export function publicationIdentity(source,fallback=''){
 const preamble=String(source).replace(/(?<!\\)%[^\n]*/g,'').split(/\\begin\{document\}/)[0];
 return{authors:commands(preamble,'author').join('\n')||fallback,affiliations:[...new Set(['affil','affiliation','institute','address'].flatMap(name=>commands(preamble,name)))].join('\n'),contact:commands(preamble,'email').join(' · '),logos:[],projectUrl:'',reserveCode:true};
}
