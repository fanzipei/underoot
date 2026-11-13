import assert from'node:assert/strict';import QRCode from'qrcode';import{PNG}from'pngjs';
import{publicationIdentity}from'../skills/underoot-paper-publishing/scripts/publication-identity.mjs';
import{measurements,measuredColumns,fitPublication,adjustLayout}from'../skills/underoot-paper-publishing/scripts/fit-layout.mjs';
let count=0;const check=(name,v)=>{assert.ok(v,name);count++;console.log('✓',name);};
const parsed=publicationIdentity(String.raw`% \author{Not an author}
\author[1]{Alice \textbf{Example}}\author[2]{Bob Example}
\affil[1]{Example University}\affil[2]{Example Institute}
\email{alice@example.test}\email{bob@example.test}
\begin{document}\maketitle\author{Not metadata}\end{document}`);
check('all author declarations retain institution indices',parsed.authors==='[1] Alice Example\n[2] Bob Example');
check('all affiliations retained',parsed.affiliations==='[1] Example University\n[2] Example Institute');
check('all contacts retained',parsed.contact.includes('alice@example.test')&&parsed.contact.includes('bob@example.test'));
check('comments and manuscript examples cannot add authors',!parsed.authors.includes('Not'));
const acm=publicationIdentity(String.raw`\author{One}\affiliation{\institution{Example University}\country{Country}}\author{Two}\affiliation{\institution{Research Center}\country{Country}}`);
check('nested ACM affiliations retained',acm.authors.includes('Two')&&acm.affiliations.includes('Research Center')&&acm.affiliations.includes('Country'));
const m=measurements('UNDEROOT:BLOCK:a:130.3pt\nUNDEROOT:BODY:1000.0pt\nUNDEROOT:SLIDE:b:70.3pt:100.0pt');
check('actual TeX heights parsed',m.blocks.a===130.3&&m.available===1000&&m.slides.b.height===70.3);
const pages=['a','b','c','d','e'].map(id=>({id}));const columns=measuredColumns(pages,{a:100,b:100,c:500,d:100,e:100},3);
check('height-based partition preserves every block and order',columns.flat().join()===pages.map(p=>p.id).join());check('tall visual gets its own balanced column',columns.some(ids=>ids.length===1&&ids[0]==='c'));
const editorial={pages:[{id:'a',layout:'split',figures:[],bullets:['A']},{id:'b',layout:'split',figures:[],bullets:['B']}],columns:[],rounds:[]};
let written,calls=0;
const result=await fitPublication({editorial},{kind:'slides'},{maxRounds:2,render:info=>JSON.stringify(info.editorial),write:content=>written=JSON.parse(content),audit:async()=>{calls++;const bad=written.pages.some(p=>p.slideFont);return{status:bad?'needs-review':'passed',issues:bad?['overflow']:[],errors:[],measurements:{slides:{a:{height:bad?150:40,available:100},b:{height:bad?150:40,available:100}}}};}});
check('sparse slides do not trigger enlargement or extra compilation',calls===1&&result.status==='passed'&&!written.pages.some(p=>p.slideFont)&&!written.slideFont);
check('deck typography stays uniform without per-page font changes',!editorial.pages.some(p=>p.slideFont||p.centered));
const absent=await fitPublication({editorial:structuredClone(editorial)},{kind:'slides'},{render:()=>'',write:()=>{},audit:async()=>({status:'unavailable',issues:[]})});
check('missing native engine is disclosed without claiming measurements',absent.status==='unavailable'&&absent.iterations.length===1&&!absent.usage);
const dense={pages:[{id:'a',bullets:[],figures:[]}],columns:[['a']],posterFont:32};adjustLayout(dense,{kind:'poster',columns:1},{blocks:{a:1070},available:1000},{maximum:1.07,minimum:1.07},true);check('dense poster keeps readable 32pt while tightening leading',dense.posterFont===32&&dense.posterLeading===37);
let trial=0;const badStory={pages:[{id:'a',bullets:[],figures:[]}],columns:[['a']],posterFont:36,rounds:[{},{},{},{metrics:{columnWeights:[1200]}}]};const bestInvalid=await fitPublication({editorial:badStory},{kind:'poster',columns:1},{maxRounds:4,render:i=>JSON.stringify(i.editorial),write:()=>{},audit:async()=>({status:'needs-review',issues:['too many pages'],errors:[],measurements:{blocks:{a:++trial===1?1300:1100},available:1000}})});check('rejected layouts choose the closest fit instead of first tied failure',bestInvalid.usage.maximum===1.1&&badStory.posterFont===32);
const url='https://github.com/fanzipei/underoot',buffer=await QRCode.toBuffer(url,{width:1000,margin:4,errorCorrectionLevel:'M'}),png=PNG.sync.read(buffer),qr=QRCode.create(url,{errorCorrectionLevel:'M'}),step=png.width/(qr.modules.size+8);
let matching=true;for(let y=0;y<qr.modules.size;y++)for(let x=0;x<qr.modules.size;x++){const at=(Math.floor((y+4.5)*step)*png.width+Math.floor((x+4.5)*step))*4;if((png.data[at]<128)!==!!qr.modules.get(y,x))matching=false;}
check('PNG module matrix encodes the intended project URL',matching);
check('QR quiet zone stays white and opaque',png.data[0]===255&&png.data[1]===255&&png.data[2]===255&&png.data[3]===255);
console.log(`Publication fit unit: ${count}/${count} passed`);
