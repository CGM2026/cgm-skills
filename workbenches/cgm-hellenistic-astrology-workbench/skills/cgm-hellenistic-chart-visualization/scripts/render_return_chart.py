#!/usr/bin/env python3
"""Build the next solar return page from validated natal chart facts."""
import argparse
import html
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import url2pathname

VISUAL = Path(__file__).resolve().parents[1]
CALCULATOR = VISUAL.parent / 'cgm-calculate-astrology-chart'
sys.path.insert(0, str(CALCULATOR / 'scripts'))
from calculate_chart import calculate  # noqa: E402
from calculate_return_query import find_returns, instant_of  # noqa: E402
from validate_chart_output import validate  # noqa: E402


def relative_link(source, target, label, css_class=''):
    href = os.path.relpath(target, source.parent).replace('\\', '/')
    klass = f' class="{css_class}"' if css_class else ''
    return f'<a{klass} href="{html.escape(href, quote=True)}">{label}</a>'


def connect(page, target):
    source = page.read_text(encoding='utf-8')
    item = relative_link(page, target, '返照盘', 'return-link')
    disabled = '<button type="button" disabled title="此盘式尚未开放">返照盘</button>'
    legacy = '<button type="button" disabled title="此盘式尚未开放">太阳返照盘</button>'
    if disabled in source or legacy in source:
        source = source.replace(disabled if disabled in source else legacy, item, 1)
    elif re.search(r'<a class="return-link" href="[^"]*">返照盘</a>', source):
        source = re.sub(r'<a class="return-link" href="[^"]*">返照盘</a>', item, source, count=1)
    else:
        raise ValueError(f'Cannot locate return navigation in {page}')
    if '/* return-switch-link */' not in source:
        style = '/* return-switch-link */.folio .chart-type-switch .return-link{font:inherit;color:var(--text-secondary);text-decoration:none}.folio .chart-type-switch .return-link:hover{text-decoration:underline}'
        source = source.replace('</style>', style + '</style>', 1)
    page.write_text(source, encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--natal-input', type=Path, required=True)
    parser.add_argument('--natal-page', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--from-time', help='ISO 8601 instant; defaults to now')
    parser.add_argument('--location-json', type=Path,
                        help='Optional return location JSON with location_name, latitude, longitude and IANA timezone')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--no-natal-link', action='store_true', help='Library navigation is generated from case IDs')
    args = parser.parse_args()
    natal = json.loads(args.natal_input.read_text(encoding='utf-8-sig'))
    problems = validate(natal)
    if problems:
        parser.error(f'Invalid natal facts: {problems}')
    out = args.output_dir.resolve()
    previous_queries = []
    prior_file = out / 'return-query-results.json'
    if args.force and prior_file.is_file():
        previous_queries = json.loads(prior_file.read_text(encoding='utf-8'))
    origin = args.from_time or (previous_queries[0].get('start') if previous_queries else None)
    start = datetime.fromisoformat(origin) if origin else datetime.now(timezone.utc)
    if start.tzinfo is None:
        parser.error('--from-time requires a timezone')
    _, roots, _ = find_returns(natal, 'sun', start, start + timedelta(days=400))
    if not roots:
        parser.error('No future solar return was found in 400 days')
    instant = instant_of(roots[0])
    meta, settings = natal['metadata'], natal['settings']
    location = json.loads(args.location_json.read_text(encoding='utf-8-sig')) if args.location_json else None
    if location is not None and not all(key in location for key in ('location_name', 'latitude', 'longitude', 'timezone')):
        parser.error('location JSON requires location_name, latitude, longitude and timezone')
    from zoneinfo import ZoneInfo
    zone = ZoneInfo(location['timezone']) if location else (ZoneInfo(meta['time_reference']) if meta['time_basis'] == 'iana' else datetime.fromisoformat(meta['local_datetime']).tzinfo)
    local = instant.astimezone(zone)
    event_input = {
        'chart_name': meta['chart_name'], 'local_datetime': local.isoformat(timespec='microseconds')[:26],
        'time_basis': 'iana' if location else meta['time_basis'], 'location_name': location['location_name'] if location else meta['location_name'],
        'latitude': location['latitude'] if location else meta['latitude'], 'longitude': location['longitude'] if location else meta['longitude'],
        'zodiac': settings['zodiac'], 'ayanamsa': settings.get('ayanamsa'),
        'house_system': settings['primary_house_system'], 'bound_system': settings['bound_system'],
    }
    event_input['timezone' if location or meta['time_basis'] == 'iana' else 'utc_offset'] = location['timezone'] if location else meta['time_reference']
    event = calculate(event_input)
    problems = validate(event)
    if problems:
        parser.error(f'Invalid return facts: {problems}')
    if out.exists() and not args.force:
        parser.error(f'{out} exists; choose another directory or use --force')
    out.mkdir(parents=True, exist_ok=True)
    facts_file = out / 'return-facts-v4.json'
    facts_file.write_text(json.dumps(event, ensure_ascii=False, indent=2), encoding='utf-8')
    command = [sys.executable, str(VISUAL / 'scripts/render_working_chart.py'), '--input', str(facts_file),
               '--output-dir', str(out), '--natal-input', str(args.natal_input),
               '--natal-page', str(args.natal_page), '--no-natal-link', '--force']
    subprocess.run(command, check=True)
    page = out / 'chart.html'
    source = page.read_text(encoding='utf-8')
    source = source.replace('globalThis.ChartPageMode="transit";',
                            'globalThis.ChartReturnMode=true;globalThis.ChartPageMode="transit";', 1)
    source = source.replace(' · 行运盘 · 纸面工作稿</title>', ' · 返照盘 · 纸面工作稿</title>', 1)
    source = source.replace('<span aria-current="page">行运盘</span><button type="button" disabled title="此盘式尚未开放">返照盘</button>',
                            '<button type="button" disabled title="此盘式尚未开放">行运盘</button><span aria-current="page">返照盘</span>', 1)
    natal_html = args.natal_page.read_text(encoding='utf-8')
    transit = re.search(r'<a class="transit-link" href="([^"]+)">行运盘</a>', natal_html)
    transit_page = None
    if transit:
        url = urlparse(html.unescape(transit.group(1)))
        if url.scheme in ('', 'file'):
            candidate = (Path(url2pathname(unquote(url.path))) if url.scheme == 'file'
                         else (args.natal_page.parent / unquote(url.path)).resolve())
            if candidate.is_file():
                transit_page = candidate
                source = source.replace('<button type="button" disabled title="此盘式尚未开放">行运盘</button>',
                                        relative_link(page, candidate, '行运盘'), 1)
    result = {'schema': 'cgm.return-query.v1', 'planet': 'sun',
              'target_longitude': next(p['longitude'] for p in natal['planets'] if p['key'] == 'sun'),
              'start': start.isoformat(), 'zodiac': settings['zodiac'],
              'ayanamsa': settings.get('ayanamsa'), 'time_reference': location['timezone'] if location else meta['time_reference'],
              'results': [{'local': local.isoformat(timespec='microseconds'),
                                                       'utc': instant.isoformat(timespec='microseconds'),
                                                       'direction': 'direct'}]}
    records = [result, *previous_queries[1:]]
    (out / 'return-query-results.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    script = (VISUAL / 'assets/working-page/work/return-ui.js').read_text(encoding='utf-8')
    source = source.replace('</body>', '<script id="return-query-data" type="application/json">'
                            + json.dumps(records, ensure_ascii=False).replace('<', '\\u003c')
                            + '</script><script>' + script + '</script></body>', 1)
    page.write_text(source, encoding='utf-8')
    manifest_path = out / 'visualization.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    manifest['mode'] = 'return'
    manifest['return_planet'] = 'sun'
    manifest['return_origin'] = start.isoformat()
    manifest['return_location'] = {'name': event_input['location_name'],
                                   'latitude': event_input['latitude'],
                                   'longitude': event_input['longitude'],
                                   'time_reference': event_input.get('timezone', event_input.get('utc_offset'))}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    if not args.no_natal_link:
        connect(args.natal_page, page)
        if transit_page:
            connect(transit_page, page)
    print(json.dumps({'page': str(page), 'return_local': result['results'][0]['local'],
                      'natal_page': str(args.natal_page)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
