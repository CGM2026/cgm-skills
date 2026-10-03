(() => {
 const config=globalThis.ChartLibrary,values=new Map(Object.entries(config.state.entries)),proto=Storage.prototype;
 const native={get:proto.getItem,set:proto.setItem,remove:proto.removeItem};
 const portable=k=>String(k).replaceAll(location.pathname,'{PAGE}');
 const frozen=k=>/chart-note-layers|chart-case-archive|chart-editor-drafts|chart-point-notes/.test(k);
 proto.getItem=function(k){return this===localStorage&&String(k).startsWith('chart-')?(values.get(portable(k))??null):native.get.call(this,k);};
 proto.setItem=function(k,v){if(this===localStorage&&String(k).startsWith('chart-')){if(!frozen(k))values.set(portable(k),String(v));return;}native.set.call(this,k,v);};
 proto.removeItem=function(k){if(this===localStorage&&String(k).startsWith('chart-')){if(!frozen(k))values.delete(portable(k));return;}native.remove.call(this,k);};
})();
