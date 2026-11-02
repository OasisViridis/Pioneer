# M5-A 受控先导报告：记录与分析流程验证

| 项           | 值                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 记录时间     | 2026-11-03（Asia/Shanghai）                                                                                                                                                           |
| 证据级别     | `controlled`                                                                                                                                                                          |
| 分支 / 基线  | `feat/m5a-experiment-freeze`，基线提交 `13ccfe5f0c9f8cc376aec08eb21cd91162719237`                                                                                                     |
| 采集包       | `docs/experiments/m5a/captures/controlled-v0/`、`docs/experiments/m5a/captures/controlled-v1/`                                                                                        |
| 本目录产物   | [dataset.jsonl](dataset.jsonl)、[build-report.json](build-report.json)、[summary.json](summary.json)、[summary.md](summary.md)、[answers.ndjson](answers.ndjson)、report.md（本文件） |
| 真实模型先导 | NOT_RUN，原因见 [real-pilot-status.md](../real-pilot-status.md)                                                                                                                       |

## 0. 结论

1. 本次 `evidenceKind = controlled`。**这不是真实模型结果，只验证记录与分析流程**，本目录的任何数字都不支撑 Harness 效果结论，也不能进入论文结果章节。
2. build 接受 2 个采集包、拒绝 0 个，写出 18 行数据集与 12 条 `answers.ndjson`；analyze 退出码 0，`plannedDenominator=18`、`executedCount=16`，`answers.ndjson` 复算 12 条全部一致。
3. 受控数据覆盖了缺 usage、failed、stopped、deadline、tombstone(unknown)、not_run 六类边界，工具对每一类的分类都与预期一致；`t01` 在 V0 判 0/3、V1 判 3/3，说明确定性评分与按任务聚合能区分两个变体。
4. 冻结链路已经补上：本轮开始时 `freeze --verify` 因缺少 `freeze-manifest.json` 退出 1，Lead 随后生成清单，最终 `freeze --verify` 退出 0 并输出 `verified 13 files against freeze-manifest.json`。

## 1. 这是什么，不是什么

是：用**合成但 schema 合法**的采集包，把 `build-dataset.mjs` → `analyze.mjs` 这条链路跑通，验证采集包格式、脱敏扫描、确定性评分、journal 状态推导、分母规则、usage 缺失处理、耗时分布与按变体聚合都能按 [protocol.json](../v1/protocol.json) 与 [analysis-plan.json](../v1/analysis-plan.json) 的口径产出结果。

不是：

1. 不是 DeepSeek 或任何 Provider 的响应。本轮没有 Provider、模型、外发材料授权，一个真实请求都没有发。
2. 不是 token 实测。7 条 `usage.source=reported` 的数字是编造的占位值，只用来验证 reported 分支与聚合。
3. 不是耗时实测。`startedAt` / `terminalAt` / `durationMs` 全部由固定时间戳推导。
4. 不是效果证据。`controlled` 数据按 [docs/experiments/README.md](../../README.md) 的定义只能支撑「流程正确」。

采集包本身的构造说明与逐条造法在 [captures/README.md](../captures/README.md)。

## 2. 数据怎么来的

### 2.1 采集包结构

两个采集包，一个变体一个目录，合计 18 条登记 attempt（3 个任务 × 3 次重复 × 2 个变体）：

| 采集包        | variantId                | attempt | notRun | journal 记录 | events | dataset 行 | answers |
| ------------- | ------------------------ | ------- | ------ | ------------ | ------ | ---------- | ------- |
| controlled-v0 | `fixed-prefix-no-tools`  | 9       | 1      | 16           | 33     | 9          | 5       |
| controlled-v1 | `pioneer-readonly-tools` | 9       | 1      | 16           | 70     | 9          | 7       |

以上数字取自 [build-report.json](build-report.json) 的 `captures[].attemptCount`、`rowCount`、`answerCount` 与 `totals`。

每个采集包含 `capture.json`（严格字段）、`journal.ndjson`（accept/terminal/tombstone）、`events.ndjson`（`version: 1` 的 `RunEvent`）。journal 与 event 的字段照 `apps/desktop/src/main/harness/run-journal.ts` 与 `apps/desktop/src/shared/contracts/pioneer-run.ts` 写，事件顺序照真实宿主的 `run-manager.ts`：deadline 停止先发 `run.stop_requested{deadline}`，再取消在飞工具调用，最后 `run.failed{RUN_DEADLINE}`。

两个采集包的 journal accept、events 与 dataset 行都写 `adapter: "controlled"`，不是 `pi`。三种取值的语义：`pi` 是产品 pi 适配器，V1 正式运行时由它写 journal 与事件；`controlled` 是产品确定性适配器，或代它写记录的受控采集器（本先导属于后者）；`baseline-runner` 是正式运行时 V0 的采集者，V0 不经过产品 Run host，永不是产品 Run host。两条 `not_run` 行没有 run，`adapter` 为 `null`。

`orderIndex` 按冻结表 `protocol.json:design.orderRandomization.executionOrder` 取值，同格三次重复共用：V1 `t01=2`、`t02=23`、`t03=4`；V0 `t01=12`、`t02=1`、`t03=3`。采集包顶层 `capture.json.orderIndex` 是该变体最小的格序号（v0 为 1、v1 为 2），逐格值在 `attempts[]` 里。

### 2.2 每个状态怎么造

| attempt | 变体 | 任务/重复 | 造法                                                                                                                                                         |
| ------- | ---- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| a-0001  | V0   | t01/r1    | `completed`，`usage` 两个数字齐全（reported）；回答缺 t01 必需字面量，判 fail                                                                                |
| a-0002  | V0   | t01/r2    | `completed`，`usage: null`（missing）；回答同样缺字面量，判 fail                                                                                             |
| a-0003  | V0   | t01/r3    | `failed`，固定失败码 `MODEL_FAILED`                                                                                                                          |
| a-0004  | V0   | t02/r1    | `completed`，缺 usage；回答含 t02 两个字面量，判 pass                                                                                                        |
| a-0005  | V0   | t02/r2    | `not_run`，原因码 `AUTHORIZATION_MISSING`，只出现在 `capture.json.notRun[]`，无 journal、无 events；数据集行 `run.notRunReason` 记该码、`adapter` 为 `null`  |
| a-0006  | V0   | t02/r3    | `stopped`，`run.stop_requested{reason:"user"}`                                                                                                               |
| a-0007  | V0   | t03/r1    | `completed`，reported usage，判 pass                                                                                                                         |
| a-0008  | V0   | t03/r2    | `completed`，缺 usage，判 pass                                                                                                                               |
| a-0009  | V0   | t03/r3    | 宿主崩溃：journal 只有 accept 与 `tombstone{host_restarted}`，没有 terminal；events 以 `run.unknown{host_restarted}` 收尾                                    |
| a-0010  | V1   | t01/r1    | `completed`，reported usage，2 次工具调用，判 pass                                                                                                           |
| a-0011  | V1   | t01/r2    | `completed`，`run.completed.usage = {inputTokens:null, outputTokens:null}`（真实宿主在适配器不报 usage 时的形态），判 pass                                   |
| a-0012  | V1   | t01/r3    | `completed`，reported usage，3 次工具调用，判 pass                                                                                                           |
| a-0013  | V1   | t02/r1    | `completed`，reported usage，判 pass                                                                                                                         |
| a-0014  | V1   | t02/r2    | 120 秒时限：`run.stop_requested{deadline}`、1 次 `tool.result{cancelled}`、`run.failed{RUN_DEADLINE}`，journal terminal `status=failed`、`code=RUN_DEADLINE` |
| a-0015  | V1   | t02/r3    | `not_run`，原因码 `PROVIDER_UNAVAILABLE`；数据集行 `run.notRunReason` 记该码、`adapter` 为 `null`                                                            |
| a-0016  | V1   | t03/r1    | `completed`，reported usage，判 pass                                                                                                                         |
| a-0017  | V1   | t03/r2    | `completed`，缺 usage，判 pass                                                                                                                               |
| a-0018  | V1   | t03/r3    | `completed`，reported usage，1 次工具调用，判 pass                                                                                                           |

### 2.3 边界覆盖与工具的实际分类

下表右侧三列直接抄自 [dataset.jsonl](dataset.jsonl)，不是预期值。

| attemptId | 变体 | 任务/重复 | status    | failureCode  | stopReason | verdict    | usage    | durationMs | lastSeq | 工具请求 |
| --------- | ---- | --------- | --------- | ------------ | ---------- | ---------- | -------- | ---------- | ------- | -------- |
| a-0001    | V0   | t01/r1    | completed | null         | null       | fail       | reported | 12400      | 4       | 0        |
| a-0002    | V0   | t01/r2    | completed | null         | null       | fail       | missing  | 11100      | 4       | 0        |
| a-0003    | V0   | t01/r3    | failed    | MODEL_FAILED | null       | fail       | missing  | 8600       | 4       | 0        |
| a-0004    | V0   | t02/r1    | completed | null         | null       | pass       | missing  | 15800      | 4       | 0        |
| a-0005    | V0   | t02/r2    | not_run   | null         | null       | not_run    | missing  | null       | null    | 0        |
| a-0006    | V0   | t02/r3    | stopped   | null         | user       | pass       | missing  | 4300       | 5       | 0        |
| a-0007    | V0   | t03/r1    | completed | null         | null       | pass       | reported | 17600      | 4       | 0        |
| a-0008    | V0   | t03/r2    | completed | null         | null       | pass       | missing  | 15200      | 4       | 0        |
| a-0009    | V0   | t03/r3    | unknown   | null         | null       | fail       | missing  | null       | 4       | 0        |
| a-0010    | V1   | t01/r1    | completed | null         | null       | pass       | reported | 23400      | 8       | 2        |
| a-0011    | V1   | t01/r2    | completed | null         | null       | pass       | missing  | 19800      | 10      | 3        |
| a-0012    | V1   | t01/r3    | completed | null         | null       | pass       | reported | 22100      | 10      | 3        |
| a-0013    | V1   | t02/r1    | completed | null         | null       | pass       | reported | 26500      | 8       | 2        |
| a-0014    | V1   | t02/r2    | failed    | RUN_DEADLINE | null       | unscorable | missing  | 120000     | 10      | 3        |
| a-0015    | V1   | t02/r3    | not_run   | null         | null       | not_run    | missing  | null       | null    | 0        |
| a-0016    | V1   | t03/r1    | completed | null         | null       | pass       | reported | 31200      | 8       | 2        |
| a-0017    | V1   | t03/r2    | completed | null         | null       | pass       | missing  | 28900      | 10      | 3        |
| a-0018    | V1   | t03/r3    | completed | null         | null       | pass       | reported | 30100      | 6       | 1        |

逐项核对结果：

1. 缺 usage 共 5 条 `completed`（a-0002、a-0004、a-0008、a-0011、a-0017），`usage.source` 全部是 `missing`，两个 token 字段保持 `null`，没有被填 0。
2. `failed` 2 条：a-0003 为 `MODEL_FAILED`，a-0014 为 `RUN_DEADLINE`；两条的 `stopReason` 都是 `null`，符合「`stopReason` 非空当且仅当 `stopped`」。
3. `stopped` 1 条：a-0006，`stopReason=user`。
4. `unknown` 1 条：a-0009，`terminalAt` 与 `durationMs` 均为 `null`，`notes=host_restarted`。
5. `not_run` 2 条：a-0005、a-0015，`runId`/`sessionId`/`projectId` 全为 `null`，`verdict=not_run`，`notes` 带原因码。
6. 变体差异：`t01` 在 V0 是 0 次 pass（a-0001、a-0002 判 fail，a-0003 失败），在 V1 是 3 次 pass（a-0010、a-0011、a-0012）；`t02` 与 `t03` 在两个变体都有 pass 行，不是单向摆拍。

## 3. 流程验证结果

### 3.1 build

命令与输出（工作目录为 worktree 根）：

```text
node tools/experiments/build-dataset.mjs --captures docs/experiments/m5a/captures --tasks docs/experiments/m5a/v1/tasks.json --out docs/experiments/m5a/pilot-controlled
experiment:build-dataset: wrote 18 rows and 12 answers from 2 capture(s) to docs/experiments/m5a/pilot-controlled
EXITCODE=0
```

[build-report.json](build-report.json)：`totals.captures=2`、`totals.accepted=2`、`totals.rejected=0`、`totals.rows=18`、`totals.answers=12`、`errors=[]`；两个采集包的 `attemptCount` 都是 9，`rowCount` 都是 9，`errors` 都是空数组。`corpus.verified=true`、`corpus.fileCount=6`、`corpus.totalBytes=396500`、`corpus.manifestSha256=1557594d...`：build 重算了 `demos/` 六个文件的 sha256 与字节数，并与采集包的 `environment.corpusManifestSha256` 对上。

### 3.2 analyze

本轮开始时，冻结方案与目录说明里写的 analyze 命令都不带 `--tasks`，照文档执行会失败（保留为发现记录）：

```text
node tools/experiments/analyze.mjs --dataset docs/experiments/m5a/pilot-controlled/dataset.jsonl --protocol docs/experiments/m5a/v1/protocol.json --plan docs/experiments/m5a/v1/analysis-plan.json --out docs/experiments/m5a/pilot-controlled
experiment:analyze: missing required option --tasks
EXITCODE=1
```

本轮内两处文档已补上 `--tasks`（`analysis-plan.json:recomputeCommand` 与 [docs/experiments/README.md](../../README.md) 第 47 行），下面这条当前冻结口径的命令执行成功：

```text
node tools/experiments/analyze.mjs --dataset docs/experiments/m5a/pilot-controlled/dataset.jsonl --tasks docs/experiments/m5a/v1/tasks.json --protocol docs/experiments/m5a/v1/protocol.json --plan docs/experiments/m5a/v1/analysis-plan.json --out docs/experiments/m5a/pilot-controlled
experiment:analyze: wrote summary.json and summary.md to docs/experiments/m5a/pilot-controlled (plannedDenominator=18, executedCount=16)
EXITCODE=0
```

`analyze` 自动发现同目录的 [answers.ndjson](answers.ndjson)，重跑评分后给出 `checked: 12, matched: 12, mismatched: 0, skipped: 0`（`summary.json:answersVerification`），没有因为判定不一致而退出非零。

### 3.3 分母与计数

| 指标                                                                | 值                                              | 出处                                          |
| ------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------- |
| plannedDenominator                                                  | 18                                              | `summary.json:denominator.plannedDenominator` |
| executedCount                                                       | 16                                              | `summary.json:denominator.executedCount`      |
| coverage                                                            | 0.8889                                          | `summary.json:denominator.coverage`           |
| completed / failed / stopped / unknown / not_run                    | 12 / 2 / 1 / 1 / 2                              | `summary.json:counts.status`                  |
| verdictCounts（含全部行，仅作说明）                                 | pass 11 / fail 4 / unscorable 1 / not_run 2     | `summary.json:counts.verdictCounts`           |
| completedVerdictCounts（只统计 completed 行）                       | pass 10 / fail 2 / unscorable 0 / not_run 0     | `summary.json:counts.completedVerdictCounts`  |
| outcomeClass completed_pass / completed_fail / completed_unscorable | 10 / 2 / 0                                      | `summary.json:counts.outcomeClass`            |
| timedOut                                                            | 1                                               | `summary.json:counts.timedOut`                |
| failureCode MODEL_FAILED / RUN_DEADLINE                             | 1 / 1                                           | `summary.json:counts.failureCodes`            |
| stopReason user                                                     | 1                                               | `summary.json:counts.stopReasons`             |
| not_run 原因码                                                      | AUTHORIZATION_MISSING=1、PROVIDER_UNAVAILABLE=1 | `summary.json:counts.notRunReasons`           |

分母 18 等于两个采集包 `capture.json.attempts` 的总数，`not_run` 的 2 条计入分母、不计入 `executedCount`，也没有被当成答错或剔除。

`counts.verdictCounts.pass=11` 与 `counts.completedVerdictCounts.pass=10` 相差 1，差的是 a-0006：它的回答满足 t02 的字面量，但状态是 `stopped`，所以只出现在全行计数里，不进 `completedPass`。这是 [analysis-plan.json](../v1/analysis-plan.json) 的 `verdictCounting` 规则要的效果，不是统计错误。`summary.json:counts.countsOnlyMeaningfulForCompleted=true` 与 `summary.md` 的「completed 行的 verdict」小节也把这条口径写了出来。

### 3.4 完成率与区间

| 指标                                       | 分子/分母 | 点估计 | Wilson 95%       | 出处                                    |
| ------------------------------------------ | --------- | ------ | ---------------- | --------------------------------------- |
| completionRate（completed_pass / planned） | 10 / 18   | 0.5556 | [0.3372, 0.7544] | `summary.json:completionRate`           |
| successRateAmongExecuted                   | 10 / 16   | 0.6250 | [0.3864, 0.8152] | `summary.json:successRateAmongExecuted` |

按变体：

| variantId              | planned | executed | completed_pass | completionRate | successRateAmongExecuted | usage reported | medianMs | p90Ms |
| ---------------------- | ------- | -------- | -------------- | -------------- | ------------------------ | -------------- | -------- | ----- |
| fixed-prefix-no-tools  | 9       | 8        | 3              | 0.3333         | 0.3750                   | 2              | 12400    | 16520 |
| pioneer-readonly-tools | 9       | 8        | 7              | 0.7778         | 0.8750                   | 5              | 27700    | 57840 |

出处：`summary.json:byVariant[]`。

按任务（主分析单位是任务，重复不是独立试验）：

| taskId | V0 pass/attempts | V1 pass/attempts | 差值（V1 - V0） | 每格 pass 分布 | majorityPass（V0 / V1） |
| ------ | ---------------- | ---------------- | --------------- | -------------- | ----------------------- |
| t01    | 0/3              | 3/3              | 1.0000          | 0 与 3         | not_pass / pass         |
| t02    | 1/3              | 1/3              | 0.0000          | 1 与 1         | not_pass / not_pass     |
| t03    | 2/3              | 3/3              | 0.3333          | 2 与 3         | pass / pass             |

`summary.json:taskLevel.summary` 给出 `meanDifference=0.4444`、`medianDifference=0.3333`、`maxDifference=1`；`summary.json:exploratorySignTest` 给出 `n=2`、`positive=2`、`negative=0`、`zero=1`、`pValue=0.5`，标签是 `exploratory-only`。3 个任务的符号检验没有解释力，这里只记录它能算出来。

### 3.5 usage 覆盖率

| planned | executed | reported | missing | estimated | coverageRate | reportedAmongExecuted |
| ------- | -------- | -------- | ------- | --------- | ------------ | --------------------- |
| 18      | 16       | 7        | 11      | 0         | 0.3889       | 0.4375                |

reported 子集的 token 统计（`summary.json:usageCoverage`）：输入 count=7、mean=7305、median=4102、total=51136；输出 count=7、mean=158、median=156、total=1107。这些数字来自 2.2 表里编造的 usage，不是真实用量。

缺 usage 的两种事件形态都被正确归到 `missing`：a-0002、a-0004、a-0008、a-0017 用 `run.completed.usage = null`，a-0011 用真实宿主的 `{inputTokens: null, outputTokens: null}`，两种都没有被填 0，也没有被算进 reported 的均值。

### 3.6 耗时

`summary.json:duration`：count=15、median=19800 ms、p90=30760 ms；排除 `not_run=2`、`unknown=1`、其他缺时间=0；`completed_pass` 子集 count=10、median=22750 ms。耗时全部由合成时间戳推导。

### 3.7 工具调用

`summary.json:toolCalls`：requested=19、succeeded=17、rejected=1、failed=0、cancelled=1，`meanRequested=1`。这 19 次请求全部来自 V1 的 8 条 run；V0 的 run 一条工具事件都没有，`toolCalls` 全为 0，与「V0 禁用工具」一致。被拒绝的那次用 `PATH_OUTSIDE_PROJECT`，被取消的那次来自 a-0014 的 deadline 停止。

### 3.8 answers.ndjson 与回答摘要

[answers.ndjson](answers.ndjson) 由 build 生成，12 行，等于 `completed` 行数 12。每行含 `attemptId`、`taskId`、`variantId`、`normalizedAnswer` 与它的 `answerSha256`、`answerBytes`。

`normalizedAnswer` 是 canonical 文本：`canonicalAnswerText(answerText) = truncateUtf8(normalizeForMatch(answerText), 4096)`，定义在 `tools/experiments/lib/record.mjs:1195`。`dataset.jsonl` 的 `result.answerSha256` / `result.answerBytes` 与 answers 行里的同一对字段都由这段 canonical 文本算出，按构造逐字节相同（`scoreAnswer` 与 `buildCaptureResult` 共用同一个值，见 `record.mjs:1233` 与 `record.mjs:1566`）。

对实际产物逐行核对，12 条 completed 全部相等，0 条不一致：

```text
node -e "const fs=require('fs');const L=(f)=>fs.readFileSync(f,'utf8').split(String.fromCharCode(10)).filter(Boolean).map(JSON.parse);const r=L('docs/experiments/m5a/pilot-controlled/dataset.jsonl').filter(x=>x.run.status==='completed');const a=new Map(L('docs/experiments/m5a/pilot-controlled/answers.ndjson').map(x=>[x.attemptId,x]));const bad=r.filter(x=>{const y=a.get(x.attemptId);return !y||y.answerSha256!==x.result.answerSha256||y.answerBytes!==x.result.answerBytes});console.log('completed='+r.length,'answers='+a.size,'mismatched='+bad.length);"
completed=12 answers=12 mismatched=0
EXIT=0
```

仓库侧还有一条正式用例覆盖同一契约：`node --test tests/experiments/build-dataset.test.mjs` 的「answers.ndjson hash and bytes equal the dataset row for every answer」断言 `row.result.answerSha256 === answer.answerSha256` 与字节数相等（`tests/experiments/build-dataset.test.mjs:112` 到 `:113`），本轮 7 个用例全过、退出码 0。

`analyze` 用同一份 `tasks.json` 的 rubric 对 12 条重跑评分，结果 12 条全部一致（`summary.json:answersVerification.checked=12`、`matched=12`、`mismatched=0`）。因此第三方拿到 `answers.ndjson` 与 [tasks.json](../v1/tasks.json) 就能独立复算每个 `completed` 行的 verdict，也能用 `answerSha256` / `answerBytes` 直接对上 dataset 行，不需要原始回答文本。

### 3.9 独立复核

除工具输出外，我用 `tools/experiments/lib/record.mjs` 的校验函数与一段只读脚本复核了以下内容，全部通过（0 条问题）：

1. 18 个登记 attemptId 与 18 行 dataset 的 attemptId 集合完全相等，无重复、无缺行。
2. record-schema 的交叉不变量：`usage.source=missing` 当且仅当两个 token 为 null；`completed` 无 failureCode 与 stopReason；`failed` 有合法失败码且无 stopReason；`stopped` 有合法 stopReason；`unknown` 无 terminalAt；`not_run` 的 run 标识全 null、`adapter` 为 null、`notRunReason` 非空且属枚举、`verdict=not_run`、`notes` 非空；其余行的 `notRunReason` 为 null。
3. `answers.ndjson` 的 attemptId 集合等于 `completed` 行集合。
4. `dataset.jsonl` 的 `result.answerSha256` / `result.answerBytes` 与 `answers.ndjson` 对应字段逐行相等（12 条 completed，0 条不一致）。
5. dataset 与 answers 都不含任务提示原文、不含凭证/盘符/UNC 形态字符串。

### 3.10 冻结校验

```text
node tools/experiments/freeze.mjs --protocol-dir docs/experiments/m5a/v1 --verify
experiment:freeze: verified 13 files against freeze-manifest.json
EXIT=0
```

[freeze-manifest.json](../v1/freeze-manifest.json) 由 Lead 用 `--write` 生成（2340 字节，sha256 `19428e35bb2fcab7a7ee40fbd26ac627ec4005f46c9e798c84852c316ef31a67`），`frozenAt` 是 `2026-11-02T17:56:58.667Z`，覆盖 v1 目录四个 JSON（protocol、tasks、analysis-plan、record-schema）与 `tools/experiments` 下 9 个 `.mjs`（analyze、build-dataset、freeze 与 lib 下 6 个），共 13 个文件。本轮开始时清单还不存在，`--verify` 退出 1；这条证据是在清单定稿后补跑的。

### 3.11 本版新增的自检与口径

1. `analyze` 现在自己跑三道检查：① 读 `freeze-manifest.json`，重算 `protocol.json` 与 `tasks.json` 的哈希并比对，漂移直接非零退出；② 读同目录 `build-report.json`，断言 `sum(attemptCount) === sum(rowCount) === 18`，`plannedDenominator` 取自 build-report 而不是数 dataset 行数；③ 缺 `build-report.json` 或哈希漂移都非零退出。本轮这条链在交付物上成立，`summary.json:inputs.buildReport` 记了 build-report 的 sha256 与字节数。
2. `build` 现在重算语料 6 个文件的 sha256 与字节数并校验 `corpusManifestSha256`，不一致直接拒绝采集包；`build-report.json:corpus.verified=true` 是本轮的校验结果。
3. `run.notRunReason` 是结构化字段（6 个原因码的枚举），只在 `not_run` 行非空；`notes` 只放自由文本，不再需要从 `notes` 里解析原因码。a-0005 的 `run.notRunReason=AUTHORIZATION_MISSING`、a-0015 是 `PROVIDER_UNAVAILABLE`，两行 `adapter` 都是 `null`。
4. `contains_all` 现在支持 `forbidden`（AND 语义）：必须全部命中 `literals`，且不得出现任何 `forbidden`。t10 到 t12 改成 `contains_all` + `["none", 证据串]` + 原来的 forbidden，所以「只写 ANSWER: none」判 fail，必须同时给出证据串（t10 是 `pioneer-nav-hud-script`、t11 是 `viewSettings`、t12 是 `Disallowed changes`）。先导只跑 t01 到 t03，这条规则没有在 t10 到 t12 上执行过。
5. 在 `tmp/` 下用同一份采集包重跑 build 与 analyze，`dataset.jsonl`（`0d8cbc1b...`）、`answers.ndjson`（`86607036...`）、`build-report.json`（`5101248a...`）与交付目录逐字节相同，`summary.json` 只差 `generatedAt` 与输入路径，说明这批产物可复算。

## 4. 发现的问题

### 4.1 文档与命令不一致

1. analyze 的 `--tasks` 在本轮开始时漏在 [analysis-plan.json](../v1/analysis-plan.json) 的 `recomputeCommand` 与 [docs/experiments/README.md](../../README.md) 的命令段里，照文档执行会以 `experiment:analyze: missing required option --tasks` 退出 1。本轮内两处已补上，当前冻结口径的命令能直接跑通。这条留在这里是为了说明先导确实按文档执行过一次并失败了，不是已经不存在的问题。
2. `freeze --verify` 在本轮开始时退出 1：`experiment:freeze: freeze-manifest.json not found; run --write first`。Lead 随后跑了 `freeze --write`，现在同一条命令退出 0，输出 `verified 13 files against freeze-manifest.json`（见 3.10）。`analyze` 自己也会读这份清单、重算 protocol.json 与 tasks.json 的哈希并比对，所以「先 verify 再 analyze」在工具层面已经有了；分析计划第 1 步要求的完整 13 文件校验仍要人工先跑一次。

### 4.2 schema 与协议口径

1. `answers.ndjson` 与冻结协议原来的 `deidentification.neverStored`（列了「模型回答原文」）冲突。本轮内 [protocol.json](../v1/protocol.json) 已把 `deidentification.stored` 补上一条「answers.ndjson 中的归一化回答文本（仅 completed 行，≤4096 字节，同样过扫描）」，`neverStored` 改为「数据集文件中的任务提示原文与模型回答原文」，这个冲突已经消除。
2. `answers.ndjson` 与 `dataset.jsonl` 的 `answerSha256` / `answerBytes` 已经统一到同一个 canonical 文本：两者都针对 `canonicalAnswerText(answerText) = truncateUtf8(normalizeForMatch(answerText), 4096)`，按构造逐字节相同。本轮逐行核对 12 条 completed 全部相等、0 条不一致，官方用例 `tests/experiments/build-dataset.test.mjs` 也断言这条且通过。之前「两个摘要口径不同」的问题已消除；核对命令与结果见 3.8。
3. `unknown` 行仍会按部分回答文本算 verdict，a-0009 的行内 `verdict=fail`。本轮内 [analysis-plan.json](../v1/analysis-plan.json) 新增了 `verdictCounting` 规则，`summary.json` 把计数拆成 `verdictCounts`（全部行，仅作说明）与 `completedVerdictCounts`（只统计 completed 行），主指标只用后者，`summary.md` 也把口径印在表头。行内的 `verdict=fail` 仍在，但现在有明文说明它不进入任何比率，歧义基本消掉。
4. `capture.json.environment` 强制要求 `provider`、`modelId`、`endpointOrigin`，但协议 `modelParameters` 写明 provider 与 modelId 在冻结时点未定，受控数据也没有任何 Provider。本轮填的是 `none` / `none` / `https://none.invalid`，这是刻意占位，避免合成数据被读成真实调用；协议第 11.1 节（[2026-11-03-m5a-comparison-protocol.md](../../2026-11-03-m5a-comparison-protocol.md)）已经把这条口径写进正文，`softwareCommit`、平台与 Node/Electron 版本仍用本机真实值。剩下的建议只有一条：record-schema 里给 `controlled` 采集包写明这组占位值是合法取值，不必每个先导自己发明。
5. `orderIndex` 的语义仍没有被校验保护。协议 `design.orderRandomization.executionOrder` 给出 24 个格的冻结序号，同一格 3 次重复共用；record-schema 只限制 1 到 72，工具既不检查同格重复是否共用同一值，也不检查取值是否等于冻结表。本轮按冻结表写成 V1 `t01=2`、`t02=23`、`t03=4`，V0 `t01=12`、`t02=1`、`t03=3`（采集包早期版本的 1 到 6 已作废），但写错同样不会被发现。
6. journal 的 `stopRequestedAt` 在真实宿主里总是写入（`run-manager.ts` 的 `terminateAndRelease` 固定带该字段，未停止时为 null），而采集格式里它是可选字段。本轮全部写入，但一个省略它的采集包同样能通过校验，契约一致性只做到了单向。

### 4.3 真实先导还缺什么

1. 授权字段：Provider、endpoint origin、model id、凭证注入方式、允许外发材料、输入/输出 token 上限、墙上时间上限、价目表与生效日期、有效期。清单与可复制模板已在 [real-pilot-status.md](../real-pilot-status.md) 第 2 节，本轮没有一项到位。
2. 采集入口：产品侧没有把一次真实运行的 journal 与事件流导出成 `capture.json` + `journal.ndjson` + `events.ndjson` 的命令。journal 存在 Electron userData（`RunJournal` 整文件重写、上限 512 条记录），事件流在内存里保留（`RUN_LIMITS.retainedEvents=512`）。上一次真实运行（[issue13-real-provider.md](../../../testing/issue13-real-provider.md)）用的是一次性驱动脚本 `tmp/issue13/a09-run.mjs`，该文件本地留存、不入库，不能当正式采集入口。正式跑 72 次之前必须有一个可复用、能按 `attemptId` 落盘的导出路径，否则 72 个采集包只能靠手抄。
3. 真实 `usage`：适配器目前不从 SDK 读 usage，正式数据大概率整批 `usage.source=missing`，那么 `reportedInputTokens` 这个主指标会没有样本。先导期间需要确认适配器是否会报 usage，否则分析计划的主指标要降级为「覆盖率 + 说明」。
4. 冻结清单：`freeze-manifest.json` 已生成，`freeze --verify` 通过（13 个文件，见 3.10）。R5 要求的「正式运行前后各执行一次 verify」还缺归档，因为正式运行本身没有开始。

## 5. 未验证

1. 没有真实 Provider 响应，没有真实模型的任何回答。
2. 没有真实 token 数：7 条 reported usage 是编造值。
3. 没有真实耗时：所有时间戳是合成的固定值。
4. 没有窗格、交互或截图证据：本轮只验证记录与分析链路，不涉及界面。
5. 没有评分规则的真人盲检：协议 `scoring.blindSpotCheck` 写明需要 real-provider 数据，状态仍是未执行。
6. 没有 12 个任务的配对检验：先导只登记 t01 到 t03，符号检验只用了 3 个任务，正式方案里 12 个任务的路径没有被覆盖。
7. 没有正式运行前后的 `freeze --verify` 归档：先导这一次 verify 已通过（见 3.10），但 R5 要求的是正式运行前后各执行一次，本轮没有正式运行。
8. 没有 72 条正式样本、成本上限或可行性结论：正式样本量仍只有可解释上界，未经真实先导验证。
9. 没有 V0 的弱基线证据：V0 是刻意弱的基线（无检索、无工具、单一前缀截断），衡量的是「不做检索与上下文选择时的表现」，不衡量长上下文模型的一般能力（协议 `variants[].baselineStrength`）。
10. 没有 V0 结构性不可答的逐条复核：V0 可见窗口只有 57344 B，覆盖 `demos/00` 前 44.9%（整个语料 14.5%），12 条任务里 11 条的证据在窗口外（协议 `corpus.structuralUnanswerability`）。正式运行前要逐条复核并把结论写进运行记录，这条差距不能当 Harness 效果证据。
11. 没有把一次真实运行的 journal 与事件流导出成采集包的入口：正式跑 72 次之前必须有一个可复用、能按 `attemptId` 落盘的导出路径（见 4.3.2）。

## 6. 复现

```powershell
node tools/experiments/build-dataset.mjs --captures docs/experiments/m5a/captures --tasks docs/experiments/m5a/v1/tasks.json --out docs/experiments/m5a/pilot-controlled
node tools/experiments/analyze.mjs --dataset docs/experiments/m5a/pilot-controlled/dataset.jsonl --tasks docs/experiments/m5a/v1/tasks.json --protocol docs/experiments/m5a/v1/protocol.json --plan docs/experiments/m5a/v1/analysis-plan.json --out docs/experiments/m5a/pilot-controlled
```

输入摘要（`summary.json:inputs`）：dataset `0d8cbc1b2beaf387ce9f83de3ab168bf0be998af243311a4c7b37d49128227b3`（32102 字节），buildReport `5101248a7a4a1a97ee37572d060eed278e943defa6d6c16b33d0f09f446a412a`（1859 字节），answers `866070362d86a6a9bd1f85aee53b4fb17c5f2dbce189387ce57534e076383842`（4021 字节），protocol `da1e5508f027586c332dd031e78c117cf2014a74ce8898192b021318dca4b7cc`（34537 字节），plan `037df891d5d4af05ea4e17267d28d79c52abfd369c9ae05e5712d38e1325fa56`（8172 字节），tasks `67a261eb1a6ae87520c5371b8d71e01d2a54e24fa2edcaf0f5e8e9d752223b1e`（32815 字节）。采集包三份输入的 SHA-256 在 [build-report.json](build-report.json) 的 `captures[].files`。

产物摘要（`Get-FileHash -Algorithm SHA256`）：dataset `0d8cbc1b2beaf387ce9f83de3ab168bf0be998af243311a4c7b37d49128227b3`、answers `866070362d86a6a9bd1f85aee53b4fb17c5f2dbce189387ce57534e076383842`、build-report `5101248a7a4a1a97ee37572d060eed278e943defa6d6c16b33d0f09f446a412a`、summary.json `a7d73afe9fbe1cfc22d1ae44a9da2b1ee2fc93b7e4df82efbafe3c4c594155c6`、summary.md `3cb78a82077151c22002f144384af5151aada183ce242fba9ccc2d2c054cb880`。冻结侧：freeze-manifest `19428e35bb2fcab7a7ee40fbd26ac627ec4005f46c9e798c84852c316ef31a67`（2340 字节，13 个文件）、record-schema `61ceb93fcd75598e2a755fe70744cdff04079fc40321f3b9fc9ada30cc89991f`（14151 字节）。

本轮迭代过几轮口径，定稿状态是：`tasks.json` 32815 字节（t10 到 t12 改成 `contains_all` + 证据串 + forbidden）、`protocol.json` 34537 字节（新增 `answers.ndjson` 登记、第 11.1 节占位口径、`executionOrder` 冻结表、V0 弱基线与可见窗口披露）、`analysis-plan.json` 8172 字节、`record-schema.json` 14151 字节（新增 `run.notRunReason`）、`freeze-manifest.json` 2340 字节。采集包同时改成 `adapter=controlled` 并按冻结表写 `orderIndex`，`dataset.jsonl` 因此从 31616 变成 32102 字节（18 行不变，新增 `run.notRunReason` 字段、`adapter` 取值改变）。`summary.json` 的统计数字与前几版一致。本目录产物由 Lead 用定稿版本重跑 build 与 analyze 得到；我在 `tmp/` 下用同一份采集包重跑，dataset、answers、build-report 三个文件与交付目录逐字节相同（见 3.11 第 5 条）。如果冻结文件再改，必须重跑这两条命令并重新核对本报告里的数字。

采集包最初由一次性脚本生成（`tmp/m5a/gen-captures.mjs`，`tmp/` 被 `.gitignore` 忽略，不入库），定稿前按新口径改过 `adapter`、`orderIndex`、`corpusManifestSha256` 与 V0 前缀字段，构造规则以 [captures/README.md](../captures/README.md) 为准。改动采集包会同时改变 `build-report.json:captures[].files` 与 dataset 的 `capture` 字段，届时必须重跑 build 与 analyze，不要手改任何产物。
