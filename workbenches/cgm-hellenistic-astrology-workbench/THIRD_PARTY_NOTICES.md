# 第三方组件、素材与来源

核对日期：2026-10-03。本工作台程序采用 AGPL-3.0-only；下列组件与资源保留原作者许可。`RIGHTS_STATUS.json` 记录所分发组件的来源与授权依据。本工作台与 cgm-skills 仓库统一采用 AGPL-3.0-only，第三方资源按下列声明授权。

## 两套共同使用

| 组件 | 使用方式与许可 | 来源与随包文件 |
| --- | --- | --- |
| pyswisseph | 外部运行依赖；开发时实测 2.10.3.2，AGPL-3.0。包内不含其二进制或 Python 环境 | [官方源码](https://github.com/astrorigin/pyswisseph)，AGPL 全文见根目录 LICENSE |
| Swiss Ephemeris | 底层星历引擎；当前选择 AGPL 开源分支，未声称购买专业许可 | [官方许可说明](https://www.astro.com/swisseph/swephinfo_e.htm)，原始声明见 [Swiss-Ephemeris.txt](LICENSES/Swiss-Ephemeris.txt) |
| 汇文明朝体 GBK | 作者声明许可，允许嵌入软件、免费传播及修改。第三方收费分发、将字体作为独立商品或资源包出售受限 | 作者特里王；[官网发布](https://huozi.cool/article/1780107161300.html)，[完整声明转录](LICENSES/Font-Huiwen.txt)，[声明原图](LICENSES/huiwen-series-authorization.jpg) |
| 朝华标题 A | 作者声明许可，允许免费商用、软件嵌入、复制传播及修改；不得将字体作为素材或字体文件出售盈利 | 作者特里王；[官网发布](https://huozi.cool/article/1780107571976.html)，[完整声明](LICENSES/Font-Chaohua.txt) |

字体保留原始版权字段。为导出而生成字体子集是技术性修改，不将字体重新授权为 AGPL、MIT、OFL 或 CC0。字体许可与软件许可分别适用；软件允许商业开发，不代表允许另售字体文件。朝华作者提醒旧字形不适用于要求严谨规范字形的教育排印，完整原文随包保留。

Python、Node.js、SQLite、ICU 和 tzdata 由使用者的运行环境提供，本包不重新分发这些运行环境或二进制。需要把它们另行封装为应用时，应同时纳入其许可及必要源码提供安排。

## 八字包的算法参考

`lunar-python` 的公开起运、小运实现及测试用于算法对照与本轮扩展的实现参考，未作为新运行依赖安装。该项目为 MIT，Copyright (c) 2020 6tail。八字包附 `LICENSES/lunar-python-MIT.txt`。

- [源码及 MIT 许可](https://github.com/6tail/lunar-python)
- [起运算法 Yun.py](https://github.com/6tail/lunar-python/blob/master/lunar_python/eightchar/Yun.py)
- [小运算法 XiaoYun.py](https://github.com/6tail/lunar-python/blob/master/lunar_python/eightchar/XiaoYun.py)

是否采用一项排盘算法由本套件的方法设置决定；参考来源不构成对该方法唯一性或预测有效性的证明。

## 占星包的组件

- **html2canvas 1.4.1**：MIT，Niklas von Hertzen。保留库头与完整许可 `LICENSES/html2canvas-MIT.txt`。[版本源码](https://github.com/niklasvh/html2canvas/tree/v1.4.1)。库头版权年份为 2022，上游该版本许可文件为 2012，两者均照原文保留。
- **小行星星历 `seas_18.se1`**：来自 [Swiss Ephemeris 官方仓库](https://github.com/aloistr/swisseph/blob/master/ephe/seas_18.se1)，SHA-256 为 `a2cd8fc33807c78ca9a700c91c2e042258b12fc4796519e00781440b5ad8b2e2`。原始来源记录随资产保留，适用 Swiss Ephemeris 声明及所选 AGPL 分支。
- **轮盘几何与绘制代码**：从长庚明的 [Astrologer 项目](https://github.com/Damocles1112/Astrologer) 提取、适配。路径与提取摘要见可视化成员 `references/source-snapshot.json`，适配说明见 `references/reuse-notes.md`。2026-10-03，作者确认拥有本工作台所分发代码的授权权利，并同意按 AGPL-3.0-only 发布；此项状态记为 `user-confirmed`。这项授权针对本工作台所含代码，不声明 Astrologer 原仓库整体许可证已改变。

本包未包含的专属组件，其许可文本只出现在对应的另一个工作台包中。再分发时保留本声明、所有适用原始许可及修改记录。
