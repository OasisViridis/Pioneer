# S2：显式设计交付

入口属于已有 Codex 会话。用户提交固定请求后，当前会话依次准备设计包、按已有契约实现、捕获自己暂存的 Diff、准备 Draft PR、回读 Windows 检查。使用同一协议的 GitHub connector 或 `gh api` 完成发布；没有新增 Agent 调度器、后台监听、模型订阅或 CI 模型凭证。

## 一次触发

向现有 Codex 会话提交：

> 按 docs/workflow/design-delivery.md，执行 design/delivery/issue36.request.json 对应的设计交付。先检查依赖，完成实现和检查，再准备 Draft PR 并回读最终 head 的验证结果。

S2 的受控请求关联已有 #36，固定 S0 的三个组件节点，并引用已接受 main 中 S1 映射、token 与 Run 合同。它的实现差异是本交付工具，不把已有 S1 UI 成果再次计作 S2 新功能。新增产品功能先在 `design/delivery/features.json` 审阅固定 featureId、已有 Issue、获准文件/节点、变更类型和契约/测试依据；不得在重试时随机生成 featureId 或开新 Issue。

会话内部执行：

```sh
pnpm design:delivery prepare design/delivery/issue36.request.json
# 仅 ready-for-agent 时，当前 Codex 会话读取 tmp/design-delivery/*-package.json，
# 按其中已有契约实施；只暂存自己的文件，不整包暂存他人改动。
pnpm verify:repository
pnpm check
pnpm design:delivery capture design/delivery/issue36.request.json
pnpm design:delivery deliver design/delivery/issue36.request.json tmp/design-delivery/s2-design-delivery-output.json
pnpm design:delivery verify <PR编号>
```

`prepare` 必须在 Agent 实现之前检查原任务；`deliver` 在发布之前再检查。原依赖未解除、已有其他负责人、未知 Run 状态、授权/外发/写入/命令/停止的行为差异，均返回 `materials-only`。固定设计包仍可供评审，但不能启动被阻塞的产品实现。缺少节点、哈希、映射、依赖状态或版本信息时失败，不生成空的成功包。

快照必须是已提交、可按 SHA 重读的 JSON。当前沿用 S0 的投影结构（`fileKey`、`kind`、节点 `id`、可选 `historicalVersionId`），不是任意 Figma REST 文件格式。MCP 收集新设计后先在获准设计分支固化；仅当前画布可读时使用 `snapshot-only` 和 `version: null`。快照是结构/映射输入，完整视觉素材缺失时不能声称可以离线复原像素。外部图片 URL 不作为交付资源；本轮复用已保存快照，不需要重新读取活画布。

## 输入、输出与保护

`request` 使用现有 Zod 校验，关联功能、Issue、变更类型、代码基线、设计 commit/path/SHA-256、版本和节点范围。设计包内嵌所选节点及 S1 映射，保留其原始历史说明，并另外记录实际已接受代码 SHA、源码 hash、契约和测试的固定引用。`packageHash` 采用排序后的 JSON 计算，不包含运行时间；保留差异也在固定输入中。

`capture` 只读取暂存区，不执行生成代码。输出包含每个文件在基线的内容 hash、替换内容、设计包 hash 和 Agent 状态。空输出、失败输出、不同输入的旧结果、越出注册路径及 main/preload/shared 行为层修改均拒绝发布。首版不自动删除、重命名或更改文件模式。路径与声明检查不等于自动证明代码行为安全：当前会话仍须审阅 Diff，PR 仍需人审，契约测试仍需执行。

固定分支为 `codex/design-<featureId>`。首次成功创建一个 Git tree、commit、branch 和 Draft PR；设计包同时进入该分支 `design/deliveries/<featureId>/package.json`，没有第二套任务数据库。分支创建使用 GitHub 原子创建，工具没有 update-ref、force push、合并、Issue 状态变更、评论或 Figma 写入能力。

相同包和代码重复提交返回同一 PR。设计更新、输出更新或开发者已有提交时，返回 `review-required`，本地候选包与输出文件保留为待审 Diff，关联原 PR，整个远程分支与 PR 正文都保持原样。后续由交付责任人审阅和手工整合；工具不猜测哪些人工改动可以覆盖。不采用覆盖正文的读改写，也就没有覆盖并发人工正文的窗口。闭合过的交付不会被重复打开；分支未完成创建 PR 时，只有远端 commit 父级、消息、包、文件集合与内容全部匹配才恢复创建 PR。

## 发布凭证与连接器

默认传输为现有 `gh api` 登录。也可添加 `--stdio --actor <已核实的GitHub登录名>`，由已有 Codex 连接器处理 JSON Lines：

```json
{"type":"github-request","id":1,"method":"GET","endpoint":"/repos/OasisViridis/Pioneer/issues/36"}
```

调用方返回同一 id 的 `value`（GitHub REST 对象），或 `error: {status, message}`。GET 对应 GitHub `fetch`；POST 仅对应现有 `create_tree`、`create_commit`、`create_branch`、`create_pull_request` 工具。桥接方必须限定仓库与这些操作，不能执行请求中的任意命令或 URL；连接器返回格式归一化后再交给工具。结束消息为 `type: result`。这是同一工作流的工具传输适配，不是新的 HTTP 服务或模型运行平台。

设计 JSON 只是数据，不允许携带 shell、模型命令或发布令牌。现有 Codex 会话负责实现；发布工具只处理审阅后的输出，不执行 Agent 代码，不把连接器凭证传入应用或模型。CI 仍只有 `contents: read`。无人值守模型调用、官方 Codex Action 和 create-pull-request 路线未启用：需要另行核对凭证、预算和版本，不能复制桌面登录状态。

## 验证与重试

实际 PR 创建后返回 `validation-pending`，绝不等同通过。`verify` 查询当前 PR head，对照 `quality.yml` 的相同 head SHA / 分支执行记录，并检查 Windows job 及仓库规范、Contract、真实 Electron、打包和聚合门禁步骤均成功；最后再次读取 PR head。旧 SHA、跳过检查、被取消/失败的运行以及验证过程中 head 前进都不能得到 `verified`。

GitHub App 创建 PR 后必须实测检查是否触发。按 [GitHub 当前文档](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)，`GITHUB_TOKEN` 创建/更新 PR 的检查可能等待人工批准，其他普通事件仍有触发限制。工具只认实际执行结果：没有运行时返回 `validation-not-triggered`，等待批准/排队时保持未通过；可在 quality workflow 的 dispatch 入口合并后用已有受限发布身份显式重跑：

```sh
gh workflow run quality.yml --repo OasisViridis/Pioneer --ref codex/design-<featureId>
pnpm design:delivery verify <PR编号>
```

回执保存在 `tmp/design-delivery/receipt.json`，包含当前 head、检查 run URL、run ID 和读取时间；不把回执写成另一个待验证提交，避免无限改变 head。PR 本身列出节点、源版本、固定包、影响文件、检查入口与待办，不自动更新人工内容。CI 获取完整 Git 历史，以便离线重读固定设计与契约版本。

| 状态 | 重试方式 |
| --- | --- |
| `missing-input` / `invalid-input` / `stale-input` | 补充固定输入、重新核验映射后重试 prepare |
| `materials-only` / `stale-base` | 在原任务解决依赖或责任人/行为决策；基线变化时重做输入与实现 |
| `agent-failed` / `empty-output` / `stale-output` | 修复当前会话产物，重新 capture；不复用别的输入结果 |
| `permission-denied` / `rate-limited` / `retryable-error` | 恢复对应凭证、配额或连接，重新运行原请求 |
| `review-required` | 审阅本地候选和原 PR；保留人工修改，不自动强推 |
| `validation-not-triggered` / `validation-pending` | 确认触发或等待真实运行，再 verify |
| `validation-failed` / `validation-incomplete` / `stale-validation` | 修复或重跑最终提交对应的完整门禁，再 verify |
| `no-op` | 同一 PR 已存在；没有新提交、评论或自动完成声明 |
| `verified` | 仅证明回执所列 head 的要求检查通过，合并仍需人工授权 |

发布阶段 `elapsedMs` 为实际测量值，不是模型运行总耗时。模型费用未知时保持 null；当前会话不需要新的付费调用。`manualInterventions` 记录交付过程中的额外人工介入；不编造省时或成本收益。#13、#33、#17、#21 的状态和范围不由本工具改写。

## S3 检查与合并后的准备

S3 增加独立的 Windows 应用像素比较 job。`verify` 现在还要求 `Windows / reviewed visual baseline` 的 `Compare reviewed Windows baseline` 步骤成功，候选抓图、跳过比较和旧 SHA 不能取得 `verified`。

`pnpm design:delivery writeback-plan <PR编号> <已登记featureId>` 只读准备合并提交的节点链接，未验证发布条件时返回 `writeback-blocked`。Windows 基线审阅、回填权限、S2 dispatch 消费者与真实 Figma 事件的待办见 [#37 验证记录](../testing/issue37-verification.md)。本轮没有启用 Webhook 或自动回填，不改变 #33 的 Open 状态和人工验收状态。

## S3 外部工具与本地交接

`pnpm design:external` 提供经过边界测试的 Dev Resources 回填与版本事件材料准备。回填默认预览，只有固定提交审批与 `--apply` 同时存在才写；事件材料经审阅固化后交给本文件的原有 prepare/capture/deliver。没有新增无人值守 Agent 或已启用接收器。完整配置、故障重试、Code Connect 限制、真实验收清单与可直接交给本地 Codex 的提示见 [Issue #37 本地交接](issue37-local-handoff.md)。
