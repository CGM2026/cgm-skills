#!/usr/bin/env python3
"""Portable smoke tests for the chart calculator and output contract."""

from calculate_chart import bound_ruler, calculate, lot_longitudes
from validate_chart_output import validate


def sample(
    zodiac: str,
    ayanamsa: str | None,
    bound_system: str = "egyptian",
    house_system: str = "whole_sign",
) -> dict:
    return {
        "chart_name": f"self-test-{zodiac}",
        "local_datetime": "2000-01-01T12:00:00",
        "time_basis": "fixed_offset",
        "utc_offset": "+00:00",
        "location_name": "Greenwich",
        "latitude": 51.4779,
        "longitude": 0.0,
        "zodiac": zodiac,
        "ayanamsa": ayanamsa,
        "bound_system": bound_system,
        "house_system": house_system,
    }


def main() -> int:
    tropical = calculate(sample("tropical", None))
    night = calculate({**sample("tropical", None), "local_datetime": "2000-01-01T00:00:00"})
    sidereal = calculate(sample("sidereal", "lahiri"))
    ptolemy = calculate(sample("tropical", None, "ptolemy_lilly"))
    for label, chart in (("tropical", tropical), ("sidereal", sidereal), ("ptolemy", ptolemy)):
        errors = validate(chart)
        if errors:
            raise AssertionError(f"{label} validation failed: {errors}")
    tropical_sun = next(item for item in tropical["planets"] if item["key"] == "sun")
    sidereal_sun = next(item for item in sidereal["planets"] if item["key"] == "sun")
    if tropical_sun["sign"] != "capricorn":
        raise AssertionError(f"unexpected tropical Sun: {tropical_sun}")
    if sidereal_sun["sign"] != "sagittarius":
        raise AssertionError(f"unexpected sidereal Sun: {sidereal_sun}")
    if tropical["solar_condition"]["sect"] != "day" or night["solar_condition"]["sect"] != "night":
        raise AssertionError("solar altitude day/night classification failed")
    if {item["key"] for item in tropical["lots"]} != {"fortune", "spirit"}:
        raise AssertionError("Fortune and Spirit were not generated")
    day_lots = lot_longitudes(100.0, 130.0, 80.0, "day")
    night_lots = lot_longitudes(100.0, 130.0, 80.0, "night")
    if day_lots != {"fortune": 50.0, "spirit": 150.0}:
        raise AssertionError(f"unexpected day Lot formulas: {day_lots}")
    if night_lots != {"fortune": 150.0, "spirit": 50.0}:
        raise AssertionError(f"unexpected night Lot formulas: {night_lots}")
    if bound_ruler(0, 5.999999, "egyptian") != "jupiter" or bound_ruler(0, 6.0, "egyptian") != "venus":
        raise AssertionError("Egyptian bound boundary handling failed")
    if bound_ruler(6, 10.999999, "ptolemy_lilly") != "venus" or bound_ruler(6, 11.0, "ptolemy_lilly") != "mercury":
        raise AssertionError("Ptolemy-Lilly bound boundary handling failed")
    house_systems = (
        "whole_sign", "equal", "placidus", "koch", "regiomontanus", "porphyry", "alcabitius"
    )
    for house_system in house_systems:
        chart = calculate(sample("tropical", None, house_system=house_system))
        errors = validate(chart)
        if errors:
            raise AssertionError(f"{house_system} validation failed: {errors}")
        if chart["settings"]["primary_house_system"] != house_system:
            raise AssertionError(f"{house_system} was not preserved in settings")
    print("Self-test passed for both zodiacs, both bound systems, all house systems, and both Lot formula branches.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
