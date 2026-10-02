'use strict';
const STEMS='甲乙丙丁戊己庚辛壬癸',BRANCHES='子丑寅卯辰巳午未申酉戌亥';
const cycle=n=>STEMS[(n%10+10)%10]+BRANCHES[(n%12+12)%12];
function smallLuckIndex({method='fixed-origin',sex,natal,nominalAge}){
 if(!Number.isInteger(nominalAge)||nominalAge<1)throw Error('小运需要有效虚岁');
 if(method==='fixed-origin')return(sex==='male'?2:8)+(sex==='male'?1:-1)*(nominalAge-1);
 if(method!=='hour-pillar')throw Error('Small luck supports fixed-origin or hour-pillar');
 const pillar=natal?.[3];
 if(!pillar?.stem||!pillar?.branch)throw Error('时辰不详，不能采用依赖时柱的时柱起小运算法');
 const origin=Array.from({length:60},(_,i)=>cycle(i)).indexOf(pillar.stem+pillar.branch);
 if(origin<0)throw Error('小运的出生时柱无效');
 const forward=(STEMS.indexOf(natal[0].stem)%2===0)===(sex==='male');
 // Age one is already one step away from the natal hour pillar. The caller
 // uses the suite's lunar-new-year age boundary, including late zi hour.
 return origin+(forward?1:-1)*nominalAge;
}
function smallLuckForYear({year,nominalBirthYear,...data}){return cycle(smallLuckIndex({...data,nominalAge:year-nominalBirthYear+1}));}
module.exports={smallLuckIndex,smallLuckForYear};
