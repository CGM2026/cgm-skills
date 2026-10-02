#!/usr/bin/env python3
"""Find every exact natal-longitude return in a requested UTC interval."""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
from calculate_chart import calculation_flags, swe  # noqa: E402

BODY = {name: getattr(swe, name.upper()) for name in
        ('sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn',
         'uranus', 'neptune', 'pluto')}


def longitude(jd, body, flags):
    return swe.calc_ut(jd, BODY[body], flags)[0][0] % 360


def speed(jd, body, flags):
    return swe.calc_ut(jd, BODY[body], flags)[0][3]


def delta(jd, body, flags, target):
    return (longitude(jd, body, flags) - target + 180) % 360 - 180


def jd_of(instant):
    utc = instant.astimezone(timezone.utc)
    hour = utc.hour + utc.minute / 60 + utc.second / 3600 + utc.microsecond / 3_600_000_000
    return swe.julday(utc.year, utc.month, utc.day, hour)


def instant_of(jd):
    year, month, day, hour = swe.revjul(jd)
    from datetime import timedelta
    return datetime(year, month, day, tzinfo=timezone.utc) + timedelta(hours=hour)


def find_returns(natal, body, start, end):
    settings = natal['settings']
    flags = calculation_flags(settings['zodiac'], settings.get('ayanamsa'))
    by_key = {p['key']: float(p['longitude']) for p in natal['planets']}
    # chart-facts v4 deliberately stores seven planets. Compute the outer bodies
    # at the same validated natal Julian day without changing that schema.
    target = by_key.get(body)
    if target is None:
        if body not in ('uranus', 'neptune', 'pluto'):
            raise ValueError(f'No natal longitude for {body}')
        target = longitude(float(natal['metadata']['julian_day_ut']), body, flags)
    left, stop = jd_of(start), jd_of(end)
    # Split at stations so a direct and retrograde crossing in one sample
    # interval remain two results. Quarter-day samples also bound lunar motion.
    step = .25
    roots = []
    while left < stop:
        right = min(left + step, stop)
        segments = [left, right]
        sa, sb = speed(left, body, flags), speed(right, body, flags)
        if sa * sb < 0:
            lo, hi = left, right
            for _ in range(42):
                mid = (lo + hi) / 2
                if speed(lo, body, flags) * speed(mid, body, flags) <= 0:
                    hi = mid
                else:
                    lo = mid
            segments.insert(1, (lo + hi) / 2)
        for low, high in zip(segments, segments[1:]):
            a, b = delta(low, body, flags, target), delta(high, body, flags, target)
            if a == 0 or (a * b < 0 and abs(a - b) < 90):
                lo, hi = low, high
                for _ in range(46):
                    mid = (lo + hi) / 2
                    if delta(lo, body, flags, target) * delta(mid, body, flags, target) <= 0:
                        hi = mid
                    else:
                        lo = mid
                root = (lo + hi) / 2
                if (not roots or root - roots[-1] > 1e-9) and root > jd_of(start) + 1e-9:
                    roots.append(root)
        left = right
    return target, roots, flags


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--natal-input', type=Path, required=True)
    parser.add_argument('--planet', choices=BODY, required=True)
    parser.add_argument('--start', required=True, help='ISO 8601 instant with timezone')
    parser.add_argument('--end', required=True, help='ISO 8601 instant with timezone')
    parser.add_argument('--display-timezone', help='IANA timezone for result labels; defaults to natal timezone')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    natal = json.loads(args.natal_input.read_text(encoding='utf-8-sig'))
    start, end = (datetime.fromisoformat(value) for value in (args.start, args.end))
    if start.tzinfo is None or end.tzinfo is None or end <= start:
        parser.error('start and end must include timezones, and end must follow start')
    target, roots, flags = find_returns(natal, args.planet, start, end)
    meta = natal['metadata']
    zone = ZoneInfo(args.display_timezone) if args.display_timezone else (ZoneInfo(meta['time_reference']) if meta['time_basis'] == 'iana' else datetime.fromisoformat(meta['local_datetime']).tzinfo)
    results = []
    for jd in roots:
        utc = instant_of(jd)
        local = utc.astimezone(zone)
        motion = speed(jd, args.planet, flags)
        results.append({'utc': utc.isoformat(timespec='microseconds'),
                        'local': local.isoformat(timespec='microseconds'),
                        'longitude': longitude(jd, args.planet, flags),
                        'direction': 'retrograde' if motion < 0 else 'direct'})
    data = {'schema': 'cgm.return-query.v1', 'planet': args.planet,
            'target_longitude': target, 'zodiac': natal['settings']['zodiac'],
            'ayanamsa': natal['settings'].get('ayanamsa'),
            'time_reference': args.display_timezone or meta['time_reference'], 'start': start.isoformat(),
            'end': end.isoformat(), 'results': results}
    rendered = json.dumps(data, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(rendered + '\n', encoding='utf-8')
    else:
        print(rendered)
    swe.close()


if __name__ == '__main__':
    main()
