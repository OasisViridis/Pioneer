# Issue #13 验证记录：P2 只读 Harness 接入

核对日期：2026-10-27。来源：[Issue #13](https://github.com/OasisViridis/Pioneer/issues/13)。基线为 PR #15 运行合同 v1 及其 2026-10-24 停止语义修订（`stopping → stopped/failed(固定错误码)`，`unknown` 仅作崩溃/重启墓碑）。分支：`codex/issue13-remaining`（自 `origin/main` `c12a20a`）。

最后复核：2026-10-27，在 `main` `c12a20a` 的 `electron-forge package` 成品上完成真实 Provider 问答与中途停止，见[打包成品运行记录](issue13-packaged-run.md)。

## 交付范围

| 模块 | 内容 |
| --- | --- |
| 合同修订 | `pioneer-run.ts` 新增 `STOP_TIMEOUT`/`ADAPTER_DISCONNECTED` 失败码；`run.unknown` 收窄为仅 `host_restarted`；合同 §2/§3/§4 同步修订；PR#15 协议探针改为 force-end 语义 |
| main 运行层 | `run-manager.ts`（串行 admission、单次 grant、容量上限、事件 seq/环形缓冲/订阅 ACK、停止宽限与强制结束、120s 总时限、终态停止时间、在途工具迟到结果丢弃）、`run-journal.ts`（userData 有界原子日志 + host_restarted 墓碑恢复 + `stopRequestedAt`）、`run-ipc.ts`（固定通道 + 可信 sender 校验） |
| 适配器 | `adapter-seam.ts`（main 私有 HarnessAdapter seam，新增断连消息）、`controlled-adapter.ts`（JSON 脚本化受控模型，仅测试启动配置注入，新增断连步骤）、`pi-adapter.ts`（`@earendil-works/pi-agent-core` + `pi-ai` 精确 1.4.0，预置 provider 表，无凭证不启动；网络级错误发断连） |
| 只读工具 | `read-only-tools.ts` 执行器：read_file 64 KiB、list_directory 200 项、search 深度 16/1000 文件/64 KiB 每文件/4 MiB/100 hits，前后身份复检，二进制/链接/敏感路径拒绝 |
| 外发材料 | `egress-materials.ts` + `egress.ts`：授权时生成材料清单（相对路径、字节数、SHA-256），空清单不发正文；未列入清单返回 `MATERIAL_NOT_ALLOWED`，清单文件内容变化返回 `CONTENT_NOT_ALLOWED` 并撤销 grant、停止为 `AUTHORIZATION_REVOKED`；目录/搜索只覆盖清单 |
| 会话历史 | session state v6：每会话保存最多 20 条任务/结果记录（任务 8,000 字符、结果 16,384 字符），终态写入、重启恢复；v5 记录加载补空历史且不改写源文件 |
| UI | `run-view.ts` + `RunPanel.tsx`：五种可见状态（运行中/正在停止/已停止/已完成/失败+错误码），停止按钮自身承担「停止中…」即时反馈；材料勾选清单；历史运行区展示任务与结果 |
| P1 整合 | 继承工作树 P1 资产窄范围并入本分支（会话工作台、会话持久化、窗口生命周期），按 [issue12 核对记录](issue12-input-reconciliation.md) 的兼容规则合并 |

## 验证证据

| 项 | 命令/位置 | 结果 |
| --- | --- | --- |
| Contract Tests（含 run-manager 37 项、工具执行器 16 项、受控适配器 12 项、外发材料 3 项、会话/v6 迁移） | `pnpm test:contract` | 348/348 通过（36 文件，2026-10-27） |
| Real E2E（受控适配器注入、真实文件 IO、fixture 前后哈希、隔离 userData） | `pnpm test:e2e` | 27/27 通过（2026-10-27；p2-run 5 项：完成+工具结果、运行历史重启恢复、外发清单拒绝、停止、停止后重启） |
| Pi 依赖固定 | `apps/desktop/package.json` `@earendil-works/pi-agent-core@1.4.0`、`@earendil-works/pi-ai@1.4.0`（精确版本） | webpack 打包成功（Pi 以 chunk 形式进入 main bundle） |
| A02 开发入口探针 | `PIONEER_PI_PROBE_OUT` | `{"ok":true,"stage":"release","piAiVersion":"1.4.0","nodeVersion":"v24.20.0"}`（`tmp/issue13/pi-probe-dev.json`） |
| A02 打包成品探针 | `electron-forge package` 产物 + 同一探针（脱离源码目录、asar 打包） | `{"ok":true,"stage":"release","piAiVersion":"1.4.0","nodeVersion":"v24.20.0"}`（`tmp/issue13/pi-probe-packaged.json`） |
| 打包成品完整性 | `app.asar` SHA-256 | `5de730882514e99ad6504356bbe3d245eccec4f0dd029b979ff14831dfda8b57`（33,897,641 字节） |
| A08 完整门禁（开发树） | `pnpm check`（先清除环境继承的 `ELECTRON_RUN_AS_NODE`） | 退出码 0（2026-10-27）：格式/lint/类型、Contract 348/348（36 文件）、Prototype 210/210、Real E2E 27/27、package smoke；日志 `.scratch/issue13-remaining-full-check.log` |
| A08 干净检出复建 | 分支 `92824a4e738ae7095f40f14235cd3c10dbafc942` 的 detached worktree + `pnpm install --frozen-lockfile` + 完整 `pnpm check` | 退出码 0（2026-10-25；Contract 339/339、Prototype 210/210、E2E 24/24、打包冒烟；日志 `tmp/issue13/a08-clean-check.log`；本地专属未跟踪档案不参与构建） |
| 仓库规范化 | `pnpm verify:repository` | 6/6 通过 |

### 打包工具链修复记录（extract-zip）

`electron-forge package` 在本机 Node 24.17.0 下静默退出且不产出 `out/`，最小复现为 `extract-zip@2.0.1`（`yauzl@2.10.0` 的 `openReadStream` 回调在 Node 24 永不触发，`fs.open`/`fd-slicer` 单测均正常）。修复：pnpm `patchedDependencies` 将 win32 平台的 zip 解压委托给系统自带 bsdtar（`patches/extract-zip@2.0.1.patch`，可经 `PIONEER_BSDTAR_PATH` 覆盖路径；非 win32 平台显式报错提示移除补丁）。上游修复后应移除该补丁。

### 打包成品验收（2026-10-27）

在 `main` `c12a20a` 上执行 `pnpm --filter @pioneer/desktop build`，把 `apps/desktop/out/@pioneer-desktop-win32-x64` 整体复制到源码树之外的 `%TEMP%\pioneer-issue13-package`，用隔离 `userData` 启动并以 CDP 驱动真实界面。完整固定字段见[打包成品运行记录](issue13-packaged-run.md)。

| 项 | 结果 |
| --- | --- |
| `app.asar` | SHA-256 `5550f60af664c8d627cc780318316a85efc4d52ddbb11448fb322b4102bfe097`（33,884,214 字节） |
| Pi 成品探针 | `{"ok":true,"stage":"release","piAiVersion":"1.4.0","piAgentCoreVersion":null,"nodeVersion":"v24.20.0","error":null}`；探针对象与 `app.asar` hash 见 `tmp/issue13/a02-packaged-probe-context.json` |
| 真实 Provider 运行 1 | `completed`，4 次真实只读工具调用（含 `PATH_UNAVAILABLE` 拒绝后自行恢复），`lastSeq` 15 |
| 真实 Provider 运行 2 | `stopped`，按钮点击返回前主进程已收敛为 `stopped`，`lastSeq` 4 |
| 会话与日志 | `pioneer-session-state.json` 版本 5、2 个会话（`messages` 为空）；`runs/journal.jsonl` 2 条 accept + 2 条 terminal，accept 带 `sessionId`，terminal 按 `runId` 与 accept 配对，`adapter` 均为 `pi` |
| 文件不变量 | fixture 副本清单哈希 `1bceca98…46c5` 前后一致 |
| 渲染入口 | `%TEMP%\pioneer-issue13-package\resources\app.asar\.webpack\renderer\main_window\index.html`（未从源码目录加载） |

该记录覆盖 Issue #13 的打包成品部分：界面与运行程序接通（两轮真实运行），只读工具的路径与权限预检按 #12 执行（预算、截断、敏感/二进制拒绝由 Contract 覆盖，本次真实运行未触发），进度、工具结果、错误与停止反馈可见，模拟模型、真实模型与打包成品都有记录。journal 以 `runId` 关联 accept 与 terminal；只有 accept 带 `sessionId` 与 `taskDigest`，terminal 只有状态与 `lastSeq`，均不含任务原文与回答正文；`pioneer-session-state.json` 只持久化两个空会话。Issue #13「检查断连、重复启动、停止时收到结果等情况」中的断连分支与停止在途真实结果路径仍按文末边界记录为未实现/未自动化；原生目录选择器与安装器目标不在本次范围，边界见记录第 8 节。

## A01—A09 状态

| 编号 | 状态 | 证据 |
| --- | --- | --- |
| A01 admission/容量/幂等/墓碑 | PASS（Contract） | `tests/contract/run-manager.test.ts`；墓碑恢复与 RUN_ACTIVE/REQUEST_CONFLICT/JOURNAL_UNAVAILABLE/STALE_REVISION 路径 |
| A02 Pi 加载/构造/释放 | PASS（开发入口 + 打包成品） | 开发入口与打包成品探针；依赖精确 1.4.0 + 锁文件；2026-10-27 成品探针在 `c12a20a` 的成品副本上复跑通过（`tmp/issue13/a02-packaged-probe.json`，对象 hash 见 `tmp/issue13/a02-packaged-probe-context.json`） |
| A03 事件顺序/订阅/分页 | PASS（Contract + E2E） | 事件序列、早到缓冲（started 前的适配器消息）、32 条分批、ACK 续推、gap 标记 |
| A04 停止/竞态/故障 | PASS（Contract + E2E） | 成功先于停止、停止先于成功、STOP_TIMEOUT 强制结束、RUN_DEADLINE、无活 unknown；适配器断连强制结束 `ADAPTER_DISCONNECTED`；在途工具停止后迟到正文丢弃且只保留 cancelled 配对 |
| A05 三工具真实 IO | PASS（Contract + E2E read_file） | read_file/list_directory/search 真实临时目录与 fixture IO、预算/truncation、敏感/二进制/链接拒绝；外发材料清单（授权清单、未列出拒绝、内容变化撤销）Contract + p2-run E2E；E2E 只发起 read_file，search_in_files 仅 Contract 覆盖 |
| A06 文件不变量 | PASS（E2E） | fixture 前后哈希一致；E2E userData 隔离（PIONEER_E2E_ROOT/USER_DATA 不相交）；不读用户全局凭证 |
| A07 P1 整合 | PASS（Contract + E2E） | 344+ 合同测试含 P1 会话/持久化/意图流；E2E 覆盖会话恢复、意图修订与运行历史重启恢复；按需面板，不自动导航 |
| A08 门禁 | 见门禁记录 | `pnpm verify:repository`、完整 `pnpm check`、独立审阅 |
| A09 真实 Provider | **PASS**（开发入口 + 打包成品） | 2026-10-25 用户授权后完成：DeepSeek `deepseek-flash` 两次真实运行，completed（含 4 次真实只读工具调用与拒绝恢复）与 stopped（运行中途停止）；fixture 前后哈希一致。完整固定字段见 [A09 记录](issue13-real-provider.md)。2026-10-27 在成品副本上补测通过：completed（4 次真实只读工具调用）与 stopped，文件哈希不变；入口位于源码树外，工作区与 userData 位于仓库 `tmp/`，见[打包成品记录](issue13-packaged-run.md) |

## A09 记录

**PASS（开发入口，2026-10-25）**：本段只覆盖开发入口记录；打包成品补充见[打包成品运行记录](issue13-packaged-run.md)。完整固定字段见 [A09 真实 Provider 运行记录](issue13-real-provider.md)。过程存档：首轮尝试 NOT_RUN：环境变量 `DEEPSEEK_API_KEY`（`****f04b`）被 `https://api.deepseek.com` 的 `/models`、`/chat/completions`、`/anthropic` 三端点一致拒绝（authentication_error）；用户随后在 ZCode 配置新 key（`****2a2d`，验证有效）。模型按用户 "v41f" 意图解析为官方目录中的 `deepseek-flash`（官方无 `deepseek-v4.1-flash`，该 id 仅存在于第三方网关目录，已在记录中注明）。

## 停止语义修订对照

| 场景 | 修订前（PR#15） | 修订后（本分支） |
| --- | --- | --- |
| 停止宽限 5s 到期 | `unknown(stop_timeout)` 活状态，保留占位继续等待 | 主进程强制结束，`failed(STOP_TIMEOUT)`，无活 unknown |
| 适配器通道断连 | `unknown(adapter_disconnected)` | 走停止路径；宽限内收敛 `stopped`，否则 `failed(ADAPTER_DISCONNECTED)` |
| 崩溃/重启恢复 | unknown 占位等待确认 | `run.unknown(host_restarted)` 墓碑：不占资源、不等待、不自动重跑 |
| 用户可见结果 | 含「结果未确认」活状态 | 仅五种：运行中/正在停止/已停止/已完成/失败（附固定错误码） |

## 评审修复记录（2026-10-26）

PR #16 经双轴代码审查（Standards / Spec，并做第三方复核）后补齐的运行层缺口。修复前基线 `395df15`，分支 `fix-pr16-review`（自 `codex/issue13-readonly-harness` 头）。修复按复审轮次提交：第一轮 `3bbb21b` + `0196478` + `de0e0f1`；第二轮 `8328bdc` + `cfff311`；第三轮 `97594a2` + `08665fb`；第四轮 `8ecb5ef` + `69884bb`；第五轮 `a6ff9e5` + `956a55f` + `fcebcb2`；第六轮 `321d82e` + `96955f5`；第七轮 `0bfd5de`。每轮的门禁与证据见下。

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
| renderer 分页丢事件（游标取 `lastSeq`） | 游标改用 `nextAfterSeq` 并回填初始页；主进程 ACK 钳到已投递给该订阅者的 seq（`deliveredSeq`） |
| 二次重启丢 `host_restarted` 墓碑 | `restorePending` 返回所有未终止 accept，仅对未标记者追加 tombstone |
| 关窗/导航/渲染进程崩溃不停止运行 | 新增 `RunManager.abandonWindow`；导航、渲染进程崩溃、窗口关闭时换 epoch 并停止该窗口的运行 |
| `before-quit` 不等 shutdown | 退出前先等有界停止（宽限 +1s 上限）再退出 |
| GLOSSARY 与修订后停止语义冲突 | 术语改为「正常停止收敛后落终态；宽限到期强制结束保留既定失败原因，无既定原因才记 `STOP_TIMEOUT`」 |
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
| `list_directory` 仍然先全量 `readdir` | 改用 `opendir` 流式枚举：通过复检的条目达到 201 即停止（被过滤的条目不计数） |
| `splitTextChunks` 在两个适配器里逐字重复 | 抽到 `harness/text-budget.ts`，两份副本合一；测试只保留各自的字节计量辅助 |
| `admissionCode` 被塞入停止被拒的 code（名不副实） | 重命名 `rejectionCode` / `rejectionText` |
| `EntryIdentity` 在 `sameIdentity` 改吃 `Stats` 后成了死类型 | 删除，直接用 `Stats` |
| GLOSSARY 把宽限期强制结束一律写成 `STOP_TIMEOUT`，与 §4「保留既定失败原因」冲突 | 术语改为「保留既定原因，无既定原因才 `STOP_TIMEOUT`」 |

### 第三次复审修复（`97594a2`，2026-10-26）

对第二轮修复再做复审后补的边界：

| 复审缺口 | 修复 |
| --- | --- |
| 预算/协议越限会覆盖已确定的停止原因（`RUN_DEADLINE` 被改成 `OUTPUT_LIMIT`） | 统一走 `failWith`：`pendingFailure ??= code`，第一个原因胜出（§4） |
| `publishHeld` 只在 await 之后释放，`appendTerminal` 抛错会让终态投递与槽位永久挂起 | 释放移入 `try/finally`，抛错也投递；槽位释放与适配器释放在第四轮补齐（见下节） |
| `forceEnd` 从不尝试释放适配器 | 强制结束后 best-effort `disposeAdapter`（§2/§4）；`disposeAdapter` 幂等 |
| 重放竞态在 `appendAccept` 落盘前就返回 `ok`，写失败会泄露幽灵 runId | `replay()` 等胜者的 admission 结果：成功才回同一 runId，写失败回 `JOURNAL_UNAVAILABLE`；内存淘汰的载荷回 `AUTHORIZATION_REQUIRED` |
| `tool.unknown` 与执行器各写一份预算停止逻辑 | 抽 `exhaustToolBudget`，两条路径一致 |
| `splitTextChunks` 的 `maxBytes` 默认值无人使用 | 常量 `TEXT_CHUNK_BYTES` 单一来源，参数删除 |

新增/改写测试：截止时间 vs 越限的原因优先级、强制结束后的 dispose、终态落盘先于投递、幽灵 runId 重放、`REQUEST_CONFLICT` 分支、ACK 钳到已投递游标（改写）、`list_directory` 200/201 边界。

### 第四次复审修复（`8ecb5ef`，2026-10-26）

对第三轮修复再做复审后补的收尾：

| 复审缺口 | 修复 |
| --- | --- |
| `appendTerminal` 抛错时跳过 `finishedPayloads`/`releaseSlot`，文档「抛错也收敛」不成立 | 终态记录放入 `try/catch`，槽位释放移进 `finally`；写失败保留 run 的真实结果，journal 自标不可用、下一次授权直接 `JOURNAL_UNAVAILABLE` |
| `terminateConverged` 在 `terminate` 抛错时跳过 `disposeAdapter` | 释放移入 `finally`；`disposeAdapter` 幂等 |
| `forceEnd` 的 `.finally()` 可能产生未处理拒绝 | 先 `.catch` 再 `.finally` |
| 重放窗口：`emit(run.accepted)` 早于 admission promise，抛错会留下无 promise 的占位 | admission promise 在首个事件之前创建 |
| 用户停止后到达的越限文本仍会把 `stopped` 升级成 `failed(OUTPUT_LIMIT)` | `failWith` 在 `stopRequestedAt !== null` 时不再改原因（既定原因与用户停止都保留） |
| 订阅者游标超过 `lastSeq` 时永远收不到新事件 | `subscribe` 把游标钳到当前最新 seq |
| `TEXT_CHUNK_BYTES` 无引用，工具投影仍从 `RUN_LIMITS` 另取一份 | 工具投影改用 `TEXT_CHUNK_BYTES`，单一来源 |

新增测试：终态写失败后的收敛与释放、用户停止不被越限升级、过期游标仍能收到后续事件、202 项目录仍按预算截断。`run-manager` 定向套件 29 项。

### 第五次复审修复（`a6ff9e5` 代码 + `956a55f` 清理，2026-10-26）

对第四轮修复再做复审后补的收尾（`a6ff9e5` 为 ACK/重放/游标修复，`956a55f` 为发送异常隔离、命名与释放路径清理）：

| 复审缺口 | 修复 | 提交 |
| --- | --- | --- |
| 旧/重复 ACK 也会清除 `awaitingBatch`，可能同时存在两批未确认 | 只有 `afterSeq >= deliveredSeq` 的 ACK 才释放下一批（§5「只允许一批未确认」） | `a6ff9e5` |
| journal 转为不健康后，已被接受的 requestId 重放被 `JOURNAL_UNAVAILABLE` 挡掉 | `start` 先做 replay 再检查 journal 可用性；只有真正的新请求被拒 | `a6ff9e5` |
| 空 run 的过期游标会原样回显 | 钳到 0，后续事件仍能送达 | `a6ff9e5` |
| `terminate` 的 `finally` 里 `sender.send` 抛错会跳过槽位释放，`driveRun` 还会产生未处理拒绝 | 投递加 `try/catch`，槽位释放仍在 `finally`；`driveRun` 的分离 promise 补 `catch` | `956a55f` |
| `shutdown` 自成一套 `terminate`+`dispose`，`terminate` 抛错照样跳过释放 | 复用 `terminateAndRelease` | `956a55f` |
| `terminateConverged` 是 GLOSSARY「收敛/Quiescent」之外的第三种拼法 | 改名 `terminateAndRelease`，描述它真正的额外职责（释放） | `956a55f` |
| `exhaustToolBudget` 只是一行转发 | 删除，两条预算路径直接 `failWith(run, 'TOOL_FAILED')` | `956a55f` |

新增测试：旧 ACK 不释放下一批；journal 失效后仍能重放已接受请求（先让一次 accept 写失败把 journal 转不健康，再重放）。`run-manager` 定向套件 31 项。

### 第六次复审修复（`321d82e`，2026-10-26）

| 复审缺口 | 修复 |
| --- | --- |
| 上一轮的重放测试在修复前后都通过（`broken` 只影响 `store.save`，journal 仍健康），证据过度声称 | 测试改为先让一次真实的 accept 写入失败翻转 journal 健康位，再重放已接受请求；修复前会返回 `JOURNAL_UNAVAILABLE` |
| `forceEnd` 仍手写 `terminate`+`dispose`，是最后一条重复释放路径 | 复用 `terminateAndRelease` |
| 正常 flush 定时器里的 `sender.send` 抛错无人接住，会整进程崩 | `deliverBatches` 对每个订阅者 `try/catch`，抛错即丢弃该订阅者 |
| 三处测试各自手写 journal store 的 `save` 覆盖 | 抽 `hookedStore` 辅助函数 |

`run-manager` 定向套件 31 项（其中重放用例现在具备区分力）。

### 第七次复审补正（`0bfd5de`，2026-10-26）

| 复审缺口 | 修复 |
| --- | --- |
| 第五轮把「发送异常隔离」记到了 `a6ff9e5`，实际落在 `956a55f` | 修正行归属；第五轮标题与说明同步改准确 |
| `terminate` 的投递外层 `catch` 与 `deliverBatches` 内层隔离重复，注释还声称「sender 抛错会跳过释放」 | 外层改为 `try/finally`，只保证 `releaseSlot` 必然执行；注释改为实际职责 |
| 订阅者发送抛错后的丢弃分支没有测试 | 新增用例：发送必抛错 → 订阅者被丢弃、flush 定时器不崩、run 仍到达终态 |
| 轮次列表漏了第六轮的文档提交 `96955f5` | 补入轮次列表 |

`run-manager` 定向套件 32 项。

### 门禁记录

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 完整门禁（验收复核） | `pnpm check`（先清除环境继承的 `ELECTRON_RUN_AS_NODE`），提交 `c12a20a` | 命令返回 0（2026-10-27）：格式 / lint / 类型、Contract **335/335**（35 文件）、Prototype **210/210**、Real E2E **25/25**、package smoke；日志 `tmp/issue13/check.log`。Contract 数量较 `0bfd5de` 的 375 下降，源于 PR #50 删除意图契约与运行时快照测试，不是本 PR 删除测试 |
| 干净检出（验收复核） | worktree 自 `origin/main` `c12a20a` 新建 + `pnpm install --frozen-lockfile` + `pnpm --filter @pioneer/desktop build` + `pnpm check` | 退出码 0（2026-10-27；本记录所在 worktree，未复用主工作区依赖） |
| CI 门禁（PR #52） | GitHub Actions `Pioneer Quality Gate`，运行 40449457336（`a7e958d`）、40450369422（`06cb6e9`）与 40452608757（`f43150f`） | SUCCESS；含 `pnpm verify:repository`、`design:check` 与完整 `pnpm check` |
| 打包成品验收 | 同一 `c12a20a` 的 `electron-forge package` 成品复制到源码树外 + 真实 Provider 两轮运行 | completed + stopped，`lastSeq` 15/4，journal 2 accept + 2 terminal，fixture 哈希前后一致；见[打包成品运行记录](issue13-packaged-run.md) |
| 完整门禁（第七轮） | `pnpm check`（先清除环境继承的 `ELECTRON_RUN_AS_NODE`），提交 `0bfd5de` | 退出码 0（2026-10-26）：格式 / lint / 类型、Contract **375/375**（39 文件）、Prototype **210/210**、Real E2E **24/24**、package smoke |
| A08 干净检出（第七轮） | `0bfd5de` 的 detached worktree + `pnpm install --frozen-lockfile` + `pnpm check` | 退出码 0（2026-10-26，独立于开发 worktree） |
| 定向套件（第七轮） | `vitest run` run-manager（32）/ controlled-adapter（12）/ pi-adapter-tools（2）/ read-only-tools-exec（14）/ run-view（2） | 全绿 |
| 完整门禁（第六轮） | `pnpm check`，提交 `321d82e` | 退出码 0（2026-10-26）：Contract **374/374**（39 文件）、Prototype **210/210**、Real E2E **24/24**、package smoke |
| A08 干净检出（第六轮） | `321d82e` 的 detached worktree + `pnpm install --frozen-lockfile` + `pnpm check` | 退出码 0（2026-10-26，独立于开发 worktree） |
| 完整门禁（第五轮） | `pnpm check`，提交 `956a55f` | 退出码 0（2026-10-26）：Contract **374/374**、Prototype **210/210**、Real E2E **24/24**、package smoke |
| A08 干净检出（第五轮） | `956a55f` 的 detached worktree + `pnpm install --frozen-lockfile` + `pnpm check` | 退出码 0（2026-10-26） |
| 完整门禁（第四轮） | `pnpm check`，提交 `8ecb5ef` | 退出码 0（2026-10-26）：Contract **372/372**、Prototype **210/210**、Real E2E **24/24**、package smoke |
| A08 干净检出（第四轮） | `8ecb5ef` 的 detached worktree + `pnpm install --frozen-lockfile` + `pnpm check` | 退出码 0（2026-10-26） |
| 完整门禁（第三轮） | `pnpm check`，提交 `97594a2` | 退出码 0（2026-10-26）：Contract **369/369**、Prototype **210/210**、Real E2E **24/24**、package smoke |
| A08 干净检出（第三轮） | `97594a2` 的 detached worktree + `pnpm install --frozen-lockfile` + `pnpm check` | 退出码 0（2026-10-26） |
| 完整门禁（第二轮） | `pnpm check`，提交 `8328bdc` | 退出码 0（2026-10-26）：Contract **363/363**、Prototype **210/210**、Real E2E **24/24**、package smoke |
| A08 干净检出（第二轮） | `8328bdc` 的 detached worktree + `pnpm install --frozen-lockfile` + `pnpm check` | 退出码 0（2026-10-26） |
| 完整门禁（第一轮） | `pnpm check`，提交 `de0e0f1` | 退出码 0（2026-10-26）：Contract **361/361**、Prototype **210/210**、Real E2E **24/24**、package smoke |
| 仓库规范化 | `pnpm verify:repository`（2026-10-27 文档改动后复跑） | 6/6，日志 `tmp/issue13/verify-repository.log` |
| 定向套件（第五轮） | `vitest run` run-manager（31）/ controlled-adapter（12）/ pi-adapter-tools（2）/ read-only-tools-exec（14）/ run-view（2） | 全绿 |

**环境注意**：本机 DSH 会话会继承 `ELECTRON_RUN_AS_NODE=1`，此时 Electron 按 Node 解释并拒绝 `--remote-debugging-port`，E2E 全红；这不是代码回归，跑 E2E 或 `pnpm check` 前需清除该变量（CI 无此变量）。

**合并后补正（2026-10-26，`474fb16`）**：PR #16 合并进 `main` 后的 `Pioneer Quality Gate` 失败，唯一失败项是 `read-only-tools-exec` 的 200/201 目录边界用例——它在 Windows CI 上把 200 个文件逐个写、再对 200 条目各做一次 `realpath`/`lstat`，单个用例超过 vitest 默认 5s。修复：文件并行创建、去掉重复的 202 项列表、该用例超时放宽到 30s（本机 0.3s）。这是测试预算问题，不是运行层回归。

### 仍未完成（不在本次修复范围）

- **`authorize` 仍信任 renderer 自报的会话与任务**：main 已有 P1 会话存储，但运行层还没有会话事实端口；修订只在本进程的 `sessionLastRevision` 内可见。补齐需要把会话存储接入 run host。
- **墓碑不带窗口归属**：`host_restarted` 记录只有 run 身份，无法校验「该窗口是否曾拥有它」，跨窗口读墓碑目前靠 session/project/revision 拒绝。
- **`modelOutputTokens` 是单次请求上限**：合同按「每 run」表述，多轮合计仍靠 `outputBytes` 兜底；需真实 Provider 多轮 usage 才能验证（A09 记录仍按合同记 null）。
- **仍缺自动化覆盖**：16 KiB 事件丢弃、`abandonWindow`/epoch 切换与渲染进程崩溃恢复。实现有，但只有间接证据。
- **大目录的过滤成本无上限**：`list_directory` 的流式提前停止只计「通过复检」的条目；一个塞满敏感名的目录仍会被完整枚举（`opendir` 逐项但无上限），只是不发布。
- **打包真实 Provider 记录早于本次改动**：PR #52 的成品记录来自 `24df6fc`，早于会话历史、外发清单与断连生产者；A02 的打包加载结论仍适用，本次 `pnpm check` 的 package smoke 只证明新 asar 可构建与启动，成品 UI 新行为未重录。
- **P1 资产仍与 P2 同 PR**（463 文件、+75,619 行）：拆分属人工决策。
- **打包成品验收的覆盖边界**：本次只运行 `electron-forge package` 目录成品，仓库没有 `make`／安装器目标；原生目录选择器按 [M2 人工记录](m2-native-picker-smoke.md) 验收，未在打包成品中自动化（本次以预置 `pioneer-settings.json` 加载工作区）。
- **打包运行没有主进程侧停止请求时间**：记录的是脚本按钮点击返回时间，晚于 journal terminal；合同 §6 的该字段没有独立采样。
- **任务原文与回答正文不持久化**：journal 只有 `taskDigest` 与终态，`pioneer-session-state.json` 的两个会话 `messages` 为空；第 1 项只能按运行层解释为「会话各自持有 run 身份与终态」。若要求正文持久化，当前实现不满足。
- **「正在停止」过渡未在打包运行中观察到**：run 2 停止发生得很快；等待收敛的顺序由 E2E `p2-run` 的受控等待用例覆盖。
