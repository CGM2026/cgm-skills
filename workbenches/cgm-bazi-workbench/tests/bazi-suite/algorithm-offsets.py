"""Synthetic unit cases for rounding and boundary differences; no case library."""
import importlib.util
import pathlib
import unittest
from datetime import datetime, timedelta, timezone

root=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('bazi_astronomy',root/'skills/cgm-bazi-chart/scripts/astronomy.py')
engine=importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)

class OffsetTests(unittest.TestCase):
    def offset(self,start,end,method='three-days-year-shichen'):
        a=datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
        b=datetime.fromisoformat(end).replace(tzinfo=timezone.utc)
        return engine.luck_offset(method,(b-a).total_seconds(),a,b)
    def test_sub_shichen_is_ignored(self):
        age,e=self.offset('2000-01-01T00:00','2000-01-01T00:59:59')
        self.assertEqual(age,dict(years=0,months=0,days=0,hours=0))
        self.assertEqual(e['shichenInterval']['subShichen'],'ignored')
    def test_crossing_shichen_advances_ten_days(self):
        age,_=self.offset('2000-01-01T00:59:59','2000-01-01T01:00')
        self.assertEqual(age['days'],10)
    def test_late_zi_uses_last_index(self):
        age,e=self.offset('2000-01-01T22:00','2000-01-01T23:59:59')
        self.assertEqual(age['days'],0)
        self.assertEqual(e['shichenInterval']['endIndex'],11)
    def test_midnight_borrow(self):
        age,e=self.offset('2000-01-01T23:30','2000-01-02T00:30')
        self.assertEqual(age['days'],10)
        self.assertEqual(e['shichenInterval']['days'],0)
        self.assertEqual(e['shichenInterval']['shichen'],1)
    def test_whole_days(self):
        age,_=self.offset('2000-01-01T12:00','2000-01-04T12:00')
        self.assertEqual(age,dict(years=1,months=0,days=0,hours=0))
    def test_one_shichen_borrow_between_dates(self):
        age,_=self.offset('2000-01-01T21:30','2000-01-02T19:30')
        self.assertEqual(age,dict(years=0,months=3,days=20,hours=0))
    def test_minute_default_discards_remainder(self):
        age,e=self.offset('2000-01-01T00:00','2000-01-01T00:23:59','three-days-year-minute-day')
        self.assertEqual(age,dict(years=0,months=0,days=1,hours=0))
        self.assertEqual(e['discardedIntervalMinutes'],11)
        self.assertEqual(e['wholeMinutes'],23)
    def test_minute_hour_preserves_remainder(self):
        age,e=self.offset('2000-01-01T00:00','2000-01-01T00:23:59','three-days-year-minute')
        self.assertEqual(age,dict(years=0,months=0,days=1,hours=22))
        self.assertEqual(e['precision'],'hour')
    def test_minute_three_days_one_year(self):
        age,_=self.offset('2000-01-01T00:00','2000-01-04T00:00','three-days-year-minute-day')
        self.assertEqual(age,dict(years=1,months=0,days=0,hours=0))
    def test_unknown_method_rejected(self):
        with self.assertRaises(ValueError):self.offset('2000-01-01T00:00','2000-01-01T01:00','unknown')

if __name__=='__main__':unittest.main()
