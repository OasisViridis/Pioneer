# P4 写入授权与恢复规则（Issue #18）

来源：[Issue #18](https://github.com/OasisViridis/Pioneer/issues/18)，属于[主地图 #9](https://github.com/OasisViridis/Pioneer/issues/9)。前置 [#13](https://github.com/OasisViridis/Pioneer/issues/13) 已于 2026-10-27 随 PR #52、PR #54 关闭，只读链在 `main` 可用。本票交付决策、威胁范围、状态与错误呈现和负向探针，**不开放任何写入能力**；基线为 `origin/main` `b93d8e9`。

本票对应长期规格的用户故事 6、19—27，范围由[长期规格](2026-10-24-pioneer-long-term-development-spec.md) §5 与 #19、#20 两张实施票界定。写入执行、预览界面和恢复执行分别属于 #19、#20；本票只回答它们必须先遵守的规则。

## 本次决策与交付范围

- 交付本规格、[写入批准契约](../../apps/desktop/src/shared/contracts/write-approval.ts)、[目标观察](../../apps/desktop/src/main/write-approval/observe-targets.ts)、[纯决策函数](../../apps/desktop/src/main/write-approval/decision.ts)、共享的[有界稳定读取](../../apps/desktop/src/main/harness/bounded-read.ts)与[探针测试](../../tests/contract/write-approval.test.ts)。
- 源码只做两件事：用只读句柄核对目标字节与文件身份，和对手里的记录做纯函数判定。它们不写、不删、不改名、不回滚任何文件，未接 IPC、preload、renderer 或 Run 管理器，`RunAuthorizationSummary` 与 `RUN_IPC_CHANNELS` 均未新增字段或通道。
- 有界稳定读取从 `egress-materials.ts` 的私有实现提取为共享模块，外发清单与写入观察共用同一段读取与稳定性检查，避免两条安全路径漂移；外发侧的错误码映射保持不变。
- 仍然关闭：用户项目文件写入、删除、改名、回滚、shell、命令执行、通用文件系统 IPC。仓库现有写入点只有 `userData` 目录下的设置、会话状态与运行日志，外加按环境变量写出的测试探针报告（[`run-host.ts`](../../apps/desktop/src/main/run-host.ts)、[`settings-store.ts`](../../apps/desktop/src/main/settings-store.ts)、[`session-state-store.ts`](../../apps/desktop/src/main/session-state-store.ts)、[`index.ts`](../../apps/desktop/src/main/index.ts)）。
- 不修改 #13、#19、#20 的正文、状态或实现，不授予数据外发、合并、发布、分发或关闭其他票据的权限。

## 1. 四类许可的授权关系

| 许可 | 授权做什么 | 谁签发 | 有效范围 | 典型允许 | 明确拒绝 |
| --- | --- | --- | --- | --- | --- |
| 只读（Read） | main 用只读工具读取项目内文件 | main 预检 + 会话绑定项目根 | 单个项目根，当前 Run 的三只只读工具 | 读取普通单链接文本文件、列目录、字面量搜索 | 绝对路径、`..`、链接、隐藏或凭证类文件、项目外路径、非普通文件 |
| 外发（Egress） | 把精确字节发送给模型 | 用户显式材料清单（随 Grant 签发） | 单 Run、清单内 `path + bytes + sha256` | 清单内且哈希未变的文件进入模型上下文 | 未列入清单、哈希变化、超出材料预算、二进制或截断内容 |
| 写入（Write） | 对已审阅 Diff 的目标应用一次变更 | 用户在审阅界面确认写入批准 | 单 Run、单会话修订号、目标集合、写入前后哈希、有效期 | 目标全部未变时整体应用一份已审阅 Diff | 只读许可、意图确认、旧批准、目标变化、超出目标集合、过期 |
| 发布（Publish） | 对外产出、部署或发布某个版本 | 人类按具体版本与环境单次授权 | 具体版本、具体环境 | 在获准环境发布指定版本 | 用写入许可代替发布、用历史授权代替当次授权 |

四条不可推导规则：

1. 只读许可不能授权写入。读取是模型看材料，写入会改变用户磁盘；两者的批准对象、失败后果和撤销方式都不同。
2. 写入许可不能授权外发。内容写入本地项目不经过模型传输；反过来，外发清单只说明能发给模型什么，不说明能改什么（[`egress.ts`](../../apps/desktop/src/shared/contracts/egress.ts) 已经写死「Reading a file is not permission to send it」）。
3. 写入许可不能授权发布。发布的对象是版本与环境，不是文件字节；发布必须单独点名版本和目标环境。
4. 意图确认（READY）、标签、历史批准、历史测试结果都不能推导任何一类许可。

命名上必须区分两个真实对象：

- **Grant（运行授权）**：`RunManager.authorize` 签发，绑定任务文本摘要、外发材料清单、`webContentsId`/`windowEpoch` 与 5 分钟有效期（`RUN_LIMITS.grantMs = 300_000`），用来启动一次 Run。
- **写入批准（Write Approval）**：用户审阅 Diff 后由 main 记录，绑定 Run 身份、会话修订号、项目相对目标、写入前后哈希、文件身份与 10 分钟有效期，用来应用一次已审阅变更。

两者都由 main 生成、都一次性使用、都可撤销，但记录、拒绝码和有效范围不同。规格与代码不得把运行 Grant 当作写入批准，也不得用 `grantId` 存写入批准。

## 2. 写入批准（Write Approval）

### 2.1 字段与来源

| 字段 | 谁产生 | 用户核对什么 | 禁止来源 |
| --- | --- | --- | --- |
| `approvalId` | main | 这次批准是哪一条 | renderer 自报、模型输出 |
| `operation` | main | 只允许 `replace_file`（替换已有文件的完整内容） | 创建、删除、改名、改权限 |
| `sessionId` / `projectId` / `runId` / `revision` | main（取自 Run 身份） | 这份 Diff 属于哪个 Run 的哪次修订 | renderer 或模型指定的 Run |
| `targets[].path` | main（预览时已解析） | 项目相对路径，逐条列出 | 绝对路径、项目外路径、模型给的路径 |
| `targets[].before` | main（预览时读取并哈希） | 审阅当时文件的字节数与 SHA-256 | renderer 上传的哈希 |
| `targets[].after` | main（由预览内容计算） | 将要写入的确切字节数与 SHA-256 | 模型或 renderer 声明的"结果" |
| `targets[].identity` | main（预览时从文件系统取得） | 只显示"已记录/不可用"，用于发现同名重建 | 调用方伪造的文件身份 |
| `diffDigest` | main | 用户看到的 Diff 与批准的是同一份 | renderer 提交的摘要 |
| `createdAt` / `expiresAt` | main | 现在还能不能用 | 调用方给的时间 |
| `webContentsId` / `windowEpoch` | main（取自发送者绑定） | 不展示；用于拒绝其他窗口 | renderer 自报 |
| `consumed` / `appliedAt` | main | 不展示；main 用它拒绝重复应用并记录完成时间 | 调用方的布尔值 |
| `revoked` / `revocationReason` | main | 不展示具体原因；拒绝码告知"已撤销" | 调用方的布尔值 |

字段上限（`WRITE_APPROVAL_LIMITS`）：单次 16 个目标、单文件前后各 1 MiB、整份批准写入侧合计 4 MiB、路径 1,024 字符与 32 个组件、有效期 10 分钟。超限直接拒绝，不做静默截断；有效期超过 10 分钟的记录在契约层就不合法。

renderer 只能看到序列化的 `WriteApprovalSummary`：批准编号、操作类型、Run 身份、相对路径、写入前后哈希、文件身份、Diff 摘要、创建时间与有效期。摘要不含 `webContentsId`、`windowEpoch`、绝对路径、项目根和"已应用"结论。

### 2.2 生命周期：一次性、过期、撤销与拒绝

- 写入阶段开始前，main 先把批准标记为 `consumed`；完成后记 `appliedAt`。`appliedAt` 非空而 `consumed` 为假的记录在契约层不合法。
- 重复应用返回 `APPROVAL_CONSUMED`。本票不提供"返回上次结果"的语义：那要求一份按批准保存的执行结果记录，属于 #19 的实现内容；在此之前，唯一诚实的答案是"已经用过，重新审阅"。
- 批准在 `expiresAt` 之后返回 `APPROVAL_EXPIRED`；`expiresAt <= createdAt` 或超过 10 分钟窗口的记录不合法。
- 撤销由 main 触发：用户取消审阅、关闭窗口或窗口代次变化、会话出现更新修订号、陈旧目标拒绝之后。`revoked` 为真时 `revocationReason` 必须非空，取值 `user`、`window_closed`、`new_revision`、`stale_target`；`revoked` 为假时原因必须为空。
- 被拒绝的批准不是"还可以再试"：拒绝后 main 撤销它（`stale_target`），保留原因供追溯，用户必须重新读取目标、重新生成 Diff、重新审阅。
- 窗口绑定（`webContentsId`、`windowEpoch`）不符返回 `APPROVAL_BINDING_MISMATCH`，且不透露记录状态。

### 2.3 用户核对界面必须显示与不得显示

必须显示：

1. Run 身份（会话与修订号）与操作类型（`replace_file`）；
2. 每个目标的项目相对路径、写入前字节数与哈希前 8 位、写入后字节数与哈希前 8 位；
3. 每个目标的完整 Diff 文本（可展开，不允许只显示摘要或截断内容）；
4. 每个目标的文件身份是否记录（"已记录"或"不可用"），不显示具体编号；
5. Diff 摘要前 8 位、批准有效期、目标总数；
6. "将整体应用，任一目标变化都会整体拒绝"。

不得显示或不得据此授权：绝对路径、项目根、`webContentsId` 等内部绑定字段、模型自述的"已完成"、上一次批准的成功标记。界面不得把"确认写入"做成默认焦点按钮，也不得在拒绝或过期后仍显示可点击的应用动作。

### 2.4 允许的操作类型与内容保留

首个切片只允许 `replace_file`：把已有普通文件的完整内容替换为 `after` 的字节。不创建新文件、不删除、不改名、不改权限位、不产生批准清单以外的文件。二进制内容、无法完整解码的文本、超过字节预算或预览被截断的目标都不能进入批准流程；预览看不清的内容不能被批准。契约不单独存编码字段：批准生成前由 main 验证候选内容是合法 UTF-8，二进制候选在生成批准前就被拒绝，因此任何已存在的批准都隐含 UTF-8 文本。

`after` 的候选内容可以来自模型输出或用户输入，但字节数、SHA-256 与 `diffDigest` 一律由 main 计算。**待写入的完整内容由 main 的批准存储保留**（不进入摘要、不写项目磁盘、不按路径散落）：应用前 `checkRetainedPostImages` 要求每个目标恰好一条保留记录，缺失返回 `APPROVAL_REQUIRED`，哈希不符返回 `APPROVAL_DIGEST_MISMATCH`，多余或重复返回 `APPROVAL_TARGET_MISMATCH`。保留内容的存放位置、容量与失效由 #19 实现，但"必须先证明内容仍是审阅过的那一份"是本票的硬规则。

### 2.5 diffDigest 的规范编码

`diffDigest = SHA-256(UTF-8(JSON.stringify({ version: 1, operation, targets, diff })))`。其中 `targets` 按批准顺序排列，每项含 `path`、`before.bytes`、`before.sha256`、`after.bytes`、`after.sha256`、`identity`；`diff` 是用户实际看到的规范化 Diff 文本（`\n` 换行、无尾随空白、与渲染内容逐字一致）。`JSON.stringify` 使用默认紧凑格式，不排序键。这样改任何一个目标、任何一个字节、任何一个身份或 Diff 文本都会改变摘要；两份实现按同一规则才能得出同一摘要，避免"看起来一样"的假一致。

## 3. 落盘前目标核验（陈旧批准拦截）

### 3.1 文件身份用什么、为什么

| 身份 | 用途 | 已知误判与代价 | 是否权威 |
| --- | --- | --- | --- |
| 内容 `bytes + sha256` | 判定"用户审阅的字节是否还在"，批准的必要条件 | 需要完整读取一次，受单文件 1 MiB 预算限制；同字节重建无法仅靠内容发现 | 是 |
| 文件身份 `fileId + birthtimeMs` | 发现"删除后同名重建、内容恰好相同"，避免把别人的新文件当旧文件写 | 部分文件系统不报告文件索引或创建时间；索引可能被复用；Node 以双精度数返回文件索引，极端卷号下不同文件可能取整到同一值 | 是（可用时）；不可用时批准显式记 `null` |
| `size` | 快速初筛；与哈希同时比较 | 同尺寸替换会被哈希抓到 | 仅辅助 |
| `mtimeMs` | 检测读取期间文件是否被替换（稳定性） | 时间戳可被改回、精度有限（FAT 2 秒），碰撞不能证明未变 | 否，只用在同一句柄读取前后的一致性检查 |
| `nlink` | 拒绝多链接文件 | 硬链接可能来自同权限进程 | 是（与只读策略一致，直接拒绝） |
| `realpath` 与逐段链接检查 | 拒绝链接、别名与项目外解析 | 祖先目录可在检查后被替换 | 是（拒绝），但不构成原子句柄 |

结论：**批准有效性由内容哈希与文件身份共同决定**，判定按内容优先：

- 内容相同、身份相同：`unchanged`，可以继续。
- 内容不同：`changed`，拒绝；即使文件对象同时也变了，报告的首要事实仍是"内容被改"。
- 内容相同、身份不同：`replaced`，拒绝并要求重新审阅。编辑器的原子保存（临时文件 + rename）、`git restore`/`git checkout` 同位文件都会替换文件对象；这是有意的保守规则：用户批准的是当时那个文件，不是一个恰好同字节的新文件。
- 身份不可用（平台不报告，批准记 `identity: null`）：只能依据内容哈希；该降级必须在批准摘要显示"身份不可用"，并在验收记录中写明，不能默认它是安全的。

### 3.2 判定顺序与主进程组合方式

一次应用由 main 按固定顺序组合三层，每层只做自己的事：

1. **记录与保留内容**：先按 `approvalId` 查批准记录；没有记录，或对应目标的待写入内容没有保留，返回 `APPROVAL_REQUIRED`；保留内容哈希不符返回 `APPROVAL_DIGEST_MISMATCH`；保留内容的目标集合不符返回 `APPROVAL_TARGET_MISMATCH`。
2. **观察（只读，无副作用）**：main 以自己在目录册里的项目根为起点，对每个目标执行只读路径策略（拒绝绝对路径、`..`、隐藏与凭证类名称、链接、项目外解析、非普通文件与多链接），再用共享的有界稳定读取（上限 `targetBytes`）读取一次，读取前后核对 `size`/`mtimeMs`/`ino` 一致，不一致记 `unstable`；随后按 §3.1 得出每个目标的 `changed`/`replaced`/`missing` 等状态与内容哈希、文件身份。
3. **纯判定**：拿观察结果做判定，顺序是 绑定 → 撤销 → 已用 → 过期 → 确认的 Diff 摘要 → 目标集合 → 目标状态。这个顺序也决定多个条件同时成立时返回哪个码：窗口绑定不符最先返回，不让外来窗口读到记录状态；撤销先于已用，已用先于过期。

观察必须发生在判定之前，因为判定需要观察结果；观察本身不改任何东西，所以先观察不构成授权。两段之间没有"检查过就不用再查"的缓存：每次应用都必须重新观察。全部目标 `unchanged` 才允许进入写入阶段，并把批准标记为 `consumed`。

失败返回的对象是固定的：

```json
{
  "ok": false,
  "error": {
    "code": "APPROVAL_STALE_TARGET",
    "message": "A reviewed target changed, replaced, moved or disappeared. Review it again.",
    "retryable": false,
    "targets": [{ "path": "src/index.ts", "state": "replaced" }]
  }
}
```

`message` 来自固定映射，不回显绝对路径、项目根或文件内容；调用方只依赖 `code` 与 `targets[].state`。`retryable: false` 表示不能自动重试原批准。

### 3.3 为什么是整体或无

用户审阅的是一份 Diff，不是若干可以任意挑拣的文件。只应用其中一部分会产生用户没有审阅过的组合状态，也无法说明哪一部分"已经批准"。因此 16 个目标里任何一个陈旧，整份批准返回 `APPROVAL_STALE_TARGET`，`targets` 只列出真正异常的目标，其余目标不写。

移动不单独建模：批准路径上的文件被移走后观察结果是 `missing`，main 不会去追新位置，也不会把"新位置看起来一样"当成未变。

### 3.4 残余竞态与威胁边界

第二段的哈希核对与将来的写盘不是同一个原子操作。Windows 没有内容级 compare-and-swap，残余窗口存在：核对完成到写入开始之间，另一个同权限进程仍可能替换目标。缓解办法是写入后立即按同一路径重新读取、核对是否等于 `after`，不等则记 `verification_failed` 并保留现场；这能发现并如实呈现，但不能声称消除了竞态。

因此本决策的威胁范围是**同用户的并发编辑器、误操作、崩溃与重启**，不是**同权限恶意进程反复替换目标**。若真实威胁模型包含后者，须先提供经验证的文件系统级隔离或不可变副本，再升级结论。这与 P2 只读策略 §2 的边界一致。

对 #19 的硬要求：如果实现只能做到"落盘前再 stat 一次"，而无法说明核对与写入之间的窗口如何被压缩或检测，那么写入能力不得开启。按本规格 §9 第 7 条，人类可以选择接受写后核对 + 如实报告，也可以选择暂不启用；两种选择都必须显式记录，不能由实现方默认。

## 4. 落盘、部分完成与验证失败

### 4.1 变更日志

main 为每份写后结果保留追加式变更日志，记录四类：

- `intent`：准备写某个目标，记批准编号、路径与 `beforeSha256`；这是"已经开始"的唯一证据。
- `applied`：写入后重新读取的结果，记 `afterSha256`、实际观察到的 `observedSha256`、`observedIdentity`（写入后字节落在哪个文件对象上）与 `verification`（`verified`/`unverified`）。
- `failed`：该目标没有写成，记固定失败码（`WRITE_FAILED`、`VERIFY_FAILED`、`CANCELLED`、`RECOVERY_CONFLICT`、`UNKNOWN`）。
- `recovery`：后来的恢复动作，记 `restore`/`preserve`/`already_restored` 与当时观察到的哈希。

日志只回答"这次批准实际改了什么"，不存储文件快照，也不是会话历史。它与现行 `RunJournal`（只记 Run 的 accept/terminal/tombstone，并有容量淘汰）分开维护：#20 不能拿 RunJournal 顶替写入证据，也不能让未解决的 `unknown` 与恢复冲突记录被普通日志上限淘汰。已完成记录的保留期限与容量由 #20 的验收决定。

### 4.2 逐路径状态

`summarizeWriteOutcomes` 只按日志给出七种状态，不允许猜测。逐路径结果就是权威结论：只要有一个目标不是 `applied`，整次操作就不能显示为"写入成功"，也不存在把它们合并成"部分成功"的聚合布尔值。

| 状态 | 含义 | 用户应看到 |
| --- | --- | --- |
| `applied` | 写入后重新读取与 `after` 一致 | 已写入并通过校验，附实际哈希 |
| `verification_failed` | 写了，但重新读取与 `after` 不一致 | 写入结果无法确认，需人工核对文件 |
| `restored` | 已按恢复计划回到 `before` | 已恢复，附恢复后哈希 |
| `unchanged` | 没有本 Run 的写入记录 | 文件未被本次操作改变 |
| `rejected` | 批准在写入前被整体拒绝 | 未写入；列出拒绝码与异常目标 |
| `failed` | 尝试过但没有写成，或恢复因冲突被保留 | 未写入；附固定失败码（含 `RECOVERY_CONFLICT`） |
| `unknown` | 崩溃或停机，留下 `intent` 却没有 `applied`/`failed` | 实际状态未知，需人工核对 |

### 4.3 场景与文件状态

| 场景 | 文件状态 | Run 与批准状态 | 呈现要求 |
| --- | --- | --- | --- |
| 预览阶段拒绝或取消 | 全部目标字节与哈希不变 | 无批准记录，或批准被撤销 | 明确"未写入"，不产生日志 |
| 落盘前核验失败 | 全部目标不变 | 批准被撤销（`stale_target`） | `APPROVAL_STALE_TARGET` 等拒绝码 + 异常目标 |
| 第一个目标写入成功、第二个失败 | 第一个已变，第二个未变，其余未动 | 批准已消费 | 逐路径列出 `applied` 与 `failed`，不调用"回滚" |
| 停止请求与写入竞态 | 已完成的目标保持已写入 | Run 记 `stopped`；未完成目标记 `failed(CANCELLED)` 或 `unknown` | 停止回执只说明 Run 已结束，不说明文件被还原 |
| 进程崩溃后重启 | 以日志与磁盘实际为准 | 含 `intent` 无终态的目标记 `unknown` | 重启只核对历史，不重放写入、不重跑模型 |
| 写入后校验失败 | 文件内容未知，可能等于也可能不等于 `after` | `verification_failed` | 给出观察到的哈希，要求人工核对 |

### 4.4 取消不等于回滚

停止按钮、窗口关闭、`AbortSignal` 与进程退出都只结束执行，不还原文件。任何"已取消"的呈现都不得被读成"已恢复"。只有经过恢复流程并核对文件后，才能说某个目标回到了写入前状态。

### 4.5 拒绝与撤销的留痕

批准被拒绝或撤销时不写逐路径 `failed` 记录：那些目标从未被写入，写 `failed` 会误导成"尝试过但失败"。留痕由两处承担：批准记录本身的 `revoked`/`revocationReason`，以及调用方拿到的 `WriteApprovalRejection`（含拒绝码与异常目标）。逐路径 `rejected` 结果由 `rejectedOutcomes` 从该拒绝对象生成，不落盘。

## 5. 并发修改的冲突与恢复规则

### 5.1 三个冲突例子

1. **用户改了同一文件**：Run 写入 `src/index.ts` 后，用户在编辑器里继续修改。恢复时当前内容既不等于 `before` 也不等于 `after`，属于用户的编辑，保留现场。
2. **文件被删除后重建**：用户删掉 Run 写过的文件，又新建了同名文件。恢复时该路径存在但文件身份已变，即使内容恰好与 `after` 相同也不得假设"可以安全删除用户的新文件"，因为重建这个动作本身改变了归属。
3. **同目录另一文件被改**：Run 只批准了 `src/a.ts`，用户同时改了 `src/b.ts`。`src/b.ts` 连批准目标都不是，恢复完全不触碰它。`planRecovery` 的 `outOfScope` 只列出**批准了但本 Run 没有 `applied` 记录**的目标，用来提醒这些目标不进入恢复；批准集合之外的文件比 `outOfScope` 更外层，连枚举都不会出现。

### 5.2 恢复前提与判定

恢复只处理该 Run 的变更，逐个目标判定：

1. 该目标必须有本批准的 `applied` 记录；没有记录的目标一律进 `outOfScope`，不恢复。
2. 当前观察结果等于 `before`（`unchanged`）→ `already_restored`，不做任何事。
3. 当前观察结果等于 `after`（字节与哈希都相同），并且当前文件身份等于 `applied` 记录里的 `observedIdentity`（任一侧为 `null` 时不做身份比较）→ `restore`，可以写回 `before`。这里比较的是**写入后**的身份，不是批准时的写入前身份：`applied` 记录保存的是这次写入实际落到的文件对象，因此"临时文件 + rename"这种替换对象的写法不会让恢复永远落进冲突。
4. 其余情况（内容不同、文件缺失、同名重建、类型改变、链接、无法读取、读取不稳定）→ `conflict`，保留现场并要求人工处理。

判定依赖内容哈希与文件身份而不是时间戳：用户"只是保存、内容没变、文件对象也没变"（例如只更新时间戳）不会造成假冲突；内容变了或文件被同名重建才会。恢复前同样要重新观察目标，不能复用批准时的观察结果。

### 5.3 幂等

恢复计划是纯函数，可重复计算。恢复成功后当前内容等于 `before`，再次计算得到 `already_restored`，不会重复写、重复撤销或再次执行任务。恢复失败时日志保留可诊断状态，不用旧快照覆盖来伪造成功。执行级的"第二次恢复请求不重复写入"由 #20 用恢复请求编号验证，本票只保证计划层的判定是幂等的。

### 5.4 冲突呈现字段

每个冲突至少给出：项目相对路径、期望的 `after` 哈希、实际观察到的哈希或"缺失/类型不符/身份不符"、判定为 `conflict` 的原因、以及"已保留现场，未做修改"。不显示绝对路径，不自动重试，不把冲突计入"已恢复"。

### 5.5 恢复的授权与记录

恢复必须由用户显式发起，一次写入批准不授权任何后台自动恢复。恢复请求只能选择该 Run 已应用的目标；main 按 §5.2 重新判定后执行，并把每个目标的 `recovery` 记录写进变更日志。默认复用原批准记录作为变更归属证据，不要求用户为"恢复到自己刚批准过的旧内容"再走一遍预览；这一点作为 §9 第 11 条交人类确认。被拒绝或冲突的目标保持原样，不进入重试队列。

## 6. 拒绝码与状态词汇

拒绝码 8 个，判定优先级与 §3.2 一致：

| 拒绝码 | 含义 |
| --- | --- |
| `APPROVAL_BINDING_MISMATCH` | 会话、项目、Run、修订号、窗口或窗口代次不符 |
| `APPROVAL_REVOKED` | 批准已被撤销 |
| `APPROVAL_CONSUMED` | 批准已经用过，不能重复应用 |
| `APPROVAL_EXPIRED` | 超过有效期 |
| `APPROVAL_DIGEST_MISMATCH` | 用户确认的 Diff（或保留的待写入内容）与批准记录不一致 |
| `APPROVAL_TARGET_MISMATCH` | 观察到的目标集合或保留内容与批准目标不一致 |
| `APPROVAL_REQUIRED` | 批准记录不存在，或它对应的待写入内容没有保留 |
| `APPROVAL_STALE_TARGET` | 至少一个目标变了；`targets[]` 给出 `changed`/`missing`/`replaced`/`not_regular_file`/`link_not_allowed`/`too_large`/`unreadable`/`unstable` 之一 |

目标状态 9 个：`unchanged`、`changed`、`missing`、`replaced`、`not_regular_file`、`link_not_allowed`、`too_large`、`unreadable`、`unstable`。`replaced` 专指「内容与批准一致但文件身份已变」的同名重建，不能与 `changed` 合并：前者说明用户的文件已经不是审阅时那个对象，后者说明内容被改。

逐路径状态 7 个：`applied`、`verification_failed`、`restored`、`unchanged`、`rejected`、`failed`、`unknown`。失败码 5 个：`WRITE_FAILED`、`VERIFY_FAILED`、`CANCELLED`、`RECOVERY_CONFLICT`、`UNKNOWN`。状态描述文件，结果描述这次操作，两者不混用。

## 7. 负向探针矩阵（本票已执行）

[探针测试](../../tests/contract/write-approval.test.ts)共 83 项，全部在 `pnpm test:contract` 的 Contract 层，临时目录由测试自建并在结束后删除，仓库 committed fixture 未参与、未改变。

| 组 | 输入 | 期望 | 位置 |
| --- | --- | --- | --- |
| 契约 | 未知字段、摘要里带 `webContentsId`、非 `replace_file` 操作、重复目标、单文件超 1 MiB、整份超 4 MiB、有效期超窗口、撤销记录不自洽、设备名、超 32 层路径 | schema 解析失败 | `write approval contract` |
| 路径语法 | `../`、绝对路径、盘符、UNC、空组件、尾点、NTFS ADS | schema 解析失败 | 同上 |
| 目标观察 | 未变、同尺寸改动、增长、截断、读取期间被改、移走、目录、符号链接、硬链接、隐藏凭证名、超预算、同名重建 | `unchanged`/`changed`/`unstable`/`missing`/`not_regular_file`/`link_not_allowed`/`unreadable`/`too_large`/`replaced` | `target observation` |
| 批准有效性 | 已消费、已撤销、已过期、六种绑定不符、Diff 摘要不符、目标集合不符 | 对应 `APPROVAL_*` 拒绝码 | `write approval decision` |
| 整体拒绝 | 两个目标中第二个被改、被删或被同名重建（含两目标重建探针） | 整份拒绝，`targets` 只列异常目标；另一个目标的判定结果仍为未写 | 同上 |
| 时间容错 | 只改 mtime、字节与身份不变 | 仍然批准 | 同上 |
| 内容保留 | 缺失、哈希不符、多余目标、重复目标、完整匹配 | `APPROVAL_REQUIRED`/`APPROVAL_DIGEST_MISMATCH`/`APPROVAL_TARGET_MISMATCH`/通过 | 同上 |
| 撤销与完成 | 撤销记录、标记完成后再次应用 | schema 复验通过；`APPROVAL_REVOKED`/`APPROVAL_CONSUMED` | 同上 |
| 逐路径结果 | 无记录、已校验、未校验、失败、只有 `intent`、恢复完成、恢复冲突 | `unchanged`/`applied`/`verification_failed`/`failed`/`unknown`/`restored`/`failed(RECOVERY_CONFLICT)` | `write outcomes` |
| 恢复 | 当前等于 `after`、等于 `before`、用户改动、文件被删、类型改变、身份不同、未应用目标、重复计划 | `restore`/`already_restored`/`conflict`/`outOfScope` | `recovery planning` |
| 能力关闭 | 扫描 `apps/desktop/src` 的写调用字面量；检查 `run-ipc.ts` 与 `pioneer-run.ts` | 四个既有文件之外没有出现写调用字面量；无 `write`/`approval` 通道、无能力位 | `write surface stays closed` |

矩阵的边界，逐条说清：

- "同名重建"有一条真实删除后重建的探针，平台复用同一身份时会显式 `skip` 而不是静默通过；另有一条用改变的身份构造的确定性探针覆盖判定分支。
- "拒绝对象通过 schema 复验"只对已用/撤销/过期三个生命周期码调用 `WriteApprovalRejectionSchema.safeParse`；其余拒绝码断言具体 `code` 与目标状态。
- "整体拒绝"里"另一个目标不写"是判定结果断言：本票没有写路径，无法观测磁盘副作用。
- "恢复"的重复计划是计划层幂等：两次 `planRecovery` 之间测试手工把文件写回 `before`，验证判定为 `already_restored`；执行层幂等留 #20。
- "能力关闭"是文本级门槛：扫描 15 个写函数名、`FileHandle.write` 调用与 `open(...,'w')` 形式，按文件整体放行四个既有写入文件，不检查这些文件的写入目的地；它证明"没有出现新的写调用字面量"，不是沙箱证明，也不检查运行时动态构造的文件名。

未覆盖、明确留待后续：真实 Electron 用户流程里的批准与拒绝（#19）、真实磁盘写入后的停止与崩溃（#20）、Windows 人工验收（#19/#20 另记）、真实 Provider（与本票无关）。这些是 `NOT_RUN`，不以本轮 Contract 结果顶替。

## 8. 威胁范围

在范围内：同用户的其他编辑器与应用造成的并发改动；用户误删、误改、移动目标；进程崩溃、强制结束与重启；旧批准被重放；批准在不同窗口或不同 Run 之间串用；模型试图指定目标路径、哈希或批准编号；renderer 伪造批准记录或文件已写入的事实。

不在范围内：同权限恶意进程反复替换目标（见 §3.4 残余竞态）；管理员改动 ACL 或取得提权；网络文件系统与云同步工具的一致性语义；磁盘故障与文件系统损坏；恶意模型输出内容本身的正确性（本票只约束"能不能写"，不判断"写得对不对"）；跨多个文件的真正原子提交（见 §3.3）。

## 9. 需要人类确认的决定

以下取舍不能由 Agent 单方面定，每条给出默认建议与代价：

1. **整体或无（默认）vs 允许部分应用**：整体或无让"批准的 Diff"与"写入的 Diff"始终同一份，代价是任一目标变化就全部重审。
2. **有效期 10 分钟（默认）vs 120 秒 vs 30 分钟**：更短更安全但增加重审次数；更长减少打扰但扩大旧批准窗口。独立审阅建议 120 秒。
3. **单文件 1 MiB、整份 4 MiB（默认）vs 单文件 4 MiB、整份 16 MiB、8 个目标**：前者保证完整哈希的可控成本；后者减少大文件重审次数但需要更长写入窗口与更大日志。
4. **内容哈希 + 文件身份共同判定（默认）vs 身份不可用即拒绝写入**：默认允许 `identity: null` 降级并在摘要标注；另一端牺牲部分网络盘与虚拟文件系统的可用性换取更严判定。
5. **同字节的新文件仍要求重新审阅（默认）**：原子保存与 `git restore` 也会触发重审；不接受"内容一样就算没变"的宽松规则。
6. **审批过期或被拒后不可复活（默认）**：即使重新计算出的 `after` 与旧批准相同，也要重新审阅。
7. **接受同用户并发写窗口的残余风险（默认）vs 暂不开启写入**：前者以写后核对如实报告；后者等文件系统事务或句柄级 CAS。独立审阅倾向前者需要人类明确签字。
8. **崩溃后不自动恢复（默认）**：重启只核对与呈现；自动恢复会在用户不知情时改文件。
9. **被删除的目标保留现场（默认）**：恢复不重建文件；重建会与用户"故意删除"的意图冲突。
10. **硬链接与符号链接一律拒绝（默认）**：与只读策略一致，避免跨路径别名绕过目标集合。
11. **恢复复用原批准（默认）vs 要求新的写入批准**：复用让"恢复到自己刚批准的旧内容"少一次流程，代价是批准被消费后仍有写权限；要求新批准更保守但更繁琐。
12. **写入批准是否进入 preload API**：默认不进入，等 #19 的界面上线时再定通道与字段。

以上第 1—10 条已写进代码常量与纯函数；第 11—12 条是 #19/#20 的输入，本票不实现。

### 9.1 留给 #19/#20 的实现前决定

以下事项本票给默认方向，但实现票必须落成具体代码并单独验证：

1. **批准存储与保留内容**：主进程内存或 `userData` 下的独立存储，键为 `approvalId`；应用前必须重新核对保留内容哈希。
2. **批准记录的持久化**：`consumed`、`appliedAt`、`revoked`/`revocationReason` 的写入者与时机；窗口关闭与会话新修订号是默认撤销触发点。
3. **renderer 确认请求的形状**：只允许 `{ approvalId, diffDigest }` 一类最小载荷，main 重新读取自己的记录；renderer 不提交目标、哈希、路径或"已批准"。
4. **落盘原语与窗口压缩**：临时文件 + rename、写前重读、独占句柄的取舍与失败语义；必须说明核对到写入之间的窗口如何被压缩或检测。注意 rename 会替换文件对象，所以 `applied` 记录必须保存写入后的 `observedIdentity`，恢复比较的是它。
5. **变更日志的存放与保留**：位置、格式、容量；未解决的 `unknown` 与冲突记录不得被淘汰。
6. **恢复的执行入口**：恢复请求字段、逐目标选择、执行期停止语义与恢复自身的副作用记录。
7. **部分写入后的自动检查**：写入后重读、哈希核对与失败码映射的实现位置。

## 10. 验证记录

2026-10-27 在 `docs/issue18-write-authorization`（自 `origin/main` `b93d8e9`）执行：

- 定向探针：`pnpm exec vitest run tests/contract/write-approval.test.ts` → 83/83 通过。
- 受影响既有测试：`egress-materials`、`read-only-tools-exec`、`read-only-tool-policy`、`run-manager` 共 123 项通过（共享读取重构未改变行为）。
- `pnpm typecheck`、`pnpm test:contract:types` 通过；新文件 ESLint 0 问题；Prettier 检查通过。
- 完整 `pnpm check` 与 `pnpm verify:repository` 记录见[验证记录](../testing/issue18-verification.md)；本文件的证据范围仅到 Contract Tests，不代表写入功能已实现。
- 独立审阅：两份独立审阅报告与处理结果见验证记录的审阅章节；人类确认仍为待办。

## 仍未完成

- 写入执行器、预览界面与恢复执行属于 #19、#20；本票没有实现，也不声明它们可用。
- 真实 Electron 的批准/拒绝流程、真实临时副本写盘结果、Windows 人工验收均为 `NOT_RUN`。
- 人类对第 9 节 12 项决定的确认；未确认前写入能力保持关闭，`adapterAvailable:false → AUTHORIZATION_REQUIRED` 的现有边界不变。
