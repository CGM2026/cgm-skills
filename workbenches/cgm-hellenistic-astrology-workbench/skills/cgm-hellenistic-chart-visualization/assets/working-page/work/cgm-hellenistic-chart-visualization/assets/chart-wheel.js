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
  mean_node: "☊",
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
const R_HOLE = 44;
const R_HOUSE_LABEL = 58;
const R_HOUSE_DIV = 72;
const R_PLANET_MIN = 82;
const R_PLANET_DEG = 94;
const R_PLANET_GLYPH = 108;
const R_LOT_DOT = 120;
const R_AXIS_MID = 124;
const R_BOUND_IN = 128;
const R_BOUND_MID = 136;
const R_BOUND_OUT = 144;
const R_SIGN = 154;
const R_OUTER = 166;
const R_AXIS_LABEL = 176;
const R_ANGLE = 184;
const CHART_COLORS = {
  fire: "#DCAB92",
  earth: "#DFC57C",
  air: "#C6C2B0",
  water: "#B9CCB7",
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
      const key = lot.key || "";
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

  // Axis angles as locked virtual members — prevent lot numbers from overlapping axis labels
  const lockedVirtuals = (angles || []).map((a) => ({
    locked: true,
    trueAngle: ((ascLongitude - (a.longitude || 0) + 180 + 360) % 360),
  }));

  const lotItems = visibleLots.map((lot, index) => ({
    ...lot,
    _index: index,
    trueAngle: ((ascLongitude - (lot.longitude || 0) + 180 + 360) % 360),
  }));

  const positioned = fanOutByAngle([...lotItems, ...lockedVirtuals], 7);
  const placedLots = positioned.filter((p) => !p.locked);

  return placedLots.map((p) => {
    const isSpecial = SPECIAL_LOTS.has(p.key || "");
    const cls = isSpecial ? "lot-special" : "lot-other";
    const number = p._index + 1;
    const displayRad = p.displayAngle * (Math.PI / 180);

    // Ticks at true zodiac longitude (broken-line: outer segment + inner segment, no ring crossing)
    const outerBase = pointOnChart(p.longitude || 0, rr.outer, ascLongitude);
    const outerTip = pointOnChart(p.longitude || 0, rr.outer + 8, ascLongitude);
    const innerBase = pointOnChart(p.longitude || 0, rr.boundIn, ascLongitude);
    const innerTip = pointOnChart(p.longitude || 0, rr.lotDot + 2, ascLongitude);

    // Number label at fanned-out display angle
    const numX = WHEEL_CX + Math.cos(displayRad) * (rr.outer + 28);
    const numY = WHEEL_CY + Math.sin(displayRad) * (rr.outer + 28);

    // Leader line from outer tick tip toward number, drawn only when displaced
    const displaced = Math.abs(((p.displayAngle - p.trueAngle + 540) % 360) - 180) > 0.05;
    let leaderSvg = "";
    if (displaced) {
      const radialUnit = normalizeVector({ x: outerTip.x - WHEEL_CX, y: outerTip.y - WHEEL_CY });
      const guideUnit = normalizeVector({ x: numX - outerTip.x, y: numY - outerTip.y }, radialUnit);
      const lineUnit = limitVectorAngle(radialUnit, guideUnit, Math.PI / 4);
      const leaderDist = Math.hypot(numX - outerTip.x, numY - outerTip.y);
      const leaderEnd = trimLineBeforeLabel(
        outerTip,
        lineUnit,
        { x: numX, y: numY },
        6,
        leaderDist,
      );
      leaderSvg = `<line class="lot-leader" x1="${outerTip.x.toFixed(2)}" y1="${outerTip.y.toFixed(2)}" x2="${leaderEnd.x.toFixed(2)}" y2="${leaderEnd.y.toFixed(2)}" />`;
    }

    return `<g class="lot-mark ${cls}" data-point="${p.key}" tabindex="0" role="button" aria-label="${escapeHtml(p.label)}"><title>${escapeHtml(p.label)}</title><line class="lot-tick-outer" x1="${outerBase.x.toFixed(2)}" y1="${outerBase.y.toFixed(2)}" x2="${outerTip.x.toFixed(2)}" y2="${outerTip.y.toFixed(2)}" /><line class="lot-tick-inner" x1="${innerBase.x.toFixed(2)}" y1="${innerBase.y.toFixed(2)}" x2="${innerTip.x.toFixed(2)}" y2="${innerTip.y.toFixed(2)}" />${leaderSvg}<text class="lot-number" x="${numX.toFixed(2)}" y="${numY.toFixed(2)}">${number}</text></g>`;
  }).join("");
}

function buildPlanetMarks(planets, ascLongitude, rr) {
  if (!planets.length) return "";
  const positioned = fanOutByAngle(planets.map((p) => ({
    ...p,
    trueAngle: ((ascLongitude - (p.longitude || 0) + 180 + 360) % 360),
  })), 8);
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

function renderChartWheel(chart) {
  const planets = chart?.planets || [];
  const angles = chart?.angles || [];
  const houseSystem = chart?.settings?.house_system || "whole_sign";
  const quadrantHouses = chart?.houses?.quadrant || [];
  // Use quadrant cusps for wheel when quadrant system is active and data is available
  const useQuadrant = houseSystem !== "whole_sign" && quadrantHouses.length === 12;
  const houses = useQuadrant ? quadrantHouses : (chart?.houses?.whole_sign || []);
  const lots = chart?.lots || [];
  const ascLongitude = angles.find((a) => a.key === "asc")?.longitude || 0;
  const angleByKey = Object.fromEntries(angles.map((a) => [a.key, a]));

  // 界表按盘面快照的 bound_system 选取（计算权威在后端，前端仅镜像绘制）
  const boundTable = chart.bound_table;

  // S3: when bounds ring is hidden, scale inner radii proportionally to fill the vacated band
  const boundsOn = astroDisplaySettings.bounds !== false;
  const scale = boundsOn ? 1 : R_BOUND_OUT / R_BOUND_IN; // 144/128 = 1.125 when off
  const rr = {
    hole:        R_HOLE        * scale,
    houseLabel:  R_HOUSE_LABEL * scale,
    houseDiv:    R_HOUSE_DIV   * scale,
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
      return `<path class="sign-segment" d="${arcSegmentPath(index * 30, index * 30 + 30, rr.boundOut, rr.outer, ascLongitude)}" fill="${color}" />`;
    })
    .join("");
  const boundSegments = boundsOn
    ? SIGN_KEYS
        .flatMap((signKey, signIndex) => {
          const signStart = signIndex * 30;
          const color = CHART_COLORS[SIGN_ELEMENTS[signKey]] || CHART_COLORS.air;
          return (boundTable[signKey] || []).map(([, start, end], boundIndex) => {
            const fill = mixToPaper(color, [0.72, 0.64, 0.56, 0.48, 0.4][boundIndex] || 0.4);
            return `<path class="bound-segment" d="${arcSegmentPath(signStart + start, signStart + end, rr.boundIn, rr.boundOut, ascLongitude)}" fill="${fill}" />`;
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
        return `<text class="bound-mark" x="${glyphPoint.x.toFixed(2)}" y="${glyphPoint.y.toFixed(2)}">${PLANET_GLYPHS[planetKey] || ""}</text>`;
      });
    })
    .join("") : "";
  const planetMarks = buildPlanetMarks(planets, ascLongitude, rr);
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
  const angleLabels = angles
    .map((angle) => {
      const point = pointOnChart(angle.longitude, rr.angle, ascLongitude);
      const anchor = textAnchorForPoint(point);
      const key = String(angle.key || "").toUpperCase();
      const normalizedKey = String(angle.key || "").toLowerCase();
      const parts = formatDegreeParts(angle.degree_in_sign);
      if (normalizedKey === "mc" || normalizedKey === "ic") {
        return `
          <g class="angle-label angle-label-horizontal">
            <text class="angle-name" x="${(point.x - 8).toFixed(2)}" y="${point.y.toFixed(2)}">${key}</text>
            <text class="angle-degree-value" x="${(point.x + 8).toFixed(2)}" y="${point.y.toFixed(2)}">${parts.degree}<tspan class="angle-minute-value">${parts.minute}</tspan></text>
          </g>
        `;
      }
      return `
        <text class="angle-label angle-label-vertical" x="${point.x.toFixed(2)}" y="${point.y.toFixed(2)}" style="text-anchor:${anchor}">
          <tspan x="${point.x.toFixed(2)}" dy="-10">${key}</tspan>
          <tspan x="${point.x.toFixed(2)}" dy="20" class="angle-degree-value">${parts.degree}<tspan class="angle-minute-value">${parts.minute}</tspan></tspan>
        </text>
      `;
    })
    .join("");
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
          `<line class="axis-line" x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${innerEnd.x.toFixed(2)}" y2="${innerEnd.y.toFixed(2)}" />`,
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
    <svg class="m08-wheel" xmlns="http://www.w3.org/2000/svg" viewBox="-64 -64 448 448" aria-label="希腊占星轮盘">
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
      <g>${planetMarks}</g>
      <g>${angleLabels}</g>
    </svg>
  `;
}

return {render(chart,options={}){astroDisplaySettings={bounds:options.bounds!==false,lots:{fortune:options.lots!==false,spirit:options.lots!==false,more:false}};return renderChartWheel(chart);}};
});
