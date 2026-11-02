# 实验记录目录

本目录存放 Pioneer 的实验方案、任务集、脱敏数据集与分析产物。设计原则：方案先冻结，再采数据；失败、超时、取消、未运行都保留在分母里；每个数字都能从原始记录重算。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| [2026-11-03-m5a-comparison-protocol.md](2026-11-03-m5a-comparison-protocol.md) | M5-A（#29）冻结方案的人读版本：比较问题、变体、任务、评分、预算、分母、冻结规则、完成条件对照 |
| `m5a/v1/protocol.json` | 机器可读的冻结决策 |
| `m5a/v1/tasks.json` | 12 条任务、评分字面量、材料 ground truth |
| `m5a/v1/analysis-plan.json` | 分析步骤、指标、统计口径 |
| `m5a/v1/record-schema.json` | 数据集行的 JSON Schema 与不变量 |
| `m5a/v1/freeze-manifest.json` | 四份 JSON 与 `tools/experiments` 源码的 SHA-256 清单 |
| `m5a/captures/` | 采集包（`capture.json` + `journal.ndjson` + `events.ndjson`） |
| `m5a/pilot-controlled/` | 受控流程先导产物：`dataset.jsonl`、`build-report.json`、`summary.json`、`summary.md`、`report.md` |
| `m5a/real-pilot-status.md` | 真实模型先导的 `NOT_RUN` 记录与所需授权字段 |

## 证据级别

每条数据集记录都有 `evidenceKind`，论文与 issue 里引用时必须写出级别：

| 级别 | 含义 | 可以支撑什么 |
| --- | --- | --- |
| `controlled` | 合成或受控数据跑通记录与分析链路 | 只支撑「流程正确」，不支撑任何模型效果结论 |
| `real-provider` | 获得明确授权后，真实 Provider 与真实模型产生 | 支撑该版本、该配置下的实测结果 |

`controlled` 数据**不得**进入论文的结果章节，也不得与 `real-provider` 数据合并计算。受控测试或单元测试通过，不等于真实 Provider 已验证。

## 冻结与变更

1. 版本目录只增不改：`v1/` 一旦有清单就不可原地修改。
2. 改动任务、评分、指标、分母、预算、变体、执行顺序或随机种子，都升 `protocolVersion` 并新建 `v2/`；旧数据留在旧版本目录。
3. 校验命令：

```powershell
node tools/experiments/freeze.mjs --protocol-dir docs/experiments/m5a/v1 --verify
```

4. 发现评分实现缺陷时保留旧版本与旧数据，新旧结果同时报告。

## 命令

```powershell
pnpm test:experiments        # 记录与分析链路的 node:test 套件
node tools/experiments/build-dataset.mjs --captures <dir> --tasks docs/experiments/m5a/v1/tasks.json --out <outDir>
node tools/experiments/analyze.mjs --dataset <dataset.jsonl> --tasks docs/experiments/m5a/v1/tasks.json --protocol docs/experiments/m5a/v1/protocol.json --plan docs/experiments/m5a/v1/analysis-plan.json --out <outDir>
node tools/experiments/freeze.mjs --protocol-dir docs/experiments/m5a/v1 --write   # 冻结或勘误后重生成清单
node tools/experiments/freeze.mjs --protocol-dir docs/experiments/m5a/v1 --verify  # 正式运行前后各一次
```

## 不放在这里的材料

个人学籍、导师与联系方式、凭证、私密档案、真实用户数据不进入本目录，也不进入任何数据集字段。数据集只存任务与回答的 SHA-256 与字节数，不存原文。
