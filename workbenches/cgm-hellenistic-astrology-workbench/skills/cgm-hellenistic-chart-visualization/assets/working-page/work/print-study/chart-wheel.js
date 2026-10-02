(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./chart-geometry.js'));else root.ChartWheel=factory(root.ChartGeometry);})(globalThis,function(ChartGeometry){
const PLANET_GLYPHS = {
  sun: "☉",
  moon: "☽",
  mercury: "☿",
  venus: "♀",
  mars: "♂",
  jupiter: "♃",
  saturn: "♄",
  uranus: "♅",
  neptune: "♆",
  pluto: "♇",
  chiron: "⚷",
  ceres: "⚳",
  pallas: "⚴",
  juno: "⚵",
  vesta: "⚶",
  true_node: "☊",
  mean_node: "☊", north_node: "☊",
  south_node: "☋",
  lilith: "⚸",
  true_lilith: "⚸",
  prenatal_moon: "◐",
};
const SIGN_LABELS = {
  aries: "白羊座",
  taurus: "金牛座",
  gemini: "双子座",
  cancer: "巨蟹座",
  leo: "狮子座",
  virgo: "处女座",
  libra: "天秤座",
  scorpio: "天蝎座",
  sagittarius: "射手座",
  capricorn: "摩羯座",
  aquarius: "水瓶座",
  pisces: "双鱼座",
};
const SIGN_GLYPHS = {
  aries: "♈",
  taurus: "♉",
  gemini: "♊",
  cancer: "♋",
  leo: "♌",
  virgo: "♍",
  libra: "♎",
  scorpio: "♏",
  sagittarius: "♐",
  capricorn: "♑",
  aquarius: "♒",
  pisces: "♓",
};
const SIGN_KEYS = Object.keys(SIGN_GLYPHS);
const WHEEL_CX = 160;
const WHEEL_CY = 160;
const R_HOLE = 29;
const R_HOUSE_LABEL = 35;
const R_HOUSE_DIV = 43;
const R_PLANET_MIN = 77;
const R_PLANET_DEG = 94;
const R_PLANET_GLYPH = 112;
const R_LOT_DOT = 124;
const R_AXIS_MID = 124;
const R_BOUND_IN = 132;
const R_BOUND_MID = 140;
const R_BOUND_OUT = 148;
const R_SIGN = 157;
const R_OUTER = 166;
const R_AXIS_LABEL = 172;
const R_ANGLE = 196;
const CHART_COLORS = {
  fire: "#DCAB92",
  earth: "#DFC57C",
  air: "#BECBB5",
  water: "#AEBFC8",
  paper: "#FFFDF8",
};
const SIGN_ELEMENTS = {
  aries: "fire",
  leo: "fire",
  sagittarius: "fire",
  taurus: "earth",
  virgo: "earth",
  capricorn: "earth",
  gemini: "air",
  libra: "air",
  aquarius: "air",
  cancer: "water",
  scorpio: "water",
  pisces: "water",
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function formatDegreeParts(degree){ const seconds = Math.floor(degree * 3600 + 1e-6); return {degree:Math.floor(seconds/3600)+'°', minute:String(Math.floor(seconds%3600/60)).padStart(2,'0')+'′'}; }
let astroDisplaySettings;
const {
  pointOnChart,
  arcSegmentPath,
  normalizeVector,
  limitVectorAngle,
  trimLineBeforeLabel,
  fanOutByAngle: _fanOutByAngle,
} = ChartGeometry;
const CHART_LEGACY_DEGREE_ASPECT = "degree_" + "based";
function fanOutByAngle(items, minSpacingDeg) { return _fanOutByAngle(items, minSpacingDeg); }

function mixToPaper(hex, ratio) {
  const clean = String(hex || "").replace("#", "");
  const paper = CHART_COLORS.paper.replace("#", "");
  const toRgb = (value) => [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  const [r1, g1, b1] = toRgb(clean);
  const [r2, g2, b2] = toRgb(paper);
  const mix = (a, b) => Math.round(a * ratio + b * (1 - ratio)).toString(16).padStart(2, "0");
  return `#${mix(r1, r2)}${mix(g1, g2)}${mix(b1, b2)}`;
}

function textAnchorForPoint(point) {
  if (point.x < 132) {
    return "end";
  }
  if (point.x > 188) {
    return "start";
  }
  return "middle";
}


const SPECIAL_LOTS = new Set(["fortune", "spirit"]);

function getVisibleLots(lots) {
  return (lots || [])
    .filter((lot) => {
      if(lot.visible===false)return false;const key = lot.key || "";
      if (Object.prototype.hasOwnProperty.call(astroDisplaySettings.lots, key)) {
        return astroDisplaySettings.lots[key];
      }
      return astroDisplaySettings.lots.more;
    })
    .sort((a, b) => (({fortune:0,spirit:1}[a.key]??2)-({fortune:0,spirit:1}[b.key]??2))||(a.displayOrder??0)-(b.displayOrder??0));
}

function buildLotMarks(lots, ascLongitude, angles, rr) {
  const visibleLots = getVisibleLots(lots);
  if (!visibleLots.length) return "";

  const lotItems = visibleLots.map((lot, index) => ({
    ...lot,
    _index: index,
    trueAngle: ((ascLongitude - (lot.longitude || 0) + 180 + 360) % 360),
  }));

  const sortedLots=lotItems.sort((a,b)=>a.trueAngle-b.trueAngle);
  let cut=0,gap=-1;sortedLots.forEach((p,i)=>{const next=(sortedLots[(i+1)%sortedLots.length].trueAngle-p.trueAngle+360)%360;if(next>gap){gap=next;cut=(i+1)%sortedLots.length;}});
  const placedLots=[...sortedLots.slice(cut),...sortedLots.slice(0,cut)];
  placedLots.forEach((p,i)=>{if(i&&p.trueAngle<placedLots[i-1].trueAngle)p.trueAngle+=360;});
  // Reserve the full axis captions, not just their angular centre.
  const obstacles = (angles || []).flatMap(a=>{
    const p=pointOnChart(a.longitude,191,ascLongitude),horizontal=['mc','ic'].includes(String(a.key).toLowerCase());
    return horizontal?[{x:p.x-27,y:p.y-8,w:22,h:16},{x:p.x+5,y:p.y-8,w:44,h:16}]:[{x:p.x-12,y:p.y-20,w:24,h:16},{x:p.x-15,y:p.y+4,w:30,h:16}];
  });
  const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  const hits=(a,b,r)=>{
    let lo=0,hi=1;for(const [s,d,min,max] of [[a.x,b.x-a.x,r.x,r.x+r.w],[a.y,b.y-a.y,r.y,r.y+r.h]]){
      if(Math.abs(d)<1e-8){if(s<min||s>max)return false;continue;}
      let u=(min-s)/d,v=(max-s)/d;if(u>v)[u,v]=[v,u];lo=Math.max(lo,u);hi=Math.min(hi,v);if(lo>hi)return false;
    }return true;
  };

  const stems=placedLots.map(p=>({key:p.key,a:pointOnChart(p.longitude||0,rr.outer,ascLongitude),b:pointOnChart(p.longitude||0,rr.outer+3,ascLongitude)}));
  const crosses=(a,b,c,d)=>{
    const side=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
    return side(a,b,c)*side(a,b,d)<-1e-6&&side(c,d,a)*side(c,d,b)<-1e-6;
  };

  const compatible=(q,r)=>!overlaps(q.box,r.box)&&!hits(q.a,q.b,r.box)&&!hits(r.a,r.b,q.box)&&!crosses(q.a,q.b,r.a,r.b);
  let chosen=null;
  // Keep labels in their zodiac order on a common outer lane. Each candidate
  // carries the cheapest compatible preceding path, avoiding exponential search.
  for(let lane=0;lane<20&&!chosen;lane++){
    const radius=rr.outer+30+lane*12;let previous=[];
    for(let i=0;i<placedLots.length;i++){
      const p=placedLots[i],tip=stems[i].b,width=String(p._index+1).length*12+4,height=25,current=[];
      for(let offset=-66;offset<=66;offset+=2){
        const angle=p.trueAngle+offset,rad=angle*Math.PI/180;
        const q={x:WHEEL_CX+Math.cos(rad)*radius,y:WHEEL_CY+Math.sin(rad)*radius,angle,a:tip};
        if((q.x-tip.x)*(tip.x-WHEEL_CX)+(q.y-tip.y)*(tip.y-WHEEL_CY)<0)continue;
        q.box={x:q.x-width/2,y:q.y-height/2,w:width,h:height};
        if(obstacles.some(r=>overlaps(q.box,r)||hits(tip,q,r)))continue;
        if(stems.some(r=>r.key!==p.key&&crosses(tip,q,r.a,r.b)))continue;
        const u=normalizeVector({x:q.x-tip.x,y:q.y-tip.y}),inset=Math.min((width/2-2)/Math.max(Math.abs(u.x),1e-8),9/Math.max(Math.abs(u.y),1e-8))+2;
        q.b={x:q.x-u.x*inset,y:q.y-u.y*inset};
        const cost=offset*offset;
        if(!i){current.push({...q,cost,path:[q]});continue;}
        let best=null;
        for(const prev of previous){
          if(prev.angle>=angle||angle-prev.path[0].angle>=354)continue;
          if(best&&prev.cost>=best.cost)continue;
          if(prev.path.every(r=>compatible(q,r)))best=prev;
        }
        if(best)current.push({...q,cost:best.cost+cost,path:[...best.path,q]});
      }
      previous=current;if(!previous.length)break;
      if(i===placedLots.length-1)chosen=previous.sort((a,b)=>a.cost-b.cost)[0].path;
    }
  }
  if(!chosen){
    // A tightly packed cluster beside an axis may not fit an angular lane.
    // Fan it onto a tangent line, retaining the true point order and full leaders.
    const middle=(placedLots[0].trueAngle+placedLots[placedLots.length-1].trueAngle)/2*Math.PI/180;
    const normal={x:Math.cos(middle),y:Math.sin(middle)},tangent={x:-normal.y,y:normal.x};
    for(let radius=rr.outer+60;radius<=rr.outer+300&&!chosen;radius+=30){
      for(let shift=0;shift<=600&&!chosen;shift+=30)for(const sign of shift?[-1,1]:[1]){
        const row=placedLots.map((p,i)=>{
          const t=(i-(placedLots.length-1)/2)*42+shift*sign;
          const q={x:WHEEL_CX+normal.x*radius+tangent.x*t,y:WHEEL_CY+normal.y*radius+tangent.y*t};
          q.box={x:q.x-16,y:q.y-13,w:32,h:26};q.a=stems[i].b;
          const u=normalizeVector({x:q.x-q.a.x,y:q.y-q.a.y}),inset=Math.min(14/Math.max(Math.abs(u.x),1e-8),9/Math.max(Math.abs(u.y),1e-8))+2;
          q.b={x:q.x-u.x*inset,y:q.y-u.y*inset};return q;
        });
        if(row.every((q,i)=>!obstacles.some(r=>overlaps(q.box,r)||hits(q.a,q.b,r))&&row.slice(0,i).every(r=>compatible(q,r))&&!stems.some((r,j)=>j!==i&&crosses(q.a,q.b,r.a,r.b))))chosen=row;
      }
    }
  }
  if(!chosen){
    // Preserve all labels if an imported category exceeds the ten-point UI limit.
    chosen=[];
    for(const p of placedLots){
      const rad=p.trueAngle*Math.PI/180;let radius=rr.outer+45,q;
      do{q={x:WHEEL_CX+Math.cos(rad)*radius,y:WHEEL_CY+Math.sin(rad)*radius};q.box={x:q.x-16,y:q.y-13,w:32,h:26};radius+=30;}while([...obstacles,...chosen.map(r=>r.box)].some(r=>overlaps(q.box,r)));
      const a=pointOnChart(p.longitude||0,rr.outer+3,ascLongitude),u=normalizeVector({x:q.x-a.x,y:q.y-a.y});chosen.push({...q,a,b:{x:q.x-u.x*13,y:q.y-u.y*13}});
    }
  }
  return placedLots.map((p,index)=>{
    const q=chosen[index],cls=SPECIAL_LOTS.has(p.key||'')?'lot-special':'lot-other';
    const base=pointOnChart(p.longitude||0,rr.outer,ascLongitude),inner=pointOnChart(p.longitude||0,rr.boundIn,ascLongitude),innerTip=pointOnChart(p.longitude||0,rr.lotDot+2,ascLongitude);
    const line=(cls,a,b)=>`<line class="${cls}" x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" />`;
    return `<g class="lot-mark ${cls}" data-point="${escapeHtml(p.key)}" tabindex="0" role="button" aria-label="${escapeHtml(p.label)}"><title>${escapeHtml(p.label)}</title>${line('lot-tick-outer',base,q.a)}${line('lot-tick-inner',inner,innerTip)}${line('lot-leader',q.a,q.b)}<text class="lot-number" dominant-baseline="middle" x="${q.x.toFixed(2)}" y="${q.y.toFixed(2)}">${p._index+1}</text></g>`;
  }).join('');
}

function buildPlanetMarks(planets, ascLongitude, rr) {
  if (!planets.length) return "";
  const positioned = fanOutByAngle(planets.map((p) => ({
    ...p,
    trueAngle: ((ascLongitude - (p.longitude || 0) + 180 + 360) % 360),
  })), planets.length > 7 ? 13 : 8);
  return positioned
    .map((p) => {
      const displayRad = p.displayAngle * (Math.PI / 180);
      const tickTip = pointOnChart(p.longitude || 0, rr.lotDot, ascLongitude);
      const displayGuide = {
        x: WHEEL_CX + Math.cos(displayRad) * rr.planetGlyph,
        y: WHEEL_CY + Math.sin(displayRad) * rr.planetGlyph,
      };
      const radialUnit = normalizeVector({ x: WHEEL_CX - tickTip.x, y: WHEEL_CY - tickTip.y });
      const guideUnit = normalizeVector({ x: displayGuide.x - tickTip.x, y: displayGuide.y - tickTip.y }, radialUnit);
      const tickUnit = limitVectorAngle(radialUnit, guideUnit, Math.PI / 7);
      const tickLength = 5.5;
      const tickTail = {
        x: tickTip.x + tickUnit.x * tickLength,
        y: tickTip.y + tickUnit.y * tickLength,
      };
      const cx = WHEEL_CX + Math.cos(displayRad) * rr.planetGlyph;
      const cy = WHEEL_CY + Math.sin(displayRad) * rr.planetGlyph;
      const dx = WHEEL_CX + Math.cos(displayRad) * rr.planetDeg;
      const dy = WHEEL_CY + Math.sin(displayRad) * rr.planetDeg;
      const mx = WHEEL_CX + Math.cos(displayRad) * rr.planetMin;
      const my = WHEEL_CY + Math.sin(displayRad) * rr.planetMin;
      const glyph = PLANET_GLYPHS[p.key] || p.key;
      const glyphClass = p.key === "prenatal_moon" ? "planet-mark glyph-prenatal-moon" : "planet-mark";
      const parts = formatDegreeParts(p.degree_in_sign);
      return `<g class="planet-glyph-group ${p.key}" data-point="${p.key}" tabindex="0" role="button" aria-label="${escapeHtml(p.label)}"><title>${escapeHtml(p.label)} ${p.degree_in_sign}°</title><line class="planet-tick" x1="${tickTail.x.toFixed(2)}" y1="${tickTail.y.toFixed(2)}" x2="${tickTip.x.toFixed(2)}" y2="${tickTip.y.toFixed(2)}" /><text class="${glyphClass}" x="${cx.toFixed(2)}" y="${cy.toFixed(2)}">${glyph}${p.retrograde ? '<tspan class="retrograde">℞</tspan>' : ''}</text><text class="planet-degree-radial" x="${dx.toFixed(2)}" y="${dy.toFixed(2)}">${parts.degree}</text><text class="planet-minute-radial" x="${mx.toFixed(2)}" y="${my.toFixed(2)}">${parts.minute}</text></g>`;
    })
    .join("");
}

function renderChartWheel(chart,natalChart) {
  const planets = [...(chart?.planets || []),...(chart?.virtualPoints || [])];
  const houseChart = natalChart || chart;
  const angles = houseChart?.angles || [];
  const houseSystem = houseChart?.settings?.house_system || "whole_sign";
  const quadrantHouses = houseChart?.houses?.quadrant || [];
  // Use quadrant cusps for wheel when quadrant system is active and data is available
  const useQuadrant = houseSystem !== "whole_sign" && quadrantHouses.length === 12;
  const houses = useQuadrant ? quadrantHouses : (houseChart?.houses?.whole_sign || []);
  const lots = houseChart?.lots || [];
  const ascLongitude = angles.find((a) => a.key === "asc")?.longitude || 0;
  const angleByKey = Object.fromEntries(angles.map((a) => [a.key, a]));

  // 界表按盘面快照的 bound_system 选取（计算权威在后端，前端仅镜像绘制）
  const boundTable = chart.bound_table;

  // S3: when bounds ring is hidden, scale inner radii proportionally to fill the vacated band
  const boundsOn = astroDisplaySettings.bounds !== false;
  const scale = boundsOn ? 1 : R_BOUND_OUT / R_BOUND_IN; // 144/128 = 1.125 when off
  const rr = {
    hole:        (natalChart ? R_HOLE : 39) * scale,
    houseLabel:  (natalChart ? R_HOUSE_LABEL : 45) * scale,
    houseDiv:    (natalChart ? R_HOUSE_DIV : 51) * scale,
    planetMin:   R_PLANET_MIN  * scale,
    planetDeg:   R_PLANET_DEG  * scale,
    planetGlyph: R_PLANET_GLYPH * scale,
    lotDot:      R_LOT_DOT     * scale,
    axisMid:     R_AXIS_MID    * scale,
    boundIn:     R_BOUND_IN    * scale,  // = R_BOUND_OUT when bounds off
    // outer ring and sign ring never scale
    boundOut:    R_BOUND_OUT,
    sign:        R_SIGN,
    outer:       R_OUTER,
    axisLabel:   R_AXIS_LABEL,
    angle:       R_ANGLE,
  };

  const signSegments = SIGN_KEYS
    .map((key, index) => {
      const color = CHART_COLORS[SIGN_ELEMENTS[key]] || CHART_COLORS.air;
      return `<path class="sign-segment" data-sign-index="${index}" data-point="sign_${index}" role="button" tabindex="0" aria-label="星座 ${index+1}" d="${arcSegmentPath(index * 30, index * 30 + 30, rr.boundOut, rr.outer, ascLongitude)}" fill="${color}" />`;
    })
    .join("");
  const boundSegments = boundsOn
    ? SIGN_KEYS
        .flatMap((signKey, signIndex) => {
          const signStart = signIndex * 30;
          const color = CHART_COLORS[SIGN_ELEMENTS[signKey]] || CHART_COLORS.air;
          return (boundTable[signKey] || []).map(([, start, end], boundIndex) => {
            const fill = mixToPaper(color, [0.72, 0.64, 0.56, 0.48, 0.4][boundIndex] || 0.4);
            return `<path class="bound-segment" data-start="${signStart + start}" data-end="${signStart + end}" data-point="bound_${signIndex}_${boundIndex}" role="button" tabindex="0" aria-label="界 ${signStart+start} 至 ${signStart+end} 度" d="${arcSegmentPath(signStart + start, signStart + end, rr.boundIn, rr.boundOut, ascLongitude)}" fill="${fill}" />`;
          });
        })
        .join("")
    : "";
  const signGapLines = SIGN_KEYS
    .map((_, index) => {
      const outer = pointOnChart(index * 30, rr.outer, ascLongitude);
      const inner = pointOnChart(index * 30, rr.boundOut, ascLongitude);
      return `<line class="segment-gap sign-gap" x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}" />`;
    })
    .join("");
  const boundGapLines = boundsOn ? SIGN_KEYS
    .flatMap((signKey, signIndex) => {
      const signStart = signIndex * 30;
      return (boundTable[signKey] || []).map(([, start]) => {
        const outer = pointOnChart(signStart + start, rr.boundOut, ascLongitude);
        const inner = pointOnChart(signStart + start, rr.boundIn, ascLongitude);
        return `<line class="segment-gap bound-gap" x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}" />`;
      });
    })
    .join("") : "";
  const signs = SIGN_KEYS
    .map((key, index) => {
      const glyph = SIGN_GLYPHS[key];
      const point = pointOnChart(index * 30 + 15, rr.sign, ascLongitude);
      return `<text x="${point.x.toFixed(2)}" y="${point.y.toFixed(2)}">${glyph}</text>`;
    })
    .join("");
  const boundMarks = boundsOn ? SIGN_KEYS
    .flatMap((signKey, signIndex) => {
      const signStart = signIndex * 30;
      return (boundTable[signKey] || []).map(([planetKey, start, end]) => {
        const glyphPoint = pointOnChart(signStart + (start + end) / 2, (rr.boundIn + rr.boundOut) / 2, ascLongitude);
        return `<text class="bound-mark" data-start="${signStart + start}" data-end="${signStart + end}" x="${glyphPoint.x.toFixed(2)}" y="${glyphPoint.y.toFixed(2)}">${PLANET_GLYPHS[planetKey] || ""}</text>`;
      });
    })
    .join("") : "";
  const planetMarks = buildPlanetMarks(planets, ascLongitude, rr);
  const natalMarks = natalChart ? buildPlanetMarks([...(natalChart.planets || []),...(natalChart.virtualPoints || [])], ascLongitude, {...rr,lotDot:88,planetGlyph:74,planetDeg:59,planetMin:52})
    .replaceAll('class="planet-glyph-group ', 'class="planet-glyph-group natal-planet ')
    .replace(/aria-label="([^"]+)"/g, 'aria-label="本命·$1"')
    .replace(/data-point="([^"]+)"/g, 'data-point="natal_$1"') : '';
  const lotMarks = buildLotMarks(lots, ascLongitude, angles, rr);
  const houseDividers = houses
    .map((house) => {
      const inner = pointOnChart(house.cusp_longitude || 0, rr.hole, ascLongitude);
      const outer = pointOnChart(house.cusp_longitude || 0, rr.lotDot - 2, ascLongitude);
      return `<line class="house-divider" x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}" />`;
    })
    .join("");
  const houseMarks = houses
    .map((house, index) => {
      const next = houses[(index + 1) % houses.length].cusp_longitude;
      const middle = house.cusp_longitude + ((next - house.cusp_longitude + 360) % 360) / 2;
      const point = pointOnChart(middle, rr.houseLabel, ascLongitude);
      return `<text class="house-mark" x="${point.x.toFixed(2)}" y="${point.y.toFixed(2)}">${escapeHtml(house.number)}</text>`;
    })
    .join("");
  const angleLabels = angles.map(angle => {
    const key=String(angle.key||'').toLowerCase();
    const point=pointOnChart(angle.longitude,191,ascLongitude);
    const parts=formatDegreeParts(angle.degree_in_sign);
    const horizontal=key==='mc'||key==='ic';
    return `<g class="angle-label compact-axis" data-point="${key}" tabindex="0" role="button" aria-label="${({asc:'上升点',dsc:'下降点',mc:'中天',ic:'天底'})[key]}"><text class="axis-name" x="${(point.x-(horizontal?6:0)).toFixed(2)}" y="${(point.y-(horizontal?0:12)).toFixed(2)}" style="text-anchor:${horizontal?'end':'middle'}">${key.toUpperCase()}</text><text class="axis-value" x="${(point.x+(horizontal?6:0)).toFixed(2)}" y="${(point.y+(horizontal?0:12)).toFixed(2)}" style="text-anchor:${horizontal?'start':'middle'}">${parts.degree}${parts.minute}</text></g>`;
  }).join('');
  let halfWidth=rr.outer+2,halfHeight=rr.outer+2;
  for(const match of (angleLabels+lotMarks).matchAll(/<text\b[^>]*x="([\d.-]+)"[^>]*y="([\d.-]+)"[^>]*>([^<]*)<\/text>/g)){
    const textWidth=match[3].length*(match[0].includes('lot-number')?12:5.5);
    const anchored=/text-anchor:(start|end)/.test(match[0]);
    halfWidth=Math.max(halfWidth,Math.abs(Number(match[1])-160)+textWidth/(anchored?1:2)+2);
    halfHeight=Math.max(halfHeight,Math.abs(Number(match[2])-160)+(match[0].includes('lot-number')?23:9));
  }
  const fittedViewBox=[160-halfWidth,160-halfHeight,halfWidth*2,halfHeight*2].map(n=>n.toFixed(2)).join(' ');


  const axisLines = [
    [angleByKey.asc, angleByKey.dsc],
    [angleByKey.mc, angleByKey.ic],
  ]
    .filter(([start, end]) => start && end)
    .flatMap(([start, end]) => {
      return [start, end].flatMap((angle) => {
        const inner = pointOnChart(angle.longitude, rr.hole, ascLongitude);
        const innerEnd = pointOnChart(angle.longitude, rr.lotDot - 1, ascLongitude);
        const outerStart = pointOnChart(angle.longitude, rr.outer, ascLongitude);
        const label = pointOnChart(angle.longitude, rr.axisLabel, ascLongitude);
        return [
          ``,
          `<line class="axis-line outer-axis" x1="${outerStart.x.toFixed(2)}" y1="${outerStart.y.toFixed(2)}" x2="${label.x.toFixed(2)}" y2="${label.y.toFixed(2)}" />`,
        ];
      });
    })
    .join("");

  // bound-inner-ring circle only rendered when bounds are on
  const boundInnerRing = boundsOn
    ? `<circle class="bound-inner-ring" cx="${WHEEL_CX}" cy="${WHEEL_CY}" r="${rr.boundIn}" />`
    : "";

  return `
    <svg class="m08-wheel" xmlns="http://www.w3.org/2000/svg" viewBox="${fittedViewBox}" aria-label="希腊占星轮盘">
      <text class="chart-caption" x="160" y="-48">${escapeHtml(chart.title)}</text>
      ${astroDisplaySettings.lots.fortune ? `<text class="chart-footer" x="160" y="376">${escapeHtml(chart.legend)}</text>` : ''}
      <g class="sign-segments">${signSegments}</g>
      <g class="bound-segments">${boundSegments}</g>
      <circle class="outer-ring" cx="${WHEEL_CX}" cy="${WHEEL_CY}" r="${rr.outer}" />
      <circle class="sign-boundary-ring" cx="${WHEEL_CX}" cy="${WHEEL_CY}" r="${rr.boundOut}" />
      ${boundInnerRing}
      <g class="segment-gaps">${signGapLines}${boundGapLines}</g>
      <circle cx="${WHEEL_CX}" cy="${WHEEL_CY}" r="${rr.houseDiv}" />
      <circle cx="${WHEEL_CX}" cy="${WHEEL_CY}" r="${rr.hole}" />
      <g class="bound-marks">${boundMarks}</g>
      <g class="sign-marks">${signs}</g>
      <g>${axisLines}</g>
      <g class="house-dividers">${houseDividers}</g>
      <g class="house-marks">${houseMarks}</g>
      <circle class="lot-dot-ring" cx="${WHEEL_CX}" cy="${WHEEL_CY}" r="${rr.lotDot}" />
      <g class="lot-marks">${lotMarks}</g>
      ${natalChart ? `<circle class="natal-transit-separator" cx="${WHEEL_CX}" cy="${WHEEL_CY}" r="88" /><g class="natal-marks">${natalMarks}</g><g class="transit-marks">${planetMarks}</g>` : `<g class="planet-marks">${planetMarks}</g>`}
      <g>${angleLabels}</g>
    </svg>
  `;
}

return {render(chart,options={}){astroDisplaySettings={bounds:options.bounds!==false,lots:{fortune:options.lots!==false,spirit:options.lots!==false,more:options.lots!==false}};return renderChartWheel(chart,options.natalChart);}};
});



