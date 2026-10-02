/* Uses embedded local font outlines and the page background; works from file://. */
(()=>{
 const button=document.getElementById('export-image');
 const assets=JSON.parse(document.getElementById('export-assets').textContent);
 function alignExportIcon(){
  const main=document.querySelector('main'),tile=document.getElementById('name-tile'),edge=document.querySelector('.deck-links');
  const range=document.createRange();range.selectNodeContents(tile);
  const box=range.getBoundingClientRect(),style=getComputedStyle(tile),ctx=document.createElement('canvas').getContext('2d');
  ctx.font=style.font;const metrics=ctx.measureText(tile.textContent);
  const inkTop=box.top+(metrics.fontBoundingBoxAscent-metrics.actualBoundingBoxAscent);
  const mainBox=main.getBoundingClientRect(),icon=button.querySelector('svg').getBoundingClientRect();
  button.style.top=(inkTop-mainBox.top-(28-icon.height)/2)+'px';
  button.style.right=(mainBox.right-edge.getBoundingClientRect().right-(28-icon.width)/2)+'px';
 }
 const alignmentObserver=new ResizeObserver(alignExportIcon);
 for(const element of document.querySelectorAll('main,#name-tile,.deck-links'))alignmentObserver.observe(element);
 window.addEventListener('resize',alignExportIcon);
 document.querySelector('.masthead').addEventListener('name-layout-ready',alignExportIcon);
 document.fonts.ready.then(alignExportIcon);
 function copyVisible(source){
  if(source.nodeType===Node.TEXT_NODE)return source.cloneNode();
  if(source.nodeType!==Node.ELEMENT_NODE||source.matches('script,style,#export-image,#export-message,.research-actions,.research-tools,.research-tabs,.research-note-head button'))return null;
  const style=getComputedStyle(source);if(style.display==='none'||style.visibility==='hidden')return null;
  const dest=source.cloneNode(false);dest.removeAttribute('id');
  for(const a of [...dest.attributes])if(a.name.startsWith('on'))dest.removeAttribute(a.name);
  for(const prop of style)dest.style.setProperty(prop,style.getPropertyValue(prop));
  dest.style.setProperty('animation','none');dest.style.setProperty('transition','none');dest.style.setProperty('outline','none');
  // A materialized ::before is a real child: let the one-line label size itself
  // instead of retaining the source button's fractional computed width.
  if(source.matches('.deck-links button')){dest.style.width='max-content';dest.style.whiteSpace='nowrap';dest.style.flex='0 0 auto';}
  const pseudo=position=>{const p=getComputedStyle(source,position),c=p.content;if(!c||c==='none'||c==='normal'||c==='""')return;const span=document.createElement('span');for(const key of p)span.style.setProperty(key,p.getPropertyValue(key));span.textContent=c.replace(/^["']|["']$/g,'');dest.appendChild(span)};
  pseudo('::before');for(const child of source.childNodes){const clone=copyVisible(child);if(clone)dest.appendChild(clone)}pseudo('::after');
  return dest;
 }
 async function makePNG(){
  await document.fonts.ready;
  const libraryConfig=document.getElementById('bazi-library-config');
  let currentFonts=assets.fonts;
  if(libraryConfig){
   const config=JSON.parse(libraryConfig.textContent);
   const response=await fetch('/api/export-fonts',{method:'POST',headers:{'Content-Type':'application/json','X-Bazi-Token':config.token},body:JSON.stringify({view:config.viewId,text:document.querySelector('main').innerText})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'导出字体准备失败');currentFonts=result.fonts;
  }
  // Export only after font-dependent heading geometry has settled across frames.
  const heading=document.querySelector('.masthead');
  let previous='',stable=0;
  for(let i=0;i<12&&stable<3;i++){
   await new Promise(resolve=>requestAnimationFrame(resolve));
   await document.fonts.ready;
   heading.dispatchEvent(new Event('prepare-chart-export'));
   const current=heading.dataset.nameGeometry;
   stable=current===previous?stable+1:0;previous=current;
  }
  const main=document.querySelector('main'),bounds=main.getBoundingClientRect(),controls=document.getElementById('controls-body'),expanded=!controls.hidden;
  const notes=document.querySelector('.research-notes');
  const end=notes&&!notes.hidden?notes:expanded?controls:document.querySelector('.deck-links');
  const gap=expanded?0:Math.max(24,Math.min(40,bounds.width*.06));
  const width=Math.ceil(bounds.width),height=Math.ceil(end.getBoundingClientRect().bottom-bounds.top+gap);
  const label=document.getElementById('selected-year').textContent;
  const clone=copyVisible(main);clone.style.margin='0';clone.style.width=bounds.width+'px';clone.style.maxWidth='none';
  const host=document.createElement('div');host.setAttribute('xmlns','http://www.w3.org/1999/xhtml');host.style.cssText=`position:relative;width:${width}px;height:${height}px;background:${getComputedStyle(document.body).backgroundColor};`;
  const font=document.createElement('style');font.textContent=currentFonts.map(f=>`@font-face{font-family:'${f.family}';src:url(data:font/ttf;base64,${f.data}) format('truetype');}`).join('');host.append(font,clone);
  const xml=new XMLSerializer().serializeToString(host);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
  const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();
  const canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=height*2;const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.drawImage(image,0,0);
  const encoded=canvas.toDataURL('image/png').split(',')[1];
  const blob=new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'image/png'});
  return {blob,width:canvas.width,height:canvas.height,expanded,label};
 }
 window.BaziImageExport={makePNG,makePages:options=>window.BaziExportWorkbench.capture(assets,copyVisible,options)};
 button.addEventListener('click',async()=>{
  if(button.disabled)return;button.disabled=true;button.setAttribute('aria-busy','true');button.title='正在生成图片';document.getElementById('export-message').textContent='';
  try{const result=await makePNG(),url=URL.createObjectURL(result.blob),link=document.createElement('a');link.href=url;link.download=(chart.person.name+'-'+result.label+(result.expanded?'-展开':'')+'.png').replace(/[\\/:*?"<>|]/g,'_');link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);button.dispatchEvent(new CustomEvent('chart-exported',{detail:result}));}
  catch(error){document.getElementById('export-message').textContent='图片导出失败，请重试';button.dispatchEvent(new CustomEvent('chart-export-error',{detail:String(error)}));}
  finally{button.disabled=false;button.removeAttribute('aria-busy');button.title='导出图片';}
 });
})();
