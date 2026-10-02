(() => {
 const date=document.querySelector('.birth .date'),bottom=document.querySelector('.chart-bottom'),switcher=bottom?.querySelector('.chart-type-switch');
 if(!date||!switcher)return;
 const returnMode=globalThis.ChartReturnMode===true;
 const original=payload.facts.metadata.local_datetime.slice(0,returnMode?26:16);
 const transitMode=globalThis.ChartPageMode==='transit';
 const fixedTransit=transitMode&&!returnMode;
 function pinTimeCard(panel){const dock=globalThis.ChartDock;if(!dock)return false;if(dock.addPermanent)return dock.addPermanent('time-adjust','行运时刻',panel);if(!dock.add('time-adjust','行运时刻',panel,()=>{}))return false;const remove=dock.remove;dock.remove=key=>{if(key!=='time-adjust')return remove(key);};return true;}
 const validTime=globalThis.ChartReturnMode?/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
 const timeStoreKey='chart-transit-base-time-v1:'+location.pathname;
 const savedBaseTime=transitMode&&!returnMode?localStorage.getItem(timeStoreKey):null;
 let current=original,previewed=original,projected=false,sequence=0,timer=null;
 const trigger=document.createElement('button');trigger.type='button';trigger.className='time-adjust-trigger';trigger.textContent=date.textContent;trigger.setAttribute('aria-label',transitMode?'调整行运时间':'调整案例时间');date.replaceChildren(trigger);
 const panel=document.createElement('section');panel.className='time-adjust-panel';panel.setAttribute('aria-label','时间调整');panel.hidden=true;
 panel.innerHTML='<div class="time-adjust-head"><button type="button" data-action="save" title="保存校准后的新案例" aria-label="保存校准后的案例"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h12l3 3v13H4V4zM8 4v6h8V4M8 20v-7h8v7"/></svg></button><button type="button" data-action="close" title="关闭" aria-label="关闭时间调整"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4 20 20M20 4 4 20"/></svg></button></div><div class="time-adjust-controls"><button type="button" data-action="minus" aria-label="减少时间">−</button><select aria-label="调整尺度"><option value="minute">分钟</option><option value="hour">小时</option><option value="day">天</option><option value="week">周</option><option value="month">月</option><option value="year">年</option></select><button type="button" data-action="plus" aria-label="增加时间">＋</button><input type="datetime-local" aria-label="试调日期与时间"></div><p class="time-adjust-status" role="status"></p>';
 if(fixedTransit){panel.querySelector('.time-adjust-head').remove();panel.classList.add('fixed-transit-time');}
 bottom.insertBefore(panel,switcher);
 const input=panel.querySelector('input'),status=panel.querySelector('.time-adjust-status');input.step=returnMode?'0.000001':'60';input.value=original;
 const label=value=>value.slice(0,10).replaceAll('-','/')+'　'+value.slice(11,16);
 const state=()=>{trigger.textContent=label(current);status.textContent=current===original||previewed===current?'':'正在重新计算盘面…';};
 async function request(save=false,persistTime=true){const serial=++sequence;clearTimeout(timer);status.textContent=save?'正在生成校准后的新案例…':'正在重新计算盘面…';
  try{
   const caseState={};if(save)try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key.endsWith(location.pathname)&&key.startsWith('chart-'))caseState[key.slice(0,-location.pathname.length)]=localStorage.getItem(key);}}catch{}
   const response=await fetch('http://127.0.0.1:4852/adjust-time',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:location.href,local_datetime:current,save,case_state:caseState})});
   const data=await response.json();if(!response.ok)throw Error(data.error||'排盘失败');if(serial!==sequence)return false;
   if(save){const url=new URL(data.html,location.href);const link=document.createElement('a');link.href=url.href;link.textContent='打开新案例';link.title=url.pathname;const complete=data.views&&Object.keys(data.views).length===6;status.replaceChildren(document.createTextNode(complete?'新案例已建立，六种盘式齐全 · ':'校准后的新案例已建立 · '),link);return true;}
   globalThis.ChartMethodState.rebase(data.bundle);previewed=current;if(transitMode&&persistTime&&!globalThis.ChartNoteLayers?.current())localStorage.setItem(timeStoreKey,current);state();return true;
  }catch(error){if(serial!==sequence)return false;status.textContent=String(error.message||error)+(error instanceof TypeError?'。请重新打开本地服务后重试。':'');return false;}
 }
 function schedule(){clearTimeout(timer);const serial=++sequence;timer=setTimeout(()=>{if(serial===sequence)request();},250);state();}
 function step(direction){const unit=panel.querySelector('select').value;const value=new Date(current+':00Z');if(Number.isNaN(value.getTime()))return;const day=value.getUTCDate();
  if(unit==='month'||unit==='year'){value.setUTCDate(1);if(unit==='month')value.setUTCMonth(value.getUTCMonth()+direction);else value.setUTCFullYear(value.getUTCFullYear()+direction);const max=new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+1,0)).getUTCDate();value.setUTCDate(Math.min(day,max));}
  else value.setTime(value.getTime()+direction*({minute:60_000,hour:3_600_000,day:86_400_000,week:604_800_000}[unit]||60_000));
  current=value.toISOString().slice(0,16);input.value=current;schedule();
 }
 trigger.onclick=()=>{if(globalThis.ChartNoteLayers?.current())return;if(projected){globalThis.ChartDock?.activate('time-adjust');return;}panel.hidden=false;if(fixedTransit?pinTimeCard(panel):globalThis.ChartDock?.add('time-adjust','时间调整',panel,()=>{projected=false;bottom.insertBefore(panel,switcher);panel.hidden=true;})){projected=true;input.focus();}else{panel.hidden=true;trigger.title='下方最多保留5张卡片；请先关闭一张。';}};
 input.onchange=()=>{if(!input.value||globalThis.ChartNoteLayers?.current())return;current=input.value;schedule();};
 if(transitMode)globalThis.ChartTransitTime={current:()=>current,ready:()=>previewed===current,
  set:async(value,options={})=>{if(!validTime.test(value))return false;if(value===current&&previewed===current)return true;const previous=current;current=value;input.value=value;state();const okay=await request(false,options.persist!==false);if(!okay&&current===value){current=previous;input.value=previous;state();}return okay;},
  jump:value=>{if(globalThis.ChartNoteLayers?.current()||!validTime.test(value))return false;current=value;input.value=value;if(!returnMode)trigger.click();schedule();return true;}};
 panel.addEventListener('click',event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;
  if(globalThis.ChartNoteLayers?.current())return;
  if(action==='minus'||action==='plus'){step(action==='plus'?1:-1);return;}
  if(action==='close'&&!fixedTransit){if(projected)globalThis.ChartDock?.remove('time-adjust');else panel.hidden=true;return;}
  if(action==='save'&&!fixedTransit){if(current===original){status.textContent='请先调整时间，再保存为新案例。';return;}if(previewed!==current){status.textContent='请等待盘面重新计算后再保存。';return;}request(true);}
 });
 state();
 if(transitMode){const fixed=globalThis.ChartNoteLayers?.current()?.transitTime;if(fixed){trigger.disabled=true;queueMicrotask(()=>globalThis.ChartTransitTime.set(fixed));}else if(!returnMode&&globalThis.ChartLibrary&&!ChartLibrary.export){queueMicrotask(async()=>{try{const meta=payload.facts.metadata;let now;if(meta.time_basis==='iana'){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:meta.time_reference,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));now=`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}else{const offset=meta.local_datetime.match(/([+-])(\d{2}):(\d{2})$/);if(!offset)throw Error('无法确认行运时区');const minutes=(Number(offset[2])*60+Number(offset[3]))*(offset[1]==='-'?-1:1);now=new Date(Date.now()+minutes*60000).toISOString().slice(0,16);}trigger.textContent='正在计算当下天象…';const okay=await ChartTransitTime.set(now,{persist:false});if(!okay){trigger.textContent=label(current)+'（当下天象未更新）';trigger.title=status.textContent;}}catch(error){trigger.textContent=label(current)+'（当下天象未更新）';trigger.title=String(error.message||error);}});}else if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(savedBaseTime||'')&&savedBaseTime!==original)queueMicrotask(()=>globalThis.ChartTransitTime.set(savedBaseTime));}
 if(fixedTransit){const pin=()=>{if(projected)return;if(globalThis.ChartNoteLayers?.current())return;panel.hidden=false;projected=pinTimeCard(panel)===true;};pin();document.addEventListener('chart-layer-change',pin);}
})();
