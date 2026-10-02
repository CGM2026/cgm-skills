(() => {
  let bundle = JSON.parse(document.getElementById('chart-variants').textContent);
  const natalBundle=document.getElementById('natal-variants')?JSON.parse(document.getElementById('natal-variants').textContent):null;
  const labels = bundle.house_options;
  const ayanamsaSelect=document.getElementById('ayanamsa-choice');
  let ayanamsa=bundle.ayanamsa;
  const ayanamsaKey=globalThis.ChartPageMode==='transit'?'chart-transit-ayanamsa-v1:'+location.pathname:'chart-ayanamsa-v1';
  // Initial methods come from this case, never a different case's browser preference.
  ayanamsa=payload.facts.settings.ayanamsa||bundle.ayanamsa||'fagan_bradley';
  ayanamsaSelect.value=ayanamsa;
  let cycle = [...bundle.house_cycle];
  let showOuter = false;
  const planetsButton = document.getElementById('planets-switch');
  const current = {zodiac:payload.facts.settings.zodiac, house:payload.facts.settings.primary_house_system, bound:payload.facts.settings.bound_system};
  const zodiacButton = document.getElementById('zodiac-switch');
  const houseButton = document.getElementById('house-switch');
  const boundSelect = document.getElementById('bound-choice');
  const choiceRadios=[...document.querySelectorAll('input[type=radio][data-choice-for]')];
  function syncChoices(){choiceRadios.forEach(radio=>{radio.checked=radio.value===document.getElementById(radio.dataset.choiceFor).value;});}
  choiceRadios.forEach(radio=>radio.addEventListener('change',()=>{if(!radio.checked)return;const select=document.getElementById(radio.dataset.choiceFor);select.value=radio.value;select.dispatchEvent(new Event('change',{bubbles:true}));}));
  const settingsRow=document.querySelector('.settings'),methodRow=document.querySelector('.method-switches'),actionsRow=document.querySelector('.chart-actions');
  function layoutActions(){
    const visible=[...actionsRow.children].filter(el=>getComputedStyle(el).display!=='none');
    const actionWidth=visible.reduce((sum,el)=>sum+el.getBoundingClientRect().width,0)+Math.max(0,visible.length-1)*8;
    settingsRow.classList.toggle('actions-stacked',methodRow.scrollWidth+actionWidth+12>settingsRow.clientWidth);
  }
  new ResizeObserver(layoutActions).observe(settingsRow);
  const status = document.getElementById('switch-status');
  const selects = [...document.querySelectorAll('.house-choice')];
  const keyFor=(state,ayan=ayanamsa)=>[state.zodiac==='sidereal'&&ayan==='lahiri'?'sidereal_lahiri':state.zodiac,state.house,state.bound].join('|');
  const available=(state,ayan=ayanamsa)=>!!bundle.variants[keyFor(state,ayan)]&&(!natalBundle||!!natalBundle.variants[keyFor(state,ayan)]);
  const explanation=(state,ayan=ayanamsa)=>bundle.unavailable_variants?.[keyFor(state,ayan)]?.reason||natalBundle?.unavailable_variants?.[keyFor(state,ayan)]?.reason||'所选组合没有可用盘面，请手动选择其他宫位制。';
  const houseAvailable=house=>available({...current,house});
  function syncAvailability(){
    selects.forEach(select=>[...select.options].forEach(option=>{const ok=houseAvailable(option.value);option.disabled=!ok;option.textContent=labels[option.value]+(ok?'':' · 此时刻不可用');option.title=ok?'':explanation({...current,house:option.value});}));
    const unavailable=Object.keys(labels).filter(house=>!houseAvailable(house));
    let hint=document.getElementById('house-availability');
    if(!hint){hint=document.createElement('p');hint.id='house-availability';hint.className='config-help';status.before(hint);}
    hint.textContent=unavailable.length?unavailable.map(house=>labels[house].split('（')[0]).join('、')+'在此纬度与时刻不可用，已停用对应选项。':'';
    hint.hidden=!unavailable.length;
    const valid=cycle.filter(house=>houseAvailable(house));
    cycle=[...new Set([...valid,...Object.keys(labels).filter(houseAvailable)])].slice(0,3);
    selects.forEach((select,index)=>select.value=cycle[index]);
  }
  const storageKey = 'chart-house-cycle-v1:' + payload.source_sha256;
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved) && saved.length === 3 && new Set(saved).size === 3 && saved.every(key => key in labels)) cycle = saved;
  } catch (_) { /* Offline or restricted storage still allows session settings. */ }
  selects.forEach((select, index) => { select.value = cycle[index]; });

  function update() {
    const zodiacKey=current.zodiac==='sidereal'&&ayanamsa==='lahiri'?'sidereal_lahiri':current.zodiac;
    const next = bundle.variants[[zodiacKey,current.house,current.bound].join('|')];
    if (!next) throw new Error(explanation(current));
    payload = next;
    model = ChartView.adapt(payload,showOuter);
    if(natalBundle){const natal=natalBundle.variants[[zodiacKey,current.house,current.bound].join('|')];if(!natal)throw new Error('本命盘缺少对应的盘面配置。');globalThis.ChartNatalPayload=natal;globalThis.ChartNatalModel=ChartView.adapt(natal,showOuter);model.angles=globalThis.ChartNatalModel.angles;model.houses=globalThis.ChartNatalModel.houses;model.lots=globalThis.ChartNatalModel.lots;model.natalPoints=globalThis.ChartNatalModel.planets.map(p=>({...p,key:'natal_'+p.key,originalKey:p.key,natalPoint:true,label:p.label+'·本命'}));if(globalThis.ChartReturnMode&&globalThis.ChartReturnSingle){globalThis.ChartReturnNatalModel=globalThis.ChartNatalModel;globalThis.ChartNatalModel=null;const own=ChartView.adapt(payload,showOuter);model.angles=own.angles;model.houses=own.houses;model.lots=own.lots;model.natalPoints=[];}}
    if (selected!==null && !selected.startsWith('lot_') && !['lilith','north_node','south_node','prenatal_moon','chiron','ceres','pallas','juno','vesta'].includes(selected) && !model.planets.concat(model.angles,model.lots,model.natalPoints||[],model.virtualPoints||[],model.ringPoints||[]).some(p=>p.key===selected)) selected='sun';
    document.getElementById('chart-data').textContent = JSON.stringify(payload);
    document.getElementById('legend').innerHTML = ChartView.lotLegend((globalThis.ChartNatalPayload||payload).facts);
    zodiacButton.textContent = current.zodiac === 'tropical' ? '回归黄道' : '恒星黄道';
    zodiacButton.title = current.zodiac === 'tropical' ? '切换至恒星黄道 · ' + bundle.ayanamsa_options[ayanamsa] : bundle.ayanamsa_options[ayanamsa]+' · 切换至回归黄道';
    houseButton.textContent = labels[current.house].split('（')[0];
    houseButton.title = '切换至' + labels[cycle[(cycle.indexOf(current.house) + 1) % cycle.length]];
    boundSelect.value=current.bound;
    ayanamsaSelect.value=ayanamsa;
    syncChoices();
    syncAvailability();
    planetsButton.textContent=showOuter?'七星＋三王':'传统七星';
    planetsButton.title=showOuter?'隐藏天王星、海王星、冥王星':'显示天王星、海王星、冥王星';
    planetsButton.setAttribute('aria-pressed',String(showOuter));
    render();
    layoutActions();
  }
  planetsButton.addEventListener('click',()=>{showOuter=!showOuter;update();});
  function choose(next,nextAyanamsa=ayanamsa){
    if(!available(next,nextAyanamsa)){status.textContent=explanation(next,nextAyanamsa);ayanamsaSelect.value=ayanamsa;boundSelect.value=current.bound;syncChoices();return false;}
    Object.assign(current,next);ayanamsa=nextAyanamsa;status.textContent='';update();return true;
  }
  ayanamsaSelect.addEventListener('change',()=>choose(current,ayanamsaSelect.value));
  zodiacButton.addEventListener('click', () => {
    choose({...current,zodiac:current.zodiac==='tropical'?'sidereal':'tropical'});
  });
  houseButton.addEventListener('click', () => {
    choose({...current,house:cycle[(cycle.indexOf(current.house)+1)%cycle.length]});
  });
  boundSelect.addEventListener('change',()=>choose({...current,bound:boundSelect.value}));
  document.getElementById('cycle-form').addEventListener('submit', event => {
    event.preventDefault();
    const next = selects.map(select => select.value);
    if (new Set(next).size !== 3) { status.textContent = '请选择三种不同的宫位制。'; return; }
    if(next.some(house=>!houseAvailable(house))){status.textContent='所选宫位制在此时刻不可用，请手动更换。';return;}
    cycle = next;
    let saved = true;
    try { localStorage.setItem(storageKey, JSON.stringify(cycle)); } catch (_) { saved = false; }
    update();
    status.textContent = saved ? '' : '当前浏览器无法保存，切换顺序仅应用于本次页面。';
  });
  globalThis.ChartMethodState={get:()=>JSON.parse(JSON.stringify({current,ayanamsa,cycle,showOuter})),available:(s)=>available(s.current,s.ayanamsa),set:s=>{if(!available(s.current,s.ayanamsa)){status.textContent=explanation(s.current,s.ayanamsa);return false;}cycle=[...s.cycle];showOuter=s.showOuter;return choose(s.current,s.ayanamsa);},rebase:next=>{const key=keyFor(current);if(!next.variants[key])throw Error(next.unavailable_variants?.[key]?.reason||'当前宫位制在查询时刻不可用，请先手动更换。');bundle=next;document.getElementById('chart-variants').textContent=JSON.stringify(next);update();}};
  update();
})();
