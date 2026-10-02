(() => {
 const config=globalThis.ChartLibrary;if(!config)return;
 const physical=window.localStorage,proto=Storage.prototype;
 const original={get:proto.getItem,set:proto.setItem,remove:proto.removeItem,key:proto.key};
 const path=location.pathname,natal=globalThis.ChartSharedArchivePath;
 const normalize=k=>String(k).replaceAll(path,'{PAGE}').replaceAll(natal||'\u0000','{NATAL}');
 const restore=k=>k.replaceAll('{PAGE}',path).replaceAll('{NATAL}',natal||path);
 const recoveryPrefix='cgm-library-pending:'+config.id+':';
 let client=sessionStorage.getItem('cgm-case-client');if(!client){client=crypto.randomUUID();sessionStorage.setItem('cgm-case-client',client);}
 const recoverySelection='cgm-case-recovery:'+config.id;let pendingKey=sessionStorage.getItem(recoverySelection)||recoveryPrefix+client;
 if(!pendingKey.startsWith(recoveryPrefix))pendingKey=recoveryPrefix+client;
 const otherDraftKeys=[];
 for(let i=0;i<physical.length;i++){const k=original.key.call(physical,i);if(k===pendingKey||!k?.startsWith(recoveryPrefix))continue;
  try{const draft=JSON.parse(original.get.call(physical,k)||'{}');if(Object.entries(draft).some(([key,item])=>key.startsWith('chart-')&&item&&Object.hasOwn(item,'value')&&(config.state.entries[key]??null)!==item.value))otherDraftKeys.push(k);}catch{}
 }
 let revision=config.state.revision,baseline={...config.state.entries},values={...baseline},pending={},timer,saving=null,suspended=false,offline=false,allowLeave=false,needsRefresh=false,conflict=null;
 const listeners=[];
 const ui=document.createElement('div');ui.className='archive-save-controls';
 ui.innerHTML='<span class="archive-save-status" role="status"></span><button type="button" class="archive-save-manual" aria-label="重试保存" style="display:none;width:auto;padding:0;font:inherit;font-size:11px">重试</button>';
 document.querySelector('.identity').append(ui);
 const status=ui.querySelector('span'),retry=ui.querySelector('button');
 const setStatus=(text,detail='')=>{
  const saved=text==='已保存',failed=['仅保留草稿','未保存','有内容待核对'].includes(text);
  ui.hidden=saved;status.textContent=saved?'':text==='正在保存'?'保存中':text;status.title=detail;status.dataset.saved=String(saved);status.style.color=failed?'#b12e2a':'#80796b';retry.style.display=failed?'inline-flex':'none';
  retry.textContent=conflict?'处理冲突':'重试';retry.setAttribute('aria-label',conflict?'处理保存冲突':'重试保存');
 };
 function backup(){const text=JSON.stringify(pending);original.set.call(physical,pendingKey,text);if(original.get.call(physical,pendingKey)!==text)throw Error('浏览器草稿保存失败');}
 if(otherDraftKeys.length){
  const recovery=document.createElement('div');recovery.className='chart-storage-notice';recovery.textContent='发现其他页面尚未同步的草稿。';
  otherDraftKeys.forEach((key,i)=>{const button=document.createElement('button');button.textContent='恢复草稿 '+(i+1);button.onclick=async()=>{if(Object.keys(pending).length&&!await saveNow()){setStatus('未保存','请先处理当前编辑，再恢复其他草稿。');return;}sessionStorage.setItem(recoverySelection,key);allowLeave=true;location.reload();};recovery.append(button);});
  document.querySelector('.identity').after(recovery);
 }
 try{const recovered=JSON.parse(original.get.call(physical,pendingKey)||'{}');for(const [key,item] of Object.entries(recovered)){if(!key.startsWith('chart-')||!item||!('value' in item))continue;if((baseline[key]??null)===item.value)continue;pending[key]=item;values[key]=item.value;}}catch{setStatus('未保存','无法读取浏览器草稿');}
 function put(key,value){
  if(allowLeave)return;key=normalize(key);if(values[key]===value)return;
  if(value===null)delete values[key];else values[key]=value;if(suspended)return;
  pending[key]={previous:Object.hasOwn(pending,key)?pending[key].previous:(baseline[key]??null),value};
  try{backup();setStatus(conflict?'有内容待核对':'正在保存');}catch(error){setStatus('未保存',error.message);}
  clearTimeout(timer);if(!conflict)timer=setTimeout(flush,500);
 }
 // Reuse the page modules' storage API and isolate each view in this adapter.
 proto.getItem=function(k){return this===physical&&String(k).startsWith('chart-')?values[normalize(k)]??null:original.get.call(this,k);};
 proto.setItem=function(k,v){if(this===physical&&String(k).startsWith('chart-'))put(k,String(v));else original.set.call(this,k,v);};
 proto.removeItem=function(k){if(this===physical&&String(k).startsWith('chart-'))put(k,null);else original.remove.call(this,k);};
 const ownKeys=()=>Object.keys(values).map(restore);
 proto.key=function(i){return this===physical?ownKeys()[i]??null:original.key.call(this,i);};
 const lengthDescriptor=Object.getOwnPropertyDescriptor(proto,'length');
 if(lengthDescriptor?.configurable)Object.defineProperty(proto,'length',{configurable:true,get(){return this===physical?ownKeys().length:lengthDescriptor.get.call(this);}});
 const missing=Symbol('missing');
 const equal=(a,b)=>a===missing||b===missing?a===b:JSON.stringify(a)===JSON.stringify(b);
 const plain=v=>v!==missing&&v!==null&&typeof v==='object'&&!Array.isArray(v);
 const labels={title:'标题',analysis:'当时的分析',feedback:'当时的反馈',text:'笔记内容',name:'图层名称',records:'档案',relations:'笔记',layers:'图层',objects:'关联对象',date:'日期',transitTime:'时刻'};
 // Merge independent edits by stable record IDs, asking only about values changed on both sides.
 function mergeTree(base,mine,latest,trail,rows,choices){
  if(equal(mine,latest))return mine;if(equal(mine,base))return latest;if(equal(latest,base))return mine;
  if(base===missing&&plain(mine)&&plain(latest))base={};
  if(base===missing&&Array.isArray(mine)&&Array.isArray(latest))base=[];
  if(plain(base)&&plain(mine)&&plain(latest)){
   const result={};for(const key of new Set([...Object.keys(base),...Object.keys(latest),...Object.keys(mine)])){
    const value=mergeTree(Object.hasOwn(base,key)?base[key]:missing,Object.hasOwn(mine,key)?mine[key]:missing,Object.hasOwn(latest,key)?latest[key]:missing,[...trail,labels[key]||key],rows,choices);if(value!==missing)result[key]=value;
   }return result;
  }
  if([base,mine,latest].every(v=>Array.isArray(v)&&v.every(x=>plain(x)&&typeof x.id==='string')&&new Set(v.map(x=>x.id)).size===v.length)){
   const maps=[base,mine,latest].map(v=>new Map(v.map(x=>[x.id,x]))),order=new Set([...latest.map(x=>x.id),...mine.map(x=>x.id)]),result=[];
   for(const id of order){const items=maps.map(m=>m.get(id)??missing),item=items.find(x=>x!==missing);const value=mergeTree(...items,[...trail,item.title||item.name||id],rows,choices);if(value!==missing)result.push(value);}return result;
  }
  const id=rows.length;rows.push({trail,mine,latest});const choice=choices?.[id];
  if(choice?.side==='latest')return latest;if(choice?.side==='edit')return choice.value;return mine;
 }
 function plan(snapshot,current,choices){
  const rows=[],changes={};for(const [key,item] of Object.entries(snapshot)){
   const latest=current.entries[key]??null,trail=[key.startsWith('chart-case-archive')?'案例档案':key.startsWith('chart-note-layers')?'图层笔记':key.startsWith('chart-editor')?'编辑草稿':'页面内容'];
   let value;try{
    const triple=[item.previous,item.value,latest].map(v=>v===null?missing:JSON.parse(v));
    if(triple.some(v=>v!==missing&&typeof v!=='object'))throw Error('scalar');
    const merged=mergeTree(...triple,trail,rows,choices);value=merged===missing?null:JSON.stringify(merged);
   }catch{value=mergeTree(item.previous,item.value,latest,trail,rows,choices);}
   changes[key]=value;
  }return {rows,changes};
 }
 function alignEditorDrafts(changes){
  const draftKey=Object.keys(changes).find(k=>k.startsWith('chart-editor-drafts-v1:'));if(!draftKey||changes[draftKey]===null)return;
  try{
   const drafts=JSON.parse(changes[draftKey]);
   const archiveKey=Object.keys(changes).find(k=>k.startsWith('chart-case-archive-v1:'));
   if(archiveKey&&drafts.caseRecord){
    const archive=changes[archiveKey]===null?[]:JSON.parse(changes[archiveKey]),records=Array.isArray(archive)?archive:archive.records;
    const item=records.find(r=>r.id===drafts.caseRecord.context?.editing);
    if(item)drafts.caseRecord.fields=['title','date','analysis','feedback'].map((key,i)=>({...drafts.caseRecord.fields[i],value:item[key]||''}));
    else if(drafts.caseRecord.context?.editing!=='new')delete drafts.caseRecord;
   }
   const notesKey=Object.keys(changes).find(k=>k.startsWith('chart-note-layers-v1:'));
   if(notesKey&&drafts.relation){
    const layers=changes[notesKey]===null?[]:JSON.parse(changes[notesKey]).layers;
    const context=drafts.relation.context,item=layers.find(l=>l.id===context?.layerId)?.relations?.find(n=>n.id===context?.editing);
    if(item){drafts.relation.fields=['title','text'].map((key,i)=>({...drafts.relation.fields[i],value:item[key]||''}));drafts.relation.context.objects=item.objects;}
    else if(context?.editing)delete drafts.relation;
   }
   changes[draftKey]=JSON.stringify(drafts);
  }catch{throw Error('编辑草稿无法与核对结果对齐，原文仍已保留。');}
 }
 const resolution=document.createElement('dialog');resolution.className='layer-editor archive-conflict-dialog';resolution.setAttribute('aria-label','核对两个版本');document.querySelector('.folio').append(resolution);
 const display=v=>v===missing||v===null?'（已删除）':typeof v==='string'?v:JSON.stringify(v,null,2);
 function openResolution(){
  if(!conflict)return;const pendingAtOpen=structuredClone(pending),snapshot=structuredClone(pending),current=structuredClone(conflict.current);
  // The editor draft can have been committed just before the record itself conflicts.
  // Include it in this transaction so reopening the editor cannot undo the chosen version.
  const draftKey=Object.keys(values).find(k=>k.startsWith('chart-editor-drafts-v1:'));
  if(draftKey&&!snapshot[draftKey]&&Object.keys(snapshot).some(k=>k.startsWith('chart-case-archive-v1:')||k.startsWith('chart-note-layers-v1:'))){snapshot[draftKey]={previous:baseline[draftKey]??null,value:values[draftKey]};if(!Object.hasOwn(current.entries,draftKey))current.entries[draftKey]=baseline[draftKey]??null;}
  const proposal=plan(snapshot,current);
  resolution.replaceChildren();
  const heading=document.createElement('header');heading.className='layer-editor-head';const title=document.createElement('strong');title.textContent='核对两个版本';const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','暂不处理冲突');close.onclick=()=>resolution.close();heading.append(title,close);resolution.append(heading);
  const intro=document.createElement('p');intro.textContent='同一内容在两个页面中被修改。未冲突的修改会一起保留，请选择下列内容。两份原文会留作备份。';resolution.append(intro);
  proposal.rows.forEach((row,index)=>{
   const section=document.createElement('section');section.className='archive-conflict-item';const label=document.createElement('h3');label.textContent=row.trail.join(' · ');section.append(label);
   for(const [side,name,value] of [['mine','这份草稿',row.mine],['latest','案例库中的版本',row.latest]]){
    const option=document.createElement('label');const radio=document.createElement('input');radio.type='radio';radio.name='conflict-'+index;radio.value=side;radio.checked=side==='mine';option.append(radio,document.createTextNode(name));const text=document.createElement('pre');text.textContent=display(value);section.append(option,text);
   }
   if(typeof row.mine==='string'&&typeof row.latest==='string'){
    const option=document.createElement('label');const radio=document.createElement('input');radio.type='radio';radio.name='conflict-'+index;radio.value='edit';option.append(radio,document.createTextNode('合并或改写'));const text=document.createElement('textarea');text.dataset.conflictEdit=String(index);text.setAttribute('aria-label','合并内容 '+(index+1));text.value=row.mine;section.append(option,text);
   }resolution.append(section);
  });
  if(!proposal.rows.length){const p=document.createElement('p');p.textContent='这些修改可以合并，请保存合并结果。';resolution.append(p);}
  const actions=document.createElement('div');actions.className='layer-editor-actions';const download=document.createElement('button');download.type='button';download.textContent='下载版本备份';const apply=document.createElement('button');apply.type='button';apply.textContent='保存核对结果';actions.append(download,apply);resolution.append(actions);
  const message=document.createElement('p');message.setAttribute('role','status');resolution.append(message);
  const recovery={viewId:config.id,createdAt:new Date().toISOString(),draft:snapshot,current};let downloadedBackup=false;
  download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(recovery,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='chart-conflict-versions.json';a.click();downloadedBackup=true;message.textContent='已发起版本备份下载。确认文件收到后，可保存核对结果。';setTimeout(()=>URL.revokeObjectURL(url),60000);};
  apply.onclick=async()=>{
   if(JSON.stringify(pending)!==JSON.stringify(pendingAtOpen)){message.textContent='草稿又有变化，请重新核对。';openResolution();return;}
   const choices=proposal.rows.map((_,i)=>({side:resolution.querySelector('[name="conflict-'+i+'"]:checked')?.value,value:resolution.querySelector('[data-conflict-edit="'+i+'"]')?.value}));
   try{const key='cgm-library-conflict-backup:'+config.id+':'+crypto.randomUUID(),text=JSON.stringify(recovery);original.set.call(physical,key,text);if(original.get.call(physical,key)!==text)throw Error('备份失败');}catch{if(!downloadedBackup){message.textContent='浏览器空间不足，请先下载版本备份，收到文件后再保存核对结果。';return;}}
   const selected=plan(snapshot,current,choices).changes;try{alignEditorDrafts(selected);}catch(error){message.textContent=error.message;return;}for(const [key,value] of Object.entries(selected))pending[key]={previous:current.entries[key]??null,value};
   conflict=null;offline=false;try{backup();}catch{}apply.disabled=true;message.textContent='正在保存核对结果…';
   if(await flush()){allowLeave=true;location.reload();}else{apply.disabled=false;message.textContent=conflict?'其他页面又修改了内容，请重新核对。':'保存尚未完成，草稿和版本备份已保留。';if(conflict)openResolution();}
  };
  if(!resolution.open)resolution.showModal();
 }
 async function flush(){
  clearTimeout(timer);if(conflict)return false;if(saving)return saving;if(!Object.keys(pending).length)return true;
  const sent=structuredClone(pending);setStatus('正在保存');
  saving=(async()=>{try{
   const response=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json','X-Case-Token':config.token},body:JSON.stringify({viewId:config.id,changes:Object.fromEntries(Object.entries(sent).map(([k,v])=>[k,v.value])),previous:Object.fromEntries(Object.entries(sent).map(([k,v])=>[k,v.previous]))}),signal:AbortSignal.timeout(10000)});
   const result=await response.json();
   if(response.status===409&&result.current){conflict={current:result.current};offline=false;backup();setStatus('有内容待核对','草稿已保留，请选择或合并两个版本。');openResolution();return false;}
   if(!response.ok)throw Error(result.error||'案例写入失败');
   revision=result.revision;offline=false;
   for(const [key,value] of Object.entries(result.entries)){
    const merged=value!==sent[key].value;needsRefresh||=merged;baseline[key]=value;
    if(pending[key]?.value===sent[key].value){delete pending[key];if(value===null)delete values[key];else values[key]=value;}
    else if(pending[key])pending[key].previous=value;
   }
   backup();setStatus(Object.keys(pending).length?'正在保存':'已保存','已写入本地案例库');return true;
  }catch(error){offline=true;setStatus('仅保留草稿',error.name==='TimeoutError'?'本地服务响应超时，正在保留草稿。':error.message);try{backup();}catch{setStatus('未保存','浏览器和案例库均未确认保存，请保留页面。');}return false;}
  finally{saving=null;if(Object.keys(pending).length&&!offline&&!conflict)timer=setTimeout(flush,200);}})();return saving;
 }
 async function saveNow(){await globalThis.ChartEditorAutosave?.flush();if(saving)await saving;if(conflict){openResolution();return false;}for(let i=0;i<4&&Object.keys(pending).length;i++){if(!await flush())return false;}return !Object.keys(pending).length;}
 retry.onclick=()=>conflict?openResolution():saveNow();
 globalThis.ChartArchiveStore={get ready(){return !offline&&!conflict;},pending:()=>Object.keys(pending).length,revision:()=>revision,saveNow,flush,keepDraft(){backup();allowLeave=true;setTimeout(()=>allowLeave=false,2000);return true;},runWithoutSaving(fn){suspended=true;try{return fn();}finally{suspended=false;}}};
 globalThis.ChartLibraryStore={put,values:()=>({...values}),dirty(){setStatus(conflict?'有内容待核对':'正在保存');},subscribe(fn){listeners.push(fn);}};
 for(const warning of config.state.warnings||[]){
  const notice=document.createElement('div');notice.className='chart-storage-notice';const text=document.createElement('span');text.textContent=warning.message||'一项记录无法读取，原文已保留。';notice.append(text);
  if(warning.historyId!==null&&warning.historyId!==undefined){const button=document.createElement('button');button.type='button';button.textContent='恢复最近有效版本';button.onclick=async()=>{
   if(Object.keys(pending).length&&!await saveNow()){text.textContent='请先保存或处理当前草稿，再恢复历史版本。';return;}
   button.disabled=true;try{const r=await fetch('/api/restore-entry',{method:'POST',headers:{'Content-Type':'application/json','X-Case-Token':config.token},body:JSON.stringify({viewId:config.id,historyId:warning.historyId,expectedRevision:revision})});const result=await r.json();if(!r.ok)throw Error(result.error||'恢复失败');allowLeave=true;location.reload();}catch(error){button.disabled=false;text.textContent=error.message;}
  };notice.append(button);}document.querySelector('.identity').after(notice);
 }
 window.addEventListener('beforeunload',event=>{if(allowLeave)return;globalThis.ChartEditorAutosave?.capture();if(Object.keys(pending).length){backup();event.preventDefault();event.returnValue='';}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&!allowLeave){globalThis.ChartEditorAutosave?.capture();flush();}});
 setInterval(async()=>{if(document.hidden||allowLeave)return;if(Object.keys(pending).length){if(offline&&!conflict)flush();return;}try{if(needsRefresh&&!document.querySelector('dialog[open]')){allowLeave=true;location.reload();return;}const r=await fetch('/api/state?view='+config.id+'&since='+revision,{cache:'no-store'});if(r.status===204)return;await r.json();if(!r.ok)return;if(document.querySelector('dialog[open]')||globalThis.ChartEditorAutosave?.editing())return;allowLeave=true;location.reload();}catch{}},3000);
 setStatus(Object.keys(pending).length?'正在保存':'已保存','已载入本地案例库');if(Object.keys(pending).length)timer=setTimeout(flush,500);
})();
