import {mask} from '../src/plugins/table-model.js';
import fs from 'node:fs';import path from 'node:path';import {projectDir} from './paths.js';import {texSymbols,plainTex} from '../src/shared/tex-editing.js';
export function editorIndex(project){
 const root=fs.realpathSync(projectDir(project.id)),labels=[],citations=[],images=[];let bytes=0,files=0,truncated=false;
 function walk(folder){for(const e of fs.readdirSync(folder,{withFileTypes:true})){if(e.name.startsWith('.'))continue;if(++files>3000){truncated=true;return;}const f=path.join(folder,e.name),rel=path.relative(root,f).replace(/\\/g,'/');if(e.isDirectory())walk(f);else if(e.isFile()){
  if(/\.(png|jpe?g|pdf|eps|svg|webp|bmp|tiff?)$/i.test(e.name)&&rel!==path.basename(project.main_file,path.extname(project.main_file))+'.pdf'&&!/[{}%#\r\n]/.test(rel))images.push(rel);
  if(/\.(tex|bib|bbl)$/i.test(e.name)){const size=fs.statSync(f).size;if(size>2*1024*1024||bytes+size>8*1024*1024){truncated=true;continue;}bytes+=size;const symbols=texSymbols(fs.readFileSync(f,'utf8'),/\.bib$/i.test(e.name));for(const key of symbols.labels)labels.push({key,path:rel});for(const key of symbols.citations)citations.push({key,path:rel});}
 }}}
 walk(root);const unique=items=>[...new Map(items.map(x=>[x.key,x])).values()].slice(0,5000);return{labels:unique(labels),citations:unique(citations),images:images.slice(0,2000),truncated};
}

export function sourceByText(project,text){
 if(typeof text!=='string'||text.length>1600)return null;const key=s=>plainTex(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}]/gu,''),quote=key(text);if(quote.length<16)return null;
 const root=fs.realpathSync(projectDir(project.id)),matches=[];let bytes=0,count=0;
 function walk(folder){for(const e of fs.readdirSync(folder,{withFileTypes:true})){if(e.name.startsWith('.')||++count>3000)return;const full=path.join(folder,e.name);if(e.isDirectory())walk(full);else if(e.isFile()&&/\.tex$/i.test(e.name)){const size=fs.statSync(full).size;if(size>2*1024*1024||bytes+size>8*1024*1024)continue;bytes+=size;const lines=mask(fs.readFileSync(full,'utf8')).split(/\r?\n/);for(let i=0;i<lines.length;i++){if(lines[i].trimStart().startsWith('%'))continue;const line=key(lines[i]);if(line.includes(quote)||quote.length>50&&(line.includes(quote.slice(0,50))||line.includes(quote.slice(-50))))matches.push({path:path.relative(root,full).replace(/\\/g,'/'),line:i+1,approximate:true});}}}}
 walk(root);return matches.length===1?matches[0]:null;
}
