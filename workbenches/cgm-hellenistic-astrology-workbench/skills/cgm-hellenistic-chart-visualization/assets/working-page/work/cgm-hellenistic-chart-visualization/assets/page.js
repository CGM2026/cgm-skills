const payload=JSON.parse(document.getElementById('chart-data').textContent);
const model=ChartView.adapt(payload);
let selected='sun';
function selectPoint(key){const point=[...model.planets,...model.lots,...model.angles].find(p=>p.key===key);if(!point)return;selected=key;document.getElementById('detail').innerHTML=ChartView.detail(point);document.querySelectorAll('[data-point]').forEach(el=>el.classList.toggle('selected',el.dataset.point===key));}
function render(){document.getElementById('wheel').innerHTML=ChartWheel.render(model,{bounds:document.getElementById('bounds').checked,lots:document.getElementById('lots').checked});document.getElementById('legend').hidden=!document.getElementById('lots').checked;selectPoint(selected);}
document.getElementById('bounds').addEventListener('change',render);
document.getElementById('lots').addEventListener('change',render);
document.addEventListener('click',event=>{const el=event.target.closest('[data-point]');if(el)selectPoint(el.dataset.point);});
document.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){const el=event.target.closest('[data-point]');if(el){event.preventDefault();selectPoint(el.dataset.point);}}});
function svgText(){const svg=document.querySelector('#wheel svg').cloneNode(true);svg.setAttribute('width','1600');svg.setAttribute('height','1600');const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=document.querySelector('style').textContent;svg.prepend(style);const bg=document.createElementNS('http://www.w3.org/2000/svg','rect');for(const [k,v] of Object.entries({x:-64,y:-64,width:448,height:448,fill:'#fffdf8'}))bg.setAttribute(k,v);style.after(bg);return new XMLSerializer().serializeToString(svg);}
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
document.getElementById('svg-download').addEventListener('click',()=>download(new Blob([svgText()],{type:'image/svg+xml'}),'chart.svg'));
document.getElementById('png-download').addEventListener('click',async()=>{await document.fonts.ready;const url=URL.createObjectURL(new Blob([svgText()],{type:'image/svg+xml'}));const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1600;canvas.getContext('2d').drawImage(img,0,0,1600,1600);canvas.toBlob(blob=>{if(blob)download(blob,'chart.png');},'image/png');URL.revokeObjectURL(url);};img.onerror=()=>{URL.revokeObjectURL(url);alert('图片导出失败，请使用 SVG 下载。');};img.src=url;});
selectPoint('sun');
