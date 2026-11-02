# M5-A 受控先导采集包（合成数据，不是模型输出）

**这些文件是合成的受控数据。** 它们不是 DeepSeek 或其他任何 Provider 的真实响应，不含真实 token 数、真实耗时、真实工具输出或真实模型回答。用途只有一个：让 `tools/experiments/build-dataset.mjs` 与 `analyze.mjs` 在 schema 合法的输入上跑通，验证「采集包 → dataset → summary」的记录与分析流程。它不能当作 Harness 效果证据，也不能用来回答 Issue #29 的「先导结果」那一项。

`evidenceKind` 固定为 `controlled`，数据集行的 `rowId` 形如 `controlled:v1:a-0001`。

## 目录

```
captures/
  controlled-v0/            # variantId = fixed-prefix-no-tools（V0：固定前缀全量材料、禁用工具）
    capture.json
    journal.ndjson
    events.ndjson
  controlled-v1/            # variantId = pioneer-readonly-tools（V1：按需只读工具）
    capture.json
    journal.ndjson
    events.ndjson
```

每个采集包对应一个变体（`capture.json.variantId` 在顶层），两个变体合计 18 条登记 attempt：3 个任务（`t01`/`t02`/`t03`）× 3 次重复 × 2 个变体。`orderIndex` 按协议 `design.orderRandomization` 的口径是**任务格**顺序（本先导 6 个格，取值 1 到 6），同一格的 3 次重复共用同一个 `orderIndex`；实际执行先后体现在时间戳上，不体现在 `orderIndex` 上。

## 每个状态是怎么造出来的

| attempt | 变体 | 任务/重复 | journal | events | 造法 |
| --- | --- | --- | --- | --- | --- |
| a-0001 | V0 | t01 r1 | accept + terminal(completed) | accepted → started → text.delta → run.completed(usage 有值) | 回答故意缺 `t01` 的必需字面量，rubric 判 fail；usage 是**编造**的两个数字，只用来验证 reported 分支 |
| a-0002 | V0 | t01 r2 | accept + terminal(completed) | … run.completed(usage=null) | 同上但 `usage: null`，验证缺 usage 时保持 null、不得补 0 |
| a-0003 | V0 | t01 r3 | accept + terminal(failed, MODEL_FAILED) | … run.failed(MODEL_FAILED) | 固定失败码 `MODEL_FAILED`；回答文本同样是 fail 文本，不假装成功 |
| a-0004 | V0 | t02 r1 | accept + terminal(completed) | … run.completed(usage=null) | 回答含 `t02` 必需字面量，判 pass |
| a-0005 | V0 | t02 r2 | 无 | 无 | `not_run`，原因码 `AUTHORIZATION_MISSING`，写在 `capture.json.notRun[]`，attempts 里 `runId: null` |
| a-0006 | V0 | t02 r3 | accept + terminal(stopped, code=null, stopRequestedAt) | … run.stop_requested(user) → run.stopped | 用户停止：`stopRequested.reason: "user"`，`stopReason` 派生为 `user` |
| a-0007 | V0 | t03 r1 | accept + terminal(completed) | … run.completed(usage 有值) | pass 行，验证 reported usage |
| a-0008 | V0 | t03 r2 | accept + terminal(completed) | … run.completed(usage=null) | pass 行，缺 usage |
| a-0009 | V0 | t03 r3 | accept + tombstone(host_restarted)，**无 terminal** | accepted → started → text.delta → run.unknown(host_restarted) | 模拟宿主崩溃后重启：journal 只有 accept 与墓碑，没有终态记录，数据集派生为 `status: unknown`、`terminalAt: null`、`durationMs: null` |
| a-0010 | V1 | t01 r1 | accept + terminal(completed) | accepted → started → tool.requested(list_directory) → tool.result → tool.requested(read_file) → tool.result → text.delta → run.completed(usage 有值) | V1 pass 行；工具名只用 `read_file` / `list_directory` |
| a-0011 | V1 | t01 r2 | accept + terminal(completed) | 同上，3 次 read_file | pass 行；`run.completed.usage` 用真实宿主形态 `{inputTokens: null, outputTokens: null}`（见 `run-manager.ts` 的 `usage ?? {inputTokens:null,outputTokens:null}`），验证工具两种空 usage 形态都要按 `missing` 处理 |
| a-0012 | V1 | t01 r3 | accept + terminal(completed) | 3 次工具调用 | pass 行 |
| a-0013 | V1 | t02 r1 | accept + terminal(completed) | 2 次工具调用 | pass 行 |
| a-0014 | V1 | t02 r2 | accept + terminal(failed, RUN_DEADLINE, stopRequestedAt) | … run.stop_requested(deadline) → tool.result(cancelled) → run.failed(RUN_DEADLINE) | 120 秒总时限：先请求停止（reason=deadline），再取消在飞工具调用，最后以 `RUN_DEADLINE` 失败。顺序照 `run-manager.ts` 的 `requestStop` + `terminateAndRelease` |
| a-0015 | V1 | t02 r3 | 无 | 无 | `not_run`，原因码 `PROVIDER_UNAVAILABLE` |
| a-0016 | V1 | t03 r1 | accept + terminal(completed) | 2 次 read_file | pass 行 |
| a-0017 | V1 | t03 r2 | accept + terminal(completed) | 3 次工具调用 | pass 行，缺 usage |
| a-0018 | V1 | t03 r3 | accept + terminal(completed) | 1 次 read_file | pass 行 |

边界覆盖对照：

- 缺 usage：a-0002、a-0004、a-0008、a-0011、a-0017（5 条 `completed` + `usage: null` 或 `{null,null}`）。
- 失败：a-0003（`MODEL_FAILED`）、a-0014（`RUN_DEADLINE`）。
- 停止：a-0006（`stopRequested.reason: "user"`）。
- 超时：a-0014（`RUN_DEADLINE`，对应 deadline 停止）。
- 墓碑：a-0009（`host_restarted`，只有 accept、没有 terminal）。
- 未运行：a-0005、a-0015（`AUTHORIZATION_MISSING` / `PROVIDER_UNAVAILABLE`）。
- 变体差异：`t01` 在 V0 全部判 fail、在 V1 全部判 pass，聚合层能看出这一格差异；`t02` 与 `t03` 在两个变体都有 pass 行，避免整批数据看起来是单向摆拍。

## 事件流与 journal 的内部一致性

- 每条 run 的 `seq` 从 1 连续递增，`at` 严格递增，`source` 与 body 类型严格对应（`text.delta` → `model`，`tool.*` → `tool`，其余 → `host`）。
- 每条 run 只有一个终态事件（`run.completed` / `run.failed` / `run.stopped` / `run.unknown`），且是最后一条。
- 每个 `tool.requested` 都有且只有一个 `tool.result`；V0 的 run 没有任何工具事件（V0 禁用工具）。
- 工具名只用 `read_file` 与 `list_directory`。真实契约 `apps/desktop/src/shared/contracts/read-only-tools.ts` 的枚举是 `read_file` / `list_directory` / `search_in_files`；本采集包不使用检索工具，避免与协议文档里写的 `search` 产生命名歧义。
- `tool.result` 的文本是占位串（`读取完成，内容已返回。` / `目录列举完成。`），刻意不含任何 ASCII 字面量，防止工具输出被误当成回答内容参与评分。
- journal 的 `terminal.stopRequestedAt` 与真实 `terminateAndRelease` 一致：总是写入，未发生停止时为 `null`。
- 时间戳全部是编造的固定时间（从 `2026-11-02T15:00:00.000Z` 起按固定步长排布），不对应任何真实运行时刻。`durationMs` 由时间戳推导，不是实测耗时。宿主重启的时间点固定为 `2026-11-02T15:30:00.000Z`（墓碑 run 在 15:28 被接受、2 分钟后被标记 `host_restarted`），之后被接受的 run 才把 journal `windowEpoch` 记为 2。

## environment 字段的口径

- `softwareCommit` / `nodeVersion` / `electronVersion` / `platform` 是真实值：冻结基线 `13ccfe5f0c9f8cc376aec08eb21cd91162719237`、Node 24.17.0、Electron 44.2.0、win32-x64。`dirty: false` 指该冻结基线，不是指生成本文件时工作树没有未跟踪文件。
- `provider: "none"` / `modelId: "none"` / `endpointOrigin: "https://none.invalid"` 是显式占位值。协议 `modelParameters` 写明 provider 与 modelId 在冻结时点未定、须由授权运行点名，而受控先导没有发起任何 Provider 调用，所以这里不写 `deepseek` 之类的名字，避免被读成「真的调用过 DeepSeek」。
- `corpusManifestSha256` 是按 `demos/` 六个文件的 sha256 拼成固定清单后再取 sha256 得到的（算法见生成脚本），不是协议里某个字段的副本。

## 回答文本

`text.delta` 里的回答文本由 tasks.json 的评分字面量原样填入（pass 行）或换成一句不含任何字面量的中文（fail 行）。它只用来驱动确定性评分，读起来不像真人回答，也不代表任何模型的输出风格。

## 复现

生成脚本 `tmp/m5a/gen-captures.mjs` 是本地一次性工具（`tmp/` 被 `.gitignore` 忽略，不随仓库分发）。它读取 `docs/experiments/m5a/v1/tasks.json` 取评分字面量与 prompt 摘要，按上表写出两个采集包。脚本内置自检：seq 连续性、时间递增、source 映射、终态唯一、工具请求/结果配对、V0 无工具、journal 形态、以及「pass 文本确实满足 rubric、fail 文本确实不满足」。
