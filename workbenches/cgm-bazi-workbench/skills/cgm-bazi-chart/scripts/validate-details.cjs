'use strict';
const cal=require('./calendar.cjs');
const stems='甲乙丙丁戊己庚辛壬癸',branches='子丑寅卯辰巳午未申酉戌亥';
const mod=(n,d)=>(n%d+d)%d;
const cycle=n=>stems[mod(n,10)]+branches[mod(n,12)];
const check=(v,m)=>{if(!v)throw Error('命盘一致性检查：'+m)};
function localInstant(text){
 // tzdb and historical sources can have offsets including seconds. JS Date.parse
 // rejects +00:57:44, so parse that offset explicitly without rounding it away.
 const m=typeof text==='string'&&text.match(/^(.*)([+-])(\d{2}):(\d{2}):(\d{2})$/);
 return m?Date.parse(m[1]+'Z')-(m[2]==='+'?1:-1)*(Number(m[3])*3600+Number(m[4])*60+Number(m[5]))*1000:Date.parse(text);
}
function validateDetails(d){
 const di=stems.indexOf(d.natal[2].stem),names=[['比','劫'],['食','伤'],['才','财'],['杀','官'],['枭','印']];
 for(let i=0;i<10;i++)check(d.godMap[stems[i]]===names[mod(Math.floor(i/2)-Math.floor(di/2),5)][i%2===di%2?0:1],'十神映射与日干不符');
 if(d.calculation.status==='historical-fixture')return d;
 const formulas=require('./chart.cjs');
 for(const y of d.years){
  check(y.gz===formulas.yearGz(y.year),'流年干支与年度符号索引不一致');
  y.months.forEach((m,j)=>check(m.gz===formulas.monthGz(y.year,j),'流月干支与独立节月年不一致'));
 }
 const birth=d.person.birth,unknown=birth?.timeStatus==='unknown',e=d.calculation.timeEvidence;
 const selected=require('./conventions.cjs').normalizeConventions(d.rules.conventions,{allowProvidedApparent:true});
 check(!unknown||selected.smallLuck!=='hour-pillar','未知时辰不能使用时柱起小运');
 if(e){
  if(unknown)check(e.kind==='unknown','未知时辰证据不一致');
  else{
   check(['user-provided','recorded','approximate','rectified','representative'].includes(e.kind),'时间证据类别无效');
   check(['unspecified','second','minute','hour','shichen'].includes(e.precision),'时间精度无效');
   const conditional=['approximate','rectified','representative'].includes(e.kind)||['hour','shichen'].includes(e.precision);
   if(['approximate','rectified','representative'].includes(e.kind))check(typeof e.source==='string'&&e.source.trim(),'候选时间缺来源');
   check(d.luckExact?.certainty===(conditional?'conditional-on-estimated-time':'computed-for-input'),'时间证据与交运确定性不一致');
   if(birth.timeEvidence)for(const k of ['kind','precision','source'])check(birth.timeEvidence[k]===e[k],'输入与输出时间证据不一致');
  }
 }
 const exact=unknown?d.luckEstimate?.referenceResult:d.luckExact;
 if(exact){
  const precision=exact.precision??(!d.protocolRevision&&d.rules.conventions?.luckStart==='three-days-year-minute'?'hour':undefined);
  check(['day','hour'].includes(precision),'交运精度无效');
  check(precision===(selected.luckStart==='three-days-year-minute'?'hour':'day'),'交运精度与起运算法不一致');
  if(exact.method!==undefined)check(exact.method===selected.luckStart,'起运算法证据不一致');
  if(exact.startDate!==undefined||d.protocolRevision)check(exact.startDate===exact.startLocal?.slice(0,10),'交运日期与本地边界不一致');
  check(exact.periods?.length===10,'精确大运须有十段');
  exact.periods.forEach((p,i)=>{
   check(p.index===i+1&&Number.isFinite(Date.parse(p.startUTC))&&Number.isFinite(Date.parse(p.endUTC))&&Date.parse(p.endUTC)>Date.parse(p.startUTC),'精确大运边界无效');
   check(Math.abs(localInstant(p.startLocal)-Date.parse(p.startUTC))<=1000&&Math.abs(localInstant(p.endLocal)-Date.parse(p.endUTC))<=1000,'大运本地时间与UTC不一致');
   if(i)check(p.startUTC===exact.periods[i-1].endUTC,'精确大运有缺口或重叠');
   if(exact.precision==='day')check(/T00:00:00/.test(p.startLocal)&&/T00:00:00/.test(p.endLocal),'日精度边界必须为日期容器');
  });
  const yearStem=d.natal[0].stem,forward=(stems.indexOf(yearStem)%2===0)===(birth.sex==='male');
  check(exact.direction===(forward?'forward':'backward')&&(exact.directionYearStem===yearStem||(!d.protocolRevision&&exact.directionYearStem===undefined)),'顺逆与采用年干不一致');
  const month=d.natal[1].stem+d.natal[1].branch,mi=Array.from({length:60},(_,i)=>cycle(i)).indexOf(month);
  exact.periods.forEach((p,i)=>check(p.gz===cycle(mi+(i+1)*(forward?1:-1)),'大运序列与月柱顺逆不一致'));
 }
 const cv=d.calendarView;
 // Legacy records without a calendar remain machine-readable; the current renderer
 // rejects them. Do not invent dates during validation or silently recompute them.
 if(!cv){check(!d.protocolRevision,'新协议命盘缺calendarView');return d;}
 check(cv.schema==='cgm-bazi-calendar-view/1'&&cv.dailyConvention?.id==='jie-local-date-inclusive-v1','流日协议无效');
 check(cv.dailyConvention.timezone===birth.timezone&&cv.dailyConvention.utcOffsetSeconds===birth.utcOffsetSeconds,'流日时制与出生资料不一致');
 check(cv.ageConvention==='nominal-after-lunar-new-year','虚岁规则无效');
 const nominal=d.person.nominalBirthYear??d.person.lunar?.year;
 check(Number.isInteger(nominal)&&cv.years.length===d.years.length,'虚岁基准或日历年份缺失');
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:birth.utcOffsetSeconds===undefined?birth.timezone:'UTC',year:'numeric',month:'2-digit',day:'2-digit'});
 const localDate=t=>{const p=Object.fromEntries(parts.formatToParts(new Date(Date.parse(t)+(birth.utcOffsetSeconds||0)*1000)).map(x=>[x.type,x.value]));return p.year.padStart(4,'0')+'-'+p.month+'-'+p.day};
 let previous=null;
 cv.years.forEach((y,i)=>{
  check(y.year===d.years[i].year&&y.nominalAge===y.year-nominal+1&&y.months.length===12,'日历虚岁或年份不一致');
  y.months.forEach((m,j)=>{
   const source=d.years[i].months[j];
   check(m.index===j&&m.term===source.term&&m.startUTC===source.startUTC,'流月与精确节气不一致');
   check(m.startDate===localDate(m.startUTC),'交节当地日期不一致');
   check(m.label===m.month+'月'+m.day+'日'&&m.startDate===String(m.year).padStart(4,'0')+'-'+String(m.month).padStart(2,'0')+'-'+String(m.day).padStart(2,'0'),'流月显示日期不一致');
   if(previous)check(previous===m.startDate,'流日月份间有缺口或重叠');
   const start=+cal.solarDate(m.startDate)-4*3600000,end=+cal.solarDate(m.endDateExclusive)-4*3600000;
   check(end>start&&end-start>=28*86400000&&end-start<=33*86400000&&m.days.length===(end-start)/86400000,'流日范围不完整');
   m.days.forEach((day,k)=>{
    const ms=start+k*86400000,dt=new Date(ms);
    check(day.date===dt.toISOString().slice(0,10)&&day.day===dt.getUTCDate()&&day.weekday===dt.getUTCDay(),'流日日期或星期不一致');
    check(day.gz===cycle(Math.floor(ms/86400000)+2440588+49),'流日干支不一致');
   });
   previous=m.endDateExclusive;
  });
 });
 if(cv.endBoundary)check(cv.endBoundary.term==='立春'&&Number.isFinite(Date.parse(cv.endBoundary.startUTC))&&previous===localDate(cv.endBoundary.startUTC),'最后流月未封闭到下一年真实立春');
 if(d.smallLuck){
  check(d.smallLuck.method===selected.smallLuck&&d.smallLuck.years.length===d.years.length,'小运资料不完整或与所选算法不一致');
  if(d.rules.smallLuck)check(d.rules.smallLuck.method===selected.smallLuck,'小运规则说明与所选算法不一致');
  d.smallLuck.years.forEach((s,i)=>check(s.year===d.years[i].year&&s.nominalAge===s.year-nominal+1&&s.gz===require('./small-luck.cjs').smallLuckForYear({year:s.year,nominalBirthYear:nominal,method:selected.smallLuck,sex:birth.sex,natal:d.natal}),'小运与算法及春节虚岁基准不一致'));
 }
 if(d.person.nominalBirthYear!==undefined&&d.astronomy?.yearBoundaryEvidence)check(nominal===d.astronomy.yearBoundaryEvidence.lunarCalendar.lunarYear,'出生虚岁基准与春节证据不一致');
 if(d.protocolRevision){
  check(d.protocolRevision===2,'未知命盘协议修订');
  check(e&&d.smallLuck,'新协议缺时间证据或小运');
  if(!d.provenance?.migration)check(cv.endBoundary,'新计算命盘缺最后立春边界证据');
  check(d.provenance?.inputSha256===require('./chart.cjs').sha(JSON.stringify({birth:d.person.birth,conventions:d.rules.conventions})),'出生输入与口径摘要不一致');
 }
 return d;
}
module.exports={validateDetails};
