# P4-A 修改预览与一次受控写入（Issue #19）

日期：2026-11-03。来源：[Issue #19](https://github.com/OasisViridis/Pioneer/issues/19)，属于[主地图 #9](https://github.com/OasisViridis/Pioneer/issues/9) 的 P4 实施票；前置 #17、#18 已完成。

## 1. 本次交付

| 项       | 内容                                                                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 操作     | 仅 `replace_file`：把项目内一个已有普通 UTF-8 文本文件的完整内容替换为提案内容。不创建、不删除、不改名、不改权限位、不执行命令。                                                                                                                         |
| 提案来源 | main 的 `HarnessContext.write.propose` 端口。受控 adapter 的脚本 `propose_write` 步骤和 Pi adapter 的 `propose_file_write` 工具都只能提交提案；两者都拿不到文件句柄，也不执行写入。                                                                          |
| 预览     | main 用自身读取的 before 字节、提案的 after 字节和统一行级 Diff 生成预览；renderer 不计算 Diff，也不接受模型自述。                                                                                                                                        |
| 批准     | 用户在「改动」面板查看完整 Diff 后批准或拒绝；批准携带 `previewRevision`，只作用于预览列出的目标与内容。                                                                                                                                                    |
| 权限     | 会话级四档选择器（仅可查看 / 工作区内修改 / 完全权限 / 自动审查 EXP）。`auto_review` 在写前检查通过时自动落盘、不逐次确认；其余档位由用户点击批准触发。                                                                                                     |
| 日志     | 每次落盘前先追加 `intent`，写后回读并追加 `applied`；失败追加 `failed`。`userData/writes/journal.jsonl` 逐行 fsync，日志不可用时拒绝写入。                                                                                                                  |
| 不做     | 恢复执行器与部分完成的完整矩阵（#20）、命令执行、真实 Provider 验收、Windows 人工验收。审批过期不等于权限过期：权限仍按 #18 的会话级模型，预览用 `previewRevision` 与 run 修订表达“旧批准”。                                                               |

## 2. 用户流程与数据流

1. 用户在运行控制里选择写入权限；main 生成 `WritePermission`，绑定 session/project/webContentsId/windowEpoch。
2. 用户启动 Run；adapter 调用 `write.propose({ path, content })`。
3. main 校验路径、读取目标、确认是普通 UTF-8 文本文件且未变化，构造 `WriteTarget` 与完整 Diff，存入提案表，并向 Run 事件流发一条 `write.proposed`（只带 `proposalId`）。
4. 用户打开「改动」面板：`write:preview:list` 取摘要，`write:preview:get` 取完整预览。
5. 用户拒绝：main 标记 `rejected`，不改文件、不写日志。
6. 用户批准：main 按 `previewRevision` 取出提案，重新观察目标，`authorizeWrite` 两阶段校验，原子替换并在写后回读核对；返回逐目标结果、实际写入哈希和 Run 身份。
7. 目标在预览后改变：批准被拒（`TARGET_CHANGED` / `TARGET_REPLACED` 等），用户点「重新读取目标」得到 `previewRevision + 1` 的新 Diff，再次批准才落盘。
8. 同一会话启动新 Run 后，旧 `revision` 的预览在批准或刷新时被拒绝（`PREVIEW_EXPIRED`），因为审批只属于当时审阅的 Run 修订。

## 3. 契约与主进程组件

新增 `apps/desktop/src/shared/contracts/write-preview.ts`：

- `WritePreview` / `WritePreviewTarget`：`proposalId`、`sessionId`、`projectId`、`runId`、`revision`、`previewRevision`、`createdAt`、每个目标的 `path`、`before`/`after` 字节数与 SHA-256、文件身份和完整 `diff`。
- `WritePreviewSummary`：列表项，只有路径、状态与修订，不携带 Diff。
- `WriteApplyReport`：逐目标 `status`/`code`、实际写入的 `afterSha256`/`observedSha256`、`partial` 与失败目标；绑定 `proposalId`、Run 身份与 `previewRevision`。
- `WRITE_IPC_CHANNELS`：`write:permission:get|set`、`write:preview:list|get|refresh|reject|apply`。
- 错误词表：IPC 错误 + #18 的权限拒绝码、写前拒绝码与失败码；`PERMISSION_REQUIRED` 表示尚未选择档位。

主进程组件：

| 文件                                                        | 职责                                                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `main/harness/write-permission/proposal-registry.ts`        | 提案表：路径/编码/大小校验、Diff 构建、列表、按 `previewRevision` 取快照、刷新、状态收尾、窗口级清理与字节预算 |
| `main/harness/write-permission/unified-diff.ts`             | 行级 unified diff；先裁公共前后缀，中段 Myers，超过编辑距离上限时退化为整段删除+新增，超字节预算返回 null    |
| `main/harness/write-permission/permission-store.ts`         | 会话级权限记录；读取时用 `checkPermissionBinding`，窗口关闭即失效                                           |
| `main/harness/write-permission/apply-write.ts`              | 落盘执行器：重新观察 → `authorizeWrite` → 同目录临时文件 + fsync + 身份复核 + 原子 rename → 回读校验 → 日志  |
| `main/harness/write-permission/write-journal.ts`            | append-only 变更日志；每次追加 fsync；损坏或不可写时标记不可用并拒绝后续写入                                  |
| `main/write-controller.ts`                                  | 串行化权限变更与落盘；run 修订检查；`auto_review` 自动落盘；拒绝/刷新/批准编排                               |
| `main/write-ipc.ts`                                         | 固定 IPC 面；trusted-sender、窗口代次与 schema 校验                                                         |

## 4. 完成条件对照

| Issue 条件                                                       | 实现                                                                                                                                                 | 证据                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 写入前看到目标路径和完整 Diff，并能批准或拒绝                     | 预览含项目相对路径、前后字节/哈希/身份与完整 unified diff；「批准写入」「拒绝修改」按钮                                                             | `tests/contract/write-preview.test.ts`、`tests/e2e/p4-write.e2e.spec.ts` 用例 1          |
| 预览阶段拒绝或取消时目标字节与哈希不变                           | 拒绝只改提案状态；不触碰文件系统；关闭窗口 `forgetWindow` 只删除提案                                                                                 | `write-controller.test.ts` 拒绝测试比较前后字节与 SHA-256；E2E 用例 1                    |
| 批准仅应用到预览列出的目标与内容，其他路径无副作用               | apply 只接受 `proposalId + Run 身份 + previewRevision`，目标与 after 字节取自 main 的提案表；不接受 renderer 提交路径或内容                            | `write-controller.test.ts` “其他文件逐字节不变”；`write-apply.test.ts`                    |
| 批准过期或目标在预览后改变时拒绝写入并要求重新读取和审阅         | 新 Run 修订与 `previewRevision` 不匹配 → `PREVIEW_EXPIRED`；目标变化 → `TARGET_CHANGED`/`TARGET_REPLACED`；刷新重建 Diff 并递增修订                  | `write-preview.test.ts` 刷新/过期；E2E 用例 2                                            |
| 成功与失败都关联原 Run、源版本及可核对的目标状态                 | `WriteApplyReport` 与日志记录携带 `runId`/`revision`/`previewRevision`；日志记录 `intent` → `applied(verified/unverified)` 或 `failed`；报告列出逐目标状态 | `write-apply.test.ts` 日志链与部分完成；E2E 读取目标文件                                  |
| 临时副本中的成功/拒绝路径和 committed fixture 不变量             | E2E 把 fixture 复制到 `testInfo.outputPath('workspace')`，写入只发生在副本；前后比较 committed fixture 哈希                                          | `tests/e2e/p4-write.e2e.spec.ts` 每个用例的 `captureFixtureHash`/`CaptureFixtureHashAfterClose` |

## 5. 关键决定

1. **一个目标、一种操作**：首个切片每条提案只包含一个 `replace_file` 目标；同一 Run 对同一路径只允许一次提案，避免 #18 变更日志按 `runId/path` 查最后记录时混淆两次写入。每个 Run 最多 4 条提案。
2. **提案只来自 main 读取 + 模型提案**：`before` 与文件身份来自 main 的实际读取；`after` 来自 adapter 的精确内容。预览不接受模型“已完成”的自述。
3. **`previewRevision` 表达按份批准**：它不是权限记录，也不改变 #18 的会话级权限；刷新或重新读取目标后递增，旧批准不再匹配。新 Run 修订同样使旧预览失效，权限本身不受影响。
4. **原子替换**：同目录临时文件、`fsync`、按原始 `mode` 设置权限、替换前再次核对 `ino + birthtimeMs`，然后 `rename`。写入失败时目标保持原样；`rename` 成功后回读不一致记 `verification_failed`，不报告成功。`rename` 作为实现机制不改变“只替换已有路径”的用户可见语义，#18 §5.2 已把“临时文件 + rename”列为可能的写入方式。
5. **保护路径提案不进入**：预览阶段沿用只读路径策略，隐藏文件、`.git` 与凭证类名称不进入提案；`full_access` 的允许清单只影响落盘前的再观察与执行，#19 不提出保护路径提案。
6. **`auto_review` 按 #18 语义自动落盘**：选中该档需要显式风险确认；提案通过写前检查后由 main 自动批准，写后回读仍执行。预览与结果仍可查看，只是没有逐次确认。其余档位的批准是用户动作，不是持久化的一次性记录。
7. **串行化**：权限变更、刷新、拒绝与落盘走同一条主进程串行链，避免降权与正在进行的写入交错；读操作（列表/取预览）不阻塞。
8. **内存与字节预算**：最多保留 32 条提案、合计 8 MiB；超出先淘汰已收尾提案，仍不满足则拒绝新提案。Diff 单份上限 4 MiB，超出直接拒绝，绝不截断。
9. **变更日志先落盘再写文件**：`intent` 追加并 fsync 成功后才开始替换；日志不可用时不写入。写后日志失败时目标已写但证据不完整，报告 `verification_failed`，不宣称成功。

## 6. 明确限制

- 不实现恢复执行器、快照、自动回滚或部分完成的完整恢复矩阵（#20）。
- 不提供命令、shell、删除、重命名、创建、改权限位或项目外路径。
- `auto_review` 没有逐次确认，这是 #18 定义的档位语义；本票不另造一套“自动审查也要逐次批准”的相反语义。
- 真实 Provider、Windows 人工验收与内核级隔离不在本票内；受控 adapter 的 E2E 不能报告为真实 Provider 验证。
- 提案与权限都在 main 内存中；进程重启后两者都不存在，持久化与失效实现留给后续票。

## 7. 测试

- Contract：`write-preview.test.ts`（契约、Diff、提案表、刷新/过期/预算）、`write-apply.test.ts`（执行器、原子替换、回读、部分完成、日志、权限存储）、`write-controller.test.ts`（用户流程、权限、过期、`auto_review`、窗口绑定、其他路径不变）、`write-ipc.test.ts`（绑定与 schema）。
- Real Electron E2E：`tests/e2e/p4-write.e2e.spec.ts`，复制 fixture 到临时可写副本，覆盖拒绝、批准、目标变化后刷新再批准、只读拒绝，并比较 committed fixture 哈希。
- 交付前运行 `pnpm verify:repository` 与完整 `pnpm check`，结果见[验证记录](../testing/issue19-verification.md)。
