# README 重写的一手来源核查（2026-10-26）

> 用途：为「按现行项目状态重写 README」提供可追溯的证据，并记录旧 README 里无证据、过时或夸大的陈述。
> 边界：本文件是核查记录，不是里程碑或实现状态的权威源。里程碑只认 [ROADMAP](../../themasterplan/ROADMAP.md)，题目只认 [选题收敛说明](../../选题收敛说明.md)。
> 独立复核：同一轮的独立核查记在 [复核记录](2026-10-26-readme-source-audit-crosscheck.md)，其中 30 条逐节偏差与命令输出不在此重复。

## 零、基线与合并状态

| 事实 | 证据 |
| --- | --- |
| 现行状态应取 `origin/main` = `fd26d06`（2026-10-26） | `git log origin/main -1` |
| **PR #16 已合并进 `main`**，P2 不再是分支专属 | `3f262fe Merge pull request #16 from OasisViridis/codex/issue13-readonly-harness`；`git merge-base --is-ancestor 395df15 origin/main` 退出码 0 |
| 本机 checkout 落后 22 个提交，harness 代码是 review 前版本 | `git rev-list --count 395df15..origin/main` = 22；`origin/main` 多出 `main/harness/text-budget.ts`，`run-manager.ts` 另有约 +457 行 |
| 合并后又合入 PR #40（CI 列表超时修复） | `fd26d06` |
| README 未被这些提交改动，重写无冲突 | `git log 395df15..origin/main -- README.md` 为空 |
| 意图卡（`SessionIntent`）在 `main` 上仍是运行前置；只有未提交工作树删除了它 | `git ls-tree origin/main -- .../SessionIntent.tsx` 存在；`git show origin/main:.../RunPanel.tsx` 仍要求 `intentState.phase==='session' && runtime!==null`；`git log --all --diff-filter=D` 无删除记录 |

**结论差异**：重写第一稿把 P2 写成「在分支、PR 未合并」，那是照抄了 `docs/plans` 与 `ROADMAP` 的旧记载。以 git 为准后改为「已合并 `main`」。文档滞后本身记在第六节。

## 一、工作区与依赖

| 事实 | 证据 |
| --- | --- |
| 工作区只有 `apps/*`，不存在 `packages/` | `pnpm-workspace.yaml` |
| 唯一应用包 `@pioneer/desktop` | `apps/desktop/package.json` |
| Electron 44.2.0、React/React DOM 19.2.8、TypeScript 6.0.3、Zod 4.5.4、Forge 7.11.2、Webpack 5.110.3、Pi `pi-ai` 与 `pi-agent-core` 精确 1.4.0 | `apps/desktop/package.json`；`pnpm-lock.yaml` 复核一致 |
| Node `>=24`，pnpm 固定 `11.7.0` | 根 `package.json` 的 `engines` 与 `packageManager` |
| `check` = 格式、lint、类型、契约、原型、真实 Electron、package smoke | 根 `package.json` 的 `check` 脚本 |
| `format:check` 不覆盖 README、`docs/` 与 `tests/prototype` | 脚本内的路径清单 |

## 二、界面真实形态

- 唯一渲染入口是 `apps/desktop/src/renderer/App.tsx`：按会话状态在媒体库、设置、会话工作台之间切换，页脚显示保存状态与重试入口。
- 会话工作台 `SessionWorkbench.tsx` 的可选面板固定为 `context`、`capabilities`、`diff`、`outputs` 四个。
- 停靠是真实实现：`DockSurface.tsx` 支持拖拽换列换位、左右分栏比例拖动、面板高度拖动、收起与面板菜单移动，带键盘焦点处理；窄窗（宽度小于 760）禁用拖拽并临时收起面板。
- 面板内容成熟度不齐：上下文面板渲染真实项目概览；能力面板写死「未连接 / 未提供 / 未授权」；改动面板为空状态；产物面板是三个空状态页签。
- 全仓库零 import 的本地候选：`ProjectWorkspace.tsx`、`TabStrip.tsx`、`WindowChrome.tsx`、`HazelMark.tsx`。旧 README 曾把其中的停靠与恢复写成「已有本地候选、入口尚未接入」，与现在的入口不符。
- 运行入口在 `RunPanel.tsx`：会话内先确认意图，再点「启动运行」；`runViews.launch` 全仓库只有这一处调用，因此不存在自动发请求的路径。

## 三、测试口径

| 层 | 实测或记录 | 出处 |
| --- | --- | --- |
| 契约 | 37 个文件、339 个用例通过（2026-10-24） | `docs/testing/issue13-verification.md`；用例数经 `vitest run` 实测 |
| 原型 | 210 个用例（分层 90/90/20/10），属 Prototype Tests 证据 | `tests/prototype/test-cases.js` 的 `totalTests`；`TEST_INFRA.md` |
| 真实 Electron | 门禁内 24 个用例通过；`playwright.config.ts` 的 `testMatch` 只列 8 个 spec | 同上；`tests/e2e/playwright.config.ts` |
| 门禁外 spec | `window-chrome`、`session-persistence`、`hazel-design` 三个 spec（约 18 个用例）不在 `testMatch` 内，不进 `pnpm check`，也不进 CI | 同一份 `testMatch` 白名单 |
| 仓库规范化 | 6 个 `node:test` 用例 | `tests/repository/normalization.test.mjs`；`pnpm verify:repository` |

`210` 要按用例数引用，别和断言数混用；`verify-prototype.js` 输出的 "ALL 210" 是硬编码字符串，引用时以 `suite.totalTests` 为准。

门禁对 README 的两条机械约束：链接标签必须含 `apps/desktop` 且目标写成 `apps/desktop/`；任何含 `210` 的行必须同时含 `prototype`，且不得含 `e2e`。重写第一稿两次踩线，均先失败后修正，最终 6/6 通过。

## 四、Harness 边界

| 项 | 事实 | 证据 |
| --- | --- | --- |
| 只读工具 | `read_file`、`list_directory`、`search_in_files`（不是 `search`） | `shared/contracts/read-only-tools.ts` |
| 预算 | read_file 64 KiB、list_directory 200 项、search 深度 16 / 1000 文件 / 每文件 64 KiB / 合计 4 MiB / 100 命中 | `main/harness/read-only-tools.ts` 的 `TOOL_BUDGETS` |
| 停止 | 先等收敛；宽限期（默认 5 秒）到期由主进程强制结束并记固定失败码，不把超时当收敛 | `GLOSSARY.md` 的「收敛」；`run-manager.ts` |
| 授权 | 每次运行签发一次性 Grant，绑定任务、会话、projectId、revision、发起窗口与窗口纪元，过期或已消费即拒 | `run-manager.ts` |
| 凭证 | 主进程内从环境变量读取后交给适配器，不存在子进程；不进仓库、不写日志、不进事件 | `pi-adapter.ts`；`src` 内 `child_process`/`spawn`/`execFile` 零命中 |
| 外发 | 只读工具请求按路径策略预检，敏感名、二进制、链接与越界路径被拒 | `read-only-tool-policy.ts`、`read-only-tools.ts` |
| 关闭项 | 写入、命令、通用文件系统 IPC、Runtime 子进程 | `read-only-tools.ts` 只 import `lstat`/`readdir`/`readFile`；`IPC_CHANNELS` 无通用通道 |
| 易误读项 | `RuntimeSession.capabilities` 三项是 `z.literal(false)` 硬编码，不能用它否认已发生的真实只读运行 | `shared/contracts/runtime-session.ts` |

A09 记录里可见：模型一次运行发起四次工具调用，其中一次被判 `PATH_UNAVAILABLE` 且未泄露绝对路径，模型自行纠正后读到目标文件；另一次运行在启动约 160ms 后被停止并收敛为 `stopped`；fixture 树前后哈希一致。

## 五、旧 README 偏差清单

| 位置 | 旧说法 | 判定 | 依据 |
| --- | --- | --- | --- |
| 开头 | 「为开发者打造」「告别千篇一律」「像专业 IDE 一样」 | 无证据的营销语 | 重写改为可验证的能力描述 |
| 快速上手 | pnpm `>= 9.0.0` | 过时 | `packageManager` 固定 `pnpm@11.7.0` |
| 快速上手 | 门禁只列契约、真实 Electron 与 `check` | 不完整 | 另有 `verify:repository`、`test:prototype`；`check` 还含格式、lint、类型与 package smoke |
| 架构 | 「标准的前端桌面全栈技术与分层质量保障体系」 | 空泛 | 未提四层进程边界与 Pi 版本；重写给出层职责与真实版本 |
| 停靠面板 | 「目标支持拖拽拆分，算法与组件已有本地候选，`main` 入口尚未接入」 | 过时 | `SessionWorkbench` 已渲染 `DockSurface`，拖拽与重启恢复均有真实 Electron 用例 |
| 会话 Tabs | 「跨重启会话恢复已有本地候选代码，待与新工作台整合」 | 过时 | P1 收口已把多会话、草稿与布局持久化接入 |
| Harness | 「优先接通一条真实只读任务」 | 过时 | P2 已合并，三只只读工具与 A09 记录均在 `main` |
| 意图卡 | 「意图卡是澄清复杂目标的辅助工具」 | 即将失效 | 未提交工作树已删除 `SessionIntent.tsx`；重写不再把它写成现役能力 |
| 美学 | 「去除装饰性插画」 | 与代码矛盾 | `renderer/assets/hazel/` 有装饰资产，`HazelCompanion` 已挂载 |
| 文档 | 只列五份入口 | 缺项 | 缺 `GLOSSARY`、长期开发规格、设计令牌 |

## 六、跨文档口径冲突与处置

初检发现六处冲突。除第 3 条外均已在同一分支修正，逐条对应如下：

| # | 位置 | 冲突 | 处置 |
| --- | --- | --- | --- |
| 1 | `themasterplan/ROADMAP.md` | M3 行写「下一片 P2」「模型、工具、写入关闭」 | 改写 M3 行，并在 2026-10-03 段后新增「2026-10-26 P2 合并」节（含 375/375 门禁记录与 A09 结论） |
| 2 | `docs/plans/2026-10-10-…`、`docs/specs/2026-10-24-…` | 写 PR #16 未合并、`0410d5a`、A09 为 NOT_RUN | 前沿从 P2 改为 P3，状态表与拆票核对更新到 `fd26d06`；两份文件同时并入你工作树里未提交的改动（见第八节说明） |
| 3 | `docs/academic/2026-10-24-midterm-materials-baseline.md` | 「三项关闭」与真实运行演示冲突 | 该文件未被跟踪、且自述事实源是 `.scratch/midterm/spec/fact-base.md`，因此只在文末追加「2026-10-26 复核」节，不改 10-24 原文；口径要同步须先改 fact-base 再重出材料 |
| 4 | `产品定义与美学纲领.md` | 题头仍是 2026-09-11 版题目 | 升到 v2.1，题名改成 2026-10-08 正式题目 |
| 5 | `选题收敛说明.md` | 把「意图核对面板」「Dockview」写成现役方案 | Dockview 改为「自研两列停靠」，意图核对注明按 #41 收敛为会话内直接启动 |
| 6 | `PROJECT.md` | 把模型接入与工具执行列为后续工作 | 权威段与 M3 排除项按 P2 合并后重写 |

同类替换也覆盖 `themasterplan/THEMASTERPLAN.md`、`docs/README.md`、`AGENTS.md`、`docs/testing/pioneer-evidence-ledger.md`（新增 2026-10-26 当前核对节，原 10-03 节降为历史）。

仍保留的历史表述：`docs/plans/2026-10-01-…`（已废弃计划）、`docs/testing/p1-*` 与 `issue12-*`（时间戳记录）、`docs/research/literature-survey-*.md` 与三份开题材料里的 Dockview 说法。它们描述的是当时的设计与陈述，不作为现役实现口径。

另有一条仓库问题未处理：`AGENTS.md` 链接的 `docs/academic/2026-10-08-topic-and-form-baseline.md` 目前**未被 git 跟踪**，克隆者拿到的是死链；需要 `git add docs/academic/`（内容不含个人信息，由本人决定是否入库）。

另做了一轮旧题名清扫（2026-10-26）：GitHub 仓库 About 描述从「Pioneer — 模块化 AI Agent 交互系统的设计与实现」改为「Pioneer — 基于TypeScript的模块化智能体交互系统设计与实现」（`gh repo edit`，属远端设置、不在 git 内）。仓库内 `AGENTS.md`、`THEMASTERPLAN.md`、`产品定义与美学纲领.md`、`开题材料·需求与验收.md`、`功能全景与开题支撑清单.md` 的题名与定义句已同步；`开题PPT逐页文案.md` 加了题目口径说明但保留 09-11 版逐页讲稿。仍保留旧题名的是文献综述、调研原稿、`选题收敛说明.md` 的删改记录，以及 `demos/`、`tests/prototype/` 的冻结产物，它们都是时间点材料。

## 七、无法证实项

- 外部链接（Figma 设计稿、`figma.site` 原型预览、`developers.openai.com` 博客）在本次会话中 DNS 解析到非公网地址，未核实存活，也未据此新增引用。
- GitHub 上的 Issue #13 是否已关闭、PR #16 页面状态未查询，沿用仓库内记录。
- 未运行完整 `pnpm check`：新 worktree 无 `node_modules`，且本工作树只改文档与调研笔记。仓库规范化门禁实测 6/6 通过。

## 八、并发写作的并集说明

`docs/plans/2026-10-10-…` 与 `docs/specs/2026-10-24-…` 在主 checkout 里还有**未提交改动**（另一会话为 16 张子票写的导航与状态刷新）。本分支没有覆盖它们，而是把那份工作树版本整份并入本 worktree，再在其上做合并后的状态修正。也就是说：这两份文件的 diff 里含有那份未提交改动，合并本分支时应整份采用，不要与主 checkout 的旧工作副本逐行拼合。

未并入、也不建议并入的：`docs/academic/`（未被跟踪）、`docs/plans/2026-10-25-figma-github-sync-plan.md`（未被跟踪）、`.drops/`、`.v2c/`、`.video_agent/`。

## 九、独立复核修正的七处

背景核查代理对重写版逐条核对后，改掉了以下问题，本版已全部修正：

1. 「最近一次记录 2026-10-24、契约 339」不成立：`issue13-verification.md:173` 记 2026-10-26 第七轮 `0bfd5de` 为 375/375（39 文件），已改。
2. P3 行缺 #41、#42（`gh issue list` 确认两票 2026-10-26 已发布），已补。
3. 「确认意图」与「8 个 spec」需要基线限定，已在状态节写明「按 `main` `fd26d06` 核对，未合并工作树不计入」。
4. 把「下一片 P2」「模型工具关闭」同时算到 Wayfinder 计划头上不准确：那句在 ROADMAP:54/60 与 AGENTS.md:53，计划里的原话是「P2 是当前唯一活跃前沿」「PR #16 尚未合并」「A09 为 NOT_RUN」「远程 main 为 0410d5a」。相关文档已分别更新。
5. 只读工具的预算应按工具分开写，已列出 64 KiB／200 条目／深度 16 等具体值。
6. 「进程边界固定为四层」不准确：preload 与 renderer 同进程，shared 不是进程，改为「代码分层」。
7. `verify:repository` 不校验相对链接可达性，只查身份、旧路径、绝对 `file://`、210 限定与 `apps/desktop` 链接，描述已改。

另有一处顺带发现：`docs/design/hazel-v3/tokens.json` 与运行时 `renderer/styles/tokens.css` 的色值不一致（canvas 分别为 `#F6F5F1` 与 `#f1f2ee`），README 已如实写成「两套色值尚未合流」。

## 十、修订记录

- v1（2026-10-26）：初稿基于本机 checkout `395df15`，误把 P2 归为「仅分支」；工具名写成 `search`；凭证写成「注入子进程」；测试数字用文件内 `it` 块计数。
- v2（同日）：按 `origin/main` 复核后修正上述四处，补入 22 提交落后、门禁外 spec、`search_in_files`、主进程读凭证、339/24/210 的准确口径。
- v3（同日，第二轮）：并入独立复核的七处修正；按用户要求同步全部状态文档；新增第六、八、九节。

## 十一、复现命令

```powershell
git fetch origin main
git log origin/main --oneline -5
git merge-base --is-ancestor 395df15 origin/main; $LASTEXITCODE
git rev-list --count 395df15..origin/main
git ls-tree --name-only origin/main apps/desktop/src/main/harness/
git show origin/main:tests/e2e/playwright.config.ts
node --test tests/repository/normalization.test.mjs
```
