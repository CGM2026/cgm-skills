"""Create all six views from calculator facts and reusable library templates."""
import hashlib,json,re,shutil,sqlite3,tempfile,time,uuid
from pathlib import Path
from datetime import datetime,timedelta,timezone
from case_library import Library,encoded,unpack,WORK,CALC,LABELS
from calculate_chart import calculate,swe
from calculate_display_snapshots import input_from_facts,calculate_at_instant,calculate_variants,attach_virtual_points,attach_asteroids,bundle_metadata
from calculate_return_query import find_returns,instant_of
from calculate_decennials import recipe as decennial_recipe
from calculate_time_lords import calculate as time_lords
from civil_age import local_zone
from validate_chart_output import validate

class CompleteCaseBuilder:
    def __init__(self,library,template_root):
        self.library=library;root=Path(template_root).resolve()
        db=sqlite3.connect((root/'cases.sqlite3').as_uri()+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
        def get(k):return unpack(db.execute('select data from blobs where id=?',(k,)).fetchone()[0])
        self.templates={};self.shared={}
        for mode in LABELS:
            row=db.execute('select manifest from views where mode=? order by rowid limit 1',(mode,)).fetchone()
            if row is None:raise ValueError('模板库需要六种盘式；首次创建使用标准渲染器建立模板')
            m=json.loads(row[0]);shell=get(m['shell']);self.templates[mode]=(shell,m)
            for bid in set(re.findall(r'@@BLOB:([a-f0-9]+)@@',shell)):
                self.shared[bid]=db.execute('select * from blobs where id=?',(bid,)).fetchone()
        self.reference=json.loads(get(re.search(r'<script id="chart-variants" type="application/json">@@BLOB:([a-f0-9]+)',self.templates['natal'][0])[1]))
        db.close()
        with library.connect() as c:
            for bid,row in self.shared.items():
                # Only shared code/styles are copied. Never copy sample chart data.
                if row['kind'] not in ('json','facts','source','shell'):c.execute('insert or ignore into blobs values(?,?,?)',tuple(row))
        dest=library.root/'assets';dest.mkdir(exist_ok=True)
        for _,m in self.templates.values():
            for name in m['assets'].values():
                if not (dest/name).exists():shutil.copy2(root/'assets'/name,dest/name)
        self._ephemeris_temp=tempfile.TemporaryDirectory(prefix='cgm-complete-ephemeris-',ignore_cleanup_errors=True)
        self.ephemeris=Path(self._ephemeris_temp.name)
        shutil.copy2(WORK/'ephemeris/seas_18.se1',self.ephemeris/'seas_18.se1')

    def close(self):
        swe.close()
        self._ephemeris_temp.cleanup()

    def bundle(self,facts):
        unavailable={}
        variants,houses=calculate_variants(facts,unavailable)
        for key,p in variants.items():
            # The template can itself be a polar case with fewer variants.
            p['bound_table']=next(entry['bound_table'] for entry in self.reference['variants'].values()
                                  if entry['facts']['settings']['bound_system']==p['facts']['settings']['bound_system'])
            p['source_sha256']=hashlib.sha256(encoded(p['facts']).encode()).hexdigest()
        result={**bundle_metadata(facts,variants,houses,unavailable),'variants':variants}
        attach_virtual_points(result);attach_asteroids(result,self.ephemeris)
        return result

    def create(self,facts,*,at=None,case_id=None):
        errors=validate(facts)
        if errors:raise ValueError(errors)
        at=at or datetime.now(timezone.utc)
        if at.tzinfo is None:raise ValueError('创建时刻需要时区')
        birth=datetime.fromisoformat(facts['metadata']['utc_datetime']);at=max(at,birth)
        identity={k:facts['metadata'].get(k) for k in ('utc_datetime','latitude','longitude','chart_name')}
        cid=case_id or hashlib.sha256(encoded(identity).encode()).hexdigest()[:16]
        vids={mode:hashlib.sha256((cid+':'+mode).encode()).hexdigest()[:20] for mode in LABELS}
        with self.library.connect() as c:
            self.library.check_case_binding(cid,facts,c)
            old=list(c.execute('select id,mode,facts from views where case_id=?',(cid,)))
        for row in old:
            if row['mode']=='natal' and json.loads(self.library.get_blob(row['facts']))!=facts:raise ValueError('案例 ID 已绑定另一份本命事实')
            vids[row['mode']]=row['id']
        if set(r['mode'] for r in old)==set(LABELS):return {'case_id':cid,'views':vids,'reused':True}
        zone=local_zone(facts)
        event=calculate_at_instant(facts,at)
        target,roots,_=find_returns(facts,'sun',at,at+timedelta(days=400))
        if not roots:raise ValueError('未来400天没有找到太阳返照')
        instant=instant_of(roots[0]);local=instant.astimezone(zone)
        ret=calculate_at_instant(facts,instant)
        bundles={'natal':self.bundle(facts),'transit':self.bundle(event),'return':self.bundle(ret)}
        cfg=facts['settings'];default='|'.join(['sidereal_lahiri' if cfg.get('ayanamsa')=='lahiri' else cfg['zodiac'],cfg['primary_house_system'],cfg['bound_system']])
        query=[{'schema':'cgm.return-query.v1','planet':'sun','target_longitude':target,'start':at.isoformat(),'zodiac':cfg['zodiac'],'ayanamsa':cfg.get('ayanamsa'),'time_reference':facts['metadata']['time_reference'],'results':[{'local':local.isoformat(timespec='microseconds'),'utc':instant.isoformat(timespec='microseconds'),'direction':'direct'}]}]
        recipes={'decennials':decennial_recipe(facts,at=at)}
        for mode in ('firdaria','zodiacal-releasing'):
            d=time_lords(facts,mode,horizon_years=0,start_sign=0 if mode=='zodiacal-releasing' else None)
            recipes[mode]={'schema':d['schema'],'basis':{**d['basis'],'horizon_years':150}}
        existing={r['mode'] for r in old}
        with self.library.lock,self.library.connect() as c:
            c.execute('begin immediate');self.library.check_case_binding(cid,facts,c)
            # Recheck inside the transaction after potentially slow calculations.
            concurrent=list(c.execute('select id,mode from views where case_id=?',(cid,)))
            existing.update(r['mode'] for r in concurrent)
            vids.update({r['mode']:r['id'] for r in concurrent})
            c.execute('insert or ignore into cases values(?,?,?)',(cid,facts['metadata'].get('chart_name') or '未命名案例',time.time()))
            for mode in LABELS:
                if mode in existing:continue
                shell,template=self.templates[mode];f=event if mode=='transit' else ret if mode=='return' else facts;b=bundles[mode if mode in bundles else 'natal']
                payloads={'chart-data':b['variants'][default],'chart-variants':b,'natal-variants':bundles['natal'],'return-query-data':query}
                def slot(m):
                    if m[1] in payloads:return '<script id="'+m[1]+'" type="application/json">@@BLOB:'+self.library.blob(encoded(payloads[m[1]]),'json',c)+'@@</script>'
                    return m[0]
                text=re.sub(r'<script id="([^"]+)" type="application/json">@@BLOB:([a-f0-9]+)@@</script>',slot,shell)
                # Update path bootstrap and old export/dock code without editing case state.
                def script(m):
                    row=self.shared.get(m[1]);code=unpack(row['data']) if row else ''
                    if 'globalThis.ChartSharedArchivePath=' in code:
                        code=re.sub(r'globalThis.ChartSharedArchivePath=.*?;', 'globalThis.ChartSharedArchivePath='+encoded('/view/'+vids['natal'])+';',code)
                        return '<script>@@BLOB:'+self.library.blob(code,'script',c)+'@@</script>'
                    if 'globalThis.ChartDock=' in code:return '@@MODULE:detail-panel.js@@'
                    if "document.getElementById('export-dialog')" in code and 'html2canvas' in code:return '@@MODULE:page-export.js@@'
                    if 'globalThis.ChartWorkbench=' in code:return '@@MODULE:workbench-layout.js@@'
                    return m[0]
                text=re.sub(r'<script>@@BLOB:([a-f0-9]+)@@</script>',script,text)
                import html
                name=html.escape(facts['metadata'].get('chart_name') or '未命名案例');meta=f['metadata'];dt=datetime.fromisoformat(meta['local_datetime'])
                text=re.sub(r'<title>.*?</title>',f'<title>{name} · {LABELS[mode]}</title>',text,count=1)
                text=re.sub(r'<h1 class="name".*?</h1>',f'<h1 class="name" title="{name}" aria-label="{name}">{name}</h1>',text,count=1)
                text=re.sub(r'<p class="date">.*?</p>',f'<p class="date">{dt:%Y/%m/%d　%H:%M}</p>',text,count=1)
                place=html.escape(meta.get('location_name') or '未命名地点');lon=meta['longitude'];lat=meta['latitude']
                text=re.sub(r'<p class="place-label".*?</p>',f'<p class="place-label" title="{place}">{place} · <span class="coordinates">{abs(lon):.2f}°{"E" if lon>=0 else "W"} {abs(lat):.2f}°{"N" if lat>=0 else "S"}</span></p>',text,count=1)
                fid=self.library.blob(encoded(f),'facts',c);recipe={'technique':mode,'facts':fid,**recipes.get(mode,{})}
                extras={}
                if mode=='return':extras['return-query-results.json']=self.library.blob(encoded(query),'source',c)
                m={'shell':self.library.blob(text,'shell',c),'recipe':recipe,'extras':extras,'assets':template['assets'],'version':1}
                c.execute('insert into views values(?,?,?,?,?,?,0)',(vids[mode],cid,mode,'complete://'+cid+'/'+mode,encoded(m),fid))
        return {'case_id':cid,'views':vids,'reused':False}
