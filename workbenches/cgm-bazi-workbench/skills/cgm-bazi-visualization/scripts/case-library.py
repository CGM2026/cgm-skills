"""Bazi local case library. Standard-library SQLite; calculator facts stay immutable."""
import argparse
import copy
import gzip
import hashlib
import html
import json
import mimetypes
import os
import re
import secrets
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

HERE = Path(__file__).resolve().parent
LABELS = {'year': '岁运盘', 'month': '流月盘', 'day': '流日盘'}
MAX_TEXT = 100000

def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))

class Conflict(ValueError):
    def __init__(self, current, **details):
        super().__init__('这条记录已被另一处修改；草稿保留，请核对版本')
        self.current = current
        self.details = details

class ResearchCorrupt(ValueError):
    def __init__(self, diagnostics):
        super().__init__('研究记录需要核对；原文保留，请将诊断信息交给 Agent 排查')
        self.diagnostics = diagnostics

def state_sha(state):
    return hashlib.sha256(json.dumps(state,ensure_ascii=False,sort_keys=True,separators=(',', ':')).encode('utf-8')).hexdigest()

_MISSING = object()
def merge_research(base, page, library):
    """Three-way merge stable records and fields; deletion/edit is explicit."""
    def pack(value):
        v=copy.deepcopy(value)
        def pairs(owner,live,key):
            if isinstance(owner.get(live),list) and isinstance(owner.get('deleted'),list):
                owner[key]=[dict(id=r['id'],removed=False,record=r) for r in owner.pop(live)]+[dict(id=r['id'],removed=True,record=r) for r in owner.pop('deleted')]
        for l in v.get('layers',[]):pairs(l,'notes','_noteRecords')
        for key in ('archive','archiveLegacy'):
            a=v.get(key)
            if isinstance(a,dict):pairs(a,'records' if a.get('version')==2 else 'tabs','_archiveRecords')
        return v
    def unpack(value):
        v=copy.deepcopy(value)
        def pairs(owner,key,live):
            if key in owner:
                records=owner.pop(key);owner[live]=[r['record'] for r in records if not r['removed']];owner['deleted']=[r['record'] for r in records if r['removed']]
        for l in v.get('layers',[]):pairs(l,'_noteRecords','notes')
        for key in ('archive','archiveLegacy'):
            a=v.get(key)
            if isinstance(a,dict):pairs(a,'_archiveRecords','records' if a.get('version')==2 else 'tabs')
        return v
    b,p,s=map(pack,(base,page,library));conflicts=[]
    def same(a,z):return a is z or a is not _MISSING and z is not _MISSING and a==z
    def clone(v):return v if v is _MISSING else copy.deepcopy(v)
    def merge(a,x,y,path,choice,collect):
        if same(x,y):return clone(x)
        if same(x,a):return clone(y)
        if same(y,a):return clone(x)
        if a is _MISSING and isinstance(x,dict) and isinstance(y,dict):a={}
        if a is _MISSING and isinstance(x,list) and isinstance(y,list) and all(isinstance(r,dict) and isinstance(r.get('id'),str) for r in x+y):a=[]
        deletion=(x is _MISSING or y is _MISSING)
        if isinstance(a,dict) and 'removed' in a and isinstance(x,dict) and isinstance(y,dict):
            deletion=(x['removed']!=a['removed'] and y['record']!=a['record'] or y['removed']!=a['removed'] and x['record']!=a['record'])
        if not deletion and all(isinstance(v,dict) for v in (a,x,y)):
            result={}
            for k in dict.fromkeys([*a,*y,*x]):
                z=merge(a.get(k,_MISSING),x.get(k,_MISSING),y.get(k,_MISSING),path+'/'+k,choice,collect)
                if z is not _MISSING:result[k]=z
            return result
        if not deletion and all(isinstance(v,list) for v in (a,x,y)) and all(isinstance(r,dict) and isinstance(r.get('id'),str) for seq in (a,x,y) for r in seq):
            maps=[{r['id']:r for r in seq} for seq in (a,x,y)];result=[]
            for k in dict.fromkeys([*(r['id'] for r in y),*(r['id'] for r in x),*(r['id'] for r in a)]):
                z=merge(*(d.get(k,_MISSING) for d in maps),path+'['+k+']',choice,collect)
                if z is not _MISSING:result.append(z)
            return result
        if collect:conflicts.append(dict(path=path,kind='delete-edit' if deletion else 'field',base=None if a is _MISSING else clone(a),page=None if x is _MISSING else clone(x),library=None if y is _MISSING else clone(y)))
        return clone(x if choice=='page' else y)
    page_result=unpack(merge(b,p,s,'', 'page',True));library_result=unpack(merge(b,p,s,'','library',False))
    return page_result,library_result,conflicts

class Library:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / 'assets').mkdir(exist_ok=True)
        self.node = os.environ.get('CGM_BAZI_NODE') or shutil.which('node')
        self.trials = {}
        self.trial_lock = threading.Lock()
        self.research_checks = {}
        if not self.node:
            raise ValueError('缺少已有 Node；用 CGM_BAZI_NODE 指定，不自动安装')
        with self.connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            INSERT OR IGNORE INTO metadata VALUES('schema','cgm-bazi-library/1');
            CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY,identity TEXT UNIQUE NOT NULL,name TEXT NOT NULL,chart BLOB NOT NULL,chart_sha TEXT NOT NULL,created REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS views(id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES cases(id),mode TEXT NOT NULL,UNIQUE(case_id,mode));
            CREATE TABLE IF NOT EXISTS entries(view_id TEXT NOT NULL REFERENCES views(id),object_id TEXT NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,version INTEGER NOT NULL,updated REAL NOT NULL,PRIMARY KEY(view_id,object_id,kind));
            CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY,view_id TEXT NOT NULL,object_id TEXT NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,version INTEGER NOT NULL,updated REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS research(view_id TEXT PRIMARY KEY REFERENCES views(id),text TEXT NOT NULL,version INTEGER NOT NULL,updated REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS research_history(id INTEGER PRIMARY KEY,view_id TEXT NOT NULL,text TEXT NOT NULL,version INTEGER NOT NULL,updated REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS research_conflicts(id TEXT PRIMARY KEY,view_id TEXT NOT NULL,base_version INTEGER NOT NULL,page_sha TEXT NOT NULL,page_text TEXT NOT NULL,server_version INTEGER NOT NULL,server_text TEXT NOT NULL,solutions TEXT NOT NULL,conflicts TEXT NOT NULL,created REAL NOT NULL,resolved INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS research_submissions(view_id TEXT NOT NULL,page_sha TEXT NOT NULL,base_version INTEGER NOT NULL,result_version INTEGER NOT NULL,created REAL NOT NULL,PRIMARY KEY(view_id,page_sha,result_version));
            ''')
            if db.execute("SELECT value FROM metadata WHERE key='schema'").fetchone()[0] != 'cgm-bazi-library/1':
                raise ValueError('案例库版本不兼容，不能自动覆盖')

    def connect(self):
        db = sqlite3.connect(self.root / 'cases.sqlite3', timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA journal_mode=WAL')
        return db

    def bridge(self, action, chart, **args):
        result = subprocess.run([self.node, str(HERE / 'library-bridge.cjs')], input=encode(dict(action=action, chart=chart, **args)),
                                text=True, encoding='utf-8', capture_output=True, timeout=60)
        if result.returncode:
            raise ValueError(result.stderr.strip() or '排盘成员调用失败')
        return json.loads(result.stdout)

    def preferences(self, payload=None):
        settings = Path(os.environ.get('CGM_BAZI_SETTINGS') or self.root.parent / '.cgm-bazi' / 'settings.json').resolve()
        script = HERE.parent.parent / 'cgm-bazi-chart' / 'scripts' / 'preferences.cjs'
        code = "const fs=require('node:fs'),p=require(process.argv[1]),a=JSON.parse(fs.readFileSync(0,'utf8'));try{console.log(JSON.stringify(a.payload?p.savePreferences(a.path,a.payload):p.readPreferences(a.path)))}catch(e){console.error(e.message);process.exitCode=1}"
        result = subprocess.run([self.node, '-e', code, str(script)],input=encode(dict(path=str(settings),payload=payload)),text=True,encoding='utf-8',capture_output=True,timeout=10)
        if result.returncode:
            raise ValueError(result.stderr.strip() or '默认设置暂时不可用')
        return json.loads(result.stdout)

    def create(self, chart):
        info = self.bridge('validate', chart)
        if chart['calculation']['status'] == 'historical-fixture' or not chart.get('calendarView'):
            raise ValueError('案例库只接收带完整历法的计算命盘；历史夹具保留原页')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT id,chart_sha FROM cases WHERE identity=?', (info['identity'],)).fetchone()
            if old:
                # Same birth facts do not produce duplicated cases or replace old evidence.
                case_id = old['id']
                reused = True
            else:
                case_id = secrets.token_hex(8)
                db.execute('INSERT INTO cases VALUES(?,?,?,?,?,?)', (case_id, info['identity'], info['name'], gzip.compress(encode(chart).encode('utf-8')), info['chartSha256'], time.time()))
                for mode in LABELS:
                    db.execute('INSERT INTO views VALUES(?,?,?)', (secrets.token_hex(10), case_id, mode))
                reused = False
            views = [dict(r) for r in db.execute('SELECT * FROM views WHERE case_id=? ORDER BY mode', (case_id,))]
        return dict(caseId=case_id, reused=reused, views=views, existingFactsRetained=bool(old and old['chart_sha'] != info['chartSha256']))

    def list(self):
        with self.connect() as db:
            return [dict(r) for r in db.execute('SELECT v.*,c.name,c.created FROM views v JOIN cases c ON v.case_id=c.id ORDER BY c.created DESC,v.mode')]

    def trial(self, view_id, options):
        info = self.view(view_id)
        result = self.bridge('recalculate', info['chart'], options=options)
        key = secrets.token_hex(24)
        with self.trial_lock:
            self.trials = {k:v for k,v in self.trials.items() if v['expires'] > time.time()}
            if len(self.trials) >= 50:
                raise ValueError('试算过多，请稍后再试')
            self.trials[key] = dict(view=view_id, chart=result['chart'], expires=time.time()+600)
        return dict(trial=key, before=result['before'], after=result['after'])

    def save_trial(self, view_id, key):
        with self.trial_lock:
            item = self.trials.get(key)
            if not item or item['view'] != view_id or item['expires'] <= time.time():
                raise ValueError('试算已失效，请重新试算')
            result = self.create(item['chart'])
        mode = self.view(view_id)['mode']
        result['url'] = '/view/'+next(v['id'] for v in result['views'] if v['mode']==mode)
        return result

    def view(self, view_id):
        with self.connect() as db:
            row = db.execute('SELECT v.*,c.chart,c.chart_sha,c.name FROM views v JOIN cases c ON v.case_id=c.id WHERE v.id=?', (view_id,)).fetchone()
        if not row:
            raise ValueError('案例盘式不存在，请先 list 获取ID')
        info = dict(row)
        info['chart'] = json.loads(gzip.decompress(info['chart']))
        return info

    def notes(self, view_id):
        self.view(view_id)
        with self.connect() as db:
            return [dict(r) for r in db.execute('SELECT * FROM entries WHERE view_id=? ORDER BY object_id,kind', (view_id,))]

    def put(self, view_id, object_id, text, version, kind='note'):
        info = self.view(view_id)
        if object_id=='natal:3' and info['chart']['natal'][3].get('status')=='unknown':raise ValueError('未知时柱不能作为笔记对象')
        if kind not in ('note', 'record') or (kind == 'record' and object_id != 'case'):
            raise ValueError('档案仅写case对象；其余写对象笔记')
        if not isinstance(text, str) or len(text) > MAX_TEXT or isinstance(version, bool) or not isinstance(version, int) or version < 0:
            raise ValueError('文字或版本无效；每条最多100000字')
        if not self.bridge('valid-object', info['chart'], mode=info['mode'], object=object_id)['valid']:
            raise ValueError('对象不属于当前命盘与盘式')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT * FROM entries WHERE view_id=? AND object_id=? AND kind=?', (view_id, object_id, kind)).fetchone()
            previous = old['version'] if old else 0
            if previous != version:
                raise Conflict(dict(old) if old else dict(text='', version=0))
            if old:
                db.execute('INSERT INTO history(view_id,object_id,kind,text,version,updated) VALUES(?,?,?,?,?,?)', (view_id, object_id, kind, old['text'], old['version'], old['updated']))
            now = time.time()
            db.execute('INSERT INTO entries VALUES(?,?,?,?,?,?) ON CONFLICT(view_id,object_id,kind) DO UPDATE SET text=excluded.text,version=excluded.version,updated=excluded.updated', (view_id, object_id, kind, text, previous+1, now))
        return dict(view_id=view_id, object_id=object_id, kind=kind, text=text, version=previous+1, updated=now)

    def history(self, view_id):
        self.view(view_id)
        with self.connect() as db:
            return [dict(r) for r in db.execute('SELECT * FROM history WHERE view_id=? ORDER BY id DESC', (view_id,))]

    def research(self, view_id):
        info=self.view(view_id)
        with self.connect() as db:
            row = db.execute('SELECT * FROM research WHERE view_id=?', (view_id,)).fetchone()
            result=dict(row) if row else dict(view_id=view_id,text='{"schema":"bazi-research/1","layers":[]}',version=0)
            checked=self.inspect_research(info,result,db)
        return dict(result,**checked)

    def inspect_research(self,info,row,db):
        raw_sha=hashlib.sha256(row['text'].encode('utf-8',errors='surrogatepass')).hexdigest()
        key=(info['id'],info['chart_sha'],row['version'],raw_sha)
        if key in self.research_checks:return copy.deepcopy(self.research_checks[key])
        try:
            state=json.loads(row['text'])
            result=self.bridge('research-validate',info['chart'],mode=info['mode'],state=state,previous=state)
            checked=dict(warnings=result['warnings']) if result.get('warnings') else {}
        except Exception as error:
            history_id=None
            for h in db.execute('SELECT * FROM research_history WHERE view_id=? ORDER BY id DESC',(info['id'],)):
                try:
                    candidate=json.loads(h['text']);self.bridge('research-validate',info['chart'],mode=info['mode'],state=candidate,previous=candidate)
                    history_id=h['id'];break
                except Exception:continue
            command=f'"{sys.executable}" "{HERE / "case-library.py"}" --library "{self.root}" research-diagnose --view {info["id"]}'
            restore=f'"{sys.executable}" "{HERE / "case-library.py"}" --library "{self.root}" research-restore --view {info["id"]} --history-id {history_id} --version {row["version"]}' if history_id is not None else None
            checked=dict(diagnostics=dict(reason=str(error),library=str(self.root),view=info['id'],version=row['version'],rawSha256=raw_sha,recentValidHistoryId=history_id,agentCommand=command,restoreCommand=restore))
        # Bound the validation cache. Cached results never contain raw note text.
        if len(self.research_checks)>256:self.research_checks.clear()
        self.research_checks[key]=checked
        return copy.deepcopy(checked)

    def diagnose_research(self,view_id):
        row=self.research(view_id)
        return dict(view=view_id,library=str(self.root),version=row['version'],valid='diagnostics' not in row,**{k:row[k] for k in ('diagnostics','warnings') if k in row})

    def restore_research(self,view_id,history_id,version):
        info=self.view(view_id)
        if isinstance(version,bool) or not isinstance(version,int) or version<0:raise ValueError('研究版本无效')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            old=db.execute('SELECT * FROM research WHERE view_id=?',(view_id,)).fetchone()
            if not old or old['version']!=version:raise Conflict(dict(old) if old else dict(text='{"schema":"bazi-research/1","layers":[]}',version=0))
            target=db.execute('SELECT * FROM research_history WHERE id=? AND view_id=?',(history_id,view_id)).fetchone()
            if not target:raise ValueError('该研究历史不属于当前盘式')
            recovered=json.loads(target['text'])
            checked=self.bridge('research-validate',info['chart'],mode=info['mode'],state=recovered,previous=recovered)
            if len(target['text'].encode('utf-8'))>900000:raise ValueError('历史记录超出整盘大小上限，请先诊断')
            # Preserve even malformed raw text before the explicit Agent repair.
            db.execute('INSERT INTO research_history(view_id,text,version,updated) VALUES(?,?,?,?)',(view_id,old['text'],old['version'],old['updated']))
            now=time.time();db.execute('UPDATE research SET text=?,version=?,updated=? WHERE view_id=?',(target['text'],version+1,now,view_id))
        return dict(view_id=view_id,text=target['text'],version=version+1,updated=now,restoredHistoryId=history_id,warnings=checked.get('warnings',[]))

    def import_research(self, view_id, incoming, version):
        current = self.research(view_id)
        if current['version'] != version:
            raise Conflict(current)
        if not isinstance(incoming, dict) or incoming.get('schema') != 'bazi-research/1' or not isinstance(incoming.get('layers'), list):
            raise ValueError('导入研究结构无效')
        if 'diagnostics' in current:raise ResearchCorrupt(current['diagnostics'])
        # Validate the incoming batch before dictionaries can fold duplicate IDs.
        layer_ids=set();note_ids=set()
        for layer in incoming['layers']:
            if not isinstance(layer,dict) or not isinstance(layer.get('id'),str) or layer['id'] in layer_ids:raise ValueError('导入图层身份重复或无效')
            layer_ids.add(layer['id'])
            if not isinstance(layer.get('notes'),list) or not isinstance(layer.get('deleted',[]),list):raise ValueError('导入笔记结构无效')
            for n in layer['notes']+layer.get('deleted',[]):
                if not isinstance(n,dict) or not isinstance(n.get('id'),str) or not n['id'] or n['id'] in note_ids:raise ValueError('导入笔记身份重复或无效，整个批次未保存')
                note_ids.add(n['id'])
        info=self.view(view_id);self.bridge('research-validate',info['chart'],mode=info['mode'],state=incoming,previous=json.loads(current['text']))
        merged = json.loads(current['text'])
        for layer in incoming['layers']:
            existing = next((l for l in merged['layers'] if l['id'] == layer.get('id')), None)
            if existing is None:
                merged['layers'].append(layer)
                continue
            # Imports never implicitly delete notes omitted by the incoming file.
            notes = {n['id']: n for n in existing['notes']}
            notes.update({n['id']: n for n in layer.get('notes', [])})
            old_deleted = existing.get('deleted', [])
            existing.update(layer)
            existing['notes'] = list(notes.values())
            existing['deleted'] = old_deleted
        return self.put_research(view_id, merged, version,base_state=json.loads(current['text']),base_version=version)

    def put_research(self, view_id, state, version, base_state=None, base_version=None, conflict_id=None, resolution=None):
        info = self.view(view_id)
        if isinstance(version, bool) or not isinstance(version, int) or version < 0:
            raise ValueError('研究版本无效')
        if base_version is not None and (isinstance(base_version,bool) or not isinstance(base_version,int) or base_version<0):raise ValueError('研究基线版本无效')
        if resolution not in (None,'page','library') or bool(resolution)!=bool(conflict_id):raise ValueError('冲突选择无效，请重新核对两个版本')
        page_sha=state_sha(state);submitted=copy.deepcopy(state);pending_conflict=None
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT * FROM research WHERE view_id=?', (view_id,)).fetchone()
            current=dict(old) if old else dict(view_id=view_id,text='{"schema":"bazi-research/1","layers":[]}',version=0)
            inspected=self.inspect_research(info,current,db)
            if 'diagnostics' in inspected:raise ResearchCorrupt(inspected['diagnostics'])
            latest=json.loads(current['text']);effective_base=base_version if base_version is not None else version
            previous_conflict=None
            if resolution:
                previous_conflict=db.execute('SELECT * FROM research_conflicts WHERE id=? AND view_id=?',(conflict_id,view_id)).fetchone()
                if not previous_conflict or previous_conflict['page_sha']!=page_sha:raise ValueError('冲突草稿与待核对记录不一致，请重新读取')
                state=json.loads(previous_conflict['solutions'])[resolution]
                effective_base=previous_conflict['server_version'];base_state=None
            elif base_version is None and base_state is None and version==current['version']:
                # Detect a known old payload even when a caller merely changes the
                # version after rejection. Bare retries must not become overwrites.
                known=db.execute('SELECT base_version FROM research_conflicts WHERE view_id=? AND page_sha=? ORDER BY created DESC LIMIT 1',(view_id,page_sha)).fetchone()
                if not known:known=db.execute('SELECT base_version FROM research_submissions WHERE view_id=? AND page_sha=? ORDER BY created DESC LIMIT 1',(view_id,page_sha)).fetchone()
                if known and known['base_version']<current['version']:effective_base=known['base_version']
            if effective_base==current['version']:baseline=latest
            elif effective_base==0:baseline=dict(schema='bazi-research/1',layers=[])
            else:
                baseline_row=db.execute('SELECT text FROM research_history WHERE view_id=? AND version=? ORDER BY id DESC LIMIT 1',(view_id,effective_base)).fetchone()
                if not baseline_row:raise ValueError('找不到研究基线版本，请先重新读取当前记录再合并')
                try:baseline=json.loads(baseline_row['text'])
                except Exception:raise ValueError('研究基线原文损坏，请使用诊断信息核对历史')
            if base_state is not None and state_sha(base_state)!=state_sha(baseline):raise ValueError('baseState与案例库基线版本不一致，请重新读取后再合并')
            incoming_checked=self.bridge('research-validate',info['chart'],mode=info['mode'],state=state,previous=baseline)
            merged,other,conflicts=merge_research(baseline,state,latest)
            if conflicts:
                cid=secrets.token_hex(24);solutions=dict(page=merged,library=other)
                db.execute('INSERT INTO research_conflicts(id,view_id,base_version,page_sha,page_text,server_version,server_text,solutions,conflicts,created) VALUES(?,?,?,?,?,?,?,?,?,?)',(cid,view_id,effective_base,page_sha,encode(submitted),current['version'],current['text'],encode(solutions),encode(conflicts),time.time()))
                pending_conflict=Conflict(current,latest=current,conflicts=conflicts,solutions=solutions,conflictId=cid,baseVersion=effective_base)
            else:
                value=encode(merged)
                if len(value.encode('utf-8'))>900000:raise ValueError('整盘研究记录超过900000字节，请缩减正文或标记；已有记录和草稿保留')
                checked=incoming_checked if baseline==latest and merged==state else self.bridge('research-validate',info['chart'],mode=info['mode'],state=merged,previous=latest)
                if old:db.execute('INSERT INTO research_history(view_id,text,version,updated) VALUES(?,?,?,?)',(view_id,old['text'],old['version'],old['updated']))
                now=time.time();new_version=current['version']+1
                db.execute('INSERT INTO research VALUES(?,?,?,?) ON CONFLICT(view_id) DO UPDATE SET text=excluded.text,version=excluded.version,updated=excluded.updated',(view_id,value,new_version,now))
                db.execute('INSERT INTO research_submissions VALUES(?,?,?,?,?)',(view_id,page_sha,effective_base,new_version,now))
                if previous_conflict:db.execute('UPDATE research_conflicts SET resolved=1 WHERE id=?',(conflict_id,))
                if checked.get('warnings'):inspected=dict(warnings=checked['warnings'])
                else:inspected={}
                raw_sha=hashlib.sha256(value.encode('utf-8')).hexdigest()
                if len(self.research_checks)>256:self.research_checks.clear()
                self.research_checks[(view_id,info['chart_sha'],new_version,raw_sha)]=inspected
        # Conflict drafts must commit to their own backup table before raising.
        if pending_conflict:raise pending_conflict
        return dict(view_id=view_id,text=value,version=new_version,updated=now,merged=effective_base!=current['version'],baseVersion=effective_base,warnings=checked.get('warnings',[]))

    def restore(self, view_id, history_id, version):
        with self.connect() as db:
            row = db.execute('SELECT * FROM history WHERE id=? AND view_id=?', (history_id, view_id)).fetchone()
        if not row:
            raise ValueError('该历史记录不属于当前盘式')
        return self.put(view_id, row['object_id'], row['text'], version, row['kind'])

    def backup(self, target):
        target = Path(target).resolve()
        target.mkdir(parents=True, exist_ok=False)
        with self.connect() as source, sqlite3.connect(target / 'cases.sqlite3') as dest:
            source.backup(dest)
        shutil.copytree(self.root / 'assets', target / 'assets')
        return dict(directory=str(target), database='cases.sqlite3', assets='assets', sharedSkillRequired=True)

    def render(self, view_id, token):
        info = self.view(view_id)
        # Materialize only for rendering; temporary HTMLs are not permanent case copies.
        with tempfile.TemporaryDirectory(prefix='bazi-render-') as temp:
            page = Path(temp) / 'chart.html'
            report = self.bridge('render', info['chart'], output=str(page))
            markup = page.read_text(encoding='utf-8')
            resources = {}
            for resource in report['resources']:
                file = Path(resource['path'])
                key = resource['sha256'] + file.suffix.lower()
                target = self.root / 'assets' / key
                if not target.exists():
                    try:
                        with open(target, 'xb') as out:
                            out.write(file.read_bytes())
                    except FileExistsError:
                        pass
                resources[file.resolve()] = '/asset/' + key
            font_resources=iter(value for file,value in resources.items() if file.suffix.lower()=='.ttf')
            def asset(match):
                from urllib.parse import unquote
                value = match.group(1)
                if value.startswith('data:font/ttf;'):
                    # Working pages accept new notes and settings labels after
                    # rendering, so use full local fonts instead of a frozen subset.
                    return "url('" + next(font_resources) + "')"
                if value.startswith('data:'):
                    return match.group(0)
                file = (page.parent / unquote(value)).resolve()
                if file not in resources:
                    raise ValueError('未登记模板资源')
                return "url('" + resources[file] + "')"
            markup = re.sub(r"url\('([^']+)'\)", asset, markup)
        with self.connect() as db:
            views = [dict(r) for r in db.execute('SELECT id,mode FROM views WHERE case_id=?', (info['case_id'],))]
        config = dict(viewId=view_id, caseId=info['case_id'], mode=info['mode'], token=token, views=views, rootIdentity=hashlib.sha256(str(self.root).encode()).hexdigest())
        safe_config = encode(config).replace('<', '\\u003c')
        markup = markup.replace('</head>', '<link rel="stylesheet" href="/ui/research-ui.css"></head>')
        markup = markup.replace('</body>', '<script id="bazi-library-config" type="application/json">'+safe_config+'</script><script src="/ui/export-workbench.js"></script><script src="/ui/note-policy.js"></script><script src="/ui/research-drafts.js"></script><script src="/ui/algorithm-settings.js"></script><script src="/ui/research-ui.js"></script></body>')
        return markup

def serve(root, port):
    library = Library(root)
    token = secrets.token_urlsafe(32)
    origin = f'http://127.0.0.1:{port}'
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def output(self, value, status=200, kind='application/json; charset=utf-8'):
            data = value if isinstance(value, bytes) else (encode(value) if kind.startswith('application/json') else value).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', kind)
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Cache-Control', 'no-store')
            if len(data) > 1024 and 'gzip' in self.headers.get('Accept-Encoding', ''):
                data = gzip.compress(data, compresslevel=3)
                self.send_header('Content-Encoding', 'gzip')
                self.send_header('Vary', 'Accept-Encoding')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        def allowed(self):
            return self.headers.get('Host') in (f'127.0.0.1:{port}', f'localhost:{port}')
        def do_GET(self):
            if not self.allowed():
                return self.output({'error':'仅接受本机入口'},403)
            route=urlparse(self.path)
            args={k:v[0] for k,v in parse_qs(route.query).items()}
            try:
                if route.path=='/health':
                    return self.output(dict(ready=True,library=str(library.root),pid=os.getpid(),settings=str(Path(os.environ.get('CGM_BAZI_SETTINGS') or library.root.parent/'.cgm-bazi'/'settings.json').resolve())))
                if route.path=='/':
                    rows=library.list()
                    items=''.join('<li>'+html.escape(v['name'])+' · <a href="/view/'+v['id']+'">'+LABELS[v['mode']]+'</a></li>' for v in rows)
                    return self.output('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>八字案例库</title><link rel="stylesheet" href="/ui/research-ui.css"><style>:root{--paper:#fffdf8;--ink:#383129;--muted:#827c72;--line:#d8cbb9;--serif:serif}body{margin:40px auto;padding:0 20px;max-width:720px;background:var(--paper);color:var(--ink);font:15px/1.8 serif}a{color:inherit}#preferences{max-width:500px;margin:30px 0}button{font:inherit;color:inherit;background:transparent;border:1px solid var(--line);padding:6px 14px;cursor:pointer}h1{font-size:25px;font-weight:400}</style><h1>八字案例库</h1><ul>'+items+'</ul><section id="preferences" class="algorithm-home"></section><a href="/about">关于与来源</a><script src="/ui/algorithm-settings.js"></script><script>BaziAlgorithmSettings.home(document.getElementById("preferences"),'+json.dumps(token)+').catch(e=>document.getElementById("preferences").textContent=e.message)</script></html>',kind='text/html; charset=utf-8')
                if route.path=='/about':
                    return self.output('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>关于八字套件</title><style>body{max-width:620px;margin:40px auto;padding:20px;background:#fffdf8;color:#655644;font:16px/1.9 serif}a{color:inherit}</style><h1>八字排盘与可视化</h1><p>作者：长庚明（CGM2026）<br>公众号：明语星辰</p><p>程序按 AGPL-3.0 提供。允许使用、修改、商业使用及继续开发；分发及符合协议条件的网络服务须保留声明并提供对应源码。</p><p><a href="/license">阅读许可全文</a> · <a href="https://www.gnu.org/licenses/agpl-3.0.html">官方协议</a></p><p>字体、星历与其他素材依各自许可，见发布包 THIRD_PARTY_NOTICES.md。完整 HTML 含程序代码；普通图片与文章建议注明工具来源。</p><p>命理体系在本项目中作为描述人生的符号语言，不作为命运的绝对裁决。</p></html>',kind='text/html; charset=utf-8')
                if route.path=='/license':
                    license_file=HERE.parents[2]/'LICENSE'
                    if license_file.is_file():
                        return self.output(license_file.read_bytes(),kind='text/plain; charset=utf-8')
                    return self.output('当前为源码工作目录；完整许可随发布包提供。官方正文：https://www.gnu.org/licenses/agpl-3.0.html',kind='text/plain; charset=utf-8')
                if route.path.startswith('/view/'):
                    return self.output(library.render(route.path.split('/')[-1],token),kind='text/html; charset=utf-8')
                if route.path.startswith('/asset/'):
                    key=route.path.split('/')[-1]
                    if not re.fullmatch(r'[a-f0-9]{64}\.(ttf|png)',key):
                        raise ValueError('资源路径无效')
                    file=library.root/'assets'/key
                    return self.output(file.read_bytes(),kind=mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
                if route.path in ('/ui/library.js','/ui/library.css','/ui/research-ui.js','/ui/research-ui.css','/ui/export-workbench.js','/ui/note-policy.js','/ui/research-drafts.js','/ui/algorithm-settings.js'):
                    file=HERE.parent/'assets'/Path(route.path).name
                    return self.output(file.read_bytes(),kind='application/javascript; charset=utf-8' if file.suffix=='.js' else 'text/css; charset=utf-8')
                if route.path=='/api/notes':
                    return self.output(library.notes(args['view']))
                if route.path=='/api/preferences':
                    return self.output(library.preferences())
                if route.path=='/api/research':
                    return self.output(library.research(args['view']))
                if route.path in ('/api/objects','/api/date'):
                    view=library.view(args['view'])
                    if route.path=='/api/date':
                        return self.output(library.bridge('date',view['chart'],date=args['date']))
                    selection=dict(year=int(args['year']),month=int(args['month']),day=args.get('day'))
                    return self.output(library.bridge('objects',view['chart'],mode=view['mode'],selection=selection,requestedObject=args.get('object')))
                return self.output({'error':'入口不存在'},404)
            except Exception as error:
                return self.output({'error':str(error)},400)
        def do_POST(self):
            if not self.allowed() or self.headers.get('Origin') not in (origin,None) or self.headers.get('X-Bazi-Token')!=token or self.headers.get('Content-Type','').split(';')[0]!='application/json':
                return self.output({'error':'请使用本机案例页面并刷新后重试'},403)
            try:
                size=int(self.headers.get('Content-Length','0'))
                maximum=3*1024*1024 if self.path=='/api/research' else 1024*1024
                if not 0<size<=maximum:
                    raise ValueError('请求过大或为空')
                body=json.loads(self.rfile.read(size))
                if self.path=='/api/preferences':
                    return self.output(library.preferences(body))
                if self.path=='/api/put':
                    return self.output(library.put(body['view'],body['object'],body['text'],body['version'],body.get('kind','note')))
                if self.path=='/api/research':
                    return self.output(library.put_research(body['view'],body['state'],body['version'],base_state=body.get('baseState'),base_version=body.get('baseVersion'),conflict_id=body.get('conflictId'),resolution=body.get('resolution')))
                if self.path=='/api/recalculate':
                    return self.output(library.trial(body['view'],body['options']))
                if self.path=='/api/recalculate-save':
                    return self.output(library.save_trial(body['view'],body['trial']))
                if self.path=='/api/export-fonts':
                    info=library.view(body['view'])
                    if not isinstance(body.get('text'),str) or len(body['text'])>900000:
                        raise ValueError('导出文字无效或过长')
                    # Font preparation needs distinct drawable characters, not the
                    # entire note. Ignore controls/unpaired surrogates here only;
                    # original notes and exported text are never modified.
                    glyphs=''.join(dict.fromkeys(c for c in body['text'] if ord(c)>=32 and not 0xD800<=ord(c)<=0xDFFF))
                    return self.output(library.bridge('export-fonts',info['chart'],text=glyphs))
                return self.output({'error':'入口不存在'},404)
            except Conflict as error:
                return self.output(dict(error=str(error),current=error.current,**error.details),409)
            except ResearchCorrupt as error:
                return self.output(dict(error=str(error),diagnostics=error.diagnostics),400)
            except Exception as error:
                return self.output({'error':str(error)},400)
    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    print(encode(dict(url=origin,library=str(library.root))),flush=True)
    server.serve_forever()

def main():
    parser=argparse.ArgumentParser(description='本地八字案例、记录与日期查询')
    parser.add_argument('--library',default='bazi-case-library')
    sub=parser.add_subparsers(dest='command',required=True)
    create=sub.add_parser('create');create.add_argument('--chart',required=True)
    sub.add_parser('list')
    for name in ('notes','objects','date','history','open'):
        p=sub.add_parser(name);p.add_argument('--view',required=True)
        if name in ('date','objects'):p.add_argument('--date',required=name=='date')
        if name=='open':p.add_argument('--port',type=int,default=4880)
    p=sub.add_parser('research');p.add_argument('--view',required=True)
    p=sub.add_parser('research-diagnose');p.add_argument('--view',required=True)
    p=sub.add_parser('research-restore');p.add_argument('--view',required=True);p.add_argument('--history-id',type=int,required=True);p.add_argument('--version',type=int,required=True)
    for name in ('research-put','research-import'):
        p=sub.add_parser(name);p.add_argument('--view',required=True);p.add_argument('--state-file',required=True);p.add_argument('--version',type=int,required=True)
        if name=='research-put':
            p.add_argument('--base-version',type=int);p.add_argument('--base-state-file');p.add_argument('--conflict-id');p.add_argument('--resolution',choices=('page','library'))
    for name in ('note-put','record-put'):
        p=sub.add_parser(name);p.add_argument('--view',required=True);p.add_argument('--object',default='case');p.add_argument('--text-file',required=True);p.add_argument('--version',type=int,required=True)
    p=sub.add_parser('restore-entry');p.add_argument('--view',required=True);p.add_argument('--history-id',type=int,required=True);p.add_argument('--version',type=int,required=True)
    p=sub.add_parser('backup');p.add_argument('--output',required=True)
    p=sub.add_parser('serve');p.add_argument('--port',type=int,default=4880)
    args=parser.parse_args()
    if args.command=='serve':return serve(args.library,args.port)
    library=Library(args.library)
    if args.command=='create':result=library.create(json.loads(Path(args.chart).read_text(encoding='utf-8-sig')))
    elif args.command=='list':result=library.list()
    elif args.command=='research':result=library.research(args.view)
    elif args.command=='research-diagnose':result=library.diagnose_research(args.view)
    elif args.command=='research-restore':result=library.restore_research(args.view,args.history_id,args.version)
    elif args.command=='research-import':result=library.import_research(args.view,json.loads(Path(args.state_file).read_text(encoding='utf-8-sig')),args.version)
    elif args.command=='research-put':result=library.put_research(args.view,json.loads(Path(args.state_file).read_text(encoding='utf-8-sig')),args.version,base_state=json.loads(Path(args.base_state_file).read_text(encoding='utf-8-sig')) if args.base_state_file else None,base_version=args.base_version,conflict_id=args.conflict_id,resolution=args.resolution)
    elif args.command=='notes':result=library.notes(args.view)
    elif args.command=='history':result=library.history(args.view)
    elif args.command=='restore-entry':result=library.restore(args.view,args.history_id,args.version)
    elif args.command=='backup':result=library.backup(args.output)
    elif args.command in ('note-put','record-put'):result=library.put(args.view,args.object,Path(args.text_file).read_text(encoding='utf-8-sig'),args.version,'record' if args.command=='record-put' else 'note')
    elif args.command in ('objects','date'):
        view=library.view(args.view);chart=view['chart']
        if args.command=='date':result=library.bridge('date',chart,date=args.date)
        else:
            selection=chart['initial'].copy()
            if args.date:
                m=next((dict(m,sequenceYear=y['year']) for y in chart['calendarView']['years'] for m in y['months'] if m['startDate']<=args.date<m['endDateExclusive']),None)
                if not m:raise ValueError('日期超出命盘日历范围')
                selection=dict(year=m['sequenceYear'],month=m['index'],day=args.date)
            result=library.bridge('objects',chart,mode=view['mode'],selection=selection)
    elif args.command=='open':
        library.view(args.view)
        import urllib.request
        def health():
            with urllib.request.urlopen(f'http://127.0.0.1:{args.port}/health',timeout=1) as response:
                return json.load(response)
        try:
            state=health()
        except Exception:
            log=open(library.root/'server.log','ab')
            flags=getattr(subprocess,'CREATE_NO_WINDOW',0)
            subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--library',str(library.root),'serve','--port',str(args.port)],stdout=log,stderr=log,creationflags=flags)
            log.close()
            state=None
            for _ in range(40):
                try:state=health();break
                except Exception:time.sleep(.15)
            if not state:raise ValueError('案例库服务未启动，查看 server.log')
        if Path(state.get('library','')).resolve()!=library.root:
            raise ValueError('该端口已运行另一案例库，指定空闲端口；不切换或覆盖现有库')
        expected_settings=Path(os.environ.get('CGM_BAZI_SETTINGS') or library.root.parent/'.cgm-bazi'/'settings.json').resolve()
        if not state.get('settings') or Path(state['settings']).resolve()!=expected_settings:
            raise ValueError('该端口的服务使用另一份默认配置或旧版本；请指定空闲端口启动，或手动重启原服务')
        result=dict(url=f'http://127.0.0.1:{args.port}/view/{args.view}')
    print(encode(result))

if __name__=='__main__':
    # CLI JSON and diagnostics use UTF-8 independently of Windows console locale.
    for stream in (sys.stdin,sys.stdout,sys.stderr):
        if hasattr(stream,'reconfigure'):stream.reconfigure(encoding='utf-8',errors='backslashreplace' if stream is not sys.stdin else 'strict')
    try:main()
    except Conflict as error:
        print(encode(dict(error=str(error),current=error.current,**error.details)),file=sys.stderr);sys.exit(2)
    except ResearchCorrupt as error:
        print(encode(dict(error=str(error),diagnostics=error.diagnostics)),file=sys.stderr);sys.exit(1)
    except Exception as error:
        print(str(error),file=sys.stderr);sys.exit(1)
