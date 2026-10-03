(function renderName(){
 const main=document.querySelector('main'),head=document.querySelector('.masthead'),tile=document.getElementById('name-tile'),rest=document.getElementById('name-rest'),info=document.querySelector('.person-info');
 const name=(chart.person.displayName||chart.person.name).trim(),latin=/^\p{Script=Latin}/u.test(name);
 let displayName=name;
 if(latin){
  const comma=name.split(',').map(v=>v.trim()),parts=name.split(/\s+/);
  const family=chart.person.familyName||(comma.length===2?comma[0]:parts.at(-1));
  const given=chart.person.givenName||(comma.length===2?comma[1]:parts.slice(0,-1).join(' '));
  if(given)displayName=given.split(/\s+/).filter(Boolean).map(v=>Array.from(v)[0].toUpperCase()+'.').join(' ')+' '+family;
 }
 const chars=Array.from(displayName);
 const abbreviated=latin&&chars[1]==='.';
 const initialValue=(latin?(chars[0]||'').toUpperCase():chars[0]||'')+(abbreviated?'.':'');
 const remaining=chars.slice(abbreviated?2:1).join('').trimStart();
 tile.classList.toggle('latin',latin);rest.classList.toggle('latin',latin);rest.title=name;head.setAttribute('aria-label',name);
 const initial=document.createElement('span'),text=document.createElement('span');initial.textContent=initialValue;text.textContent=remaining;tile.replaceChildren(initial);rest.replaceChildren(text);
 const marker=()=>{const el=document.createElement('i');el.setAttribute('aria-hidden','true');el.style.cssText='display:inline-block;width:0;height:0;padding:0;margin:0;vertical-align:baseline';return el};
 const tm=marker(),rm=marker(),dm=marker(),lm=marker();initial.append(tm);text.append(rm);info.children[1].append(dm);info.children[0].append(lm);
 const bounds=el=>{const r=document.createRange();r.selectNodeContents(el);return r.getBoundingClientRect()};
 const ctx=document.createElement('canvas').getContext('2d');
 const ink=(el,value=el.textContent)=>{ctx.font=getComputedStyle(el).font;return ctx.measureText(value)};
 const bodyDescent=()=>ink(rest,latin?(text.textContent.replace(/[gjpqy]/g,'')||'H'):text.textContent).actualBoundingBoxDescent;
 const setRest=value=>{text.replaceChildren(document.createTextNode(value),rm)};
 let scheduled=false;
 function layout(){
  scheduled=false;
  const w=main.clientWidth,gap=Math.max(8,Math.min(14,8+(w-320)*6/388)),fullRest=remaining;setRest(fullRest);
  tile.style.position='relative';tile.style.padding='0';
  initial.style.cssText='position:absolute;left:0;top:0;white-space:nowrap;';
  rest.style.cssText='position:absolute;display:block;overflow:visible;padding:0;white-space:nowrap;line-height:1;top:0;';rest.style.left=gap+'px';
  info.style.width='max-content';info.style.right='auto';
  // Note layers hide .deck-links. Its zero rectangle must never constrain the title.
  const hr=head.getBoundingClientRect(),body=document.querySelector('.lower-main');
  const right=main.getBoundingClientRect().right-parseFloat(getComputedStyle(body).paddingRight);
  let widest=0;for(const row of info.children)widest=Math.max(widest,bounds(row.querySelector('span')||row).width);
  info.style.left=(right-hr.left-widest)+'px';
  const bottom=dm.getBoundingClientRect().top+ink(info.children[1]).actualBoundingBoxDescent;
  const minHeight=bottom-(lm.getBoundingClientRect().top-ink(info.children[0]).actualBoundingBoxAscent),bottomInset=hr.bottom-bottom;
  const centreY=.505+.015*Math.max(0,Math.min(1,(w-320)/100));
  let ratio=1;
  const shape=f=>{tile.style.fontSize=f+'px';rest.style.fontSize=f/ratio+'px';const m=ink(initial),h=m.actualBoundingBoxAscent+m.actualBoundingBoxDescent,s=(bottomInset+h/2)/(1-centreY);return {f,h,s,rest:f/ratio,restWidth:bounds(text).width,tail:Math.max(0,ink(rest).actualBoundingBoxDescent-bodyDescent())}};
  const fits=p=>p.s<=196&&p.s+2*gap+p.restWidth<=right-hr.left-widest&&p.tail<=bottomInset-4;
  const solve=()=>{let low=0,high=240;for(let i=0;i<28;i++){const mid=(low+high)/2;if(fits(shape(mid)))low=mid;else high=mid;}return shape(low)};
  let chosen=solve();
  // Equal size is the first choice; relax only enough to meet the minimum initial height.
  if(chosen.h+.1<minHeight){for(ratio=1.05;ratio<=1.50001;ratio+=.05){ratio=Math.min(1.5,ratio);chosen=solve();if(chosen.h+.1>=minHeight||ratio===1.5)break;}}
  // Compact display is explicit (ellipsis), reversible on resize; full identity stays intact.
  if(!latin&&chosen.h+.1<minHeight&&fullRest){
   const letters=Array.from(fullRest);for(let n=letters.length-1;n>=0;n--){setRest(letters.slice(0,n).join('')+'…');chosen=solve();if(chosen.h+.1>=minHeight)break;}
  }
  head.dataset.nameNeedsShortening=String(chosen.h+.1<minHeight);head.dataset.compactName=String(text.textContent!==fullRest);
  const s=chosen.s;main.style.setProperty('--tile',s+'px');main.style.setProperty('--band-l',s+'px');main.style.setProperty('--mast-base',s*.22+'px');
  head.style.height=s+'px';head.style.minHeight=s+'px';head.dataset.nameLayout='inline';tile.style.fontSize=chosen.f+'px';rest.style.fontSize=chosen.rest+'px';
  const target=dm.getBoundingClientRect().top+ink(info.children[1]).actualBoundingBoxDescent,ti=ink(initial),ri=ink(rest),rd=bodyDescent();
  initial.style.top=(target-ti.actualBoundingBoxDescent-tm.getBoundingClientRect().top)+'px';rest.style.top=(target-rd-rm.getBoundingClientRect().top)+'px';
  initial.style.left=(s*.53-(ti.actualBoundingBoxRight-ti.actualBoundingBoxLeft)/2)+'px';
  head.dataset.inkEdges=JSON.stringify([tm.getBoundingClientRect().top+ti.actualBoundingBoxDescent,rm.getBoundingClientRect().top+rd,target]);head.dataset.nameRatio=String(chosen.f/chosen.rest);
  head.dataset.nameGeometry=JSON.stringify({square:s,initial:chosen.f,rest:chosen.rest,minHeight,inkHeight:ti.actualBoundingBoxAscent+ti.actualBoundingBoxDescent,top:tm.getBoundingClientRect().top-ti.actualBoundingBoxAscent,locationTop:lm.getBoundingClientRect().top-ink(info.children[0]).actualBoundingBoxAscent,tailClearance:head.getBoundingClientRect().bottom-(rm.getBoundingClientRect().top+ri.actualBoundingBoxDescent),infoGap:info.getBoundingClientRect().left-bounds(text).right});
  head.dispatchEvent(new Event('name-layout-ready'));
 }
 const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(layout)}};
 head.addEventListener('prepare-chart-export',layout);
 window.addEventListener('resize',schedule);const observer=new ResizeObserver(schedule);for(const el of [main,info,initial])observer.observe(el);document.fonts.addEventListener('loadingdone',schedule);document.fonts.ready.then(schedule);schedule();
})();
