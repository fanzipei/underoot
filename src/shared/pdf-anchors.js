export const normalizePdfText=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function pdfRevision(bytes){let h=2166136261;for(const b of bytes)h=Math.imul(h^b,16777619);return 'v1:'+bytes.length+':'+(h>>>0).toString(16);}
export function clampRect(r){const x=Math.max(0,Math.min(.996,r.x)),y=Math.max(0,Math.min(.996,r.y));return{x,y,w:Math.max(.004,Math.min(1-x,r.w)),h:Math.max(.004,Math.min(1-y,r.h))};}
const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
export function bounds(items){const x=Math.min(...items.map(i=>i.x)),y=Math.min(...items.map(i=>i.y));return{x,y,w:Math.max(...items.map(i=>i.x+i.w))-x,h:Math.max(...items.map(i=>i.y+i.h))-y};}
export function textIndex(items){let text='';const spans=[];for(const i of items){const key=normalizePdfText(i.str);if(!key)continue;const start=text.length;text+=key;spans.push({...i,start,end:text.length});}return{text,spans};}
export function capturePdfAnchor(index,page,rect,revision){
 const selected=index.spans.filter(i=>overlap(i,rect)>=i.w*i.h*.2&&i.w>0&&i.h>0),quote=selected.map(i=>i.str).join(' ').slice(0,900);let text=null;
 if(normalizePdfText(quote).length>=12&&selected.length){const key=normalizePdfText(quote),start=selected[0].start;text={quote,key,before:index.text.slice(Math.max(0,start-80),start),after:index.text.slice(selected.at(-1).end,selected.at(-1).end+80),box:bounds(selected)};}
 const images=(index.images||[]).filter(i=>i.hash&&i.contrast>7&&overlap(i,rect)>=Math.min(i.w*i.h,rect.w*rect.h)*.35).sort((a,b)=>overlap(b,rect)/(b.w*b.h)-overlap(a,rect)/(a.w*a.h));const image=images[0]?{hash:images[0].hash,aspect:images[0].aspect,box:{x:images[0].x,y:images[0].y,w:images[0].w,h:images[0].h},mean:images[0].mean}:null;
 return{version:1,revision,page,rect,text,image};
}
function transformRect(rect,oldBox,newBox){return clampRect({x:newBox.x+(rect.x-oldBox.x)/Math.max(.001,oldBox.w)*newBox.w,y:newBox.y+(rect.y-oldBox.y)/Math.max(.001,oldBox.h)*newBox.h,w:rect.w/Math.max(.001,oldBox.w)*newBox.w,h:rect.h/Math.max(.001,oldBox.h)*newBox.h});}
function hamming(a,b){if(a.length!==b.length)return 99;let n=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])n++;return n;}
export function resolvePdfAnchor(anchor,indexes,revision){
 const original={page:anchor.page,rect:anchor.rect,status:'unmatched',confidence:0};if(anchor.revision===revision)return{...original,status:'bound',confidence:1};const matches=[];
 if(anchor.text){const {key,before='',after=''}=anchor.text;for(const p of indexes){let at=p.text.indexOf(key);while(at>=0){const span=p.spans.filter(i=>i.end>at&&i.start<at+key.length);if(span.length){const prefix=p.text.slice(Math.max(0,at-80),at),suffix=p.text.slice(at+key.length,at+key.length+80);const context=(before&&prefix.endsWith(before.slice(-24))?.1:0)+(after&&suffix.startsWith(after.slice(0,24))?.1:0);matches.push({page:p.page,box:bounds(span),score:.8+context,type:'text'});}at=p.text.indexOf(key,at+1);if(matches.length>100)break;}
 // Small source edits: require two distant fragments to agree in the same local range.
 if(at<0&&!p.text.includes(key)&&key.length>=64){const first=key.slice(0,24),last=key.slice(-24),a=p.text.indexOf(first),b=a>=0?p.text.indexOf(last,a+24):-1;if(a>=0&&b>a&&b-a<key.length+180&&p.text.indexOf(first,a+1)<0){const span=p.spans.filter(i=>i.end>a&&i.start<b+24);if(span.length)matches.push({page:p.page,box:bounds(span),score:.72,type:'text'});}}
 }}
 if(!matches.length&&anchor.image){for(const p of indexes)for(const img of p.images||[]){const distance=hamming(anchor.image.hash,img.hash),aspect=Math.abs(img.aspect/anchor.image.aspect-1),color=Math.abs((img.mean||0)-(anchor.image.mean||0));if(distance<=8&&aspect<.12&&color<25)matches.push({page:p.page,box:img,score:.95-distance*.025-aspect*.2,type:'image'});}}
 matches.sort((a,b)=>b.score-a.score);const best=matches[0];if(!best||matches[1]&&best.score-matches[1].score<.08)return{...original,status:matches.length?'uncertain':'unmatched'};
 return{page:best.page,rect:transformRect(anchor.rect,best.type==='text'?anchor.text.box:anchor.image.box,best.box),status:best.type==='text'?'text':'image',confidence:best.score};
}
export function validatePdfAnchor(a){
 if(!a||a.version!==1||typeof a.revision!=='string'||a.revision.length>100||!Number.isInteger(a.page)||a.page<1||a.page>5000)throw Error('标注关联信息无效');const validBox=r=>r&&['x','y','w','h'].every(k=>Number.isFinite(r[k]))&&r.w>0&&r.h>0&&r.x>=0&&r.y>=0&&r.x+r.w<=1.01&&r.y+r.h<=1.01;if(!validBox(a.rect))throw Error('标注关联坐标无效');
 const out={version:1,revision:a.revision,page:a.page,rect:clampRect(a.rect)};
 if(a.text){if(typeof a.text.quote!=='string'||a.text.quote.length>900||normalizePdfText(a.text.quote).length<12||!validBox(a.text.box))throw Error('标注文字关联无效');out.text={quote:a.text.quote,key:normalizePdfText(a.text.quote),before:String(a.text.before||'').slice(-80),after:String(a.text.after||'').slice(0,80),box:a.text.box};}
 if(a.image){if(!/^[01]{64}$/.test(a.image.hash)||!validBox(a.image.box)||!Number.isFinite(a.image.aspect)||a.image.aspect<=0||a.image.aspect>100)throw Error('标注图片关联无效');out.image={hash:a.image.hash,box:a.image.box,aspect:a.image.aspect,mean:Math.max(0,Math.min(255,Number(a.image.mean)||0))};}
 if(a.source){const v=a.source,p=v.point;if(typeof v.path!=='string'||v.path.length>512||!v.path.endsWith('.tex')||v.path.startsWith('/')||/^[A-Za-z]:|(?:^|[\\/])\.\.(?:[\\/]|$)/.test(v.path)||typeof v.quote!=='string'||v.quote.length>480||!Number.isInteger(v.line)||v.line<1||!p||!['x','y','width','height'].every(k=>Number.isFinite(p[k]))||p.width<=0||p.height<=0||!Number.isInteger(p.page)||p.page<1)throw Error('源码关联信息无效');out.source={path:v.path,line:v.line,quote:v.quote,point:{page:p.page,x:p.x,y:p.y,width:p.width,height:p.height}};}
 return out;
}
