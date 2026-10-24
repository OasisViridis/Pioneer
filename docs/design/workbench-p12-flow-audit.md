# Pioneer P12 原型连线审计 · 2026-09-30

> 2026-10-01 归档迁移：下文保留原日期的设计与验收口径；页面级导航已转向 ARCHIVE 对应分区，P12 的 `page-id` 改为 `257-725`，不新增实点或运行时结论。迁移表与当前入口见 [设计归档与 Make 交接](figma-archive-make-handoff-2026-10-01.md)。

> 状态：**已连线，浏览器实点待主代理**。本记录不把静态设计示例当作运行时能力，也不把连接存在等同 P12 COMPLETE。

## 画布与结构

- Figma file: `EQis9ep9ZQsEenrUVXwlFU`; page `main`=`717:1578`（page ID）。
- P12 section `800:773`，名称 `P12 · 连续流程演示`，位于 main 右侧；42 个复制的 Window/UI frame 全部为 section 的直接子级，能作为同页原型目标。
- 新克隆名统一 `P12 / <源nodeId> / <源名>`；由已有可编辑窗口/UI frame 克隆，原稿与 `states · v2` 仍保留。
- 克隆前从原文本段读取并加载字体；实例、文本层次、变量/样式引用保留。文件组件库搜索 `Action` 未找到已发布组件；Code Connect查询因Figma席位不足不可用，记录N/A，未新建映射。
- page `flowStartingPoints` 当前恰为5个；P12 section累计57条Reaction，全部NAVIGATE目标都在该section内；来源原稿关键frame仍为0 reactions。结构检查通过；**未进行浏览器实点和完整视觉验收**。

## 原型入口与点击序列

打开以下 Figma Prototype URL，每条从指定起点开始。当前URL依赖本文件访问权限；真实浏览器点击留给主代理。

| Flow | 起点nodeId | Prototype URL | 点击路径 |
|---|---|---|---|
| Workspace | `800:775` | [打开 Workspace 原型](https://www.figma.com/proto/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=800-775&page-id=257-725&starting-point-node-id=800-775) | L01可用工作区海报→L03概览→打开本机会话→S01。另可选根目录→L02扫描→取消→L09→返回库；失联工作区→L05→更换根目录→L09。**当前画面没有“创建新会话”动作；L03“打开本机会话”是已有本机会话，不冒称新建。** |
| 本机保存恢复 | `800:824` | [打开本机保存恢复原型](https://www.figma.com/proto/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=800-824&page-id=257-725&starting-point-node-id=800-824) | S01保存→S03保存中→650ms后S02已保存。关闭标签→S05：继续编辑回S01；保存后关闭/放弃草稿→S06；点击已关闭会话→S02恢复。S04保存失败仅有重试入口，无真实触发器。 |
| 布局与引用 | `800:890` | [打开布局与引用原型](https://www.figma.com/proto/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=800-890&page-id=257-725&starting-point-node-id=800-890) | D01面板与布局→D03菜单：显示上下文→D02；暂收上下文→D06→重新打开；交付布局→D12→返回D01；保存当前布局→D08→保留/恢复回D01。D02失效引用“重新核对”→D11；缺少核对成功/移除后状态，不伪造后续。 |
| 设置数据（设计示例） | `800:1035` | [打开设置数据原型](https://www.figma.com/proto/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=800-1035&page-id=257-725&starting-point-node-id=800-1035) | P01本机数据→P02；导出→P08，取消回P02/确认→E01成功示例；清空→P10，取消回P02/确认→E04成功示例；E04返回全部会话→S06。整个数据管理、导出、删除都是**设计示例**，不真实读写。P11清空失败没有可信触发器。 |
| 未来Agent（设计示例） | `800:1141` | [打开未来Agent原型](https://www.figma.com/proto/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=800-1141&page-id=257-725&starting-point-node-id=800-1141) | R01批准→R07提交中→650ms后R10执行示例→请求停止→R11→等待确认→R12→A01 Diff→标记已审阅→A02预览；A02版本来源→A09；文件清单→I05，验收记录→I06。R01拒绝→R08→返回讨论。R02重连→R13仍未知。所有M3/M4/运行、停止、Diff及验收节点均为设计示例，没有实际Agent执行或测试结论。 |

## 缺失路径与N/A

这些是当前源设计缺少可匹配动作/结果，不是遗漏造假的连线：

- **新会话创建**：已有Workspace screen只有打开本机会话；创建新会话入口/结果不可演示。
- **S04保存失败**、**D09布局保存失败**、**P11清空失败**：复制了可恢复示例状态和相应重试/返回按钮，但正常画面没有真实的失败触发器；当前状态无入边。
- **D11引用核对**：有重新核对/移除控件，但没有成功核对或移除后的匹配状态；不把它们连回仍显示过期引用的D02。
- **R02/R13/R14**：断连结果未知可看到“重新连接并核对”至R13；无新事件的结果决策，因此R02是独立未连入示例，R13不自动重试，R14失败恢复示例没有可信失败入边。
- **A04无权限/不可读**：当前A01未展示同一对象的不可读操作，所以该state无入边。
- 真实拖拽、原生选择器行为、键盘重排、文件读写、权限强制、运行中止、测试PASS结果均不在此原型证明范围内。没有将它们接成虚假成功路径。

## 复制源与目标 ID

完整42条来源→副本映射、57条reaction的操作nodeId与目标nodeId、5个flowStartingPoints、尺寸/坐标和结构验证结果见[机器可读账本](workbench-p12-connections-2026-09-30.json)。页面其余8个原始main frame的ID及状态页原件保持原样。
