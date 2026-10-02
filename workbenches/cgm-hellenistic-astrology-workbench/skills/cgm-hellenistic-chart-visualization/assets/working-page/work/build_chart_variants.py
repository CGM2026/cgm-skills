"""Prepare drawing payloads from calculated display snapshots."""
import json,sys
from pathlib import Path
sys.dont_write_bytecode=True
calculator=Path('__CALCULATOR_SKILL__')
sys.path.insert(0,str(calculator/'scripts'))
from calculate_display_snapshots import calculate_variants,bundle_metadata
sys.path.insert(0,str(Path('work/cgm-hellenistic-chart-visualization/scripts').resolve()))
from render_chart import prepare
original=json.loads(Path('outputs/排盘可视化示例/chart-facts-v4.json').read_text(encoding='utf-8-sig'))
unavailable={}
calculated,houses=calculate_variants(original,unavailable)
directory=Path('work/print-study/variants');directory.mkdir(parents=True,exist_ok=True)
variants={}
for key,entry in calculated.items():
    target=directory/(key.replace('|','-')+'.json')
    target.write_text(json.dumps(entry['facts'],ensure_ascii=False),encoding='utf-8')
    variants[key]={**prepare(target,calculator),**entry}
bundle = {**bundle_metadata(original,variants,houses,unavailable),'variants':variants}
Path('work/print-study/variants.json').write_text(json.dumps(bundle, ensure_ascii=False), encoding='utf-8')
print(f'{len(variants)} chart variants calculated and validated; default facts unchanged.')

# Keep optional lunar-point snapshots synchronized with regenerated variants.
import runpy
runpy.run_path("work/build_virtual_points.py",run_name="__main__")
runpy.run_path("work/build_asteroids.py",run_name="__main__")
