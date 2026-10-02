'use strict';
const cp=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const local=path.resolve(__dirname,'../../../.cgm-hellenistic-astrology/runtime/Scripts/python.exe');
const python=process.env.CGM_BAZI_PYTHON||(fs.existsSync(local)?local:process.platform==='win32'?'python':'python3');
const result=cp.spawnSync(python,['-c',"import sys,swisseph,sqlite3;from zoneinfo import ZoneInfo;ZoneInfo('Asia/Shanghai');ZoneInfo('America/New_York');assert sys.version_info>=(3,9);assert hasattr(swisseph,'solcross_ut');print(sys.version.split()[0],swisseph.version,'SQLite',sqlite3.sqlite_version)"],{encoding:'utf8',windowsHide:true});
let icu=false;try{icu=new Intl.DateTimeFormat('en-u-ca-chinese').resolvedOptions().calendar==='chinese';}catch{}
const ok=Number(process.versions.node.split('.')[0])>=18&&icu&&!result.error&&result.status===0;
console.log(JSON.stringify({ok,node:process.versions.node,icu:process.versions.icu,chineseCalendar:icu,python,pythonResult:result.stdout?.trim(),error:result.error?.message||result.stderr?.trim()||null,instructions:'首次使用前阅读 references/first-use.md；缺项不会自动安装。CGM_BAZI_PYTHON 可指定已有解释器。'},null,2));
if(!ok)process.exitCode=1;
