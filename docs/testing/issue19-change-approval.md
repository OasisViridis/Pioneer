# #19 受控写入切片 · 验证记录

2026-11-03。实现分支 `feat/issue19-write-execution`，基于 `c6eac9b`。S2 请求来自真实 Figma 命名版本 `2417598685933588034`、节点 `830:1593`，packageHash `106785880df43b8e741d56960ea60b0c03052d31b1ad5f6df62a3e3e6bad0633`。

## 实现范围

- 共享契约 `apps/desktop/src/shared/contracts/write-execution.ts`：一次受控替换的请求/结果、1 MiB UTF-8 内容上限、前后像哈希与文件身份、严格的结果码。
- main 执行器 `apps/desktop/src/main/write-execution.ts`：窗口/epoch 绑定、目录册项目根、路径包含性与链接/普通文件检查、权限与 scope、保护路径、写前目标观察、`writeFileAtomic` 写入、写后回读比对、失败即停并保留现场。
- 通道 `write:execution` + `main/ipc.ts` 的受信任 sender 校验 + `preload/write-api.ts`。
- renderer 的“改动”面板显示 main 生成的 before/after 预览和 `PermissionCard`；批准才调用写入通道，拒绝只改本地状态。只有 `ok && applied && verified` 才显示已应用。
- 契约测试 19 项、Electron E2E 2 项；E2E 在临时复制的工作区里写入，共享 fixture 树哈希前后一致。

## 与规格的一致性

- 写后回读不一致记 `verification_failed`，停止后续写入，**保留现场，不自动回滚**（`docs/specs/2026-10-27-p4-write-authorization-and-recovery.md` §2.5/§4.4）。恢复留给 #20。
- 拒绝与未执行目标保持 `unchanged`/`rejected`，不显示为已应用。
- 没有自动合并、Issue 修改、Figma 写入、Provider 调用或 shell 执行。

## 已验证

| 命令 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/contract/write-execution.test.ts` | 19/19 |
| `pnpm exec playwright test --config tests/e2e/playwright.config.ts tests/e2e/change-approval.e2e.spec.ts` | 2/2 |
| `pnpm check` | 见 PR head CI；本地改动后重跑 |
| `pnpm design:check` | 120/120 |

## 未完成与边界

1. **没有持久化变更日志**：`WriteChangeJournalRecord` 的 `intent`/`applied`/`failed` 没有落盘；#20 的恢复暂无日志源。
2. **没有权限选择器/会话级权限**：`prepare` 每次签发一次性 `workspace_write`，执行器支持四档但没有 UI 切档或持久化。
3. **审阅入口是受控预览**：固定目标为当前项目 `README.md`，由 main 追加固定标记；不接受任意路径/任意内容。
4. **没有真正的 Run 绑定**：请求带 session/project/window epoch，但不带 `runId`/`revision`，因此不是 #19 要求的“Diff/产物绑定来源 Run”的完整实现。
5. **没有 Visual Regression 基线**：只做了 1440×1000 截图检查；`pnpm test:visual` 未跑。
6. #19 因此仍未完成；本切片只验证 S2 的受控写入闭环与 Permission Card 接线。 #37 条件 5 仍需 Draft PR、head CI 和最终验收。

## 风险

- 回读失败后保留的是外部写入后的现场，不做恢复；这是规格要求，但需要 #20 的人工恢复入口。
- 写入执行器只防应用自身错误、并发编辑与陈旧目标，不防恶意本地进程或内核级逃逸。
- 固定 target 的标记会进入文件内容；预览会显示完整后像哈希，批准前可核对。
