'use strict';
const fs=require('node:fs'),path=require('node:path');
const {validate,sha}=require('../../cgm-bazi-chart/scripts/chart.cjs');
const {atDate}=require('../../cgm-bazi-chart/scripts/timeline.cjs');
const {render}=require('./render.cjs');
function objects(chart,mode,selection={},requestedObject){
 const list=[{id:'case',label:'案例档案'},...chart.natal.map((p,i)=>({id:'natal:'+i,label:['年柱','月柱','日柱','时柱'][i]+' '+(p.status==='unknown'?'〇':p.stem+p.branch)}))];
 const year=chart.years.find(y=>y.year===selection.year);
 if(year){
  list.push({id:'year:'+year.year,label:year.year+'年 '+year.gz});
  const p=chart.luck.find(p=>p.start<=year.year&&year.year<=p.end);
  if(p&&!p.kind?.startsWith('small-luck'))list.push({id:'luck:'+p.exactPeriodIndex,label:p.gz+'大运（年度浏览）'});
  if(mode!=='year'&&Number.isInteger(selection.month)){
   const m=chart.calendarView.years.find(y=>y.year===year.year)?.months[selection.month];
   if(m){list.push({id:'month:'+year.year+':'+m.index,label:m.term+' '+year.months[m.index].gz});
    if(mode==='day'){const day=m.days.find(d=>d.date===selection.day);if(day)list.push({id:'day:'+day.date,label:day.date+' '+day.gz});}
   }
  }
 }
 if(requestedObject&&!list.some(o=>o.id===requestedObject)&&validObject(chart,mode,requestedObject)){
  let label=requestedObject;
  if(requestedObject.startsWith('day:'))label=requestedObject.slice(4)+' 流日笔记';
  else if(requestedObject.startsWith('year:'))label=requestedObject.slice(5)+'年笔记';
  else if(requestedObject.startsWith('month:')){const [,y,m]=requestedObject.split(':');label=y+'年 '+chart.years.find(v=>v.year===Number(y)).months[Number(m)].term+'笔记';}
  else if(requestedObject.startsWith('luck:'))label='第'+requestedObject.slice(5)+'段大运笔记';
  list.push({id:requestedObject,label});
 }
 return list;
}
function validObject(chart,mode,id){
 if(id==='case'||/^natal:[0-3]$/.test(id))return true;
 let match=id.match(/^year:(\d{1,4})$/);if(match)return chart.years.some(y=>y.year===Number(match[1]));
 match=id.match(/^luck:(\d{1,2})$/);if(match)return chart.luck.some(p=>p.exactPeriodIndex===Number(match[1]));
 match=id.match(/^month:(\d{1,4}):(\d{1,2})$/);if(match)return mode!=='year'&&objects(chart,mode,{year:Number(match[1]),month:Number(match[2])}).some(o=>o.id===id);
 match=id.match(/^day:(\d{4}-\d{2}-\d{2})$/);if(match)return mode==='day'&&chart.calendarView.years.some(y=>y.months.some(m=>m.days.some(d=>d.date===match[1])));
 return false;
}
try{
 const input=JSON.parse(fs.readFileSync(0,'utf8')),chart=validate(input.chart);let result;
 if(input.action==='validate')result={name:chart.person.name,identity:sha(JSON.stringify({name:chart.person.name,birth:chart.person.birth,natal:chart.natal,conventions:chart.rules.conventions})),chartSha256:sha(JSON.stringify(chart)),protocolRevision:chart.protocolRevision||1};
 else if(input.action==='date')result=atDate(chart,input.date);
 else if(input.action==='objects')result=objects(chart,input.mode,input.selection,input.requestedObject);
 else if(input.action==='valid-object')result={valid:validObject(chart,input.mode,input.object)};
 else if(input.action==='research-validate')result=require('./research.cjs').validateResearch(chart,input.mode,input.state,input.previous);
 else if(input.action==='recalculate')result=require('./recalculate.cjs').recalculate(chart,input.options);
 else if(input.action==='export-fonts'){
  const {subsetTTF}=require('./export-font.cjs'),base=path.resolve(__dirname,'../assets/template/assets/fonts');
  result={fonts:[['ZhaohuaTitleA','朝华标题A-huozi.ttf'],['HuiwenMincho','汇文明朝体-huozi.ttf']].map(([family,file])=>({family,data:subsetTTF(fs.readFileSync(path.join(base,file)),input.text+'年月日时运').toString('base64')}))};
 }
 else if(input.action==='render')result=render(chart,input.manifest||path.resolve(__dirname,'../assets/kimi-book-v1.json'),input.output,{workbench:input.workbench===true});
 else throw Error('Unsupported library action');
 console.log(JSON.stringify(result));
}catch(e){console.error(e.message);process.exitCode=1;}
