import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { BIN_DIR, projectDir, resolveInside, normalizeRelPath, which } from './paths.js';
import { digest, snapshot, failure } from './project-history.js';
import { recordVersion, touchProject } from './db.js';
import { flushProject, syncExternalWrite, broadcastProject } from './collab.js';
import {findTables} from '../src/plugins/table-model.js';
const supported = (name) => /\.(md|markdown|tex)$/i.test(name);
let conversions = 0;

function tableBlock(content){
 if(typeof content!=='string'||!content.length||Buffer.byteLength(content)>150000)throw failure(400,'表格片段需为非空 TeX，限 150 KB');
 const tables=findTables(content);if(tables.length!==1||content.slice(0,tables[0].from).trim()||content.slice(tables[0].to).trim())throw failure(400,'只能编辑一个完整的 tabular / tabularx 表格片段');
 return content;
}
function tableFile(project,rel){
 const name=normalizeRelPath(rel);if(!/\.tex$/i.test(name))throw failure(400,'表格必须位于 TeX 文件中');flushProject(project.id);
 const full=resolveInside(projectDir(project.id),name);if(!fs.existsSync(full))throw failure(404,'文件不存在');
 if(fs.statSync(full).size>5*1024*1024)throw failure(413,'表格所在文件上限为 5 MB');const bytes=fs.readFileSync(full),text=bytes.toString('utf8');if(bytes.includes(0)||!Buffer.from(text).equals(bytes))throw failure(400,'文件必须为 UTF-8 TeX 文本');return{name,full,text};
}
function locateTable(text,target,before){
 let from=target.from,to=target.to;if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to-from!==before.length)throw failure(400,'表格区域坐标无效');
 if(text.slice(from,to)!==before){
  from=text.indexOf(before);
  if(from>=0){if(text.indexOf(before,from+1)>=0)throw failure(409,'当前表格位置不唯一，请重新点击该表格的编辑按钮');to=from+before.length;}
  else{
   // CodeMirror normalizes line separators. Match only this quoted block,
   // mapping back to raw offsets so CRLF outside it remains untouched.
   const normalized=text.replace(/\r\n?/g,'\n'),quote=before.replace(/\r\n?/g,'\n'),at=normalized.indexOf(quote);
   if(at<0||normalized.indexOf(quote,at+1)>=0)throw failure(409,'当前表格已变化或位置不唯一，请重新点击该表格的编辑按钮');
   const rawOffset=offset=>{let raw=0;for(let i=0;i<offset;i++,raw++)if(text[raw]==='\r'&&text[raw+1]==='\n')raw++;return raw;};from=rawOffset(at);to=rawOffset(at+quote.length);
  }
 }
 return{from,to};
}
const tableResult=(name,text,range,content)=>({path:name,...range,content,hash:digest(content),startLine:text.slice(0,range.from).split('\n').length,endLine:text.slice(0,range.to).split('\n').length});
export function readTableDocument(project,target){
 if(!target)throw failure(400,'请从 TeX 表格区域打开编辑器');const quote=tableBlock(target.source),f=tableFile(project,target.path),range=locateTable(f.text,target,quote),content=tableBlock(f.text.slice(range.from,range.to));return tableResult(f.name,f.text,range,content);
}
export function writeTableDocument(project,user,input){
 const before=tableBlock(input.before),content=tableBlock(input.content);if(typeof input.hash!=='string'||digest(before)!==input.hash)throw failure(400,'表格片段哈希无效');const f=tableFile(project,input.path),range=locateTable(f.text,input,before);
 // The iframe receives and submits this block only. Other author edits are
 // preserved byte-for-byte, even when they moved the table in the document.
 const next=f.text.slice(0,range.from)+content+f.text.slice(range.to);
 if(next!==f.text){snapshot(project.id,user,`表格修改前：${f.name}`,'document',true);fs.writeFileSync(f.full,next);recordVersion({projectId:project.id,path:f.name,content:next,authorId:user,force:true});syncExternalWrite(project.id,f.name,next);touchProject(project.id);snapshot(project.id,user,`表格修改：${f.name}`,'document',true);broadcastProject(project.id,{type:'file:changed',path:f.name});}
 return tableResult(f.name,next,{from:range.from,to:range.from+content.length},content);
}
export function readDocument(project, rel) {
 const name = normalizeRelPath(rel || project.main_file);
 if (!supported(name)) throw failure(400, '仅支持 Markdown / TeX 文件');
 flushProject(project.id);
 const full = resolveInside(projectDir(project.id), name);
 if (!fs.existsSync(full)) throw failure(404, '文件不存在');
 if (fs.statSync(full).size > 150000) throw failure(413, '文档编辑上限为 150 KB');
 const content = fs.readFileSync(full, 'utf8'); return { path: name, content, hash: digest(content) };
}
export function writeDocument(project, user, input) {
 const name = normalizeRelPath(input.path || '');
 if (!supported(name) || typeof input.content !== 'string' || Buffer.byteLength(input.content) > 150000) throw failure(400, '文档路径或内容无效（限 150 KB）');
 flushProject(project.id);
 const full = resolveInside(projectDir(project.id), name);
 const exists = fs.existsSync(full);
 if (exists ? digest(fs.readFileSync(full)) !== input.hash : input.hash !== null) throw failure(409, '文件已被协作者修改或同名文件已存在，请重新读取/另存');
 snapshot(project.id, user, `插件保存前：${name}`, 'document', true);
 fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, input.content);
 recordVersion({ projectId: project.id, path: name, content: input.content, authorId: user, force: true });
 syncExternalWrite(project.id, name, input.content); touchProject(project.id);
 snapshot(project.id, user, `插件保存：${name}`, 'document', true);
 broadcastProject(project.id, { type: 'file:changed', path: name });
 return { path: name, content: input.content, hash: digest(input.content) };
}
export function convertDocument(input) {
 const from = input.from === 'tex' ? 'latex' : input.from === 'markdown' ? 'markdown+tex_math_dollars+citations' : null;
 if (!from || typeof input.content !== 'string' || Buffer.byteLength(input.content) > 150000) throw failure(400, '转换参数无效');
 const bundled = path.join(BIN_DIR, process.platform === 'win32' ? 'pandoc.exe' : 'pandoc');
 const binary = fs.existsSync(bundled) ? bundled : which('pandoc');
 if (!binary) throw failure(503, '请先运行 node scripts/install-pandoc.mjs 安装转换器');
 if (conversions >= 2) throw failure(429, '转换器正忙，请稍后重试');
 const to = input.from === 'tex' ? 'markdown+tex_math_dollars+raw_tex' : 'latex';
 conversions++;
 return new Promise((resolve, reject) => {
  const args = ['--sandbox', '--from', from, '--to', to, '--wrap=none'];
  if (input.from === 'markdown') args.push('--standalone', '--variable=documentclass:ctexart', '--variable=classoption:UTF8', '--pdf-engine=xelatex');
  // The Markdown conversion emits a self-contained article source, without
  // evaluating TeX, shell commands, filters, includes or external resources.
  const proc = spawn(binary, args, { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
  proc.stdout.setEncoding('utf8'); proc.stderr.setEncoding('utf8');
  let out = ''; let errors = ''; let bytes = 0;
  const timer = setTimeout(() => { proc.kill(); reject(failure(504, '转换超时')); }, 15000);
  proc.on('error', () => { clearTimeout(timer); reject(failure(503, '无法启动 Pandoc')); });
  proc.stdout.on('data', (b) => { bytes += b.length; if (bytes > 500000) { proc.kill(); reject(failure(413, '转换结果过大')); } else out += b; });
  proc.stderr.on('data', (b) => { errors += b.toString().slice(0, 5000 - errors.length); });
  proc.stdin.on('error', () => {}); proc.stdin.end(input.content);
  proc.on('close', (code) => {
   clearTimeout(timer);
   if (code !== 0) { reject(failure(400, `Pandoc 转换失败：${errors.slice(0, 500)}`)); return; }
   resolve({ content: out, extension: input.from === 'tex' ? 'md' : 'tex', warnings: ['复杂宏、会议模板和版式可能无法无损互转；原文件保持保留。', ...(errors ? [errors.slice(0,1000)] : [])] });
  });
 }).finally(() => { conversions--; });
}
