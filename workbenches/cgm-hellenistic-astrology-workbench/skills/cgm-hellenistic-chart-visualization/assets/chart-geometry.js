// Pure geometry functions for the natal chart wheel.
// Dual-environment: exposes ChartGeometry on window (browser) or module.exports (Node/test).
//
// arcSegmentPath implicit constraint: lonEnd > lonStart, sweep <= 180 degrees, no cross-zero arc.
// Callers must pre-split arcs that cross 0° or exceed 180°.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.ChartGeometry = factory();
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CHART_CENTER = 160;

  function pointOnChart(longitude, radius, ascLongitude = 0) {
    const angle = ((ascLongitude - (longitude || 0) + 180 + 360) % 360) * (Math.PI / 180);
    return {
      x: CHART_CENTER + Math.cos(angle) * radius,
      y: CHART_CENTER + Math.sin(angle) * radius,
    };
  }

  // arcSegmentPath implicit constraint: lonEnd > lonStart, sweep <= 180, no cross-zero arc.
  function arcSegmentPath(lonStart, lonEnd, rInner, rOuter, ascLongitude = 0) {
    const startOuter = pointOnChart(lonStart, rOuter, ascLongitude);
    const endOuter = pointOnChart(lonEnd, rOuter, ascLongitude);
    const endInner = pointOnChart(lonEnd, rInner, ascLongitude);
    const startInner = pointOnChart(lonStart, rInner, ascLongitude);
    const sweep = Math.abs(lonEnd - lonStart);
    const largeArc = sweep > 180 ? 1 : 0;
    return [
      `M ${startOuter.x.toFixed(2)} ${startOuter.y.toFixed(2)}`,
      `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${endOuter.x.toFixed(2)} ${endOuter.y.toFixed(2)}`,
      `L ${endInner.x.toFixed(2)} ${endInner.y.toFixed(2)}`,
      `A ${rInner} ${rInner} 0 ${largeArc} 1 ${startInner.x.toFixed(2)} ${startInner.y.toFixed(2)}`,
      "Z",
    ].join(" ");
  }

  function normalizeVector(vector, fallback = { x: 1, y: 0 }) {
    const length = Math.hypot(vector.x, vector.y);
    if (!Number.isFinite(length) || length === 0) {
      return fallback;
    }
    return { x: vector.x / length, y: vector.y / length };
  }

  function limitVectorAngle(base, target, maxAngleRad) {
    const cross = base.x * target.y - base.y * target.x;
    const dot = base.x * target.x + base.y * target.y;
    const angle = Math.atan2(cross, dot);
    const limited = Math.max(-maxAngleRad, Math.min(maxAngleRad, angle));
    const cos = Math.cos(limited);
    const sin = Math.sin(limited);
    return {
      x: base.x * cos - base.y * sin,
      y: base.x * sin + base.y * cos,
    };
  }

  function trimLineBeforeLabel(start, direction, labelCenter, labelRadius, maxDistance) {
    const unit = normalizeVector(direction);
    const toCenter = {
      x: labelCenter.x - start.x,
      y: labelCenter.y - start.y,
    };
    const projected = toCenter.x * unit.x + toCenter.y * unit.y;
    const centerDistanceSq = toCenter.x * toCenter.x + toCenter.y * toCenter.y;
    const perpendicularSq = Math.max(0, centerDistanceSq - projected * projected);
    const radiusSq = labelRadius * labelRadius;
    let distance = maxDistance;

    if (projected > 0 && perpendicularSq < radiusSq) {
      const entryDistance = projected - Math.sqrt(radiusSq - perpendicularSq);
      distance = Math.min(distance, Math.max(0, entryDistance));
    }

    return {
      x: start.x + unit.x * distance,
      y: start.y + unit.y * distance,
    };
  }

  function fanOutByAngle(items, minSpacingDeg) {
    if (!items.length) return [];
    const withAngles = items.map((item) => ({ ...item }));
    withAngles.sort((a, b) => a.trueAngle - b.trueAngle);
    const clusters = [];
    let current = [withAngles[0]];
    for (let i = 1; i < withAngles.length; i++) {
      const gap = withAngles[i].trueAngle - withAngles[i - 1].trueAngle;
      if (gap < minSpacingDeg) {
        current.push(withAngles[i]);
      } else {
        clusters.push(current);
        current = [withAngles[i]];
      }
    }
    clusters.push(current);
    if (clusters.length > 1) {
      const last = clusters[clusters.length - 1];
      const first = clusters[0];
      const wrapGap = (first[0].trueAngle + 360) - last[last.length - 1].trueAngle;
      if (wrapGap < minSpacingDeg) {
        // Offset first-cluster angles by +360 so the merged cluster is monotone
        clusters[0] = [...last, ...first.map((p) => ({ ...p, trueAngle: p.trueAngle + 360 }))];
        clusters.pop();
      }
    }
    const positioned = [];
    for (const cluster of clusters) {
      const n = cluster.length;
      if (n === 1) {
        const da = ((cluster[0].trueAngle % 360) + 360) % 360;
        positioned.push({ ...cluster[0], displayAngle: da });
        continue;
      }
      const hasLockedInCluster = cluster.some((p) => p.locked);
      if (!hasLockedInCluster) {
        const centerAngle = cluster.reduce((s, p) => s + p.trueAngle, 0) / n;
        const totalSpread = (n - 1) * minSpacingDeg;
        const startAngle = centerAngle - totalSpread / 2;
        for (let i = 0; i < n; i++) {
          const da = (((startAngle + i * minSpacingDeg) % 360) + 360) % 360;
          positioned.push({ ...cluster[i], displayAngle: da });
        }
      } else {
        // Locked items stay at trueAngle. When a cluster straddles one locked axis,
        // keep the non-locked members on their respective sides instead of shifting
        // the whole group to one side.
        for (const item of cluster) {
          if (item.locked) {
            positioned.push({ ...item, displayAngle: ((item.trueAngle % 360) + 360) % 360 });
          }
        }
        const nonLocked = cluster.filter((p) => !p.locked);
        const lockedItems = cluster.filter((p) => p.locked);
        const lockedDas = lockedItems.map((p) => ((p.trueAngle % 360) + 360) % 360);
        if (nonLocked.length > 0) {
          let baseAngles;
          if (lockedItems.length === 1) {
            const lockedAngle = lockedItems[0].trueAngle;
            const sortedNonLocked = [...nonLocked].sort((a, b) => a.trueAngle - b.trueAngle);
            const count = sortedNonLocked.length;
            const averageAngle = sortedNonLocked.reduce((sum, item) => sum + item.trueAngle, 0) / count;
            const extraOnPositiveSide = averageAngle >= lockedAngle;
            let negativeCount = Math.floor(count / 2);
            let positiveCount = Math.floor(count / 2);
            if (count % 2 === 1) {
              if (extraOnPositiveSide) positiveCount += 1;
              else negativeCount += 1;
            }
            const targetAngles = [];
            for (let index = negativeCount; index >= 1; index--) {
              targetAngles.push(lockedAngle - minSpacingDeg * index);
            }
            for (let index = 1; index <= positiveCount; index++) {
              targetAngles.push(lockedAngle + minSpacingDeg * index);
            }
            const angleByItem = new Map();
            sortedNonLocked.forEach((item, index) => {
              angleByItem.set(item, targetAngles[index]);
            });
            baseAngles = nonLocked.map((item) => angleByItem.get(item));
          } else {
            const nlCenter = nonLocked.reduce((s, p) => s + p.trueAngle, 0) / nonLocked.length;
            const nlSpread = (nonLocked.length - 1) * minSpacingDeg;
            baseAngles = nonLocked.map((_, i) => (nlCenter - nlSpread / 2) + i * minSpacingDeg);
            for (const lockedDa of lockedDas) {
              const groupCenter = baseAngles.reduce((s, a) => s + a, 0) / baseAngles.length;
              const dirDiff = ((groupCenter - lockedDa + 540) % 360) - 180;
              const hasOverlap = baseAngles.some((a) => Math.abs(((a - lockedDa + 540) % 360) - 180) < minSpacingDeg);
              if (hasOverlap) {
                if (dirDiff >= 0) {
                  const minA = Math.min(...baseAngles);
                  const shift = lockedDa + minSpacingDeg - minA;
                  if (shift > 0) baseAngles = baseAngles.map((a) => a + shift);
                } else {
                  const maxA = Math.max(...baseAngles);
                  const shift = lockedDa - minSpacingDeg - maxA;
                  if (shift < 0) baseAngles = baseAngles.map((a) => a + shift);
                }
              }
            }
          }
          for (let i = 0; i < nonLocked.length; i++) {
            positioned.push({ ...nonLocked[i], displayAngle: ((baseAngles[i] % 360) + 360) % 360 });
          }
        }
      }
    }

    // Second pass: detect post-expansion inter-cluster collisions and re-center.
    // Handles the case where a large cluster's spread overlaps a neighboring solo star.
    positioned.sort((a, b) => a.displayAngle - b.displayAngle);
    const final = [];
    let i = 0;
    while (i < positioned.length) {
      let j = i + 1;
      while (j < positioned.length && positioned[j].displayAngle - positioned[j - 1].displayAngle < minSpacingDeg) {
        j++;
      }
      const group = positioned.slice(i, j);
      if (group.length === 1) {
        final.push(group[0]);
      } else {
        const hasLockedInGroup = group.some((p) => p.locked);
        if (!hasLockedInGroup) {
          const center = group.reduce((s, p) => s + p.displayAngle, 0) / group.length;
          const spread = (group.length - 1) * minSpacingDeg;
          const start = center - spread / 2;
          for (let k = 0; k < group.length; k++) {
            const da = (((start + k * minSpacingDeg) % 360) + 360) % 360;
            final.push({ ...group[k], displayAngle: da });
          }
        } else {
          // locked items remain fixed; non-locked items pushed away from locked positions
          const lockedInGroup = group.filter((p) => p.locked);
          const nonLockedInGroup = group.filter((p) => !p.locked);
          for (const item of lockedInGroup) {
            final.push(item);
          }
          for (const item of nonLockedInGroup) {
            let da = item.displayAngle;
            for (const locked of lockedInGroup) {
              const diff = ((da - locked.displayAngle + 540) % 360) - 180;
              if (Math.abs(diff) < minSpacingDeg) {
                da = diff >= 0
                  ? (((locked.displayAngle + minSpacingDeg) % 360) + 360) % 360
                  : (((locked.displayAngle - minSpacingDeg) % 360) + 360) % 360;
              }
            }
            final.push({ ...item, displayAngle: da });
          }
        }
      }
      i = j;
    }
    return final;
  }

  return {
    pointOnChart,
    arcSegmentPath,
    normalizeVector,
    limitVectorAngle,
    trimLineBeforeLabel,
    fanOutByAngle,
    CHART_CENTER,
  };
}));
