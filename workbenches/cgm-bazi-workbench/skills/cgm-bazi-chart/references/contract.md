# cgm-bazi-chart/1 · 工作稿

现行修订2及日期查询/迁移见 [date-view.md](date-view.md)。外层schema /1保持兼容；新命盘标protocolRevision=2与provenance，旧数据不自动改写。

当前验证器：`scripts/chart.cjs` 的 `validate`。协议供计算、可视化及未来解读共同读取；不包含字号、颜色值、字体与页面几何。

2026-09-21兼容扩展：归一化格里历出生年份0001–2099。birth.calendar新增julian；早期solar输入dateStyle=proleptic-gregorian；早期lunar输入calendarBasis=icu-proleptic；历史timeSource记录时间依据。可选utcOffsetSeconds为有来源的固定偏移秒数，优先于IANA；calendarView.dailyConvention同步该偏移。calculation.dateRange保存范围与统一农历模型说明。详见 [历史范围](historical-range.md)。

兼容扩展：时辰不详时 birth.time=null、timeStatus=unknown；第四柱固定 {stem:null,branch:null,status:"unknown"}，不能把“〇”放入事实层当作干支。calculation.status=computed-unknown-time、luckExact=null、astronomy.birthJDUT=null。luckEstimate.referenceResult 与 astronomy.referenceResult 保存明确标记的12:00日期参照，不代表出生事实。前三柱是给定日期的参照值，交节日及23点换日候选须保留说明。可视化将第四柱及对应简写映射为 U+3007“〇”，未知柱不参与藏干或显色匹配。此模式当前支持 civil，不接收已知 correctedLocal 或候选时刻列表。

| 字段 | 内容与约束 |
|---|---|
| schema / status | cgm-bazi-chart/1 / working-draft |
| person | name、locationLabel、dateLabel、birthYear；birth 保存原始资料、候选时刻与确认状态 |
| calculation | status、sources（来源路径与摘要）、limitations；计算输出 computed-working-draft，历史夹具 historical-fixture |
| rules | id=solar-jie-v1（计算）或 legacy-display-v1（历史）；age=selected-year-minus-birth-year；timeResolution=symbolic-year；计算输出另有 conventions |
| natal | 年月日时四项，每项 stem、branch，合法六十甲子 |
| dayLabel | 日主位置显示文字，来源于输入，不从姓名猜性别 |
| godMap | 十个天干相对于此日主的单字十神标签；计算成员支持十种日主，历史导入只生成甲日主映射 |
| branchHidden | 十二支有序藏干表，顺序沿用基线，首项为页面主气 |
| elements | 五行到干支的归属，只有语义分类，不含具体色值 |
| luck | 连续、无重叠的 start/end 整年区间、gz、label、age；仅临时整年视图适配 |
| years | 覆盖 luck 全范围；每年 year、gz、12 个 months；month 含 index、term、gz |
| initial | 合法 year 和 0–11 的 month 索引 |
| extensions | 后续成员的命名空间，本轮为空 |
| luckExact | 计算输出必备：direction、basisTerm、elapsedSeconds、wholeMinutes、ageOffset、startLocal、十段精确 periods；每段 startUTC/endUTC 半开区间 |
| astronomy | birthJDUT、校正时刻、前后节、运行版本及节气残差 |
| runtime | Python、Swiss Ephemeris、Node 和 ICU 版本 |

流年是干支年的符号索引，流月从立春寅月到下一公历年的小寒丑月；不能把索引 0 当公历一月。计算输出的每个月含 startUTC、solarLongitude 与 residualDegrees，可用相邻节边界定位时刻；历史夹具没有这些证据。年龄仅为所选年减出生年。页面当前按交运所在年做整年投影，精确交运日期始终以 luckExact 为准。

出生输入另用 `cgm-bazi-birth/1`：name，birth 包含 calendar、date（公历）、lunar（农历 year/month/day/isLeapMonth）、time、sex（male/female）、timezone（IANA）、location（name；默认真太阳时和 mean 需要 longitude，civil 可省略）；conventions 包含 yearBoundary、monthBoundary、dayBoundary、solarTime、luckDirection、luckStart、smallLuck。工作默认与支持项见 [计算约定](calculation.md)。历史夏令时由 IANA 处理，重复时刻必须提供 fold；不存在的时刻报错。provided-apparent 另需 correctedLocal 与 correctionSource，属于特殊输入而非用户通用默认。可选 initial={year,month}。

## 证据状态

- 已观察：设计图比例版中的周期公式、月序、藏干、甲日主十神映射；旧测试是代码自洽检查。
- 本轮新增并实测：公历／农历互转、节气、时区、太阳时、四柱、十神及起运；来源和测试边界见 calculation.md。
- 展示夹具使用合成资料，不能由写死的页面数据证明出生计算正确。
- 外部已校正时刻与原始钟表时分别保留；来源缺失时不冒称完成独立太阳时复算。
- `externally-verified` 用于未来外部已核验数据交接。沿用solar-jie-v1的完整事实仍接受结构、语义及计算事实交叉核验；该状态不豁免一致性检查，也不认证出生史料，调用者仍须逐项审查外部证据，不能自行赋予此状态。
- 精确交运已用带时区的边界字段交付；当前模板的整年投影必须作为展示能力限制保留，不能删除精确数据迁就页面。

## 显色依据（复用当前页面）

原局：天干在任一藏干见根时旁注黑色加粗；主气透干时旁注黑色加粗；第二、第三藏干透出时同样黑色加粗，否则灰。岁运关注大运与流年；流月仅关注流月。匹配的是具体天干，不是同五行。关注侧天干可激活另一侧相同藏干，关注侧藏干反向激活相同天干。推运侧辅助藏干始终按其五行显色，字重沿用模板。

旧 `推运规则-test.js` 第五例注释写“亥不藏壬”，与其数据和断言冲突；沿用数据中的亥藏壬甲。历史文件保留，勘误只记于工作稿。

### Kimi 模板所需的历法呈现字段

`calendarView` 采用 `cgm-bazi-calendar-view/1`：years 与命盘 years 一一对应，每年包含 year、nominalAge 和十二 months；月项含 index、term、实际公历 year/month/day、label、startUTC。全部由排盘成员产生；可视化不再使用近似节气日期。nominalAge 为该年春节后的虚岁，出生一岁、春节加岁；兼容保留的 luck.age 和 rules.age 属旧模板年份差，不供新模板显示。时辰不详仍不提供精确交运。

### 流日工作接口
calendarView.dailyConvention.id 为 jie-local-date-inclusive-v1；timezone 沿用出生输入时区。每个流月新增 startDate、endDateExclusive 及 days[{date,day,weekday,gz}]，全部由计算层生成。交节日期整天归新月，下次交节日期整天从本月排除。weekday 为周日0至周六6。流日是公历日期的日柱，不细分晚子时；出生排盘的换日和精确交节规则不变。最后一个月也用下一年真实立春封闭区间，不补造近似日期。旧JSON缺少流日字段应从出生输入重新生成。

### 独立年柱与节月年（2026-09-10）
出生默认 yearBoundary=lunar-new-year，可选 lichun-instant；monthBoundary 固定 jie-instant。月干始终按立春界定的节月年计算，不受年柱选项影响。astronomy.baziYear 是所选年柱年份，solarTermYear 是节月年；yearBoundaryEvidence 保留 ICU 农历年、春节日期、所选时间口径下 evaluatedDate 及子初23点年界。person.lunar 仍保留输入日期的农历换算，年界计算证据独立保存。luckExact.directionYearStem/directionBasis 明示顺逆使用的所选年柱天干。旧命盘不补造证据，不自动改算。

起运默认 conventions.luckStart=three-days-year-minute-day；luckExact.precision=day、rounding=floor、discardedIntervalMinutes 记录舍去的原始间隔余分钟，startDate 用于交付日期。ageOffset.hours=0；startLocal/startUTC 与 periods 的零点仅为日边界容器。three-days-year-minute 保持小时折算，现作为可选算法；新增 three-days-year-shichen，精度day，含shichenInterval证据。新生成luckExact.method与conventions.luckStart一致，intervalBasis记录采用UT整分钟或民用日期／时辰差。旧文件没有这两个补充字段仍可核验；时辰法必须有完整时辰证据。未知时辰继续 luckExact=null。

### 出生资料精度与春节年龄基准

person.lunar 保留民用日期的农历标签；person.nominalBirthYear 按所选时间口径在春节子初换年，用于虚岁与两种小运，不随立春年柱选项改变。除夕23点附近两者可能不同，不能混用。smallLuck.method与rules.conventions.smallLuck一致；fixed-origin为原固定起点，hour-pillar为出生时柱按所选年干／性别顺逆、一岁推进一位。未知时辰拒绝hour-pillar。

birth.timeEvidence 提供 {kind, precision, source}。kind 可为 user-provided（未独立核实）、recorded（有记录）、approximate（近似）、rectified（后人校正）、representative（时辰代表值）；precision 可为 unspecified、second、minute、hour、shichen。后三类 kind 必须提供 source。省略时标为 user-provided/unspecified，不推断为已核实的精确分钟。原始时辰范围可在 original 字段保留，不自动抽取中点。

calculation.timeEvidence 保留资料证据。luckExact.certainty=conditional-on-estimated-time 表示候选输入下的参考日期（hour、shichen 精度也按条件性处理）；computed-for-input 也仅表示计算对应输入，不验证资料真伪。时辰全未知仍沿用 luckExact=null。信息保存在数据与助手说明中，不新增 HTML 设置或资料栏。

### 2026-10-01 输入与事实完整性修复

- 所有时间口径统一检查已提供的经纬度：经度为有限数值且在±180度内，纬度在±90度内；布尔、字符串、null和非有限数值拒绝。civil/provided-apparent仍允许省略不参与换算的坐标，但提供时必须有效。
- validate接口保持`validate(chart)`，不增加供调用者绕过的开关。历史fixture继续按原结构协议读取；其他沿用solar-jie-v1的计算事实，从原出生输入及已保存口径重新推导出生UTC/UT儒略日、当地钟表时、太阳时、四柱、年界、节月、前后节与起运，再与命盘比较。新计算还核对年度推运投影。校验只比较，不改写旧事实、不补造缺字段、不把旧引擎标为新引擎。
- 完整旧schema/1仍可校验；旧字段缺省沿原兼容规则处理。资料矛盾或缺必要计算依据时明确拒绝，保留原件并要求核对出生资料。未知时辰仍只核对标明的12:00日期参照，时柱和真实交运保持null。
- 新命盘engineVersion为`2026.10.02-release-candidate`，validation为`structural-semantic-and-derived-facts`。输入摘要继续保留，但它不替代实际派生核验；重新填写摘要不能让矛盾时间或四柱通过。来源路径使用包内相对路径和SHA-256，不携带开发机器目录。
- Python/Node管道两端固定UTF-8，中文校正来源及历史时制来源完整保留，不依赖Windows控制台代码页。
- 真实早期schema/1没有保存的utcOffsetSeconds等后加证据按缺省兼容；字段已存在时仍逐项比较。UTC、UT儒略日、当地钟表时、排盘太阳时及四柱的必要证据不放宽。旧来源副本若与原文不同，仅接受可精确重现为“原文UTF-8字节被GBK/surrogateescape读取”的历史编码结果；任意不同来源仍拒绝，核验不改写旧文本。新计算不启用这项历史来源兼容。
