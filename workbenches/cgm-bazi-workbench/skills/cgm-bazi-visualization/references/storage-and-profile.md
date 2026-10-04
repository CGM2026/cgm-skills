# 存储与按需资料同步

每套工作台独立安装和运行，包内字体完整。案例库新增资源优先复用本机按哈希命名的不可变资源，默认 ~/.cache/cgm-workbenches/resources；CGM_RESOURCE_POOL 可指定位置。同磁盘用硬链接，权限受限或跨磁盘时正常保留独立副本。不同字体内容另存版本；不得原地改写共享字体。卸载一套工作台不删除共享资源，也不删除另一套或任何案例库。

八字和占星的数据库、设置、命盘事实与分析记录各自独立。便携副本内部共用相同数据、程序和样式，打开时只组装当前盘式；保留完整既有查看范围和随行许可。日常不重复保存 HTML。占星推运缓存最多8项且估算对象容量不超过32MiB；较大结果计算后使用但不缓存。八字试算有效10分钟、最多50项且估算对象容量不超过64MiB；新增试算可淘汰较早临时结果，已过期需重新试算，不影响已保存案例。

八字旧研究历史在新保存时逐步压缩，最近100条保持直接可读，旧记录保留原ID、版本与完整正文，新版读取和定向恢复自动解压。当前笔记、未保存草稿、未解决冲突不清理。历史压缩降低增长速度，不承诺删除历史后的硬容量上限；已有数据库文件空间回收需另行维护。占星原有历史策略维持每view最近100次、全库20MB预算。

## Agent 同步入口

同级 scripts/case-profile.py 管理独立的出生资料与客观反馈。当前独立资料记录由 Agent 管理，页面保留创建时的命盘事实。资料修订不改原命盘，出生数据改变时提示是否按计算成员流程新建或复用对应事实案例，原分析与图层保留。

1. 用户明确指定来源和目标案例，先分别 list 核实案例ID，不能只按姓名自动配对。
2. show 读取独立资料记录。首次从已有出生事实初始化显示，不读取分析、讨论、图层或档案正文。put 可按 revision 保存完整的 name/birth/feedback；须保留未改字段。
3. 用户选定 name、birth 或具体反馈编号后导出。feedback 仅放客观事实，kind 必须为 objective，由用户确认内容；混合事实与解释时用户选定可共享部分，原文留在原处。不得将整份档案反馈自动扫描后宣布客观。
4. 目标 preview 生成含前后差异、目标版本、来源和批次的方案。向用户展示具体差异及同一人确认；确认后 apply。目标更新时旧方案拒绝，重读差异；同一批次重复执行不重复导入。
5. 分析、讨论、研究、图层、算法口径与命盘结果不进入协议。出生来源证据随出生资料保留；反馈来源编号跨双向同步保持稳定。

命令均使用当前成员自己的脚本，无须安装另一套：

```text
python scripts/case-profile.py --library LIBRARY --case CASE_ID show
python scripts/case-profile.py --library LIBRARY --case CASE_ID put --input PROFILE.json --revision N
python scripts/case-profile.py --library SOURCE --case SOURCE_CASE export --fields name,birth --output SELECTED.json
python scripts/case-profile.py --library SOURCE --case SOURCE_CASE export --fields feedback --feedback-id EVENT_ID --confirm-objective --output SELECTED.json
python scripts/case-profile.py --library TARGET --case TARGET_CASE preview --input SELECTED.json --output PLAN.json
python scripts/case-profile.py --library TARGET --case TARGET_CASE apply --plan PLAN.json --confirm-person
```

profile字段为name、birth、feedback。反馈条目示例：{"id":"event-1","date":"2025-06","text":"用户报告在此月换了工作。","source":"用户2026-10-04反馈","kind":"objective"}。未经确认的推测不填此列表。show/export/preview不写入资料；put/apply保存资料及压缩前版本、来源批次。跨套件采用显式资料文件交换，单套用户无需另建公共案例系统。

## 文件管理

构建目录的相同字体复用 output/.storage/fonts；对外ZIP仍包含完整字节。测试中间目录使用临时目录并结束清理；用户审核产物和正式版本保留。旧ZIP、历史HTML和正式恢复资料先列清单，再按用户确认的保留范围处理。
