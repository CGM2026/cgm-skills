(() => {
 if(globalThis.ChartPageMode!=='transit')return;
 const storage='chart-transit-research-v1:'+location.pathname;
 let records=[];try{const saved=JSON.parse(localStorage.getItem(storage)||'[]');if(Array.isArray(saved))records=saved.filter(item=>item?.id&&Array.isArray(item.periods));}catch{}
 if(!records.length)return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const fmt=value=>String(value).replace('T',' ').replaceAll('-','/');
 const millis=value=>Date.parse(value+':00Z');
 const host=document.createElement('div');host.className='transit-research-list';document.querySelector('.folio').append(host);
 function lane(period,key,label){const from=millis(period.start),span=millis(period.end)-from,items=period[key]||[];
  return `<div class="research-lane"><span class="research-lane-label">${label}</span><div class="research-track">${items.map(item=>{const left=100*(millis(item.start)-from)/span,width=100*(millis(item.end)-millis(item.start))/span;return `<span class="research-segment ${key}" style="left:${Math.max(0,left).toFixed(3)}%;width:${Math.max(.4,width).toFixed(3)}%" title="${esc(fmt(item.start))}—${esc(fmt(item.end))}"></span>`;}).join('')}</div><span class="research-lane-count">${items.length} 段</span></div>`;
 }
 function periodMarkup(period){const years=[0,.25,.5,.75,1].map((part,i)=>`<span>${new Date(millis(period.start)+(millis(period.end)-millis(period.start))*part).getUTCFullYear()}</span>`).join('');
  const events=period.overlap||[];
  return `<section class="research-period"><div class="research-period-heading"><h3>${esc(period.label)}</h3><span>${esc(fmt(period.start).slice(0,10))}—${esc(fmt(period.end).slice(0,10))}</span><strong>${events.length} 段同时命中</strong></div><div class="research-year-scale">${years}</div>${lane(period,'mars_ninth','火星第九宫')}${lane(period,'conjunction','火木合相')}${lane(period,'overlap','同时成立')}${events.length?events.map(item=>`<article class="research-event"><div><span class="research-event-kicker">同时成立</span><h4>${esc(fmt(item.start))} — ${esc(fmt(item.end))}</h4>${item.exact?`<p>精确合相　${esc(fmt(item.exact))}</p>`:''}</div><button type="button" data-jump="${esc(item.start)}">查看开始时的行运盘</button></article>`).join(''):`<p class="research-empty">${period.mars_ninth.length} 段火星第九宫与 ${period.conjunction.length} 段火木合相没有重叠。</p>`}</section>`;
 }
 function draw(){host.innerHTML=records.map(item=>`<section class="transit-research" data-research="${esc(item.id)}"><header class="research-heading"><div><p>行运研究 · ${esc(fmt(item.generated_for))}</p><h2>${esc(item.title)}</h2><span>${esc(item.scope)}</span></div><button type="button" data-close-research="${esc(item.id)}" aria-label="关闭这张研究卡片">×</button></header><div class="research-periods">${item.periods.map(periodMarkup).join('')}</div><p class="research-footnote">时间均为中国标准时间；色条表示条件成立的区间，细线标记短暂的合相区间。</p></section>`).join('');}
 host.addEventListener('click',event=>{const close=event.target.closest('[data-close-research]');if(close){records=records.filter(item=>item.id!==close.dataset.closeResearch);localStorage.setItem(storage,JSON.stringify(records));draw();return;}const jump=event.target.closest('[data-jump]');if(jump){if(globalThis.ChartTransitTime?.jump(jump.dataset.jump))window.scrollTo({top:0,behavior:'smooth'});else jump.title='请先退出笔记图层';}});
 draw();
})();
