"""Loopback-only page and record service, launched by the visualization skill."""
import argparse
import gzip
import hashlib
import json
import mimetypes
import os
import re
import secrets
import tempfile
import time
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from case_library import Library,Conflict,encoded,safe,LABELS,WORK
from record_validation import MAX_REQUEST_BYTES


def serve(root,port,settings_path=None):
    library=Library(root);token=secrets.token_urlsafe(32)
    from method_settings import RECOMMENDED,default_path,read_settings,save_settings
    settings_path=Path(settings_path or default_path()).resolve()
    origin=f'http://127.0.0.1:{port}'
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def output(self,value,status=200,kind='application/json; charset=utf-8'):
            data=value if isinstance(value,bytes) else (encoded(value) if kind.startswith('application/json') else value).encode('utf-8')
            self.send_response(status);self.send_header('Content-Type',kind)
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Cache-Control','no-store' if not self.path.startswith('/asset/') else 'public, max-age=31536000, immutable')
            if len(data)>1024 and 'gzip' in self.headers.get('Accept-Encoding',''):
                data=gzip.compress(data,compresslevel=3);self.send_header('Content-Encoding','gzip');self.send_header('Vary','Accept-Encoding')
            self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        def allowed_host(self):
            return self.headers.get('Host') in (f'127.0.0.1:{port}',f'localhost:{port}')
        def do_GET(self):
            if not self.allowed_host():return self.output({'error':'仅接受本机入口'},403)
            route=urlparse(self.path);args=parse_qs(route.query)
            try:
                if route.path=='/health':return self.output({'ready':True,'library':hashlib.sha256(str(library.root).encode()).hexdigest(),'pid':os.getpid()})
                if route.path=='/':
                    from html import escape
                    items=''.join('<li>'+escape(v['name'])+' · <a href="/view/'+v['id']+'">'+LABELS[v['mode']]+'</a></li>' for v in library.list_views())
                    return self.output('<!doctype html><meta charset="utf-8"><title>本地案例</title><style>body{max-width:720px;margin:50px auto;background:#fffdf8;color:#655644;font:18px/2 serif}a{color:inherit}</style><h1>本地案例</h1><ul>'+items+'</ul>',kind='text/html; charset=utf-8')
                if route.path.startswith('/view/'):
                    return self.output(library.render(route.path.split('/')[-1],token),kind='text/html; charset=utf-8')
                if route.path.startswith('/asset/'):
                    name=route.path.split('/')[-1]
                    if not re.fullmatch(r'[a-f0-9]{64}\.[a-z0-9]+',name):raise ValueError('资源路径无效')
                    f=library.root/'assets'/name
                    return self.output(f.read_bytes(),kind=mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
                if route.path=='/api/case-remarks':
                    from case_remarks import read_remarks
                    return self.output(read_remarks(library.db,args['view'][0]))
                if route.path=='/api/state':
                    state=library.state(args['view'][0])
                    if str(state['revision'])==args.get('since',[''])[0]:return self.output(b'',204)
                    return self.output(state)
                if route.path=='/api/periods':return self.output(library.periods(args['view'][0],args.get('start',[None])[0]))
                if route.path=='/api/method-defaults':
                    settings=read_settings(settings_path) if settings_path.is_file() else None
                    return self.output({'settings':settings,'recommended':RECOMMENDED})
                return self.output({'error':'入口不存在'},404)
            except Exception as e:self.output({'error':str(e)},400)
        def do_POST(self):
            if not self.allowed_host() or self.headers.get('Origin') not in (origin,None) or self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.output({'error':'请求来源无效'},403)
            body={}
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=MAX_REQUEST_BYTES:raise ValueError('请求过大或为空；本机保存请求上限为32MB')
                body=json.loads(self.rfile.read(length))
                if not isinstance(body,dict):raise ValueError('请求必须是对象')
                if self.headers.get('X-Case-Token',body.get('token',''))!=token:return self.output({'error':'请刷新案例页面后重试'},403)
                if self.path=='/api/case-remarks':
                    from case_remarks import put_remarks
                    result=put_remarks(library.db,body['view'],body['text'],body['version'])
                    return self.output(result,409 if result.get('conflict') else 200)
                if self.path=='/api/save':return self.output(library.save(body['viewId'],body['changes'],body['previous']))
                if self.path=='/api/method-defaults':
                    return self.output({'settings':save_settings(settings_path,body.get('methods'))})
                if self.path=='/api/restore-entry':return self.output(library.restore_entry(body['viewId'],body['historyId'],body['expectedRevision']))
                if self.path=='/api/adjust-time':
                    # Existing calculator bridge is retained behind the library API.
                    # Materialize source inputs only for this calculation, not as case copies.
                    import time_adjust_server as legacy
                    legacy.PROJECT=library.root.parent
                    from case_library import JSON_RE
                    vid=body['viewId'];view=library.view(vid);manifest=json.loads(view['manifest'])
                    with tempfile.TemporaryDirectory(prefix='cgm-case-calculate-') as temp:
                        dest=Path(temp)
                        def materialize(v,path):
                            path.mkdir(exist_ok=True);m=json.loads(v['manifest']);text=library.render(v['id'],token)
                            (path/'chart.html').write_text(text,encoding='utf-8')
                            for name,key in m['extras'].items():(path/name).write_text(library.get_blob(key),encoding='utf-8')
                            if not (path/'input.json').exists():
                                from calculate_display_snapshots import input_from_facts
                                (path/'input.json').write_text(encoded(input_from_facts(json.loads(library.get_blob(v['facts'])))),encoding='utf-8')
                            for match in JSON_RE.finditer(text):
                                if match[1]=='chart-variants':(path/'chart-variants.json').write_text(match[2],encoding='utf-8')
                        materialize(view,dest/'current')
                        natal=next((v for v in library.list_views() if v['case_id']==view['case_id'] and v['mode']=='natal'),None)
                        if natal and view['mode']!='natal':
                            materialize(library.view(natal['id']),dest/'natal')
                            (dest/'current/natal-page.txt').write_text(str(dest/'natal/chart.html'),encoding='utf-8')
                        result=legacy.build(dest/'current/chart.html',body['local_datetime'],False)
                        if body.get('save') is True:
                            from case_creation import create_complete
                            f=json.loads(library.get_blob(view['facts']));settings=f['settings']
                            key='|'.join(['sidereal_lahiri' if settings.get('ayanamsa')=='lahiri' else settings['zodiac'],settings['primary_house_system'],settings['bound_system']])
                            calibrated=result['bundle']['variants'][key]['facts']
                            created=create_complete(library,calibrated)
                            result.update(html=origin+'/view/'+created['views']['natal'],case_id=created['case_id'],views=created['views'],case_name=calibrated['metadata'].get('chart_name') or '未命名案例')
                        return self.output(result)
                return self.output({'error':'接口不存在'},404)
            except Conflict as e:
                result={'error':str(e),'conflict':True}
                if body.get('viewId'):
                    state=library.state(body['viewId']);keys=body.get('changes',{})
                    if not isinstance(keys,dict):keys={}
                    entries={k:state['entries'].get(k) for k in keys}
                    result['current']={'revision':state['revision'],'entries':entries}
                    result['conflicts']={k:{'previous':body.get('previous',{}).get(k),'local':v,'current':entries[k]} for k,v in keys.items() if entries[k]!=body.get('previous',{}).get(k) and entries[k]!=v}
                self.output(result,409)
            except Exception as e:self.output({'error':str(e)},400)
    ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--library',type=Path,required=True);p.add_argument('--port',type=int,default=4860);p.add_argument('--settings',type=Path)
    a=p.parse_args();serve(a.library,a.port,a.settings)
