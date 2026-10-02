(() => {
 if(globalThis.ChartWorkbench)return;
 const folio=document.querySelector('.folio'),workspace=document.querySelector('.workspace');if(!folio||!workspace)return;
 let manualLayout=null;
 const bar=document.createElement('div');bar.className='workbench-layout-controls';
 const icon=document.createElement('button');icon.type='button';icon.className='icon-control';icon.setAttribute('aria-label','切换页面布局');bar.append(icon);document.querySelector('.chart-actions').append(bar);
 const screen=document.createElement('section'),panel=document.createElement('section'),bench=document.createElement('div');screen.className='chart-screen';panel.className='chart-work-panel';panel.setAttribute('aria-label','盘式与主要卡片');bench.className='chart-workbench';folio.prepend(bench);bench.append(screen,panel);
 function move(element,target){if(!element||element.parentElement===target)return;target.append(element);}
 for(const e of [folio.querySelector('.masthead'),folio.querySelector('.settings'),workspace])move(e,screen);
 const bottom=workspace.querySelector('.chart-bottom'),tools=bottom?.querySelector('.tools'),modeRow=bottom?.querySelector('.aspect-diagram-mode');
 const topControls=document.createElement('div');topControls.className='chart-top-controls';topControls.hidden=true;workspace.querySelector('.chart-area').prepend(topControls);
 function labelPositions(){for(const button of folio.querySelectorAll('.archive-dialog [data-action="compose"]'))button.textContent=folio.classList.contains('workbench-wide')?'显示在右侧':'放到下方';}
 function arrange(){
  move(document.querySelector('.chart-type-switch'),panel);move(document.querySelector('.docked-tabs'),panel);
  for(const e of workspace.querySelectorAll(':scope > .docked-card'))move(e,panel);
  for(const e of folio.querySelectorAll('.layer-notes,.relation-note-list'))move(e,panel);
  const available=document.documentElement.clientWidth;const wide=manualLayout??(available>=1180);
  folio.classList.toggle('workbench-wide',wide);folio.classList.add('workbench-enabled');
  topControls.hidden=!wide;
  if(wide){move(tools,topControls);if(tools)move(modeRow,tools);}
  else{if(tools&&tools.parentElement!==bottom)bottom.prepend(tools);if(modeRow&&modeRow.parentElement!==bottom)bottom.prepend(modeRow);}
  const category=folio.querySelector('.lot-category-switch'),legendLine=folio.querySelector('.lot-legend-line');
  if(category&&legendLine){move(category,wide?topControls:legendLine);if(wide&&topControls.firstElementChild!==category)topControls.prepend(category);}
  icon.title=wide?'切换为上下布局':'切换为左右布局';icon.setAttribute('aria-pressed',String(wide));
  icon.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1"/><path d="'+(wide?'M4 12h16':'M12 5v14')+'"/></svg>';
  labelPositions();
 }
 icon.onclick=()=>{manualLayout=!folio.classList.contains('workbench-wide');arrange();};
 new MutationObserver(arrange).observe(workspace,{childList:true});
 new MutationObserver(()=>{for(const e of folio.querySelectorAll(':scope > .layer-notes,:scope > .relation-note-list'))move(e,panel);}).observe(folio,{childList:true});
 window.addEventListener('resize',arrange);document.addEventListener('chart-layer-change',arrange);document.addEventListener('chart-lot-category-change',arrange);arrange();
 folio.addEventListener('click',labelPositions);
 globalThis.ChartWorkbench={restoreClone(doc,layout="vertical"){const page=doc.querySelector('.folio');if(!page)return;page.classList.remove('workbench-wide','workbench-enabled');const left=page.querySelector('.chart-screen'),right=page.querySelector('.chart-work-panel'),w=left?.querySelector('.workspace'),bottom=w?.querySelector('.chart-bottom'),top=page.querySelector('.chart-top-controls'),category=page.querySelector('.lot-category-switch'),legendLine=page.querySelector('.lot-legend-line');if(top&&bottom){const tools=top.querySelector('.tools'),mode=top.querySelector('.aspect-diagram-mode');if(tools)bottom.prepend(tools);if(mode)bottom.prepend(mode);}if(category&&legendLine)legendLine.append(category);top?.remove();if(left)for(const e of [...left.children])page.append(e);if(right)for(const e of [...right.children]){if(e.matches('.chart-type-switch'))w?.querySelector('.chart-bottom')?.append(e);else if(e.matches('.docked-tabs,.docked-card'))w?.append(e);else page.append(e);}page.querySelector('.chart-workbench')?.remove();page.querySelector('.workbench-layout-controls')?.remove();
  if(layout==='horizontal'){
   const bench=doc.createElement('div'),screen=doc.createElement('section'),panel=doc.createElement('section');
   bench.className='chart-workbench';screen.className='chart-screen';panel.className='chart-work-panel';
   for(const e of [...page.children]){
    if(e.matches('.masthead,.settings,.workspace'))screen.append(e);
    else if(e.matches('.layer-notes,.relation-note-list'))panel.append(e);
   }
   for(const e of screen.querySelectorAll('.workspace > .docked-tabs,.workspace > .docked-card'))panel.append(e);
   if(category){const controls=doc.createElement('div');controls.className='chart-top-controls';screen.querySelector('.chart-area')?.prepend(controls);controls.append(category);}
   bench.append(screen,panel);page.prepend(bench);page.classList.add('workbench-enabled','workbench-wide');
  }
 }};
})();
