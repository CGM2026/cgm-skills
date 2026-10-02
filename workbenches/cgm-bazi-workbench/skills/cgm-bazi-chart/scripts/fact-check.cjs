'use strict';
// Derive reference facts from saved birth input. Never mutate or repair a chart.
// The cache holds computed references, not previous successful chart hashes.
const check=(value,label)=>{if(!value)throw Error('命盘事实交叉核验：'+label+'与原始出生资料或排盘口径不一致');};
function instant(text){
 if(typeof text!=='string')return NaN;
 const secondsOffset=text.match(/^(.*)([+-])(\d{2}):(\d{2}):(\d{2})$/);
 if(secondsOffset)return Date.parse(secondsOffset[1]+'Z')-(secondsOffset[2]==='+'?1:-1)*(+secondsOffset[3]*3600+(+secondsOffset[4])*60+(+secondsOffset[5]))*1000;
 return Date.parse(/[Zz]$|[+-]\d{2}:?\d{2}$/.test(text)?text:text+'Z');
}
function createVerifier({prepareBirth,runAstronomy}){
 const cache=new Map(),legacySources=new Map();
 // Early Windows builds decoded UTF-8 input as GBK with surrogateescape.
 // Accept only that exact, reproducible transport result for legacy documents;
 // keep the saved text unchanged and never relax any calculation fact.
 function legacySource(actual,expected){
  if(actual===expected)return true;
  if(typeof actual!=='string'||typeof expected!=='string')return false;
  const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
  const projectRuntime=path.resolve(__dirname,'../../../.cgm-hellenistic-astrology/runtime/Scripts/python.exe');
  const runtime=process.env.CGM_BAZI_PYTHON||(fs.existsSync(projectRuntime)?projectRuntime:process.platform==='win32'?'python':'python3');
  const key=JSON.stringify([runtime,expected]);let encoded=legacySources.get(key);
  if(encoded===undefined){
   const program="import json,sys; print(json.dumps(json.loads(sys.stdin.read()).encode('utf-8').decode('gbk','surrogateescape')))";
   const result=cp.spawnSync(runtime,['-X','utf8','-c',program],{input:JSON.stringify(expected),encoding:'utf8',env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},maxBuffer:16*1024*1024,windowsHide:true});
   check(!result.error&&result.status===0,'历史来源编码证据');encoded=JSON.parse(result.stdout);
   if(legacySources.size>=64)legacySources.delete(legacySources.keys().next().value);legacySources.set(key,encoded);
  }
  return actual===encoded;
 }
 return function verify(chart){
  if(chart.calculation.status==='historical-fixture')return;
  check(chart.rules.id==='solar-jie-v1','计算规则');
  const unknown=chart.person.birth?.timeStatus==='unknown',birth=structuredClone(chart.person.birth);
  if(unknown){birth.time='12:00';delete birth.timeStatus;if(birth.timeEvidence?.kind==='unknown')delete birth.timeEvidence;}
  const request=prepareBirth(birth,chart.rules.conventions);
  const key=JSON.stringify({birth:request.b,conventions:request.c,yearEvidence:request.yearEvidence,runtime:process.env.CGM_BAZI_PYTHON});
  let reference=cache.get(key);
  if(!reference){reference=runAstronomy(request,false);if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,reference);}
  const strict=chart.protocolRevision===2&&!chart.provenance?.migration;
  const value=(actual,expected,label,required=strict)=>{if(required||actual!==undefined)check(actual===expected,label);};
  const number=(actual,expected,label,tolerance=0,required=strict)=>{if(required||actual!==undefined)check(typeof actual==='number'&&Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,label);};
  const time=(actual,expected,label,required=strict)=>{if(required||actual!==undefined)check(Number.isFinite(instant(actual))&&Math.abs(instant(actual)-instant(expected))<=1000,label);};
  const naive=(actual,expected,label,required=strict)=>{if(required||actual!==undefined){check(typeof actual==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(actual),label);time(actual,expected,label,true);}};
  const pillar=(actual,expected,label)=>check(actual?.stem===expected.stem&&actual?.branch===expected.branch,label);
  if(unknown){
   value(chart.astronomy.status,'date-reference-only','未知时辰参照状态');
   value(chart.astronomy.referenceTime,'12:00','未知时辰参照时刻');
   value(chart.luckEstimate.referenceTime,'12:00','未知时辰起运参照时刻');
  }
  chart.natal.forEach((p,i)=>pillar(p,unknown&&i===3?{stem:null,branch:null}:reference.natal[i],['年柱','月柱','日柱','时柱'][i]));
  value(chart.person.birthYear,request.normalizedYear,'出生公历年',true);
  value(chart.person.birth.solarDate,request.b.solarDate,'出生归一日期');
  if(chart.person.lunar||strict){for(const field of ['year','month','day','isLeapMonth'])value(chart.person.lunar?.[field],request.birthLunar[field],'出生农历 '+field,true);}
  value(chart.person.nominalBirthYear,reference.yearBoundaryEvidence.lunarCalendar.lunarYear,'出生虚岁年');
  const astronomy=unknown?chart.astronomy.referenceResult:chart.astronomy;
  check(astronomy&&typeof astronomy==='object','出生时间证据');
  number(astronomy.birthJDUT,reference.birthJDUT,'出生UT儒略日',1/86400,true);
  const correction=astronomy.correction,expected=reference.correction;
  check(correction&&typeof correction==='object','时间换算证据');
  value(correction.mode,request.c.solarTime,'时间口径',true);
  value(correction.originalLocal,expected.originalLocal,'原始当地钟表时',true);
  time(correction.birthUTC,expected.birthUTC,'出生UTC',true);
  naive(correction.pillarClock,expected.pillarClock,'排盘太阳时标签',true);
  number(correction.utcOffsetSeconds,expected.utcOffsetSeconds,'出生时差');
  if(!strict&&correction.timeSource!==undefined)check(legacySource(correction.timeSource,expected.timeSource),'原时制来源');
  else value(correction.timeSource,expected.timeSource,'原时制来源',false);
  if(request.c.solarTime==='provided-apparent'){
   if(!strict&&correction.source!==undefined)check(legacySource(correction.source,request.b.correctionSource),'已校正时间来源');
   else value(correction.source,request.b.correctionSource,'已校正时间来源');
   value(correction.status,expected.status,'已校正时间证据状态');
  }
  if(['mean','apparent'].includes(request.c.solarTime)){
   number(correction.longitude,expected.longitude,'太阳时经度',0,true);
   number(correction.equationOfTimeSeconds,expected.equationOfTimeSeconds,'均时差',1,true);
   naive(correction.meanLocal,expected.meanLocal,'平太阳时标签',true);
  }
  for(const field of ['baziYear','solarTermYear','baziMonth'])value(astronomy[field],reference[field],'天文年/月 '+field);
  function term(actual,target,label,required=strict){
   if(!actual&&!required)return;
   check(actual&&typeof actual==='object',label);
   for(const field of ['index','term','solarLongitude'])value(actual[field],target[field],label+' '+field,true);
   number(actual.jdUT,target.jdUT,label+' UT儒略日',1/86400,true);
   time(actual.utc,target.utc,label+' UTC',true);
   if(actual.residualDegrees!==undefined)number(actual.residualDegrees,target.residualDegrees,label+'求解残差',1e-6,true);
  }
  term(astronomy.previousJie,reference.previousJie,'上一节');
  term(astronomy.nextJie,reference.nextJie,'下一节');
  if(astronomy.yearBoundaryEvidence||strict){
   const a=astronomy.yearBoundaryEvidence,b=reference.yearBoundaryEvidence;
   check(a&&a.lunarCalendar,'年界证据');
   for(const field of ['selected','selectedYear','monthStemBasis','monthStemYear'])value(a[field],b[field],'年界 '+field,true);
   for(const field of ['lunarYear','dateBasis','newYearDate','boundaryClock','evaluatedDate'])value(a.lunarCalendar[field],b.lunarCalendar[field],'春节年界 '+field,true);
  }
  const actual=unknown?chart.luckEstimate.referenceResult:chart.luckExact,target=reference.luckExact;
  check(actual&&typeof actual==='object','起运证据');
  for(const field of ['direction','directionYearStem','directionBasis','precision','rounding','discardedIntervalMinutes','startDate','wholeMinutes'])value(actual[field],target[field],'起运 '+field);
  for(const field of ['method','intervalBasis'])value(actual[field],target[field],'起运 '+field,false);
  if(request.c.luckStart==='three-days-year-shichen'){
   check(actual.shichenInterval&&typeof actual.shichenInterval==='object','时辰折算证据');
   for(const field of ['days','shichen','startIndex','endIndex','lateZiIndex','subShichen'])value(actual.shichenInterval[field],target.shichenInterval[field],'时辰折算 '+field,true);
  }
  number(actual.elapsedSeconds,target.elapsedSeconds,'起运时间间隔',1,true);
  time(actual.startLocal,target.startLocal,'起运当地日期',true);
  term(actual.basisTerm,target.basisTerm,'起运取节',true);
  for(const field of ['years','months','days','hours'])value(actual.ageOffset?.[field],target.ageOffset[field],'起运折算 '+field,true);
  check(actual.periods?.length===target.periods.length,'精确大运数量');
  actual.periods.forEach((p,i)=>{const t=target.periods[i];value(p.index,t.index,'大运序号',true);value(p.gz,t.gz,'大运干支',true);for(const f of ['startLocal','endLocal','startUTC','endUTC'])time(p[f],t[f],'大运 '+(i+1)+' '+f,true);});
  if(strict){
   const firstYear=Number(target.startLocal.slice(0,4)),birthYear=request.normalizedYear,nominal=reference.yearBoundaryEvidence.lunarCalendar.lunarYear;
   const stems='甲乙丙丁戊己庚辛壬癸',branches='子丑寅卯辰巳午未申酉戌亥',mod=(n,d)=>(n%d+d)%d;
   const projected=[];
   for(let year=birthYear;year<firstYear;year++){
    const gz=require('./small-luck.cjs').smallLuckForYear({year,nominalBirthYear:nominal,method:request.c.smallLuck,sex:request.b.sex,natal:reference.natal});
    projected.push({start:year,end:year,gz,kind:'small-luck-'+request.c.smallLuck});
   }
   for(const p of target.periods){const start=Number(p.startLocal.slice(0,4));projected.push({start,end:start+9,gz:p.gz,exactPeriodIndex:p.index});}
   check(chart.luck.length===projected.length,'年度推运数量');
   chart.luck.forEach((p,i)=>{const t=projected[i];for(const field of ['start','end','gz','kind','exactPeriodIndex'])value(p[field],t[field],'年度推运 '+i+' '+field,true);});
  }
 };
}
module.exports={createVerifier};
