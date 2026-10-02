# 日期查询与协议升级

在本成员目录：

```text
node scripts/timeline.cjs date CHART.json YYYY-MM-DD
node scripts/timeline.cjs migrate OLD.json NEW.json
```

## 按日期定位 cgm-bazi-date-view/1

- 仅查询带真实节气、完整流日日历的计算命盘，不重算出生四柱、不改变保存口径。日期必须有效、不早于出生、处于已计算日历和大运覆盖内。
- day精度（分钟折算至天或时辰法）：按periods保存的本地起止日期半开区间定位大运，交运日期当天进入新运。零点是日期容器，不描述为真实交运小时。交运前返回命盘所选的小运算法，春节日间虚岁按选定日期计算。
- hour精度（分钟折算至小时）：交运当天保留前后两个候选及本地交运时刻，luck=null、certainty=needs-query-time；不给当天唯一大运。此前与此后日期可按保存边界定位。
- 时辰全未知：luck=null、certainty=reference-only；仅保留明确标注的年度参考投影，不能以luckEstimate的正午结果定位实际交运。
- 出生时间近似或校正：沿用conditional-on-estimated-time，即使返回了日期所属大运，也只是在该输入下成立。
- flowMonth与flowDay读取calendarView；交节当天整日归新月，同时返回节气UTC及changesToday，不影响出生月柱按瞬间切换。flowYear沿用节月年度的流年符号索引，不能当成精确流年换年时刻。
- 小运与虚岁采用春节后的日间日期参照；本入口没有查询时刻，不能用于春节前夜23点、太阳时跨日或时刻级小运切换。春节当天附提醒。需要时刻级结论时补充查询时刻再扩展计算，不在浏览器补造。
- annualProjection保留既有年度浏览数据，和luck日期定位结果分别呈现。两者在交运年内可能不同，这是粒度差异。

## 命盘 /1 修订2

外层schema仍为cgm-bazi-chart/1，新增protocolRevision=2与provenance；旧命盘不因缺修订号而自动被拒绝。当前渲染仍要求完整calendarView；历史夹具保持其来源状态。

校验器检查日干十神一致性、时间来源/精度/条件性、精确大运顺逆与月柱、虚岁与所选小运、节气当地日期、流日逐日连续及干支。时辰法还检查两端时辰序号及日差证据。历史时区秒偏移保留，不先取整；数值星历往返允许1秒误差。

provenance.engineVersion记录产生事实的计算器版本，inputSha256摘要绑定保存的person.birth和rules.conventions。它不是史料真实性认证。完整代码版本还可由calculation.sources中的脚本哈希核对。

migrate只在完整旧数据通过当前校验后新增修订和摘要，记录原命盘哈希、metadata-only-no-recalculation与迁移工具版本；旧日历没有最后立春UTC封闭证据时标legacy-no-closure-evidence，不补造其时刻；不把旧计算器冒称新计算器，不改四柱或推运。新文件使用排他创建，原文件不覆盖。缺历法、时间证据或小运数据时明确从原始出生输入重排到新目录，不猜缺项。校准资料另建案例，旧案例不复用ID。
