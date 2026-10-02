(() => {
 if(globalThis.ChartPageMode!=='transit')return;
 const storage='chart-transit-query-results-v1:'+location.pathname;
 let queries=[];try{const saved=JSON.parse(localStorage.getItem(storage)||'[]');if(Array.isArray(saved))queries=saved.filter(item=>item?.schema==='cgm.transit-query-result.v1'&&item.id&&Array.isArray(item.conditions)&&Array.isArray(item.results));}catch{}
 if(!queries.length)return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const fmt=value=>String(value||'').replaceAll('-','/').replace('T',' ');
 const hint=document.querySelector('.transit-agent-hint-dialog'),trigger=document.querySelector('.transit-search-trigger');
 const dialog=document.createElement('dialog');dialog.className='transit-query-results-dialog';dialog.setAttribute('aria-label','行运查询结果');document.querySelector('.folio').append(dialog);
 let selected=queries.length-1,page=0;const choices=new Map();
 const current=()=>queries[selected];
 const titleOf=query=>String(query.title||'行运查询').replace(/^(演示|验收)\s*[：:]\s*/, '');
 function resultMarkup(item,index){const choice=choices.get(index)||{},end=item.end||item.start,title=item.start===end?fmt(item.start):fmt(item.start)+' — '+fmt(end);
  return `<article class="agent-query-result" data-result="${index}"><h3>${esc(title)}</h3><div class="agent-query-actions"><button type="button" data-jump="${index}">查看起始时刻</button><button type="button" data-save="${index}" ${choice.saved?'disabled':''}>${choice.saved?'已添加':'保存为卡片'}</button></div></article>`;
 }
 function render(){const query=current(),shown=query.results.slice(0,40),pages=Math.ceil(shown.length/5);
  dialog.innerHTML=`<header><h2>行运查询</h2><button type="button" data-close aria-label="关闭">×</button></header><p class="agent-query-request">请向 Agent 描述要查询的时间范围与星象条件，完成后在这里查看结果。</p>${queries.length>1?`<select data-query-select aria-label="已有查询" style="max-width:100%;width:100%;font:inherit;color:inherit;background:transparent;border:1px solid #d5ccbd;padding:8px">${queries.map((item,i)=>`<option value="${i}" ${i===selected?'selected':''}>${esc(titleOf(item))}</option>`).join('')}</select>`:''}<h3>${esc(titleOf(query))}</h3><p>${esc(query.conditions.map(condition=>globalThis.ChartTransitResultCards.describe(condition)).join('；'))}</p><div class="agent-query-context"><span>${esc(fmt(query.range.start))} — ${esc(fmt(query.range.end))}</span><span>${esc(query.context?.label||'')}</span></div><div class="agent-query-summary"><strong>${shown.length?query.truncated?'显示前 '+shown.length+' 段':'找到 '+shown.length+' 个时间段':'没有同时命中的时间段'}</strong></div><div class="agent-query-results">${shown.slice(page*5,page*5+5).map((item,offset)=>resultMarkup(item,page*5+offset)).join('')||'<p class="agent-query-empty">所选时间范围内没有同时满足全部条件的时刻。</p>'}</div><nav class="agent-query-pages" aria-label="查询结果页码">${pages>1?Array.from({length:pages},(_,i)=>`<button type="button" data-page="${i}" aria-current="${i===page?'page':'false'}">${i+1}</button>`).join(''):''}</nav><p class="agent-query-status" role="status"></p>`;
 }
 const seenValue=query=>query.id+'@'+query.created_at;
 const open=()=>{render();dialog.showModal();try{sessionStorage.setItem('chart-transit-query-seen:'+location.pathname,seenValue(current()));}catch{}};
 trigger.onclick=open;
 dialog.addEventListener('click',event=>{if(event.target===dialog||event.target.closest('[data-close]')){dialog.close();return;}const next=event.target.closest('[data-page]');if(next){page=Number(next.dataset.page);render();return;}const save=event.target.closest('[data-save]'),jump=event.target.closest('[data-jump]');if(!save&&!jump)return;const index=Number(save?save.dataset.save:jump.dataset.jump),result=current().results[index],status=dialog.querySelector('.agent-query-status');if(save){if(!globalThis.ChartTransitResultCards.add(result,current().conditions)){status.textContent='下方最多保留 5 张卡片，请先关闭一张。';return;}choices.set(index,{saved:true});save.disabled=true;save.textContent='已添加';status.textContent='已保存为卡片。';}else{if(!globalThis.ChartTransitTime?.jump(result.start)){status.textContent='请先退出笔记图层，再查看行运。';return;}dialog.close();}});
 dialog.addEventListener('change',event=>{if(event.target.matches('[data-query-select]')){selected=Number(event.target.value);page=0;choices.clear();render();}});
 // Results are opened explicitly, never over the current-sky chart on entry.
})();
