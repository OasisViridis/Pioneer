# Pioneer 长期开发计划与验收规格（2026.10—2027.06）

本文件保存产品行为与验收要求；当前队列、在途 PR 与开工条件只维护在 [#9](https://github.com/OasisViridis/Pioneer/issues/9)。正式里程碑以 ROADMAP 为准，原 Spec #14 已归并。

> 更新日期：2026-11-08（Asia/Shanghai）；初版：2026-10-24。正式课题：《基于TypeScript的模块化智能体交互系统设计与实现》。
> 测试边界已于 2026-10-24 经用户确认：真实 Electron 主流程、main 受控适配器、既有 Contract Tests，以及独立的真实 Provider / Windows 人工验证。规格已并入总计划 #9；当前任务状态以 #9 顶部导航和原生依赖为准。

2026-11-08 范围决定：用户接受 [#20](https://github.com/OasisViridis/Pioneer/issues/20) 优先模型连续编辑与纠错，暂缓通用快照、自动回滚及跨重启文件恢复。本次调整不改变会话恢复、权限校验、并发保护与准确报告结果的要求；历史报告保留原验收范围。

## 两分钟简报

**目标：到 2027 年 6 月，交付可独立运行的 Windows 应用、可复核的实验、论文和演示材料。** 用户能打开本地项目，让 AI 在允许的范围内读取材料、完成任务、展示依据，在显式授权后修改文件，并按需查看实际 Diff。

当前状态见 [#9](https://github.com/OasisViridis/Pioneer/issues/9)；本规格不重复维护当前 SHA、票据开闭或测试计数。以下窗口用于安排结果，不是全仓串行开工门。

| 时间窗口                             | 用户能得到什么                                   | 必须留下的交付证据                               |
| ------------------------------------ | ------------------------------------------------ | ------------------------------------------------ |
| 2026 年 10—11 月 · P2                | 在应用里读项目、问问题、看进度和停止             | #13 的自动化、真实模型、成品运行分别验证         |
| 2026 年 11—12 月 · P3                | 按需看上下文、工具、日志和结果，工作区不被打断   | 来源正确、会话隔离、键盘操作与恢复记录           |
| 2026 年 12 月 · P4 / M3              | 授权后连续编辑和纠错，失败能说明，保留用户并发改动 | 授权、连续修改、冲突与停止后的实际结果               |
| 2026 年 12 月—2027 年 1 月 · M4 / P5 | 会话分支、少量可复用能力、独立 Windows 包        | 分支与权限隔离、升级恢复、安装及冷启动记录       |
| 2027 年 2—3 月 · M5                  | 同模型同任务的对比结果与论文初稿                 | 冻结方案、原始数据、可重算分析、版本索引         |
| 2027 年 4—5 月 · M6                  | 稳定候选、论文终稿、演示视频与答辩排练           | 完整门禁、人工验收、干净配置排练                 |
| 2027 年 6 月 · 归档缓冲              | 可定位、可打开、可校验的完整交付包               | 源码、包、数据、论文、设计与视频的版本及哈希清单 |

推进方式见[开发计划](../plans/2026-10-10-pioneer-wayfinder-development-plan.md)；认领、实际依赖与交付见[工作流](../agents/delivery.md)。

**取舍：** 保住真实任务、文件安全、停止与结果核对、Windows 成品、实验和论文。延期时依次减少桌宠增强、额外预览格式、更多 Provider、复杂分支展示与插件数量；不减少安全检查，不把未运行测试算通过。月份是内部目标窗口，学校截止日期以实际通知为准。

## Problem Statement

使用者需要从本地项目进入一个可恢复的任务会话，理解智能体正在做什么、使用哪些材料与能力，在需要时停止执行，并审阅可追溯的改动和产物。各阶段实现状态由当前执行票和对应版本证据说明。

开发者同时需要完成交互系统、Harness 工程、对比实验、论文和展演归档。已有长期计划需要跟随实际交付更新，并让读者快速看到当前进度、后续依赖、完成条件和延期取舍。本地工作分支、远程主分支和历史记录的状态不同，必须分别表述，避免重复施工或过早宣称完成。

## Solution

沿用媒体库海报墙、会话 Tabs 和按需打开的停靠面板，以一条真实任务纵向链逐步扩展产品：可恢复会话 → 只读 Harness → 可观察的内容面板 → 受控修改与模型纠错 → 有限扩展和 Windows 成品 → 实验与论文 → 答辩、封版和归档。

具体接口和验收由执行票与共享契约定义；本规格不替代已接受的权限决定。只消费已经合并且所需行为已验收的上游结果，历史闭票本身不证明可用。

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
21. As a user, I want to authorize the target scope and inspect actual changes on demand, so that editing stays under my control without mandatory Diff review.
22. As a user, I want permissions bound to the current task revision and target state, so that an old approval cannot authorize a different operation.
23. As a user, I want command execution constrained by an explicit permission scope, so that read-only access cannot silently become shell access.
24. As a user, I want partial changes and failed operations reported accurately, so that I can decide how to recover.
25. As a user, I want the agent to inspect tool feedback and correct its edits while preserving my concurrent work, so that a recoverable editing mistake does not end the task.
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

### 1. 状态与证据归属

正式里程碑只在 [ROADMAP](../../themasterplan/ROADMAP.md) 维护，执行队列只在 #9 维护。实现交付需要可消费的合并提交与对应验证；决策交付需要已接受的决定。测试、成品、真实 Provider 与人工验收分别记录，未运行不算通过。历史状态与计数保留于有日期的验收报告。

### 2. 保留的架构与产品约定

- 保持 Electron Forge/Webpack、React、TypeScript、Zod 与现有会话内停靠实现的技术路径；先复用现有会话、停靠、IPC 与持久化模块，不重建应用外壳。
- 对话是默认主轴；上下文、能力、RunLog、Changes 与 Artifacts 按用户显式操作打开。结果到达不自动换布局、抢焦点、改草稿或强制滚动。
- Session、Run、任务修订、布局与模型上下文分别建模。关闭面板或会话标签不等于停止任务、删除记录或回滚文件。
- 直接输入任务；#41 已移除意图摘要/核对。执行、外发、写入和发布许可各自表达，历史数据兼容不恢复旧产品交互。
- main 持有项目目录册、运行注册表、授权与执行资源；preload 只暴露固定动作和可撤销订阅；renderer 消费经校验、脱敏的数据，不获得 SDK、密钥或通用文件系统入口。
- 沿用 #13 的 Agent 核心与模型接口组合及已固定的 Pi 依赖和锁文件。完整 coding-agent SDK 按会话树、压缩或扩展的实际需要另行评估；升级时重新检查接口、认证默认行为和成品加载。
- P2 模型凭证只进入 main 的受限运行上下文，不读取用户全局凭证、自动发现工作区脚本或加载隐式默认工具。真实模型传输需明确 endpoint、模型和允许外发的材料集合；只读许可不代表允许外发。
- 现有主进程 IPC 是首选桥接。M4 的目标是双向事件与扩展能力；只有在既有 Issue/PR 证明宿主隔离或跨进程需求时才增加 WebSocket/SSE，不预先引入第二套总线。

### 3. 长期阶段与退出条件

| 目标窗口           | 阶段与依赖                                                  | 交付物                                                                               | 退出条件                                                                                                                  |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 2026-10 下旬       | 已有基线；消费已接受的运行规则            | 已确认运行规则、停止决策及对应版本                                                   | 以可消费 main 提交和对应验收为准，未验证项不因合并记为通过                                                  |
| 2026-10 下旬—11 月 | P2；运行规则与分层验证                                  | 有来源、可停止的只读 Harness；最小运行 UI；开发与成品加载证据                        | 由 #13 原验收决定完成；远程门禁、受控 Electron、真实 Provider 与成品证据均须按版本核实，待验证项不能由历史记录补足        |
| 2026-11—12 月      | P3；依赖稳定运行契约，可与 P2 后半程并行                    | 接真实来源的上下文、能力、日志、改动/产物入口与单布局工作区                          | 无跨会话串流；新结果不扰动布局；正常/空/失效/错误状态可达；键盘、窄窗、恢复有证据；尚未实现的写入内容保持真实空态         |
| 2026-12 月         | P4 / M3 收口；依赖 P2 与可审阅结果                          | 先完成一种产物生成或代码修改闭环，再增加一个明确授权的命令场景；连续编辑、检查与按需 Diff | 在临时工作区实测批准/拒绝、旧许可、目标变化、部分完成、写失败、连续纠错和停止；用户并发内容保留；实际能力与验收满足 M3 要求后才收口 |
| 2026-12—2027-01    | M4 与 P5；按所用能力消费契约，Windows 基础验证独立推进 | 最小会话分支/历史恢复、有限原子能力与 Runbook；独立 Windows 包；可选桌宠薄宿主       | 分支不越权继承许可，历史浏览不修改文件；扩展不绕过宿主策略；包离开源码目录仍运行；Windows 核心操作可用；不以桌宠阻塞主链  |
| 2027-02—03         | M5；实验方案可在 P2 后预研，正式数据依赖冻结候选            | 同模型同任务的对照数据、分析图表、论文初稿、设计/实现证据索引                        | 任务与判据先冻结，失败与超时纳入分母，原始数据可追溯；结果可重算；论文描述与对应软件版本一致                              |
| 2027-04            | M6 候选冻结与验收                                           | 冻结候选、Windows 人工验收、安装/冷启动/恢复记录、论文修订稿                         | 完整门禁与人工门均有版本记录；关键数据/权限/恢复缺陷已解决；未完成项显式处置；冻结后只纳入经审查的必要修复                |
| 2027-05            | M6 展演与终稿                                               | 在线演示脚本、明确标识的离线兜底、演示视频、答辩材料、终版归档候选                   | 至少一次从干净用户配置开始的完整排练；失败/停止/恢复也能说明；离线材料不冒充在线运行；归档可从清单定位与校验              |
| 2027-06            | 最终归档与缓冲                                              | 源码、依赖锁、Windows 包、实验数据/分析、论文、设计、视频、运行说明与校验清单        | 按实际收到的学校要求提交；核对最终版本、哈希和可打开性；个人档案留在私密交付渠道；记录未解决限制                          |

日期到达不等于验收通过。若前置门未过，后续可独立推进设计说明、论文已实现章节和离线测试准备，但不得越过权限或伪造里程碑完成。

### 4. 实现与验收的进入条件

1. 当前活跃 PR 保持各自范围与写入者，后续改变用递进的小 PR；不得接管同一任务或重建已有面板。
2. 原生依赖仅约束当前实现必须消费的结果，最终里程碑要求放在验收清单。只读结果审阅、只读能力、Windows 安装/升级和只读实验可在各自输入就绪后推进。
3. 写入遵循 [#18 已确认规则](2026-10-27-p4-write-authorization-and-recovery.md)，命令遵循 [#22 已确认规则](2026-11-03-p4-command-permission-and-stop-rules.md)；不在计划里重新发明权限模式。
4. 第一条有用修改先支持单文件文本结果：来源真实、按需查看 Diff、按许可连续写入、版本变化拒绝与实际结果核对。固定 marker 探针只验证安全流程，不代表任务结果已经接入。
5. 只读实验先核对协议与采集产物的合并提交、软件版本及运行授权；不依赖无关的写入和命令完成。未满足条件不能执行对应真实行为或宣称验收。

### 5. P3—P5 / M4 的范围控制

- P3 逐类接真实内容，先上下文、能力与 RunLog，再接 P4 产生的 Diff 和 Artifacts。支持格式、空态和不可读状态均有明确 UI；不为截图补假统计、假任务或假预览。
- P4 按 #18 已确认规则校验会话权限、操作范围、预览目标和当前文件状态。写入授权、实际写盘、自动检查、人工验收与交付分别记录，Diff 仅按需打开；内容改变后原有验证结果失效。
- 模型通过现有 Pi 工具循环读取、修改、检查并修正；main 保留权限、路径、版本检查与停止语义。遇到用户并发修改时报告冲突并保留现场。快照、自动回滚与跨重启文件恢复按用户 2026-11-08 决定暂缓，待真实需求后比较成熟方案，不作为本片前置。命令执行沿用 #22 已接受的策略，核对威胁模型、允许命令与参数、工作目录、环境继承、可写范围、停止与部分副作用后，再实施明确场景；不接受模型任意拼接 shell 字符串。可先交付受控文件写入切片，命令实现及验收未完成时保持待办，不顺带开放能力。
- M4 先实现一条分支/历史查看路径和少量内建能力组合。会话回退与文件回滚是不同动作；新分支不能重放旧权限或自动重新执行。完整扩展发现、第三方插件加载与复杂调度保持后续独立决策。
- P5 优先成品启动、会话恢复、输入法、字体、键盘与原生窗口操作。桌宠复用已有合法资源，只订阅明确批准的显示状态；可隐藏，不遮挡内容，也不获得执行权限。
- 数据 schema 的迁移、坏档保护和未知版本处理继续沿用会话持久化经验；更改事件或能力合同先检查旧数据兼容性，再升级版本。
- UI 延续当前 Hazel 设计规范和现有组件，先核对可复用实现、令牌与交互。设计稿完成、素材存在与应用集成分别记账；插画与桌宠不承担运行状态或授权提示，不让装饰占用核心任务空间。

### 6. 工作包与依赖

工作包及原生依赖只维护在 [#9](https://github.com/OasisViridis/Pioneer/issues/9) 与各执行票。本规格不复制第二份依赖表。#21 优先消费 #19 的真实结果，并集成 #20 的连续编辑、失败与停止状态；#26 可先交付只读能力；#27 的基础成品验证和 #30 的只读实验不被整个 M3/能力库阻塞。

#19/#20/#23 的权限与副作用前置、#24 的 M3 汇总条件、#31/#32 的最终验收仍保留。可选 #28 与设计同步不作为核心产品前置。ready-for-agent 只表示规格准备程度；上游结果是否已合并并验收、任务是否已有写入者、真实服务是否获准，须分别核对。

### 7. 实验与学术交付

- 在 P2 后建立测量记录，在 M5 正式实验前冻结基线 Harness、Pioneer 变体、任务集合、评分规则、模型标识、提示输入、工具权限、预算、重复次数和失败分类。具体样本量及重复次数依据先导实验与可用预算定稿，不在本规格虚构结论。
- 对比至少覆盖上下文/Token 用量、完成率和端到端耗时。同模型同任务配对执行，记录缓存、网络、模型版本变化等混杂因素。评测任务与用于调试的任务分离；任务开始后不因结果不好而从样本中删除。
- 完成率分母包含所有预定尝试；拒绝、失败、超时、取消和未运行分别报告。Provider 未返回 usage 时记为缺失，不填零；估算值与实测值分开。报告重复运行的分布和不确定性，不预设“减少多少”“提升多少”。
- 每条数据关联任务、运行、配置与软件版本，保留脱敏原始记录和可重算分析。论文正文明确工程来源与第三方复用边界，不把 Prototype Tests 当作 Harness 对比实验，也不把界面设计覆盖当作用户研究结果。
- 需求、设计、实现章节随开发增量写作；M5 集中固化方法、结果和讨论，M6 修订终稿。学校格式、AIGC 使用记录及答辩要求以实际收到的规范为准，不编造阈值或已获审批。

### 8. 执行节奏、风险与取舍

- 一个交付单元只有一个交付责任人；独立工作树可以并行，同一接口先明确写入者。每周刷新当前版本、owner、原生 blockers、验收缺口和下一步；每 4—6 周做一次可运行演示与范围复核。
- 任务开始条件：输入和验收明确、依赖核对、授权边界清楚、可复用测试入口已选定。任务结束条件：可观察行为通过测试、适用人工门通过、独立 Diff 审阅、证据与交付版本一致。
- 高优先级始终为：会话不丢失、真实可停止的只读运行、权限与文件安全、可审阅结果、最小受控修改闭环、成品可运行、可复核实验、论文和归档。
- 延误时先缩减桌宠增强、额外格式预览、更多 Provider、复杂分支展示和插件广度，保留对应待办与限制说明。不能削减路径/权限检查、停止与实际结果核对、实验真实性或归档验证；自动文件恢复按 #20 决定暂缓，不视为已实现。
- 若后续运行链回归或成品不稳定，暂停扩展与装饰，优先修复真实任务与成品；同步调整 M4 深度与实验规模。若受控修改的安全条件仍不能满足，提交明确范围变更供人类决策，论文与演示按实际能力表述，不自行把未实现项写成完成。
- 最大风险及对策：本地通过但远程失败→以同一交付版本核对环境与门禁；Pi 升级或成品加载不兼容→保留开发/成品探针；取消或文件竞态→主进程权威状态和失败用例；Provider 不稳定→独立真实验证记录与受控自动化；界面膨胀→复用组件、按需面板；临近答辩缺证据→持续采集并预留 4—6 月验收与归档窗口。

| 检查点          | 继续推进所需证据                   | 未满足时的动作                                                             |
| --------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| 2026 年 11 月末 | P2 真实链与停止验证，P3-A 输入稳定 | 保留 P2 待办；优先运行问题，暂停插件/装饰扩张；P3 只推进独立准备           |
| 2026 年 12 月末 | 连续编辑、纠错与停止结果可验证           | 1 月优先核心安全闭环及成品；缩小 M4 深度，涉及已承诺功能削减时提交范围变更 |
| 2027 年 1 月末  | 可独立运行候选、实验方案和先导结果 | 冻结新增产品功能，按剩余预算缩减实验规模并解释限制；不删除失败样本         |
| 2027 年 3 月末  | 正式数据可重算、论文初稿可核对     | 4 月优先复核与论文；不临时更换基线来制造有利结果，必要重跑单独标版         |
| 2027 年 4—5 月  | 关键缺陷已解决、人工门与排练通过   | 只纳入必要修复，按影响范围重验；延后非核心功能，清楚记录交付限制           |

每周简报固定为五项：**本周已交付及证据、当前任务与负责人、阻塞与所需决定、下一项及进入条件、时间/范围变化**。只有绑定版本的已完成行为进入“已交付”；排查中、未运行和等待授权单列。此处规定维护节奏，不创建自动提醒或擅自分配负责人。

## Testing Decisions

### 主要行为入口：一条真实 Electron 任务链

复用现有 Playwright 启动真实 Electron、隔离用户配置、固定工作区 fixture 和退出后哈希检查的最高层入口。主验收链为：媒体库 → 新建/恢复会话 → 显式启动 → 流式输出与工具结果 → 停止/失败/完成 → 按需审阅 → 重启恢复。P4 在同一用户流程内扩充授权、连续写入与模型纠错，不另造只验证 renderer mock 的“端到端”。

复用 #13 已有的 main HarnessAdapter 边界注入受控运行器或传输；本计划不增加测试替换点，保留真实 main、preload、renderer 与文件系统行为。底层 Contract Tests 补充现有安全/状态边界，不增加另一套产品流程。沿用已经确认的测试方案，不重新要求用户选择相同入口。

### 行为与证据矩阵

| 层次               | 复用经验与覆盖目标                                                                             | 成功判据与证据边界                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract Tests     | 现有 Run manager、只读执行器、路径策略、会话 reducer/存储/IPC 与迁移测试；补充写入授权、连续纠错和停止结果 | 断言输入/输出、拒绝结果和外部可见副作用，不断言私有函数调用次数、组件结构或 SDK 内部对象                                                            |
| Real Electron E2E  | 现有 P2 完成/工具结果/停止/再次授权用例，以及多会话、保存/重启、停靠和窗口用例                 | 跨真实 main → preload → renderer；已有三条 P2 主流程不代表全部失败矩阵已覆盖；后续按行为补跨会话、断连、布局和恢复，受控运行器不得标作真实 Provider |
| 只读文件不变量     | 沿用 committed fixture 运行前后哈希                                                            | 包含成功、拒绝、停止与失败；项目 fixture 不变、凭证与全局配置不被读取或改写、日志不泄密                                                             |
| P4 文件变更        | 在同一 Electron 测试设施中使用独立临时可写副本                                                 | committed fixture 仍不变；副本仅出现明确批准的 diff，未授权路径不变；失败/取消/连续修改的真实磁盘结果可复核                                             |
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

- 不通过规划文档自动授予 Provider 调用、文件写入、合并或发布权限；具体实现按已授权执行票交付。
- 车机 HMI、CockpitService、TUI、多端同步承诺、把动态模型路由作为独立卖点，以及恢复旧的全局专注/审阅/交付模式。
- 任意 shell、无边界文件访问、默认加载第三方工具/插件、自动读取全局凭证，或以只读许可代替外发、写入和发布许可。
- 用假 runner、假计时器、重放或静态界面冒充真实执行；用历史测试数字宣称当前模型能力或实验优越性。
- 在当前毕业目标内建设完整第三方插件市场、无限格式预览或跨平台发行矩阵；相关增量需独立需求与验收。
- 将个人学籍、导师、联系方式、凭证和私密材料公开到 Issue、日志或共享实验资产。

## Further Notes

- 已接受的运行、写入、命令规则分别见 #12、#18、#22 及其规格；历史研究和测试记录只证明对应版本。
- 后续重要技术选择在原 Issue/PR 记录需求、仓库复用/成熟方案比较、一手来源与版本、支持范围和验证，不默认增设决策票。
- 计划治理修订见 #84；当前动态状态回到 #9。明确缺口而不重复维护进度镜像，避免旧文档把已完成功能重新排入队列。
