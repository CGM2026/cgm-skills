#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""现代占星公开版 · 安装自检 / 冒烟测试（傻瓜式一键）。

用法:
  python3 scripts/selfcheck.py          # 只检查，不改环境
  python3 scripts/selfcheck.py --fix    # 缺依赖时自动 pip 安装后再检查

退出码: 0=全部通过(开箱即用)  非0=有项未过(报告会指明缺什么/怎么修)
"""
import os, sys, json, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FIX = "--fix" in sys.argv
_fail = 0

def ok(m):   print("[ OK ]", m)
def bad(m):  globals().__setitem__("_fail", _fail + 1); print("[FAIL]", m)
def warn(m): print("[warn]", m)

print("=" * 52)
print(" 现代占星公开版 · 安装自检")
print("=" * 52)

# 1) Python 版本
if sys.version_info >= (3, 8):
    ok("Python %s" % sys.version.split()[0])
else:
    bad("Python 版本过低 %s（需 ≥ 3.8）" % sys.version.split()[0])

# 2) 依赖（可自动安装）
def ensure(mod, pip_name):
    global _fail
    try:
        __import__(mod); ok("依赖 %s 已就绪" % pip_name); return True
    except ImportError:
        if not FIX:
            bad("缺依赖 %s（加 --fix 自动装，或手动: pip install %s）" % (pip_name, pip_name)); return False
        warn("缺 %s，尝试自动安装…" % pip_name)
        for extra in ([], ["--break-system-packages"]):
            r = subprocess.run([sys.executable, "-m", "pip", "install", "-q", pip_name] + extra)
            try:
                __import__(mod); ok("依赖 %s 安装成功" % pip_name); return True
            except ImportError:
                continue
        bad("依赖 %s 自动安装失败，请手动: pip install %s" % (pip_name, pip_name)); return False

deps_ok = ensure("PIL", "pillow")
deps_ok = ensure("numpy", "numpy") and deps_ok

# 3) 关键文件存在 + 可解析
def need(rel):
    p = os.path.join(ROOT, rel)
    if os.path.exists(p): ok("存在 %s" % rel); return p
    bad("缺文件 %s" % rel); return None

def parse_json(rel, jsonl=False):
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p): bad("缺文件 %s" % rel); return
    try:
        if jsonl:
            n = 0
            with open(p, encoding="utf-8") as f:
                for ln in f:
                    ln = ln.strip()
                    if ln: json.loads(ln); n += 1
            ok("%s 可解析（%d 条）" % (rel, n))
        else:
            json.load(open(p, encoding="utf-8")); ok("%s 可解析" % rel)
    except Exception as e:
        bad("%s 解析失败: %s" % (rel, e))

parse_json("member.json")
parse_json("data/lexicon-reviewed.jsonl", jsonl=True)
parse_json("data/grammar-reviewed.json")
parse_json("data/core_order.json")
parse_json("data/semantic_types.json")
need("scripts/lookup.py")
need("scripts/render_card.py")
need("scripts/assets/qr_clean.png")
need("scripts/assets/fonts/NotoSerifSC-Regular.otf")
need("scripts/assets/fonts/NotoSerifSC-Bold.otf")

# 4) 乱码扫描：文本文件不得含 NUL，且须是合法 UTF-8
for r, _, fs in os.walk(ROOT):
    for f in fs:
        if f.endswith((".md", ".json", ".jsonl", ".py", ".txt")):
            fp = os.path.join(r, f); rel = os.path.relpath(fp, ROOT)
            raw = open(fp, "rb").read()
            if b"\x00" in raw:
                bad("%s 含 NUL 空字节（乱码）" % rel)
            try:
                raw.decode("utf-8")
            except UnicodeDecodeError:
                bad("%s 不是合法 UTF-8" % rel)
ok("乱码扫描完成（文本文件 UTF-8 / 无 NUL）")

# 5) 冒烟测试：起卦 → 出图
if deps_ok and _fail == 0:
    try:
        r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "lookup.py"), "oneshot", "draw"],
                           capture_output=True, text=True)
        if r.returncode == 0 and "抽取结果" in r.stdout:
            ok("冒烟·起卦取义 通过")
        else:
            bad("冒烟·起卦失败: %s" % (r.stderr or r.stdout)[:200])
        r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "lookup.py"), "score", "L1", "L1", "L1"],
                           capture_output=True, text=True)
        ok("冒烟·打分 通过") if (r.returncode == 0 and "句子分" in r.stdout) else bad("冒烟·打分失败")
        d = tempfile.mkdtemp()
        reading = {"date": "2026.01.01", "product": "赛博占卜.skill - 现代占星公开版",
                   "account": "明语星辰", "question": "自检",
                   "solutions": [{"score": 85, "symbols": "月亮·巨蟹座·第4宫", "qian": "家中的情绪是温柔的",
                                  "items": [{"symbol": "第4宫", "pos": "名词", "sense": "家"},
                                            {"symbol": "月亮", "pos": "名词", "sense": "情绪"},
                                            {"symbol": "巨蟹座", "pos": "形容词", "sense": "温柔的"}],
                                  "reading": "冒烟测试。"}]}
        rj = os.path.join(d, "r.json")
        json.dump(reading, open(rj, "w", encoding="utf-8"), ensure_ascii=False)
        r = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "render_card.py"), rj, os.path.join(d, "card.png")],
                           capture_output=True, text=True)
        pngs = [x for x in os.listdir(d) if x.endswith(".png")]
        ok("冒烟·出图 通过（%s）" % pngs[0]) if pngs else bad("冒烟·出图失败: %s" % (r.stderr or r.stdout)[:200])
    except Exception as e:
        bad("冒烟测试异常: %s" % e)
else:
    warn("依赖未就绪或前序检查有误，跳过冒烟测试")

print("=" * 52)
if _fail == 0:
    print("结果: 全部通过 ✓  —— 开箱即用。")
    sys.exit(0)
else:
    print("结果: %d 项未通过 ✗  —— 请按上面 [FAIL] 提示修复。" % _fail)
    sys.exit(1)
