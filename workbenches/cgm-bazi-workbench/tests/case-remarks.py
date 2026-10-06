"""Run: python tests/case-remarks.py skills/<visualization>/scripts/case_remarks.py"""
import importlib.util
import sqlite3
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path

spec = importlib.util.spec_from_file_location('case_remarks', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='case-remarks-test-', dir=Path.cwd()) as directory:
    path = Path(directory) / 'cases.sqlite3'
    with closing(sqlite3.connect(path)) as db:
        db.executescript("CREATE TABLE views(id TEXT,case_id TEXT); INSERT INTO views VALUES('v1','a'),('v2','a'),('v3','b'); CREATE TABLE archive(text TEXT); INSERT INTO archive VALUES('keep');")
    assert module.read_remarks(path, 'v1')['version'] == 0
    first = module.put_remarks(path, 'v1', '来源与背景', 0)
    assert first['version'] == 1
    assert module.read_remarks(path, 'v2')['text'] == '来源与背景'
    assert module.read_remarks(path, 'v3')['text'] == ''
    assert module.put_remarks(path, 'v2', 'another', 0)['conflict']
    assert module.put_remarks(path, 'v1', '来源与背景', 0)['version'] == 1
    with ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda text: module.put_remarks(path, 'v1', text, 1), ['one', 'two']))
    assert sum(bool(result.get('conflict')) for result in results) == 1
    assert module.put_remarks(path, 'v1', '', 2)['version'] == 3
    with closing(sqlite3.connect(path)) as db:
        assert db.execute('SELECT text FROM archive').fetchone()[0] == 'keep'
        assert db.execute('SELECT text FROM case_remarks_history WHERE version=1').fetchone()[0] == '来源与背景'
    try:
        module.put_remarks(path, 'missing', 'test', 0)
    except ValueError:
        pass
    else:
        raise AssertionError('Missing views must fail')
    assert module.read_remarks(path, 'v1')['text'] == ''
print('PASS: case sharing, case isolation, stale writes, concurrent writes, clearing, history and existing archive preserved')
