# 长庚明八字工作台

本工作台把出生资料计算为结构化四柱与岁运数据，并提供本地案例库、HTML 工作页、对象笔记和图片导出。

当前版本：**1.0.0**。作者：**长庚明**。命理体系在这里用于研究、教学和记录，不作为人生的绝对裁决。

[GitHub 源码](https://github.com/Damocles1112/cgm-skills/tree/main/workbenches/cgm-bazi-workbench) · [下载仓库 main 分支](https://github.com/Damocles1112/cgm-skills/archive/refs/heads/main.zip) · [安装说明](INSTALL.md)

## 包含内容

三个成员放在同一 `skills/` 目录中，保持相邻：

- `cgm-bazi-suite`：首次使用、默认口径与统一入口。
- `cgm-bazi-chart`：排盘、事实校验与日期计算。
- `cgm-bazi-visualization`：工作页、笔记、案例库和导出。

程序源码、模板、字体、许可及虚构示例随包提供。包内没有个人案例库、个人默认配置或运行环境。解压不会自动安装软件或启动服务。

## 开始使用

阅读 [安装与首次使用](INSTALL.md)，检查 Python、Node.js 和计算依赖。也可以把下面这段话发给能读取文件并运行脚本的 Agent：

> 请从 https://github.com/Damocles1112/cgm-skills 的 main 分支安装 workbenches/cgm-bazi-workbench 中的「长庚明八字工作台」。先读该目录的 INSTALL.md，再读 skills/cgm-bazi-suite/SKILL.md；检查运行环境，说明推荐算法并让我确认；使用虚构示例验证排盘与工作页。保留我已有的个人案例库和设置。

首次使用会展示推荐口径，让你接受或修改；确认后的选择才作为个人默认。支持的算法设置分为两页：

| 四柱排法 | 可选项 |
| --- | --- |
| 时间口径 | 真太阳时（推荐）、平太阳时、钟表时 |
| 子时排法 | 子初换日（推荐）、零点换日、早晚子时分排 |
| 年柱换年 | 春节子初（推荐）、立春交节 |

| 起运与小运 | 可选项 |
| --- | --- |
| 起运算法 | 分钟折算至天并舍去余数（推荐）、余数折算至小时、时辰折算 |
| 小运排法 | 固定起点（推荐）、时柱起算 |

已存命盘改变算法时，先试算并比较，再另存；原命盘与笔记保留。不同排盘工具结果有差异时，应先比对具体口径。未知时辰、历史时制及历法边界见计算成员的参考文档。

## 文件与分享

- 日常工作页通过本机服务打开，案例库负责保存；将整个案例库目录妥善备份。
- 本版本独立 HTML 嵌入显示所需字体子集，可以单独移动查看。独立 HTML 不包含本机案例库服务的全部编辑能力，也不是案例库备份。
- PNG 可直接分享；工作页 SVG 是以 SVG 容器承载 PNG，不能称作可逐字编辑的纯矢量排盘。
- 图片中的隐藏姓名、地点或时柱选项，只控制相应图片导出；分享 HTML、JSON 或案例库前仍需检查其完整资料。
- 字体呈现旧字形。需要严格规范字形的汉字教学或排印，请先阅读 [字体原作者说明](LICENSES/Font-Chaohua.txt)。

## 开源与验证

作者：长庚明（Damocles1112）。本工作台程序采用 [AGPL-3.0-only](LICENSE)，不适用 cgm-skills 仓库根目录的 MIT 许可；第三方资源适用各自许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。分享署名见 [ATTRIBUTION.md](ATTRIBUTION.md)。

文件摘要见 `SHA256SUMS.json`，发布来源见 `SOURCE_MANIFEST.json`。测试方法与已测范围见 [TESTING.md](TESTING.md)。Windows 上的排盘、工作页、笔记与导出流程已有验证；WorkBuddy、macOS 和 Linux 尚未完成整套实测。
