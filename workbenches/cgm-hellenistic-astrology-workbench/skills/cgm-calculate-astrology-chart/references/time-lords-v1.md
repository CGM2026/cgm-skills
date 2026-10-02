# 法达与黄道释放工作稿（2026-09-29）

计算入口：`scripts/calculate_time_lords.py --natal-input <chart-facts v4> --technique firdaria|zodiacal-releasing --output <JSON>`。先验证本命事实，计算模块负责所有时段和年龄；可视化只读结果。

## 已确认口径

- 法达：日生太阳、金星、水星、月亮、土星、木星、火星，随后北交点、南交点；夜生从月亮开始轮转七星，水星后接两交点。主星年数依次为太阳10、金星8、水星13、月亮9、土星11、木星12、火星7，北交3、南交2；每年365.25天。主星大运均分七小运，从大运星开始，沿同一顺序；交点不细分。输出两个完整75年周期。
- 黄道释放：默认已校验本命福点的星座，可指定十二星座任意一个。L1/L2/L3/L4单位分别为360天、30天、60小时、5小时。白羊至双鱼数值为15、8、20、25、19、20、8、15、12、27、30、12。每级从上级星座起，按黄道顺序前进；下级满十二段但上级尚未结束时，跳至初始星座对宫，标记解结，每一上级内只跳一次。下级不得越过上级结束边界。输出至少150个360天年，并保留末个完整L1。
- 年龄统一采用出生地民用时区中的实际生日：已满周岁加当前生日年内已过比例，展示两位小数；闰日出生在非闰年以2月28日计周年。技法一年天数仅决定时段，不决定年龄。十年九月大运已同步。

## 数据协议

`cgm.time-lords.v1`，状态 `working-draft`。`basis`保留本命时刻、昼夜、时区、口径；`schedules`保存预计算树。紧凑数组列按`columns`：主管键、UTC开始毫秒、UTC结束毫秒、本地开始日期、民用年龄、子级数组、是否解结。星座键为0–11；法达为行星英文键。时间区间左闭右开。源JSON与HTML嵌入数据同源。

## 来源状态

- 比鲁尼《占星术入门》§395：[英文译本](https://www.skyscript.co.uk/pdf/pubs/texts/albiruni/docs/albiruni.pdf)，七等分与昼夜起运。交点置七主星末尾为本次用户确认口径。
- 瓦伦斯黄道释放的现代实践说明：[Chris Brennan访谈逐字稿](https://theastrologypodcast.com/transcripts/ep-192-transcript-zodiacal-releasing-an-ancient-timing-technique/)；[四级时间单位表](https://theastrologypodcast.com/wp-content/uploads/2019/02/zodiacal-releasing-periods.pdf)。当前细层单位及解结实现依据这两份一手实践说明，未把工作稿标为古本异文的最终校勘结论。

验证：`tests/time_lord_calculation_check.py`核对七等分、75年边界、完整树连续性、父级边界、解结次数和实际生日。属于计算与界面工作稿，不添加吉凶或解释分数。
