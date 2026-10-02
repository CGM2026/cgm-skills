"""Regression coverage for explicit instants, metadata consistency and stored edges."""
import copy
import math
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from calculate_chart import (InputError, calculate, calculate_primary_houses, julian_day,
                             point_payload, resolve_local_datetime, swe)
from calculate_display_snapshots import input_from_facts, input_at_instant, calculate_at_instant
from validate_chart_output import validate

BASE = {'chart_name':'时间边界测试', 'location_name':'纽约', 'local_datetime':'2000-01-01T12:00:00',
        'time_basis':'fixed_offset', 'utc_offset':'+00:00', 'latitude':40.71, 'longitude':-74.0,
        'zodiac':'tropical', 'ayanamsa':None, 'house_system':'whole_sign', 'bound_system':'egyptian'}


class TimeInputTests(unittest.TestCase):
    def test_date_and_hour_without_minutes_are_rejected(self):
        for raw in ('2000-01-01', '2000-01-01T12', '2000-01-01T12Z'):
            with self.subTest(raw=raw), self.assertRaises(InputError):
                calculate({**BASE, 'local_datetime':raw})

    def test_nonexistent_iana_times_are_rejected(self):
        for zone, raw in [('America/New_York','2024-03-10T02:30:00'),
                          ('Australia/Lord_Howe','2024-10-06T02:15:00'),
                          ('Pacific/Apia','2011-12-30T12:00:00')]:
            with self.subTest(zone=zone), self.assertRaisesRegex(InputError,'does not exist'):
                calculate({**BASE, 'time_basis':'iana', 'timezone':zone, 'local_datetime':raw})

    def test_ambiguous_iana_times_are_rejected(self):
        for zone, raw in [('America/New_York','2024-11-03T01:30:00'),
                          ('Australia/Lord_Howe','2024-04-07T01:45:00')]:
            with self.subTest(zone=zone), self.assertRaisesRegex(InputError,'occurs twice'):
                calculate({**BASE, 'time_basis':'iana', 'timezone':zone, 'local_datetime':raw})

    def test_normal_iana_minutes_surrounding_clock_jump(self):
        before=calculate({**BASE,'time_basis':'iana','timezone':'America/New_York','local_datetime':'2024-03-10T01:59:00'})
        after=calculate({**BASE,'time_basis':'iana','timezone':'America/New_York','local_datetime':'2024-03-10T03:01:00'})
        a,b=(datetime.fromisoformat(f['metadata']['utc_datetime']) for f in (before,after))
        self.assertEqual(b-a,timedelta(minutes=2))
        self.assertEqual(validate(before),[])
        self.assertEqual(validate(after),[])

    def test_explicit_offsets_select_both_repeated_hours(self):
        facts=[]
        for offset, expected in [('-04:00','2024-11-03T05:30:00+00:00'),
                                 ('-05:00','2024-11-03T06:30:00+00:00')]:
            f=calculate({**BASE,'time_basis':'iana','timezone':'America/New_York',
                         'local_datetime':'2024-11-03T01:30:00'+offset})
            self.assertEqual(f['metadata']['utc_datetime'],expected)
            self.assertEqual(f['metadata']['time_basis'],'iana')
            self.assertEqual(f['metadata']['time_reference'],'America/New_York')
            self.assertEqual(validate(f),[])
            facts.append(f)
        self.assertNotEqual(facts[0]['metadata']['julian_day_ut'],facts[1]['metadata']['julian_day_ut'])

    def test_explicit_offset_overrides_conflicting_fixed_reference(self):
        f=calculate({**BASE,'utc_offset':'+08:00','local_datetime':'2000-01-01T12:00:00+09:00'})
        self.assertEqual(f['metadata']['utc_datetime'],'2000-01-01T03:00:00+00:00')
        self.assertEqual(f['metadata']['time_basis'],'embedded_offset')
        self.assertEqual(validate(f),[])

    def test_explicit_utc_retains_iana_reference_for_local_labels(self):
        f=calculate({**BASE,'time_basis':'iana','timezone':'America/New_York',
                     'local_datetime':'2024-11-03T06:30:00+00:00'})
        self.assertEqual(f['metadata']['local_datetime'],'2024-11-03T01:30:00-05:00')
        self.assertEqual(f['metadata']['utc_datetime'],'2024-11-03T06:30:00+00:00')
        self.assertEqual(f['metadata']['time_reference'],'America/New_York')

    def test_boolean_coordinates_are_rejected(self):
        for field in ('latitude','longitude'):
            for value in (True,False):
                with self.subTest(field=field,value=value),self.assertRaises(InputError):
                    calculate({**BASE,field:value})

    def test_valid_minute_and_microsecond_inputs_are_accepted(self):
        for raw in ('2000-01-01T12:00','2000-01-01 12:00:00','2000-01-01T12:00:00.123456Z',
                    '20000101T120000','2000-W01-6T12:00:00'):
            with self.subTest(raw=raw):
                self.assertEqual(validate(calculate({**BASE,'local_datetime':raw})),[])

    def test_fixed_offset_components_must_be_unsigned_digits(self):
        for offset in ('+-1:30','++1:30','+01:-1'):
            with self.subTest(offset=offset),self.assertRaises(InputError):
                calculate({**BASE,'utc_offset':offset})

    def test_utc_conversion_outside_datetime_range_is_rejected(self):
        with self.assertRaises(InputError):
            calculate({**BASE,'local_datetime':'0001-01-01T00:00:00+18:00'})


class ExplicitInstantInterfaceTests(unittest.TestCase):
    def test_roundtrip_from_facts_preserves_late_fold(self):
        f=calculate({**BASE,'time_basis':'iana','timezone':'America/New_York','local_datetime':'2024-11-03T01:30:00-05:00'})
        payload=input_from_facts(f)
        self.assertTrue(payload['local_datetime'].endswith('-05:00'))
        again=calculate(payload)
        self.assertEqual(again['metadata'],f['metadata'])
        self.assertEqual(again['planets'],f['planets'])

    def test_known_instant_does_not_lose_dst_fold(self):
        f=calculate({**BASE,'time_basis':'iana','timezone':'America/New_York','local_datetime':'2000-01-01T12:00:00'})
        at=datetime(2024,11,3,6,30,0,123456,tzinfo=timezone.utc)
        payload=input_at_instant(f,at)
        self.assertEqual(payload['local_datetime'],'2024-11-03T01:30:00.123456-05:00')
        actual=calculate_at_instant(f,at)
        self.assertEqual(datetime.fromisoformat(actual['metadata']['utc_datetime']),at)
        self.assertEqual(actual['metadata']['time_reference'],'America/New_York')
        self.assertEqual(validate(actual),[])

    def test_naive_known_instant_is_rejected(self):
        f=calculate(BASE)
        for helper in (input_at_instant,calculate_at_instant):
            with self.subTest(helper=helper.__name__),self.assertRaisesRegex(ValueError,'时区'):
                helper(f,datetime(2024,11,3,6,30))

    def test_fixed_and_lmt_references_survive_roundtrip(self):
        for changes in ({'utc_offset':'+08:00'}, {'time_basis':'lmt','longitude':119.52}):
            f=calculate({**BASE,**changes})
            again=calculate(input_from_facts(f))
            self.assertEqual(again['metadata'],f['metadata'])
            at=datetime(2024,11,3,6,30,tzinfo=timezone.utc)
            event=calculate_at_instant(f,at)
            self.assertEqual(event['metadata']['time_basis'],f['metadata']['time_basis'])
            self.assertEqual(event['metadata']['time_reference'],f['metadata']['time_reference'])
            self.assertEqual(datetime.fromisoformat(event['metadata']['utc_datetime']),at)

    def test_stale_facts_cannot_be_reconstructed(self):
        f=calculate(BASE);f['metadata']['utc_datetime']='2099-01-01T12:00:00+00:00'
        with self.assertRaises(ValueError):input_from_facts(f)


class MetadataConsistencyTests(unittest.TestCase):
    def setUp(self):self.facts=calculate(BASE)

    def has_error(self,facts,fragment):
        self.assertTrue(any(fragment in error for error in validate(facts)),validate(facts))

    def test_utc_local_mismatch_is_rejected(self):
        f=copy.deepcopy(self.facts);f['metadata']['utc_datetime']='2000-01-01T13:00:00+00:00'
        self.has_error(f,'same instant')

    def test_consistent_changed_datetimes_with_old_jd_are_rejected(self):
        f=copy.deepcopy(self.facts)
        for field in ('local_datetime','utc_datetime'):f['metadata'][field]='2000-01-01T13:00:00+00:00'
        self.has_error(f,'julian_day_ut does not match')

    def test_bad_julian_day_is_rejected(self):
        for value in (2451546.0,math.nan,math.inf,-math.inf,True):
            f=copy.deepcopy(self.facts);f['metadata']['julian_day_ut']=value
            with self.subTest(value=value):self.assertNotEqual(validate(f),[])

    def test_naive_missing_clock_and_invalid_datetimes_are_rejected(self):
        for field in ('local_datetime','utc_datetime'):
            for value in ('2000-01-01','2000-01-01T12:00:00','not-a-date',123,None):
                f=copy.deepcopy(self.facts);f['metadata'][field]=value
                with self.subTest(field=field,value=value):self.assertNotEqual(validate(f),[])

    def test_utc_field_requires_utc_not_a_local_offset(self):
        f=copy.deepcopy(self.facts);f['metadata']['utc_datetime']='2000-01-01T20:00:00+08:00'
        self.has_error(f,'must be expressed in UTC')

    def test_iana_reference_must_agree_with_saved_clock(self):
        f=copy.deepcopy(self.facts);f['metadata'].update(time_basis='iana',time_reference='America/New_York')
        self.has_error(f,'IANA time_reference')
        f['metadata']['time_reference']='Made/Up'
        self.has_error(f,'invalid IANA')

    def test_fixed_reference_must_agree_with_saved_offset(self):
        f=copy.deepcopy(self.facts);f['metadata']['time_reference']='+08:00'
        self.has_error(f,'fixed time_reference')

    def test_microseconds_and_millisecond_jd_storage_tolerance(self):
        f=calculate({**BASE,'local_datetime':'2026-09-30T15:25:26.123456+08:00'})
        self.assertEqual(validate(f),[])
        f['metadata']['julian_day_ut']+=5e-9
        self.assertEqual(validate(f),[])
        f['metadata']['julian_day_ut']+=1e-6
        self.has_error(f,'julian_day_ut does not match')

    def test_extreme_invalid_offsets_return_errors_without_crashing(self):
        f=copy.deepcopy(self.facts)
        f['metadata'].update(local_datetime='0001-01-01T00:00:00+18:00',
                             utc_datetime='0001-01-01T00:00:00+00:00',time_basis='iana',time_reference='America/New_York')
        self.assertNotEqual(validate(f),[])


class StoredBoundaryTests(unittest.TestCase):
    def test_all_sign_edges_are_normalized_after_rounding(self):
        for sign in range(13):
            for delta in (-1e-8,0,1e-8,-.000001,.000001):
                value=30*sign+delta
                p=point_payload('edge',value,359.99999999,'egyptian')
                with self.subTest(value=value):
                    self.assertTrue(0<=p['longitude']<360)
                    self.assertTrue(0<=p['degree_in_sign']<30)
                    self.assertEqual(p['sign_index'],int(p['longitude']//30))
                    self.assertAlmostEqual(p['degree_in_sign'],p['longitude']%30,places=6)
                    self.assertEqual(p['whole_sign_house'],int(p['longitude']//30)+1)

    def test_rounded_bound_edge_uses_the_stored_degree(self):
        p=point_payload('edge',5.99999999,0,'egyptian')
        self.assertEqual(p['longitude'],6.0)
        self.assertEqual(p['bound_ruler'],'venus')

    def test_primary_cusps_wrap_without_360_or_30(self):
        raw=tuple((359.99999999+30*i)%360 for i in range(12))
        with patch('calculate_chart.swe.houses_ex',return_value=(raw,())):
            houses=calculate_primary_houses(2451545,40,-74,0,0,'placidus')
        self.assertEqual(houses[0]['cusp_longitude'],0.0)
        for h in houses:
            self.assertTrue(0<=h['cusp_longitude']<360)
            self.assertTrue(0<=h['degree_in_sign']<30)
            self.assertEqual(h['sign_index'],int(h['cusp_longitude']//30))

    def test_full_facts_remain_valid_at_solar_ingress_microseconds(self):
        a=datetime(2024,3,20,2,tzinfo=timezone.utc);b=a+timedelta(hours=2)
        for _ in range(35):
            mid=a+(b-a)/2
            lon=swe.calc_ut(julian_day(mid),swe.SUN,swe.FLG_MOSEPH|swe.FLG_SPEED)[0][0]
            if lon>180:a=mid
            else:b=mid
        root=a+(b-a)/2
        for microseconds in (-50000,-10000,-1000,-100,-1,0,1,100,1000,10000,50000):
            at=root+timedelta(microseconds=microseconds)
            f=calculate({**BASE,'local_datetime':at.isoformat(timespec='microseconds')})
            with self.subTest(offset=microseconds):self.assertEqual(validate(f),[])


if __name__=='__main__':unittest.main()
