# 长庚明希腊占星工作台：安装与首次使用

## 下载与交给 Agent 使用

固定来源：[cgm-skills 仓库内的希腊占星工作台](https://github.com/CGM2026/cgm-skills/tree/main/workbenches/cgm-hellenistic-astrology-workbench)，后续修复沿用 `main` 分支。

- [下载仓库 main 的 ZIP](https://github.com/CGM2026/cgm-skills/archive/refs/heads/main.zip)，解压后进入 `workbenches/cgm-hellenistic-astrology-workbench`。
- 使用 Git 的读者可运行 `git clone https://github.com/CGM2026/cgm-skills.git`，然后进入 `cgm-skills/workbenches/cgm-hellenistic-astrology-workbench`。
- 将工作台目录交给能读取文件、执行 Python/Node.js 并打开本机页面的 Agent，要求先读本文件与 `skills/cgm-astrology-workbench/SKILL.md`。

入口 `cgm-astrology-workbench` 和两个成员 `cgm-calculate-astrology-chart`、`cgm-hellenistic-chart-visualization` 必须保持相邻。直接读取本目录即可使用；若要注册到某个 Agent 的技能系统，按该软件的目录规则注册全部三个成员，并保留本工作台根目录的许可与说明。WorkBuddy 的安装与自动发现流程尚未实测。本工作台与仓库统一采用 AGPL-3.0-only；第三方资源适用本目录的第三方声明。

以下命令在工作台根目录执行，Windows 示例使用 PowerShell；含空格的路径需加引号。macOS/Linux 将隔离环境 Python 路径替换为 `bin/python`；本次尚未完成这些平台的整套实测。

## 1. 检查环境

需要 Python 3.11 或以上、Node.js 18 或以上、pyswisseph 2.10.3.2 或以上和 IANA 时区数据。Windows 通常通过 tzdata 提供时区数据库。本次开发环境为 Python 3.12、Node.js 24；核心天文计算使用 Moshier 模式，随包小行星星历用于附加点。

没有 Python 或 Node.js 时，从 [Python 官网](https://www.python.org/downloads/) 和 [Node.js 官网](https://nodejs.org/en/download)安装。SQLite 随 Python 提供，无需另装数据库。

```powershell
$env:PYTHONUTF8 = '1'
python skills/cgm-calculate-astrology-chart/scripts/bootstrap_runtime.py --state-dir .cgm-hellenistic-astrology --check
```

Windows 若只识别 `py`，将上述 `python` 换成 `py -3`。检查只检测现有组件，不安装。返回 `ready` 时，使用返回的 `python_executable` 运行后面的命令；这里以 `<python>` 代表该可执行文件。

若提示缺少依赖，在你同意联网安装后执行：

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

## 5. 备份与完整导出

```text
<python> skills/cgm-hellenistic-chart-visualization/scripts/library_cli.py --library demo-library backup --output backups/demo-backup-01
<python> skills/cgm-hellenistic-chart-visualization/scripts/library_cli.py --library demo-library export --view 工作页ID --format html --output export/chart.html
<python> skills/cgm-hellenistic-chart-visualization/scripts/library_cli.py --library demo-library export --view 工作页ID --format json --output export/chart.json
```

备份使用新目录，保留数据库、资源与对应版本源码。还原时让 `--library` 指向备份副本即可检查，不覆盖原库。HTML 与 JSON 含完整资料；匿名图片应从工作页导出按钮生成，分享前检查预览。

## 6. 后续更新

更新继续使用同一仓库的 `main`：Git 用户在没有未提交源码修改时运行 `git pull --ff-only origin main`；ZIP 用户重新下载并解压到新目录，检查后切换工作台路径。

更新前备份自己的案例库和 `.cgm-hellenistic-astrology/settings.json`。个人库、设置和运行环境应放在 `skills/` 之外；长期使用建议放在独立数据目录。不要用新 ZIP 覆盖这些数据。切换源码目录后，用 `--library` 指定原库，用 `--settings` 指定保留的个人设置；先读该版说明，再决定是否重算旧案例。
