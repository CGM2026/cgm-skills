(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BaziNotePolicy=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';const LIMIT=30;
 function check(next,previous){for(const layer of next.layers||[]){const old=(previous?.layers||[]).find(l=>l.id===layer.id),ids=new Set((old?.notes||[]).map(n=>n.id));if(layer.notes.length>LIMIT&&(!old||old.notes.length<=LIMIT||layer.notes.some(n=>!ids.has(n.id))))throw Error('每个图层最多30条笔记；旧超限笔记可编辑或删除，不能增加。');if(old?.notes.length>LIMIT&&layer.notes.some(n=>!ids.has(n.id)))throw Error('旧超限图层不能增加笔记，请先减少到30条以下。');}return true;}
 function clean(queue,notes){const ids=new Set(notes.map(n=>n.id));return [...new Set(queue||[])].filter(id=>ids.has(id)).slice(-3);}
 function open(queue,id,notes){const q=clean(queue,notes);if(!notes.some(n=>n.id===id))return q;if(!q.includes(id))q.push(id);return q.slice(-3);}
 function close(queue,id,notes){return clean(queue,notes).filter(x=>x!==id);}
 function short(title){const chars=Array.from(title||'未命名笔记');return chars.length>5?chars.slice(0,5).join('')+'…':chars.join('');}
 return {LIMIT,check,clean,open,close,short};
});
