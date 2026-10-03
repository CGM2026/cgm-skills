(() => {
 if(globalThis.ChartPageMode!=='transit')return;
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const names={sun:'太阳',moon:'月亮',mercury:'水星',venus:'金星',mars:'火星',jupiter:'木星',saturn:'土星',uranus:'天王星',neptune:'海王星',pluto:'冥王星'};
 const aspects={conjunction:'合',sextile:'六合',square:'四分',trine:'三分',opposition:'对分'};
 const signs='白羊 金牛 双子 巨蟹 狮子 处女 天秤 天蝎 射手 摩羯 水瓶 双鱼'.split(' ');
 const describe=condition=>{
  const planet=names[condition.planet]||condition.planet;
  if(condition.kind==='aspect')return `行运${planet}与${condition.target_chart==='natal'?'本命':'行运'}${names[condition.target]||condition.target}成${aspects[condition.aspect]||condition.aspect}，容许度 ${condition.orb}°`;
  const place=condition.scope==='sign'?signs[condition.value]+'座':'本命第 '+condition.value+' 宫';
  const detail=condition.detail==='bound'?' · '+(names[condition.ruler]||condition.ruler)+'界':condition.detail==='range'?' · '+condition.degree+'° 至 '+condition.end_degree+'°':condition.detail==='degree'?' · '+condition.degree+'°±'+condition.orb+'°':'';
  return `行运${planet}位于${place}${detail}${condition.motion==='retrograde'?' · 逆行':condition.motion==='direct'?' · 顺行':''}`;
 };
 const trigger=document.createElement('button');trigger.type='button';trigger.className='transit-search-trigger';trigger.textContent='行运查询';document.querySelector('.chart-bottom .tools').append(trigger);
 const dialog=document.createElement('dialog');dialog.className='transit-agent-hint-dialog';dialog.setAttribute('aria-label','在 Agent 中查询行运');
 dialog.innerHTML='<header><h2>在 Agent 中查询行运</h2><button type="button" data-close aria-label="关闭">×</button></header><p>请回到 Agent 对话，直接说出你想查询的行运条件。</p><p class="agent-hint-example">例如：“查询未来十年，行运火星在本命第九宫，并与行运木星合相的时间。”</p><p>'+(globalThis.CGMPortable?'Agent 会在电脑端查询，并返回更新后的阅读副本；收到新副本后打开查看。':'Agent 会计算符合条件的时间，再把结果写入这份星盘。查询完成后刷新页面查看。')+'</p><footer><button type="button" data-done>知道了</button></footer>';
 document.querySelector('.folio').append(dialog);
 trigger.onclick=()=>dialog.showModal();dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.querySelector('[data-done]').onclick=()=>dialog.close();dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 // Existing result cards remain available after the manual query form is retired.
 const key='chart-transit-result-cards-v1:'+location.pathname;
 let cards=[];try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))cards=saved.filter(item=>item?.id&&item?.result?.start&&Array.isArray(item.conditions)).slice(0,5);}catch{}
 const persist=()=>localStorage.setItem(key,JSON.stringify(cards));
 function showCard(item){const card=document.createElement('aside');card.className='side transit-result-card';const start=item.result.start.replace('T',' '),end=item.result.end?.replace('T',' ')||start;card.innerHTML=`<div class="detail-toolbar"><button type="button" aria-label="关闭此卡片">×</button></div><article><h2>${escape(start===end?start:start+' — '+end)}</h2><ul>${item.conditions.map(condition=>'<li>'+escape(describe(condition))+'</li>').join('')}</ul></article>`;card.querySelector('button').onclick=()=>{globalThis.ChartDock?.remove(item.id);cards=cards.filter(saved=>saved.id!==item.id);persist();};return globalThis.ChartDock?.add(item.id,start,card,()=>{})===true;}
 for(const item of cards)showCard(item);
 globalThis.ChartTransitResultCards={describe,add:(result,conditions)=>{const item={id:'transit-result-'+crypto.randomUUID(),result,conditions};if(!showCard(item))return false;cards.push(item);persist();return true;}};
})();

