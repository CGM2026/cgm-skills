#!/usr/bin/env python3
"""Validate chart-facts v4 and produce a standalone HTML wheel and SVG."""
from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

sys.dont_write_bytecode = True
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
SKILL = Path(__file__).resolve().parents[1]


def prepare(source: Path, calculator: Path) -> dict:
    raw = source.read_bytes()
    facts = json.loads(raw.decode('utf-8-sig'))
    if not isinstance(facts, dict) or facts.get('schema_version') != 4:
        raise ValueError('需要 chart-facts v4；请先由排盘 skill 转换或重新计算。')
    spec = importlib.util.spec_from_file_location('chart_validator', calculator / 'scripts/validate_chart_output.py')
    validator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validator)
    errors = validator.validate(facts)
    if errors:
        raise ValueError('盘面未通过上游校验：\n' + '\n'.join(errors))
    # Read literal bound tables from the installed calculator, without importing
    # Swiss Ephemeris or maintaining a second, potentially divergent table.
    tree = ast.parse((calculator / 'scripts/calculate_chart.py').read_text(encoding='utf-8-sig'))
    bound_name = {'egyptian': 'EGYPTIAN_BOUNDS', 'ptolemy_lilly': 'PTOLEMY_LILLY_BOUNDS'}[facts['settings']['bound_system']]
    table = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign)
                 and any(isinstance(t, ast.Name) and t.id == bound_name for t in n.targets))
    signs = validator.SIGNS
    bounds = {}
    for index, sign in enumerate(signs):
        start = 0
        bounds[sign] = []
        for end, ruler in table[index]:
            bounds[sign].append([ruler, start, end])
            start = end
    # Ensure displayed ring matches the facts' bound rulers even if calculator
    # tables have changed since an older chart was saved.
    for point in facts['planets'] + facts['angles'] + facts['lots']:
        degree = point['longitude'] % 30
        ruler = next(r for r, start, end in bounds[point['sign']] if start <= degree < end)
        if ruler != point['bound_ruler']:
            raise ValueError(f"{point['key']} 的界主与当前计算器界表不一致，请核对数据版本。")
    return {'facts': facts, 'bound_table': bounds, 'source_sha256': hashlib.sha256(raw).hexdigest()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--calculator-skill', type=Path, default=SKILL.parent / 'cgm-calculate-astrology-chart')
    parser.add_argument('--node', default=__import__('local_installation').node('astrology'))
    parser.add_argument('--title')
    parser.add_argument('--force', action='store_true', help='Replace existing visualization outputs')
    args = parser.parse_args()
    try:
        if not args.node:
            raise ValueError('找不到 Node.js，请用 --node 指定已安装的运行程序。')
        payload = prepare(args.input.resolve(), args.calculator_skill.resolve())
        payload['title'] = args.title or payload['facts']['metadata'].get('chart_name') or '希腊占星盘'
        payload['output_dir'] = str(args.output_dir.resolve())
        payload['force'] = args.force
        result = subprocess.run([args.node, str(SKILL / 'scripts/render_document.js')],
                                input=json.dumps(payload, ensure_ascii=False), text=True,
                                encoding='utf-8', capture_output=True,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        if result.returncode:
            raise ValueError(result.stderr.strip())
        print(result.stdout.strip())
        return 0
    except (OSError, ValueError, KeyError, TypeError, StopIteration) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
