"""Case-wide background notes, independent of view research and archive records."""
import argparse
import hashlib
import json
import sqlite3
import time
from pathlib import Path


def connect(path):
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA synchronous=FULL')
    db.executescript('''
    CREATE TABLE IF NOT EXISTS case_remarks(case_id TEXT PRIMARY KEY,text TEXT NOT NULL,version INTEGER NOT NULL,updated REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS case_remarks_history(id INTEGER PRIMARY KEY,case_id TEXT NOT NULL,text TEXT NOT NULL,version INTEGER NOT NULL,updated REAL NOT NULL);
    ''')
    return db


def snapshot(db, path, view):
    row = db.execute('SELECT case_id FROM views WHERE id=?', (view,)).fetchone()
    if not row:
        raise ValueError('案例工作页不存在')
    case_id = row['case_id']
    note = db.execute('SELECT * FROM case_remarks WHERE case_id=?', (case_id,)).fetchone()
    return dict(caseId=case_id, library=hashlib.sha256(str(Path(path).resolve()).encode()).hexdigest(),
                text=note['text'] if note else '', version=note['version'] if note else 0,
                updated=note['updated'] if note else None)


def read_remarks(path, view):
    db = connect(path)
    try:
        return snapshot(db, path, view)
    finally:
        db.close()


def put_remarks(path, view, text, version):
    if not isinstance(text, str) or len(text) > 100000 or len(text.encode('utf-8')) > 400000:
        raise ValueError('案例备注请保持在10万字以内')
    if type(version) is not int or version < 0:
        raise ValueError('案例备注版本无效')
    db = connect(path)
    try:
        db.execute('BEGIN IMMEDIATE')
        current = snapshot(db, path, view)
        if current['text'] == text:
            db.commit()
            return current
        if current['version'] != version:
            db.rollback()
            return dict(conflict=True, current=current, error='案例备注已被另一页面或 Agent 修改；请核对两份内容。')
        if current['version']:
            db.execute('INSERT INTO case_remarks_history(case_id,text,version,updated) VALUES(?,?,?,?)',
                       (current['caseId'], current['text'], current['version'], current['updated']))
        db.execute('INSERT INTO case_remarks VALUES(?,?,?,?) ON CONFLICT(case_id) DO UPDATE SET text=excluded.text,version=excluded.version,updated=excluded.updated',
                   (current['caseId'], text, current['version'] + 1, time.time()))
        result = snapshot(db, path, view)
        db.commit()
        return result
    finally:
        db.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--library', type=Path, required=True)
    parser.add_argument('--view', required=True)
    parser.add_argument('--text-file', type=Path)
    parser.add_argument('--version', type=int)
    args = parser.parse_args()
    path = args.library / 'cases.sqlite3'
    if not path.is_file():
        parser.error('案例库不存在')
    if args.text_file:
        if args.version is None:
            parser.error('写入需要 --version')
        result = put_remarks(path, args.view, args.text_file.read_text(encoding='utf-8-sig'), args.version)
    else:
        result = read_remarks(path, args.view)
    print(json.dumps(result, ensure_ascii=False))
