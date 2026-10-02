(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BaziResearchDrafts=api;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 function usable(saved){return saved&&Number.isInteger(saved.version)&&saved.version>=0&&saved.state?.schema==='bazi-research/1'&&Array.isArray(saved.state.layers)&&saved.state.layers.every(l=>l&&typeof l.id==='string'&&typeof l.name==='string'&&Array.isArray(l.notes)&&l.notes.every(n=>n&&typeof n.id==='string'&&typeof n.title==='string'&&typeof n.text==='string'&&Array.isArray(n.objects)&&Array.isArray(n.marks)));}
 function create(storage,prefix,id){
  const key=prefix+':window:'+id,warnings=[];
  function scan(){const entries=[];warnings.length=0;try{const keys=Array.from({length:storage.length},(_,i)=>storage.key(i));for(const candidate of keys){if(candidate!==prefix&&!candidate?.startsWith(prefix+':window:'))continue;if(candidate===key)continue;const raw=storage.getItem(candidate);if(!raw)continue;try{const saved=JSON.parse(raw);if(!usable(saved))throw Error('草稿结构无效');entries.push({key:candidate,raw,saved});}catch(e){warnings.push({key:candidate,reason:e.message,rawLength:raw.length});}}}catch(e){warnings.push({reason:'浏览器草稿无法读取：'+e.message});}return entries.sort((a,b)=>(b.saved.updated||0)-(a.saved.updated||0));}
  function write(value){storage.setItem(key,JSON.stringify({...value,updated:Date.now(),format:'bazi-window-draft/1'}));}
  function remove(entry){if(entry&&storage.getItem(entry.key)===entry.raw)storage.removeItem(entry.key);}
  function backup(value){storage.setItem(prefix+':backup:'+id+':'+Date.now(),JSON.stringify(value));}
  return {key,prefix,warnings,scan,write,remove,backup,clear:()=>storage.removeItem(key)};
 }
 // Replay only edits made after a request was sent onto its acknowledged result.
 // Server-side merging remains authoritative; deletion/edit conflicts are never resolved here.
 function rebase(before,local,ack){const conflicts=[];
  function merge(b,l,a,path){if(same(b,l))return copy(a);if(same(b,a)||same(l,a))return copy(l);
   if([b,l,a].every(v=>v&&typeof v==='object'&&!Array.isArray(v))){const out=Object.create(null);for(const k of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(a)])){const v=merge(b[k],l[k],a[k],path.concat(k));if(v!==undefined)out[k]=v;}return out;}
   if([b,l,a].every(Array.isArray)&&[b,l,a].every(arr=>arr.every(v=>v&&typeof v==='object'&&typeof v.id==='string')&&new Set(arr.map(v=>v.id)).size===arr.length)){const bm=new Map(b.map(v=>[v.id,v])),lm=new Map(l.map(v=>[v.id,v])),am=new Map(a.map(v=>[v.id,v])),ids=[...new Set([...a.map(v=>v.id),...l.map(v=>v.id),...b.map(v=>v.id)])],out=[];for(const id of ids){const v=merge(bm.get(id),lm.get(id),am.get(id),path.concat(id));if(v!==undefined)out.push(v);}return out;}
   conflicts.push(path.join('/'));return copy(l);
  }return {state:merge(before,local,ack,[]),conflicts};
 }
 function reconcile(target,incoming){if(!target||!incoming||typeof target!=='object'||typeof incoming!=='object')return copy(incoming);
  if(Array.isArray(target)&&Array.isArray(incoming)){const byId=new Map(target.filter(v=>v&&typeof v==='object'&&typeof v.id==='string').map(v=>[v.id,v]));const values=incoming.map(v=>v&&typeof v==='object'&&typeof v.id==='string'&&byId.has(v.id)?reconcile(byId.get(v.id),v):copy(v));target.splice(0,target.length,...values);return target;}
  if(Array.isArray(target)||Array.isArray(incoming))return copy(incoming);
  for(const k of Object.keys(target))if(!Object.hasOwn(incoming,k))delete target[k];for(const [k,v]of Object.entries(incoming)){const value=v&&typeof v==='object'&&Object.hasOwn(target,k)&&target[k]&&typeof target[k]==='object'?reconcile(target[k],v):copy(v);Object.defineProperty(target,k,{value,writable:true,enumerable:true,configurable:true});}return target;
 }
 return {create,usable,rebase,reconcile};
});
