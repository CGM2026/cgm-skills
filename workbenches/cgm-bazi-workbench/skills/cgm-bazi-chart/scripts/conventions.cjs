'use strict';
// Shared calculation keys; presentation code can read this catalogue without
// importing the calculation engine or starting the Python runtime.
const RECOMMENDED=Object.freeze({yearBoundary:'lunar-new-year',monthBoundary:'jie-instant',dayBoundary:'zi-23',solarTime:'apparent',luckDirection:'year-yinyang-sex',luckStart:'three-days-year-minute-day',smallLuck:'fixed-origin'});
const OPTIONS=Object.freeze({
 solarTime:{label:'时间口径',group:'四柱排法',values:{apparent:'真太阳时',mean:'平太阳时',civil:'钟表时'}},
 dayBoundary:{label:'子时排法',group:'四柱排法',values:{'zi-23':'子初换日',midnight:'零点换日','split-zi':'早晚子时分排'}},
 yearBoundary:{label:'年柱换年',group:'四柱排法',values:{'lunar-new-year':'春节子初','lichun-instant':'立春交节'}},
 luckStart:{label:'起运算法',group:'起运与小运',values:{'three-days-year-minute-day':'分钟折算至天','three-days-year-minute':'分钟折算至小时','three-days-year-shichen':'时辰折算法'}},
 smallLuck:{label:'小运排法',group:'起运与小运',values:{'fixed-origin':'固定起点法','hour-pillar':'时柱起算法'}}
});
function normalizeConventions(value={},options={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('排盘口径须为对象');
 const result={...RECOMMENDED,...value};
 for(const key of Object.keys(value))if(!Object.hasOwn(RECOMMENDED,key))throw Error('不支持的排盘口径：'+key);
 for(const [key,entry]of Object.entries(OPTIONS)){
  if(key==='solarTime'&&options.allowProvidedApparent&&result[key]==='provided-apparent')continue;
  if(!Object.hasOwn(entry.values,result[key]))throw Error('Unsupported convention：不支持的 '+key+'；可选 '+Object.keys(entry.values).join(' / '));
 }
 for(const key of ['monthBoundary','luckDirection'])if(result[key]!==RECOMMENDED[key])throw Error('不支持的固定计算规则：'+key);
 return result;
}
module.exports={RECOMMENDED,OPTIONS,normalizeConventions};
