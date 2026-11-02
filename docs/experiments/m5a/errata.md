# M5-A 勘误记录

按 `docs/experiments/m5a/v1/protocol.json` 的 R2 规则：不影响任务内容、评分规则、指标定义、分母、预算、变体定义、提示模板、模型参数、执行顺序与随机种子的纯文字勘误，记在这里后重生成 `freeze-manifest.json`，可以不升 `protocolVersion`。一旦存在 `real-provider` 数据，勘误同样必须升版本。

格式：

```
## YYYY-MM-DD 第 N 条

- 文件：
- 原文：
- 改为：
- 动机：
- 影响的数据版本：无 / v1
```

## 2026-11-03 第 1 条（数据产生前的措辞与口径修正）

- 文件：`docs/experiments/m5a/v1/protocol.json`、`analysis-plan.json`、`record-schema.json`
- 原文：首版冻结草稿把 V0 的材料前缀写成 65536 B、把工具名写成 `search`、把 `not_run` 原因只用 `notes` 文本承载，且未定义 `corpusManifestSha256` 的算法。
- 改为：材料前缀 57344 B + 指令预留 8192 B；工具名改为产品枚举 `search_in_files`；新增 `run.notRunReason` 枚举与 `run.adapter` 的 `baseline-runner`；补上 `corpusManifestSha256` 的复算定义与冻结清单校验步骤。
- 动机：Spec/Standards 双轴审查发现上述四处与实际产品契约或可复算性不一致。改动发生在任何真实数据产生之前，`datasetVersion` 未变，没有旧数据需要迁移或隔离。
- 影响的数据版本：无（受控先导在改动后重跑，旧产物被覆盖前已用 `--write` 重新生成清单）。

## 使用规则

发现需要修正的地方时按上面格式追加，不要改写历史条目。`freeze-manifest.json` 在每次追加后重新生成，并在 issue 或 PR 里留下对应的检查命令与输出。

