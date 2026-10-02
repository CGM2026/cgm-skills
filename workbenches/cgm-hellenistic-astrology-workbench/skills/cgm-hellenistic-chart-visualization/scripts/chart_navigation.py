"""Shared navigation labels; update navigation only, never user notes."""
import html
import os
import re
from pathlib import Path

LABELS = {'本命盘':'本命','行运盘':'行运','返照盘':'返照','十年运盘':'十年九月大运','十年九月运盘':'十年九月大运'}
NAV = r'<nav class="chart-type-switch"[^>]*>.*?</nav>'


def normalize(source):
    def replace(match):
        text = match[0]
        for old, new in LABELS.items():
            text = text.replace('>'+old+'<', '>'+new+'<')
        return text
    return re.sub(NAV, replace, source, count=1, flags=re.S)


def connect_pages(pages):
    for current, page in pages.items():
        page = Path(page).resolve()
        nav = '<nav class="chart-type-switch" aria-label="盘式">'
        for label, target in pages.items():
            if label == current:
                nav += '<span aria-current="page">'+label+'</span>'
            else:
                href = os.path.relpath(Path(target).resolve(), page.parent).replace('\\','/')
                nav += '<a href="'+html.escape(href, quote=True)+'">'+label+'</a>'
        nav += '</nav>'
        source = page.read_text(encoding='utf-8')
        source, count = re.subn(NAV, lambda _:nav, source, count=1, flags=re.S)
        if count != 1:
            raise ValueError('Missing navigation '+str(page))
        page.write_text(source, encoding='utf-8')
