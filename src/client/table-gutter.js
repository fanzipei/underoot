import {EditorView,GutterMarker,ViewPlugin,gutter} from '@codemirror/view';
import {StateEffect} from '@codemirror/state';
import {tableRegions,tableAtLine} from '../shared/table-regions.js';

/** A stable gutter lane: hovering never moves the source or changes selection. */
export function tableEditingGutter({enabled,onOpen}){
 const hover=StateEffect.define();let plugin;
 class EditMarker extends GutterMarker{
  constructor(table){super();this.table=table;}
  eq(other){return other.table===this.table;}
  toDOM(view){
   const button=document.createElement('button');button.type='button';button.className='cm-table-edit-button';
   const label=(view.state.readOnly?'查看':'编辑')+this.table.label;button.title=label+' · 可视化表格编辑器';button.setAttribute('aria-label',label);
   button.innerHTML='<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.3"/><path d="M2 6h12M6 6v7.5M10 6v7.5"/></svg>';
   button.onmousedown=event=>{event.preventDefault();event.stopPropagation();};
   button.onclick=event=>{event.preventDefault();event.stopPropagation();const tracker=view.plugin(plugin);if(enabled()&&tracker?.tables.includes(this.table))onOpen(this.table);};
   return button;
  }
 }
 class Spacer extends GutterMarker{toDOM(){const span=document.createElement('span');span.className='cm-table-edit-spacer';span.setAttribute('aria-hidden','true');return span;}}
 plugin=ViewPlugin.fromClass(class{
  constructor(view){
   this.view=view;this.tables=tableRegions(view.state.doc.toString());this.active=null;this.pointer=null;this.frame=0;this.destroyed=false;this.ariaChanges=[];
   this.move=event=>{if(event.target.closest?.('.cm-table-edit-button'))return;this.pointer={x:event.clientX,y:event.clientY,buttons:event.buttons,inGutter:!!event.target.closest?.('.cm-gutters')};this.locate();};
   this.leave=()=>{this.pointer=null;if(!view.dom.querySelector('.cm-table-edit-button:focus'))this.set(null);};
   this.blur=event=>{if(event.target.closest?.('.cm-table-edit-button')&&!this.pointer)this.set(null);};
   view.dom.addEventListener('mousemove',this.move);view.dom.addEventListener('mouseup',this.move);view.dom.addEventListener('mouseleave',this.leave);view.dom.addEventListener('focusout',this.blur);
  }
  locate(){
   const p=this.pointer;if(!p||p.buttons||!enabled()||!this.view.inView){this.set(null);return;}
   const rect=this.view.scrollDOM.getBoundingClientRect();if(p.y<rect.top||p.y>rect.bottom||p.x<rect.left||p.x>rect.right){this.set(null);return;}
   const height=p.y-this.view.documentTop,block=this.view.lineBlockAtHeight(height);if(height<block.top||height>=block.bottom){this.set(null);return;}const line=this.view.state.doc.lineAt(block.from);
   if(p.inGutter&&this.active?.line===line.from)return;
   const position=p.inGutter?null:this.view.posAtCoords({x:p.x,y:p.y},false),table=tableAtLine(this.tables,line.from,line.to,position);
   this.set(table?{table,line:line.from}:null);
  }
  exposeGutter(){
   // CodeMirror hides its decorative gutters as one group. Expose this real
   // button while keeping the line numbers/fold decorations hidden as before.
   const lane=this.view.dom.querySelector('.cm-table-edit-gutter'),root=lane?.parentElement;if(!root||root.getAttribute('aria-hidden')!=='true')return;
   this.ariaChanges.push([root,'true']);root.removeAttribute('aria-hidden');
   for(const sibling of root.children)if(sibling!==lane&&!sibling.hasAttribute('aria-hidden')){this.ariaChanges.push([sibling,null]);sibling.setAttribute('aria-hidden','true');}
  }
  set(value){if(this.destroyed||this.active?.table===value?.table&&this.active?.line===value?.line)return;this.view.dispatch({effects:hover.of(value)});if(value)this.exposeGutter();}
  update(update){
   if(update.docChanged){this.tables=tableRegions(update.state.doc.toString());this.active=null;}
   for(const transaction of update.transactions)for(const effect of transaction.effects)if(effect.is(hover))this.active=effect.value;
   if(update.viewportChanged||update.geometryChanged||update.docChanged){cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>{if(!this.destroyed)this.locate();});}
  }
  destroy(){this.destroyed=true;cancelAnimationFrame(this.frame);this.view.dom.removeEventListener('mousemove',this.move);this.view.dom.removeEventListener('mouseup',this.move);this.view.dom.removeEventListener('mouseleave',this.leave);this.view.dom.removeEventListener('focusout',this.blur);for(const[node,value]of this.ariaChanges)if(value===null)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden',value);}
 });
 return[plugin,gutter({class:'cm-table-edit-gutter',initialSpacer:()=>new Spacer(),lineMarker:(view,line)=>{const active=view.plugin(plugin)?.active;return enabled()&&active?.line===line.from?new EditMarker(active.table):null;},lineMarkerChange:update=>update.docChanged||update.viewportChanged||update.transactions.some(t=>t.effects.some(e=>e.is(hover))),domEventHandlers:{mousedown:(_view,_line,event)=>{if(event.target.closest?.('.cm-table-edit-button')){event.preventDefault();return true;}return false;}}}),EditorView.baseTheme({'.cm-table-edit-gutter':{width:'23px',minWidth:'23px'},'.cm-table-edit-gutter .cm-gutterElement':{padding:'0 2px',display:'flex',alignItems:'flex-start',justifyContent:'center'},'.cm-table-edit-spacer':{display:'inline-block',width:'19px',height:'1px'},'.cm-table-edit-button':{display:'flex',alignItems:'center',justifyContent:'center',padding:'1px',width:'19px',height:'19px',border:'1px solid #b6d9cd',borderRadius:'4px',background:'#e8f5ef',color:'#146b4e',cursor:'pointer',boxSizing:'border-box'},'.cm-table-edit-button:hover':{background:'#d2ecdf',borderColor:'#68ad8b'},'.cm-table-edit-button:focus-visible':{outline:'2px solid #1f8a4c',outlineOffset:'1px'}})];
}
