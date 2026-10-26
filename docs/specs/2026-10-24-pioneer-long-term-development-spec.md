# Pioneer 长期开发计划与验收规格（2026.10—2027.06）

权威 Issue：[开发计划 #9](https://github.com/OasisViridis/Pioneer/issues/9)。原 Spec #14 已归并；#12 已完成，#13 正在开发。本次只更新规划，不改变 #13 的范围、票据或实现。

> 更新日期：2026-10-25（Asia/Shanghai）；初版：2026-10-24。正式课题：《基于TypeScript的模块化智能体交互系统设计与实现》。
> 测试边界已于 2026-10-24 经用户确认：真实 Electron 主流程、main 受控适配器、既有 Contract Tests，以及独立的真实 Provider / Windows 人工验证。规格已并入总计划 #9；当前任务状态以 #9 顶部导航和原生依赖为准。

## 两分钟简报

**目标：到 2027 年 6 月，交付可独立运行的 Windows 应用、可复核的实验、论文和演示材料。** 用户能打开本地项目，让 AI 在允许的范围内读取材料、完成任务、展示依据，并在修改文件前给出可审阅的 Diff。

**现在：** 项目浏览、多会话、保存与恢复已有本地实现和阶段记录，#12 已完成。P2 只读 Harness 经 PR #16 合并进 `main`（`3f262fe`，后续 PR #40 到 `fd26d06`）：模型接入与三只只读工具在显式一次性授权下可用，A09 真实 Provider 已留证；写入、命令与通用文件系统 IPC 仍关闭。#13 票据仍开放，验收收口另计；当前前沿为 P3（#17、#41、#42）。

| 时间窗口                             | 用户能得到什么                                   | 必须留下的交付证据                               |
| ------------------------------------ | ------------------------------------------------ | ------------------------------------------------ |
| 2026 年 10—11 月 · P2                | 在应用里读项目、问问题、看进度和停止             | #13 的自动化、真实模型、成品运行分别验证         |
| 2026 年 11—12 月 · P3                | 按需看上下文、工具、日志和结果，工作区不被打断   | 来源正确、会话隔离、键盘操作与恢复记录           |
| 2026 年 12 月 · P4 / M3              | 先审阅再修改，失败能说明，恢复不覆盖自己的新内容 | 授权、真实磁盘变更、冲突与回滚验证               |
| 2026 年 12 月—2027 年 1 月 · M4 / P5 | 会话分支、少量可复用能力、独立 Windows 包        | 分支与权限隔离、升级恢复、安装及冷启动记录       |
| 2027 年 2—3 月 · M5                  | 同模型同任务的对比结果与论文初稿                 | 冻结方案、原始数据、可重算分析、版本索引         |
| 2027 年 4—5 月 · M6                  | 稳定候选、论文终稿、演示视频与答辩排练           | 完整门禁、人工验收、干净配置排练                 |
| 2027 年 6 月 · 归档缓冲              | 可定位、可打开、可校验的完整交付包               | 源码、包、数据、论文、设计与视频的版本及哈希清单 |

**下一步：** #13 由现有开发继续推进；之后先做 P3 的上下文、能力与日志，再接 P4 的真实改动和产物。Windows 基础兼容、实验方案和已实现部分的论文可以并行准备。后续 16 张子 Issue 已发布，入口与依赖见下表；保持一个总入口。

**取舍：** 保住真实任务、文件安全、停止与恢复、Windows 成品、实验和论文。延期时依次减少桌宠增强、额外预览格式、更多 Provider、复杂分支展示与插件数量；不减少安全检查，不把未运行测试算通过。月份是内部目标窗口，学校截止日期以实际通知为准。

## Problem Statement

使用者需要从本地项目进入一个可恢复的任务会话，理解智能体正在做什么、使用哪些材料与能力，在需要时停止执行，并审阅可追溯的改动和产物。当前桌面基础与会话恢复已有阶段记录，只读 Harness 仍在开发和验证，受控修改、完整结果面板与最终成品尚待交付。

开发者同时需要完成交互系统、Harness 工程、对比实验、论文和展演归档。已有长期计划需要跟随实际交付更新，并让读者快速看到当前进度、后续依赖、完成条件和延期取舍。本地工作分支、远程主分支和历史记录的状态不同，必须分别表述，避免重复施工或过早宣称完成。

## Solution

沿用媒体库海报墙、会话 Tabs 和按需打开的停靠面板，以一条真实任务纵向链逐步扩展产品：可恢复会话 → 只读 Harness → 可观察的内容面板 → 受控修改与恢复 → 有限扩展和 Windows 成品 → 实验与论文 → 答辩、封版和归档。

保留正在实施的 P2，细化它之后的交付结果、依赖和验收条件。#9 是总计划与本规格的唯一入口；#10/#11 已归并，#12 已关闭，当前实现归 #13。后续工作已按依赖拆成子 Issue，进入开发时复核输入版本与未决决定。正式里程碑状态仍由仓库 ROADMAP 记录；本规格不会自行改写 M3 的完成状态。

2027 年 6 月是项目采用的最终归档锚点。以下月份是内部目标窗口，不是校方已确认的提交或答辩日期。每 4—6 周交付一个能运行、能录屏、有证据的增量；测试、设计记录、实验准备和论文素材随开发积累。

## User Stories

1. As a local project user, I want to browse projects in a media library, so that I can find the right workspace quickly.
2. As a local project user, I want to create multiple sessions for one project, so that unrelated tasks remain separate.
3. As a returning user, I want drafts, messages and panel layouts restored after restart, so that I can continue without reconstructing my work.
4. As a user, I want closing a tab to preserve its session, so that navigation does not accidentally delete work.
5. As a user, I want optional intent clarification inside the conversation, so that I can refine an unclear task without a mandatory workflow for every request.
6. As a user, I want model, tool and data permissions shown separately, so that confirming a goal does not silently authorize execution.
7. As a user, I want to select the provider, model and permitted outbound material, so that I control what a real model call can access.
8. As a user, I want a read-only task to use approved project material, so that I can obtain useful analysis without changing project files.
9. As a user, I want tool names, execution status and result sources to remain visible, so that I can understand how an answer was produced.
10. As a user, I want denied tools and unavailable paths explained honestly, so that a refusal is never presented as a successful empty result.
11. As a user, I want to stop a running task and receive an actual stop confirmation, so that I know whether execution has ended.
12. As a user, I want disconnection to trigger stopping and an unconfirmed stop timeout to produce a fixed failure code, so that a forced termination is never presented as a normal stop.
13. As a user, I want reconnection to query the host state and a restarted host to mark unfinished historical runs without replaying them, so that recovery does not duplicate actions.
14. As a user, I want events isolated by session and run, so that one task cannot overwrite another task's output.
15. As a user, I want context, capabilities and run logs available on demand, so that I can inspect details while keeping the conversation readable.
16. As a user, I want new results to preserve my layout, focus and draft, so that execution does not interrupt my current work.
17. As a keyboard user, I want to open, move, close and revisit panels with visible focus, so that I can operate the workspace without a mouse.
18. As a user with a small window or enlarged text, I want controls and approval information to remain reachable, so that the application remains usable.
19. As a reviewer, I want changes and generated artifacts associated with their run and source version, so that I can inspect the correct result.
20. As a reviewer, I want unsupported or missing artifacts identified clearly, so that a placeholder is never mistaken for a working preview.
21. As a user, I want to review the target paths and proposed changes before applying them, so that I retain control over project modifications.
22. As a user, I want permissions bound to the current task revision and target state, so that an old approval cannot authorize a different operation.
23. As a user, I want command execution constrained by an explicit permission scope, so that read-only access cannot silently become shell access.
24. As a user, I want partial changes and failed operations reported accurately, so that I can decide how to recover.
25. As a user, I want rollback to restore only the application's own changes, so that my concurrent work remains intact.
26. As a reviewer, I want validation results invalidated when their inputs change, so that an old passing result cannot certify a new revision.
27. As a user, I want applied changes, automated checks, human acceptance and delivery distinguished, so that I can judge readiness accurately.
28. As a user, I want to branch a conversation from an earlier point, so that I can explore another approach without losing the original history.
29. As a user, I want conversation history restoration distinguished from filesystem rollback, so that browsing an earlier state cannot unexpectedly alter files.
30. As an extension author, I want capabilities described by validated schemas and explicit permissions, so that extensions can be composed without bypassing host policy.
31. As a returning user, I want reusable Runbook examples for verified workflows, so that successful procedures can be repeated with clear prerequisites.
32. As a Windows user, I want an independently runnable package with working fonts, window controls and session recovery, so that the product works outside the development checkout.
33. As a Windows user, I want input methods, scaling and assistive navigation checked on the platform, so that a visually complete interface is also operable.
34. As a user, I want an optional companion to be hideable and unobtrusive, so that it never blocks inputs, approvals or evidence.
35. As a researcher, I want harness variants compared on the same model, task set and budgets, so that measured differences are interpretable.
36. As a researcher, I want failures, timeouts, raw measurements and missing usage data retained, so that the report cannot overstate performance.
37. As a thesis author, I want design decisions and implementation evidence collected during development, so that the final paper accurately reflects the delivered system.
38. As a presenter, I want both a live demonstration and a clearly labelled offline fallback, so that network failure does not force me to misrepresent a recording as live execution.
39. As a maintainer, I want each implementation ticket to have an owner, dependencies and a verifiable exit condition, so that work can proceed without duplicate delivery.
40. As a final reviewer, I want source, package, experiment data and presentation assets tied to identifiable versions and hashes, so that the archived project can be reproduced and audited.

## Implementation Decisions

### 1. 起点与状态口径

截至 2026-10-25 核对，以下是规划输入，不是本轮重新运行实现测试的结论：

| 对象           | 可采用的事实                                                                   | 不能据此推导的结论                                                  |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| M1、M1.5、M2   | ROADMAP 记录为完成                                                             | 历史原型不是当前 Agent 产品的运行证据                               |
| M3 / P0、P1    | M3 进行中；P0/P1 有阶段记录，P2 已合并进 `main`                                 | 合并不等于 M3 完成，也不等于 #13 验收收口已关闭                     |
| #10 / #11      | 历史研究与只读预检已归并至 #12；#13 已有工具执行实现                           | 预检本身仍不等于执行器，更不是抵御敌对并发替换的完整沙箱            |
| #12 / PR #15   | #12 已关闭；PR #15 已合并，评论记录了人类确认的停止语义修订                    | 不重新打开决策，不用旧正文中的持续 Unknown 覆盖后来的确认           |
| #13 / PR #16   | #13 票据开放；PR #16 已合并（`3f262fe`），七轮复审修复与 PR #40 在 `main`       | 票据未关闭不等于实现未合并，也不等于验收条件全部满足                |
| 自动化记录     | `0bfd5de` 的完整门禁：Contract 375/375、Prototype 210/210、Real Electron 24/24  | 记录绑定该提交；合并后 CI 的修复在 `474fb16`，不认证未提交改动      |
| 当前交付缺口   | A09 真实 Provider 为 PASS（开发入口）；打包成品运行仍靠人工授权验收             | 开发入口通过不等于成品验收完成，自动门通过也不等于 P2 验收完成      |
| Runtime 与权限 | 分支已有运行管理实现；READY 不等于 Grant，读取不等于外发，P2 不授予写入        | 任何未来能力都不能从旧授权、旧结果或标签推导出许可                  |

本次拆票核对：P2 合并后 `main` 为 `fd26d06`；最后一次完整门禁记录在 `0bfd5de`。发布前回读当前状态；未来每次交付刷新版本与证据，不把这张快照当永久状态。

### 2. 保留的架构与产品约定

- 保持 Electron Forge/Webpack、React、TypeScript、Zod 与现有会话内停靠实现的技术路径；先复用现有会话、停靠、IPC 与持久化模块，不重建应用外壳。
- 对话是默认主轴；上下文、能力、RunLog、Changes 与 Artifacts 按用户显式操作打开。结果到达不自动换布局、抢焦点、改草稿或强制滚动。
- Session、Run、意图修订、布局与模型上下文分别建模。关闭面板或会话标签不等于停止任务、删除记录或回滚文件。
- 目标澄清可选；执行、外发、写入和发布许可各自表达。沿用旧 READY 数据的迁移兼容性，同时避免把旧意图签署恢复成所有任务的强制步骤。
- main 持有项目目录册、运行注册表、授权与执行资源；preload 只暴露固定动作和可撤销订阅；renderer 消费经校验、脱敏的数据，不获得 SDK、密钥或通用文件系统入口。
- 沿用 #13 的 Agent 核心与模型接口组合，分支已固定 Pi 依赖与锁文件。完整 coding-agent SDK 按会话树、压缩或扩展的实际需要另行评估；升级时重新检查接口、认证默认行为和成品加载。
- P2 模型凭证只进入 main 的受限运行上下文，不读取用户全局凭证、自动发现工作区脚本或加载隐式默认工具。真实模型传输需明确 endpoint、模型和允许外发的材料集合；只读许可不代表允许外发。
- 现有主进程 IPC 是首选桥接。M4 的目标是双向事件与扩展能力；只有经决策票证明宿主隔离或跨进程需求时才增加 WebSocket/SSE，不预先引入第二套总线。

### 3. 长期阶段与退出条件

| 目标窗口           | 阶段与依赖                                                  | 交付物                                                                               | 退出条件                                                                                                                  |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 2026-10 下旬       | 已有基线；#12 已完成，#13 的实现已合并（PR #16）            | 已确认运行规则、停止决策及对应版本                                                   | 合并后的实现以 `main` 为准；#13 的验收收口另计，未验证项不因合并记为通过                                                  |
| 2026-10 下旬—11 月 | P2；#13 现有开发与分层验证                                  | 有来源、可停止的只读 Harness；最小运行 UI；开发与成品加载证据                        | 由 #13 原验收决定完成；远程门禁、受控 Electron、真实 Provider 与成品证据均须按版本核实，待验证项不能由历史记录补足        |
| 2026-11—12 月      | P3；依赖稳定运行契约，可与 P2 后半程并行                    | 接真实来源的上下文、能力、日志、改动/产物入口与单布局工作区                          | 无跨会话串流；新结果不扰动布局；正常/空/失效/错误状态可达；键盘、窄窗、恢复有证据；尚未实现的写入内容保持真实空态         |
| 2026-12 月         | P4 / M3 收口；依赖 P2 与可审阅结果                          | 先完成一种产物生成或代码修改闭环，再增加一个明确授权的命令场景；Diff、快照与受控回滚 | 在临时工作区实测批准/拒绝、旧许可、目标变化、部分完成、写失败和回滚；用户并发内容保留；实际能力与验收满足 M3 要求后才收口 |
| 2026-12—2027-01    | M4 与 P5；以稳定 P2/P4 契约为前置，Windows 基础问题可提前修 | 最小会话分支/历史恢复、有限原子能力与 Runbook；独立 Windows 包；可选桌宠薄宿主       | 分支不越权继承许可，历史浏览不修改文件；扩展不绕过宿主策略；包离开源码目录仍运行；Windows 核心操作可用；不以桌宠阻塞主链  |
| 2027-02—03         | M5；实验方案可在 P2 后预研，正式数据依赖冻结候选            | 同模型同任务的对照数据、分析图表、论文初稿、设计/实现证据索引                        | 任务与判据先冻结，失败与超时纳入分母，原始数据可追溯；结果可重算；论文描述与对应软件版本一致                              |
| 2027-04            | M6 候选冻结与验收                                           | 冻结候选、Windows 人工验收、安装/冷启动/恢复记录、论文修订稿                         | 完整门禁与人工门均有版本记录；关键数据/权限/恢复缺陷已解决；未完成项显式处置；冻结后只纳入经审查的必要修复                |
| 2027-05            | M6 展演与终稿                                               | 在线演示脚本、明确标识的离线兜底、演示视频、答辩材料、终版归档候选                   | 至少一次从干净用户配置开始的完整排练；失败/停止/恢复也能说明；离线材料不冒充在线运行；归档可从清单定位与校验              |
| 2027-06            | 最终归档与缓冲                                              | 源码、依赖锁、Windows 包、实验数据/分析、论文、设计、视频、运行说明与校验清单        | 按实际收到的学校要求提交；核对最终版本、哈希和可打开性；个人档案留在私密交付渠道；记录未解决限制                          |

日期到达不等于验收通过。若前置门未过，后续可独立推进设计说明、论文已实现章节和离线测试准备，但不得越过权限或伪造里程碑完成。

### 4. 当前任务保护与后续进入条件

1. #13 继续由现有开发负责。本计划不修改其正文、标签、负责人、状态、依赖、实现、测试或 PR，也不创建竞争任务。#12 已完成，不重新安排一轮契约工作。
2. #13 完成前可准备 P3 交互清单、P4 权限与恢复方案、实验任务草案、Windows 人工清单和论文已实现章节；依赖运行契约的实现须以接受后的版本为输入。P2 未完成时，P3 可做独立设计，不对外宣称完整运行体验已交付。
3. 进入 P3 实施时，核对 #13 的交付版本、现有 Session/Run 数据、事件来源和可复用组件；先接上下文、能力与日志，保留真实空态。P4 产物未出现前，Changes/Artifacts 不填演示数据。
4. 进入 P4 前，完成授权、变更计划、目标状态校验和恢复方案的决策。每个工作包只实现清楚界定的操作；命令执行另有策略决策，不随文件写入自动开放。
5. 进入实验与冻结前，按下方工作包的进入条件核对；任何前置未满足均保留待办，不因月份到达而跳过验收。

### 5. P3—P5 / M4 的范围控制

- P3 逐类接真实内容，先上下文、能力与 RunLog，再接 P4 产生的 Diff 和 Artifacts。支持格式、空态和不可读状态均有明确 UI；不为截图补假统计、假任务或假预览。
- P4 把授权绑定到任务/运行、修订、目标路径、当前文件版本、允许操作和有效期。接受 Diff、写盘、自动检查、人工验收与交付分别记录；内容改变后原有验证结果失效。
- 回滚只处理该次受控变更；遇到用户并发修改时报告冲突并保留现场，不恢复整目录快照覆盖新内容。命令执行先经过独立策略决策票，定清威胁模型、允许命令与参数、工作目录、环境继承、可写范围、停止与部分副作用后，再实施明确场景；不接受模型任意拼接 shell 字符串。可先交付受控文件写入切片，命令决策未完成时保持待办，不顺带开放能力。
- M4 先实现一条分支/历史查看路径和少量内建能力组合。会话回退与文件回滚是不同动作；新分支不能重放旧权限或自动重新执行。完整扩展发现、第三方插件加载与复杂调度保持后续独立决策。
- P5 优先成品启动、会话恢复、输入法、字体、键盘与原生窗口操作。桌宠复用已有合法资源，只订阅明确批准的显示状态；可隐藏，不遮挡内容，也不获得执行权限。
- 数据 schema 的迁移、坏档保护和未知版本处理继续沿用会话持久化经验；更改事件或能力合同先检查旧数据兼容性，再升级版本。
- UI 延续当前 Hazel 设计规范和现有组件，先核对可复用实现、令牌与交互。设计稿完成、素材存在与应用集成分别记账；插画与桌宠不承担运行状态或授权提示，不让装饰占用核心任务空间。

### 6. 已发布的工作包与依赖

原有 13 个工作包已按用户要求发布，并单列两张权限决策票和一张 M3 验收票，共 16 张子 Issue、24 条原生依赖；细化后的子票共 98 条用户故事，对应上文 40 条总体用户故事。#9 保持唯一总入口，#13 继续原开发。

当前先完成 #13；之后优先 [#17](https://github.com/OasisViridis/Pioneer/issues/17)，写入规则、分支和实验准备按各票前置安排。下表为执行导航；技术细节与验收清单保存在各子票。票据关闭不自动证明验收通过，取消或缩减范围须有明确接受决定。

| 工作包与 Issue                                                            | 交付结果                                   | 前置 Issue                                                                                                                                                                   | 目标窗口                  |
| ------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **P3-A** [#17](https://github.com/OasisViridis/Pioneer/issues/17)         | 真实上下文、能力与日志；会话隔离和可访问性 | [#13](https://github.com/OasisViridis/Pioneer/issues/13)                                                                                                                     | 2026年11—12月             |
| **P4-D1** [#18](https://github.com/OasisViridis/Pioneer/issues/18)        | 人类确认写入授权、版本绑定与恢复规则       | [#13](https://github.com/OasisViridis/Pioneer/issues/13)                                                                                                                     | 2026年11—12月             |
| **P4-A** [#19](https://github.com/OasisViridis/Pioneer/issues/19)         | 一个文本修改或产物场景，先审阅再批准       | [#17](https://github.com/OasisViridis/Pioneer/issues/17)、[#18](https://github.com/OasisViridis/Pioneer/issues/18)                                                           | 2026年12月                |
| **P4-B** [#20](https://github.com/OasisViridis/Pioneer/issues/20)         | 部分完成、并发冲突与安全恢复               | [#19](https://github.com/OasisViridis/Pioneer/issues/19)                                                                                                                     | 2026年12月                |
| **P3-B** [#21](https://github.com/OasisViridis/Pioneer/issues/21)         | 真实 Diff/Artifacts 来源与过期状态         | [#20](https://github.com/OasisViridis/Pioneer/issues/20)                                                                                                                     | 2026年12月                |
| **P4-D2** [#22](https://github.com/OasisViridis/Pioneer/issues/22)        | 人类确认命令威胁模型、范围与停止规则       | [#18](https://github.com/OasisViridis/Pioneer/issues/18)                                                                                                                     | 2026年11—12月             |
| **P4-C** [#23](https://github.com/OasisViridis/Pioneer/issues/23)         | 一个获批命令场景及真实副作用验证           | [#22](https://github.com/OasisViridis/Pioneer/issues/22)、[#20](https://github.com/OasisViridis/Pioneer/issues/20)                                                           | 2026年12月—2027年1月      |
| **M3-G** [#24](https://github.com/OasisViridis/Pioneer/issues/24)         | 按接受范围核对同版本证据，提交验收建议     | [#21](https://github.com/OasisViridis/Pioneer/issues/21)、[#23](https://github.com/OasisViridis/Pioneer/issues/23)                                                           | 2026年12月—2027年1月      |
| **M4-A** [#25](https://github.com/OasisViridis/Pioneer/issues/25)         | 会话分支、迁移恢复，不重放权限或文件操作   | [#13](https://github.com/OasisViridis/Pioneer/issues/13)                                                                                                                     | 2026年12月—2027年1月      |
| **M4-B** [#26](https://github.com/OasisViridis/Pioneer/issues/26)         | 有限内建能力与一个可复用 Runbook           | [#20](https://github.com/OasisViridis/Pioneer/issues/20)                                                                                                                     | 2026年12月—2027年1月      |
| **P5-A** [#27](https://github.com/OasisViridis/Pioneer/issues/27)         | 独立包、升级恢复、Windows 平台验证         | [#24](https://github.com/OasisViridis/Pioneer/issues/24)、[#25](https://github.com/OasisViridis/Pioneer/issues/25)、[#26](https://github.com/OasisViridis/Pioneer/issues/26) | 2026年12月—2027年1月      |
| **P5-B** [#28](https://github.com/OasisViridis/Pioneer/issues/28)（可选） | 可隐藏的陪伴体验，不阻塞核心交付           | [#27](https://github.com/OasisViridis/Pioneer/issues/27)                                                                                                                     | 核心完成且时间允许        |
| **M5-A** [#29](https://github.com/OasisViridis/Pioneer/issues/29)         | 冻结比较问题、任务、评分、预算及先导方案   | [#13](https://github.com/OasisViridis/Pioneer/issues/13)                                                                                                                     | P2后准备，2027年1月前完成 |
| **M5-B** [#30](https://github.com/OasisViridis/Pioneer/issues/30)         | 正式测量、可重算图表与论文初稿             | [#29](https://github.com/OasisViridis/Pioneer/issues/29)、[#24](https://github.com/OasisViridis/Pioneer/issues/24)、[#26](https://github.com/OasisViridis/Pioneer/issues/26) | 2027年2—3月               |
| **M6-A** [#31](https://github.com/OasisViridis/Pioneer/issues/31)         | 候选冻结、干净检出与人工终验               | [#27](https://github.com/OasisViridis/Pioneer/issues/27)、[#30](https://github.com/OasisViridis/Pioneer/issues/30)                                                           | 2027年4月                 |
| **M6-B** [#32](https://github.com/OasisViridis/Pioneer/issues/32)         | 论文终稿、展演排练、视频和哈希归档         | [#31](https://github.com/OasisViridis/Pioneer/issues/31)                                                                                                                     | 2027年5—6月               |

P5-B 不作为任何核心票据的前置。P5-A 先在功能候选上验证独立包，M6-A 冻结后按影响范围复验，二者没有循环依赖。准备材料可并行；同一交付责任人只推进一个主要实现包，不代为分配负责人。ready-for-agent 表示规格可执行，仍需满足原生依赖、人类决策及具体运行授权。

### 7. 实验与学术交付

- 在 P2 后建立测量记录，在 M5 正式实验前冻结基线 Harness、Pioneer 变体、任务集合、评分规则、模型标识、提示输入、工具权限、预算、重复次数和失败分类。具体样本量及重复次数依据先导实验与可用预算定稿，不在本规格虚构结论。
- 对比至少覆盖上下文/Token 用量、完成率和端到端耗时。同模型同任务配对执行，记录缓存、网络、模型版本变化等混杂因素。评测任务与用于调试的任务分离；任务开始后不因结果不好而从样本中删除。
- 完成率分母包含所有预定尝试；拒绝、失败、超时、取消和未运行分别报告。Provider 未返回 usage 时记为缺失，不填零；估算值与实测值分开。报告重复运行的分布和不确定性，不预设“减少多少”“提升多少”。
- 每条数据关联任务、运行、配置与软件版本，保留脱敏原始记录和可重算分析。论文正文明确工程来源与第三方复用边界，不把 Prototype Tests 当作 Harness 对比实验，也不把界面设计覆盖当作用户研究结果。
- 需求、设计、实现章节随开发增量写作；M5 集中固化方法、结果和讨论，M6 修订终稿。学校格式、AIGC 使用记录及答辩要求以实际收到的规范为准，不编造阈值或已获审批。

### 8. 执行节奏、风险与取舍

- 一个切片只有一个交付责任人；近期保持一个主要整合前沿，独立调查与审阅可以并行。每周刷新当前版本、owner、原生 blockers、验收缺口和下一步；每 4—6 周做一次可运行演示与范围复核。
- 任务开始条件：输入和验收明确、依赖核对、授权边界清楚、可复用测试入口已选定。任务结束条件：可观察行为通过测试、适用人工门通过、独立 Diff 审阅、证据与交付版本一致。
- 高优先级始终为：会话不丢失、真实可停止的只读运行、权限与文件安全、可审阅结果、最小受控修改闭环、成品可运行、可复核实验、论文和归档。
- 延误时先缩减桌宠增强、额外格式预览、更多 Provider、复杂分支展示和插件广度，保留对应待办与限制说明。不能削减路径/权限检查、失败恢复、实验真实性或归档验证。
- 若 2026 年底仍未完成真实只读链，暂停增加扩展与装饰，把 2027 年 1 月用于运行闭环和成品稳定；同步调整 M4 深度与实验规模。若受控修改的安全条件仍不能满足，提交明确范围变更供人类决策，论文与演示按实际能力表述，不自行把未实现项写成完成。
- 最大风险及对策：本地通过但远程失败→以同一交付版本核对环境与门禁；Pi 升级或成品加载不兼容→保留开发/成品探针；取消或文件竞态→主进程权威状态和失败用例；Provider 不稳定→独立真实验证记录与受控自动化；界面膨胀→复用组件、按需面板；临近答辩缺证据→持续采集并预留 4—6 月验收与归档窗口。

| 检查点          | 继续推进所需证据                   | 未满足时的动作                                                             |
| --------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| 2026 年 11 月末 | P2 真实链与停止验证，P3-A 输入稳定 | 保留 P2 待办；优先运行问题，暂停插件/装饰扩张；P3 只推进独立准备           |
| 2026 年 12 月末 | 最小受控修改与恢复可验证           | 1 月优先核心安全闭环及成品；缩小 M4 深度，涉及已承诺功能削减时提交范围变更 |
| 2027 年 1 月末  | 可独立运行候选、实验方案和先导结果 | 冻结新增产品功能，按剩余预算缩减实验规模并解释限制；不删除失败样本         |
| 2027 年 3 月末  | 正式数据可重算、论文初稿可核对     | 4 月优先复核与论文；不临时更换基线来制造有利结果，必要重跑单独标版         |
| 2027 年 4—5 月  | 关键缺陷已解决、人工门与排练通过   | 只纳入必要修复，按影响范围重验；延后非核心功能，清楚记录交付限制           |

每周简报固定为五项：**本周已交付及证据、当前任务与负责人、阻塞与所需决定、下一项及进入条件、时间/范围变化**。只有绑定版本的已完成行为进入“已交付”；排查中、未运行和等待授权单列。此处规定维护节奏，不创建自动提醒或擅自分配负责人。

## Testing Decisions

### 主要行为入口：一条真实 Electron 任务链

复用现有 Playwright 启动真实 Electron、隔离用户配置、固定工作区 fixture 和退出后哈希检查的最高层入口。主验收链为：媒体库 → 新建/恢复会话 → 显式启动 → 流式输出与工具结果 → 停止/失败/完成 → 按需审阅 → 重启恢复。P4 在同一用户流程内扩充批准、写入与回滚，不另造只验证 renderer mock 的“端到端”。

复用 #13 已有的 main HarnessAdapter 边界注入受控运行器或传输；本计划不增加测试替换点，保留真实 main、preload、renderer 与文件系统行为。底层 Contract Tests 补充现有安全/状态边界，不增加另一套产品流程。沿用已经确认的测试方案，不重新要求用户选择相同入口。

### 行为与证据矩阵

| 层次               | 复用经验与覆盖目标                                                                             | 成功判据与证据边界                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract Tests     | 现有 Run manager、只读执行器、路径策略、会话 reducer/存储/IPC 与迁移测试；未来补写入授权和恢复 | 断言输入/输出、拒绝结果和外部可见副作用，不断言私有函数调用次数、组件结构或 SDK 内部对象                                                            |
| Real Electron E2E  | 现有 P2 完成/工具结果/停止/再次授权用例，以及多会话、保存/重启、停靠和窗口用例                 | 跨真实 main → preload → renderer；已有三条 P2 主流程不代表全部失败矩阵已覆盖；后续按行为补跨会话、断连、布局和恢复，受控运行器不得标作真实 Provider |
| 只读文件不变量     | 沿用 committed fixture 运行前后哈希                                                            | 包含成功、拒绝、停止与失败；项目 fixture 不变、凭证与全局配置不被读取或改写、日志不泄密                                                             |
| P4 文件变更        | 在同一 Electron 测试设施中使用独立临时可写副本                                                 | committed fixture 仍不变；副本仅出现明确批准的 diff，未授权路径不变；失败/取消/回滚的真实磁盘结果可复核                                             |
| 真实 Provider 验证 | 同一产品流程，替换为获得明确授权的模型传输                                                     | 单列 Provider、模型、允许材料、软件版本、结果与停止记录；无凭证/未运行如实标记，不由受控测试或重放补票                                              |
| Windows 与成品     | 现有 package smoke、原生目录选择器和窗口人工经验                                               | 开发目录外独立启动、冷启动/恢复、输入法、高 DPI/多显示器、键盘/读屏、强制颜色/减少动效适用项；人工证据单独记录                                      |
| Prototype Tests    | 冻结 M1 历史模拟器及其探针                                                                     | Prototype Tests: 210/210 passed 是历史证据口径；不增加运行能力结论，也不替代上述层次                                                                |
| 实验与归档         | 冻结任务、脱敏记录、分析与校验清单                                                             | 从原始数据重算报告；失败保留；最终源码/包/论文/视频版本一致且文件可打开                                                                             |

### 门禁与可追溯性

- 每个实现候选先运行针对性检查，最终交接运行 `pnpm verify:repository` 与完整 `pnpm check`。`pnpm check` 保留格式、lint、类型、Contract Tests、Prototype Tests、Real Electron E2E 和最终 package smoke。
- 原生选择器、读屏、真实 Provider 和安装/冷启动不能由确定性 fixture 自动替代。已有人工证据可说明历史状态；受本次改动影响的场景必须重新验证。
- 每份证据记录版本、工作树是否含未提交资产、环境、输入、预期/实际结果和原始日志位置。干净检出与打包重建在正式交付前单独完成，不能以 dirty tree 通过代替可复现交付。
- `FAILED`、`BLOCKED`、`NOT_RUN` 和跳过均不算通过。缩减范围要记录决策并同步宣称；执行失败时保留原始记录和后续修复证据。

## Out of Scope

- 本次按用户要求拆分并发布长期规划子 Issue，不实施 P2—M6 功能，不修改 #13 的内容、状态、负责人或原有前置，不操作 PR #16，不调用真实 Provider。新增后续票以 #13 为前置；历史票据保持现状，不另开重复总计划。
- 车机 HMI、CockpitService、TUI、多端同步承诺、把动态模型路由作为独立卖点，以及恢复旧的全局专注/审阅/交付模式。
- 任意 shell、无边界文件访问、默认加载第三方工具/插件、自动读取全局凭证，或以只读许可代替外发、写入和发布许可。
- 用假 runner、假计时器、重放或静态界面冒充真实执行；用历史测试数字宣称当前模型能力或实验优越性。
- 在当前毕业目标内建设完整第三方插件市场、无限格式预览或跨平台发行矩阵；相关增量需独立需求与验收。
- 将个人学籍、导师、联系方式、凭证和私密材料公开到 Issue、日志或共享实验资产。

## Further Notes

- 本规格依据对话、既有票据和仓库事实综合；测试边界已获用户确认。随后按用户的 Issue 整理要求并入 #9，不再保留另一张开放的总计划票。
- #12 已关闭，#13 的该项前置已解除；保留 #13 → #12 原生依赖作为历史关系，不修改它。总计划 #9 保持置顶和唯一入口，#10/#11/#14 保留历史引用。
- 按 `to-spec` 为本规格入口添加 `ready-for-agent`，保留 `wayfinder:map` 与 `documentation`。它表示规格已可执行，不表示子 Issue 无条件开工；原生依赖、阶段进入条件、现有 owner 与授权仍需逐项核对。#13 标签保持不变。
- 阅读入口：[开发计划 #9](https://github.com/OasisViridis/Pioneer/issues/9)、[Runtime：读取权限与停止规则 #12](https://github.com/OasisViridis/Pioneer/issues/12)、[Harness：只读接入与验证 #13](https://github.com/OasisViridis/Pioneer/issues/13)。历史来源：[宿主研究 #10](https://github.com/OasisViridis/Pioneer/issues/10)、[只读策略 #11](https://github.com/OasisViridis/Pioneer/issues/11)、[原规格 #14](https://github.com/OasisViridis/Pioneer/issues/14)、[已合并 PR #8](https://github.com/OasisViridis/Pioneer/pull/8)。
- 本次核对资料包括 ROADMAP、THEMASTERPLAN、TEST_INFRA、GLOSSARY、现役 Wayfinder 计划、既有长期规格、当前设计规范、P2 运行契约及 #13 验证记录。未找到独立 ADR 目录；沿用现有已确认决策，不虚构 ADR。
- 当前状态的远程依据：[已完成 #12 及停止语义决策](https://github.com/OasisViridis/Pioneer/issues/12#issuecomment-6383938270)、[开发中的 PR #16](https://github.com/OasisViridis/Pioneer/pull/16)、[本次读取的 Windows CI](https://github.com/OasisViridis/Pioneer/actions/runs/40151442262/job/121043641167)。这些记录绑定上文版本；将来有新结果时刷新快照，历史测试与设计记录不升级为当前真实运行证据。
