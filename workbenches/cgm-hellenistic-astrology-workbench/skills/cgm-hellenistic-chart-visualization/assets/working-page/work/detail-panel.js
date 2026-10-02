(() => {
 const side=document.querySelector('.side'),folio=document.querySelector('.folio'),workspace=document.querySelector('.workspace');
 const dialog=document.createElement('dialog');dialog.className='point-dialog';dialog.setAttribute('aria-label','点位详情');folio.append(dialog);dialog.append(side);
 const toolbar=document.createElement('div');toolbar.className='detail-toolbar';
 const closeIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
 toolbar.innerHTML='<button type="button" class="dock-detail" title="移到下方" aria-label="移到下方"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4zM4 15h16M12 7v5m-3-3 3 3 3-3"/></svg></button><button type="button" class="close-detail" aria-label="关闭详情">'+closeIcon+'</button>';
 side.prepend(toolbar);
 const status=document.createElement('p');status.className='dock-status';status.setAttribute('role','status');dialog.append(status);
 const cards=new Map();
 const tabs=document.createElement('div');tabs.className='docked-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','已保留的卡片');tabs.hidden=true;workspace.append(tabs);
 const external=new Map();const buttons=new Map();const permanent=new Set();let active=null;
 function activate(key){active=key;tabs.hidden=!cards.size;for(const [k,card] of cards){card.hidden=k!==key;const b=buttons.get(k);b.setAttribute('aria-selected',String(k===key));b.tabIndex=k===key?0:-1;}}
 function remove(key){if(permanent.has(key)||!cards.has(key))return;const keys=[...cards.keys()],index=keys.indexOf(key);cards.get(key).remove();cards.delete(key);buttons.get(key).remove();buttons.delete(key);const onClose=external.get(key);external.delete(key);onClose?.();activate(active===key?([...cards.keys()][Math.min(index,cards.size-1)]||null):active);}
 const find=key=>[...model.planets,...model.angles,...model.lots,...(model.natalPoints||[]),...(model.virtualPoints||[]),...(model.ringPoints||[]),...(model.housePoints||[]),...(model.aspectPoints||[])].find(p=>p.key===key);
 function refresh(){for(const [key,card] of cards){if(external.has(key))continue;const p=find(key);if(!p){remove(key);continue;}const content=card.querySelector('.detail-content');content.innerHTML=ChartView.detail(p,model);buttons.get(key).textContent=content.querySelector('.point-name')?.textContent||content.querySelector('.ring-title')?.textContent||p.label||key;const note=content.querySelector('.note-text');if(note)note.textContent=globalThis.ChartLotNotes?.get(key)||p.note||'无备注';}}
 function attach(key,card){
  const tab=document.createElement('button');tab.type='button';tab.id='dock-tab-'+key;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','dock-panel-'+key);card.id='dock-panel-'+key;card.setAttribute('role','tabpanel');card.setAttribute('aria-labelledby',tab.id);
  tab.addEventListener('click',()=>activate(key));
  tab.addEventListener('keydown',event=>{const keys=[...cards.keys()],i=keys.indexOf(key);let next;if(event.key==='ArrowRight')next=keys[(i+1)%keys.length];else if(event.key==='ArrowLeft')next=keys[(i+keys.length-1)%keys.length];else if(event.key==='Home')next=keys[0];else if(event.key==='End')next=keys[keys.length-1];else return;event.preventDefault();activate(next);buttons.get(next).focus();});
  buttons.set(key,tab);tabs.append(tab);cards.set(key,card);workspace.append(card);activate(key);
 }
 globalThis.ChartDock={has:key=>cards.has(key),canAdd:key=>cards.has(key)||cards.size-permanent.size<5,activate,remove,add:(key,label,card,onClose)=>{if(globalThis.ChartNoteLayers?.current())return false;if(cards.has(key)){activate(key);return true;}if(cards.size-permanent.size>=5)return false;external.set(key,onClose);card.classList.add('docked-card');attach(key,card);buttons.get(key).textContent=label;return true;},addPermanent:(key,label,card)=>{if(cards.has(key))return false;permanent.add(key);card.classList.add('docked-card');attach(key,card);buttons.get(key).textContent=label;return true;}};
 globalThis.refreshDockedCards=refresh;
 const original=selectPoint;
 selectPoint=function(key){original(key);refresh();status.textContent='';if(selected===null){if(dialog.open)dialog.close();return;}if(folio.classList.contains('workbench-wide')&&!globalThis.ChartNoteLayers?.current()){dockSelected(false,true);if(dialog.open)dialog.close();return;}if(!dialog.open)dialog.show();};
 toolbar.querySelector('.close-detail').addEventListener('click',()=>selectPoint(null));
 function dockSelected(clear=true,replaceOld=false){
  if(selected===null||globalThis.ChartNoteLayers?.current())return;
  if(cards.has(selected)){activate(selected);if(clear)selectPoint(null);return;}
  if(cards.size-permanent.size>=5){if(replaceOld){const oldest=[...cards.keys()].find(key=>!permanent.has(key)&&!external.has(key));if(oldest)remove(oldest);else{status.textContent='最多保留5张卡片，请先关闭一张。';return;}}else{status.textContent='最多保留5张卡片，请先关闭一张。';return;}}
  const key=selected,card=document.createElement('aside');card.className='side docked-card';card.dataset.cardKey=key;
  card.innerHTML='<div class="detail-toolbar"><button type="button" class="close-docked" aria-label="关闭此卡片">'+closeIcon+'</button></div><div class="detail-content"></div>';
  card.querySelector('.close-docked').addEventListener('click',()=>remove(key));
  attach(key,card);refresh();if(clear)selectPoint(null);
 }
 toolbar.querySelector('.dock-detail').addEventListener('click',()=>dockSelected());
 dialog.addEventListener('cancel',event=>{event.preventDefault();selectPoint(null);});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&dialog.open){event.preventDefault();selectPoint(null);}});
 selectPoint(null);
})();
