"""Attach calculator-owned optional snapshots to the display bundle."""
import sys,json
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,'__CALCULATOR_SKILL__/scripts')
from calculate_display_snapshots import attach_asteroids
p=Path('work/print-study/variants.json');bundle=json.loads(p.read_text(encoding='utf-8-sig'))
attach_asteroids(bundle,Path('work/ephemeris'))
p.write_text(json.dumps(bundle,ensure_ascii=False),encoding='utf-8')
