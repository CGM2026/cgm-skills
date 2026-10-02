# 长庚明八字工作台：安装与首次使用

## 下载与交给 Agent 使用

固定来源：[cgm-skills 仓库内的八字工作台](https://github.com/Damocles1112/cgm-skills/tree/main/workbenches/cgm-bazi-workbench)，后续修复沿用 `main` 分支。

- [下载仓库 main 的 ZIP](https://github.com/Damocles1112/cgm-skills/archive/refs/heads/main.zip)，解压后进入 `workbenches/cgm-bazi-workbench`。
- 使用 Git 的读者可运行 `git clone https://github.com/Damocles1112/cgm-skills.git`，然后进入 `cgm-skills/workbenches/cgm-bazi-workbench`。
- 将工作台目录交给能读取文件、执行 Python/Node.js 并打开本机页面的 Agent，要求先读本文件与 `skills/cgm-bazi-suite/SKILL.md`。包内三个成员需要保持相邻。

直接读取本目录即可使用。若要注册到某个 Agent 的技能系统，需要同时注册 `cgm-bazi-suite`、`cgm-bazi-chart`、`cgm-bazi-visualization` 三个成员；按该软件的目录规则安装，并保留本工作台根目录的许可与说明。WorkBuddy 的安装与自动发现流程尚未实测。本工作台采用本目录的 AGPL-3.0-only 与第三方声明，仓库根目录的 MIT 许可不覆盖本工作台。

以下命令均在工作台根目录执行。示例为 Windows PowerShell；含空格的路径保留引号。macOS/Linux 将 Python 路径改为 `.venv/bin/python`，环境变量用相应 shell 的写法；这两个平台尚未完成本次整套实测。

## 1. 准备运行环境

需要带完整 ICU 的 Node.js 18 或以上、Python 3.9 或以上、pyswisseph 2.10.3.2 或以上以及 IANA 时区数据。新环境可用 Python 3.11 或以上；本次开发环境为 Python 3.12、Node.js 24。Python 自带的 SQLite 由案例库使用，无需另装数据库服务。

如果机器尚未安装 Python 或 Node.js，从 [Python 官网](https://www.python.org/downloads/) 和 [Node.js 官网](https://nodejs.org/en/download)安装。下面依赖安装命令会联网下载软件；由你主动执行，或明确授权 Agent 执行。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:CGM_BAZI_PYTHON = (Resolve-Path '.\.venv\Scripts\python.exe').Path
$env:PYTHONUTF8 = '1'
node skills/cgm-bazi-suite/scripts/check-environment.cjs
```

若 Windows 仅识别 `py`，第一行可改为 `py -3 -m venv .venv`。已有可用 Python 时直接把 `CGM_BAZI_PYTHON` 指向它，无需另建环境或升级依赖。之后每次新开终端，需要重新指定该变量。

## 2. 确认自己的默认算法

先读 [README 的五组算法选项](README.md#开始使用)。可以在尚未建盘时启动一个空案例库：

```powershell
.\.venv\Scripts\python.exe skills/cgm-bazi-visualization/scripts/case-library.py --library demo-library serve --port 4880
```

打开 `http://127.0.0.1:4880/`，在首页设置中接受推荐或修改后确认。保持该终端运行，在另一个终端执行后面的排盘命令；新终端同样设置第一步的 `CGM_BAZI_PYTHON` 与 `PYTHONUTF8`。之后工作页中的设置弹窗可以继续调整默认。

让 Agent 操作时，Agent 应用自然语言展示推荐并询问是否调整，然后记录你确认的选择。

不用图形设置页、直接使用命令行时，可以先查看当前设置：

```powershell
node skills/cgm-bazi-chart/scripts/preferences.cjs get --settings .cgm-bazi/settings.json
```

**仅在你选择接受推荐之后**，执行以下命令写入本工作区默认。示例确认文件没有生日等个人资料；已完成设置的工作区不要重复运行此首次确认命令。

```powershell
node skills/cgm-bazi-chart/scripts/preferences.cjs save --settings .cgm-bazi/settings.json --input examples/accept-recommended.json
```

若希望先自定义，复制示例确认文件，在成员 `references/first-use.md` 与计算约定指导下调整 `conventions`，然后保存。`expectedRevision` 使用 `get` 返回的当前版本；已有设置应优先在可视化弹窗中调整，不能盲目覆盖。个人配置存于工作区 `.cgm-bazi/settings.json`。

## 3. 用虚构资料生成第一个盘

```powershell
node skills/cgm-bazi-suite/scripts/run.cjs birth examples/birth.json demo-output --settings .cgm-bazi/settings.json
.\.venv\Scripts\python.exe skills/cgm-bazi-visualization/scripts/case-library.py --library demo-library create --chart 'demo-output/命盘数据-工作稿.json'
.\.venv\Scripts\python.exe skills/cgm-bazi-visualization/scripts/case-library.py --library demo-library list
```

创建返回一个案例及岁运、流月、流日三个工作页 ID。`demo-output` 必须是新目录；重做示例时换一个新输出目录，避免覆盖旧盘。

## 4. 打开与重启工作页

若第二步的服务仍在运行，直接刷新案例库首页或打开工作页地址即可。停止后要重启时，在一个终端运行：

```powershell
.\.venv\Scripts\python.exe skills/cgm-bazi-visualization/scripts/case-library.py --library demo-library serve --port 4880
```

打开 `http://127.0.0.1:4880/view/工作页ID`，将“工作页ID”替换为上一步返回的 ID。该地址只用于当前电脑，终端需保持运行。终端按 Ctrl+C 停止服务；再次运行同一条命令即可重启，并读取原库中的案例和笔记。关闭浏览器标签不会删除案例。

也可让 Agent 使用 `open --view ID --port 4880` 后返回浏览器地址。端口被另一案例库占用时，选择其他空闲端口，不能接管它。

## 5. 备份与导出

```powershell
.\.venv\Scripts\python.exe skills/cgm-bazi-visualization/scripts/case-library.py --library demo-library backup --output backups/demo-backup-01
```

备份目标应为新目录。恢复时保留备份目录中的数据库、资源及相匹配的套件版本，让 `--library` 指向备份副本即可检查；先保留原库。

独立 HTML 在 `demo-output` 中；图片通过工作页导出按钮生成。图片匿名与完整 HTML/JSON 分享的边界见 [README](README.md#文件与分享)。

## 6. 后续更新

更新继续使用同一仓库的 `main`：Git 用户在没有未提交源码修改时运行 `git pull --ff-only origin main`；ZIP 用户重新下载并解压到新目录，检查后切换工作台路径。

更新前备份自己的案例库和 `.cgm-bazi/settings.json`。个人库、设置和运行环境应放在 `skills/` 之外；长期使用建议放在独立数据目录。不要用新 ZIP 覆盖这些数据。切换源码目录后，在 `--library` 中继续指定原库，并让计算与工作页服务使用同一设置文件；自定义设置路径通过计算命令的 `--settings` 与服务环境变量 `CGM_BAZI_SETTINGS` 指定。先读该版说明，再决定是否重算旧案例。
