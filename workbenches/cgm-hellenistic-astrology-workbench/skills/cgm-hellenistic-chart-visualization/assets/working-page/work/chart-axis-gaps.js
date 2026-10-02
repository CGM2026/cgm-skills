(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ChartAxisGaps=factory();})(globalThis,function(){
  // Enclose all three text boxes in one radial corridor, including their gaps.
  function corridor(boxes, direction, padding=2){
    const length=Math.hypot(direction.x,direction.y)||1;
    const u={x:direction.x/length,y:direction.y/length},v={x:-u.y,y:u.x};
    const corners=boxes.flatMap(b=>[[b.x,b.y],[b.x+b.width,b.y],[b.x+b.width,b.y+b.height],[b.x,b.y+b.height]]);
    const along=corners.map(([x,y])=>x*u.x+y*u.y),across=corners.map(([x,y])=>x*v.x+y*v.y);
    const a=Math.min(...along)-padding,b=Math.max(...along)+padding,c=Math.min(...across)-padding,d=Math.max(...across)+padding;
    return [[a,c],[b,c],[b,d],[a,d]].map(([s,t])=>[s*u.x+t*v.x,s*u.y+t*v.y]);
  }
  function apply(svg){
    if(!svg)return;
    const ns='http://www.w3.org/2000/svg';
    const old=svg.querySelector('[data-axis-gaps]');if(old)old.remove();
    const defs=document.createElementNS(ns,'defs');defs.setAttribute('data-axis-gaps','');
    const mask=document.createElementNS(ns,'mask');
    for(const [key,value] of Object.entries({id:'planet-axis-gaps',maskUnits:'userSpaceOnUse',maskContentUnits:'userSpaceOnUse',x:-64,y:-64,width:448,height:448}))mask.setAttribute(key,value);
    mask.style.maskType='luminance';
    const background=document.createElementNS(ns,'rect');
    for(const [key,value] of Object.entries({x:-64,y:-64,width:448,height:448,fill:'white'}))background.setAttribute(key,value);
    mask.append(background);
    svg.querySelectorAll('.planet-glyph-group').forEach(group=>{
      const texts=[...group.querySelectorAll(':scope > text')];
      const glyph=group.querySelector('.planet-mark');
      if(!glyph||!texts.length)return;
      const boxes=texts.map(text=>text.getBBox());
      const points=corridor(boxes,{x:Number(glyph.getAttribute('x'))-160,y:Number(glyph.getAttribute('y'))-160});
      const polygon=document.createElementNS(ns,'polygon');
      polygon.setAttribute('points',points.map(p=>p.join(',')).join(' '));polygon.setAttribute('fill','black');
      mask.append(polygon);
    });
    defs.append(mask);svg.prepend(defs);
    svg.querySelectorAll('.axis-line:not(.outer-axis)').forEach(line=>line.setAttribute('mask','url(#planet-axis-gaps)'));
  }
  return {apply,corridor};
});
