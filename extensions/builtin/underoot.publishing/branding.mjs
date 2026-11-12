import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import {DATA_DIR,resolveInside} from '../../../server/paths.js';
import {failure} from '../../../server/project-history.js';
export function imageAssets(root){
 const assets=[];let visited=0;
 const walk=(dir,prefix='')=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(++visited>4500)return;if(entry.isSymbolicLink()||entry.name.startsWith('.'))continue;const name=prefix+entry.name;if(entry.isDirectory())walk(path.join(dir,entry.name),name+'/');else if(/^[\p{L}\p{N} _./-]+\.(png|jpe?g|pdf)$/iu.test(name))assets.push(name);}};
 walk(root);return assets.slice(0,200);
}
export function validateIdentity(input,assets,fallback={}){
 const value=input||fallback;const text=(name,max)=>{const v=value[name]??fallback[name]??'';if(typeof v!=='string'||v.length>max)throw failure(400,'署名信息过长或格式不正确');return v.trim();};
 const identity={authors:text('authors',5000),affiliations:text('affiliations',5000),contact:text('contact',1000),projectUrl:text('projectUrl',300),reserveCode:value.reserveCode!==false};
 if(!identity.authors)throw failure(400,'请填写完整作者信息');
 if(identity.projectUrl){let url;try{url=new URL(identity.projectUrl);}catch{throw failure(400,'项目链接应为完整 HTTPS 地址');}if(url.protocol!=='https:'||url.username||url.password)throw failure(400,'项目链接应为不含登录凭据的 HTTPS 地址');}
 if(!Array.isArray(value.logos||[])||(value.logos||[]).length>6||(value.logos||[]).some(p=>!assets.includes(p)))throw failure(400,'最多选择六个来自项目或上传的单位图标');
 identity.logos=[...new Set(value.logos||[])];return identity;
}
const storage=()=>{const dir=path.join(DATA_DIR,'publication-branding');fs.mkdirSync(dir,{recursive:true});return dir;};
export function saveBrandAsset(buffer){
 let ext;if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){if(buffer.length<24||buffer.readUInt32BE(16)*buffer.readUInt32BE(20)>25000000)throw failure(400,'图标尺寸过大');ext='png';}
 else if(buffer[0]===255&&buffer[1]===216&&buffer[2]===255)ext='jpg';else if(buffer.subarray(0,5).toString()==='%PDF-')ext='pdf';else throw failure(400,'图标仅支持 PNG、JPEG 或 PDF');
 if(buffer.length>3*1024*1024)throw failure(413,'单位图标不能超过 3 MB');
 const id=crypto.randomUUID()+'.'+ext;fs.writeFileSync(path.join(storage(),id),buffer,{mode:0o600});return{path:'underoot-publishing/branding/'+id,id};
}
export async function materializeBranding(dir,identity,uploaded=[]){
 for(const asset of uploaded.filter(a=>identity.logos.includes(a.path))){const dest=resolveInside(dir,asset.path);fs.mkdirSync(path.dirname(dest),{recursive:true});if(!fs.existsSync(dest))fs.copyFileSync(resolveInside(storage(),asset.id),dest);}
 if(identity.projectUrl){identity.qrPath='underoot-publishing/branding/qr-'+crypto.randomUUID()+'.png';const dest=resolveInside(dir,identity.qrPath);fs.mkdirSync(path.dirname(dest),{recursive:true});await QRCode.toFile(dest,identity.projectUrl,{width:1000,margin:4,errorCorrectionLevel:'M',color:{dark:'#000000ff',light:'#ffffffff'}});}
 return identity;
}
