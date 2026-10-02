(() => {
 if(!globalThis.ChartDecennialsMode)return;
 const data=JSON.parse(document.getElementById('decennials-data').textContent);
 document.querySelector('.time-adjust-panel')?.remove();
 const timeTrigger=document.querySelector('.time-adjust-trigger');if(timeTrigger){timeTrigger.disabled=true;timeTrigger.title='请在本命盘校准出生时间后重新生成十年九月大运';}
 const names={sun:'太阳',moon:'月亮',mercury:'水星',venus:'金星',mars:'火星',jupiter:'木星',saturn:'土星'};
 const symbols={sun:'☉',moon:'☽',mercury:'☿',venus:'♀',mars:'♂',jupiter:'♃',saturn:'♄'};
 const planet=key=>names[key]+' '+symbols[key];
 const periodLabels={major:'大运',sub:'年限',cycle:'月限',day:'日限'};
 const objectKey=(level,entry,path)=>'decennials:'+encodeURIComponent(JSON.stringify({version:1,...globalThis.ChartNoteObjects?.scope(),chartType:'decennials',natalUtc:data.basis.natal_utc,startRuler:chosen,level,ruler:entry.ruler,startUtc:entry.start_utc,endUtc:entry.end_utc,path}));
 globalThis.ChartDecennialsNotes={label:key=>{if(!key.startsWith('decennials:')||globalThis.ChartNoteObjects?.inScope(key)===false)return null;try{const item=JSON.parse(decodeURIComponent(key.slice(11)));if(item.chartType!=='decennials'||!periodLabels[item.level]||!names[item.ruler])return null;return planet(item.ruler)+periodLabels[item.level]+' · '+format(item.startUtc);}catch{return null;}}};
 const key='chart-decennials-start-v1:'+location.pathname;
 const valid=Object.keys(names);
 let chosen=data.basis.default_start;
 try{const stored=localStorage.getItem(key);if(valid.includes(stored))chosen=stored;}catch{}
 const format=utc=>{const date=new Date(utc);try{return new Intl.DateTimeFormat('zh-CN',{timeZone:data.basis.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date).replaceAll('/','.');}catch{return utc.slice(0,10).replaceAll('-','.');}};
 const age=entry=>Number(entry.age).toFixed(2);
 const inside=(entry,now)=>Date.parse(entry.start_utc)<=now&&now<Date.parse(entry.end_utc);
 const now=Date.now();
 const active=(entries)=>entries.findIndex(entry=>inside(entry,now));
 const tool=document.getElementById('aspect-diagram-toggle');tool.className='decennials-start-trigger';tool.removeAttribute('aria-pressed');
 document.querySelector('.aspect-diagram-mode')?.remove();
 const dialog=document.createElement('dialog');dialog.className='decennials-start-dialog';dialog.setAttribute('aria-label','选择十年运起运星');
 dialog.innerHTML='<header><h2>十年九月大运起运星</h2><button type="button" data-close aria-label="关闭">×</button></header><p>十年九月大运源自古代占星师瓦伦斯，以行星轮流主管不同的人生阶段。默认昼生从太阳开始，夜生从月亮开始，也可自行选择。</p><div class="decennials-start-options">'+valid.map(key=>'<label><input type="radio" name="decennials-start" value="'+key+'">'+planet(key)+'</label>').join('')+'</div><details class="time-lord-method"><summary>方法说明</summary><p>每段大运为 129 个月，每年按 360 天、每月按 30 天计算，再分为年限、月限和日限；主管星按本命七星的黄道次序轮转。年龄另按实际生日计算。</p><p class="time-lord-source">依据：瓦伦斯《选集》卷六；当前采用已确认的工作稿口径。</p></details>';
 dialog.querySelector('details').style.cssText="margin-top:18px;font:13px/1.7 'Huiwen','SimSun',serif;color:#817565";dialog.querySelector('summary').style.cursor='pointer';
 document.querySelector('.folio').append(dialog);
 tool.addEventListener('click',event=>{event.stopImmediatePropagation();dialog.querySelector('[value="'+chosen+'"]').checked=true;dialog.showModal();},true);
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.addEventListener('change',event=>{if(event.target.name!=='decennials-start')return;chosen=event.target.value;selectedMajor=-1;selectedSub=-1;selectedCycle=-1;selectedDay=-1;openLevel=mode==='macro'?'sub':'day';localStorage.setItem(key,chosen);draw();dialog.close();});
 const card=document.createElement('section');card.className='decennials-card';card.setAttribute('aria-label','十年九月大运');
 globalThis.ChartDock.addPermanent('decennials-periods','十年九月大运',card);
 const noteList=document.querySelector('.relation-note-list');if(noteList)card.after(noteList);
 let selectedMajor=-1,selectedSub=-1,selectedCycle=-1,selectedDay=-1,openLevel='sub',mode='macro';
 function select(level,index){
  if(level==='major'&&index!==selectedMajor){selectedMajor=index;selectedSub=-1;selectedCycle=-1;selectedDay=-1;}
  if(level==='sub'&&index!==selectedSub){selectedSub=index;selectedCycle=-1;selectedDay=-1;}
  if(level==='cycle'&&index!==selectedCycle){selectedCycle=index;selectedDay=-1;}
  if(level==='day')selectedDay=index;
  draw();
 }
 function draw(){
  if(!data.schedules[chosen]&&globalThis.ChartLibrary&&!ChartLibrary.export){fetch('/api/periods?view='+ChartLibrary.id+'&start='+chosen).then(r=>{if(!r.ok)throw Error('时段加载失败');return r.json();}).then(d=>{Object.assign(data.schedules,d.schedules);draw();}).catch(()=>{tool.textContent='时段加载失败，请重试';});return;}
  tool.textContent='起运星：'+planet(chosen);tool.setAttribute('aria-label','选择十年运起运星，当前'+planet(chosen));
  const majors=data.schedules[chosen];
  if(selectedMajor<0||selectedMajor>=majors.length)selectedMajor=Math.max(0,active(majors));
  const major=majors[selectedMajor];
  if(selectedSub<0||selectedSub>=major.subs.length)selectedSub=Math.max(0,active(major.subs));
  const sub=major.subs[selectedSub];
  if(selectedCycle<0||selectedCycle>=sub.cycles.length)selectedCycle=Math.max(0,active(sub.cycles));
  const cycle=sub.cycles[selectedCycle];
  if(selectedDay<0||selectedDay>=cycle.days.length)selectedDay=Math.max(0,active(cycle.days));
  const day=cycle.days[selectedDay];
  const levels=[{id:'major',label:'大运',entries:majors,index:selectedMajor,ruler:major.ruler},{id:'sub',label:'年限',entries:major.subs,index:selectedSub,ruler:sub.ruler},{id:'cycle',label:'月限',entries:sub.cycles,index:selectedCycle,ruler:cycle.ruler},{id:'day',label:'日限',entries:cycle.days,index:selectedDay,ruler:day.ruler}];
  const visibleLevels=mode==='macro'?levels.slice(0,2):levels.slice(2);
  const heading='<header class="decennials-primary-head"><h2>'+visibleLevels.map(level=>'<button type="button" class="decennials-heading-unit" data-level="'+level.id+'" aria-label="查看'+names[level.ruler]+level.label+'" aria-expanded="'+(openLevel===level.id)+'"><span class="decennials-heading-name">'+names[level.ruler]+'</span><span class="decennials-heading-symbol">'+symbols[level.ruler]+'</span><small>'+level.label+'</small></button>').join('')+'</h2><button type="button" class="decennials-mode-toggle" data-mode-toggle>'+(mode==='macro'?'展开月日':'返回年限')+'</button></header>';
  const level=levels.find(item=>item.id===openLevel);
  const cells=level.entries.map((entry,index)=>'<td><button type="button" class="decennials-period-choice'+(index===level.index?' is-selected':'')+'" data-period-row="'+index+'" data-period-index="'+index+'" data-note-object="'+objectKey(level.id,entry,[selectedMajor,selectedSub,selectedCycle,selectedDay].slice(0,levels.indexOf(level)).concat(index))+'" aria-label="选择'+names[entry.ruler]+level.label+'，'+format(entry.start_utc)+'开始"'+(index===level.index?' aria-current="true"':'')+'><span>'+symbols[entry.ruler]+'</span><time datetime="'+entry.start_utc+'">'+format(entry.start_utc)+'</time><span class="decennials-period-age">'+age(entry)+'</span></button></td>');
  const rows=cells.reduce((html,cell,index)=>html+(index%2===0?'<tr>':'')+cell+(index%2===1?'</tr>':index===cells.length-1?'<td aria-hidden="true"></td></tr>':''),'');
  const columnHead='<th scope="col"><div class="decennials-column-head"><span>'+level.label+'</span><span>开始时间</span><span>年龄</span></div></th>';
  const panel='<table class="decennials-selection-table" aria-label="切换'+level.label+'"><thead><tr>'+columnHead+columnHead+'</tr></thead><tbody>'+rows+'</tbody></table>';
  card.innerHTML=heading+panel;
  card.querySelector('[data-mode-toggle]').onclick=()=>{mode=mode==='macro'?'micro':'macro';openLevel=mode==='macro'?'sub':'day';draw();};
  card.querySelectorAll('[data-level]').forEach(button=>button.onclick=()=>{openLevel=button.dataset.level;draw();});
  card.querySelectorAll('[data-period-row]').forEach(row=>row.onclick=()=>select(openLevel,Number(row.dataset.periodRow)));
  globalThis.ChartRelationNotes?.refreshSelection?.();
 }
 document.addEventListener('chart-layer-change',()=>{if(globalThis.ChartNoteLayers?.current())globalThis.ChartDock.activate('decennials-periods');draw();});
 draw();
 document.dispatchEvent(new Event('chart-note-objects-ready'));
})();
