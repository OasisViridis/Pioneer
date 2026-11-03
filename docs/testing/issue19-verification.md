# Issue #19 P4-A 验证记录

日期：2026-11-03。分支：`feat-issue19-write-preview`，自 `origin/main` `3956615`。实现规格见 [P4-A 修改预览与一次受控写入](../specs/2026-11-03-p4a-write-preview.md)，权限决策见 [P4-D1 写入权限与恢复决策](../specs/2026-10-27-p4-write-authorization-and-recovery.md)。

## 交付内容

- 新增 `write-preview` 共享契约、七个固定 IPC 通道、preload `write-api` 与 renderer 端口。
- 新增 main 的提案表、完整行级 Diff、会话级权限存储、原子替换执行器、fsync 变更日志、写控制器与 `write-ipc`。
- 受控 adapter 新增 `propose_write` 步骤；Pi adapter 新增 `propose_file_write` 工具（只提交提案，不写入）。
- 「运行控制」加入权限选择器；「改动」面板从空态变为真实预览/批准/拒绝/重新读取/结果面板。
- Run 事件新增 `write.proposed` 标记；授权摘要与持久化快照的工具清单包含 `propose_file_write`。
- 新增 Contract 探针 5 个文件，Real Electron E2E 3 个用例。

## 命令与结果

在 `feat-issue19-write-preview` 工作树执行：

| 命令                              | 结果                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm verify:repository`          | 6/6 通过                                                                                       |
| `pnpm design:check`               | 通过；`session-workbench.css` 的映射证据哈希已随本次样式更新重新绑定                            |
| `pnpm format:check`               | 通过                                                                                           |
| `pnpm lint`                       | 通过                                                                                           |
| `pnpm typecheck`                  | 通过                                                                                           |
| `pnpm test:contract:types`        | 通过（含 `tests/e2e`）                                                                          |
| `pnpm test:contract`              | 49 个文件、567 项通过                                                                          |
| `pnpm test:prototype`             | 210/210 通过                                                                                   |
| `pnpm test:e2e`                   | 42 项通过；包含 `tests/e2e/p4-write.e2e.spec.ts` 的 3 项 P4-A 用例                              |
| `pnpm package:smoke`              | 包装成功                                                                                       |
| `pnpm check`                      | 退出码 0；上述各项与最终 package smoke 全部通过                                                 |

定向探针：

```text
pnpm exec vitest run tests/contract/write-diff.test.ts tests/contract/write-preview.test.ts tests/contract/write-apply.test.ts tests/contract/write-controller.test.ts tests/contract/write-ipc.test.ts
```

覆盖：Diff 格式与完整性、提案表路径/编码/大小/预算/过期/刷新、权限存储绑定、原子替换与回读、部分完成与日志、用户流程、`auto_review` 自动落盘、其他路径不变、IPC 绑定。

## 完成条件对应证据

1. **预览与批准**：`write-controller.test.ts` 断言预览内容与 Diff；E2E 用例 1 在真实 Electron 中打开「改动」面板、看到 `README.md` 路径、`An alpha application fixture.` 上下文行、`+Reviewed change.` 与前后 SHA-256，再执行拒绝/批准。
2. **拒绝无副作用**：`write-controller.test.ts` 比较拒绝前后字节与 SHA-256；E2E 用例 1 拒绝后读取副本文件等于原文。
3. **批准范围**：`write-controller.test.ts` “writes only the previewed path” 断言另一个文件逐字节不变；apply 请求只带 proposal/Run/`previewRevision`，不带路径或内容。
4. **过期与目标变化**：`write-preview.test.ts` 刷新后 `previewRevision` 递增、旧批准 `PREVIEW_EXPIRED`；`write-controller.test.ts` 新 Run 修订使旧预览过期；E2E 用例 2 在预览后外部改写目标，批准得到 `TARGET_CHANGED`，重新读取后新 Diff 再批准成功。
5. **成功/失败关联 Run 与目标状态**：`WriteApplyReport` 含 `runId`/`revision`/`previewRevision`、逐目标 status/code 与实际写入哈希；`write-journal.ts` 追加 `intent` → `applied`/`failed`；`write-apply.test.ts` 断言日志链与部分完成。
6. **临时副本与 fixture 不变量**：E2E 每个用例把 `tests/fixtures/workspaces/library` 复制到 `testInfo.outputPath('workspace')`，写入只发生在副本；关闭应用前后比较 committed fixture 哈希。

## 外部第二意见与处理

2026-11-03 用 `voyager ask --json --model current` 请求 ChatGPT 复核设计（[会话](https://chatgpt.com/c/6ae9b2e9-a6e8-83e9-b360-5130f89c3605)），发现并已处理：

- `auto_review` 与“逐次批准”的语义冲突：按 #18 实现为写前检查通过后自动落盘（需显式风险确认），其余档位仍需用户点击批准；规格与界面文案明确说明。
- 预览版本绑定：`previewRevision` + Run 修订 + 目标字节/身份三重检查；刷新递增，旧批准拒绝。
- 写入策略：改为同目录临时文件 + fsync + 替换前身份复核 + 原子 rename，写入后回读；替代直接 `truncate + write`。
- 失败留痕：写后回读不一致记 `verification_failed`；日志不可用时不宣称成功；同 Run 同路径只允许一次提案，避免日志按 `runId/path` 的最后记录歧义。
- 内存预算：提案总数 32、合计 8 MiB，Diff 4 MiB 上限，超出拒绝而非截断。
- 权限并发：权限变更、刷新、拒绝、落盘走同一条 main 串行链。

其中“`auto_review` 自动落盘”是 #18 已定档位语义的直接实现，不是对 #19 完成条件的缩减：默认档位与工作区档位仍要求用户查看完整 Diff 并明确批准；自动审查档位是用户显式确认后选择的例外，预览与结果仍可查看。

## 未运行 / 未包含

- 真实 Provider 运行：未运行，不能由受控 adapter 结果替代。
- Windows 人工验收（批准入口、目标文件实际结果、读屏/高 DPI）：未运行，需按 #24 的人工门另记。
- `pnpm test:visual`：未运行。本次新增「改动」面板与权限选择器样式，但 `pnpm check` 不包含 Visual Regression；按 TEST_INFRA，「Aggregate gate 通过不等于视觉基线通过」，新的视觉基线需在独立 Windows job 重跑并审阅。
- 恢复执行器、部分完成后的撤销、内核级隔离（受限 Token/job object）：属于 #20，未实现。
- 执行器保留 `beforeReplace` / `writeTempFile` 两个 main 私有测试钩子，仅用于探测替换前竞态与写入失败；它们不改变生产路径的校验顺序，也不暴露给 renderer。本记录按 #18 §7 的偏差留痕要求单列。
- 本地 E2E 运行环境曾带 `ELECTRON_RUN_AS_NODE=1`，Playwright 的 `_electron.launch` 会被 Electron 当作 Node 参数拒绝；本次在运行前移除该变量，与常规 CI 环境一致。测试代码没有依赖该处理。

## 原始日志

本机 `logs/issue19-verify-repository.log` 与 `logs/issue19-check.log` 保留本次命令输出（已被 `.gitignore` 排除，不随提交分发）。
