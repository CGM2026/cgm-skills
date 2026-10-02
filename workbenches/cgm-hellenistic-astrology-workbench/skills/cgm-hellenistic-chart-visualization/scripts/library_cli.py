"""Small structured Agent interface. Never read an entire HTML to edit a note."""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path
from case_library import Library,encoded,LABELS,Conflict,unpack
from object_refs import validate_objects,period_ref
from record_validation import unreadable_message


def launch(library,port=4860,settings_path=None):
    expected=hashlib.sha256(str(library.root).encode()).hexdigest()
    def probe():
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/health',timeout=1) as r:data=json.load(r)
            if data.get('library')!=expected:raise ValueError('该端口已有另一案例库，请指定其他端口')
            return True
        except (OSError,TimeoutError):return False
    if probe():return
    flags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
    log=(library.root/'service.log').open('a',encoding='utf-8')
    command=[sys.executable,str(Path(__file__).with_name('library_server.py')),'--library',str(library.root),'--port',str(port)]
    if settings_path:command+=['--settings',str(Path(settings_path).resolve())]
    subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=log,stderr=log,creationflags=flags,start_new_session=os.name!='nt')
    log.close()
    for _ in range(40):
        if probe():return
        time.sleep(.1)
    raise RuntimeError('本地服务未启动，请查看 service.log')


def put_note(library,vid,item,expected=None):
    state=library.state(vid)
    if item.get('id') and expected!=state['revision']:raise Conflict('修改已有笔记必须提供读取时的 revision')
    key='chart-note-layers-v1:{PAGE}';before=state['entries'].get(key)
    data=json.loads(before or '{"version":1,"active":"base","layers":[]}')
    view=library.view(vid);facts=json.loads(library.get_blob(view['facts']))
    def fixed_time(value):
        if not value:return None
        from datetime import datetime
        from civil_age import local_zone
        moment=datetime.fromisoformat(str(value))
        if moment.tzinfo is not None:moment=moment.astimezone(local_zone(facts))
        return moment.replace(tzinfo=None).isoformat(timespec='microseconds' if view['mode']=='return' else 'minutes')
    layer_id=item.get('layer_id');layer=next((l for l in data['layers'] if l['id']==layer_id),None)
    if layer_id and layer is None:raise ValueError('笔记图层不存在')
    if layer is None:
        if library.view(vid)['mode'] in ('transit','return') and not item.get('transit_time'):raise ValueError('行运/返照新图层需要固定时刻 transit_time')
        layer={'id':'layer-'+uuid.uuid4().hex,'name':item.get('layer_name','研究笔记'),'visible':True,'note':'','relations':[],'fade':78,'transitTime':fixed_time(item.get('transit_time'))}
        data['layers'].append(layer)
    objects=item.get('objects',[])
    note_id=item.get('id') or 'note-'+uuid.uuid4().hex
    old=next((n for n in layer.get('relations',[]) if n['id']==note_id),None)
    if item.get('id') and old is None:raise ValueError('笔记不存在')
    if old is None and len(layer.get('relations',[]))>=30:raise ValueError('每个笔记图层最多30条笔记，请先删除一条后新增')
    if not isinstance(objects,list) or (not objects and not (old or {}).get('legacySummary')):raise ValueError('请从 objects 查询结果中选择至少一个对象，使用对象键列表')
    validate_objects(library,vid,objects,(old or {}).get('objects',[]),state['entries'])
    if layer.get('transitTime'):layer['transitTime']=fixed_time(layer['transitTime'])
    note={**(old or {}),'id':note_id,'title':str(item.get('title','')),'text':str(item.get('text','')),'objects':objects}
    if not note['title'].strip() and not note['text'].strip():raise ValueError('笔记不能全空')
    if layer.get('transitTime'):note['transitTime']=layer['transitTime']
    if old:layer['relations'][layer['relations'].index(old)]=note
    else:layer.setdefault('relations',[]).append(note)
    result=library.save(vid,{key:encoded(data)},{key:before},'agent')
    return {'id':note_id,'layer_id':layer['id'],'revision':result['revision']}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--library',type=Path,default=Path('case-library'))
    p.add_argument('--settings',type=Path,help='Workspace defaults file used by the local settings dialog')
    sub=p.add_subparsers(dest='command',required=True)
    i=sub.add_parser('import');i.add_argument('pages',nargs='+',type=Path);i.add_argument('--case-id')
    cr=sub.add_parser('create');cr.add_argument('--facts',type=Path,required=True);cr.add_argument('--mode',choices=['complete',*LABELS],default='complete');cr.add_argument('--case-id');cr.add_argument('--natal-view');cr.add_argument('--from-time');cr.add_argument('--template-library',type=Path)
    l=sub.add_parser('list');l.add_argument('--query',default='')
    o=sub.add_parser('open');o.add_argument('--view');o.add_argument('--port',type=int,default=4860)
    n=sub.add_parser('notes');n.add_argument('--view',required=True)
    n=sub.add_parser('note-put');n.add_argument('--view',required=True);n.add_argument('--input',type=Path,required=True);n.add_argument('--expected-revision',type=int)
    n=sub.add_parser('record-put');n.add_argument('--view',required=True);n.add_argument('--input',type=Path,required=True);n.add_argument('--expected-revision',type=int)
    n=sub.add_parser('objects');n.add_argument('--view',required=True);n.add_argument('--start');n.add_argument('--path',default='');n.add_argument('--level',type=int,default=0)
    e=sub.add_parser('export');e.add_argument('--view',required=True);e.add_argument('--output',type=Path,required=True);e.add_argument('--format',choices=['json','html'],default='json')
    e=sub.add_parser('import-records');e.add_argument('--view',required=True);e.add_argument('--input',type=Path,required=True);e.add_argument('--expected-revision',required=True,type=int)
    b=sub.add_parser('backup');b.add_argument('--output',type=Path,required=True)
    h=sub.add_parser('history');h.add_argument('--view',required=True)
    h=sub.add_parser('restore-entry');h.add_argument('--view',required=True);h.add_argument('--history-id',type=int,required=True);h.add_argument('--expected-revision',type=int,required=True)
    sub.add_parser('stats')
    a=p.parse_args();library=Library(a.library)
    if a.command=='create' and a.mode=='complete':
        from case_creation import create_complete
        from datetime import datetime
        facts=json.loads(a.facts.read_text(encoding='utf-8-sig'))
        at=datetime.fromisoformat(a.from_time) if a.from_time else None
        out=create_complete(library,facts,at=at,case_id=a.case_id,template_root=a.template_library)
    elif a.command=='create':
        import tempfile
        from case_library import VISUAL,WORK,CALC,JSON_RE
        from validate_chart_output import validate
        facts=json.loads(a.facts.read_text(encoding='utf-8-sig'))
        errors=validate(facts)
        if errors:raise ValueError(errors)
        if a.mode not in ('transit','return'):library.check_case_binding(a.case_id,facts)
        with tempfile.TemporaryDirectory(prefix='cgm-new-case-') as temp:
            dest=Path(temp)
            if a.mode in ('transit','return'):
                if not a.natal_view:raise ValueError('行运和返照需要 --natal-view 指定案例库中的本命')
                natal=library.view(a.natal_view)
                if natal['mode']!='natal':raise ValueError('关联盘式必须为本命')
                if a.case_id and a.case_id!=natal['case_id']:raise ValueError('本命与新盘必须属于同一案例')
                a.case_id=natal['case_id']
                natal_source=json.loads(library.get_blob(natal['facts']))
                library.check_case_binding(a.case_id,natal_source)
                if a.mode=='return':library.check_case_binding(a.case_id,facts)
                natal_dir=dest/'natal';natal_dir.mkdir()
                natal_facts=natal_dir/'chart-facts-v4.json';natal_facts.write_text(library.get_blob(natal['facts']),encoding='utf-8')
                natal_page=natal_dir/'chart.html';natal_page.write_text(library.render(a.natal_view),encoding='utf-8')
                for match in JSON_RE.finditer(natal_page.read_text(encoding='utf-8')):
                    if match[1]=='chart-variants':(natal_dir/'chart-variants.json').write_text(match[2],encoding='utf-8')
                dest=dest/'new';dest.mkdir()
            if a.mode in ('firdaria','zodiacal-releasing'):
                command=[sys.executable,str(VISUAL/'scripts/render_time_lord_chart.py'),'--natal-input',str(a.facts.resolve()),'--technique',a.mode,'--output-dir',str(dest),'--force']
            elif a.mode=='return':
                command=[sys.executable,str(VISUAL/'scripts/render_return_chart.py'),'--natal-input',str(natal_facts),'--natal-page',str(natal_page),'--output-dir',str(dest),'--force','--no-natal-link']
                if a.from_time:command+=['--from-time',a.from_time]
            else:command=[sys.executable,str(VISUAL/'scripts/render_working_chart.py'),'--input',str(a.facts.resolve()),'--output-dir',str(dest),'--force']
            if a.mode=='transit':command+=['--natal-input',str(natal_facts),'--natal-page',str(natal_page),'--no-natal-link']
            result=subprocess.run(command,capture_output=True,text=True,encoding='utf-8',errors='replace')
            if result.returncode:raise ValueError(result.stderr[-2000:])
            if a.mode=='decennials':
                from calculate_decennials import calculate
                s=(dest/'chart.html').read_text(encoding='utf-8').replace('globalThis.ChartPageMode="natal";','globalThis.ChartDecennialsMode=true;globalThis.ChartPageMode="decennials";',1)
                s=s.replace('</body>','<script id="decennials-data" type="application/json">'+encoded(calculate(facts)).replace('<','\\u003c')+'</script><script>'+(WORK/'decennials-ui.js').read_text(encoding='utf-8')+'</script></body>')
                (dest/'chart.html').write_text(s,encoding='utf-8')
            vid=library.import_page(dest/'chart.html',a.case_id)
        out={'view_id':vid,'case_id':library.view(vid)['case_id'],'mode':a.mode}
    elif a.command=='import':
        ids=[];case=a.case_id
        for page in a.pages:
            vid=library.import_page(page,case);case=case or library.view(vid)['case_id'];ids.append(vid)
        out={'case_id':case,'views':ids}
    elif a.command=='list':out=library.list_views(a.query)
    elif a.command=='open':
        if a.view:library.view(a.view)
        launch(library,a.port,a.settings);out={'url':f'http://127.0.0.1:{a.port}'+('/view/'+a.view if a.view else '/')}
    elif a.command=='notes':
        state=library.state(a.view)
        def readable(key):
            warning=next((w for w in state['warnings'] if w['key']==key),None)
            if warning:return {'damaged':True,'raw':state['entries'][key],'message':warning['message']}
            try:return json.loads(state['entries'].get(key,'{}'))
            except ValueError:return {'damaged':True,'raw':state['entries'][key],'message':unreadable_message(key)}
        out={'revision':state['revision'],'notes':readable('chart-note-layers-v1:{PAGE}'),'records':readable('chart-case-archive-v1:{PAGE}'),'drafts':readable('chart-editor-drafts-v1:{PAGE}'),'warnings':state['warnings']}
    elif a.command=='note-put':out=put_note(library,a.view,json.loads(a.input.read_text(encoding='utf-8-sig')),a.expected_revision)
    elif a.command=='record-put':
        item=json.loads(a.input.read_text(encoding='utf-8-sig'));state=library.state(a.view);key='chart-case-archive-v1:{PAGE}';before=state['entries'].get(key)
        data=json.loads(before or '{"version":2,"records":[]}')
        if item.get('id'):
            if a.expected_revision!=state['revision']:raise Conflict('记录版本已变，请先读取')
            old=next((e for e in data['records'] if e['id']==item['id']),None)
            if old is None:raise ValueError('记录不存在')
            old.update({k:str(item[k]) for k in ('title','date','analysis','feedback') if k in item})
        else:
            from datetime import datetime,timezone
            old={'id':uuid.uuid4().hex,'createdAt':datetime.now(timezone.utc).isoformat(),**{k:str(item.get(k,'')) for k in ('title','date','analysis','feedback')}}
            data['records'].append(old)
        if not old['title'].strip() or not (old['analysis'].strip() or old['feedback'].strip()):raise ValueError('需要标题，分析和反馈至少填写一项')
        out=library.save(a.view,{key:encoded(data)},{key:before},'agent');out={'revision':out['revision']}
    elif a.command=='objects':
        view=library.view(a.view);facts=json.loads(library.get_blob(view['facts']))
        if view['mode'] not in ('decennials','firdaria','zodiacal-releasing'):
            out=[{'key':e['key'],'longitude':e['longitude']} for group in ('planets','angles','lots') for e in facts[group]]
        else:
            d=library.periods(a.view,a.start);start=a.start or str(d['basis']['default_start']);tree=d['schedules'].get(start) or d['schedules'].get('default');path=[int(v) for v in a.path.split(',') if v]
            if any(i<0 for i in path):raise ValueError('运程路径只能使用非负整数')
            if path:
                period_ref(library,a.view,start,path)
            last_parent=3 if view['mode'] in ('decennials','zodiacal-releasing') else 1
            for level,index in enumerate(path):
                if level>=last_parent:raise ValueError('已经到达最后一层运程')
                tree=tree[index][('subs','cycles','days')[level]] if view['mode']=='decennials' else tree[index][5]
            out=[]
            for index,e in enumerate(tree):
                key,obj=period_ref(library,a.view,start,path+[index])
                out.append({'key':key,'start':obj.get('date',obj['startUtc']),'ruler':obj['ruler']})
    elif a.command=='export':
        a.output.parent.mkdir(parents=True,exist_ok=True)
        if a.format=='json':text=encoded(library.export_json(a.view))
        else:
            text=library.render(a.view,export=True)
            import base64,re
            for match in set(re.findall(r'/asset/([a-f0-9]+\.[a-z0-9]+)',text)):
                data=(library.root/'assets'/match).read_bytes();mime='font/ttf' if match.endswith('.ttf') else 'application/octet-stream'
                text=text.replace('/asset/'+match,'data:'+mime+';base64,'+base64.b64encode(data).decode())
        a.output.write_text(text,encoding='utf-8');out={'output':str(a.output.resolve()),'bytes':a.output.stat().st_size}
    elif a.command=='import-records':
        imported=json.loads(a.input.read_text(encoding='utf-8-sig'));out=library.import_records(a.view,imported,a.expected_revision)
        out={'revision':out['revision']}
    elif a.command=='history':
        with library.connect() as c:out=[dict(r) for r in c.execute('SELECT id,key,changed,length(value) AS bytes FROM history WHERE view_id=? ORDER BY id DESC',(a.view,))]
    elif a.command=='restore-entry':
        out=library.restore_entry(a.view,a.history_id,a.expected_revision)
    elif a.command=='backup':out={'backup':library.backup(a.output)}
    else:out=library.stats()
    print(encoded(out))


if __name__=='__main__':main()
