(() => {
 const wheel=document.getElementById('wheel'),control=document.createElement('div');control.className='wheel-zoom-tools';document.querySelector('.relation-note-tools').after(control);
 control.innerHTML='<button class="zoom-toggle" aria-pressed="false">星盘缩放</button><button class="zoom-reset" hidden>复位</button>';
 const baseTools=document.createElement('div');baseTools.className='base-zoom-tools';baseTools.innerHTML='<button type="button" class="icon-control base-zoom-toggle" aria-label="移动与缩放原始星盘" title="移动与缩放：滚轮缩放，拖动平移" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-4a2 2 0 0 1 4 0v8c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 1"/></svg></button><button type="button" class="icon-control base-zoom-reset" aria-label="复位原始星盘" title="复位原始星盘" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/></svg></button>';document.querySelector('.chart-actions').append(baseTools);
 let enabled=false,drag=null,suppressClick=false;const views=new Map(),originals=new WeakMap();
 const layerKey=()=>globalThis.ChartNoteLayers?.current()?.id||'base';
 const viewBases=new Map();
 function state(){
  const svg=wheel.querySelector('svg');if(!svg)return null;
  if(!originals.has(svg))originals.set(svg,svg.getAttribute('viewBox').split(/\s+/).map(Number));
  const base=originals.get(svg),key=layerKey(),previous=viewBases.get(key);
  if(!views.has(key))views.set(key,[...base]);
  else if(previous&&base.some((v,i)=>Math.abs(v-previous[i])>.01)){
   const old=views.get(key),zoomed=old[2]<previous[2]-.01;
   if(!zoomed)views.set(key,[...base]);
   else{
    const scale=base[2]/previous[2],w=old[2]*scale,h=w*base[3]/base[2];
    const cx=base[0]+((old[0]+old[2]/2-previous[0])/previous[2])*base[2];
    const cy=base[1]+((old[1]+old[3]/2-previous[1])/previous[3])*base[3];
    views.set(key,[cx-w/2,cy-h/2,w,h]);
   }
  }
  viewBases.set(key,[...base]);return {svg,base,box:views.get(key)};
 }
 function constrain(base,box){const w=Math.min(base[2],Math.max(base[2]/5,box[2])),h=w*base[3]/base[2];const padX=w*.12,padY=h*.12;return [Math.max(base[0]-padX,Math.min(base[0]+base[2]-w+padX,box[0])),Math.max(base[1]-padY,Math.min(base[1]+base[3]-h+padY,box[1])),w,h];}
 function apply(){const key=layerKey(),isBase=key==='base';control.hidden=isBase;baseTools.hidden=!isBase;const s=state();if(!s)return;s.box=constrain(s.base,s.box);views.set(key,s.box);const zoomed=s.box[2]<s.base[2]-.01;wheel.classList.toggle('zoom-framed',enabled||zoomed);s.svg.style.aspectRatio=s.base[2]+'/'+s.base[3];s.svg.style.overflow='hidden';s.svg.setAttribute('viewBox',s.box.join(' '));wheel.classList.toggle('zoom-enabled',enabled);control.querySelector('.zoom-toggle').setAttribute('aria-pressed',String(enabled));control.querySelector('.zoom-reset').hidden=isBase;baseTools.querySelector('.base-zoom-toggle').setAttribute('aria-pressed',String(enabled));baseTools.querySelector('.base-zoom-reset').hidden=!isBase||!zoomed;}
 function position(e,s){const p=s.svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(s.svg.getScreenCTM().inverse());}
 control.querySelector('.zoom-toggle').onclick=()=>{enabled=!enabled;apply();};control.querySelector('.zoom-reset').onclick=()=>{const s=state();if(s&&layerKey())views.set(layerKey(),[...s.base]);apply();};
 baseTools.querySelector('.base-zoom-toggle').onclick=()=>{enabled=!enabled;apply();};baseTools.querySelector('.base-zoom-reset').onclick=()=>{const s=state();if(s)views.set('base',[...s.base]);apply();};
 wheel.addEventListener('wheel',e=>{if(!enabled||!layerKey())return;e.preventDefault();const s=state(),p=position(e,s),[x,y,w,h]=s.box;const scale=Math.min(5,Math.max(1,s.base[2]/w*Math.exp(-e.deltaY*.0015))),nw=s.base[2]/scale,nh=s.base[3]/scale;views.set(layerKey(),[p.x-(p.x-x)*nw/w,p.y-(p.y-y)*nh/h,nw,nh]);apply();},{passive:false});
 wheel.addEventListener('pointerdown',e=>{if(!enabled||!layerKey()||e.button!==0)return;const s=state();suppressClick=false;globalThis.chartZoomDragging=false;drag={start:position(e,s),box:[...s.box],x:e.clientX,y:e.clientY,id:e.pointerId};wheel.setPointerCapture(e.pointerId);});
 wheel.addEventListener('pointermove',e=>{if(!drag)return;const s=state(),p=position(e,s);if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4){suppressClick=true;globalThis.chartZoomDragging=true;}views.set(layerKey(),[s.box[0]+drag.start.x-p.x,s.box[1]+drag.start.y-p.y,s.box[2],s.box[3]]);apply();});
 const stop=()=>{drag=null;};wheel.addEventListener('pointerup',stop);wheel.addEventListener('pointercancel',stop);
 document.addEventListener('click',e=>{if(suppressClick&&wheel.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();suppressClick=false;globalThis.chartZoomDragging=false;}},true);
 globalThis.ChartZoom={enable:value=>{enabled=value;apply();},reset:()=>control.querySelector('.zoom-reset').click()};
 document.addEventListener('chart-layer-change',()=>{enabled=false;drag=null;apply();});new MutationObserver(apply).observe(wheel,{childList:true});apply();
})();

