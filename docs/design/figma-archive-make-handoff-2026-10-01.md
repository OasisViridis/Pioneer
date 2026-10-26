# Pioneer · 设计归档与 Make 交接

> **2026-10-02 更新：** Make F9 已写回原设计稿，最新入口见[回填交接](figma-make-f9-writeback-2026-10-02.md)。原 `824:1279` 页面现在是「00 · MAKE F9 · 当前设计」；七张旧 v3.2 画板保留于 ARCHIVE 的「12 · v3.2 · Make 前基线」。以下保留首次归档时的名称、统计与事实，不作为新回填状态。

> 2026-10-01。设计归档已完成，**应用开发仍暂停**。本次只整理 Figma 和文档入口，不改设计数值、源码、工程阶段或历史验收。

## 当前入口

参照 [Oasis Resume 的 ARCHIVE 页](https://www.figma.com/design/m9FXMcmRYwalMaqtj3a0B2/Oasis-Resume-Visual-Master?node-id=210-2) 的组织方式：当前交付独立，历史探索与迭代进入一个归档页，再按阶段分区。简历文件仅只读参考，没有修改。

| 页面                                                                                                       | 用途                                                       |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [00 · BASELINE · v3.2](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1279)       | 现有七张关键屏，作为下一轮设计参考，不是对 Make 的像素锁定 |
| [10 · Hazel × Claude · 规范](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1276) | 当前设计语言及使用规范                                     |
| [11 · Hazel × Claude · 组件](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1278) | 可编辑组件与窗口层补充                                     |
| [12 · Hazel · 素材](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1277)          | 插画、配饰、来源与单槽主题样例                             |
| [99 · ARCHIVE · 目录](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5889)        | 所有旧稿的分区导航；归档页 ID 沿用 `257:725`               |

14 页收敛为 5 页。四个当前页面 ID 不变，仅改名；十个历史页面的原稿合并至 ARCHIVE 的十二个原生 Section。用户明确允许删除迁空旧页，实际只删除九个空页容器，没有删除原稿、组件或素材。

## 历史入口迁移表

旧页面级链接需要改用下表；原画板、组件和交互节点 ID 保留，指向它们的 `node-id` 无需替换。历史 JSON、日期快照和旧计划的原始证据不倒填为本次状态。

| 原页面 ID                | ARCHIVE 分区                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `717:1578`               | [01 · v2 · 应用界面与 P12](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5675)       |
| `717:1574`               | [02 · v2 · 设计规范](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5676)             |
| `717:1575`               | [03 · v2 · 基础控件](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5677)             |
| `717:1576`               | [04 · v2 · 导航组件](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5678)             |
| `717:1577`               | [05 · v2 · 工作台组件](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5679)           |
| `743:1574`               | [06 · v2 · 状态矩阵](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5680)             |
| `757:1574`               | [07 · v2 · 响应式](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5681)               |
| `132:2`                  | [08 · pre-v2 · 应用探索](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5682)         |
| `299:725`                | [09 · pre-v2 · Workbench 与原型](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5683) |
| `257:725` 的视觉稿       | [10 · pre-v2 · 视觉探索](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5684)         |
| `257:725` 的历史 Section | [11 · pre-v2 · 历史快照](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5685)         |
| `257:725` 的技术载荷     | [90 · Technical · PPT 传输载荷](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5686)  |

巨宽的 PPT 传输文本折叠保留在裁切容器里，不再撑坏画布范围；原文字和载荷组件未删除。P12 等历史原型的 `page-id` 改为 `257-725`，起点与目标节点保持原 ID；[P12 审计入口](workbench-p12-flow-audit.md)已更新导航参数，不改变旧审计结论。

## 给下一轮 Make 的边界

- 设计规范与交互原型交给用户指定的 Claude Opus 5.5 主导、Sonnet 5.5 迭代。当前 v3.2 是参考与素材底座，不强制照抄尺寸、布局或每个 token。
- 保留设计思路：Claude 的阅读秩序与低噪声工作面，Hazel 的银灰、藏蓝、薄荷与克制陪伴。资产多样性通过替换同一槽位增加，不堆叠装饰。
- macOS 式三点与窗口操作仅作为窗口层补充，不覆盖应用自己的设计语言；保留 `dsh-manqu-pet` 的适配要求，不把桌宠做成强制常驻的大侧栏。
- 工作区入口、具体会话、模块化面板及真实授权边界是产品意图。模拟交互要标明模拟，不伪造执行、保存、审批或验收成功。
- ARCHIVE 是历史参考，不是另一套待实现清单。旧 Make 提示词保留作过程记录，不用其中的像素限制约束这轮创作。

## 核验与恢复

[静态归档 QA](hazel-v3/qa/make-archive-consolidation-2026-10-01.json)记录页面、分区、节点及指纹。142 个历史顶层原件、25,045 个历史场景节点保留；四个当前页面另有 2,185 个场景节点，原内容、布局及实例关联核对一致。文件内 391 个变量、24 个集合、20 个文字样式、2 个效果样式保持原样；这是全文件统计，不是 v3 专属 token 数量。

跨页迁移期间 Figma 改写了 197 个节点的原型反应，已按迁移前数组恢复，并核对原有 592 个反应节点及 14 个流程起点保留。这里只验证结构与记录，不声称原型已逐路实点，更不代表 Electron、Windows 或 P12 工程验收通过。

本机 `.private/figma-make-archive-before-2026-10-01.json` 保存原页面、位置、结构和指纹；它不是完整 Figma 导出。可以按记录重建页面容器并迁回原件，但新页会获得新 ID，无法凭此清单恢复已删页面的原 ID；若要精确回到旧页面身份，应使用 Figma 版本历史，其可用性本轮未独立测试。早先[仅重命名/排序的整理记录](hazel-v3/qa/workspace-archive-2026-10-01.json)仍保留为历史，不适用本次跨页合并的恢复方式。
