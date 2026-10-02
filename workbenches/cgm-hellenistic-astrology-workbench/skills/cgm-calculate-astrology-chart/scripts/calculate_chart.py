#!/usr/bin/env python3
"""Portable seven-planet chart calculator for CGM skills.

This module is standalone. It does not import or call the Astrologer project.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

try:
    import swisseph as swe
except ImportError as exc:  # pragma: no cover - environment-specific
    raise SystemExit(
        "Missing dependency: pyswisseph. Install scripts/requirements.txt after user approval."
    ) from exc


SCHEMA_VERSION = 4
LOT_FORMULA_SYSTEM = "valens_sect_light_reversal"
HORIZON_SENSITIVITY_DEGREES = 0.25

SIGNS = (
    "aries", "taurus", "gemini", "cancer", "leo", "virgo",
    "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
)

PLANETS = (
    ("sun", swe.SUN),
    ("moon", swe.MOON),
    ("mercury", swe.MERCURY),
    ("venus", swe.VENUS),
    ("mars", swe.MARS),
    ("jupiter", swe.JUPITER),
    ("saturn", swe.SATURN),
)

DOMICILE_RULERS = {
    0: "mars", 1: "venus", 2: "mercury", 3: "moon",
    4: "sun", 5: "mercury", 6: "venus", 7: "mars",
    8: "jupiter", 9: "saturn", 10: "saturn", 11: "jupiter",
}

EGYPTIAN_BOUNDS = {
    0: ((6, "jupiter"), (12, "venus"), (20, "mercury"), (25, "mars"), (30, "saturn")),
    1: ((8, "venus"), (14, "mercury"), (22, "jupiter"), (27, "saturn"), (30, "mars")),
    2: ((6, "mercury"), (12, "jupiter"), (17, "venus"), (24, "mars"), (30, "saturn")),
    3: ((7, "mars"), (13, "venus"), (19, "mercury"), (26, "jupiter"), (30, "saturn")),
    4: ((6, "jupiter"), (11, "venus"), (18, "saturn"), (24, "mercury"), (30, "mars")),
    5: ((7, "mercury"), (17, "venus"), (21, "jupiter"), (28, "mars"), (30, "saturn")),
    6: ((6, "saturn"), (14, "mercury"), (21, "jupiter"), (28, "venus"), (30, "mars")),
    7: ((7, "mars"), (11, "venus"), (19, "mercury"), (24, "jupiter"), (30, "saturn")),
    8: ((12, "jupiter"), (17, "venus"), (21, "mercury"), (26, "saturn"), (30, "mars")),
    9: ((7, "mercury"), (14, "jupiter"), (22, "venus"), (26, "saturn"), (30, "mars")),
    10: ((7, "mercury"), (13, "venus"), (20, "jupiter"), (25, "mars"), (30, "saturn")),
    11: ((12, "venus"), (16, "jupiter"), (19, "mercury"), (28, "mars"), (30, "saturn")),
}

PTOLEMY_LILLY_BOUNDS = {
    0: ((6, "jupiter"), (14, "venus"), (21, "mercury"), (26, "mars"), (30, "saturn")),
    1: ((8, "venus"), (15, "mercury"), (22, "jupiter"), (28, "mars"), (30, "saturn")),
    2: ((7, "mercury"), (14, "jupiter"), (21, "venus"), (27, "mars"), (30, "saturn")),
    3: ((6, "mars"), (13, "jupiter"), (20, "venus"), (27, "mercury"), (30, "saturn")),
    4: ((6, "jupiter"), (13, "mercury"), (19, "venus"), (25, "saturn"), (30, "mars")),
    5: ((7, "mercury"), (13, "venus"), (18, "jupiter"), (24, "saturn"), (30, "mars")),
    6: ((6, "saturn"), (11, "venus"), (16, "mercury"), (24, "jupiter"), (30, "mars")),
    7: ((6, "mars"), (13, "venus"), (21, "jupiter"), (27, "mercury"), (30, "saturn")),
    8: ((8, "jupiter"), (13, "venus"), (18, "mercury"), (24, "saturn"), (30, "mars")),
    9: ((8, "venus"), (13, "mercury"), (19, "jupiter"), (24, "saturn"), (30, "mars")),
    10: ((6, "saturn"), (12, "mercury"), (20, "venus"), (25, "jupiter"), (30, "mars")),
    11: ((8, "venus"), (15, "jupiter"), (21, "mercury"), (26, "mars"), (30, "saturn")),
}

BOUND_TABLES = {
    "egyptian": EGYPTIAN_BOUNDS,
    "ptolemy_lilly": PTOLEMY_LILLY_BOUNDS,
}

HOUSE_SYSTEM_CODES = {
    "placidus": b"P",
    "koch": b"K",
    "regiomontanus": b"R",
    "porphyry": b"O",
    "alcabitius": b"B",
}
HOUSE_SYSTEMS = {"whole_sign", "equal", *HOUSE_SYSTEM_CODES.keys()}
HOUSE_SYSTEM_LABELS_ZH = {
    "whole_sign": "整宫制",
    "equal": "等宫制",
    "placidus": "普拉西德宫制",
    "koch": "科赫宫制",
    "regiomontanus": "雷吉奥蒙塔努斯宫制",
    "porphyry": "波菲利宫制",
    "alcabitius": "阿尔卡比提乌斯宫制",
}

VISIBLE_RELATIONS = {0: "conjunction", 2: "sextile", 3: "square", 4: "trine", 6: "opposition"}
EXACT_ANGLES = {"conjunction": 0.0, "sextile": 60.0, "square": 90.0, "trine": 120.0, "opposition": 180.0}
ANGULAR_HOUSES = {1, 4, 7, 10}
SUCCEDENT_HOUSES = {2, 5, 8, 11}


class InputError(ValueError):
    pass


def normalize(value: float) -> float:
    return value % 360.0


def stored_longitude(value: float) -> float:
    """Round once, then wrap, so storage never contains 360° or a 30° sign degree."""
    return normalize(round(normalize(value), 6))


def circular_distance(left: float, right: float) -> float:
    return abs((left - right + 180.0) % 360.0 - 180.0)


def signed_angle(value: float) -> float:
    return (value + 180.0) % 360.0 - 180.0


def sign_index(longitude: float) -> int:
    return int(normalize(longitude) // 30.0)


def degree_in_sign(longitude: float) -> float:
    return round(stored_longitude(longitude) % 30.0, 6)


def whole_sign_house(longitude: float, asc_sign: int) -> int:
    return ((sign_index(longitude) - asc_sign) % 12) + 1


def equal_house(longitude: float, asc_longitude: float) -> int:
    return int(normalize(longitude - asc_longitude) // 30.0) + 1


def house_motion_group(house: int) -> str:
    if house in ANGULAR_HOUSES:
        return "angular"
    if house in SUCCEDENT_HOUSES:
        return "succedent"
    return "cadent"


def parse_offset(value: str) -> timezone:
    if not re.fullmatch(r"[+-]\d{2}:\d{2}", value):
        raise InputError("utc_offset must use ±HH:MM")
    try:
        hours = int(value[1:3])
        minutes = int(value[4:6])
    except ValueError as exc:
        raise InputError("utc_offset must use ±HH:MM") from exc
    if hours > 18 or minutes > 59:
        raise InputError("utc_offset is outside the supported range")
    seconds = (hours * 3600 + minutes * 60) * (1 if value[0] == "+" else -1)
    return timezone(timedelta(seconds=seconds))


def resolve_local_datetime(payload: dict[str, Any]) -> tuple[datetime, str, str]:
    raw = payload.get("local_datetime")
    if not isinstance(raw, str):
        raise InputError("local_datetime is required")
    if not re.search(r"[Tt ]\d{2}:?\d{2}", raw):
        raise InputError("local_datetime must include a complete date and an explicit time (HH:MM)")
    try:
        local = datetime.fromisoformat(raw)
    except ValueError as exc:
        raise InputError("local_datetime must be ISO 8601") from exc
    basis = payload.get("time_basis", "iana")
    if local.tzinfo is not None:
        # The explicit offset determines the instant. Keep a declared IANA zone
        # for future local labels and birthdays instead of freezing its DST offset.
        if basis == "iana" and payload.get("timezone"):
            zone_name = payload["timezone"]
            try:
                zone = ZoneInfo(zone_name)
            except (ZoneInfoNotFoundError, TypeError, ValueError) as exc:
                raise InputError(f"unknown IANA timezone: {zone_name}") from exc
            try:
                return local.astimezone(zone), "iana", zone_name
            except OverflowError as exc:
                raise InputError("explicit instant is outside the supported datetime range") from exc
        if basis == "fixed_offset" and isinstance(payload.get("utc_offset"), str):
            try:
                zone = parse_offset(payload["utc_offset"])
            except InputError:
                zone = None
            if zone is not None and zone.utcoffset(None) == local.utcoffset():
                return local.astimezone(zone), "fixed_offset", payload["utc_offset"]
        if basis == "lmt" and isinstance(payload.get("longitude"), (int, float)):
            offset_seconds = int(round(float(payload["longitude"]) * 240.0))
            zone = timezone(timedelta(seconds=offset_seconds))
            if zone.utcoffset(None) == local.utcoffset():
                return local.astimezone(zone), "lmt", str(offset_seconds)
        return local, "embedded_offset", str(local.utcoffset())

    if basis == "iana":
        zone_name = payload.get("timezone")
        if not isinstance(zone_name, str) or not zone_name.strip():
            raise InputError("timezone is required for IANA time basis")
        try:
            zone = ZoneInfo(zone_name)
        except ZoneInfoNotFoundError as exc:
            raise InputError(f"unknown IANA timezone: {zone_name}") from exc
        candidates = []
        for fold in (0, 1):
            candidate = local.replace(tzinfo=zone, fold=fold)
            restored = candidate.astimezone(timezone.utc).astimezone(zone)
            if restored.replace(tzinfo=None) == local and all(
                candidate.utcoffset() != prior.utcoffset() for prior in candidates
            ):
                candidates.append(candidate)
        if not candidates:
            raise InputError("this local time does not exist in the IANA timezone; provide a valid time with an explicit UTC offset")
        if len(candidates) > 1:
            raise InputError("this local time occurs twice in the IANA timezone; provide the intended explicit UTC offset")
        return candidates[0], "iana", zone_name
    if basis == "fixed_offset":
        offset = payload.get("utc_offset")
        if not isinstance(offset, str):
            raise InputError("utc_offset is required for fixed_offset time basis")
        return local.replace(tzinfo=parse_offset(offset)), "fixed_offset", offset
    if basis == "lmt":
        longitude = payload.get("longitude")
        if not isinstance(longitude, (int, float)):
            raise InputError("longitude is required for LMT")
        offset_seconds = int(round(float(longitude) * 240.0))
        return local.replace(tzinfo=timezone(timedelta(seconds=offset_seconds))), "lmt", str(offset_seconds)
    raise InputError("time_basis must be iana, fixed_offset, or lmt")


def validate_input(payload: dict[str, Any]) -> None:
    latitude = payload.get("latitude")
    longitude = payload.get("longitude")
    if isinstance(latitude, bool) or not isinstance(latitude, (int, float)) or not -90.0 <= float(latitude) <= 90.0:
        raise InputError("latitude must be between -90 and 90")
    if isinstance(longitude, bool) or not isinstance(longitude, (int, float)) or not -180.0 <= float(longitude) <= 180.0:
        raise InputError("longitude must be between -180 and 180")
    if payload.get("zodiac") not in {"tropical", "sidereal"}:
        raise InputError("zodiac must be tropical or sidereal")
    if payload.get("zodiac") == "sidereal" and payload.get("ayanamsa") not in {"fagan_bradley", "lahiri"}:
        raise InputError("sidereal zodiac requires ayanamsa: fagan_bradley or lahiri")
    if payload.get("bound_system") not in BOUND_TABLES:
        raise InputError("bound_system must be egyptian or ptolemy_lilly")
    if payload.get("house_system") not in HOUSE_SYSTEMS:
        raise InputError("unsupported or missing house_system")


def julian_day(utc_datetime: datetime) -> float:
    hour = (
        utc_datetime.hour
        + utc_datetime.minute / 60.0
        + utc_datetime.second / 3600.0
        + utc_datetime.microsecond / 3_600_000_000.0
    )
    return swe.julday(utc_datetime.year, utc_datetime.month, utc_datetime.day, hour)


def calculation_flags(zodiac: str, ayanamsa: str | None) -> int:
    flags = swe.FLG_MOSEPH | swe.FLG_SPEED
    if zodiac == "sidereal":
        mode = swe.SIDM_FAGAN_BRADLEY if ayanamsa == "fagan_bradley" else swe.SIDM_LAHIRI
        swe.set_sid_mode(mode)
        flags |= swe.FLG_SIDEREAL
    return flags


def bound_ruler(sign: int, degree: float, system: str) -> str:
    for upper, ruler in BOUND_TABLES[system][sign]:
        if degree < upper or upper == 30:
            return ruler
    raise RuntimeError("unreachable bound interval")


def point_payload(key: str, longitude: float, asc_longitude: float, bound_system: str) -> dict[str, Any]:
    longitude = stored_longitude(longitude)
    asc_longitude = stored_longitude(asc_longitude)
    s_index = sign_index(longitude)
    whole_house = whole_sign_house(longitude, sign_index(asc_longitude))
    return {
        "key": key,
        "longitude": longitude,
        "sign": SIGNS[s_index],
        "sign_index": s_index,
        "degree_in_sign": degree_in_sign(longitude),
        "whole_sign_house": whole_house,
        "equal_house": equal_house(longitude, asc_longitude),
        "house_motion_group": house_motion_group(whole_house),
        "domicile_ruler": DOMICILE_RULERS[s_index],
        "bound_ruler": bound_ruler(s_index, degree_in_sign(longitude), bound_system),
    }


def solar_condition(
    jd: float, latitude: float, longitude: float
) -> dict[str, Any]:
    """Return the Sun's true altitude and the day/night formula branch.

    The equatorial calculation is independent of tropical or sidereal zodiac
    settings.  A small horizon band is recorded because slight birth-time
    changes can reverse the Lot formula close to sunrise or sunset.
    """
    equatorial, _ = swe.calc_ut(jd, swe.SUN, swe.FLG_MOSEPH | swe.FLG_EQUATORIAL)
    _, true_altitude, _ = swe.azalt(
        jd,
        swe.EQU2HOR,
        (longitude, latitude, 0.0),
        0.0,
        0.0,
        (equatorial[0], equatorial[1], equatorial[2]),
    )
    altitude = round(float(true_altitude), 6)
    sect = "day" if altitude >= 0.0 else "night"
    return {
        "sect": sect,
        "sun_above_horizon": altitude >= 0.0,
        "sun_true_altitude": altitude,
        "near_horizon": abs(altitude) <= HORIZON_SENSITIVITY_DEGREES,
        "sensitivity_band_degrees": HORIZON_SENSITIVITY_DEGREES,
        "method": "geocentric_equatorial_to_local_horizon",
    }


def lot_longitudes(
    asc_longitude: float, sun_longitude: float, moon_longitude: float, sect: str
) -> dict[str, float]:
    """Calculate the mirrored Lots of Fortune and Spirit."""
    if sect == "day":
        fortune = asc_longitude + moon_longitude - sun_longitude
        spirit = asc_longitude + sun_longitude - moon_longitude
    elif sect == "night":
        fortune = asc_longitude + sun_longitude - moon_longitude
        spirit = asc_longitude + moon_longitude - sun_longitude
    else:
        raise InputError("sect must be day or night")
    return {"fortune": normalize(fortune), "spirit": normalize(spirit)}


def lot_payloads(
    asc_longitude: float,
    sun_longitude: float,
    moon_longitude: float,
    sect: str,
    bound_system: str,
) -> list[dict[str, Any]]:
    longitudes = lot_longitudes(asc_longitude, sun_longitude, moon_longitude, sect)
    if sect == "day":
        formulas = {
            "fortune": "asc + moon - sun",
            "spirit": "asc + sun - moon",
        }
    else:
        formulas = {
            "fortune": "asc + sun - moon",
            "spirit": "asc + moon - sun",
        }
    results: list[dict[str, Any]] = []
    for key in ("fortune", "spirit"):
        point = point_payload(key, longitudes[key], asc_longitude, bound_system)
        point["formula"] = formulas[key]
        point["formula_system"] = LOT_FORMULA_SYSTEM
        point["sect_used"] = sect
        results.append(point)
    return results


def calculate_primary_houses(
    jd: float,
    latitude: float,
    longitude: float,
    flags: int,
    asc_longitude: float,
    house_system: str,
) -> list[dict[str, Any]]:
    if house_system == "whole_sign":
        first_cusp = float(sign_index(asc_longitude) * 30)
        cusps = [normalize(first_cusp + offset * 30.0) for offset in range(12)]
    elif house_system == "equal":
        cusps = [normalize(asc_longitude + offset * 30.0) for offset in range(12)]
    else:
        try:
            raw_cusps, _ = swe.houses_ex(
                jd, latitude, longitude, HOUSE_SYSTEM_CODES[house_system], flags
            )
        except Exception as exc:
            raise InputError(
                f"house system {house_system} cannot be calculated at this latitude and time"
            ) from exc
        cusps = [normalize(float(raw_cusps[index])) for index in range(12)]
        if len({round(value, 8) for value in cusps}) < 12:
            raise InputError(f"house system {house_system} produced degenerate cusps")
    cusps = [stored_longitude(cusp) for cusp in cusps]
    return [
        {
            "number": index + 1,
            "cusp_longitude": cusp,
            "sign": SIGNS[sign_index(cusp)],
            "sign_index": sign_index(cusp),
            "degree_in_sign": degree_in_sign(cusp),
        }
        for index, cusp in enumerate(cusps)
    ]


def house_number_from_cusps(longitude: float, houses: list[dict[str, Any]]) -> int:
    point = normalize(longitude)
    cusps = [float(house["cusp_longitude"]) for house in houses]
    for index, start in enumerate(cusps):
        end = cusps[(index + 1) % 12]
        if end > start and start <= point < end:
            return index + 1
        if end <= start and (point >= start or point < end):
            return index + 1
    raise RuntimeError("point cannot be assigned to primary house cusps")


def apply_primary_houses(
    points: list[dict[str, Any]], houses: list[dict[str, Any]], house_system: str
) -> None:
    for point in points:
        if house_system == "whole_sign":
            primary_house = int(point["whole_sign_house"])
        elif house_system == "equal":
            primary_house = int(point["equal_house"])
        else:
            primary_house = house_number_from_cusps(float(point["longitude"]), houses)
        point["primary_house"] = primary_house
        point["primary_house_motion_group"] = house_motion_group(primary_house)


def angle_payloads(jd: float, latitude: float, longitude: float, flags: int, bound_system: str) -> list[dict[str, Any]]:
    try:
        _, ascmc = swe.houses_ex(jd, latitude, longitude, b"O", flags)
    except Exception as exc:
        raise InputError("angles cannot be calculated for this time and latitude") from exc
    raw = (("asc", ascmc[0]), ("mc", ascmc[1]), ("dsc", ascmc[0] + 180.0), ("ic", ascmc[1] + 180.0))
    asc_longitude = normalize(ascmc[0])
    return [point_payload(key, value, asc_longitude, bound_system) for key, value in raw]


def planet_payloads(jd: float, flags: int, asc_longitude: float, bound_system: str, angles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for key, body_id in PLANETS:
        values, _ = swe.calc_ut(jd, body_id, flags)
        longitude = normalize(values[0])
        speed = round(float(values[3]), 8)
        point = point_payload(key, longitude, asc_longitude, bound_system)
        distances = {angle["key"]: round(circular_distance(point["longitude"], angle["longitude"]), 6) for angle in angles}
        nearest = min(distances, key=distances.get)
        point.update({
            "speed_longitude_per_day": speed,
            "motion": "retrograde" if speed < 0.0 else "direct",
            "retrograde": speed < 0.0,
            "distance_to_angles": distances,
            "nearest_angle": nearest,
            "distance_to_nearest_angle": distances[nearest],
        })
        results.append(point)
    return results


def relation_payload(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    raw_sign_distance = abs(left["sign_index"] - right["sign_index"])
    sign_distance = min(raw_sign_distance, 12 - raw_sign_distance)
    relation = VISIBLE_RELATIONS.get(sign_distance, "aversion")
    payload: dict[str, Any] = {
        "point_a": left["key"],
        "point_b": right["key"],
        "relation": relation,
        "sign_distance": sign_distance,
    }
    if relation == "aversion":
        payload.update({"exact_angle": None, "orb": None, "phase": None})
        return payload

    base_target = EXACT_ANGLES[relation]
    directed = normalize(right["longitude"] - left["longitude"])
    targets = [base_target] if base_target in {0.0, 180.0} else [base_target, 360.0 - base_target]
    target = min(targets, key=lambda item: abs(signed_angle(directed - item)))
    error = signed_angle(directed - target)
    orb = abs(error)
    relative_speed = float(right["speed_longitude_per_day"]) - float(left["speed_longitude_per_day"])
    if orb <= 0.1:
        phase = "exact"
    elif math.isclose(relative_speed, 0.0, abs_tol=1e-12):
        phase = "indeterminate"
    else:
        phase = "applying" if error * relative_speed < 0.0 else "separating"
    payload.update({
        "exact_angle": base_target,
        "orb": round(orb, 6),
        "phase": phase,
        "relative_speed": round(relative_speed, 8),
    })
    return payload


def all_relations(planets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        relation_payload(left, right)
        for index, left in enumerate(planets)
        for right in planets[index + 1:]
    ]


def co_presence_groups(planets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[int, list[str]] = {}
    for planet in planets:
        grouped.setdefault(planet["sign_index"], []).append(planet["key"])
    return [
        {"sign": SIGNS[index], "sign_index": index, "planets": keys}
        for index, keys in sorted(grouped.items()) if len(keys) > 1
    ]


def calculate(payload: dict[str, Any]) -> dict[str, Any]:
    validate_input(payload)
    local_datetime, time_basis, time_reference = resolve_local_datetime(payload)
    try:
        utc_datetime = local_datetime.astimezone(timezone.utc)
    except OverflowError as exc:
        raise InputError("local_datetime is outside the supported UTC datetime range") from exc
    latitude = float(payload["latitude"])
    longitude = float(payload["longitude"])
    zodiac = str(payload["zodiac"])
    ayanamsa = payload.get("ayanamsa") if zodiac == "sidereal" else None
    bound_system = str(payload["bound_system"])
    house_system = str(payload["house_system"])
    jd = julian_day(utc_datetime)
    flags = calculation_flags(zodiac, ayanamsa)
    angles = angle_payloads(jd, latitude, longitude, flags, bound_system)
    asc_longitude = next(item["longitude"] for item in angles if item["key"] == "asc")
    planets = planet_payloads(jd, flags, asc_longitude, bound_system, angles)
    by_planet = {item["key"]: item for item in planets}
    sun_condition = solar_condition(jd, latitude, longitude)
    lots = lot_payloads(
        asc_longitude,
        float(by_planet["sun"]["longitude"]),
        float(by_planet["moon"]["longitude"]),
        str(sun_condition["sect"]),
        bound_system,
    )
    houses = calculate_primary_houses(
        jd, latitude, longitude, flags, asc_longitude, house_system
    )
    apply_primary_houses(angles, houses, house_system)
    apply_primary_houses(planets, houses, house_system)
    apply_primary_houses(lots, houses, house_system)
    relations = all_relations(planets)
    return {
        "schema_version": SCHEMA_VERSION,
        "calculation_backend": "pyswisseph_moshier",
        "metadata": {
            "chart_name": payload.get("chart_name"),
            "location_name": payload.get("location_name"),
            "latitude": latitude,
            "longitude": longitude,
            "local_datetime": local_datetime.isoformat(),
            "utc_datetime": utc_datetime.isoformat(),
            "time_basis": time_basis,
            "time_reference": time_reference,
            "julian_day_ut": round(jd, 8),
        },
        "settings": {
            "zodiac": zodiac,
            "zodiac_label_zh": "回归黄道" if zodiac == "tropical" else "恒星黄道",
            "ayanamsa": ayanamsa,
            "primary_house_system": house_system,
            "primary_house_system_label_zh": HOUSE_SYSTEM_LABELS_ZH[house_system],
            "fixed_reference_house_system": "whole_sign",
            "auxiliary_house_system": "equal_from_ascendant",
            "bound_system": bound_system,
            "points": [key for key, _ in PLANETS],
            "derived_points": ["fortune", "spirit"],
            "lot_formula_system": LOT_FORMULA_SYSTEM,
        },
        "solar_condition": sun_condition,
        "angles": angles,
        "planets": planets,
        "lots": lots,
        "houses": houses,
        "relations": relations,
        "co_presence_groups": co_presence_groups(planets),
    }


def read_payload(path: str) -> dict[str, Any]:
    if path == "-":
        data = json.load(sys.stdin)
    else:
        with Path(path).open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    if not isinstance(data, dict):
        raise InputError("input JSON must be an object")
    return data


def merge_settings(payload: dict[str, Any], path: str | None) -> dict[str, Any]:
    from method_settings import METHOD_KEYS, default_path, read_settings
    try:
        settings = read_settings(path or default_path())
    except (ValueError, OSError) as exc:
        raise InputError(str(exc)) from exc
    conflicts = [key for key in METHOD_KEYS if key in payload and payload[key] != settings.get(key)]
    if conflicts:
        details = '；'.join(f'{key}: 请求 {payload[key]!r}，个人默认 {settings.get(key)!r}' for key in conflicts)
        raise InputError('输入与个人默认设置冲突：' + details + '。请在页面设置中手动切换并保存新盘默认，或明确修改首次设置后重试；本次未生成命盘。')
    return {**payload, **{key: settings.get(key) for key in METHOD_KEYS}}


def main() -> int:
    parser = argparse.ArgumentParser(description="Calculate a portable seven-planet astrology chart")
    parser.add_argument("--input", required=True, help="UTF-8 JSON file, or - for stdin")
    parser.add_argument("--settings", help="Confirmed defaults JSON; defaults to workspace .cgm-hellenistic-astrology/settings.json")
    parser.add_argument("--output", help="Output JSON path; omit to print to stdout")
    args = parser.parse_args()
    try:
        result = calculate(merge_settings(read_payload(args.input), args.settings))
    except (InputError, json.JSONDecodeError) as exc:
        print(f"Input error: {exc}", file=sys.stderr)
        return 2
    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    else:
        print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
