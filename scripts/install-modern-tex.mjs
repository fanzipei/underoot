/** Fixed upstream build, streamed downloads and SHA-256 verification. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
export const TEX_BUILD = 'tl2026-46ebb621';
const root = fileURLToPath(new URL('../public/wasm/' + TEX_BUILD + '/', import.meta.url));
const release = 'https://github.com/TeXlyre/texlyre-busytex-build/releases/download/build_wasm_46ebb6216a5c1fe63dd1dc885831d1a8cef2dc86_31802832436_1/';
const assets = [
 ['busytex.js',271047,'875b87795162cb26b15bd93cffa2e8739bcb900d623ab904029b39402508a1a4'],
 ['busytex.wasm',32507525,'8d1988fc58cd1611c3cbd6bd986c3e607e5ff44f1d94252207ff7aae4cee72e0'],
 ['busytex_biber.js',3688,'e1a3ff55a120e392d3a7ef27f1bff1978c7a9d5978999296e39e1cfeac01d923'],
 ['busytex_pipeline.js',36266,'4855e8fec24e8df952e1080d902791752bcdf283f4fae15811c371dd3ba3389e'],
 ['busytex_worker.js',3123,'80eca56a2eb015bdfbebff26e539dd793407b73b6c1cd351170e6fdb6e17c39a'],
 ['texlive-basic.data',92785062,'ccb35d98d77cbaf988e1481f8538709f72166196785cf6b8785eabe6c8fb2993'],
 ['texlive-basic.js',2091651,'d4abc2e93a1ae33099107c6ad8a61813978cd44036a95697db2f2365a393c283'],
];
export async function installModernTeX(){
 fs.mkdirSync(root,{recursive:true});
 for(const[name,size,sha]of assets){
  const dest=path.join(root,name);
  if(fs.existsSync(dest)&&fs.statSync(dest).size===size){
   const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(dest))hash.update(chunk);
   if(hash.digest('hex')===sha)continue;
  }
  console.log(`[WASM] Downloading verified TeX Live 2026 asset: ${name}`);
  const tmp=dest+'.'+process.pid+'.tmp';let bytes=0;const hash=crypto.createHash('sha256');
  try{
   const res=await fetch(release+name+'?download=1',{signal:AbortSignal.timeout(300000)});if(!res.ok)throw Error(`HTTP ${res.status}: ${name}`);
   await pipeline(Readable.fromWeb(res.body),new Transform({transform(chunk,_encoding,next){bytes+=chunk.length;if(bytes>size)return next(Error('Asset exceeds expected size'));hash.update(chunk);next(null,chunk);}}),fs.createWriteStream(tmp));
   if(bytes!==size||hash.digest('hex')!==sha)throw Error('WASM asset checksum mismatch: '+name);
   fs.renameSync(tmp,dest);
  }finally{fs.rmSync(tmp,{force:true});}
 }
 fs.copyFileSync(fileURLToPath(new URL('../public/wasm/modern-worker.js',import.meta.url)),path.join(root,'underoot-worker.js'));
 return root;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await installModernTeX();
