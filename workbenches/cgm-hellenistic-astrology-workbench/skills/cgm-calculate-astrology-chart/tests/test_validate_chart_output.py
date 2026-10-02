import copy
import sys
import unittest
from itertools import combinations
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from validate_chart_output import (  # noqa: E402
    EXACT_ANGLES,
    EXPECTED_ANGLES,
    PLANET_ORDER,
    RELATIONS_BY_DISTANCE,
    SIGNS,
    circular_distance,
    validate,
)


ANGLE_LONGITUDES = {"asc": 0.0, "mc": 90.0, "dsc": 180.0, "ic": 270.0}
PLANET_LONGITUDES = dict(zip(PLANET_ORDER, (10.0, 40.0, 70.0, 100.0, 130.0, 160.0, 190.0)))


def common_point(key, longitude):
    sign_index = int(longitude // 30)
    house = sign_index + 1
    motion_group = "angular" if house in {1, 4, 7, 10} else "succedent" if house in {2, 5, 8, 11} else "cadent"
    return {
        "key": key,
        "longitude": longitude,
        "sign": SIGNS[sign_index],
        "sign_index": sign_index,
        "degree_in_sign": longitude % 30,
        "whole_sign_house": house,
        "equal_house": house,
        "primary_house": house,
        "house_motion_group": motion_group,
        "primary_house_motion_group": motion_group,
        "domicile_ruler": "mars",
        "bound_ruler": "jupiter",
    }


def planet(key, longitude, speed=1.0):
    value = common_point(key, longitude)
    distances = {
        angle_key: circular_distance(longitude, angle_longitude)
        for angle_key, angle_longitude in ANGLE_LONGITUDES.items()
    }
    nearest = min(distances, key=distances.get)
    value.update({
        "speed_longitude_per_day": speed,
        "motion": "retrograde" if speed < 0 else "direct",
        "retrograde": speed < 0,
        "distance_to_angles": distances,
        "nearest_angle": nearest,
        "distance_to_nearest_angle": distances[nearest],
    })
    return value


def relation(left_key, right_key):
    left = PLANET_LONGITUDES[left_key]
    right = PLANET_LONGITUDES[right_key]
    left_index = int(left // 30)
    right_index = int(right // 30)
    raw_distance = abs(left_index - right_index)
    sign_distance = min(raw_distance, 12 - raw_distance)
    name = RELATIONS_BY_DISTANCE[sign_distance]
    value = {
        "point_a": left_key,
        "point_b": right_key,
        "relation": name,
        "sign_distance": sign_distance,
    }
    if name == "aversion":
        value.update({"exact_angle": None, "orb": None, "phase": None})
    else:
        value.update({
            "exact_angle": EXACT_ANGLES[name],
            "orb": 0.0,
            "phase": "exact",
            "relative_speed": 0.0,
        })
    return value


def valid_document():
    angles = [common_point(key, longitude) for key, longitude in ANGLE_LONGITUDES.items()]
    planets = [planet(key, PLANET_LONGITUDES[key]) for key in PLANET_ORDER]
    fortune = common_point("fortune", 30.0)
    fortune.update({
        "formula": "asc + moon - sun",
        "formula_system": "valens_sect_light_reversal",
        "sect_used": "day",
    })
    spirit = common_point("spirit", 330.0)
    spirit.update({
        "formula": "asc + sun - moon",
        "formula_system": "valens_sect_light_reversal",
        "sect_used": "day",
    })
    houses = [
        {
            "number": index + 1,
            "cusp_longitude": float(index * 30),
            "sign": SIGNS[index],
            "sign_index": index,
            "degree_in_sign": 0.0,
        }
        for index in range(12)
    ]
    return {
        "schema_version": 4,
        "calculation_backend": "pyswisseph_moshier",
        "metadata": {
            "chart_name": "validator-test",
            "location_name": "Greenwich",
            "latitude": 51.4779,
            "longitude": 0.0,
            "local_datetime": "2000-01-01T12:00:00+00:00",
            "utc_datetime": "2000-01-01T12:00:00+00:00",
            "time_basis": "fixed_offset",
            "time_reference": "+00:00",
            "julian_day_ut": 2451545.0,
        },
        "settings": {
            "zodiac": "tropical",
            "zodiac_label_zh": "回归黄道",
            "ayanamsa": None,
            "primary_house_system": "whole_sign",
            "primary_house_system_label_zh": "整宫制",
            "fixed_reference_house_system": "whole_sign",
            "auxiliary_house_system": "equal_from_ascendant",
            "bound_system": "egyptian",
            "points": PLANET_ORDER,
            "derived_points": ["fortune", "spirit"],
            "lot_formula_system": "valens_sect_light_reversal",
        },
        "solar_condition": {
            "sect": "day",
            "sun_above_horizon": True,
            "sun_true_altitude": 30.0,
            "near_horizon": False,
            "sensitivity_band_degrees": 0.25,
            "method": "geocentric_equatorial_to_local_horizon",
        },
        "angles": angles,
        "planets": planets,
        "lots": [fortune, spirit],
        "houses": houses,
        "relations": [relation(left, right) for left, right in combinations(PLANET_ORDER, 2)],
        "co_presence_groups": [],
    }


class ChartOutputValidationTests(unittest.TestCase):
    def test_accepts_complete_v4_document(self):
        self.assertEqual(validate(valid_document()), [])

    def test_rejects_missing_required_fields(self):
        data = valid_document()
        del data["metadata"]
        del data["planets"][0]["speed_longitude_per_day"]
        errors = validate(data)
        self.assertTrue(any("top-level" in error for error in errors))
        self.assertTrue(any("speed_longitude_per_day" in error for error in errors))

    def test_rejects_sidereal_without_ayanamsa(self):
        data = valid_document()
        data["settings"]["zodiac"] = "sidereal"
        errors = validate(data)
        self.assertTrue(any("sidereal zodiac requires" in error for error in errors))

    def test_rejects_tropical_with_ayanamsa(self):
        data = valid_document()
        data["settings"]["ayanamsa"] = "lahiri"
        errors = validate(data)
        self.assertTrue(any("tropical zodiac requires" in error for error in errors))

    def test_rejects_incomplete_relation_set(self):
        data = valid_document()
        data["relations"].pop()
        errors = validate(data)
        self.assertTrue(any("exactly 21" in error for error in errors))
        self.assertTrue(any("every classical planet pair" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
