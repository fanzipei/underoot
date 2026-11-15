/** Preview-only scaling; the manuscript model and cell coordinates stay untouched. */
export function tableViewport(){
 const viewport=document.getElementById('table-viewport'),stage=document.getElementById('table-stage'),grid=document.getElementById('grid');
 const fit=document.getElementById('zoom-fit'),out=document.getElementById('zoom-out'),inside=document.getElementById('zoom-in'),label=document.getElementById('zoom-label');
 let automatic=true,scale=1,frame=0;
 function layout(anchor=null){
  const table=grid.firstElementChild,available=Math.max(1,viewport.clientWidth-2);
  const width=table?Math.max(grid.offsetWidth,grid.scrollWidth):available,height=table?Math.max(grid.offsetHeight,grid.scrollHeight):50;
  if(automatic)scale=Math.min(1,available/Math.max(1,width));
  grid.style.transform=`scale(${scale})`;
  stage.style.width=Math.ceil(width*scale)+'px';stage.style.height=Math.ceil(height*scale)+'px';
  label.value=Math.round(scale*100)+'%';label.textContent=label.value;
  fit.setAttribute('aria-pressed',String(automatic));out.disabled=!table||scale<=.1;inside.disabled=!table||scale>=2;
  if(automatic)viewport.scrollLeft=0;
  else if(anchor){viewport.scrollLeft=anchor.x*scale-viewport.clientWidth/2;viewport.scrollTop=anchor.y*scale-viewport.clientHeight/2;}
 }
 function refresh(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>layout());}
 function zoom(value){
  const anchor={x:(viewport.scrollLeft+viewport.clientWidth/2)/scale,y:(viewport.scrollTop+viewport.clientHeight/2)/scale};
  automatic=false;scale=Math.min(2,Math.max(.1,value));layout(anchor);
 }
 out.onclick=()=>zoom(Math.round((scale-.1)*100)/100);inside.onclick=()=>zoom(Math.round((scale+.1)*100)/100);
 document.getElementById('zoom-reset').onclick=()=>zoom(1);
 fit.onclick=()=>{automatic=true;layout();};
 viewport.addEventListener('wheel',event=>{if(event.shiftKey&&!event.ctrlKey&&!event.metaKey&&Math.abs(event.deltaY)>Math.abs(event.deltaX)&&viewport.scrollWidth>viewport.clientWidth){const before=viewport.scrollLeft,delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport.clientWidth:1);viewport.scrollLeft+=delta;if(viewport.scrollLeft!==before)event.preventDefault();}},{passive:false});
 const observer=new ResizeObserver(refresh);observer.observe(viewport);observer.observe(grid);
 return{refresh,reset(){automatic=true;viewport.scrollTop=0;viewport.scrollLeft=0;refresh();}};
}
