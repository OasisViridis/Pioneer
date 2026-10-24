# Pioneer 开发稿重置 · v2

> 2026-10-01 归档迁移：下文保留原日期的设计与验收口径；页面级导航已转向 ARCHIVE 对应分区，P12 的 `page-id` 改为 `257-725`，不新增实点或运行时结论。迁移表与当前入口见 [设计归档与 Make 交接](figma-archive-make-handoff-2026-10-01.md)。

> 历史 v2 交付记录；当前外观以 [v3 全局规范](DESIGN-SYSTEM.md) 和 [v3 交付](hazel-v3/README.md) 为准。以下证据保留。

状态：**COMPLETE（静态设计交付）**（2026-09-30）。全局规范、可编辑组件与开发稿已重建，新稿已成为Figma的main。最终画布、JSON、链接与独立文档核验已对账，见[完成审计](design-reset-completion-audit-2026-09-30.json)。**本次没有同步应用源码，也没有把设计交付当成M2/M3或P12通过。**

## 交付清单

| 交付             | 当前证据                                                                                                      | 验证范围                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 全局规范         | [DESIGN-SYSTEM](DESIGN-SYSTEM.md)、[行为合同](workbench-product-spec.md)                                      | 统一视觉与行为入口；旧规范保留为历史                                                      |
| token与Figma基础 | [v2清单](pioneer-design-tokens-v2.json)、[逐项验证](design-reset-token-verification-2026-09-29.json)          | 3集合/84变量、9文字样式；另有2效果样式                                                    |
| 可编辑规范板     | [design-system](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5676)                 | 6张，含配色、字阶、布局与安全边界                                                         |
| 组件库           | [组件/属性映射](design-reset-component-map-2026-09-29.json)                                                   | 14主家族/78变体 + 3个内部Close变体；非Code Connect                                        |
| 主开发稿         | [main](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5675)                          | 13个1440×900窗口；本机与未来能力明确分区                                                  |
| 组合状态         | [states · v2](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5680)                   | 8张分区板/81个组合状态，按本机→未来→补充排成三行                                          |
| 响应式           | [responsive · v2](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5681)               | 8个窗口：1280×800、900×700、640×720、1280×560、759/760边界，另有窄/短审批视图             |
| 逐屏交接         | [交接与验收矩阵](design-reset-handoff.md)                                                                     | 节点、阶段、业务态、组件映射、返回/焦点、DR设计测试条件和未实测项                         |
| 最终静态QA       | [当前结构与文字色对](design-reset-final-qa-2026-09-30.json)                                                   | 7个v2页面/1,697个文字节点；119项精确1px描边偏移、28段显式中文代码回退单列，不作运行时结论 |
| 入口与旧稿保留   | [可逆切换记录](design-reset-cutover-2026-09-29.json)、[切换后指纹](design-reset-legacy-after-2026-09-29.json) | 旧main/workbench/archive内容与原型反应指纹不变；只改页面名称/顺序                         |

## 开发稿与覆盖

| 分区            | 完整窗口    | 组合状态与补充                    | 边界                                                          |
| --------------- | ----------- | --------------------------------- | ------------------------------------------------------------- |
| L 工作区        | L00/L01     | L02–L10、I01                      | 扫描取消/失败不抹旧结果，目录变更不悄悄重绑会话               |
| S 本机会话      | S01/S02     | S00/S03–S10、E08/E09、I02/I07–I09 | 保存不外发；关闭不删除、不停止；等待写入不丢草稿              |
| D 布局/上下文   | D01/D02/D12 | D03–D11                           | 键盘移动/缩放、布局保存/取消/失败与会话隔离；引用管理仍待实现 |
| R 未来运行      | R01/R02     | R03–R14、E05–E07                  | 意图就绪≠授权；请求停止≠已停止；断连不自动重放                |
| A 未来审阅/交付 | A01/A02     | A03–A14、I03–I06                  | 同版本Diff/预览/文件/验收；来源、范围和错误分类可见           |
| P 设置/数据     | P01/P02     | P03–P14、E01–E04                  | 只读范围；导出/删除/清空独立确认；坏档原件保留与迁移回退      |
| V 响应式        | V01–V08     | 临界/短高/审批焦点合同随画板记录  | 静态布局，不冒充Windows缩放、原生窗口约束或读屏实测           |

## 验证与修复记录

- [首批窗口](design-reset-main-baseline-2026-09-29.json)、[停靠/设置窗口](design-reset-docking-settings-2026-09-29.json)、[未来窗口](design-reset-future-screens-2026-09-29.json)、[主稿最终修正与D12](design-reset-main-final-fix-2026-09-29.json)。
- [本机组合](design-reset-states-local-2026-09-29.json)、[数据与权限组合](design-reset-states-permission-data-2026-09-29.json)、[产物组合](design-reset-states-artifacts-2026-09-29.json)、[结果补充](design-reset-states-outcomes-2026-09-29.json)、[交互补充及最终坐标](design-reset-states-interaction-2026-09-29.json)。
- [响应式](design-reset-responsive-2026-09-29.json)、[窄/短审批](design-reset-responsive-approval-2026-09-29.json)。
- 修复了字段错误提示互相覆盖、Status文案未绑定、中文路径缺字、绘制缓存黑底、导航收缩、设置选中态、未来标签误写本机，以及次文落在弱底/身份底时的低对比。
- [Status属性修正](design-reset-status-binding-fix-2026-09-29.json)、[实际色对修正](design-reset-text-contrast-fix-2026-09-29.json)；保留初始报告，不用后验成功抹掉问题记录。
- 图片通过Figma工具逐批返回并复核；JSON记录节点和结构，**JSON本身不是视觉证明**。本轮没有将截图扁平化替代可编辑节点。
- 2026-09-30复读实际画布：14主组件/78变体及3个内部Close变体、21窗口、81状态与交接表对应；119项非文本容器右侧1px偏移均为INSIDE描边且x=1/宽等于父级，28段中文回退均紧邻同尺寸/行高的已绑定Code样式。初次严格报告保留，终审以[当前汇总](design-reset-final-qa-2026-09-30.json)及其逐页文件为准，不抹掉原始发现。

## 恢复与未包含范围

- [外部账本](design-reset-state-2026-09-28.json)记录节点和版本；重试先核对当前画布，不重建重复对象。
- 历史页：`132:2` → `archive · main (pre-v2)`；`299:725` → `archive · workbench (pre-v2)`；原`257:725` archive保留。恢复时按切换记录恢复名称/顺序即可。
- 当前v2 main实读为**0个原型起点、0个带反应的节点**；P12须先补v2连线，再实际点击，不继承旧main的五起点记录。应用CSS/源码同步、真实键盘/IME/读屏、Windows 200%/强制颜色/降低动效、M2新鲜门禁、真实运行器与外发许可均是独立后续验收。本轮没有运行或宣称这些通过。
- 用户2026-09-30允许本地后端按需复工，无需再次通知或征询复工授权；PR/推送/合并/发布、破坏性操作与数据外发门禁不变。本次设计交付没有借此扩张为应用实现。
