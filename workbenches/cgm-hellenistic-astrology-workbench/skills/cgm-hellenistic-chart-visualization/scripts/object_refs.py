"""Shared case-bound object keys for Agent reads and note writes."""
import json
import re
from urllib.parse import quote, unquote


def period_ref(library, vid, start=None, path=None):
    view = library.view(vid)
    mode = view['mode']
    if mode not in ('decennials', 'firdaria', 'zodiacal-releasing'):
        raise ValueError('该盘式没有运程对象')
    if mode=='zodiacal-releasing' and start is not None and (not str(start).isdigit() or not 0<=int(start)<12):
        raise ValueError('黄道释放起始星座必须是0至11')
    path = [] if path is None else path
    if not isinstance(path, list) or not path or any(type(i) is not int or i < 0 for i in path):
        raise ValueError('运程路径必须是非负整数列表，并包含当前时段索引')
    data = library.periods(vid, start)
    chosen = str(start if start is not None else data['basis']['default_start'])
    if mode=='firdaria' and chosen not in ('default',str(data['basis']['default_start'])):
        raise ValueError('法达起运设置无效')
    tree = data['schedules'].get(chosen) or data['schedules'].get('default')
    if tree is None:
        raise ValueError('起运设置不存在')
    max_levels = 4 if mode == 'decennials' else (4 if mode == 'zodiacal-releasing' else 2)
    if len(path) > max_levels:
        raise ValueError('运程路径超过当前盘式的层数')
    entry = None
    for level, index in enumerate(path):
        if not isinstance(tree, list) or index >= len(tree):
            raise ValueError('运程路径不存在')
        entry = tree[index]
        if level < len(path)-1:
            tree = entry[('subs','cycles','days')[level]] if mode == 'decennials' else entry[5]
    ref = {'version':1, 'caseId':view['case_id'], 'viewId':vid, 'chartType':mode, 'natalUtc':data['basis']['natal_utc'], 'path':path}
    if mode == 'decennials':
        ref.update(startRuler=chosen, level=['major','sub','cycle','day'][len(path)-1], ruler=entry['ruler'], startUtc=entry['start_utc'], endUtc=entry['end_utc'])
        prefix = 'decennials:'
    else:
        ref.update(start=chosen, level=len(path)-1, ruler=entry[0], startUtc=entry[1], endUtc=entry[2], date=entry[3])
        prefix = 'time-lord:'
    return prefix + quote(json.dumps(ref,ensure_ascii=False,separators=(',',':')),safe="~()*!.'-"), ref


def _display_payloads(library, view):
    """Read the stored calculation snapshots, without rendering the whole page."""
    from case_library import JSON_RE
    manifest=json.loads(view['manifest'])
    shell=library.get_blob(manifest['shell'])
    data={}
    for match in JSON_RE.finditer(shell):
        if match[1] not in ('chart-data','chart-variants','natal-variants'):
            continue
        slot=re.fullmatch(r'@@BLOB:([a-f0-9]+)@@',match[2])
        data[match[1]]=json.loads(library.get_blob(slot[1]) if slot else match[2])
    current=list(data.get('chart-variants',{}).get('variants',{}).values())
    if not current:
        current=[data.get('chart-data',{'facts':json.loads(library.get_blob(view['facts']))})]
    natal=list(data.get('natal-variants',{}).get('variants',{}).values())
    return current,natal


def _object_families(library, vid, entries=None):
    from case_library import WORK
    from calculate_chart import BOUND_TABLES
    view=library.view(vid)
    facts=json.loads(library.get_blob(view['facts']))
    current,natal=_display_payloads(library,view)
    planets=list(dict.fromkeys(e['key'] for e in facts['planets']))
    optional=set()
    for payload in current:
        for p in payload.get('outer_planets',[]):
            if p['key'] not in planets:planets.append(p['key'])
        optional.update(p['key'] for points in payload.get('virtual_points',{}).values() for p in points)
        optional.update(p['key'] for p in payload.get('asteroids',[]))
    anchors={e['key'] for group in ('angles','lots') for e in facts[group]}
    code=(WORK/'custom-lots.js').read_text(encoding='utf-8')
    # Match literal default definitions, not the dynamic expression lot('reference_'+key).
    anchors.update(re.findall(r"\blot\('([^']+)'\s*,",code))
    anchors.update('reference_'+k for k in re.findall(r"^\s*\['([^']+)'",code[:code.index('const defaults')],re.M))
    entries=library.state(vid)['entries'] if entries is None else entries
    for key,value in entries.items():
        if key.startswith('chart-custom-lots-v1:'):
            try:
                defs=json.loads(value)
                anchors.update(d['key'] for d in defs if isinstance(d,dict) and isinstance(d.get('key'),str) and d['key'])
            except (TypeError,ValueError):
                pass
    keys=set(planets)|anchors|optional
    keys.update('house_'+str(i) for i in range(1,13))
    keys.update('sign_'+str(i) for i in range(12))
    # The UI identifies bounds by sign and segment index, independent of the
    # chosen table. Include real segments from all supported/saved tables so
    # switching the table never invalidates a note from another saved layer.
    keys.update('bound_'+str(i)+'_'+str(j) for table in BOUND_TABLES.values() for i,row in table.items() for j in range(len(row)))
    for payload in current:
        for i,sign in enumerate(('aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces')):
            keys.update('bound_'+str(i)+'_'+str(j) for j in range(len(payload.get('bound_table',{}).get(sign,[]))))
    if view['mode'] in ('transit','return'):
        # The comparison wheel prefixes its natal planet/optional-point marks;
        # its houses, signs, bounds, axes and lots keep the unprefixed keys.
        for payload in natal:
            keys.update('natal_'+p['key'] for group in ('planets',) for p in payload.get('facts',{}).get(group,[]))
            keys.update('natal_'+p['key'] for p in payload.get('outer_planets',[]))
            keys.update('natal_'+p['key'] for points in payload.get('virtual_points',{}).values() for p in points)
            keys.update('natal_'+p['key'] for p in payload.get('asteroids',[]))
    return keys,planets,anchors


def plain_objects(library, vid, entries=None):
    return _object_families(library,vid,entries)[0]


def aspect_objects(planets,anchors):
    """Only pairs emitted by aspect-diagram.js, never houses or ring segments."""
    pairs=[(a,b) for i,a in enumerate(planets) for b in planets[i+1:]]
    pairs.extend((a,b) for a in anchors for b in planets if a!=b)
    return {'aspect_'+mode+'_'+a+'_'+b for mode in ('whole','light','modern') for a,b in pairs}


def validate_objects(library, vid, objects, previous_objects=(), entries=None):
    if not isinstance(objects,list) or not all(isinstance(o,str) and o and len(o)<5000 for o in objects):
        raise ValueError('关联对象必须是从 objects 查询结果选择的对象键列表')
    if len(set(objects))!=len(objects):
        raise ValueError('关联对象编号重复')
    view=library.view(vid)
    plain=None;aspects=None
    for obj in objects:
        if obj.startswith(('time-lord:','decennials:')):
            try:
                prefix,raw=obj.split(':',1);ref=json.loads(unquote(raw))
                if not isinstance(ref,dict):raise ValueError('运程对象格式无效')
                if type(ref.get('version')) is not int or ref['version']!=1:raise ValueError('运程对象版本无效')
                legacy=ref.get('caseId') is None and ref.get('viewId') is None
                if legacy:
                    if obj not in previous_objects:raise ValueError('旧运程引用缺少案例归属，请重新从当前 objects 读取')
                elif ref.get('caseId')!=view['case_id'] or ref.get('viewId')!=vid:
                    raise ValueError('运程对象必须来自当前案例、当前盘式')
                expected_key,expected=period_ref(library,vid,ref.get('startRuler') if prefix=='decennials' else ref.get('start'),ref.get('path'))
                if prefix!=expected_key.split(':',1)[0] or any(ref.get(k)!=v or type(ref.get(k)) is not type(v) for k,v in expected.items() if k not in ('caseId','viewId')):
                    raise ValueError('运程对象路径或时段与当前盘式不一致')
            except (KeyError,IndexError,TypeError,json.JSONDecodeError) as exc:
                raise ValueError('运程对象格式或路径无效') from exc
        else:
            if plain is None:
                plain,planets,anchors=_object_families(library,vid,entries)
                aspects=aspect_objects(planets,anchors)
            if obj not in plain and obj not in aspects:
                raise ValueError('对象不存在于当前盘式：'+obj)


def validate_note_objects(library,vid,value,previous=None,entries=None):
    data=json.loads(value)
    try:old=json.loads(previous or '{}')
    except ValueError:old={}
    known={(l.get('id'),n.get('id')):n.get('objects',[]) for l in old.get('layers',[]) if isinstance(l,dict) for n in l.get('relations',[]) if isinstance(n,dict)} if isinstance(old,dict) and isinstance(old.get('layers',[]),list) else {}
    for layer in data['layers']:
        for note in layer.get('relations',[]):
            validate_objects(library,vid,note.get('objects',[]),known.get((layer['id'],note['id']),()),entries)
