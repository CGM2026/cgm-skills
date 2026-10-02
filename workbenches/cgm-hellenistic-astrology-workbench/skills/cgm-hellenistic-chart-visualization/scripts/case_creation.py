"""One complete-case entry point shared by the CLI and calibration service."""
import hashlib
import json
import subprocess
import sys
import tempfile
from datetime import datetime,timezone
from pathlib import Path
from case_library import LABELS,encoded


def create_complete(library,facts,*,at=None,case_id=None,template_root=None):
    from validate_chart_output import validate
    errors=validate(facts)
    if errors:raise ValueError(errors)
    at=at or datetime.now(timezone.utc)
    if at.tzinfo is None:raise ValueError('创建时刻需要时区')
    at=max(at,datetime.fromisoformat(facts['metadata']['utc_datetime']))
    identity=encoded({k:facts['metadata'].get(k) for k in ('utc_datetime','latitude','longitude','chart_name')})
    cid=case_id or hashlib.sha256(identity.encode()).hexdigest()[:16]
    library.check_case_binding(cid,facts)
    modes={v['mode'] for v in library.list_views()}
    if template_root or set(LABELS)<=modes:
        from complete_case import CompleteCaseBuilder
        # Swiss Ephemeris configuration is process-global. Serialize builders
        # when the HTTP service creates cases in multiple worker threads.
        with library.lock:
            builder=CompleteCaseBuilder(library,template_root or library.root)
            try:return builder.create(facts,at=at,case_id=cid)
            finally:builder.close()
    # Bootstrap the standard renderers for the first library. Each child uses
    # the same natal binding guard; a retry only adds missing views.
    from calculate_display_snapshots import calculate_at_instant
    views={v['mode']:v['id'] for v in library.case_views(cid)}
    reused=set(views)==set(LABELS)
    if reused:return {'case_id':cid,'views':views,'reused':True}
    with tempfile.TemporaryDirectory(prefix='cgm-complete-first-') as temp:
        natal_file=Path(temp)/'natal.json';natal_file.write_text(encoded(facts),encoding='utf-8')
        transit_file=Path(temp)/'transit.json';transit_file.write_text(encoded(calculate_at_instant(facts,at)),encoding='utf-8')
        for mode in LABELS:
            if mode in views:continue
            command=[sys.executable,str(Path(__file__).with_name('library_cli.py')),'--library',str(library.root),'create','--facts',str(transit_file if mode=='transit' else natal_file),'--mode',mode,'--case-id',cid]
            if mode in ('transit','return'):command+=['--natal-view',views['natal']]
            if mode=='return':command+=['--from-time',at.isoformat()]
            result=subprocess.run(command,capture_output=True,text=True,encoding='utf-8',errors='replace')
            if result.returncode:raise ValueError('六盘式创建中断，重试可补齐：'+result.stderr[-1500:])
            views[mode]=json.loads(result.stdout.strip().splitlines()[-1])['view_id']
    return {'case_id':cid,'views':views,'reused':False}
