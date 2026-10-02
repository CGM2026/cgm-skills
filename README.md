# 长庚明公开 Skills

这里收录长庚明公开发布的 AI Skills，主要用于排盘与可视化工作台、玄学文本研究、符号系统重构，以及面向大众的占卜与命理适配体验。

## 最新更新｜2026-10-03 · 两个工作台 v1.0.0

新增 **长庚明八字工作台** 与 **长庚明希腊占星工作台**。它们将排盘、可视化、案例保存和图层笔记连接成一套流程：向 Agent 提供时间地点，打开命盘工作页，记录观察，再继续整理、比较和分享。

### 长庚明八字工作台

- **四柱与岁运排盘**：根据出生时间、地点与时间依据生成命盘，计算大运、小运及流年、流月、流日；Agent 可以按指定日期查询对应运势数据。
- **三种书页工作页**：岁运、流月、流日分别展示，配合原局与运势查看，适合研究、教学和持续记录。
- **五组算法选择**：时间口径、子时排法、年柱换年、起运算法、小运排法，分为「四柱排法」「起运与小运」两页；首次使用确认个人默认。
- **算法比较试算**：在工作页调整口径，先计算并查看差异，再另存新案例；命盘保存实际采用的口径。
- **案例与图层笔记**：在本地管理案例、对象笔记与档案；Agent 可以读取、整理并写回同一份资料，后续继续打开研究。
- **数据与展示导出**：提供结构化命盘 JSON、独立 HTML、PNG 及以 PNG 为内容的 SVG 容器；独立 HTML 可离线查看，日常编辑与保存通过本机案例库进行。

[查看八字工作台](workbenches/cgm-bazi-workbench) · [安装与首次使用](workbenches/cgm-bazi-workbench/INSTALL.md)

### 长庚明希腊占星工作台

- **结构化占星排盘**：根据日期、准确时间、时区和地点，计算七颗传统行星、四轴、宫位、界、福点与精神点，并校验盘面事实。
- **六种盘式工作页**：本命、行运、返照、十年九月运、法达星限、黄道释放，集中在同一案例中浏览与记录。
- **个人方法设置**：可设置回归或恒星黄道、岁差、界系统与宫位系统；首次使用说明推荐方案，由用户确认后保存。
- **盘面与独立笔记图层**：笔记可关联盘面对象，各盘式保留自己的图层，方便追踪不同技法的观察与研究过程。
- **Agent 与网页协作**：Agent 可以查找已有案例、读取笔记和档案、整理后写回；本地案例库持续保存资料并支持备份。
- **多种输出方式**：提供结构化事实 JSON、独立 HTML、PNG 及以 PNG 为内容的 SVG 容器；完整工作页编辑和动态计算使用本机服务。

[查看希腊占星工作台](workbenches/cgm-hellenistic-astrology-workbench) · [安装与首次使用](workbenches/cgm-hellenistic-astrology-workbench/INSTALL.md)

### 下载与使用

每套工作台都包含 **统一入口、排盘、可视化** 三个独立 Skill。日常使用安装完整组合，开发者也可以单独调用排盘成员，基于结构化数据继续开发。

- **固定安装来源**：本仓库的 `main` 分支，两个工作台分别位于 `workbenches/cgm-bazi-workbench` 与 `workbenches/cgm-hellenistic-astrology-workbench`。后续修复沿用相同目录和安装入口。
- **独立下载包**：[v1.0.0 发布页](https://github.com/Damocles1112/cgm-skills/releases/tag/workbenches-v1.0.0)分别提供两个完整 ZIP。
- **首次实测**：先阅读对应安装说明，检查环境、确认个人默认，再用随包虚构资料生成第一个案例。日常案例与设置保存在用户工作目录。

两个工作台与仓库原创内容统一采用 **AGPL-3.0-only**，允许使用、修改和继续开发；第三方资源保留各自许可。

## 全部公开内容

| Skill | 中文名 | 功能 |
| --- | --- | --- |
| [八字工作台](workbenches/cgm-bazi-workbench) | 长庚明八字工作台 | 八字排盘、五组算法设置、HTML 工作页、案例管理、图层笔记与导出。包含统一入口、排盘、可视化三个成员。 |
| [希腊占星工作台](workbenches/cgm-hellenistic-astrology-workbench) | 长庚明希腊占星工作台 | 占星排盘、本命与推运六盘工作页、案例管理、图层笔记与导出。包含统一入口、排盘、可视化三个成员。 |
| [`cgm-reconstruct-symbols`](skills/cgm-reconstruct-symbols) | 玄学理论基础｜长庚明玄学符号重构法 | 从历史玄学文本中识别、审计并重构抽象符号系统，提炼核心洞见、现实映射与系统交互关系，输出专业研究报告和零基础短篇教科书。 |
| [`cyber-astro-modern-public`](skills/cyber-astro-modern-public) | 赛博占卜｜现代占星·智能解读（公开版） | 即开即用的现代占星占卜工具：随机起卦或使用你已有的星象，围绕你关心的问题给出通俗易懂的解读，并自动生成可分享的精美卡片。 |
| [`cgm-mingli-talent-test`](skills/cgm-mingli-talent-test) | 命理测试｜五种命理术·天赋适配诊断 | 通过七轮渐进对话，识别你与希腊占星、古典占星、现代占星、八字和紫微斗数的适配关系，并生成可解释的 Markdown 与 PDF 学习报告。 |
| [`cgm-diagnose-esoteric-practice`](skills/cgm-diagnose-esoteric-practice) | 玄学经营诊断｜Esoteric Practice Diagnosis | 围绕一项具体经营困境连续问诊，从人生目的、玄学承担的功能、客户关系、能力、交付与现实反馈中，找到最早发生错位的一环。 |

## cgm-reconstruct-symbols

这个 Skill 不把玄学符号当作现成关键词，而是把历史文本视为符号的使用记录，追问：

- 一部文本包含哪些符号系统；
- 每套系统映射现实中的什么；
- 不同系统如何共同描述世界；
- 符号含义为何在不同场景中变化；
- 哪些结论有证据，哪些只是现代联想；
- 怎样用最短的话，让零基础读者看懂整套体系。

适用于占星、八字、紫微斗数、奇门遁甲、大六壬、塔罗、卢恩、炼金术等传统。它用于历史文本和抽象符号系统研究，不用于一般文学象征、普通符号学或纯图像分析。

## cyber-astro-modern-public

一个独立、即开即用的现代占星占卜工具。你可以让它随机起一卦，或直接给出你已有的「行星—星座—宫位」，再说出想问的问题——事业、感情、人际、自我成长都行。它会用通俗的语言给你一段贴近处境的解读，并自动生成一张可分享的精美卡片。

特点：

- **随机起卦或自带星象**，两种方式任选；
- **围绕你的问题作答**，也可以不带问题，只看当下的星象写照；
- **多角度参考**：同一组星象常常给出几种不同读法；
- **精美可分享**：每次解读自动生成排版讲究的卡片，便于收藏与转发；
- **自包含、开箱即用**：内置词典、脚本、二维码与中文字体，无需联网或额外配置。

它以成熟的现代占星体系为依据，话说得有依据、留有余地，不夸大、不下死话。占卜结果为启发式的象征性解读，供参考与自我探索，并非事实预测或决策建议；涉及健康、财务、法律等仅作象征探讨，不替代专业意见。

## cgm-mingli-talent-test

一个用七轮渐进对话完成的命理天赋适配测试。它比较你与希腊占星、古典占星、现代占星、八字和紫微斗数的适配关系，并生成完整的 Markdown 与 PDF 报告。

特点：

- **逐题完成七轮对话**：可以选择一个或多个选项，也可以完全用自己的话表达；
- **同时比较五种命理语言**：不把一道题机械换算成某一门体系；
- **不做数值评分**：结论来自对话证据、体系语言与解释性判断，不输出百分比或天赋排名；
- **用“缘分”重新理解天赋**：报告描述当前的连接、学习入口与摩擦，不裁定能力上限；
- **双格式报告**：同时生成便于复核的 Markdown 与适合阅读分享的 PDF。

AI 生成的判断并不完全可靠。如果报告与你的真实经历、内在感受或长期认识强烈不符，应优先尊重你自己的判断；这份报告是一种可以讨论和修正的观察，不是由 AI 替你作出的裁决。

## cgm-diagnose-esoteric-practice

一个面向玄学从业者与准备从业者的经营问诊工具。它一次只处理一项具体困境，不做全面商业体检，也不进行命理预测。

它不会直接罗列通用经营建议，而会通过连续追问，沿“人生所求 → 玄学承担的功能 → 客户与价值交换 → 经营动作 → 现实结果”向上追溯，找出最早断裂的一环。

适合讨论是否从业、继续进修、客户定位、内容平台、课程与咨询、流派与证书，以及阶段性收入或经营瓶颈。最终输出一个有事实依据、能够被反证的核心裁决；证据不足时，则给出需要补充的信息或最小验证动作。

## 安装

### 两个排盘与可视化工作台

两个工作台各有独立目录，成员需要一起下载并保持相邻。安装地址固定，后续版本更新继续使用同一地址：

- [长庚明八字工作台](https://github.com/Damocles1112/cgm-skills/tree/main/workbenches/cgm-bazi-workbench)：先读目录中的 [安装说明](workbenches/cgm-bazi-workbench/INSTALL.md)，入口为 `cgm-bazi-suite`。
- [长庚明希腊占星工作台](https://github.com/Damocles1112/cgm-skills/tree/main/workbenches/cgm-hellenistic-astrology-workbench)：先读目录中的 [安装说明](workbenches/cgm-hellenistic-astrology-workbench/INSTALL.md)，入口为 `cgm-astrology-workbench`。

可以让支持本地文件和命令执行的 Agent 根据安装说明下载、检查环境并安装三个成员。安装完成后，首次排盘会说明默认算法并询问是否调整。案例库、个人设置和笔记保存在用户工作目录，更新技能时保留这些资料。

本次 Windows 环境已验证。WorkBuddy 全新安装以及 macOS/Linux 的完整流程尚待实测，后续攻略会以实测结果为准。

### 其他单个 Skill

克隆仓库：

```
git clone https://github.com/Damocles1112/cgm-skills.git
```

将需要的 Skill 文件夹复制到你的 Agent Skills 目录。例如 Codex：

```
~/.codex/skills/cgm-reconstruct-symbols/
~/.codex/skills/cyber-astro-modern-public/
~/.codex/skills/cgm-mingli-talent-test/
~/.codex/skills/cgm-diagnose-esoteric-practice/
```

也可以直接把对应目录下的 `SKILL.md` 及同目录的资源文件一并提供给支持 Skills 的 Agent。

> `cyber-astro-modern-public` 出图依赖 `pillow`、`numpy`。首次使用前，在该 Skill 目录运行一次自检即可自动完成准备并确认就绪：
>
> ```
> python3 scripts/selfcheck.py --fix
> ```
>
> 看到「全部通过」即代表开箱可用。

> `cgm-mingli-talent-test` 的 PDF 排版脚本当前使用 Windows 中文字体路径；Windows 环境可以直接构建，其他系统使用前需在 `scripts/render_pdf_report.py` 中替换为本机可用的中文字体路径。Markdown 报告不受此限制。

## 使用示例

符号系统研究（`cgm-reconstruct-symbols`）：

```
请使用 cgm-reconstruct-symbols 审计这份历史玄学文本，先扫描其中的候选符号系统并让我选择，再重构其核心洞见、现实映射与交互方式，分别输出专业研究报告和短篇洞见型符号语言教科书。
```

Skill 会先审计文本、识别符号系统并判断材料是否足够，不会在存在多套候选系统时替用户擅自选择，也不会用模型记忆补造原典缺失内容。

占卜体验（`cyber-astro-modern-public`）：

```
用现代占星帮我算一下：我最近的事业方向怎么样？
```

它只会问你两件事——随机起卦还是已有星象、想问什么——随后直接给出解读，并自动生成一张可分享的卡片。

命理天赋适配测试（`cgm-mingli-talent-test`）：

```
请使用 cgm-mingli-talent-test，带我逐题完成命理天赋适配测试并生成解释性报告。
```

Skill 会逐题完成七轮对话，比较你与五门命理术的适配关系，随后生成 Markdown 与 PDF 报告。它不使用机械分数，也不把结论当作能力上限或终身判决。

玄学经营诊断（`cgm-diagnose-esoteric-practice`）：

```
请使用 cgm-diagnose-esoteric-practice，诊断我当前最困扰的一项玄学经营问题。
```

Skill 每轮只问一个真正影响判断的问题，不预设“多赚钱”一定是最高目的，也不会因为表面相似就套用其他人的结论。它会在问题被消解、结构错位、条件性裁决、证据不足或专项事实缺口中给出明确终点。

## 关于作者

长庚明长期关注玄学文本、符号系统与 AI 辅助研究方法。

如果你对 **AI ＋ 玄学** 的技术探索感兴趣，欢迎关注微信公众号：**明语星辰**，获取后续研究与更新动态。

## 许可证

本仓库中作者有权授权的原创程序代码与 Skill 内容统一采用 **[AGPL-3.0-only](LICENSE)**，作者署名为长庚明（Damocles1112）。第三方代码、字体、星历及其他资源保留各自版权与许可，见相应目录的声明。

- [八字工作台许可](workbenches/cgm-bazi-workbench/LICENSE)及[第三方声明](workbenches/cgm-bazi-workbench/THIRD_PARTY_NOTICES.md)。
- [希腊占星工作台许可](workbenches/cgm-hellenistic-astrology-workbench/LICENSE)及[第三方声明](workbenches/cgm-hellenistic-astrology-workbench/THIRD_PARTY_NOTICES.md)。

本仓库的原创程序与 Skill 内容允许使用、修改和继续开发；分发以及通过网络提供修改版时，按 AGPL 保留适用声明并提供对应源码。字体、星历等资源保留各自许可。

`cyber-astro-modern-public` 内置的中文字体为 Noto Serif CJK SC 子集，依 SIL Open Font License 1.1 授权（见该 Skill 目录下 `scripts/assets/fonts/LICENSE.txt`）。
