# Figma Webhook Worker

这是 #37 的永久接收器：一个跑在 Cloudflare Workers 免费计划上的小服务，把 Figma 的 `FILE_VERSION_UPDATE` 转成 GitHub `repository_dispatch`。

## 它做什么

1. 只接受 `POST /figma-webhook`。
2. 先校验 Figma webhook 的 `passcode`，不通过直接 401。
3. `PING`、`FILE_UPDATE` 和其他事件只回 202，不触发 GitHub。
4. 只转发 `schemaVersion`、`webhookId`、`eventType`、`fileKey`、`versionId`、`label`、`deliveryId`、`receivedAt` 八个字段；节点、Issue、命令和提示词一律不转发。
5. 调 GitHub `repository_dispatch`，事件类型 `figma-design-release`。
6. 不写日志正文，不保存 passcode 或 token。

`deliveryId` 是原始请求体的 SHA-256，所以 Figma 重试同一请求会得到同一个键；GitHub 侧用它去重。

## 部署

前置：免费 Cloudflare 账号、GitHub fine-grained token（只限 `OasisViridis/Pioneer`，Contents: Read and write，用于 `repository_dispatch`）。

```powershell
cd workers/figma-webhook
npx wrangler login
npx wrangler secret put FIGMA_PASSCODE
npx wrangler secret put GITHUB_DISPATCH_TOKEN
npx wrangler deploy
```

部署输出会给出 `https://pioneer-figma-webhook.<你的子域>.workers.dev`。先验证健康检查：

```powershell
Invoke-RestMethod https://pioneer-figma-webhook.<你的子域>.workers.dev/health
```

## 接 Figma

在 Figma 团队设置里创建 Webhook：

- URL：`https://pioneer-figma-webhook.<你的子域>.workers.dev/figma-webhook`
- Event：`FILE_VERSION_UPDATE`
- Passcode：与 `FIGMA_PASSCODE` 相同

团队级 Webhook 只对团队可见文件送达；草稿文件不会触发。这是 Figma Education 团队的实际限制。

## 验证

1. 用错误 passcode 发一次请求，应返回 401，GitHub 无 run。
2. 发 `PING`，应返回 202 且无 run。
3. 发布一个命名版本，Figma 投递后 GitHub 出现 `figma-design-release` run，消费者输出材料 artifact。
4. 同一事件重放三次，只应命中同一个 Draft PR；不重复开 Issue/PR。

## 免费额度

Cloudflare Workers 免费计划每天 10 万次请求；本接收器每次只做一次 JSON 解析和一次 GitHub 调用。`workers.dev` 子域免费，不需要买域名。图 Webhook 由 Figma 套餐决定；本项目已用团队级 Webhook 收到真实事件。

## 安全边界

- 不把 passcode/token 写入仓库、日志、PR 或截图。
- 不在 Worker 里执行 Figma payload 里的任何命令。
- 不创建命名版本、不评论 Issue、不标记 Figma COMPLETED。
- 只做入口适配；S2 的 prepare/deliver、权限和回填仍由现有工具执行。

相关：[#37](https://github.com/OasisViridis/Pioneer/issues/37)、[本地交接](../../docs/workflow/issue37-local-handoff.md)、[消费者](../../tools/design-event-consumer.mjs)。
