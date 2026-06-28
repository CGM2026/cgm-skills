#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
明语星辰 · 赛博占卜 · 分享卡片渲染（v7，D-062/D-063）
把"一次正向解读"渲染成可保存/分享的 PNG。一个解法一张卡片（多解法→多张）。

确定性：版式/配色/尺寸全部硬编码；纸纹用固定随机种子生成；字体优先用套件内打包字体
（assets/fonts/NotoSerifSC-*.otf），任何环境都用同一套字形 → 任何 agent 用相同输入跑本脚本，
产出逐像素一致的图片。打包字体缺失时才退到系统候选字体（多平台），再退到默认字体。

清晰度：整体按 UPS=2 渲染（卡片宽 1520px），高分屏不糊。
二维码：用预抠图的 assets/qr_clean.png（浅色透明、黑块纯黑、中心 logo 保留），
alpha 合成到纸底，不再出现灰膏药。缺失时回退到 qr_gongzhonghao.jpg 实时抠图。

仅用于正向（符号→人话）。反向（人话→符号）不出卡片（由调用方控制）。
无问题时：提问与解读两块留空（不画），其余照常。

用法：
  python3 render_card.py reading.json out.png    # 单解法→out.png；多解法→out_1.png …
  python3 render_card.py --demo out.png          # 内置示例
reading.json：date / product / account / question? / qr_path? / disclaimer? /
  solutions:[ {score, symbols, qian, items:[{symbol,pos,sense}], reading?} ]
"""
import json, os, sys, re
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

UPS = 2

W = 760 * UPS
PAD = 56 * UPS
CW = W - 2 * PAD
DATE, TABLE, SMALL, LOW = 44 * UPS, 26 * UPS, 17 * UPS, 14 * UPS
QIAN_MIN, QIAN_MAX = 46 * UPS, 64 * UPS
LSP = 6 * UPS
G_HEAD, G_QIAN, G_DIV, G_INFO, G_TABLE, G_READ = (
    30 * UPS, 30 * UPS, 22 * UPS, 22 * UPS, 12 * UPS, 34 * UPS)
NOISE_SEED = 7

SUR = (245, 236, 222); INK = (34, 30, 25); INK2 = (150, 140, 128)
INFO = (110, 102, 92); LN = (225, 214, 198); BORDER = (223, 212, 196)
MORANDI = [(174, 190, 201), (216, 198, 189), (190, 202, 195), (138, 158, 172)]

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "assets", "fonts")

FONT_REG = [
    (os.path.join(FONTS, "NotoSerifSC-Regular.otf"), 0),
    ("/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc", 2),
    ("C:/Windows/Fonts/msyh.ttc", 0),
    ("C:/Windows/Fonts/simsun.ttc", 0),
    ("/System/Library/Fonts/Songti.ttc", 0),
    ("/System/Library/Fonts/PingFang.ttc", 0),
]
FONT_BLD = [
    (os.path.join(FONTS, "NotoSerifSC-Bold.otf"), 0),
    ("/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc", 2),
    ("C:/Windows/Fonts/msyhbd.ttc", 0),
    ("C:/Windows/Fonts/simhei.ttf", 0),
    ("/System/Library/Fonts/Songti.ttc", 1),
    ("/System/Library/Fonts/PingFang.ttc", 0),
]


def _resolve(cands):
    for path, idx in cands:
        if os.path.exists(path):
            return path, idx
    return None, 0


_REG = _resolve(FONT_REG)
_BLD = _resolve(FONT_BLD)
_FONT_CACHE = {}


def font(s, b=False):
    s = int(s)
    key = (s, b)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]
    path, idx = _BLD if b else _REG
    try:
        f = ImageFont.truetype(path, s, index=idx)
    except Exception:
        f = ImageFont.load_default()
    _FONT_CACHE[key] = f
    return f


# 词性→英文缩写（卡片"符号·词汇对应"列强制使用，规则锁死在此处，唯一权威）。
POS_ABBR = {"名词": "n.", "noun": "n.", "object": "n.", "location": "n.", "场景": "n.",
            "对象": "n.", "主体": "n.", "中心": "n.", "领域": "n.", "限定": "n.",
            "动词": "v.", "verb": "v.", "形容词": "adj.", "adjective": "adj.",
            "副词": "adv.", "adverb": "adv."}
# 本质尊贵等"状态标签"非词性，原样显示在括号内（沿用 D-069）。
POS_STATE = {"入庙", "擢升", "失势", "落陷", "无", "三分", "界", "外观"}
DISCLAIMER = ("特别声明：以上为符号联想的启发式解读，仅作个人成长与自我认识参考，"
              "非事实预测或决策建议；AI 可能产生不准确的回应，无法保证 100% 正确；"
              "涉及健康/财务/法律等只作象征探讨，不替代专业意见；任何重大决定需咨询专业人士")


def asc(f): return f.getmetrics()[0]
_M = ImageDraw.Draw(Image.new("RGB", (10, 10)))
def tw(s, f): return _M.textlength(s, font=f)
def lh(f, e=0):
    a, d = f.getmetrics(); return a + d + e


def wrap(s, f, m):
    o, c = [], ""
    for ch in s:
        if tw(c + ch, f) <= m:
            c += ch
        else:
            o.append(c); c = ch
    if c:
        o.append(c)
    return o or [""]


def clines(s, f, m):
    P, c = [], ""
    for ch in s:
        c += ch
        if ch in "，,":
            P.append(c); c = ""
    if c:
        P.append(c)
    o = []
    for p in P:
        o += wrap(p, f, m)
    return o or [""]


def fit_qian(text, m, lo=QIAN_MIN, hi=QIAN_MAX):
    for size in range(hi, lo - 1, -1):
        f = font(size, True)
        ls = clines(text, f, m)
        if len(ls) <= 2:
            return f, ls
    f = font(lo, True)
    return f, clines(text, f, m)


def abbr(p):
    """卡片词性列：强制归一化。任何带词性的 pos（含『名词·主体』『形容词(中心)』等
    复合写法）一律锁定输出 n./adj./v./adv.；状态标签（入庙/落陷…）原样保留；其余原样。"""
    s = str(p).strip()
    if not s:
        return ""
    head = re.split(r"[·（(／/、,，\s]", s)[0].strip()
    if head in POS_ABBR:
        return POS_ABBR[head]
    if s in POS_STATE or head in POS_STATE:
        return s
    for k, v in (("名词", "n."), ("形容词", "adj."), ("动词", "v."), ("副词", "adv.")):
        if k in s:
            return v
    return s


def disp_sense(pos, sense):
    """卡片义项列显示锁定：词性为 adj. 的义项一律以形容词面貌呈现（缺『的/地』则补『的』）。"""
    s = str(sense).strip()
    if s and abbr(pos) == "adj." and not s.endswith(("的", "地", "的。")):
        s += "的"
    return s


def paper(size, base):
    w, h = size
    rng = np.random.default_rng(NOISE_SEED)
    n = np.clip(rng.normal(128, 8, (h, w)), 0, 255).astype("uint8")
    noise = Image.fromarray(n, "L").convert("RGB").filter(ImageFilter.GaussianBlur(0.4 * UPS))
    return Image.blend(Image.new("RGB", size, base), noise, 0.045)


def swatch(dr, x, y, w, h=10 * UPS):
    seg = w / len(MORANDI)
    for i, c in enumerate(MORANDI):
        dr.rectangle([x + i * seg, y, x + (i + 1) * seg - 1, y + h], fill=c)


def _cutout_from_jpg(im):
    a = np.asarray(im.convert("RGB")).astype(float)
    mx = a.max(2); mn = a.min(2); L = (mx + mn) / 2 / 255
    S = np.where(mx == mn, 0, (mx - mn) / (255 - np.abs(mx + mn - 255) + 1e-9))
    logo = (S > 0.22) & (L > 0.15) & (L < 0.92)
    alpha = np.clip((0.82 - L) / (0.82 - 0.30), 0, 1)
    out = np.zeros((*L.shape, 4), dtype=np.uint8)
    out[..., 3] = (alpha * 255).astype(np.uint8)
    for k in range(3):
        out[logo, k] = a[logo, k].astype(np.uint8)
    out[logo, 3] = 255
    return Image.fromarray(out, "RGBA")


def load_qr(qr_path):
    clean = os.path.join(HERE, "assets", "qr_clean.png")
    if not qr_path and os.path.exists(clean):
        return Image.open(clean).convert("RGBA")
    if not qr_path:
        qr_path = os.path.join(HERE, "assets", "qr_gongzhonghao.jpg")
    elif not os.path.isabs(qr_path):
        qr_path = os.path.join(HERE, qr_path)
    if not os.path.exists(qr_path):
        return None
    try:
        im = Image.open(qr_path)
    except Exception:
        return None
    if im.mode == "RGBA" or qr_path.lower().endswith(".png"):
        return im.convert("RGBA")
    return _cutout_from_jpg(im)


def render_one(sh, sol, idx, out):
    f_date = font(DATE, True)
    f_qian, qnl = fit_qian((sol.get("qian", "") or "").rstrip("。."), CW)
    f_meta = font(SMALL, True); f_info = font(SMALL); f_low = font(LOW); f_low_b = font(LOW, True)
    f_sym = font(TABLE, True); f_sense = font(TABLE)

    score = sol.get("score"); symbols = sol.get("symbols", ""); items = sol.get("items", [])
    disc = sh.get("disclaimer") or DISCLAIMER
    product = sh.get("product", "赛博占卜.skill - 现代占星")
    account = sh.get("account", "明语星辰")
    qr = sh.get("_qr")

    ql = wrap(sh.get("question", ""), f_low_b, CW) if sh.get("question") else []
    rl = wrap(sol.get("reading", ""), f_low, CW) if sol.get("reading") else []
    qrs = 112 * UPS; dw = CW - qrs - 28 * UPS; dl = wrap(disc, f_low, dw)
    dh = lh(f_date); LSTEP = lh(f_low, LSP)

    H = (PAD + dh + G_HEAD + len(qnl) * lh(f_qian, 8 * UPS) + G_QIAN + UPS + G_DIV
         + lh(f_info) + G_INFO + len(items) * lh(f_sym, 18 * UPS) + G_TABLE
         + (len(ql) + len(rl)) * LSTEP + G_READ + qrs + PAD)

    img = paper((W, H), SUR)
    dr = ImageDraw.Draw(img)
    dr.rectangle([9 * UPS, 9 * UPS, W - 10 * UPS, H - 10 * UPS], outline=BORDER, width=UPS)

    y = PAD
    dr.text((PAD, y), sh.get("date", ""), font=f_date, fill=INK)
    swatch(dr, W - PAD - 240 * UPS, y + 4 * UPS, 240 * UPS, 10 * UPS)
    dr.text((W - PAD - tw(product, f_meta), y + asc(f_date) - asc(f_meta)), product, font=f_meta, fill=INK)
    y += dh + G_HEAD
    for ln in qnl:
        dr.text((PAD, y), ln, font=f_qian, fill=INK); y += lh(f_qian, 8 * UPS)
    y += G_QIAN
    dr.line([(PAD, y), (W - PAD, y)], fill=LN, width=UPS); y += UPS + G_DIV
    dr.text((PAD, y), f"原典契合度：{score}%" if score is not None else "", font=f_info, fill=INFO)
    rt = f"解法 {idx}"; dr.text((W - PAD - tw(rt, f_info), y), rt, font=f_info, fill=INFO)
    if symbols:
        dr.text(((W - tw(symbols, f_info)) / 2, y), symbols, font=f_info, fill=INFO)
    y += lh(f_info) + G_INFO
    col2 = PAD + 216 * UPS
    for it in items:
        dr.text((PAD, y), f"{it.get('symbol','')}（{abbr(it.get('pos',''))}）", font=f_sym, fill=INK)
        dr.text((col2, y), disp_sense(it.get("pos", ""), it.get("sense", "")), font=f_sense, fill=INK)
        y += lh(f_sym, 18 * UPS)
    y += G_TABLE
    for ln in ql:
        dr.text((PAD, y), ln, font=f_low_b, fill=INK); y += LSTEP
    for ln in rl:
        dr.text((PAD, y), ln, font=f_low, fill=INK); y += LSTEP
    y += G_READ
    fy = y; qx = W - PAD - qrs; dy = fy
    for ln in dl:
        dr.text((PAD, dy), ln, font=f_low, fill=INK2); dy += LSTEP
    if qr is not None:
        q = qr.resize((qrs, qrs), Image.LANCZOS)
        img.paste(q, (qx, fy), q)
    else:
        dr.rectangle([qx, fy, qx + qrs, fy + qrs], outline=INK2, width=2 * UPS)
    cta = f"更多分享见公众号：{account}"
    dr.text((qx - 20 * UPS - tw(cta, f_low_b), fy + qrs - lh(f_low)), cta, font=f_low_b, fill=INK)
    swatch(dr, PAD, fy + qrs - 12 * UPS, 200 * UPS, 10 * UPS)

    img.save(out, "PNG")
    return out, (W, H)


def render(d, out):
    d["_qr"] = load_qr(d.get("qr_path"))
    sols = d.get("solutions", [])
    stem, ext = os.path.splitext(out)
    res = []
    for i, sol in enumerate(sols, 1):
        target = out if len(sols) == 1 else f"{stem}_{i}{ext or '.png'}"
        res.append(render_one(d, sol, i, target))
    return res


DEMO = {
    "date": "2026.06.25", "product": "赛博占卜.skill - 现代占星", "account": "明语星辰",
    "question": "我和父母的人生选择总是聊不到一起，这种隔阂能消除吗？",
    "solutions": [{
        "score": 85, "symbols": "火星·双鱼座·第七宫",
        "qian": "一对一关系里，是敏感而混沌的争斗",
        "items": [{"symbol": "火星", "pos": "名词", "sense": "争斗/冲突"},
                  {"symbol": "双鱼座", "pos": "形容词", "sense": "敏感的/无界限的"},
                  {"symbol": "第七宫", "pos": "名词", "sense": "一对一关系"}],
        "reading": "符号把你和父母之间照成一段对等、各守立场、正面交锋的关系——更像两个对手在争（火星），争里裹着说不清、易上头的情绪（双鱼）。先承认彼此是对手般的两个人，反而比硬套亲子更容易松动。"}]
}


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__); return
    if args[0] == "--demo":
        out = args[1] if len(args) > 1 else "card.png"
        for p, size in render(DEMO, out):
            print(f"[demo] saved {p} {size}")
        return
    with open(args[0], encoding="utf-8") as f:
        d = json.load(f)
    out = args[1] if len(args) > 1 else "card.png"
    for p, size in render(d, out):
        print(f"saved {p} {size}")


if __name__ == "__main__":
    main()
