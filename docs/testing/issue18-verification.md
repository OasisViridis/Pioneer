# Issue #18 验证记录：P4-D1 写入权限与恢复决策

核对日期：2026-11-02（初版）；2026-11-03（§9 定稿）。来源：[Issue #18](https://github.com/OasisViridis/Pioneer/issues/18)。基线：`origin/main` `13ccfe5`（定稿分支自该提交起）。分支：`docs/issue18-confirm-decisions`。交付：[PR #65](https://github.com/OasisViridis/Pioneer/pull/65)。

本记录只证明决策规格与规格探针的可执行结果，不证明写入功能已实现、已接入执行器或已获内核级隔离。写入能力在本记录发布时仍为关闭状态，直到 #19/#20 实现并通过验收。

## 交付范围

| 模块         | 内容                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 决策规格     | [`docs/specs/2026-10-27-p4-write-authorization-and-recovery.md`](../specs/2026-10-27-p4-write-authorization-and-recovery.md)                   |
| 契约         | [`apps/desktop/src/shared/contracts/write-permission.ts`](../../apps/desktop/src/shared/contracts/write-permission.ts)                         |
| 共享路径规则 | [`apps/desktop/src/shared/path-safety.ts`](../../apps/desktop/src/shared/path-safety.ts)                                                       |
| 目标观察     | [`apps/desktop/src/main/harness/write-permission/observe-targets.ts`](../../apps/desktop/src/main/harness/write-permission/observe-targets.ts) |
| 纯决策       | [`apps/desktop/src/main/harness/write-permission/decision.ts`](../../apps/desktop/src/main/harness/write-permission/decision.ts)               |
| 共享读取     | [`apps/desktop/src/main/harness/bounded-read.ts`](../../apps/desktop/src/main/harness/bounded-read.ts)                                         |
| 探针测试     | [`tests/contract/write-permission.test.ts`](../../tests/contract/write-permission.test.ts)：81 项 Contract 探针                                |

没有新增 IPC 通道、preload 方法、renderer 组件、能力位或 Run 事件字段；`run-ipc.ts` 与 `pioneer-run.ts` 未改动。`egress-materials.ts` 只把内部读取换成共享的 bounded-read，对外错误码映射不变（`UNSTABLE` → `MATERIAL_NOT_ALLOWED`，其余读取失败 → `INVALID_REQUEST`）；既有 egress 探针通过。这是共享读取的复用，不是接手 #13。

## 验证证据

| 项             | 命令/位置                                                                                                               | 结果                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 仓库规范化     | `pnpm verify:repository`                                                                                                | 6/6 通过                                                                                                |
| 定向探针       | `pnpm exec vitest run tests/contract/write-permission.test.ts`                                                          | 81 项全部通过；5 处 `skip` 只在平台前提不满足时触发（身份复用、身份不可用、符号链接/联接权限、父目录链接权限；本机未触发） |
| 本地无窗口检查 | `pnpm verify:repository`、`format:check`、`lint`、`typecheck`、`test:contract:types`、`test:contract`、`test:prototype` | 全部退出码 0；Contract 511/511（43 个文件，含本票 81 项）；Prototype 210/210                            |
| 历史完整门禁   | CI run 41457020013（`b60dc76`，PR #56）                                                                                 | `Windows / pnpm check` 与 `Windows / reviewed visual baseline` 均 success                               |
| 本轮完整门禁   | CI run 41489090986（`ed4773d`，PR #65）与修复提交的 CI                                                                  | `Windows / pnpm check`（9m12s）与 `Windows / reviewed visual baseline`（1m32s）均 success；修复提交的 run 见 PR 检查页 |
| 空白差异       | `git diff --check`                                                                                                      | 无输出                                                                                                  |

### 门禁结果

本地不执行 `pnpm check`：它包含 Real Electron E2E，会在使用者桌面弹出窗口。本地只跑无窗口的部分，完整门禁（含 E2E 与 package smoke）由 CI 的 `Windows / pnpm check` 执行，结果以该次 CI run 为准：

- 2026-11-02 历史：Contract 469/469（40 个测试文件，含本票 75 项）；Prototype 210/210；CI run 41457020013 在 `b60dc76` 上 success。
- 2026-11-03 本轮：Contract 511/511（43 个测试文件，含本票 81 项）；Prototype 210/210；`verify:repository` 6/6；format、lint、typecheck、`test:contract:types` 通过。CI run 41489090986 在 `ed4773d` 上 success（`pnpm check` 9m12s，visual baseline 1m32s）；修复提交的 CI 见 PR 检查页。
- 此前在本机完整跑通的门禁日志保留为 `tmp/issue18/full-check-24.log`（含 E2E 39/39 与打包），后续改动改为由 CI 验证。

## 模型变更：从每 Diff 批准到权限模式

2026-11-02 按用户决定，删除每 Diff 的写入批准模型，换成四档权限选择器（仅可查看、工作区内修改、完全权限、自动审查 EXP）。被删除的组件：

| 删除                                                                   | 原因                                                     |
| ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `WriteApprovalSchema`、`approvalId`、`diffDigest`                      | 不再按份批准 Diff，diff 摘要没有消费者                   |
| 10 分钟有效期、一次性消费、`appliedAt`                                 | 权限是会话级的，写入不依赖某份记录的保质期               |
| 保留后像字节与 `checkRetainedPostImages`                               | 不再需要用保留内容证明"审阅的还是这一份"                 |
| 拒绝后撤销批准、`WriteRevocationReason`                                 | 拒绝只产生结果，不改权限                                 |
| `evaluateWriteApproval`、`consumeWriteApproval`、`markApprovalApplied` | 由 `checkWritePermission` + `evaluateWriteTargets` 取代  |
| `APPROVAL_*` 八个拒绝码                                                | 由 `PERMISSION_*` 三个权限码与 `TARGET_*` 九个写前码取代 |

保留并沿用的部分：目标观察（内容优先、身份其次）、变更日志、逐路径状态、恢复计划与冲突保留、保护路径、批次整体或无。

新增：`auto_review` 档位与 `riskAcknowledged` 风险确认、`scope`（全部目标或子集）、`PERMISSION_*` 与 `TARGET_*` 两组词汇。

## §9 定稿（2026-11-03）

业主在 2026-11-03 的会话中指示"完成 issue 的任务，不要找我批准"，把本票的定稿权交给代理；代理按规格建议值逐项定稿，第 5 项按代码与 Issue 的一致性改为不绑定任务，业主可在合并前推翻任何一项。

- 12 项结论：11 项采纳；第 5 项修改为"切项目、关窗、重启失效，同一会话内切任务不失效"。
- 依据：规格与契约、实现、探针的一致性核对；81 项 Contract 探针；两轮双轴审阅与一次外部第二意见；外部意见发现的问题见下并已修复。
- 写入能力不因定稿开启；#19/#20 才实现执行器、界面与内核隔离。

### 独立审阅

本轮按 `code-review` 的双轴流程做两份只读审阅，报告要点与处理如下。

Standards 轴：

1. 术语漂移（写入授权 / 写入许可 / 外发许可）→ 规格 §1 对齐 GLOSSARY 的"写入权限"、"Grant（运行授权）"、"发布授权"；`WriteAuthorization` 改名 `WriteAdmission` 并注明它不是 GLOSSARY 的授权总称。
2. 验证记录缺实际 CI 结论、"40 个测试文件"与当前 43 不符 → 本节补历史与本轮 CI；历史数字按 `b60dc76` 标注，本轮数字按 43 个文件记录。
3. Contract 层带平台条件 skip → 保留并在本节与规格 §7 如实标注；本机与 CI 未触发。
4. 保护路径规则在 decision 与 observe 各一份 → 抽到 `shared/path-safety.ts` 的 `matchesProtectedPath`，两处共用。
5. `bounded-read` 注释自称唯一实现 → 不成立：注释只声明 egress 与写入观察两个调用方共用，`read-only-tools` 的读取是另一条工具执行路径，不构成第三份实现。
6. `32` 重复 → 共享 `MAX_PATH_COMPONENTS`。
7. `WriteTargetPath` 未用于决策签名 → `WritePermissionDecision`、`WriteAdmission`、`recovery` 的路径改用该类型。
8. `id`/`revision`/`sha256`/`bytes` 命名含糊、`WRITE_PERMISSION_DENIALS` 缺 `_CODES` → 改为 `identifierSchema`、`revisionSchema`、`sha256Schema`、`byteCountSchema`、`WRITE_PERMISSION_DENIAL_CODES`。
9. 保护路径 `.max(8)` 规格未记 → 规格 §2.1 补充。
10. 旧修订号探针的 `.map(revision: 1)` 是 no-op → 改为直接使用 revision 1 的记录并注明当前 revision 2。

Spec 轴：

1. §9 未提交、验证记录仍 PENDING → 本 PR 提交 §9 定稿并更新本记录。
2. 条件 2 的 Run 身份未写清 → 规格 §2.3 说明 Run 身份由外层元数据提供，`WritePermission` 绑定会话与项目而非单个 Run。
3. `egress-materials.ts` 改动疑似越界 → 只替换内部读取为共享 bounded-read，错误码映射与对外行为不变，既有 egress 探针通过；规格交付范围已列明，不是接手 #13。
4. 规格无过期时间与 Issue "过期或材料变化后拒绝旧批准"冲突 → 规格 §2.2 说明模型已无按份批准，等价保证由 `checkPermissionBinding` 与写前目标重观察提供。
5. "切任务失效"没有 task 字段 → 第 5 项改为不绑定任务，规格 §2.1/§2.2 与契约注释同步。
6. `rejectedOutcomes` 把首个拒绝码套到全批 → 改为逐目标码；未异常目标保持 `unchanged`，规格 §4.5 同步。
7. 缺目标上限与父目录链接探针 → 新增 4 项（目标上限 16、保护路径 8 条、父目录链接、逐目标拒绝码），共 81 项。
8. 探针只 import 模块、未走 Electron 流程 → 本票没有写入执行器，Issue 的 Testing Decisions 明确"本决策票只验证规格探针"；真实 Electron 批准/拒绝流程列入 NOT_RUN，由 #19 验收。

### 外部第二意见

- 2026-11-03 第一次尝试：`voyager ask` 带 4 个附件，在附件上传阶段报 `selector-missing`（`The composer has no general file input.`），没有 `sent` 检查点与 conversationId，prompt 未送达；未重发同一 prompt。
- 2026-11-03 第二次尝试：去掉附件、把材料内联进 prompt，已送达 [ChatGPT 会话](https://chatgpt.com/c/6ae8c347-9784-83ea-b6aa-c8ed9f75fc6c)，但返回空回复（`response.md` 0 字节），未取得意见。
- 2026-11-03 第三次尝试：换成更短的复核 prompt，已送达并取得回复（[会话](https://chatgpt.com/c/6ae95d12-4e20-83ea-966f-6abdb787e014)）。结论“修完再合并”，阻断项 B1：`checkWritePermission` 对显式 scope 做大小写折叠，在大小写敏感卷上可能把 `src/a.ts` 放进 `src/A.ts` 的子集。已改为精确路径匹配并补 1 项拒绝探针；另两条建议中，大小写重复目标由契约的 `toLowerCase` 去重保守拒绝整批，会话绑定已有探针覆盖。
- 此前的模型选择外部意见：2026-10-29 的 Codex 调研（[会话](https://chatgpt.com/c/6ae0c6de-a264-83ea-9c1b-663b7b897d3a)）已记录在 Issue #18 的评论中，用于沙箱边界取舍，不代替本轮对 12 项决定的评审。

### 第二轮审阅（2026-11-03）

`/voyager` 与 `/code-review` 对 `c09d811` 复核后发现并修复：

- 外部意见 B1：scope 大小写折叠 → 改为精确路径匹配，补 1 项拒绝探针。
- Standards：契约与决策注释仍有两处 "grant" 指写入权限、`path-safety` 模块注释未覆盖新增常量、链接探针的 `catch` 把真实错误也记成 skip、契约注释仍写"人类确认是前置" → 已修；链接探针改为只在 `EPERM`/`EACCES`/`ENOTSUP`/`UNKNOWN` 时 skip，其余错误抛出。
- Spec：绑定校验未由两入口调用 → 规格 §2.2 改为"调用方先用 `checkPermissionBinding`"；恢复缺删除冲突探针 → 补 1 项；Electron 流程 → `NOT_RUN`（#19）。
- Spec 复核补充：验证记录必须引用业主原话（已补"/voyager /code-review 没有问题后授权你合并"）；`replace_file` 与 UTF-8 校验没有落点 → 规格 §2.4 与 §9 第 2 项明确"构造批次与替换执行属 #19，本票不建执行器与操作枚举"。
- 计数：探针 79 → 81；Contract 509 → 511。

## 前几轮审查的处理

权限模型之前，本票经历过两轮双轴审查与五轮修复；这些修复在改模型时一并保留：

1. 保护路径按整段匹配、任意深度、大小写不敏感，且 `.git` 不能被策略移除。
2. 变更日志的证明链：`intent` 必须在 `applied` 之前、`intent.beforeSha256` 必须等于本批次的 `before`、`applied` 必须 `verified` 且哈希与 `after` 一致。
3. 恢复按"该路径最后一条记录"判定，孤立的恢复记录、未验证的 `applied`、写入后又失败、恢复后文件又被改，一律冲突。
4. 测试夹具从目标取哈希，而不是自造哈希。

## 编辑过程事故与修复

早期用 PowerShell `Get-Content`/`Set-Content` 改写 Markdown，因终端按本地代码页读写 UTF-8，导致规格文件被写入损坏内容并带上 BOM。修复方式：从 `HEAD` 取回完整版本、用 UTF-8 无 BOM 重写、重新施加待改内容，并用 `[System.IO.File]::ReadAllText` 核对。此事故不影响代码与探针结果，记录在此避免后续读者把编辑中间态当成交付内容。

## Issue #18 完成条件对照

| 条件                                              | 状态                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1. 四类许可的关系与边界                           | 规格 §1 已写；探针覆盖写入侧，读取与外发沿用既有实现                                     |
| 2. 写入记录可核对（会话、项目、目标、变化、范围） | 契约与规格 §2 已定义；Run 身份由外层元数据提供；真实界面属 #19                           |
| 3. 旧内容拦截                                     | 写前校验已实现并覆盖 9 个拒绝码                                                          |
| 4. 部分完成与失败呈现                             | 变更日志与 7 个逐路径状态已定义                                                          |
| 5. 并发冲突与恢复                                 | 恢复计划与 7 条判定已实现，探针覆盖                                                      |
| 6. 独立审阅与人类确认                             | 两轮双轴审阅与一次外部第二意见完成；业主 2026-11-03 授权代理定稿 §9，并指示"/voyager /code-review 没有问题后授权你合并"；写入能力保持关闭 |

## 人类确认状态

§9 的十二个决定已于 2026-11-03 按业主授权定稿：11 项采纳建议值，第 5 项按代码与 Issue 的一致性修改。业主在 2026-11-03 的会话中指示"/voyager /code-review 没有问题后授权你合并"，这是对定稿与合并的直接确认；写入能力保持关闭。

## NOT_RUN

- 真实写入执行器：本票不实现。
- 内核级沙箱（Windows 受限 Token、job object、低权限账户、MXC）：#19/#20。
- 权限选择器的 renderer 实现与 IPC：本票不建。
- 真实 Electron 批准/拒绝流程：本票没有写入执行器；由 #19 验收。

## 未完成

1. #19 的写入执行器、权限界面与恢复执行器。
2. #20 的内核级隔离与并发验证。
3. `afterRead` 测试钩子的去留（规格 §9.1 第 9 项）。
