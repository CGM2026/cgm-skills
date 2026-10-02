'use strict';
const fs=require('node:fs'),path=require('node:path');
const {RECOMMENDED,OPTIONS,normalizeConventions}=require('./conventions.cjs');
class PreferenceError extends Error{constructor(code,message,details={}){super(message);this.code=code;this.details=details;}}
const defaultSettingsPath=library=>process.env.CGM_BAZI_SETTINGS?path.resolve(process.env.CGM_BAZI_SETTINGS):library?path.resolve(library,'..','.cgm-bazi','settings.json'):path.resolve('.cgm-bazi','settings.json');
function readPreferences(settingsPath=defaultSettingsPath()){
 let data={schema:'cgm-bazi-preferences/1',revision:0,setupComplete:false,conventions:{...RECOMMENDED}};
 if(fs.existsSync(settingsPath)){
  const saved=JSON.parse(fs.readFileSync(settingsPath,'utf8'));
  if(saved.schema!==data.schema||!Number.isSafeInteger(saved.revision)||saved.revision<1||saved.setupComplete!==true)throw new PreferenceError('INVALID_PREFERENCES','个人排盘设置文件无效，请保留原文件并检查。');
  data={...saved,conventions:normalizeConventions(saved.conventions)};
 }
 return {...data,recommended:{...RECOMMENDED},options:OPTIONS};
}
function savePreferences(settingsPath,payload){
 if(!payload||payload.confirmed!==true)throw new PreferenceError('CONFIRMATION_REQUIRED','请在设置页确认选项后保存。');
 if(!Number.isSafeInteger(payload.expectedRevision)||payload.expectedRevision<0)throw new PreferenceError('REVISION_REQUIRED','保存设置需要当前版本号，请重新打开设置页。');
 const conventions=normalizeConventions(payload.conventions);
 fs.mkdirSync(path.dirname(settingsPath),{recursive:true});
 const lock=settingsPath+'.lock';let fd;
 try{fd=fs.openSync(lock,'wx');}catch(e){if(e.code==='EEXIST')throw new PreferenceError('PREFERENCES_REVISION_CONFLICT','设置正在被另一窗口更新，请重新加载后再保存。');throw e;}
 const temporary=settingsPath+'.'+process.pid+'.tmp';
 try{
  const current=readPreferences(settingsPath);
  if(current.revision!==payload.expectedRevision)throw new PreferenceError('PREFERENCES_REVISION_CONFLICT','另一窗口已修改默认设置，请重新加载后核对。',{current});
  const saved={schema:current.schema,revision:current.revision+1,setupComplete:true,conventions,updatedAt:new Date().toISOString()};
  fs.writeFileSync(temporary,JSON.stringify(saved,null,2)+'\n',{flag:'wx'});
  fs.renameSync(temporary,settingsPath);
  return readPreferences(settingsPath);
 }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);fs.closeSync(fd);fs.unlinkSync(lock);}
}
function resolveInput(input,{settingsPath=defaultSettingsPath(),manual=false}={}){
 if(!input||input.schema!=='cgm-bazi-birth/1')throw Error('Expected cgm-bazi-birth/1');
 const settings=readPreferences(settingsPath),requested=input.conventions||{};
 normalizeConventions(requested,{allowProvidedApparent:true});
 if(!manual&&!settings.setupComplete)throw new PreferenceError('SETUP_REQUIRED','首次使用请打开排盘设置，接受推荐或修改后确认，再开始排盘。',{settings});
 const conflicts=Object.entries(requested).filter(([key,value])=>value!==settings.conventions[key]).map(([key,value])=>({key,label:OPTIONS[key]?.label||key,current:settings.conventions[key],requested:value}));
 if(!manual&&conflicts.length)throw new PreferenceError('METHOD_CONFLICT','本次要求与个人默认设置冲突，请在设置页手动切换后重试。',{conflicts,settings});
 const conventions=normalizeConventions({...settings.conventions,...(manual?requested:{})},{allowProvidedApparent:manual});
 if(input.birth&&(input.birth.time==null||input.birth.timeStatus==='unknown')){
  if(conventions.smallLuck==='hour-pillar')throw new PreferenceError('TIME_REQUIRED','时辰不详，不能采用时柱起小运；请手动选择固定起点法。');
  if(conventions.solarTime!=='civil')throw new PreferenceError('TIME_REQUIRED','时辰不详无法换算太阳时；请明确使用钟表日期参照，结果会标记为日期参考。');
 }
 return {...structuredClone(input),conventions};
}
module.exports={readPreferences,savePreferences,resolveInput,defaultSettingsPath,PreferenceError};
if(require.main===module){
 try{
  const args=process.argv.slice(2),mode=args.shift();
  const value=flag=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1];};
  const settingsPath=path.resolve(value('--settings')||defaultSettingsPath());
  let result;
  if(mode==='get')result=readPreferences(settingsPath);
  else{const file=value('--input');if(!file)throw Error('需要 --input JSON 文件');const input=JSON.parse(fs.readFileSync(file,'utf8'));if(mode==='save')result=savePreferences(settingsPath,input);else if(mode==='resolve')result=resolveInput(input,{settingsPath,manual:args.includes('--manual')});else throw Error('Usage: preferences.cjs get|save|resolve --settings FILE [--input JSON] [--manual]');}
  console.log(JSON.stringify(result));
 }catch(e){console.log(JSON.stringify({ok:false,code:e.code||'INVALID_REQUEST',message:e.message,...e.details}));process.exitCode=e instanceof PreferenceError?2:1;}
}
