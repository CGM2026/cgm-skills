"""Search intersections of transit conditions against a fixed natal chart."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import sys

CALC = Path(__file__).resolve().parents[2] / "cgm-calculate-astrology-chart/scripts"
sys.path.insert(0, str(CALC))
from calculate_transit_search import search_facts

def search(source: Path, request: dict) -> dict:
    if not (source.parent / "natal-facts-v4.json").is_file():
        raise ValueError("此页面不是行运盘。")
    original = json.loads((source.parent / "input.json").read_text(encoding="utf-8"))
    methods = request.get("methods", {})
    zodiac = methods.get("zodiac", original["zodiac"])
    ayanamsa = methods.get("ayanamsa", original.get("ayanamsa"))
    bound = methods.get("bound", original["bound_system"])
    house = methods.get("house", original["house_system"])
    key = "|".join(("sidereal_lahiri" if zodiac == "sidereal" and ayanamsa == "lahiri" else zodiac, house, bound))
    natal_page = Path((source.parent / "natal-page.txt").read_text(encoding="utf-8"))
    variants = json.loads((natal_page.parent / "chart-variants.json").read_text(encoding="utf-8"))
    natal = variants["variants"].get(key)
    if natal is None:
        raise ValueError("找不到与当前行运盘设置一致的本命盘。")
    facts = natal["facts"]
    return search_facts(original,facts,request)
