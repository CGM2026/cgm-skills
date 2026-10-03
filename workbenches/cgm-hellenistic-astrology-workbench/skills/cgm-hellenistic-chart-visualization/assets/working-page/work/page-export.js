(() => {
 let busy=false;
 const dialog=document.getElementById('export-dialog'),status=document.getElementById('export-status');
 // Stored library pages can have an older dialog shell. Add the shared choice once.
 if(!dialog.querySelector('[name="export-layout"]')){
  const field=document.createElement('fieldset');field.className='export-footer-choice';
  field.innerHTML='<legend>图片布局</legend><label><input type="radio" name="export-layout" value="vertical" checked>竖图</label><label><input type="radio" name="export-layout" value="horizontal">横图</label>';
  dialog.querySelector('.export-dialog-body').prepend(field);
 }
 document.getElementById('export-open').onclick=()=>{clearCapture();status.textContent='';previewWrap.hidden=true;dialog.querySelector('[name="export-layout"][value="vertical"]').checked=true;dialog.showModal();};
 document.getElementById('export-close').onclick=()=>dialog.close();
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 const previewWrap=document.getElementById('export-preview-wrap');
 for(const eventName of ['input','change'])dialog.addEventListener(eventName,()=>{clearCapture();previewWrap.hidden=true;});
 dialog.addEventListener('close',()=>{captureVersion++;clearCapture();});
 const personalChoice=document.getElementById('export-personal');
 const anonymousChoice=document.getElementById('export-anonymous'),monthChoice=document.getElementById('export-month-only'),hideIdentityChoice=document.getElementById('export-hide-identity');
 anonymousChoice.addEventListener('change',()=>{if(anonymousChoice.checked)hideIdentityChoice.checked=false;monthChoice.disabled=!anonymousChoice.checked;if(monthChoice.disabled)monthChoice.checked=false;});
 hideIdentityChoice.addEventListener('change',()=>{if(hideIdentityChoice.checked){anonymousChoice.checked=false;monthChoice.checked=false;monthChoice.disabled=true;}});
 const personalFields=['export-signature','export-contact'];
 // Older saved dialog shells can still contain the former field toggles.
 for(const id of personalFields)document.getElementById(id+'-enabled')?.remove();
 function syncPersonalFields(){
  for(const id of personalFields)document.getElementById(id).disabled=!personalChoice.checked;
 }
 personalChoice.addEventListener('change',syncPersonalFields);
 syncPersonalFields();
 function choices(){
  const showPersonal=personalChoice.checked;
  const signature=document.getElementById('export-signature').value.trim();
  const contact=document.getElementById('export-contact').value.trim();
  if(showPersonal&&!signature&&!contact){status.textContent='请填写至少一项个人签名或联系方式。';return null;}
  status.textContent='';
  return {layout:dialog.querySelector('[name="export-layout"]:checked').value,showDesign:document.getElementById('export-design').checked,showPersonal,signature,contact,anonymous:anonymousChoice.checked&&!hideIdentityChoice.checked,monthOnly:anonymousChoice.checked&&monthChoice.checked&&!hideIdentityChoice.checked,hideIdentity:hideIdentityChoice.checked};
 }
 const CAPTURE_SCALE=2,MAX_BITMAP_SIDE=8192,MAX_BITMAP_PIXELS=16000000;
 let captureVersion=0,captured=null;
 const previewButton=document.getElementById('export-preview');
 const downloadButtons=new Map();
 const previewStyle=document.createElement('style');
 previewStyle.textContent='.export-preview-page{margin:0}.export-preview-page+.export-preview-page{border-top:1px solid var(--rule)}.export-preview-caption{margin:0;padding:9px 12px;color:var(--text-secondary);font:inherit}.export-page-downloads{display:flex;justify-content:flex-end;gap:10px;padding:8px 12px 12px}.export-page-downloads button{border:1px solid var(--rule);background:transparent;color:var(--text-main);padding:5px 10px;font:inherit;cursor:pointer}.export-page-downloads button:disabled{opacity:.5;cursor:wait}#export-status[data-kind=progress],#export-status[data-kind=ready]{color:var(--text-secondary)}';
 document.head.append(previewStyle);
 function setStatus(message,kind='progress'){status.dataset.kind=kind;status.textContent=message;}
 function clearCapture(){
  if(captured)for(const page of captured.pages)URL.revokeObjectURL(page.url);
  captured=null;previewWrap.replaceChildren();previewWrap.hidden=true;updateDownloadLabels();
 }
 function updateDownloadLabels(){
  for(const [type,button] of downloadButtons)button.textContent=captured?.pages.length>1?'下载全部 '+type.toUpperCase():'导出 '+type.toUpperCase();
 }
 function assertCurrent(version){if(version!==captureVersion)throw new DOMException('已取消生成','AbortError');}
 function shouldIgnore(el,noteMode){
  return el.tagName==='DIALOG'||el.tagName==='SCRIPT'||el.matches?.('.chart-storage-notice,.archive-save-controls,.archive-save-status,.archive-save-manual,.decennials-mode-toggle,.detail-toolbar,.chart-actions,.edit-note,.aspect-diagram-toggle,.aspect-diagram-mode,.chart-type-switch')||(noteMode&&el.matches?.('.annotation-toolbar,.annotation-bottom-row,.annotation-fade,.relation-note-tools,.wheel-zoom-tools,.relation-note-navigation,.relation-tabs,.chart-bottom .tools,.relation-note-content header button,.related-notes,.archive-launch'));
 }
 function mergeProtectedSpans(spans,maxHeight){
  const sorted=spans.filter(span=>Number.isFinite(span.top)&&Number.isFinite(span.bottom)&&span.bottom>span.top&&span.bottom-span.top<=maxHeight).sort((a,b)=>a.top-b.top||a.bottom-b.bottom),merged=[];
  for(const span of sorted){const last=merged.at(-1);if(last&&span.top<=last.bottom)last.bottom=Math.max(last.bottom,span.bottom);else merged.push({...span});}
  return merged;
 }
 function planCaptureSegments(totalHeight,maxHeight,protectedSpans=[]){
  if(!Number.isSafeInteger(totalHeight)||totalHeight<=0||!Number.isSafeInteger(maxHeight)||maxHeight<=0)throw Error('图片尺寸无效');
  const spans=mergeProtectedSpans(protectedSpans,maxHeight),pages=[];let top=0;
  while(top<totalHeight){
   let bottom=Math.min(totalHeight,top+maxHeight);
   if(bottom<totalHeight){
    const crossing=spans.find(span=>span.top<bottom&&span.bottom>bottom);
    if(crossing){const before=Math.floor(crossing.top);if(before>top)bottom=before;}
   }
   if(bottom<=top)throw Error('无法安全分割图片');
   pages.push({top,height:bottom-top});top=bottom;
  }
  return pages;
 }
 function collectProtectedSpans(page,maxHeight){
  const doc=page.ownerDocument,pageTop=page.getBoundingClientRect().top,spans=[];
  const add=rect=>{if(rect.width>0&&rect.height>0)spans.push({top:Math.max(0,Math.floor(rect.top-pageTop)-1),bottom:Math.ceil(rect.bottom-pageTop)+1});};
  const walker=doc.createTreeWalker(page,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
   const text=walker.currentNode,parent=text.parentElement;
   if(!text.textContent.trim()||!parent||parent.closest('script,style,[hidden]')||doc.defaultView.getComputedStyle(parent).visibility==='hidden')continue;
   const range=doc.createRange();range.selectNodeContents(text);for(const rect of range.getClientRects())add(rect);range.detach();
  }
  for(const item of page.querySelectorAll('img,table,.export-personal-mark'))add(item.getBoundingClientRect());
  return mergeProtectedSpans(spans,maxHeight);
 }
 async function prepareExport(doc,options,context){
  const {noteMode,methodLabels,exportWidth,sidePadding,horizontal,box,wheelURL}=context;
    await doc.fonts.ready;
    globalThis.ChartWorkbench?.restoreClone(doc,options.layout);
    const exportPage=doc.querySelector('.folio');
    // Category controls and captions are omitted from all exported layouts.
    exportPage.querySelectorAll('.lot-category-switch,.lot-category-caption').forEach(e=>e.remove());
    exportPage.style.cssText+=';box-sizing:border-box!important;width:'+exportWidth+'px!important;max-width:none!important;min-width:0!important;min-height:0!important;height:auto!important;margin:0!important;padding-left:'+sidePadding+'px!important;padding-right:'+sidePadding+'px!important;padding-bottom:28px!important';
    const exportStyle=doc.createElement('style');
    exportStyle.textContent='.folio .chart-actions{display:none!important}.folio .settings{margin-top:2px!important}.folio .workspace{padding-bottom:0!important}.folio.note-layer-active .chart-bottom{display:none!important}.folio.note-layer-active .workspace{row-gap:20px!important}.folio.note-layer-active .relation-note-list{margin:0!important;gap:0!important}.folio.note-layer-active .relation-note-content>p:last-child{margin-bottom:0!important}.folio.note-layer-active .layer-notes:empty{display:none!important}.folio .export-record{display:block!important}.folio .export-record-title{margin:0 0 16px;font:26px/1.35 Huiwen,SimSun,serif;color:var(--text-main);letter-spacing:.04em}.folio .export-record-body{font:15px/1.95 Huiwen,SimSun,serif;color:var(--text-main)}.folio .export-record-body p{margin:0 0 14px;white-space:pre-wrap;overflow-wrap:anywhere}.folio .export-record-body p:last-child{margin-bottom:0}';
    doc.head.append(exportStyle);
    if(horizontal){
     exportStyle.textContent+=' .folio.workbench-wide .chart-workbench{display:flex!important;align-items:flex-start;gap:34px}.folio.workbench-wide .chart-screen{flex:1.65;min-width:0}.folio.workbench-wide .chart-work-panel{flex:1;min-width:0;position:static!important;max-height:none!important;overflow:visible!important;box-sizing:border-box;padding-top:0}.folio.workbench-wide .workspace{display:block!important;padding-top:0!important}.folio.workbench-wide .chart-screen #wheel{width:100%!important;max-width:100%!important}.folio.workbench-wide .chart-work-panel>.docked-card{margin-top:0!important}';
    }
    // Keep the left column's geometry when an empty right column is cropped.
    const horizontalScreen=horizontal?exportPage.querySelector('.chart-screen'):null;
    const horizontalScreenWidth=horizontalScreen?.getBoundingClientRect().width;
    // Export only the visible card. html2canvas can paint closed <details> children,
    // so remove them from the clone instead of relying on browser disclosure layout.
    exportPage.querySelectorAll('.docked-tabs,.docked-card[hidden]').forEach(e=>e.remove());
    exportPage.querySelectorAll('.chart-storage-notice,.archive-save-controls,.archive-save-status,.archive-save-manual,.decennials-mode-toggle').forEach(e=>e.remove());
    exportPage.querySelectorAll('.research-heading button,.research-event button').forEach(e=>e.remove());
    exportPage.querySelectorAll('.aspect-diagram-toggle').forEach(e=>e.remove());
    exportPage.querySelectorAll('.aspect-diagram-mode').forEach(e=>e.remove());
    exportPage.querySelectorAll('.chart-type-switch').forEach(e=>e.remove());
    exportPage.querySelectorAll('.time-adjust-panel').forEach(e=>e.remove());
    exportPage.querySelectorAll('.time-adjust-trigger').forEach(e=>e.replaceWith(doc.createTextNode(e.textContent)));
    if(noteMode)exportPage.querySelectorAll('.docked-card:not(.decennials-card)').forEach(e=>e.remove());
    if(noteMode&&globalThis.ChartPageMode==='transit')exportPage.querySelectorAll('.transit-time-card').forEach(e=>e.remove());
    exportPage.querySelectorAll('.docked-card .detail-toolbar').forEach(e=>e.remove());
    exportPage.querySelectorAll('.docked-card .point-aspects:not([open])').forEach(e=>e.remove());
    exportPage.querySelectorAll('.docked-card .related-notes:not([open])').forEach(e=>{
     const summary=e.querySelector(':scope > summary');
     if(summary)e.replaceChildren(summary);
    });
    // A docked archive exports only the composed reading, never its editor.
    for(const card of exportPage.querySelectorAll('.docked-card.archive-card')){
     const content=card.querySelector('.archive-presentation-content');
     if(content)card.replaceChildren(content);
     card.classList.add('export-record');
    }
    // html2canvas does not reliably lay out the live card's display:contents
    // heading and four-column definition list. Give the export its own boxes.
    for(const card of exportPage.querySelectorAll('.docked-card')){
     const cardWidth=horizontal?card.getBoundingClientRect().width:exportWidth;
     card.style.setProperty('grid-column','1 / -1','important');
     const content=card.querySelector(':scope > .detail-content');
     if(!content)continue;
     content.style.setProperty('display','block','important');
     content.style.setProperty('padding-right','0','important');
     const heading=content.querySelector('.detail-heading');
     if(heading){
      heading.style.setProperty('display','block','important');
      heading.style.setProperty('width','100%','important');
      const title=heading.querySelector('h2');
      if(title){
       title.style.setProperty('display','block','important');
       title.style.setProperty('width','100%','important');
       title.style.setProperty('max-width','none','important');
       title.style.setProperty('white-space','normal','important');
       title.style.setProperty('font-size',(cardWidth<420?34:cardWidth<700?42:52)+'px','important');
      }
      const position=heading.querySelector('.position');
      if(position){position.style.setProperty('display','block','important');position.style.setProperty('width','100%','important');}
     }
     for(const list of content.querySelectorAll('.point-summary dl')){
      const entries=[...list.children];
      list.replaceChildren();
      list.style.setProperty('display','flex','important');
      list.style.setProperty('flex-wrap','wrap','important');
      list.style.setProperty('column-gap','24px','important');
      list.style.setProperty('row-gap','14px','important');
      for(let i=0;i<entries.length;i+=2){
       const pair=doc.createElement('div');pair.className='export-fact-pair';
       pair.style.cssText='display:flex;align-items:baseline;min-width:0;flex:0 0 '+((horizontal?cardWidth<420:exportWidth<700)?'100%':'calc(50% - 12px)');
       const label=entries[i],value=entries[i+1];
       if(label){label.style.cssText='flex:none;width:'+(cardWidth<420?60:80)+'px;margin:0';pair.append(label);}
       if(value){value.style.cssText='flex:1;min-width:0;margin:0;overflow-wrap:anywhere';pair.append(value);}
       list.append(pair);
      }
     }
    }
    const methodRow=exportPage.querySelector('.method-switches');
    methodRow.querySelector('#zodiac-switch').textContent=methodLabels.zodiac;
    methodRow.querySelector('#house-switch').textContent=methodLabels.house;
    const planetLabel=methodRow.querySelector('#planets-switch');planetLabel.textContent=methodLabels.planets;
    if(options.anonymous){
     const name=exportPage.querySelector('.name');
     name.textContent='匿名';name.title='匿名';name.setAttribute('aria-label','匿名');
     if(options.monthOnly){const date=exportPage.querySelector('.birth .date');date.textContent=date.textContent.trim().slice(0,7);}
    }
    if(options.hideIdentity){
     const masthead=exportPage.querySelector('.masthead');
     if(options.showDesign){const watermark=masthead.querySelector('.account-watermark');watermark.className='export-method-attribution';watermark.style.cssText='display:block;flex:none;align-self:baseline;width:auto;max-width:100%;margin:0 0 0 auto;padding:0;position:static;background:none;color:inherit;font:inherit;letter-spacing:inherit;line-height:inherit;white-space:nowrap;text-align:right';methodRow.after(watermark);}
     masthead.remove();
    }else if(!options.showDesign)exportPage.querySelector('.account-watermark').style.visibility='hidden';
    exportPage.querySelector('.chart-bottom .tools')?.remove();
    exportPage.querySelectorAll('.chart-top-controls').forEach(e=>e.remove());
    // Remove a vacant card column so the capture has no unused sidebar.
    const exportPanel=exportPage.querySelector('.chart-work-panel');
    if(exportPanel&&![...exportPanel.children].some(e=>!e.hidden&&e.getBoundingClientRect().height>0)){
     horizontalScreen.style.setProperty('flex','0 0 '+horizontalScreenWidth+'px','important');
     exportPanel.remove();
     exportPage.style.setProperty('width',Math.ceil(horizontalScreenWidth+2*sidePadding)+'px','important');
    }
    if(options.showPersonal){
     const mark=doc.createElement('div');mark.className='export-personal-mark';
     for(const [kind,value] of [['signature',options.signature],['contact',options.contact]])if(value){const line=doc.createElement('div');line.className=kind;line.textContent=value;mark.append(line);}
     exportPage.append(mark);
     exportPage.style.setProperty('padding-bottom','18px','important');
    }
    if(noteMode){const page=doc.querySelector('.folio');page.querySelectorAll('.annotation-toolbar,.annotation-bottom-row,.annotation-fade,.relation-note-tools,.wheel-zoom-tools,.relation-note-navigation,.relation-tabs,.chart-bottom .tools,.relation-note-content header button').forEach(e=>e.remove());page.querySelectorAll('.method-switches button').forEach(e=>{e.disabled=false;e.style.cursor='default';});}
    const target=doc.querySelector('#wheel'),img=doc.createElement('img');
    img.src=wheelURL;img.style.cssText=`display:block;width:100%;height:auto;aspect-ratio:${box.width}/${box.height}`;
    img.width=Math.round(box.width);img.height=Math.round(box.height);
    target.replaceChildren(img);
    await img.decode();
 }
 async function createExportScene(options){
  await document.fonts.ready;
  const noteMode=!!globalThis.ChartNoteLayers?.current(),page=document.querySelector('.folio'),wheel=document.querySelector('#wheel svg');
  if(!page||!wheel)throw Error('没有可导出的星盘');
  const methodLabels={zodiac:document.getElementById('zodiac-switch').textContent.trim(),house:document.getElementById('house-switch').textContent.trim(),planets:document.getElementById('planets-switch').textContent.trim()};
  const svg=wheel.cloneNode(true),box=wheel.getBoundingClientRect(),pageBox=page.getBoundingClientRect(),pageStyle=getComputedStyle(page);
  const sidePadding=Math.max(24,parseFloat(pageStyle.paddingLeft)||0,parseFloat(pageStyle.paddingRight)||0),horizontal=options.layout==='horizontal',exportWidth=horizontal?1600:Math.min(1180,Math.ceil(pageBox.width));
  if(exportWidth<=0||box.width<=0||box.height<=0)throw Error('页面尚未准备好，请稍后再试');
  const originals=[wheel,...wheel.querySelectorAll('*')],copies=[svg,...svg.querySelectorAll('*')];
  originals.forEach((el,i)=>{const computed=getComputedStyle(el);for(const property of ['fill','stroke','stroke-width','stroke-opacity','opacity','font-family','font-size','font-weight','font-style','text-anchor','dominant-baseline','paint-order'])copies[i].style.setProperty(property,computed.getPropertyValue(property));});
  svg.querySelectorAll('.annotation-handle').forEach(e=>e.remove());svg.setAttribute('xmlns','http://www.w3.org/2000/svg');svg.setAttribute('width',String(box.width));svg.setAttribute('height',String(box.height));
  const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=document.querySelector('style').textContent.replace(/@font-face\s*\{[^}]*\}/g,'')+'\nsvg{width:100%;height:100%}';svg.prepend(style);
  const wheelURL='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));
  const viewportWidth=Math.max(document.documentElement.clientWidth,document.documentElement.scrollWidth,exportWidth),viewportHeight=Math.max(600,document.documentElement.clientHeight);
  const frame=document.createElement('iframe');frame.title='导出排版副本';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
  frame.style.cssText='position:fixed;left:-100000px;top:0;border:0;width:'+viewportWidth+'px;height:'+viewportHeight+'px;pointer-events:none;';
  // Standards-mode blank document without document-end tags inside this module:
  // older page assemblers can replace those tags even inside script strings.
  frame.srcdoc='<!doctype html>';
  await new Promise(resolve=>{frame.addEventListener('load',resolve,{once:true});document.body.append(frame);});
  try{
   const doc=frame.contentDocument;
   doc.documentElement.lang=document.documentElement.lang||'zh-CN';doc.documentElement.className=document.documentElement.className;
   const base=doc.createElement('base');base.href=document.baseURI;doc.head.append(base);
   for(const sheet of document.querySelectorAll('style,link[rel="stylesheet"]'))doc.head.append(sheet.cloneNode(true));
   doc.body.className=document.body.className;doc.body.style.cssText='margin:0;padding:0;overflow:visible;';
   const copy=page.cloneNode(true);for(const element of [...copy.querySelectorAll('*')])if(shouldIgnore(element,noteMode))element.remove();doc.body.append(copy);
   await prepareExport(doc,options,{noteMode,methodLabels,exportWidth,sidePadding,horizontal,box,wheelURL});
   await doc.fonts.ready;
   const bounds=copy.getBoundingClientRect(),width=Math.ceil(bounds.width),height=Math.ceil(bounds.height),pixelWidth=width*CAPTURE_SCALE;
   if(width<=0||height<=0||pixelWidth>MAX_BITMAP_SIDE)throw Error('图片尺寸超出可用范围');
   const maxHeight=Math.floor(Math.min(MAX_BITMAP_SIDE/CAPTURE_SCALE,MAX_BITMAP_PIXELS/(pixelWidth*CAPTURE_SCALE)));
   const segments=planCaptureSegments(height,maxHeight,collectProtectedSpans(copy,maxHeight));
   return {frame,page:copy,width,height,segments,viewportWidth,viewportHeight,noteMode};
  }catch(error){frame.remove();throw error;}
 }
 function canvasPNG(canvas){
  if(!canvas.width||!canvas.height||canvas.width>MAX_BITMAP_SIDE||canvas.height>MAX_BITMAP_SIDE||canvas.width*canvas.height>MAX_BITMAP_PIXELS)throw Error('图片未完整生成');
  return new Promise((resolve,reject)=>{canvas.toBlob(blob=>{if(!blob||blob.size<33)reject(Error('图片生成失败，请重试'));else resolve(blob);},'image/png');});
 }
 async function capturePage(options,version){
  const scene=await createExportScene(options),pages=[];
  try{
   for(const [index,segment] of scene.segments.entries()){
    assertCurrent(version);setStatus(scene.segments.length>1?'内容较长，正在生成第 '+(index+1)+' / '+scene.segments.length+' 张…':'正在生成图片…');
    let canvas;
    try{
     // Allocate only this region; never create an oversized whole-page canvas.
     canvas=await html2canvas(scene.page,{scale:CAPTURE_SCALE,backgroundColor:'#fffdf8',logging:false,width:scene.width,height:segment.height,x:0,y:segment.top,windowWidth:scene.viewportWidth,windowHeight:scene.viewportHeight,scrollX:0,scrollY:0,ignoreElements:el=>shouldIgnore(el,scene.noteMode),onclone:async doc=>{await doc.fonts.ready;}});
     assertCurrent(version);
     const blob=await canvasPNG(canvas);
     pages.push({blob,url:URL.createObjectURL(blob),width:canvas.width,height:canvas.height,top:segment.top});
    }finally{if(canvas){canvas.width=0;canvas.height=0;}}
   }
   return pages;
  }catch(error){for(const page of pages)URL.revokeObjectURL(page.url);throw error;}
  finally{scene.frame.remove();}
 }
 function captureKey(options){return JSON.stringify(options)+'|'+document.documentElement.clientWidth+'|'+document.querySelector('.folio').outerHTML;}
 async function ensureCapture(options,version){
  const key=captureKey(options);if(captured?.key===key)return captured.pages;
  clearCapture();const pages=await capturePage(options,version);assertCurrent(version);captured={key,pages};showPreview(pages);updateDownloadLabels();return pages;
 }
 function pageFilename(type,index,total){return total===1?'chart-page.'+type:'chart-page-'+String(index+1).padStart(String(total).length,'0')+'-of-'+total+'.'+type;}
 function blobDataURL(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{if(typeof reader.result!=='string'||!reader.result.startsWith('data:image/png;base64,')||reader.result.length<50)reject(Error('图片数据无效'));else resolve(reader.result);};reader.onerror=()=>reject(Error('读取图片失败'));reader.readAsDataURL(blob);});}
 async function pageFile(page,type){
  if(type==='png')return page.blob;
  const source=await blobDataURL(page.blob),svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+page.width+'" height="'+page.height+'" viewBox="0 0 '+page.width+' '+page.height+'"><image width="100%" height="100%" href="'+source+'"/></svg>';
  return new Blob([svg],{type:'image/svg+xml'});
 }
 const crcTable=Uint32Array.from({length:256},(_,value)=>{for(let n=0;n<8;n++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
 function crc32(bytes){let crc=0xffffffff;for(const value of bytes)crc=crcTable[(crc^value)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
 async function makeZIP(files){
  const chunks=[],central=[],encoder=new TextEncoder();let offset=0,centralSize=0;
  if(files.length>65535)throw Error('图片数量过多，请分次导出');
  const now=new Date(),year=Math.max(1980,Math.min(2107,now.getFullYear())),date=((year-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate(),time=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1);
  for(const file of files){
   const name=encoder.encode(file.name),bytes=new Uint8Array(await file.blob.arrayBuffer()),size=bytes.byteLength,crc=crc32(bytes);
   if(offset+size+30+name.length>0xffffffff)throw Error('图片总量过大，请逐张下载');
   const local=new Uint8Array(30),l=new DataView(local.buffer);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(10,time,true);l.setUint16(12,date,true);l.setUint32(14,crc,true);l.setUint32(18,size,true);l.setUint32(22,size,true);l.setUint16(26,name.length,true);
   chunks.push(local,name,file.blob);
   const directory=new Uint8Array(46),d=new DataView(directory.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(12,time,true);d.setUint16(14,date,true);d.setUint32(16,crc,true);d.setUint32(20,size,true);d.setUint32(24,size,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);
   central.push(directory,name);centralSize+=46+name.length;offset+=30+name.length+size;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  return new Blob([...chunks,...central,end],{type:'application/zip'});
 }
 function readyMessage(pages){return pages.length>1?'内容较长，已分为 '+pages.length+' 张图片。可逐张下载，或打包全部下载。':'预览已生成。';}
 function showPreview(pages){
  const fragment=document.createDocumentFragment();
  pages.forEach((page,index)=>{
   const figure=document.createElement('figure');figure.className='export-preview-page';figure.dataset.page=String(index+1);figure.dataset.total=String(pages.length);
   if(pages.length>1){const caption=document.createElement('figcaption');caption.className='export-preview-caption';caption.textContent='第 '+(index+1)+' 张 / 共 '+pages.length+' 张';figure.append(caption);}
   const image=document.createElement('img');image.src=page.url;image.alt=pages.length>1?'导出图片预览，第 '+(index+1)+' 张，共 '+pages.length+' 张':'导出图片预览';image.loading=index?'lazy':'eager';image.width=page.width;image.height=page.height;if(!index)image.id='export-preview-image';figure.append(image);
   if(pages.length>1){
    const actions=document.createElement('div');actions.className='export-page-downloads';
    for(const type of ['png','svg']){const button=document.createElement('button');button.type='button';button.textContent='下载 '+type.toUpperCase();button.setAttribute('aria-label','下载第 '+(index+1)+' 张 '+type.toUpperCase());button.addEventListener('click',()=>runExport(button,async()=>{download(await pageFile(page,type),pageFilename(type,index,pages.length));setStatus('已下载第 '+(index+1)+' 张 '+type.toUpperCase()+'。','ready');}));actions.append(button);}
    figure.append(actions);
   }
   fragment.append(figure);
  });
  previewWrap.replaceChildren(fragment);previewWrap.hidden=false;setStatus(readyMessage(pages),'ready');
 }
 async function runExport(button,action){
  if(busy)return;busy=true;const version=++captureVersion;
  const controls=[...dialog.querySelectorAll('input,button')].filter(e=>e.id!=='export-close').map(element=>[element,element.disabled]);for(const [element] of controls)element.disabled=true;
  const label=button.textContent;button.textContent='正在生成…';
  try{await action(version);}
  catch(error){if(error.name!=='AbortError')setStatus('导出失败：'+error.message,'error');}
  finally{for(const [element,disabled] of controls)element.disabled=disabled;button.textContent=label;previewButton.textContent='预览';updateDownloadLabels();busy=false;}
 }
 previewButton.onclick=()=>{const options=choices();if(options)runExport(previewButton,async version=>{const pages=await ensureCapture(options,version);showPreview(pages);});};
 for(const [id,type] of [['png-download','png'],['svg-download','svg']]){
  const old=document.getElementById(id),button=old.cloneNode(true);old.replaceWith(button);downloadButtons.set(type,button);
  button.addEventListener('click',()=>{const options=choices();if(!options)return;runExport(button,async version=>{
   const pages=await ensureCapture(options,version);
   if(pages.length===1){download(await pageFile(pages[0],type),pageFilename(type,0,1));dialog.close();return;}
   setStatus('正在打包 '+pages.length+' 张 '+type.toUpperCase()+' 图片…');
   const files=[];for(const [index,page] of pages.entries()){assertCurrent(version);files.push({name:pageFilename(type,index,pages.length),blob:await pageFile(page,type)});}
   const zip=await makeZIP(files);assertCurrent(version);download(zip,'chart-pages-'+type+'.zip');setStatus('已打包下载 '+pages.length+' 张 '+type.toUpperCase()+' 图片。','ready');
  });});
 }

})();
