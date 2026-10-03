'use strict';
const fs=require('node:fs'),path=require('node:path');
const {validate,sha}=require('../../cgm-bazi-chart/scripts/chart.cjs');
function renderKimi(data,manifestFile,out){
 validate(data);
 if(data.calendarView?.schema!=='cgm-bazi-calendar-view/1')throw Error('Calendar view missing: regenerate using calculation member; no approximate term dates allowed');
 if(data.calendarView.dailyConvention?.id!=='jie-local-date-inclusive-v1'||data.calendarView.years.some(y=>y.months.some(m=>!m.days?.length)))throw Error('Daily calendar missing: regenerate from birth input');
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 const template=path.resolve(path.dirname(manifestFile),manifest.source);
 let html=fs.readFileSync(template,'utf8');
 if(sha(html)!==manifest.sourceSha256)throw Error('Frozen Kimi template changed: review differences before updating manifest');
 const originalCSS=html.match(/<style>([\s\S]*?)<\/style>/)[1];
 const replace=(a,b)=>{if(!html.includes(a))throw Error('Kimi template anchor missing: '+a.slice(0,80));html=html.replace(a,()=>b)};
 const section=(a,b,s)=>{const i=html.indexOf(a),j=html.indexOf(b,i);if(i<0||j<0)throw Error('Kimi section anchor missing: '+a+' → '+b);html=html.slice(0,i)+s+'\n'+html.slice(j)};
 const safe=JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 const escaped=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 replace('<title>示例 · 八字排盘</title>','<title>'+escaped(data.person.name)+' · 八字排盘</title>');
 replace('<div>出生地点</div>','<div>'+escaped(data.person.locationLabel)+'</div>');
 replace('<script>',`<script type="application/json" id="chart-data">${safe}</script>\n<script>`);
 replace("'use strict';","'use strict';\nconst chart=JSON.parse(document.getElementById('chart-data').textContent);");
 section('const elements=','/* ================= 人名',`const elements=chart.elements;
const color=c=>Object.keys(elements).find(k=>elements[k].includes(c))||'';
const escapeText=v=>String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const godMap=chart.godMap;
const branchHidden=Object.fromEntries(Object.entries(chart.branchHidden).map(([b,hs])=>[b,hs.map(s=>s+godMap[s])]));
branchHidden['〇']=[];
const mod=(n,d)=>(n%d+d)%d;
const yearMap=new Map(chart.years.map(y=>[y.year,y]));
const calendarMap=new Map(chart.calendarView.years.map(y=>[y.year,y]));
const yearGz=y=>yearMap.get(y)?.gz;
const monthGz=(y,m)=>yearMap.get(y)?.months[m]?.gz;
const monthInfo=(y,m)=>calendarMap.get(y)?.months[m];
const terms=chart.years[0].months.map(m=>m.term);
const age=y=>calendarMap.get(y).nominalAge;
document.title=chart.person.name+' · 八字排盘工作稿';
const info=document.querySelector('.person-info').children;
info[0].textContent=chart.person.locationLabel;
info[1].textContent=chart.person.dateLabel;
`);
 replace("const personName='示例';", "const personName=/^[\\p{Script=Han}]+$/u.test(chart.person.name)?[...chart.person.name].slice(0,4).join(''):chart.person.name;");
 section('const personName=','/* ================= 命例数据',fs.readFileSync(path.join(__dirname,'name-layout.browser.js'),'utf8'));
 replace("const natal=[['','〇','〇'],['','〇','〇'],['','〇','〇'],['','〇','〇']];","const natal=chart.natal.map((p,i)=>p.status==='unknown'?['','〇','〇']:[i===2?chart.dayLabel:godMap[p.stem],p.stem,p.branch]);");
 replace("p[0]==='女'?'day-master':'rooted'","p===natal[2]?'day-master':'rooted'");
 replace('">女</span>`','">${chart.dayLabel}</span>`');
 replace("class=\"major ${color(p[1])}\"","class=\"major ${p[1]==='〇'?'inactive':color(p[1])}\"");
 replace('function branchUnit(branch){',`function branchUnit(branch){
  if(branch==='〇')return '<div class="unit branch-unit"><span class="major inactive">〇</span><div class="side" aria-hidden="true"></div></div>';`);
 replace('function column(p){',`function column(p){
  if(p.stem==='〇')return '<div class="compare-col" aria-label="时柱不详"><div class="compare-main inactive">〇</div><div class="compare-main inactive">〇</div><div class="compare-minor"></div></div>';`);
 replace('function symbol(p,stem,on,minor){',"let notation='gods';\nfunction symbol(p,stem,on,minor,display=stem){");
 replace('${godMap[stem]}</span>','${notation===\'stems\'?display:godMap[stem]}</span>');
 replace('symbol(p,p.hidden[0],p.hiddenOn[0],false)','symbol(p,p.hidden[0],p.hiddenOn[0],false,p.branch)');
 replace('const top=p.index===2','const top=p.index===2&&notation===\'gods\'');
 section('const luckChoices=','let mode=',`const luckChoices=chart.luck;
const majorLuckIndexes=luckChoices.map((l,i)=>({l,i})).filter(({l})=>!l.kind?.startsWith('small-luck')&&l.kind!=='pre-luck-month-pillar-reference').map(({i})=>i);
const selection={luck:Math.max(0,luckChoices.findIndex(l=>chart.initial.year>=l.start&&chart.initial.year<=l.end)),year:chart.initial.year,month:chart.initial.month};`);
 section('function syncLuck(){','function visibleWindow',`function syncLuck(){selection.luck=luckChoices.findIndex(l=>selection.year>=l.start&&selection.year<=l.end);}
function choose(kind,index){
  if(!Number.isInteger(index))return;
  if(kind==='luck'){
    index=majorLuckIndexes[index];
    if(!Number.isInteger(index))return;
    if(index<0||index>=luckChoices.length)return;
    const year=luckChoices[index].start;if(!yearMap.has(year)||year<chart.person.birthYear)return;
    selection.luck=index;selection.year=year;selection.month=0;
  }else if(kind==='years'){
    const year=selection.year+index-3;if(!yearMap.has(year)||year<chart.person.birthYear)return;
    selection.year=year;selection.month=0;syncLuck();
  }else if(kind==='months'){
    const total=selection.year*12+selection.month+index-3,year=Math.floor(total/12);
    if(!yearMap.has(year)||year<chart.person.birthYear)return;
    selection.year=year;selection.month=mod(total,12);syncLuck();
  }else return;
  renderAll();
}`);
 replace("function row(gz,label,age=''){return", "function row(gz,label,age=''){if(!gz)return null;label=escapeText(label);age=escapeText(age);return");
 replace('if(next>=0&&next<rows.length)choose','if(next>=0&&next<rows.length&&rows[next]!==null)choose');
 section('function renderAll(){','renderAll();\nlet resizeTimer;',`function renderAll(){
  renderComparison(); /* Apply visible section order before measuring wheel hosts. */
  const currentMonth=monthInfo(selection.year,selection.month);
  document.getElementById('selected-year').textContent=mode==='month'
    ?currentMonth.year+' 年 '+currentMonth.term
    :selection.year+' 年 '+age(selection.year)+' 岁';
  const majorIndex=majorLuckIndexes.indexOf(selection.luck);
  renderSelectable('luck',majorLuckIndexes.map(i=>{const l=luckChoices[i];return row(l.gz,l.label,age(l.start)+'岁')}),Math.max(0,majorIndex));
  if(majorIndex<0)document.querySelectorAll('#luck .column').forEach(el=>{el.classList.remove('selected');el.setAttribute('aria-pressed','false')});
  renderSelectable('years',Array.from({length:7},(_,i)=>{const y=selection.year+i-3;return !yearMap.has(y)||y<chart.person.birthYear?null:row(yearGz(y),String(y))}),3);
  renderSelectable('months',Array.from({length:7},(_,i)=>{
    const total=selection.year*12+selection.month+i-3,y=Math.floor(total/12),m=mod(total,12);
    if(!yearMap.has(y)||y<chart.person.birthYear)return null;
    return row(monthGz(y,m),monthInfo(y,m).label);
  }),3);
}`);
 replace("mode=mode==='year'?'month':'year';","setMode(mode==='year'?'month':mode==='month'?'day':'year');");
 replace('const radius=host.clientWidth>=650?3:2;',`const measure=document.createElement('canvas').getContext('2d');
  measure.font='700 10px '+getComputedStyle(host).getPropertyValue('--num');
  const optionMin=Math.max(34,...rows.filter(Boolean).map(r=>Math.ceil(measure.measureText(r[0]).width)+4));
  const width=host.clientWidth;
  const radius=width>=650?3:width>0&&width<5*optionMin?1:2;
  const inset=Math.min(16,Math.max(0,(width-(radius*2+1)*optionMin)/2));
  host.style.paddingLeft=inset+'px';host.style.paddingRight=inset+'px';
  host.style.setProperty('--wheel-inset',inset+'px');host.style.setProperty('--option-min',optionMin+'px');
 `);
 replace('renderAll();\nlet resizeTimer;',fs.readFileSync(path.join(__dirname,'day-view.browser.js'),'utf8')+'\nrenderAll();\nlet resizeTimer;');
 replace('renderAll();\nlet resizeTimer;',`document.getElementById('notation').addEventListener('click',()=>{
 notation=notation==='gods'?'stems':'gods';const button=document.getElementById('notation');
 button.textContent=notation==='gods'?'十神':'干支';button.setAttribute('aria-pressed',String(notation==='stems'));
 button.setAttribute('aria-label',notation==='gods'?'当前十神，点击显示干支':'当前干支，点击显示十神');renderAll();
});
renderAll();\nlet resizeTimer;`);
 replace("window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderAll,120)});",`window.addEventListener('resize',()=>{cancelAnimationFrame(resizeTimer);resizeTimer=requestAnimationFrame(renderAll)});
const wheelWidths=new WeakMap();
const wheelResize=new ResizeObserver(entries=>{let changed=false;for(const {target} of entries){const w=target.getBoundingClientRect().width;if(wheelWidths.get(target)!==w){wheelWidths.set(target,w);changed=true;}}if(changed)renderAll();});
document.querySelectorAll('.wheel-host').forEach(host=>wheelResize.observe(host));`);
 if(html.match(/<style>([\s\S]*?)<\/style>/)[1]!==originalCSS)throw Error('Frozen CSS changed');
 // User-approved narrow-screen fixes; keep the frozen source and its font sizes intact.
 replace('</style>',`/* narrow-layout-v1: approved 2026-09-10 */
@media(max-width:400px){.natal{gap:0}}
#natal .stem-god.rooted,#natal .stem-god.day-master,#natal .principal.exposed,#natal .hidden-stem.exposed{color:var(--ink);font-weight:700}
@media(min-width:360px) and (max-width:380px){.progression.month-focus .divider{margin-left:5px;margin-right:5px}}
@media(min-width:360px) and (max-width:374px){.progression:not(.month-focus) .divider{margin-left:4px;margin-right:4px}}
@media(max-width:380px){.person-info{right:var(--gutter)}}
.export-image{position:absolute;top:10px;right:calc(var(--gutter) - 6px);z-index:30;width:28px;height:28px;padding:0;display:grid;place-items:center;color:var(--muted);opacity:.42;line-height:0}
.export-image:hover,.export-image:focus-visible{opacity:.8}
.export-image:disabled{cursor:wait}
.export-image svg{width:10.166667px;height:12.833333px}
.deck-links button{white-space:nowrap;flex-shrink:0}
.person-info{bottom:-.95em}
.account-watermark span{background:var(--paper);padding:0 .65em;margin-left:-.65em}
.export-message{position:absolute;top:42px;right:var(--gutter);z-index:30;color:var(--muted);font:11px var(--sans)}
${fs.readFileSync(path.join(__dirname,'../assets/day-view.css'),'utf8')}
@media(max-width:359px){.deck-links{column-gap:2px}}
${fs.readFileSync(path.join(__dirname,'../assets/responsive-deck.css'),'utf8')}
</style>`);
 replace('<div>出生日期</div>','<div>出生日期</div>\n      <div class="account-watermark"><span>公众号｜明语星辰</span></div>');
 replace('<div>出生日期</div>','<div>'+escaped(data.person.dateLabel)+'</div>');
 replace('<main>',`<main>
<button id="export-image" class="export-image" type="button" title="导出图片" aria-label="导出当前排盘图片"><svg viewBox="4.375 2.375 15.25 19.25" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5"/></svg></button>
<span id="export-message" class="export-message" role="status" aria-live="polite"></span>`);
 replace('<button id="expand"','<button id="notation" type="button" aria-pressed="false" aria-label="当前十神，点击显示干支">十神</button>\n        <button id="expand"');
 const resources=[];
 html=html.replace(/url\('([^']+)'\)/g,(all,asset)=>{
  if(/^(data:|https?:)/.test(asset))throw Error('Remote asset requires review');
  const absolute=path.resolve(path.dirname(template),asset);if(!fs.existsSync(absolute))throw Error('Missing asset: '+asset);
  resources.push({path:absolute,sha256:sha(fs.readFileSync(absolute))});
  return "url('"+path.relative(path.dirname(path.resolve(out)),absolute).split(path.sep).map(encodeURIComponent).join('/')+"')";
 });
 // v1.0.2: carry complete notices in standalone pages, outside the image export area.
 replace('</head>',`<style id="cgm-license-style">${fs.readFileSync(path.join(__dirname,'../assets/legal-footer.css'),'utf8')}</style></head>`);
 replace('</body>',`${fs.readFileSync(path.join(__dirname,'../assets/legal-footer.html'),'utf8')}<script>${fs.readFileSync(path.join(__dirname,'../assets/legal-footer-layout.js'),'utf8')}</script></body>`);
 const {subsetTTF}=require('./export-font.cjs');
 const exportScript=fs.readFileSync(path.join(__dirname,'export-image.browser.js'),'utf8');
 const exportAssets={fonts:resources.filter(r=>r.path.endsWith('.ttf')).map((r,i)=>({family:i===0?'ZhaohuaTitleA':'HuiwenMincho',data:subsetTTF(fs.readFileSync(r.path),html+exportScript).toString('base64')}))};
 // Standalone pages carry the fonts they use and retain the warm CSS background.
 // They remain
 // readable when moved away from the skills directory, without full font copies.
 let fontIndex=0;
 for(const resource of resources){
  const relative=path.relative(path.dirname(path.resolve(out)),resource.path).split(path.sep).map(encodeURIComponent).join('/');
  if(!resource.path.endsWith('.ttf'))throw Error('Unsupported template resource: '+path.basename(resource.path));
  const dataURL='data:font/ttf;base64,'+exportAssets.fonts[fontIndex++].data;
  html=html.split("url('"+relative+"')").join("url('"+dataURL+"')");
 }
 replace('</body>',`<script id="export-assets" type="application/json">${JSON.stringify(exportAssets)}</script><script>${fs.readFileSync(path.join(__dirname,'export-image.browser.js'),'utf8')}</script></body>`);
 fs.writeFileSync(out,html);
 const report={status:'static-check',template:manifest.id,templateSha256:manifest.sourceSha256,chartSha256:sha(JSON.stringify(data)),sourceCSSPreserved:true,approvedCSSPatch:'narrow-layout-v1',resources,calculationStatus:data.calculation.status,limitations:data.calculation.limitations,browserValidation:'pending',userValidation:'pending-user-validation'};
 fs.writeFileSync(out+'.provenance.json',JSON.stringify({...report,portableHTML:true,resources:resources.map(r=>({...r,path:path.basename(r.path)}))},null,2));return report;
}
module.exports={renderKimi};
