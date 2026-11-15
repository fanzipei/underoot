const nameOrder=(a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true});
const extension=n=>n.name.includes('.')?n.name.split('.').pop().toLowerCase():'';
export function fileModified(node){return node.type==='dir'?Math.max(node.mtime||0,...(node.children||[]).map(fileModified)):node.mtime||0;}
/** Folder-first ordering at each level; never mutates server tree metadata. */
export function orderFiles(nodes,mode='name'){
 return [...nodes].sort((a,b)=>{
  if(a.type!==b.type)return a.type==='dir'?-1:1;
  if(mode==='modified'||mode==='oldest')return (fileModified(b)-fileModified(a))*(mode==='oldest'?-1:1)||nameOrder(a,b);
  if(mode==='type')return extension(a).localeCompare(extension(b))||nameOrder(a,b);
  return nameOrder(a,b)*(mode==='name-desc'?-1:1);
 });
}
