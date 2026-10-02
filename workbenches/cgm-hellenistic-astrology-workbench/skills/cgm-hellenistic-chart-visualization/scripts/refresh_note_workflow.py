"""Update note workflow scripts and styles while preserving archive contents."""
import argparse
import re
from pathlib import Path

WORK = Path(__file__).resolve().parents[1] / 'assets/working-page/work'

def refresh(page):
    html = page.read_text(encoding='utf-8')
    markers = {
        'case-archive-v2.js': "const storage='chart-case-archive-v1:'",
        'object-layer-notes.js': 'const layer=()=>globalThis.ChartNoteLayers?.current();',
    }
    for name, marker in markers.items():
        source = (WORK / name).read_text(encoding='utf-8')
        matches = [m for m in re.finditer(r'<script>(.*?)</script>', html, re.S) if marker in m[1]]
        if len(matches) != 1:
            raise ValueError(f'{page}: expected one {name}')
        match = matches[0]
        html = html[:match.start()] + '<script>' + source + '</script>' + html[match.end():]
    pattern = r'/\* period-note-workflow \*/.*?/\* end-period-note-workflow \*/'
    css = re.search(pattern, (WORK / 'visual-refinements.css').read_text(encoding='utf-8'), re.S).group()
    html = re.sub(pattern, '', html, flags=re.S)
    html = html.replace('</style>', css + '\n</style>', 1)
    page.write_text(html, encoding='utf-8')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('pages', type=Path, nargs='+')
    for page in parser.parse_args().pages:
        refresh(page)
