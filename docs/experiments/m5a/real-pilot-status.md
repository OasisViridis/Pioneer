# M5-A 真实模型先导：NOT_RUN

- 记录时间：2026-11-03（Asia/Shanghai）
- 证据级别：`real-provider`（本记录本身不是运行证据，是未运行记录）
- 状态：**NOT_RUN**
- 对应票据：[#29](https://github.com/OasisViridis/Pioneer/issues/29)
- 冻结方案：[2026-11-03-m5a-comparison-protocol.md](../2026-11-03-m5a-comparison-protocol.md)

## 1. 为什么没有运行

本轮只有「完成 #29 的任务」这一指令，没有点名 Provider、模型、endpoint origin 与外发材料清单。按 #29 正文与 P2 运行合同：

1. 任何真实模型先导都必须取得具体 Provider、模型与外发材料授权；
2. 票据标记 ready-for-agent 不自动调用真实服务；
3. #13 的 A09 授权范围只覆盖 2026-10-25 那次 DeepSeek 验证，不能沿用到本票。

因此本轮不发起任何真实 Provider 请求，不读取用户全局凭证，不把材料外发。按 #29 第 3 条完成条件，这只允许写成「明确未运行原因」，不允许写成「先导通过」或「样本量与成本已验证」。

## 2. 需要人类补齐的授权字段

缺任一项都不能开始。授权必须点名操作与目标，不接受「随便用」或「该发就发」这类概括表述。

| 字段 | 说明 | 当前值 |
| --- | --- | --- |
| Provider | 服务方名称，例如 DeepSeek、Anthropic、OpenAI 兼容网关 | 未提供 |
| endpoint origin | 只写 scheme 与 host，不含路径、查询串与凭证 | 未提供 |
| model id | Provider 目录里的确切模型标识，不接受口头简称 | 未提供 |
| 凭证注入方式 | 例如运行时环境变量名；凭证不写进仓库、日志、issue 或本文件 | 未提供 |
| 允许外发的材料 | 本方案只需 `demos/` 六个文件的文本内容、12 条任务题面与工具返回结果 | 未获授权 |
| 输入 token 上限 | 默认 3,000,000，可下调 | 未确认 |
| 输出 token 上限 | 默认 300,000，可下调 | 未确认 |
| 墙上时间上限 | 默认 6 小时 | 未确认 |
| 价目表与生效日期 | 用于把 token 上限换成货币上限；未提供则只报 token 与时长 | 未提供 |
| 授权有效期 | 起止时间 | 未提供 |

可复制的授权模板：

```
授权 Pioneer #29 真实模型先导：
Provider = <名称>；endpoint origin = https://<host>；model = <目录里的确切 id>；
凭证通过环境变量 <变量名> 在运行时注入，不落盘；
允许外发：demos/ 六个文件内容 + docs/experiments/m5a/v1/tasks.json 的 12 条题面 + 工具返回结果；
预算上限：输入 <n> tokens、输出 <n> tokens、墙上时间 <h> 小时；
价目表：<来源与生效日期>；有效期至 <日期>。
```

## 3. 授权到位后的执行步骤

0. 先补采集导出入口。产品当前只把 journal 写到 userData，事件流只在内存环形缓冲里，没有把一次运行导出成 `capture.json` + `journal.ndjson` + `events.ndjson` 的入口。开跑前必须先决定：在 main 增加受控导出命令，或用独立驱动脚本按同一 wire 格式写采集包。这一步没做完，下面的步骤无法产生符合冻结格式的采集包。
1. 在冻结基线上检出独立分支，记录实际 commit 与 dirty 状态。
2. `node tools/experiments/freeze.mjs --protocol-dir docs/experiments/m5a/v1 --verify`，输出归档。
3. 按 `orderIndex` 顺序，对 72 个登记尝试逐个启动产品只读运行；V0 用同一 Provider 的单次请求，V1 用产品现有只读 Harness。每次运行前把采集包写入 `docs/experiments/m5a/captures/real-provider/<attemptId>/`。
4. 预算停机规则生效时，剩余尝试记 `not_run` 与原因码 `BUDGET_EXHAUSTED`。
5. `node tools/experiments/build-dataset.mjs --captures docs/experiments/m5a/captures/real-provider --tasks docs/experiments/m5a/v1/tasks.json --out docs/experiments/m5a/real-provider-v1`。
6. `node tools/experiments/analyze.mjs ...` 输出汇总，再按 `analysis-plan.json` 第 11 步做探索性配对检验。
7. 再跑一次 `freeze --verify`，与本记录一起更新 `docs/experiments/m5a/real-provider-v1/report.md`，并在 #29 写 resolution。

## 4. 产出会包含什么

`docs/experiments/m5a/real-provider-v1/` 下会有 `dataset.jsonl`（72 行，含 `not_run`）、`build-report.json`（每个采集包的三份输入 SHA-256）、`summary.json` 与 `summary.md`（分母、分类计数、完成率与 Wilson 区间、usage 覆盖率、耗时分布、按变体与类别的聚合、每格 pass 分布）、`report.md`（执行时间线、授权摘要、限制与未验证项）。所有行 `evidenceKind=real-provider`，与受控先导目录分开。

## 5. 在此之前不得出现的表述

1. 不得写「Pioneer 比全量上下文方案更快 / 更省 token」，没有实测数据。
2. 不得写「样本量已验证」「成本已验证」，没有真实先导。
3. 不得用受控先导的完成率、token 数或耗时冒充模型结果。
4. 不得用 #13 的 A09 记录顶替本票数据，那是单次运行验证，不是本实验的样本。
5. 不得从旧授权、旧结果或票据标签推导出新的调用许可。
