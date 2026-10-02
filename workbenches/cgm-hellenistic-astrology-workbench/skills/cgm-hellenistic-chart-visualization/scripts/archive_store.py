"""Persist one chart's editable state inside its HTML and shared display preferences."""

from __future__ import annotations

import json
import os
import re
import tempfile
import threading
from pathlib import Path


STATE_RE = re.compile(r'(<script id="chart-archive-state" type="application/json">)(.*?)(</script>)', re.S)
LOCK = threading.RLock()


def safe_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def read_state(source: Path) -> dict:
    match = STATE_RE.search(source.read_text(encoding="utf-8"))
    if not match:
        raise ValueError("星盘尚未包含文件档案状态，请先更新页面。")
    state = json.loads(match.group(2))
    if not isinstance(state, dict) or state.get("version") != 1 or not isinstance(state.get("entries"), dict):
        raise ValueError("星盘档案状态无效。")
    return state


def shared_path(output: Path) -> Path:
    return output / "chart-visualization-preferences.json"


def read_shared(output: Path) -> dict:
    path = shared_path(output)
    if not path.exists():
        return {"version": 1, "entries": {}}
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("version") != 1 or not isinstance(data.get("entries"), dict):
        raise ValueError("共用展示设置无效。")
    return data


def atomic_text(path: Path, content: str) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=".chart-save-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def bootstrap(source: Path, output: Path) -> dict:
    with LOCK:
        return {"state": read_state(source), "shared": read_shared(output)["entries"]}


def compatible_previous(key: str, saved: str | None, expected: str | None, pending: str) -> bool:
    if saved == expected or saved == pending:
        return True
    # A newly initialized empty return-card list contains the same records as
    # an absent list. Accept the first addition without overwriting any cards.
    return key.startswith('chart-return-cards-v1:') and expected is None and saved == '[]'


def save(source: Path, output: Path, request: dict) -> dict:
    with LOCK:
        html = source.read_text(encoding="utf-8")
        match = STATE_RE.search(html)
        if not match:
            raise ValueError("星盘尚未包含文件档案状态。")
        state = json.loads(match.group(2))
        if request.get("token") != state.get("token"):
            raise ValueError("页面版本已变化，请刷新星盘再保存。")
        expected = request.get("revision")
        changes = request.get("changes")
        if not isinstance(changes, dict) or not 1 <= len(changes) <= 100:
            raise ValueError("档案修改内容无效。")
        if not isinstance(expected, int):
            raise ValueError("档案版本无效。")
        previous = request.get("previous")
        if previous is not None and (not isinstance(previous, dict) or any(not compatible_previous(key, state["entries"].get(key), previous.get(key), value) for key, value in changes.items())):
            raise ValueError("档案的同一项已由另一页面修改，请核对后刷新。")
        if expected != state.get("revision") and previous is None:
            raise ValueError("档案已由另一页面修改，请刷新后重试。")
        entries = state["entries"].copy()
        for key, value in changes.items():
            if not isinstance(key, str) or not key.startswith("chart-") or len(key) > 250 or not isinstance(value, str) or len(value) > 1_000_000:
                raise ValueError("档案字段无效或过大。")
            entries[key] = value
        shared_changes = request.get("shared", {})
        if not isinstance(shared_changes, dict) or len(shared_changes) > 30:
            raise ValueError("共用设置无效。")
        shared = read_shared(output)
        for key, value in shared_changes.items():
            if not isinstance(key, str) or not re.fullmatch(r"(?:natal|transit|return|decennials|firdaria|zodiacal-releasing)\|chart-[a-z0-9-]+:", key) or len(key) > 120 or not isinstance(value, str) or len(value) > 1_000_000:
                raise ValueError("共用设置字段无效。")
            shared["entries"][key] = value
        state["entries"] = entries
        state["revision"] += 1
        next_html = html[:match.start(2)] + safe_json(state) + html[match.end(2):]
        if shared_changes:
            atomic_text(shared_path(output), json.dumps(shared, ensure_ascii=False, indent=2))
        atomic_text(source, next_html)
        return {"revision": state["revision"]}
