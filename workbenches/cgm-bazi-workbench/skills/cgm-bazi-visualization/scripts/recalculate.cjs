'use strict';
const {calculateBirth,validate}=require('../../cgm-bazi-chart/scripts/chart.cjs');
function recalculate(chart,options){
 validate(chart);
 const allowed={solarTime:['apparent','civil','mean'],dayBoundary:['zi-23','midnight','split-zi'],yearBoundary:['lunar-new-year','lichun-instant'],luckStart:['three-days-year-minute-day','three-days-year-minute','three-days-year-shichen'],smallLuck:['fixed-origin','hour-pillar']};
 options={luckStart:chart.rules.conventions.luckStart,smallLuck:chart.rules.conventions.smallLuck||'fixed-origin',...options};
 if(!options||Object.keys(options).some(k=>!allowed[k])||Object.entries(allowed).some(([k,v])=>!v.includes(options[k])))throw Error('排盘口径无效');
 if(chart.person.birth.timeStatus==='unknown'&&options.solarTime!=='civil')throw Error('时辰不详只能使用钟表日期参照，请交由 Agent 补充资料');
 if(chart.rules.conventions.solarTime==='provided-apparent')throw Error('本案例使用有来源的已校正时间，请交由 Agent 核对原始钟表资料后重新排盘');
 const input={schema:'cgm-bazi-birth/1',name:chart.person.name,birth:structuredClone(chart.person.birth),conventions:{...chart.rules.conventions,...options}};
 // Preserve input evidence; normalized/display fields are recalculated by the calculator.
 delete input.birth.solarDate;delete input.birth.status;
 if(input.birth.timeStatus==='unknown'&&input.birth.timeEvidence?.kind==='unknown')delete input.birth.timeEvidence;
 const next=calculateBirth(input);
 next.initial={year:Math.max(next.years[0].year,Math.min(chart.initial.year,next.years.at(-1).year)),month:chart.initial.month};
 validate(next);
 const describe=c=>({pillars:c.natal.map(p=>p.status==='unknown'?'〇':p.stem+p.branch),direction:c.luckExact?({forward:'顺排',backward:'逆排'}[c.luckExact.direction]||c.luckExact.direction):'仅日期参照',start:c.luckExact?(c.rules.conventions.luckStart==='three-days-year-minute'?c.luckExact.startLocal:c.luckExact.startDate||c.luckExact.startLocal.slice(0,10)):'时辰不详，不提供精确交运',smallLuck:c.rules.conventions.smallLuck==='hour-pillar'?'时柱起算':'固定起点',conventions:c.rules.conventions});
 return {chart:next,before:describe(chart),after:describe(next)};
}
module.exports={recalculate};
