---
name: cgm-bazi-chart
description: 计算八字四柱、历法、节气和推运，保存原始出生资料与时间证据，校验结构化命盘，并按具体日期定位大运、小运及流月流日；不进行论命。
---

# 八字排盘

负责中立计算与事实交接。现为升级工作稿，不能把数据校验当作出生史料核验或用户验收。

首次使用说明相邻套件的 [默认与选项](../cgm-bazi-suite/references/first-use.md)，由用户接受推荐或修改后确认，保存个人默认。读取 [输入输出接口](references/contract.md)；组装资料、规则或排错时读取 [计算约定](references/calculation.md)；历史命例读取 [历法与时制范围](references/historical-range.md)。

## 排盘与校验

在本成员目录运行：

```text
node scripts/preferences.cjs get --settings SETTINGS.json
node scripts/chart.cjs birth INPUT.json OUTPUT.json --settings SETTINGS.json
node scripts/chart.cjs validate CHART.json
```

使用已有Python + Swiss Ephemeris、Node完整ICU。CGM_BAZI_PYTHON可指向已有环境；缺依赖时报告，不自动安装。出生年份支持归一化格里历公元1–2099；统一农历模型不等于复原历代颁行历法。

默认真太阳时、子初换日、春节子初换年、分钟起运折算至天、固定起点小运。可选钟表时／平太阳时、零点换日／早晚子时分排、立春换年、分钟折算至小时／时辰折算法、时柱起小运。月柱按十二节精确瞬间，月干独立依立春节月年；大运和时柱起小运顺逆以所选年柱年干与性别判断。详细定义见计算约定。

个人默认保存在 `.cgm-bazi/settings.json`，与出生事实分开。首次未确认返回 SETUP_REQUIRED；自动请求与个人默认冲突返回 METHOD_CONFLICT 并指出冲突项，引导用户在设置中手动切换，不能静默覆盖、使用 --manual 绕过用户选择或自行改默认。已确认的手动比较试算可用 `--manual`，不修改个人默认；内部纯函数 `calculateBirth(input)`保持可独立调用。修改默认只影响新盘，已存盘按其原口径核验。

原始钟表时、太阳时换算及依据分别保留。默认太阳时缺经度/时区时补齐，不静默退回钟表时；provided-apparent须有来源，避免二次校正。

明确时辰不详时继续unknown模式：事实时柱null、luckExact=null；显示〇由可视化负责。内部12:00只是有标记的日期参照，不当作出生时刻。候选时刻保持候选，不任选中点。approximate/rectified/representative或hour/shichen精度保留timeEvidence与条件性标记。

## 日期查询与旧数据

日期定位、修订2和迁移规则见 [date-view.md](references/date-view.md)：

```text
node scripts/timeline.cjs date CHART.json YYYY-MM-DD
node scripts/timeline.cjs migrate OLD.json NEW.json
```

年度展示投影与具体日期所属大运分别交付；未知时辰不定位实际交运，也不能选依赖时柱的小运算法；小时折算交运当天保留前后候选。流日交节当天归新月不反向改变出生月柱。

新版命盘保持schema /1并标protocolRevision=2；校验通过才交下游。迁移输出新文件、保留原件，不自动补造历法或证据。`historical-fixture` 为兼容开发接口名，现在仅生成明确标注的虚构展示夹具，不能替代出生计算。

已提供的经纬度在所有时间口径下统一检查类型与范围。计算命盘校验会用已有运行环境从原出生资料和口径复核时间、四柱及起运，只比较而不改写事实；输入摘要不替代复核。Python/Node传输固定UTF-8，中文来源无需修改用户环境变量。详见输入输出接口的完整性修复说明。

需要展示时交给相邻cgm-bazi-visualization或统一入口；颜色、模板、案例库、笔记与导出不进入本计算成员。
