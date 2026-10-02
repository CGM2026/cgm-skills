'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {calculateBirth,validate,sha}=require('../../skills/cgm-bazi-chart/scripts/chart.cjs');
const {atDate}=require('../../skills/cgm-bazi-chart/scripts/timeline.cjs');
const root=path.resolve(__dirname,'../..');
const out=process.env.CGM_BAZI_TEST_OUTPUT||path.join(root,'output/发布修复_20261002/validation/bazi-algorithms');
fs.mkdirSync(out,{recursive:true});
const base={schema:'cgm-bazi-birth/1',name:'合成算法样例',birth:{calendar:'solar',date:'2001-11-12',time:'23:30',sex:'male',timezone:'Asia/Shanghai',location:{name:'合成地点',longitude:120}},conventions:{solarTime:'civil'}};
const cache=new Map(),results=[];
const chart=(conventions={},birth={})=>{const input={...base,birth:{...base.birth,...birth},conventions:{...base.conventions,...conventions}},key=JSON.stringify(input);if(!cache.has(key))cache.set(key,calculateBirth(input));return cache.get(key);};
const test=(name,run)=>{run();results.push({name,status:'pass'});};
const pillar=(d,i)=>d.natal[i].stem+d.natal[i].branch;
const cyclic='甲乙丙丁戊己庚辛壬癸',branches='子丑寅卯辰巳午未申酉戌亥';
const next=(value,direction)=>{const i=Array.from({length:60},(_,n)=>cyclic[n%10]+branches[n%12]).indexOf(value),n=(i+direction+60)%60;return cyclic[n%10]+branches[n%12];};
for(const time of ['23:00','23:59:59'])test('晚子时三种排法明确区分 '+time,()=>{
 const zi=chart({dayBoundary:'zi-23'},{time}),midnight=chart({dayBoundary:'midnight'},{time}),split=chart({dayBoundary:'split-zi'},{time});
 assert.equal(pillar(split,2),pillar(midnight,2));assert.equal(pillar(zi,2),next(pillar(split,2),1));
 assert.equal(pillar(split,3),pillar(zi,3));assert.notEqual(pillar(split,3),pillar(midnight,3));
 assert.deepEqual(split.godMap,midnight.godMap);
});
for(const time of ['00:00','00:59','01:00','22:59:59'])test('非晚子时三种排法一致 '+time,()=>{
 const baseline=chart({dayBoundary:'zi-23'},{time});for(const mode of ['midnight','split-zi'])assert.deepEqual(chart({dayBoundary:mode},{time}).natal,baseline.natal);
});
test('晚子次日零点衔接',()=>{const late=chart({dayBoundary:'split-zi'}),early=chart({dayBoundary:'split-zi'},{date:'2001-11-13',time:'00:00'});assert.equal(next(pillar(late,2),1),pillar(early,2));assert.equal(pillar(late,3),pillar(early,3));});
test('分排以所选太阳时判断而非钟表时',()=>{
 const corrected=chart({dayBoundary:'split-zi',solarTime:'mean'},{time:'22:30',location:{name:'合成地点',longitude:135}}),civil=chart({dayBoundary:'split-zi'},{time:'23:30'});
 assert.deepEqual(corrected.natal,civil.natal);assert.match(corrected.astronomy.correction.pillarClock,/T23:30/);
});
for(const [date,time,sex,offset,startDate]of [
 ['1981-01-29','23:37','female',{years:8,months:0,days:20,hours:0},'1989-02-18'],
 ['2020-01-06','11:22','male',{years:0,months:1,days:0,hours:0},'2020-02-06'],
 ['2022-03-09','20:51','male',{years:8,months:9,days:10,hours:0},'2030-12-19']
])test('官方YunTest时辰法样例 '+date,()=>{
 const d=chart({luckStart:'three-days-year-shichen',yearBoundary:'lichun-instant'},{date,time,sex});assert.deepEqual(d.luckExact.ageOffset,offset);assert.equal(d.luckExact.startDate,startDate);assert.equal(d.luckExact.precision,'day');assert.match(d.luckExact.startLocal,/T00:00:00/);assert.equal(d.luckExact.shichenInterval.lateZiIndex,11);
});
test('官方YunTest分钟法样例及默认余数舍去',()=>{
 const birth={date:'2022-03-09',time:'20:51'},hour=chart({luckStart:'three-days-year-minute',yearBoundary:'lichun-instant'},birth),day=chart({luckStart:'three-days-year-minute-day',yearBoundary:'lichun-instant'},birth);
 assert.equal(hour.luckExact.startDate,'2030-12-12');assert.deepEqual([hour.luckExact.ageOffset.years,hour.luckExact.ageOffset.months,hour.luckExact.ageOffset.days],[8,9,2]);
 assert.equal(day.luckExact.ageOffset.hours,0);assert.equal(hour.luckExact.ageOffset.hours,day.luckExact.discardedIntervalMinutes*2);assert.equal(day.luckExact.precision,'day');assert.equal(hour.luckExact.precision,'hour');
});
for(const date of ['2022-06-15','2023-06-15'])for(const sex of ['male','female'])test('时柱起小运一岁推进一步 '+date+' '+sex,()=>{
 const d=chart({smallLuck:'hour-pillar'},{date,sex,time:'12:00'}),step=d.luckExact.direction==='forward'?1:-1;
 assert.equal(d.smallLuck.years[0].nominalAge,1);assert.equal(d.smallLuck.years[0].gz,next(pillar(d,3),step));assert.equal(d.smallLuck.years[1].gz,next(d.smallLuck.years[0].gz,step));assert.equal(d.rules.smallLuck.method,'hour-pillar');
});
test('固定起点仍为推荐默认',()=>{const male=chart({}, {date:'2022-06-15',time:'12:00'}),female=chart({}, {date:'2022-06-15',time:'12:00',sex:'female'});assert.equal(male.smallLuck.years[0].gz,'丙寅');assert.equal(female.smallLuck.years[0].gz,'壬申');});
test('时柱起小运的顺逆随所选年柱而改变',()=>{
 const birth={date:'2023-01-25',time:'12:00'},spring=chart({smallLuck:'hour-pillar'},birth),lichun=chart({smallLuck:'hour-pillar',yearBoundary:'lichun-instant'},birth);
 assert.deepEqual(spring.natal.slice(1),lichun.natal.slice(1));assert.notEqual(spring.smallLuck.years[0].gz,lichun.smallLuck.years[0].gz);assert.equal(spring.person.nominalBirthYear,lichun.person.nominalBirthYear);
});
test('春节子初独立于晚子时日柱规则',()=>{
 const before=chart({smallLuck:'hour-pillar',dayBoundary:'split-zi'},{date:'2024-02-09',time:'22:59'}),after=chart({smallLuck:'hour-pillar',dayBoundary:'split-zi'},{date:'2024-02-09',time:'23:00'});
 assert.equal(before.person.nominalBirthYear,2023);assert.equal(after.person.nominalBirthYear,2024);assert.equal(pillar(before,2),pillar(after,2));assert.notEqual(pillar(before,0),pillar(after,0));
});
test('日期查询使用所选小运并在春节增岁',()=>{
 const d=chart({smallLuck:'hour-pillar'},{date:'2022-06-15',time:'12:00'}),a=atDate(d,'2023-01-21'),b=atDate(d,'2023-01-22');
 assert.equal(a.luck.kind,'small-luck-hour-pillar');assert.equal(b.luck.nominalAge,a.luck.nominalAge+1);assert.equal(b.luck.gz,next(a.luck.gz,d.luckExact.direction==='forward'?1:-1));
});
test('未知时辰禁用时柱小运并保留固定起点参照',()=>{
 assert.throws(()=>chart({smallLuck:'hour-pillar'},{time:null,timeStatus:'unknown'}),/时辰不详/);
 const d=chart({smallLuck:'fixed-origin'},{time:null,timeStatus:'unknown'});assert.equal(d.luckExact,null);assert.equal(d.natal[3].stem,null);assert.equal(d.smallLuck.method,'fixed-origin');
});
for(const [name,change]of [
 ['时辰余数证据',d=>d.luckExact.shichenInterval.shichen++],
 ['小运实际干支',d=>d.smallLuck.years[0].gz=next(d.smallLuck.years[0].gz,1)],
 ['小运方法',d=>d.smallLuck.method='fixed-origin'],
 ['起运方法',d=>d.luckExact.method='three-days-year-minute-day'],
 ['重填摘要后改变日界',d=>{d.rules.conventions.dayBoundary='midnight';d.provenance.inputSha256=sha(JSON.stringify({birth:d.person.birth,conventions:d.rules.conventions}));}]
])test('拒绝篡改 '+name,()=>{const d=structuredClone(chart({dayBoundary:'split-zi',luckStart:'three-days-year-shichen',smallLuck:'hour-pillar'}));change(d);assert.throws(()=>validate(d));});
test('时辰法支持历史范围首年',()=>{const d=chart({luckStart:'three-days-year-shichen'},{date:'0001-01-01',time:'00:30',dateStyle:'proleptic-gregorian',utcOffsetSeconds:0,timeSource:'合成范围边界',timezone:'UTC'});assert.equal(d.person.birthYear,1);assert.ok(d.luckExact.ageOffset.years>=0);});
test('计算来源不含机器绝对路径',()=>{for(const source of chart().calculation.sources)if(source.path)assert.equal(path.isAbsolute(source.path),false);});
const report={status:'executed-pass',passed:results.length,sources:['https://raw.githubusercontent.com/6tail/lunar-python/master/test/YunTest.py','https://raw.githubusercontent.com/6tail/lunar-python/master/lunar_python/eightchar/Yun.py','https://raw.githubusercontent.com/6tail/lunar-python/master/lunar_python/eightchar/XiaoYun.py'],results};
fs.writeFileSync(path.join(out,'algorithm-options.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(out,'synthetic-split-shichen-hour.json'),JSON.stringify(chart({dayBoundary:'split-zi',luckStart:'three-days-year-shichen',smallLuck:'hour-pillar'}),null,2));
console.log(JSON.stringify({passed:results.length,report:path.join(out,'algorithm-options.json')}));
