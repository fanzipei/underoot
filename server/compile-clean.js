import fs from 'node:fs';
import path from 'node:path';

const auxiliary=/\.(?:aux|log|out|toc|fls|fdb_latexmk|nav|snm|vrb|bcf|blg|synctex(?:\.gz)?|run\.xml|xdv|dvi|lof|lot|idx|ilg|glo|loa|spl|acn|glg)$/i;
/** Delete only recognized job auxiliaries / recorder OUTPUTs inside the project.
 * PDFs (including figures) and hand-supplied bibliography output are retained. */
export function cleanCompileFiles(dir,base){
 const root=fs.realpathSync(dir),prefix=root+path.sep,candidates=new Set();
 const add=rel=>{const full=path.resolve(root,rel);if(full.startsWith(prefix)&&!path.relative(root,full).split(path.sep).some(part=>part.startsWith('.'))&&auxiliary.test(full))candidates.add(full);};
 const fls=path.join(root,base+'.fls');
 if(fs.existsSync(fls))for(const line of fs.readFileSync(fls,'utf8').split(/\r?\n/))if(line.startsWith('OUTPUT '))add(line.slice(7).replace(/^"(.*)"$/,'$1'));
 for(const ext of ['aux','log','out','toc','fls','fdb_latexmk','nav','snm','vrb','bcf','blg','synctex.gz','run.xml','xdv','dvi','lof','lot','idx','ilg','glo','loa','spl','acn','glg'])add(base+'.'+ext);
 // A .bbl is sometimes the sole submitted bibliography source. Remove it only
 // when BibTeX recorded regenerable local .bib inputs for this job.
 const aux=path.join(root,base+'.aux'),blg=path.join(root,base+'.blg');
 if(fs.existsSync(aux)&&fs.existsSync(blg)&&/^This is BibTeX/m.test(fs.readFileSync(blg,'utf8'))){
  const databases=[...fs.readFileSync(aux,'utf8').matchAll(/\\bibdata\{([^}]+)\}/g)].flatMap(m=>m[1].split(','));
  if(databases.length&&databases.every(name=>{const f=path.resolve(root,name.trim()+'.bib');return f.startsWith(prefix)&&fs.existsSync(f)&&fs.statSync(f).isFile()&&fs.realpathSync(f).startsWith(prefix);}))candidates.add(path.join(root,base+'.bbl'));
 }
 const removed=[];
 for(const file of candidates){if(!fs.existsSync(file))continue;const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||!fs.realpathSync(file).startsWith(prefix))continue;fs.unlinkSync(file);removed.push(path.relative(root,file).replace(/\\/g,'/'));}
 return removed;
}
