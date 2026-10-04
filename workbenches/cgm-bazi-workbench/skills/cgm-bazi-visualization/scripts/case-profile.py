"""Explicit birth/objective-feedback interchange. Does not read research or archive entries."""
import argparse,copy,gzip,hashlib,json,sqlite3,time,zlib
from pathlib import Path
SYSTEM='bazi'
SCHEMA='cgm-case-profile/1'
FIELDS={'name','birth','feedback'}
def encoded(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def digest(value):return hashlib.sha256(encoded(value).encode()).hexdigest()
def validate(value):
    if not isinstance(value,dict) or set(value)-FIELDS:raise ValueError('仅允许姓名、出生资料和明确标注的客观反馈；分析、讨论、研究字段不接收')
    if 'name' in value and (not isinstance(value['name'],str) or len(value['name'])>200):raise ValueError('姓名格式无效')
    if 'birth' in value:
        b=value['birth'];allowed={'calendar','date','time','timezone','location','timeEvidence'}
        if not isinstance(b,dict) or set(b)-allowed:raise ValueError('出生资料含未允许字段')
        for k,keys in [('location',{'name','latitude','longitude','source'}),('timeEvidence',{'kind','precision','source'})]:
            if k in b and (not isinstance(b[k],dict) or set(b[k])-keys):raise ValueError('出生来源字段无效')
        for group,keys in [('location',['name','source']),('timeEvidence',['kind','precision','source'])]:
            if any(not isinstance(b.get(group,{}).get(k,''),str) for k in keys):raise ValueError('出生来源必须为文本')
        for k in ['calendar','date','time','timezone']:
            if k in b and not isinstance(b[k],str):raise ValueError('出生字段必须为文本')
        for k in ['latitude','longitude']:
            n=b.get('location',{}).get(k)
            if n is not None and (type(n) not in (int,float) or not -({'latitude':90,'longitude':180}[k])<=n<=({'latitude':90,'longitude':180}[k])):raise ValueError('坐标无效')
    if 'feedback' in value:
        rows=value['feedback']
        if not isinstance(rows,list) or len(rows)>1000:raise ValueError('客观反馈列表无效')
        seen=set()
        for row in rows:
            if not isinstance(row,dict) or set(row)-{'id','date','text','source','kind','origin'} or row.get('kind')!='objective':raise ValueError('反馈须由用户选定并标注 objective，不自动辨认分析文字')
            if not isinstance(row.get('id'),str) or not row['id'] or row['id'] in seen:raise ValueError('反馈编号无效或重复')
            if any(not isinstance(row.get(k,''),str) for k in ['date','text','source']) or not row.get('text','').strip():raise ValueError('反馈正文无效')
            if 'origin' in row:
                o=row['origin']
                if not isinstance(o,dict) or set(o)!={'system','caseId','id'} or o['system'] not in ['bazi','astrology'] or any(not isinstance(o[k],str) or not o[k] for k in ['caseId','id']):raise ValueError('反馈来源编号无效')
            seen.add(row['id'])
    if len(encoded(value).encode())>1000000:raise ValueError('资料超过1MB')
    return value

def connect(root):
    path=Path(root)/'cases.sqlite3'
    if not path.is_file():raise ValueError('请明确指定已有案例库')
    c=sqlite3.connect(path,timeout=15);c.row_factory=sqlite3.Row;return c

def original(c,cid):
    row=c.execute('SELECT * FROM cases WHERE id=?',(cid,)).fetchone()
    if row is None:raise ValueError('案例不存在；不能按姓名猜测或创建对应关系')
    if SYSTEM=='bazi':
        person=json.loads(gzip.decompress(row['chart']))['person'];b=person.get('birth',{})
        birth={k:copy.deepcopy(b[k]) for k in ['calendar','date','time','timezone','location','timeEvidence'] if k in b}
        return validate({'name':person.get('name',''),'birth':birth,'feedback':[]})
    f=c.execute("SELECT data FROM blobs WHERE id=(SELECT facts FROM views WHERE case_id=? ORDER BY CASE WHEN mode='natal' THEN 0 ELSE 1 END LIMIT 1)",(cid,)).fetchone()
    m=json.loads(zlib.decompress(f['data']))['metadata'];local=m.get('local_datetime','').split('T')
    return validate({'name':row['name'],'birth':{'calendar':'solar','date':local[0],'time':local[1][:8] if len(local)>1 else '', 'timezone':m.get('time_reference',''),'location':{'name':m.get('location_name',''),'latitude':m.get('latitude'),'longitude':m.get('longitude')},'timeEvidence':{'kind':'calculated-input','source':'已有占星事实；新增来源证据由用户补充'}},'feedback':[]})

def read(c,cid):
    default=original(c,cid)
    exists=c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='case_profiles'").fetchone()
    row=c.execute('SELECT * FROM case_profiles WHERE case_id=?',(cid,)).fetchone() if exists else None
    return {'schema':SCHEMA,'system':SYSTEM,'caseId':cid,'revision':row['revision'] if row else 0,'data':json.loads(row['data']) if row else default}

def setup(c):
    c.executescript("CREATE TABLE IF NOT EXISTS case_profiles(case_id TEXT PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL,updated REAL NOT NULL); CREATE TABLE IF NOT EXISTS case_profile_history(id INTEGER PRIMARY KEY,case_id TEXT,data BLOB,revision INTEGER,updated REAL); CREATE TABLE IF NOT EXISTS case_profile_sync(batch TEXT PRIMARY KEY,source_system TEXT,source_case TEXT,target_case TEXT,created REAL);")

def save(c,cid,data,expected):
    now=read(c,cid)
    if now['revision']!=expected:raise ValueError('资料已有更新，请重新读取和核对差异')
    validate(data)
    if set(data)!=FIELDS:raise ValueError('保存须包含完整姓名、出生资料与反馈；请先读取并保留未修改字段')
    if data==now['data']:return now
    c.execute('INSERT INTO case_profile_history(case_id,data,revision,updated) VALUES(?,?,?,?)',(cid,gzip.compress(encoded(now['data']).encode()),expected,time.time()))
    c.execute('INSERT INTO case_profiles VALUES(?,?,?,?) ON CONFLICT(case_id) DO UPDATE SET data=excluded.data,revision=excluded.revision,updated=excluded.updated',(cid,encoded(data),expected+1,time.time()))
    return read(c,cid)

def packet(c,cid,fields,ids=None,confirm=False):
    data=read(c,cid)['data'];fields=set(fields)
    if not fields or fields-FIELDS:raise ValueError('指定 name、birth、feedback 中需要同步的字段')
    selected={k:copy.deepcopy(data[k]) for k in fields}
    if 'feedback' in selected:
        if not confirm or not ids:raise ValueError('反馈必须逐条选定编号，并确认仅含客观内容')
        if set(ids)-{r['id'] for r in selected['feedback']}:raise ValueError('所选反馈不存在')
        selected['feedback']=[r for r in selected['feedback'] if r['id'] in ids]
    return {'schema':SCHEMA,'source':{'system':SYSTEM,'caseId':cid},'data':validate(selected)}

def preview(c,cid,p):
    if set(p)!={'schema','source','data'} or p['schema']!=SCHEMA:raise ValueError('资料交换格式无效')
    src=p['source']
    if not isinstance(src,dict) or set(src)!={'system','caseId'} or src['system'] not in ['bazi','astrology'] or not isinstance(src['caseId'],str):raise ValueError('来源无效')
    if src['system']==SYSTEM:raise ValueError('此入口用于另一套工作台的选定资料')
    incoming=validate(copy.deepcopy(p['data']));current=read(c,cid);next_data=copy.deepcopy(current['data']);changes=[]
    for key,value in incoming.items():
        if key=='feedback':
            byid={r['id']:r for r in next_data['feedback']}
            for row in value:
                # Stable source namespace preserves two systems' independent event IDs.
                origin=row.get('origin') or {'system':src['system'],'caseId':src['caseId'],'id':row['id']}
                mapped_id=origin['id'] if origin['system']==SYSTEM and origin['caseId']==cid else origin['system']+':'+origin['caseId']+':'+origin['id']
                mapped={**row,'id':mapped_id,'origin':origin}
                old=byid.get(mapped['id'])
                if old!=mapped:changes.append({'field':'feedback:'+mapped['id'],'before':old,'after':mapped});byid[mapped['id']]=mapped
            next_data['feedback']=list(byid.values())
        elif next_data.get(key)!=value:
            changes.append({'field':key,'before':next_data.get(key),'after':value});next_data[key]=value
    return {'schema':'cgm-profile-plan/1','target':{'system':SYSTEM,'caseId':cid},'revision':current['revision'],'currentDigest':digest(current['data']),'packet':p,'changes':changes,'result':next_data,'recalculateSuggested':any(x['field'] in ['name','birth'] for x in changes),'batch':digest({'target':{'system':SYSTEM,'caseId':cid},'packet':p})}

def apply(c,cid,plan,confirmed):
    if not confirmed:raise ValueError('请先核对差异，并确认来源与目标为同一人')
    if plan.get('target')!={'system':SYSTEM,'caseId':cid}:raise ValueError('核对方案与目标案例不一致')
    setup(c);c.execute('BEGIN IMMEDIATE')
    old=c.execute('SELECT * FROM case_profile_sync WHERE batch=?',(plan.get('batch'),)).fetchone()
    if old:return {**read(c,cid),'alreadyApplied':True}
    actual=preview(c,cid,plan['packet'])
    if actual!=plan:raise ValueError('方案或目标资料发生变化，请重新核对；不能静默覆盖')
    result=save(c,cid,actual['result'],actual['revision']);src=plan['packet']['source']
    c.execute('INSERT INTO case_profile_sync VALUES(?,?,?,?,?)',(plan['batch'],src['system'],src['caseId'],cid,time.time()))
    return {**result,'recalculateSuggested':plan['recalculateSuggested'],'existingChartRetained':True}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--library',required=True);p.add_argument('--case',required=True)
    sub=p.add_subparsers(dest='command',required=True);sub.add_parser('show')
    s=sub.add_parser('put');s.add_argument('--input',required=True);s.add_argument('--revision',type=int,required=True)
    s=sub.add_parser('export');s.add_argument('--fields',required=True);s.add_argument('--feedback-id',action='append');s.add_argument('--confirm-objective',action='store_true');s.add_argument('--output',required=True)
    s=sub.add_parser('preview');s.add_argument('--input',required=True);s.add_argument('--output',required=True)
    s=sub.add_parser('apply');s.add_argument('--plan',required=True);s.add_argument('--confirm-person',action='store_true')
    a=p.parse_args()
    def load(path):return json.loads(Path(path).read_text(encoding='utf-8-sig'))
    with connect(a.library) as c:
        if a.command=='show':result=read(c,a.case)
        elif a.command=='put':setup(c);c.execute('BEGIN IMMEDIATE');result=save(c,a.case,validate(load(a.input)),a.revision)
        elif a.command=='export':result=packet(c,a.case,a.fields.split(','),a.feedback_id,a.confirm_objective)
        elif a.command=='preview':result=preview(c,a.case,load(a.input))
        else:result=apply(c,a.case,load(a.plan),a.confirm_person)
        if getattr(a,'output',None):Path(a.output).write_text(encoded(result),encoding='utf-8')
        print(encoded(result))
if __name__=='__main__':
    try:main()
    except (ValueError,KeyError,TypeError) as e:raise SystemExit(str(e))
