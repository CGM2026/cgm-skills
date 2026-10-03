"""Attach the current portable license disclosure outside image capture areas."""
from pathlib import Path
import re
WORK=Path(__file__).resolve().parents[1]/'assets/working-page/work'
def _append(source,tag,addition):
    positions=[m.start() for m in re.finditer(r'<script\b[^>]*>.*?</script\s*>|<style\b[^>]*>.*?</style\s*>|<!--.*?-->|</(?:head|body)\s*>',source,re.I|re.S) if re.fullmatch(r'</'+tag+r'\s*>',m[0],re.I)]
    if not positions:raise ValueError('HTML is missing document closing '+tag)
    i=positions[-1];return source[:i]+addition+source[i:]
def attach(source):
    source=re.sub(r'<footer\b[^>]*\bid="cgm-license-footer"[^>]*>.*?</footer>','',source,flags=re.S)
    source=re.sub(r'<style id="cgm-license-style">.*?</style>','',source,flags=re.S)
    source=re.sub(r'<script id="cgm-license-layout">.*?</script>','',source,flags=re.S)
    source=_append(source,'head','<style id="cgm-license-style">'+(WORK/'license-footer.css').read_text(encoding='utf-8')+'</style>')
    return _append(source,'body',(WORK/'license-footer.html').read_text(encoding='utf-8')+'<script id="cgm-license-layout">'+(WORK/'license-footer-layout.js').read_text(encoding='utf-8')+'</script>')
