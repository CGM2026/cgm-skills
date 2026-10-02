"""Calculate a provisional 129-month decennials timeline from validated natal facts."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from validate_chart_output import validate
from civil_age import annotate_periods

PLANETS = ('sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn')
MINOR = {'saturn': 30, 'jupiter': 12, 'mars': 15, 'sun': 19,
         'venus': 8, 'mercury': 20, 'moon': 25}
MONTH_DAYS = 30
MAJOR_DAYS = sum(MINOR.values()) * MONTH_DAYS


def sequence(planets: list[dict], start: str) -> list[str]:
    order = [planet['key'] for planet in sorted(planets, key=lambda item: item['longitude'])
             if planet['key'] in PLANETS]
    if len(order) != 7 or set(order) != set(PLANETS):
        raise ValueError('十年运需要本命传统七星及各自的黄经。')
    index = order.index(start)
    return order[index:] + order[:index]


def nested_periods(origin: datetime, natal_order: list[str], start: str,
                   major_count: int) -> list[dict]:
    major_order = sequence([{'key': key, 'longitude': i} for i, key in enumerate(natal_order)], start)
    majors = []
    for major_index in range(major_count):
        major_ruler = major_order[major_index % 7]
        major_start = origin + timedelta(days=major_index * MAJOR_DAYS)
        sub_order = major_order[major_index % 7:] + major_order[:major_index % 7]
        subs = []
        cursor = major_start
        for sub_ruler in sub_order:
            sub_end = cursor + timedelta(days=MINOR[sub_ruler] * MONTH_DAYS)
            cycle_order = sequence([{'key': key, 'longitude': i} for i, key in enumerate(natal_order)], sub_ruler)
            thirds = []
            cycles = []
            day_cursor = cursor
            cycle_index = 0
            while day_cursor < sub_end:
                cycle_ruler = cycle_order[cycle_index % 7]
                day_order = sequence([{'key': key, 'longitude': i} for i, key in enumerate(natal_order)], cycle_ruler)
                cycle_start = day_cursor
                cycle_end = min(cycle_start + timedelta(days=129), sub_end)
                cycle_days = []
                for ruler in day_order:
                    end = min(day_cursor + timedelta(days=MINOR[ruler]), cycle_end)
                    period = {'ruler': ruler, 'start_utc': day_cursor.isoformat(),
                              'end_utc': end.isoformat()}
                    cycle_days.append(period)
                    thirds.append(period)
                    day_cursor = end
                    if day_cursor >= cycle_end:
                        break
                cycles.append({'ruler': cycle_ruler, 'start_utc': cycle_start.isoformat(),
                               'end_utc': cycle_end.isoformat(), 'days': cycle_days})
                cycle_index += 1
            subs.append({'ruler': sub_ruler, 'months': MINOR[sub_ruler],
                         'start_utc': cursor.isoformat(), 'end_utc': sub_end.isoformat(),
                         'cycles': cycles, 'thirds': thirds})
            cursor = sub_end
        assert cursor == major_start + timedelta(days=MAJOR_DAYS)
        majors.append({'ruler': major_ruler, 'start_utc': major_start.isoformat(),
                       'end_utc': cursor.isoformat(), 'subs': subs})
    return majors


def recipe(facts: dict, *, at: datetime | None = None) -> dict:
    """Small persistent basis; tables remain derived, using the same constants."""
    errors=validate(facts)
    if errors:raise ValueError(errors)
    birth=datetime.fromisoformat(facts['metadata']['utc_datetime']).astimezone(timezone.utc)
    now=(at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if now<birth:raise ValueError('查询时刻早于出生时刻。')
    natal_order=[p['key'] for p in sorted(facts['planets'],key=lambda p:p['longitude']) if p['key'] in PLANETS]
    sect=facts['solar_condition']['sect']
    return {'schema':'cgm.decennials/working-v1','basis':{'natal_utc':birth.isoformat(),'at_utc':now.isoformat(),'sect':sect,'default_start':'sun' if sect=='day' else 'moon','natal_zodiacal_order':natal_order,'timezone':facts['metadata']['time_reference'],'fixed_year_days':360,'fixed_month_days':MONTH_DAYS,'major_months':129,'major_days':MAJOR_DAYS,'minor_months':MINOR,'third_level':'successive-129-day-rulers-with-planetary-minor-days','source_note':'Working combination: successive 129-day cycle rulers from Valens, Anthology VI; seven planetary day allocations per full cycle. A later fifth-century addition describes another branch. Fixed 30-day months and this combined schedule are provisional.','age_method':'civil-birthday-fraction'}}

def calculate(facts: dict, *, at: datetime | None = None,
              major_count: int = 14) -> dict:
    errors = validate(facts)
    if errors:
        raise ValueError(f'本命事实未通过校验：{errors}')
    if major_count < 1:
        raise ValueError('至少需要一个大运。')
    birth = datetime.fromisoformat(facts['metadata']['utc_datetime']).astimezone(timezone.utc)
    now = (at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if now < birth:
        raise ValueError('查询时刻早于出生时刻。')
    natal_order = [planet['key'] for planet in sorted(facts['planets'], key=lambda item: item['longitude'])
                   if planet['key'] in PLANETS]
    sect = facts['solar_condition']['sect']
    default = 'sun' if sect == 'day' else 'moon'
    schedules = {key: nested_periods(birth, natal_order, key, major_count) for key in PLANETS}
    zone_name = facts['metadata']['time_reference']
    local = datetime.fromisoformat(facts['metadata']['local_datetime'])
    zone = (ZoneInfo(zone_name) if facts['metadata']['time_basis'] == 'iana'
            else local.tzinfo)
    annotate_periods(schedules, birth, zone)
    return {'schema': 'cgm.decennials/working-v1', 'status': 'working-draft',
            'basis': {'natal_utc': birth.isoformat(), 'at_utc': now.isoformat(),
                      'sect': sect, 'default_start': default,
                      'natal_zodiacal_order': natal_order, 'timezone': zone_name,
                      'fixed_year_days': 360, 'fixed_month_days': MONTH_DAYS,
                      'major_months': 129, 'major_days': MAJOR_DAYS,
                      'minor_months': MINOR,
                      'third_level': 'successive-129-day-rulers-with-planetary-minor-days',
                      'source_note': 'Working combination: successive 129-day cycle rulers from Valens, Anthology VI; seven planetary day allocations per full cycle. A later fifth-century addition describes another branch. Fixed 30-day months and this combined schedule are provisional.'},
            'schedules': schedules,
            'display_at_local': now.astimezone(zone).isoformat()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--natal-input', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--at', help='Optional ISO 8601 instant for a reproducible snapshot')
    args = parser.parse_args()
    at = datetime.fromisoformat(args.at) if args.at else None
    if at is not None and at.tzinfo is None:
        parser.error('--at requires a timezone')
    facts = json.loads(args.natal_input.read_text(encoding='utf-8-sig'))
    result = calculate(facts, at=at)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')),
                           encoding='utf-8')
    print(json.dumps({'output': str(args.output), 'default_start': result['basis']['default_start'],
                      'schedules': len(result['schedules'])}, ensure_ascii=False))


if __name__ == '__main__':
    main()
