(() => {
 const config=globalThis.ChartLibrary,state=config.state.entries,prefix='cgm-export:'+config.id+':'+config.state.revision+':',store=localStorage,proto=Storage.prototype;
 const get=proto.getItem,set=proto.setItem,remove=proto.removeItem;
 const portable=k=>String(k).replaceAll(location.pathname,'{PAGE}');
 for(const [key,value] of Object.entries(state))try{if(get.call(store,prefix+key)===null)set.call(store,prefix+key,value);}catch{}
 proto.getItem=function(k){return get.call(this,this===store&&String(k).startsWith('chart-')?prefix+portable(k):k);};
 proto.setItem=function(k,v){return set.call(this,this===store&&String(k).startsWith('chart-')?prefix+portable(k):k,v);};
 proto.removeItem=function(k){return remove.call(this,this===store&&String(k).startsWith('chart-')?prefix+portable(k):k);};
 const note=document.createElement('p');note.style.cssText='font-size:12px;color:#817565';note.textContent='导出副本 · 修改仅留在此浏览器，不自动回写案例库';document.querySelector('.identity').append(note);
})();
