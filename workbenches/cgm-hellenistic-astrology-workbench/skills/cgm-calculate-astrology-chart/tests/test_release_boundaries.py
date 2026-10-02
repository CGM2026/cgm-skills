"""Release regressions: polar variants, Unicode ephemeris and explicit defaults."""
import copy
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from calculate_chart import calculate, merge_settings, InputError, swe
from calculate_display_snapshots import calculate_variants, bundle_metadata, attach_asteroids
from method_settings import RECOMMENDED, save_settings
from validate_chart_output import validate

BASE = {'chart_name': '公开测试虚构资料', 'location_name': '测试地点',
        'local_datetime': '1990-06-15T12:00:00', 'time_basis': 'fixed_offset',
        'utc_offset': '+08:00', 'latitude': 31.23, 'longitude': 121.47,
        'zodiac': 'tropical', 'ayanamsa': None,
        'house_system': 'whole_sign', 'bound_system': 'egyptian'}


class DisplayBoundaries(unittest.TestCase):
    def test_polar_house_failures_do_not_abort_valid_snapshots(self):
        original = calculate({**BASE, 'latitude': 69.65, 'longitude': 18.96})
        unavailable = {}
        variants, houses = calculate_variants(original, unavailable)
        self.assertEqual(variants['tropical|whole_sign|egyptian']['facts'], original)
        self.assertTrue(unavailable)
        self.assertNotIn('tropical|placidus|egyptian', variants)
        self.assertIn('tropical|placidus|egyptian', unavailable)
        for value in variants.values():
            self.assertEqual(validate(value['facts']), [])
        meta = bundle_metadata(original, variants, houses, unavailable)
        self.assertEqual(meta['house_cycle'][0], 'whole_sign')
        self.assertNotIn('placidus', meta['house_cycle'])
        self.assertEqual(len(meta['house_cycle']), 3)
        with self.assertRaises(InputError):
            calculate({**BASE, 'latitude': 69.65, 'house_system': 'placidus'})

    def test_sidereal_lahiri_is_initial_bundle_method(self):
        original = calculate({**BASE, 'zodiac': 'sidereal', 'ayanamsa': 'lahiri', 'house_system': 'equal'})
        unavailable = {}
        variants, houses = calculate_variants(original, unavailable)
        meta = bundle_metadata(original, variants, houses, unavailable)
        self.assertEqual(meta['ayanamsa'], 'lahiri')
        self.assertEqual(meta['house_cycle'][0], 'equal')
        self.assertEqual(len(variants), 42)

    @unittest.skipUnless(os.name == 'nt', 'Windows C runtime path regression')
    def test_chinese_ephemeris_path_repeats_without_stale_handles(self):
        source = Path(__file__).resolve().parents[2] / 'cgm-hellenistic-chart-visualization/assets/working-page/work/ephemeris/seas_18.se1'
        if not source.is_file():
            self.skipTest('Install the adjacent visualization member for asteroid ephemeris coverage')
        original = calculate(BASE)
        bundle = {'variants': {'natal': {'facts': original}}}
        before = Path.cwd()
        with tempfile.TemporaryDirectory(prefix='星历路径-') as directory:
            ephemeris = Path(directory)
            shutil.copyfile(source, ephemeris / source.name)
            attach_asteroids(bundle, ephemeris)
            self.assertEqual(Path.cwd(), before)
        points = bundle['variants']['natal']['asteroids']
        self.assertEqual(len(points), 5)
        self.assertTrue(all(0 <= point['longitude'] < 360 for point in points))
        # Repeating on a second Unicode location must not reuse stale C file handles.
        another = {'variants': {'natal': {'facts': copy.deepcopy(original)}}}
        with tempfile.TemporaryDirectory(prefix='再次星历-') as directory:
            shutil.copyfile(source, Path(directory) / source.name)
            attach_asteroids(another, directory)
        self.assertEqual(points, another['variants']['natal']['asteroids'])


class PersonalDefaults(unittest.TestCase):
    def test_missing_setup_requires_confirmation(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(InputError, '首次设置'):
                merge_settings(BASE, str(Path(directory) / 'settings.json'))

    def test_conflict_does_not_change_default_or_make_facts(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'settings.json'
            save_settings(path, RECOMMENDED)
            before = path.read_bytes()
            with self.assertRaisesRegex(InputError, '手动切换'):
                merge_settings(BASE, str(path))
            self.assertEqual(path.read_bytes(), before)
            clean = {key: value for key, value in BASE.items() if key not in RECOMMENDED}
            facts = calculate(merge_settings(clean, str(path)))
            self.assertEqual(facts['settings']['zodiac'], 'sidereal')
            self.assertEqual(facts['settings']['ayanamsa'], 'fagan_bradley')
            self.assertEqual(validate(facts), [])

    def test_manual_update_preserves_other_preferences_and_old_facts(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'settings.json'
            save_settings(path, RECOMMENDED, case_storage_enabled=True, case_storage_path='private-cases')
            original = calculate(BASE)
            saved = save_settings(path, {**RECOMMENDED, 'zodiac': 'tropical', 'ayanamsa': None})
            self.assertEqual(saved['case_storage_path'], 'private-cases')
            self.assertTrue(saved['case_storage_enabled'])
            self.assertEqual(calculate(merge_settings(BASE, str(path))), original)


if __name__ == '__main__':
    unittest.main()
