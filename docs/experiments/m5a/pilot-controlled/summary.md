# M5-A 实验汇总

- protocolId: m5a-harness-context-comparison
- protocolVersion: 1
- datasetVersion: 1
- evidenceKind: controlled

controlled pipeline check, not real model results

## 分母（三层）

| plannedDenominator | executedCount | coverage |
| --- | --- | --- |
| 18 | 16 | 0.8889 |

not_run 计入 plannedDenominator 但不计入 executedCount，也不当作模型答错。

## 计数

| status | count |
| --- | --- |
| completed | 12 |
| failed | 2 |
| stopped | 1 |
| unknown | 1 |
| not_run | 2 |

### completed 行的 verdict

非 completed 行的 verdict 只表示该行已有的回答文本能否匹配 rubric，不进入任何比率；主指标只用 completed 且 pass 的行。

| verdict | count (completed only) |
| --- | --- |
| pass | 10 |
| fail | 2 |
| unscorable | 0 |
| not_run | 0 |

- verdictCounts（含全部行，仅作说明，不进入比率）: pass=11, fail=4, unscorable=1, not_run=2

- completedFail: 2
- completedUnscorable: 0
- timedOut: 1
- notRunReasons: AUTHORIZATION_MISSING=1, PROVIDER_UNAVAILABLE=1

## 主指标（任务级）

| taskId | category | V0 pass/attempts | V0 rate | V1 pass/attempts | V1 rate | V1 - V0 |
| --- | --- | --- | --- | --- | --- | --- |
| t01 | locate-exact-fact | 0/3 | 0.0000 | 3/3 | 1.0000 | 1.0000 |
| t02 | locate-exact-fact | 1/3 | 0.3333 | 1/3 | 0.3333 | 0.0000 |
| t03 | locate-exact-fact | 2/3 | 0.6667 | 3/3 | 1.0000 | 0.3333 |

- meanDifference: 0.4444
- minDifference: 0.0000
- medianDifference: 0.3333
- maxDifference: 1.0000
- difference distribution: t01=1.0000, t02=0.0000, t03=0.3333
- cell pass-count distribution: 0=1, 1=2, 2=1, 3=2

## 探索性符号检验（任务级）

- method: exact-binomial-sign-test; label: exploratory-only; unit: task
- non-zero differences: 2; positive: 2; negative: 0; ties: 1
- exact two-sided p-value: 0.5
- 12 个任务太少，只作方向性旁证，不作确认性显著性结论。

## 尝试级描述统计（不是主结论）

- planned denominator: 18
- completedPass: 10
- completionRate (completed_pass / planned): 0.5556; Wilson 95% [0.3372, 0.7544]
- successRateAmongExecuted: 0.6250; Wilson 95% [0.3864, 0.8152]
- 注意：重复不是独立试验，该 Wilson 区间只描述本次数据，主分析单位为任务。

## usage 覆盖率

| planned | executed | reported | missing | estimated | coverage |
| --- | --- | --- | --- | --- | --- |
| 18 | 16 | 7 | 11 | 0 | 0.3889 |

- reported input tokens: count=7, mean=7305, median=4102, total=51136
- reported output tokens: count=7, mean=158, median=156, total=1107

## 耗时

- count: 15; median: 19800 ms; p90: 30760 ms
- excluded: not_run=2, unknown=1, other missing=0
- completed_pass subset: count=10, median=22750 ms

## 按变体

| variantId | planned | executed | completed_pass | completionRate | successRateAmongExecuted | coverage | reported usage | medianMs | p90Ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fixed-prefix-no-tools | 9 | 8 | 3 | 0.3333 | 0.3750 | 0.8889 | 2 | 12400 | 16520 |
| pioneer-readonly-tools | 9 | 8 | 7 | 0.7778 | 0.8750 | 0.8889 | 5 | 27700 | 57840 |

## 按变体 × 任务类别

| variantId | category | planned | executed | completed_pass | completionRate | successRateAmongExecuted | medianMs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fixed-prefix-no-tools | locate-exact-fact | 9 | 8 | 3 | 0.3333 | 0.3750 | 12400 |
| pioneer-readonly-tools | locate-exact-fact | 9 | 8 | 7 | 0.7778 | 0.8750 | 27700 |

## 任务格 pass 分布（每格 3 次重复）

| variantId | taskId | category | planned | executed | completed_pass | majorityPass |
| --- | --- | --- | --- | --- | --- | --- |
| fixed-prefix-no-tools | t01 | locate-exact-fact | 3 | 3 | 0 | not_pass |
| fixed-prefix-no-tools | t02 | locate-exact-fact | 3 | 2 | 1 | not_pass |
| fixed-prefix-no-tools | t03 | locate-exact-fact | 3 | 3 | 2 | pass |
| pioneer-readonly-tools | t01 | locate-exact-fact | 3 | 3 | 3 | pass |
| pioneer-readonly-tools | t02 | locate-exact-fact | 3 | 2 | 1 | not_pass |
| pioneer-readonly-tools | t03 | locate-exact-fact | 3 | 3 | 3 | pass |

## answers.ndjson 复算一致性

- answers.ndjson: docs/experiments/m5a/pilot-controlled/answers.ndjson
- checked: 12; matched: 12; mismatched: 0; skipped: 0
- 该项只是评分一致性自检，不进入主指标。

## 输入

- dataset: docs/experiments/m5a/pilot-controlled/dataset.jsonl (sha256 aa915191b410c0c6a9b192b315fb30070a8299cd5885a2aedf5972066af1ba67)
- answers: docs/experiments/m5a/pilot-controlled/answers.ndjson (sha256 866070362d86a6a9bd1f85aee53b4fb17c5f2dbce189387ce57534e076383842)
- protocol: docs/experiments/m5a/v1/protocol.json (sha256 8f6beee18529dd0e452713ebe1c2e2eb6ee1ac62790436e08fd952dafe22b81f)
- plan: docs/experiments/m5a/v1/analysis-plan.json (sha256 a3e9cf99a9edf50c766f02e298211ce3de375c4e3f0952b26b1939c69a9bd21f)
- tasks: docs/experiments/m5a/v1/tasks.json (sha256 25bde05f9759e1e2debc7bcb65df2845ee80bbf30f52851c3c44f2c9020719da)

