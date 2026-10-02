(() => {
 const esc=ChartView.escape,folio=document.querySelector('.folio'),details=document.querySelector('.switch-settings'),trigger=details.querySelector('summary'),form=document.getElementById('cycle-form');
 const storageKey='chart-custom-lots-v1:'+location.pathname;
 const deletedKey='chart-deleted-built-in-lots:'+location.pathname;
 const categoryKey='chart-lot-categories-v1:'+location.pathname;
 const displayKey='chart-lot-display-category-v1:'+location.pathname;
 const MAX_CATEGORIES=6,MAX_CATEGORY_ITEMS=30,MAX_CATEGORY_NAME_WIDTH=10;
 const categoryNameWidth=name=>Array.from(name).reduce((width,ch)=>width+(ch.codePointAt(0)>127?2:1),0);
 const fitCategoryName=name=>{let result='',width=0;for(const ch of Array.from(name)){const next=width+(ch.codePointAt(0)>127?2:1);if(next>MAX_CATEGORY_NAME_WIDTH)break;result+=ch;width=next;}return result;};
 let deletedBuiltins=[];
 try{deletedBuiltins=JSON.parse(localStorage.getItem(deletedKey)||'[]');if(!Array.isArray(deletedBuiltins))deletedBuiltins=[];}catch{deletedBuiltins=[];}
 let categories=CustomLots.categories(),activeCategory='common';
 try{const saved=JSON.parse(localStorage.getItem(categoryKey));if(Array.isArray(saved)&&saved.length<=8&&saved.some(c=>c.key==='common'))categories=saved.filter(c=>c&&typeof c.key==='string'&&typeof c.name==='string');}catch{}
 categories.forEach(c=>{if(c.key==='variants'&&c.name==='异本公式')c.name='差异版本';c.name=fitCategoryName(c.name);});
 const prioritizeLots=items=>[...items].sort((a,b)=>({fortune:0,spirit:1}[a.key]??2)-({fortune:0,spirit:1}[b.key]??2));
 const standardizePresetText=(item,presets)=>{const preset=presets.find(p=>p.key===item.key);if(!preset)return;if(item.key.startsWith('reference_')){if(!item.note)item.note='待查验';if(['兵役点·表','爱欲点·表'].includes(item.name))item.name=preset.name;return;}const suffixes=['·赫尔墨斯七签点','·赫尔墨斯式','·昼夜换向','·土星为起点','·异于赫尔墨斯式','·土星近太阳时另有替式'];if(!item.note||suffixes.some(s=>item.note===preset.note+s)||/《(?:入门论|数学论|五卷诗)》|卷二第(?:24|25|37)节/.test(item.note||''))item.note=preset.note;};
 let definitions=CustomLots.defaults();
 try{const saved=JSON.parse(localStorage.getItem(storageKey));if(Array.isArray(saved)){const shown={};const presets=CustomLots.defaults();saved.forEach(d=>{standardizePresetText(d,presets);d.name=Array.from(d.name).slice(0,5).join('');if(d.visible){const cat=d.category||CustomLots.categoryFor(d.key);shown[cat]=(shown[cat]||0)+1;d.visible=shown[cat]<=10;}});const existing=new Set(saved.map(d=>d.key));const added=presets.filter(d=>!existing.has(d.key)&&!deletedBuiltins.includes(d.key));const merged=prioritizeLots([...saved,...added]);merged.forEach(d=>{if(!d.category)d.category=CustomLots.categoryFor(d.key);if(!categories.some(c=>c.key===d.category))d.category='common';});if(categories.length>MAX_CATEGORIES){const retained=categories.slice(0,MAX_CATEGORIES),removed=new Set(categories.slice(MAX_CATEGORIES).map(c=>c.key));const counts=new Map(retained.map(c=>[c.key,merged.filter(d=>d.category===c.key).length]));merged.filter(d=>removed.has(d.category)).forEach(d=>{const target=retained.find(c=>counts.get(c.key)<MAX_CATEGORY_ITEMS);if(!target)throw Error('分类合并后容量不足');d.category=target.key;counts.set(target.key,counts.get(target.key)+1);});categories=retained;}CustomLots.calculate(merged,globalThis.ChartNatalPayload||payload);definitions=merged;}}catch{}
 if(categories.length>MAX_CATEGORIES)categories=categories.slice(0,MAX_CATEGORIES);
 categories.forEach(c=>{c.color=CustomLots.categoryColor(c.key,c.color);if(typeof c.initialized!=='boolean')c.initialized=c.key==='common'||definitions.some(d=>d.category===c.key&&d.visible);});
 let layerColor=null,displayCategory='common';try{const saved=JSON.parse(localStorage.getItem(displayKey));if(categories.some(c=>c.key===saved))displayCategory=saved;}catch{}
 const closeIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
 const icon=path=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';
 const eye=visible=>icon(visible?'M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0':'M3 3l18 18M3 9l-1 3s4 6 10 6c2 0 4-1 5-2M8 6c1 0 3-1 4-1 6 0 10 7 10 7l-3 3');
 const chartSettingsTitle=globalThis.ChartReturnMode?'设置·返照盘':globalThis.ChartPageMode==='transit'?'设置·行运盘':'设置·本命盘';
 trigger.setAttribute('aria-label',chartSettingsTitle);trigger.title=chartSettingsTitle;
 const settings=document.createElement('dialog');settings.className='settings-dialog';settings.setAttribute('aria-label',chartSettingsTitle);
 settings.innerHTML='<header class="settings-title"><h2>设置</h2><button type="button" class="close-settings" aria-label="关闭设置">'+closeIcon+'</button></header><nav class="settings-tabs" role="tablist" aria-label="设置分类"><button type="button" id="chart-settings-tab" role="tab" aria-controls="cycle-form">排盘设置</button><button type="button" id="aspect-settings-tab" role="tab" aria-controls="aspect-settings-page">相位管理</button><button type="button" id="lot-settings-tab" role="tab" aria-controls="lot-settings-page">签点管理</button><button type="button" id="extra-settings-tab" role="tab" aria-controls="extra-settings-page">虚点与小行星</button></nav><section id="aspect-settings-page" role="tabpanel" aria-labelledby="aspect-settings-tab" hidden></section><section id="extra-settings-page" role="tabpanel" aria-labelledby="extra-settings-tab" hidden></section>';
 settings.querySelector('.settings-title h2').textContent=chartSettingsTitle;
 settings.append(form);folio.append(settings);
 const section=document.createElement('section');section.className='lots-settings';section.innerHTML='<header><h3>签点</h3><button type="button" class="add-lot">＋ 新建</button></header><div class="lot-category-nav" role="tablist" aria-label="签点分类"></div><div class="lot-category-tools"><span class="lot-category-count"></span><button type="button" class="add-category">＋ 新建分类</button><button type="button" class="edit-category-color">类别颜色</button><button type="button" class="rename-category">重命名</button><button type="button" class="delete-category">删除分类</button></div><div class="lot-list"></div><p class="lots-error" role="status"></p>';
 settings.append(section);
 section.id='lot-settings-page';section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby','lot-settings-tab');
 form.setAttribute('role','tabpanel');form.setAttribute('aria-labelledby','chart-settings-tab');
 const chartTab=settings.querySelector('#chart-settings-tab'),aspectTab=settings.querySelector('#aspect-settings-tab'),lotTab=settings.querySelector('#lot-settings-tab'),extraTab=settings.querySelector('#extra-settings-tab'),aspectPage=settings.querySelector('#aspect-settings-page'),extraPage=settings.querySelector('#extra-settings-page');
 const tabs=[chartTab,aspectTab,lotTab,extraTab],panels=[form,aspectPage,section,extraPage];
 function showPage(page){const index=page===true?2:page===false?0:page;panels.forEach((panel,i)=>panel.hidden=i!==index);tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;});}
 tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>showPage(index));tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowLeft'?tabs.length-1:1))%tabs.length;showPage(next);tabs[next].focus();}});});
 showPage(false);
 const list=section.querySelector('.lot-list'),error=section.querySelector('.lots-error'),categoryNav=section.querySelector('.lot-category-nav');
 const editor=document.createElement('dialog');editor.className='lot-editor';editor.setAttribute('aria-label','编辑签点');folio.append(editor);
 function persist(){try{localStorage.setItem(storageKey,JSON.stringify(definitions));localStorage.setItem(deletedKey,JSON.stringify(deletedBuiltins));localStorage.setItem(categoryKey,JSON.stringify(categories));localStorage.setItem(displayKey,JSON.stringify(displayCategory));error.textContent='';}catch{error.textContent='当前浏览器无法保存，设置仅在本次页面有效。';}}
 function redrawList(){
  categoryNav.innerHTML=categories.map(c=>`<button type="button" role="tab" data-category="${esc(c.key)}" aria-selected="${c.key===activeCategory}" tabindex="${c.key===activeCategory?0:-1}">${esc(c.name)}</button>`).join('');
  const entries=definitions.filter(d=>d.category===activeCategory);
  section.querySelector('.lot-category-count').textContent=`${entries.length} / ${MAX_CATEGORY_ITEMS}`;
  section.querySelector('.add-category').disabled=categories.length>=MAX_CATEGORIES;
  section.querySelector('.rename-category').hidden=activeCategory==='common';
  section.querySelector('.delete-category').hidden=activeCategory==='common';
  list.innerHTML=entries.map((d,i)=>`<div class="lot-setting-row" data-key="${esc(d.key)}"><button type="button" class="lot-visibility" data-action="visible" aria-pressed="${d.visible}" aria-label="${d.visible?'隐藏':'显示'}${esc(d.name)}" title="${d.visible?'隐藏':'显示'}">${eye(d.visible)}</button><span class="lot-setting-name">${esc(d.name)}</span><span class="lot-setting-note" title="${esc(d.note||'无备注')}">${esc(d.note||'无备注')}</span><div class="lot-row-actions"><button type="button" data-action="up" aria-label="上移${esc(d.name)}" ${i===0||['fortune','spirit'].includes(d.key)||['fortune','spirit'].includes(entries[i-1]?.key)?'disabled':''}>${icon('M6 14l6-6 6 6')}</button><button type="button" data-action="down" aria-label="下移${esc(d.name)}" ${i===entries.length-1||['fortune','spirit'].includes(d.key)?'disabled':''}>${icon('M6 10l6 6 6-6')}</button><button type="button" data-action="edit" aria-label="编辑${esc(d.name)}">✎</button><button type="button" data-action="delete" aria-label="删除${esc(d.name)}">×</button></div></div>`).join('');
 }
 categoryNav.addEventListener('click',event=>{const tab=event.target.closest('[data-category]');if(!tab)return;activeCategory=tab.dataset.category;redrawList();});
 categoryNav.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=categories.findIndex(c=>c.key===activeCategory),next=event.key==='Home'?0:event.key==='End'?categories.length-1:(index+(event.key==='ArrowLeft'?categories.length-1:1))%categories.length;activeCategory=categories[next].key;redrawList();categoryNav.querySelector(`[data-category="${activeCategory}"]`)?.focus();});
 const categoryDialog=document.createElement('dialog');categoryDialog.className='lot-editor lot-category-dialog';categoryDialog.setAttribute('aria-label','编辑签点分类');folio.append(categoryDialog);
 function openCategoryNameDialog(rename,colorOnly=false){
  if(!rename&&categories.length>=MAX_CATEGORIES){error.textContent=`最多只能建立${MAX_CATEGORIES}页签点分类。`;return;}
  const current=categories.find(c=>c.key===activeCategory);let color=rename?current.color:(CustomLots.palette.find(p=>!categories.some(c=>c.color===p.color))||CustomLots.palette[0]).color;
  categoryDialog.innerHTML=`<header class="settings-title"><h2>${colorOnly?'类别颜色':rename?'编辑分类':'新建分类'}</h2><button type="button" class="close-category" aria-label="关闭">${closeIcon}</button></header><form class="lot-category-form"><label class="lot-field">分类名称<input name="name" required maxlength="10" ${colorOnly?'readonly':''} value="${esc(rename?current.name:'')}" placeholder="最多5个汉字或10个英文字符"></label><div class="lot-color-options" role="group" aria-label="类别颜色">${CustomLots.palette.map(p=>`<button type="button" class="lot-color-choice" data-color="${p.color}" aria-pressed="${p.color===color}" aria-label="${p.name}" style="--choice-color:${p.color};--lot-color:${p.color}"><span class="lot-color-swatch" style="background:${p.color}"></span><span class="lot-color-number" style="color:${p.color}">123</span><span class="lot-color-name">${p.name}</span></button>`).join('')}</div><p class="editor-error" role="status"></p><button type="submit" class="lot-done">完成</button></form>`;
  const form=categoryDialog.querySelector('form');categoryDialog.querySelector('.close-category').addEventListener('click',()=>categoryDialog.close());
  form.querySelector('.lot-color-options').addEventListener('click',event=>{const button=event.target.closest('[data-color]');if(!button)return;color=button.dataset.color;form.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===color)));});
  form.addEventListener('submit',event=>{event.preventDefault();const name=form.elements.name.value.trim();if(!name||categoryNameWidth(name)>MAX_CATEGORY_NAME_WIDTH){form.querySelector('.editor-error').textContent='分类名称最多5个汉字或10个英文字符。';return;}if(categories.some(c=>c.name===name&&(!rename||c.key!==activeCategory))){form.querySelector('.editor-error').textContent='已经有同名分类。';return;}if(rename){current.name=name;current.color=color;layerColor=null;}else{const key='category_'+Date.now().toString(36);categories.push({key,name,color,initialized:true});activeCategory=key;}persist();redrawList();render();categoryDialog.close();});
  categoryDialog.showModal();form.elements.name.focus();
 }
 section.querySelector('.add-category').addEventListener('click',()=>openCategoryNameDialog(false));
 section.querySelector('.edit-category-color').addEventListener('click',()=>openCategoryNameDialog(true,true));
 section.querySelector('.rename-category').addEventListener('click',()=>openCategoryNameDialog(true));
 section.querySelector('.delete-category').addEventListener('click',()=>{
  if(activeCategory==='common')return;
  const current=categories.find(c=>c.key===activeCategory),entries=definitions.filter(d=>d.category===activeCategory);
  const targets=categories.filter(c=>c.key!==activeCategory&&definitions.filter(d=>d.category===c.key).length+entries.length<=MAX_CATEGORY_ITEMS);
  if(entries.length&&!targets.length){error.textContent='此页的签点无法一次放入其他分类。请先编辑签点，分批移动后再删除此页。';return;}
  categoryDialog.innerHTML=`<header class="settings-title"><h2>删除分类</h2><button type="button" class="close-category" aria-label="关闭">${closeIcon}</button></header><form class="lot-category-form"><p>删除“${esc(current.name)}”${entries.length?'；其中 '+entries.length+' 个签点会移入所选分类。':'。'}</p>${entries.length?`<label class="lot-field">移入分类<select name="target">${options(targets.map(c=>[c.key,c.name]),targets[0].key)}</select></label>`:''}<button type="submit" class="lot-done">确认删除</button></form>`;
  const form=categoryDialog.querySelector('form');categoryDialog.querySelector('.close-category').addEventListener('click',()=>categoryDialog.close());
  form.addEventListener('submit',event=>{event.preventDefault();if(entries.length)entries.forEach(d=>d.category=form.elements.target.value);categories=categories.filter(c=>c.key!==current.key);if(displayCategory===current.key)displayCategory=entries.length?form.elements.target.value:'common';const counts={};definitions.forEach(d=>{if(d.visible){counts[d.category]=(counts[d.category]||0)+1;if(counts[d.category]>10)d.visible=false;}});activeCategory=entries.length?form.elements.target.value:'common';persist();redrawList();render();categoryDialog.close();});
  categoryDialog.showModal();
 });
 globalThis.ChartLotState={get:()=>JSON.parse(JSON.stringify(definitions)),category:()=>displayCategory,color:()=>layerColor||categories.find(c=>c.key===displayCategory)?.color||CustomLots.palette[0].color,set:(d,category,color)=>{layerColor=CustomLots.palette.some(p=>p.color===color)?color:null;displayCategory=categories.some(c=>c.key===category)?category:(category===undefined?d.find(item=>item.visible)?.category||'common':'common');definitions=prioritizeLots(JSON.parse(JSON.stringify(d)));const presets=CustomLots.defaults();definitions.forEach(item=>{standardizePresetText(item,presets);if(!categories.some(c=>c.key===item.category)){const suggested=CustomLots.categoryFor(item.key);item.category=categories.some(c=>c.key===suggested)?suggested:'common';}});const counts={};definitions.forEach(d=>{if(d.visible){counts[d.category]=(counts[d.category]||0)+1;d.visible=counts[d.category]<=10;}});redrawList();}};
 const legend=document.getElementById('legend'),legendLine=document.createElement('div'),categorySwitch=document.createElement('button');legendLine.className='lot-legend-line';legend.replaceWith(legendLine);legendLine.append(legend);categorySwitch.type='button';categorySwitch.className='lot-category-switch';categorySwitch.innerHTML='<span class="lot-category-label"></span>';legendLine.append(categorySwitch);
 const picker=document.createElement('dialog');picker.className='lot-editor lot-category-picker';picker.setAttribute('aria-label','签点类别');folio.append(picker);
 function syncCategory(){const current=categories.find(c=>c.key===displayCategory)||categories[0];displayCategory=current.key;folio.style.setProperty('--lot-color',layerColor||current.color);categorySwitch.querySelector('.lot-category-label').textContent='签点类别：'+current.name;categorySwitch.hidden=!document.getElementById('lots').checked;categorySwitch.disabled=!!globalThis.ChartNoteLayers?.current?.();document.dispatchEvent(new CustomEvent('chart-lot-category-change'));}
 categorySwitch.addEventListener('click',()=>{if(categorySwitch.disabled)return;picker.innerHTML=`<header class="settings-title"><h2>签点类别</h2><button type="button" class="close-category" aria-label="关闭">${closeIcon}</button></header><div class="lot-category-options">${categories.map(c=>`<button type="button" class="lot-category-choice" data-category="${esc(c.key)}" aria-pressed="${c.key===displayCategory}"><span class="lot-category-color" style="background:${c.color}"></span><span>${esc(c.name)}</span></button>`).join('')}</div>`;picker.querySelector('.close-category').addEventListener('click',()=>picker.close());picker.querySelector('.lot-category-options').addEventListener('click',event=>{const b=event.target.closest('[data-category]');if(!b)return;layerColor=null;displayCategory=b.dataset.category;const current=categories.find(c=>c.key===displayCategory);if(!current.initialized){let n=0;definitions.filter(d=>d.category===displayCategory).forEach(d=>d.visible=++n<=10);current.initialized=true;}persist();render();picker.close();});picker.showModal();});
 document.getElementById('lots').addEventListener('change',syncCategory);document.addEventListener('chart-layer-change',syncCategory);
 const originalRender=render;
 render=function(){
  const lots=CustomLots.calculate(definitions,globalThis.ChartNatalPayload||payload);
  model.lots=lots.map((p,i)=>({...p,visible:definitions[i].visible&&definitions[i].category===displayCategory,displayOrder:i}));
  if(globalThis.ChartPageMode==='transit'&&globalThis.ChartNatalModel)globalThis.ChartNatalModel.lots=model.lots;
  model.legend=model.lots.filter(p=>p.visible).map((p,i)=>`${i+1} ${p.label}`).join('　·　');
  document.getElementById('legend').innerHTML=model.lots.filter(p=>p.visible).map((p,i)=>`<span class="lot-legend-row"><span>${i+1}</span><span>${esc(p.label)}</span></span>`).join('');
  if(model.lots.some(p=>p.key===selected&&!p.visible))selected=null;
  if(selected!==null&&!model.planets.concat(model.angles,model.lots,model.natalPoints||[],model.virtualPoints||[],model.ringPoints||[]).some(p=>p.key===selected))selected=null;
  const count=model.lots.filter(p=>p.visible).length;document.getElementById('legend').setAttribute('data-density',count>7?'dense':count>4?'medium':'normal');
  syncCategory();originalRender();
 };
 let openingHouseChoices=[];
 function closeSettings(){
  const values=[...form.querySelectorAll('.house-choice')].map(e=>e.value);
  if(new Set(values).size!==3){showPage(false);document.getElementById('switch-status').textContent='请选择三种不同的宫位制。';if(confirm('宫位制选择有重复。放弃这次宫位制选择并关闭？')){form.querySelectorAll('.house-choice').forEach((el,i)=>el.value=openingHouseChoices[i]);document.getElementById('switch-status').textContent='';settings.close();}return;}
  form.requestSubmit();persist();settings.close();
 }
 trigger.addEventListener('click',event=>{event.preventDefault();details.open=false;openingHouseChoices=[...form.querySelectorAll('.house-choice')].map(el=>el.value);redrawList();showPage(false);settings.showModal();});
 settings.querySelector('.close-settings').addEventListener('click',closeSettings);
 settings.addEventListener('cancel',event=>{event.preventDefault();closeSettings();});
 settings.addEventListener('click',event=>{if(event.target===settings){const r=settings.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeSettings();}});
 // Keep the page's point-card Escape handler from closing an unrelated card.
 settings.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
 function apply(next){if(categories.some(c=>next.filter(d=>d.category===c.key&&d.visible).length>10))throw Error('每个类别最多同时显示10个签点');if(next.some(d=>Array.from(d.name).length>5))throw Error('签点名称最多5个字');if(next.some(d=>!categories.some(c=>c.key===d.category))||categories.some(c=>next.filter(d=>d.category===c.key).length>MAX_CATEGORY_ITEMS))throw Error(`每个分类最多收录${MAX_CATEGORY_ITEMS}个签点`);CustomLots.calculate(next,globalThis.ChartNatalPayload||payload);definitions=prioritizeLots(next);persist();redrawList();render();}
 list.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b)return;
  const key=b.closest('[data-key]').dataset.key,index=definitions.findIndex(d=>d.key===key),action=b.dataset.action;
  if(action==='edit'){edit(definitions[index]);return;}
  const next=structuredClone(definitions);
  if(action==='delete'){confirmDelete(key);return;}
  if(action==='visible'){next[index].visible=!next[index].visible;categories.find(c=>c.key===activeCategory).initialized=true;}
  const siblings=definitions.filter(d=>d.category===activeCategory),position=siblings.findIndex(d=>d.key===key);
  if(action==='up'&&position>0){const other=next.findIndex(d=>d.key===siblings[position-1].key);[next[other],next[index]]=[next[index],next[other]];}
  if(action==='down'&&position<siblings.length-1){const other=next.findIndex(d=>d.key===siblings[position+1].key);[next[other],next[index]]=[next[index],next[other]];}
  try{apply(next);error.textContent='';}catch(e){error.textContent=e.message;}
 });

 section.querySelector('.add-lot').addEventListener('click',()=>edit({key:'lot_'+Date.now().toString(36),name:'',note:'',category:activeCategory,visible:definitions.filter(d=>d.visible&&d.category===activeCategory).length<10,reverse:false,start:{type:'point',value:'asc'},add:{type:'point',value:'sun'},subtract:{type:'point',value:'moon'}}));
 const confirmation=document.createElement('dialog');confirmation.className='lot-editor lot-delete-confirm';confirmation.setAttribute('aria-label','确认删除签点');folio.append(confirmation);
 function confirmDelete(key){
  const d=definitions.find(d=>d.key===key);
  confirmation.innerHTML='<header class="settings-title"><h2>删除签点</h2></header><p>确定删除“'+esc(d.name)+'”？</p><div class="confirm-actions"><button type="button" class="confirm-delete">删除</button><button type="button" class="cancel-delete">取消</button></div>';
  confirmation.querySelector('.cancel-delete').addEventListener('click',()=>confirmation.close());
  confirmation.querySelector('.confirm-delete').addEventListener('click',()=>{try{apply(definitions.filter(d=>d.key!==key));if(CustomLots.defaults().some(item=>item.key===key)&&!deletedBuiltins.includes(key))deletedBuiltins.push(key);persist();error.textContent='';}catch(e){error.textContent='无法删除：'+e.message+'。请先修改引用此签点的公式。';}confirmation.close();});
  confirmation.onkeydown=event=>{if(event.key==='Escape')event.stopPropagation();};
  confirmation.showModal();
 }
 const types={point:'星体／四轴／签点',cusp:'宫头',house_ruler:'宫主星',degree:'星座度数',point_house_ruler:'星体所在宫的宫主星'};
 const options=(entries,value)=>entries.map(([key,name])=>`<option value="${esc(key)}" ${String(key)===String(value)?'selected':''}>${esc(name)}</option>`).join('');
 function edit(initial){
  const draft=structuredClone(initial);
  const choices=[...Object.entries(CustomLots.names),...definitions.filter(d=>d.key!==draft.key).map(d=>[d.key,d.name])];
  editor.innerHTML=`<header class="settings-title"><h2>${draft.name?'编辑签点':'新建签点'}</h2><button class="close-editor" type="button" aria-label="关闭签点编辑">${closeIcon}</button></header><form class="lot-editor-form"><label class="lot-field">名称<input name="name" required value="${esc(draft.name)}" placeholder="最多5个字"></label><label class="lot-field">分类<select name="category">${options(categories.map(c=>[c.key,c.name]),draft.category||activeCategory)}</select></label><label class="lot-field">备注<input name="note" value="${esc(draft.note)}" placeholder="来源、版本或个人说明 · 最多100字"></label><div class="formula-operands">${[['start','起点'],['add','加项 ＋'],['subtract','减项 −']].map(([key,label])=>`<fieldset data-operand="${key}"><legend>${label}</legend><div class="operand-pair"><select class="operand-type" aria-label="${label}类型">${options(Object.entries(types),draft[key].type)}</select><div class="operand-value"></div></div></fieldset>`).join('')}</div><div class="sect-options" role="group" aria-label="昼夜公式"><button type="button" data-reverse="false" aria-pressed="${!draft.reverse}">不区分</button><button type="button" data-reverse="true" aria-pressed="${draft.reverse}">区分昼夜</button></div><p class="sect-explanation">区分昼夜时，夜盘交换加项与减项。</p><p class="lots-help">宫主星采用传统七星住所主，随当前宫位制计算。</p><p class="editor-error" role="status"></p><button type="submit" class="lot-done">完成</button></form>`;
  const ef=editor.querySelector('form'),err=editor.querySelector('.editor-error');
  function fields(key){const field=editor.querySelector(`[data-operand="${key}"]`),o=draft[key];field.querySelector('.operand-value').innerHTML=o.type==='degree'?`<select class="operand-sign" aria-label="星座">${options(CustomLots.signNames.map((s,i)=>[i,s]),o.sign??0)}</select><input class="operand-degree" type="number" min="0" max="29.999999" step="any" value="${esc(o.degree??0)}" aria-label="度数"> <span>度</span>`:`<select class="operand-choice" aria-label="公式点位">${options(o.type==='cusp'||o.type==='house_ruler'?Array.from({length:12},(_,i)=>[i+1,'第 '+(i+1)+' 宫']):choices,o.value)}</select>`;}
  ['start','add','subtract'].forEach(fields);
  ef.addEventListener('change',event=>{if(event.target.matches('.operand-type')){const key=event.target.closest('fieldset').dataset.operand;draft[key]={type:event.target.value,value:['cusp','house_ruler'].includes(event.target.value)?1:'asc',sign:0,degree:0};fields(key);}});
  ef.querySelectorAll('[data-reverse]').forEach(button=>button.addEventListener('click',()=>{draft.reverse=button.dataset.reverse==='true';ef.querySelectorAll('[data-reverse]').forEach(item=>item.setAttribute('aria-pressed',String((item.dataset.reverse==='true')===draft.reverse)));}));
  const nameInput=ef.elements.name;const trimName=()=>nameInput.value=Array.from(nameInput.value).slice(0,5).join('');nameInput.addEventListener('input',e=>{if(!e.isComposing)trimName();});nameInput.addEventListener('compositionend',trimName);
  const note=ef.elements.note;
  note.addEventListener('input',e=>{if(!e.isComposing)note.value=Array.from(note.value).slice(0,100).join('');});
  note.addEventListener('compositionend',()=>note.value=Array.from(note.value).slice(0,100).join(''));
  const initialFields=()=>JSON.stringify([...ef.querySelectorAll('input,select')].map(el=>[el.value,el.checked]).concat([draft.reverse]));const untouchedFields=initialFields();
  function finish(){
   draft.name=ef.elements.name.value.trim();draft.category=ef.elements.category.value;draft.note=Array.from(note.value.trim()).slice(0,100).join('');
   if(!draft.name){err.textContent='请填写签点名称。';return false;}
   for(const key of ['start','add','subtract']){const f=editor.querySelector(`[data-operand="${key}"]`);if(draft[key].type==='degree'){draft[key].sign=Number(f.querySelector('.operand-sign').value);draft[key].degree=f.querySelector('.operand-degree').value;}else draft[key].value=f.querySelector('.operand-choice').value;}
   const next=structuredClone(definitions),index=next.findIndex(d=>d.key===draft.key);if(index<0)next.push(draft);else next[index]=draft;
   try{apply(next);activeCategory=draft.category;redrawList();editor.close();return true;}catch(e){err.textContent=e.message;return false;}
  }
  ef.addEventListener('submit',event=>{event.preventDefault();finish();});
  // Closing an empty new draft discards it; valid edits are retained automatically.
  function closeEditor(){if(!initial.name&&initialFields()===untouchedFields){editor.close();return;}if(!finish()&&confirm('签点名称或公式尚未完成。放弃未完成的修改并关闭？原有签点会保留。'))editor.close();}
  editor.querySelector('.close-editor').addEventListener('click',closeEditor);
  editor.oncancel=event=>{event.preventDefault();closeEditor();};
  editor.onkeydown=event=>{if(event.key==='Escape')event.stopPropagation();};
  editor.showModal();
 }
 // Notes edited on the point card and in settings use the same value.
 document.addEventListener('point-note-change',event=>{const d=definitions.find(d=>d.key===event.detail.key);if(d){d.note=event.detail.note;const point=model.lots.find(p=>p.key===d.key);if(point)point.note=d.note;redrawList();persist();globalThis.refreshDockedCards?.();}});
 const selectOriginal=selectPoint;
 selectPoint=function(key){selectOriginal(key);const d=definitions.find(d=>d.key===key),label=document.querySelector('#detail .note-text');if(d&&label)label.textContent=d.note||'无备注';};
 globalThis.ChartLotNotes={get:key=>definitions.find(d=>d.key===key)?.note};
 redrawList();render();
})();
