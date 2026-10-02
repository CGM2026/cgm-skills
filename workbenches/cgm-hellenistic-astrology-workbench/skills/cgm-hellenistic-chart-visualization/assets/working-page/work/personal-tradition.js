(() => {
 if(globalThis.ChartReturnMode)return;
 const form=document.getElementById('cycle-form');
 const section=document.createElement('fieldset');section.className='personal-tradition';
 section.innerHTML='<legend>个人传统</legend><div class="tradition-options"><label><input type="radio" name="personal-tradition" value="hellenistic">希腊占星</label><label><input type="radio" name="personal-tradition" value="medieval">中世纪／文艺复兴占星</label><label><input type="radio" name="personal-tradition" value="modern">现代占星</label></div><p>点击后应用到当前页面。新盘默认需另行保存，已存命盘的计算事实保持原口径。</p>';
 form.prepend(section);
 const preferenceKey=globalThis.ChartPageMode==='transit'?'chart-transit-personal-tradition-v1:'+location.pathname:'chart-personal-tradition-v1',layoutKey='chart-base-layout-v1:'+payload.source_sha256+':'+location.pathname;
 const presets={hellenistic:{zodiac:'sidereal',house:'whole_sign',outer:false,bounds:true,lots:true,asteroids:false},medieval:{zodiac:'tropical',house:'alcabitius',outer:false,bounds:true,lots:true,asteroids:false},modern:{zodiac:'tropical',house:'placidus',outer:true,bounds:false,lots:false,asteroids:true}};
 let chosen=null;
 const radio=()=>{section.querySelectorAll('input').forEach(input=>input.checked=input.value===chosen);};radio();
 const syncLayer=()=>section.querySelectorAll('input').forEach(input=>{const preset=presets[input.value],state=ChartMethodState.get();state.current={...state.current,zodiac:preset.zodiac,house:preset.house};const valid=ChartMethodState.available(state);input.disabled=!!globalThis.ChartNoteLayers?.current()||!valid;input.parentElement.title=valid?'':'此预设的宫位制在当前纬度与时刻不可用';});syncLayer();document.addEventListener('chart-layer-change',syncLayer);
 const read=()=>({methods:ChartMethodState.get(),virtual:ChartVirtualState.get(),bounds:document.getElementById('bounds').checked,lots:document.getElementById('lots').checked});
 const write=layout=>{if(!ChartMethodState.available(layout.methods))return false;ChartVirtualState.set(layout.virtual);document.getElementById('bounds').checked=layout.bounds;document.getElementById('lots').checked=layout.lots;return ChartMethodState.set(layout.methods);};
 const save=()=>{if(globalThis.ChartNoteLayers?.current())return;try{localStorage.setItem(layoutKey,JSON.stringify(read()));}catch{}};
 function apply(name){
  const preset=presets[name],layout=read(),available=JSON.parse(document.getElementById('chart-variants').textContent).house_options;
  const cycle=[preset.house,...layout.methods.cycle.filter(key=>key!==preset.house),...Object.keys(available)].filter((key,index,all)=>key in available&&all.indexOf(key)===index).slice(0,3);
  layout.methods.current={...layout.methods.current,zodiac:preset.zodiac,house:preset.house};layout.methods.cycle=cycle;layout.methods.showOuter=preset.outer;
  layout.bounds=preset.bounds;layout.lots=preset.lots;
  layout.virtual.virtualEnabled=false;layout.virtual.asteroidsEnabled=preset.asteroids;
  if(preset.asteroids&&!layout.virtual.asteroids.length)layout.virtual.asteroids=['chiron','ceres','pallas','juno','vesta'];
  write(layout);save();
 }
 section.addEventListener('change',event=>{if(event.target.name!=='personal-tradition'||!event.target.checked)return;chosen=event.target.value;try{localStorage.setItem(preferenceKey,chosen);}catch{}apply(chosen);});
 let initialized=false;
 function initialize(){
  if(initialized||globalThis.ChartNoteLayers?.current())return;initialized=true;
  let stored=null,legacy=false;
  try{
   stored=JSON.parse(localStorage.getItem(layoutKey));
   legacy=['chart-custom-lots-v1:','chart-virtual-points-v1:','chart-aspect-management-v1:','chart-note-layers-v1:','chart-case-archive-v1:'].some(prefix=>localStorage.getItem(prefix+location.pathname)!==null);
   legacy||=localStorage.getItem('chart-house-cycle-v1:'+payload.source_sha256)!==null;
  }catch{}
  const initializeLayout=()=>{if(stored?.methods&&stored?.virtual)write(stored);else save();};
  if(globalThis.ChartArchiveStore?.runWithoutSaving)ChartArchiveStore.runWithoutSaving(initializeLayout);else initializeLayout();
 }
 window.addEventListener('load',initialize,{once:true});
 document.addEventListener('chart-layer-change',()=>{if(!initialized&&!globalThis.ChartNoteLayers?.current())initialize();});
 document.addEventListener('click',event=>{if(event.target.closest('.method-switches button'))queueMicrotask(save);});
 document.addEventListener('change',event=>{if(event.target.closest('.chart-bottom input,.settings-dialog input,.settings-dialog select'))queueMicrotask(save);});
 form.addEventListener('submit',()=>queueMicrotask(save));
})();
