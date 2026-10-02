const fs=require('node:fs'),path=require('node:path');
const base=path.resolve('work/cgm-hellenistic-chart-visualization/assets');
const out=path.resolve(process.env.CHART_OUTPUT||'outputs/星盘视觉工作稿');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(process.env.CHART_SOURCE||'outputs/排盘可视化示例/chart.html','utf8');
const payload=JSON.parse(source.match(/<script id="chart-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const facts=payload.facts,view=require('./study-view.js');
const transitMode=process.env.CHART_MODE==='transit';
const model=view.adapt(payload),esc=view.escape;
// New pages and existing library views use the same maintained wheel.
const wheelCode=fs.readFileSync(path.resolve('work/print-study/chart-wheel.js'),'utf8');
const study=path.resolve('work/print-study');fs.mkdirSync(study,{recursive:true});
fs.copyFileSync(path.join(base,'chart-geometry.js'),path.join(study,'chart-geometry.js'));
const natalVariants=transitMode?JSON.parse(fs.readFileSync(process.env.CHART_NATAL_VARIANTS,'utf8')):null;
const natalFacts=transitMode?JSON.parse(fs.readFileSync(path.join(out,'natal-facts-v4.json'),'utf8')):null;
const natalKey=transitMode?[natalFacts.settings.zodiac==='sidereal'&&natalFacts.settings.ayanamsa==='lahiri'?'sidereal_lahiri':natalFacts.settings.zodiac,natalFacts.settings.primary_house_system,natalFacts.settings.bound_system].join('|'):null;
const natalDefault=transitMode?natalVariants.variants[natalKey]:null;
if(transitMode&&!natalDefault)throw Error('Natal variants do not contain the validated natal setting');
const wheel=require(path.join(study,'chart-wheel.js'));const svg=wheel.render(model,{natalChart:natalDefault?view.adapt(natalDefault):null});
const assetRoot=process.env.CHART_ASSET_ROOT;if(!assetRoot)throw new Error('CHART_ASSET_ROOT is required');
fs.mkdirSync(path.join(out,'assets'),{recursive:true});
fs.copyFileSync(path.join(assetRoot,'chaohua-a.ttf'),path.join(out,'assets/chaohua-a.ttf'));
fs.copyFileSync(path.join(assetRoot,'huiwen-mincho.ttf'),path.join(out,'assets/huiwen-mincho.ttf'));
const fonts=`@font-face{font-family:Chaohua;src:url('assets/chaohua-a.ttf') format('truetype');font-display:swap;font-weight:400}@font-face{font-family:Huiwen;src:url('assets/huiwen-mincho.ttf') format('truetype');font-display:swap;font-weight:400}`;
const originalWheelCSS=fs.readFileSync(path.join(base,'wheel.css'),'utf8');
// Restore only paint properties, preserving the study's sizing and line weights.
const originalPaint=[...originalWheelCSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([,selector,body])=>{
  const paint=body.split(';').map(s=>s.trim()).filter(s=>/^(?:color|fill|stroke|stroke-opacity|opacity):/.test(s));
  return paint.length?`${selector}{${paint.join(';')}}`:'';
}).join('\n');
const css=fonts+'\n'+originalWheelCSS+'\n'+fs.readFileSync('work/print-study.css','utf8')+'\n'+originalPaint+`
:root{--surface:#fffdf8;--ink:#292820;--accent-strong:#9d573c;--muted-soft:#827c72;--rule:#d8d1c5}
.name{color:#655644}.birth{color:#80796f}.settings{color:#805e42}
.side h2{color:#655644}.side .position{color:#825737}.side dt,.side-kicker,.hint{color:#80796f}
.tools,.ledger>summary,.relations>summary{color:#7d6c55}
.m08-wheel .sign-segment,.m08-wheel .bound-segment{opacity:1}
.m08-wheel circle{stroke-opacity:1}
.folio{max-width:1180px}
.workspace{grid-template-columns:minmax(0,1fr) 196px;gap:24px}
.m08-wheel .planet-mark{font-size:18px}
.m08-wheel .planet-degree-radial{font-size:11.5px}
.m08-wheel .planet-minute-radial{font-size:7.5px}
.m08-wheel .retrograde{font-size:8px;stroke-width:1px}
.m08-wheel .angle-label,.m08-wheel .angle-name,.m08-wheel .angle-degree-value{font-size:11.5px;font-weight:600}
.m08-wheel .angle-minute-value{font-size:9px;font-weight:600}
@media(max-width:800px){.workspace{grid-template-columns:minmax(0,1fr)}#wheel{max-width:740px}}
`;
const finalCSS=css+'\n'+fs.readFileSync('work/visual-refinements.css','utf8')+(transitMode?'\n.m08-wheel .planet-minute-radial{display:none!important}.m08-wheel .natal-transit-separator{stroke:#827c72;stroke-width:.7;fill:none}.m08-wheel .natal-marks .planet-mark,.m08-wheel .transit-marks .planet-mark{font-size:16.5px}.m08-wheel .natal-marks .planet-degree-radial,.m08-wheel .transit-marks .planet-degree-radial{font-size:10.5px}.m08-wheel .natal-marks .planet-tick{stroke:#736f69}.folio .chart-type-switch a{font:inherit;color:var(--text-secondary);text-decoration:none}.folio .chart-type-switch a:hover{text-decoration:underline}.folio #aspect-diagram-toggle[hidden],.folio .aspect-diagram-mode[hidden]{display:none!important}':'');
const natalPage=transitMode?new URL(process.env.CHART_NATAL_PAGE_URI).pathname:null;
const natalHref=transitMode?process.env.CHART_NATAL_PAGE:null;
const safeJSON=JSON.stringify(payload).replace(/</g,'\\u003c');
const chartIdentity=transitMode?natalDefault:payload;
const title=chartIdentity.title.split('·').pop().trim();
const documentTitle=transitMode?chartIdentity.title+' · 行运盘':payload.title;
const stamp=facts.metadata.local_datetime.split('T');
const variants=JSON.parse(fs.readFileSync(process.env.CHART_VARIANTS||'work/print-study/variants.json','utf8'));
const houseOptions=Object.entries(variants.house_options).map(([key,label])=>`<option value="${key}">${esc(label)}</option>`).join('');
const switchSettings=`<div class="settings" aria-label="排盘方式">
<div class="method-switches"><button type="button" id="zodiac-switch">回归黄道</button><span aria-hidden="true">·</span><button type="button" id="house-switch">整宫制</button><span aria-hidden="true">·</span><button type="button" id="planets-switch" aria-pressed="false">传统七星</button></div>
<div class="chart-actions"><details class="switch-settings"><summary class="icon-control" aria-label="切换设置" title="切换设置"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h6m4 0h6M4 17h10m4 0h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></svg></summary><form id="cycle-form">
<div class="dual-setting"><p class="config-label">恒星黄道岁差</p><div class="choice-pair" role="radiogroup" aria-label="恒星黄道岁差">${Object.entries(variants.ayanamsa_options).map(([key,label])=>`<label><input type="radio" name="ayanamsa-radio" data-choice-for="ayanamsa-choice" value="${key}"><span>${esc(label)}</span></label>`).join('')}</div><select id="ayanamsa-choice" hidden aria-hidden="true" tabindex="-1">${Object.entries(variants.ayanamsa_options).map(([key,label])=>`<option value="${key}">${esc(label)}</option>`).join('')}</select></div>
<div class="dual-setting"><p class="config-label">界表</p><div class="choice-pair" role="radiogroup" aria-label="界表"><label><input type="radio" name="bound-radio" data-choice-for="bound-choice" value="egyptian"><span>埃及界</span></label><label><input type="radio" name="bound-radio" data-choice-for="bound-choice" value="ptolemy_lilly"><span>托勒密界</span></label></div><select id="bound-choice" hidden aria-hidden="true" tabindex="-1"><option value="egyptian">埃及界</option><option value="ptolemy_lilly">托勒密界（Ptolemy–Lilly）</option></select></div>
<div class="house-cycle-settings"><p class="config-label">宫位制切换顺序</p><p class="config-help">选择三种不同的宫位制，点击盘面上的名称依次切换。</p>
${[1,2,3].map(n=>`<label class="cycle-choice">${n}<select class="house-choice" aria-label="第 ${n} 种宫位制">${houseOptions}</select></label>`).join('')}
<p id="switch-status" role="status"></p></div></form></details><button type="button" id="export-open" class="icon-control export-launch" aria-label="导出星盘" title="导出星盘"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/></svg></button></div></div>`;
const exportDialog=`<dialog id="export-dialog" class="export-dialog" aria-labelledby="export-title"><div class="export-dialog-head"><h2 id="export-title">导出星盘</h2><button type="button" id="export-close" aria-label="关闭导出设置">×</button></div><div class="export-dialog-body"><fieldset class="export-footer-choice"><legend>图片布局</legend><label><input type="radio" name="export-layout" value="vertical" checked>竖图</label><label><input type="radio" name="export-layout" value="horizontal">横图</label></fieldset><label class="export-check"><input id="export-design" type="checkbox" checked>显示设计署名</label><fieldset class="export-anonymity-choice"><legend>隐私</legend><label><input id="export-anonymous" type="checkbox">匿名导出（盘名改为“匿名”）</label><label><input id="export-month-only" type="checkbox" disabled>出生时间仅显示到月份</label><label><input id="export-hide-identity" type="checkbox">不显示名称、时间与地点</label></fieldset><fieldset class="export-personal-choice"><legend>个人标识</legend><label class="export-check"><input id="export-personal" type="checkbox">加入个人标识</label><div class="export-personal-fields"><label class="export-field"><span><input id="export-signature-enabled" type="checkbox" disabled>个人签名</span><input id="export-signature" type="text" disabled maxlength="40" autocomplete="off" placeholder="例如：长庚明"></label><label class="export-field"><span><input id="export-contact-enabled" type="checkbox" disabled>联系方式</span><input id="export-contact" type="text" disabled maxlength="80" autocomplete="off" placeholder="例如：微信 abc123"></label></div></fieldset><p id="export-status" role="status"></p><div class="export-dialog-actions"><button type="button" id="export-preview">预览</button><button type="button" id="png-download">导出 PNG</button><button type="button" id="svg-download">导出 SVG</button></div><div id="export-preview-wrap" class="export-preview-wrap" hidden><img id="export-preview-image" alt="导出图片预览"></div></div></dialog>`;
// Coordinates are rounded only for this display; the original facts stay intact.
const latitude=Math.abs(facts.metadata.latitude).toFixed(2)+'°'+(facts.metadata.latitude<0?'S':'N');
const longitude=Math.abs(facts.metadata.longitude).toFixed(2)+'°'+(facts.metadata.longitude<0?'W':'E');
// The heading names the place briefly; the facts and tooltip keep the precise location.
function shortPlace(name){
 const full=String(name||'').trim(),clean=full.replace(/[（(][^）)]*[）)]/g,'').trim();
 const region=clean.match(/^(.+?(?:省|自治区|特别行政区|市))/)?.[1];
 if(!region)return clean;
 const parts=clean.slice(region.length).match(/[^省市区县旗]+(?:自治县|自治旗|县|区|市|旗)/g);
 const last=parts?.at(-1)?.replace(/(?:自治县|自治旗|县|区|市|旗)$/,'');
 const first=region.replace(/(?:壮族|回族|维吾尔)?自治区$|特别行政区$|省$|市$/,'');
 return last?first+'·'+last:first;
}
const place=shortPlace(facts.metadata.location_name);
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(documentTitle)} · 纸面工作稿</title><style>${finalCSS}</style></head><body><main class="folio">
<header class="masthead"><div class="identity"><h1 class="name" title="${esc(title)}" aria-label="${esc(title)}">${esc(title)}</h1></div><div class="birth"><p class="date">${stamp[0].replaceAll('-','/')}　${stamp[1].slice(0,5)}</p><p class="place-label" title="${esc(facts.metadata.location_name)} · ${latitude} ${longitude}">${esc(place)} · <span class="coordinates">${longitude} ${latitude}</span></p><p class="account-watermark">公众号｜明语星辰&nbsp;&nbsp;设计</p></div></header>
${switchSettings}
<section class="workspace"><div class="chart-area legend-below-tools"><div id="wheel">${svg}</div><div class="chart-bottom"><nav class="tools" aria-label="盘面显示"><label><input id="bounds" type="checkbox" checked>界</label><label><input id="lots" type="checkbox" checked>签点</label><label><input type="checkbox" id="virtual-toggle">虚点</label><label><input type="checkbox" id="asteroids-toggle">小行星</label><button type="button" id="aspect-diagram-toggle" class="aspect-diagram-toggle" aria-pressed="false">切换为  <span class="aspect-diagram-name">相位图式</span></button></nav><p class="wheel-note" id="legend">${view.lotLegend(facts)}</p><nav class="chart-type-switch" aria-label="盘式">${transitMode?'<a href="'+esc(natalHref)+'">本命盘</a><span aria-current="page">行运盘</span>':'<span aria-current="page">本命盘</span><button type="button" disabled title="此盘式尚未开放">行运盘</button>'}<button type="button" disabled title="此盘式尚未开放">返照盘</button></nav></div></div><aside class="side" id="popup-detail-side"><div id="detail" aria-live="polite">${view.detail(model.planets.find(p=>p.key==='sun'),model)}</div></aside></section>
</main>${exportDialog}
<script>globalThis.ChartPageMode=${JSON.stringify(transitMode?'transit':'natal')};globalThis.ChartSharedArchivePath=${JSON.stringify(natalPage)};</script><script id="chart-data" type="application/json">${safeJSON}</script>${transitMode?'<script id="natal-variants" type="application/json">'+JSON.stringify(natalVariants).replace(/</g,'\\u003c')+'</script>':''}<script>${fs.readFileSync(path.join(base,'chart-geometry.js'),'utf8')}</script><script>${wheelCode}</script><script>${fs.readFileSync(path.join(base,'chart-view.js'),'utf8')}</script><script>${fs.readFileSync(path.join(base,'page.js'),'utf8').replaceAll("fill:'#fffdf8'","fill:'#fffbf2'").replace("svg.setAttribute('width','1600');","svg.classList.add('export-wheel');svg.setAttribute('width','1600');").replace('lots:document.getElementById(\'lots\').checked});','lots:document.getElementById(\'lots\').checked,natalChart:globalThis.ChartNatalModel});')}</script></body></html>`;
// Export keeps the original full canvas for its title and bottom legend.
const exportSafeHTML=html.replaceAll('.m08-wheel [data-point]:focus text{fill:#a64625}','').replace("svg.classList.add('export-wheel');", "svg.classList.add('export-wheel');svg.setAttribute('viewBox','-64 -64 448 448');")
  .replace('<script id="chart-data"', '<script>'+fs.readFileSync('work/chart-axis-gaps.js','utf8')+'</script><script id="chart-data"')
  .replace('selectPoint(selected);}', "selectPoint(selected);ChartAxisGaps.apply(document.querySelector('#wheel svg'));}")
  .replace("function svgText(){", "function svgText(){ChartAxisGaps.apply(document.querySelector('#wheel svg'));")
  .replace('const payload=JSON.parse(document.getElementById', 'let payload=JSON.parse(document.getElementById')
  .replace('const model=ChartView.adapt(payload);','let model=ChartView.adapt(payload);')
  .replace('<script>let payload=', '<script>'+fs.readFileSync('work/point-aspects.js','utf8')+'</script><script>'+fs.readFileSync('work/study-view.js','utf8')+'</script><script>let payload=')
  .replace('const point=[...model.planets,...model.lots,...model.angles]', 'const point=[...model.planets,...model.lots,...model.angles,...(model.natalPoints||[]),...(model.virtualPoints||[]),...(model.ringPoints||[]),...(model.housePoints||[]),...(model.aspectPoints||[])]')
  .replace('ChartView.detail(point);','ChartView.detail(point,model);')
  .replace('function selectPoint(key){', `function togglePoint(key){selectPoint(selected===key?null:key);}
function selectPoint(key){if(key===null){selected=null;document.getElementById('detail').innerHTML='';document.getElementById('popup-detail-side').hidden=true;document.querySelectorAll('[data-point]').forEach(el=>el.classList.toggle('selected',false));return;}`)
  .replace('if(!point)return;selected=key;', "if(!point)return;document.getElementById('popup-detail-side').hidden=false;selected=key;")
  .replaceAll('selectPoint(el.dataset.point)', 'togglePoint(el.dataset.point)')
  .replace("el.classList.toggle('selected',el.dataset.point===key)", "el.classList.toggle('selected',false)")
  .replace('</body>', '<script id="chart-variants" type="application/json">'+JSON.stringify(variants).replace(/</g,'\\u003c')+'</script><script>'+fs.readFileSync('work/chart-switches.js','utf8')+'</script></body>')
  .replace('</body>', '<script>'+fs.readFileSync('work/fit-study-title.js','utf8')+'</script><script>document.fonts.ready.then(()=>ChartAxisGaps.apply(document.querySelector("#wheel svg")));</script></body>');
const previous=fs.existsSync(path.join(out,'chart.html'))?fs.readFileSync(path.join(out,'chart.html'),'utf8'):'';
let archiveState={version:1,revision:0,token:require('node:crypto').randomUUID(),entries:{}};
try{const found=previous.match(/<script id="chart-archive-state" type="application\/json">([\s\S]*?)<\/script>/);if(found){const saved=JSON.parse(found[1]);if(saved.version===1&&saved.token&&saved.entries)archiveState=saved;}}catch{}
const archiveScript='<script id="chart-archive-state" type="application/json">'+JSON.stringify(archiveState).replace(/</g,'\\u003c')+'</script><script>'+fs.readFileSync('work/archive-store.js','utf8')+'</script><script>'+fs.readFileSync('work/chart-navigation.js','utf8')+'</script>';
const withArchive=exportSafeHTML.replace('<script id="chart-variants"',archiveScript+'<script id="chart-variants"');
fs.writeFileSync(path.join(out,'chart.html'),withArchive.replace('</body>','<script>'+fs.readFileSync('work/point-notes.js','utf8')+'</script><script>'+fs.readFileSync('work/detail-panel.js','utf8')+'</script><script>'+fs.readFileSync('work/custom-lots.js','utf8')+'</script><script>'+fs.readFileSync('work/settings-panel.js','utf8')+'</script><script>'+fs.readFileSync('work/virtual-settings.js','utf8')+'</script><script>'+fs.readFileSync('work/aspect-controls.js','utf8')+'</script><script>'+fs.readFileSync('work/aspect-diagram.js','utf8')+'</script><script>'+fs.readFileSync('work/html2canvas.min.js','utf8')+'</script><script>'+fs.readFileSync('work/page-export.js','utf8')+'</script><script>'+fs.readFileSync('work/note-layers.js','utf8')+'</script><script>'+fs.readFileSync('work/case-archive-v2.js','utf8')+'</script><script>'+fs.readFileSync('work/object-layer-notes.js','utf8')+'</script><script>'+fs.readFileSync('work/wheel-zoom.js','utf8')+'</script><script>'+fs.readFileSync('work/chart-annotations.js','utf8')+'</script><script>'+fs.readFileSync('work/chart-interactions.js','utf8')+'</script><script>'+fs.readFileSync('work/personal-tradition.js','utf8')+'</script><script>'+fs.readFileSync('work/method-defaults.js','utf8')+'</script><script>'+fs.readFileSync('work/time-adjust.js','utf8')+'</script>'+(transitMode?'<script>'+fs.readFileSync('work/transit-search.js','utf8')+'</script><script>'+fs.readFileSync('work/agent-query-results.js','utf8')+'</script><script>'+fs.readFileSync('work/research-cards.js','utf8')+'</script>':'')+'</body>'));
fs.writeFileSync(path.join(out,'chart-facts-v4.json'),JSON.stringify(facts,null,2));
fs.copyFileSync(path.join(assetRoot,'font-license-record.json'),path.join(study,'font-license-record.json'));
fs.writeFileSync(path.join(study,'narrow.html'),`<!doctype html><style>body{margin:0;background:#e9e4da}iframe{border:0;display:block;width:390px;height:1400px;margin:auto}</style><iframe src="${require('node:url').pathToFileURL(path.join(out,'chart.html')).href}"></iframe>`);
console.log(JSON.stringify({html:path.join(out,'chart.html'),bytes:Buffer.byteLength(html),sourceDataUnchanged:JSON.stringify(payload.facts)===JSON.stringify(facts)}));









const readyPage=path.join(out,'chart.html');
fs.writeFileSync(readyPage,fs.readFileSync(readyPage,'utf8').replace('</head>','<style>'+fs.readFileSync('work/workbench-layout.css','utf8')+'</style></head>').replace('</body>','<script>'+fs.readFileSync('work/workbench-layout.js','utf8')+'</script></body>'));
