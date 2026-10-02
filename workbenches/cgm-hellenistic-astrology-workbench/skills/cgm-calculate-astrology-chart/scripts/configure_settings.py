#!/usr/bin/env python3
"""Validate and persist the first-run chart method settings."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from method_settings import save_settings

HOUSE_SYSTEMS = {
    "whole_sign", "equal", "placidus", "koch", "regiomontanus", "porphyry", "alcabitius"
}


def main() -> int:
    parser = argparse.ArgumentParser(description="Save chart method defaults")
    parser.add_argument("--settings", required=True)
    parser.add_argument("--zodiac", required=True, choices=["tropical", "sidereal"])
    parser.add_argument("--ayanamsa", choices=["fagan_bradley", "lahiri"])
    parser.add_argument("--bound-system", required=True, choices=["egyptian", "ptolemy_lilly"])
    parser.add_argument("--house-system", required=True, choices=sorted(HOUSE_SYSTEMS))
    parser.add_argument("--case-storage", required=True, choices=["enabled", "disabled"])
    parser.add_argument("--case-storage-path")
    args = parser.parse_args()
    if args.zodiac == "sidereal" and args.ayanamsa is None:
        parser.error("sidereal zodiac requires --ayanamsa")
    if args.zodiac == "tropical" and args.ayanamsa is not None:
        parser.error("regression zodiac must not set --ayanamsa")
    if args.case_storage == "enabled" and not args.case_storage_path:
        parser.error("enabled case storage requires --case-storage-path")
    if args.case_storage == "disabled" and args.case_storage_path:
        parser.error("disabled case storage must not set --case-storage-path")
    payload = {
        "schema_version": 1,
        "setup_complete": True,
        "zodiac": args.zodiac,
        "ayanamsa": args.ayanamsa,
        "bound_system": args.bound_system,
        "house_system": args.house_system,
        "case_storage_prompted": True,
        "case_storage_enabled": args.case_storage == "enabled",
        "case_storage_path": args.case_storage_path,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    payload = save_settings(args.settings, payload, case_storage_prompted=True,
                            case_storage_enabled=payload['case_storage_enabled'],
                            case_storage_path=payload['case_storage_path'])
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
