#!/usr/bin/env python3
"""Render validated chart-facts v4 with the current interactive working page."""
import argparse
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

sys.dont_write_bytecode = True
skill = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--output-dir', type=Path, required=True)
parser.add_argument('--calculator-skill', type=Path, default=skill.parent / 'cgm-calculate-astrology-chart')
parser.add_argument('--node', default='node')
parser.add_argument('--force', action='store_true')
parser.add_argument('--natal-input', type=Path, help='Validated natal facts when rendering a transit page')
parser.add_argument('--natal-page', type=Path, help='Existing natal chart.html for the shared case archive')
parser.add_argument('--no-natal-link', action='store_true', help='Do not update natal chart navigation for a temporary preview')
args = parser.parse_args()

calculator = args.calculator_skill.resolve()
sys.path.insert(0, str(calculator / 'scripts'))
from validate_chart_output import validate  # noqa: E402
from calculate_chart import swe  # noqa: E402

original = json.loads(args.input.read_text(encoding='utf-8-sig'))
errors = validate(original)
if errors:
    parser.error(f'Invalid chart-facts v4: {errors}')
natal = None
if args.natal_input:
    natal = json.loads(args.natal_input.read_text(encoding='utf-8-sig'))
    errors = validate(natal)
    if errors:
        parser.error(f'Invalid natal chart-facts v4: {errors}')
    if not args.natal_page or args.natal_page.name != 'chart.html' or not args.natal_page.is_file():
        parser.error('Transit rendering requires an existing --natal-page chart.html')
    if not (args.natal_page.parent / 'chart-variants.json').is_file():
        parser.error('Transit rendering requires the natal chart-variants.json')
elif args.natal_page:
    parser.error('--natal-page requires --natal-input')
natal_page = args.natal_page.resolve() if args.natal_page else None
out = args.output_dir.resolve()
if (out / 'chart.html').exists() and not args.force:
    parser.error(f'{out / "chart.html"} exists; choose a new directory or use --force')
existing_nav = None
existing_transit_link = None
existing_return_link = None
existing_decennials_link = None
if (out / 'chart.html').is_file():
    old_html = (out / 'chart.html').read_text(encoding='utf-8')
    nav_match = re.search(r'<nav class="chart-type-switch"[^>]*>.*?</nav>', old_html, re.S)
    existing_nav = nav_match[0] if nav_match else None
    match = re.search(r'<a class="return-link" href="[^"]*">返照盘</a>', old_html)
    existing_return_link = match[0] if match else None
    match = re.search(r'<a class="decennials-link" href="[^"]*">十年运盘</a>', old_html)
    existing_decennials_link = match[0] if match else None
if not natal and (out / 'chart.html').is_file():
    match = re.search(r'<a class="transit-link" href="[^"]*">行运盘</a>',
                      (out / 'chart.html').read_text(encoding='utf-8'))
    existing_transit_link = match[0] if match else None

settings = original['settings']
zodiac = settings['zodiac']
ayanamsa = settings.get('ayanamsa')
key = '|'.join([('sidereal_lahiri' if ayanamsa == 'lahiri' else zodiac),
                settings['primary_house_system'], settings['bound_system']])
source = skill / 'assets/working-page'

with tempfile.TemporaryDirectory(prefix='chart-working-') as temporary:
    temp = Path(temporary)
    shutil.copytree(source / 'work', temp / 'work')
    template_dir = temp / 'outputs/排盘可视化示例'
    template_dir.mkdir(parents=True)
    shutil.copy2(source / 'outputs/排盘可视化示例/chart.html', template_dir / 'chart.html')
    data_dir = temp / 'work/input'
    data_dir.mkdir()
    (data_dir / 'chart-facts-v4.json').write_text(json.dumps(original, ensure_ascii=False), encoding='utf-8')

    old_cwd = Path.cwd()
    try:
        os.chdir(temp)
        code = (temp / 'work/build_chart_variants.py').read_text(encoding='utf-8')
        code = code.split('# Keep optional lunar-point')[0]
        code = code.replace('outputs/排盘可视化示例/chart-facts-v4.json', 'work/input/chart-facts-v4.json')
        code = code.replace('work/print-study/variants', 'work/input/variants')
        code = code.replace("if key == 'tropical|whole_sign|egyptian':", f"if key == '{key}':")
        code = code.replace('__CALCULATOR_SKILL__', calculator.as_posix())
        exec(compile(code, 'working_chart_variants', 'exec'), {'__name__': '__main__'})

        for name in ['build_virtual_points.py', 'build_asteroids.py']:
            code = (temp / 'work' / name).read_text(encoding='utf-8')
            code = code.replace('work/print-study/variants.json', 'work/input/variants.json')
            code = code.replace('__CALCULATOR_SKILL__', calculator.as_posix())
            exec(compile(code, name, 'exec'), {'__name__': '__main__'})

        bundle = json.loads((data_dir / 'variants.json').read_text(encoding='utf-8'))
        out.mkdir(parents=True, exist_ok=True)
        (out / 'chart-variants.json').write_text(json.dumps(bundle, ensure_ascii=False), encoding='utf-8')
        payload = bundle['variants'][key]
        template = (template_dir / 'chart.html').read_text(encoding='utf-8')
        template = re.sub(
            r'(<script id="chart-data" type="application/json">)[\s\S]*?(</script>)',
            lambda match: match[1] + json.dumps(payload, ensure_ascii=False) + match[2],
            template,
            count=1,
        )
        (data_dir / 'source.html').write_text(template, encoding='utf-8')
        env = dict(os.environ, CHART_OUTPUT=str(out), CHART_SOURCE='work/input/source.html',
                   CHART_VARIANTS='work/input/variants.json', CHART_ASSET_ROOT=str(source / 'resources'))
        if natal:
            (out / 'natal-facts-v4.json').write_text(json.dumps(natal, ensure_ascii=False, indent=2), encoding='utf-8')
            (out / 'natal-page.txt').write_text(str(natal_page), encoding='utf-8')
            meta = original['metadata']
            transit_input = {
                'chart_name': meta['chart_name'],
                'local_datetime': meta['local_datetime'][:19],
                'time_basis': meta['time_basis'],
                'location_name': meta['location_name'],
                'latitude': meta['latitude'],
                'longitude': meta['longitude'],
                'zodiac': settings['zodiac'],
                'ayanamsa': settings.get('ayanamsa'),
                'house_system': settings['primary_house_system'],
                'bound_system': settings['bound_system'],
            }
            transit_input['timezone' if meta['time_basis'] == 'iana' else 'utc_offset'] = meta['time_reference']
            (out / 'input.json').write_text(json.dumps(transit_input, ensure_ascii=False, indent=2), encoding='utf-8')
            env['CHART_MODE'] = 'transit'
            env['CHART_NATAL_PAGE'] = os.path.relpath(natal_page, out).replace('\\', '/')
            env['CHART_NATAL_PAGE_URI'] = natal_page.as_uri()
            env['CHART_NATAL_VARIANTS'] = str(natal_page.parent / 'chart-variants.json')
        subprocess.run([args.node, 'work/build_print_study.js'], check=True, env=env)
    finally:
        swe.close()
        os.chdir(old_cwd)

assert json.loads((out / 'chart-facts-v4.json').read_text(encoding='utf-8')) == original
if existing_transit_link:
    natal_html = (out / 'chart.html').read_text(encoding='utf-8')
    natal_html = natal_html.replace('<button type="button" disabled title="此盘式尚未开放">行运盘</button>',
                                    existing_transit_link, 1)
    natal_html = natal_html.replace('</style>', '/* transit-switch-link */.folio .chart-type-switch .transit-link{font:inherit;color:var(--text-secondary);text-decoration:none}.folio .chart-type-switch .transit-link:hover{text-decoration:underline}</style>', 1)
    (out / 'chart.html').write_text(natal_html, encoding='utf-8')
if existing_return_link:
    rebuilt_html = (out / 'chart.html').read_text(encoding='utf-8')
    disabled = '<button type="button" disabled title="此盘式尚未开放">返照盘</button>'
    if disabled in rebuilt_html:
        rebuilt_html = rebuilt_html.replace(disabled, existing_return_link, 1)
        rebuilt_html = rebuilt_html.replace('</style>', '/* return-switch-link */.folio .chart-type-switch .return-link{font:inherit;color:var(--text-secondary);text-decoration:none}.folio .chart-type-switch .return-link:hover{text-decoration:underline}</style>', 1)
        (out / 'chart.html').write_text(rebuilt_html, encoding='utf-8')
if existing_decennials_link:
    rebuilt_html = (out / 'chart.html').read_text(encoding='utf-8')
    rebuilt_html = re.sub(r'(<nav class="chart-type-switch"[^>]*>.*?)(</nav>)',
                          lambda match: match[1] + existing_decennials_link + match[2],
                          rebuilt_html, count=1, flags=re.S)
    (out / 'chart.html').write_text(rebuilt_html, encoding='utf-8')
if natal and not args.no_natal_link:
    natal_html = natal_page.read_text(encoding='utf-8')
    transit_link = f'<a class="transit-link" href="{html.escape(os.path.relpath(out / "chart.html", natal_page.parent).replace(chr(92), "/"), quote=True)}">行运盘</a>'
    disabled_link = '<button type="button" disabled title="此盘式尚未开放">行运盘</button>'
    if disabled_link in natal_html:
        natal_html = natal_html.replace(disabled_link, transit_link, 1)
    elif re.search(r'<a class="transit-link" href="[^"]*">行运盘</a>', natal_html):
        natal_html = re.sub(r'<a class="transit-link" href="[^"]*">行运盘</a>', transit_link, natal_html, count=1)
    else:
        parser.error('Natal page has no chart switch to connect; its HTML was not changed')
    if '/* transit-switch-link */' not in natal_html:
        natal_html = natal_html.replace('</style>', '/* transit-switch-link */.folio .chart-type-switch .transit-link{font:inherit;color:var(--text-secondary);text-decoration:none}.folio .chart-type-switch .transit-link:hover{text-decoration:underline}</style>', 1)
    natal_page.write_text(natal_html, encoding='utf-8')
manifest = {
    'schema': 'cgm-hellenistic-chart-visualization/working-page-1',
    'chart_schema_version': 4,
    'source_sha256': hashlib.sha256(args.input.read_bytes()).hexdigest(),
    'settings': original['settings'],
    'mode': 'transit' if natal else 'natal',
    'outputs': {'html': str(out / 'chart.html'), 'facts': str(out / 'chart-facts-v4.json')},
}
(out / 'visualization.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'html': str(out / 'chart.html'), 'facts': str(out / 'chart-facts-v4.json'),
                  'variants': 42, 'chart_name': original['metadata']['chart_name']}, ensure_ascii=False))

# Preserve all linked techniques when rebuilding an existing page.
from chart_navigation import normalize
page = out / 'chart.html'
source = page.read_text(encoding='utf-8')
if existing_nav:
    source = re.sub(r'<nav class="chart-type-switch"[^>]*>.*?</nav>', lambda _: existing_nav, source, count=1, flags=re.S)
page.write_text(normalize(source), encoding='utf-8')
