# 长庚明公开 Skills

这里收录长庚明公开发布的 AI Skills，主要用于 AI、玄学文本研究与符号系统重构。

当前发布：

| Skill | 中文名 | 功能 |
|---|---|---|
| [`cgm-reconstruct-symbols`](skills/cgm-reconstruct-symbols/) | 玄学理论基础｜长庚明玄学符号重构法 | 从历史玄学文本中识别、审计并重构抽象符号系统，提炼核心洞见、现实映射与系统交互关系，输出专业研究报告和零基础短篇教科书。 |

## cgm-reconstruct-symbols

这个 Skill 不把玄学符号当作现成关键词，而是把历史文本视为符号的使用记录，追问：

- 一部文本包含哪些符号系统；
- 每套系统映射现实中的什么；
- 不同系统如何共同描述世界；
- 符号含义为何在不同场景中变化；
- 哪些结论有证据，哪些只是现代联想；
- 怎样用最短的话，让零基础读者看懂整套体系。

适用于占星、八字、紫微斗数、奇门遁甲、大六壬、塔罗、卢恩、炼金术等传统。它用于历史文本和抽象符号系统研究，不用于一般文学象征、普通符号学或纯图像分析。

## 安装

克隆仓库：

```bash
git clone https://github.com/Damocles1112/cgm-skills.git
```

将需要的 Skill 文件夹复制到你的 Agent Skills 目录。例如 Codex：

```text
~/.codex/skills/cgm-reconstruct-symbols/
```

也可以直接把 [`SKILL.md`](skills/cgm-reconstruct-symbols/SKILL.md) 及同目录下的 `agents/`、`references/` 一并提供给支持 Skills 的 Agent。

## 使用示例

```text
请使用 cgm-reconstruct-symbols 审计这份历史玄学文本，先扫描其中的候选符号系统并让我选择，再重构其核心洞见、现实映射与交互方式，分别输出专业研究报告和短篇洞见型符号语言教科书。
```

Skill 会先审计文本、识别符号系统并判断材料是否足够，不会在存在多套候选系统时替用户擅自选择，也不会用模型记忆补造原典缺失内容。

## 关于作者

长庚明长期关注玄学文本、符号系统与 AI 辅助研究方法。

如果你对 **AI ＋ 玄学** 的技术探索感兴趣，欢迎关注微信公众号：**明语星辰**，获取后续研究与更新动态。

## 许可证

本仓库采用 [MIT License](LICENSE)。

