# P4-D1 写入权限与恢复决策（Issue #18）

日期：2026-10-27（2026-11-02 改为权限模式模型）。来源：[Issue #18](https://github.com/OasisViridis/Pioneer/issues/18)，属于[主地图 #9](https://github.com/OasisViridis/Pioneer/issues/9) 的 P4 决策票。

本规格只定义决策，不实现写入。写入能力保持关闭，直到 #19/#20 实现并通过验收：没有新增 IPC 通道、preload 方法、renderer 组件、能力位或 Run 事件字段。

## 本次决策与交付范围

| 项       | 内容                                                                                                                                                                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 交付物   | 本规格、[写入权限契约](../../apps/desktop/src/shared/contracts/write-permission.ts)、[目标观察](../../apps/desktop/src/main/harness/write-permission/observe-targets.ts)、[纯决策](../../apps/desktop/src/main/harness/write-permission/decision.ts)、[探针](../../tests/contract/write-permission.test.ts) |
| 共享读取 | [`apps/desktop/src/main/harness/bounded-read.ts`](../../apps/desktop/src/main/harness/bounded-read.ts)，同时被外发材料读取复用                                                                                                                                                                              |
| 不做     | 真实写入执行器、权限选择器界面、内核级沙箱、恢复执行器；这些属于 #19 与 #20                                                                                                                                                                                                                                 |
| 前提     | §9 的 12 个决定已于 2026-11-03 按业主授权定稿（见 §9）；实现与验收仍属 #19/#20                                                                                                                                                                                                                                                         |

## 1. 四类许可的授权关系

本系统有四类许可，各自独立，不能互相代替：

| 许可                    | 回答的问题               | 记录                                                                   |
| ----------------------- | ------------------------ | ---------------------------------------------------------------------- |
| 读取策略（P2 只读）     | 这个文件能不能读         | 只读工具请求与路径策略                                                 |
| Grant（运行授权）       | 这段内容能不能发给模型   | 绑定本次 Run 与外发清单                                                |
| 写入权限（本票）        | 这个项目与作用域能不能写 | 会话级权限选择器                                                       |
| 发布授权（未实现）      | 这次改动能不能对外       | 未来票；本票只约定：没有发布授权时一律拒绝对外发布，写入权限不隐含发布 |

写入权限不继承授权，也不替代其他三类：

- 有 Grant 不等于能写；Grant 只说明模型可以收到哪些材料。
- 能读不等于能写；读取策略比写入更宽，隐藏与凭证类名称在写入侧仍被拒绝。
- 选了"完全权限"不等于能读任何文件，也不等于能外发或发布。
- 选了"仅可查看"不影响读取与 Grant，只让写入侧一律拒绝。

规格与代码不得把运行 Grant 当作写入权限，也不得用 `grantId` 存写入权限。

## 2. 权限模式（四档选择器）

### 2.1 结构

用户在权限选择器里选一次，作用于当前会话与项目，不再逐份 Diff 确认。

| 界面档位        | `mode`            | 允许                                                                       | 拒绝                             |
| --------------- | ----------------- | -------------------------------------------------------------------------- | -------------------------------- |
| 仅可查看        | `read_only`       | 读取授权范围内的文件                                                       | 任何写入、删除、创建             |
| 工作区内修改    | `workspace_write` | 在项目内替换已有普通文件的内容                                             | 越界路径、保护路径               |
| 完全权限        | `full_access`     | 项目内的普通文件，含保护路径；不含项目外路径与命令执行                     | 未明确授权的项目外操作           |
| 自动审查（EXP） | `auto_review`     | 与工作区内修改相同的替换能力，且不需逐次确认；写前检查与写后校验都必须通过 | 保护路径、无法确认的目标、超预算 |

字段见 `WritePermissionSchema`：

| 字段                            | 谁产生                         | 作用                                                                               |
| ------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| `sessionId` / `projectId`       | main                           | 权限绑定到哪个会话与项目；切项目即失效；同一会话内切任务不失效                     |
| `mode`                          | 用户选择，main 校验            | 四档之一                                                                           |
| `scope`                         | 用户                           | `all_targets`（界面上的"全部 N 个文件"）或显式子集；子集只能缩小批次，不能新增路径 |
| `protectedPaths`                | main 默认 `['.git']`，用户可加 | 工作区两档下始终拒绝；内置 `.git` 不能被移除                                       |
| `webContentsId` / `windowEpoch` | main                           | 拒绝其他窗口使用这份权限                                                           |
| `grantedAt`                     | main                           | 授予时间                                                                           |
| `riskAcknowledged`              | 用户                           | `full_access` 与 `auto_review` 必须为真，否则记录不合法                            |

窗口与项目归属由 `checkPermissionBinding(permission, expected)` 判定：`sessionId`、`projectId`、`webContentsId`、`windowEpoch` 四项必须与当前窗口一致；`#19` 在信任任何已存权限前先调用它，不一致就当作没有权限。

上限（`WRITE_LIMITS`）：单批 16 个目标、单文件前后各 1 MiB、整批写入侧合计 4 MiB、路径 1,024 字符与 32 个组件；保护路径最多 8 条（`WritePermissionSchema` 的 `.max(8)`）。超限直接拒绝，不做静默截断。

### 2.2 生命周期：会话级、显式降级

- 一次选择在同一会话与项目内跨多个 Run 有效；切项目、关闭窗口、进程重启都让旧权限失效。同一会话内切换任务不失效，因为权限是会话级的，任务文本属于外发材料，不参与写入权限绑定。
- 降权（例如从完全权限改成仅可查看）立即生效；升权需要用户再点一次。
- `full_access` 与 `auto_review` 需要一次明确的风险确认，记录在 `riskAcknowledged`；没有确认的记录在契约层就不合法。
- 没有"过期时间"与"消费一次"：写入能否发生取决于当前权限与目标是否仍然一致，不取决于某份 Diff 的保质期。本规格取消了按份批准的过期与一次性消费，因为模型里已不存在按份批准；Issue 要求的"旧批准不得落盘"由两条等价规则保证：权限绑定变化由 `checkPermissionBinding` 拒绝，目标字节变化由 `evaluateWriteTargets` 的 `TARGET_CHANGED`/`TARGET_REPLACED` 拒绝。

### 2.3 用户看到什么与待写入变化的核对

选择器显示当前档位与作用域（"全部 N 个文件"或列出的路径）。界面必须写明四档的实际差异，不能把自动审查说成"不需要检查"。不得显示绝对路径、项目根、`webContentsId` 等内部绑定字段，也不得把模型自述的"已完成"当作状态。

权限替代不了核对：待写入的变化仍要在界面里逐条列出（项目相对路径、`before`/`after` 的字节数与哈希、文件身份是否记录），Run 身份由外层传入的 Run 元数据提供（`WriteTarget` 本身不含 `runId`）。预览与结果都带外层 Run 的 `runId` 与 `revision`；`WritePermission` 不绑定单个 Run，因为它跨 Run 有效，绑定粒度是会话与项目。`#19` 提供这份预览；本票只要求契约里的 `WriteTarget` 足以渲染它，且预览内容来自 main，不接受 renderer 或模型自述。

### 2.4 允许的操作类型

首个切片只允许 `replace_file`：把已有普通文件的完整内容替换为 `after` 的字节。不创建新文件、不删除、不改名、不改权限位。二进制内容、无法完整解码的文本、超过字节预算的目标都不能进入批次；`after` 在进入批次前由 main 验证为合法 UTF-8，契约不单独存编码字段。

`auto_review` 不扩大操作类型，只免去逐次确认。

### 2.5 自动审查（EXP）的不变量

一次写入必须同时满足才允许落盘：权限有效、目标在 `scope` 内、不在保护路径、目标内容仍等于 `before`、文件身份可确认（记录过就必须一致）。`auto_review` 与 `workspace_write` 的写前检查完全相同，唯一差别是 `checkWritePermission` 返回 `confirmation: 'none'`，调用方因此不再逐次询问；它不减弱任何检查，也不是"先写后审"。

写后必须回读并核对 `after` 的哈希；不一致记 `verification_failed`，停止后续写入，保留现场，不自动覆盖或回滚。首版只支持替换已有普通文件的文本内容，不开放创建、删除、改名与命令执行。

## 3. 落盘前目标核验（陈旧目标拦截）

### 3.1 文件身份用什么、为什么

内容哈希与文件身份是两件事：

- 内容哈希（SHA-256）回答"字节还是不是这一份"。用户只是保存、内容没变、文件对象也没变时哈希相同，不会误判。
- 文件身份回答"还是不是同一个文件对象"。删除后同名重建、复制覆盖、编辑器用临时文件加改名替换，都会让内容相同而对象不同。

身份用平台报告的文件索引（Node `ino`）加创建时间（`birthtimeMs`）：`ino` 区分对象，`birthtimeMs` 兜住索引复用。平台不报告可用身份时记录 `null`，判定退化为只比内容，并在规格里明确这是更弱的证据。

只比内容会让"删掉再建一个同样内容的文件"通过检查；只比身份会让正常保存被拒。两者都要，但优先级是内容优先：内容不同先报 `changed`，内容相同再比身份，身份不同报 `replaced`。

### 3.2 判定顺序与主进程组合方式

一次写入由 main 按固定顺序组合，每层只做自己的事：

1. **权限**：`checkWritePermission` 先看档位、作用域与保护路径。`read_only` 拒绝整批（`PERMISSION_READ_ONLY`）；目标不在 `scope` 内拒绝（`PERMISSION_OUT_OF_SCOPE`）；工作区两档下命中保护路径拒绝（`PERMISSION_PROTECTED_PATH`）。被拒绝时所有目标记 `rejected` + `PERMISSION_DENIED`，一个目标都不碰。
2. **观察（只读，无副作用）**：main 以自己在目录册里的项目根为起点，对每个目标执行只读路径策略（拒绝绝对路径、`..`、隐藏与凭证类名称、链接、项目外解析、非普通文件与多链接），再用共享的有界稳定读取（上限 `targetBytes`）读取一次，读取前后核对 `size`/`mtimeMs`/`ino` 一致，不一致记 `unstable`；随后按 §3.1 得出每个目标的状态、内容哈希与文件身份。
3. **写前校验**：`evaluateWriteTargets` 要求每个目标仍是 `unchanged`、内容等于 `before`、记录过身份时必须同一文件对象。任何一条不满足，整批拒绝，`targets` 只列出真正异常的目标。
4. **组合入口**：`authorizeWrite` 把权限、观察与写前校验合成一个决定，返回 `stage: 'permission'`（附每个目标的 `rejected` 结果）或 `stage: 'targets'` 加对应码，成功时给出 `confirmation`；`#19` 不必自己记住调用顺序。它不校验窗口绑定，调用前先用 `checkPermissionBinding` 确认这份权限属于当前窗口。`planRecovery` 同样先跑 `checkWritePermission`，被拒时 `denied` 非空、`actions` 为空。
5. **写入与回读**：全部通过才允许写入；每个目标写后回读核对 `after` 哈希，结果记进变更日志（§4）。

观察必须发生在校验之前，因为校验需要观察结果；观察本身不改任何东西，所以先观察不构成授权。两段之间没有"检查过就不用再查"的缓存：每次写入都必须重新观察。

失败返回的对象是固定的：

```json
{
  "ok": false,
  "error": {
    "code": "TARGET_REPLACED",
    "message": "The file was deleted and re-created.",
    "retryable": false,
    "targets": [{ "path": "src/index.ts", "state": "replaced" }]
  }
}
```

`message` 来自固定映射，不回显绝对路径、项目根或文件内容；调用方只依赖 `code` 与 `targets[].state`。`retryable: false` 表示不能自动重试，必须重新读取目标。

### 3.3 为什么是整体或无

批次是一次原子操作：只写其中一部分会产生没有检查过的组合状态，也无法说明哪一部分"已经通过校验"。因此 16 个目标里任何一个异常，整批拒绝，`targets` 只列出异常的目标，其余目标不写。

### 3.4 残余竞态与威胁边界

写前校验与真正落盘之间仍有窗口：校验通过后、写入前，其他进程可能改动文件。本票接受这个残余风险，理由有三条：

1. 窗口只存在于同一进程的两次系统调用之间，比"审阅到写入"的窗口小几个数量级；
2. 写后回读会核对 `after` 哈希，若真被改动，结果记 `verification_failed`，不会静默成功；
3. 彻底消除它需要文件锁或原子替换原语，属于 #20。

威胁边界：本票不防恶意本地进程（它们可以绕过任何应用层检查），防的是本应用自己的错误、并发编辑与陈旧目标。

### 3.5 四档的真实能力边界

- `read_only`：只读，写入侧一律拒绝。
- `workspace_write`：项目内普通文件，保护路径除外。它不是内核隔离，只是在 main 里执行路径判定。
- `full_access`：项目内普通文件，含保护路径。仍不越过项目根，也不等于命令执行；开启需要风险确认。
- `auto_review`：在 `workspace_write` 的边界内免去逐次确认，前提是写前校验与写后回读都通过；它不增强任何能力。

读取策略与写入档位的关系：观察阶段默认沿用只读策略，隐藏文件与凭证类名称被拒绝。`full_access` 下只有**保护路径**（`WRITE_PROTECTED_PATHS` 加授权里自带的 `protectedPaths`）通过允许清单进入观察，其余隐藏名称照样拒绝；进入允许清单的目标在读之前还要复检一次：字面路径是链接就拒绝，解析后的路径必须仍在解析后的项目根内，所以"把 `.git` 做成指向项目外的链接"不会被跟随；`workspace_write` 与 `auto_review` 连保护路径都不进入观察，因此 `.git` 在这两档下观察结果就是 `unreadable`。允许清单由 `observationAllowance(permission)` 给出，只有 `full_access` 返回非空。

真正的内核级隔离（Windows 受限 Token + job object、低权限账户或 MXC）属于 #19/#20，本票只定义判定。

## 4. 落盘、部分完成与验证失败

### 4.1 变更日志

main 按目标追加记录，顺序是 `intent` → `applied` / `failed`，恢复时追加 `recovery`。字段：

| 记录       | 字段                                                                                                   | 含义                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `intent`   | `runId`、`revision`、`path`、`beforeSha256`、`at`                                                      | 真正写之前先落盘，是"这次运行动过这个目标"的唯一证据             |
| `applied`  | `runId`、`revision`、`path`、`afterSha256`、`observedSha256`、`observedIdentity`、`verification`、`at` | 写完回读的结果；`verified` 要求 `observedSha256 === afterSha256` |
| `failed`   | `runId`、`revision`、`path`、`code`、`at`                                                              | 这个目标没写成，`code` 取失败码                                  |
| `recovery` | `runId`、`revision`、`path`、`action`、`observedSha256`、`at`                                          | 恢复做了什么，以及当时观察到的哈希                               |

日志是"实际发生了什么"，不是"打算发生什么"。没有 `intent` 的 `applied` 不算证明：写前校验链必须完整。

### 4.2 逐路径状态

| 状态                  | 何时出现                                                     |
| --------------------- | ------------------------------------------------------------ |
| `applied`             | 有完整证明链（`intent` + `applied` + `verified` + 哈希一致） |
| `verification_failed` | 有 `applied` 但证明链不完整或回读哈希不符                    |
| `restored`            | 恢复记录已被证明完成                                         |
| `unchanged`           | 没有任何记录，说明这次运行没动它                             |
| `rejected`            | 权限或写前校验拒绝                                           |
| `failed`              | 记录为 `failed`                                              |
| `unknown`             | 只有 `intent`：进程在写中途停止，真实状态未知                |

### 4.3 场景与文件状态

| 场景                 | 状态                   |
| -------------------- | ---------------------- |
| 写入成功并回读一致   | `applied`              |
| 写入成功但回读不一致 | `verification_failed`  |
| 写入抛错             | `failed(WRITE_FAILED)` |
| 用户取消             | `failed(CANCELLED)`    |
| 进程在写中途崩溃     | `unknown`              |
| 权限或写前校验拒绝   | `rejected` + 具体码    |

### 4.4 取消不等于回滚

取消只停止后续写入，已经写入的目标保持原样并留在日志里。回滚是恢复（§5）的事，两者不混。

### 4.5 拒绝的留痕

拒绝不改文件，只记结果：目标状态 `rejected`，码取 `PERMISSION_DENIED` 或写前拒绝码。只有写前校验判定异常的目标记 `rejected`；未被判定异常的目标没有被动过，保持 `unchanged`。拒绝不会撤销权限、不会消耗任何一次性记录，因为不存在这样的记录；用户改权限或改目标后重新发起即可。

## 5. 并发修改的冲突与恢复规则

### 5.1 三个冲突例子

1. 用户自己改了同一个文件：内容哈希不同，恢复保留用户版本，记 `conflict`。
2. 文件被删除：`missing`，恢复不重建，记 `conflict`。
3. 文件被同名重建：内容可能相同、身份不同，记 `replaced`；恢复按 `conflict` 处理，不覆盖。

### 5.2 恢复前提与判定

恢复只处理该 Run 的变更，逐个目标判定。判定以**该路径的最后一条日志记录**为准，而不是"历史上出现过 applied"：

1. 没有记录 → `outOfScope`。最后一条是 `failed` 且此前没有 `applied` → 同样 `outOfScope`（确实没写成，没有可撤销的写入）。
2. 最后一条是 `applied`：该路径此前必须有 `intent`，`intent.at` 不晚于 `applied.at`，且 `intent.beforeSha256` 等于本批次的 `before`；记录必须是 `verified`、`afterSha256` 等于本批次的 `after`、`observedSha256` 等于 `afterSha256`，否则 `conflict`（写入是否成立无法证明）。
3. 最后一条是 `recovery`：只有 `observedSha256` 等于 `before`、此前存在**已证明的** `applied`、并且当前磁盘仍等于 `before` 时才是 `already_restored`；孤立的恢复记录、哈希不符或恢复后文件又被改动，一律 `conflict`，不重放、不改写。
4. 最后一条是 `intent`，或 `applied` 之后又出现 `failed`：真实状态未知（可能已写、可能没写），一律 `conflict`，留给人工。
5. 当前观察结果等于 `before`（`unchanged`）→ `already_restored`，不做任何事。
6. 当前观察结果等于 `after`，并且当前文件身份等于 `applied` 记录里的 `observedIdentity` → `restore`，可以写回 `before`。这里比较的是**写入后**的身份，不是写入前身份：`applied` 记录保存的是这次写入实际落到的文件对象，因此"临时文件 + rename"这种替换对象的写法不会让恢复永远落进冲突。若 `applied` 记录里没有身份，内容哈希是唯一证据；若记录了身份而本次观察拿不到，视为身份无法证明，落 `conflict`。
7. 其余情况（内容不同、文件缺失、同名重建、类型改变、链接、无法读取、读取不稳定）→ `conflict`，保留现场并要求人工处理。

修订号的处理是不对称的，这是有意的：`summarizeWriteOutcomes` 只看当前 `revision` 的记录，因为"这次运行现在是什么结果"必须属于当前会话状态；`planRecovery` 不看 `revision`，因为恢复处理的是历史写入，而且要通过重新观察当前磁盘来判断能否回退。两者对同一条旧记录的结论可能不同（总结报 `unchanged`、恢复仍计划 `restore`），#20 必须按恢复侧的行为验收。

### 5.3 幂等

恢复计划是纯函数，可重复计算。恢复成功后内容回到 `before`；若写入时记录了文件身份，写回后文件对象可能已变，此时再次计算按"内容相同、身份不同"记 `conflict` 而不是 `already_restored`，这是有意的：恢复计划不假设自己知道写回方式。平台不报告身份时只比内容，重复计算得到 `already_restored`。两种情况都不会重复写、重复撤销或再次执行任务。

### 5.4 冲突呈现字段

冲突记录至少包含：目标相对路径、冲突类型（`changed`/`missing`/`replaced`/`identity_unavailable` 等）、当前观察到的字节数与哈希、期望的 `before` 与 `after` 哈希、建议动作。界面不得把冲突说成"已恢复"。

### 5.5 恢复的权限

恢复同样受权限模式约束，而且这条由代码执行：`planRecovery` 先调用 `checkWritePermission`，`read_only` 返回 `denied: PERMISSION_READ_ONLY`，工作区两档命中保护路径返回 `denied: PERMISSION_PROTECTED_PATH`；被拒时 `actions` 与 `outOfScope` 都为空，调用方只能靠 `denied` 判断"权限不允许"，不能读成"没有需要恢复的目标"。恢复不需要"重新确认"，因为它作用于本 Run 已证明写入的目标，并且要重新观察当前磁盘。

## 6. 拒绝码与状态词汇

写入侧有三组独立词汇，不能混用：

| 组                                     | 取值                                                                                                                                                                                                   | 出现位置                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| 权限拒绝（`WRITE_PERMISSION_DENIAL_CODES`） | `PERMISSION_READ_ONLY`、`PERMISSION_OUT_OF_SCOPE`、`PERMISSION_PROTECTED_PATH`                                                                                                                         | `checkWritePermission` 的拒绝 |
| 写前拒绝（`WRITE_REJECTION_CODES`）    | `TARGET_CHANGED`、`TARGET_MISSING`、`TARGET_REPLACED`、`TARGET_IDENTITY_UNAVAILABLE`、`TARGET_NOT_REGULAR_FILE`、`TARGET_LINK_NOT_ALLOWED`、`TARGET_TOO_LARGE`、`TARGET_UNREADABLE`、`TARGET_UNSTABLE` | `evaluateWriteTargets` 的拒绝 |
| 失败码（`WRITE_CHANGE_FAILURE_CODES`） | `WRITE_FAILED`、`VERIFY_FAILED`、`CANCELLED`、`RECOVERY_CONFLICT`、`PERMISSION_DENIED`、`UNKNOWN`                                                                                                      | 日志与逐路径状态              |

目标状态（`WRITE_TARGET_STATES`）与逐路径状态（`WRITE_TARGET_STATUSES`）是另一组词汇，见 §4.2。

`PERMISSION_DENIED` 是失败码里唯一由权限层产生的值，用来把整批拒绝写进结果；具体是哪一档拒绝，看 `checkWritePermission` 的返回码。

## 7. 负向探针矩阵（本票已执行）

[探针测试](../../tests/contract/write-permission.test.ts)共 79 项，全部在 `pnpm test:contract` 的 Contract 层，临时目录由测试自建并在结束后删除，仓库 committed fixture 未参与、未改变。

| 组                 | 覆盖                                                                                                                                                              | 期望                                                                         | describe                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| 契约               | 合法权限、四档枚举、风险确认、作用域子集、未知字段、重复目标、超预算、目标上限 16、保护路径 8 条、非法路径、失败码与拒绝码词表                                                                | 解析成功或拒绝                                                               | `write permission contract`       |
| 权限               | 仅可查看全拒、工作区放行、`.git` 三种形态、保护路径不可移除、`.github` 近似前缀、完全权限、scope 内外、自动审查标记、拒绝结果                                     | `PERMISSION_*` 或通过                                                        | `write permission scope`          |
| 写前校验           | 未变、改动、消失、对象被替换、身份不可确认、状态到码的映射、整批标记                                                                                              | `TARGET_*` 或通过                                                            | `write-time target check`         |
| 目标观察           | 未变、同尺寸改动、增长、截断、读取期间被改、同名重建、缺失、目录、符号链接、父目录链接、硬链接、隐藏凭证名、超预算、批量顺序                                                  | 对应 `state`                                                                 | `target observation`              |
| 逐路径结果         | 无记录、完整证明、未验证、缺 `intent`、`intent` 前置哈希不符、`intent` 晚于 `applied`、跨修订号的 `intent`、`after` 不符、失败、只有 `intent`、恢复完成、孤立恢复、按目标区分拒绝码、未异常目标保持 `unchanged` | 对应 `status` 与 `code`                                                      | `write outcomes`                  |
| 恢复               | 仍持有后像、未动、用户改动、无记录、写入失败且无后像、孤立恢复、写入后失败、中途中断、未验证、已恢复不重放、恢复后又被改、写入后对象被换                          | `restore`/`already_restored`/`conflict`/`outOfScope`                         | `recovery planning`               |
| 完全权限与保护路径 | 完全权限下 `.git/config` 端到端可观察可写、缺失报 `missing`、链接不跟随、工作区两档下 `unreadable`、恢复在只读与保护路径下被拒                                    | 通过 / `TARGET_UNREADABLE` / `missing` / `link_not_allowed` / `PERMISSION_*` | `full access and protected paths` |
| 写面               | 决策模块与共享契约不含写调用、IPC 与 Run 契约不含写入权限                                                                                                         | 无新增                                                                       | `write surface stays closed`      |

边界说明：

- "同名重建"有一条真实删除后重建的探针，平台复用同一身份时会显式 `skip`；另有一条用构造身份覆盖 `replaced` 判定。
- "读取期间被改动"依赖 `readStableFile` 的 `afterRead` 测试钩子；这是本票对 Issue "不另建测试替换点" 的一次偏离，理由是没有它测不到 `unstable` 分支。钩子只在构造选项时传入，生产调用不传，验证记录里单列。
- `identity_unavailable` 由构造观察对象覆盖判定分支，真实平台上无法稳定制造。
- 探针不证明将来的写入执行器一定正确：#19 的实现要用同一套校验。

## 8. 威胁范围

本票防的是：

1. 陈旧目标：用户在运行期间改了文件，写入用过期的内容覆盖。
2. 同名重建：内容相同但对象不同，写入落到替身文件上。
3. 越界与保护路径：写到项目外或 `.git` 里。
4. 权限漂移：用户降权后旧动作继续生效。
5. 静默成功：写后没有回读就报告完成。

本票不防：

- 恶意本地进程绕过应用层检查。
- 内核级逃逸（受限 Token、job object 的正确性由 #19/#20 验收）。
- 写入执行器自身的 bug。
- 模型输出内容是否有害：本票只保证写入范围与目标一致，不判断内容好坏。

## 9. 决定的定稿（2026-11-03 已确认）

业主在 2026-11-03 的会话中指示"完成 issue 的任务，不要找我批准"，把本票的定稿权交给代理；代理按规格建议值逐项定稿，第 5 项按代码与 Issue 的一致性改为不绑定任务，业主可在合并前推翻任何一项。定稿依据：规格与契约、实现、探针的一致性核对；79 项 Contract 探针；两份独立审阅（Standards 与 Spec）；外部第二意见的实际结果见 §10。写入能力不因本表定稿而开启，实现与验收仍属 #19/#20。

逐项依据：

1. 四档命名：采纳。命名已覆盖能否写、写哪里、是否逐次确认三个差异；最终措辞属 §9.1 第 2 项，界面不得扩大档位含义。
2. 自动审查首版边界：采纳。只替换已有普通 UTF-8 文本文件、失败即停、不自动回滚，与 `replace_file`、`WRITE_LIMITS` 和写后回读一致。
3. 完全权限限制在项目内：采纳。`WriteTargetPathSchema` 与 `observe-targets` 的包含性检查只接受项目相对路径；完全权限不含项目外路径与命令执行。
4. 作用域是真实白名单：采纳。`checkWritePermission` 对显式子集逐目标检查，任一目标不在子集即整批 `PERMISSION_OUT_OF_SCOPE`；子集不能新增路径。
5. 权限失效范围：修改。原建议写"切任务、切项目、关窗、重启都失效"，但权限记录没有 task 字段，会话级选择器也不该被同一会话内的任务切换打断；定稿为切项目、关窗、重启失效，同一会话内切任务不失效。`checkPermissionBinding` 校验 `sessionId`、`projectId`、`webContentsId`、`windowEpoch` 四项；持久化与失效实现属 #19，规格要求先绑定再信任。
6. 升权再确认、降权立即生效：采纳。权限记录是显式快照，降权即替换记录，下一次判定立即按新档位；升权要新的风险确认。
7. 风险确认：采纳。`WritePermissionSchema` 对 `full_access` 与 `auto_review` 强制 `riskAcknowledged: true`，缺失即解析失败，不依赖界面自觉。
8. 恢复不需重新确认：采纳。`planRecovery` 先跑 `checkWritePermission`，再按最后一条记录与当前磁盘判定；被拒时 `actions` 与 `outOfScope` 都为空。
9. 残余竞态：采纳。不引入文件锁或原子替换原语无法消除该窗口；写后回读把不一致记 `verification_failed`，不会静默成功；原语留给 #20。
10. 拒绝不撤销权限、不消耗一次性记录：采纳。模型里已无一次性记录；拒绝只产生 `rejected` 结果，权限记录不变，用户改权限或目标后重新发起即可。
11. 上限 16 / 1 MiB / 4 MiB：采纳。`WRITE_LIMITS` 与 `WriteTargetsSchema` 已强制，超限解析失败或整批拒绝，不做静默截断；#19 可用真实项目样本复测后再调，调整必须先改契约与探针。
12. 文件身份 `ino` + `birthtimeMs`：采纳。`WriteFileIdentitySchema` 记录 `fileId` 与 `birthtimeMs`；平台不报告时记 `null` 并退化为只比内容，`identity_unavailable` 是独立拒绝状态。

| #   | 决定                                                                | 状态    |
| --- | ------------------------------------------------------------------- | ------- |
| 1   | 四档命名与界面文案（仅可查看 / 工作区内修改 / 完全权限 / 自动审查） | 采纳 |
| 2   | 自动审查是否接受"仅普通文本、失败即停、不自动回滚"的首版边界        | 采纳 |
| 3   | 完全权限是否仍限制在项目内（本规格：是）                            | 采纳 |
| 4   | 作用域"全部 N 个文件"是真实白名单而非界面筛选（本规格：是）         | 采纳 |
| 5   | 权限在切项目、关窗、重启时失效；同一会话内切任务不失效（原建议含"切任务"，因无 task 标识改为不失效） | 修改 |
| 6   | 升权需要再次确认、降权立即生效（本规格：是）                        | 采纳 |
| 7   | 完全权限与自动审查需要风险确认（本规格：是）                        | 采纳 |
| 8   | 恢复不需要重新确认，只受权限与当前磁盘约束（本规格：是）            | 采纳 |
| 9   | 接受写前校验与落盘之间的残余竞态（§3.4）                            | 采纳 |
| 10  | 拒绝不撤销权限、不消耗任何一次性记录（本规格：是）                  | 采纳 |
| 11  | 目标上限 16、单文件 1 MiB、整批 4 MiB（§2.1）                       | 采纳 |
| 12  | 文件身份用 `ino` + `birthtimeMs`（§3.1）                            | 采纳 |

### 9.1 留给 #19/#20 的实现前决定

1. 权限选择器在 renderer 的实现与 IPC 通道（本票不建）。
2. 中文文案与四档说明的实际措辞。
3. 写入执行器如何做到"写后回读"与部分完成。
4. 恢复执行器如何避免覆盖用户改动。
5. 冲突呈现的字段与界面。
6. 变更日志的存储格式与保留期限。
7. Windows 上 `ino` 与 `birthtimeMs` 的实际可用性。
8. 内核级隔离（受限 Token、job object、`mxc`）的选型与验收。
9. `afterRead` 测试钩子的去留。
10. 会话级权限的签发、持久化与失效实现。

## 10. 验证记录

2026-11-02 在 `docs/issue18-write-authorization`（自 `origin/main` `28e6882` 起）执行：

- 定向探针：`pnpm exec vitest run tests/contract/write-permission.test.ts` → 75 项全部通过；4 处 `skip` 只在平台前提不满足时触发（身份复用、身份不可用、符号链接或联接权限），本机未触发。
- 完整门禁：`pnpm check`，结果与日志见 [`docs/testing/issue18-verification.md`](../testing/issue18-verification.md)。

2026-11-03 在 `docs/issue18-confirm-decisions`（自 `origin/main` `13ccfe5` 起）定稿 §9 并复跑无窗口检查：

- 定向探针：`pnpm exec vitest run tests/contract/write-permission.test.ts` → 79 项全部通过（新增目标上限、保护路径上限、父目录链接、按目标区分拒绝码 4 项）。
- 无窗口检查：`pnpm verify:repository`（6/6）、`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test:contract:types`、`pnpm test:contract`（509/509，43 个文件）、`pnpm test:prototype`（210/210）全部退出码 0。
- 完整门禁：CI `Windows / pnpm check` 的结果见验证记录。
- 外部第二意见：见验证记录「外部第二意见」一节。

探针只证明决策函数与目标观察的行为，不证明写入执行器、界面或内核隔离。

## 仍未完成

1. 写入执行器与界面（#19）。
2. 恢复执行器与内核级沙箱（#20）。
3. `afterRead` 测试钩子的去留（§9.1 第 9 项）。

§9 的十二个决定已于 2026-11-03 按业主授权定稿；写入能力仍关闭，直到 #19/#20 实现并通过验收。
