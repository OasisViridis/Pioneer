# Permission Card · 真实事件快照审阅

2026-11-03。来源是 Issue #37 的真实 Figma 命名版本事件，不是手工 JSON，也不是设计批准。

## 固定版本

- Figma 文件：`EQis9ep9ZQsEenrUVXwlFU`。
- 命名版本：`2417598685933588034`，label `Pioneer READY change-approval-preview`，创建时间 `2026-11-03T11:02:08Z`。
- 事件：`FILE_VERSION_UPDATE`，webhook `4740131`，`deliveryId` `3d2ac5885fc6cff0696b9184d48f4820c10a9cfe834136336e743450f7523c27`，接收时间 `2026-11-03T11:04:09.640Z`。
- 节点：`830:1593` `Pioneer v3 / Permission Card`（COMPONENT_SET）。
- 快照 SHA-256：`0cfc2f66480ee6e1d7462dad9374b228c1fa6ea69e00ddc4fbaf764ac3ecc79a`。
- 材料 SHA-256：`965418ec263c4dbb4a1f77ac44ee62ab9bcb252784361a784a751cb209328500`（eventKey）。

## 内容与边界

快照只包含选中节点的结构、名称、组件属性、变体、文本和动作实例；不包含图片字节、矢量或外部资源 URL。它不是像素重建，也不替代视觉比较。

四个变体：

- `State=Awaiting`：`830:1594`，标题“是否批准本次读取？”，动作“批准本次读取 / 拒绝并保留讨论”。
- `State=Denied`：`830:1606`，标题“你已拒绝本次读取”，动作“重新核对范围 / 返回讨论”。
- `State=Expired`：`830:1618`，标题“本次批准已失效”，动作“重新核对范围 / 返回讨论”。
- `State=Approved`：`830:1630`，标题“本次读取已批准”，动作“撤回本次授权 / 查看批准范围”。

组件属性 `Operation#725:23`、`Scope#725:28`、`Recipient#725:33`、`Expiry#725:38` 与 `State` 均在快照中；`Scope` 保留原始换行。设计稿自身带有“设计示例 · 尚未接入 · 不具授权效力”的注解；运行时组件不会把这条注解当成真实授权，也不会产生授权副作用。

## 映射与后续

- 映射在 [component-mappings.json](../sync/component-mappings.json) 的 `830:1593`，代码是 `apps/desktop/src/renderer/components/PermissionCard.tsx`；Settings 只读预览由 PR #73 提供。
- 本快照是 S2 `event-request` 的固定输入；它不代表 #19 的功能完成，也不代表 Draft PR 已产生。
- #37、#33 保持 Open；真实 Figma 部分失败、Code Connect 与真人验收仍未执行。
