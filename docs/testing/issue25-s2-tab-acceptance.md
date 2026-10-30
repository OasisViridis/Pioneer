# #25 会话分支标签 S2 验证

本交付依据 Figma 版本 `2415735911323890660` 的 [画板](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?version-id=2415735911323890660&node-id=1093-1259)和 [结构快照](https://github.com/OasisViridis/Pioneer/blob/4b67a17b7b121644bbab37760526fe2bbbb4bedd/docs/testing/snapshots/session-branch-tabs-2415735911323890660.json)。结构快照独立于本实现差异；[图像与审阅记录](https://github.com/OasisViridis/Pioneer/blob/305109beacab966e176f471f688288f62d9818b0/docs/testing/snapshots/session-branch-tabs-review.md)提供同一版本的视觉参考。

## 实现与验证范围

- 普通会话无分支标记；具有 `branchOrigin` 的会话显示“分支”。标签与现有工作区共享来源有效性判断：源会话和原消息仍匹配才显示来源标题与一基消息序号，否则显示“来源不可用”。标签没有新增跳转，原工作区来源按钮仅在来源可用时显示。
- 来源提示在标签获得焦点或鼠标悬停时可见，辅助技术可通过标签描述获取相同状态；指针可移入提示，Escape 可收起。保留已有方向键选择、关闭与恢复焦点行为。长来源标题在 640 像素宽窗口内换行；键盘聚焦时标签与关闭按钮滚动进入可见范围，鼠标悬停不移动标签栏。
- `tests/e2e/p1-session.e2e.spec.ts` 的真实 Electron 用例验证来源可用、来源会话缺失、消息变化、焦点与悬停提示、辅助技术描述、方向键和窄窗长标题；缺失和消息变化使用隔离持久化记录构造，前后比较 fixture 哈希。生成的应用截图由 Codex 对照固定版本草案检查；现有项目副标题、响应式标签尺寸和关闭行为按 S1 保留差异，不宣称与草案像素一致。
- 本次未运行真实 Provider 或真人设备验收；它们与本界面变更的自动验证分开记录。没有声称收到 Figma Webhook，也没有执行 Dev Resources 回填或 Code Connect 发布。

合并后的回填仍须核对目标 PR 的真实 merge SHA、同 SHA 质量与视觉作业、此文档在该提交中的固定链接，并通过受控写入与读回流程。
