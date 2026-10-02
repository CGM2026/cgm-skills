#!/usr/bin/env python3
"""Validate the stable output contract of cgm-calculate-astrology-chart."""

from __future__ import annotations

import argparse
import json
import math
import re
from datetime import datetime, timedelta, timezone
from itertools import combinations
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


EXPECTED_PLANETS = {"sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"}
PLANET_ORDER = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn"]
EXPECTED_ANGLES = {"asc", "mc", "dsc", "ic"}
EXPECTED_LOTS = {"fortune", "spirit"}
SIGNS = (
    "aries", "taurus", "gemini", "cancer", "leo", "virgo",
    "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces",
)
HOUSE_SYSTEMS = {
    "whole_sign", "equal", "placidus", "koch", "regiomontanus", "porphyry", "alcabitius"
}
RELATIONS_BY_DISTANCE = {
    0: "conjunction", 1: "aversion", 2: "sextile", 3: "square",
    4: "trine", 5: "aversion", 6: "opposition",
}
EXACT_ANGLES = {
    "conjunction": 0.0, "sextile": 60.0, "square": 90.0,
    "trine": 120.0, "opposition": 180.0,
}
MOTION_GROUPS = {"angular", "succedent", "cadent"}


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def valid_longitude(value: Any) -> bool:
    return is_number(value) and 0.0 <= float(value) < 360.0


def normalize(value: float) -> float:
    return value % 360.0


def circular_distance(left: float, right: float) -> float:
    return abs((left - right + 180.0) % 360.0 - 180.0)


def expected_motion_group(house: int) -> str:
    if house in {1, 4, 7, 10}:
        return "angular"
    if house in {2, 5, 8, 11}:
        return "succedent"
    return "cadent"


def validate_metadata(metadata: Any, errors: list[str]) -> None:
    require(isinstance(metadata, dict), "metadata must be an object", errors)
    if not isinstance(metadata, dict):
        return
    required = {
        "chart_name", "location_name", "latitude", "longitude", "local_datetime",
        "utc_datetime", "time_basis", "time_reference", "julian_day_ut",
    }
    require(required <= metadata.keys(), "metadata is missing required fields", errors)
    latitude = metadata.get("latitude")
    longitude = metadata.get("longitude")
    require(is_number(latitude) and -90 <= float(latitude) <= 90, "metadata: invalid latitude", errors)
    require(is_number(longitude) and -180 <= float(longitude) <= 180, "metadata: invalid longitude", errors)
    require(isinstance(metadata.get("local_datetime"), str) and bool(metadata["local_datetime"].strip()),
            "metadata: invalid local_datetime", errors)
    require(isinstance(metadata.get("utc_datetime"), str) and bool(metadata["utc_datetime"].strip()),
            "metadata: invalid utc_datetime", errors)
    require(metadata.get("time_basis") in {"iana", "fixed_offset", "lmt", "embedded_offset"},
            "metadata: invalid time_basis", errors)
    require(isinstance(metadata.get("time_reference"), str) and bool(metadata["time_reference"].strip()),
            "metadata: invalid time_reference", errors)
    jd = metadata.get("julian_day_ut")
    require(is_number(jd) and math.isfinite(float(jd)), "metadata: invalid julian_day_ut", errors)

    def instant(field):
        raw = metadata.get(field)
        if not isinstance(raw, str) or not re.match(r"^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}", raw):
            errors.append(f"metadata: {field} must contain an explicit date, time, and UTC offset")
            return None
        try:
            value = datetime.fromisoformat(raw)
        except ValueError:
            errors.append(f"metadata: invalid ISO datetime in {field}")
            return None
        if value.tzinfo is None or value.utcoffset() is None:
            errors.append(f"metadata: {field} requires an explicit UTC offset")
            return None
        return value

    local, utc = instant("local_datetime"), instant("utc_datetime")
    if utc is not None:
        require(utc.utcoffset() == timedelta(0), "metadata: utc_datetime must be expressed in UTC", errors)
    if local is not None and utc is not None:
        require(abs((local - utc).total_seconds()) <= 0.000001,
                "metadata: local_datetime and utc_datetime do not describe the same instant", errors)
    if utc is not None and is_number(jd) and math.isfinite(float(jd)):
        # Proleptic Gregorian arithmetic independent of the ephemeris library.
        expected_jd = 2451545.0 + (utc - datetime(2000, 1, 1, 12, tzinfo=timezone.utc)).total_seconds() / 86400
        require(abs(float(jd) - expected_jd) <= 0.00000001,
                "metadata: julian_day_ut does not match utc_datetime", errors)
    basis, reference = metadata.get("time_basis"), metadata.get("time_reference")
    if local is not None and utc is not None and basis == "iana":
        try:
            expected_local = utc.astimezone(ZoneInfo(reference))
        except (ZoneInfoNotFoundError, TypeError, ValueError, OverflowError):
            errors.append("metadata: invalid IANA time_reference")
        else:
            require(local.utcoffset() == expected_local.utcoffset()
                    and local.replace(tzinfo=None) == expected_local.replace(tzinfo=None),
                    "metadata: local_datetime offset does not match the IANA time_reference at this instant", errors)
    if local is not None and basis == "fixed_offset":
        if not isinstance(reference, str) or not re.fullmatch(r"[+-]\d{2}:\d{2}", reference):
            errors.append("metadata: invalid fixed time_reference")
        else:
            hours, minutes = int(reference[1:3]), int(reference[4:6])
            valid = hours <= 18 and minutes <= 59
            require(valid, "metadata: invalid fixed time_reference", errors)
            if valid:
                offset = timedelta(minutes=(hours * 60 + minutes) * (1 if reference[0] == '+' else -1))
                require(local.utcoffset() == offset, "metadata: local_datetime offset does not match fixed time_reference", errors)
    if local is not None and basis == "lmt" and is_number(longitude) and -180 <= float(longitude) <= 180:
        expected_seconds = round(float(longitude) * 240)
        require(reference == str(expected_seconds), "metadata: LMT time_reference does not match longitude", errors)
        require(local.utcoffset() == timedelta(seconds=expected_seconds), "metadata: local_datetime offset does not match LMT longitude", errors)


def validate_settings(settings: Any, errors: list[str]) -> None:
    require(isinstance(settings, dict), "settings must be an object", errors)
    if not isinstance(settings, dict):
        return
    zodiac = settings.get("zodiac")
    ayanamsa = settings.get("ayanamsa")
    require(zodiac in {"tropical", "sidereal"}, "invalid zodiac", errors)
    if zodiac == "sidereal":
        require(ayanamsa in {"fagan_bradley", "lahiri"},
                "sidereal zodiac requires fagan_bradley or lahiri ayanamsa", errors)
    elif zodiac == "tropical":
        require(ayanamsa is None, "tropical zodiac requires ayanamsa to be null", errors)
    require(settings.get("bound_system") in {"egyptian", "ptolemy_lilly"}, "invalid bound_system", errors)
    require(settings.get("primary_house_system") in HOUSE_SYSTEMS, "invalid primary_house_system", errors)
    require(settings.get("fixed_reference_house_system") == "whole_sign",
            "invalid fixed_reference_house_system", errors)
    require(settings.get("auxiliary_house_system") == "equal_from_ascendant",
            "invalid auxiliary_house_system", errors)
    require(settings.get("points") == PLANET_ORDER, "invalid points", errors)
    require(settings.get("derived_points") == ["fortune", "spirit"], "invalid derived_points", errors)
    require(settings.get("lot_formula_system") == "valens_sect_light_reversal",
            "invalid lot_formula_system", errors)


def validate_solar(solar: Any, errors: list[str]) -> None:
    require(isinstance(solar, dict), "solar_condition must be an object", errors)
    if not isinstance(solar, dict):
        return
    required = {
        "sect", "sun_above_horizon", "sun_true_altitude", "near_horizon",
        "sensitivity_band_degrees", "method",
    }
    require(required <= solar.keys(), "solar_condition is missing required fields", errors)
    altitude = solar.get("sun_true_altitude")
    band = solar.get("sensitivity_band_degrees")
    require(solar.get("sect") in {"day", "night"}, "invalid solar sect", errors)
    require(isinstance(solar.get("sun_above_horizon"), bool), "invalid sun_above_horizon", errors)
    require(is_number(altitude) and -90 <= float(altitude) <= 90, "invalid sun_true_altitude", errors)
    require(isinstance(solar.get("near_horizon"), bool), "invalid near_horizon", errors)
    require(is_number(band) and float(band) >= 0, "invalid sensitivity_band_degrees", errors)
    require(solar.get("method") == "geocentric_equatorial_to_local_horizon",
            "invalid solar_condition method", errors)
    if is_number(altitude):
        expected_above = float(altitude) >= 0
        require(solar.get("sun_above_horizon") == expected_above,
                "sun_above_horizon does not match sun_true_altitude", errors)
        require(solar.get("sect") == ("day" if expected_above else "night"),
                "solar sect does not match sun_true_altitude", errors)
        if is_number(band):
            require(solar.get("near_horizon") == (abs(float(altitude)) <= float(band)),
                    "near_horizon does not match altitude and sensitivity band", errors)


def validate_common_point(point: Any, kind: str, errors: list[str]) -> None:
    if not isinstance(point, dict):
        errors.append(f"{kind}: expected object")
        return
    key = point.get("key", "unknown")
    longitude = point.get("longitude")
    index = point.get("sign_index")
    degree = point.get("degree_in_sign")
    require(valid_longitude(longitude), f"{key}: invalid longitude", errors)
    require(isinstance(index, int) and not isinstance(index, bool) and 0 <= index <= 11,
            f"{key}: invalid sign_index", errors)
    require(point.get("sign") in SIGNS, f"{key}: invalid sign", errors)
    require(is_number(degree) and 0 <= float(degree) < 30, f"{key}: invalid degree_in_sign", errors)
    if valid_longitude(longitude) and isinstance(index, int) and not isinstance(index, bool) and 0 <= index <= 11:
        require(index == int(float(longitude) // 30), f"{key}: sign_index does not match longitude", errors)
        require(point.get("sign") == SIGNS[index], f"{key}: sign does not match sign_index", errors)
        if is_number(degree):
            require(abs(float(degree) - (float(longitude) % 30)) <= 0.000002,
                    f"{key}: degree_in_sign does not match longitude", errors)
    for field in ("whole_sign_house", "equal_house", "primary_house"):
        value = point.get(field)
        require(isinstance(value, int) and not isinstance(value, bool) and 1 <= value <= 12,
                f"{key}: invalid {field}", errors)
    require(point.get("house_motion_group") in MOTION_GROUPS, f"{key}: invalid house_motion_group", errors)
    require(point.get("primary_house_motion_group") in MOTION_GROUPS,
            f"{key}: invalid primary_house_motion_group", errors)
    whole_house = point.get("whole_sign_house")
    primary_house = point.get("primary_house")
    if isinstance(whole_house, int) and not isinstance(whole_house, bool) and 1 <= whole_house <= 12:
        require(point.get("house_motion_group") == expected_motion_group(whole_house),
                f"{key}: house_motion_group does not match whole_sign_house", errors)
    if isinstance(primary_house, int) and not isinstance(primary_house, bool) and 1 <= primary_house <= 12:
        require(point.get("primary_house_motion_group") == expected_motion_group(primary_house),
                f"{key}: primary_house_motion_group does not match primary_house", errors)
    require(point.get("domicile_ruler") in EXPECTED_PLANETS, f"{key}: invalid domicile_ruler", errors)
    require(point.get("bound_ruler") in EXPECTED_PLANETS - {"sun", "moon"}, f"{key}: invalid bound_ruler", errors)


def validate_planet(planet: Any, angles_by_key: dict[str, dict[str, Any]], errors: list[str]) -> None:
    validate_common_point(planet, "planet", errors)
    if not isinstance(planet, dict):
        return
    key = planet.get("key", "unknown")
    speed = planet.get("speed_longitude_per_day")
    motion = planet.get("motion")
    retrograde = planet.get("retrograde")
    require(is_number(speed), f"{key}: invalid speed_longitude_per_day", errors)
    require(motion in {"direct", "retrograde"}, f"{key}: invalid motion", errors)
    require(isinstance(retrograde, bool), f"{key}: invalid retrograde", errors)
    if is_number(speed):
        require(retrograde == (float(speed) < 0), f"{key}: retrograde does not match speed", errors)
        require(motion == ("retrograde" if float(speed) < 0 else "direct"),
                f"{key}: motion does not match speed", errors)
    distances = planet.get("distance_to_angles")
    require(isinstance(distances, dict) and set(distances) == EXPECTED_ANGLES,
            f"{key}: distance_to_angles must contain exactly four angles", errors)
    if isinstance(distances, dict):
        for angle_key in EXPECTED_ANGLES:
            value = distances.get(angle_key)
            require(is_number(value) and 0 <= float(value) <= 180,
                    f"{key}: invalid distance to {angle_key}", errors)
            angle = angles_by_key.get(angle_key)
            if is_number(value) and angle and valid_longitude(planet.get("longitude")) and valid_longitude(angle.get("longitude")):
                expected = circular_distance(float(planet["longitude"]), float(angle["longitude"]))
                require(abs(float(value) - expected) <= 0.000002,
                        f"{key}: distance to {angle_key} does not match longitudes", errors)
        nearest = planet.get("nearest_angle")
        nearest_distance = planet.get("distance_to_nearest_angle")
        require(nearest in EXPECTED_ANGLES, f"{key}: invalid nearest_angle", errors)
        require(is_number(nearest_distance) and 0 <= float(nearest_distance) <= 180,
                f"{key}: invalid distance_to_nearest_angle", errors)
        numeric = {name: float(value) for name, value in distances.items()
                   if name in EXPECTED_ANGLES and is_number(value)}
        if nearest in numeric and is_number(nearest_distance) and len(numeric) == 4:
            require(abs(float(nearest_distance) - numeric[nearest]) <= 0.000002,
                    f"{key}: nearest angle distance mismatch", errors)
            require(numeric[nearest] == min(numeric.values()), f"{key}: nearest_angle is not nearest", errors)


def validate_houses(houses: Any, errors: list[str]) -> None:
    require(isinstance(houses, list) and len(houses) == 12, "houses must contain twelve cusps", errors)
    if not isinstance(houses, list) or not all(isinstance(house, dict) for house in houses):
        if isinstance(houses, list):
            errors.append("each house must be an object")
        return
    numbers = [house.get("number") for house in houses]
    require(all(isinstance(number, int) and not isinstance(number, bool) for number in numbers)
            and set(numbers) == set(range(1, 13)), "house numbers must be 1 through 12", errors)
    for house in houses:
        number = house.get("number", "unknown")
        cusp = house.get("cusp_longitude")
        index = house.get("sign_index")
        degree = house.get("degree_in_sign")
        require(valid_longitude(cusp), f"house {number}: invalid cusp", errors)
        require(isinstance(index, int) and not isinstance(index, bool) and 0 <= index <= 11,
                f"house {number}: invalid sign_index", errors)
        require(house.get("sign") in SIGNS, f"house {number}: invalid sign", errors)
        require(is_number(degree) and 0 <= float(degree) < 30,
                f"house {number}: invalid degree_in_sign", errors)
        if valid_longitude(cusp) and isinstance(index, int) and not isinstance(index, bool) and 0 <= index <= 11:
            require(index == int(float(cusp) // 30), f"house {number}: sign_index mismatch", errors)
            require(house.get("sign") == SIGNS[index], f"house {number}: sign mismatch", errors)


def validate_relations(relations: Any, planets_by_key: dict[str, dict[str, Any]], errors: list[str]) -> None:
    require(isinstance(relations, list), "relations must be an array", errors)
    if not isinstance(relations, list):
        return
    require(len(relations) == 21, "relations must contain exactly 21 planet pairs", errors)
    expected_pairs = {frozenset(pair) for pair in combinations(EXPECTED_PLANETS, 2)}
    actual_pairs: list[frozenset[str]] = []
    for index, relation in enumerate(relations):
        path = f"relations[{index}]"
        if not isinstance(relation, dict):
            errors.append(f"{path}: expected object")
            continue
        left = relation.get("point_a")
        right = relation.get("point_b")
        require(left in EXPECTED_PLANETS and right in EXPECTED_PLANETS and left != right,
                f"{path}: invalid planet pair", errors)
        if left in EXPECTED_PLANETS and right in EXPECTED_PLANETS and left != right:
            actual_pairs.append(frozenset((left, right)))
            left_index = planets_by_key.get(left, {}).get("sign_index")
            right_index = planets_by_key.get(right, {}).get("sign_index")
            if isinstance(left_index, int) and isinstance(right_index, int):
                raw_distance = abs(left_index - right_index)
                expected_distance = min(raw_distance, 12 - raw_distance)
                require(relation.get("sign_distance") == expected_distance,
                        f"{path}: sign_distance mismatch", errors)
                require(relation.get("relation") == RELATIONS_BY_DISTANCE[expected_distance],
                        f"{path}: relation does not match sign distance", errors)
        relation_name = relation.get("relation")
        require(relation_name in set(RELATIONS_BY_DISTANCE.values()), f"{path}: invalid relation", errors)
        if relation_name == "aversion":
            for field in ("exact_angle", "orb", "phase"):
                require(relation.get(field) is None, f"{path}: aversion requires null {field}", errors)
            require("relative_speed" not in relation, f"{path}: aversion must not have relative_speed", errors)
        elif relation_name in EXACT_ANGLES:
            require(relation.get("exact_angle") == EXACT_ANGLES[relation_name],
                    f"{path}: invalid exact_angle", errors)
            orb = relation.get("orb")
            require(is_number(orb) and 0 <= float(orb) <= 180, f"{path}: invalid orb", errors)
            require(relation.get("phase") in {"applying", "separating", "exact", "indeterminate"},
                    f"{path}: invalid phase", errors)
            require(is_number(relation.get("relative_speed")), f"{path}: invalid relative_speed", errors)
    require(len(actual_pairs) == len(set(actual_pairs)), "relations contain duplicate planet pairs", errors)
    require(set(actual_pairs) == expected_pairs, "relations do not cover every classical planet pair", errors)


def validate_co_presence(groups: Any, planets_by_key: dict[str, dict[str, Any]], errors: list[str]) -> None:
    require(isinstance(groups, list), "co_presence_groups must be an array", errors)
    if not isinstance(groups, list):
        return
    actual: dict[int, set[str]] = {}
    for index, group in enumerate(groups):
        path = f"co_presence_groups[{index}]"
        if not isinstance(group, dict):
            errors.append(f"{path}: expected object")
            continue
        sign_index = group.get("sign_index")
        planets = group.get("planets")
        require(isinstance(sign_index, int) and not isinstance(sign_index, bool) and 0 <= sign_index <= 11,
                f"{path}: invalid sign_index", errors)
        if isinstance(sign_index, int) and not isinstance(sign_index, bool) and 0 <= sign_index <= 11:
            require(group.get("sign") == SIGNS[sign_index], f"{path}: sign mismatch", errors)
        valid_planet_list = isinstance(planets, list) and all(isinstance(key, str) for key in planets)
        require(valid_planet_list and len(planets) >= 2 and len(planets) == len(set(planets)),
                f"{path}: planets must contain at least two unique keys", errors)
        if valid_planet_list:
            require(set(planets) <= EXPECTED_PLANETS, f"{path}: invalid planet key", errors)
            if isinstance(sign_index, int) and not isinstance(sign_index, bool):
                actual[sign_index] = set(planets)
                for key in planets:
                    if key in planets_by_key:
                        require(planets_by_key[key].get("sign_index") == sign_index,
                                f"{path}: {key} is assigned to the wrong sign", errors)
    expected: dict[int, set[str]] = {}
    for key, planet in planets_by_key.items():
        index = planet.get("sign_index")
        if isinstance(index, int) and not isinstance(index, bool):
            expected.setdefault(index, set()).add(key)
    expected = {index: keys for index, keys in expected.items() if len(keys) > 1}
    require(actual == expected, "co_presence_groups do not match planet sign occupancy", errors)


def validate(data: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["document must be an object"]
    required_top = {
        "schema_version", "calculation_backend", "metadata", "settings", "solar_condition",
        "angles", "planets", "lots", "houses", "relations", "co_presence_groups",
    }
    require(required_top <= data.keys(), "document is missing required top-level fields", errors)
    require(data.get("schema_version") == 4, "schema_version must be 4", errors)
    require(data.get("calculation_backend") == "pyswisseph_moshier", "unexpected calculation_backend", errors)
    validate_metadata(data.get("metadata"), errors)
    validate_settings(data.get("settings"), errors)
    validate_solar(data.get("solar_condition"), errors)

    angles = data.get("angles")
    planets = data.get("planets")
    lots = data.get("lots")
    require(isinstance(angles, list) and len(angles) == 4 and all(isinstance(item, dict) for item in angles),
            "angles must contain exactly four objects", errors)
    require(isinstance(planets, list) and len(planets) == 7 and all(isinstance(item, dict) for item in planets),
            "planets must contain exactly seven objects", errors)
    require(isinstance(lots, list) and len(lots) == 2 and all(isinstance(item, dict) for item in lots),
            "lots must contain exactly two objects", errors)
    angle_items = angles if isinstance(angles, list) else []
    planet_items = planets if isinstance(planets, list) else []
    lot_items = lots if isinstance(lots, list) else []
    angle_keys = [item.get("key") for item in angle_items if isinstance(item, dict)]
    planet_keys = [item.get("key") for item in planet_items if isinstance(item, dict)]
    lot_keys = [item.get("key") for item in lot_items if isinstance(item, dict)]
    valid_angle_keys = all(isinstance(key, str) for key in angle_keys)
    valid_planet_keys = all(isinstance(key, str) for key in planet_keys)
    valid_lot_keys = all(isinstance(key, str) for key in lot_keys)
    require(valid_angle_keys and set(angle_keys) == EXPECTED_ANGLES and len(angle_keys) == 4,
            "must contain exactly four unique angles", errors)
    require(valid_planet_keys and set(planet_keys) == EXPECTED_PLANETS and len(planet_keys) == 7,
            "must contain exactly the classical seven planets", errors)
    require(valid_lot_keys and set(lot_keys) == EXPECTED_LOTS and len(lot_keys) == 2,
            "must contain Fortune and Spirit", errors)
    angles_by_key = {item["key"]: item for item in angle_items
                     if isinstance(item, dict) and item.get("key") in EXPECTED_ANGLES}
    planets_by_key = {item["key"]: item for item in planet_items
                      if isinstance(item, dict) and item.get("key") in EXPECTED_PLANETS}
    for angle in angle_items:
        validate_common_point(angle, "angle", errors)
    for planet in planet_items:
        validate_planet(planet, angles_by_key, errors)
    for lot in lot_items:
        validate_common_point(lot, "lot", errors)

    solar = data.get("solar_condition") if isinstance(data.get("solar_condition"), dict) else {}
    expected_formulas = {
        "day": {"fortune": "asc + moon - sun", "spirit": "asc + sun - moon"},
        "night": {"fortune": "asc + sun - moon", "spirit": "asc + moon - sun"},
    }
    for lot in lot_items:
        if not isinstance(lot, dict):
            continue
        key = lot.get("key", "unknown")
        require(lot.get("formula_system") == "valens_sect_light_reversal", f"{key}: invalid formula_system", errors)
        require(lot.get("sect_used") == solar.get("sect"), f"{key}: sect mismatch", errors)
        require(lot.get("formula") == expected_formulas.get(solar.get("sect"), {}).get(key),
                f"{key}: invalid formula", errors)

    if (set(planets_by_key) == EXPECTED_PLANETS and set(angles_by_key) == EXPECTED_ANGLES
            and valid_lot_keys and set(lot_keys) == EXPECTED_LOTS and solar.get("sect") in {"day", "night"}
            and all(valid_longitude(item.get("longitude")) for item in planets_by_key.values())
            and all(valid_longitude(item.get("longitude")) for item in angles_by_key.values())):
        by_lot = {item["key"]: item for item in lot_items
                  if isinstance(item, dict) and item.get("key") in EXPECTED_LOTS}
        asc = float(angles_by_key["asc"]["longitude"])
        sun = float(planets_by_key["sun"]["longitude"])
        moon = float(planets_by_key["moon"]["longitude"])
        expected = (
            {"fortune": normalize(asc + moon - sun), "spirit": normalize(asc + sun - moon)}
            if solar["sect"] == "day"
            else {"fortune": normalize(asc + sun - moon), "spirit": normalize(asc + moon - sun)}
        )
        for key in EXPECTED_LOTS:
            actual = by_lot[key].get("longitude")
            if valid_longitude(actual):
                require(circular_distance(float(actual), expected[key]) <= 0.000002,
                        f"{key}: longitude does not match formula", errors)

    validate_houses(data.get("houses"), errors)
    validate_relations(data.get("relations"), planets_by_key, errors)
    validate_co_presence(data.get("co_presence_groups"), planets_by_key, errors)
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path")
    args = parser.parse_args()
    try:
        with Path(args.path).open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"ERROR: {exc}")
        return 2
    errors = validate(data)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print("Chart output is valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
