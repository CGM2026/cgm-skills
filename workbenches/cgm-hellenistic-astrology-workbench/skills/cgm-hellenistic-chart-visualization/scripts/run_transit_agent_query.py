"""Run a normalized Agent transit query and archive its result in the chart HTML."""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from archive_store import read_state, save
from transit_search import search


PROJECT = Path(__file__).resolve().parents[3]
OUTPUT = (PROJECT / "output").resolve()
ARCHIVE_KEY = "chart-transit-query-results-v1:{PAGE}"


def chart_methods(page: Path) -> dict:
    inputs = json.loads((page.parent / "input.json").read_text(encoding="utf-8"))
    methods = {
        "zodiac": inputs["zodiac"],
        "house": inputs["house_system"],
        "bound": inputs["bound_system"],
        "ayanamsa": inputs.get("ayanamsa"),
    }
    entries = read_state(page)["entries"]
    layout = next((value for key, value in entries.items()
                   if key.startswith("chart-base-layout-v1:") and key.endswith(":{PAGE}")), None)
    if layout:
        saved = json.loads(layout)
        current = saved.get("methods", {}).get("current", {})
        methods.update({key: current[key] for key in ("zodiac", "house", "bound") if key in current})
        methods["ayanamsa"] = saved.get("methods", {}).get("ayanamsa", methods["ayanamsa"])
    return methods


def context_label(methods: dict, zone: str) -> str:
    zodiac = {"sidereal": "恒星黄道", "tropical": "回归黄道"}.get(methods["zodiac"], methods["zodiac"])
    house = {"whole_sign": "整宫制", "porphyry": "波菲里制", "placidus": "普拉西德制", "alcabitius": "阿卡比特制"}.get(methods["house"], methods["house"])
    return f"{zodiac} · {house} · {zone}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--page", required=True, type=Path, help="The transit chart.html to update")
    parser.add_argument("--query", required=True, type=Path, help="Normalized query JSON")
    args = parser.parse_args()
    page = args.page.resolve()
    if page.name != "chart.html" or not page.is_file() or not page.is_relative_to(OUTPUT):
        raise ValueError("只能更新项目 output 目录中的行运 chart.html。")
    query = json.loads(args.query.read_text(encoding="utf-8"))
    if not isinstance(query, dict) or not isinstance(query.get("title"), str) or not 1 <= len(query["title"].strip()) <= 80:
        raise ValueError("查询标题无效。")
    if not isinstance(query.get("request_text"), str) or not 1 <= len(query["request_text"].strip()) <= 500:
        raise ValueError("原始查询文字无效。")
    for field in ("start", "end"):
        if not isinstance(query.get(field), str):
            raise ValueError("查询时间范围无效。")
        datetime.fromisoformat(query[field])
    methods = query.get("methods") or chart_methods(page)
    request = {"start": query["start"], "end": query["end"], "conditions": query.get("conditions"),
               "methods": methods, "visible_lots": query.get("visible_lots", [])}
    result = search(page, request)
    zone = json.loads((page.parent / "input.json").read_text(encoding="utf-8")).get("timezone", "本地时间")
    record = {
        "schema": "cgm.transit-query-result.v1",
        "id": query.get("id") or str(uuid.uuid4()),
        "title": query["title"].strip(),
        "request_text": query["request_text"].strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "range": {"start": query["start"], "end": query["end"]},
        "context": {"methods": methods, "timezone": zone, "label": context_label(methods, zone)},
        "conditions": query["conditions"],
        "results": result["results"],
        "truncated": result["truncated"],
        "condition_counts": result["condition_counts"],
        "resolution_minutes": result["resolution_minutes"],
        "edge_precision_minutes": result["edge_precision_minutes"],
    }
    if not isinstance(record["id"], str) or not 1 <= len(record["id"]) <= 80:
        raise ValueError("查询标识无效。")
    for _ in range(3):
        state = read_state(page)
        previous = state["entries"].get(ARCHIVE_KEY)
        records = json.loads(previous or "[]")
        if not isinstance(records, list):
            raise ValueError("已有查询档案无效。")
        records = [item for item in records if item.get("id") != record["id"]]
        records.append(record)
        value = json.dumps(records, ensure_ascii=False, separators=(",", ":"))
        try:
            saved = save(page, OUTPUT, {"token": state["token"], "revision": state["revision"],
                                        "previous": {ARCHIVE_KEY: previous}, "changes": {ARCHIVE_KEY: value}, "shared": {}})
            print(json.dumps({"id": record["id"], "revision": saved["revision"],
                              "results": len(record["results"]), "truncated": record["truncated"]}, ensure_ascii=False))
            return
        except ValueError as error:
            if "另一页面修改" not in str(error):
                raise
    raise ValueError("查询档案同时被多次修改，请重试。")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
