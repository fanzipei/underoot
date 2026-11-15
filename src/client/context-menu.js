import {closeMenu} from './ui.js';
let current=null;
export function closeContextMenu(){current?.();}
export function contextMenu(x,y,items,onClose=()=>{}){
 closeMenu();closeContextMenu();const menus=[];
 function close(){for(const m of menus)m.remove();menus.length=0;document.removeEventListener('mousedown',outside,true);window.removeEventListener('resize',close);if(current===close)current=null;onClose();}
 function outside(e){if(!menus.some(m=>m.contains(e.target)))close();}
 function trim(depth){while(menus.length>depth)menus.pop().remove();}
 function show(list,left,top,depth=0,parent=null){
  trim(depth);const menu=document.createElement('div');menu.className='editor-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',depth?'插入 TeX 代码段':'右键菜单');document.body.append(menu);menus.push(menu);
  for(const item of list){if(item.sep){const hr=document.createElement('div');hr.className='sep';hr.setAttribute('role','separator');menu.append(hr);continue;}
   const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.disabled=!!item.disabled;button.textContent=item.label+(item.children?'  ›':'');menu.append(button);
   const expand=()=>{const r=button.getBoundingClientRect();return show(item.children,r.right+3,r.top,depth+1,button);};
   if(item.children){button.setAttribute('aria-haspopup','menu');button.onmouseenter=()=>{if(!button.disabled)expand();};}
   else button.onmouseenter=()=>trim(depth+1);
   button.onmousedown=e=>e.preventDefault();
   button.onclick=()=>{if(item.children){expand().querySelector('button:not(:disabled)')?.focus();return;}close();item.run?.();};
  }
  const rect=menu.getBoundingClientRect();if(left+rect.width>innerWidth-8)left=parent?parent.getBoundingClientRect().left-rect.width-3:innerWidth-rect.width-8;
  menu.style.left=Math.max(8,left)+'px';menu.style.top=Math.max(8,Math.min(top,innerHeight-rect.height-8))+'px';
  menu.onkeydown=e=>{const buttons=[...menu.querySelectorAll('button:not(:disabled)')],at=buttons.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();close();return;}if(e.key==='ArrowLeft'&&parent){e.preventDefault();trim(depth);parent.focus();return;}if(e.key==='ArrowRight'){const item=list.filter(i=>!i.sep)[[...menu.querySelectorAll('button')].indexOf(document.activeElement)];if(item?.children){e.preventDefault();document.activeElement.click();}return;}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(at+(e.key==='ArrowDown'?1:buttons.length-1)+buttons.length)%buttons.length]?.focus();}};
  return menu;
 }
 current=close;show(items,x,y).querySelector('button:not(:disabled)')?.focus();document.addEventListener('mousedown',outside,true);window.addEventListener('resize',close);return close;
}
