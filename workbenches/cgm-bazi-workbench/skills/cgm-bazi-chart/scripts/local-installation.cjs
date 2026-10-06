'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function profile(){
 const file=process.env.CGM_WORKBENCH_CONFIG||path.join(os.homedir(),'.cgm-workbenches','locations.json');
 if(!fs.existsSync(file))return {};
 const data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
 if(data.schema!=='cgm-workbench-locations/1')throw Error('本机工作台位置配置格式无效：'+file);
 return data;
}
function location(key){const value=profile()[key];if(!value)return undefined;if(!path.isAbsolute(value))throw Error('本机工作台位置必须为绝对路径：'+key);return value;}
function library(){const value=location('bazi_library');if(value&&!fs.existsSync(path.join(value,'cases.sqlite3')))throw Error('已登记案例库不可用，请核对位置：'+value);return value;}
function python(){
 if(process.env.CGM_BAZI_PYTHON)return process.env.CGM_BAZI_PYTHON;
 const registered=location('python');if(registered&&fs.existsSync(registered))return registered;
 const local=path.resolve(__dirname,'../../../.cgm-hellenistic-astrology/runtime',process.platform==='win32'?'Scripts/python.exe':'bin/python');
 return fs.existsSync(local)?local:process.platform==='win32'?'python':'python3';
}
module.exports={profile,location,library,python};
if(require.main===module)console.log(JSON.stringify({...profile(),resolvedPython:python()}));
