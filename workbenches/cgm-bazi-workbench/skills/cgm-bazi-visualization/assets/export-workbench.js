(()=>{
 'use strict';
 const $=id=>document.getElementById(id),enc=new TextEncoder(),paper=()=>getComputedStyle(document.body).backgroundColor;
 const concat=parts=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;};
 const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 const crc=bytes=>{let n=0xffffffff;for(const b of bytes)n=crcTable[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;};
 async function zip(files){const chunks=[],central=[];let offset=0;for(const f of files){const bytes=new Uint8Array(await f.blob.arrayBuffer()),name=enc.encode(f.name),checksum=crc(bytes),h=new Uint8Array(30),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,checksum,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,name.length,true);chunks.push(h,name,bytes);const c=new Uint8Array(46),d=new DataView(c.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint32(16,checksum,true);d.setUint32(20,bytes.length,true);d.setUint32(24,bytes.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);central.push(c,name);offset+=h.length+name.length+bytes.length;}const dir=concat(central),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,dir.length,true);v.setUint32(16,offset,true);return new Blob([...chunks,dir,end],{type:'application/zip'});}
 function segments(total,max,spans){const out=[];let top=0;while(top<total){let end=Math.min(total,top+max);if(end<total){let moved=true;while(moved){moved=false;for(const s of spans)if(s.top<end&&s.bottom>end&&s.top>top){end=s.top;moved=true;}}}if(end<=top)throw Error('内容块过高，无法完整分张');out.push({top,height:end-top});top=end;}return out;}
 const fontCharacters=text=>[...new Set(Array.from(text))].join('');
 // DOM rectangles do not guarantee the same ink boundaries after SVG rasterization.
 // Use the final pixels to choose a blank seam, without making an oversized canvas.
 function rasterCut(image,startY,scale,pageTop,spans,inkLimit=188){
  const {data,width,height}=image,minGap=Math.ceil(6*scale),margin=Math.ceil(3*scale),legal=cut=>cut>0&&!spans.some(s=>s.top<pageTop+cut/scale&&s.bottom>pageTop+cut/scale);
  let end=null;
  const candidate=start=>{if(end===null||end-start<minGap)return null;const center=end-start>24*scale?end-margin:(start+end)/2;let cut=Math.floor((startY+center)/scale)*scale;for(let d=0;d<=end-start;d+=scale){for(const p of d?[cut-d,cut+d]:[cut])if(p>=startY+start+margin&&p<=startY+end-margin&&legal(p))return p;}return null;};
  for(let y=height-1;y>=0;y--){let ink=false;for(let x=0;x<width;x++){const i=(y*width+x)*4,high=Math.max(data[i],data[i+1],data[i+2]),low=Math.min(data[i],data[i+1],data[i+2]);if(data[i+3]>=64&&(high<inkLimit||high-low>55)){ink=true;break;}}if(!ink){if(end===null)end=y+1;}else if(end!==null){const cut=candidate(y+1);if(cut!==null)return cut;end=null;}}
  return candidate(0);
 }
 function seamDiagnostic(image,startY,scale,pageTop,spans){
  const {data,width,height}=image,rows=[];for(let y=0;y<height;y++){let dark=0,color=0,left=width,right=-1;for(let x=0;x<width;x++){const i=(y*width+x)*4,high=Math.max(data[i],data[i+1],data[i+2]),low=Math.min(data[i],data[i+1],data[i+2]);if(data[i+3]>=64&&(high<188||high-low>55)){if(high<188)dark++;else color++;left=Math.min(left,x);right=x;}}rows.push({y:startY+y,dark,color,left,right});}
  const low=pageTop+startY/scale,high=low+height/scale;return {pageTop,scanTop:low,scanBottom:high,width,blankRows:rows.filter(r=>!r.dark&&!r.color).length,lastRows:rows.slice(-32),protection:spans.filter(s=>s.top<high&&s.bottom>low).map(s=>({top:s.top,bottom:s.bottom})).slice(-16)};
 }
 async function capture(assets,copyVisible,options){
  await document.fonts.ready;
  const source=document.querySelector('main'),width=Math.ceil(source.getBoundingClientRect().width),clone=copyVisible(source),ctx=window.BaziExportContext?.()||{};
  clone.style.cssText+=';margin:0;min-height:0;height:auto;max-width:none;width:'+width+'px;';
  for(const e of [clone,...clone.querySelectorAll('.lower,.lower-main,.spine,.research-notes')]){e.style.height='auto';e.style.blockSize='auto';e.style.minHeight='0';e.style.minBlockSize='0';e.style.maxHeight='none';e.style.maxBlockSize='none';}
  clone.querySelector('.lower').style.flex='none';
  // Only chart content enters the image. Remove both controls and their space.
  clone.querySelectorAll('.deck-links,.wheel-arrow,.research-note-navigation,.research-note-actions,.research-notation,.research-mark-handle,.research-mark-hit').forEach(e=>e.remove());
  if(ctx.layer){
   clone.querySelectorAll('.research-archive-presentation').forEach(e=>e.remove());
   // The current note is already laid out. Keep its full title, object line and text.
   if(!ctx.note)clone.querySelector('.research-notes')?.remove();
  }
  if(!ctx.layer)clone.querySelectorAll('[data-export-title]').forEach(e=>{if(e.querySelector('h3'))return;const h=document.createElement('h3');h.textContent=e.dataset.exportTitle;h.style.cssText='font:18px/1.5 '+getComputedStyle(source).fontFamily+';margin:0 0 10px';e.prepend(h);});
  const noteZone=clone.querySelector('.research-notes');if(noteZone&&!noteZone.textContent.trim())noteZone.remove();
  if(options.privacy!=='none'){
   const tile=clone.querySelector('.name-tile'),rest=clone.querySelector('.name-rest');const measure=document.createElement('canvas').getContext('2d'),family=getComputedStyle(source.querySelector('.major')).fontFamily;for(const [box,char,isTile] of [[tile,'匿',true],[rest,'名',false]]){const span=box.querySelector('span')||box;measure.font=span.style.font||getComputedStyle(source.querySelector(isTile?'.name-tile > span':'.name-rest > span')).font;const before=measure.measureText(span.textContent);span.textContent=char;box.classList.remove('latin');box.style.fontFamily=family;span.style.fontFamily=family;measure.font=span.style.fontWeight+' '+span.style.fontSize+' '+family;const after=measure.measureText(char);span.style.width='auto';span.style.height='auto';span.style.inlineSize='auto';span.style.blockSize='auto';const positioned=isTile?span:box;positioned.style.top=(parseFloat(positioned.style.top||'0')+before.actualBoundingBoxDescent-after.actualBoundingBoxDescent)+'px';if(isTile)span.style.left=(parseFloat(tile.style.width)*.53-(after.actualBoundingBoxRight-after.actualBoundingBoxLeft)/2)+'px';}
   clone.querySelectorAll('.masthead [title],.masthead [aria-label]').forEach(e=>{e.removeAttribute('title');e.removeAttribute('aria-label');});
  }
  if(options.privacy==='name-place')clone.querySelector('.person-info > :first-child')?.remove();
  if(!options.design)clone.querySelectorAll('.account-watermark,.research-design-attribution').forEach(e=>e.remove());
  // Computed-style cloning freezes the old three-row height/top. Reflow only
  // the export copy and preserve the date's baseline beside the name.
  const info=clone.querySelector('.person-info'),sourceInfo=source.querySelector('.person-info');
  if(info&&sourceInfo&&(options.privacy==='name-place'||!options.design)){
   const bottom=options.design?getComputedStyle(sourceInfo).bottom:(source.querySelector('.masthead').getBoundingClientRect().bottom-sourceInfo.children[1].getBoundingClientRect().bottom)+'px';
   Object.assign(info.style,{top:'auto',bottom,height:'auto',blockSize:'auto',minHeight:'0',minBlockSize:'0',maxHeight:'none',maxBlockSize:'none'});
  }
  if(options.hideHour&&ctx.hourReferenced)throw Error('当前笔记关联时柱，不能隐藏出生时柱。');
  if(options.hideHour){
   clone.querySelectorAll('[data-research-object="natal:3"]').forEach(e=>{if(e.classList.contains('research-pillar-label'))return;e.querySelectorAll('.major,.compare-main > span').forEach(v=>{v.textContent='〇';v.style.color=getComputedStyle(source).getPropertyValue('--inactive')||'#C2BAAA';v.style.webkitTextFillColor=v.style.color;v.style.opacity='1';});e.querySelectorAll('.side,.compare-minor').forEach(v=>v.replaceChildren());});
   for(const id of ctx.hourMarks||[])clone.querySelector('[data-mark="'+CSS.escape(id)+'"]')?.remove();
  }
  clone.querySelectorAll('.research-personal').forEach(e=>e.remove());
  if(options.personal){const footer=document.createElement('footer');footer.className='research-personal';footer.style.cssText='display:flex;justify-content:space-between;gap:18px;padding:24px 0 0;margin:0;font:16px/1.8 '+getComputedStyle(source).fontFamily+';color:'+'#876449'+';border:0;';for(const [kind,text] of [['signature',options.signature],['contact',options.contact]]){const p=document.createElement('span');p.className=kind;p.style.cssText='flex:1;min-width:0;overflow-wrap:anywhere;text-align:'+(kind==='signature'?'left':'right');p.textContent=text;footer.append(p);}clone.querySelector('.lower-main').append(footer);}
  const host=document.createElement('div');host.style.cssText='position:fixed;left:-30000px;top:0;pointer-events:none;width:'+width+'px;background:'+paper()+';';host.append(clone);document.body.append(host);
  try{
   const config=JSON.parse($('bazi-library-config').textContent),characters=fontCharacters(clone.textContent),r=await fetch('/api/export-fonts',{method:'POST',headers:{'Content-Type':'application/json','X-Bazi-Token':config.token},body:JSON.stringify({view:config.viewId,text:characters})}),result=await r.json();if(!r.ok)throw Error(result.error);
   const familyId='BaziExport'+crypto.randomUUID().replaceAll('-',''),exportFonts=result.fonts.map((f,i)=>({...f,exportFamily:familyId+i}));
   for(const e of [clone,...clone.querySelectorAll('*')])for(const f of exportFonts)if(e.style.fontFamily.includes(f.family))e.style.fontFamily=e.style.fontFamily.replaceAll(f.family,f.exportFamily);
   const fonts=document.createElement('style');fonts.textContent=exportFonts.map(f=>`@font-face{font-family:'${f.exportFamily}';src:url(data:font/ttf;base64,${f.data}) format('truetype');}`).join('');host.prepend(fonts);
   await Promise.all(exportFonts.map(f=>document.fonts.load('14px "'+f.exportFamily+'"',characters||'〇')));await document.fonts.ready;
   let previous='',stable=0;for(let i=0;i<12&&stable<2;i++){await new Promise(resolve=>requestAnimationFrame(resolve));const geometry=[clone,...clone.querySelectorAll('p,h3')].map(e=>{const b=e.getBoundingClientRect();return [b.top,b.width,b.height].join(',');}).join(';');stable=geometry===previous?stable+1:0;previous=geometry;}
   // Export removes controls and changes page height. Rebuild the annotations
   // from the captured object-relative points after export fonts/layout settle.
   window.BaziRenderMarks?.(clone,(ctx.marks||[]).filter(m=>!options.hideHour||!(ctx.hourMarks||[]).includes(m.id)));
   const root=clone.getBoundingClientRect(),personalMark=clone.querySelector('.research-personal');
   const height=Math.ceil(personalMark?personalMark.getBoundingClientRect().bottom-root.top+18:root.height+24),max=Math.min(4096,Math.floor(16000000/(width*4))),spans=[],blocks=[];
   const protect=(rect,block=false)=>{const top=Math.floor(rect.top-root.top),bottom=Math.ceil(rect.bottom-root.top);if(bottom>top&&bottom-top<=max){const span={top,bottom};spans.push(span);if(block)blocks.push(span);}};
   clone.querySelectorAll('.natal,.comparison,.research-note-head,.research-archive-presentation section,.research-personal').forEach(e=>protect(e.getBoundingClientRect(),true));
   // Text line boundaries prevent slicing glyphs in long notes.
   clone.querySelectorAll('p').forEach(e=>{const range=document.createRange();range.selectNodeContents(e);for(const rect of range.getClientRects())protect(rect);});
   host.style.position='relative';host.style.left='0';host.style.top='0';host.style.pointerEvents='none';host.style.height=height+'px';host.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
   // Serialize offscreen then remove before exposing the temporary export scene.
   const xml=new XMLSerializer().serializeToString(host);host.remove();const pages=[];
   let top=0;while(top<height){const next=segments(height-top,max,spans.filter(s=>s.bottom>top).map(s=>({top:s.top-top,bottom:s.bottom-top})))[0],part={top,height:next.height},svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+part.height+'"><foreignObject x="0" y="-'+part.top+'" width="'+width+'" height="'+height+'">'+xml+'</foreignObject></svg>',img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();let canvas=document.createElement('canvas');canvas.width=width*2;canvas.height=part.height*2;const c=canvas.getContext('2d');c.scale(2,2);c.fillStyle=paper();c.fillRect(0,0,width,part.height);c.drawImage(img,0,0);
    // Final text ink can drift from Range rectangles in very tall foreignObjects.
    // Keep whole chart/card/footer blocks, but let actual blank pixels decide text seams.
    if(top+part.height<height){const scanHeight=Math.min(canvas.height,256),scanY=canvas.height-scanHeight,pixels=c.getImageData(0,scanY,canvas.width,scanHeight),cut=rasterCut(pixels,scanY,2,top,blocks);if(cut===null||cut<2){console.warn('Bazi export seam diagnostic',JSON.stringify(seamDiagnostic(pixels,scanY,2,top,blocks)));throw Error('未找到完整文字之间的分张位置');}if(cut<canvas.height){const cropped=document.createElement('canvas');cropped.width=canvas.width;cropped.height=cut;cropped.getContext('2d').drawImage(canvas,0,0);canvas=cropped;part.height=cut/2;}}
    const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!png)throw Error('图片编码失败');const data=canvas.toDataURL('image/png'),vector=new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="'+canvas.width+'" height="'+canvas.height+'"><image width="100%" height="100%" href="'+data+'"/></svg>'],{type:'image/svg+xml'});pages.push({png,svg:vector,width:canvas.width,height:canvas.height});top+=part.height;
   }
   return {pages,name:options.privacy==='none'?ctx.name:'匿名',label:$('selected-year').textContent};
  }finally{host.remove();}
 }
 function open({dialog,esc}){
  const d=dialog('图片导出','<label class="research-check"><input type="checkbox" data-design checked>显示设计署名</label><fieldset><legend>隐私</legend><label class="research-check"><input type="checkbox" name="export-privacy" value="name">仅匿名姓名</label><label class="research-check"><input type="checkbox" name="export-privacy" value="name-place">匿名姓名和出生地点</label><label class="research-check"><input type="checkbox" data-hour>隐藏出生时柱</label></fieldset><fieldset><legend>个人标识</legend><label class="research-check"><input type="checkbox" data-personal>加入个人标识</label><label class="research-personal-field"><span>姓名／签名</span><input data-signature aria-label="个人签名文字" maxlength="40" disabled autocomplete="off"></label><label class="research-personal-field"><span>联系方式</span><input data-contact aria-label="联系方式文字" maxlength="80" disabled autocomplete="off"></label></fieldset><p class="research-status" role="status"></p><footer><button data-preview>预览</button><button data-png disabled>导出 PNG</button><button data-svg disabled>导出 SVG</button></footer><div class="research-export-preview"></div>');
  const saved=open.personal||{},q=s=>d.querySelector(s),status=q('.research-status'),preview=q('.research-export-preview');q('[data-signature]').value=saved.signature||'';q('[data-contact]').value=saved.contact||'';
  if(window.BaziExportContext?.().hourReferenced){q('[data-hour]').disabled=true;const hint=document.createElement('p');hint.className='research-meta';hint.textContent='当前笔记关联时柱，不能隐藏出生时柱。';q('[data-hour]').closest('label').after(hint);}
  let version=0,captured=null,urls=[],busy=false;
  const options=()=>({design:q('[data-design]').checked,privacy:q('[name=export-privacy]:checked')?.value||'none',hideHour:q('[data-hour]').checked,personal:q('[data-personal]').checked,signature:q('[data-signature]').value.trim(),contact:q('[data-contact]').value.trim()});
  function invalidate(){version++;captured=null;urls.forEach(URL.revokeObjectURL);urls=[];preview.replaceChildren();q('[data-png]').disabled=q('[data-svg]').disabled=true;}
  function personal(){const enabled=q('[data-personal]').checked;for(const key of ['signature','contact']){q('[data-'+key+']').disabled=!enabled;}syncFooter();}
  function syncFooter(){const opts=options();open.personal={enabled:opts.personal,signature:q('[data-signature]').value,contact:q('[data-contact]').value};}
  for(const event of ['input','change'])d.addEventListener(event,e=>{if(e.target.matches('[name=export-privacy]')&&e.target.checked)d.querySelectorAll('[name=export-privacy]').forEach(c=>{if(c!==e.target)c.checked=false;});if(e.target.matches('[data-personal]'))personal();syncFooter();invalidate();});
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  const filename=(i,type)=>((captured.name||'八字')+'-'+captured.label+(captured.pages.length>1?'-'+String(i+1).padStart(2,'0'):'')+'.'+type).replace(/[\\/:*?"<>|]/g,'_');
  async function generate(){if(busy)return false;const opts=options();if(opts.personal&&!opts.signature&&!opts.contact){status.textContent='请填写至少一项姓名／签名或联系方式。';return false;}invalidate();const v=version;busy=true;q('[data-preview]').disabled=true;status.textContent='正在生成预览';try{const result=await window.BaziImageExport.makePages(opts);if(v!==version)return false;captured=result;result.pages.forEach((p,i)=>{const section=document.createElement('section'),img=document.createElement('img'),url=URL.createObjectURL(p.png);urls.push(url);img.src=url;img.alt='第'+(i+1)+'张导出预览';section.append(img);if(result.pages.length>1){const row=document.createElement('div');row.className='research-export-page-actions';row.textContent='第'+(i+1)+' / '+result.pages.length+'张';for(const type of ['png','svg']){const b=document.createElement('button');b.textContent='下载 '+type.toUpperCase();b.onclick=()=>download(p[type],filename(i,type));row.append(b);}section.append(row);}preview.append(section);});q('[data-png]').textContent=result.pages.length>1?'下载全部 PNG':'导出 PNG';q('[data-svg]').textContent=result.pages.length>1?'下载全部 SVG':'导出 SVG';q('[data-png]').disabled=q('[data-svg]').disabled=false;status.textContent='';return true;}catch(e){if(v===version)status.textContent='图片生成失败：'+e.message;return false;}finally{busy=false;q('[data-preview]').disabled=false;}}
  q('[data-preview]').onclick=generate;for(const type of ['png','svg'])q('[data-'+type+']').onclick=async()=>{if(!captured)return;const value=captured,v=version;try{if(value.pages.length===1)download(value.pages[0][type],filename(0,type));else{status.textContent='正在打包';const blob=await zip(value.pages.map((p,i)=>({blob:p[type],name:filename(i,type)})));if(v===version){download(blob,(value.name+'-'+type+'.zip').replace(/[\\/:*?"<>|]/g,'_'));status.textContent='';}}}catch(e){status.textContent=e.message;}};
  q('[data-personal]').checked=!!saved.enabled;personal();d.addEventListener('close',invalidate);return d;
 }
 window.BaziExportWorkbench={capture,open,zip,segments,fontCharacters,rasterCut};
})();
