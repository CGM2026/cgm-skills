(() => {
 if(!globalThis.ChartLibrary||ChartLibrary.export)return;
 const key='chart-editor-drafts-v1:'+location.pathname,hooks=globalThis.ChartEditorHooks||{};
 let drafts={},timer,restoring=false;
 try{drafts=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
 const controls=root=>[...root.querySelectorAll('input:not([type=hidden]),textarea,select')];
 function persist(){localStorage.setItem(key,JSON.stringify(drafts));}
 function captureOne(id,hook){
  if(restoring||!hook.root.open||hook.active&&!hook.active())return;
  const context=hook.context(),fields=controls(hook.root).map(e=>({value:e.value,checked:e.checked}));
  if(JSON.stringify(drafts[id]?.context)===JSON.stringify(context)&&JSON.stringify(drafts[id]?.fields)===JSON.stringify(fields))return;
  drafts[id]={context,fields,time:Date.now()};persist();
 }
 function capture(){for(const [id,hook] of Object.entries(hooks))if(hook.root.open)captureOne(id,hook);}
 async function commit(){
  clearTimeout(timer);
  for(const [id,hook] of Object.entries(hooks))if(hook.root.open&&drafts[id]&&(!hook.active||hook.active())){if(hook.save)await hook.save();captureOne(id,hook);}
 }
 for(const [id,hook] of Object.entries(hooks)){
  const changed=e=>{if(restoring)return;ChartLibraryStore.dirty();captureOne(id,hook);clearTimeout(timer);timer=setTimeout(commit,500);};
  hook.root.addEventListener('input',changed);hook.root.addEventListener('change',changed);
  hook.root.addEventListener('close',()=>{clearTimeout(timer);if(hook.onClose?.()===false)return;if(hook.discardOnClose!==false){delete drafts[id];persist();}});
 }
 globalThis.ChartEditorAutosave={capture,flush:commit,finish(id){clearTimeout(timer);delete drafts[id];persist();},editing:()=>Object.values(hooks).some(h=>h.root.open)};
 // Restore the most recently open editor, after all page modules are initialized.
 const latest=Object.entries(drafts).filter(([id])=>hooks[id]).sort((a,b)=>b[1].time-a[1].time)[0];
 if(latest)setTimeout(async()=>{const [id,d]=latest,hook=hooks[id];restoring=true;try{await hook.restore(d.context);controls(hook.root).forEach((e,i)=>{if(!d.fields[i])return;e.value=d.fields[i].value;if('checked' in e)e.checked=d.fields[i].checked;});}finally{restoring=false;}},0);
})();
