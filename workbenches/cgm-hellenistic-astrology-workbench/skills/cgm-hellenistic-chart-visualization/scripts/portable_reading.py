"""Package the case's existing views as one offline, read-only HTML document."""
import base64
import json
import re
import os
import subprocess
import shutil
from datetime import datetime, timezone, timedelta
from pathlib import Path

def safe(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')

def document(pages, assets, initial, fonts=None):
    payload=dict(schema='cgm-reading/1',created=datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M UTC+8'),initial=initial,pages=pages,assets=assets,fonts=fonts or [])
    text=''.join(p['html'] for p in pages.values())+json.dumps(pages,ensure_ascii=False)
    payload['unicodeRange']=','.join('U+'+format(cp,'X') for cp in sorted(set(ord(c) for c in text if ord(c)>=32)))
    runtime=(Path(__file__).resolve().parents[1]/'assets/portable-reader.js').read_text(encoding='utf-8')
    return '''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>工作台阅读副本</title><style>html,body{margin:0;height:100%;background:#fffdf8}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><noscript>此预览未启用页面交互。请用支持 JavaScript 的浏览器打开；也可以让 Agent 在电脑端导出图片。</noscript><iframe title="案例阅读工作页" sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"></iframe><script id="cgm-reading-data" type="application/json">'''+safe(payload)+'''</script><script>
globalThis.CGMReadingBundle=JSON.parse(document.getElementById('cgm-reading-data').textContent);
const runtime='''+safe(runtime)+''';
globalThis.CGMReadingOpen=id=>{
 const b=CGMReadingBundle,p=b.pages[id];if(!p)return;
 let text=p.html.replace(/\\/asset\\/([a-f0-9]+\\.[a-z0-9]+)/g,(m,key)=>b.assets[key]||m);
 text=text.replace(/<style([^>]*)>([\\s\\S]*?)<\\/style>/gi,(m,attrs,css)=>'<style'+attrs+'>'+css.replace(/@font-face\\s*\\{([^}]+)\\}/g,(f,body)=>'@font-face{'+body+';unicode-range:'+b.unicodeRange+';}')+'</style>');
 const boot='<script>globalThis.CGMReadingView='+JSON.stringify(id)+';'+runtime+'<\\/script>';
 text=text.replace(/<head([^>]*)>/i,(m)=>m+boot);
 document.querySelector('iframe').srcdoc=text;
};CGMReadingOpen(CGMReadingBundle.initial);
</script></body></html>'''

def assets_for(root, pages, node=None):
    assets={}
    text=''.join(p['html'] for p in pages.values())+json.dumps(pages,ensure_ascii=False)
    node=node or os.environ.get('CGM_ASTRO_NODE') or os.environ.get('CGM_BAZI_NODE') or shutil.which('node')
    if not node:raise ValueError('生成阅读副本需要已安装的 Node；请指定 CGM_ASTRO_NODE 或 CGM_BAZI_NODE。')
    helper=Path(__file__).with_name('portable-fonts.cjs')
    for page in pages.values():
        for key in re.findall(r'/asset/([a-f0-9]+\.[a-z0-9]+)',page['html']):
            if key not in assets:
                mime='font/ttf' if key.endswith('.ttf') else 'application/octet-stream'
                if key.endswith('.ttf'):
                    result=subprocess.run([node,str(helper),str(root/'assets'/key)],input=text,text=True,encoding='utf-8',capture_output=True,timeout=60)
                    if result.returncode:raise ValueError(result.stderr)
                    data=result.stdout.strip()
                else:data=base64.b64encode((root/'assets'/key).read_bytes()).decode()
                assets[key]='data:'+mime+';base64,'+data
    return assets
