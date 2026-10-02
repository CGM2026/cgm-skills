# 输入合同

## 必填字段

```json
{
  "chart_name": "可选名称",
  "local_datetime": "2026-03-20T09:52:00",
  "time_basis": "iana",
  "timezone": "Asia/Shanghai",
  "location_name": "广州",
  "latitude": 23.0167,
  "longitude": 113.35,
  "zodiac": "tropical",
  "ayanamsa": null,
  "bound_system": "egyptian",
  "house_system": "whole_sign"
}
```

必须提供 `local_datetime`、`latitude` 与 `longitude`。`zodiac`、`ayanamsa`、`bound_system` 与 `house_system` 从已确认的个人默认配置读取；单次输入可以重复相同值，但不能覆盖默认。出现冲突时停止本次创建，列出差异并提示用户手动切换后重试。时间必须准确，不得用正午替代未知时间。

坐标必须是有限数值，布尔值不视为数字。黄经输出先按保存精度舍入，再归一化到0°（含）至360°（不含），星座内度数不得为30°。

## 时间口径

- `iana`：提供 `timezone`，例如 `Asia/Shanghai`；适合现代标准时间与夏令时。
- `fixed_offset`：提供 `utc_offset`，格式为 `+08:00`；适合已经核实的历史时差。
- `lmt`：根据经度换算地方平太阳时；只在用户明确采用 LMT 时使用。
- `local_datetime` 自带 UTC 偏移时，以其中偏移为准。
- 必须包含日期和时分；仅日期或缺失时刻不得自动解释为零点。IANA 夏令时切换中不存在的当地时间拒绝；重复小时必须用显式偏移说明是哪一次。
- 自带偏移的时刻在转换、行运、返照和快照计算中保留同一真实时刻，不先删偏移再套时区。可同时保留 IANA 参考区用于当地日期与真实生日年龄。
- 输出校验交叉检查当地时刻、UTC 和儒略日是否一致；时间标签变化但盘面未重算的事实不得交给下游。

## 黄道与界表

- 回归黄道的机器值为 `tropical`；恒星黄道的机器值为 `sidereal`。
- 恒星黄道必须提供 `ayanamsa`：`fagan_bradley` 或 `lahiri`。
- 回归黄道的 `ayanamsa` 写为 `null` 或省略。
- `bound_system` 接受 `egyptian` 或 `ptolemy_lilly`。
- `house_system` 接受 `whole_sign`、`equal`、`placidus`、`koch`、`regiomontanus`、`porphyry` 或 `alcabitius`。

新排盘读取已确认的首次配置；首次配置不存在时先展示推荐设置并询问是否更换。输入方法与个人默认冲突时列出差异，提醒手动切换后重试，不自动覆盖。事实资料（日期、时间、时区和坐标）照用户提供的证据处理，不属于方法偏好。

## 不负责的输入补全

本 skill 不联网查询经纬度、行政区或历史时区。只有地名时，应由 Agent 使用已经获得授权的定位工具补全，或请用户提供；写入输入时记录实际采用的坐标与时间口径。
