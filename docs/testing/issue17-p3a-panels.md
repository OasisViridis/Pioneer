# Issue #17（P3-A）交付记录：上下文、能力与运行日志面板

- 日期：2026-10-27
- 分支：`feat/issue17-p3a-panels`（基于 `main` `b93d8e9`）
- Issue：[#17](https://github.com/OasisViridis/Pioneer/issues/17)
- 状态：实现与自动化证据在本分支完成；**未合并、未关闭 Issue**。人工项与真实 Provider 未运行，见文末“未验证项”。

## 1. 交付内容

| 范围 | 实现 |
| --- | --- |
| RunLog 面板 | 新增 Dock 面板 `runlog`（显示名“运行日志”），按 `seq` 排序展示当前 Run 的已校验事件；事件流仍在原 `run:events` 通道，不新增第二套总线。 |
| 上下文面板 | 读取 main 的只读投影 `run:context`：授权清单、实际读取/扫描/变化/不可用状态与原因；未取得上下文时只显示已批准清单，并明确标注“不推断已读取”。 |
| 能力面板 | 固定只读能力清单（`read_file`／`list_directory`／`search_in_files`），写入与命令显示“未提供”；按 `callId` 合并 `tool.requested`／`tool.result`，区分请求中、完成、拒绝、失败、取消与固定错误码。 |
| 身份绑定 | 面板标题显示会话名、`runId`、`revision` 与状态；批次身份（runId／revision）不符时整页忽略；单条事件用 `classifyRunEvent` 校验 Session／Project／Run／Revision，foreign/invalid 事件跳过并计数提示，同批次合法事件照常按序落地。 |
| 修订 | 会话新增单调 `runRevision`；启动运行时使用 `runRevision + 1`，成功启动后回写；编辑草稿不改变历史 Run 的修订。 |
| 重启摘要 | 终态 Run 的 `identity`、状态、工具清单、材料状态与调用记录以有界摘要存入会话（`lastRunView`）；只有 main 已确认的上下文才会被存为摘要，重启后面板显示同一 Session/Run 的摘要，并注明事件流未持久化。 |
| 持久化 | 会话状态升到 v7：每个 `dock`、`savedDock`、`layoutHistory` 布局插入隐藏的 `runlog` 面板；v6、v5、v4 与 v1–v3 迁移路径都经过升级函数。旧文件在用户保存前不改写。 |
| 面板交互 | 运行结果到达只更新数据，不自动打开面板、切换布局、改草稿或抢焦点；“打开运行日志”使用 `SHOW_PANEL`（幂等），重复点击不会把面板收起。 |

不在本票范围：真实 Provider 调用、文件写入/命令执行、Diff/产物伪预览、历史 Run 的完整事件重放。

## 2. 契约与边界

- 事件 wire 仍为 `RunEvent.version = 1`，`tool.requested` 只含 `callId` 与工具名，`tool.result` 只含文本/截断或固定错误码；不反射工具参数。
- 新查询 `run:context`（`RUN_IPC_CHANNELS.context`）复用可信 sender、窗口 epoch 与完整 Run 身份检查；找不到运行或身份不符返回 `RUN_NOT_FOUND`，不泄漏其他会话是否存在。
- main 只在工具执行器确认后记录材料事实：`read_file` 成功记 `read`，`search_in_files` 校验哈希后记 `scanned`，哈希不符记 `changed`，路径/读取失败记 `missing` 并附固定原因码。
- 目标路径只在 main 内归一化为项目相对路径后才回传；绝对路径、`..`、敏感名段与空路径返回 `null`。
- `RunContext` / `RunSnapshot` 使用严格 Zod schema 与长度上限（材料 64、调用 32），未知字段拒绝。

## 3. 自动化证据（本分支）

执行环境：Windows，Node v24.17.0，pnpm 11.7.0，工作目录 `.agents/worktrees/feat/issue17-p3a-panels`。

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @pioneer/desktop typecheck` | PASS（无错误输出） |
| `pnpm test:contract:types` | PASS |
| `pnpm test:contract` | PASS：38 文件 / 375 测试（含新增 `run-context`、`run-panels`、run-manager 上下文投影与取消/脱敏用例、v6→v7 迁移、reducer 修订与摘要用例） |
| `pnpm verify:repository` | PASS：6 测试 |
| `pnpm exec eslint apps/desktop/src tests/contract` | PASS |
| `pnpm build:desktop` | PASS（Electron Forge 打包完成） |
| `pnpm exec playwright test --config tests/e2e/playwright.config.ts tests/e2e/p2-run.e2e.spec.ts tests/e2e/p3-panels.e2e.spec.ts` | PASS：12/12（P2 5 + P3 7），24.0s |
| `pnpm check` | PASS（exit 0）：design:check、format、lint、typecheck、Contract 375/375、Prototype 210/210、Real Electron 34/34、package smoke |

补充说明：`pnpm check` 的输出包含改动的 `contract`、`prototype`、`e2e` 与 package smoke；本记录不把 Contract 测试当作 Electron 证据，也不把受控适配器当作真实 Provider 证据。验证日志保存在本地 `logs/issue17-check-4.log`（`logs/` 被 `.gitignore` 忽略，不入库）。

绑定提交：实现提交 `a7852af`（分支 `feat/issue17-p3a-panels`，基于 `main` `b93d8e9`）；上表门禁在工作树内容与该提交一致时执行，本证据文档随后单独提交，只追加版本绑定行。

## 4. Real Electron 证据

由 Playwright 启动真实 Electron（`_electron.launch`），经 `PIONEER_E2E_*` 注入受控运行器；覆盖 main → preload → renderer 与隔离 userData，结束后校验 fixture 树哈希不变。

| Spec | 用例 | 覆盖 |
| --- | --- | --- |
| `tests/e2e/p3-panels.e2e.spec.ts` | 7/7 PASS | 上下文来源与“已读取/已批准未读取”、拒绝不显示为空成功、双会话隔离、草稿保留与“打开面板/运行完成后焦点不进入可选面板”、键盘打开面板并返回焦点、重启后同 Session/Run 摘要与布局恢复、640×480 窄窗溢出菜单展开与 Escape 关闭 |
| `tests/e2e/p2-run.e2e.spec.ts` | 5/5 PASS | P2 运行/停止/拒绝/重启历史在 P3 布局下仍成立（事件断言限定在 RunLog 面板） |

定向运行：`pnpm exec playwright test --config tests/e2e/playwright.config.ts tests/e2e/p2-run.e2e.spec.ts tests/e2e/p3-panels.e2e.spec.ts` → 12 passed，Lead 复跑一次结果相同。完整 `pnpm test:e2e` 阶段 34 passed（含新增键盘用例）。

运行前必须清除继承的 `ELECTRON_RUN_AS_NODE`（本机 shell 为 `1` 时 Electron 会进入 Node 模式并在 launch 阶段失败，报 `electron.exe: bad option: --remote-debugging-port=0`）；本次命令以 `$env:ELECTRON_RUN_AS_NODE = $null` 运行。

## 5. 未验证项与人工决策

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| Windows 读屏/Narrator 人工验收 | NOT RUN | 自动键盘/焦点断言不能替代读屏人工证据；需在同一版本实机记录。 |
| 真实 Provider 运行 | NOT RUN | 本票不调用真实模型；受控适配器结果不冒充真实运行。 |
| 合并、发布、关闭 Issue | NOT DONE | 由人类按仓库门禁决定；本分支只提交 PR。 |
| 历史 Run 完整事件重放 | 不支持（明确显示） | 会话只保存有界摘要；面板显示“事件流未持久化”，不重放未保存事件。 |

## 6. 已知限制

- `search_in_files` 只把哈希校验通过的文件标为“已扫描”，不声称命中片段之外的内容进入模型。
- `read_file` 在哈希校验通过后即记录“已读取”；若随后收到停止请求，调用会显示“已取消”，但材料仍可能标为“已读取”。这表示工具确实读过并校验过该文件，不代表完整正文已进入模型回答。
- 运行记录被 main 的保留上限清退后，`run:context` 返回 `RUN_NOT_FOUND`，面板显示“上下文已不可用”。
- 窄窗口下 Dock 可能临时收起面板，需从“展开面板”菜单打开；这是现有 `fitDockPanels` 行为，不新增第二套布局。
- 每个会话只持久化最新一次终态 Run 的有界摘要（材料 ≤64、调用 ≤32）；20 条历史记录仍只存任务与结果摘要。摘要总量受会话状态 8 MB 上限约束，超限按既有保存失败提示处理。
- 面板只回显归一化后的项目相对 `call.target`；未进 egress manifest、但位于项目内且非敏感名的请求路径没有正文，仍会出现在调用记录里。
