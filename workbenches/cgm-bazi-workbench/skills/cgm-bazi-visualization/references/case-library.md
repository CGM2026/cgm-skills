# 本地八字案例库工作协议

本成员管理SQLite、共用资源、工作页、图层笔记与档案。计算事实由相邻排盘成员生成及校验，SQLite为权威记录；浏览器草稿是未完成提交的保护副本。界面规范见 [research-layers.md](research-layers.md)，导出及排盘口径见 [export-settings.md](export-settings.md)。

## 创建与打开

使用已有Python执行scripts/case-library.py；--library必须位于子命令前，填案例库绝对路径。Node可用CGM_BAZI_NODE指向已有解释器。默认本机端口4880，不设开机启动。

```text
case-library.py --library LIBRARY create --chart CHART.json
case-library.py --library LIBRARY list
case-library.py --library LIBRARY open --view VIEW_ID [--port 4880]
```

create只接受已校验且含完整calendarView的命盘，不导入历史夹具。默认创建岁运、流月、流日三个独立view。同名且相同出生事实、四柱及口径复用案例；姓名不同不自动合并。新资料与已存版本不同但事实一致时返回existingFactsRetained，不覆盖旧来源。出生时间或口径校准产生不同事实时新建案例，旧笔记保留。

已有案例先list获取ID，不能猜ID。open先核对当前端口服务所属库；其他库占用时报错，由Agent选空闲端口，不停掉其他服务。用返回的HTTP地址在Agent浏览器打开，不把文件路径当页面URL。

## 新图层读取与写入

```text
case-library.py --library LIBRARY research --view VIEW_ID
case-library.py --library LIBRARY research-put --view VIEW_ID --state-file STATE.json --version N --base-version N --base-state-file BASE.json
case-library.py --library LIBRARY research-import --view VIEW_ID --state-file IMPORT.json --version N
```

research返回text（bazi-research/1完整状态）、version与更新时间，另可含warnings或diagnostics。读取后将原始状态保存为BASE.json，在副本STATE.json修改；保持未改字段、稳定图层/笔记/标记ID、关联对象和档案。research-put提交完整状态，research-import按ID增量导入。旧note-put/record-put不管理新图层。

HTTP POST /api/research使用：

```json
{
  "view": "VIEW_ID",
  "state": {},
  "version": 3,
  "baseVersion": 3,
  "baseState": {}
}
```

示例空对象仅表示字段位置，实际state/baseState必须是完整有效快照。version是调用者已知库版本；baseVersion标明本次编辑依据的权威版本，baseState须与当前库或research_history中对应快照一致。服务核验基线，不能编造基线或把旧草稿的version改成最新号强行覆盖。旧CLI省略基线参数时以其version寻找权威历史，但新调用应明确带基线。

写入在BEGIN IMMEDIATE事务内进行。基线、提交稿、最新库三方按稳定ID和字段合并：不同图层、笔记、标记或档案的独立修改保留；同一记录的不同字段也可合并。成功返回完整text、递增version、merged、baseVersion和warnings，调用者以返回状态更新基线，不能只更新版本号。

每图层30条新增上限在网页、Agent、导入和合并后的最终状态共同执行。旧超限图层完整保留旧ID，可改可删，不增ID；deleted不占当前名额，恢复也算新增。单条笔记正文、档案分析/反馈字段各最多100000个UTF-16代码单元；整份研究状态编码后最多900000 UTF-8字节，包含保留历史字段。长中文全文与多图层可能先达到整盘限制。研究HTTP请求容纳state和baseState，上限3MiB；其他POST为1MiB。超限、结构或对象无效时整体拒绝，库中旧记录与浏览器草稿不删除。

导入先验证完整批次及重复ID，按图层ID/笔记ID更新；文件未提及的已有图层、笔记和删除历史保留，不能以省略隐式删除。过期导入版本拒绝，先读取最新库再重合并；合并后的保存仍校验上限、对象和整盘体积。

## 冲突核对

同字段修改、删除与编辑冲突返回409，包含current/latest、conflicts、solutions、conflictId和baseVersion。conflicts列出path、kind（field或delete-edit）、base/page/library；solutions.page和solutions.library是已经保留全部独立改动的完整候选状态，区别只在冲突项。

页面显示双方可读内容，按钮“采用页面冲突项”或“采用案例库冲突项”只决定冲突项。解决提交须带原冻结state及原version/baseVersion/baseState，再增加conflictId与resolution（page或library）。CLI对应：

```text
case-library.py --library LIBRARY research-put --view VIEW_ID --state-file ORIGINAL_SUBMISSION.json --version N --base-version BASE_N --base-state-file BASE.json --conflict-id CONFLICT_ID --resolution page
```

服务核对冲突ID、view和原提交摘要，从已保存候选方案继续与此时最新库合并；期间又出现冲突则重新核对。最终仍执行30条、旧超限和900000字节规则。不能提交修改过的冲突稿冒充原稿，也不能把选择解释为整份覆盖。

## 浏览器草稿与外部更新

输入即时写本窗口草稿，约500ms后提交。不同窗口分开保存state、version、baseState/baseVersion及上下文；只在确认对应稿已保存后清理本窗口草稿，不清其他窗口。故障重开可查看其他窗口草稿，采用后仍走同一合并协议。草稿不是外部备份。

保存中继续输入时保留最新改动，旧响应不能替换新稿。切层、切盘或跨view打开前先补存；失败或待核对时保留当前输入，不导航。重新读取时加载Agent更新，脏状态不静默覆盖。采用库版本、刷新数据或恢复状态时关闭旧编辑窗口，防止它把已淘汰内容重新写回。正常保存成功不持续显示状态条；失败可重试，同项冲突停自动覆盖。

档案未完成草稿可携带`draft.patch`，仅保存实际改动字段；后台同样校验字段、长度和日期。有效提交后清除增量，编辑框更新最新字段；关闭旧表单不覆盖其他窗口的独立改动。

对象归属依据案例事实、view盘式与固定现场核验，不仅判断ID字符串。新虚构对象、缺失子项或无效标记锚点拒绝；旧记录在同笔记同对象键上已保存的缺失子项可完整保留并返回warning，不自动迁移ID。原局图层不能新关联比较区对象，未知时柱不能关联。

## 损坏诊断与定向恢复

损坏研究状态不替换为空图层，不允许正常写入遮盖原文。读取保留text/version并返回diagnostics：reason、library、view、version、rawSha256、recentValidHistoryId、agentCommand、restoreCommand。诊断信息不包含页面令牌或正文，网页只提供“复制排查信息”交给Agent定位，不增加常驻恢复按钮。

```text
case-library.py --library LIBRARY research-diagnose --view VIEW_ID
case-library.py --library LIBRARY research-restore --view VIEW_ID --history-id HISTORY_ID --version CURRENT_VERSION
```

research-diagnose只读取必要诊断。research-restore是Agent按明确目标恢复该view的有效研究历史：核对当前版本、历史归属、完整结构和体积，恢复前把当前原文（即使损坏）保存到research_history，再作为新修订写入。版本变化时重新读取；没有有效历史则从备份或原文排查，不制造空替代。

## 旧对象记录兼容接口

```text
case-library.py --library LIBRARY objects --view VIEW_ID [--date YYYY-MM-DD]
case-library.py --library LIBRARY notes --view VIEW_ID
case-library.py --library LIBRARY note-put --view VIEW_ID --object OBJECT_ID --text-file TEXT.txt --version N
case-library.py --library LIBRARY record-put --view VIEW_ID --text-file TEXT.txt --version N
```

这些接口保留旧entries记录。旧语义对象包括case、natal:0..3、year:YYYY、luck:1..10、month:YYYY:0..11、day:YYYY-MM-DD，按所属盘式核验；节月年度YYYY不一定是该小寒的实际公历年。新图层还有对象子项及flow引用，必须用research协议，不把旧对象集合当作新图层合法对象表。

旧正文主键为view+object+kind，最多100000字，读取刚返回的version后提交；新记录version=0。冲突保留库中原文和草稿。使用text-file传递完整文字，不读取修改整页HTML。

兼容日期查询仅供Agent/计算调用，网页没有日期定位入口：

```text
case-library.py --library LIBRARY date --view VIEW_ID --date YYYY-MM-DD
```

服务调用排盘成员timeline.cjs返回cgm-bazi-date-view/1，口径绑定已保存出生事实。年度格仍是整年投影，不能当精确交运日；未知或条件性资料不变成精确结论，参照排盘成员references/date-view.md。

## 历史、备份与服务边界

```text
case-library.py --library LIBRARY history --view VIEW_ID
case-library.py --library LIBRARY restore-entry --view VIEW_ID --history-id N --version CURRENT_VERSION
case-library.py --library LIBRARY backup --output NEW_DIRECTORY
```

history/restore-entry针对旧entries历史，不能代替research-restore。两类覆盖前都保存旧原文，研究冲突另保存冻结提交与候选。当前历史不自动清理，不作永久审计承诺。backup用SQLite在线备份并复制assets到新目录，不覆盖已有备份；完整还原须数据库、assets和匹配Skill代码/模板，恢复后--library指向副本。

出生事实在cases压缩保存一份，三个view引用；共用字体按内容哈希存assets，页面按模板生成，不以临时HTML为权威存档。明确需要独立页时调用render.cjs；独立页仍需其资源位置，PNG可直接分享。

服务仅监听127.0.0.1，核对Host，POST核对Origin、页面令牌和JSON类型。数据库与笔记不发送外部服务。测试、用户验收和已安装版本以对应报告与实际加载文件核对，不依据文件标题推定完成。
