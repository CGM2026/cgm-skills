# 盘面事实输出合同

输出为 UTF-8 JSON，顶层 `schema_version` 固定为 `4`。v4 在 v3 的七星、四轴、宫位和构型事实之上，新增太阳地平状态以及带完整公式记录的福点、精神点。它们是可复算的派生点，不包含对身体、行动、命运或选择的解释。任何字段含义变化都必须升级版本，不能静默改变。

## 顶层结构

```text
metadata                    输入事实与 UTC 换算快照
settings                    黄道、宫制、界表与点位范围
solar_condition             太阳真实地平高度、昼夜分支与时间敏感性
angles                      ASC、MC、DSC、IC
planets                     七颗可见行星
lots                        福点与精神点
houses                      所选主宫制的十二宫头
relations                   七星两两整宫关系与度数信息
co_presence_groups          同一星座内两颗以上行星
```

## 行星与角点

每颗行星、角点与签点至少包括：

- `longitude`、`sign`、`sign_index`、`degree_in_sign`；
- `primary_house`、`whole_sign_house`、`equal_house`；
- `primary_house_motion_group` 与基于整宫制的 `house_motion_group`；
- `domicile_ruler`、`bound_ruler`。

行星另含：

- `speed_longitude_per_day`；
- `motion` 与 `retrograde`；
- 到四轴的度数距离、最近角点和最近距离。

`motion` 只判断顺行或逆行。没有统一阈值时不声称停驻；解释层可以依据速度与上下文另行标记待核对。

## 昼夜与福点、精神点

`solar_condition` 以太阳的地心赤道坐标转换为当地真实地平高度，不受回归或恒星黄道设置影响：

- 高度大于或等于 0°：`sect: day`；
- 高度小于 0°：`sect: night`；
- 距地平线不超过 0.25°：`near_horizon: true`，提示出生时间的小幅变化可能交换公式。

`lots` 固定包含 `fortune` 与 `spirit`：

| 分支 | 福点 | 精神点 |
|---|---|---|
| 昼生 | `ASC + Moon - Sun` | `ASC + Sun - Moon` |
| 夜生 | `ASC + Sun - Moon` | `ASC + Moon - Sun` |

每个签点保存 `formula`、`formula_system: valens_sect_light_reversal` 与 `sect_used`，并像其他点一样保存黄经、星座、整宫制／等宫制／主宫制宫位、住所主和界主。`relations` 仍只保存七星之间的 21 对关系；下游需要签点构型时，应依据签点与行星黄经明确派生，不得误把签点当作具有速度的行星。

## 宫位

`settings.primary_house_system` 保存用户选择。`houses` 保存该宫制的十二个宫头；每颗行星与角点的 `primary_house` 对应它。

为支持不同希腊占星方法，所有主宫制下都固定保留 `whole_sign_house`。`equal_house` 固定以上升度为第一宫起点。下游方法不得把主宫制宫位、整宫制宫位和等宫制宫位混写成同一个字段。

## 构型关系

`relations` 固定包含七星全部 21 对关系。`relation` 为：

- `conjunction`、`sextile`、`square`、`trine`、`opposition`；
- `aversion`，表示整宫不相见。

可见构型同时给出 `orb` 与 `phase`。`phase` 为 `applying`、`separating`、`exact` 或速度相同时的 `indeterminate`。不相见不强行附加度数相位。

## 证据边界

输出是计算事实，不包含尊贵、接纳、吉凶、人格、成事与否或事件预测。福点与精神点的古代语义、现代解释及其主宰星关系均属于下游方法。下游 skill 不得把 `house_motion_group`、界主、签点或构型字段改写成未经定义的综合分数。
