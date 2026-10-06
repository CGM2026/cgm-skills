"""Test portable local configuration. Pass the helper paths and optional Node executable."""
import argparse
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--python-helper', type=Path, required=True)
parser.add_argument('--node-helper', type=Path)
parser.add_argument('--node', default='node')
args = parser.parse_args()
spec = importlib.util.spec_from_file_location('locations', args.python_helper)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='location-test-', dir=Path.cwd()) as directory:
    root = Path(directory)
    registry = root / 'locations.json'
    original = os.environ.get('CGM_WORKBENCH_CONFIG')
    os.environ['CGM_WORKBENCH_CONFIG'] = str(registry)
    try:
        assert module.profile() == {}
        assert module.library('bazi', 'fallback') == Path('fallback')
        library = root / 'one-suite'
        library.mkdir()
        (library / 'cases.sqlite3').write_bytes(b'fixture')
        data = {'schema': 'cgm-workbench-locations/1', 'python': sys.executable, 'bazi_library': str(library)}
        registry.write_text(json.dumps(data), encoding='utf-8')
        assert module.library('bazi', 'fallback') == library
        assert module.library('astrology', 'other') == Path('other')
        if args.node_helper:
            result = subprocess.run([args.node, str(args.node_helper.resolve())], cwd=root, env=os.environ,
                                    capture_output=True, text=True, encoding='utf-8', check=True)
            assert json.loads(result.stdout)['resolvedPython'] == sys.executable
            environment = {**os.environ, 'CGM_BAZI_PYTHON': 'explicit-python'}
            result = subprocess.run([args.node, str(args.node_helper.resolve())], cwd=root, env=environment,
                                    capture_output=True, text=True, encoding='utf-8', check=True)
            assert json.loads(result.stdout)['resolvedPython'] == 'explicit-python'
        data['bazi_library'] = str(root / 'missing')
        registry.write_text(json.dumps(data), encoding='utf-8')
        try:
            module.library('bazi', 'fallback')
        except ValueError:
            pass
        else:
            raise AssertionError('Missing registered library must not fall back or create a replacement')
        assert not (root / 'missing').exists()
    finally:
        if original is None:
            os.environ.pop('CGM_WORKBENCH_CONFIG', None)
        else:
            os.environ['CGM_WORKBENCH_CONFIG'] = original
print('PASS: cross-project location, standalone suite, explicit runtime and missing library')
