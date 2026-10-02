"""Firdaria and zodiacal releasing, from validated natal chart-facts v4.

Compact period columns: ruler, start_ms, end_ms, local_start_date, civil_age,
children, loosing_of_bond. All arithmetic belongs to the calculation member.
"""
import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from civil_age import civil_age, local_zone
from validate_chart_output import validate

ORDER = ['sun', 'venus', 'mercury', 'moon', 'saturn', 'jupiter', 'mars']
YEARS = dict(zip(ORDER, [10, 8, 13, 9, 11, 12, 7])) | {'north_node': 3, 'south_node': 2}
SIGN_YEARS = [15, 8, 20, 25, 19, 20, 8, 15, 12, 27, 30, 12]
UNITS = [360 * 86400, 30 * 86400, 60 * 3600, 5 * 3600]


def calculate(facts, technique, horizon_years=150, start_sign=None):
    errors = validate(facts)
    if errors:
        raise ValueError(errors)
    birth = datetime.fromisoformat(facts['metadata']['utc_datetime'])
    zone = local_zone(facts)
    def node(ruler, start, end, children=None, lb=False):
        return [ruler, round(start.timestamp() * 1000), round(end.timestamp() * 1000),
                start.astimezone(zone).strftime('%Y.%m.%d'), civil_age(birth, start, zone), children or [], bool(lb)]
    basis = {'natal_utc': birth.isoformat(), 'timezone': facts['metadata']['time_reference'],
             'sect': facts['solar_condition']['sect'], 'age_method': 'civil-birthday-fraction',
             'leap_birthday': 'February 28 in non-leap years', 'horizon_years': horizon_years}
    if technique == 'firdaria':
        order = ORDER.copy()
        if basis['sect'] == 'night':
            order = order[3:] + order[:3]
        order += ['north_node', 'south_node']
        majors, cursor = [], birth
        for i in range(len(order) * 2):
            ruler = order[i % len(order)]
            end = cursor + timedelta(days=YEARS[ruler] * 365.25)
            children = []
            if ruler in ORDER:
                index = ORDER.index(ruler)
                for j in range(7):
                    children.append(node(ORDER[(index + j) % 7], cursor + (end-cursor)*j/7,
                                         cursor + (end-cursor)*(j+1)/7))
            majors.append(node(ruler, cursor, end, children))
            cursor = end
        basis.update(default_start=order[0], fixed_year_days=365.25, order=order,
                     nodes_subdivided=False, horizon_years=150)
        schedules = {'default': majors}
    elif technique == 'zodiacal-releasing':
        fortune = next(item for item in facts['lots'] if item['key'] == 'fortune')
        basis.update(default_start=int(fortune['longitude']//30), unit_seconds=UNITS,
                     sign_years=SIGN_YEARS, zodiac=facts['settings']['zodiac'],
                     ayanamsa=facts['settings'].get('ayanamsa'))
        def periods(start, end, first, level):
            result, cursor, step, released = [], start, 0, False
            sign = first
            while cursor < end:
                lb = level > 0 and step == 12 and not released
                if lb:
                    sign = (first + 6) % 12
                    released = True
                stop = min(end, cursor + timedelta(seconds=SIGN_YEARS[sign] * UNITS[level]))
                children = periods(cursor, stop, sign, level+1) if level < 3 else []
                result.append(node(sign, cursor, stop, children, lb))
                cursor, sign, step = stop, (sign+1) % 12, step+1
            return result
        # Finish the last L1 instead of inventing an artificial short major.
        schedules = {}
        if start_sign is not None and start_sign not in range(12):
            raise ValueError('起始星座应为0到11')
        for first in (range(12) if start_sign is None else [start_sign]):
            total, sign = 0, first
            while total < horizon_years:
                total += SIGN_YEARS[sign]
                sign = (sign+1) % 12
            schedules[str(first)] = periods(birth, birth+timedelta(days=360*total), first, 0)
    else:
        raise ValueError('Unknown technique')
    return {'schema': 'cgm.time-lords.v1', 'status': 'working-draft', 'technique': technique,
            'columns': ['ruler','start_ms','end_ms','local_start_date','civil_age','children','loosing_of_bond'],
            'basis': basis, 'schedules': schedules}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--natal-input', required=True, type=Path)
    p.add_argument('--technique', required=True, choices=['firdaria','zodiacal-releasing'])
    p.add_argument('--output', required=True, type=Path)
    args = p.parse_args()
    result = calculate(json.loads(args.natal_input.read_text(encoding='utf-8-sig')), args.technique)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(',',':')), encoding='utf-8')
    print(json.dumps({'output':str(args.output),'bytes':args.output.stat().st_size}))
