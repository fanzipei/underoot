import{paperReferences}from'./paper-references.mjs';
/** Standalone source-preserving publishing CLI. No API key or model dependency. */
import fs from'node:fs';import path from'node:path';import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';
import{expandPaper,paperPlan,plainText}from'./chunk-paper.mjs';import{sourceEvidence,argument}from'./source-evidence.mjs';import{summarizePaper}from'./summarize.mjs';import{editorialPlan}from'./editorial-plan.mjs';import{publishingOptions,renderPublication}from'./styles.mjs';
import{fitPublication}from'./fit-layout.mjs';import{compileMeasured}from'./compile-measured.mjs';import{publicationIdentity}from'./publication-identity.mjs';
const args=process.argv.slice(2);const value=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
if(!args.includes('--root')||!args.includes('--out')||!args.includes('--kind'))throw Error('Usage: node build-publication.mjs --root <paper> --main main.tex --kind slides|poster --style <id> --out <new-output-directory> [--outline outline.json] [--compile] [--audit] [--render]');
const root=fs.realpathSync(value('--root'));const main=value('--main','main.tex');const output=path.resolve(value('--out'));
const options=publishingOptions({kind:value('--kind'),style:value('--style'),ratio:value('--ratio','169'),orientation:value('--orientation','portrait'),columns:Number(value('--columns','3')),count:Number(value('--count',value('--kind')==='slides'?'18':'9'))});
const entry=options.kind==='slides'?'presentation.tex':'academic-poster.tex';
if(fs.existsSync(output)&&fs.readdirSync(output).length)throw Error('Use a new or empty output directory; existing artifacts are preserved.');
if(output===root)throw Error('Output must not replace the source paper directory.');
const expanded=expandPaper(root,main);const source=expanded.source;
const safe=(rel)=>{const full=path.resolve(root,rel);if(!full.startsWith(root+path.sep)||!fs.existsSync(full))return null;const real=fs.realpathSync(full);return real.startsWith(root+path.sep)&&fs.statSync(real).isFile()?real:null;};
const prefixes=[...source.matchAll(/\\graphicspath\{((?:\{[^}]*\})+)\}/g)].flatMap(m=>[...m[1].matchAll(/\{([^}]*)\}/g)].map(p=>p[1]));
const figures=[];
for(const match of source.matchAll(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g)){
 for(const prefix of['',path.posix.dirname(main.replaceAll('\\','/'))+'/',...prefixes])for(const ext of['','.pdf','.png','.jpg','.jpeg']){
  const rel=path.posix.normalize(prefix+match[1]+ext);if(!/^[\p{L}\p{N} _./-]+\.(?:png|jpe?g|pdf)$/iu.test(rel))continue;
  if(safe(rel)&&!figures.includes(rel))figures.push(rel);
 }
}
const plan=paperPlan(source,{title:plainText(argument(source,'title')?.value||path.basename(root)),author:plainText(argument(source,'author')?.value||''),files:expanded.files,warnings:expanded.warnings,figures:figures.slice(0,32)});Object.assign(plan,sourceEvidence(source,plan.chunks,plan.figures),{references:paperReferences(root,source,plan.chunks)});
let summary=await summarizePaper(plan,options);
if(args.includes('--outline')){
 const supplied=JSON.parse(fs.readFileSync(value('--outline'),'utf8'));
 if(!Array.isArray(supplied.sections)||!supplied.sections.length)throw Error('Outline requires nonempty sections');
 for(const section of supplied.sections){
  if(typeof section.title!=='string'||section.title.length>100||!Array.isArray(section.sourceIds)||!section.sourceIds.length||(!Array.isArray(section.bullets)&&typeof section.text!=='string'))throw Error('Invalid outline section');
  if(section.bullets&&section.bullets.some(b=>typeof b!=='string'||!b.trim()))throw Error('Invalid outline bullet');
 }
 summary={...summary,sections:supplied.sections,aiNarrative:true};
}
const editorial=editorialPlan(plan,summary,options);editorial.identity=publicationIdentity(source,plan.author);fs.mkdirSync(output,{recursive:true,mode:0o700});
for(const rel of plan.figures){const dest=path.resolve(output,rel);if(!dest.startsWith(output+path.sep))throw Error('Unsafe figure destination');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(safe(rel),dest);}
fs.writeFileSync(path.join(output,entry),renderPublication({...plan,sections:summary.sections,editorial},options));
fs.writeFileSync(path.join(output,'publishing-plan.json'),JSON.stringify({sourceRoot:root,sourceMain:main,mode:args.includes('--outline')?'reviewed-outline':'local-structured-draft',options,sourceDigest:plan.digest,editorial},null,2));
fs.writeFileSync(path.join(output,'speaker-notes.md'),'# Source-linked presentation notes\n\n'+editorial.pages.map((p,i)=>`## ${i+1}. ${p.title}\n\n${p.takeaway}\n\n${p.bullets.map(b=>'- '+b).join('\n')}\n\nSources: ${p.sourceIds.join(', ')}\n\n${p.speakerNotes.map(n=>`${n.id}: ${n.summary}`).join('\n\n')}`).join('\n\n')+'\n\n# Review warnings\n\n'+editorial.warnings.map(w=>'- '+w).join('\n'));
fs.appendFileSync(path.join(output,'speaker-notes.md'),'\n\n# Complete source chunk notes (including unshown details)\n\n'+summary.notes.map(n=>`## ${n.id} · ${n.title}\n\n${n.summary}`).join('\n\n'));
if(args.includes('--compile')){
 const layout=await fitPublication({...plan,editorial},options,{render:renderPublication,write:content=>fs.writeFileSync(path.join(output,entry),content),audit:async()=>compileMeasured(output,entry,options.kind,{engine:value('--engine','xelatex'),requirePdfAudit:args.includes('--audit')})});
 fs.writeFileSync(path.join(output,'layout-iterations.json'),JSON.stringify(layout,null,2));
 fs.writeFileSync(path.join(output,'publishing-plan.json'),JSON.stringify({sourceRoot:root,sourceMain:main,options,editorial,layout},null,2));
 if(layout.errors?.length)throw Error('Compilation failed; inspect layout-iterations.json');
}
if(args.includes('--audit')){
 const script=fileURLToPath(new URL('./audit-publication.py',import.meta.url));const stem=entry.replace(/\.tex$/,'');const command=['--pdf',path.join(output,stem+'.pdf'),'--kind',options.kind,'--log',path.join(output,stem+'.log'),'--out',path.join(output,'pdf-audit.json')];if(args.includes('--render'))command.push('--render-dir',path.join(output,'preview'));
 const audit=spawnSync(process.platform==='win32'?'python':'python3',[script,...command],{encoding:'utf8',windowsHide:true,timeout:240000});process.stdout.write(audit.stdout||'');if(audit.status!==0)throw Error('PDF checks need review; inspect '+path.join(output,'pdf-audit.json')+'\n'+(audit.stderr||''));
}
console.log(JSON.stringify({output,entry,pages:editorial.pages.length,sourceChunks:plan.chunkCount,warnings:editorial.warnings,mode:args.includes('--outline')?'reviewed-outline':'local-structured-draft'},null,2));
