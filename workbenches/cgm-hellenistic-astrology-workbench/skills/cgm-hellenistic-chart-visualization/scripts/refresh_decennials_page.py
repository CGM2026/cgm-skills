"""Refresh the generated decennials UI without touching its saved archive data."""
from pathlib import Path
import argparse
import json
import re

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'assets/working-page/work'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('page', type=Path)
    args = parser.parse_args()
    page = args.page.resolve()
    html = page.read_text(encoding='utf-8')
    data_file = page.with_name('decennials.json')
    data = json.loads(data_file.read_text(encoding='utf-8'))
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    html, data_count = re.subn(r'(<script id="decennials-data" type="application/json">).*?(</script>)',
                               lambda match: match[1] + payload + match[2],
                               html, count=1, flags=re.S)
    if data_count != 1:
        raise ValueError('Decennials data block is missing')
    for script in ('detail-panel.js', 'decennials-ui.js'):
        source = (WORK / script).read_text(encoding='utf-8')
        if script == 'detail-panel.js':
            marker = r'<script>\(\(\) => \{\s*const side=document\.querySelector\('\
                r"'\.side'\)"
        else:
            marker = r'<script>\(\(\) => \{\s*if\(!globalThis\.ChartDecennialsMode\)return;'
        html, count = re.subn(marker + r'.*?</script>',
                              lambda _match: '<script>' + source + '</script>',
                              html, count=1, flags=re.S)
        if count != 1:
            raise ValueError(f'Missing {script} in {page}')
    css = (WORK / 'visual-refinements.css').read_text(encoding='utf-8')
    for selector in ('.folio .archive-save-controls{',
                     '.folio .archive-save-controls .archive-save-status{',
                     '.folio .chart-bottom .tools .decennials-start-trigger{'):
        match = re.search(re.escape(selector) + r'[^}]*}', css)
        if not match:
            raise ValueError(f'Missing CSS rule {selector}')
        html, count = re.subn(re.escape(selector) + r'[^}]*}',
                              lambda _match: match.group(), html, count=1)
        if count != 1:
            raise ValueError(f'Missing embedded CSS rule {selector}')
    arrow = css[css.index('.folio .decennials-major>summary::before'):css.index('.folio .decennials-start-dialog{')]
    html = re.sub(r'\.folio \.decennials-major>summary::before[^\n]*\n'
                  r'\.folio \.decennials-major\[open\]>summary::before[^\n]*\n',
                  lambda _match: arrow, html, count=1)
    if '.folio .decennials-cycles{' not in html:
        cycle = css[css.index('.folio .decennials-cycles{'):css.index('.folio .decennials-sub table{')]
        html = html.replace('.folio .decennials-sub table{', cycle + '.folio .decennials-sub table{', 1)
    mobile = re.search(r'@media\(max-width:600px\)\{\.folio \.decennials-card\{[^\n]*', css)
    if mobile:
        html = re.sub(r'@media\(max-width:600px\)\{\.folio \.decennials-card\{[^\n]*',
                      lambda _match: mobile.group(), html, count=1)
    page_styles = ''
    for name in ('decennials-major-pages', 'decennials-two-modes',
                 'decennials-flat-tables', 'decennials-age-layout',
                 'decennials-major-pager'):
        pattern = r'/\* ' + re.escape(name) + r' \*/.*?/\* end-' + re.escape(name) + r' \*/\s*'
        block = re.search(pattern, css, flags=re.S)
        if not block:
            raise ValueError(f'Missing {name} stylesheet')
        page_styles += block.group() + '\n'
        html = re.sub(pattern, '', html, count=1, flags=re.S)
    html = html.replace('</style>', page_styles + '</style>', 1)
    html = html.replace('<span aria-current="page">十年运盘</span>', '<span aria-current="page">十年九月运盘</span>')
    html = html.replace(' · 十年运盘 · 纸面工作稿</title>', ' · 十年九月运盘 · 纸面工作稿</title>')
    page.write_text(html, encoding='utf-8')


if __name__ == '__main__':
    main()
