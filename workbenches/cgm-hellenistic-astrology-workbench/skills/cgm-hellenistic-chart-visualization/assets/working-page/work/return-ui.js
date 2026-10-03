(() => {
 if(!globalThis.ChartReturnMode)return;
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const names={sun:'太阳',moon:'月亮',mercury:'水星',venus:'金星',mars:'火星',jupiter:'木星',saturn:'土星',uranus:'天王星',neptune:'海王星',pluto:'冥王星'};
 const queries=JSON.parse(document.getElementById('return-query-data').textContent);
 const results=queries.flatMap(query=>(query.results||[]).map(result=>({query,result,time:result.local.slice(0,26)})));
 const allowed=new Set(results.map(item=>item.time));
 const time=globalThis.ChartTransitTime;
 const set=time.set.bind(time);
 time.set=(value,options)=>allowed.has(value)&&set(value,options);
 time.jump=value=>{if(!allowed.has(value)||globalThis.ChartNoteLayers?.current())return false;void time.set(value);return true;};
 document.querySelector('.time-adjust-trigger')?.setAttribute('aria-label','当前返照时刻');
 const timeTrigger=document.querySelector('.time-adjust-trigger');
 if(timeTrigger){timeTrigger.disabled=true;timeTrigger.onclick=null;}
 document.getElementById('zodiac-switch').disabled=true;
 document.getElementById('zodiac-switch').title='返照黄道须与本命计算口径一致';
 document.getElementById('ayanamsa-choice').disabled=true;
 document.querySelectorAll('input[data-choice-for="ayanamsa-choice"]').forEach(input=>input.disabled=true);
 document.querySelector('.time-adjust-panel')?.remove();
 document.querySelector('.transit-search-trigger')?.remove();
 document.querySelector('.transit-agent-hint-dialog')?.remove();
 const queryTrigger=document.createElement('button');queryTrigger.type='button';queryTrigger.className='return-query-action';queryTrigger.textContent='返照查询（'+results.length+'）';
 document.querySelector('.chart-bottom .tools').append(queryTrigger);
 const display=document.createElement('button');display.type='button';display.className='return-display-switch';display.textContent='双盘';display.setAttribute('aria-label','当前双盘，点击切换为单盘');
 const methodSwitches=document.querySelector('.method-switches');const separator=document.createElement('span');separator.setAttribute('aria-hidden','true');separator.textContent='·';methodSwitches.append(separator,display);
 const syncDisplayLock=()=>{display.disabled=!!globalThis.ChartNoteLayers?.current();};syncDisplayLock();document.addEventListener('chart-layer-change',syncDisplayLock);
 const singleStyle=document.createElement('style');singleStyle.textContent='.folio.return-single .natal-transit-separator{display:none}.folio.return-single .m08-wheel .planet-minute-radial{display:inline!important}.folio.return-single .m08-wheel .transit-marks .planet-mark{font-size:18px!important}.folio.return-single .m08-wheel .transit-marks .planet-degree-radial{font-size:11.5px!important}.folio.return-single .m08-wheel .transit-marks .planet-minute-radial{font-size:7.5px!important}';document.head.append(singleStyle);
 display.onclick=()=>{globalThis.ChartReturnSingle=!globalThis.ChartReturnSingle;display.textContent=globalThis.ChartReturnSingle?'单盘':'双盘';display.setAttribute('aria-label',globalThis.ChartReturnSingle?'当前单盘，点击切换为双盘':'当前双盘，点击切换为单盘');document.querySelector('.folio').classList.toggle('return-single',globalThis.ChartReturnSingle);
  if(globalThis.ChartReturnSingle){globalThis.ChartReturnNatalModel=globalThis.ChartNatalModel;globalThis.ChartNatalModel=null;
   const own=ChartView.adapt(payload);model.angles=own.angles;model.houses=own.houses;model.lots=own.lots;model.natalPoints=[];
  }else{globalThis.ChartNatalModel=globalThis.ChartReturnNatalModel;
   model.angles=globalThis.ChartNatalModel.angles;model.houses=globalThis.ChartNatalModel.houses;model.lots=globalThis.ChartNatalModel.lots;
   model.natalPoints=globalThis.ChartNatalModel.planets.map(p=>({...p,key:'natal_'+p.key,originalKey:p.key,natalPoint:true,label:p.label+'·本命'}));}
  render();};
 const dialog=document.createElement('dialog');dialog.className='transit-query-results-dialog';dialog.setAttribute('aria-label','返照查询结果');document.querySelector('.folio').append(dialog);
 let page=0;const pageSize=5;const cardKey='chart-return-cards-v1:'+location.pathname;
 let cards=[];try{cards=JSON.parse(localStorage.getItem(cardKey)||'[]');if(!Array.isArray(cards))cards=[];}catch{cards=[];}
 const fmt=time=>time.slice(0,19).replace('T',' ').replaceAll('-','/');
 const card=item=>{const element=document.createElement('aside');element.className='side transit-result-card';element.innerHTML='<div class="detail-toolbar"><button type="button" aria-label="关闭此卡片">×</button></div><article><h2>'+esc(names[item.planet]||item.planet)+'返照</h2><p>'+esc(fmt(item.time))+'</p><p>'+esc(item.direction==='retrograde'?'逆行穿越':'顺行穿越')+'</p></article>';
  element.querySelector('button').onclick=()=>{ChartDock.remove(item.id);cards=cards.filter(x=>x.id!==item.id);localStorage.setItem(cardKey,JSON.stringify(cards));};
  return ChartDock.add(item.id,(names[item.planet]||item.planet)+'返照',element,()=>{})===true;};
 cards.forEach(card);
 const draw=()=>{const shown=results.slice(page*pageSize,(page+1)*pageSize);
  dialog.innerHTML='<header><div><p class="agent-query-kicker">返照查询</p><h2>返照查询与结果</h2></div><button type="button" data-close aria-label="关闭">×</button></header><section class="return-query-guide"><h3>发起新查询</h3><p>在 Agent 对话中说明星体和时间范围，例如：“查询未来十年所有火星返照，逐次列出精确时刻。”'+(globalThis.CGMPortable?'请让 Agent 返回更新后的阅读副本，打开新副本查看结果。':'完成计算后刷新此页查看结果。')+'</p></section><section class="return-query-found"><h3>已查询结果</h3><p class="agent-query-request">时间按当前返照地点的时区显示；逆行重复穿越分别列出。</p><div class="agent-query-summary"><strong>共 '+results.length+' 个时刻</strong></div><div class="agent-query-results">'+(shown.map((item,i)=>'<article class="agent-query-result" data-index="'+(page*pageSize+i)+'"><h3>'+esc(names[item.query.planet]||item.query.planet)+'返照 · '+esc(fmt(item.time))+'</h3><p>'+esc(item.result.direction==='retrograde'?'逆行穿越':'顺行穿越')+'</p><div class="agent-query-actions"><label><input type="checkbox" data-choice="jump">跳转盘面</label><label><input type="checkbox" data-choice="save">保存为卡片</label><button type="button" data-apply>确定</button></div></article>').join('')||'<p class="agent-query-empty">当前没有结果。</p>')+'</div><nav class="agent-query-pages" aria-label="查询结果页码">'+Array.from({length:Math.ceil(results.length/pageSize)},(_,i)=>'<button type="button" data-page="'+i+'" aria-current="'+(page===i?'page':'false')+'">'+(i+1)+'</button>').join('')+'</nav></section><p class="agent-query-status" role="status"></p>';};
 const seenKey='chart-return-query-seen:'+location.pathname;
 const lastQuery=queries.at(-1),lastMarker=[lastQuery.planet,lastQuery.start,lastQuery.end,lastQuery.results?.length].join('|');
 queryTrigger.onclick=()=>{draw();dialog.showModal();try{sessionStorage.setItem(seenKey,lastMarker);}catch{}};
 if(queries.length>1)try{if(sessionStorage.getItem(seenKey)!==lastMarker)queueMicrotask(()=>queryTrigger.click());}catch{}
 dialog.onclick=async event=>{if(event.target===dialog||event.target.closest('[data-close]')){dialog.close();return;}
  const next=event.target.closest('[data-page]');if(next){page=Number(next.dataset.page);draw();return;}
  const apply=event.target.closest('[data-apply]');if(!apply)return;
  const article=apply.closest('[data-index]'),item=results[Number(article.dataset.index)];
  const jump=article.querySelector('[data-choice="jump"]').checked,save=article.querySelector('[data-choice="save"]').checked;
  const status=dialog.querySelector('.agent-query-status');if(!jump&&!save){status.textContent='请至少选择一项操作。';return;}
  if(save){const entry={id:'return-'+crypto.randomUUID(),planet:item.query.planet,time:item.time,direction:item.result.direction};
   if(!card(entry)){status.textContent='下方最多保留 5 张卡片，请先关闭一张。';return;}
   cards.push(entry);localStorage.setItem(cardKey,JSON.stringify(cards));status.textContent='已保存为卡片。';}
  if(jump){if(globalThis.ChartNoteLayers?.current()){status.textContent='请先退出笔记图层。';return;}
   status.textContent='正在生成返照盘…';if(await time.set(item.time)){dialog.close();}else status.textContent='无法生成该返照时刻的盘面。';}
 };
})();
