/* Shared portable reading mode: no case-library writes or network requests. */
(()=>{
 'use strict';
 const bundle=parent.CGMReadingBundle,vid=window.CGMReadingView;
 if(!bundle||!vid)return;
 const page=bundle.pages[vid],reason='阅读副本：修改、保存和重新计算请在电脑工作台完成，或交给 Agent。';
 globalThis.CGMPortable={readOnly:true,navigate:id=>parent.CGMReadingOpen(id)};
 const nativeFetch=globalThis.fetch.bind(globalThis);
 globalThis.fetch=async(input,options={})=>{
  const raw=typeof input==='string'?input:input.url;
  if(/^(data:|blob:)/.test(raw))return nativeFetch(input,options);
  const url=new URL(raw,'https://reading.invalid'),method=(options.method||'GET').toUpperCase();let data,status=200;
  if(url.pathname==='/api/export-fonts')data={fonts:bundle.fonts.map(f=>({family:f.family,data:bundle.assets[f.asset].split(',')[1],unicodeRange:bundle.unicodeRange}))};
  else if(['/api/adjust-time','/adjust-time'].includes(url.pathname)&&method==='POST'){const request=JSON.parse(options.body||'{}');data=!request.save&&page.times?.[request.local_datetime];if(!data){status=403;data={error:'此时刻未包含在副本中；请让 Agent 在电脑端计算后重新生成。'};}}
  else if(method!=='GET'){status=403;data={error:reason};}
  else if(url.pathname==='/api/research')data=bundle.pages[url.searchParams.get('view')||vid]?.research;
  else if(url.pathname==='/api/preferences')data={setupComplete:true,revision:0};
  else if(url.pathname==='/api/notes')data=page.notes||[];
  else {status=404;data={error:'此内容未包含在阅读副本中；请让 Agent 在电脑端查询后重新生成。'};}
  if(data===undefined){status=404;data={error:'副本中没有这个盘式。'};}
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 };
 const blocked=page.kind==='bazi'
  ? '[data-rename],[data-create],[data-new],[data-edit-note],[data-delete-note],[data-more],[data-tool],[data-color],[data-weight],#research-new,#research-fade,[data-trial],[data-default],.algorithm-group input,.research-archive [data-action="new"],.research-archive [data-action="delete"],.research-archive [data-action="restore"],.research-archive button[type="submit"]'
  : '[data-color],[data-weight],.layer-editor input,.layer-editor button[type=submit],.new-layer,[data-save],[data-jump],[data-apply],[data-choice],.archive-body-input,[data-edit],[data-delete],[data-edit-note],[data-note-action="start"],[data-note-action="done"],[data-tool],.drawing-tools button,.drawing-tools input,.time-adjust-trigger,.time-adjust-panel input,.time-adjust-panel button:not([data-action="close"]),.archive-record-editor button[type="submit"],[data-action="new"],[data-action="delete"],.save-method-defaults,.personal-tradition button,.relation-title-input,.relation-text,.edit-note,.annotation-toolbar button,.annotation-fade input,.relation-tools button,.relation-tools input';
 function restrict(){
  document.querySelectorAll(blocked).forEach(el=>{
   if(el.matches('.archive-item [data-edit],.archive-summary-list [data-edit]')){if(el.textContent!=='查看')el.textContent='查看';return;}
   if(!el.disabled)el.disabled=true;if(el.title!==reason)el.title=reason;
  });
  document.querySelectorAll('.research-archive form h3,.archive-record-editor h3').forEach(el=>{if(el.textContent==='修改记录')el.textContent='查看记录';});
  document.querySelectorAll('.archive-record-editor .archive-editor-hint,.research-archive form .research-meta').forEach(el=>{const text='阅读副本中仅可查看；修改请在电脑工作台完成或交给 Agent。';if(el.textContent!==text)el.textContent=text;});
  document.querySelectorAll('.archive-body-input,.research-archive form input,.research-archive form textarea,.archive-record-editor input,.archive-record-editor textarea').forEach(el=>{if(!el.readOnly)el.readOnly=true;});
  document.querySelectorAll('.research-archive [data-edit],.archive-item [data-edit]').forEach(el=>{if(el.textContent==='编辑')el.textContent='查看';});
 }
 document.addEventListener('click',e=>{
  const link=e.target.closest('a[href]'),match=link?.getAttribute('href')?.match(/^\/view\/([^?#]+)/);
  if(match){e.preventDefault();e.stopImmediatePropagation();parent.CGMReadingOpen(match[1]);return;}
  const el=e.target.closest(blocked);
  if(el&&!el.matches('.archive-item [data-edit],.archive-summary-list [data-edit]')){e.preventDefault();e.stopImmediatePropagation();}
 },true);
 document.addEventListener('DOMContentLoaded',()=>{
  const label=document.createElement('p');label.className='cgm-reading-status';label.textContent='阅读副本 · 内容截至 '+bundle.created+' · 可查看与导出图片';label.style.cssText='font:12px/1.6 inherit;color:#968c7d;margin:8px 0';
  const footer=document.querySelector('[aria-label="关于与许可"],#cgm-license-footer');label.style.padding='0 20px';if(footer)footer.before(label);else document.body.append(label);
  const style=document.createElement('style');style.textContent='[disabled]{cursor:not-allowed} .cgm-reading-status{font-size:12px}';document.head.append(style);
  restrict();new MutationObserver(restrict).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
 });
})();
