---
name: cgm-astrology-workbench
description: 长庚明希腊占星工作台的统一入口，串联时间地点排盘、事实校验与本地六盘工作页；用于新建或打开案例、整理图层笔记与档案、导出 HTML 或图片，不负责占星解读。
---

# 长庚明希腊占星工作台

通过相邻的 [排盘成员](../cgm-calculate-astrology-chart/SKILL.md) 计算事实，通过 [可视化成员](../cgm-hellenistic-chart-visualization/SKILL.md) 建立和打开工作页。三个成员同级安装。本入口只协调这两个成员已有的能力；传递完整的 `chart-facts` v4 文件。

## 按任务进入

- **排盘并展示**：读取排盘成员，核实输入与个人默认，计算并校验事实；再读取可视化成员，将事实创建到案例库并打开返回的 URL。
- **只要排盘数据**：完成计算与校验后交付事实文件，不建立案例库。
- **打开、编辑已有案例**：读取可视化成员的 [案例库协议](../cgm-hellenistic-chart-visualization/references/case-library-v1.md)，先 `list` 取得案例与 view ID，再 `open`；整理内容使用字段接口，无需重新排盘或改写整份 HTML。
- **导出**：沿用可视化成员的 HTML／JSON 导出及页内 PNG／SVG 工具，按用户选定的盘式、图层与内容输出。

## 新盘流程

1. 按排盘成员的 [首次设置](../cgm-calculate-astrology-chart/references/first-run-setup.md) 检测现有环境与配置。状态放在当前工作区的 `.cgm-hellenistic-astrology/`，不写入 skill 安装目录。
2. 首次使用说明推荐的恒星黄道、Fagan–Bradley 岁差、埃及界、整宫制，并让用户接受或更换。已有确认不重复询问。用户明确授权后才安装缺少的依赖。
3. 按 [输入合同](../cgm-calculate-astrology-chart/references/input-contract.md) 收集准确日期时间、时区、经纬度与实际坐标来源。时间不明不以正午代填；只有地名时先核实坐标。
4. 新输入的方法与个人默认冲突时，列出差异并提示用户手动切换。不能删除冲突字段、改用底层计算接口或静默替换宫制。
5. 运行计算与校验。需要工作页时使用可视化成员的 `create --facts`，默认建立本命、行运、返照、十年九月运、法达、黄道释放六种盘式；使用返回的本命 view ID 打开。单盘模式只用于用户明确要求的专项操作或补建。

命令中的脚本路径以对应成员目录为基准，`<python>` 使用环境检测返回的解释器。案例库采用用户指定或已配置的位置；临时测试可在任务输出目录建独立库，不改长期保存偏好。

```text
<python> <排盘成员>/scripts/calculate_chart.py --input <输入.json> --settings <工作区配置.json> --output <事实.json>
<python> <排盘成员>/scripts/validate_chart_output.py <事实.json>
<python> <可视化成员>/scripts/library_cli.py --library <案例库> create --facts <事实.json>
<python> <可视化成员>/scripts/library_cli.py --library <案例库> --settings <同一工作区配置.json> open --view <返回的本命ID>
```

`open` 启动或复用仅监听本机的隐藏服务。打开它返回的 HTTP URL；端口被其他案例库占用时按提示选择空闲端口。已有案例保持创建时的事实与口径，改变新盘默认不改写旧盘。

## 记录与交付

案例库是日常保存入口。笔记属于各盘式的独立图层，档案使用结构化记录；修改已有字段先读取版本，发生冲突时保留双方内容并核对。沿用可视化成员的卡片和自动保存规则。

交付时说明实际时间、地点、黄道、岁差、界表、宫制，以及工作页或事实文件入口。高纬度不可用宫制由页面停用并说明原因。推运计算中的工作稿标记随结果保留，不将其写成唯一传统标准。

独立 HTML 内嵌资源，可离线阅读；动态计算和写回案例库依赖本机服务。HTML／JSON 含完整出生资料与记录，图片匿名选项不清除其中的数据。工作页 SVG 是包含 PNG 的容器，不能描述为可逐项编辑的纯矢量图。
