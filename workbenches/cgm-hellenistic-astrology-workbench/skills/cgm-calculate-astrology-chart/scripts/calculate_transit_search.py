"""Evaluate transit conditions from calculated natal facts and time input."""
from __future__ import annotations
from datetime import datetime,timedelta,timezone
from calculate_chart import PLANETS,BOUND_TABLES,calculation_flags,julian_day,resolve_local_datetime,swe

PLANET_IDS = dict(PLANETS)
ASPECTS = {"conjunction": 0, "sextile": 60, "square": 90,
           "trine": 120, "opposition": 180}


def distance(a: float, b: float) -> float:
    return abs((a - b + 180) % 360 - 180)


def house_of(lon: float, cusps: list[float]) -> int:
    for i, start in enumerate(cusps):
        if (lon - start) % 360 < (cusps[(i + 1) % 12] - start) % 360:
            return i + 1
    return 12


def search_facts(original: dict, facts: dict, request: dict) -> dict:
    methods = request.get("methods", {})
    zodiac = methods.get("zodiac", original["zodiac"])
    ayanamsa = methods.get("ayanamsa", original.get("ayanamsa"))
    bound = methods.get("bound", original["bound_system"])
    house = methods.get("house", original["house_system"])
    if zodiac not in ("tropical", "sidereal") or bound not in BOUND_TABLES:
        raise ValueError("排盘口径无效。")
    natal_points = {p["key"]: p["longitude"] for group in ("planets", "angles", "lots") for p in facts.get(group, [])}
    visible_lots = request.get("visible_lots", [])
    if not isinstance(visible_lots, list) or len(visible_lots) > 10:
        raise ValueError("签点选择无效。")
    # Custom lots are calculated by the existing chart formula editor and passed
    # with their visible names and current natal longitude.
    for lot in visible_lots:
        if not isinstance(lot, dict) or not isinstance(lot.get("key"), str) or not 0 <= lot.get("longitude", -1) < 360:
            raise ValueError("签点位置无效。")
        natal_points[lot["key"]] = lot["longitude"]
    allowed_natal = {p["key"] for p in facts.get("planets", []) + facts.get("angles", [])} | {p["key"] for p in visible_lots}
    conditions = request.get("conditions", [])
    if not isinstance(conditions, list) or not 1 <= len(conditions) <= 12:
        raise ValueError("请设置 1 至 12 条条件。")
    needed = set()
    for c in conditions:
        if not isinstance(c, dict) or c.get("planet") not in PLANET_IDS:
            raise ValueError("行运星体无效。")
        needed.add(c["planet"])
        if c.get("kind") == "aspect":
            if c.get("aspect") not in ASPECTS or not 0.05 <= float(c.get("orb", 0)) <= 10:
                raise ValueError("相位或容许度无效。")
            if c.get("target_chart") == "natal":
                if c.get("target") not in allowed_natal:
                    raise ValueError("只能选择当前显示的本命签点。")
            elif c.get("target_chart") == "transit" and c.get("target") in PLANET_IDS:
                needed.add(c["target"])
            else:
                raise ValueError("相位对象无效。")
        elif c.get("kind") == "position":
            if c.get("scope") not in ("sign", "house") or not 0 <= int(c.get("value", -1)) <= 12:
                raise ValueError("位置条件无效。")
            if c.get("scope") == "sign" and not 0 <= int(c["value"]) < 12:
                raise ValueError("星座无效。")
            if c.get("scope") == "house" and not 1 <= int(c["value"]) <= 12:
                raise ValueError("宫位无效。")
            if c.get("detail") not in ("any", "bound", "range", "degree"):
                raise ValueError("细化条件无效。")
            if c.get("detail") == "bound" and c.get("ruler") not in PLANET_IDS:
                raise ValueError("界主无效。")
            limit = 30 if c["scope"] == "sign" else 360
            if c.get("detail") in ("range", "degree") and not 0 <= float(c.get("degree", -1)) < limit:
                raise ValueError("度数无效。")
            if c.get("detail") == "range" and not float(c["degree"]) < float(c.get("end_degree", 0)) <= limit:
                raise ValueError("度数范围无效。")
            if c.get("detail") == "degree" and not 0.05 <= float(c.get("orb", 0)) <= 1:
                raise ValueError("特定度数的容差应为 0.05° 至 1°。")
        else:
            raise ValueError("未知条件类型。")
        if c.get("motion", "any") not in ("any", "direct", "retrograde"):
            raise ValueError("运行状态无效。")
    start = datetime.fromisoformat(request.get("start", ""))
    end = datetime.fromisoformat(request.get("end", ""))
    try:
        latest_end = start.replace(year=start.year + 200)
    except ValueError:  # February 29 in a non-leap terminal year
        latest_end = start.replace(year=start.year + 200, day=28)
    if not start < end or end > latest_end:
        raise ValueError("搜索范围须大于零且不超过 200 年。")
    original["local_datetime"] = start.isoformat()
    start_local, _, _ = resolve_local_datetime(original)
    original["local_datetime"] = end.isoformat()
    end_local, _, _ = resolve_local_datetime(original)
    start_utc = start_local.astimezone(timezone.utc)
    end_utc = end_local.astimezone(timezone.utc)
    flags = calculation_flags(zodiac, ayanamsa)
    cusps = [p["cusp_longitude"] for p in sorted(facts["houses"], key=lambda p: p["number"])]
    cache = {}

    def evaluate(moment: datetime):
        tick = int(moment.timestamp() // 60)
        if tick in cache:
            return cache[tick]
        jd = julian_day(moment)
        positions = {}
        for planet in needed:
            values, _ = swe.calc_ut(jd, PLANET_IDS[planet], flags)
            positions[planet] = (values[0] % 360, values[3])
        details = []
        for c in conditions:
            lon, speed = positions[c["planet"]]
            motion = c.get("motion", "any")
            good = motion == "any" or (speed < 0 if motion == "retrograde" else speed >= 0)
            if c["kind"] == "position":
                good &= (int(lon // 30) == int(c["value"]) if c["scope"] == "sign" else house_of(lon, cusps) == int(c["value"]))
                degree = lon % 30 if c["scope"] == "sign" else (lon - cusps[int(c["value"]) - 1]) % 360
                if c["detail"] == "bound":
                    ruler = next(r for upper, r in BOUND_TABLES[bound][int(lon // 30)] if lon % 30 < upper or upper == 30)
                    good &= ruler == c["ruler"]
                elif c["detail"] == "range":
                    good &= float(c["degree"]) <= degree < float(c.get("end_degree", 30))
                elif c["detail"] == "degree":
                    good &= abs(degree - float(c["degree"])) <= float(c.get("orb", 1 / 12))
                details.append({"planet": c["planet"], "longitude": round(lon, 6), "matched": bool(good)})
            else:
                target = natal_points[c["target"]] if c["target_chart"] == "natal" else positions[c["target"]][0]
                separation = distance(lon, target)
                delta = abs(separation - ASPECTS[c["aspect"]])
                good &= delta <= float(c["orb"])
                details.append({"planet": c["planet"], "longitude": round(lon, 6), "target": c["target"], "target_chart": c["target_chart"], "target_longitude": round(target, 6), "separation": round(separation, 6), "delta": round(delta, 6), "matched": bool(good)})
        result = (all(x["matched"] for x in details), details)
        cache[tick] = result
        return result

    def edge(a, b, left_state, index):
        while b - a > timedelta(minutes=1):
            middle = a + (b - a) / 2
            middle = middle.replace(second=0, microsecond=0)
            if middle <= a or middle >= b:
                break
            if evaluate(middle)[1][index]["matched"] == left_state:
                a = middle
            else:
                b = middle
        return b

    narrow = any(c["kind"] == "aspect" and float(c["orb"]) <= 0.2 or
                 c["kind"] == "position" and c["detail"] == "degree" and float(c["orb"]) <= 0.2
                 for c in conditions)
    step_minutes = 5 if "moon" in needed else 15 if narrow else 60
    step = timedelta(minutes=step_minutes)
    intervals = []
    condition_counts = [0] * len(conditions)
    chunk_start = start_utc
    while chunk_start < end_utc:
        chunk_end = min(chunk_start + timedelta(days=365), end_utc)
        per_condition = []
        for index in range(len(conditions)):
            found = []
            cursor = chunk_start
            active = evaluate(cursor)[1][index]["matched"]
            opened = cursor if active else None
            while cursor < chunk_end:
                following = min(cursor + step, chunk_end)
                next_active = evaluate(following)[1][index]["matched"]
                if next_active != active:
                    crossing = edge(cursor, following, active, index)
                    if next_active:
                        opened = crossing
                    elif opened is not None:
                        found.append((opened, crossing))
                        opened = None
                cursor, active = following, next_active
            if opened is not None:
                found.append((opened, chunk_end))
            condition_counts[index] += len(found)
            per_condition.append(found)
        current = per_condition[0]
        for found in per_condition[1:]:
            overlap = []
            i = j = 0
            while i < len(current) and j < len(found):
                a = max(current[i][0], found[j][0])
                b = min(current[i][1], found[j][1])
                if a < b:
                    overlap.append((a, b))
                if current[i][1] <= found[j][1]:
                    i += 1
                else:
                    j += 1
            current = overlap
            if not current:
                break
        for a, b in current:
            if intervals and intervals[-1][1] == a:
                intervals[-1] = (intervals[-1][0], b)
            else:
                intervals.append((a, b))
        chunk_start = chunk_end
        cache.clear()
        if len(intervals) > 40:
            break
    results = []
    for a, b in intervals[:40]:
        middle = a + (b - a) / 2
        results.append({"start": a.astimezone(start_local.tzinfo).strftime("%Y-%m-%dT%H:%M"),
                        "end": b.astimezone(start_local.tzinfo).strftime("%Y-%m-%dT%H:%M"),
                        "moment": middle.astimezone(start_local.tzinfo).strftime("%Y-%m-%dT%H:%M"),
                        "details": evaluate(middle)[1]})
    return {"results": results, "truncated": len(intervals) > 40 or chunk_start < end_utc,
            "condition_counts": condition_counts,
            "resolution_minutes": step_minutes, "edge_precision_minutes": 1}
