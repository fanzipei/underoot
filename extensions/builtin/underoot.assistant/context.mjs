import crypto from 'node:crypto';
export const REVIEW_POLICY={automaticChars:2200,manualChars:6000,automaticIntervalMs:90000,automaticCalls:3,manualCalls:6,windowMs:600000,automaticOutput:550,manualOutput:1200};
export const contextHash=(value)=>crypto.createHash('sha256').update(value).digest('hex');
/** Bound the current paragraph/selection; never take a paper's first N chars. */
export function reviewContext(text,{from=0,to=from,automatic=false}={}){
 const limit=automatic?REVIEW_POLICY.automaticChars:REVIEW_POLICY.manualChars;
 from=Math.max(0,Math.min(text.length,Number.isInteger(from)?from:0));to=Math.max(from,Math.min(text.length,Number.isInteger(to)?to:from));
 const paragraphStart=text.lastIndexOf('\n\n',Math.max(0,from-1));const paragraphEnd=text.indexOf('\n\n',to);
 let start=paragraphStart<0?0:paragraphStart+2;let end=paragraphEnd<0?text.length:paragraphEnd;
 if(end-start>limit){start=Math.max(start,from-Math.floor(limit/4));end=Math.min(text.length,start+limit);if(to>end&&to-from<=limit){end=to;start=Math.max(0,end-limit);}}
 if(start>0&&/[\uDC00-\uDFFF]/.test(text[start]))start++;
 if(end>start&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;
 return{from:start,to:end,content:text.slice(start,end),chars:end-start,truncatedSelection:to-from>limit};
}
export class ReviewBudget{
 constructor(now=()=>Date.now()){this.now=now;this.users=new Map();}
 entries(user){const now=this.now();if(this.users.size>1000)for(const[k,v]of this.users)if(!v.some((e)=>now-e.time<REVIEW_POLICY.windowMs))this.users.delete(k);const entries=(this.users.get(user)||[]).filter((e)=>now-e.time<REVIEW_POLICY.windowMs);this.users.set(user,entries);return entries;}
 status(user){const entries=this.entries(user);return{windowMinutes:10,calls:entries.length,automaticCalls:entries.filter((e)=>e.automatic).length,inputChars:entries.reduce((n,e)=>n+e.chars,0),automaticLimit:3,totalLimit:6};}
 reserve(user,automatic,chars){const entries=this.entries(user);const auto=entries.filter((e)=>e.automatic);const now=this.now();
  if(entries.length>=6||entries.reduce((n,e)=>n+e.chars,0)+chars>36000)return{allowed:false,reason:'本用户本轮审阅预算已用完；10 分钟内最多 6 次调用、36,000 字符'};
  if(automatic&&(auto.length>=3||(auto.length&&now-auto.at(-1).time<90000)))return{allowed:false,reason:'自动建议正在冷却；最多每 90 秒一次、每 10 分钟三次'};
  if(!automatic&&entries.length&&now-entries.at(-1).time<15000)return{allowed:false,reason:'请稍候再审阅；相同上下文可直接复用缓存'};
  entries.push({time:now,automatic,chars});return{allowed:true};
 }
}
