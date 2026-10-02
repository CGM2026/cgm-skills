'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('skills/cgm-bazi-visualization/assets/research-ui.js','utf8');
const code=source.slice(source.indexOf(' function anchor('),source.indexOf(' function nearest('));
function svgElement(tag){return {tag,attrs:{},style:{},dataset:{},classList:{add(){}},setAttribute(k,v){this.attrs[k]=String(v);}};}
function scene(left,top,height,anchorTop){
 const overlay={...svgElement('svg'),children:[],replaceChildren(){this.children=[]},append(e){this.children.push(e)}};
 const bounds={left,top,width:500,height};
 const anchor={dataset:{researchObject:'natal:0:branch'},classList:{contains:()=>false},getClientRects:()=>[1],closest:()=>true,getBoundingClientRect:()=>({left:left+50,top:top+anchorTop,width:40,height:60})};
 return {bounds,overlay,querySelector:()=>overlay,querySelectorAll:()=>[anchor],getBoundingClientRect:()=>bounds};
}
const main=scene(0,0,900,200),marks=[{id:'circle',type:'ellipse',a:{object:'natal:0:branch',x:0,y:0},b:{object:'natal:0:branch',x:1,y:1},color:'#383129',weight:2}];
const ctx={main,state:{layers:[]},layer:()=>null,note:()=>null,NS:'svg',document:{createElementNS:(_,tag)=>svgElement(tag)},selectedMark:null,tool:null};
vm.createContext(ctx);vm.runInContext(code,ctx);
ctx.drawMarks(main,marks);
assert.equal(main.overlay.children[0].attrs.cx,'70');assert.equal(main.overlay.children[0].attrs.cy,'230');
// A saving message changes page height before any subsequent redraw.
main.bounds.height=932;
assert.equal(main.overlay.style.height,'900px'); // no SVG meet/centering jump
ctx.drawMarks(main,marks);
assert.equal(main.overlay.style.height,'932px');assert.equal(main.overlay.attrs.viewBox,'0 0 500 932');
assert.equal(main.overlay.children[0].attrs.cy,'230');
main.bounds.height=900;ctx.drawMarks(main,marks);assert.equal(main.overlay.children[0].attrs.cy,'230');
// Export origin and chart position differ after removing UI; re-anchor there.
const exported=scene(-30000,40,450,170);ctx.drawMarks(exported,marks);
assert.equal(exported.overlay.children[0].attrs.cx,'70');assert.equal(exported.overlay.children[0].attrs.cy,'200');
assert.equal(exported.overlay.style.blockSize,'450px');
assert.equal(main.overlay.children[0].attrs.cy,'230');
assert.deepEqual(marks[0].a,{object:'natal:0:branch',x:0,y:0});
console.log('保存提示高度变化不移动记号；导出按副本对象重新定位；原记号坐标保留。');
