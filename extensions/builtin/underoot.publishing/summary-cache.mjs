import{SUMMARY_MAX_CHARS}from'../../../skills/underoot-paper-publishing/scripts/summary-policy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DATA_DIR} from '../../../server/paths.js';
import {aiConfig} from '../../../server/ai-service.js';
/** Private, validated chunk summaries only; no keys or manuscript files. */
export function summaryCache(project,user,plan){
 const config=aiConfig(true),scope=crypto.createHash('sha256').update(JSON.stringify(['summary-v3',project.id,user,plan.digest,config.baseUrl,config.model])).digest('hex');
 const dir=path.join(DATA_DIR,'cache','publishing-summaries'),file=path.join(dir,scope+'.json');let entries={};
 try{if(fs.statSync(file).size<=8*1024*1024)entries=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 if(!entries||typeof entries!=='object'||Array.isArray(entries))entries={};
 return{get(key){const value=entries[key];return typeof value==='string'&&value.trim()&&value.length<=SUMMARY_MAX_CHARS?value:null;},set(key,value){
  if(!/^[a-f0-9]{64}$/.test(key)||typeof value!=='string'||!value.trim()||value.length>SUMMARY_MAX_CHARS)return;
  entries[key]=value;fs.mkdirSync(dir,{recursive:true,mode:0o700});const temp=file+'.'+crypto.randomUUID()+'.tmp';
  fs.writeFileSync(temp,JSON.stringify(entries),{mode:0o600});fs.renameSync(temp,file);
 }};
}
