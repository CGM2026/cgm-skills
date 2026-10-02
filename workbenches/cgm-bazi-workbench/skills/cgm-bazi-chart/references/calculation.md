# 计算工作约定 solar-jie-v1

状态：工作稿。2026-09-10 用户确认真太阳时及23点直接换日为套件默认（confirmed-working-model）；同日确认出生月柱按十二节精确瞬间切换，且不增加常规换月开关；其他现行默认与可选项以套件首次使用说明为准。正月初一默认换年、立春可选，已接入；月干独立按立春节月年计算。

## 方法

- 复用既有干支周期、月干公式、藏干顺序与显色语义。日主十神按木火土金水生克顺序及干阴阳生成，保留才/财、杀/官、枭/印等既有简称。
- 年柱默认按所选时间口径的日期在23点推进一天后转换中国农历年（ICU），即除夕子初换年；可选太阳地心视黄经315°的立春瞬间。默认真太阳时；春节固定子初，不随可选 midnight 日柱设置改为零点。月界每隔 30° 的十二“节”，并非十二中气。节月及立春年界判断使用出生的真实 UTC 瞬间，不把太阳时标签当作 UTC 输入。月干固定以立春节月年起算，不读取所选年柱天干；两种年界模式下月柱保持相同。
- 节气由既有 Swiss Ephemeris 2.10.03 的 solcross_ut 求解，显式使用 Moshier，不下载星历文件。记录黄经目标、UT 儒略日、UTC 时间、求解残差。残差是数值求解精度，不是天文观测精度；边界附近须考虑输入误差。
- 公历用格里历；中国农历使用 Node ICU 内建 Chinese calendar，日期语义固定 UTC+8。农历转公历搜索相应中国历年并完整匹配年、月、闰月和日；不存在的日期拒绝。支持归一化格里历出生年份1–2099；历史输入约束、儒略历与固定偏移见 [历史范围说明](historical-range.md)，没有承诺全范围逐日交叉验算或复原历代颁行历法。国际出生资料的农历指当地公历日期对应的中国历日期，不另造本地化农历。
- 时区使用既有 Python zoneinfo。DST 缺失时刻拒绝，重复时刻要求 fold=0/1。不根据中文地名猜时区和坐标。
- 日序采用公历本地日期正午 JDN 加 49 取模 60（与公开实现的减11等价）。默认 zi-23：23:00 起日柱和时干均用次日。midnight：晚子时日柱和时干均用当日。split-zi：晚子时日柱留当日，时干取次日日干；零点后按当天。三种边界按所选太阳时／钟表时判断。
- 时支每两小时一支，23:00–00:59 为子。solarTime 默认 apparent（真太阳时）；civil 为明确选用的钟表时；mean 用 UTC+经度/15；apparent 再加 Swiss Ephemeris 的均时差；provided-apparent 使用有来源的 correctedLocal。太阳时影响日时柱及春节子初换年判断，原始 UTC 保留；节月判断仍按真实瞬间。
- 年干阳男阴女顺推、阴男阳女逆推。顺推到下一节，逆推到上一节。起运用真实时间间隔整分钟向下取整，以 4320 分钟折一年、360 分钟折一月、12 分钟折一天，默认余分钟舍去，不折小时；折出的年/月/日依次加到出生当地钟表日期，输出交运日期。月末按该月最后一天截断。此为已明确的分钟法，不等于整数时辰法。
- 大运从月柱按顺逆每步一位，十年一期，保留完整 startUTC/endUTC 半开边界。小运默认固定起点（男一岁丙寅顺、女一岁壬申逆）；可选时柱起算法，按所选年干与性别决定顺逆，一岁即从时柱推进一位。两种均按春节子初增岁。未知时辰拒绝依赖时柱的小运。
- 年度模板仍按起运所在年份作整年投影；日期查询按本地大运边界另行定位，见date-view.md。年度格显示年龄取 calendarView 的春节虚岁；旧 luck.age 为兼容字段，不供当前模板显示。交运所在年整格归属不意味着从该年1月已交运。

## 来源与核验

1. [Swiss Ephemeris 编程文档](https://www.astro.com/swisseph/swephprg.htm)：太阳黄经求交、UTC/UT、均时差。
2. [ICU 日历服务](https://unicode-org.github.io/icu/userguide/datetime/calendar/)：多历法运行机制。
3. [lunar-python Lunar 源码](https://raw.githubusercontent.com/6tail/lunar-python/master/lunar_python/Lunar.py)：日序锚点与干支对照。
4. [lunar-python Yun 源码](https://raw.githubusercontent.com/6tail/lunar-python/master/lunar_python/eightchar/Yun.py)：顺逆、分钟法和时辰法的实现参考，未安装或打包该库；其MIT许可与引用说明见发布包第三方声明。
5. [公开四柱测试](https://raw.githubusercontent.com/6tail/lunar-python/master/test/EightCharTest.py)、[公开起运测试](https://raw.githubusercontent.com/6tail/lunar-python/master/test/YunTest.py)：选取两个四柱和两个分钟法起运样例交叉核验。
6. [lunar-python XiaoYun 源码](https://raw.githubusercontent.com/6tail/lunar-python/master/lunar_python/eightchar/XiaoYun.py)：时柱起小运的一岁推进规则；春节子初加岁是本套件独立约定。
7. [作者四柱说明](https://6tail.cn/calendar/lunar.bazi.html)：晚子时不同日柱处理和起运单位的定义，不据此宣称某个方法普遍优于其他方法。

核验脚本：项目 `tests/bazi-suite/algorithm-options.cjs`、`algorithm-offsets.py`、`fact-integrity.cjs`。覆盖公开样例、子时／春节边界、顺逆、精度、时辰不详、输入冲突与旧数据兼容；自动测试不等于视觉验收或出生史料核验。

## 当前运行与分发边界

无需安装，读取项目现有 `.cgm-hellenistic-astrology/runtime/Scripts/python.exe`，不修改其配置；也可用 CGM_BAZI_PYTHON 指向另一个已有环境。本成员不使用希腊占星盘的黄道／宫位设置。

计算和完整计算事实的交叉校验均使用这个已有环境。Node调用显式启用Python UTF-8，天文脚本也将标准输入、输出和错误设置为UTF-8；不修改用户环境变量。事实复核只请求出生及起运所需的节气，不重复生成百年日历；私有缓存最多64份按原出生输入和口径生成的参考结果，每次仍将当前命盘字段逐项比较，修改输出不能利用成功缓存绕过。时间往返容许1秒数值表示差异，不将其称为史料或观测精度。

发布包程序采用AGPL-3.0，保留第三方各自的许可与来源声明。Swiss Ephemeris和pyswisseph的许可见发布包第三方声明；字体许可单独记录，不能相互替代。

默认的23点边界按所选时间口径判断，真太阳时默认下不是钟表23点。保留原始输入，缺少经度不得降级到钟表时。时辰不详的 civil 正午日期参照属于已标明的参考模式，不是已知时刻排盘的默认替代。

## 2026-09-10 换月确认与换年接入状态

- confirmed-working-model：出生月柱使用精确交节瞬间，不开放按日换月的常规配置。现有实现符合，无需为减少设置而降低计算精度。
- confirmed-working-model：流日浏览保持交节当日归新流月，限 calendarView 的按日选择语义，不改变出生月柱。
- 换年已接入：yearBoundary 支持 lunar-new-year（默认）及 lichun-instant。月干依立春节月年连续排列，不随年柱换年方式改变。
- astronomy.baziYear 保存所选年柱年份；solarTermYear 保存独立节月年；yearBoundaryEvidence 保存农历日期与春节日期、所选时间口径的子初23点规则、月干取年依据。
- 大运顺逆按所选年柱年干与性别，luckExact 记录 directionYearStem 和 directionBasis；顺逆规则已获用户确认（confirmed-working-model）；起运已确认采用分钟折算至天。
- 既有 years 年度行属于符号年份索引，不作为精确流年换年时刻；此次不改 HTML 的按日浏览投影。

## 可选起运算法（2026-10-02）

三种都顺取下一节、逆取上一节；方向按已选择的年柱年干与性别，不改月柱规则。

| conventions.luckStart | 间隔与折算 | 交运数据 |
| --- | --- | --- |
| `three-days-year-minute-day`（默认） | 真实UT间隔取整分钟；4320分钟一年、360分钟一月、12分钟一天；余分钟舍去 | precision=day，起运日期归当地零点容器 |
| `three-days-year-minute` | 同上，余分钟每分钟折两小时 | precision=hour，保留出生钟表时并依次加年月日时 |
| `three-days-year-shichen` | 按出生时区的民用日期差及时辰序号差；一天折4个月，一时辰折10天，不计时辰内分钟 | precision=day，折算后归当地零点容器 |

时辰法参照Yun.py的sect=1：0时序号0，1–2时序号1，逐段递增；21–22时序号11，23时也计为11。终点序号小于起点时，日期差减1、序号差加12。这是所选实现的明确约定，不能把它描述成连续秒数除以两小时。节气与出生时刻都使用同一出生时区的民用标签，太阳时只影响四柱；UT间隔和整分钟仍作为证据保留。因时辰法只给日期，本套件将边界归零点，与参考库保留出生钟表时的容器形式有所不同，折算年龄及日期仍可比较。

不足时辰不另折算，`shichenInterval`记录民用日差、序号差、两端序号及晚子处理。分钟法的`discardedIntervalMinutes`记默认舍弃的余分钟；时辰法固定为0，其舍弃规则另记在`shichenInterval.subShichen`中。

零点容器和折算到小时均不表示预测准确度。未知时辰始终只给标明的日期参照，不报告实际精确起运。更改算法先试算并另存，旧盘不受个人默认变更影响。
