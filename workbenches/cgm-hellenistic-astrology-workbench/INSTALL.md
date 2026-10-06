# 长庚明希腊占星工作台：安装与首次使用

## 直接交给 Agent 安装

下载并安装 → 补齐缺失依赖 → 确认默认口径 → 排一个示例并打开工作页。

将下面一句话发给 WorkBuddy 或其他能运行本机程序的 Agent：

> 请下载 https://github.com/CGM2026/cgm-skills/archive/refs/heads/main.zip 中的 workbenches/cgm-hellenistic-astrology-workbench，阅读 INSTALL.md 和 skills/cgm-astrology-workbench/SKILL.md，安装全部三个成员及必要依赖，向我一次确认推荐排盘口径，再用包内示例排盘并打开工作页；已有案例、笔记和个人设置沿用原位置。

三个成员保持同级，配套资源和工作台根目录的许可文件一并保留。按目标 Agent 的实际技能目录安装，核对它能识别并调用入口。只检查安装目标和已知数据位置；按已有授权完成依赖安装，进度只报告结果、阻碍或待选事项。完整开发测试不是首次安装步骤。

下面是手动安装命令；Agent 可按需读取当前步骤。命令在工作台根目录执行，Windows 用 PowerShell，macOS/Linux 按本机路径使用隔离环境中的 Python。首次安装以示例排盘、校验、工作页打开和一条笔记保存后刷新回读为完成标准。WorkBuddy 完整流程的实测状态见 TESTING.md。

## 1. 检查环境

需要 Python 3.11 或以上、Node.js 18 或以上、pyswisseph 2.10.3.2 或以上和 IANA 时区数据。Windows 通常通过 tzdata 提供时区数据库。本次开发环境为 Python 3.12、Node.js 24；核心天文计算使用 Moshier 模式，随包小行星星历用于附加点。

没有 Python 或 Node.js 时，从 [Python 官网](https://www.python.org/downloads/) 和 [Node.js 官网](https://nodejs.org/en/download)安装。SQLite 随 Python 提供，无需另装数据库。

```powershell
$env:PYTHONUTF8 = '1'
python skills/cgm-calculate-astrology-chart/scripts/bootstrap_runtime.py --state-dir .cgm-hellenistic-astrology --check
```

Windows 若只识别 `py`，将上述 `python` 换成 `py -3`。检查只检测现有组件，不安装。返回 `ready` 时，使用返回的 `python_executable` 运行后面的命令；这里以 `<python>` 代表该可执行文件。

若提示缺少依赖，沿用已有安装授权执行；未授权时询问一次：

```powershell
python skills/cgm-calculate-astrology-chart/scripts/bootstrap_runtime.py --state-dir .cgm-hellenistic-astrology --install
```

它会在工作区 `.cgm-hellenistic-astrology/runtime` 建立隔离环境，不修改全局 Python。新装环境在 Windows 中通常为 `.cgm-hellenistic-astrology/runtime/Scripts/python.exe`，macOS/Linux 为 `runtime/bin/python`。已有环境就绪时不会为了本例重新升级。

## 2. 确认个人默认

首次排盘前由 Agent 展示推荐方案，并询问接受还是修改。直接用命令行时，**在你确认接受推荐之后**，将 `<python>` 替换成上一步返回的解释器，运行：

```text
<python> skills/cgm-calculate-astrology-chart/scripts/configure_settings.py --settings .cgm-hellenistic-astrology/settings.json --zodiac sidereal --ayanamsa fagan_bradley --bound-system egyptian --house-system whole_sign --case-storage enabled --case-storage-path demo-library
```

其他方法可先查看脚本 `--help` 及成员 `references/first-run-setup.md`；现有设置也能在工作页手动更改。输入与已保存默认冲突时，程序会停止并说明差异，待你明确切换后继续。已存命盘不会被新默认追溯改写。

PowerShell 执行带路径的解释器可写成：

```powershell
& '.\.cgm-hellenistic-astrology\runtime\Scripts\python.exe' 'skills/cgm-calculate-astrology-chart/scripts/configure_settings.py' --help
```

## 3. 用虚构资料建库

```text
<python> skills/cgm-calculate-astrology-chart/scripts/calculate_chart.py --input examples/input.json --settings .cgm-hellenistic-astrology/settings.json --output facts.json
<python> skills/cgm-calculate-astrology-chart/scripts/validate_chart_output.py facts.json
<python> skills/cgm-hellenistic-chart-visualization/scripts/library_cli.py --library demo-library create --facts facts.json --from-time 2026-10-02T12:00:00+08:00
<python> skills/cgm-hellenistic-chart-visualization/scripts/library_cli.py --library demo-library list
```

`create` 默认建立六种工作页。首次需计算显示组合和时间表，耗时较长；等命令完成并保存返回的工作页 ID。不要用重复创建代替查看原案例。

## 4. 打开、停止与重启

```text
<python> skills/cgm-hellenistic-chart-visualization/scripts/library_server.py --library demo-library --port 4860 --settings .cgm-hellenistic-astrology/settings.json
```

打开 `http://127.0.0.1:4860/`，从列表进入工作页。服务只监听本机，终端保持运行；按 Ctrl+C 停止。重启时运行同一条命令，原案例与笔记会保留。

Agent 也可用 `library_cli.py --library demo-library open --view 工作页ID --port 4860` 启动并返回地址。若端口已属于另一库，换空闲端口，不接管原服务。

## 按需：备份与完整导出

```text
<python> skills/cgm-hellenistic-chart-visualization/scripts/library_cli.py --library demo-library backup --output backups/demo-backup-01
<python> skills/cgm-hellenistic-chart-visualization/scripts/library_cli.py --library demo-library export --view 工作页ID --format html --output export/chart.html
<python> skills/cgm-hellenistic-chart-visualization/scripts/library_cli.py --library demo-library export --view 工作页ID --format json --output export/chart.json
```

备份使用新目录，保留数据库、资源与对应版本源码。还原时让 `--library` 指向备份副本即可检查，不覆盖原库。HTML 与 JSON 含完整资料；匿名图片应从工作页导出按钮生成，分享前检查预览。

## 6. 后续更新

更新继续使用同一仓库的 `main`：Git 用户在没有未提交源码修改时运行 `git pull --ff-only origin main`；ZIP 用户重新下载并解压到新目录，检查后切换工作台路径。

更新前备份自己的案例库和 `.cgm-hellenistic-astrology/settings.json`。个人库、设置和运行环境应放在 `skills/` 之外；长期使用建议放在独立数据目录。不要用新 ZIP 覆盖这些数据。切换源码目录后，用 `--library` 指定原库，用 `--settings` 指定保留的个人设置；先读该版说明，再决定是否重算旧案例。

## 换项目继续使用

首次完成环境、默认确认和案例库初始化后，读取成员的 `references/cross-project.md`，把确认的运行环境、库与设置位置登记到 `~/.cgm-workbenches/locations.json`。更新或换项目先复用该登记，不重复安装依赖或新建空库。用户明确指定路径时优先使用指定值。只安装其中一套时不需要另一套。登记文件为本机配置，不放入公开包。
