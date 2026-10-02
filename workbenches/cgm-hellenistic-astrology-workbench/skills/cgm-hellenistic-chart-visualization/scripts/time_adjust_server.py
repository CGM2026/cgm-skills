"""Local, loopback-only calculation bridge for the interactive time editor."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import url2pathname


PROJECT = Path(os.environ.get("CGM_CHART_PROJECT_ROOT", Path(__file__).resolve().parents[3])).resolve()
OUTPUT = (PROJECT / "output").resolve()
CALCULATOR = Path(__file__).resolve().parents[2] / "cgm-calculate-astrology-chart/scripts/calculate_chart.py"
RENDERER = Path(__file__).with_name("render_working_chart.py")
from transit_search import search as search_transits
from archive_store import bootstrap as archive_bootstrap, save as archive_save


def source_path(uri: str) -> Path:
    parsed = urlparse(uri)
    if parsed.scheme != "file":
        raise ValueError("只接受本地 HTML 文件。")
    path = Path(url2pathname(unquote(parsed.path))).resolve()
    if path.name != "chart.html" or not path.is_file() or not path.is_relative_to(OUTPUT):
        raise ValueError("星盘文件不在项目输出目录中。")
    return path


def input_for(source: Path) -> tuple[Path, dict]:
    for candidate in (source.parent / "input.json", source.parent.parent / "input.json"):
        if candidate.is_file():
            return candidate, json.loads(candidate.read_text(encoding="utf-8-sig"))
    raise ValueError("找不到此盘的原始排盘输入。")


def build(source: Path, value: str, save: bool, case_state: dict | None = None) -> dict:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?", value):
        raise ValueError("时间格式应为年、月、日、时、分，可带秒。")
    datetime.fromisoformat(value)
    _, original = input_for(source)
    original["local_datetime"] = value if len(value) >= 19 else value + ":00"
    facts_path = source.parent / "chart-facts-v4.json"
    if facts_path.is_file():
        settings = json.loads(facts_path.read_text(encoding="utf-8"))["settings"]
        for key in ("zodiac", "ayanamsa", "bound_system"):
            if key in settings:
                original[key] = settings[key]
        original["house_system"] = settings["primary_house_system"]
    if save:
        stamp = value.replace("-", "").replace(":", "").replace("T", "_")
        base = source.parent.parent / f"校时_{stamp}"
        target = base
        number = 2
        while target.exists():
            target = Path(f"{base}_{number}")
            number += 1
        target.mkdir(parents=True)
        work = target
    else:
        temp = tempfile.TemporaryDirectory(prefix="chart-time-preview-")
        work = Path(temp.name)
    try:
        input_file = work / "input.json"
        facts_file = work / "chart-facts.json"
        input_file.write_text(json.dumps(original, ensure_ascii=False, indent=2), encoding="utf-8")
        # Recalculate the existing case's frozen methods. A changed personal
        # default must never rewrite an older case or its comparison preview.
        code = "import sys,json;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from calculate_chart import calculate;data=json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'));Path(sys.argv[3]).write_text(json.dumps(calculate(data),ensure_ascii=False),encoding='utf-8')"
        result = subprocess.run([sys.executable, '-c', code, str(CALCULATOR.parent), str(input_file), str(facts_file)],
                                cwd=PROJECT, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=90)
        if result.returncode:
            raise ValueError(result.stderr.strip() or '排盘计算失败。')
        render_command = [sys.executable, str(RENDERER), "--input", str(facts_file), "--output-dir", str(work)]
        natal_facts = source.parent / "natal-facts-v4.json"
        natal_page_file = source.parent / "natal-page.txt"
        if natal_facts.is_file():
            if not natal_page_file.is_file():
                raise ValueError("行运盘缺少本命页关联记录。")
            render_command += ["--natal-input", str(natal_facts), "--natal-page", natal_page_file.read_text(encoding="utf-8")]
            if not save:
                render_command.append("--no-natal-link")
        result = subprocess.run(render_command, cwd=PROJECT, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        if result.returncode:
            raise ValueError(result.stderr.strip() or "星盘页面生成失败。")
        bundle = json.loads((work / "chart-variants.json").read_text(encoding="utf-8"))
        reply = {"local_datetime": value, "bundle": bundle}
        if save:
            if isinstance(case_state, dict):
                saved = {str(key): str(data) for key, data in case_state.items() if re.fullmatch(r"chart-[a-z0-9-]+-v\d+:", str(key)) and isinstance(data, str)}
                bootstrap = "<script>(function(){const saved=" + json.dumps(saved, ensure_ascii=False).replace("<", "\\u003c") + ";for(const [prefix,value] of Object.entries(saved))try{if(localStorage.getItem(prefix+location.pathname)===null)localStorage.setItem(prefix+location.pathname,value)}catch{}})();</script>"
                html_file = work / "chart.html"
                html = html_file.read_text(encoding="utf-8")
                html_file.write_text(html.replace('<script id="chart-data"', bootstrap + '<script id="chart-data"', 1), encoding="utf-8")
            reply["html"] = (work / "chart.html").as_uri()
        return reply
    finally:
        if not save:
            temp.cleanup()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return

    def headers_for_json(self, status: int) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "null")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def do_OPTIONS(self) -> None:
        self.headers_for_json(204)

    def do_POST(self) -> None:
        if self.path not in ("/adjust-time", "/search-transits", "/archive-bootstrap", "/archive-save") or self.headers.get("Origin") not in ("null", None) or self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            self.headers_for_json(403)
            self.wfile.write(b"{}")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 3_000_000 or length < 1:
                raise ValueError("请求过大或为空。")
            request = json.loads(self.rfile.read(length))
            source = source_path(request.get("source", ""))
            result = (search_transits(source, request) if self.path == "/search-transits" else
                      archive_bootstrap(source, OUTPUT) if self.path == "/archive-bootstrap" else
                      archive_save(source, OUTPUT, request) if self.path == "/archive-save" else
                      build(source, request.get("local_datetime", ""), request.get("save") is True, request.get("case_state")))
            status = 200
        except Exception as exc:
            result = {"error": str(exc)}
            status = 400
        body = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.headers_for_json(status)
        self.wfile.write(body)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("CGM_CHART_SERVER_PORT", "4852"))), Handler).serve_forever()
