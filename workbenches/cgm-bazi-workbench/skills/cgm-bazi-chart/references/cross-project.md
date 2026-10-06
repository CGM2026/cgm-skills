# 跨项目使用与本机位置

技能安装在用户级目录后，新项目和新对话复用已有安装。先读取本机 `~/.cgm-workbenches/locations.json`；它登记已有 Python、Node、八字库、占星库及各自确认的设置位置。登记文件只在本机保存，不随公开包发布。

已有登记时直接使用相应环境和设置，换项目不重复安装依赖或确认口径。用户明确指定的库、设置或解释器优先；案例查询用该库 list 返回的 ID，不能沿用另一库或旧对话里未经核对的 ID。查询不到时检查案例名称、库位置与页面类型，勿在当前项目另建空库替代原库。

八字库和占星库分别保存；登记位置不合并数据库，不同步分析、研究或图层。首次在未配置的电脑安装时，仍完成一次环境及默认确认；初始化库后，把确认的位置登记到本机。只安装一套时只登记该套，不要求另一套。

Python 成员可运行 `python scripts/local_installation.py` 查看已登记位置；八字计算成员可运行 `node scripts/local-installation.cjs`。使用返回的解释器绝对路径调用排盘与案例脚本。占星 `bootstrap_runtime.py --check` 会复用登记环境；`--state-dir` 可指定其他独立配置。已有配置时不必反复执行初始化。

登记 JSON 使用 `schema: cgm-workbench-locations/1`，可填写 `python`、`node`、`bazi_library`、`bazi_settings`、`astrology_library`、`astrology_settings`、`astrology_state`，均为已确认的绝对路径。用计算或可视化成员 `python scripts/local_installation.py --register 位置.json` 保存；部分登记保留另一套已有项。该命令不会安装依赖、迁移库或改写排盘口径。

八字默认入口 `run.cjs workspace`、案例入口 `case-library.py`，以及占星 `library_cli.py` 均读取登记库；显式 `--library` 或八字 workspace 的库参数优先。修改/试用案例可使用明确指定的隔离库。缺失或失效的登记库应提示核对位置，不默默新建替代。
