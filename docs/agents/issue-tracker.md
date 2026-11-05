# Issue tracker：GitHub

这个 repo 的 issues 和 specs 存放在 GitHub issues 中。所有操作都使用 `gh` CLI。

## 用词与标题

2026-10-24 用户确认：中文说明动作，保留英文技术概念；首次出现时简短解释。词义见 [GLOSSARY](../../GLOSSARY.md)。

- 保留 `Harness`、`Runtime`、`Session`、`Run`、`Provider`、`Diff`，按词义使用，不堆叠术语。
- 标题沿用阶段编号，例如 `[P2] Runtime：读取权限与停止规则`、`[P2] Harness：只读接入与验证`。先后关系写在正文和原生依赖中。
- `M` 表示正式里程碑，`P` 表示开发计划中的工作阶段，沿用既有编号。
- 正文先写目标、待办和完成条件；接口字段、错误码和测试命令按需展开。
- 用具体动作代替“收敛、接线、收口、证据闭环”等泛化措辞，例如“确定接口字段”“接入模型”“通过测试并交付”。

## 约定

- **Create an issue**: `gh issue create --title "..." --body "..."`。多行正文先写 UTF-8 文件，再用 `--body-file`，不要拼接 shell 字符串。
- **Read an issue**: `gh issue view <number> --comments`，用 `jq` 过滤 comments，并同时获取 labels。
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，按需加上 `--label` 和 `--state` filters。
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

从 `git remote -v` 推断 repo；在 clone 内运行时，`gh` 会自动处理。

## Pull requests 作为 triage surface

**PRs as a request surface: no.** _（如果这个 repo 把 external PRs 当作 feature requests，则设为 `yes`；`/triage` 会读取这个 flag。）_

设为 `yes` 时，PRs 走与 issues 相同的 labels 和 states，使用 `gh pr` 对应命令：

- **Read a PR**: `gh pr view <number> --comments`，以及 `gh pr diff <number>` 获取 diff。
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`，然后只保留 `authorAssociation` 为 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR` 或 `NONE` 的（丢弃 `OWNER`/`MEMBER`/`COLLABORATOR`）。
- **Comment / label / close**: `gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 在 issues 和 PRs 之间共享一个 number space，因此裸 `#42` 可能是两者之一：用 `gh pr view 42` 解析，失败则回退到 `gh issue view 42`。

## 当 skill 说 "publish to the issue tracker" 时

创建一个 GitHub issue。

## 当 skill 说 "fetch the relevant ticket" 时

运行 `gh issue view <number> --comments`。

## Wayfinding 操作

供 `/wayfinder` 使用。**map** 是单个 issue，以 **child** issues 作为 tickets。

- **Map**: 单个带 `wayfinder:map` label 的 issue，保存 Notes / Decisions-so-far / Fog body。`gh issue create --label wayfinder:map`。
- **Child ticket**: 作为 GitHub sub-issue 链接到 map 的 issue（通过 sub-issues endpoint 使用 `gh api`）。未启用 sub-issues 时，把 child 加入 map body 中的 task list，并在 child body 顶部写 `Part of #<map>`。Labels：`wayfinder:<type>`（`research`/`prototype`/`grilling`/`task`）。一旦被 claim，ticket 被 assign 给 driving dev。
- **Blocking**: 使用 GitHub native dependencies 表达当前实现必须消费的上游结果；正文说明具体接口/产物。添加边用 blocked_by endpoint 和上游数字 database id。最终发布/里程碑验收条件放在清单，不整票阻塞可独立交付的只读能力、Windows 验证或实验准备。改依赖同时更新正文，保留原安全条件。
- **Frontier query**: 列出 #9 的开放执行子票，筛选 ready-for-agent、无负责人、无开放开工 blocker；再核对上游所需实现已合入 main 且验收通过，或文档决定已接受。closed / cancelled / duplicate 和平台的零 blocker 都不能单独证明可用。按用户优先级与独立交付能力选择，不能仅按编号把全仓串行化。
- **Claim**: 开工前将当前执行者设为唯一 Assignee 并回读；存在活跃 PR/其他写入者时先核对，不因账号相同或未指派就接管。复杂新任务可在创建时指派。一个执行票对应独立 worktree/ref/PR。
- **Resolve**: 在 Issue/PR 记录合并提交、所需验收与证据后关闭实现票；未合并时保持开放。历史已关闭但产物未合并的票在 #9 明示条件，下游不能直接消费。决策票按其已接受决定关闭，不把仅完成文档当成实现完成。

完整开工、并行、技术选择与人类交接规则见 [delivery](delivery.md)。#9 只维护当前队列和链接；产品规格保留在仓库，避免在总票正文复制整份规格和过期状态。
