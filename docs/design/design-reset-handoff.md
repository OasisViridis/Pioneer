# Pioneer v2 · 设计交接与验收矩阵

> 2026-10-01 归档迁移：下文保留原日期的设计与验收口径；页面级导航已转向 ARCHIVE 对应分区，P12 的 `page-id` 改为 `257-725`，不新增实点或运行时结论。迁移表与当前入口见 [设计归档与 Make 交接](figma-archive-make-handoff-2026-10-01.md)。

> 历史 v2 交付记录；当前外观以 [v3 全局规范](DESIGN-SYSTEM.md) 和 [v3 交付](hazel-v3/README.md) 为准。以下证据保留。

> 2026-09-30终审。范围：**可编辑静态设计系统与开发稿**。不是实现报告、运行时无障碍认证或P12实际连续点击记录。状态和节点以外部JSON及本文件为准，工程里程碑只看[ROADMAP](../../themasterplan/ROADMAP.md)。

## 1. 交付和证据边界

- 6张规范板；3集合/84变量/9文字样式/2效果样式；14主家族/78变体，另有3个内部Close变体。
- 13个1440×900主窗口 + 8个响应式窗口；8张组合板含81个状态实例。它们保留组件关联，不是扁平截图。
- [变量验证](design-reset-token-verification-2026-09-29.json)：24语义色、24几何值、全部文字样式与清单一致，未发现别名/scope/WEB语法差异。
- [当前最终静态QA](design-reset-final-qa-2026-09-30.json)：7个v2页面、1697个文字节点已核对实际实色背景；无阻断的绑定/字体/溢出或文字色对问题。119项精确1px描边右侧偏移、28段紧邻已绑定Code样式的中文回退逐项记录为设计测量例外，不声称几何绝对零偏移。[9月29日QA](design-reset-final-qa-2026-09-29.json)保留为历史报告，不是当前终审入口。脚本不覆盖运行时层叠、缩放、读屏、输入法或真实事件。
- [对比度修正](design-reset-text-contrast-fix-2026-09-29.json)：弱底/身份色底使用主文色，保留融合调色板。禁用控件也提升可读性，不凭低对比表达禁用。
- 原始[10组色对](design-reset-contrast-2026-09-28.json)仍保留，不能用它替代上述组合检查。
- 所有页面的可见“成功/失败/权限/产物”未来样例均有设计示例标记；其中 `verify-artifact.mjs` 仅为设计用的命令示例，不是仓库已实现命令。

## 2. 完整窗口与焦点/返回合同

每一行对应设计验收用例 `DR-<screenId>`：在指定尺寸检查可见内容、入口和记录的返回路径；键盘/真实Electron行为待恢复代码后实施并验收。

| ID  | 可编辑窗口                                                                                       | 尺寸     | 跳转、返回、焦点合同                                 | 证据与未验部分                  |
| --- | ------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------- | ------------------------------- |
| L00 | [空工作区库](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=733-1584)       | 1440×900 | 选择目录→L01；取消保留原库；焦点回选择按钮           | 截图+边界已查；DR-L00运行时待验 |
| L01 | [工作区海报墙](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=733-1587)     | 1440×900 | 海报→L03概览→S01；工作区身份始终可见                 | 截图+边界已查；DR-L01运行时待验 |
| S01 | [本机草稿](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=733-1709)         | 1440×900 | 保存→S02；失败→S04；Ctrl+Enter不在IME期间触发        | 截图+边界已查；DR-S01运行时待验 |
| S02 | [本机记录](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=733-1712)         | 1440×900 | 关闭→S05/I08；全部会话→S06；不发生模型发送           | 截图+边界已查；DR-S02运行时待验 |
| D01 | [审阅空态](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=740-1702)         | 1440×900 | 布局菜单→D03；返回会话；没有真实Diff不填样例         | 截图+边界已查；DR-D01运行时待验 |
| D02 | [上下文设计](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=740-1705)       | 1440×900 | 查看/刷新/移除仅引用；关闭面板后焦点回入口           | 截图+边界已查；DR-D02运行时待验 |
| P01 | [设置只读范围](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=740-1895)     | 1440×900 | 工作区/本机数据/运行器局部导航；返回原会话           | 截图+边界已查；DR-P01运行时待验 |
| P02 | [数据管理设计](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=740-1898)     | 1440×900 | 导出→P08；删除→P09/P10；取消回设置，默认不破坏       | 截图+边界已查；DR-P02运行时待验 |
| R01 | [意图与读取许可](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=741-1864)   | 1440×900 | 修改目标→R03；拒绝保留讨论；批准仅此范围             | 截图+边界已查；DR-R01运行时待验 |
| R02 | [断连核对](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=741-1867)         | 1440×900 | 重连只核对观察，不重放未知执行；焦点留在恢复区       | 截图+边界已查；DR-R02运行时待验 |
| A01 | [版本化Diff示例](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=741-2048)   | 1440×900 | 改动审阅→权限核对；新磁盘版本使旧批准失效            | 截图+边界已查；DR-A01运行时待验 |
| A02 | [产物预览示例](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=741-2051)     | 1440×900 | 局部切预览/文件/验收，保持同一v3；无真实测试不报PASS | 截图+边界已查；DR-A02运行时待验 |
| D12 | [交付空态](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=760-2057)         | 1440×900 | 预览页空态；未接运行器的文件和验收禁用并有原因       | 截图+边界已查；DR-D12运行时待验 |
| V01 | [1280×800审阅空态](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=758-1579) | 1280×800 | 双栏724/500+24手柄；键盘可调；输入始终在所属面板     | 截图+边界已查；DR-V01运行时待验 |
| V02 | [900×700临时收纳](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=758-1668)  | 900×700  | 面板暂收保留入口；关闭临时视图回触发器               | 截图+边界已查；DR-V02运行时待验 |
| V03 | [640×720单列](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=758-1720)      | 640×720  | 保留一排全局导航与输入；额外会话走全部会话           | 截图+边界已查；DR-V03运行时待验 |
| V04 | [1280×560保存失败](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=758-1769) | 1280×560 | 错误与重试不被历史内容盖住；历史独立滚动             | 截图+边界已查；DR-V04运行时待验 |
| V05 | [759×720临界](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=758-1835)      | 759×720  | 单列保底，面板通过显式入口；不改保存布局             | 截图+边界已查；DR-V05运行时待验 |
| V06 | [760×720临界](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=758-1886)      | 760×720  | 不是强制双栏开关；仍按可用空间和最小宽选择           | 截图+边界已查；DR-V06运行时待验 |
| V07 | [640×720审批](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=761-1766)      | 640×720  | 拒绝/取消回编辑；草稿保留；焦点圈定当前决策          | 截图+边界已查；DR-V07运行时待验 |
| V08 | [1280×560审批](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=761-1826)     | 1280×560 | 范围两列展示，取消/批准常驻；草稿不自动提交          | 截图+边界已查；DR-V08运行时待验 |

阶段：L/S/D为本机体验设计（D02引用管理仍待实现）；P02数据管理和P连接状态为目标接口；R/A以及V07/V08全部是未来M3/M4示例。画板不改变当前工程完成状态。

## 3. 组件 × 业务态 × 交互态

代码锚点均位于 `apps/desktop/src/renderer/components/`，文件存在不证明v2已接入。没有创建或声称完成Code Connect；精确属性键见[组件映射](design-reset-component-map-2026-09-29.json)。

| 组件                                                                                             | 工程锚点/待实现点                                  | 相关组合覆盖                                             | 不适用项与边界                                  |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| [Button](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=720-1608)           | 基础动作（现有组件内按钮）                         | 24主变体；disabled/loading仍可读，实际disabled语义待实现 | 非按钮业务完成状态不由颜色推断                  |
| [Field](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=720-1670)            | SettingsView.tsx / ProjectLibrary.tsx              | 5变体；P07为只读文本，不伪装可编辑输入                   | 只读没有提交loading；错误不自动清空             |
| [Status](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=720-1700)           | CatalogNotice.tsx / Conversation.tsx               | 6语义；每个Tone独立文案属性，不能互相覆盖                | 非交互，不适用hover/focus/disabled              |
| [Session Tab](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=722-1591)      | TabStrip.tsx                                       | 4变体+内部Close；E09关闭焦点、I09键盘重排                | 关闭不删除/不停止                               |
| [Local Tab](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=722-1619)        | LocalTabs.tsx                                      | 4变体+I03 hover；I05/I06同版本局部视图                   | 仅局部选中，不触发任务                          |
| [Workspace Poster](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=722-1630) | ProjectPoster.tsx / ProjectOverview.tsx            | 3业务变体；L07 focus、I01 hover、L02扫描                 | 加载属于库级状态，卡片不假装执行                |
| [Panel Header](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=722-1660)     | DockSurface.tsx / PanelMenu.tsx / ResizeHandle.tsx | 展开/暂收；D03-D10布局状态与键盘替代                     | 面板标题非按钮，操作集中到菜单/按钮             |
| [Session Row](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=722-1675)      | SessionList.tsx                                    | Open/Closed/Draft；E08 focus、I02 hover、I07空列表       | 不会因hover改最近活动                           |
| [Context Row](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=725-1580)      | WorkbenchPanels.tsx（待实现引用管理）              | Attached/Stale/Unavailable；D02/D11                      | 移除引用不删原件；不自动外发                    |
| [Artifact Card](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=725-1618)    | WorkbenchPanels.tsx（待真实数据）                  | 4业务变体；A03-A09、I05/I06来源与版本                    | 整卡不是执行授权，交互由内部动作承载            |
| [Permission Card](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=725-1678)  | 未来M3/M4 UI，尚无真实运行器                       | 4变体；R03-R14、E05-E07；V07/V08紧凑审批组合             | 卡片本身无hover动作；按钮沿用Button；不默认授权 |
| [Run Status](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=725-1747)       | 未来运行事件UI（待实现）                           | 5变体；请求停止≠确认停止，断连结果未知                   | 非交互状态区，按钮单独可聚焦                    |
| [Validation](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=725-1803)       | 未来版本化验收UI（待实现）                         | 4变体；A10-A13/I06含命令、时间、退出码、范围             | 非交互记录，不要求整卡hover；示例脚本未实现     |
| [Composer](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=725-1854)         | Conversation.tsx                                   | 7变体；S00-S10/I08；本机保存与模型发送不同               | IME、滚动、焦点和远程发送运行时需单独验证       |

按钮hover/pressed/focus/disabled/loading由基础24变体提供；业务卡片不复制按钮笛卡尔积。hover不替代focus；非交互状态文本没有虚构的点击/disabled状态。字段只读、列表空态、整卡焦点等由有名组合板表达，不靠变体数量暗示完成。

## 4. 81项组合状态与设计测试条件

测试编号仅是后续实现交接条件，不是已经运行过的自动测试。下表的返回/焦点/失败条件也保存在可编辑画布上。

| ID  | 状态板                                                                                                     | 范围          | 交互、失败与返回条件                                                                                        | 实现证据                                    |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| L02 | [扫描中](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1578)                     | 本机/布局设计 | 读屏礼貌播报进度，不逐文件抢焦点。取消回到旧海报墙；不删旧数据。                                            | 设计用例 DR-L02；实现/自动测试/人工实测待验 |
| L03 | [工作区概览](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1589)                 | 本机/布局设计 | 海报 Enter 打开概览；新会话建立后焦点进入输入框。不得自动提交给模型。                                       | 设计用例 DR-L03；实现/自动测试/人工实测待验 |
| L04 | [部分结果 / 已过期](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1609)          | 本机/布局设计 | 明确旧结果时间与缺失范围，保留可用入口；不能把部分读取记成完整成功。                                        | 设计用例 DR-L04；实现/自动测试/人工实测待验 |
| L05 | [目录失联](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1630)                   | 本机/布局设计 | 路径和本机记录保留。重新选择范围需明确动作，不能静默扩大扫描范围。                                          | 设计用例 DR-L05；实现/自动测试/人工实测待验 |
| L06 | [重扫失败](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1650)                   | 本机/布局设计 | 错误文字与焦点并存，不靠红色。重试只读；失败不覆盖有效快照。                                                | 设计用例 DR-L06；实现/自动测试/人工实测待验 |
| L07 | [键盘焦点](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1664)                   | 本机/布局设计 | 整张海报为一个主焦点入口；次级菜单单独可聚焦。Enter 打开、Esc 退回并恢复原焦点。                            | 设计用例 DR-L07；实现/自动测试/人工实测待验 |
| L08 | [搜索无结果](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1682)                 | 本机/布局设计 | 结果数量用礼貌播报。清空后恢复海报墙；输入和焦点不丢失。                                                    | 设计用例 DR-L08；实现/自动测试/人工实测待验 |
| L09 | [取消选择 / 扫描取消](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1696)        | 本机/布局设计 | 原生选择器取消不清空路径与卡片。实际 Windows 选择器证据独立记录。                                           | 设计用例 DR-L09；实现/自动测试/人工实测待验 |
| L10 | [范围变更确认](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1707)               | 本机/布局设计 | 这是范围变更设计合同。确认后才开始新扫描；目录读取不等于模型上下文授权。                                    | 设计用例 DR-L10；实现/自动测试/人工实测待验 |
| S00 | [空草稿](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1723)                     | 本机/布局设计 | Tab 可到输入；空内容不可保存，原因可见。没有虚构助手欢迎回复。                                              | 设计用例 DR-S00；实现/自动测试/人工实测待验 |
| S03 | [正在保存](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1738)                   | 本机/布局设计 | 保存期间阻止重复提交，保留原输入；礼貌播报状态，焦点不跳到页面顶部。                                        | 设计用例 DR-S03；实现/自动测试/人工实测待验 |
| S04 | [保存失败](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1753)                   | 本机/布局设计 | 正文与附件引用留在输入区。重试不重复创建记录；关闭前显式处理未保存内容。                                    | 设计用例 DR-S04；实现/自动测试/人工实测待验 |
| S05 | [关闭前确认](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1774)                 | 本机/布局设计 | dialog 以标题命名；初始焦点在继续编辑。Esc 等于取消，关闭后焦点回相邻会话标签。                             | 设计用例 DR-S05；实现/自动测试/人工实测待验 |
| S06 | [全部会话 / 恢复](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1790)            | 本机/布局设计 | 恢复已关闭会话复用原 ID、草稿和布局；已有标签时只激活，不重复新建。                                         | 设计用例 DR-S06；实现/自动测试/人工实测待验 |
| S07 | [会话搜索无结果](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1809)             | 本机/布局设计 | 不自动创建会话。清空保留键盘位置，恢复按最近活动排序的列表。                                                | 设计用例 DR-S07；实现/自动测试/人工实测待验 |
| S08 | [已关闭，不是删除](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1824)           | 本机/布局设计 | 运行状态必须另行核对；关闭标签不能被当成已停止。删除走独立危险确认。                                        | 设计用例 DR-S08；实现/自动测试/人工实测待验 |
| S09 | [标签与关闭按钮焦点](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1839)         | 本机/布局设计 | 标签使用 roving tabindex；左右切换标签、Delete/关闭按钮触发同一确认。关闭按钮有完整会话名称。               | 设计用例 DR-S09；实现/自动测试/人工实测待验 |
| S10 | [最近活动 / 草稿恢复](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1851)        | 本机/布局设计 | 最近活动来自用户保存或编辑，不因后台轮询乱序。重启恢复保留草稿和工作区；持久化失败不报成功。                | 设计用例 DR-S10；实现/自动测试/人工实测待验 |
| D03 | [面板与布局菜单](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1868)             | 本机/布局设计 | 菜单以按钮命名，↑↓移动、Enter执行、Esc关闭并回触发器；布局切换不提交任务。                                  | 设计用例 DR-D03；实现/自动测试/人工实测待验 |
| D04 | [键盘移动面板](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1891)               | 本机/布局设计 | 这是拖拽的等价入口。移动后焦点留在面板标题并播报目标；Esc撤销尚未提交的移动。                               | 设计用例 DR-D04；实现/自动测试/人工实测待验 |
| D05 | [调整分栏](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1916)                   | 本机/布局设计 | separator 可聚焦，左右键 16px、Shift 48px；Home/End 到安全边界。空间不足先临时收起，不挤掉主操作。          | 设计用例 DR-D05；实现/自动测试/人工实测待验 |
| D06 | [暂收 / 恢复](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1929)                | 本机/布局设计 | 面板来源与滚动位置保留；重新打开恢复焦点。窄屏自动暂收不是永久布局修改。                                    | 设计用例 DR-D06；实现/自动测试/人工实测待验 |
| D07 | [保存布局中](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1944)                 | 本机/布局设计 | 请求完成前不显示已保存；不重复写入。切换会话不能把A布局写进B。                                              | 设计用例 DR-D07；实现/自动测试/人工实测待验 |
| D08 | [保存成功 / 放弃修改](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1955)        | 本机/布局设计 | 成功回执必须来自持久化。取消未保存调整恢复该会话上次布局，不覆盖其他会话。                                  | 设计用例 DR-D08；实现/自动测试/人工实测待验 |
| D09 | [保存失败](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1969)                   | 本机/布局设计 | 保留当前临时布局与失败原因。离开前说明未保存，不以静默重试造成跨会话污染。                                  | 设计用例 DR-D09；实现/自动测试/人工实测待验 |
| D10 | [会话隔离](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-1983)                   | 本机/布局设计 | 存储键关联 sessionId 与布局版本；恢复失败只影响当前会话，不清空全局配置。                                   | 设计用例 DR-D10；实现/自动测试/人工实测待验 |
| D11 | [上下文过期 / 不可访问](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=746-2002)      | 未来设计示例  | 引用管理为待实现设计。刷新只核对本机来源；移除引用不删原文件，任何外发仍独立批准。                          | 设计用例 DR-D11；实现/自动测试/人工实测待验 |
| P03 | [尚未配置](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-1813)                   | 未来设计示例  | 焦点进入首个字段；不预填密钥、不默认远程Provider、不自动上传工作区。                                        | 设计用例 DR-P03；实现/自动测试/人工实测待验 |
| P04 | [连接中](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-1826)                     | 未来设计示例  | 取消后恢复原配置。健康检查只发最小必要信息，不能当成用户授权。                                              | 设计用例 DR-P04；实现/自动测试/人工实测待验 |
| P05 | [可用 / 能力受限](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-1843)            | 未来设计示例  | 能力列表来自运行器合同；可用不等于任务成功。受限操作保留原因而不是可点击假按钮。                            | 设计用例 DR-P05；实现/自动测试/人工实测待验 |
| P06 | [连接失败 / 凭据失效](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-1857)        | 未来设计示例  | 提示不回显密钥。失败后不偷偷切Provider；操作完成焦点回连接状态并播报。                                      | 设计用例 DR-P06；实现/自动测试/人工实测待验 |
| P07 | [只读范围](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-1875)                   | 未来设计示例  | 只读字段使用文本语义，信息可复制；不可编辑原因可见。改范围使旧批准失效。                                    | 设计用例 DR-P07；实现/自动测试/人工实测待验 |
| P08 | [导出前确认](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-1884)                 | 未来设计示例  | 选择位置后才导出；导出失败保留原数据。读屏先读敏感内容警告，不默认云同步目录。                              | 设计用例 DR-P08；实现/自动测试/人工实测待验 |
| P09 | [删除单条会话](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-1904)               | 未来设计示例  | 危险确认有明确对象。初始焦点取消，Esc取消；成功返回列表，失败保留原记录。                                   | 设计用例 DR-P09；实现/自动测试/人工实测待验 |
| P10 | [清空全部 · 二次确认](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-1918)        | 未来设计示例  | 清空独立于删除单条。只有显式匹配与最终确认才执行；取消不写数据。                                            | 设计用例 DR-P10；实现/自动测试/人工实测待验 |
| P11 | [清空失败](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-1937)                   | 未来设计示例  | 这是失败结果样例，不报部分成功。导出成功另显示真实目标/数量/时间；无法确认时标结果未知。                    | 设计用例 DR-P11；实现/自动测试/人工实测待验 |
| P12 | [坏档：停止写入](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-1954)             | 未来设计示例  | 诊断不上传数据；先确认字节级备份可读，失败则留在只读模式。不能把解析失败当空会话。                          | 设计用例 DR-P12；实现/自动测试/人工实测待验 |
| P13 | [诊断与受控恢复](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-1970)             | 未来设计示例  | 备份与原件保留；成功后才允许写入。恢复失败回到诊断，不能循环覆盖最后好副本。                                | 设计用例 DR-P13；实现/自动测试/人工实测待验 |
| P14 | [迁移失败 / 回退](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-1984)            | 未来设计示例  | 验证完整后原子替换；回退失败仍只读。不得自动删除、静默降级或把坏档迁移成空档。                              | 设计用例 DR-P14；实现/自动测试/人工实测待验 |
| R03 | [意图已核对，尚未授权](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-2004)       | 未来设计示例  | ready 只证明意图核对。修改目标/版本使已有权限失效；焦点回变更摘要。                                         | 设计用例 DR-R03；实现/自动测试/人工实测待验 |
| R04 | [读取权限](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-2020)                   | 未来设计示例  | 读完整对象、路径、权限、接收方、时效后才能批准。拒绝保留讨论；默认不批准。                                  | 设计用例 DR-R04；实现/自动测试/人工实测待验 |
| R05 | [写入权限 · 单独批准](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-2046)        | 未来设计示例  | 示例，不沿用只读批准。先校验最新版本与备份，再启用最终写入；无可恢复证据则拒绝。                            | 设计用例 DR-R05；实现/自动测试/人工实测待验 |
| R06 | [执行命令权限](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-2061)               | 未来设计示例  | 命令/参数/目录改变需重签；不把任意shell或后续命令打包进本次批准。                                           | 设计用例 DR-R06；实现/自动测试/人工实测待验 |
| R07 | [批准提交中 / 可撤回](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-2075)        | 未来设计示例  | 提交未确认前不启动；重复点击幂等。撤回只有得到确认才显示已撤回，否则标未知待核对。                          | 设计用例 DR-R07；实现/自动测试/人工实测待验 |
| R08 | [已拒绝 / 已撤回](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-2091)            | 未来设计示例  | 拒绝/确认撤回后不得执行；回到讨论但保留决定审计。想继续必须发起新的范围请求。                               | 设计用例 DR-R08；实现/自动测试/人工实测待验 |
| R09 | [过期 / 目标版本改变](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-2118)        | 未来设计示例  | 凭证绑定目标、动作、版本、接收方与时效。任一变化旧批准失效；不可静默续期。                                  | 设计用例 DR-R09；实现/自动测试/人工实测待验 |
| R10 | [执行中](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-2144)                     | 未来设计示例  | 事件携带taskId/sessionId/sequence/time与来源。关闭会话不停止；停止始终可达。                                | 设计用例 DR-R10；实现/自动测试/人工实测待验 |
| R11 | [已请求停止](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-2162)                 | 未来设计示例  | 按钮请求≠任务停止；保留输出和最后事件。等待确认不能显示已停止或回到可重试。                                 | 设计用例 DR-R11；实现/自动测试/人工实测待验 |
| R12 | [已确认停止](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-2181)                 | 未来设计示例  | 仅收到运行器停止事件才显示该状态；已有产物保留但注明是否完整。                                              | 设计用例 DR-R12；实现/自动测试/人工实测待验 |
| R13 | [断连 / 结果未知](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-2199)            | 未来设计示例  | 连接中断不等于失败，不自动重新执行。重连先核对任务、事件序列与授权时效。                                    | 设计用例 DR-R13；实现/自动测试/人工实测待验 |
| R14 | [失败与核对后的恢复](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=755-2217)         | 未来设计示例  | 重试是新执行，重新核对目标版本和权限。不能用“恢复连接”按钮绕过执行批准。                                    | 设计用例 DR-R14；实现/自动测试/人工实测待验 |
| A03 | [没有改动 / 没有产物](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=756-2010)        | 未来设计示例  | 空态焦点回会话；未接运行器时说明原因，不展示“全部通过”。                                                    | 设计用例 DR-A03；实现/自动测试/人工实测待验 |
| A04 | [不可读 / 无权限](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=756-2023)            | 未来设计示例  | 不可读不伪装成空文件。跳过保留未覆盖清单；不会自动提权。                                                    | 设计用例 DR-A04；实现/自动测试/人工实测待验 |
| A05 | [二进制 / 过大文件](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=756-2039)          | 未来设计示例  | 不绘制虚构文本Diff；外部打开是独立可见动作，先核对路径与安全边界。                                          | 设计用例 DR-A05；实现/自动测试/人工实测待验 |
| A06 | [部分结果 / 来源失效](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=756-2051)        | 未来设计示例  | 总览明确部分覆盖与缺口。不能以局部通过代替整项验收。                                                        | 设计用例 DR-A06；实现/自动测试/人工实测待验 |
| A07 | [磁盘版本冲突](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=756-2076)               | 未来设计示例  | 显示base/current/proposal来源；重新生成差异和写入批准，保留用户修改。                                       | 设计用例 DR-A07；实现/自动测试/人工实测待验 |
| A08 | [产物生成中 / 失败](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=756-2092)          | 未来设计示例  | 生成状态来自真实事件；失败保留已确认部分和诊断。不能凭预览打开判定生成成功。                                | 设计用例 DR-A08；实现/自动测试/人工实测待验 |
| A09 | [预览 / 文件 / 验收同版本](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=756-2135)   | 未来设计示例  | 切换局部Tab保持同版本与来源。版本切换使旧验收仅作历史，不自动算当前通过。                                   | 设计用例 DR-A09；实现/自动测试/人工实测待验 |
| A10 | [验收未运行](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=756-2160)                 | 未来设计示例  | 显示目标、方法、范围；没有exit code与时间就不造通过记录。运行验证本身可能需命令授权。                       | 设计用例 DR-A10；实现/自动测试/人工实测待验 |
| A11 | [验收进行中](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=756-2179)                 | 未来设计示例  | 可查看日志与停止入口；观察中断显示未知。未结束的测试不能标PASS。                                            | 设计用例 DR-A11；实现/自动测试/人工实测待验 |
| A12 | [验收通过 · 有限范围](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=756-2200)        | 未来设计示例  | 这里是手工设计示例。生产通过只能来自该修订的真实记录；局部测试不能冒充完整pnpm check。                      | 设计用例 DR-A12；实现/自动测试/人工实测待验 |
| A13 | [验收失败](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=756-2220)                   | 未来设计示例  | 显示可定位错误与版本；修复后重跑生成新记录，不能覆盖或隐藏旧失败。                                          | 设计用例 DR-A13；实现/自动测试/人工实测待验 |
| A14 | [发布 / 外发独立批准](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=756-2244)        | 未来设计示例  | 默认不外发。列清接收方、文件、可见范围与后果；批准写本机文件不包含上传权限。                                | 设计用例 DR-A14；实现/自动测试/人工实测待验 |
| E01 | [导出成功](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=762-2147)                   | 未来设计示例  | 必须取得实际写入成功回执才显示。失败保留原数据与目标错误；取消不生成半成品。                                | 设计用例 DR-E01；实现/自动测试/人工实测待验 |
| E02 | [删除进行中](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=762-2160)                 | 未来设计示例  | 提交后不声称还能撤销。阻止重复点击；若窗口关闭，重开后核对操作结果，不默认重试删除。                        | 设计用例 DR-E02；实现/自动测试/人工实测待验 |
| E03 | [清空内容匹配，等待最终决定](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=762-2173) | 未来设计示例  | 匹配只启用按钮，不自动提交。最终点击再次绑定当前数量/版本，变化则重新确认。                                 | 设计用例 DR-E03；实现/自动测试/人工实测待验 |
| E04 | [删除成功 / 清空成功](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=762-2192)        | 未来设计示例  | 清空成功则显示0条并回空态。只对真实持久化结果显示成功，不能先移除UI后假定磁盘已删除。                       | 设计用例 DR-E04；实现/自动测试/人工实测待验 |
| E05 | [已批准，仅限本次](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=762-2205)           | 未来设计示例  | 批准记录含对象/动作/版本/接收方/过期条件，等待执行事件另记；不是永久权限。                                  | 设计用例 DR-E05；实现/自动测试/人工实测待验 |
| E06 | [撤回请求已确认](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=762-2231)             | 未来设计示例  | 如任务已启动，撤回许可不等于任务停止；另发停止请求并等待运行器确认。                                        | 设计用例 DR-E06；实现/自动测试/人工实测待验 |
| E07 | [撤回结果未知](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=762-2245)               | 未来设计示例  | 核对permissionId与任务事件。未知不自动重新执行，也不自动补发新的授权。                                      | 设计用例 DR-E07；实现/自动测试/人工实测待验 |
| E08 | [会话行键盘焦点](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=762-2258)             | 本机/布局设计 | 行主动作是激活或恢复；键盘操作不依赖hover。上下键移动行、Enter激活，关闭列表焦点回全部会话。                | 设计用例 DR-E08；实现/自动测试/人工实测待验 |
| E09 | [关闭按钮独立焦点](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=762-2271)           | 本机/布局设计 | 焦点落在独立关闭按钮时显示2px外围线，可访问名称“关闭：整理毕业项目”。触发未保存确认后，取消回到该关闭按钮。 | 设计用例 DR-E09；实现/自动测试/人工实测待验 |
| I01 | [海报 Hover](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=765-2201)                 | 本机/布局设计 | 鼠标悬停只改变中性表面，不暗示授权或执行。整卡主动作与旁侧动作分开；触屏和键盘不依赖hover。                 | 设计用例 DR-I01；实现/自动测试/人工实测待验 |
| I02 | [会话行 Hover](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=765-2214)               | 本机/布局设计 | hover提示可恢复；不会自动恢复或改最近活动时间。键盘焦点样例见E08。                                          | 设计用例 DR-I02；实现/自动测试/人工实测待验 |
| I03 | [局部 Tab Hover](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=765-2223)             | 本机/布局设计 | hover不切换当前产物。点击/Enter后才激活；方向键只在此tablist，不能改变全局会话。                            | 设计用例 DR-I03；实现/自动测试/人工实测待验 |
| I04 | [逐文件读取中](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=765-2230)               | 未来设计示例  | 取消保留已确认片段并标部分，不显示整项完成。未读文件不当成无改动。                                          | 设计用例 DR-I04；实现/自动测试/人工实测待验 |
| I05 | [文件清单 · 同一产物 v3](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=765-2243)     | 未来设计示例  | 预览、文件清单和验收绑定同一artifactId/version。文件失联逐项标记，不退回别的会话同名文件。                  | 设计用例 DR-I05；实现/自动测试/人工实测待验 |
| I06 | [验收记录 · 同一产物 v3](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=765-2256)     | 未来设计示例  | 记录是手工设计样例，脚本未实现。历史失败仍可见；切换v4不继承v3结果。                                        | 设计用例 DR-I06；实现/自动测试/人工实测待验 |
| I07 | [全部会话 · 尚无记录](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=765-2270)        | 本机/布局设计 | 与搜索无结果S07不同。关闭后焦点回全部会话按钮；不创建无工作区的幽灵会话。                                   | 设计用例 DR-I07；实现/自动测试/人工实测待验 |
| I08 | [关闭等待已受理保存](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=765-2282)         | 本机/布局设计 | 不强行截断写入。超时显示未知/失败并保留输入，不声称已关闭成功；取消关闭不撤销已受理保存。                   | 设计用例 DR-I08；实现/自动测试/人工实测待验 |
| I09 | [标签重排的键盘替代](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=765-2293)         | 本机/布局设计 | 重排只改变标签顺序，不改sessionId或草稿。完成后焦点留在原标签；Esc取消当前拖拽。                            | 设计用例 DR-I09；实现/自动测试/人工实测待验 |

## 5. 设计完成后仍独立排队的事项

| 验证轨                         | 当前状态                    | 后续真实证据                                                                        |
| ------------------------------ | --------------------------- | ----------------------------------------------------------------------------------- |
| v2 CSS/组件实现                | 本轮不实施                  | 实际源码差异、Windows启动截图                                                       |
| P12原型连续流程                | 0起点/0反应；待建连线和实点 | 仅在新main717:1578补连线后，从起点实际点击、回退、拒绝/取消、断连恢复，记录触达节点 |
| 键盘/IME/读屏                  | 设计合同已写；运行时待验    | 键盘建切关恢复、NVDA或等效、中文组合键、焦点返回                                    |
| Windows 200%/强制颜色/降低动效 | 待实机验证                  | 真实Windows设置下逐屏检查，不用Figma尺寸模拟冒充                                    |
| M2工程门禁                     | 不因本次设计完成而改变      | 被审修订的新鲜pnpm check、独立审阅、picker证据适用性                                |
| M3/M4运行、写入、外发          | 设计示例，无实际接入        | 事件来源、授权强制检查、停止确认、版本冲突和回滚证据                                |
| Code Connect/组件库发布        | 未执行                      | 代码稳定并获相应授权后单独实施；本地可编辑库已足够本轮交接                          |

## 6. 画布与恢复

主稿、规范、3类组件、状态矩阵和响应式各自分页；状态板按“L/S/D本机 → P/R/A未来 → E/I补充”三行排列。新旧入口切换只允许按已记录页面ID改名/排序，不删除历史节点或断开原型。恢复只需恢复旧页面名称/顺序；所有屏幕/组件ID保持稳定。确切切换见[可逆入口记录](design-reset-cutover-2026-09-29.json)，旧内容与原型反应指纹见[切换后核对](design-reset-legacy-after-2026-09-29.json)。
