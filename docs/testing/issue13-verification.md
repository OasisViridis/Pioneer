# Issue #13 验证记录：P2 只读 Harness 接入

核对日期：2026-10-24。来源：[Issue #13](https://github.com/OasisViridis/Pioneer/issues/13)。基线为 PR #15 运行合同 v1 及其 2026-10-24 停止语义修订（`stopping → stopped/failed(固定错误码)`，`unknown` 仅作崩溃/重启墓碑）。分支：`codex/issue13-readonly-harness`（自 `origin/main` `0410d5a`）。

## 交付范围

| 模块 | 内容 |
| --- | --- |
| 合同修订 | `pioneer-run.ts` 新增 `STOP_TIMEOUT`/`ADAPTER_DISCONNECTED` 失败码；`run.unknown` 收窄为仅 `host_restarted`；合同 §2/§3/§4 同步修订；PR#15 协议探针改为 force-end 语义 |
| main 运行层 | `run-manager.ts`（串行 admission、单次 grant、容量上限、事件 seq/环形缓冲/订阅 ACK、停止宽限与强制结束、120s 总时限）、`run-journal.ts`（userData 有界原子日志 + host_restarted 墓碑恢复）、`run-ipc.ts`（固定通道 + 可信 sender 校验） |
| 适配器 | `adapter-seam.ts`（main 私有 HarnessAdapter seam）、`controlled-adapter.ts`（JSON 脚本化受控模型，仅测试启动配置注入）、`pi-adapter.ts`（`@earendil-works/pi-agent-core` + `pi-ai` 精确 1.4.0，预置 provider 表，无凭证不启动） |
| 只读工具 | `read-only-tools.ts` 执行器：read_file 64 KiB、list_directory 200 项、search 深度 16/1000 文件/64 KiB 每文件/4 MiB/100 hits，前后身份复检，二进制/链接/敏感路径拒绝 |
| UI | `run-view.ts` + `RunPanel.tsx`：五种可见状态（运行中/正在停止/已停止/已完成/失败+错误码），停止按钮自身承担「停止中…」即时反馈；`shared/contracts/intent-workspace.ts` 合并 P1 结构与 PR#8 lifecycle 保护 |
| P1 整合 | 继承工作树 P1 资产窄范围并入本分支（会话工作台、会话持久化、窗口生命周期），按 [issue12 核对记录](issue12-input-reconciliation.md) 的兼容规则合并 |

## 验证证据

| 项 | 命令/位置 | 结果 |
| --- | --- | --- |
| Contract Tests（含新增 run-manager 13 项、工具执行器 8 项、受控适配器 6 项、修订探针） | `pnpm test:contract` | 339/339 通过（2026-10-24） |
| Real E2E（受控适配器注入、真实文件 IO、fixture 前后哈希、隔离 userData） | `pnpm test:e2e` | 24/24 通过（1.2m；含 p2-run 3 项：完成+工具结果、停止、停止后重启） |
| Pi 依赖固定 | `apps/desktop/package.json` `@earendil-works/pi-agent-core@1.4.0`、`@earendil-works/pi-ai@1.4.0`（精确版本） | webpack 打包成功（Pi 以 chunk 形式进入 main bundle） |
| A02 开发入口探针 | `PIONEER_PI_PROBE_OUT` | `{"ok":true,"stage":"release","piAiVersion":"1.4.0","nodeVersion":"v24.20.0"}`（`tmp/issue13/pi-probe-dev.json`） |
| A02 打包成品探针 | `electron-forge package` 产物 + 同一探针（脱离源码目录、asar 打包） | `{"ok":true,"stage":"release","piAiVersion":"1.4.0","nodeVersion":"v24.20.0"}`（`tmp/issue13/pi-probe-packaged.json`） |
| 打包成品完整性 | `app.asar` SHA-256 | `5de730882514e99ad6504356bbe3d245eccec4f0dd029b979ff14831dfda8b57`（33,897,641 字节） |
| A08 完整门禁（开发树） | `pnpm check` | 退出码 0（2026-10-24：格式/lint/类型、Contract 339/339、Prototype 210/210、Real E2E 24/24、package smoke；日志 `tmp/issue13/full-check-2.log`） |
| A08 干净检出复建 | 分支 `92824a4e738ae7095f40f14235cd3c10dbafc942` 的 detached worktree + `pnpm install --frozen-lockfile` + 完整 `pnpm check` | 退出码 0（2026-10-25；Contract 339/339、Prototype 210/210、E2E 24/24、打包冒烟；日志 `tmp/issue13/a08-clean-check.log`；本地专属未跟踪档案不参与构建） |
| 仓库规范化 | `pnpm verify:repository` | 6/6 通过 |

### 打包工具链修复记录（extract-zip）

`electron-forge package` 在本机 Node 24.17.0 下静默退出且不产出 `out/`，最小复现为 `extract-zip@2.0.1`（`yauzl@2.10.0` 的 `openReadStream` 回调在 Node 24 永不触发，`fs.open`/`fd-slicer` 单测均正常）。修复：pnpm `patchedDependencies` 将 win32 平台的 zip 解压委托给系统自带 bsdtar（`patches/extract-zip@2.0.1.patch`，可经 `PIONEER_BSDTAR_PATH` 覆盖路径；非 win32 平台显式报错提示移除补丁）。上游修复后应移除该补丁。

## A01—A09 状态

| 编号 | 状态 | 证据 |
| --- | --- | --- |
| A01 admission/容量/幂等/墓碑 | PASS（Contract） | `tests/contract/run-manager.test.ts`；墓碑恢复与 RUN_ACTIVE/REQUEST_CONFLICT/JOURNAL_UNAVAILABLE/STALE_REVISION 路径 |
| A02 Pi 加载/构造/释放 | 见运行记录 | 开发入口与打包成品探针；依赖精确 1.4.0 + 锁文件 |
| A03 事件顺序/订阅/分页 | PASS（Contract + E2E） | 事件序列、早到缓冲（started 前的适配器消息）、32 条分批、ACK 续推、gap 标记 |
| A04 停止/竞态/故障 | PASS（Contract + E2E） | 成功先于停止、停止先于成功、STOP_TIMEOUT 强制结束、RUN_DEADLINE、无活 unknown |
| A05 三工具真实 IO | PASS（Contract + E2E） | read_file/list_directory/search 真实临时目录与 fixture IO、预算/truncation、敏感/二进制/链接拒绝 |
| A06 文件不变量 | PASS（E2E） | fixture 前后哈希一致；E2E userData 隔离（PIONEER_E2E_ROOT/USER_DATA 不相交）；不读用户全局凭证 |
| A07 P1 整合 | PASS（Contract + E2E） | 313+ 合同测试含 P1 会话/持久化/意图流；E2E 覆盖会话恢复与意图修订；按需面板，不自动导航 |
| A08 门禁 | 见门禁记录 | `pnpm verify:repository`、完整 `pnpm check`、独立审阅 |
| A09 真实 Provider | **PASS**（开发入口） | 2026-10-25 用户授权后完成：DeepSeek `deepseek-flash` 两次真实运行——completed（含 4 次真实只读工具调用与拒绝恢复）+ stopped（运行中途停止）；fixture 前后哈希一致。完整固定字段见 [A09 记录](issue13-real-provider.md)。打包成品内的真实 Provider 运行因 E2E 隔离缝仅限非打包构建而未自动化，留作人工后续项 |

## A09 记录

**PASS（开发入口，2026-10-25）**：完整固定字段见 [A09 真实 Provider 运行记录](issue13-real-provider.md)。过程存档：首轮尝试 NOT_RUN——环境变量 `DEEPSEEK_API_KEY`（`****f04b`）被 `https://api.deepseek.com` 的 `/models`、`/chat/completions`、`/anthropic` 三端点一致拒绝（authentication_error）；用户随后在 ZCode 配置新 key（`****2a2d`，验证有效）。模型按用户 "v41f" 意图解析为官方目录中的 `deepseek-flash`（官方无 `deepseek-v4.1-flash`，该 id 仅存在于第三方网关目录，已在记录中注明）。

## 停止语义修订对照

| 场景 | 修订前（PR#15） | 修订后（本分支） |
| --- | --- | --- |
| 停止宽限 5s 到期 | `unknown(stop_timeout)` 活状态，保留占位继续等待 | 主进程强制结束，`failed(STOP_TIMEOUT)`，无活 unknown |
| 适配器通道断连 | `unknown(adapter_disconnected)` | 走停止路径；宽限内收敛 `stopped`，否则 `failed(ADAPTER_DISCONNECTED)` |
| 崩溃/重启恢复 | unknown 占位等待确认 | `run.unknown(host_restarted)` 墓碑：不占资源、不等待、不自动重跑 |
| 用户可见结果 | 含「结果未确认」活状态 | 仅五种：运行中/正在停止/已停止/已完成/失败（附固定错误码） |

## 评审修复记录（2026-10-26）

PR #16 经双轴代码审查（Standards / Spec，并做第三方复核）后补齐的运行层缺口。修复前基线 `395df15`，分支 `fix-pr16-review`（自 `codex/issue13-readonly-harness` 头）。修复分两轮提交：第一轮 `3bbb21b`（运行层）、`0196478`（Pi 输出预算）、`de0e0f1`（记录）；第二轮复审后 `8328bdc`（见下节）。

| 审查缺口 | 修复 |
| --- | --- |
| admission 不串行：`start()` 在 `await resolveProject` 之后才占位，并发可重复消费 grant、突破容量 | 项目解析移到准入段之前；授权消费、容量检查、run 预留全部在同步段完成；新增"同 grant 并发 start 只受理一个"的合同测试 |
| `STALE_REVISION` 只在 `authorize` 检查 | `start` 复核 `sessionLastRevision`，旧 grant 在修订推进后拒绝 |
| `quiescent` 恒为已完成（受控适配器构造期 resolve、Pi 适配器 `Promise.resolve()`） | 两者均改为构造期 deferred：仅在 `start()` 后、运行 promise 结算且无在途工具时 resolve，从不 reject；新增离线 Pi 假内核测试 |
| `RUN_LIMITS` 声明必须执行但未执行：`toolCalls`、工具并发、单事件 16 KiB | 工具调用预算（含拒绝）超限即停止；工具执行串行化（`toolConcurrency` 覆盖值改为构造期拒绝）；超 16 KiB 事件归一 `OUTPUT_LIMIT` |
| 停止时在途工具留下未配对 `tool.requested` | `terminate()` 先为在途 callId 补 `cancelled` 结果，再发终态 |
| 超长 chunk 记错码 | 超 4 KiB chunk 归一 `OUTPUT_LIMIT`；两个适配器按 UTF-8 字节边界切分 |
| `read_file` 整文件读入（大文件可撑爆主进程） | 改为句柄有界读（64 KiB+1），fstat 前后身份复检，非普通文件/硬链接拒绝 |
| list/search 只预检起始路径 | 新增 `recheckEntry`（lstat + realpath 包含性 + nlink）逐条复检；list 在 200 项外提前停止 |
| renderer 分页丢事件（游标取 `lastSeq`） | 游标改用 `nextAfterSeq` 并回填初始页；主进程 ACK 钳到已发布 seq |
| 二次重启丢 `host_restarted` 墓碑 | `restorePending` 返回所有未终止 accept，仅对未标记者追加 tombstone |
| 关窗/导航/渲染进程崩溃不停止运行 | 新增 `RunManager.abandonWindow`；导航、渲染进程崩溃、窗口关闭时换 epoch 并停止该窗口的运行 |
| `before-quit` 不等 shutdown | 退出前先等有界停止（宽限 +1s 上限）再退出 |
| GLOSSARY 与修订后停止语义冲突 | 术语改为「正常停止收敛后落终态；宽限到期强制结束记 `STOP_TIMEOUT`」 |
| `modelOutputTokens` 只在合同里声明 | 适配器把 `RUN_LIMITS.modelOutputTokens` 作为每次请求的 `maxTokens` 下发给 Pi `streamSimple`，SDK 默认值不得放宽预算 |

### 第二次复审修复（`8328bdc`，2026-10-26）

对第一轮修复再做双轴复审后补齐的缺口：

| 复审缺口 | 修复 |
| --- | --- |
| 同 requestId 并发时，重放检查在 `await` 之前，第二个请求会撞到已消费 grant | 准入同步段内重查 `requestIndex`：同载荷返回同一 runId，异载荷 `REQUEST_CONFLICT`；新增并发同 ID 测试 |
| `tool.unknown` 拒绝路径不判预算，可无限循环 | 该路径同样计入 32 次预算，到上限即 `TOOL_FAILED` 并停止，不再发布第 33 对事件 |
| 超过 16 KiB 的 wire event 记成 `PROTOCOL_ERROR` | 合同 §5 归 `OUTPUT_LIMIT` |
| ACK 钳到「最新已发布 seq」而非「已发给该订阅者的 seq」，超前 ACK 仍可跳过在途页 | 订阅者记录 `deliveredSeq`，ACK 钳到它 |
| 终态事件先投递、后落盘，写失败也像已收敛 | `terminate()` 进入时挂起投递，`appendTerminal` 完成后才释放；写失败仍释放（否则 UI 不收敛），此时 journal 已标记不可用、不再接受新运行 |
| `dispose` 只在 `shutdown` 调用 | 收敛路径 `finish()` 在终态后释放适配器；`disposeAdapter` 幂等 |
| `list_directory` 仍然先全量 `readdir` | 改用 `opendir` 流式枚举，超过 201 个候选即停止 |
| `splitTextChunks` 在两个适配器与两份测试里逐字重复 | 抽到 `harness/text-budget.ts`，四份副本合一 |
| `admissionCode` 被塞入停止被拒的 code（名不副实） | 重命名 `rejectionCode` / `rejectionText` |
| `EntryIdentity` 在 `sameIdentity` 改吃 `Stats` 后成了死类型 | 删除，直接用 `Stats` |
| GLOSSARY 把宽限期强制结束一律写成 `STOP_TIMEOUT`，与 §4「保留既定失败原因」冲突 | 术语改为「保留既定原因，无既定原因才 `STOP_TIMEOUT`」 |

### 门禁记录

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 完整门禁（第二轮） | `pnpm check`（先清除环境继承的 `ELECTRON_RUN_AS_NODE`），提交 `8328bdc` | 退出码 0（2026-10-26）：格式 / lint / 类型、Contract **363/363**（39 文件）、Prototype **210/210**、Real E2E **24/24**、package smoke |
| A08 干净检出（第二轮） | `8328bdc` 的 detached worktree + `pnpm install --frozen-lockfile` + `pnpm check` | 退出码 0（2026-10-26，独立于开发 worktree） |
| 完整门禁（第一轮） | `pnpm check`，提交 `de0e0f1` | 退出码 0（2026-10-26）：Contract **361/361**、Prototype **210/210**、Real E2E **24/24**、package smoke |
| 仓库规范化 | `pnpm verify:repository` | 6/6 |
| 定向套件（第二轮） | `vitest run` run-manager（21）/ controlled-adapter（12）/ pi-adapter-tools（2）/ read-only-tools-exec（13）/ run-view（2） | 全绿 |

**环境注意**：本机 DSH 会话会继承 `ELECTRON_RUN_AS_NODE=1`，此时 Electron 按 Node 解释并拒绝 `--remote-debugging-port`，E2E 全红；这不是代码回归，跑 E2E 或 `pnpm check` 前需清除该变量（CI 无此变量）。

### 仍未完成（不在本次修复范围）

- **外发材料清单（egress manifest）与授权撤销模型**：合同 §1/§4 要求按材料清单授权、材料变更即撤销，但"用户如何选定可外发材料"属产品决策，代码仍无执行者；A05/A06 的该子项不能算 PASS。
- **`ADAPTER_DISCONNECTED` 无生产者**：上表第 3 行的断连分支依赖适配器通道信号，当前两个适配器都没有该信号，仍属未实现。
- **`authorize` 仍信任 renderer 自报的会话与任务**：main 已有 P1 会话存储，但运行层还没有会话事实端口；修订只在本进程的 `sessionLastRevision` 内可见。补齐需要把会话存储接入 run host。
- **墓碑不带窗口归属**：`host_restarted` 记录只有 run 身份，无法校验「该窗口是否曾拥有它」，跨窗口读墓碑目前靠 session/project/revision 拒绝。
- **`modelOutputTokens` 是单次请求上限**：合同按「每 run」表述，多轮合计仍靠 `outputBytes` 兜底；需真实 Provider 多轮 usage 才能验证（A09 记录仍按合同记 null）。
- **停止时在途工具配对、16 KiB 事件丢弃、`abandonWindow`/epoch 切换没有自动化测试**：实现有，覆盖没有。
- **P1 资产仍与 P2 同 PR**（463 文件、+75,619 行）：拆分属人工决策。
