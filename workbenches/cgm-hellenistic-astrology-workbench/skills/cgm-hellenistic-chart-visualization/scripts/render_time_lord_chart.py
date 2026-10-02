"""Render calculated firdaria / releasing periods in an independent chart page."""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

VISUAL = Path(__file__).resolve().parents[1]
WORK = VISUAL / 'assets/working-page/work'
CALC = VISUAL.parent / 'cgm-calculate-astrology-chart/scripts'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--natal-input', required=True, type=Path)
    parser.add_argument('--technique', choices=['firdaria','zodiacal-releasing'], required=True)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    out = args.output_dir.resolve()
    if (out/'chart.html').exists() and not args.force:
        parser.error('Page exists; use --force for an authorized rebuild')
    out.mkdir(parents=True, exist_ok=True)
    period_file = out/'time-lords.json'
    subprocess.run([sys.executable,str(CALC/'calculate_time_lords.py'),'--natal-input',str(args.natal_input),'--technique',args.technique,'--output',str(period_file)],check=True)
    subprocess.run([sys.executable,str(VISUAL/'scripts/render_working_chart.py'),'--input',str(args.natal_input),'--output-dir',str(out),'--force'],check=True)
    page = out/'chart.html'
    source = page.read_text(encoding='utf-8')
    name = '法达' if args.technique == 'firdaria' else '黄道释放'
    source = source.replace('globalThis.ChartPageMode="natal";', 'globalThis.ChartTimeLordMode='+json.dumps(args.technique)+';globalThis.ChartPageMode='+json.dumps(args.technique)+';',1)
    source = source.replace(' · 纸面工作稿</title>', ' · '+name+' · 纸面工作稿</title>',1)
    source = re.sub(r'<span aria-current="page">本命(?:盘)?</span>', '<span aria-current="page">'+name+'</span>',source,count=1)
    payload = period_file.read_text(encoding='utf-8').replace('<','\\u003c')
    source = source.replace('</body>', '<script id="time-lord-data" type="application/json">'+payload+'</script><script>'+(WORK/'time-lord-ui.js').read_text(encoding='utf-8')+'</script></body>',1)
    page.write_text(source,encoding='utf-8')
    manifest=out/'visualization.json'
    info=json.loads(manifest.read_text(encoding='utf-8'));info.update(mode=args.technique,period_data=str(period_file))
    manifest.write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf-8')
    print(str(page))


if __name__ == '__main__':
    main()
