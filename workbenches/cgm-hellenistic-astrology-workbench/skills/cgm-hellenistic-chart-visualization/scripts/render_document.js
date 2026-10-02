const fs = require('node:fs');
const path = require('node:path');
const skill = path.resolve(__dirname, '..');
const wheel = require('../assets/chart-wheel.js');
const view = require('../assets/chart-view.js');
const read = name => fs.readFileSync(path.join(skill,'assets',name),'utf8');
const esc = view.escape;
const payload = JSON.parse(fs.readFileSync(0,'utf8'));
const model = view.adapt(payload);
const css = read('page.css') + '\n' + read('wheel.css');
const svg = wheel.render(model);
const safeJSON = JSON.stringify(payload).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(payload.title)}</title><style>${css}</style></head><body>
<main><header><div class="eyebrow">希腊占星 · 盘面</div><h1>${esc(payload.title)}</h1><p id="meta">${view.metadata(payload.facts)}</p><p class="settings">${view.settings(payload.facts)}</p></header>
<div class="toolbar"><label><input id="bounds" type="checkbox" checked>显示界</label><label><input id="lots" type="checkbox" checked>显示签点</label><button id="svg-download">下载 SVG</button><button id="png-download">下载 PNG</button></div>
<section class="workspace"><div class="chart-card"><div id="wheel">${svg}</div><p class="legend" id="legend">${view.lotLegend(payload.facts)}</p></div><aside><div class="eyebrow">点位详情</div><div id="detail" aria-live="polite">${view.detail(model.planets.find(p=>p.key==='sun'))}</div><p class="hint">点击星体、签点或下方表格查看详情。</p></aside></section>
<section class="data-card"><h2>盘面数据</h2><div class="table-scroll"><table><thead><tr><th>点位</th><th>位置</th><th>主宫制</th><th>整宫制</th><th>住所主</th><th>界主</th></tr></thead><tbody>${view.rows(model)}</tbody></table></div></section>
<details class="relations"><summary>七星整宫关系 · 21 组</summary>${view.relations(payload.facts)}</details>
<footer>${payload.facts.solar_condition.near_horizon ? '太阳临近地平线，出生时间变化可能改变昼夜与签点公式。<br>' : ''}度数、宫位与签点均来自同一份排盘结果。<br>星体符号拥挤时会错开排布，刻线保留真实位置。</footer></main>
<script id="chart-data" type="application/json">${safeJSON}</script><script>${read('chart-geometry.js')}</script><script>${read('chart-wheel.js')}</script><script>${read('chart-view.js')}</script><script>${read('page.js')}</script></body></html>`;
const out = payload.output_dir;
const files = ['chart.html','chart.svg','visualization.json'];
if (!payload.force && files.some(name=>fs.existsSync(path.join(out,name)))) throw Error('输出已存在；请换目录，或明确使用 --force。');
fs.mkdirSync(out,{recursive:true});
const svgFile = svg.replace('<svg ', '<svg width="1200" height="1200" ').replace(/(aria-label="希腊占星轮盘">)/, `$1<style>${css}</style><rect x="-64" y="-64" width="448" height="448" fill="#fffdf8"/>`);
fs.writeFileSync(path.join(out,'chart.html'),html);
fs.writeFileSync(path.join(out,'chart.svg'),svgFile);
const manifest = {schema:'cgm-hellenistic-chart-visualization/1',chart_schema_version:4,source_sha256:payload.source_sha256,settings:payload.facts.settings,outputs:{html:path.join(out,'chart.html'),svg:path.join(out,'chart.svg')}};
fs.writeFileSync(path.join(out,'visualization.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest));
