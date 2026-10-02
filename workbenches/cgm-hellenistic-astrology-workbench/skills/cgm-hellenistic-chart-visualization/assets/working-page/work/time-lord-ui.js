(() => {
 if(!globalThis.ChartTimeLordMode)return;
 const data=JSON.parse(document.getElementById('time-lord-data').textContent),zr=data.technique==='zodiacal-releasing';
 const title=zr?'黄道释放':'法达',labels=zr?['L1','L2','L3','L4']:['大运','小运'];
 const planets={sun:['太阳','☉'],moon:['月亮','☽'],mercury:['水星','☿'],venus:['金星','♀'],mars:['火星','♂'],jupiter:['木星','♃'],saturn:['土星','♄'],north_node:['北交点','☊'],south_node:['南交点','☋']};
 const signs=['白羊座','金牛座','双子座','巨蟹座','狮子座','处女座','天秤座','天蝎座','射手座','摩羯座','水瓶座','双鱼座'];
 // Text presentation selector + the same symbol font stack as the chart wheel.
 const name=r=>zr?signs[r]:planets[r][0],glyph=r=>zr?String.fromCodePoint(0x2648+Number(r))+'\uFE0E':planets[r][1];
 const sym=r=>'<span class="time-lord-glyph">'+glyph(r)+'</span>';
 const ensureSchedule=async start=>{if(data.schedules[start]||!globalThis.ChartLibrary||ChartLibrary.export)return;const r=await fetch('/api/periods?view='+ChartLibrary.id+'&start='+encodeURIComponent(start));const d=await r.json();if(!r.ok)throw Error(d.error);Object.assign(data.schedules,d.schedules);};
 const storage='chart-time-lord-start-v1:'+location.pathname;
 const defaultSign=()=>String(typeof model!=='undefined'?model.lots.find(e=>e.key==='fortune')?.sign_index??data.basis.default_start:data.basis.default_start);
 let chosen=zr?defaultSign():String(data.basis.default_start),isDefault=true;
 try{const saved=localStorage.getItem(storage);if(zr&&saved!==null&&Number.isInteger(Number(saved))&&Number(saved)>=0&&Number(saved)<12){chosen=saved;isDefault=false;}}catch{}
 let indices=[-1,-1,-1,-1],micro=false,open=1;
 const now=Date.now(),active=entries=>Math.max(0,entries.findIndex(e=>e[1]<=now&&now<e[2]));
 const noteKey=(level,e,path)=>'time-lord:'+encodeURIComponent(JSON.stringify({version:1,...globalThis.ChartNoteObjects?.scope(),chartType:data.technique,natalUtc:data.basis.natal_utc,start:chosen,level,ruler:e[0],startUtc:e[1],endUtc:e[2],path,date:e[3]}));
 globalThis.ChartDecennialsNotes={label:key=>{if(!key.startsWith('time-lord:')||globalThis.ChartNoteObjects?.inScope(key)===false)return null;try{const e=JSON.parse(decodeURIComponent(key.slice(10)));if(e.chartType!==data.technique||!labels[e.level])return null;return name(e.ruler)+' '+glyph(e.ruler)+' '+labels[e.level]+' · '+e.date;}catch{return null;}}};
 document.querySelector('.time-adjust-panel')?.remove();
 const time=document.querySelector('.time-adjust-trigger');if(time){time.disabled=true;time.title='请在本命校准出生时间后重新生成';}
 document.querySelector('.aspect-diagram-mode')?.remove();
 const tool=document.getElementById('aspect-diagram-toggle');tool.className='decennials-start-trigger';tool.removeAttribute('aria-pressed');
 const dialog=document.createElement('dialog');dialog.className='decennials-start-dialog';dialog.setAttribute('aria-label',title+'设置');
 const explanation=zr?'黄道释放源自古代占星师瓦伦斯，以星座划分长短不同的运势阶段。默认从本命福点所在星座开始，也可自行选择。':'法达源自中世纪占星传统，以行星划分长短不同的人生阶段。昼生从太阳开始，夜生从月亮开始。';
 dialog.innerHTML='<header><h2>'+title+(zr?'起始星座':'计算说明')+'</h2><button type="button" data-close aria-label="关闭">×</button></header><p>'+explanation+'</p>'+(zr?'<div class="decennials-start-options">'+signs.map((n,i)=>'<label><input type="radio" name="release-start" value="'+i+'">'+n+' '+sym(i)+'</label>').join('')+'</div>':'<p>当前为'+(data.basis.sect==='day'?'昼生：太阳起运，交点在火星后。':'夜生：月亮起运，交点在水星后。')+'</p>')+'<details class="time-lord-method"><summary>方法说明</summary><p>'+(zr?'L1–L4 每单位分别为 360 天、30 天、60 小时、5 小时。下级走完一圈而上级尚未结束时转至对宫，称为解结；年龄另按实际生日计算。':'每个主星大运均分成七段小运；七主星走完后接北交点三年、南交点两年，交点不再划分小运。每年按 365.25 天计算，年龄另按实际生日计算。')+'</p><p class="time-lord-source">依据：'+(zr?'瓦伦斯《选集》卷四；单位和解结规则参照 Chris Brennan 的黄道释放说明。':'比鲁尼《占星术入门》§395；交点顺序采用本页确认口径。')+'</p></details>';
 document.querySelector('.folio').append(dialog);
 tool.addEventListener('click',event=>{event.stopImmediatePropagation();if(zr)dialog.querySelector('[value="'+chosen+'"]').checked=true;dialog.showModal();},true);
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.addEventListener('change',async event=>{if(event.target.name!=='release-start')return;isDefault=false;chosen=event.target.value;localStorage.setItem(storage,chosen);indices=[-1,-1,-1,-1];try{await ensureSchedule(chosen);draw();dialog.close();}catch(e){tool.textContent='时段加载失败，请重试';}});
 const card=document.createElement('section');card.className='decennials-card time-lord-card';card.setAttribute('aria-label',title);
 globalThis.ChartDock.addPermanent('time-lord-periods',title,card);
 const notes=document.querySelector('.relation-note-list');if(notes)card.after(notes);
 function draw(){
  if(zr&&!data.schedules[chosen]){ensureSchedule(chosen).then(draw).catch(()=>{tool.textContent='时段加载失败，请重试';});return;}
  tool.innerHTML=zr?'起始星座：'+name(chosen)+' '+sym(chosen):'法达说明';
  let entries=data.schedules[zr?chosen:'default'];const levels=[];
  for(let l=0;l<labels.length&&entries.length;l++){if(indices[l]<0||indices[l]>=entries.length)indices[l]=active(entries);const e=entries[indices[l]];levels.push({entries,e,index:indices[l]});entries=e[5];}
  if(open>=levels.length)open=0;
  const visible=micro?[2,3]:levels.length===1?[0]:[0,1];
  const heading='<header class="decennials-primary-head"><h2>'+visible.map(l=>{const e=levels[l].e;return '<button type="button" class="decennials-heading-unit" data-level="'+l+'" aria-label="查看'+labels[l]+'"><span class="decennials-heading-name">'+name(e[0])+'</span><span class="decennials-heading-symbol time-lord-glyph">'+glyph(e[0])+'</span><small>'+labels[l]+'</small></button>';}).join('')+'</h2>'+(zr?'<button type="button" class="decennials-mode-toggle" data-mode-toggle>'+(micro?'返回 L1/L2':'展开 L3/L4')+'</button>':'')+'</header>';
  const level=levels[open];
  const cells=level.entries.map((e,i)=>'<td><button type="button" class="decennials-period-choice'+(i===level.index?' is-selected':'')+'" data-period-row="'+i+'" data-note-object="'+noteKey(open,e,indices.slice(0,open).concat(i))+'" aria-label="'+name(e[0])+' '+labels[open]+' '+e[3]+'开始'+(e[6]?'，解结':'')+'"'+(i===level.index?' aria-current="true"':'')+'>'+sym(e[0])+'<time datetime="'+new Date(e[1]).toISOString()+'">'+e[3]+(e[6]?'<small class="time-lord-lb">解结</small>':'')+'</time><span class="decennials-period-age">'+Number(e[4]).toFixed(2)+'</span></button></td>');
  const rows=cells.reduce((s,c,i)=>s+(i%2===0?'<tr>':'')+c+(i%2===1?'</tr>':i===cells.length-1?'<td aria-hidden="true"></td></tr>':''),'');
  const th='<th><div class="decennials-column-head"><span>'+labels[open]+'</span><span>开始时间</span><span>年龄</span></div></th>';
  card.innerHTML=heading+(levels.length===1?'<p class="time-lord-source">交点大运不划分小运；下表可切换大运。</p>':'')+'<table class="decennials-selection-table"><thead><tr>'+th+th+'</tr></thead><tbody>'+rows+'</tbody></table>';
  card.querySelector('[data-mode-toggle]')?.addEventListener('click',()=>{micro=!micro;open=micro?3:1;draw();});
  card.querySelectorAll('[data-level]').forEach(button=>button.onclick=()=>{open=Number(button.dataset.level);draw();});
  card.querySelectorAll('[data-period-row]').forEach(button=>button.onclick=()=>{indices[open]=Number(button.dataset.periodRow);for(let i=open+1;i<4;i++)indices[i]=-1;draw();});
  globalThis.ChartRelationNotes?.refreshSelection?.();
 }
 document.addEventListener('chart-layer-change',()=>{if(globalThis.ChartNoteLayers?.current())globalThis.ChartDock.activate('time-lord-periods');draw();});
 if(zr)new MutationObserver(()=>{const next=defaultSign();if(isDefault&&next!==chosen){chosen=next;indices=[-1,-1,-1,-1];draw();}}).observe(document.getElementById('wheel'),{childList:true});
 draw();document.dispatchEvent(new Event('chart-note-objects-ready'));
})();
