import fs from'node:fs';import path from'node:path';import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';
import{measurements}from'./fit-layout.mjs';
/** Standalone skill compiler, without the application's database or server modules. */
export function compileMeasured(root,entry,kind,{engine='xelatex',requirePdfAudit=false}={}){
 let ok=true,output='';
 for(let pass=0;pass<2;pass++){const result=spawnSync(engine,['-interaction=nonstopmode','-halt-on-error','-no-shell-escape',entry],{cwd:root,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4000000});output+=result.stdout||'';if(result.status!==0){ok=false;break;}}
 const stem=entry.replace(/\.tex$/,''),logFile=path.join(root,stem+'.log'),log=fs.existsSync(logFile)?fs.readFileSync(logFile,'utf8'):output;
 const overflowWarnings=[...log.matchAll(/Overfull \\([hv])box \(([\d.]+)pt too (?:wide|high)\)/g)].map(m=>({axis:m[1],points:Number(m[2])}));
 const measured=measurements(log);
 if(!ok)return{status:'needs-review',issues:['LaTeX compilation failed'],errors:[output.slice(-1500)],measurements:measured,overflowWarnings};
 const report=path.join(root,'pdf-audit.json');
 fs.rmSync(report,{force:true});
 const result=spawnSync(process.platform==='win32'?'python':'python3',[fileURLToPath(new URL('./audit-publication.py',import.meta.url)),'--pdf',path.join(root,stem+'.pdf'),'--kind',kind,'--log',logFile,'--out',report],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1000000});
 if(!fs.existsSync(report)){if(requirePdfAudit)throw Error('PDF audit tools unavailable: '+(result.stderr||result.error?.message||''));return{status:overflowWarnings.some(w=>w.points>1)?'needs-review':'passed',boundsStatus:'unavailable',issues:overflowWarnings.some(w=>w.points>1)?['TeX overflow']:[],errors:[],measurements:measured,overflowWarnings};}
 return{...JSON.parse(fs.readFileSync(report,'utf8')),errors:[],measurements:measured,overflowWarnings};
}
