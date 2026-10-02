(() => {
 const storage='chart-virtual-points-v1:'+location.pathname;
 const names={lilith:'莉莉丝',prenatal_moon:'朔望点',north_node:'北交点',south_node:'南交点'};
 const asteroids={chiron:'凯龙星',ceres:'谷神星',pallas:'智神星',juno:'婚神星',vesta:'灶神星'};
 let config={shown:Object.keys(names),asteroids:Object.keys(asteroids),virtualEnabled:false,asteroidsEnabled:false,lilith:'mean',nodes:'mean'};
 try{const saved=JSON.parse(localStorage.getItem(storage));if(saved){config.shown=(saved.shown||[]).filter(k=>k in names);config.asteroids=(saved.asteroids||Object.keys(asteroids)).filter(k=>k in asteroids);config.virtualEnabled=saved.virtualEnabled??config.shown.length>0;config.asteroidsEnabled=!!saved.asteroidsEnabled;for(const k of ['lilith','nodes'])if(['mean','true'].includes(saved[k]))config[k]=saved[k];}}catch{}
 const section=document.createElement('section');section.className='virtual-settings';
 const toggle=(key,name,group,active)=>`<label class="virtual-toggle"><input type="checkbox" data-group="${group}" data-object="${key}" ${active?'checked':''}>${name}</label>`;
 section.innerHTML='<div class="virtual-column"><p class="config-label">虚点</p>'+Object.entries(names).map(([key,name])=>`<div class="virtual-row">${toggle(key,name,'shown',config.shown.includes(key))}${key==='lilith'?'<select data-position="lilith" aria-label="莉莉丝位置"><option value="mean">平均黑月</option><option value="true">真黑月</option></select>':key==='north_node'?'<select data-position="nodes" aria-label="南北交点位置"><option value="mean">平均交点</option><option value="true">真交点</option></select>':''}</div>`).join('')+'</div><div class="asteroid-column"><p class="config-label asteroid-heading">小行星</p>'+Object.entries(asteroids).map(([key,name])=>'<div class="virtual-row">'+toggle(key,name,'asteroids',config.asteroids.includes(key))+'</div>').join('')+'</div>';
 document.getElementById('extra-settings-page').append(section);
 section.querySelectorAll('[data-position]').forEach(el=>el.value=config[el.dataset.position]);
 const virtualButton=document.getElementById('virtual-toggle'),asteroidButton=document.getElementById('asteroids-toggle');
 globalThis.ChartVirtualState={get:()=>JSON.parse(JSON.stringify(config)),set:c=>{config=JSON.parse(JSON.stringify(c));syncButtons();section.querySelectorAll('[data-position]').forEach(e=>e.value=config[e.dataset.position]);}};
 const original=render;
 render=function(){
  const extras=source=>(config.virtualEnabled?config.shown:[]).map(key=>{
   const mode=key==='lilith'?config.lilith:key==='prenatal_moon'?'mean':config.nodes;
   const point=source.virtual_points?.[mode]?.find(p=>p.key===key);
   return point?{...point,label:names[key]}:null;
  }).filter(Boolean);
  const allExtras=source=>{const points=extras(source);if(config.asteroidsEnabled)points.push(...(source.asteroids||[]).filter(p=>config.asteroids.includes(p.key)).map(p=>({...p,label:asteroids[p.key]})));return points;};
  model.virtualPoints=allExtras(payload);
  if(globalThis.ChartPageMode==='transit'&&globalThis.ChartNatalModel&&globalThis.ChartNatalPayload){
   globalThis.ChartNatalModel.virtualPoints=allExtras(globalThis.ChartNatalPayload);
   model.natalPoints=[...globalThis.ChartNatalModel.planets,...globalThis.ChartNatalModel.virtualPoints].map(p=>({...p,key:'natal_'+p.key,originalKey:p.key,natalPoint:true,label:p.label+'·本命'}));
  }
  if(selected!==null&&(selected in names||selected in asteroids||selected.startsWith('natal_'))&&!model.virtualPoints.concat(model.natalPoints||[]).some(p=>p.key===selected))selected=null;
  virtualButton.checked=config.virtualEnabled;
  asteroidButton.checked=config.asteroidsEnabled;
  original();
 };
 function update(){try{localStorage.setItem(storage,JSON.stringify(config));}catch{}render();}
 function syncButtons(){section.querySelectorAll('[data-object]').forEach(b=>b.checked=config[b.dataset.group].includes(b.dataset.object));}
 virtualButton.addEventListener('change',()=>{config.virtualEnabled=virtualButton.checked;if(config.virtualEnabled&&!config.shown.length)config.shown=Object.keys(names);syncButtons();update();});
 asteroidButton.addEventListener('change',()=>{config.asteroidsEnabled=asteroidButton.checked;if(config.asteroidsEnabled&&!config.asteroids.length)config.asteroids=Object.keys(asteroids);syncButtons();update();});
 section.addEventListener('change',event=>{const b=event.target.closest('[data-object]');if(!b)return;const k=b.dataset.object,group=b.dataset.group;config[group]=b.checked?[...new Set([...config[group],k])]:config[group].filter(x=>x!==k);if(config[group].includes(k))config[group==='shown'?'virtualEnabled':'asteroidsEnabled']=true;else if(!config[group].length)config[group==='shown'?'virtualEnabled':'asteroidsEnabled']=false;syncButtons();update();});
 section.addEventListener('change',event=>{const el=event.target;if(el.dataset.position){config[el.dataset.position]=el.value;update();}});
 render();
})();
