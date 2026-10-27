# Issue #18 验证记录：P4-D1 写入授权与恢复决策

核对日期：2026-10-27。来源：[Issue #18](https://github.com/OasisViridis/Pioneer/issues/18)。基线：`origin/main` `b93d8e9`（PR #52 合并后）。分支：`docs/issue18-write-authorization`（自该基线检出）。交付：[PR #56](https://github.com/OasisViridis/Pioneer/pull/56)。

本记录只证明决策规格与规格探针的可执行结果，不证明写入功能已实现、已接线或已获人类确认。写入能力在本记录发布时仍为关闭状态。

## 交付范围

| 模块 | 内容 |
| --- | --- |
| 决策规格 | [`docs/specs/2026-10-27-p4-write-authorization-and-recovery.md`](../specs/2026-10-27-p4-write-authorization-and-recovery.md)：四类许可关系、写入批准生命周期、保留内容、diffDigest 编码、陈旧审批拦截、部分完成状态、并发冲突与恢复规则、拒绝码、探针矩阵、威胁范围、12 项待人类确认决定、7 项留给 #19/#20 的决定 |
| 数据契约 | [`apps/desktop/src/shared/contracts/write-approval.ts`](../../apps/desktop/src/shared/contracts/write-approval.ts)：批准记录、摘要、目标状态、逐路径结果、变更日志记录、撤销原因 |
| 目标观察 | [`apps/desktop/src/main/write-approval/observe-targets.ts`](../../apps/desktop/src/main/write-approval/observe-targets.ts)：只读句柄读取、内容哈希、文件身份；不写、不删、不改名 |
| 共享读取 | [`apps/desktop/src/main/harness/bounded-read.ts`](../../apps/desktop/src/main/harness/bounded-read.ts)：外发清单与写入观察共用的有界稳定读取；`egress-materials.ts` 改为调用它，错误码映射不变 |
| 纯决策 | [`apps/desktop/src/main/write-approval/decision.ts`](../../apps/desktop/src/main/write-approval/decision.ts)：批准判定、保留内容核对、撤销、完成标记、逐路径结果、恢复计划；不触碰文件系统 |
| 探针测试 | [`tests/contract/write-approval.test.ts`](../../tests/contract/write-approval.test.ts)：83 项 Contract Tests |
| 词表 | [`GLOSSARY.md`](../../GLOSSARY.md)：新增「写入批准（Write Approval）」「变更日志（Change Journal）」 |

没有新增 IPC 通道、preload 方法、renderer 组件、能力位或 Run 事件字段；`run-ipc.ts` 与 `pioneer-run.ts` 未改动。`egress-materials.ts` 只改了内部读取实现，对外错误码与行为不变。

## 验证证据

| 项 | 命令/位置 | 结果 |
| --- | --- | --- |
| 仓库规范化 | `pnpm verify:repository` | 6/6 通过 |
| 定向探针 | `pnpm exec vitest run tests/contract/write-approval.test.ts` | 83/83 通过 |
| 受影响既有测试 | `egress-materials`、`read-only-tools-exec`、`read-only-tool-policy`、`run-manager` | 123/123 通过 |
| 完整门禁 | `pnpm check` | 见下方"门禁结果" |
| 类型 | `pnpm typecheck`、`pnpm test:contract:types` | 通过 |
| 代码风格 | `pnpm lint`、`pnpm format:check`（均在 `pnpm check` 内） | 通过 |
| 空白差异 | `git diff --check` | 无输出 |

### 门禁结果

最终 `pnpm check`（日志 `tmp/issue18/full-check-6.log`，2026-10-27）退出码 0：

- Contract Tests：431/431 通过（37 个测试文件，含本票 83 项）；
- Prototype Tests：210/210 通过；
- Real Electron E2E：27/27 通过（先 build 再运行）；
- 最终 package smoke：Electron Forge 打包完成，`Packaging for x64 on win32` 与 postPackage hook 均成功。

该门禁覆盖第二轮复核修复（内容优先的陈旧判定、`applied.observedIdentity`、两目标重建探针、重复保留内容探针）之后的最终代码树。之后的改动只有 Markdown 规格与验证记录文本，不进入 `pnpm check`；仓库规范化的最终结果见上方"验证证据"表。

### 编辑过程事故与修复

工作过程中有一次用 PowerShell `Get-Content`/`Set-Content` 改写 Markdown，因该终端按本地代码页读写 UTF-8，导致规格文件被写入损坏内容并带上 BOM。修复方式：从 `HEAD` 取回完整版本、用 UTF-8 无 BOM 重写受影响文件、逐条重新施加待改内容，并用 `[System.IO.File]::ReadAllText` 核对关键中文短语。最终确认：`docs/specs/`、`docs/testing/`、`apps/desktop/src/` 与 `tests/contract/` 的本票文件均为无 BOM 的 UTF-8，提交对象 `aefad34` 的 `egress-materials.ts` 首字节不是 BOM。此事故不影响代码与探针结果，但记录在此，避免后续读者把编辑中间态当成交付内容。

## 环境差异与失败记录

1. **`ELECTRON_RUN_AS_NODE=1`**：首次 `pnpm check`（`tmp/issue18/full-check-1.log`）E2E 27/27 失败，首个错误为 `electron.exe: bad option: --remote-debugging-port=0`。原因是本会话环境把 Electron 置为纯 Node 模式。移除该变量后重跑通过（`full-check-2.log`，退出码 0）。属环境差异，不是代码缺陷；该变量未写入仓库文件。
2. **会话生命周期 E2E 波动**：第三次门禁（`full-check-3.log`）中 `session-lifecycle.e2e.spec.ts` 有 1 项失败（`canceling a slow close prevents its late save completion from closing the window`，`expect(locator).toHaveValue`），同一提交在第二次门禁中 27/27 通过。本票没有修改 renderer、Electron 主进程或会话生命周期代码（改动仅限 `shared/contracts/write-approval.ts`、`main/write-approval/`、`main/harness/bounded-read.ts` 与 `main/harness/egress-materials.ts` 的内部读取实现、探针测试与文档），因此该失败按既有 E2E 波动处理，并在最终门禁重跑确认；日志保留，不删除失败记录。

## Issue #18 完成条件对照

| 完成条件 | 规格位置 | 探针或证据 |
| --- | --- | --- |
| 文档列出只读、外发、写入和发布各自的授权关系与明确拒绝情形 | §1 四类许可表 + 四条不可推导规则 | 规格文档 |
| 授权信息能让用户核对 Run、相对目标、待写入变化和许可有效范围 | §2.1 字段表、§2.3 六项必须显示（含写入后字节/哈希与完整 Diff）、§2.5 diffDigest 编码 | 摘要 schema 探针（含 after 字节/哈希、无绝对路径、无窗口绑定字段）与保留内容核对探针；完整 Diff 是 §2.3 的界面要求，由 #19 的预览实现验收 |
| 说明目标文件在批准后发生变化、移动或消失时如何阻止旧 Diff 落盘 | §3.1 身份依据、§3.2 两段判定与优先级、§3.3 整体拒绝 | `target observation`、`write approval decision` 组 |
| 说明写入部分完成、进程停止和验证失败时如何呈现实际文件状态 | §4.1 变更日志、§4.2 七种状态、§4.3 场景表、§4.5 拒绝留痕 | `write outcomes` 组 |
| 提供用户并发修改的冲突例子及保留现场的恢复规则 | §5.1 三个例子、§5.2 判定、§5.3 幂等、§5.5 恢复授权 | `recovery planning` 组 |
| 规格和负向探针通过独立审阅并得到人类确认；未确认时写入能力保持关闭 | §9 待确认决定、§10 验证记录 | 独立审阅见下节；人类确认仍为 PENDING；`write surface stays closed` 探针持续拦截新的写调用字面量 |

## 独立审阅

三轮独立审阅（两份首轮 + 一轮修复后复核）均在只读模式下进行，覆盖规格、契约、观察、决策与探针；另有一份外部第二意见（voyager / ChatGPT）作为补充输入。

### 第一轮：标准审阅（子代理）

结论：0 个 blocking、5 个 should-fix、9 个 nit。处理结果：

| 编号 | 发现 | 处理 |
| --- | --- | --- |
| SF1 | 文件身份优先导致原子保存/`git restore` 被判 `replaced`，与规格"只保存不改内容不算冲突"的表述冲突 | 采纳：规格 §3.1 明确"内容相同、身份不同即 `replaced` 并重审"，把 mtime-only 情形限定为身份不变；摘要增加"身份已记录/不可用"显示项 |
| SF2 | `approvalMs` 只在注释与测试出现，schema 未执行 10 分钟上限 | 采纳：schema 增加有效期上限校验，新增"超过批准窗口"探针 |
| SF3 | 观察模块重复了外发侧的 `readBounded` | 采纳：提取 `harness/bounded-read.ts`，两侧共用；外发错误码映射保持，123 项相关测试通过 |
| SF4 | 符号链接用例在无权限环境静默通过 | 采纳：改用 `context.skip()`，跳过可见 |
| SF5 | 写面扫描漏 `open(...,'w')`、`handle.write` | 采纳：正则加入 `FileHandle.write`、`writeSync`、`appendFileSync` 与 `open(...,'w')` 形式；测试名改为"既有受审文件之外没有写调用字面量" |
| nit 6 | `APPROVAL_REQUIRED`、`APPROVAL_REJECTED` 无生产者 | 采纳：`checkRetainedPostImages` 产出 `APPROVAL_REQUIRED`；删除 `APPROVAL_REJECTED` |
| nit 7 | `id`/`revision` 与运行契约重复 | 采纳：改用 `RunIdentitySchema.shape.runId` 与 `.revision` |
| nit 8 | 恢复记录被报成 `unchanged`，与规格定义冲突且无探针 | 采纳：新增 `restored` 状态与 `RECOVERY_CONFLICT` 失败码，补两条探针 |
| nit 9 | 逐路径结果的 `code` 是开放字符串 | 采纳：改为失败码与拒绝码的联合枚举 |
| nit 10 | 路径契约比只读策略更松（设备名、组件数） | 采纳：契约层拒绝 Windows 设备名与超过 32 个组件 |
| nit 11 | `finally` 中 `close()` 抛错会把成功观察变成 rejected | 采纳：共享读取中 `close().catch(() => undefined)` |
| nit 12 | 恢复计划在观察缺失时伪造不完整对象 | 采纳：补 `identity: null`，语义写入注释 |
| nit 13 | "同名重建"探针是伪造身份 | 采纳：增加真实删除后重建的探针，平台复用身份时显式 `skip`；保留确定性身份探针 |
| nit 14 | 拒绝消息未断言不含项目根 | 采纳：新增断言 message 不含项目根或其正斜杠形式 |

### 第一轮：规格审阅（子代理）

结论：`changes-requested`，阻塞项 7 组。处理结果：

| 编号 | 发现 | 处理 |
| --- | --- | --- |
| A2 | "待写入变化"只有哈希，界面看不到写入内容 | 采纳：§2.3 必须显示写入后字节、哈希与完整 Diff |
| I1 | §2.2 与 §2.4 对"重复应用"互相矛盾 | 采纳：统一为 `APPROVAL_CONSUMED`，删除"返回已有结果"的表述 |
| D1 | 待写入内容没有归属，执行器写不出被批准的字节 | 采纳：§2.4 定义 main 保留内容与 `checkRetainedPostImages`；新增四条探针 |
| I2 | 恢复完成被报成 `unchanged` | 采纳：新增 `restored`，`preserve` 映射为 `failed(RECOVERY_CONFLICT)` |
| B3 | §5.1 例 3 的 `outOfScope` 表述错误 | 采纳：§5.1 改为"`outOfScope` 只列批准了但本 Run 未应用的目标，批准集合之外更外层" |
| B5/B6 | `APPROVAL_REQUIRED` 与 `revoked` 无写入者 | 采纳：补 `checkRetainedPostImages` 与 `revokeWriteApproval`，并补探针 |
| B1/B2 | 计数不一致、决定条数自相矛盾 | 采纳：探针 83 项、决定 12 项、验证记录重写 |
| B4 | "四个 userData 写入点"高估写面扫描 | 采纳：§7 写明扫描是文本级门槛、按文件放行、不检查目的地 |
| B7 | 摘要清单漏 `operation` 与 `identity` | 采纳：§2.1/§2.3 补齐，身份只显示"已记录/不可用" |
| B8 | 二进制/截断排除不可判定 | 采纳：§2.4 写明批准生成前由 main 验证 UTF-8，批准隐含文本 |
| B9 | `pathBytes` 与"字符"混用 | 采纳：常量改名 `pathChars`，并加 `pathComponents` |
| I3 | §3.2 固定顺序与代码组合不符、拒绝码优先级未定 | 采纳：§3.2 改为纯决策 → 观察两段，明确优先级与"每次重新观察" |
| I4 | after 与 identity 的显示规则互斥 | 采纳：§2.1/§2.3 统一为"显示 after 与身份可用性，不显示绑定字段与设备编号" |
| I5 | "不可再用"缺状态 | 采纳：拒绝后撤销（`stale_target`），写入 §2.2 与 §4.5 |
| I6 | 恢复的身份条件依赖另一函数隐式保证 | 采纳：`planRecovery` 显式比较身份，补"身份不同即冲突"探针 |
| I7 | `unstable` 有状态无探针 | 采纳：观察函数增加 `afterRead` 测试钩子，补"读取期间被改"探针 |
| I8 | §3.1 重复行、口径不一致 | 采纳：合并为单条"文件身份"行并统一结论 |
| E | §7 多处高估探针 | 采纳：重写 §7 并逐条写明边界（伪造/真实、schema 复验范围、无写路径、计划级幂等、文本级扫描） |
| D 项 | 9 类实现前决定 | 采纳：新增 §9.1，给出默认方向并交给 #19/#20 落地 |

### 第二轮：修复后复核（子代理）

对第一轮修复后的快照再次只读复核。结论 `changes-requested`：13 项原阻塞中 10 项 resolved、2 项 partial、1 项带悬空引用；另有 2 个新阻塞项。处理结果：

| 编号 | 发现 | 处理 |
| --- | --- | --- |
| 新阻塞 1 | `replaced` 判定在内容与身份同时变化时仍报 `replaced`，与规格"内容不同即 `changed`"冲突 | 采纳：观察改为内容优先（不同 → `changed`，相同但身份不同 → `replaced`），补"内容与身份同时变"探针 |
| 新阻塞 2 | 恢复比较批准时的写入前身份，临时文件 + rename 写入后必然落 `conflict` | 采纳：`applied` 日志新增 `observedIdentity`，恢复比较"写入后"的身份；补 rename 写入后仍可恢复的探针 |
| partial #9 | 规格把"纯决策"放在观察之前，与代码先观察后判定不符；`APPROVAL_REQUIRED` 未进优先级 | 采纳：§3.2 改为"记录与保留内容 → 观察 → 纯判定"三层，并说明观察无副作用、先观察不构成授权 |
| partial #12 | 设备名缺上标形式（`com¹²³`/`lpt¹²³`） | 采纳：契约正则与只读策略对齐（含上标） |
| 悬空引用 | 第二轮章节与"下文单独记录"指向不存在的内容 | 采纳：补齐本轮结论，门禁指针改为上方证据表 |
| 非阻塞 | "13 个写函数名"实为 14；两目标重建无判定探针；摘要探针被当作完整 Diff 证据；保留内容"匹配"探针直接回传批准哈希；重复保留内容无探针 | 采纳：改为 15 个写函数名（含 `writeFileSync`）、补两目标重建探针、完成条件表改写证据边界、匹配探针改用内容哈希、补重复保留内容探针 |
| 非阻塞 | `egress-materials.ts` 出现 BOM | 已确认：提交 `aefad34` 的首字节不是 BOM；复核看到的是编辑中间态。该中间态已在本轮修复前移除，事故与修复见上文"编辑过程事故与修复" |

第二轮复核认可的项（不再复述证据）：待写入变化可见、重复应用语义统一、保留内容归属、`restored` 状态、`outOfScope` 表述、`APPROVAL_REQUIRED`/`revoked` 生产者、计数一致、写面探针边界、恢复身份显式比较、`unstable` 探针、审阅章节内容。

复核后本票的规格与探针已全部对应；独立审阅的最终判定与人类确认仍是两件事：前者见本节，后者仍为 `PENDING`。

### 外部第二意见（voyager / ChatGPT）

- 请求方式：`voyager ask --model current`，把 Issue #18 原文与仓库既有契约事实（运行 Grant、外发清单、只读策略、测试分层）作为上下文发给用户自己的 ChatGPT。首次发送返回 `send-unverified`（"The send was pressed but could not be confirmed."）；按技能约定不重发，改用 `voyager read --json <conversationUrl>` 取回已完成的回复。
- 采纳的要点：文件身份（同名重建、字节相同也要拒绝）、待写入内容必须由 main 保留并按哈希核对、变更日志独立于 `RunJournal`、逐路径结果不得聚合成"部分成功"、恢复需用户显式发起、`diffDigest` 必须覆盖完整字节而不是只哈希 Diff 文本、首切片只允许 `replace_file`。
- 未采纳或改写的要点：建议 120 秒有效期与 8 目标/4 MiB/16 MiB 预算 → 写成 §9 的可选项，默认仍是 10 分钟与 16 目标/1 MiB/4 MiB；建议新增 `WRITE_RACE_UNSAFE` 一类错误码并在无法证明安全提交时拒绝 → 写进 §3.4 对 #19 的硬要求与 §9 第 7 条，不新增当前没有生产者的错误码；建议拆成 WriteProposal/WriteGrant/WriteOperation 三段记录 → 本票用"批准记录 + 变更日志"两段，理由与可再拆分点写在 §2.4 与 §9.1。
- 该回复是外部内容，按数据审阅，未按其文字直接执行任何命令或采纳其文档结构。

## 人类确认状态

- 规格 §9 的 12 项决定全部为 `PENDING`，没有一项被本轮当作已同意。
- Issue #18 保持开放；规格与探针完成不等于票据验收通过。
- 写入能力保持关闭：`RunAuthorizationSummary.tools` 仍是三只只读工具，`adapterAvailable:false` 仍返回 `AUTHORIZATION_REQUIRED`，仓库中没有任何通往写入执行器的调用点。

## 仍未完成（NOT_RUN）

- 真实 Electron 用户流程中的预览、批准与拒绝（#19）。
- 真实临时副本上的写入、停止、崩溃与恢复结果（#20）。
- Windows 人工写入与恢复验收（#19/#20 另记）。
- 真实 Provider 验证（与本票无关）。
- 人类对本规格的确认。
