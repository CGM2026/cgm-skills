'use strict';
// ICU Chinese calendar built into Node; fixed UTC+8 civil-date conversion.
const formatter=new Intl.DateTimeFormat('en-u-ca-chinese',{year:'numeric',month:'numeric',day:'numeric',timeZone:'Asia/Shanghai'});
function solarDate(s){
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('Date must be YYYY-MM-DD');
 const d=new Date(s+'T04:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==s)throw Error('Invalid Gregorian date');return d;
}
function toLunar(s){
 const parts=Object.fromEntries(formatter.formatToParts(solarDate(s)).map(p=>[p.type,p.value]));
 if(!parts.relatedYear||!/^\d+(bis)?$/.test(parts.month))throw Error('ICU Chinese calendar unsupported');
 return {year:Number(parts.relatedYear),month:parseInt(parts.month),day:Number(parts.day),isLeapMonth:parts.month.endsWith('bis')};
}
function toSolar(l){
 if(!Number.isInteger(l.year)||l.year<1||l.year>2099||!Number.isInteger(l.month)||l.month<1||l.month>12||!Number.isInteger(l.day)||l.day<1||l.day>30||typeof l.isLeapMonth!=='boolean')throw Error('Invalid lunar date; supported years 1–2099; explicit isLeapMonth required');
 for(let d=solarDate(String(l.year).padStart(4,'0')+'-01-01'),stop=+solarDate(String(l.year+1).padStart(4,'0')+'-03-01');+d<stop;d.setUTCDate(d.getUTCDate()+1)){
  const s=d.toISOString().slice(0,10),v=toLunar(s);
  if(v.year===l.year&&v.month===l.month&&v.day===l.day&&v.isLeapMonth===l.isLeapMonth)return s;
 }
 throw Error('Lunar date does not exist');
}
function label(l){const n=['正','二','三','四','五','六','七','八','九','十','冬','腊'];const digits='一二三四五六七八九';const d=l.day<=9?'初'+digits[l.day-1]:l.day===10?'初十':l.day<20?'十'+digits[l.day-11]:l.day===20?'二十':l.day<30?'廿'+digits[l.day-21]:'三十';return '农历'+(l.isLeapMonth?'闰':'')+n[l.month-1]+'月'+d;}
function julianToSolar(s){
 if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('Julian date must be YYYY-MM-DD');
 const [y,m,d]=s.split('-').map(Number),days=[31,y%4===0?29:28,31,30,31,30,31,31,30,31,30,31];
 if(y<1||y>2099||m<1||m>12||d<1||d>days[m-1])throw Error('Invalid Julian date');
 const a=Math.floor((14-m)/12),yy=y+4800-a,mm=m+12*a-3;
 const jdn=d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-32083;
 return new Date((jdn-2440588)*86400000).toISOString().slice(0,10);
}
module.exports={solarDate,toLunar,toSolar,label,julianToSolar};
