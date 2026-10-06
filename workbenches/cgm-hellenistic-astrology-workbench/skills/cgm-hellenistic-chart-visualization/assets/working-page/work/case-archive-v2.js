(() => {
 const storage='chart-case-archive-v1:'+location.pathname;
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const uid=()=>globalThis.crypto?.randomUUID?.()||'record-'+Date.now()+'-'+Math.random().toString(36).slice(2);
 const blank=()=>({version:2,records:[]});
 let state=blank(),raw=null;
 try{raw=localStorage.getItem(storage);const saved=JSON.parse(raw);if(saved?.version===2&&Array.isArray(saved.records))state={version:2,records:saved.records.filter(record=>record&&typeof record.id==='string').map(record=>({id:record.id,title:String(record.title||''),date:String(record.date||''),analysis:String(record.analysis||''),feedback:String(record.feedback||''),createdAt:String(record.createdAt||'')}))};else if(Array.isArray(saved?.tabs)){
  const legacyText=tab=>typeof tab.text==='string'&&tab.text.trim()?tab.text:Array.isArray(tab.entries)?tab.entries.map(entry=>(entry.date&&!String(entry.text||'').includes(entry.date)?entry.date+'　':'')+String(entry.text||'')).join('\n\n'):'';
  state.records=saved.tabs.map(tab=>({tab,text:legacyText(tab)})).filter(({text})=>text.trim()).map(({tab,text})=>({id:uid(),title:String(tab.name||'旧档案记录'),date:'',analysis:tab.id==='overall'?text:'',feedback:tab.id==='overall'?'':text,createdAt:new Date().toISOString()}));
  try{if(!localStorage.getItem(storage+'-backup-v1'))localStorage.setItem(storage+'-backup-v1',raw);localStorage.setItem(storage,JSON.stringify(state));}catch{}
 }}catch{}
 const config=globalThis.ChartLibrary,caseRemarks=globalThis.CGMCaseRemarks?.create({view:config?.id,token:config?.token,header:'X-Case-Token',portable:!!globalThis.CGMPortable},config?.caseRemarks);
 globalThis.ChartCaseRemarks=caseRemarks;
 let view='remarks',editing=null,listScroll=0;
 const cards=new Map();
 const selections={records:new Set(),analysis:new Set(),feedback:new Set()},selected=()=>selections[view]||new Set(),folio=document.querySelector('.folio');
 const icon=document.createElement('button');icon.type='button';icon.className='icon-control archive-launch';icon.title='案例档案';icon.setAttribute('aria-label','案例档案');icon.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h6l2 3h8v12H4ZM8 12h8M8 16h6"/></svg>';document.querySelector('.chart-actions').prepend(icon);
 const dialog=document.createElement('dialog');dialog.className='archive-dialog';dialog.setAttribute('aria-label','案例档案');folio.append(dialog);
 const save=()=>{try{localStorage.setItem(storage,JSON.stringify(state));return true;}catch{return false;}};
 const ordered=()=>[...state.records].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const record=id=>state.records.find(item=>item.id===id);
 const summary=(kind)=>ordered().filter(item=>String(item[kind]||'').trim());
 const title=item=>item.title.trim()||'未命名记录';
 const dateText=item=>item.date||'未注明日期';
 const excerpt=value=>{const text=String(value||'').replace(/\s+/g,' ').trim();return esc(text.length>95?text.slice(0,95)+'…':text);};
 function list(){
  if(!state.records.length)return '<p class="archive-empty">还没有记录。可以先写下分析、反馈，或两者一起记录。</p>';
  return '<div class="archive-record-list">'+ordered().map(item=>'<article class="archive-item"><div class="archive-item-head"><label><input type="checkbox" data-select="'+esc(item.id)+'" '+(selected().has(item.id)?'checked':'')+' aria-label="选择'+esc(title(item))+'"><strong>'+esc(title(item))+'</strong></label><span class="archive-item-date">'+esc(dateText(item))+'</span><button type="button" data-edit="'+esc(item.id)+'">编辑</button></div><p class="archive-item-preview">'+(item.analysis?'<span>分析</span> '+excerpt(item.analysis):'')+(item.analysis&&item.feedback?'　·　':'')+(item.feedback?'<span>反馈</span> '+excerpt(item.feedback):'')+'</p></article>').join('')+'</div>';
 }
 function summaryList(kind){const items=summary(kind),label=kind==='analysis'?'分析':'反馈';return '<div class="archive-summary-list">'+(items.length?items.map(item=>'<article class="archive-item"><div class="archive-item-head"><label><input type="checkbox" data-select="'+esc(item.id)+'" '+(selected().has(item.id)?'checked':'')+' aria-label="选择'+esc(title(item))+'"><strong>'+esc(title(item))+'</strong></label><span class="archive-item-date">'+esc(dateText(item))+'</span><button type="button" data-edit="'+esc(item.id)+'">查看原记录</button></div><p class="archive-item-preview">'+excerpt(item[kind])+'</p></article>').join(''):'<p class="archive-empty">还没有'+label+'记录。</p>')+'</div>';
 }
 function archiveField(kind,label,value){return '<details class="archive-record-field" '+(value.trim()?'open':'')+'><summary>'+label+'<span class="archive-record-toggle" aria-hidden="true"></span></summary><textarea name="'+kind+'" aria-label="当时的'+label+'" rows="3" placeholder="可留空">'+esc(value)+'</textarea></details>';}
 function fitArchiveFields(){dialog.querySelectorAll('.archive-record-editor textarea').forEach(el=>{if(!el.getClientRects().length)return;el.style.height='auto';el.style.height=(el.scrollHeight+2)+'px';});}
 function prepareArchiveFields(){requestAnimationFrame(()=>{dialog.querySelectorAll('.archive-record-field').forEach(el=>{el.open=!!el.querySelector('textarea').value.trim();});fitArchiveFields();});}
 function editor(){const item=editing==='new'?{title:'',date:'',analysis:'',feedback:''}:record(editing);if(!item)return '';
  return '<form class="archive-record-editor"><h3>'+(editing==='new'?'新增记录':'修改记录')+'</h3><label>标题<input name="title" maxlength="80" value="'+esc(item.title)+'" required placeholder="例如：第一次咨询、事件后续"><small class="archive-field-hint">可让 Agent 根据这次记录拟一个简短标题。</small></label><label>记录日期（可不填）<input name="date" type="date" value="'+esc(item.date)+'"><small class="archive-field-hint">可告诉 Agent 事件发生的时间，请它协助填写；不确定可留空。</small></label>'+archiveField('analysis','分析',item.analysis)+archiveField('feedback','反馈',item.feedback)+'<p class="archive-editor-hint">分析与反馈至少填写一项；两者都可以继续修改。</p><div class="archive-editor-actions">'+(editing==='new'?'':'<button type="button" data-action="delete" class="archive-delete">删除记录</button>')+'<button type="submit">保存记录</button></div></form>';
 }
 function draw(){
  for(const id of selected()){const item=record(id);if(!item||view!=='records'&&!item[view].trim())selected().delete(id);}const tabs=[['remarks','案例备注'],['records','记录汇总'],['analysis','汇总分析'],['feedback','汇总反馈']];
  dialog.classList.toggle('archive-browsing',!editing);dialog.innerHTML='<div class="archive-head"><h2>案例档案</h2><div class="archive-head-actions">'+(editing?'<button type="button" class="archive-back" data-action="cancel-edit">返回列表</button>':'')+'<button type="button" data-action="close" aria-label="关闭档案">×</button></div></div>'+(editing?editor():'<nav class="archive-tabs" aria-label="档案查看方式">'+tabs.map(([key,label])=>'<button type="button" data-view="'+key+'" aria-current="'+(view===key?'page':'false')+'">'+label+'</button>').join('')+'</nav><div class="archive-view">'+(view==='remarks'?'<section class="case-remarks-editor"></section>':view==='records'?list():summaryList(view))+'</div><div class="archive-list-actions" '+(view==='remarks'?'hidden':'')+'><button type="button" data-action="new">＋ 新增记录</button><button type="button" data-action="compose" '+(!selected().size?'disabled':'')+'>放到下方</button></div>')+'<p class="archive-status" role="status"></p>';
  if(!editing&&view==='remarks')caseRemarks?.mount(dialog.querySelector('.case-remarks-editor'));
  if(editing){dialog.scrollTop=0;prepareArchiveFields();}else{dialog.querySelector('.archive-view').scrollTop=listScroll;requestAnimationFrame(()=>{if(!editing)dialog.querySelector('.archive-view').scrollTop=listScroll;});}
 }
 const part=(label,value,showLabel)=>'<div class="archive-presentation-part">'+(showLabel?'<span>'+label+'</span>':'')+'<p>'+esc(value)+'</p></div>';
 function recordContent(item,heading){const both=!!(item.analysis.trim()&&item.feedback.trim());return (heading?'<h3>'+esc(title(item))+'</h3>':'')+(item.date?'<p class="archive-presentation-date">'+esc(item.date)+'</p>':'')+(item.analysis.trim()?part('分析',item.analysis,both):'')+(item.feedback.trim()?part('反馈',item.feedback,both):'');}
 function cardLabel(spec){if(spec.kind==='selection'){const items=spec.ids.map(record).filter(Boolean);return items.length===1?title(items[0]):'档案摘录 · '+items.length+'条';}return spec.ids?(spec.kind==='analysis'?'分析摘录':'反馈摘录')+' · '+summary(spec.kind).filter(item=>spec.ids.includes(item.id)).length+'条':spec.kind==='analysis'?'分析汇总':'反馈汇总';}
 function cardBody(spec){
  if(spec.kind==='selection'){const items=spec.ids.map(record).filter(Boolean);if(!items.length)return '';return items.length===1?'<h2 class="archive-presentation-title">'+esc(title(items[0]))+'</h2>'+recordContent(items[0],false):items.map(item=>'<section class="archive-presentation-entry">'+recordContent(item,true)+'</section>').join('');}
  const kind=spec.kind==='analysis'?'analysis':'feedback',items=summary(kind).filter(item=>!spec.ids||spec.ids.includes(item.id));if(!items.length)return '';return '<h2 class="archive-presentation-title">'+esc(cardLabel(spec))+'</h2>'+items.map(item=>'<section class="archive-presentation-entry"><h3>'+esc(title(item))+'</h3>'+(item.date?'<p class="archive-presentation-date">'+esc(item.date)+'</p>':'')+part('',item[kind],false)+'</section>').join('');
 }
 function refreshCards(){for(const [key,{element,spec}] of cards){const body=cardBody(spec);if(!body){globalThis.ChartDock?.remove(key);continue;}element.innerHTML='<div class="detail-toolbar"><button type="button" class="archive-card-close" aria-label="关闭此卡片">×</button></div><div class="archive-presentation-content">'+body+'</div>';element.querySelector('.archive-card-close').onclick=()=>globalThis.ChartDock?.remove(key);document.getElementById('dock-tab-'+key)?.replaceChildren(document.createTextNode(cardLabel(spec)));}}
 function addCard(spec){const key=spec.ids?'case-selection-'+uid():'case-summary-'+spec.kind;if(cards.has(key)){globalThis.ChartDock?.activate(key);return true;}const element=document.createElement('section');element.className='archive-card archive-presentation';element.dataset.cardKey=key;cards.set(key,{element,spec});refreshCards();if(!globalThis.ChartDock?.add(key,cardLabel(spec),element,()=>cards.delete(key))){cards.delete(key);return false;}return true;}
 icon.addEventListener('click',()=>{if(!(globalThis.ChartLibrary&&editing&&dialog.querySelector('.archive-record-editor'))){view='remarks';draw();}if(!dialog.open)dialog.show();});
 dialog.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.view){caseRemarks?.flush();view=button.dataset.view;listScroll=0;draw();return;}
  if(button.dataset.edit){listScroll=dialog.querySelector('.archive-view').scrollTop;editing=button.dataset.edit;draw();return;}
  switch(button.dataset.action){
   case 'close':if(!leaveEditor())break;dialog.close();break;
   case 'new':listScroll=dialog.querySelector('.archive-view').scrollTop;editing='new';draw();break;
   case 'cancel-edit':if(leaveEditor())draw();break;
   case 'delete':{const item=record(editing);if(!item||!confirm('删除“'+title(item)+'”？此操作会同时从下方展示卡片移除该记录。'))return;state.records=state.records.filter(entry=>entry.id!==item.id);Object.values(selections).forEach(set=>set.delete(item.id));save();if(globalThis.ChartLibrary)globalThis.ChartEditorAutosave?.finish('caseRecord');editing=null;draw();refreshCards();break;}
   case 'compose':{const spec={kind:view==='records'?'selection':view,ids:ordered().filter(item=>selected().has(item.id)&&(view==='records'||item[view].trim())).map(item=>item.id)};if(cardBody(spec)&&addCard(spec)){selected().clear();dialog.close();}else dialog.querySelector('.archive-status').textContent='下方最多保留5张卡片，或当前汇总没有内容。';break;}
  }
 });
 dialog.addEventListener('input',e=>{if(e.target.matches('textarea'))fitArchiveFields();});dialog.addEventListener('toggle',fitArchiveFields,true);let archiveWidth=0;new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(width!==archiveWidth){archiveWidth=width;fitArchiveFields();}}).observe(dialog);
 function leaveEditor(){if(!editing)return true;if(globalThis.ChartLibrary){if(ChartEditorHooks.caseRecord.save()===false&&!confirm('这条记录尚未填写完整。放弃未完成的修改并返回列表？已保存的记录会保留。'))return false;globalThis.ChartEditorAutosave?.finish('caseRecord');}editing=null;return true;}
 dialog.addEventListener('cancel',event=>{if(!leaveEditor())event.preventDefault();});
 dialog.addEventListener('keydown',event=>{if(event.key!=='Escape')return;event.preventDefault();event.stopPropagation();if(leaveEditor())dialog.close();});
 document.addEventListener('keydown',event=>{if(event.key!=='Escape'||!dialog.open||document.querySelector('dialog:modal'))return;event.preventDefault();event.stopPropagation();if(leaveEditor())dialog.close();});
 dialog.addEventListener('change',event=>{if(event.target.matches('[data-select]')){event.target.checked?selected().add(event.target.dataset.select):selected().delete(event.target.dataset.select);dialog.querySelector('[data-action="compose"]').disabled=!selected().size;}});
 dialog.addEventListener('submit',event=>{if(!event.target.matches('.archive-record-editor'))return;event.preventDefault();const form=event.target,titleValue=form.elements.title.value.trim(),analysis=form.elements.analysis.value.trim(),feedback=form.elements.feedback.value.trim();if(!titleValue||!analysis&&!feedback){dialog.querySelector('.archive-status').textContent='请填写标题，并在分析或反馈中至少填写一项。';return;}
  if(editing==='new'){const item={id:uid(),title:titleValue,date:form.elements.date.value,analysis,feedback,createdAt:new Date().toISOString()};state.records.unshift(item);}else{const item=record(editing);if(!item)return;Object.assign(item,{title:titleValue,date:form.elements.date.value,analysis,feedback});}
  const saved=save();if(globalThis.ChartLibrary)globalThis.ChartEditorAutosave?.finish('caseRecord');editing=null;draw();refreshCards();if(!saved)dialog.querySelector('.archive-status').textContent='当前浏览器无法保存档案。';
 });
if(globalThis.ChartLibrary){globalThis.ChartEditorHooks||={};ChartEditorHooks.caseRecord={root:dialog,active:()=>!!dialog.querySelector('.archive-record-editor'),onClose:()=>{if(!editing)return true;const okay=ChartEditorHooks.caseRecord.save();if(okay)editing=null;return okay;},context:()=>({editing,view}),restore:d=>{editing=d.editing==='new'||record(d.editing)?d.editing:null;view=d.view;if(!editing)globalThis.ChartEditorAutosave?.finish('caseRecord');draw();dialog.show();},save:()=>{const form=dialog.querySelector('.archive-record-editor');if(!form)return;const fields=Object.fromEntries(['title','date','analysis','feedback'].map(k=>[k,form.elements[k].value]));if(editing==='new'&&Object.values(fields).every(value=>!value.trim()))return true;if(!fields.title.trim()||!fields.analysis.trim()&&!fields.feedback.trim())return false;if(editing==='new'){const item={id:uid(),createdAt:new Date().toISOString(),...fields};state.records.unshift(item);editing=item.id;}else{const item=record(editing);if(!item)return false;Object.assign(item,fields);}save();refreshCards();return true;}};}
 draw();
})();
