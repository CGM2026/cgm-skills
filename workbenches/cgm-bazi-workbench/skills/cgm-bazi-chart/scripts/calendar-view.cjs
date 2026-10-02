'use strict';
// Calendar presentation facts shared by templates. No page geometry or palette.
function calendarView(d,nextYearJie){
 const birthLunarYear=d.person.nominalBirthYear??d.person.lunar?.year;
 if(!Number.isInteger(birthLunarYear))throw Error('Lunar birth year required for nominal age');
 const zone=d.person.birth.timezone;
 const offset=d.person.birth.utcOffsetSeconds;
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:offset===undefined?zone:'UTC',year:'numeric',month:'numeric',day:'numeric'});
 const parts=utc=>Object.fromEntries(formatter.formatToParts(new Date(Date.parse(utc)+(offset||0)*1000)).map(x=>[x.type,x.value]));
 const result={schema:'cgm-bazi-calendar-view/1',ageConvention:'nominal-after-lunar-new-year',ageDescription:'出生1岁，春节加岁；年度格子表示该年春节后的虚岁',years:d.years.map(y=>({year:y.year,nominalAge:y.year-birthLunarYear+1,months:y.months.map(m=>{
  if(!m.startUTC)throw Error('Exact solar terms required; historical approximate month dates are unsupported');
  const p=parts(m.startUTC);
  return {index:m.index,term:m.term,year:Number(p.year),month:Number(p.month),day:Number(p.day),label:Number(p.month)+'月'+Number(p.day)+'日',startUTC:m.startUTC};
 })}))};
 if(!nextYearJie)throw Error('Next-year Lichun required to close the final daily interval');
 result.endBoundary={term:'立春',startUTC:nextYearJie};
 const dateOf=utc=>{const p=parts(utc);return `${p.year.padStart(4,'0')}-${p.month.padStart(2,'0')}-${p.day.padStart(2,'0')}`};
 const months=result.years.flatMap(y=>y.months);
 months.forEach((m,i)=>{m.startDate=dateOf(m.startUTC);m.endDateExclusive=dateOf(months[i+1]?.startUTC||nextYearJie);m.days=[];
  for(let ms=Date.parse(m.startDate+'T00:00:00Z');ms<Date.parse(m.endDateExclusive+'T00:00:00Z');ms+=86400000){const day=new Date(ms),n=((Math.floor(ms/86400000)+2440588+49)%60+60)%60;m.days.push({date:day.toISOString().slice(0,10),day:day.getUTCDate(),weekday:day.getUTCDay(),gz:'甲乙丙丁戊己庚辛壬癸'[n%10]+'子丑寅卯辰巳午未申酉戌亥'[n%12]});}
 });
 result.dailyConvention={id:'jie-local-date-inclusive-v1',timezone:zone,monthBoundary:'交节当地公历日期整天归新流月；下次交节日期不属于本月',dayPillar:'当地公历日期的日柱；日期格不细分晚子时',scope:'仅流日浏览；不改变出生排盘或精确节气时刻'};
 if(offset!==undefined)result.dailyConvention.utcOffsetSeconds=offset;
 return result;
}
module.exports={calendarView};
