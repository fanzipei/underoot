import{vim,Vim}from'@replit/codemirror-vim';
const writers=new WeakMap();
Vim.defineEx('write','w',(cm)=>writers.get(cm.cm6)?.write());
const history=(cm,action)=>{writers.get(cm.cm6)?.[action]();const anchor=cm.cm6.state.selection.main.from;Vim.exitVisualMode(cm,false);cm.cm6.dispatch({selection:{anchor}});};
Vim.defineAction('underootUndo',(cm)=>history(cm,'undo'));
Vim.defineAction('underootRedo',(cm)=>history(cm,'redo'));
Vim.mapCommand('u','action','underootUndo',{}, {context:'normal'});
Vim.mapCommand('<C-r>','action','underootRedo',{}, {context:'normal'});
export function vimMode(view,onWrite,history){writers.set(view,{write:onWrite,...history});return vim({status:true});}
export function releaseVim(view){writers.delete(view);}
