# #19 受控写入切片 · 验证记录

2026-11-03。实现分支 `feat/issue19-write-execution`，基于 `c6eac9b`。S2 请求来自真实 Figma 命名版本 `2417598685933588034`、节点 `830:1593`，packageHash `106785880df43b8e741d56960ea60b0c03052d31b1ad5f6df62a3e3e6bad0633`。

## 实现范围

- 共享契约 `apps/desktop/src/shared/contracts/write-execution.ts`：一次受控替换的请求/结果、`runId`/`revision` 运行身份、1 MiB UTF-8 内容上限、前后像哈希与文件身份、严格的结果码；`WriteReviewPrepareSchema` 带 `runId`、`revision`、`targetPath` 与 `mode`，`mode` 只接受 `read_only` 与 `workspace_write`。
- main 执行器 `apps/desktop/src/main/write-execution.ts`：窗口/epoch 绑定、目录册项目根、路径包含性与链接/普通文件检查、权限与 scope、保护路径、写前目标观察、`writeFileAtomic` 写入、写后回读比对、失败即停并保留现场；`read_only` 在 `prepare` 阶段按权限拒绝且不解析项目、不读文件；变更日志按 §4.1 追加 `intent` → `applied`/`failed`。
- 变更日志：`WriteExecutionDependencies.journalPath` 注入路径；生产用 `join(app.getPath('userData'), 'write-journal.jsonl')`（`apps/desktop/src/main/index.ts`）。每条记录一行 JSONL，只追加不删除；`journalPath` 落在项目内或不可写时，批次返回 `failed` + `WRITE_FAILED`，文件不被触碰。
- 通道 `write:execution` + `main/ipc.ts` 的受信任 sender 校验 + `preload/write-api.ts`。
- renderer 的“改动”面板：目标路径输入（默认 `README.md`，调用 `prepare` 前用 `WriteTargetPathSchema` 校验）、两档权限选择（默认 `workspace_write`）、绑定会话里最新的已完成 `SessionRunRecord`（`runId` + 主进程摘要里的 `revision`）；没有可证明身份的已完成运行时显示 unsupported，且不调用 `prepare`。审阅显示来源 `runId`/`revision`/档位；批准才调用写入通道，拒绝只改本地状态；只有 `ok && applied && verified` 才显示已应用。
- 契约测试 28 项、Electron E2E 5 项；E2E 在临时复制的工作区里写入，共享 fixture 树哈希前后一致，并断言 journal 落在 userData 而不是项目里。

## 与规格的一致性

- §4.1：`intent` 在写入前落盘（`runId`/`revision`/`path`/`beforeSha256`/`at`）；`intent` 追加失败时不碰文件并返回 `failed` + `WRITE_FAILED`；回读后追加 `applied`（`afterSha256`/`observedSha256`/`observedIdentity`/`verification`）或 `failed`（`code`）。没有 `intent` 的写入不会被报告为 `applied`。
- §4.2：只有 `intent` + `applied` + `verified` 且哈希一致的路径才是 `applied`；回读不一致记 `unverified`；回读拿不到哈希时记 `failed(VERIFY_FAILED)`。
- §2.5/§4.4：写后回读不一致记 `verification_failed`，停止后续写入，**保留现场，不自动回滚**，结果 `restore: 'not_needed'`。恢复留给 #20。
- 权限：`read_only` 在 `prepare` 阶段返回既有 `PERMISSION_READ_ONLY`；`full_access` 与 `auto_review` 不在这一个审阅入口的档位里（前者会写保护路径且需要单独的风险确认，后者取消逐次确认），仍由共享权限契约与 `checkWritePermission` 约束。
- 拒绝与未执行目标保持 `unchanged`/`rejected`，不显示为已应用。
- 没有自动合并、Issue 修改、Figma 写入、Provider 调用或 shell 执行。

## 已验证

| 命令 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/contract/write-execution.test.ts` | 28/28 |
| `pnpm test:contract:types` | 通过 |
| `pnpm typecheck` | 通过 |
| `pnpm lint` | 通过 |
| `pnpm design:check` | 120/120 |
| `pnpm exec playwright test --config tests/e2e/playwright.config.ts tests/e2e/change-approval.e2e.spec.ts` | 5/5（8.2s） |

## 未完成与边界

1. **日志只是证据，不是恢复**：`intent`/`applied`/`failed` 已落盘，但 #20 的恢复执行器（读日志、重新观察、`restore`/`conflict`）尚未实现；本切片不自动回滚。
2. **审阅内容仍是固定标记**：`prepare` 由 main 读取目标并追加固定标记，不接受 renderer 或模型自撰内容；目标可以是任意已存在的项目内普通文本文件。
3. **权限档位不持久化**：每次审阅选择一次档位并写进该次权限记录；没有会话级权限选择器，也没有 `full_access`/`auto_review` 的 UI。
4. **运行身份依赖主进程摘要**：`SessionRunRecord` 只带 `runId`，`revision` 来自 `lastRunView`；两者对不上时面板显示 unsupported 而不是猜一个修订号。
5. **没有 Visual Regression 基线**：只做了 1440×1000 截图检查；`pnpm test:visual` 未跑。
6. #19 仍未完成最终验收：本切片覆盖受控写入闭环、运行身份、任意项目内目标、持久化日志与两档权限；#37 条件 5 仍需 Draft PR、head CI 和最终验收。

## 风险

- 回读失败后保留的是外部写入后的现场，不做恢复；这是规格要求，但需要 #20 的人工恢复入口。
- 写入执行器只防应用自身错误、并发编辑与陈旧目标，不防恶意本地进程或内核级逃逸。
- 固定标记会进入文件内容；预览会显示完整后像哈希，批准前可核对。
