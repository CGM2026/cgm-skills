# 首次启动与默认方案

## 状态目录

把“首次启动”解释为当前工作区第一次使用占星排盘与可视化。由计算成员自行完成本页流程，无需额外的套件入口成员。在工作区根目录共享使用：

```text
.cgm-hellenistic-astrology/
├── runtime.json
├── settings.json
└── runtime/
```

不得把运行环境或用户默认方案写入 skill 安装目录。迁移到新工作区后重新检测一次；同一工作区后续不重复询问。

## 环境检测

首次启动及 `runtime.json` 指向的 Python 失效时运行：

`python scripts/bootstrap_runtime.py --state-dir <工作区/.cgm-hellenistic-astrology> --check`

若返回 `ready`，记录并使用结果中的 `python_executable`。若返回 `missing_dependencies`，已有安装必要依赖的授权则直接执行 `--install`；未授权时只问：

> 排盘环境还缺少必要组件。我可以在这个工作区创建隔离环境并自动安装，不会改动全局 Python；现在继续吗？

用户明确同意后运行：

`python scripts/bootstrap_runtime.py --state-dir <状态目录> --install`

沿用本次已有授权，不重复确认。用户拒绝安装时说明缺项并停止该步骤。已有可用依赖直接复用。

## 首次方法配置

`settings.json` 不存在时，在排盘前一次性询问：

> 推荐设置是恒星黄道、Fagan–Bradley 岁差、埃及界、整宫制。接受推荐，还是调整？案例使用你指定的位置；未指定时放在当前工作区的案例库。

接受推荐即可完成方法选择，不逐项重复询问。用户要求修改时再展示具体选项：回归／恒星黄道，恒星岁差 Fagan–Bradley／Lahiri，埃及／Ptolemy–Lilly 界，整宫／等宫／普拉西德／科赫／雷吉奥蒙塔努斯／波菲利／阿尔卡比提乌斯宫制。记录的是用户确认的偏好，不能把未经确认的作者推荐直接标成完成。

取得完整回答后写入：

```json
{
  "schema_version": 1,
  "setup_complete": true,
  "zodiac": "sidereal",
  "ayanamsa": "fagan_bradley",
  "bound_system": "egyptian",
  "house_system": "whole_sign",
  "case_storage_prompted": true,
  "case_storage_enabled": false,
  "case_storage_path": null,
  "updated_at": "ISO 8601 时间"
}
```

中文始终使用“回归黄道”。机器字段 `tropical` 只作为跨语言技术标识。

恒星黄道必须保存 `fagan_bradley` 或 `lahiri`；回归黄道的 `ayanamsa` 必须为 `null`。案例存储路径也在首次配置中记录。配置完成后不再主动询问，只有用户主动提出修改时才更新。

使用 `scripts/configure_settings.py --settings <状态目录/settings.json> --zodiac sidereal --ayanamsa fagan_bradley --bound-system egyptian --house-system whole_sign --case-storage disabled` 保存上述示例；按用户确认修改相应参数。只有得到首次选择或明确更改默认的指示后才运行。

## 默认冲突与手动切换

新排盘始终带 `--settings <状态目录/settings.json>`。省略时读取当前工作区 `.cgm-hellenistic-astrology/settings.json`；文件缺失会提示先完成设置。输入包含与已确认默认不同的黄道、岁差、界或宫位制时，计算入口停止并列出冲突项。Agent 不能删除冲突参数或调用底层接口绕过检查。

用户可在工作页“设置 → 排盘设置”手动比较可用口径，点击“将当前口径设为新盘默认”后保存到同一设置文件。启动库时用 `library_cli.py --library <案例库> --settings <状态目录/settings.json> open` 指明共享文件；否则服务使用启动工作区的默认路径。只比较当前页不会修改新盘默认。独立 HTML 副本不会改写工作区设置。

已存案例保持创建时的事实与方法。旧案例校准时刻、重算显示组合及导出，读取该案例已校验事实，不重新套用现有个人默认。底层 `calculate()` 是这类内部重算和测试接口，不是 Agent 绕过新盘默认检查的入口。
