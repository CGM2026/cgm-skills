(() => {
 const nav=document.querySelector('.chart-type-switch');
 if(!nav)return;
 const names={'本命':'本命盘','行运':'行运盘','返照':'返照盘','十年九月大运':'十年九月运盘','十年九月大运盘':'十年九月运盘','法达':'法达星限盘','法达盘':'法达星限盘','黄道释放':'黄道释放盘'};
 const fullName=text=>names[text]||(text.endsWith('盘')?text:text+'盘');
 const choices=[...nav.children],current=choices.find(e=>e.getAttribute('aria-current')==='page')||choices.find(e=>e.tagName==='SPAN');
 if(!current)return;
 const heading=document.createElement('h2');heading.className='chart-type-current';heading.textContent=fullName(current.textContent.trim());heading.setAttribute('aria-current','page');
 const more=document.createElement('button');more.type='button';more.className='chart-type-more';more.textContent='更多盘式';more.setAttribute('aria-haspopup','dialog');
 nav.replaceChildren(heading,more);
 const dialog=document.createElement('dialog');dialog.className='chart-type-dialog';dialog.setAttribute('aria-labelledby','chart-type-dialog-title');
 dialog.innerHTML='<header><h2 id="chart-type-dialog-title">更多盘式</h2><button type="button" aria-label="关闭盘式选择"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><nav class="chart-type-options" aria-label="全部盘式"></nav>';
 const options=dialog.querySelector('.chart-type-options');
 for(const choice of choices){
  // Older standalone templates include unopened placeholders; offer only built charts.
  if(choice.tagName==='BUTTON'&&choice.disabled)continue;
  const name=fullName(choice.textContent.trim());
  if(choice.tagName==='A'){choice.textContent=name;options.append(choice);}
  else{const button=document.createElement('button');button.type='button';button.textContent=name;if(choice===current){button.setAttribute('aria-current','page');button.onclick=()=>dialog.close();}else{button.disabled=true;button.title='此便携副本不包含其他盘式的页面链接';}options.append(button);}
 }
 document.querySelector('.folio').append(dialog);
 more.onclick=()=>dialog.showModal();dialog.querySelector('header button').onclick=()=>dialog.close();
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();});
 const notice=document.createElement('p');
 notice.className='chart-navigation-status';notice.setAttribute('role','status');notice.hidden=true;
 dialog.append(notice);
 let busy=false,navigationTimer;
 window.addEventListener('pagehide',()=>clearTimeout(navigationTimer));
 const show=text=>{notice.textContent=text;notice.hidden=false;};
 function failed(link,store){
  const detail=document.querySelector('.archive-save-status')?.title;
  show((globalThis.ChartLibrary?'暂未写入案例库：':'暂未写入 HTML：')+(detail||'保存失败。'));
  const retry=document.createElement('button');retry.type='button';retry.textContent='重试保存并切换';retry.onclick=()=>link.click();
  const leave=document.createElement('button');leave.type='button';leave.textContent='保留浏览器草稿后切换';leave.onclick=()=>{try{store.keepDraft();location.assign(new URL(link.getAttribute('href'),location.href).href);}catch(error){show(String(error.message||error));}};
  notice.append(document.createElement('br'),retry,leave);
 }
 options.addEventListener('click',async event=>{
  const link=event.target.closest('a[href]');
  if(!link||event.button>0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  event.preventDefault();
  if(busy)return;
  busy=true;
  try{
   const store=globalThis.ChartArchiveStore;
   if(store?.pending()){
    show('正在保存当前记录，随后切换盘面…');
    if(!await store.saveNow()){
     failed(link,store);
     return;
    }
   }
   show('正在打开'+link.textContent.trim()+'…');
   const target=new URL(link.getAttribute('href'),location.href);
   location.assign(target.href);
   // Only legacy file pages need the file-navigation fallback. A slow HTTP
   // transition is not evidence of a browser security restriction.
   clearTimeout(navigationTimer);
   if(target.protocol==='file:')navigationTimer=setTimeout(()=>show('尚未打开所选本地文件。请通过本机网页服务打开该星盘后再切换。'),5000);
  }catch(error){show('未能切换：'+String(error.message||error));}
  finally{busy=false;}
 });
})();
