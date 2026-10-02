(() => {
 const source=location.href,pagePath=location.pathname,natalPath=globalThis.ChartSharedArchivePath;
 const element=document.getElementById('chart-archive-state');
 let state=JSON.parse(element.textContent),revision=state.revision,shared={};
 const originalSet=Storage.prototype.setItem,originalGet=Storage.prototype.getItem,originalRemove=Storage.prototype.removeItem;
 const local=window.localStorage,mode=globalThis.ChartPageMode;
 const controls=document.createElement('div');controls.className='archive-save-controls';
 const status=document.createElement('span');status.className='archive-save-status';status.setAttribute('role','status');
 const manual=document.createElement('button');manual.type='button';manual.className='archive-save-manual';manual.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h13l3 3v13H4zM7 4v6h9V4M8 20v-7h8v7"/></svg>';manual.setAttribute('aria-label','手动保存页面记录到 HTML');manual.title='保存';
 controls.append(status,manual);document.querySelector('.identity').append(controls);
 const setStatus=(saved,detail='')=>{status.textContent=saved?'已保存':'未保存';status.title=detail;status.dataset.saved=String(saved);};
 setStatus(false,'正在连接档案');
 const put=(key,value)=>originalSet.call(local,key,value),get=key=>originalGet.call(local,key);
 const portable=key=>key.replaceAll(pagePath,'{PAGE}').replaceAll(natalPath&&natalPath!==pagePath?natalPath:'\u0000','{NATAL}');
 const actual=key=>key.replaceAll('{PAGE}',pagePath).replaceAll('{NATAL}',natalPath||pagePath);
 const sharedPrefixes=['chart-custom-lots-v1:','chart-deleted-built-in-lots:','chart-lot-categories-v1:','chart-virtual-points-v1:','chart-aspect-management-v1:','chart-house-cycle-v1:','chart-base-layout-v1:'];
 function sharedKey(key){const profile=globalThis.ChartTimeLordMode|| (globalThis.ChartDecennialsMode?'decennials':globalThis.ChartReturnMode?'return':mode==='transit'?'transit':'natal');for(const prefix of sharedPrefixes)if(key.startsWith(prefix))return profile+'|'+prefix;if(key==='chart-ayanamsa-v1'||key.startsWith('chart-transit-ayanamsa-v1:'))return profile+'|chart-ayanamsa-v1:';if(key==='chart-personal-tradition-v1'||key.startsWith('chart-transit-personal-tradition-v1:'))return profile+'|chart-personal-tradition-v1:';return null;}
 const settingKeys=()=>['chart-custom-lots-v1:'+pagePath,'chart-deleted-built-in-lots:'+pagePath,'chart-lot-categories-v1:'+pagePath,'chart-virtual-points-v1:'+pagePath,'chart-aspect-management-v1:'+pagePath,'chart-house-cycle-v1:'+payload.source_sha256,'chart-base-layout-v1:'+payload.source_sha256+':'+pagePath,mode==='transit'?'chart-transit-ayanamsa-v1:'+pagePath:'chart-ayanamsa-v1',mode==='transit'?'chart-transit-personal-tradition-v1:'+pagePath:'chart-personal-tradition-v1'];
 const belongs=key=>!key.startsWith('chart-unsaved-backup:')&&key.startsWith('chart-')&&(key.endsWith(pagePath)||key.includes(payload.source_sha256)||key==='chart-ayanamsa-v1'||key==='chart-personal-tradition-v1');
 function call(path,body){const request=new XMLHttpRequest();request.open('POST','http://127.0.0.1:4852'+path,false);request.setRequestHeader('Content-Type','application/json');request.send(JSON.stringify({source,...body}));if(request.status!==200)throw Error(JSON.parse(request.responseText||'{}').error||'本机档案服务未连接');return JSON.parse(request.responseText);}
 let connected=false;
 try{const boot=call('/archive-bootstrap',{});state=boot.state;revision=state.revision;shared=boot.shared||{};connected=true;}catch{setStatus(false,'档案服务未连接，修改尚不能写入文件');}
 if(connected){
  if(revision===0&&Object.keys(state.entries).length===0){const changes={},sharedChanges={};for(let i=0;i<local.length;i++){const key=local.key(i);if(!belongs(key))continue;const value=get(key);if(value===null)continue;changes[portable(key)]=value;const sharedName=sharedKey(key);if(sharedName)sharedChanges[sharedName]=value;}if(Object.keys(changes).length)try{revision=call('/archive-save',{token:state.token,revision,changes,shared:sharedChanges}).revision;state.entries=changes;Object.assign(shared,sharedChanges);}catch(error){setStatus(false,'旧记录迁入文件失败：'+error.message);connected=false;}}
  if(connected){
   if(revision>0){for(let i=local.length-1;i>=0;i--){const key=local.key(i);if(belongs(key))originalRemove.call(local,key);}for(const [key,value] of Object.entries(state.entries))put(actual(key),value);}
   for(const key of settingKeys()){const sharedName=sharedKey(key);const value=shared[sharedName]??(mode==='transit'||globalThis.ChartDecennialsMode?shared['natal|'+sharedName?.split('|')[1]]:undefined);if(value!==undefined)put(key,value);}
   setStatus(true);
  }
 }
 const queue=[];let saving=false,blocked=false;
 function recoverTasks(tasks,entries){
  const groups=new Map();
  for(const task of tasks){if(typeof task?.key!=='string'||typeof task?.value!=='string'||!task.key.startsWith('chart-'))continue;if(!groups.has(task.key))groups.set(task.key,[]);groups.get(task.key).push(task);}
  return [...groups.values()].flatMap(items=>{const first=items[0],last=items.at(-1),saved=entries[last.key]??null;
   if(saved===last.value)return [];
   const known=saved===(first.previous??null)||items.some(task=>task.value===saved)||(last.key.startsWith('chart-return-cards-v1:')&&first.previous==null&&saved==='[]');
   return [{...last,previous:known?saved:(first.previous??null)}];
  });
 }
 try{const recovered=JSON.parse(get('chart-unsaved-backup:'+pagePath)||'[]');if(Array.isArray(recovered))for(const task of recoverTasks(recovered,state.entries)){queue.push(task);put(actual(task.key),task.value);}}catch{}
 function backup(){try{put('chart-unsaved-backup:'+pagePath,JSON.stringify(queue));}catch{}}
 async function flush(){if(saving||blocked||!connected||!queue.length)return;saving=true;setStatus(false,'正在写入 HTML');while(queue.length){const task=queue[0];try{const response=await fetch('http://127.0.0.1:4852/archive-save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source,token:state.token,revision,previous:{[task.key]:task.previous??null},changes:{[task.key]:task.value},shared:task.shared?{[task.shared]:task.value}:{}})});const data=await response.json();if(!response.ok)throw Error(data.error||'保存失败');revision=data.revision;state.entries[task.key]=task.value;queue.shift();backup();}catch(error){blocked=true;setStatus(false,String(error.message||error)+'（记录留在当前浏览器）');break;}}saving=false;if(!queue.length){setStatus(true);backup();}}
 async function saveNow(){
  if(blocked){try{const fresh=call('/archive-bootstrap',{}).state;if(fresh.token!==state.token){setStatus(false,'页面档案版本已变化，请刷新后保存');return false;}queue.splice(0,queue.length,...recoverTasks(queue,fresh.entries));state=fresh;revision=fresh.revision;blocked=false;backup();}catch(error){setStatus(false,String(error.message||error));return false;}}
  if(!connected){try{const fresh=call('/archive-bootstrap',{}).state;if(fresh.token!==state.token||fresh.revision!==revision){setStatus(false,'页面档案版本已变化，请刷新后保存');return false;}connected=true;}catch(error){setStatus(false,'档案服务未连接：'+String(error.message||error));return false;}}
  const waitUntil=Date.now()+5000;while(saving&&Date.now()<waitUntil)await new Promise(resolve=>setTimeout(resolve,50));
  if(saving){setStatus(false,'写入尚未完成，请稍后再试');return false;}
  for(let i=0;i<local.length;i++){const key=local.key(i);if(!belongs(key))continue;const value=get(key),savedKey=portable(key);
   if(value===null||state.entries[savedKey]===value||queue.some(item=>item.key===savedKey&&item.value===value))continue;
   queue.push({key:savedKey,value,previous:state.entries[savedKey]??null,shared:sharedKey(key)});
  }
  if(queue.length){blocked=false;backup();await flush();return !queue.length;}
  try{const latest=call('/archive-bootstrap',{}).state;if(latest.token!==state.token||latest.revision!==revision){setStatus(false,'页面档案版本已变化，请刷新后核对');return false;}setStatus(true,'页面记录已与 HTML 核对一致');return true;}
  catch(error){setStatus(false,String(error.message||error));return false;}
 }
 manual.onclick=async()=>{manual.disabled=true;manual.title='保存中';const okay=await saveNow();manual.title='保存';manual.disabled=false;if(okay)status.title='手动保存已完成，页面记录已写入 HTML';};
 let suspended=false;
 Storage.prototype.setItem=function(key,value){const before=this===local?get(key):null;originalSet.call(this,key,value);if(suspended||this!==local||!belongs(String(key))||String(value)===before)return;const portableKey=portable(String(key)),prior=[...queue].reverse().find(item=>item.key===portableKey);const item={key:portableKey,value:String(value),previous:prior?.value??state.entries[portableKey]??null,shared:sharedKey(String(key))};queue.push(item);backup();flush();};
 backup();if(queue.length)flush();
 let leavingWithDraft=false;
 function keepDraft(){const value=JSON.stringify(queue),key='chart-unsaved-backup:'+pagePath;put(key,value);if(get(key)!==value)throw Error('浏览器草稿未能保存，请留在当前页面。');leavingWithDraft=true;setTimeout(()=>{leavingWithDraft=false;},2000);return true;}
 window.addEventListener('beforeunload',event=>{if(!queue.length||leavingWithDraft)return;event.preventDefault();event.returnValue='';});
 globalThis.ChartArchiveStore={get ready(){return connected;},pending:()=>queue.length,revision:()=>revision,flush,saveNow,keepDraft,runWithoutSaving:fn=>{suspended=true;try{return fn();}finally{suspended=false;}}};
})();
