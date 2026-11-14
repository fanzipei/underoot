import {findTables} from '../plugins/table-model.js';

/** Only the syntactically bounded tabular block is a table-editing region. */
export function tableRegions(source){
 return findTables(source).map(t=>({...t,hoverFrom:t.from,hoverTo:t.to}));
}

export function tableAtLine(regions,from,to,position=null){
 if(position!=null)return regions.find(t=>position>=t.from&&position<t.to)||null;
 const candidates=regions.filter(t=>from<t.hoverTo&&to>=t.hoverFrom);return candidates.length===1?candidates[0]:null;
}

/** Resolve a guarded gutter selection against the freshly read document. */
export function selectedTableIndex(source,selection,tables=findTables(source)){
 if(!selection)return 0;
 let at=selection.from;
 if(selection.kind==='table'){
  const quote=selection.text;
  if(typeof quote!=='string'||!quote)throw Error('表格定位已失效，请重新点击行号旁的编辑按钮');
  if(source.slice(at,at+quote.length)!==quote){at=source.indexOf(quote);if(at<0||source.indexOf(quote,at+1)>=0)throw Error('表格内容已变化或定位不唯一，请重新点击行号旁的编辑按钮');}
  const index=tables.findIndex(t=>at>=t.from&&at+quote.length<=t.to);
  if(index<0)throw Error('原表格已变化，请重新点击行号旁的编辑按钮');return index;
 }
 const index=tables.findIndex(t=>at>=t.from&&at<t.to);return index<0?0:index;
}
