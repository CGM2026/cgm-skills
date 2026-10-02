"""Calculated display snapshots. No HTML or visualization dependency."""
from datetime import datetime,timezone,timedelta
from pathlib import Path
import json
import os
import subprocess
import sys
from calculate_chart import calculate,calculation_flags,point_payload,apply_primary_houses,swe,InputError
from validate_chart_output import validate

def input_from_facts(original):
    errors = validate(original)
    if errors:
        raise ValueError(errors)
    m = original['metadata']
    base = {k: m[k] for k in ['chart_name', 'location_name', 'latitude', 'longitude', 'local_datetime', 'time_basis']}
    base['utc_offset'] = m['time_reference']
    local = datetime.fromisoformat(m['local_datetime'])
    base['local_datetime'] = local.isoformat()
    if m['time_basis'] == 'iana':
        base['timezone'] = m['time_reference']
    settings=original['settings']
    base.update(zodiac=settings['zodiac'],ayanamsa=settings.get('ayanamsa'),house_system=settings['primary_house_system'],bound_system=settings['bound_system'])
    return base


def input_at_instant(original, instant):
    """Build an input for an explicit instant without losing a DST fold or offset."""
    if not isinstance(instant, datetime) or instant.tzinfo is None or instant.utcoffset() is None:
        raise ValueError('查询时刻需要明确时区或 UTC 偏移')
    from civil_age import local_zone
    base = input_from_facts(original)
    base['local_datetime'] = instant.astimezone(local_zone(original)).isoformat(timespec='microseconds')
    return base


def calculate_at_instant(original, instant):
    """Recalculate full facts at a known instant while preserving the local reference."""
    return calculate(input_at_instant(original, instant))

def calculate_variants(original, unavailable=None):
    base=input_from_facts(original);m=original["metadata"]
    houses = {'whole_sign':'整宫制（Whole Sign）', 'porphyry':'波菲利制（Porphyry）', 'placidus':'普拉西德制（Placidus）',
              'equal':'等宫制（Equal House）', 'koch':'科赫制（Koch）', 'regiomontanus':'芮氏制（Regiomontanus）', 'alcabitius':'阿卡比特制（Alcabitius）'}
    variants = {}
    for zodiac, ayanamsa in [('tropical', None), ('sidereal', 'fagan_bradley'), ('sidereal', 'lahiri')]:
        for house in houses:
            for bound in ['egyptian', 'ptolemy_lilly']:
                key = '|'.join(['sidereal_lahiri' if ayanamsa == 'lahiri' else zodiac, house, bound])
                try:
                    facts = calculate({**base, 'zodiac':zodiac, 'ayanamsa':ayanamsa,
                                       'house_system':house, 'bound_system':bound})
                except InputError as exc:
                    # A quadrant house system can be undefined at a valid location.
                    # Do not mask unrelated input errors or invent replacement cusps.
                    if not str(exc).startswith(f'house system {house} '):
                        raise
                    if unavailable is not None:
                        unavailable[key] = {
                            'reason': '该宫位制在此纬度与时刻不可计算，请手动选择其他宫位制。',
                            'detail': str(exc),
                        }
                    continue
                assert not validate(facts), key
                flags = calculation_flags(zodiac, ayanamsa)
                outer = []
                for name, body in [('uranus', swe.URANUS), ('neptune', swe.NEPTUNE), ('pluto', swe.PLUTO)]:
                    values, _ = swe.calc_ut(facts['metadata']['julian_day_ut'], body, flags)
                    point = point_payload(name, values[0] % 360, facts['angles'][0]['longitude'], bound)
                    point.update(speed_longitude_per_day=round(values[3], 8), retrograde=values[3] < 0,
                                 motion='retrograde' if values[3] < 0 else 'direct')
                    outer.append(point)
                apply_primary_houses(outer, facts['houses'], house)
                assert all(0 <= p['longitude'] < 360 and 1 <= p['primary_house'] <= 12 for p in outer)
                variants[key] = {'facts':facts, 'title':m['chart_name'], 'outer_planets':outer,
                                 'outer_planets_backend':'pyswisseph_moshier'}
    return variants,houses


def bundle_metadata(original, variants, houses, unavailable):
    settings = original['settings']
    selected = settings['primary_house_system']
    # Three switch slots remain usable even when polar quadrant systems fail.
    available = [house for house in houses if any(key.split('|')[1] == house for key in variants)]
    cycle = list(dict.fromkeys([selected, 'whole_sign', 'porphyry', 'placidus', *available]))
    cycle = [house for house in cycle if house in available][:3]
    return {
        'ayanamsa': settings.get('ayanamsa') or 'fagan_bradley',
        'ayanamsa_label': 'Lahiri（拉希里）' if settings.get('ayanamsa') == 'lahiri' else 'Fagan–Bradley（法根—布拉德利）',
        'ayanamsa_options': {'fagan_bradley': '法根—布拉德利（Fagan–Bradley）', 'lahiri': '拉希里（Lahiri）'},
        'house_options': houses, 'house_cycle': cycle, 'unavailable_variants': unavailable,
    }

def attach_virtual_points(bundle):
    first=next(iter(bundle['variants'].values()));birth=first['facts']['metadata']['julian_day_ut']
    flags=swe.FLG_MOSEPH|swe.FLG_SPEED
    def phase(jd):return (swe.calc_ut(jd,swe.MOON,flags)[0][0]-swe.calc_ut(jd,swe.SUN,flags)[0][0])%360
    top=birth-1e-8;p=phase(top);target=180 if p>=180 else 0
    right=top
    for i in range(1,70):
     left=top-i*.5
     value=(phase(left)-target+180)%360-180
     if value<=0:break
     right=left
    else:raise ValueError('No prenatal syzygy bracket')
    for _ in range(50):
     mid=(left+right)/2
     if (phase(mid)-target+180)%360-180<0:left=mid
     else:right=mid
    syzygy=(left+right)/2
    assert 0<birth-syzygy<16
    assert abs((phase(syzygy)-target+180)%360-180)<1e-6
    event_time=(datetime(2000,1,1,12,tzinfo=timezone.utc)+timedelta(days=syzygy-2451545)).isoformat(timespec='seconds')
    for key,payload in bundle['variants'].items():
     f=payload['facts'];z=f['settings']['zodiac'];ayan=f['settings'].get('ayanamsa');fl=calculation_flags(z,ayan);result={}
     for mode in ['mean','true']:
      points=[]
      for name,body in [('lilith',swe.MEAN_APOG if mode=='mean' else swe.OSCU_APOG),('north_node',swe.MEAN_NODE if mode=='mean' else swe.TRUE_NODE)]:
       values,_=swe.calc_ut(birth,body,fl)
       point=point_payload(name,values[0]%360,f['angles'][0]['longitude'],f['settings']['bound_system'])
       point.update(speed_longitude_per_day=round(values[3],8),retrograde=values[3]<0,virtual_point=True,position_mode=mode)
       points.append(point)
       if name=='north_node':
        south=point_payload('south_node',(values[0]+180)%360,f['angles'][0]['longitude'],f['settings']['bound_system'])
        south.update(speed_longitude_per_day=round(values[3],8),retrograde=values[3]<0,virtual_point=True,position_mode=mode);points.append(south)
      moon=swe.calc_ut(syzygy,swe.MOON,fl)[0][0]%360
      point=point_payload('prenatal_moon',moon,f['angles'][0]['longitude'],f['settings']['bound_system'])
      point.update(virtual_point=True,syzygy_kind='new' if target==0 else 'full',syzygy_utc=event_time,syzygy_jd=syzygy)
      points.append(point);apply_primary_houses(points,f['houses'],f['settings']['primary_house_system']);result[mode]=points
     payload['virtual_points']=result
     payload['virtual_points_backend']='pyswisseph_moshier; prenatal syzygy: lunar longitude at preceding exact conjunction/opposition'

def attach_asteroids(bundle,ephemeris):
    ephemeris = Path(ephemeris).resolve()
    if os.name == 'nt' and not str(ephemeris).isascii():
        # The Windows Swiss Ephemeris C runtime opens UTF-8 paths incorrectly.
        # An isolated worker uses a relative path in its Unicode-aware cwd;
        # the threaded caller never changes its process-wide working directory.
        jobs = {key: {'jd': value['facts']['metadata']['julian_day_ut'],
                      'zodiac': value['facts']['settings']['zodiac'],
                      'ayanamsa': value['facts']['settings'].get('ayanamsa')}
                for key, value in bundle['variants'].items()}
        run = subprocess.run([sys.executable, str(Path(__file__).with_name('asteroid_worker.py'))],
                             input=json.dumps(jobs), capture_output=True, text=True,
                             encoding='utf-8', cwd=ephemeris, timeout=60,
                             creationflags=subprocess.CREATE_NO_WINDOW)
        if run.returncode:
            raise ValueError('小行星星历计算失败：' + run.stderr.strip())
        calculated = json.loads(run.stdout)
    else:
        swe.set_ephe_path(str(ephemeris))
        calculated = None
    for variant, payload in bundle['variants'].items():
     f=payload['facts'];flags=calculation_flags(f['settings']['zodiac'],f['settings'].get('ayanamsa'));points=[]
     for key,body in [('chiron',swe.CHIRON),('ceres',swe.CERES),('pallas',swe.PALLAS),('juno',swe.JUNO),('vesta',swe.VESTA)]:
      values = calculated[variant][key] if calculated is not None else swe.calc_ut(f['metadata']['julian_day_ut'],body,flags)[0]
      pt=point_payload(key,values[0]%360,f['angles'][0]['longitude'],f['settings']['bound_system'])
      pt.update(speed_longitude_per_day=round(values[3],8),retrograde=values[3]<0,asteroid=True)
      points.append(pt)
     apply_primary_houses(points,f['houses'],f['settings']['primary_house_system']);payload['asteroids']=points
     payload['asteroid_backend']='Swiss Ephemeris seas_18.se1, Moshier Earth reference'
