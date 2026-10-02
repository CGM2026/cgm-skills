(() => {
 const definitions={
  whole:{label:'整宫',items:['相合','六分','四分','三分','对分']},
  light:{label:'星光',items:['相合','六分','四分','三分','对分']},
  modern:{label:'现代',items:['合','半六分','半刑','六合','五分','四分','三合','补八分','倍五分','梅花','对分']}
 };
 const defaultLimits={light:{sun:15,moon:12,mercury:7,venus:7,mars:8,jupiter:9,saturn:9,uranus:5,neptune:5,pluto:5,asc:5,dsc:5,mc:5,ic:5},modern:{'合':8,'半六分':2,'半刑':2,'六合':4,'五分':2,'四分':8,'三合':8,'补八分':2,'倍五分':2,'梅花':2,'对分':8}};
 const key='chart-aspect-management-v1:'+location.pathname;
 const state={mode:'whole',view:false,enabled:Object.fromEntries(Object.entries(definitions).map(([mode,entry])=>[mode,[...entry.items]])),limits:structuredClone(defaultLimits)};
 try{
  const saved=JSON.parse(localStorage.getItem(key));
  if(saved&&definitions[saved.mode])state.mode=saved.mode;
  if(saved&&typeof saved.view==='boolean')state.view=saved.view;
  for(const [mode,entry] of Object.entries(definitions))if(Array.isArray(saved?.enabled?.[mode]))state.enabled[mode]=saved.enabled[mode].filter(name=>entry.items.includes(name));
  for(const mode of ['light','modern'])for(const name of Object.keys(defaultLimits[mode])){const value=Number(saved?.limits?.[mode]?.[name]);if(saved?.limits?.[mode]?.[name]!=null&&Number.isFinite(value)&&value>=0&&value<=30)state.limits[mode][name]=value;}
 }catch{}
 const page=document.getElementById('aspect-settings-page');
 const toggle=document.getElementById('aspect-diagram-toggle');
 if(globalThis.ChartPageMode==='transit'){state.view=false;toggle.hidden=true;}
 const wheel=document.getElementById('wheel');
 const escape=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const modeRow=document.createElement('div');modeRow.className='aspect-diagram-mode';
 const modeButton=document.createElement('button');modeButton.type='button';modeButton.className='aspect-diagram-mode-switch';modeRow.append(modeButton);
 document.querySelector('.chart-bottom').prepend(modeRow);
 const limitRow=(mode,name,label)=>'<label class="aspect-orb-row"><span>'+escape(label)+'</span><input type="number" inputmode="decimal" min="0" max="30" step="0.5" data-orb-mode="'+mode+'" data-orb-name="'+escape(name)+'" aria-label="'+escape(label)+'容许度"><span>°</span></label>';
 const planetNames={sun:'太阳',moon:'月亮',mercury:'水星',venus:'金星',mars:'火星',jupiter:'木星',saturn:'土星',uranus:'天王星',neptune:'海王星',pluto:'冥王星',asc:'上升点',dsc:'下降点',mc:'中天',ic:'天底'};
 page.innerHTML=Object.entries(definitions).map(([mode,entry])=>'<fieldset class="aspect-type-group" data-aspect-mode="'+mode+'"><legend>'+entry.label+'相位</legend><div class="aspect-type-options">'+entry.items.map(name=>'<label><input type="checkbox" value="'+escape(name)+'">'+escape(name)+'</label>').join('')+'</div></fieldset>').join('')+'<section class="aspect-orb-section"><h3>星光容许度</h3><p>按两端星体容许度的平均值计算；四轴各有独立数值。</p><div class="aspect-orb-grid">'+Object.keys(defaultLimits.light).map(name=>limitRow('light',name,planetNames[name])).join('')+'</div></section><section class="aspect-orb-section"><h3>现代容许度</h3><p>各相位独立设置；零度只保留精准相位。</p><div class="aspect-orb-grid">'+Object.keys(defaultLimits.modern).map(name=>limitRow('modern',name,name)).join('')+'</div></section>';
 function sync(){
  const name=document.createElement('span');name.className='aspect-diagram-name';name.textContent=state.view?'常规图式':'相位图式';
  toggle.replaceChildren(document.createTextNode('切换为  '),name);
  toggle.setAttribute('aria-pressed',String(state.view));
  modeRow.hidden=!state.view;
  const modes=Object.keys(definitions),next=modes[(modes.indexOf(state.mode)+1)%modes.length];modeButton.textContent=definitions[state.mode].label+'相位';modeButton.setAttribute('aria-label','当前'+definitions[state.mode].label+'相位，点击切换为'+definitions[next].label+'相位');modeButton.title='点击切换为'+definitions[next].label+'相位';
  page.querySelectorAll('[data-aspect-mode]').forEach(group=>group.querySelectorAll('input[type=checkbox]').forEach(input=>input.checked=state.enabled[group.dataset.aspectMode].includes(input.value)));
  page.querySelectorAll('[data-orb-mode]').forEach(input=>input.value=state.limits[input.dataset.orbMode][input.dataset.orbName]);
 }
 function save(){try{localStorage.setItem(key,JSON.stringify(state));}catch{}}
 function redraw(){render();queueMicrotask(()=>globalThis.refreshDockedCards?.());}
 function change(){save();sync();redraw();}
 const api={get:()=>({mode:state.mode,view:state.view,enabled:structuredClone(state.enabled),limits:structuredClone(state.limits)}),allows:(mode,name)=>state.enabled[mode]?.includes(name)??false,setMode:mode=>{if(!definitions[mode]||state.mode===mode)return;state.mode=mode;change();},showSpecial};
 globalThis.ChartAspectState=api;
 toggle.addEventListener('click',()=>{if(globalThis.ChartPageMode==='transit')return;state.view=!state.view;change();});
 modeButton.addEventListener('click',()=>{if(!state.view)return;const modes=Object.keys(definitions);state.mode=modes[(modes.indexOf(state.mode)+1)%modes.length];change();});
 page.addEventListener('change',event=>{
  const input=event.target;
  if(input.matches('[data-orb-mode]')){const value=Number(input.value);if(!Number.isFinite(value)||value<0||value>30){input.value=state.limits[input.dataset.orbMode][input.dataset.orbName];return;}state.limits[input.dataset.orbMode][input.dataset.orbName]=value;}
  else if(input.type==='checkbox'){
   const mode=input.closest('[data-aspect-mode]')?.dataset.aspectMode;
   if(!mode)return;
   state.enabled[mode]=input.checked?[...new Set([...state.enabled[mode],input.value])]:state.enabled[mode].filter(name=>name!==input.value);
  }else return;
  change();
 });
 const colors={
  '六分':'#718966','六合':'#718966','三分':'#527764','三合':'#527764',
  '四分':'#a64625','对分':'#914c38',
  '相合':'#526f8b','合':'#526f8b','半六分':'#668ea2','半刑':'#5e7895',
  '五分':'#4e879c','补八分':'#60758a','倍五分':'#427e93','梅花':'#738ba0'
 };
 function showSpecial(key){
  const svg=wheel.querySelector('svg');if(!svg)return;
  const old=svg.querySelector('.special-aspect-lines');if(old?.dataset.source===key)return;
  old?.remove();model.aspectPoints=(model.aspectPoints||[]).filter(p=>!p.focusOnly);
  if(!state.view||!key)return;
  const source=[...model.angles,...model.lots].find(p=>p.key===key);if(!source)return;
  const scale=document.getElementById('bounds').checked?1:148/132,asc=model.angles.find(p=>p.key==='asc')?.longitude??0;
  const at=longitude=>ChartGeometry.pointOnChart(longitude,55*scale,asc),a=at(source.longitude);
  const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.setAttribute('class','special-aspect-lines');group.dataset.source=key;
  for(const planet of model.planets){
   const result=PointAspects.measure(source,planet,Number.isFinite(source.speed_longitude_per_day)?source.speed_longitude_per_day:0,state.mode,state.limits);
   if(!api.allows(state.mode,result.name)||(['相合','合'].includes(result.name)&&source.sign_index===planet.sign_index))continue;
   const aspectKey='aspect_'+state.mode+'_'+source.key+'_'+planet.key,b=at(planet.longitude);
   model.aspectPoints.push({key:aspectKey,kind:'aspect',label:result.name,from:source.key,to:planet.key,result,mode:state.mode,focusOnly:true});
   const wrapper=document.createElementNS('http://www.w3.org/2000/svg','g');wrapper.setAttribute('class','aspect-connection');wrapper.dataset.point=aspectKey;wrapper.dataset.aspect=result.name;wrapper.dataset.from=source.key;wrapper.dataset.to=planet.key;wrapper.setAttribute('role','button');wrapper.setAttribute('tabindex','0');wrapper.setAttribute('aria-label',source.label+'与'+planet.label+' · '+result.name);
   const line=document.createElementNS('http://www.w3.org/2000/svg','line');for(const [name,value] of Object.entries({x1:a.x.toFixed(2),y1:a.y.toFixed(2),x2:b.x.toFixed(2),y2:b.y.toFixed(2)}))line.setAttribute(name,value);
   line.setAttribute('class','aspect-stroke');line.style.setProperty('stroke',colors[result.name]||'#526f8b','important');line.setAttribute('pointer-events','none');wrapper.append(line);
   const hit=line.cloneNode(false);hit.removeAttribute('style');hit.setAttribute('class','aspect-hit');wrapper.append(hit);group.append(wrapper);
  }
  svg.querySelector('.house-marks')?.before(group);
 }
 function apply(){
  const svg=wheel.querySelector('svg');if(!svg)return;if(!state.view){model.aspectPoints=[];return;}
  svg.dataset.aspectDiagram='true';
  svg.querySelectorAll('.planet-minute-radial').forEach(el=>el.style.display='none');
  const scale=document.getElementById('bounds').checked?1:148/132;
  const hole=61*scale,houseRing=75*scale,houseLabel=68*scale,lineRadius=hole-6*scale;
  const circles=[...svg.querySelectorAll(':scope > circle')].filter(el=>!el.classList.contains('outer-ring')&&!el.classList.contains('sign-boundary-ring')&&!el.classList.contains('bound-inner-ring')&&!el.classList.contains('lot-dot-ring'));
  if(circles.length>=2){circles[0].setAttribute('r',houseRing);circles[1].setAttribute('r',hole);}
  const asc=model.angles.find(p=>p.key==='asc')?.longitude??0;
  const at=(longitude,radius)=>ChartGeometry.pointOnChart(longitude,radius,asc);
  const houses=model.settings.house_system!=='whole_sign'&&model.houses.quadrant?.length===12?model.houses.quadrant:model.houses.whole_sign;
  svg.querySelectorAll('.house-dividers .house-divider').forEach((line,i)=>{
   const point=at(houses[i].cusp_longitude,hole);
   line.setAttribute('x1',point.x.toFixed(2));line.setAttribute('y1',point.y.toFixed(2));
  });
  svg.querySelectorAll('.house-marks .house-mark').forEach((mark,i)=>{
   const next=houses[(i+1)%houses.length].cusp_longitude;
   const middle=houses[i].cusp_longitude+((next-houses[i].cusp_longitude+360)%360)/2;
   const point=at(middle,houseLabel);mark.setAttribute('x',point.x.toFixed(2));mark.setAttribute('y',point.y.toFixed(2));
  });
  const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.setAttribute('class','aspect-lines');
  const planets=model.planets,points=planets;model.aspectPoints=[];
  for(const [i,p] of points.entries())for(const [j,q] of planets.entries()){
   if(p.key===q.key||(i<planets.length&&j<=i))continue;
   const result=PointAspects.measure(p,q,Number.isFinite(p.speed_longitude_per_day)?p.speed_longitude_per_day:0,state.mode,state.limits);
   if(!api.allows(state.mode,result.name))continue;
   if((result.name==='相合'||result.name==='合')&&p.sign_index===q.sign_index)continue;
   const aspectKey='aspect_'+state.mode+'_'+p.key+'_'+q.key;
   model.aspectPoints.push({key:aspectKey,kind:'aspect',label:result.name,from:p.key,to:q.key,result,mode:state.mode});
   const a=at(p.longitude,lineRadius),b=at(q.longitude,lineRadius);
   const wrapper=document.createElementNS('http://www.w3.org/2000/svg','g');wrapper.setAttribute('class','aspect-connection');wrapper.dataset.point=aspectKey;wrapper.dataset.aspect=result.name;wrapper.dataset.from=p.key;wrapper.dataset.to=q.key;wrapper.setAttribute('role','button');wrapper.setAttribute('tabindex','0');wrapper.setAttribute('aria-label',p.label+'与'+q.label+' · '+result.name);
   const line=document.createElementNS('http://www.w3.org/2000/svg','line');
   for(const [name,value] of Object.entries({x1:a.x.toFixed(2),y1:a.y.toFixed(2),x2:b.x.toFixed(2),y2:b.y.toFixed(2)}))line.setAttribute(name,value);
   line.setAttribute('data-aspect',result.name);line.setAttribute('data-from',p.key);line.setAttribute('data-to',q.key);
   line.setAttribute('class','aspect-stroke');line.style.setProperty('stroke',colors[result.name]||'#526f8b','important');
   line.style.setProperty('stroke-width','1.05px','important');
   line.style.setProperty('stroke-opacity','0.76','important');
   line.setAttribute('pointer-events','none');wrapper.append(line);
   const hit=line.cloneNode(false);hit.removeAttribute('style');hit.setAttribute('class','aspect-hit');wrapper.append(hit);group.append(wrapper);
  }
  svg.querySelector('.house-marks')?.before(group);
 }
 new MutationObserver(records=>{if(records.some(record=>record.addedNodes.length))apply();}).observe(wheel,{childList:true});
 sync();apply();
})();
