#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""占星签文式解读 · 取词与算分工具（运行时 skill 配套）

用法：
  python3 lookup.py oneshot draw            # 一步到位：随机抽一组 + 直接列三符号义项（首选，省往返）
  python3 lookup.py oneshot 火星 天秤座 第十宫  # 一步到位：给定三符号 + 直接列义项
  python3 lookup.py senses 火星 天秤座 第十宫    # 只列义项
  python3 lookup.py score L2 L1 L1           # 给定三槽来源层级算句子分与可过档
  python3 lookup.py draw                     # 只真随机抽一组

数据：同目录 ../data/lexicon-reviewed.jsonl 与 ../data/grammar-reviewed.json
"""
import json, os, sys, random, re

HERE = os.path.dirname(os.path.abspath(__file__))

_CN2N = {"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10,"十一":11,"十二":12}
def norm_house(s):
    """容错：任何宫位写法→数字版『第N宫』（第十宫/十宫/10宫/第10宫 等）；非宫位原样返回。"""
    t = str(s).strip()
    if not t.endswith("宫"):
        return t
    core = t[:-1]
    if core.startswith("第"):
        core = core[1:]
    core = core.strip()
    if core.isdigit():
        n = int(core)
    elif core in _CN2N:
        n = _CN2N[core]
    else:
        return t
    return f"第{n}宫" if 1 <= n <= 12 else t

DATA = os.path.join(HERE, "..", "data")

def load_lexicon():
    rows = []
    with open(os.path.join(DATA, "lexicon-reviewed.jsonl"), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows

# 星座/宫位 名称归一化：接受现行流行译名与常见省写，统一映射到本词典原书标签。
# 现代词典沿用《当代占星研究》旧译：牡羊座(Aries)、宝瓶座(Aquarius)；其余十座与流行译名一致。
ALIAS = {
    # 两处与流行译名不同的（核心修订）
    "白羊座": "牡羊座", "白羊": "牡羊座", "牡羊": "牡羊座",
    "水瓶座": "宝瓶座", "水瓶": "宝瓶座", "宝瓶": "宝瓶座",
    # 其余十座：容忍省略「座」字及个别异名
    "金牛": "金牛座", "双子": "双子座", "巨蟹": "巨蟹座", "狮子": "狮子座",
    "处女": "处女座", "室女": "处女座", "室女座": "处女座",
    "天秤": "天秤座", "天平座": "天秤座", "天平": "天秤座",
    "天蝎": "天蝎座", "射手": "射手座", "人马座": "射手座", "人马": "射手座",
    "摩羯": "摩羯座", "山羊座": "摩羯座",
    "双鱼": "双鱼座",
}
_HZ = "一二三四五六七八九十"
def _norm_house(s):
    m = re.fullmatch(r"第?\s*(\d{1,2})\s*宫", s)
    if m:
        n = int(m.group(1))
        if 1 <= n <= 12:
            cn = _HZ[n-1] if n <= 10 else "十" + _HZ[n-11]
            return f"第{cn}宫"
    m = re.fullmatch(r"([一二三四五六七八九十]+)宫", s)
    if m:
        return "第" + m.group(1) + "宫"
    return s

def normalize_label(lab):
    lab = lab.strip()
    if lab in ALIAS:
        return ALIAS[lab]
    return norm_house(lab)

def senses(labels, rows=None):
    rows = rows if rows is not None else load_lexicon()
    labels = [normalize_label(l) for l in labels]
    for lab in labels:
        items = [r for r in rows if r["label"] == lab]
        if not items:
            print(f"\n# {lab}  (未找到，请检查符号名，如『火星』『天秤座』『第十宫』)")
            continue
        print(f"\n# {lab}")
        by_pos = {}
        for r in items:
            by_pos.setdefault((r["pos"], r["category"]), []).append(r)
        for (pos, cat), lst in by_pos.items():
            terms = "，".join(f"{r['term']}({r['review_level']})" for r in lst)
            extra = []
            if any(r.get("combo_priority") == "low" for r in lst):
                extra.append("低组合优先级")
            if any(r.get("modifier_use") == "domain_slot" for r in lst):
                extra.append("领域/场景槽")
            tag = ("  ["+ "/".join(extra) +"]") if extra else ""
            print(f"  [{pos}/{cat}]{tag}: {terms}")

SCORE = {"L1": 100, "L2": 70, "L3": 40, "L4": 88}

def score(levels):
    s = [SCORE[x] for x in levels]
    arity = len(levels)
    penalty = 15 if arity >= 3 else 0
    base = 0.6 * min(s) + 0.4 * (sum(s) / len(s))
    final = max(0, min(100, round(base - penalty)))
    tiers = []
    has_l3 = "L3" in levels
    if not has_l3 and final >= 80: tiers.append("严格")
    if not has_l3 and final >= 60: tiers.append("标准")
    if final >= 40: tiers.append("探索")
    print(f"槽位层级={levels}  句子分={final}  可过档位={tiers or ['（均不过，需更高层级义项）']}")
    print("提示：分数=离原书多远，非正确概率；解读是否『答到问题』另由契合三态判断。")

def draw_trio(rows=None):
    rows = rows if rows is not None else load_lexicon()
    pools = {"PLANET": [], "SIGN": [], "HOUSE": []}
    for r in rows:
        pre = r["symbol_id"].split("-")[0]
        if pre in pools and r["label"] not in pools[pre]:
            pools[pre].append(r["label"])
    return random.choice(pools["PLANET"]), random.choice(pools["SIGN"]), random.choice(pools["HOUSE"])

def draw():
    p, s, h = draw_trio()
    print(f"{p}·{s}·{h}")
    print(f"（随机抽取 行星={p} 星座={s} 宫位={h}）")

def oneshot(args):
    """一次拿全：可选随机抽取 + 直接列三符号义项。减少 agent 往返。"""
    rows = load_lexicon()
    if not args or args[0] == "draw":
        p, s, h = draw_trio(rows)
        print(f"抽取结果：{p}·{s}·{h}")
        print(f"（行星={p} 星座={s} 宫位={h}）")
        labels = [p, s, h]
    else:
        labels = args
        print(f"指定符号：{'·'.join(labels)}")
    print("\n— 各符号可调用义项（带层级 L1原书/L2推导/L3AI/L4人工）—")
    senses(labels, rows)
    print("\n下一步：据义项各挑一支组签文；每个解法跑 `score <三槽层级>` 算句子分。")

def main():
    if len(sys.argv) < 2:
        print(__doc__); return
    cmd = sys.argv[1]
    if cmd == "oneshot":
        oneshot(sys.argv[2:])
    elif cmd == "senses":
        senses(sys.argv[2:])
    elif cmd == "score":
        lv = sys.argv[2:]
        if not lv or any(x not in SCORE for x in lv):
            print("用法: python3 lookup.py score L2 L1 L1   (取值 L1/L2/L3/L4)"); return
        score(lv)
    elif cmd == "draw":
        draw()
    else:
        print(__doc__)

if __name__ == "__main__":
    main()
