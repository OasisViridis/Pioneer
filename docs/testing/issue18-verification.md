# Issue #18 验证记录：P4-D1 写入权限与恢复决策

核对日期：2026-11-02。来源：[Issue #18](https://github.com/OasisViridis/Pioneer/issues/18)。基线：`origin/main` `28e6882`。分支：`docs/issue18-write-authorization`。交付：[PR #56](https://github.com/OasisViridis/Pioneer/pull/56)。

本记录只证明决策规格与规格探针的可执行结果，不证明写入功能已实现、已接入执行器或已获人类确认。写入能力在本记录发布时仍为关闭状态。

## 交付范围

| 模块         | 内容                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 决策规格     | [`docs/specs/2026-10-27-p4-write-authorization-and-recovery.md`](../specs/2026-10-27-p4-write-authorization-and-recovery.md)                   |
| 契约         | [`apps/desktop/src/shared/contracts/write-permission.ts`](../../apps/desktop/src/shared/contracts/write-permission.ts)                         |
| 共享路径规则 | [`apps/desktop/src/shared/path-safety.ts`](../../apps/desktop/src/shared/path-safety.ts)                                                       |
| 目标观察     | [`apps/desktop/src/main/harness/write-permission/observe-targets.ts`](../../apps/desktop/src/main/harness/write-permission/observe-targets.ts) |
| 纯决策       | [`apps/desktop/src/main/harness/write-permission/decision.ts`](../../apps/desktop/src/main/harness/write-permission/decision.ts)               |
| 共享读取     | [`apps/desktop/src/main/harness/bounded-read.ts`](../../apps/desktop/src/main/harness/bounded-read.ts)                                         |
| 探针测试     | [`tests/contract/write-permission.test.ts`](../../tests/contract/write-permission.test.ts)：72 项 Contract 探针                                |

没有新增 IPC 通道、preload 方法、renderer 组件、能力位或 Run 事件字段；`run-ipc.ts` 与 `pioneer-run.ts` 未改动。`egress-materials.ts` 只改了内部读取实现，对外错误码映射不变（`UNSTABLE` → `MATERIAL_NOT_ALLOWED`，其余读取失败 → `INVALID_REQUEST`）。

## 验证证据

| 项         | 命令/位置                                                      | 结果                                                               |
| ---------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| 仓库规范化 | `pnpm verify:repository`                                       | 6/6 通过                                                           |
| 定向探针   | `pnpm exec vitest run tests/contract/write-permission.test.ts` | 72/72 通过；其中 3 条在平台前提不满足时显式 `skip`（身份复用、符号链接权限；本机未触发） |
| 完整门禁   | `pnpm check`                                                   | 见下方"门禁结果"                                                   |
| 类型       | `pnpm typecheck`、`pnpm test:contract:types`                   | 通过                                                               |
| 代码风格   | `pnpm lint`、`pnpm format:check`（均在 `pnpm check` 内）       | 通过                                                               |
| 空白差异   | `git diff --check`                                             | 无输出                                                             |

### 门禁结果

最终 `pnpm check`（日志 `tmp/issue18/full-check-24.log`，2026-11-02）退出码 0：

- Contract Tests：466/466 通过（40 个测试文件，含本票 72 项）；
- Prototype Tests：210/210 通过；
- Real Electron E2E：39/39 通过（先 build 再运行）；
- 最终 package smoke：Electron Forge 打包完成。

## 模型变更：从每 Diff 批准到权限模式

2026-11-02 按用户决定，删除每 Diff 的写入批准模型，换成四档权限选择器（仅可查看、工作区内修改、完全权限、自动审查 EXP）。被删除的组件：

| 删除                                                                   | 原因                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `WriteApprovalSchema`、`approvalId`、`diffDigest`                      | 不再按份批准 Diff，diff 摘要没有消费者                   |
| 10 分钟有效期、一次性消费、`appliedAt`                                 | 权限是会话级的，写入不依赖某份记录的保质期               |
| 保留后像字节与 `checkRetainedPostImages`                               | 不再需要用保留内容证明"审阅的还是这一份"                 |
| 拒绝后撤销批准、`WriteRevocationReason`                                | 拒绝只产生结果，不改权限                                 |
| `evaluateWriteApproval`、`consumeWriteApproval`、`markApprovalApplied` | 由 `checkWritePermission` + `evaluateWriteTargets` 取代  |
| `APPROVAL_*` 八个拒绝码                                                | 由 `PERMISSION_*` 三个权限码与 `TARGET_*` 九个写前码取代 |

保留并沿用的部分：目标观察（内容优先、身份其次）、变更日志、逐路径状态、恢复计划与冲突保留、保护路径、批次整体或无。

新增：`auto_review` 档位与 `riskAcknowledged` 风险确认、`scope`（全部目标或子集）、`PERMISSION_*` 与 `TARGET_*` 两组词汇。

## 前几轮审查的处理

权限模型之前，本票经历过两轮双轴审查与五轮修复；这些修复在改模型时一并保留：

1. 保护路径按整段匹配、任意深度、大小写不敏感，且 `.git` 不能被策略移除。
2. 变更日志的证明链：`intent` 必须在 `applied` 之前、`intent.beforeSha256` 必须等于本批次的 `before`、`applied` 必须 `verified` 且哈希与 `after` 一致。
3. 恢复按"该路径最后一条记录"判定，孤立的恢复记录、未验证的 `applied`、写入后又失败、恢复后文件又被改，一律冲突。
4. 测试夹具从目标取哈希，而不是自造哈希。

## 编辑过程事故与修复

早期用 PowerShell `Get-Content`/`Set-Content` 改写 Markdown，因终端按本地代码页读写 UTF-8，导致规格文件被写入损坏内容并带上 BOM。修复方式：从 `HEAD` 取回完整版本、用 UTF-8 无 BOM 重写、重新施加待改内容，并用 `[System.IO.File]::ReadAllText` 核对。此事故不影响代码与探针结果，记录在此避免后续读者把编辑中间态当成交付内容。

## Issue #18 完成条件对照

| 条件                                              | 状态                                                  |
| ------------------------------------------------- | ----------------------------------------------------- |
| 1. 四类许可的关系与边界                           | 规格 §1 已写；探针覆盖写入侧，读取与外发沿用既有实现  |
| 2. 写入记录可核对（会话、项目、目标、变化、范围） | 契约与规格 §2 已定义；真实界面属 #19                  |
| 3. 旧内容拦截                                     | 写前校验已实现并覆盖 9 个拒绝码                       |
| 4. 部分完成与失败呈现                             | 变更日志与 7 个逐路径状态已定义                       |
| 5. 并发冲突与恢复                                 | 恢复计划与 7 条判定已实现，探针覆盖                   |
| 6. 独立审阅与人类确认                             | 独立审查已做；§9 十二个决定仍为 PENDING，等待人类确认 |

## 人类确认状态

§9 的十二个决定全部 `PENDING`。写入能力保持关闭；确认前不得把本票描述为已交付可用写入。

## NOT_RUN

- 真实写入执行器：本票不实现。
- 内核级沙箱（Windows 受限 Token、job object、低权限账户、MXC）：#19/#20。
- 权限选择器的 renderer 实现与 IPC：本票不建。
- 人类对 §9 的确认：未进行。

## 未完成

1. §9 十二个决定的确认。
2. #19 的写入执行器、权限界面与恢复执行器。
3. #20 的内核级隔离与并发验证。
4. `afterRead` 测试钩子的去留（规格 §9.1 第 9 项）。
