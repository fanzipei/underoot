import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {codexMcpConfig} from '../src/shared/codex-mcp-config.js';
const BASE=process.env.BASE_URL;let n=0;const check=(label,ok)=>{assert.ok(ok,label);n++;console.log('✓ '+label);};
async function req(url,cookie='',method='GET',body){const r=await fetch(BASE+url,{method,headers:{cookie,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json().catch(()=>({})),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
const owner=(await req('/api/auth/login','','POST',{email:'demo@latex.studio',password:'demo1234'})).cookie;
const project=(await req('/api/projects',owner,'POST',{name:'MCP research fixture',template:'blank'})).data.project,id=project.id,manage=`/api/projects/${id}/agent-tokens`,url=BASE+`/api/mcp/v1/projects/${id}`;
const minted=await req(manage,owner,'POST',{name:'MCP fixture',days:7,scopes:['read','write','compile']}),token=minted.data.token;
const client=new Client({name:'underoot-mcp-regression',version:'1.0.0'});
await client.connect(new StreamableHTTPClientTransport(new URL(url),{requestInit:{headers:{Authorization:'Bearer '+token}}}));
const call=(name,args={})=>client.callTool({name,arguments:args});
const value=r=>r.structuredContent||JSON.parse(r.content.find(c=>c.type==='text').text);
try{
 check('official SDK connects to stateless project HTTP MCP',(await call('get_project')).isError!==true);
 const tools=(await client.listTools()).tools;check('authorized catalog exposes seven scoped research tools',tools.length===7&&tools.some(t=>t.name==='patch_file')&&tools.some(t=>t.name==='upload_figure'));
 const doc=value(await call('read_file',{path:'main.tex',start_line:1,line_count:2}));check('bounded reads retain the full-file hash for safe editing',doc.hash.length===64&&doc.truncated&&doc.endLine===2);
 const source=String.raw`\documentclass{article}\begin{document}Initial result.\end{document}`;
 const written=await call('write_files',{message:'MCP experiment report',files:[{path:'main.tex',hash:doc.hash,encoding:'utf8',content:source},{path:'results.csv',hash:null,encoding:'utf8',content:'model,score\nours,0.94\n'}]});check('MCP writes preserve report history',value(written).revision&&value(written).files.length===2);
 const current=value(await call('read_file',{path:'main.tex'}));
 const patched=await call('patch_file',{path:'main.tex',hash:current.hash,before:'Initial result.',after:'Updated result: accuracy 0.94.'});check('exact patch preserves unrelated TeX',!patched.isError&&value(await call('read_file',{path:'main.tex'})).content===source.replace('Initial result.','Updated result: accuracy 0.94.'));
 const stale=await call('patch_file',{path:'main.tex',hash:current.hash,before:'Initial result.',after:'overwrite'});check('stale MCP edits return an actionable 409',stale.isError&&value(stale).status===409);
 const invalid=await call('write_files',{files:[{path:'../outside.tex',hash:null,encoding:'utf8',content:'bad'}]});check('MCP cannot bypass existing path protection',invalid.isError&&value(invalid).status===400);
 const image=fs.readFileSync('scripts/fixtures/publishing/accuracy.png');const uploaded=await call('upload_figure',{path:'figures/mcp.png',hash:null,base64:image.toString('base64')});check('MCP uploads an actual experiment figure',!uploaded.isError&&value(uploaded).files[0].path==='figures/mcp.png');
 const binary=value(await call('read_file',{path:'figures/mcp.png'}));check('binary metadata does not flood model context with base64',binary.binary&&!binary.content&&binary.hash.length===64);
 const badOrigin=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'});check('cross-origin browser requests are rejected',badOrigin.status===403);
 const cross=await fetch(BASE+'/api/mcp/v1/projects/not-this-project',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});check('MCP token remains bound to one project',cross.status===403);
 const readonly=(await req(manage,owner,'POST',{name:'MCP read-only',days:7,scopes:['read']})).data;
 const ro=new Client({name:'readonly',version:'1.0.0'});try{await ro.connect(new StreamableHTTPClientTransport(new URL(url),{requestInit:{headers:{Authorization:'Bearer '+readonly.token}}}));check('read-only MCP hides every write/compile tool',(await ro.listTools()).tools.every(t=>t.annotations.readOnlyHint));let blocked=false;try{blocked=(await ro.callTool({name:'write_files',arguments:{files:[]}})).isError;}catch{blocked=true;}check('hidden write tool cannot be called directly',blocked);}finally{await ro.close();}
 const engines=(await req('/api/system/engines',owner)).data.engines;if(engines.some(e=>e.id==='xelatex')){const c=await call('compile_project',{engine:'xelatex'});check('MCP produces a real server-compiled PDF',!c.isError&&value(c).ok&&value(c).pdf);}

 const experiment=path.join(process.env.LATEXSTUDIO_DATA,'experiment');fs.mkdirSync(experiment);fs.writeFileSync(path.join(experiment,'plot.png'),image);const outside=path.join(process.env.LATEXSTUDIO_DATA,'outside.png');fs.writeFileSync(outside,image);
 const local=new Client({name:'local-test',version:'1.0.0'}),py=process.platform==='win32'?'python':'python3';
 try{await local.connect(new StdioClientTransport({command:py,args:['scripts/underoot-mcp.py','--root',experiment],env:{...process.env,UNDEROOT_PROJECT_URL:BASE+`/api/agent/v1/projects/${id}`,UNDEROOT_API_TOKEN:token}}));
  check('official SDK connects to Python stdio bridge',(await local.listTools()).tools.some(t=>t.name==='upload_local_figure'));
  const up=await local.callTool({name:'upload_local_figure',arguments:{local_path:'plot.png',path:'figures/local.png',hash:null}});check('local figure upload avoids base64 tool arguments',!up.isError&&value(up).files[0].path==='figures/local.png');
  const escape=await local.callTool({name:'upload_local_figure',arguments:{local_path:'../outside.png',path:'figures/escaped.png',hash:null}});check('bridge refuses local files outside the experiment root',escape.isError);
  const downloaded=await local.callTool({name:'download_project_file',arguments:{path:'figures/local.png',local_path:'downloaded.png'}});check('bridge downloads an unchanged figure to a new local file',!downloaded.isError&&fs.readFileSync(path.join(experiment,'downloaded.png')).equals(image));
  check('bridge refuses to overwrite an existing local file',(await local.callTool({name:'download_project_file',arguments:{path:'figures/local.png',local_path:'downloaded.png'}})).isError);
  await req(manage+'/'+minted.data.credential.id,owner,'DELETE');let denied=false;try{denied=(await local.callTool({name:'get_project',arguments:{}})).isError;}catch{denied=true;}check('revocation also disables an already-connected bridge',denied);
 }finally{await local.close();}
 const config=codexMcpConfig({origin:BASE,projectId:id});check('generated HTTP Codex configuration contains no credential',config.toml.includes('bearer_token_env_var')&&config.toml.includes(url)&&!config.toml.includes(token));
 const config2=codexMcpConfig({origin:BASE,projectId:id,mode:'stdio',workspace:experiment,scriptPath:path.resolve('scripts/underoot-mcp.py')});check('stdio configuration forwards only a named token environment variable',config2.toml.includes('env_vars = [')&&config2.toml.includes('UNDEROOT_TOKEN_ENV')&&!config2.toml.includes(token));
 const home=path.join(process.env.LATEXSTUDIO_DATA,'codex-config-test');fs.mkdirSync(home);fs.writeFileSync(path.join(home,'config.toml'),config.toml);const codex=spawnSync('codex',['mcp','get',config.name,'--json'],{env:{...process.env,CODEX_HOME:home},encoding:'utf8'});if(!codex.error){check('installed Codex CLI parses the generated HTTP configuration',codex.status===0&&JSON.parse(codex.stdout).transport.url===url);fs.writeFileSync(path.join(home,'config.toml'),config2.toml);const stdioConfig=spawnSync('codex',['mcp','get',config.name,'--json'],{env:{...process.env,CODEX_HOME:home},encoding:'utf8'});check('installed Codex CLI parses the generated stdio configuration',stdioConfig.status===0&&JSON.parse(stdioConfig.stdout).transport.command==='python');}
}finally{await client.close();}
console.log(`Project MCP: ${n}/${n} passed`);
