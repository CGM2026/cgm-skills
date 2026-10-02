(()=>{
 'use strict';
 const groups=[
  {key:'solarTime',title:'时间口径',page:'pillars',choices:[['apparent','真太阳时','按出生地经度与均时差换算。'],['mean','平太阳时','按出生地经度换算，不加入均时差。'],['civil','钟表时','采用出生资料记载的当地钟表时间。']]},
  {key:'dayBoundary',title:'子时排法',page:'pillars',choices:[['zi-23','子初换日','23 点起，日柱与时干均按次日计算。'],['midnight','零点换日','23 点至零点前，日柱与时干均按当日计算。'],['split-zi','早晚子时分排','23 点至零点前，日柱按当日，时干按次日日干计算。']]},
  {key:'yearBoundary',title:'年柱换年',page:'pillars',choices:[['lunar-new-year','春节子初','按所选时间口径，在除夕 23 点换年。'],['lichun-instant','立春交节','在立春的精确交节瞬间换年。']]},
  {key:'luckStart',title:'起运算法',page:'luck',choices:[['three-days-year-minute-day','分钟折算至天','按分钟折算起运年龄；不足一天的余数舍去。'],['three-days-year-minute','分钟折算至小时','余分钟继续折成小时；算法单位更细不代表预测更准确。'],['three-days-year-shichen','时辰折算法','按民用日期与时辰段折算，不计段内分钟：三日一年，一时辰十日。']]},
  {key:'smallLuck',title:'小运排法',page:'luck',choices:[['fixed-origin','固定起点','男命一岁丙寅顺排，女命一岁壬申逆排；春节子初加岁。'],['hour-pillar','时柱起算','以时柱为起点，按年干阴阳与性别定顺逆，一岁推进一位；春节子初加岁。']]}
 ];
 const recommended={solarTime:'apparent',dayBoundary:'zi-23',yearBoundary:'lunar-new-year',luckStart:'three-days-year-minute-day',smallLuck:'fixed-origin'};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let count=0;
 function controls(initial,{locked=false,unknown=false,corrected=false}={}){
  const prefix='bazi-settings-'+(++count);
  return '<nav class="algorithm-tabs" role="tablist" aria-label="排盘算法分类">'+[['pillars','四柱排法'],['luck','起运与小运']].map(([id,title],i)=>'<button type="button" id="'+prefix+'-tab-'+id+'" role="tab" aria-selected="'+(!i)+'" aria-controls="'+prefix+'-'+id+'" tabindex="'+(i?-1:0)+'" data-algorithm-tab="'+id+'">'+title+'</button>').join('')+'</nav>'+['pillars','luck'].map((page,i)=>'<section id="'+prefix+'-'+page+'" role="tabpanel" aria-labelledby="'+prefix+'-tab-'+page+'" data-algorithm-page="'+page+'" '+(i?'hidden':'')+'>'+groups.filter(g=>g.page===page).map(g=>{
   if(corrected&&g.key==='solarTime')return '';
   const value=initial[g.key]??recommended[g.key];
   return '<fieldset class="algorithm-group"><legend>'+g.title+'</legend><div class="algorithm-choices">'+g.choices.map(([v,title])=>'<label><input type="radio" name="'+g.key+'" value="'+v+'" '+(value===v?'checked ':'')+((locked||unknown&&(g.key==='solarTime'&&v!=='civil'||g.key==='smallLuck'&&v==='hour-pillar'))?'disabled ':'')+'><span>'+title+'</span></label>').join('')+'</div><p class="algorithm-help" data-help="'+g.key+'">'+esc(g.choices.find(c=>c[0]===value)?.[2]||'')+'</p></fieldset>';
  }).join('')+'</section>').join('');
 }
 function read(host){return Object.fromEntries([...host.querySelectorAll('.algorithm-group input:checked')].map(e=>[e.name,e.value]));}
 function bind(host,onChange=()=>{}){
  const tabs=[...host.querySelectorAll('[data-algorithm-tab]')];
  function activate(tab){tabs.forEach(t=>{const active=t===tab;t.setAttribute('aria-selected',String(active));t.tabIndex=active?0:-1;});host.querySelectorAll('[data-algorithm-page]').forEach(p=>p.hidden=p.dataset.algorithmPage!==tab.dataset.algorithmTab);}
  tabs.forEach((tab,i)=>{tab.onclick=()=>activate(tab);tab.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;activate(tabs[next]);tabs[next].focus();}};});
  host.querySelectorAll('.algorithm-group input').forEach(input=>input.addEventListener('change',()=>{const g=groups.find(g=>g.key===input.name);host.querySelector('[data-help="'+g.key+'"]').textContent=g.choices.find(c=>c[0]===input.value)[2];onChange(read(host));}));
 }
 async function home(host,token){
  const request=async(body)=>{const r=await fetch('/api/preferences',body?{method:'POST',headers:{'Content-Type':'application/json','X-Bazi-Token':token},body:JSON.stringify(body)}:undefined),v=await r.json();if(!r.ok)throw Error(v.error||'设置保存失败');return v;};
  let prefs=await request();
  function draw(){host.innerHTML='<h2>'+ (prefs.setupComplete?'新盘默认设置':'首次使用 · 排盘设置')+'</h2><p class="algorithm-intro">'+(prefs.setupComplete?'以下设置用于之后新建的命盘。':'已选中套件推荐口径。你可以直接确认，也可以调整后保存。')+'</p>'+controls(prefs.conventions)+'<footer><button type="button" data-save-preferences>'+(prefs.setupComplete?'保存默认设置':'确认并保存')+'</button></footer><p class="research-status" role="status"></p>';bind(host);host.querySelector('[data-save-preferences]').onclick=async()=>{const b=host.querySelector('[data-save-preferences]'),status=host.querySelector('[role=status]');b.disabled=true;try{prefs=await request({conventions:read(host),expectedRevision:prefs.revision,confirmed:true});draw();host.querySelector('[role=status]').textContent='已保存，以后的新盘使用这组设置。';}catch(e){status.textContent=e.message+'；刷新页面可读取最新设置。';}finally{b.disabled=false;}};}
  draw();
 }
 window.BaziAlgorithmSettings={groups,recommended,controls,read,bind,home};
})();
