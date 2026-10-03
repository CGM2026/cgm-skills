# 验证与复现

## 1.0.1 更新范围

新增工作页与独立 HTML 的可折叠许可区，统一应用场景说明、完整协议、第三方声明与源码入口；保持字体和版式规范，并排除图片导出的许可内容。发布构建及解压包核验结果记录在本次交付目录中。“最终更改”工作页供作者进行最后审核，未确认前不标记为用户验收通过。

## 1.0.0 验证范围

Windows、Python 3.12、Node.js 24 环境中，已验证首次默认确认、排盘、三种工作页创建、算法试算与另存、笔记保存及服务重启回读、PNG/SVG 实际下载、独立 HTML 移位查看。公开版移除背景纹理后，重新通过独立 HTML 的字体嵌入、数据安全与可移植渲染回归。

WorkBuddy 安装与自动发现、macOS、Linux、真实手机及所有历史历法边界尚未完成完整验证。以下步骤可用于复现和后续修改。

## 自动检查

使用虚构资料、新输出目录和新案例库。先按 [INSTALL.md](INSTALL.md) 指定可用 Python，并完成默认口径确认。

本包选择收录能在包内独立运行的测试源码，不依赖原作者电脑的历史案例档案。从包根目录执行：

```text
node tests/bazi-suite/algorithm-options.cjs
<python> tests/bazi-suite/algorithm-offsets.py
node tests/bazi-suite/algorithm-combinations.cjs
node tests/bazi-suite/recalculate-range.cjs
node tests/bazi-suite/preferences.cjs
node tests/bazi-suite/preferences-entry.cjs
node tests/bazi-suite/release-render.cjs
node tests/bazi-suite/fact-integrity.cjs
node tests/bazi-suite/year-boundary.cjs
node tests/bazi-suite/note-policy.cjs
node tests/bazi-suite/mark-geometry.cjs
```

测试可能创建自己的临时数据或 `output/` 文件，均不是发布内容。不同测试的具体范围以文件头及输出为准。算法测试检查约定与实现结果，不是命理预测准确性的证明。

## 工作页回归

更新源码后，从 ZIP 解压到新目录，完成排盘→建库→打开→算法试算→另存→写笔记→保存刷新→重启回读→实际下载。独立 HTML 移动到不含原套件资源的新目录后查看。检查三种盘式及一个长笔记导出。

脚本验证与浏览器实测分别记录。`SHA256SUMS.json` 和 ZIP 校验用于检查文件完整性；算法设置仍由每位使用者在首次运行时确认。

## v1.0.3 姓名布局回归

在真实浏览器中进入已有原局笔记图层（底部盘式导航隐藏），连续切换 760、380、502px 视口，姓名字号始终大于零、文字可见，既有笔记正文保持一致。截图与数值记录保存在本轮本地修复产物；此检查不代替所有平台实测。
