(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./cgm-hellenistic-chart-visualization/assets/chart-view.js'),require('./point-aspects.js'));else root.ChartView=factory(root.ChartView,root.PointAspects);})(globalThis,function(base,aspects){
 const names={chiron:'凯龙星',ceres:'谷神星',pallas:'智神星',juno:'婚神星',vesta:'灶神星',lilith:'莉莉丝',north_node:'北交点',south_node:'南交点',prenatal_moon:'朔望点',sun:'太阳',moon:'月亮',mercury:'水星',venus:'金星',mars:'火星',jupiter:'木星',saturn:'土星',uranus:'天王星',neptune:'海王星',pluto:'冥王星',asc:'上升点',dsc:'下降点',mc:'中天',ic:'天底',fortune:'福点',spirit:'精神点'};
 const houses={whole_sign:'整宫制',porphyry:'波菲利制',placidus:'普拉西德制',equal:'等宫制',koch:'科赫制',regiomontanus:'芮氏制',alcabitius:'阿卡比特制'};
 const glyphs={sun:'☉',moon:'☽',mercury:'☿',venus:'♀',mars:'♂',jupiter:'♃',saturn:'♄'};
 const domicile=['mars','venus','mercury','moon','sun','mercury','venus','mars','jupiter','saturn','saturn','jupiter'];
 const exaltation=['sun','moon',null,'jupiter',null,'mercury','saturn',null,null,'mars',null,'venus'];
 const triplicities=[['sun','jupiter','saturn'],['venus','moon','mars'],['saturn','mercury','jupiter'],['venus','mars','moon']];
 const faces=['mars','sun','venus','mercury','moon','saturn','jupiter'];
 function dignities(p,sect='day'){
  const sign=p.sign_index,trip=[...triplicities[sign%4]];
  if(sect==='night')[trip[0],trip[1]]=[trip[1],trip[0]];
  return [['住所',[p.domicile_ruler]],['擢升',[exaltation[sign]]],['三分',trip],['界',[p.bound_ruler]],['面',[faces[(sign*3+Math.min(2,Math.floor(p.degree_in_sign/10)))%7]]],['落陷',[domicile[(sign+6)%12]]],['失势',[exaltation[(sign+6)%12]]]];
 }
 function dignityTable(p,model){const entries=dignities(p,model?.sect);return `<div class="dignity-scroll"><table class="dignity-table" aria-label="${base.escape(p.customLot?p.label:(names[p.key]||p.label))}所在位置的尊贵主星"><thead><tr>${entries.map(([label])=>`<th data-ruler-role="${({住所:'domicile',界:'bound',三分:'triplicity'})[label]||''}" scope="col"${label==='三分'?' title="多罗修斯：按本盘昼夜排列第一、第二、参与主星"':label==='面'?' title="迦勒底顺序，每十度一面"':''}>${label}</th>`).join('')}</tr></thead><tbody><tr>${entries.map(([label,keys])=>`<td>${keys.map((key,i)=>key?`<span data-dignity-planet="${key}" data-ruler-role="${({住所:'domicile',界:'bound',三分:'triplicity'})[label]||''}" class="dignity-glyph${key===p.key?' is-self':''}" title="${names[key]}${label==='三分'?' · '+['第一主星','第二主星','参与主星'][i]:''}" aria-label="${names[key]}">${glyphs[key]}</span>`:'<span class="dignity-empty" aria-label="无">—</span>').join('')}</td>`).join('')}</tr></tbody></table></div>`;}
 const signNames='白羊座 金牛座 双子座 巨蟹座 狮子座 处女座 天秤座 天蝎座 射手座 摩羯座 水瓶座 双鱼座'.split(' ');
 const signGlyphs='♈ ♉ ♊ ♋ ♌ ♍ ♎ ♏ ♐ ♑ ♒ ♓'.split(' ');
 const signKeys='aries taurus gemini cancer leo virgo libra scorpio sagittarius capricorn aquarius pisces'.split(' ');
 const signedPosition=p=>base.position(p).replace(/^([^ ]+)/,'$1 '+signGlyphs[p.sign_index]);
 const namedRuler=key=>names[key]+' '+glyphs[key];
 function ringPoints(payload){return signKeys.flatMap((sign,i)=>[{key:'sign_'+i,kind:'sign',label:signNames[i],sign_index:i,degree_in_sign:0,domicile_ruler:domicile[i]},...(payload.bound_table[sign]||[]).map(([ruler,start,end],j)=>({key:'bound_'+i+'_'+j,kind:'bound',label:signNames[i]+' · '+names[ruler]+'界',sign_index:i,ruler,start,end}))]);}
 function ringDetail(p,model){
  const esc=base.escape,symbolize=value=>esc(value).replace(/[♈-♓☉☽☿♀♂♃♄]/gu,glyph=>'<span class="astro-glyph'+(signGlyphs.includes(glyph)?' zodiac-glyph':'')+'">'+glyph+'</span>'),row=(k,v)=>'<dt>'+esc(k)+'</dt><dd>'+symbolize(v)+'</dd>';
  const ruler=model.planets.find(x=>x.key===(p.kind==='sign'?p.domicile_ruler:p.ruler));
  const rows=p.kind==='bound'?row('范围',p.start+'° ≤ 度数 ＜ '+p.end+'°')+row('界主',namedRuler(ruler.key)+' · 落座 '+signedPosition(ruler)):row('住所主',namedRuler(ruler.key))+row('落座',signedPosition(ruler));
  return '<header class="detail-heading"><h2 class="ring-title">'+esc(p.label)+'</h2></header><div class="point-summary"><dl'+(p.kind==='bound'?' class="bound-summary"':'')+'>'+rows+'</dl></div>';
 }
 function positionAt(longitude){const normalized=((longitude%360)+360)%360,index=Math.floor(normalized/30),minutes=Math.round((normalized%30)*60),degree=Math.floor(minutes/60);return signNames[(index+(degree===30?1:0))%12]+' '+(degree===30?0:degree)+'°'+String(minutes%60).padStart(2,'0')+'′';}
 function houseDetail(p,model){
  if(globalThis.ChartPageMode==='transit'&&globalThis.ChartNatalModel)model=globalThis.ChartNatalModel;
  const start=p.start,end=p.end;
  const planets=model.planets.filter(planet=>{const longitude=((planet.longitude-start)%360+360)%360;return longitude<end-start-1e-7;}).sort((a,b)=>((a.longitude-start+360)%360)-((b.longitude-start+360)%360));
  return '<header class="detail-heading"><h2 class="ring-title">第 '+p.number+' 宫</h2></header><div class="point-summary"><dl><dt>宫头</dt><dd>'+base.escape(positionAt(start))+'</dd><dt>宫末</dt><dd>'+base.escape(positionAt(end))+'</dd></dl></div><div class="house-contents"><h3>宫内星体</h3>'+(planets.length?'<ul>'+planets.map(planet=>'<li><span>'+base.escape(names[planet.key]||planet.label)+'</span><span>'+base.escape(positionAt(planet.longitude))+'</span></li>').join('')+'</ul>':'<p>此宫没有显示的星体</p>')+'</div>';
 }
 function aspectDetail(p,model){
  const from=[...model.planets,...model.angles,...model.lots].find(x=>x.key===p.from),to=model.planets.find(x=>x.key===p.to),r=p.result;
  if(!from||!to)return '';
  const row=(label,value)=>'<dt>'+label+'</dt><dd>'+base.escape(value)+'</dd>';
  return '<section class="aspect-detail"><header class="detail-heading"><h2 class="ring-title">'+base.escape(p.label)+'</h2></header><p class="aspect-participants">'+base.escape(from.label)+' · '+base.escape(to.label)+'</p><div class="point-summary"><dl>'+row('出入',r.phase==='入'?'入相位':r.phase==='出'?'出相位':r.phase==='精准'?'精准':'—')+row('距精准',aspects.degrees(r.orb))+'</dl></div></section>';
 }
 function adapt(payload,outer=false){const model=base.adapt(payload);if(outer)model.planets.push(...(payload.outer_planets||[]).map(p=>({...p,label:names[p.key]})));model.houseLabel=houses[model.settings.house_system];model.sect=payload.facts.solar_condition.sect;model.ringPoints=ringPoints(payload);return model;}
 const expandedAspects=new Set(),aspectModes=new Map();
 function setAspectMode(key,mode){if(['whole','light','modern'].includes(mode))aspectModes.set(key,mode);}
 function setAspectExpanded(key,open){if(open)expandedAspects.add(key);else expandedAspects.delete(key);}
 function aspectTable(p,model){
  const mode=globalThis.ChartAspectState?.get().mode||aspectModes.get(p.key)||'whole';
  const speed=Number.isFinite(p.speed_longitude_per_day)?p.speed_longitude_per_day:0;
  const rank=r=>r.orb===null?3:r.phase==='精准'||r.phase==='入'?0:r.phase==='出'?1:2;
  const limits=globalThis.ChartAspectState?.get().limits;
  const rows=model.planets.filter(q=>q.key!==p.key).map(q=>({q,r:aspects.measure(p,q,speed,mode,limits)})).filter(({r})=>globalThis.ChartAspectState?.allows(mode,r.name)??!['无相位','不合意'].includes(r.name)).sort((a,b)=>rank(a.r)-rank(b.r)||(a.r.orb??Infinity)-(b.r.orb??Infinity)).map(({q,r})=>'<tr><td>'+base.escape(names[q.key]||q.label)+'</td><td>'+r.name+'</td><td>'+r.phase+'</td><td>'+aspects.degrees(r.orb)+'</td></tr>').join('');
  return '<details class="point-aspects" data-aspect-key="'+base.escape(p.key)+'" '+(expandedAspects.has(p.key)?'open':'')+'><summary><span class="aspect-disclosure">相位</span><button type="button" class="aspect-mode" data-mode-key="'+base.escape(p.key)+'" data-mode="'+mode+'" aria-label="切换相位类型">'+({whole:'整宫',light:'星光',modern:'现代'}[mode])+'</button></summary>'+(rows?'<table><thead><tr><th scope="col">行星</th><th scope="col">相位</th><th scope="col">出入</th><th scope="col" title="距离精确相位角度的差值">距精准</th></tr></thead><tbody>'+rows+'</tbody></table>':'<p class="aspect-empty">没有符合当前选择的相位</p>')+'</details>';
 }
 function detail(p,model){
  const natalPoint=p.natalPoint===true;
  if(natalPoint&&globalThis.ChartNatalModel){model=globalThis.ChartNatalModel;p={...p,key:p.originalKey};}
  if(p.kind==='house')return houseDetail(p,model);
  if(p.kind==='aspect')return aspectDetail(p,model);
  if(p.kind)return ringDetail(p,model);
  const esc=base.escape,row=(label,value)=>`<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`;
  const moving='retrograde' in p;
  const position=esc(base.position(p)).replace(/^([^ ]+)/,'<span class="position-sign">$1 <span class="astro-glyph zodiac-glyph">'+signGlyphs[p.sign_index]+'</span></span>')+(names[p.bound_ruler]?'<span class="position-bound"> · '+esc(names[p.bound_ruler])+'界 <span class="astro-glyph">'+glyphs[p.bound_ruler]+'</span></span>':'');
  return `<header class="detail-heading${p.formula?' lot-heading':''}"><h2><span class="point-name">${base.escape(p.customLot?p.label:(names[p.key]||p.label))}${globalThis.ChartPageMode==='transit'&&['sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto'].includes(p.key)?(natalPoint?'·本命':globalThis.ChartReturnMode?'·返照':'·行运'):''}</span>${p.formula?`<span class="point-note"><span class="note-text">无备注</span><button type="button" class="edit-note" aria-label="编辑备注" title="编辑备注（最多12个字）"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l4-1L20 7a2 2 0 0 0-3-3L5 16l-1 4Z"/></svg></button></span>`:''}</h2><p class="position">${position}</p></header>${dignityTable(p,model)}<div class="point-summary"><dl>${row(model?.houseLabel||'当前宫位制','第 '+p.primary_house+' 宫')}${row('黄经',p.longitude.toFixed(6)+'°')}${moving?row('运行',p.retrograde?'逆行 ℞':'顺行')+row('日运动',Number(p.speed_longitude_per_day.toFixed(6))+'° / 日'):''}${p.virtual_point?(p.key==='prenatal_moon'?row('朔望',p.syzygy_kind==='new'?'出生前新月':'出生前满月')+row('发生时间',p.syzygy_utc.replace('T',' ').replace('+00:00',' UTC')):row('位置口径',p.position_mode==='true'?'真位置':'平均位置')):''}${p.formula?row('公式',p.formula.toUpperCase())+row('昼夜翻转',(p.reverse??!!p.formula_system)?'是':'否'):''}</dl></div>${aspectTable(p,model)}`;
 }
 return {...base,adapt,detail,dignities,setAspectExpanded,setAspectMode};
});


