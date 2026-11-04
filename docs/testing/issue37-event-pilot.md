# #37 真实命名版本事件试点（2026-11-03）

状态：**真实 Figma 事件已送达并被接收，GitHub 消费端因 main 尚无 `events.json` 返回 `event-disabled`。** 本文件记录事实、配置与剩余步骤；不把这次事件当作 #37 条件 5 已完成。

## 试点登记

- Issue：#19 `[P4-A] 修改：预览并批准一次文件变更`（Open，`blocked_by=0`）。
- Figma 文件：`EQis9ep9ZQsEenrUVXwlFU`。
- 设计节点：`830:1593` `Pioneer v3 / Permission Card`（COMPONENT_SET，四种 State：Awaiting/Denied/Expired/Approved；含 Operation/Scope/Recipient/Expiry 与批准/拒绝动作）。
- 选择理由：该组件是现有设计文件中与“审阅并批准一次操作”最接近的已发布组件；没有新建或改写设计稿。节点为组件集，没有 composition 覆盖，因此不需要 `compositionMappings`。
- 登记名：`change-approval-preview`；发布标签：`Pioneer READY change-approval-preview`。

## 真实事件

- Figma Webhook：`4740131`，context=`team`，event=`FILE_VERSION_UPDATE`，指向临时 Cloudflare Quick Tunnel + 本地接收器。
- 命名版本：`2417598685933588034`，label `Pioneer READY change-approval-preview`，创建时间 `2026-11-03T11:02:08Z`。
- 接收器送达时间 `2026-11-03T11:04:09.640Z`（团队级 webhook 在版本创建后约 2 分钟送达）。
- `deliveryId`：`3d2ac5885fc6cff0696b9184d48f4820c10a9cfe834136336e743450f7523c27`（接收器对原始请求体做 SHA-256）。
- 接收器完成 passcode 校验后只转发受限字段；原始 passcode、用户信息和事件正文没有进入 GitHub。

文件级 webhook 在该 Education 团队返回 `400 Webhook Limit Exceeded`（即使文件级 webhook 数为 0，删除团队 webhook 后仍失败），因此使用团队级 webhook；团队级只对团队可见文件送达，草稿文件不会触发。这个限制需要写进接收器选择说明，不能把团队级 webhook 当成覆盖所有文件。

## 本地消费结果

使用真实事件文件走生产 `tools/design-event-consumer.mjs`，本地启用试点配置：

- state：`awaiting-local-agent`
- eventKey：`965418ec263c4dbb4a1f77ac44ee62ab9bcb252784361a784a751cb209328500`
- baseSha：`2ff851f358e84caabd0a0b66c8e740b842b75790`（当前 main）
- version：`2417598685933588034`
- snapshotSha256：`0cfc2f66480ee6e1d7462dad9374b228c1fa6ea69e00ddc4fbaf764ac3ecc79a`
- 快照只包含选中节点结构，`imageRef` 不出现；文件 32 KB，节点 `830:1593` 与四个状态变体完整。
- 本地进程按约定返回 `awaiting-local-agent` 并退出 1；它没有创建 PR、没有调用模型。

## GitHub 消费端

- 接收器已向 `OasisViridis/Pioneer` 发送 `repository_dispatch`（`figma-design-release`）。
- [run 41624454864](https://github.com/OasisViridis/Pioneer/actions/runs/41624454864) 已启动并成功上传 artifact；消费者返回 `event-disabled` 并退出 1，因为 main 上没有 `design/delivery/events.json`。
- 这正是本 PR 要补的配置缺口，不是接收器或 secret 失败；`FIGMA_ACCESS_TOKEN` 已存在于 Actions secret，接收器到 GitHub 的交接已实际发生。

## 本 PR 的配置

- `design/delivery/events.json`：`enabled: true`、`webhookId: "4740131"`、route `change-approval-preview`。
- `design/delivery/features.json`：新增 `change-approval-preview`，含 issue 19、fileKey、节点 `830:1593`、`changeTypes: ["ui"]`、试点 allowedPaths 与现有 basis 文件。
- 该 feature 是**试点登记**，不是 #19 的功能验收；实现与验收仍需单独执行。`basis` 只引用当前已存在的文件，`prepare` 不会读取不存在的路径。

## 2026-11-04 后续结果

- 真实事件材料经 `event-request` / `prepare` 生成 S2 请求，Draft PR [#75](https://github.com/OasisViridis/Pioneer/pull/75) 创建并合并为 `c3855ff8898b68bfa6c55d3351e5704ae78b94fc`；最终 head `d1235fb` 的两项 Windows job 通过，main 同 SHA 的 quality run `41669290728` 通过。
- 用真实 Figma 令牌向节点 `830:1593` 回填 6 条 Dev Resources（Issue #19、PR #75、commit、CI、固定包、验收记录）；回执 `links-verified`，顺序重放 3 次均为 `created: 0`。令牌未进 Git/PR/日志，回填后删除。
- 固定设计包的 `outputHash` 是首次交付的 `7dc2…`，补丁后最终输出为 `87b5…`；`deliver` 对变化输出返回 `review-required`，本次是人工补到同一分支后合并。这是元数据缺口，不能称为干净的自动 S2 更新。

## 仍未完成

- 永久接收器/Webhook 仍缺：临时 Cloudflare Quick Tunnel、团队 Webhook `4740131`、passcode 与 GitHub secret 已删除；真实事件链路只在临时环境成功过一次。
- 同一真实事件在 PR 产生后三次重放、错误 passcode/旧版本/越界节点/限流在永久接收器上的复验仍未执行。
- Code Connect 官方发布与节点读回、真人 Windows/真实 Provider 人工验收仍未执行。
- #19 仍是受控切片：固定后像内容、无会话级持久权限、无 #20 恢复、无 Visual Regression 基线。#37、#33 保持 Open。
