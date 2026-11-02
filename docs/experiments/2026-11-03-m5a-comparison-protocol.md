# M5-A 实验方案冻结与先导：Pioneer 只读 Harness 上下文装配对照

- 对应票据：[#29 [M5-A] 实验：冻结对比方案与先导结果](https://github.com/OasisViridis/Pioneer/issues/29)（总图 [#9](https://github.com/OasisViridis/Pioneer/issues/9)）
- 协议标识：`m5a-harness-context-comparison` v1
- 冻结时间：2026-11-03（Asia/Shanghai）
- 冻结基线：分支 `feat/m5a-experiment-freeze`，base commit `13ccfe5f0c9f8cc376aec08eb21cd91162719237`
- 机器可读版本：[protocol.json](m5a/v1/protocol.json)、[tasks.json](m5a/v1/tasks.json)、[analysis-plan.json](m5a/v1/analysis-plan.json)、[record-schema.json](m5a/v1/record-schema.json)
- 冻结清单：[freeze-manifest.json](m5a/v1/freeze-manifest.json)

本文是给人看的版本，与上面四份 JSON 互为对照。两者冲突时以 JSON 为准，并必须按第 10 节升版本。

## 1. 一句话结论与交付状态

在冻结时点，技术方案、任务集、评分规则、数据字段、分析步骤与冻结规则已有可审阅的 v1 定稿；流程用受控数据跑通；**真实 Provider 先导为 `NOT_RUN`**，因为本轮没有具体 Provider、模型与外发材料授权。按票据第 3 条完成条件，真实样本量与成本上限因此只有可解释上界依据，没有被真实先导验证，本文与 issue 记录都不会把它写成已验证。

| 交付物 | 路径 | 当前状态 |
| --- | --- | --- |
| 比较问题、变体、任务类别、评分规则、分母与预算 | `docs/experiments/m5a/v1/protocol.json` | 已冻结 v1 |
| 12 条任务、评分字面量与材料证据 | `docs/experiments/m5a/v1/tasks.json` | 已冻结 v1 |
| 数据字段与不变量 | `docs/experiments/m5a/v1/record-schema.json` | 已冻结 v1 |
| 分析步骤与统计口径 | `docs/experiments/m5a/v1/analysis-plan.json` | 已冻结 v1 |
| 受控流程先导（记录与分析链路） | `docs/experiments/m5a/pilot-controlled/` | 见该目录 `report.md`，证据级别 `controlled` |
| 真实模型先导 | `docs/experiments/m5a/real-pilot-status.md` | `NOT_RUN`，缺授权 |
| 冻结校验 | `node tools/experiments/freeze.mjs --protocol-dir docs/experiments/m5a/v1 --verify` | 命令与输出见第 10 节 |

## 2. 比较问题

主问题：在同一 Provider、同一模型、同一任务文本、同一预算与时限下，「按需只读工具 + 随需取用材料」（V1）与「固定前缀全量材料 + 无工具」（V0）两种信息供给配置，在 12 个只读检索任务上的任务完成率、Provider 报告 token 用量与端到端耗时是否存在可复核差异？

统计单位在冻结时改用任务：12 个任务是配对单位，72 次尝试彼此不独立。因此主结论报任务级差值分布，attempt 级比例只作描述。

次要问题：

1. 每个任务格的工具请求、成功、拒绝、失败、取消计数分布是什么样。
2. 失败与超时的原因分布是什么样，V0 有多少次失败与 64 KiB 截断直接相关。
3. 同一格 3 次重复中 pass 次数是 0、1、2 还是 3，重复之间是否稳定。

非主张，写进论文与答辩也要照此表述：

1. 不主张 Pioneer 优于其他 Harness，或优于任何没有实测的配置。
2. 不主张任何具体提升比例、统计显著性或成本节省金额。
3. 不主张用户研究结论，本实验没有真实用户参与。
4. 不主张单因子归因，原因见第 3 节的混淆披露。

## 3. 两个变体与混淆披露

| 维度 | V1 `pioneer-readonly-tools` | V0 `fixed-prefix-no-tools` |
| --- | --- | --- |
| 上下文装配 | 按需：任务文本 + 材料清单，模型自行决定读哪个文件 | 固定前缀：允许材料按固定顺序拼接进单条提示 |
| 提示模板 | 系统提示写明只读工具与材料根，用户消息为任务题面 | 用户消息为「固定前缀材料 + 截断标记 + 任务题面」 |
| 工具 | `read_file`、`list_directory`、`search_in_files` 三个只读工具 | 无工具，单次模型调用 |
| 输入上限 | 每次发往 Provider 的材料与正文累计 64 KiB（产品既有上限） | 材料前缀 57,344 B + 指令预留 8,192 B，合计 65,536 B；超出材料前缀的部分按字节截断并追加 `[TRUNCATED_AT_64KiB]` |
| 输出上限 | 4,096 tokens | 4,096 tokens |
| 时限 | 120,000 ms | 120,000 ms（单次调用，通常远早于此） |
| 模型与 Provider | 相同 | 相同 |
| 任务文本 | 相同 | 相同 |

截断规则先固定：按 `tasks.json` 的 `corpus.files` 顺序拼接，材料前缀累计到 57,344 B 截止，切断多字节字符时回退到最近字符边界，末尾追加固定标记字符串。提示模板、任务题面与 ANSWER 格式指令共用 8,192 B 预留额度，两者相加不超过 65,536 B。标记字符串不含任何答案线索，也不参与评分。

V0 的可见窗口在运行前固定并披露：57,344 B 前缀落在 `demos/00-pioneer-workbench.html` 的前 44.9%（57,344 / 127,662 B），其余 5 个文件对 V0 完全不可见，全语料可见比例 14.5%。对照 `tasks.json` 的 `groundTruth.evidence`，只有 t05 的证据（00 文件 43,140 到 52,246 B 区间）落在可见范围内，其余 11 条需要读取不可见文件或 57,344 B 之后的内容。这一结构性差距不是测量结果，是基线定义的直接后果，分析时必须单列，不能算作 Harness 效果的证据。

V0 是刻意弱的基线：无检索、无工具、单一前缀截断。它衡量「完全不检索、把材料一次塞进去」的表现，不衡量长上下文模型的一般能力；结论不外推到其他 eager 或长上下文方案。

混淆披露：V1 与 V0 同时改变了上下文装配方式与工具可用性，因此测到的差异**不能**单独归因给「上下文量」或「工具能力」。论文把 V1 当作已交付配置整体来描述，实验只回答「这套交付配置在同类任务上的表现」，不回答「是哪个因素造成的」。若要单因子结论，需要第三臂（例如预载材料 + 允许工具），本票不追加，留给 M5-B 决定。

## 4. 材料与任务集

### 4.1 材料

`demos/` 是仓库政策冻结的 M1 参考实现，内容不再改动，且为公开材料。总量 396,500 B，是 65,536 B 输入预算的 6.05 倍，因此 V0 必然截断，V1 必须按需定位，差异才有观察价值。

| 文件 | 字节 | SHA-256（前 16 位） |
| --- | --- | --- |
| `demos/00-pioneer-workbench.html` | 127,662 | `cbfbcba375cde368` |
| `demos/01-bookshelf-workspace.html` | 41,161 | `727e2486d4309200` |
| `demos/02-session-intent-card.html` | 58,858 | `d34a8ef63dcc043f` |
| `demos/03-wrapup-and-gallery.html` | 50,181 | `abb129a07b3b7743` |
| `demos/04-ppt-presentation-demo.html` | 116,981 | `79cee4b3a6173d1c` |
| `demos/README.md` | 1,657 | `625d3303147427ed` |

完整哈希与字节数在 `tasks.json` 的 `corpus.files`；数据集行只存 `corpusManifestSha256`，不存材料内容。该哈希可复算：把 `corpus.files` 按 `path` 升序排列，每项取 `{path, sha256, bytes}`，`JSON.stringify` 后取 UTF-8 的 SHA-256，当前值为 `1557594df4dbdd7324dd4ffa4dcbf6c71607c6e99dfd5ee967f023f52bdc7f42`。`build-dataset.mjs` 会重算语料哈希并与 `capture.json` 比对，不一致即拒绝该采集包。

### 4.2 任务集

12 条，4 类各 3 条：

| 类别 | 条数 | 需要的已交付能力 | 考什么 |
| --- | --- | --- | --- |
| `locate-exact-fact` | 3 | `read_file` | 在指定文件里找出一个唯一事实 |
| `aggregate-count` | 3 | `search_in_files` + `read_file` | 跨文件计数或聚合，答案是唯一整数 |
| `cross-file-synthesis` | 3 | 两个文件的 `read_file` | 只看一个文件答不出，必须交叉 |
| `negative-scope` | 3 | `search_in_files` + 回答纪律 | 正确回答「材料里没有」，不编造 |

任务只使用已交付的三个只读工具与冻结材料；不收录写入、命令执行、会话分支、安装包、真实用户、需要外部网络或答案随时间变化的题。逐条题面、评分字面量与 ground truth 见 `tasks.json`。

## 5. 评分规则

评分是确定性的文字规则，不用模型打分、不用人工逐条打分，保证同一份数据重算得到同一结果：

题面统一附加同一句格式指令：`最后一行只写：ANSWER: <值>。<值> 必须是 ASCII 标识符、阿拉伯数字或文件路径片段，不要用中文数字写数量（写 3，不要写三个）。` 这句话不参与评分逻辑，作用是让答案里必然带 ASCII 事实，避免「三个」对「3」这类中文数字误判。

1. 归一化：去掉 Markdown 装饰符（反引号、强调符、标题号），Unicode 空白折叠为单个空格，比较时大小写不敏感。
2. 四种判定：`pass`（运行 completed 且规则满足）、`fail`（completed 但规则不满足）、`unscorable`（completed 但回答为空或超过 65,536 B）、`not_run`（未执行）。
3. 两种规则：`contains_all` 要求全部 `literals` 出现**且**全部 `forbidden` 不出现；`contains_none` 要求全部 `forbidden` 不出现**且**至少一个 `literals` 出现。`match` 取 `substring` 或 `word`，整题统一。负向题用 `contains_all`，同时要求结论词 `none` 与一个只有读过材料才写得出的 ASCII 证据串，这样「只写 none」拿不到分。
4. 字面量只用 ASCII：id、类名、计数值、字符串常量。这样「三个」和「3」的写法差异不会把正确答案判错，代价是题必须设计成答对时必然出现该 ASCII 事实。
5. 两个上限分工：原始回答超过 65,536 B 判 `unscorable`；存进 `answers.ndjson` 的归一化文本另按 4,096 B 截断，摘要与字节数针对这份截断后的文本。前者决定能否评分，后者决定能存多少证据。

评分证据：除了在 `dataset.jsonl` 存回答的 SHA-256 与字节数，构建时还会在同目录写 `answers.ndjson`，存 completed 行的归一化回答文本（每行不超过 4096 字节，过同一套脱敏扫描）。这样第三方可以用同一份 rubric 复算 verdict，不需要相信记录者。两个文件里的 `answerSha256` 与 `answerBytes` 针对同一份归一化文本，逐字节一致，可以直接对账；原始回答文本不落盘，因此不存在另一套无法验证的摘要。`analyze` 会重算并比对，不一致就非零退出。论文不引用回答原文。

已知局限：确定性规则会低估同义但未包含字面量的正确答案。因此另设人工盲检，取 real-provider 数据按 attemptId 排序、每变体前 3 条 pass 与前 3 条 fail 复核，结论只作为评分规则有效性的旁证，不进入主指标。该盲检在冻结时点为 `未执行`，因为还没有 real-provider 数据。

## 6. 统一输入、预算与成本上限

### 6.1 每次尝试的产品上限（不放大、不缩小）

| 项 | 值 | 来源 |
| --- | --- | --- |
| 单次运行总时限 | 120,000 ms | `RUN_LIMITS.runMs` |
| 模型输出 | 4,096 tokens | `RUN_LIMITS.modelOutputTokens` |
| 发送给 Provider 的材料与正文 | 累计 64 KiB | P2 运行合同 §5 |
| 单次尝试工具请求 | 32 次（含拒绝） | `RUN_LIMITS.toolCalls` |
| 单工具并发 | 1 | `RUN_LIMITS.toolConcurrency` |
| 停止宽限 | 5,000 ms | `RUN_LIMITS.stopGraceMs` |
| `read_file` 单文件 | 64 KiB | P2 运行合同 §5 |
| `list_directory` | 200 项 | P2 运行合同 §5 |
| `search_in_files` | 深度 16、1,000 文件、单文件 64 KiB、累计 4 MiB、100 命中 | P2 运行合同 §5 |

### 6.2 正式运行的总上限

| 项 | 上限 | 依据 |
| --- | --- | --- |
| 尝试数 | 72 | 2 变体 × 12 任务 × 3 重复，运行前固定 |
| 输入 tokens | 3,000,000 | 预算停机线，取工程估算 1,474,560 的约 2 倍作安全余量 |
| 输出 tokens | 300,000 | 产品硬上限 72 × 4,096 = 294,912 向上取整 |
| 墙上时间 | 21,600,000 ms（6 小时） | 72 × (120 s + 180 s 准备与收尾) |
| 货币成本 | 取得授权后按当时价目表换算 | 价目表未确认前不写金额 |

停机规则：按固定的 `orderIndex` 顺序执行；每次尝试前检查累计输入 tokens、输出 tokens 与墙上时间，任一项加上本次尝试后可能超限，就把剩余全部尝试记为 `not_run`，原因码 `BUDGET_EXHAUSTED`，并**全部保留在分母内**。已开始的尝试不因预算中断，按产品规则自然收敛或失败。

成本换算：正式运行前从获授权的 Provider 价目表抄录单价、生效日期与来源，成本 = 输入 tokens × 输入单价 + 输出 tokens × 输出单价。价目表未确认前，只以 token 与墙上时间作为上限，不编造价格。

### 6.3 执行顺序

顺序算法固定，不依赖任何随机数生成器的实现细节，可被人手复算：对 24 个任务格各取 `key = seed + '|' + variantId + '|' + taskId`（`seed = m5a-2026-11-03-v1`），算 SHA-256，按十六进制升序排序，名次即 `orderIndex`（1 到 24）。24 个名次与每格的 `cellKeySha256` 前 16 位写在 `protocol.json` 的 `design.orderRandomization.executionOrder`，冻结后用脚本可逐条重算核对。

执行按轮进行：第 1 轮按 `orderIndex` 跑完全部 24 格，再跑第 2 轮、第 3 轮。同一轮内两个变体交错，降低 Provider 侧随时间漂移带来的系统性偏置。每个格的三次重复沿用同一 `orderIndex`。排序只控制执行顺序，不能控制模型自身的随机性。

## 7. 结果分类与分母

分母分三层同时报告，`capture.json` 里登记的 attempt 总数是计划分母，先导子集为 18，正式运行固定为 72。**计划分母在运行前固定，分析阶段只读不改。**

| 层 | 定义 | 用途 |
| --- | --- | --- |
| `plannedDenominator` | 登记尝试数（18 或 72） | 主指标 `completionRate = completed_pass / plannedDenominator` |
| `executedCount` | 有 run 的行数（非 `not_run`） | 次指标 `successRateAmongExecuted = completed_pass / executedCount` |
| `coverage` | `executedCount / plannedDenominator` | 说明有多少计划尝试真的跑了 |

未授权、服务不可用导致的不运行记为 `not_run`，只进计划分母，不进已执行分母，也**不得当成模型答错**。

| status | 含义 | 算成功？ | 进分母？ |
| --- | --- | --- | --- |
| `completed` | 有唯一终态且资源收敛 | 仅当 `verdict=pass` | 是 |
| `failed` | 带固定失败码：`START_FAILED`、`MODEL_FAILED`、`TOOL_FAILED`、`PROTOCOL_ERROR`、`OUTPUT_LIMIT`、`RUN_DEADLINE`、`AUTHORIZATION_REVOKED`、`STOP_TIMEOUT`、`ADAPTER_DISCONNECTED` | 否 | 是 |
| `stopped` | 停止已收敛，原因 `user`、`window_closed`、`deadline`、`authorization_revoked`、`host_failure` | 否 | 是 |
| `unknown` | 崩溃或重启后的历史墓碑 `host_restarted` | 否，不推断回答质量；其 verdict 只是该行文本的匹配记录 | 是 |
| `not_run` | 未执行，原因码写在 `run.notRunReason`：`AUTHORIZATION_MISSING`、`PROVIDER_UNAVAILABLE`、`MATERIAL_MISSING`、`BUDGET_EXHAUSTED`、`OPERATOR_ABORT`、`TOOL_UNAVAILABLE`；`notes` 只放自由文本细节 | 否 | 是 |

超时用派生标记，不新增状态：`timedOut = (failed 且 RUN_DEADLINE) 或 (stopped 且 deadline)`，避免同一个 run 被计两次。

分析用的派生分类：`completed_pass`、`completed_fail`、`completed_unscorable`、`failed`、`stopped`、`unknown`、`not_run`。

分母纪律，写死不许违反：

1. 每条登记尝试必须恰好产生一行记录，缺行视为构建失败，不是跳过。
2. `not_run` 计入分母并单独报告原因码。
3. 失败、超时、取消、`unknown` 一律保留，不得从样本剔除，不得改判为成功。
4. 看到结果后不得补跑未登记尝试、不得改重复次数、不得删任务。补跑必须用新 `attemptId` 和新版本协议，旧 attempt 留在旧分母。
5. 脱敏扫描拒绝的采集包视为构建失败，不得只丢那一行继续出汇总。

## 8. 脱敏记录、字段与版本关联

数据集是一行一条的 JSONL，字段定义在 [record-schema.json](m5a/v1/record-schema.json)。存与不存分开列清：

| 存 | 不存 |
| --- | --- |
| `attemptId`、`rowId` | `dataset.jsonl` 中的任务提示原文 |
| `taskId`、`category`、`promptSha256`、`rubricId` | `dataset.jsonl` 中的模型回答原文 |
| `variantId`、`harnessVersion` | 材料文件内容 |
| `repetition`、`orderIndex` | 绝对路径、盘符、UNC、用户目录 |
| `sessionId`、`projectId`、`runId`、`revision`（opaque id）与 `adapter`（`pi`、`controlled`、`baseline-runner`） | 用户名、邮箱、学号、联系方式 |
| `status`、`failureCode`、`stopReason`、`notRunReason` | API key、`Bearer` 头、凭证片段 |
| `startedAt`、`terminalAt`、`durationMs`、`lastSeq` | 窗口标题、剪贴板、对话转录 |
| `toolCalls` 五项计数 | |
| `usage` 数字与 `source`、`estimated` 分离标记 | |
| `verdict`、`matchedLiterals`、`requiredLiterals`、`answerSha256`、`answerBytes` | |
| `environment`（commit、dirty、平台、Node/Electron、Provider、模型、endpoint origin、corpus id 与清单哈希） | |
| `capture` 三份输入的 SHA-256 | |
| `answers.ndjson` 的归一化回答文本（仅 completed 行，≤4096 B，同样过脱敏扫描） | |

脱敏扫描规则，作用于采集包与 `answers.ndjson` 的每个字符串字段，命中即构建失败并指出文件、行号与字段，不做静默替换：

| 规则 | 形态 |
| --- | --- |
| 盘符绝对路径 | 任意位置出现 `X:\` 或 `X:/` |
| UNC 路径 | 以 `\\` 开头的主机共享路径 |
| POSIX 绝对路径 | `/Users/`、`/home/`、`/tmp/`、`/var/`、`/etc/`、`/opt/`、`/mnt/`、`/root/`、`/private/` 形态 |
| 凭证样式 | `sk-` 后接 8 位以上标识符字符 |
| 认证头 | `Bearer` 后接 8 位以上可见字符 |
| PEM 私钥头 | `-----BEGIN ... PRIVATE KEY-----` |

HTML 与代码片段里的 `</div>`、`/>`、`// 注释` 不得误判为路径。

关联键，保证一条记录能回到任务、运行、配置与软件版本：

| 关联对象 | 键 |
| --- | --- |
| 任务 | `task.taskId` + `task.promptSha256` + `task.rubricId` |
| 运行 | `run.runId` + `run.sessionId` + `run.revision` |
| 配置 | `variant.variantId` + `variant.harnessVersion` + `protocolVersion` |
| 软件 | `environment.softwareCommit` + `dirty` + 平台与 Node/Electron 版本 |
| Provider | `environment.provider` + `modelId` + `endpointOrigin` |
| 材料 | `environment.corpusId` + `corpusManifestSha256` |
| 原始采集 | `capture.captureManifestSha256` + `journalSha256` + `eventsSha256` |

## 9. 分析步骤

固定步骤，写在 [analysis-plan.json](m5a/v1/analysis-plan.json)，按顺序执行：

1. `freeze --verify` 通过，否则停止。
2. 逐行按 schema 与不变量校验，缺行或重复 `attemptId` 即失败。
3. 算三层分母：`plannedDenominator`（断言等于登记数）、`executedCount`、`coverage`。
4. 按 status 与 verdict 计数，派生 `timedOut` 与 `outcomeClass`。
5. 主比率 `completionRate = completed_pass / plannedDenominator`；次比率 `successRateAmongExecuted = completed_pass / executedCount`。
6. 若有 `answers.ndjson`，用同一 rubric 重算 completed 行的 verdict 并与数据集比对；不一致即失败。
7. usage 覆盖率：`reported` 与 `missing` 计数，均值只在 `reported` 行上算，缺值不补 0，`estimated` 单独成列。
8. 耗时：对 `durationMs` 非 null 的行给中位数与 p90，并给出排除计数。
9. 任务级主分析：每个 taskId 在两个变体下各 3 次重复的 pass 数、成功率、差值；12 个差值给等权均值、min、median、max 与完整分布。
10. 探索性精确符号检验：对 12 个任务差值做双侧符号检验，只标 `exploratory-only`。
11. 按变体、按变体 × 任务类别聚合步骤 4 到 8。
12. attempt 级比例与 Wilson 区间，字段名带 `descriptiveAttemptLevel`。
13. 输出 `summary.json` 与 `summary.md`，每个数字由程序生成，不手工编辑。

统计口径：主结论只看任务级差值分布，不做显著性宣称。重复是可靠性重复，不是独立试验，配对单位是任务。12 个单位太少，符号检验只作方向性旁证。attempt 级 Wilson 区间在 n=72 时半宽约 0.1125、单变体 n=36 时约 0.1553，但这套区间把尝试当独立样本，与设计不符，只能用来描述本次数据，不能当主结论。

## 10. 冻结与变更规则

冻结清单覆盖四份 v1 JSON 与 `tools/experiments` 下全部 `.mjs`。校验命令：

```powershell
node tools/experiments/freeze.mjs --protocol-dir docs/experiments/m5a/v1 --verify
```

| 规则 | 内容 |
| --- | --- |
| R1 | 影响任务内容、评分规则、指标定义、分母、预算、变体定义、提示模板、模型参数、执行顺序或随机种子的改动，必须升 `protocolVersion` 并新建 `v2/` 目录；v1 数据不得重算或并入 v2 分母。 |
| R2 | 不影响上述语义的纯文字勘误，记入 `docs/experiments/m5a/errata.md` 后重生成清单，可以不升版本；一旦存在 real-provider 数据，勘误同样必须升版本。 |
| R3 | 正式运行开始后不得新增或删除任务、不得修改评分字面量、不得调整执行顺序。 |
| R4 | 发现评分实现缺陷时，保留旧版本与旧数据，用新版本重新评分并同时报告新旧结果，不得只覆盖旧结果。 |
| R5 | 正式运行前后各跑一次 `--verify` 并归档输出；verify 失败时不得开始或采信该批数据。 |
| R6 | 每次变更写明动机、时间、影响的数据版本，并在 #29 留下记录。 |

### 10.1 外部方法学评审与处理

冻结前把方案发给用户自己的 ChatGPT（voyager 通道，会话链接在 `protocol.json` 的 `externalReview`）做了一轮方法学审查。它属于外部参考数据，不是授权，也不是结论。采纳与不采纳都记在 `protocol.json`，要点：

| 意见 | 处理 |
| --- | --- |
| 72 次尝试不是独立样本，统计单位应是 12 个任务 | 采纳。主分析改为任务级配对差值，attempt 级区间降为描述 |
| usage 全为 null 时 token 不能当主指标 | 采纳。token 降为次指标并报覆盖率，`missing` 不补 0 |
| 分母应区分计划尝试与实际运行 | 采纳。增加 `plannedDenominator`、`executedCount`、`coverage` 三层 |
| 只存回答哈希无法独立复核评分 | 采纳。增加 `answers.ndjson` 归一化回答，供第三方复算 verdict |
| 变体命名暗示单因子差异 | 采纳。V0 改名为 `fixed-prefix-no-tools` |
| 冻结范围应含提示模板、模型参数、评分源码 | 采纳。写进 R1 与冻结清单覆盖范围 |
| 改为 JSON 结构输出并单列格式合规指标 | 不采纳。会新增格式失败这一失败模式并扩大实现面；改用 ANSWER 末行 + 字面量，残余限制写入第 13 节 |
| 用任务级聚类自助法区间 | 不采纳。12 个单位下区间本身不稳定；改为给差值分布与精确符号检验并标 exploratory |


### 11.1 受控流程先导（证据级别 controlled）

用合成的、符合 schema 的采集包走通「采集 → 构建数据集 → 汇总 → 冻结校验」整条链路，覆盖缺 usage、失败、停止、deadline、`host_restarted` 墓碑与 `not_run` 六种边界。产物在 `docs/experiments/m5a/pilot-controlled/`，采集包在 `docs/experiments/m5a/captures/`。

这一部分的定位必须说清：它验证的是记录与分析流程正确，**不是真实模型结果**，不支撑任何 Harness 效果结论，也不进入论文的结果章节。具体行数、分母、完成率与 usage 覆盖率以该目录 `report.md` 与 `summary.json` 为准；本文下面那张表是冻结时点一次运行的转录，重跑后如有差异以后两者为准。

冻结时点实际跑出的流程数字如下，全部来自 `build-report.json` 与 `summary.json`，只说明链路跑通，不作效果解释：

| 项 | 值 |
| --- | --- |
| 采集包 | 2 个，接受 2，拒绝 0 |
| 数据集行 / answers 行 | 18 / 12 |
| planned / executed / coverage | 18 / 16 / 0.8889 |
| status 分布 | completed 12、failed 2、stopped 1、unknown 1、not_run 2 |
| usage 覆盖 | reported 7、missing 11，覆盖率 0.3889 |
| answers 复算一致性 | checked 12、matched 12、mismatched 0 |
| 边界覆盖 | 缺 usage、`MODEL_FAILED`、`RUN_DEADLINE`、用户停止、`host_restarted` 墓碑、两类 `not_run` 各至少 1 条 |

受控采集包的 `environment.provider`、`modelId` 写 `none`，`endpointOrigin` 写 `https://none.invalid`，避免把合成数据读成真实调用；`softwareCommit`、平台与 Node/Electron 版本用本机真实值。

### 11.2 真实模型先导（NOT_RUN）

状态：`NOT_RUN`。原因：没有具体 Provider、模型与外发材料的授权；按 #29 与 P2 运行合同，票据 ready 不自动授予真实调用许可，也不从 #13 的历史授权推导。

记录与所需授权字段见 [real-pilot-status.md](m5a/real-pilot-status.md)。另有一个前置缺口必须点名：产品当前只把 journal 落到 userData，事件流只在内存环形缓冲里，没有导出成 `capture.json` + `journal.ndjson` + `events.ndjson` 的入口。正式运行前必须先决定在 main 增加受控导出命令，还是用独立驱动脚本按同一 wire 格式写采集包；本票只记录这个缺口，不实现入口。补齐授权后按该文件列出的命令执行，产物必须是 `evidenceKind=real-provider` 的新数据集目录，不得覆盖受控先导的产物。

## 12. 完成条件对照

| # | 票据完成条件 | 证据 | 状态 |
| --- | --- | --- | --- |
| 1 | 有可审阅的比较问题、任务类别、评分规则、基线和变体说明 | 本文第 2、3、4、5 节（含 V0 可见窗口与结构性不可答披露）；`protocol.json`；`tasks.json` | 完成 |
| 2 | 定义统一输入、运行预算、失败/超时/取消/未运行处理规则及所有预定尝试的分母 | 本文第 6、7 节；`protocol.json` 的 `budgets`、`outcomes`、`denominator` | 完成 |
| 3 | 输出先导结果或明确未运行原因；真实先导未完成不能把正式样本和成本已验证标为完成 | 第 11.1 节受控先导；第 11.2 节 `NOT_RUN` 记录 | 部分完成：受控先导已完成，真实先导未运行且已如实记录 |
| 4 | 样本量、重复次数与成本上限有先导或可解释的可行性依据，并在正式运行前固定 | 本文 6.2、6.3 节；`protocol.json` 的 `design.sampleSizeBasis` 与 `budgets.formalRunCap` | 部分完成：依据是可解释上界，未由真实先导验证 |
| 5 | 脱敏记录、数据字段与分析步骤能关联任务、运行、配置和软件版本 | 本文第 8、9 节；`record-schema.json`；`analysis-plan.json`；`answers.ndjson` 复算路径；`tools/experiments` 与其测试 | 完成（流程已验证，真实数据未产生） |
| 6 | 保存冻结版本及变更规则，后续方案调整与旧数据严格区分 | 本文第 10 节；`freeze-manifest.json`；`freeze --verify` 输出 | 完成 |

未完成的两项必须在 #29 的 resolution 里同样标注，不能用「受控先导已跑通」顶替真实先导。

## 13. 限制

1. 因子混淆：V1 与 V0 同时改变了上下文装配与工具可用性，不做单因子归因。
2. 没有功效分析：72 次尝试只支撑描述性统计，Wilson 区间半宽约 0.1125（合并）与 0.1553（单变体）。
3. 确定性字面量评分会低估同义正确回答；靠 ASCII 事实设计、ANSWER 末行格式与盲检旁证缓解，不消除。ANSWER 格式本身不计分，格式不合规只会让字面量检查更容易失败。
4. `answers.ndjson` 存的是归一化后的回答文本，只用于本地与授权范围内复算评分；它含公开材料派生内容，论文不引用原文，交付归档时按需裁剪。
5. 单一 Provider、单一模型，不覆盖模型版本漂移的跨版本可比性。
6. 材料是 M1 原型页面，不是真实用户项目；结论只适用于同类只读检索任务。
7. 120 秒总时限会截断长任务；超时按失败计入，不重跑成成功。
8. 现有适配器不读取 usage 时，token 指标只覆盖 `reported` 子集，覆盖率必须随结果一起报告。
9. 没有真实用户研究，不能把界面设计覆盖当作可用性结论。
10. V0 是刻意弱的基线，且材料前缀只覆盖 `demos/00` 的前 44.9%；11 条任务的证据落在可见窗口外。这使 V0 的完成率接近结构性下限，只能说明该配置在此预算下的表现，不能说明「长上下文模型不行」。
11. 采集导出入口尚不存在，真实先导开跑前必须先补，否则无法产生符合冻结格式的采集包。

## 14. 复现命令

```powershell
# 1. 冻结校验（正式运行前后各一次）
node tools/experiments/freeze.mjs --protocol-dir docs/experiments/m5a/v1 --verify

# 2. 从采集包构建数据集
node tools/experiments/build-dataset.mjs --captures docs/experiments/m5a/captures --tasks docs/experiments/m5a/v1/tasks.json --out docs/experiments/m5a/pilot-controlled

# 3. 重算汇总
node tools/experiments/analyze.mjs --dataset docs/experiments/m5a/pilot-controlled/dataset.jsonl --protocol docs/experiments/m5a/v1/protocol.json --plan docs/experiments/m5a/v1/analysis-plan.json --out docs/experiments/m5a/pilot-controlled

# 4. 记录与分析链路的自动测试
pnpm test:experiments
```
