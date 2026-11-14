/** Project-scoped bearer API. Agent credentials never authenticate normal account routes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import {db,memberRole,getUserById,recordVersion,touchProject} from './db.js';
import {requireAuth} from './auth.js';
import {projectDir,resolveInside} from './paths.js';
import {digest,failure,snapshot} from './project-history.js';
import {flushProject,syncExternalWrite,broadcastProject} from './collab.js';
import {compileProject,isCompiling,engineLabel} from './compile.js';

db.exec(`CREATE TABLE IF NOT EXISTS agent_tokens (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE, scopes TEXT NOT NULL, created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, revoked_at INTEGER, last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS agent_tokens_project ON agent_tokens(project_id);
CREATE TABLE IF NOT EXISTS agent_events (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 token_id TEXT, user_id TEXT, name TEXT NOT NULL, action TEXT NOT NULL,
 detail TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_events_project ON agent_events(project_id,created_at);`);
const editRole=role=>['owner','editor'].includes(role);
const handle=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
const publicToken=t=>({id:t.id,name:t.name,userId:t.user_id,scopes:JSON.parse(t.scopes),createdAt:t.created_at,expiresAt:t.expires_at,revokedAt:t.revoked_at,lastUsedAt:t.last_used_at});
function event(project,token,action,detail){db.prepare('INSERT INTO agent_events VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),project.id,token.id,token.user_id,token.name,action,JSON.stringify(detail),Date.now());}
const limits=new Map();
function limit(key,max){const now=Date.now();if(limits.size>5000)for(const[k,v]of limits)if(v.end<now)limits.delete(k);if(limits.size>10000)throw failure(429,'请求繁忙，请稍后重试');let v=limits.get(key);if(!v||v.end<now){v={n:0,end:now+60000};limits.set(key,v);}if(++v.n>max)throw failure(429,'Agent 请求过于频繁，请一分钟后重试');}

export const agentTokensRouter=express.Router({mergeParams:true});
agentTokensRouter.use(requireAuth,(req,res,next)=>{res.setHeader('Cache-Control','no-store');const p=db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);if(!p||!editRole(memberRole(p.id,req.user.id)))return res.status(403).json({error:'需要当前项目的编辑权限'});req.project=p;req.isOwner=p.owner_id===req.user.id;next();});
agentTokensRouter.get('/',(req,res)=>{const rows=db.prepare('SELECT * FROM agent_tokens WHERE project_id=? ORDER BY created_at DESC LIMIT 300').all(req.project.id).filter(t=>req.isOwner||t.user_id===req.user.id);const events=db.prepare('SELECT * FROM agent_events WHERE project_id=? ORDER BY created_at DESC LIMIT 50').all(req.project.id).filter(t=>req.isOwner||t.user_id===req.user.id).map(t=>({...t,detail:JSON.parse(t.detail)}));res.json({tokens:rows.map(publicToken),events,apiVersion:1});});
agentTokensRouter.post('/',handle((req,res)=>{
 const name=String(req.body?.name||'').trim(),scopes=req.body?.scopes,days=req.body?.days;
 if(!name||name.length>80||!Array.isArray(scopes)||!scopes.includes('read')||scopes.some(s=>!['read','write','compile'].includes(s))||scopes.length!==new Set(scopes).size||scopes.includes('compile')&&!scopes.includes('write')||!Number.isInteger(days)||days<1||days>90)throw failure(400,'请填写名称、有效期（1–90 天）和有效权限；编译需同时授权写入');
 limit('create:'+req.user.id,10);
 if(db.prepare('SELECT count(*) AS n FROM agent_tokens WHERE project_id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?').get(req.project.id,req.user.id,Date.now()).n>=30)throw failure(400,'当前项目最多保留 30 个有效令牌，请先撤销旧令牌');
 const token='uro_agent_'+crypto.randomBytes(32).toString('base64url'),id=crypto.randomUUID(),now=Date.now();
 db.prepare('INSERT INTO agent_tokens(id,project_id,user_id,name,token_hash,scopes,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(id,req.project.id,req.user.id,name,digest(token),JSON.stringify(scopes),now,now+days*86400000);
 const row=db.prepare('SELECT * FROM agent_tokens WHERE id=?').get(id);event(req.project,row,'created',{scopes,days});res.status(201).json({token,credential:publicToken(row)});
}));
agentTokensRouter.delete('/:tokenId',handle((req,res)=>{const t=db.prepare('SELECT * FROM agent_tokens WHERE id=? AND project_id=?').get(req.params.tokenId,req.project.id);if(!t||!req.isOwner&&t.user_id!==req.user.id)throw failure(404,'令牌不存在');db.prepare('UPDATE agent_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE id=?').run(Date.now(),t.id);event(req.project,t,'revoked',{});res.json({ok:true});}));

const TEXT=new Set(['.tex','.bib','.sty','.cls','.bst','.txt','.md','.markdown','.csv','.tsv','.json','.yaml','.yml','.tikz','.pgf','.svg','.cfg','.def','.bbx','.cbx','.lbx','.ltx']);
const BINARY=new Set(['.png','.jpg','.jpeg','.webp','.pdf','.eps']);
function safeFile(project,rel){
 if(typeof rel!=='string'||rel.length>240||!rel||rel.includes('\\')||/[\x00-\x1f\x7f]/.test(rel)||rel.includes(':')||rel.startsWith('/')||rel.split('/').some(p=>!p||p==='.'||p.startsWith('.'))||!TEXT.has(path.extname(rel).toLowerCase())&&!BINARY.has(path.extname(rel).toLowerCase()))throw failure(400,'仅支持项目内的论文源码、文本数据和图片；路径不能包含隐藏或上级目录');
 const root=projectDir(project.id),full=resolveInside(root,rel);if(path.relative(root,full).replace(/\\/g,'/')!==rel)throw failure(400,'文件路径必须为规范的相对路径');let at=root;
 for(const part of rel.split('/')){at=path.join(at,part);if(fs.existsSync(at)&&fs.lstatSync(at).isSymbolicLink())throw failure(400,'不支持符号链接路径');}
 return full;
}
function readFile(project,rel){const full=safeFile(project,rel);if(!fs.existsSync(full)||!fs.statSync(full).isFile())throw failure(404,'文件不存在');const size=fs.statSync(full).size,binary=BINARY.has(path.extname(rel).toLowerCase());if(size>(binary?8:2)*1024*1024)throw failure(413,'读取上限：文本 2 MB，图片/PDF 8 MB');const b=fs.readFileSync(full);if(!binary&&(b.includes(0)||!Buffer.from(b.toString('utf8')).equals(b)))throw failure(400,'此文件不是 UTF-8 文本');return{path:rel,hash:digest(b),size,encoding:binary?'base64':'utf8',content:b.toString(binary?'base64':'utf8')};}
function fileList(project){const result=[];let bytes=0;const walk=(dir,prefix='')=>{for(const f of fs.readdirSync(dir,{withFileTypes:true})){if(f.name.startsWith('.')||f.isSymbolicLink())continue;const rel=prefix+f.name;if(f.isDirectory()){walk(path.join(dir,f.name),rel+'/');continue;}if(!f.isFile()||!TEXT.has(path.extname(rel).toLowerCase())&&!BINARY.has(path.extname(rel).toLowerCase()))continue;const full=safeFile(project,rel),size=fs.statSync(full).size;bytes+=size;if(result.length>=4000||bytes>120*1024*1024)throw failure(413,'项目文件清单上限为 4000 文件 / 120 MB');result.push({path:rel,size,hash:digest(fs.readFileSync(full)),encoding:BINARY.has(path.extname(rel).toLowerCase())?'base64':'utf8'});}};walk(projectDir(project.id));return result.sort((a,b)=>a.path.localeCompare(b.path));}
export const agentApiRouter=express.Router();
agentApiRouter.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');try{
 limit('ip:'+req.ip,240);const auth=req.headers.authorization||'';if(!/^Bearer uro_agent_[A-Za-z0-9_-]{43}$/.test(auth))throw failure(401,'请使用项目 Agent Bearer 令牌');
 const t=db.prepare('SELECT * FROM agent_tokens WHERE token_hash=?').get(digest(auth.slice(7))),u=t&&getUserById(t.user_id),role=t&&memberRole(t.project_id,t.user_id);
 if(!t||t.revoked_at||t.expires_at<=Date.now()||!u||u.disabled||u.status!=='active'||!role)throw failure(401,'令牌已失效、过期或项目访问权已撤销');
 limit('token:'+t.id,120);req.agent=t;req.user=u;req.agentRole=role;req.agentScopes=JSON.parse(t.scopes);db.prepare('UPDATE agent_tokens SET last_used_at=? WHERE id=?').run(Date.now(),t.id);next();
 }catch(e){next(e);}});
agentApiRouter.use('/projects/:id',(req,res,next)=>{if(req.params.id!==req.agent.project_id)return res.status(403).json({error:'此令牌仅授权指定项目'});req.project=db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);next();});
const scope=name=>(req,_res,next)=>{if(!req.agentScopes.includes(name)||name!=='read'&&!editRole(req.agentRole))return next(failure(403,'令牌或当前成员角色未授权此操作'));if(name!=='read')try{limit(name+':'+req.agent.id,name==='compile'?3:20);}catch(e){return next(e);}next();};
agentApiRouter.get('/projects/:id',scope('read'),(req,res)=>res.json({apiVersion:1,project:{id:req.project.id,name:req.project.name,mainFile:req.project.main_file,engine:req.project.engine||'auto'},scopes:req.agentScopes,expiresAt:req.agent.expires_at}));
agentApiRouter.get('/projects/:id/files',scope('read'),handle((req,res)=>{flushProject(req.project.id);res.json({files:fileList(req.project)});}));
agentApiRouter.get('/projects/:id/file',scope('read'),handle((req,res)=>{flushProject(req.project.id);const f=readFile(req.project,req.query.path);res.setHeader('ETag','"'+f.hash+'"');res.json(f);}));
agentApiRouter.post('/projects/:id/changes',scope('write'),handle((req,res)=>{
 if(isCompiling(req.project.id))throw failure(409,'项目正在编译，请完成后重试');flushProject(req.project.id);
 const files=req.body?.files,title=typeof req.body?.message==='string'?req.body.message.trim().slice(0,160):'更新报告';
 if(!Array.isArray(files)||!files.length||files.length>50)throw failure(400,'每批需包含 1–50 个文件');const seen=new Set();let total=0;
 const changes=files.map(f=>{if(!f||typeof f!=='object'||Array.isArray(f))throw failure(400,'文件参数无效');const full=safeFile(req.project,f.path),key=full.toLowerCase();if(seen.has(key))throw failure(400,'同批不能重复文件路径');seen.add(key);
  if(f.path===path.basename(req.project.main_file,path.extname(req.project.main_file))+'.pdf')throw failure(400,'编译产物请通过编译更新，不能覆盖主 PDF');
  if(typeof f.content!=='string'||f.hash!==null&&(typeof f.hash!=='string'||!/^[a-f0-9]{64}$/.test(f.hash)))throw failure(400,'每个文件需包含 content 和读取时的 SHA-256 hash；新文件显式使用 null');
  const binary=BINARY.has(path.extname(f.path).toLowerCase());if(f.encoding!==(binary?'base64':'utf8'))throw failure(400,'请明确指定正确的 utf8 / base64 编码');const buffer=Buffer.from(f.content,binary?'base64':'utf8');
  if(binary&&buffer.toString('base64')!==f.content||!binary&&buffer.includes(0)||buffer.length>(binary?8:2)*1024*1024)throw failure(413,'文件编码无效或超出大小限制');total+=buffer.length;if(total>12*1024*1024)throw failure(413,'每批文件总大小上限为 12 MB');
  const exists=fs.existsSync(full);if(exists&&!fs.statSync(full).isFile())throw failure(400,'目标是目录');const before=exists?fs.readFileSync(full):null;
  if(before?digest(before)!==f.hash:f.hash!==null)throw failure(409,'文件已变化或同名文件已存在，请重新读取并合并：'+f.path);
  return{path:f.path,full,before,buffer,binary,hash:digest(buffer)};
 });
 if(changes.some(a=>changes.some(b=>a!==b&&b.path.startsWith(a.path+'/'))))throw failure(400,'文件路径与目录冲突');
 const changed=changes.filter(c=>!c.before||!c.before.equals(c.buffer));if(!changed.length)return res.json({ok:true,unchanged:true,files:changes.map(c=>({path:c.path,hash:c.hash}))});
 const before=snapshot(req.project.id,req.user.id,'Agent '+req.agent.name+' · 修改前','agent',true),written=[];
 try{for(const c of changed){fs.mkdirSync(path.dirname(c.full),{recursive:true});const temp=path.join(path.dirname(c.full),'.agent-'+crypto.randomUUID()+'.tmp');try{fs.writeFileSync(temp,c.buffer,{flag:'wx',mode:0o600});fs.renameSync(temp,c.full);written.push(c);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}}catch(e){for(const c of written.reverse())if(c.before)fs.writeFileSync(c.full,c.before);else fs.unlinkSync(c.full);throw e;}
 for(const c of changed){if(!c.binary){syncExternalWrite(req.project.id,c.path,c.buffer.toString('utf8'));recordVersion({projectId:req.project.id,path:c.path,content:c.buffer.toString('utf8'),authorId:req.user.id,force:true});}broadcastProject(req.project.id,{type:'file:changed',path:c.path});}
 touchProject(req.project.id);const after=snapshot(req.project.id,req.user.id,'Agent '+req.agent.name+' · '+title,'agent',true),detail={message:title,beforeRevision:before.id,revision:after.id,files:changed.map(c=>({path:c.path,beforeHash:c.before?digest(c.before):null,hash:c.hash,size:c.buffer.length}))};event(req.project,req.agent,'write',detail);broadcastProject(req.project.id,{type:'agent:changed',name:req.agent.name,files:detail.files.map(f=>f.path)});res.json({ok:true,...detail});
}));
agentApiRouter.post('/projects/:id/compile',scope('compile'),handle(async(req,res)=>{
 if(isCompiling(req.project.id))throw failure(409,'项目正在编译，请稍后重试');const main=req.body?.mainFile||req.project.main_file;safeFile(req.project,main);if(!main.endsWith('.tex'))throw failure(400,'主文件必须为 .tex');const engine=req.body?.engine||req.project.engine||'auto';if(!['auto','xelatex','pdflatex','lualatex','latexmk','tectonic'].includes(engine))throw failure(400,'Agent 编译仅支持服务器引擎，请明确选择 xelatex 等引擎');
 flushProject(req.project.id);broadcastProject(req.project.id,{type:'compile:start',by:'Agent '+req.agent.name,at:Date.now()});
 let raw;try{raw=await compileProject({projectId:req.project.id,mainFile:main,engine,timeout:60000});}catch(e){raw={ok:false,errors:[{message:e.message}],log:e.message};}
 const result={ok:!!raw.ok,engine:raw.engine||null,engineLabel:raw.engine?engineLabel(raw.engine):null,ms:raw.ms||0,log:raw.log||'',errors:raw.errors||[],warnings:raw.warnings||[],needsSetup:!!raw.needsSetup,by:'Agent '+req.agent.name,pdf:raw.pdf?`/api/projects/${req.project.id}/pdf?file=${encodeURIComponent(raw.pdf)}&t=${Date.now()}`:null};
 db.prepare('INSERT INTO compiles (id,project_id,user_id,ok,ms,engine,log,created_at) VALUES (?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),req.project.id,req.user.id,result.ok?1:0,result.ms,result.engine,result.log.slice(0,200000),Date.now());touchProject(req.project.id);broadcastProject(req.project.id,{type:'compile:result',result,cached:false});event(req.project,req.agent,'compile',{mainFile:main,engine,ok:result.ok});res.json({...result,pdf:raw.pdf?`/api/agent/v1/projects/${req.project.id}/pdf?file=${encodeURIComponent(raw.pdf)}`:null});
}));
agentApiRouter.get('/projects/:id/pdf',scope('read'),handle((req,res)=>{const rel=req.query.file||path.basename(req.project.main_file,path.extname(req.project.main_file))+'.pdf';if(typeof rel!=='string'||!rel.endsWith('.pdf'))throw failure(400,'仅支持 PDF');const full=safeFile(req.project,rel);if(!fs.existsSync(full))throw failure(404,'PDF 不存在');res.type('application/pdf').sendFile(full);}));
