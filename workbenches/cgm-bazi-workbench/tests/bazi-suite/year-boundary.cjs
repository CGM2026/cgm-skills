'use strict';
const assert=require('node:assert/strict');
const {calculateBirth}=require('../../skills/cgm-bazi-chart/scripts/chart.cjs');
const make=(date,time='12:00',yearBoundary)=>calculateBirth({schema:'cgm-bazi-birth/1',birth:{calendar:'solar',date,time,sex:'male',timezone:'Asia/Shanghai',location:{name:'边界测试',longitude:120}},conventions:{...(yearBoundary?{yearBoundary}:{})}});
const pair=d=>d.natal.slice(0,2).map(p=>p.stem+p.branch);
// 春节先于立春；只改变年柱口径，月柱、日柱、时柱与节气证据相同。
const a=make('2023-01-25'),b=make('2023-01-25','12:00','lichun-instant');
assert.deepEqual(pair(a),['癸卯','癸丑']);assert.deepEqual(pair(b),['壬寅','癸丑']);
assert.equal(a.astronomy.baziYear,2023);assert.equal(a.astronomy.solarTermYear,2022);
// 立春先于春节；新寅月不因年柱仍在旧年而退回旧月干。
const c=make('2024-02-06'),d=make('2024-02-06','12:00','lichun-instant');
assert.deepEqual(pair(c),['癸卯','丙寅']);assert.deepEqual(pair(d),['甲辰','丙寅']);
for(const [x,y] of [[a,b],[c,d]]){
 assert.deepEqual(x.natal.slice(1),y.natal.slice(1));
 assert.deepEqual(x.astronomy.previousJie,y.astronomy.previousJie);
 assert.equal(x.luckExact.directionYearStem,x.natal[0].stem);
 assert.notEqual(x.luckExact.direction,y.luckExact.direction);
}
const before=make('2024-02-09','23:10'),after=make('2024-02-09','23:20');
assert.ok(before.astronomy.correction.pillarClock.includes('T22:'));assert.ok(after.astronomy.correction.pillarClock.includes('T23:'));
assert.deepEqual(pair(before),['癸卯','丙寅']);assert.deepEqual(pair(after),['甲辰','丙寅']);
assert.notDeepEqual(before.natal[2],after.natal[2]);
assert.equal(after.astronomy.yearBoundaryEvidence.lunarCalendar.evaluatedDate,'2024-02-10');
assert.deepEqual(after.natal,make('2024-02-10','00:00').natal);
assert.equal(after.astronomy.yearBoundaryEvidence.lunarCalendar.newYearDate,'2024-02-10');
// 同一精确立春的前后一秒：春节年柱不变，月柱切换。
const at=Date.parse(c.astronomy.previousJie.utc);
const around=ms=>{const t=new Date(ms+8*3600000).toISOString();return make(t.slice(0,10),t.slice(11,19));};
assert.deepEqual(pair(around(at-1000)),['癸卯','乙丑']);
assert.deepEqual(pair(around(at+1000)),['癸卯','丙寅']);
assert.equal(a.rules.conventions.yearBoundary,'lunar-new-year');
assert.throws(()=>make('2024-02-06','12:00','unsupported'),/Unsupported convention/);
console.log('Independent lunar-year/solar-month boundaries, defaults, exact Jie, apparent-solar zi-23 CNY and luck evidence passed.');
