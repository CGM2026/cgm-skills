#!/usr/bin/env python3
"""Render the provisional decennials page beside an existing natal page."""

import argparse
import html
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import url2pathname

VISUAL = Path(__file__).resolve().parents[1]
CALCULATOR = VISUAL.parent / 'cgm-calculate-astrology-chart'


def resolve_link(page: Path, label: str) -> Path | None:
    source = page.read_text(encoding='utf-8')
    nav = re.search(r'<nav class="chart-type-switch"[^>]*>(.*?)</nav>', source, re.S)
    if not nav:
        return None
    match = re.search(r'<a[^>]*href="([^"]+)"[^>]*>' + label + r'(?:盘)?</a>', nav[1])
    if not match:
        return None
    url = urlparse(html.unescape(match[1]))
    candidate = (Path(url2pathname(unquote(url.path))) if url.scheme == 'file'
                 else (page.parent / unquote(url.path)).resolve())
    return candidate if candidate.is_file() else None


def link(source: Path, target: Path, label: str) -> str:
    href = os.path.relpath(target, source.parent).replace('\\', '/')
    return f'<a class="decennials-link" href="{html.escape(href, quote=True)}">{label}</a>'


def connect(source: Path, target: Path) -> None:
    text = source.read_text(encoding='utf-8')
    item = link(source, target, '十年九月大运')
    pattern = r'<a[^>]*href="[^"]*"[^>]*>十年(?:九月)?(?:大运|运盘)</a>'
    if re.search(pattern, text):
        text = re.sub(pattern, item, text, count=1)
    else:
        text = re.sub(r'(<nav class="chart-type-switch"[^>]*>.*?)(</nav>)',
                      lambda match: match[1] + item + match[2], text, count=1, flags=re.S)
    if '/* decennials-switch-link */' not in text:
        text = text.replace('</style>', '/* decennials-switch-link */.folio .chart-type-switch .decennials-link{font:inherit;color:var(--text-secondary);text-decoration:none}.folio .chart-type-switch .decennials-link:hover{text-decoration:underline}</style>', 1)
    source.write_text(text, encoding='utf-8')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--natal-input', type=Path, required=True)
    parser.add_argument('--natal-page', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    natal_page = args.natal_page.resolve()
    out = args.output_dir.resolve()
    if not natal_page.is_file():
        parser.error('An existing natal chart.html is required')
    if out.exists() and not args.force:
        parser.error('Output exists; pass --force only for this working draft')
    out.mkdir(parents=True, exist_ok=True)
    data_file = out / 'decennials.json'
    subprocess.run([sys.executable, str(CALCULATOR / 'scripts/calculate_decennials.py'),
                    '--natal-input', str(args.natal_input), '--output', str(data_file)], check=True)
    subprocess.run([sys.executable, str(VISUAL / 'scripts/render_working_chart.py'),
                    '--input', str(args.natal_input), '--output-dir', str(out), '--force'], check=True)
    page = out / 'chart.html'
    source = page.read_text(encoding='utf-8')
    source = source.replace('globalThis.ChartPageMode="natal";',
                            'globalThis.ChartDecennialsMode=true;globalThis.ChartPageMode="decennials";', 1)
    source = source.replace(' · 纸面工作稿</title>', ' · 十年九月大运 · 纸面工作稿</title>', 1)
    links = [('本命', natal_page)]
    for label in ('行运', '返照'):
        target = resolve_link(natal_page, label)
        if target:
            links.append((label, target))
    nav = '<nav class="chart-type-switch" aria-label="盘式">'
    for label, target in links:
        href = os.path.relpath(target, page.parent).replace('\\', '/')
        nav += f'<a href="{html.escape(href, quote=True)}">{label}</a>'
    nav += '<span aria-current="page">十年九月大运</span></nav>'
    source, count = re.subn(r'<nav class="chart-type-switch"[^>]*>.*?</nav>', nav,
                            source, count=1, flags=re.S)
    if count != 1:
        raise ValueError('Chart navigation is missing')
    source = source.replace('</style>', '.folio .chart-type-switch a{font:inherit;color:var(--text-secondary);text-decoration:none}.folio .chart-type-switch a:hover{text-decoration:underline}</style>', 1)
    data = json.loads(data_file.read_text(encoding='utf-8'))
    script = (VISUAL / 'assets/working-page/work/decennials-ui.js').read_text(encoding='utf-8')
    source = source.replace('</body>', '<script id="decennials-data" type="application/json">'
                            + json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
                            + '</script><script>' + script + '</script></body>', 1)
    page.write_text(source, encoding='utf-8')
    for _, target in links:
        connect(target, page)
    manifest = out / 'visualization.json'
    info = json.loads(manifest.read_text(encoding='utf-8'))
    info['mode'] = 'decennials'
    info['period_data'] = str(data_file)
    manifest.write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'page': str(page), 'default_start': data['basis']['default_start'],
                      'linked_pages': [str(target) for _, target in links]}, ensure_ascii=False))


if __name__ == '__main__':
    main()
