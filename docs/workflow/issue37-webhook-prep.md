# #37 事件接收准备（Phase A）

2026-11-03。状态：GitHub 接收端已准备并通过受控测试；接收器未部署、未创建 Figma Webhook、未收到真实 Figma 事件。本文件不关闭 #37，也不把受控 dispatch 当作真实 Figma 验收。

## 已实现与未实现

| 项目 | 状态 |
| --- | --- |
| GitHub `repository_dispatch` 消费者 | 已实现：`.github/workflows/design-intake.yml` + `tools/design-event-consumer.mjs` |
| 受限 dispatch 契约与严格校验 | 已实现：`inspectDispatch` 拒绝额外字段、越界文件/标签、错误 webhook、PING/普通编辑 |
| 固定版本复核与 S2 去重 | 复用 `tools/design-events.mjs` 的版本历史、节点读取、单活跃 PR 与同版本去重 |
| 材料产物 | 已实现：`awaiting-local-agent` 时写入 `tmp/design-external/` 并上传 artifact |
| 接收器（n8n/HTTPS） | 未部署 |
| Figma Webhook 创建与 passcode 校验 | 未执行；passcode 只在接收器，不进入 GitHub |
| 真实 Figma 事件 → Draft PR | 未验收；消费者不创建 PR、不调用模型 |
| Code Connect、真人/Provider 验收 | 仍未执行 |

## 接收器 → GitHub 契约

接收器在验证 Figma passcode 后，只向 GitHub 发送以下字段，不得附带 passcode、用户信息、节点列表、Issue 编号、命令或提示词：

| 字段 | 约束 | 用途 |
| --- | --- | --- |
| `schemaVersion` | 固定 `1` | 契约版本 |
| `webhookId` | 字符串，≤64 | 与 `events.json` 的 `webhookId` 匹配 |
| `eventType` | `FILE_VERSION_UPDATE` | 其他类型在消费者侧忽略 |
| `fileKey` | 字母数字，≤64 | 与登记 feature 的 fileKey 匹配 |
| `versionId` | 字母数字/下划线/连字符，≤128 | Figma 固定版本 ID |
| `label` | 字符串，≤200 | 只接受登记的发布标签 |
| `deliveryId` | 64 位小写十六进制 | 接收器对原始请求体做 SHA-256，用于去重与审计 |
| `receivedAt` | 可解析的 ISO 时间 | 接收时间，不作为版本顺序依据 |

接收器必须：

1. 只接受 HTTPS POST；用恒时比较校验 `passcode`，不匹配返回 401，不转发。
2. 只在 `event_type === 'FILE_VERSION_UPDATE'` 时转发；`PING`、`FILE_UPDATE`、普通编辑不触发。
3. 关闭请求正文和成功数据日志，避免 passcode 进入日志；passcode 不写入 GitHub payload。
4. 只把上表字段作为 `client_payload`，调用
   `POST https://api.github.com/repos/OasisViridis/Pioneer/dispatches`，
   `event_type` 为 `figma-design-release`。
5. 在 GitHub 返回成功后向 Figma 返回 2xx；失败保留重试，不把失败当成功。

## n8n 配置要点

1. **Webhook 节点**：POST，路径 `figma-design-release`；响应模式设为“最后一个节点完成后响应”，确保 GitHub dispatch 成功后才给 Figma 2xx。
2. **Code 节点**：读取 `$json.body`；恒时比较 `passcode`；拒绝非 `FILE_VERSION_UPDATE`；用 `crypto.createHash('sha256')` 对原始请求体生成 `deliveryId`；只输出上表字段。
3. **IF 节点**：校验通过走 HTTP，失败走 401 响应；不要拼 shell 或执行事件文本。
4. **HTTP Request 节点**：POST 上述 GitHub dispatches URL；用 n8n 凭据保存 GitHub 令牌（细粒度 PAT，仅本仓库，`Contents: Read and write`）；`Authorization: Bearer …`，`Accept: application/vnd.github+json`；请求体只含 `event_type` 与 `client_payload`。
5. **响应节点**：成功 200，失败 401/5xx；不要把 passcode 或原始事件写进响应。
6. 关闭该工作流的执行数据保存或对正文脱敏；默认保持停用，直到人工确认。

## GitHub 侧

- `.github/workflows/design-intake.yml` 只在 `repository_dispatch` 的 `figma-design-release` 运行，权限仅 `contents: read`、`pull-requests: read`（读取 PR 去重所需）；不创建 PR、不评论、不改 Issue。
- `tools/design-event-consumer.mjs` 读取 `GITHUB_EVENT_PATH`，加载 `design/delivery/events.json`（缺失时用禁用的 example），调用 `inspectDispatch`，把材料写入 `tmp/design-external/` 并上传 artifact。
- 需要的 GitHub secret：`FIGMA_ACCESS_TOKEN`（`file_versions:read`、`file_content:read`）。缺失时返回 `permission-denied` 并失败关闭，不产生材料。
- 接收器的 GitHub PAT 只存在 n8n；`FIGMA_WEBHOOK_PASSCODE` 只存在接收器。两者都不进 GitHub。
- 现有 `events.example.json` 默认 `enabled: false`；真正启用前必须提交一个 `design/delivery/events.json`，包含真实 `webhookId` 与登记 route，并确认对应 feature 的 Issue 仍 Open。

## 已验证

- `tests/design-sync/dispatch.test.mjs`：9/9，覆盖禁用配置零网络、合法 dispatch 的确定性材料、错误 webhook、PING/FILE_UPDATE 忽略、额外字段/节点/Issue/命令拒绝、越界文件/标签、旧版本、既有 PR 去重、固定版本读回与 schema 边界。
- `tests/design-sync/events.test.mjs`、`composition.test.mjs` 回归通过。
- 本地 CLI：禁用配置返回 `event-disabled` 且退出 1（有 dispatch 但仓库未启用，跑红以暴露配置缺口）；缺 `FIGMA_ACCESS_TOKEN` 返回 `permission-denied` 且退出 1，不产生成功材料。

## 未验证

- n8n 工作流导入与执行（本仓库不安装 n8n，也不把未导入的 JSON 当作已验证模板）。
- 接收器部署、HTTPS 可达性、Figma Webhook 创建与真实 passcode 校验。
- 真实 Figma `FILE_VERSION_UPDATE` 投递、版本顺序、三次重放、错误路径和 Draft PR。
- 任何人/真实 Provider 验收。

## 仍需要的输入

1. Figma 套餐是否包含 Webhooks（Professional/Organization/Enterprise；教育版需确认）。
2. 获准的 HTTPS/n8n 接收地址与 Webhook ID。
3. `FIGMA_ACCESS_TOKEN`、`FIGMA_WEBHOOK_PASSCODE`（通过环境或凭据托管，不在聊天/仓库/日志中出现）。
4. 接收器的 GitHub 细粒度令牌（`Contents: Read and write`，仅本仓库）。
5. 一个仍 Open 且已登记 Figma 节点/快照的 pilot Issue；当前 `features.json` 的 #36/#25 都已关闭，S2 会拒绝。

以上条件齐备后，才能创建 Webhook、发布命名版本并执行真实事件验收；在此之前 #37 保持 Open。
