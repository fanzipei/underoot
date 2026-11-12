import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
import express from 'express';import multer from 'multer';
import {db} from './db.js';import {which} from './paths.js';import {requireAuth} from './auth.js';import {failure} from './project-history.js';
db.exec(`CREATE TABLE IF NOT EXISTS publishing_templates(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,payload TEXT NOT NULL,created_at INTEGER NOT NULL)`);
const enabled=()=>{if(!db.prepare("SELECT enabled FROM extensions WHERE id='underoot.templates'").get()?.enabled)throw failure(409,'模板扩展已停用');};
const hex=(v,fallback)=>/^#[a-f0-9]{6}$/i.test(v||'')?v.toUpperCase():fallback;
export function validateTemplate(input={}){
 if(!['slides','poster'].includes(input.kind))throw failure(400,'模板类型无效');
 const name=String(input.name||'').replace(/[\x00-\x1f]/g,'').trim();if(!name||name.length>70)throw failure(400,'模板名称需为 1–70 字符');
 const background=hex(input.background,'#FFFFFF');
 const rgb=[1,3,5].map((p)=>parseInt(background.slice(p,p+2),16));const dark=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722<140;
 return{kind:input.kind,name,description:String(input.description||'自定义视觉风格').slice(0,250),accent:hex(input.accent,'#234E78'),background,foreground:dark?'#F0F5F7':'#1C2933',
  font:input.font==='serif'?'serif':'sans',header:['plain','rule','band'].includes(input.header)?input.header:'rule',density:input.density==='compact'?'compact':'comfortable',
  ratio:input.ratio==='43'?'43':'169',orientation:input.orientation==='landscape'?'landscape':'portrait',columns:input.columns===2?2:3,titleScale:Number.isFinite(input.titleScale)?Math.max(1.3,Math.min(3.5,input.titleScale)):2.3,theme:'default',source:['pdf','plugin'].includes(input.source)?input.source:'custom'};
}
export function listCustomTemplates(userId){return db.prepare('SELECT * FROM publishing_templates WHERE user_id=? ORDER BY created_at DESC').all(userId).map((r)=>({...JSON.parse(r.payload),id:r.id,createdAt:r.created_at}));}
export function registerTemplate(userId,input,source='custom'){
 enabled();const value=validateTemplate({...input,source});
 if(db.prepare('SELECT count(*) AS n FROM publishing_templates WHERE user_id=?').get(userId).n>=40)throw failure(413,'每用户最多保存 40 个自定义模板');
 const id='custom-'+crypto.randomUUID();db.prepare('INSERT INTO publishing_templates VALUES(?,?,?,?)').run(id,userId,JSON.stringify(value),Date.now());return{...value,id};
}
let extracting=0;
function tool(name){return process.env.UNDEROOT_POPPLER_BIN?path.join(process.env.UNDEROOT_POPPLER_BIN,name+(process.platform==='win32'?'.exe':'')):which(name);}
export const templateTools=()=>({available:!!tool('pdftohtml')&&!!tool('pdftoppm')});
function run(binary,args){return new Promise((resolve,reject)=>{
 const limiter=process.platform==='linux'?which('prlimit'):null;
 const proc=spawn(limiter||binary,limiter?['--as=536870912','--cpu=20','--',binary,...args]:args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let size=0;let output='';let error='';const timer=setTimeout(()=>{proc.kill();reject(failure(504,'PDF 分析超时，已停止'));},25000);
 proc.stdout.setEncoding('utf8');proc.stderr.setEncoding('utf8');
 proc.stdout.on('data',(b)=>{size+=Buffer.byteLength(b);if(size>2000000){proc.kill();reject(failure(413,'PDF 文本结构过大'));}else output+=b;});
 proc.stderr.on('data',(b)=>{if(error.length<1000)error+=b;});
 proc.on('error',()=>{clearTimeout(timer);reject(failure(503,'无法启动 PDF 分析工具'));});
 proc.on('close',(code)=>{clearTimeout(timer);code===0?resolve(output):reject(failure(400,'PDF 无法分析：请使用未加密、结构有效的 PDF'));});
});}
const attributes=(s)=>Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map((m)=>[m[1],m[2]]));
function palette(buffer){
 const header=buffer.subarray(0,100).toString('ascii').match(/^P6\s+(\d+)\s+(\d+)\s+255\s/);if(!header)return[];
 const start=header[0].length;const pixels=Number(header[1])*Number(header[2]);const step=Math.max(1,Math.floor(pixels/12000));const colors=new Map();
 for(let i=0;i<pixels;i+=step){const p=start+i*3;if(p+2>=buffer.length)break;const rgb=[buffer[p],buffer[p+1],buffer[p+2]].map((v)=>Math.min(255,Math.floor(v/24)*24+12));const key=rgb.join(',');colors.set(key,(colors.get(key)||0)+1);}
 return[...colors].sort((a,b)=>b[1]-a[1]).map(([key,count])=>({rgb:key.split(',').map(Number),count}));
}
const colorHex=(rgb)=>'#'+rgb.map((v)=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
export async function extractPdfTemplate(buffer,kind,name){
 enabled();
 if(!Buffer.isBuffer(buffer)||buffer.length>20*1024*1024||buffer.subarray(0,5).toString()!=='%PDF-')throw failure(400,'请上传 ≤20 MB 的有效 PDF');
 if(!templateTools().available)throw failure(503,'请在主机安装 Poppler（pdftohtml、pdftoppm），或设置 UNDEROOT_POPPLER_BIN');
 if(!['slides','poster'].includes(kind))throw failure(400,'请选择 Slides 或 Poster');
 if(extracting>=2)throw failure(429,'PDF 分析器正忙，请稍后重试');extracting++;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'underoot-pdf-style-'));const file=path.join(dir,'source.pdf');fs.writeFileSync(file,buffer,{mode:0o600});
 try{
  const xml=await run(tool('pdftohtml'),['-xml','-i','-hidden','-f','1','-l','3','-stdout',file]);
  const page=attributes(xml.match(/<page\b([^>]*)>/)?.[1]||'');const width=Number(page.width);const height=Number(page.height);
  if(!width||!height)throw failure(400,'未能识别 PDF 页面尺寸');
  const fonts=[...xml.matchAll(/<fontspec\b([^>]*?)\/?\s*>/g)].map((m)=>attributes(m[1]));
  const texts=[...xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)].map((m)=>({...attributes(m[1]),length:m[2].replace(/<[^>]*>/g,'').length}));
  const fontColors=fonts.map((f)=>({color:hex(f.color,null),weight:texts.filter((t)=>t.font===f.id).reduce((n,t)=>n+t.length,0)})).filter((f)=>f.color&&Math.max(...[1,3,5].map((p)=>parseInt(f.color.slice(p,p+2),16)))-Math.min(...[1,3,5].map((p)=>parseInt(f.color.slice(p,p+2),16)))>45).sort((a,b)=>b.weight-a.weight);
  const prefix=path.join(dir,'preview');await run(tool('pdftoppm'),['-f','1','-l','1','-singlefile','-scale-to','600',file,prefix]);
  const colors=palette(fs.readFileSync(prefix+'.ppm'));const backgroundRgb=colors[0]?.rgb||[255,255,255];
  const colorful=colors.find((c)=>Math.max(...c.rgb)-Math.min(...c.rgb)>45&&c.rgb.reduce((n,v)=>n+v,0)>100);
  const background=backgroundRgb.every((n)=>n>240)?'#FFFFFF':colorHex(backgroundRgb);
  const accent=fontColors[0]?.color||(colorful?colorHex(colorful.rgb):'#234E78');
  const families=fonts.map((f)=>String(f.family||'')).join(' ');const font=/sans|helvetica|arial|gothic|黑体/i.test(families)?'sans':'serif';
  const clusters=[];for(const text of texts.filter((t)=>Number(t.top)/height>.18&&Number(t.width)/width<.65)){const x=Number(text.left)/width;const found=clusters.find((c)=>Math.abs(c.x-x)<.12);if(found)found.n++;else clusters.push({x,n:1});}
  const columns=Math.min(3,Math.max(2,clusters.filter((c)=>c.n>=4).length));
  const rankedFonts=fonts.map((f)=>({size:Number(f.size),weight:texts.filter((t)=>t.font===f.id).reduce((n,t)=>n+t.length,0)})).sort((a,b)=>b.weight-a.weight);
  const bodySize=rankedFonts[0]?.size||24;const largest=Math.max(bodySize,...rankedFonts.map((f)=>f.size).filter(Number.isFinite));
  const template=validateTemplate({kind,name:name||'PDF 视觉风格',description:'从 PDF 前三页提取的近似视觉风格，需预览核对',accent,background,font,titleScale:largest/bodySize,density:bodySize/height<.012?'compact':'comfortable',header:background==='#FFFFFF'?'rule':'band',columns,orientation:width>height?'landscape':'portrait',ratio:width/height>1.55?'169':'43',source:'pdf'});
  await run(tool('pdftoppm'),['-f','1','-l','1','-singlefile','-scale-to','600','-png',file,prefix]);
  const sizes=fonts.map((f)=>Number(f.size)).filter(Number.isFinite).sort((a,b)=>b-a);
  return{template,profile:{ratio:Math.round(width/height*1000)/1000,fontSizes:[...new Set(sizes)].slice(0,6),fontStyle:font,analyzedPages:Math.min(3,[...xml.matchAll(/<page\b/g)].length),sourceHash:crypto.createHash('sha256').update(buffer).digest('hex')},preview:'data:image/png;base64,'+fs.readFileSync(prefix+'.png').toString('base64'),warnings:['提取的是配色、字体层级与版式线索，不是原始 LaTeX 模板。','复杂图形、Logo 与宏不复制；原 PDF 不会保存在模板库，也不会发送给模型。',...(!fontColors.length&&!colorful?['未检测到明显强调色，使用默认蓝色，可手动调整。']:[])]};
 }finally{extracting--;fs.rmSync(dir,{recursive:true,force:true});}
}
export const publishingTemplatesRouter=express.Router();publishingTemplatesRouter.use(requireAuth);
const handle=(fn)=>(req,res,next)=>Promise.resolve().then(()=>{enabled();return fn(req,res);}).catch(next);
publishingTemplatesRouter.get('/',handle((req,res)=>res.json({templates:listCustomTemplates(req.user.id),tools:templateTools()})));
publishingTemplatesRouter.post('/',handle((req,res)=>{if(req.body?.confirmed!==true)throw failure(400,'请先确认模板视觉风格');res.json({template:registerTemplate(req.user.id,req.body.template,req.body.template?.source==='pdf'?'pdf':'custom')});}));
publishingTemplatesRouter.delete('/:id',handle((req,res)=>{db.prepare('DELETE FROM publishing_templates WHERE id=? AND user_id=?').run(req.params.id,req.user.id);res.json({ok:true});}));
publishingTemplatesRouter.get('/:id/download',handle((req,res)=>{const template=listCustomTemplates(req.user.id).find((t)=>t.id===req.params.id);if(!template)throw failure(404,'模板不存在');res.type('application/json').set('Content-Disposition','attachment; filename="underoot-template.json"').send(JSON.stringify(template,null,2));}));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:1}});
publishingTemplatesRouter.post('/extract',(req,res,next)=>upload.single('file')(req,res,(error)=>error?next(failure(400,'请上传单个 ≤20 MB PDF')):next()),handle(async(req,res)=>{if(!req.file)throw failure(400,'请选择 PDF');res.json(await extractPdfTemplate(req.file.buffer,req.body.kind,String(req.body.name||path.basename(req.file.originalname,'.pdf')).slice(0,70)));}));
