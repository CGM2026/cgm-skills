// 工作稿：复用设计图比例版中的干支周期、月序及藏干顺序。
'use strict';
const fs=require('node:fs');
const crypto=require('node:crypto');
const stems='甲乙丙丁戊己庚辛壬癸',branches='子丑寅卯辰巳午未申酉戌亥';
const elements={wood:'甲乙寅卯',fire:'丙丁巳午',earth:'戊己辰戌丑未',metal:'庚辛申酉',water:'壬癸亥子'};
const hidden={申:['庚','壬','戊'],戌:['戊','辛','丁'],丑:['己','癸','辛'],午:['丁','己'],酉:['辛'],未:['己','丁','乙'],巳:['丙','戊','庚'],辰:['戊','乙','癸'],卯:['乙'],寅:['甲','丙','戊'],子:['癸'],亥:['壬','甲']};
const terms=['立春','惊蛰','清明','立夏','芒种','小暑','立秋','白露','寒露','立冬','大雪','小寒'];
const mod=(n,d)=>(n%d+d)%d;
const cycle=n=>stems[mod(n,10)]+branches[mod(n,12)];
const yearGz=y=>cycle(y-1984);
const monthGz=(y,m)=>stems[mod((mod(y-1984,10)%5)*2+2+m,10)]+branches[(2+m)%12];
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const assert=(v,m)=>{if(!v)throw Error(m)};
function validateCoordinates(location){
 if(location===undefined)return;
 assert(location&&typeof location==='object'&&!Array.isArray(location),'Birth location must be an object');
 for(const [key,limit] of [['longitude',180],['latitude',90]])if(Object.hasOwn(location,key))assert(typeof location[key]==='number'&&Number.isFinite(location[key])&&Math.abs(location[key])<=limit,'Invalid birth.location.'+key+'; provide a finite number within ±'+limit);
}
function prepareBirth(birth,conventions){
 const cal=require('./calendar.cjs'),b=structuredClone(birth),c=require('./conventions.cjs').normalizeConventions(conventions,{allowProvidedApparent:true});
 assert(b&&typeof b.time==='string'&&/^\d{2}:\d{2}(:\d{2})?$/.test(b.time)&&!b.timeCandidates?.length,'Provide one confirmed birth time');
 assert(b.fold===undefined||b.fold===0||b.fold===1,'fold must be 0 or 1');
 assert(['male','female'].includes(b.sex),'birth.sex needed for luck direction');
 validateCoordinates(b.location);
 assert(b.location&&typeof b.location.name==='string'&&typeof b.timezone==='string'&&b.timezone,'Birth location and timezone required');
 assert(['solar','lunar','julian'].includes(b.calendar),'Unsupported calendar');
 if(b.calendar==='solar'&&Number(b.date?.slice(0,4))<1583)assert(b.dateStyle==='proleptic-gregorian','Before 1583 identify dateStyle=proleptic-gregorian or calendar=julian; do not guess historical calendar');
 if(b.calendar==='lunar'&&b.lunar?.year<1901)assert(b.calendarBasis==='icu-proleptic','Historical lunar input requires calendarBasis=icu-proleptic; historical dynasty calendars need independent conversion');
 const solarDate=b.calendar==='solar'?(cal.solarDate(b.date),b.date):b.calendar==='julian'?cal.julianToSolar(b.date):cal.toSolar(b.lunar);
 assert(b.solarDate===undefined||b.solarDate===solarDate,'Normalized solarDate contradicts original birth calendar/date');
 b.solarDate=solarDate;
 const normalizedYear=Number(b.solarDate.slice(0,4));
 assert(normalizedYear>=1&&normalizedYear<=2099,'Normalized Gregorian birth year must be 0001–2099');
 if(b.utcOffsetSeconds!==undefined)assert(Number.isInteger(b.utcOffsetSeconds)&&Math.abs(b.utcOffsetSeconds)<86400&&typeof b.timeSource==='string'&&b.timeSource.trim(),'Explicit UTC offset needs integer seconds and timeSource');
 if(normalizedYear<1901)assert(typeof b.timeSource==='string'&&b.timeSource.trim(),'Historical birth needs timeSource describing the time basis; IANA alone is not historical evidence');
 if(c.solarTime==='provided-apparent')assert(typeof b.correctedLocal==='string'&&b.correctedLocal.trim()&&typeof b.correctionSource==='string'&&b.correctionSource.trim(),'Provided correction needs correctedLocal and correctionSource strings');
 const evidence=b.timeEvidence||{kind:'user-provided',precision:'unspecified'};
 assert(['user-provided','recorded','approximate','rectified','representative'].includes(evidence.kind),'Invalid timeEvidence.kind');
 assert(['unspecified','second','minute','hour','shichen'].includes(evidence.precision),'Invalid timeEvidence.precision');
 if(['approximate','rectified','representative'].includes(evidence.kind))assert(typeof evidence.source==='string'&&evidence.source.trim(),'Estimated time needs timeEvidence.source');
 b.timeEvidence=evidence;
 const birthLunar=cal.toLunar(b.solarDate);
 const dateYears=Object.fromEntries([-2,-1,0,1,2].map(offset=>{const date=new Date(Date.parse(b.solarDate+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);return [date,cal.toLunar(date).year];}));
 const yearEvidence={lunarYear:birthLunar.year,dateBasis:b.solarDate,newYearDate:cal.toSolar({year:Number(b.solarDate.slice(0,4)),month:1,day:1,isLeapMonth:false}),dateYears,boundaryClock:'selected-solar-time-zi-23',source:'Node ICU Chinese calendar; selected pillar clock date advanced at 23:00'};
 return {b,c,birthLunar,normalizedYear,yearEvidence};
}
function runAstronomy(request,includeTermYears=true){
 const path=require('node:path'),cp=require('node:child_process');
 const runtime=require('./local-installation.cjs').python();
 const {b,c,yearEvidence}=request;
 const result=cp.spawnSync(runtime,['-X','utf8',path.join(__dirname,'astronomy.py')],{input:JSON.stringify({birth:b,conventions:c,yearEvidence,includeTermYears}),encoding:'utf8',env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},maxBuffer:16*1024*1024,windowsHide:true});
 assert(!result.error&&result.status===0,result.error?.message||result.stderr||'Astronomy process failed');
 return JSON.parse(result.stdout);
}
const verifyComputedFacts=require('./fact-check.cjs').createVerifier({prepareBirth,runAstronomy});
function validate(d){
 assert(d.schema==='cgm-bazi-chart/1','Unsupported chart schema');
 assert(d.status==='working-draft','Only working-draft supported');
 assert(['historical-fixture','computed-working-draft','computed-unknown-time','externally-verified'].includes(d.calculation.status),'Missing calculation evidence status');
 assert(Array.isArray(d.calculation.sources)&&d.calculation.sources.length>0,'Missing sources');
 assert(Array.isArray(d.calculation.limitations),'Missing limitations');
 assert(d.person&&typeof d.person.name==='string'&&d.person.name.length>0,'Missing name');
 validateCoordinates(d.person.birth?.location);
 for(const k of ['locationLabel','dateLabel'])assert(typeof d.person[k]==='string','Missing person '+k);
 assert(Number.isInteger(d.person.birthYear),'Missing birthYear');
 assert(d.rules&&['legacy-display-v1','solar-jie-v1'].includes(d.rules.id),'Unsupported rules profile');
 assert(d.natal.length===4,'Exactly four natal pillars required');
 const gz=s=>typeof s==='string'&&Array.from({length:60},(_,i)=>cycle(i)).includes(s);
 const unknown=d.person.birth?.timeStatus==='unknown';
 d.natal.forEach((p,i)=>assert(unknown&&i===3?p.stem===null&&p.branch===null&&p.status==='unknown':gz(p.stem+p.branch),'Invalid natal ganzhi'));
 if(unknown){assert(d.calculation.status==='computed-unknown-time'&&d.person.birth.time===null&&d.luckExact===null&&d.astronomy.birthJDUT===null&&d.luckEstimate?.status==='reference-only','Unknown birth time must not carry precise birth/luck claims');}
 assert(['男','女','主'].includes(d.dayLabel),'Invalid day label');
 assert(Object.keys(d.godMap).length===10,'Ten-god mapping incomplete');
 for(const s of stems)assert(typeof d.godMap[s]==='string'&&[...d.godMap[s]].length===1&&'比劫食伤才财杀官枭印'.includes(d.godMap[s]),'Invalid god map');
 assert(d.branchHidden&&Object.keys(d.branchHidden).length===12&&Object.entries(hidden).every(([b,hs])=>JSON.stringify(d.branchHidden[b])===JSON.stringify(hs)),'Hidden-stem profile mismatch');
 assert(d.elements&&Object.keys(d.elements).length===5&&Object.entries(elements).every(([k,v])=>d.elements[k]===v),'Element profile mismatch');
 assert(d.luck.length>0,'Missing luck periods');
 d.luck.forEach((p,i)=>{assert(Number.isInteger(p.start)&&Number.isInteger(p.end)&&p.end>=p.start&&gz(p.gz)&&typeof p.label==='string'&&typeof p.age==='string','Invalid luck period');if(i)assert(p.start===d.luck[i-1].end+1,'Luck periods overlap or gap');});
 const min=d.luck[0].start,max=d.luck.at(-1).end;
 assert(d.years.length===max-min+1,'Incomplete year coverage');
 d.years.forEach((y,i)=>{assert(y.year===min+i&&gz(y.gz),'Invalid year row');assert(y.months.length===12,'Incomplete months');y.months.forEach((m,j)=>assert(m.index===j&&gz(m.gz)&&m.term===terms[j],'Invalid month row'));});
 assert(Number.isInteger(d.initial.year)&&d.initial.year>=min&&d.initial.year<=max&&Number.isInteger(d.initial.month)&&d.initial.month>=0&&d.initial.month<12,'Invalid initial selection');
 assert(d.rules.age==='selected-year-minus-birth-year'&&d.rules.timeResolution==='symbolic-year','Unsupported timeline convention');
 if(d.calculation.status==='computed-working-draft'){
  assert(d.luckExact?.periods?.length===10&&Number.isFinite(d.astronomy?.birthJDUT),'Missing precise calculation evidence');
  d.luckExact.periods.forEach((p,i)=>{assert(gz(p.gz)&&Number.isFinite(Date.parse(p.startUTC))&&Date.parse(p.endUTC)>Date.parse(p.startUTC),'Invalid exact luck period');if(i)assert(p.startUTC===d.luckExact.periods[i-1].endUTC,'Exact luck gap');});
  for(const y of d.years)for(const m of y.months)assert(Number.isFinite(Date.parse(m.startUTC))&&Number.isFinite(m.solarLongitude),'Missing solar term evidence');
 }
 require('./validate-details.cjs').validateDetails(d);
 verifyComputedFacts(d);
 return d;
}
function historicalFixture(source){
 const original=fs.readFileSync(source,'utf8');
 assert(original.includes("const personName='示例'"),'Display fixture requires the neutral release template');
 const d={schema:'cgm-bazi-chart/1',status:'working-draft',person:{name:'虚构展示示例',locationLabel:'示例地点',dateLabel:'虚构展示资料　1990.06.15',birthYear:1990,birth:{calendar:'solar',date:'1990-06-15',time:null,status:'synthetic-display-only'}},calculation:{status:'historical-fixture',sources:[{path:require('node:path').basename(source),sha256:sha(original),scope:'中性模板展示夹具，不是出生计算证据'}],limitations:['干支与推运为合成展示数据，不代表任何真实人物或此日期的计算结果','大运以整年切换，不代表精确交运日','年龄为年份差，非按生日计算的实足周岁']},rules:{id:'legacy-display-v1',age:'selected-year-minus-birth-year',timeResolution:'symbolic-year'},natal:[{stem:'庚',branch:'午'},{stem:'壬',branch:'午'},{stem:'甲',branch:'子'},{stem:'庚',branch:'午'}],dayLabel:'男',godMap:{甲:'比',乙:'劫',丙:'食',丁:'伤',戊:'才',己:'财',庚:'杀',辛:'官',壬:'枭',癸:'印'},branchHidden:hidden,elements,luck:[{start:1990,end:1994,gz:'甲子',label:'示例',age:'0岁'},...Array.from({length:10},(_,i)=>({start:1995+10*i,end:2004+10*i,gz:cycle(19+i),label:String(1995+10*i),age:(5+10*i)+'岁'}))],initial:{year:2005,month:0},extensions:{}};
 d.years=Array.from({length:d.luck.at(-1).end-d.luck[0].start+1},(_,i)=>{const y=d.luck[0].start+i;return {year:y,gz:yearGz(y),months:terms.map((term,m)=>({index:m,term,gz:monthGz(y,m)}))}});
 return validate(d);
}
function calculateBirth(input){
 assert(input&&input.schema==='cgm-bazi-birth/1','Expected cgm-bazi-birth/1');
 if(input.birth&&(input.birth.time==null||input.birth.timeStatus==='unknown')){
  assert(input.birth.time==null,'Unknown time must be omitted or null');
  assert(!input.birth.timeCandidates?.length,'Candidate times require explicit comparison, not unknown-time mode');
  assert(!input.birth.correctedLocal,'Unknown time cannot include a precise correctedLocal');
  assert(input.conventions?.smallLuck!=='hour-pillar','时辰不详，不能采用依赖时柱的时柱起小运算法');
  assert(!input.conventions?.solarTime||input.conventions.solarTime==='civil','Unknown-time date reference currently supports civil time only');
  const reference=structuredClone(input);reference.birth.time='12:00';delete reference.birth.timeStatus;
  reference.conventions={...reference.conventions,solarTime:'civil'};
  const d=calculateBirth(reference);
  d.person.birth.time=null;d.person.birth.timeStatus='unknown';
  d.natal[3]={stem:null,branch:null,status:'unknown'};
  d.calculation.status='computed-unknown-time';
  d.person.birth.timeEvidence={kind:'unknown',precision:'unknown'};
  d.calculation.timeEvidence={kind:'unknown',precision:'unknown',interpretation:'出生时间未知，内部正午仅作日期参照'};
  d.luckEstimate={status:'reference-only',referenceTime:'12:00',reason:'时辰不详，仅用于临时推运浏览，不是实际出生时刻或精确交运结果',referenceResult:d.luckExact};
  d.luckExact=null;
  d.astronomy={birthJDUT:null,status:'date-reference-only',referenceTime:'12:00',referenceResult:d.astronomy};
  d.calculation.limitations.unshift('时辰不详：时柱及相关十神不计算，显示〇；未知时柱不参与通根、透干或显色匹配','日柱按所给公历日期取值；23点换日的晚子时可能属于次日日柱，年/月交节日也可能存在候选','推运浏览按12:00日期参照生成，起运仅供参考，不能作为精确交运；参考时刻并非补填的出生时间');
  d.rules.unknownTime={display:'〇',pillar:null,referenceTime:'12:00',precision:'date-reference-only'};
  d.provenance.evidenceStatus='date-reference-only';
  d.provenance.inputSha256=sha(JSON.stringify({birth:d.person.birth,conventions:d.rules.conventions}));
  return validate(d);
 }
 const path=require('node:path'),cal=require('./calendar.cjs');
 const request=prepareBirth(input.birth,input.conventions),{b,c,birthLunar,normalizedYear}=request;
 const evidence=b.timeEvidence;
 const a=runAstronomy(request),lunar=birthLunar,birthYear=Number(b.solarDate.slice(0,4));
 const firstYear=Number(a.luckExact.startLocal.slice(0,4));
 const luck=[];
 // Annual rows are a projection. Small-luck ages advance at lunar new year.
 const nominalBirthYear=a.yearBoundaryEvidence.lunarCalendar.lunarYear;
 const smallLuckForYear=year=>require('./small-luck.cjs').smallLuckForYear({year,nominalBirthYear,method:c.smallLuck,sex:b.sex,natal:a.natal});
 for(let year=birthYear;year<firstYear;year++)luck.push({start:year,end:year,gz:smallLuckForYear(year),label:String(year),age:(year-nominalBirthYear+1)+'岁',kind:'small-luck-'+c.smallLuck});
 for(const p of a.luckExact.periods){const start=Number(p.startLocal.slice(0,4));luck.push({start,end:start+9,gz:p.gz,label:String(start),age:(start-birthYear)+'岁',exactPeriodIndex:p.index});}
 const years=Array.from({length:luck.at(-1).end-birthYear+1},(_,i)=>{const year=birthYear+i;return {year,gz:yearGz(year),months:a.termYears[year].map(t=>({index:t.index,term:t.term,gz:monthGz(year,t.index),startUTC:t.utc,solarLongitude:t.solarLongitude,residualDegrees:t.residualDegrees}))}});
 const d={schema:'cgm-bazi-chart/1',status:'working-draft',person:{name:input.name||'命例',locationLabel:b.location.name,dateLabel:cal.label(lunar)+'　'+b.solarDate.replace(/-/g,'.'),birthYear,birth:{...b,status:'user-provided'},lunar},calculation:{status:'computed-working-draft',sources:[{url:'https://www.astro.com/swisseph/swephprg.htm',scope:'节气和均时差 API'},{url:'https://unicode-org.github.io/icu/userguide/datetime/calendar/',scope:'ICU 中国历法'},{url:'https://raw.githubusercontent.com/6tail/lunar-python/master/lunar_python/Lunar.py',scope:'日序锚点与干支规则对照'},{url:'https://raw.githubusercontent.com/6tail/lunar-python/master/lunar_python/eightchar/Yun.py',scope:'三日一年分钟法与顺逆规则对照'},{path:'cgm-bazi-chart/scripts/chart.cjs',sha256:sha(fs.readFileSync(__filename)),scope:'本轮计算适配'},{path:'cgm-bazi-chart/scripts/astronomy.py',sha256:sha(fs.readFileSync(path.join(__dirname,'astronomy.py'))),scope:'本轮天文及起运计算'}],limitations:['起运默认分钟折算至天；日精度边界中的零点为日期容器，不表示预测具体交运小时','临时页面按交运所在年份作整年投影；精确交运时刻保留于 luckExact，不应据此页面判断交运日','未交运栏以月柱作参照，不是小运计算','calendarView和smallLuck采用春节子初加岁的虚岁；旧luck.age仅为兼容年份差，不供当前页面使用','ICU 农历为 UTC+8 中国历法，远期临界日期需独立历表复核',...(c.solarTime==='provided-apparent'?['太阳时采用用户提供值，未按经度独立复算']:[])]},rules:{id:'solar-jie-v1',age:'selected-year-minus-birth-year',timeResolution:'symbolic-year',conventions:c,conventionsStatus:'working-draft'},natal:a.natal,dayLabel:b.sex==='female'?'女':'男',godMap:a.godMap,branchHidden:hidden,elements,luck,years,luckExact:a.luckExact,astronomy:{...a,termYears:undefined,luckExact:undefined,natal:undefined,godMap:undefined},runtime:{...a.runtime,node:process.versions.node,icu:process.versions.icu},initial:input.initial||{year:Math.min(Math.max(new Date().getFullYear(),birthYear),luck.at(-1).end),month:0},extensions:{}};
 d.rules.smallLuck={method:c.smallLuck,...(c.smallLuck==='fixed-origin'?{male:'丙寅起，逐岁顺行',female:'壬申起，逐岁逆行'}:{origin:'出生时柱',firstAge:'一岁即按顺逆推进一位',direction:'所选年柱年干阴阳与性别，同大运顺逆'}),boundary:'春节子初',projection:'年度格表示该年春节后；交大运所在年沿用整年大运展示'};
 d.person.nominalBirthYear=nominalBirthYear;
 d.calculation.timeEvidence={...evidence,interpretation:'计算精度不代表出生资料精度，结果仅对应输入时刻'};
 d.luckExact.certainty=['approximate','rectified','representative'].includes(evidence.kind)||['hour','shichen'].includes(evidence.precision)?'conditional-on-estimated-time':'computed-for-input';
 if(d.luckExact.certainty==='conditional-on-estimated-time'){
  d.calculation.limitations.unshift('出生时间为近似、校正或时辰代表值；四柱及交运日期仅为该候选输入下的条件结果，不能宣称为已确认的精确出生排盘。');
  d.luckExact.warning='交运日期仅供该候选时刻参考，不是已确定的实际交运日期';
 }
 d.smallLuck={method:c.smallLuck,years:years.map(y=>({year:y.year,nominalAge:y.year-nominalBirthYear+1,gz:smallLuckForYear(y.year)}))};
 d.calculation.sources.push({url:'https://raw.githubusercontent.com/6tail/lunar-python/master/lunar_python/eightchar/XiaoYun.py',scope:'时柱起小运一岁推进一位的实现对照；加岁边界沿用本套件春节子初'});
 if(c.luckStart==='three-days-year-shichen')d.calculation.limitations.push('时辰法按民用日期与时辰序号差折算，不计时辰内分钟；23时并入当日末段，交运日期容器不表示预测时刻精度');
 if(c.luckStart==='three-days-year-minute')d.calculation.limitations.push('余分钟折算至小时是算法单位，不代表出生资料或实际预测精确到小时');
 d.calculation.limitations=d.calculation.limitations.filter(s=>s!=='未交运栏以月柱作参照，不是小运计算');
 d.calculation.limitations.push('小运年度格以该年春节后为代表；交大运所在年仍按整年投影，非逐日小运切换');
 d.calculation.dateRange={minYear:1,maxYear:2099,calendar:'proleptic-gregorian',originalCalendar:b.calendar,lunarModel:'ICU Chinese calendar, fixed UTC+8, not reconstructed dynasty calendar'};
 if(normalizedYear<1901)d.calculation.limitations.push('历史命例按统一历法模型反推：ICU农历不等于当时颁行历法；历史时制取输入依据，古代节气与均时差受ΔT模型及史料误差影响，临界时刻需候选比较');
 d.calendarView=require('./calendar-view.cjs').calendarView(d,a.termYears[years.at(-1).year+1][0].utc);
 d.protocolRevision=2;
 d.provenance={engineVersion:'2026.10.02-release-candidate',inputSha256:sha(JSON.stringify({birth:d.person.birth,conventions:d.rules.conventions})),validation:'structural-semantic-and-derived-facts',evidenceStatus:'computed-for-input'};
 return validate(d);
}
module.exports={validate,historicalFixture,calculateBirth,cycle,yearGz,monthGz,hidden,sha};
if(require.main===module){
 try{
  const args=process.argv.slice(2),settingsIndex=args.indexOf('--settings');
  const settingsPath=settingsIndex<0?undefined:args[settingsIndex+1];
  if(settingsIndex>=0){if(!settingsPath)throw Error('--settings 需要文件路径');args.splice(settingsIndex,2);}
  const manual=args.includes('--manual');if(manual)args.splice(args.indexOf('--manual'),1);
  const [mode,input,output]=args;
  const d=mode==='historical-fixture'?historicalFixture(input):mode==='validate'?validate(JSON.parse(fs.readFileSync(input,'utf8'))):mode==='birth'?calculateBirth(require('./preferences.cjs').resolveInput(JSON.parse(fs.readFileSync(input,'utf8')),{settingsPath,manual})):(()=>{throw Error('Usage: chart.cjs historical-fixture|validate|birth input [output] [--settings FILE] [--manual]')})();
  if(output)fs.writeFileSync(output,JSON.stringify(d,null,2));console.log(JSON.stringify({schema:d.schema,status:d.calculation.status}));
 }catch(e){console.error(JSON.stringify({ok:false,code:e.code||'CALCULATION_FAILED',message:e.message,...e.details}));process.exitCode=e.code?2:1;}
}
