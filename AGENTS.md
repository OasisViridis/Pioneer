# TheMasterplan Agent Workflow · Pioneer

> 本文件是 Pioneer 仓库的 Agent 交付入口，遵循 TheMasterplan 协议规范（GitHub Flow + Jujutsu 适配）。
> 核心原则：单一交付责任人（Single Delivery Owner），严格执行质量门禁与真实验证，不跳过人类审批。

## 项目事实 (Project Facts)

- **项目名**：Pioneer（模块化智能体交互系统）
- **正式毕业设计题目**：`基于TypeScript的模块化智能体交互系统设计与实现`（用户于 2026-10-08 按导师意见确认）。后续新材料按 [选题收敛说明](选题收敛说明.md) 与 [填表基准](docs/academic/2026-10-08-topic-and-form-baseline.md) 起稿；旧表/旧演示名称不覆盖新题，个人资料只读本地私密档案，不外传。
- **项目目标**：实现模块化智能体交互系统，践行「一切皆 UI」哲学，由两条主线构成——① 交互系统：Tabs 多标签页、媒体库海报墙、模块化工作区（会话 + 按需打开的可停靠面板）；② Harness 工程：轻量上下文、能力模块化、统一接入，复用 Pi Agent Harness 运行底座。
- **默认分支 / 书签**：`main`
- **版本控制基线**：
  - 当前 checkout 为 Git-only（2026-10-02 核对），无 `.jj`，本机未找到 `jj`；Git 为 `2.55.0.windows.2`。
  - Jujutsu 是受支持工作流，不因文档示例自动初始化或转换现有仓库。
- **当前核心验证入口**：
  ```powershell
  pnpm check
  ```
- **质量门禁 (Quality Gates)**：
  - **Repository Normalization**：`pnpm verify:repository`，校验文档中无绝对 file 协议链接，规范化 210 原型必须限定为 Prototype Tests 声明与路径引用。
  - **Contract Tests**：`pnpm test:contract`，验证共享契约、路径、扫描器、IPC、安全边界、设置存储与 Tabs reducer。
  - **Prototype Tests**：`pnpm test:prototype`，冻结 M1 Prototype Tests 为 210/210；这是模拟器和探针证据，不是 Electron proof。
  - **Real E2E**：`pnpm test:e2e`，由 Playwright 启动真实 Electron，跨越 main → preload → renderer，并校验 fixture 不变性。
  - `pnpm check` 依次执行格式、lint、类型检查、上述三层测试与最终 package smoke；M2 已完成，M3 继续以该门禁作为主线质量基线。
- **工作流规范**：
  - 采用 TheMasterplan 单一交付责任人机制，子代理可协助编码与调研，但主交付责任人统管最终 Diff 审阅、VCS 提交与人类交接；
  - 已有 `.jj` 的工作副本优先使用 `jj`；当前 Git-only 副本使用 Git，保留继承的未跟踪候选，不切分支覆盖或整包提交；
  - 任何合并、远程发布与破坏性清理未经人类明确许可不得执行。

## 权威顺序 (Authority Order)

1. 系统安全、隐私、本地数据保护要求（数据不出本机、零意外删除）
2. 受保护分支与发布限制
3. 根部 `AGENTS.md` 与 `themasterplan/THEMASTERPLAN.md` 架构总纲
4. 当前 Issue / 用户明确指令
5. 项目架构、设计规范（`docs/design/`）与测试清单（`tests/`）
6. README 与辅助说明文档

## 测试真相与里程碑边界

- [`TEST_INFRA.md`](TEST_INFRA.md) 是 Contract Tests、Prototype Tests、Real E2E 的验证分类和命令边界。
- `pnpm test:contract`、`pnpm test:prototype` 与 `pnpm test:e2e` 都是可执行的真实命令，证据层级不可混用。
- 文档格式与词汇边界由 `pnpm verify:repository` 机械校验（严禁绝对路径链接，210 声明必须限定为 Prototype Tests）。修改文档后应优先运行此项验证。
- 原生目录选择器不在确定性 E2E fixture seam 内；没有穿越 Electron main → preload → renderer 的真实流程，不能宣称 Real E2E。
- 原生目录选择器不属于确定性 E2E seam；M2 的人工验收证据已完成并保存在 `docs/testing/m2-native-picker-smoke.md`，后续 fixture seam 仍不得冒充该类人工证据。
- 里程碑状态只以 [`themasterplan/ROADMAP.md`](themasterplan/ROADMAP.md) 为准。
- `demos/` 与 `tests/prototype/` 是冻结的 M1 参考实现与测试证据，其内嵌文案沿用当时的题目口径（「基于模块化架构的桌面任务助理 Agent 交互系统」），**不代表当前课题定位**。当前题目与定位以 [`选题收敛说明.md`](选题收敛说明.md) 为准，开题汇报以 Figma `Pioneer-PPT` 为权威源。

## 常用工作流命令 (Git + TheMasterplan)

当前工作副本为 Git-only，使用标准 Git 配合 TheMasterplan 门禁流程。若工作副本具备 `.jj`，请参阅 [Jujutsu 工作流](docs/workflow/jujutsu.md)。

用户于 2026-10-03 验收 v8 展示视频并恢复应用开发；P0 底座、P1 可恢复会话与 P2 真实只读 Harness（PR #16，2026-10-26 合并）均已完成。当前前沿是 P3：面板接真实数据（#17）、移除意图卡（#41）、修正运行提示（#42）；唯一施工队列见[Wayfinder 端到端开发计划](docs/plans/2026-10-10-pioneer-wayfinder-development-plan.md)与 [GitHub Issues #9 主地图](https://github.com/OasisViridis/Pioneer/issues/9)。

```powershell
# 1. 检查当前工作副本状态与变更
git status --short

# 2. 核对具体差异
git diff

# 3. 运行本地仓库规范化与门禁（提交前通过 .githooks 自动拦截轻量错误）
pnpm verify:repository
pnpm check
```

## 终端环境与命令规范 (PowerShell & Tool Economy)

- **原生 PowerShell 执行**：Windows 宿主下底层 Shell 为原生 PowerShell，直接运行 cmdlet，**严禁在外层包裹 `powershell -Command "..."` 或 `cmd /c "..."`**，避免引号转义损坏和变量提前展开。
- **多文件批量探测**：探测多文件存在性时，优先使用数组管道表达：
  ```powershell
  'file1', 'file2' | ForEach-Object { "$_ : $(Test-Path $_)" }
  ```
- **目录探索预算控制**：在根目录下探索时使用非递归 `Get-ChildItem`，**严禁对根目录直接执行 `Get-ChildItem -Path . -Depth 1`**（会导致 `tmp/`、`tests/` 等深层子目录的百余个文件展开，造成输出截断与上下文爆炸）。
- **临时产物与日志隔离**：一次性维护/探针脚本放于 `tmp/` 或 `.scratch/`，临时日志输出至 `logs/` 或 `tmp/`，严禁在项目根目录下平铺临时产物；根目录已配置 `.gitignore` 拦截 `logs/`、`.scratch/`、`kdocs_*`、`meeting_*` 与 `pioneer-cinematic-*`。

## Agent skills

### Issue tracker

GitHub issues tracked via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical 5-role triage vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context domain docs (`GLOSSARY.md` + `docs/adr/`). See `docs/agents/domain.md`.
