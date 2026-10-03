'use strict';
// Research metadata references immutable calculator facts; it never calculates pillars.
function sceneIds(chart, mode, selection){
 const y=chart.years.find(y=>y.year===selection.year);
 if(!y||!Number.isInteger(selection.month)||selection.month<0||selection.month>11)throw Error('研究现场年月无效');
 const m=chart.calendarView.years.find(y=>y.year===selection.year)?.months[selection.month];
 if(mode==='day'&&!m?.days.some(d=>d.date===selection.day))throw Error('研究日期不属于该流月');
 const bases=chart.natal.map((_,i)=>'natal:'+i);
 if(mode==='year')bases.push('flow:luck:'+selection.year,'flow:year:'+selection.year);
 if(mode==='month')bases.push('flow:luck:'+selection.year,'flow:year:'+selection.year,'flow:month:'+selection.year+':'+selection.month);
 if(mode==='day')bases.push('flow:month:'+selection.year+':'+selection.month,'flow:day:'+selection.day);
 return bases;
}
function sceneObjects(chart,mode,selection,type){
 const bases=sceneIds(chart,mode,selection),y=chart.years.find(y=>y.year===selection.year),m=chart.calendarView.years.find(y=>y.year===selection.year)?.months[selection.month];
 const actual=new Set();
 for(const base of bases){
  if(type==='natal'&&!base.startsWith('natal:'))continue;
  const natal=base.startsWith('natal:'),p=natal?chart.natal[Number(base.split(':')[1])]:null;
  if(p?.status==='unknown')continue;
  let branch=p?.branch;
  if(!natal){const kind=base.split(':')[1];branch=(kind==='luck'?chart.luck.find(l=>l.start<=selection.year&&selection.year<=l.end)?.gz:kind==='year'?y.gz:kind==='month'?y.months[selection.month].gz:m?.days.find(d=>d.date===selection.day)?.gz)?.[1];}
  if(!branch)continue;
  actual.add(base);actual.add(base+':stem');actual.add(base+':branch');
  if(type==='natal'&&natal)actual.add(base+':god');
  // Existing IDs count all natal hidden stems, but comparison IDs count only
  // the displayed auxiliary stems. Preserve that established naming contract.
  const count=(chart.branchHidden[branch]?.length||0)-(type==='natal'&&natal?0:1);
  for(let i=0;i<count;i++)actual.add(base+':hidden:'+i);
 }
 return actual;
}
function validateResearch(chart,mode,state,previous){
 const fail=m=>{throw Error(m)},warnings=[];
 if(!state||state.schema!=='bazi-research/1'||!Array.isArray(state.layers)||state.layers.length>100)fail('研究图层结构无效');
 if(state.archive?.version===2){
  const a=state.archive, recordIds=new Set();
  const fields=r=>r&&typeof r.title==='string'&&r.title.length<=80&&typeof r.date==='string'&&(!r.date||/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&!Number.isNaN(Date.parse(r.date))&&new Date(r.date).toISOString().slice(0,10)===r.date)&&['analysis','feedback'].every(k=>typeof r[k]==='string'&&r[k].length<=100000);
  if(!Array.isArray(a.records)||a.records.length>500||!Array.isArray(a.deleted)||a.deleted.length>500)fail('档案记录结构无效');
  for(const r of [...a.records,...a.deleted]){
   if(!fields(r)||!r.title.trim()||!r.analysis.trim()&&!r.feedback.trim()||typeof r.id!=='string'||!r.id||recordIds.has(r.id)||typeof r.createdAt!=='string')fail('档案记录标题或正文无效');
   recordIds.add(r.id);
  }
  if(a.draft!==null&&(!fields(a.draft)||a.draft.id!=='new'&&!a.records.some(r=>r.id===a.draft.id)))fail('档案草稿无效');
  if(a.draft?.patch!==undefined&&(!a.draft.patch||typeof a.draft.patch!=='object'||Array.isArray(a.draft.patch)||Object.keys(a.draft.patch).some(k=>!['title','date','analysis','feedback'].includes(k))||!fields({...a.draft,...a.draft.patch})))fail('档案草稿改动字段无效');
 }
 for(const a of [state.archive?.version===2?undefined:state.archive,state.archiveLegacy].filter(a=>a!==undefined)){
  const tabIds=new Set();
  if(!a||!Array.isArray(a.tabs)||a.tabs.length>100||!Array.isArray(a.deleted)||a.deleted.length>100||typeof a.timeline!=='boolean')fail('档案分类结构无效');
  for(const t of [...a.tabs,...a.deleted]){
   if(!t||typeof t.id!=='string'||!t.id||tabIds.has(t.id)||typeof t.name!=='string'||!t.name.trim()||t.name.length>30||typeof t.text!=='string'||t.text.length>100000)fail('档案分类名称或正文无效');
   tabIds.add(t.id);
  }
  if(a.tabs.length?!a.tabs.some(t=>t.id===a.active):a.active!==null)fail('当前档案分类无效');
 }
 const ids=new Set(), noteIds=new Set();
 for(const l of state.layers){
  if(typeof l.id!=='string'||!l.id||ids.has(l.id)||typeof l.name!=='string'||!l.name.trim()||l.name.length>40||!['natal','progression'].includes(l.type)||l.mode!==mode)fail('图层身份、名称或盘式无效');
  ids.add(l.id);
  const bases=sceneIds(chart,mode,l.scene),actual=sceneObjects(chart,mode,l.scene,l.type),oldLayer=previous?.layers?.find(p=>p.id===l.id);
  if(!Number.isFinite(l.fade)||l.fade<0||l.fade>100||typeof l.projected!=='boolean'||l.type==='progression'&&l.projected)fail('图层显示设置无效');
  if(!Array.isArray(l.notes)||!Array.isArray(l.undo)||!Array.isArray(l.deleted))fail('图层笔记结构无效');
  // Unknown time is not an editable object. Known time remains selectable.
  const oldAllowed=k=>typeof k==='string'&&bases.some(b=>k===b||k.startsWith(b+':')&&/^(stem|branch|god|hidden:[0-2])$/.test(k.slice(b.length+1)))&&(l.type!=='natal'||k.startsWith('natal:'))&&!(k.startsWith('natal:3')&&chart.natal[3].status==='unknown');
  for(const n of [...l.notes,...l.deleted]){
   const oldNote=[...(Array.isArray(oldLayer?.notes)?oldLayer.notes:[]),...(Array.isArray(oldLayer?.deleted)?oldLayer.deleted:[])].find(p=>p.id===n.id);
   const allowOld=(k,existed)=>{if(actual.has(k))return true;if(existed&&oldAllowed(k)){warnings.push({code:'legacy-object',layerId:l.id,noteId:n.id,object:k,message:'旧对象在当前盘面没有对应子项，请核对；原笔记保留。'});return true;}return false;};
   const allowed=k=>allowOld(k,oldNote?.objects?.includes(k));
   if(typeof n.id!=='string'||noteIds.has(n.id)||typeof n.title!=='string'||n.title.length>60||typeof n.text!=='string'||n.text.length>100000||!Array.isArray(n.objects)||!n.objects.length||n.objects.some(k=>!allowed(k))||new Set(n.objects).size!==n.objects.length||!Array.isArray(n.marks))fail('笔记必须关联本图层的有效对象');
   noteIds.add(n.id);
   const markIds=new Set();
   for(const mark of n.marks){
    if(typeof mark.id!=='string'||!mark.id||markIds.has(mark.id)||!['ellipse','arrow'].includes(mark.type)||!['#383129','#B27A68','#6E8798'].includes(mark.color)||![1,2,3].includes(mark.weight))fail('标记身份重复或样式无效');
    markIds.add(mark.id);
    if(mark.bend!==undefined&&(!Number.isFinite(mark.bend)||Math.abs(mark.bend)>3))fail('箭头弧度无效');
    if(mark.rotation!==undefined&&(!Number.isFinite(mark.rotation)||mark.rotation<0||mark.rotation>=360))fail('标记旋转角度无效');
    const oldMark=oldNote?.marks?.find(p=>p.id===mark.id);
    for(const end of ['a','b']){const p=mark[end];if(!p||!allowOld(p.object,oldMark?.[end]?.object===p.object)||![p.x,p.y].every(v=>Number.isFinite(v)))fail('标记只能属于本研究现场');}
   }
  }
 }
 require('../assets/note-policy.js').check(state,previous);
 return {valid:true,layers:state.layers.length,warnings};
}
module.exports={sceneIds,sceneObjects,validateResearch};
