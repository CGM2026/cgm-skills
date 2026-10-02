'use strict';
// Exercise the public recalculation handoff with every supported combination;
// formula-specific expectations live in algorithm-options and offsets tests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {calculateBirth}=require('../../skills/cgm-bazi-chart/scripts/chart.cjs');
const {recalculate}=require('../../skills/cgm-bazi-visualization/scripts/recalculate.cjs');
const root=path.resolve(__dirname,'../..'),out=process.env.CGM_BAZI_TEST_OUTPUT||path.join(root,'output/发布修复_20261002/validation/bazi-combinations');
fs.mkdirSync(out,{recursive:true});
const input={schema:'cgm-bazi-birth/1',name:'合成组合测试',birth:{calendar:'solar',date:'2023-01-25',time:'23:10',sex:'male',timezone:'Asia/Shanghai',location:{name:'合成地点',longitude:120}},conventions:{solarTime:'civil'}};
const original=calculateBirth(input),before=JSON.stringify(original),unknown=calculateBirth({...input,birth:{...input.birth,time:null}}),unknownBefore=JSON.stringify(unknown);
const results=[],modes={solarTime:['civil','mean','apparent'],dayBoundary:['zi-23','midnight','split-zi'],yearBoundary:['lunar-new-year','lichun-instant'],luckStart:['three-days-year-minute-day','three-days-year-minute','three-days-year-shichen'],smallLuck:['fixed-origin','hour-pillar']};
function* choices(entries,index=0,current={}){if(index===entries.length){yield current;return;}const [key,values]=entries[index];for(const value of values)yield* choices(entries,index+1,{...current,[key]:value});}
function check(chart,options,unknownTime){const r=recalculate(chart,options);for(const [key,value]of Object.entries(options))assert.equal(r.chart.rules.conventions[key],value);assert.deepEqual(r.before.conventions,chart.rules.conventions);assert.deepEqual(r.after.conventions,r.chart.rules.conventions);if(unknownTime){assert.equal(r.chart.luckExact,null);assert.equal(r.chart.natal[3].stem,null);}else assert.equal(r.chart.smallLuck.method,options.smallLuck);results.push({unknownTime,...options,status:'pass'});}
for(const options of choices(Object.entries(modes)))check(original,options,false);
for(const options of choices(Object.entries({...modes,solarTime:['civil'],smallLuck:['fixed-origin']})))check(unknown,options,true);
assert.equal(JSON.stringify(original),before);assert.equal(JSON.stringify(unknown),unknownBefore);
for(const options of [
 {solarTime:'apparent',dayBoundary:'zi-23',yearBoundary:'lunar-new-year',luckStart:'three-days-year-minute-day',smallLuck:'fixed-origin'},
 {solarTime:'civil',dayBoundary:'zi-23',yearBoundary:'lunar-new-year',luckStart:'three-days-year-minute-day',smallLuck:'hour-pillar'}
])assert.throws(()=>recalculate(unknown,options),/时辰不详/);
const report={status:'executed-pass',validCombinations:results.length,invalidUnknownCombinations:2,originalChartsUnchanged:true,results};fs.writeFileSync(path.join(out,'algorithm-combinations.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({validCombinations:results.length,invalidUnknownCombinations:2}));
