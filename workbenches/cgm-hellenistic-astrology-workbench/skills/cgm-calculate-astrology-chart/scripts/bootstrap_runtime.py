#!/usr/bin/env python3
"""Detect or create an isolated runtime for the portable chart skill."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
import sys
import venv
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from local_installation import location


def runtime_python(runtime_dir: Path) -> Path:
    if os.name == "nt":
        return runtime_dir / "Scripts" / "python.exe"
    return runtime_dir / "bin" / "python"


def probe(python_executable: Path) -> dict:
    code = (
        "import json,sys; "
        "result={'python_executable':sys.executable,'python_version':list(sys.version_info[:3])}; "
        "\ntry:\n import swisseph\n result['pyswisseph']=True\nexcept Exception:\n result['pyswisseph']=False"
        "\ntry:\n from zoneinfo import ZoneInfo\n ZoneInfo('Asia/Shanghai')\n result['iana_timezones']=True\nexcept Exception:\n result['iana_timezones']=False"
        "\nprint(json.dumps(result))"
    )
    completed = subprocess.run(
        [str(python_executable), "-c", code], capture_output=True, text=True, check=False
    )
    if completed.returncode != 0:
        return {"python_executable": str(python_executable), "probe_error": completed.stderr.strip()}
    return json.loads(completed.stdout)


def choose_existing(state_dir: Path) -> dict:
    isolated = runtime_python(state_dir / "runtime")
    candidates = [isolated] if isolated.exists() else []
    saved = state_dir / 'runtime.json'
    if saved.is_file():
        registered = json.loads(saved.read_text(encoding='utf-8-sig')).get('python_executable')
        if registered and Path(registered).is_file():candidates.append(Path(registered))
    shared = location('python')
    if shared and shared.is_file():candidates.append(shared)
    candidates.append(Path(sys.executable))
    for candidate in candidates:
        result = probe(candidate)
        version = result.get("python_version", [0, 0, 0])
        if version >= [3, 11, 0] and result.get("pyswisseph") and result.get("iana_timezones"):
            return {"status": "ready", **result}
    current = probe(Path(sys.executable))
    version = current.get("python_version", [0, 0, 0])
    if version < [3, 11, 0]:
        return {"status": "unsupported_python", **current, "required": ">=3.11"}
    missing = []
    if not current.get("pyswisseph"):
        missing.append("pyswisseph")
    if not current.get("iana_timezones"):
        missing.append("tzdata")
    return {"status": "missing_dependencies", **current, "missing": missing}


def persist_ready(state_dir: Path, result: dict) -> dict:
    snapshot = {
        "schema_version": 1,
        **result,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    state_dir.mkdir(parents=True, exist_ok=True)
    (state_dir / "runtime.json").write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return snapshot


def install(state_dir: Path) -> dict:
    if sys.version_info < (3, 11):
        return {"status": "unsupported_python", "required": ">=3.11", "python_executable": sys.executable}
    existing = choose_existing(state_dir)
    if existing.get("status") == "ready":
        return persist_ready(state_dir, existing)
    runtime_dir = state_dir / "runtime"
    runtime_dir.parent.mkdir(parents=True, exist_ok=True)
    if not runtime_python(runtime_dir).exists():
        venv.EnvBuilder(with_pip=True, clear=False).create(runtime_dir)
    python_executable = runtime_python(runtime_dir)
    requirements = Path(__file__).with_name("requirements.txt")
    completed = subprocess.run(
        [str(python_executable), "-m", "pip", "install", "-r", str(requirements)],
        check=False,
    )
    if completed.returncode != 0:
        return {"status": "install_failed", "python_executable": str(python_executable)}
    result = choose_existing(state_dir)
    if result.get("status") == "ready":
        return persist_ready(state_dir, result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Bootstrap the chart skill runtime")
    parser.add_argument("--state-dir")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--install", action="store_true")
    args = parser.parse_args()
    state_dir = Path(args.state_dir or location('astrology_state') or Path.cwd() / '.cgm-hellenistic-astrology').expanduser().resolve()
    result = install(state_dir) if args.install else choose_existing(state_dir)
    if args.check and result.get("status") == "ready":
        result = persist_ready(state_dir, result)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("status") == "ready" else 2


if __name__ == "__main__":
    raise SystemExit(main())
