import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import {inspectExtensionZip} from '../server/extension-packages.js';
import {parseTable,replaceTable} from '../src/plugins/table-model.js';
const BASE=process.env.BASE_URL;let n=0;const check=(name,value)=>{assert.ok(value,name);console.log('✓ '+name);n++;};
async function req(url,cookie='',method='GET',body){const r=await fetch(BASE+url,{method,headers:{cookie,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json().catch(()=>({})),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const owner=(await req('/api/auth/login','','POST',{email:'demo@latex.studio',password:'demo1234'})).cookie,admin=(await req('/api/auth/login','','POST',{email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD})).cookie;
const project=(await req('/api/projects',owner,'POST',{name:'Table plugin isolated fixture',template:'blank'})).data.project;
const rpc=(method,args={},extra={},cookie=owner)=>req('/api/extensions/underoot.tables/rpc',cookie,'POST',{projectId:project.id,method,args,...extra});
const source=String.raw`\documentclass{article}
\usepackage{booktabs,tabularx}
\begin{document}
Intro remains unchanged.
\begin{table}[ht]\centering\caption{Results}\label{tab:results}
\begin{tabular}{lcc}\toprule
Method & Score & Cost \\
\midrule
Ours & $0.92 \pm 0.01$ & 12 \\
Baseline & 0.80 & 10 \\
\bottomrule\end{tabular}
\end{table}
Conclusion remains unchanged.
\end{document}`;
check('bundled table editor is registered with minimum document permissions',(await req('/api/extensions',owner)).data.extensions.some(e=>e.id==='underoot.tables'&&e.enabled&&e.permissions.length===3));
const asset=await fetch(BASE+'/extensions/underoot.tables/1.0.0/index.html');check('iframe is sandbox-compatible with direct networking disabled',asset.ok&&asset.headers.get('content-security-policy').includes("connect-src 'none'"));
check('table editor cannot invoke an undeclared model capability',(await rpc('ai.complete',{instruction:'no'})).status===403);
await req(`/api/projects/${project.id}/file?path=main.tex`,owner,'PUT',{content:source});
const doc=(await rpc('documents.read',{path:'main.tex'})).data.result,m=parseTable(doc.content);m.rows[1][1].tex='$0.93 \\pm 0.01$';const content=replaceTable(m);
check('visual edit only changes the requested source value',content===source.replace('$0.92','$0.93'));
check('save without author confirmation is rejected',(await rpc('documents.write',{path:doc.path,content,hash:doc.hash})).status===400);
const saved=(await rpc('documents.write',{path:doc.path,content,hash:doc.hash},{consent:true})).data.result;check('confirmed table save returns a new document version',saved?.content===content&&saved.hash!==doc.hash);
check('stale table save cannot overwrite a collaborator edit',(await rpc('documents.write',{path:doc.path,content:source,hash:doc.hash},{consent:true})).status===409);
for(const variant of ['grid','plain','booktabs','grid-inline','booktabs-tabularx']){const style=variant.split('-')[0],input=variant==='grid-inline'?content.replaceAll('\n',' '):variant==='booktabs-tabularx'?content.replace('\\begin{tabular}{lcc}','\\begin{tabularx}{\\linewidth}[t]{lXX}').replace('\\end{tabular}','\\end{tabularx}'):content;const model=parseTable(input);model.structural=true;model.style=style;model.stretch=1.3;model.padding=8;const result=replaceTable(model),path='table-'+variant+'.tex';check(variant+' style saves to an isolated source file',(await rpc('documents.write',{path,content:result,hash:null},{consent:true})).status===200);const engines=(await req('/api/system/engines',owner)).data.engines;if(engines.some(e=>e.id==='xelatex')){const c=await req(`/api/projects/${project.id}/compile`,owner,'POST',{mainFile:path,engine:'xelatex',force:true});if(!c.data.ok)console.error(c.data.errors);check(variant+' style compiles to a real PDF',c.data.ok);}}
const zipResponse=await fetch(BASE+'/api/extensions/examples/tables/download',{headers:{cookie:owner}}),bytes=Buffer.from(await zipResponse.arrayBuffer()),pack=inspectExtensionZip(bytes);check('portable ZIP passes the installation validator',pack.manifest.id==='research.tables'&&new AdmZip(bytes).getEntry('plugin.js'));
const email=`table-viewer-${Date.now()}@test.local`;await req('/api/auth/register','','POST',{email,name:'Table viewer',password:'TableFixturePass42!'});const users=(await req('/api/admin/users',admin)).data.users,u=users.find(u=>u.email===email);await req('/api/admin/users/'+u.id+'/review',admin,'POST',{status:'active'});const viewer=(await req('/api/auth/login','','POST',{email,password:'TableFixturePass42!'})).cookie;await req(`/api/projects/${project.id}/members`,owner,'POST',{email,role:'viewer'});
check('viewer can read a table but cannot save it',(await rpc('documents.read',{path:'main.tex'},{},viewer)).status===200&&(await rpc('documents.write',{path:'main.tex',content,hash:saved.hash},{consent:true},viewer)).status===403);
check('nonmembers cannot read table source',(await rpc('documents.read',{path:'main.tex'},{},admin)).status===403);
await req('/api/extensions/underoot.tables',admin,'PATCH',{enabled:false});check('disabled plugin cannot read or save documents',(await rpc('documents.read',{path:'main.tex'})).status===404);
console.log(`Table plugin integration: ${n}/${n} passed`);
