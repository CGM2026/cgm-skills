"use strict";
const fs=require('node:fs');
const {validate}=require('../../cgm-bazi-chart/scripts/chart.cjs');
function render(data,manifestFile,out){
 validate(data);
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 if(manifest.schema!=='cgm-bazi-template/1'||manifest.adapter!=='kimi-book-v1')throw Error('此发布版使用 kimi-book-v1 模板；历史设计样稿请保留原件，重新生成时改用 assets/kimi-book-v1.json');
 return require('./render-kimi.cjs').renderKimi(data,manifestFile,out);
}
module.exports={render};
if(require.main===module){try{const [input,manifest,out]=process.argv.slice(2);console.log(JSON.stringify(render(JSON.parse(fs.readFileSync(input,'utf8')),manifest,out)));}catch(e){console.error(e.message);process.exitCode=1;}}
