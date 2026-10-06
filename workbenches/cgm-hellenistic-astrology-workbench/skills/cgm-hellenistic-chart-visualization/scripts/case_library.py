"""Small local case library. Immutable deduplicated templates + transactional records.

No astrology arithmetic lives here. Time-lord tables are rebuildable cache.
"""
from __future__ import annotations
import hashlib
import html
import json
import re
import shutil
import sqlite3
import sys
import threading
import time
import uuid
import zlib
from pathlib import Path
from license_footer import attach as attach_license_footer
from record_validation import validate_entry, unreadable_message, MAX_VALUE_BYTES

VISUAL = Path(__file__).resolve().parents[1]
WORK = VISUAL / 'assets/working-page/work'
CALC = VISUAL.parent / 'cgm-calculate-astrology-chart/scripts'
sys.path.insert(0, str(CALC))
LABELS = {'natal':'本命','transit':'行运','return':'返照','decennials':'十年九月大运','firdaria':'法达','zodiacal-releasing':'黄道释放'}
JSON_RE = re.compile(r'<script id="([^"]+)" type="application/json">(.*?)</script>', re.S)


def encoded(value):
    return json.dumps(value,ensure_ascii=False,separators=(',',':'))


def safe(value):
    return encoded(value).replace('<','\\u003c')


def append_before_document_end(source,closing,addition):
    # Module source may contain quoted HTML fragments such as </body>. Only
    # an actual HTML end tag outside script/style/comment content is valid.
    tag=closing[2:-1].lower();position=None
    pattern=r'<script\b[^>]*>.*?</script\s*>|<style\b[^>]*>.*?</style\s*>|<!--.*?-->|</(?:head|body)\s*>'
    for match in re.finditer(pattern,source,re.I|re.S):
        if re.fullmatch(r'</'+tag+r'\s*>',match[0],re.I):position=match.start()
    return source[:position]+addition+source[position:] if position is not None else source


def pack(value):
    return zlib.compress(value.encode('utf-8'),6)


def unpack(value):
    return zlib.decompress(value).decode('utf-8')


class Conflict(ValueError):
    pass


class Connection(sqlite3.Connection):
    def __exit__(self,*args):
        try:return super().__exit__(*args)
        finally:self.close()


def merge_value(base, local, remote):
    """Three-way merge by field / stable record id. Same-field edits conflict."""
    if local == remote or remote == base:
        return local
    if local == base:
        return remote
    missing = object()
    if all(isinstance(v,dict) for v in (base,local,remote)):
        out={}
        for key in base.keys() | local.keys() | remote.keys():
            b,l,r=base.get(key,missing),local.get(key,missing),remote.get(key,missing)
            if l==r or r==b: v=l
            elif l==b: v=r
            elif missing in (b,l,r): raise Conflict('同一字段存在不同修改：'+key)
            else: v=merge_value(b,l,r)
            if v is not missing: out[key]=v
        return out
    if all(isinstance(v,list) for v in (base,local,remote)) and all(isinstance(e,dict) and isinstance(e.get('id'),str) for v in (base,local,remote) for e in v):
        for seq in (base,local,remote):
            if len({e['id'] for e in seq})!=len(seq): raise Conflict('记录编号重复')
        merged=merge_value(*[{e['id']:e for e in seq} for seq in (base,local,remote)])
        order=list(dict.fromkeys(e['id'] for seq in (remote,local) for e in seq))
        return [merged[k] for k in order if k in merged]
    raise Conflict('同一项已被另一页面或 Agent 修改；你的草稿仍被保留。')


class Library:
    def __init__(self, root):
        self.root=Path(root).resolve();self.root.mkdir(parents=True,exist_ok=True)
        self.db=self.root/'cases.sqlite3';self.lock=threading.RLock()
        self.cache={};self.cache_sizes={};self.cache_lock=threading.RLock()
        with self.connect() as c:
            c.executescript('''
            CREATE TABLE IF NOT EXISTS blobs(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data BLOB NOT NULL);
            CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY,name TEXT NOT NULL,created REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS views(id TEXT PRIMARY KEY,case_id TEXT NOT NULL,mode TEXT NOT NULL,source TEXT UNIQUE NOT NULL,manifest TEXT NOT NULL,facts TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS entries(view_id TEXT NOT NULL,key TEXT NOT NULL,value BLOB NOT NULL,PRIMARY KEY(view_id,key));
            CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY AUTOINCREMENT,view_id TEXT,key TEXT,value BLOB,changed REAL);
            CREATE INDEX IF NOT EXISTS views_case ON views(case_id);
            ''')

    def connect(self):
        c=sqlite3.connect(self.db,timeout=15,factory=Connection)
        c.row_factory=sqlite3.Row
        c.execute('PRAGMA journal_mode=WAL');c.execute('PRAGMA synchronous=FULL')
        return c

    def blob(self,text,kind='text',c=None):
        digest=hashlib.sha256(text.encode()).hexdigest()
        if c is not None:c.execute('INSERT OR IGNORE INTO blobs VALUES(?,?,?)',(digest,kind,pack(text)))
        else:
            with self.connect() as db:db.execute('INSERT OR IGNORE INTO blobs VALUES(?,?,?)',(digest,kind,pack(text)))
        return digest

    def get_blob(self,key,c=None):
        if c is not None:row=c.execute('SELECT data FROM blobs WHERE id=?',(key,)).fetchone()
        else:
            with self.connect() as db:row=db.execute('SELECT data FROM blobs WHERE id=?',(key,)).fetchone()
        if row is None:raise ValueError('模板数据缺失')
        return unpack(row[0])

    def check_case_binding(self,case_id,facts,c=None):
        """All creation/import paths bind a case to the same natal source."""
        if not case_id:return
        if c is None:
            with self.connect() as db:return self.check_case_binding(case_id,facts,db)
        rows=c.execute("SELECT facts FROM views WHERE case_id=? AND mode NOT IN ('transit','return') ORDER BY CASE WHEN mode='natal' THEN 0 ELSE 1 END,rowid",(case_id,)).fetchall()
        if not rows:return
        from datetime import datetime,timezone
        def identity(f):
            m=f['metadata']
            return (datetime.fromisoformat(m['utc_datetime']).astimezone(timezone.utc),m['latitude'],m['longitude'],m.get('chart_name'))
        if any(identity(json.loads(self.get_blob(row['facts'],c)))!=identity(facts) for row in rows):
            raise ValueError('案例 ID 已绑定另一份本命事实，请使用新的案例编号')

    def import_page(self,page,case_id=None):
        page=Path(page).resolve();source=page.read_text(encoding='utf-8')
        data={m[1]:json.loads(m[2]) for m in JSON_RE.finditer(source)}
        if 'chart-data' not in data:raise ValueError('缺少已校验星盘数据')
        from validate_chart_output import validate
        facts=data['chart-data']['facts'];errors=validate(facts)
        if errors:raise ValueError(errors)
        mode=('return' if 'globalThis.ChartReturnMode=true' in source else
              'decennials' if 'decennials-data' in data else
              data.get('time-lord-data',{}).get('technique') or
              ('transit' if 'globalThis.ChartPageMode="transit"' in source else 'natal'))
        natal_facts=facts
        if mode in ('transit','return'):
            natal_bundle=data.get('natal-variants',{}).get('variants',{})
            if natal_bundle:natal_facts=next(iter(natal_bundle.values()))['facts']
            elif (page.parent/'natal-facts-v4.json').is_file():natal_facts=json.loads((page.parent/'natal-facts-v4.json').read_text(encoding='utf-8'))
            elif case_id:raise ValueError('行运/返照导入缺少本命事实，无法核对案例归属')
        identity=encoded({k:facts['metadata'].get(k) for k in ('utc_datetime','latitude','longitude','chart_name')})
        case_id=case_id or hashlib.sha256(identity.encode()).hexdigest()[:16]
        vid=hashlib.sha256(str(page).encode()).hexdigest()[:20]
        with self.lock,self.connect() as c:
            existing=c.execute('SELECT id FROM views WHERE source=?',(str(page),)).fetchone()
            if existing:return existing['id']
            self.check_case_binding(case_id,natal_facts,c)
            c.execute('INSERT OR IGNORE INTO cases VALUES(?,?,?)',(case_id,facts['metadata'].get('chart_name') or '未命名案例',time.time()))
            # Font binaries are shared, never copied into each case.
            assets={}
            for f in (page.parent/'assets').glob('*'):
                if not f.is_file():continue
                digest=hashlib.sha256(f.read_bytes()).hexdigest()+f.suffix
                target=self.root/'assets'/digest;target.parent.mkdir(exist_ok=True)
                from resource_store import share_resource
                share_resource(f,target)
                assets[f.name]=digest
                source=source.replace('assets/'+f.name,'/asset/'+digest)
            state=data.get('chart-archive-state',{}).get('entries',{})
            # Preserve all legacy records as strings, including unknown future fields.
            for key,value in state.items():
                if isinstance(value,str):c.execute('INSERT INTO entries VALUES(?,?,?)',(vid,key,pack(value)))
            def replace_json(m):
                key=m[1]
                if key=='chart-archive-state':return '@@ARCHIVE@@'
                if key in ('decennials-data','time-lord-data'):
                    return '<script id="'+key+'" type="application/json">@@PERIODS@@</script>'
                digest=self.blob(m[2],'json',c)
                return '<script id="'+key+'" type="application/json">@@BLOB:'+digest+'@@</script>'
            source=JSON_RE.sub(replace_json,source)
            # Named modules remain shared and updateable. Other scripts are immutable blobs.
            modules={}
            for f in WORK.glob('*.js'):
                modules[f.read_text(encoding='utf-8').strip()]=f.name
            def replace_script(m):
                code=m[1]
                if code.strip() in modules:return '@@MODULE:'+modules[code.strip()]+'@@'
                signatures={'else root.ChartWheel=factory(root.ChartGeometry)':'chart-wheel.js','globalThis.ChartLotState=':'settings-panel.js','const categoryFor=key=>':'custom-lots.js','let choosing=false,picked=new Set()':'object-layer-notes.js',
                            "const key='chart-note-layers-v1:'":'note-layers.js',
                            "const storage='chart-case-archive-v1:'":'case-archive-v2.js',
                            "const storageKey='chart-point-notes:'":'point-notes.js',
                            'if(!globalThis.ChartTimeLordMode)return;':'time-lord-ui.js',
                            'if(!globalThis.ChartDecennialsMode)return;':'decennials-ui.js'}
                for signature,name in signatures.items():
                    if signature in code:return '@@MODULE:'+name+'@@'
                if code.lstrip().startswith('(() => {\n const source=location.href,pagePath=') or 'const originalSet=Storage.prototype.setItem' in code:return '@@MODULE:archive-store.js@@'
                return '<script>@@BLOB:'+self.blob(code,'script',c)+'@@</script>'
            source=re.sub(r'<script>(.*?)</script>',replace_script,source,flags=re.S)
            source=re.sub(r'<style>(.*?)</style>',lambda m:'<style>@@BLOB:'+self.blob(m[1],'style',c)+'@@</style>',source,flags=re.S)
            source=re.sub(r'<nav class="chart-type-switch"[^>]*>.*?</nav>','@@NAV@@',source,count=1,flags=re.S)
            # The standard page renderer redraws this wheel from chart-data at startup.
            # Persisting thousands of SVG path coordinates adds no new facts.
            source=re.sub(r'(<div id="wheel">)\s*<svg\b.*?</svg>\s*(</div>)',r'\1\2',source,count=1,flags=re.S)
            # Original numeric ruler identities are preserved; derived tables are not archived.
            recipe={'technique':mode,'facts':self.blob(encoded(facts),'facts',c)}
            original_periods=data.get('decennials-data') or data.get('time-lord-data')
            if original_periods:
                recipe['basis']=original_periods['basis']
                recipe['schema']=original_periods['schema']
            extras={}
            for f in page.parent.glob('*.json'):
                if f.name in ('decennials.json','time-lords.json','chart-variants.json'):continue
                if f.stat().st_size<1_000_000:extras[f.name]=self.blob(f.read_text(encoding='utf-8-sig'),'source',c)
            manifest={'shell':self.blob(source,'shell',c),'recipe':recipe,'extras':extras,'assets':assets,'version':1}
            c.execute('INSERT INTO views VALUES(?,?,?,?,?,?,0)',(vid,case_id,mode,str(page),encoded(manifest),recipe['facts']))
        return vid

    def view(self,vid):
        with self.connect() as c:row=c.execute('SELECT * FROM views WHERE id=?',(vid,)).fetchone()
        if row is None:raise ValueError('案例盘式不存在')
        return dict(row)

    def list_views(self,query=''):
        with self.connect() as c:
            return [dict(r) for r in c.execute('SELECT views.id,case_id,name,mode,revision FROM views JOIN cases ON cases.id=views.case_id WHERE name LIKE ? ORDER BY cases.created,views.rowid',('%'+query+'%',))]

    def case_views(self,case_id):
        with self.connect() as c:
            return [dict(r) for r in c.execute('SELECT id,case_id,mode,revision FROM views WHERE case_id=? ORDER BY rowid',(case_id,))]

    def state(self,vid):
        with self.connect() as c:
            c.execute('BEGIN')
            view=c.execute('SELECT revision FROM views WHERE id=?',(vid,)).fetchone()
            if view is None:raise ValueError('案例盘式不存在')
            entries={r['key']:unpack(r['value']) for r in c.execute('SELECT key,value FROM entries WHERE view_id=?',(vid,))}
            warnings=[]
            for key,value in entries.items():
                try:validate_entry(key,value)
                except ValueError as error:
                    history_id=None
                    for row in c.execute('SELECT id,value FROM history WHERE view_id=? AND key=? AND value IS NOT NULL ORDER BY id DESC',(vid,key)):
                        try:validate_entry(key,unpack(row['value']))
                        except ValueError:continue
                        history_id=row['id'];break
                    warnings.append({'key':key,'message':unreadable_message(key,history_id),'historyId':history_id})
            return {'version':1,'revision':view['revision'],'entries':entries,'warnings':warnings}

    def save(self,vid,changes,previous,actor='page',*,expected_revision=None,max_fields=100,allow_empty=False,legacy_reference_source=None):
        if not isinstance(changes,dict) or (not changes and not allow_empty) or (max_fields is not None and len(changes)>max_fields):raise ValueError('记录数量无效')
        if not isinstance(previous,dict):raise ValueError('修改必须附带原值')
        with self.lock,self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            view=c.execute('SELECT revision FROM views WHERE id=?',(vid,)).fetchone()
            if view is None:raise ValueError('案例不存在')
            if expected_revision is not None and expected_revision!=view['revision']:raise Conflict('记录版本已变，请先读取最新版本')
            if not changes:return {'revision':view['revision'],'entries':{}}
            merged={}
            for key,value in changes.items():
                if not isinstance(key,str) or not key.startswith('chart-') or len(key)>300:raise ValueError('记录字段无效或过大')
                validate_entry(key,value)
                row=c.execute('SELECT value FROM entries WHERE view_id=? AND key=?',(vid,key)).fetchone()
                remote=unpack(row[0]) if row else None;base=previous.get(key)
                if remote!=base and remote!=value:
                    try:value=encoded(merge_value(json.loads(base) if base is not None else {},json.loads(value) if value is not None else None,json.loads(remote) if remote is not None else None))
                    except (ValueError,TypeError) as e:raise Conflict(str(e)) from e
                validate_entry(key,value)
                if key.startswith('chart-note-layers-v1:') and value is not None and value!=remote:
                    from record_validation import validate_note_limit
                    validate_note_limit(value,remote)
                    from object_refs import validate_note_objects
                    next_entries={r['key']:unpack(r['value']) for r in c.execute('SELECT key,value FROM entries WHERE view_id=?',(vid,))}
                    next_entries.update({k:v for k,v in changes.items() if v is not None})
                    validate_note_objects(self,vid,value,legacy_reference_source if legacy_reference_source is not None else remote,next_entries)
                if remote!=value:
                    c.execute('INSERT INTO history(view_id,key,value,changed) VALUES(?,?,?,?)',(vid,key,pack(remote) if remote is not None else None,time.time()))
                    if value is None:c.execute('DELETE FROM entries WHERE view_id=? AND key=?',(vid,key))
                    else:c.execute('INSERT OR REPLACE INTO entries VALUES(?,?,?)',(vid,key,pack(value)))
                merged[key]=value
            c.execute('UPDATE views SET revision=revision+1 WHERE id=?',(vid,))
            revision=c.execute('SELECT revision FROM views WHERE id=?',(vid,)).fetchone()[0]
            # Bounded undo history: latest 100 edits per view, global 20 MB budget.
            c.execute('DELETE FROM history WHERE view_id=? AND id NOT IN (SELECT id FROM history WHERE view_id=? ORDER BY id DESC LIMIT 100)',(vid,vid))
            while c.execute('SELECT COALESCE(SUM(length(value)),0) FROM history').fetchone()[0]>20_000_000:
                c.execute('DELETE FROM history WHERE id IN (SELECT id FROM history ORDER BY id LIMIT 100)')
            return {'revision':revision,'entries':merged}

    def import_records(self,vid,imported,expected_revision):
        if type(expected_revision) is not int:raise ValueError('导入必须提供读取时的整数版本号')
        target=self.view(vid)
        if not isinstance(imported,dict) or imported.get('schema')!='cgm.case-records.v1' or imported.get('mode')!=target['mode']:raise ValueError('记录格式或盘式不匹配')
        if imported.get('case_id')!=target['case_id'] or imported.get('facts')!=json.loads(self.get_blob(target['facts'])):raise ValueError('记录所属案例或排盘事实不匹配')
        archive=imported.get('archive')
        if not isinstance(archive,dict) or not isinstance(archive.get('entries'),dict):raise ValueError('导入缺少有效归档字段')
        changes=archive['entries'];state=self.state(vid)
        return self.save(vid,changes,{k:state['entries'].get(k) for k in changes},'agent',expected_revision=expected_revision,max_fields=None,allow_empty=True)

    def restore_entry(self,vid,history_id,expected_revision):
        if type(history_id) is not int or type(expected_revision) is not int:raise ValueError('历史编号和版本必须是整数')
        with self.connect() as c:row=c.execute('SELECT key,value FROM history WHERE id=? AND view_id=?',(history_id,vid)).fetchone()
        if row is None:raise ValueError('历史版本不存在或已超出保留范围')
        key=row['key'];value=unpack(row['value']) if row['value'] is not None else None
        state=self.state(vid)
        return self.save(vid,{key:value},{key:state['entries'].get(key)},'agent',expected_revision=expected_revision,legacy_reference_source=value)

    def periods(self,vid,start=None):
        view=self.view(vid);recipe=json.loads(view['manifest'])['recipe']
        facts=json.loads(self.get_blob(view['facts']))
        mode=view['mode'];basis=recipe.get('basis',{})
        start=str(start if start is not None else basis.get('default_start','default'))
        key=(vid,start)
        with self.cache_lock:
            if key in self.cache:
                value=self.cache.pop(key);self.cache[key]=value
                return value
        if mode=='decennials':
            from calculate_decennials import nested_periods,PLANETS
            from civil_age import annotate_periods,local_zone
            from datetime import datetime
            if start not in PLANETS:raise ValueError('起运星无效')
            birth=datetime.fromisoformat(facts['metadata']['utc_datetime'])
            schedules={start:nested_periods(birth,basis['natal_zodiacal_order'],start,14)}
            annotate_periods(schedules,birth,local_zone(facts))
            result={'schema':recipe['schema'],'basis':basis,'schedules':schedules}
        else:
            from calculate_time_lords import calculate
            result=calculate(facts,mode,start_sign=int(start) if mode=='zodiacal-releasing' else None)
        from cache_budget import retained_bytes
        size=retained_bytes(result)
        with self.cache_lock:
            while self.cache and (len(self.cache)>=8 or sum(self.cache_sizes.values())+size>32*1024*1024):
                oldest=next(iter(self.cache));self.cache.pop(oldest);self.cache_sizes.pop(oldest,None)
            if size<=32*1024*1024:self.cache[key]=result;self.cache_sizes[key]=size
        return result

    def render(self,vid,session_token='',export=False):
        view=self.view(vid);manifest=json.loads(view['manifest'])
        source=self.get_blob(manifest['shell'])
        # One pass: stored shells contain only immutable blob placeholders.
        source=re.sub(r'@@BLOB:([a-f0-9]{64})@@',lambda m:self.get_blob(m[1]),source)
        # Older imported shells may have archived these modules as anonymous blobs.
        def refresh_module(m):
            code=m[1]
            signatures=[('else root.ChartWheel=factory(root.ChartGeometry)','chart-wheel.js'),('globalThis.ChartLotState=','settings-panel.js'),('const categoryFor=key=>','custom-lots.js'),('globalThis.ChartDock=','detail-panel.js'),('globalThis.ChartWorkbench=','workbench-layout.js'),('globalThis.ChartRelationNotes=','object-layer-notes.js'),('globalThis.ChartNoteLayers=','note-layers.js'),("const storageKey='chart-point-notes:'",'point-notes.js'),("const storage='chart-case-archive-v1:'",'case-archive-v2.js'),('function pinTimeCard(panel)','time-adjust.js'),('globalThis.ChartLibraryStore=','library-store.js'),('if(!globalThis.ChartTimeLordMode)return;','time-lord-ui.js'),('if(!globalThis.ChartDecennialsMode)return;','decennials-ui.js'),("host.className='transit-research-list'",'research-cards.js')]
            signatures.extend([('globalThis.ChartMethodState=','chart-switches.js'),('const presets={hellenistic:','personal-tradition.js')])
            if "document.getElementById('export-dialog')" in code and 'html2canvas' in code:signatures.append(('html2canvas','page-export.js'))
            for signature,name in signatures:
                if signature in code:
                    return '@@MODULE:'+name+'@@'
            return m[0]
        source=re.sub(r'<script>(.*?)</script>',refresh_module,source,flags=re.S)
        if '@@MODULE:method-defaults.js@@' not in source and 'class="save-method-defaults"' not in source:
            source=source.replace('</body>','@@MODULE:method-defaults.js@@</body>')
        state=self.state(vid)
        from case_remarks import read_remarks
        remarks=read_remarks(self.db,vid)
        config={'caseRemarks':remarks,'id':vid,'caseId':view['case_id'],'mode':view['mode'],'token':session_token,'state':state,'export':export}
        bootstrap='<script>globalThis.ChartLibrary='+safe(config)+';</script><script>'+(WORK/'case-remarks.js').read_text(encoding='utf-8')+'</script>'
        source=source.replace('@@ARCHIVE@@','<script id="chart-archive-state" type="application/json">'+safe(state)+'</script>'+bootstrap)
        def module(m):
            name=m[1]
            if name=='archive-store.js':name='library-store.js'
            if name=='case-archive.js':name='case-archive-v2.js'
            code=(WORK/('print-study/chart-wheel.js' if name=='chart-wheel.js' else name)).read_text(encoding='utf-8')
            if export and name=='library-store.js':code=(WORK/'library-export-store.js').read_text(encoding='utf-8')
            code=code.replace("'http://127.0.0.1:4852/adjust-time'","'/api/adjust-time'")
            if name=='time-adjust.js':code=code.replace('source:location.href','source:location.href,viewId:ChartLibrary.id,token:ChartLibrary.token')
            return '<script>'+code+'</script>'
        source=re.sub(r'@@MODULE:([a-zA-Z0-9_.-]+)@@',module,source)
        if '@@PERIODS@@' in source:
            entry_key=('chart-decennials-start-v1:{PAGE}' if view['mode']=='decennials' else 'chart-time-lord-start-v1:{PAGE}')
            data=self.periods(vid,state['entries'].get(entry_key))
            if export:
                data=json.loads(encoded(data))
                # Export all requested starts to retain a usable independent snapshot.
                if view['mode']=='decennials':
                    for start in data['basis']['natal_zodiacal_order']:data['schedules'].update(self.periods(vid,start)['schedules'])
                elif view['mode']=='zodiacal-releasing':
                    data=json.loads(encoded(data))
                    for start in range(12):data['schedules'].update(self.periods(vid,start)['schedules'])
            source=source.replace('@@PERIODS@@',safe(data))
        views=self.case_views(view['case_id'])
        nav='<nav class="chart-type-switch" aria-label="盘式">'
        for v in views:
            label=LABELS[v['mode']]
            if v['id']==vid:nav+='<span'+(' aria-current="page"' if v['id']==vid else '')+'>'+label+'</span>'
            else:nav+='<a href="/view/'+v['id']+'">'+label+'</a>'
        source=source.replace('@@NAV@@',nav+'</nav>')
        if not export:
            source=append_before_document_end(source,'</body>','<script>'+(WORK/'editor-autosave.js').read_text(encoding='utf-8')+'</script>')
        # Always append the current layout adapter, including older immutable shells.
        source=append_before_document_end(source,'</head>','<style>'+(WORK/'workbench-layout.css').read_text(encoding='utf-8')+'</style>')
        # Imported cases retain their shell; refresh the archive interface in place.
        archive_css=re.search(r'/\* archive-record-navigation \*/.*?/\* end-archive-record-navigation \*/',(WORK/'visual-refinements.css').read_text(encoding='utf-8'),re.S)
        source=re.sub(r'<style id="archive-interface-styles">.*?</style>','',source,flags=re.S)
        if archive_css:
            source=append_before_document_end(source,'</head>','<style id="archive-interface-styles">'+archive_css[0]+'</style>')
        source=append_before_document_end(source,'</body>','<script>'+(WORK/'workbench-layout.js').read_text(encoding='utf-8')+'</script>')
        return attach_license_footer(source)

    def reading_times(self,vid,text):
        view=self.view(vid)
        if view['mode'] not in ('transit','return'):return {}
        entries=self.state(vid)['entries']
        saved=json.loads(entries.get('chart-note-layers-v1:{PAGE}','{}'))
        times={l['transitTime'] for l in saved.get('layers',[]) if l.get('transitTime')}
        base=entries.get('chart-transit-base-time-v1:{PAGE}')
        if base:times.add(base)
        if not times:return {}
        import tempfile
        import time_adjust_server as legacy
        from calculate_display_snapshots import input_from_facts
        def materialize(v,path):
            path.mkdir();manifest=json.loads(v['manifest']);markup=self.render(v['id'],export=True)
            (path/'chart.html').write_text(markup,encoding='utf-8')
            for name,key in manifest['extras'].items():(path/name).write_text(self.get_blob(key),encoding='utf-8')
            if not (path/'input.json').exists():(path/'input.json').write_text(encoded(input_from_facts(json.loads(self.get_blob(v['facts'])))),encoding='utf-8')
            for match in JSON_RE.finditer(markup):
                if match[1]=='chart-variants':(path/'chart-variants.json').write_text(match[2],encoding='utf-8')
        with tempfile.TemporaryDirectory(prefix='cgm-reading-times-') as temp:
            dest=Path(temp);materialize(view,dest/'current')
            natal=next(v for v in self.case_views(view['case_id']) if v['mode']=='natal')
            materialize(self.view(natal['id']),dest/'natal')
            (dest/'current/natal-page.txt').write_text(str(dest/'natal/chart.html'),encoding='utf-8')
            return {value:legacy.build(dest/'current/chart.html',value,False) for value in sorted(times)}

    def export_reading(self,vid):
        from portable_reading import document,assets_for
        pages={}
        for v in self.case_views(self.view(vid)['case_id']):
            text=self.render(v['id'],export=True)
            pages[v['id']]=dict(kind='astrology',html=text,times=self.reading_times(v['id'],text))
        return document(pages,assets_for(self.root,pages),vid)

    def stats(self):
        with self.connect() as c:
            return {'cases':c.execute('SELECT COUNT(*) FROM cases').fetchone()[0],
                    'views':c.execute('SELECT COUNT(*) FROM views').fetchone()[0],
                    'template_and_data_bytes':c.execute('SELECT COALESCE(SUM(length(data)),0) FROM blobs').fetchone()[0],
                    'record_bytes':c.execute('SELECT COALESCE(SUM(length(value)),0) FROM entries').fetchone()[0],
                    'disk_bytes':sum(f.stat().st_size for f in self.root.rglob('*') if f.is_file()),
                    'period_tables_on_disk':False}

    def backup(self,path):
        path=Path(path).resolve();path.parent.mkdir(parents=True,exist_ok=True)
        with self.connect() as source,sqlite3.connect(path,factory=Connection) as target:source.backup(target)
        return str(path)

    def export_json(self,vid):
        view=self.view(vid)
        return {'schema':'cgm.case-records.v1','view_id':vid,'case_id':view['case_id'],'mode':view['mode'],'facts':json.loads(self.get_blob(view['facts'])),'archive':self.state(vid),'case_remarks':__import__('case_remarks').read_remarks(self.db,vid)}
