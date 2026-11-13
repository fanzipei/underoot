import {plainText} from './chunk-paper.mjs';
/** Extract intact, bounded statements that explicitly discuss a labelled asset.
 * No trend inference from pixels, arithmetic on results, or sentence clipping. */
export function assetFindings(source,label,chunks){
 if(!label)return[];const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const ref=new RegExp('\\\\(?:[cC]ref|[aA]utoref|ref|[cC]refrange)\\*?\\{'+escaped+'\\}');
 const claim=/outperform|improv|reduc|increas|decreas|degrad|worse|best|surpass|recover|demonstrat|show|indicat|achiev|enable|robust|consistent|propos|limitat|only|higher|lower|better|提升|降低|表明|优于|支持|验证|局限|仅|结果|说明/i;
 const found=[];
 for(const p of source.matchAll(/[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g)){
  if(!ref.test(p[0]))continue;
  const prose=p[0].replace(/\\begin\{(figure\*?|table\*?)\}(?:\[[^\]]*\])?[\s\S]*?\\end\{\1\}/g,'');
  let following=0;
  for(const raw of prose.replace(/\bFig\.\s*(?=\\)/g,'Figure ').split(/(?<=[。！？])\s*|(?<=[.!?])\s+(?=[A-Z\\])/)){
   if(ref.test(raw))following=3;
   else if(/\\(?:[cC]ref|[aA]utoref|ref)\*?\{/.test(raw))following=0;
   if(!following)continue;following--;
   if(!claim.test(raw))continue;
   let text=raw.replace(/\\(?:cite\w*)\*?(?:\[[^\]]*\])*\{[^}]*\}/g,'');
   // Remove navigation clauses while retaining the source's actual claim.
   const pointer='(?:[Ff]ig(?:ure)?s?\\.?|[Tt]ables?|图|表)\\s*[~\\s]*(?:\\\\(?:[cC]ref|[aA]utoref|ref)\\*?\\{[^}]+\\})(?:\\s*\\([a-d]\\))?';
   text=text.replace(new RegExp('^(?:As (?:shown|reported|illustrated) in|According to|From)\\s+'+pointer+'[,，:]?\\s*','i'),'')
    .replace(new RegExp('(?:as (?:shown|reported|illustrated) in|see|in)\\s+'+pointer,'gi'),'')
    .replace(new RegExp(pointer,'g'),/[\u3400-\u9fff]/.test(raw)?'这一结果':'This evidence')
    .replace(/\\(?:[cC]ref|[aA]utoref|ref)\*?\{[^}]+\}/g,'');
   text=plainText(text).replace(/\s+([,.;:，。])/g,'$1').replace(/^[,，:：]\s*/,'').replace(/\s+/g,' ').trim();
   if(text.length<12||text.length>220||/\[公式见原稿\]|\[fig:|\[tab:/.test(text))continue;
   if(!found.some(f=>f.text===text))found.push({text,sourceIds:chunks.filter(c=>c.from<p.index+p[0].length&&c.to>p.index).map(c=>c.id)});
  }
 }
 const rank=f=>/examines whether|evaluates|spatial distribution|summarizes|比较设置|展示分布/i.test(f.text)?0:/outperform|improv|reduc|increas|decreas|degrad|worse|best|higher|lower|better|robust|consistent|优于|提升|降低/i.test(f.text)?3:1;
 return found.sort((a,b)=>rank(b)-rank(a)).slice(0,2);
}

export function assetInsight(asset,summary,card){
 const explicit=(summary.assetInsights||[]).find(n=>asset.path?n.figurePath===asset.path:n.tableId===asset.id);
 if(explicit)return{text:explicit.text,sourceIds:explicit.sourceIds};
 if(asset.findings?.length)return asset.findings[0];
 const selected=asset.path?card.figurePaths?.includes(asset.path):card.tableIds?.includes(asset.id);
 if(selected&&card.explicitTakeaway&&card.takeaway.length<=220)return{text:card.takeaway,sourceIds:card.sourceIds};
 return null;
}

/** Enrich blank evidence pages on an explicit chat request; keep authored copy. */
export function enrichEvidencePages(story,plan){
 let added=0;
 for(const page of story.pages){
  if(page.takeaway||page.bullets?.length)continue;
  const asset=page.figures?.[0]?plan.visuals?.find(v=>v.path===page.figures[0].path):page.tables?.[0]?plan.tables?.find(t=>page.tables[0].id===t.id||page.tables[0].id.startsWith(t.id+'-')):null;
  const insight=asset?.findings?.[0];if(!insight)continue;
  page.takeaway=insight.text;page.evidencePage=true;page.insightSourceIds=insight.sourceIds;
  page.sourceIds=[...new Set([...page.sourceIds,...insight.sourceIds])];added++;
 }
 return added;
}
