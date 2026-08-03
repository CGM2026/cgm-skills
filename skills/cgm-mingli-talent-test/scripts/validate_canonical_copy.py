#!/usr/bin/env python3
"""Check that every locked canonical paragraph appears verbatim in a saved report."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


EXPECTED_H2 = [
    "一、这份报告站在什么立场上",
    "二、阅读提示",
    "三、结论先行",
    "四、你反复表现出的观察方式",
    "五、五种体系逐一分析",
    "六、学习路线总图",
    "七、你现在最具体的第一步",
    "八、关于 AI 判断的说明",
    "九、最后，我想重新解释“天赋”",
]
EXPECTED_SYSTEMS = [
    "1. 希腊占星",
    "2. 现代占星",
    "3. 古典占星",
    "4. 八字",
    "5. 紫微斗数",
]
SYSTEM_CONCEPTS = {
    "希腊占星": ["Inception（开端）", "Tychē／Daimōn", "Lots（签点）"],
    "现代占星": ["星座、四元素与行星原型", "相位与格局", "宫位"],
    "古典占星": ["宫位—宫主事务网络", "尊贵", "接纳与互容"],
    "八字": ["十神", "四柱", "五行与月令"],
    "紫微斗数": ["星曜与宫位", "四化与飞化", "身宫"],
}
FIXED_OPENING = """搞定！你的命理天赋诊断已经全部完成了，让我细细讲来。

在这份报告中，我会为你判断你和以下 5 种命理术的适配程度，并提供学习建议：

1. 希腊占星（又称希腊化占星，希腊-罗马占星）
2. 古典占星（特指中世纪-文艺复兴传统）
3. 现代占星
4. 八字
5. 紫微斗数

长庚明说：他必须把希腊占星也塞进来，毕竟这是古典占星（中世纪-文艺复兴传统）的父亲，所谓“万法之源”，几乎可以说是深度占星爱好者必须去通关的最终 BOSS。他说这个 skill 一定要塞点安利向私货，国内现在能意识到并且去学习的人，还是太少了！如果有人适合学习它，那绝对不能错过。

这份报告基于长庚明对于命理术的理解，并结合你在七轮对话中的具体回答，考察你与上述五门命理术的适配关系，所以绝不可能是互联网上烂大街的水货哒~！全部判断都只是有论据的学习建议，不是对你的人格或命运作出最终裁决。

如果你希望继续了解这套诊断方法及相关内容，可以搜索公众号“明语星辰”，会有不少新发现！"""
FIXED_STANCE = """这份报告背后有五个基本立场，是长庚明一直在明确、并且要求我坚持的。接下来的判断与学习建议，都会在这些观念下展开。

1. **命理术是一门描述人生的特殊语言。**它能够组织时间、人物、处境与选择，但不是对命运的最终裁决。
2. **不同命理术像不同语言。**它们渗透着不同历史时期、地区和文化对人生的理解，概念与技法也会因此形成不同重点。
3. **所有人都可以学习命理术。**所谓适配，不是判断谁有没有资格，而是寻找哪一种语言更接近你已有的知识训练与思考方式。
4. **多流派是命理术的正常状态。**流派呈现不同人生经验与心智模型在实操中的差异，并无脱离问题和使用者的绝对高下；可以比较的是结构是否有美感、内部是否自洽，以及与你是否合拍。
5. **这是一份有个人立场的报告。**它浓缩了长庚明的学习经验、人生思考与教学观察，仅供参考；他真切地希望，这份免费内容能帮你少走一些弯路。"""
FIXED_READING = """判断依据来自你的原话、选择理由、现实目标和学习条件，再与五种体系的语言画像相互对照，用四种不同的状态来描述你的适配程度。报告不使用机械分数，也不会把某一道题直接翻译成某一门体系。请把结论看作选择学习入口的地图，而不是新的身份标签。

四种状态分别意味着：

- **主适配**：你天然会用相近的方式理解人生，适合作为优先学习入口。
- **重要互补**：它与你已有的观看方式有共鸣，也能补足你容易忽略的部分。
- **逆向增益**：它未必最顺手，但在合适阶段学习，能有价值地扩展你的观察能力。
- **现阶段暂缓**：它当前的门槛、材料或训练方式与你的目标不够匹配，不等于永远不适合。"""
ALLOWED_STATES = {"主适配", "重要互补", "逆向增益", "现阶段暂缓"}
BAZI_RESOURCE = "公众号‘明语星辰’的过往文章中也有不少八字相关的内容，并且有免费电子书资源，如果你有兴趣，可以前去下载。"
FLOW_FIXED = {
    "八字": [
        "八字各流派面对十神、四柱、五行与月令等共同材料，却会选择不同观察中心。长庚明认为，流派差异不只是技术配方不同，而是不同心智、世界观与人生观形成的方法论差异；一种方法相信人生首先由什么构成，就会优先组织什么。",
        "格局重视结构怎样成立，调候重视人与季节和环境能否呼应，物象重视命局整体构图，旺衰扶抑重视力量分布与制衡，盲派互动则特别关注人物如何携带资源、责任和事件进入人生。",
    ],
    "紫微斗数": [
        "紫微斗数各流派共同使用星曜、宫位、四化与身宫，却会对“什么才是命盘主干”给出不同答案。长庚明认为，这些差异同样来自不同心智与世界观：有人相信位置与角色先构成人生结构，有人则认为资源、权力、认可和压力的流动才真正推动变化。",
        "偏重星曜、宫位与三方四正的传统，侧重组织结构、角色职司与彼此呼应；偏重四化与飞化的传统，更侧重资源流向、行动权、认可和压力怎样沿关系转移。",
    ],
}


def locked_paragraphs(canonical_text: str) -> list[str]:
    body = canonical_text.split("## 八字", 1)[1]
    paragraphs: list[str] = []
    for block in body.split("\n\n"):
        paragraph = block.strip()
        if not paragraph:
            continue
        if paragraph.startswith("#"):
            continue
        if paragraph.startswith("状态："):
            continue
        if paragraph.startswith("个性化适配承接："):
            continue
        paragraphs.append(paragraph)
    return paragraphs


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("report", type=Path)
    parser.add_argument(
        "--canonical",
        type=Path,
        default=Path(__file__).resolve().parent.parent
        / "references"
        / "canonical-report-copy.md",
    )
    args = parser.parse_args()

    canonical = args.canonical.read_text(encoding="utf-8")
    report = args.report.read_text(encoding="utf-8")
    report_blocks = {block.strip() for block in report.split("\n\n") if block.strip()}
    missing = [p for p in locked_paragraphs(canonical) if p not in report_blocks]

    if missing:
        print(f"Canonical copy mismatch: {len(missing)} locked paragraph(s) missing.")
        for index, paragraph in enumerate(missing, 1):
            preview = paragraph.replace("\n", " ")[:100]
            print(f"{index}. {preview}")
        return 1

    errors: list[str] = []
    if "〔" in report or "〕" in report:
        errors.append("Unfilled report-template placeholder found.")

    h1 = re.findall(r"^#\s+(.+)$", report, re.MULTILINE)
    if h1 != ["命理天赋适配测试报告"]:
        errors.append(f"H1 must be the single fixed report title; found {h1}.")

    h2 = re.findall(r"^##\s+(.+)$", report, re.MULTILINE)
    if h2 != EXPECTED_H2:
        errors.append(f"H2 structure/order mismatch; found {h2}.")

    systems = re.findall(r"^###\s+([1-5]\.\s+.+)$", report, re.MULTILINE)
    if systems != EXPECTED_SYSTEMS:
        errors.append(f"System headings must be pure names in fixed order; found {systems}.")

    if FIXED_STANCE not in report:
        errors.append("The five fixed standpoints were changed or personalized.")

    opening_start = report.find("\n\n")
    opening_end = report.find("\n\n## 一、这份报告站在什么立场上")
    if opening_start == -1 or opening_end == -1 or report[opening_start + 2 : opening_end] != FIXED_OPENING:
        errors.append("The fixed report opening was changed or personalized.")

    reading_start = report.find("## 二、阅读提示")
    reading_end = report.find("\n\n## 三、结论先行")
    reading_body = report[reading_start + len("## 二、阅读提示") : reading_end].strip()
    if reading_start == -1 or reading_end == -1 or reading_body != FIXED_READING:
        errors.append("The reading guide and four state definitions must remain verbatim.")

    conclusion_start = report.find("## 三、结论先行")
    conclusion_end = report.find("## 四、你反复表现出的观察方式")
    conclusion = report[conclusion_start:conclusion_end]
    table_rows: list[list[str]] = []
    for line in conclusion.splitlines():
        if not line.startswith("|") or re.match(r"^\|\s*:?-+", line):
            continue
        cells = [cell.strip().replace("**", "") for cell in line.strip("|").split("|")]
        if cells and cells[0] in {name.split(". ", 1)[1] for name in EXPECTED_SYSTEMS}:
            table_rows.append(cells)
    expected_names = [name.split(". ", 1)[1] for name in EXPECTED_SYSTEMS]
    if [row[0] for row in table_rows] != expected_names or any(len(row) != 3 for row in table_rows):
        errors.append("Conclusion table must contain all five systems in fixed order and three columns.")
    else:
        for row in table_rows:
            if row[1] not in ALLOWED_STATES:
                errors.append(f"Invalid long-term state for {row[0]}: {row[1]}.")
            current_state = row[2].split("：", 1)[0].strip()
            if current_state not in ALLOWED_STATES:
                errors.append(f"Current learnability for {row[0]} must begin with one of the four states.")

    observation_start = report.find("## 四、你反复表现出的观察方式")
    observation_end = report.find("## 五、五种体系逐一分析")
    observation = report[observation_start:observation_end]
    if re.search(r"^###\s+", observation, re.MULTILINE):
        errors.append("Observation items must be a numbered list, not level-3 headings.")
    observation_items = re.findall(r"^\d+\.\s+\*\*", observation, re.MULTILINE)
    if not 3 <= len(observation_items) <= 5:
        errors.append("Observation section must contain 3-5 numbered evidence items.")

    for position, numbered_system in enumerate(EXPECTED_SYSTEMS):
        system = numbered_system.split(". ", 1)[1]
        start = report.find(f"### {numbered_system}")
        end = report.find("\n### ", start + 1)
        section = report[start : end if end != -1 else len(report)]
        first_h4 = section.find("\n#### ")
        lead_blocks = [
            block.strip()
            for block in section[len(f"### {numbered_system}") : first_h4].split("\n\n")
            if block.strip()
        ]
        if len(lead_blocks) != 1 or not re.search(
            r"现阶段|当前|目前|现在", lead_blocks[0] if lead_blocks else ""
        ):
            errors.append(
                f"{system} must have one lead paragraph stating current learnability."
            )
        h4 = re.findall(r"^####\s+(.+)$", section, re.MULTILINE)
        expected_h4 = ["它怎样描述人生？", "三个值得先认识的概念"]
        if system in ("八字", "紫微斗数"):
            expected_h4.append("同一门术数，为什么会有不同流派？")
        expected_h4.extend(["为什么你适配？", "你可以怎样开始学习？"])
        if system == "希腊占星":
            expected_h4.append("一点小广告")
        if h4 != expected_h4:
            errors.append(f"{system} level-4 module structure mismatch; found {h4}.")

        h5 = re.findall(r"^#####\s+(.+)$", section, re.MULTILINE)
        for required in SYSTEM_CONCEPTS[system] + ["从哪里开始", "接下来怎样深入", "现在先做什么"]:
            if required not in h5:
                errors.append(f"{system} is missing level-5 heading: {required}.")
        why_start = section.find("#### 为什么你适配？")
        learning_start = section.find("#### 你可以怎样开始学习？")
        why_h5 = re.findall(
            r"^#####\s+(.+)$", section[why_start:learning_start], re.MULTILINE
        )
        if len(why_h5) != 3:
            errors.append(f"{system} must contain exactly three evidence subheadings.")

        if system in FLOW_FIXED:
            flow_start = section.find("#### 同一门术数，为什么会有不同流派？")
            why_start = section.find("#### 为什么你适配？", flow_start)
            flow_body = section[flow_start:why_start].split("\n", 1)[1]
            flow_blocks = [
                block.strip() for block in flow_body.split("\n\n") if block.strip()
            ]
            if len(flow_blocks) != 3 or flow_blocks[:2] != FLOW_FIXED[system]:
                errors.append(
                    f"{system} school explanation must contain two fixed paragraphs and one personalized paragraph."
                )

    forbidden_flow_claims = [
        "格局高低",
        "人物派",
        "命宫天干起四化",
        "口传心授",
        "清晰的学术传承",
    ]
    for claim in forbidden_flow_claims:
        if claim in report:
            errors.append(f"Unverified or oversimplified school claim found: {claim}")

    if "#### 一点小广告" not in report:
        errors.append("Greek astrology ad must be a level-4 heading.")
    if BAZI_RESOURCE not in report:
        errors.append("Bazi public-resource sentence is missing or paraphrased.")

    if errors:
        print(f"Report structure failed: {len(errors)} issue(s).")
        for index, error in enumerate(errors, 1):
            print(f"{index}. {error}")
        return 1

    print("Canonical copy and report structure passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
