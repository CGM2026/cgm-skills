'use strict';
const fs=require('node:fs');
const {validate,cycle,sha}=require('./chart.cjs');
const cal=require('./calendar.cjs');
function atDate(chart,date){
 validate(chart);cal.solarDate(date);
 if(chart.calculation.status==='historical-fixture'||!chart.calendarView)throw Error('日期查询须使用带真实节气与流日的计算命盘');
 if(!chart.calculation.timeEvidence)throw Error('旧命盘缺出生时间精度证据，请从原始资料补齐后重排，不推断其确定性');
 if(date<(chart.person.birth.solarDate||chart.person.birth.date))throw Error('所选日期早于出生日期');
 const months=chart.calendarView.years.flatMap(y=>y.months.map(m=>({...m,sequenceYear:y.year})));
 const month=months.find(m=>m.startDate<=date&&date<m.endDateExclusive);
 if(!month)throw Error('所选日期超出已计算日历范围，请由排盘成员扩展；不补造数据');
 const day=month.days.find(d=>d.date===date),sourceYear=chart.years.find(y=>y.year===month.sequenceYear);
 const result={schema:'cgm-bazi-date-view/1',date,precision:'day',chartSha256:sha(JSON.stringify(chart)),timezone:chart.person.birth.timezone,
  utcOffsetSeconds:chart.person.birth.utcOffsetSeconds,
  flowYear:{sequenceYear:month.sequenceYear,gz:sourceYear.gz,basis:'节月年度符号索引，沿用流年浏览，不代表年柱切换时刻'},
  flowMonth:{index:month.index,gz:sourceYear.months[month.index].gz,term:month.term,startDate:month.startDate,endDateExclusive:month.endDateExclusive,termUTC:month.startUTC,convention:chart.calendarView.dailyConvention.monthBoundary},
  flowDay:{gz:day.gz,weekday:day.weekday,convention:chart.calendarView.dailyConvention.dayPillar},
  luck:null,candidates:[],warnings:[],changesToday:[],annualProjection:chart.luck.find(p=>p.start<=Number(date.slice(0,4))&&Number(date.slice(0,4))<=p.end)};
 if(chart.person.birth.timeStatus==='unknown'){
  result.certainty='reference-only';result.warnings.push('时辰不详，不定位实际交运；年度参考投影仅供浏览');return result;
 }
 const exact=chart.luckExact;result.certainty=exact.certainty||'computed-for-input';
 if(result.certainty==='conditional-on-estimated-time')result.warnings.push('出生时刻为候选或近似，以下日期定位仅在该输入下成立');
 const p=exact.periods.find(p=>p.startLocal.slice(0,10)<=date&&date<p.endLocal.slice(0,10));
 const nominal=chart.person.nominalBirthYear??chart.person.lunar.year;
 const small=()=>{const year=cal.toLunar(date).year,method=chart.rules.conventions.smallLuck||'fixed-origin';
  if(year<nominal)throw Error('该日期处于出生春节子初边界，需提供具体查询时刻；日期视图不能确定虚岁');
  return {kind:'small-luck-'+method,gz:require('./small-luck.cjs').smallLuckForYear({year,nominalBirthYear:nominal,method,sex:chart.person.birth.sex,natal:chart.natal}),nominalAge:year-nominal+1,basis:'所选公历日期的春节后日间虚岁；不细分春节前夜23点或太阳时跨日'};};
 if(p)result.luck={kind:'major-luck',index:p.index,gz:p.gz,startDate:p.startLocal.slice(0,10),endDateExclusive:p.endLocal.slice(0,10)};
 else if(date<exact.periods[0].startLocal.slice(0,10))result.luck=small();
 else throw Error('所选日期超出十段精确大运范围');
 if(exact.precision==='hour'||(exact.precision===undefined&&chart.rules.conventions.luckStart==='three-days-year-minute')){
  const boundary=exact.periods.find(p=>p.startLocal.slice(0,10)===date);
  if(boundary){
   const previous=exact.periods[boundary.index-2];
   result.candidates=[previous?{kind:'major-luck',index:previous.index,gz:previous.gz}:small(),{kind:'major-luck',index:boundary.index,gz:boundary.gz}];
   result.luck=null;result.certainty='needs-query-time';result.changesToday.push({kind:'major-luck',local:boundary.startLocal});
   result.warnings.push('该小时折算口径在当天交运，仅给日期不能唯一定位；保留交运前后两段');
  }
 }
 if(month.startDate===date)result.changesToday.push({kind:'solar-term',term:month.term,utc:month.startUTC,browserConvention:'交节当天整日归新流月；出生月柱仍按交节瞬间'});
 if(cal.toLunar(date).month===1&&cal.toLunar(date).day===1)result.warnings.push('春节日的小运按日间日期参照；23点及太阳时跨日需时刻查询，不从日期视图推断');
 return result;
}
function migrate(chart){
 validate(chart);
 if(chart.calculation.status==='historical-fixture'||!chart.calendarView||!chart.smallLuck||!chart.calculation.timeEvidence)throw Error('旧命盘缺完整历法或证据，请从原始出生输入重排到新目录');
 const d=structuredClone(chart),oldSha=sha(JSON.stringify(chart));
 d.protocolRevision=2;
 d.provenance={...d.provenance,inputSha256:sha(JSON.stringify({birth:d.person.birth,conventions:d.rules.conventions})),validation:'structural-and-semantic',migration:{fromChartSha256:oldSha,mode:'metadata-only-no-recalculation',toolVersion:'2026.10.01-work1',lastTermEvidence:chart.calendarView.endBoundary?'preserved':'legacy-no-closure-evidence'}};
 // A migration is not a claim that legacy facts were calculated by the new engine.
 if(!d.provenance.engineVersion)d.provenance.engineVersion='legacy-unspecified';
 return validate(d);
}
module.exports={atDate,migrate};
if(require.main===module){try{
 const [mode,input,dateOrOutput]=process.argv.slice(2),chart=JSON.parse(fs.readFileSync(input,'utf8'));
 if(mode==='date')console.log(JSON.stringify(atDate(chart,dateOrOutput)));
 else if(mode==='migrate'){if(!dateOrOutput)throw Error('需提供新的输出文件');fs.writeFileSync(dateOrOutput,JSON.stringify(migrate(chart),null,2),{flag:'wx'});console.log(JSON.stringify({output:dateOrOutput,mode:'metadata-only-no-recalculation'}));}
 else throw Error('Usage: timeline.cjs date CHART.json YYYY-MM-DD | migrate CHART.json NEW.json');
}catch(e){console.error(e.message);process.exitCode=1;}}
