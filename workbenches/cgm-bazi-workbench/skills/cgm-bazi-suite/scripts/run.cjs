'use strict';
const fs=require('node:fs'),path=require('node:path');
const {historicalFixture,calculateBirth,validate}=require('../../cgm-bazi-chart/scripts/chart.cjs');
const {render}=require('../../cgm-bazi-visualization/scripts/render.cjs');
const cp=require('node:child_process');
try{
 const args=process.argv.slice(2),settingsIndex=args.indexOf('--settings');
 const settingsOverride=settingsIndex<0?undefined:args[settingsIndex+1];
 if(settingsIndex>=0){if(!settingsOverride)throw Error('--settings 需要文件路径');args.splice(settingsIndex,2);}
 const manual=args.includes('--manual');if(manual)args.splice(args.indexOf('--manual'),1);
 const [mode,input,outDir,manifestArg]=args;
 if(!['birth','chart','historical-fixture','workspace'].includes(mode)||!input||!outDir)throw Error('Usage: run.cjs workspace|birth|chart|historical-fixture input output-directory [library-or-template]');
 const payload=mode==='historical-fixture'?null:JSON.parse(fs.readFileSync(input,'utf8'));
 const preferences=require('../../cgm-bazi-chart/scripts/preferences.cjs');
 const libraryRoot=mode==='workspace'?path.resolve(manifestArg||require('../../cgm-bazi-chart/scripts/local-installation.cjs').library()||'bazi-case-library'):undefined;
 const settingsPath=path.resolve(settingsOverride||preferences.defaultSettingsPath(libraryRoot));
 if(libraryRoot){const relative=path.relative(path.dirname(libraryRoot),settingsPath);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('案例工作页的默认设置须位于案例库父目录内，请在该目录选择 --settings 文件');}
 const chart=mode==='birth'||(mode==='workspace'&&payload.schema==='cgm-bazi-birth/1')?calculateBirth(preferences.resolveInput(payload,{settingsPath,manual})):mode==='chart'||mode==='workspace'?validate(payload):historicalFixture(input);
 const manifest=manifestArg||path.resolve(__dirname,'../../cgm-bazi-visualization/assets/kimi-book-v1.json');
 fs.mkdirSync(outDir,{recursive:true});
 const json=path.join(outDir,'命盘数据-工作稿.json'),html=path.join(outDir,'八字排盘-数据接入工作稿.html');
 const entry=path.join(outDir,'工作页入口.json');
 if(fs.existsSync(json)||fs.existsSync(html)||fs.existsSync(entry))throw Error('Output exists; choose a new output directory to preserve previous draft');
 fs.writeFileSync(json,JSON.stringify(chart,null,2));
 if(mode==='workspace'){
  const python=require('../../cgm-bazi-chart/scripts/local-installation.cjs').python();
  const script=path.resolve(__dirname,'../../cgm-bazi-visualization/scripts/case-library.py');
  const library=libraryRoot;
  const call=args=>{const r=cp.spawnSync(python,[script,'--library',library,...args],{encoding:'utf8',windowsHide:true,env:{...process.env,CGM_BAZI_NODE:process.execPath,CGM_BAZI_SETTINGS:settingsPath,PYTHONUTF8:'1'}});if(r.error||r.status!==0)throw Error(r.error?.message||r.stderr.trim());return JSON.parse(r.stdout);};
  const created=call(['create','--chart',path.resolve(json)]);
  const view=created.views.find(v=>v.mode==='year');
  const opened=call(['open','--view',view.id]);
  const report={status:'working-draft',json,library,...created,...opened};
  fs.writeFileSync(entry,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }else{
 const report=render(chart,manifest,html);
 console.log(JSON.stringify({json,html,...report}));
 }
}catch(e){console.error(JSON.stringify({ok:false,code:e.code||'CALCULATION_FAILED',message:e.message,...e.details}));process.exitCode=e.code?2:1;}
