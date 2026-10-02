(() => {
 const wheel=document.getElementById('wheel'),ns='http://www.w3.org/2000/svg';
 let focus=null;
 const diagram=()=>!!globalThis.ChartAspectState?.get().view;
 function clearPhaseMark(item,line){item.querySelectorAll('.aspect-phase-mark,.aspect-phase-cut').forEach(mark=>mark.remove());line.style.removeProperty('visibility');line.style.removeProperty('stroke-dasharray');}
 function houses(){
  const svg=wheel.querySelector('svg');if(!svg)return;
  const houseModel=globalThis.ChartPageMode==='transit'&&globalThis.ChartNatalModel?globalThis.ChartNatalModel:model;
  const asc=houseModel.angles.find(p=>p.key==='asc')?.longitude??0;
  const entries=houseModel.settings.house_system!=='whole_sign'&&houseModel.houses.quadrant?.length===12?houseModel.houses.quadrant:houseModel.houses.whole_sign;
  const scale=document.getElementById('bounds').checked?1:148/132;
  const inner=(diagram()?61:globalThis.ChartPageMode==='transit'?29:39)*scale,outer=(diagram()?75:globalThis.ChartPageMode==='transit'?43:51)*scale;
  const point=(longitude,radius)=>ChartGeometry.pointOnChart(longitude,radius,asc);
  const layer=document.createElementNS(ns,'g');layer.setAttribute('class','house-picks');
  model.housePoints=entries.map((house,index)=>{
   const start=house.cusp_longitude,end=start+((entries[(index+1)%12].cusp_longitude-start+360)%360||360),key='house_'+(index+1);
   const path=document.createElementNS(ns,'path'),steps=Math.max(4,Math.ceil((end-start)/5)),coords=[];
   for(let i=0;i<=steps;i++){const p=point(start+(end-start)*i/steps,outer);coords.push((i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2));}
   for(let i=steps;i>=0;i--){const p=point(start+(end-start)*i/steps,inner);coords.push('L'+p.x.toFixed(2)+' '+p.y.toFixed(2));}
   path.setAttribute('d',coords.join('')+'Z');path.setAttribute('class','house-pick');path.dataset.point=key;path.setAttribute('role','button');path.setAttribute('tabindex','0');path.setAttribute('aria-label','第 '+(index+1)+' 宫');
   layer.append(path);
   return {key,kind:'house',number:index+1,label:'第 '+(index+1)+' 宫',start,end};
  });
  svg.querySelector('.house-marks')?.before(layer);
  svg.querySelectorAll('.house-marks .house-mark').forEach((mark,index)=>{mark.dataset.point='house_'+(index+1);mark.setAttribute('role','button');mark.setAttribute('tabindex','0');mark.setAttribute('aria-label','第 '+(index+1)+' 宫');});
 }
 function paint(){
  const svg=wheel.querySelector('svg');if(!svg)return;
  const specialKey=focus?.type==='point'&&[...model.angles,...model.lots].some(p=>p.key===focus.key)?focus.key:focus?.type==='aspect'?(model.aspectPoints||[]).find(p=>p.key===focus.key&&p.focusOnly)?.from:null;
  globalThis.ChartAspectState?.showSpecial(specialKey);
  const connections=[...svg.querySelectorAll('.aspect-connection')];
  const visible=diagram();
  if(!visible)focus=null;
  if(focus?.type==='aspect'&&!connections.some(e=>e.dataset.point===focus.key))focus=null;
  for(const item of connections){
   const line=item.querySelector('.aspect-stroke'),selected=focus?.type==='aspect'&&item.dataset.point===focus.key;
   const related=focus?.type==='point'&&(item.dataset.from===focus.key||item.dataset.to===focus.key);
   item.style.display='';
   line.style.setProperty('stroke-opacity',!focus?'0.76':focus.type==='point'?(related?'0.95':'0.08'):selected?'1':'0.12','important');
   line.style.setProperty('stroke-width',selected?'1.7px':'1.05px','important');
   item.classList.toggle('aspect-focused',!!selected);
   clearPhaseMark(item,line);
   line.style.setProperty('stroke-dasharray','none','important');
   if(related)item.parentElement.append(item);
  }
  svg.querySelectorAll('.house-pick,.house-mark').forEach(e=>e.classList.toggle('house-focused',focus?.key===e.dataset.point));
 }
 const previousRender=render;
 render=function(){previousRender();houses();queueMicrotask(paint);};
 houses();queueMicrotask(paint);
 wheel.addEventListener('click',event=>{
  if(!diagram()||globalThis.chartZoomDragging)return;
  const item=event.target.closest('[data-point]');
  const key=item?.dataset.point;
  const isAspect=key?.startsWith('aspect_'),isPoint=key&&[...model.planets,...model.angles,...model.lots].some(p=>p.key===key);
  if(!isAspect&&!isPoint){if(focus){focus=null;paint();}return;}
  const type=isAspect?'aspect':'point';
  if(focus?.key===key&&focus.type===type)return;
  event.preventDefault();event.stopImmediatePropagation();
  focus={type,key};paint();
 },true);
 wheel.addEventListener('keydown',event=>{
  if(!diagram()||!['Enter',' '].includes(event.key))return;
  const key=event.target.closest('[data-point]')?.dataset.point;
  if(!key||!key.startsWith('aspect_')&&![...model.planets,...model.angles,...model.lots].some(p=>p.key===key))return;
  const type=key.startsWith('aspect_')?'aspect':'point';
  if(focus?.key===key&&focus.type===type)return;
  event.preventDefault();event.stopImmediatePropagation();focus={type,key};paint();
 },true);
 document.addEventListener('chart-note-view',()=>queueMicrotask(paint));
 document.addEventListener('chart-layer-change',()=>{focus=null;queueMicrotask(paint);});
})();
