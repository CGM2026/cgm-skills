# 首次安装／首次启用

第一次排盘前展示推荐设置，用户可一次接受或自行修改；确认后保存为个人默认。解压ZIP不会自动初始化，安装助手应主动说明，工作页设置入口也能完成确认。用户已授权安装必要依赖时直接补齐；未授权时询问一次。

| 分类 | 设置 | 推荐默认 | 其他选项 |
| --- | --- | --- | --- |
| 四柱排法 | 时间口径 | 真太阳时 `apparent` | 平太阳时 `mean`、钟表时 `civil` |
| 四柱排法 | 子时排法 | 子初换日 `zi-23` | 零点换日 `midnight`、早晚子时分排 `split-zi` |
| 四柱排法 | 年柱换年 | 春节子初 `lunar-new-year` | 立春交节 `lichun-instant` |
| 起运与小运 | 起运算法 | 分钟折算至天 `three-days-year-minute-day` | 分钟折算至小时 `three-days-year-minute`、时辰折算法 `three-days-year-shichen` |
| 起运与小运 | 小运排法 | 固定起点 `fixed-origin` | 时柱起算 `hour-pillar` |

春节子初换年独立于日柱换日设置；选择零点换日也不改变春节年界。

设置页只放这五组可选算法，使用两个页签与文字单选布局。固定算法定义在[计算约定](../../cgm-bazi-chart/references/calculation.md)，不占设置位置。

子初换日：晚子时日柱、时干均按次日；零点换日：晚子时均按当日；早晚子时分排：晚子时日柱留当日，时干按次日日干。这里的时刻按所选时间口径判断。

固定起点小运：男一岁丙寅顺排，女一岁壬申逆排。时柱起小运：以出生时柱为基准，一岁即按大运顺逆推进一位；两种均在春节子初加岁。未知时辰不能选时柱起小运；应明确采用钟表日期参照，并保留时柱与实际起运未知的标记。

起运折算中的天、小时、时辰是算法单位，不代表预测准确度。有来源的已校正太阳时是特殊出生输入，不是个人默认，也不出现在设置页。

## 应如何告知

“本套件推荐真太阳时、子初换日、春节子初换年、分钟起运折算至天和固定起点小运。你可以接受这组推荐，也可打开「四柱排法」「起运与小运」修改后保存。之后的新盘沿用你的选择。”

案例库和workspace共用案例库父目录下 `.cgm-bazi/settings.json`；独立birth默认读取当前工作目录的同名路径，可传 `--settings FILE` 指定，也可用 `CGM_BAZI_SETTINGS` 统一各入口。workspace会把显式设置路径交给工作页服务；工作页设置文件须位于案例库父目录内。设置只存口径，不存姓名、生日等资料。每份命盘保留实际规则，后续修改个人默认不改旧盘。

自动请求与个人默认冲突时返回 `METHOD_CONFLICT` 和具体项目，引导用户手动切换；未确认首次设置返回 `SETUP_REQUIRED`。不能静默选择请求值或另一套规则。手动试算、另存新案例、设为以后默认分别执行；笔记图层只读。

助手经用户确认后，可在排盘成员目录执行：

```text
node scripts/preferences.cjs get --settings SETTINGS.json
node scripts/preferences.cjs save --settings SETTINGS.json --input CONFIRMATION.json
```

确认文件为 `{ "confirmed": true, "expectedRevision": 0, "conventions": { "solarTime": "apparent", "dayBoundary": "zi-23", "yearBoundary": "lunar-new-year", "luckStart": "three-days-year-minute-day", "smallLuck": "fixed-origin" } }`。expectedRevision应填刚读取的revision；另一窗口已修改则提示重新核对，防止覆盖。

`--manual` 只供用户已主动选择的比较试算，不修改个人默认，也不能用来绕过首次告知或自行忽略冲突。内部 `calculateBirth(input)` 保留纯计算接口，适合校验原命盘和运行合成测试。独立HTML不提供案例库口径试算入口。

## 环境检查

出生范围为归一化格里历公元1–2099年。历史记录须先确认原历法与时间依据；早期农历按ICU统一模型反推，不等于当时颁行历法。遇到历史命例读取排盘成员references/historical-range.md，必要的说明放在助手回复及JSON，不加到HTML。

运行 `node scripts/check-environment.cjs`。需要 Node 18+（完整ICU）和已有 Python 3.9+、pyswisseph、IANA时区数据；Windows通常由tzdata提供。用CGM_BAZI_PYTHON指向该Python可执行文件；缺项只说明缺失项及处理方法，经授权再安装。包不附带Python、Node或Swiss Ephemeris二进制，不会自动联网下载。

## 姓名显示的温和提示

排盘与展示交付时查看相邻可视化成员 references/name-guidance.md。不要预先断言姓名显示有问题；只在实际缩写、省略或检查发现受限时说明。

出生资料若只有大致时辰，或来自后人校正，应说明这一点并由排盘成员保存 timeEvidence。条件性结果中的交运日期只作参考，不把计算到天误称为资料精确到天。这属于输入资料说明，不新增用户设置或 HTML 内容。
