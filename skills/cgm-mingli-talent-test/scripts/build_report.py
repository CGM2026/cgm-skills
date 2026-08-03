#!/usr/bin/env python3
"""Validate Markdown, render the fixed PDF, then validate the final PDF."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent


def run(script: str, *args: Path) -> None:
    subprocess.run(
        [sys.executable, str(SCRIPT_DIR / script), *(str(arg) for arg in args)],
        check=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate and build a mingli language-fit Markdown/PDF report pair."
    )
    parser.add_argument("report", type=Path, help="Completed Markdown report")
    parser.add_argument("pdf", type=Path, help="Output PDF path")
    args = parser.parse_args()

    run("validate_canonical_copy.py", args.report)
    run("render_pdf_report.py", args.report, args.pdf)
    run("validate_pdf_report.py", args.report, args.pdf)
    print(f"Report pair passed: {args.report.resolve()} | {args.pdf.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
