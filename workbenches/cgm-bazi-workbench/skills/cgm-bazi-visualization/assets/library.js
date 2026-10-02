/* Local library controls supplement the accepted book page; all facts come from the calculator. */
(()=>{
 'use strict';
 const config=JSON.parse(document.getElementById('bazi-library-config').textContent);
 const panel=document.createElement('aside');panel.className='bazi-workspace';panel.setAttribute('aria-label','案例记录与日期查询');
 panel.innerHTML='<nav aria-label="案例盘式"></nav><details id="bazi-records"><summary>案例记录</summary><div class="bazi-note-tools"><label>记录类型 <select id="bazi-kind"><option value="note">对象笔记</option><option value="record">本盘档案</option></select></label><label>关联对象 <select id="bazi-object"></select></label></div><textarea id="bazi-text" aria-label="记录正文" maxlength="100000"></textarea><div class="bazi-status" role="status" id="bazi-status"></div><button id="bazi-retry" hidden>重试保存</button><section class="bazi-conflict" id="bazi-conflict" hidden><p>另一处已修改同一记录。你的草稿仍在编辑框，可以核对、合并后保存。</p><pre id="bazi-server-text"></pre><button id="bazi-use-server">使用库中版本</button><button id="bazi-merge">保存已核对的草稿</button></section></details><details id="bazi-dates"><summary>按日期定位推运</summary><label>查询日期 <input id="bazi-date" type="date"></label><button id="bazi-date-query">查看这一天</button><div class="bazi-date-result" id="bazi-date-result" role="status"></div></details>';
 document.querySelector('main').after(panel);
 const byId=id=>document.getElementById(id),editor=byId('bazi-text'),object=byId('bazi-object'),kind=byId('bazi-kind'),status=byId('bazi-status'),retry=byId('bazi-retry'),conflictBox=byId('bazi-conflict');
 let entries=[],baseVersion=0,baseText='',timer=null,dirty=false,inFlight=null,conflict=null,objectSequence=0,polling=false,draftBackedUp=true;
 const storageKey=()=>['bazi-draft',config.rootIdentity,config.viewId,object.value,kind.value].join(':');
 const contextKey=['bazi-record-context',config.rootIdentity,config.viewId].join(':');
 let rememberedContext=null;try{
  rememberedContext=JSON.parse(localStorage.getItem(contextKey));
  if(!rememberedContext){const prefix=['bazi-draft',config.rootIdentity,config.viewId,''].join(':');for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key.startsWith(prefix)){const suffix=key.slice(prefix.length),at=suffix.lastIndexOf(':');rememberedContext={object:suffix.slice(0,at),kind:suffix.slice(at+1)};break;}}}
  if(rememberedContext?.kind==='record')kind.value='record';
 }catch{}
 function rememberContext(){try{localStorage.setItem(contextKey,JSON.stringify({object:object.value,kind:kind.value}));}catch{}}
 const notationKey=['bazi-notation',config.rootIdentity,config.caseId].join(':');
 function rememberNotation(){try{sessionStorage.setItem(notationKey,notation);}catch{}}
 const describeError=e=>/Failed to fetch|NetworkError|Load failed/i.test(e.message||'')?'暂时连接不到案例库':e.message||String(e);
 async function api(route,body){
  const response=await fetch(route,body?{method:'POST',headers:{'Content-Type':'application/json','X-Bazi-Token':config.token},body:JSON.stringify(body)}:undefined);
  const result=await response.json();
  if(!response.ok){const e=Error(result.error||'案例库暂时不可用');e.current=result.current;e.httpStatus=response.status;throw e;}
  return result;
 }
 function persist(){try{localStorage.setItem(storageKey(),JSON.stringify({text:editor.value,version:baseVersion}));rememberContext();draftBackedUp=true;return true;}catch(e){draftBackedUp=false;status.textContent='浏览器草稿无法保存；请保留页面并复制正文，重试库中保存。';return false;}}
 function showError(e){status.textContent=describeError(e)+(draftBackedUp?'；草稿保留':'；正文仍在本页，请先复制备份');retry.hidden=false;}
 function loadEntry(){
  const current=entries.find(e=>e.object_id===object.value&&e.kind===kind.value);
  baseVersion=current?.version||0;baseText=current?.text||'';editor.value=baseText;dirty=false;conflict=null;conflictBox.hidden=true;retry.hidden=true;status.textContent='';
  try{const raw=localStorage.getItem(storageKey());if(raw){const draft=JSON.parse(raw);if(draft.text===baseText){localStorage.removeItem(storageKey());}else{editor.value=draft.text;baseVersion=draft.version;dirty=true;status.textContent='已恢复未完成草稿';retry.hidden=false;}}}catch(e){status.textContent='草稿读取失败，请核对库中记录；未清除原草稿';}
 }
 async function save(){
  clearTimeout(timer);if(inFlight){await inFlight;return dirty&&!conflict?save():undefined;}if(!dirty||conflict)return;
  const entryObject=object.value,entryKind=kind.value,content=editor.value,version=baseVersion,key=storageKey();
  status.textContent='保存中';retry.hidden=true;
  inFlight=(async()=>{
   try{
    const saved=await api('/api/put',{view:config.viewId,object:entryObject,kind:entryKind,text:content,version});
    entries=entries.filter(e=>e.object_id!==entryObject||e.kind!==entryKind);entries.push(saved);
    if(object.value===entryObject&&kind.value===entryKind){baseVersion=saved.version;baseText=content;dirty=editor.value!==content;if(dirty)persist();else{try{localStorage.removeItem(key);}catch{}status.textContent='';}}
   }catch(e){
    if(e.httpStatus===409){conflict=e.current;conflictBox.hidden=false;byId('bazi-server-text').textContent='库中版本：\n'+(conflict.text||'（空）');status.textContent='版本冲突，草稿保留';retry.hidden=true;}
    else showError(e);
   }
  })();
  await inFlight;inFlight=null;if(dirty&&!conflict&&retry.hidden)timer=setTimeout(save,500);
 }
 editor.addEventListener('input',()=>{dirty=editor.value!==baseText;persist();clearTimeout(timer);if(!conflict)timer=setTimeout(save,500);});
 retry.onclick=save;
 byId('bazi-use-server').onclick=()=>{if(!conflict)return;entries=entries.filter(e=>e.object_id!==object.value||e.kind!==kind.value);entries.push({...conflict,object_id:object.value,kind:kind.value});try{localStorage.removeItem(storageKey());}catch{}loadEntry();};
 byId('bazi-merge').onclick=()=>{if(!conflict)return;baseVersion=conflict.version;baseText=conflict.text||'';conflict=null;conflictBox.hidden=true;dirty=true;persist();save();};
 let previousObject='',previousKind='note';
 async function changeContext(){const nextObject=object.value,nextKind=kind.value;object.value=previousObject;kind.value=previousKind;if(dirty)persist();await save();object.value=nextObject;kind.value=nextKind;previousObject=nextObject;previousKind=nextKind;rememberContext();loadEntry();if(dirty)save();}
 object.onchange=changeContext;
 kind.onchange=async()=>{if(kind.value==='record')object.value='case';await changeContext();object.disabled=kind.value==='record';};
 async function refreshObjects(){
  const sequence=++objectSequence;
  try{
   const keep=object.value||rememberedContext?.object||'case';
   const values=await api('/api/objects?'+new URLSearchParams({view:config.viewId,year:selection.year,month:selection.month,day:selection.day||'',object:keep}));
   if(sequence!==objectSequence)return;
   object.replaceChildren(...values.map(v=>{const option=document.createElement('option');option.value=v.id;option.textContent=v.label;return option;}));
   object.value=values.some(o=>o.id===keep)?keep:'case';if(kind.value==='record')object.value='case';object.disabled=kind.value==='record';previousObject=object.value;previousKind=kind.value;
  }catch(e){showError(e);}
 }
 const renderPage=renderAll;
 renderAll=function(){renderPage();refreshObjects();};
 // Navigate between library views rather than copying notes into the next mode.
 const modeButton=byId('mode');
 modeButton.addEventListener('click',async e=>{e.preventDefault();e.stopImmediatePropagation();rememberNotation();await save();const next={year:'month',month:'day',day:'year'}[config.mode];const view=config.views.find(v=>v.mode===next);if(view)location.href='/view/'+view.id;},true);
 const nav=panel.querySelector('nav');
 for(const view of config.views){const a=document.createElement('a');a.href='/view/'+view.id;a.textContent={year:'岁运盘',month:'流月盘',day:'流日盘'}[view.mode];if(view.id===config.viewId)a.setAttribute('aria-current','page');a.onclick=async e=>{e.preventDefault();rememberNotation();if(dirty)persist();await save();location.href=a.href;};nav.append(a);}
 byId('bazi-date').value=selection.day||todayDate();
 byId('bazi-date-query').onclick=async()=>{
  const target=byId('bazi-date-result');target.textContent='查询中';
  try{
   const d=await api('/api/date?'+new URLSearchParams({view:config.viewId,date:byId('bazi-date').value}));
   const luck=d.luck?(d.luck.kind==='major-luck'?d.luck.gz+'大运（'+d.luck.startDate+' 起）':d.luck.gz+'小运'):d.candidates.length?d.candidates.map(p=>p.gz+(p.kind==='major-luck'?'大运':'小运')).join(' → '):'未定位实际交运';
   target.textContent=d.date+'\n'+luck+'\n流月 '+d.flowMonth.gz+' · 流日 '+d.flowDay.gz+'\n'+d.warnings.join('\n')+(d.changesToday.some(c=>c.kind==='solar-term')?'\n交节当天整日归新流月；出生月柱仍按交节瞬间。':'');
  }catch(e){target.textContent=describeError(e);}
 };
 window.addEventListener('beforeunload',()=>{if(dirty)persist();});
 setInterval(async()=>{
  if(polling||inFlight)return;polling=true;
  try{const fresh=await api('/api/notes?view='+config.viewId);entries=fresh;if(!dirty&&!conflict){const current=fresh.find(e=>e.object_id===object.value&&e.kind===kind.value);if((current?.version||0)!==baseVersion)loadEntry();}}catch(e){if(dirty)showError(e);}finally{polling=false;}
 },3000);
 (async()=>{try{entries=await api('/api/notes?view='+config.viewId);try{if(sessionStorage.getItem(notationKey)==='stems'&&notation!=='stems')byId('notation').click();}catch{}if(config.mode!=='year')setMode(config.mode);else renderAll();await refreshObjects();loadEntry();if(dirty)save();}catch(e){showError(e);}})();
})();
