# Pioneer 长期开发计划与验收规格（2026.10—2027.06）

权威 Issue：[开发计划 #9](https://github.com/OasisViridis/Pioneer/issues/9)。原 Spec #14 已归并；当前施工为 #12 → #13。

> 规格日期：2026-10-24（Asia/Shanghai）。正式课题：《基于TypeScript的模块化智能体交互系统设计与实现》。
> 测试边界已于 2026-10-24 经用户确认：真实 Electron 主流程、main 受控适配器、既有 Contract Tests，以及独立的真实 Provider / Windows 人工验证。规格已并入总计划 #9；当前任务状态以 #9 顶部导航和原生依赖为准。

## Problem Statement

使用者需要从本地项目进入一个可恢复的任务会话，理解智能体正在做什么、使用哪些材料与能力，在需要时停止执行，并审阅可追溯的改动和产物。当前桌面基础与会话恢复已经有阶段收口记录，但真实模型、工具与工作区操作尚未形成产品闭环，现有面板也不能完整呈现执行证据。

开发者同时需要完成交互系统、Harness 工程、对比实验、论文和展演归档。主地图已经给出 2027 年 6 月终点，却尚未把后半程转为有依赖、退出条件和降级规则的长期队列。本地研究与实现、GitHub 票据状态、历史测试记录之间也存在不同步，容易造成重复施工或过早宣称完成。

## Solution

沿用媒体库海报墙、会话 Tabs 和按需打开的 Dockview 面板，以一条真实任务纵向链逐步扩展产品：可恢复会话 → 只读 Harness → 可观察的内容面板 → 受控修改与恢复 → 有限扩展和 Windows 成品 → 实验与论文 → 答辩、封版和归档。

近期细化 P2，远期按交付结果与验收条件管理。#9 是总计划与本规格的唯一入口；#10/#11 的已有成果及剩余交付并入 #12，接续 #13 实施与验证。远期工作进入前沿时再拆票。正式里程碑状态仍由仓库 ROADMAP 记录。

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
12. As a user, I want disconnects and unconfirmed stops shown as uncertain states, so that I am not misled by a false completion message.
13. As a user, I want reconnecting to reconcile the active run without replaying it, so that recovery does not duplicate actions.
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

截至本次核对：

| 对象           | 可采用的事实                                                          | 不能据此推导的结论                                                         |
| -------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| M1、M1.5、M2   | ROADMAP 记录为完成                                                    | 历史原型不是当前 Agent 产品的运行证据                                      |
| M3 / P0、P1    | M3 进行中；P0/P1 有收口记录，当前本地会话与持久化接线存在             | 大量 P1 资产仍在继承工作树中，不能声称远程干净检出可复现                   |
| #10            | 本地已有宿主适配器研究提交 `527c4c1`                                  | 未安装或打包 Pi，未调用真实 Provider                                       |
| #11            | 本地已有只读请求预检、共享契约与测试提交 `1ba2f6a`                    | 预检只检查元数据，不读取正文、不执行工具，也不是抵御敌对并发替换的完整沙箱 |
| RuntimeSession | 当前只初始化快照；模型、工具执行、文件修改三个能力仍关闭              | READY、初始化或启动意图不构成执行许可                                      |
| 当前施工票     | #12 汇总研究/策略交付及运行契约；#13 原生依赖 #12；#10/#11 已归并关闭 | 归并关闭仅调整跟踪位置，不代表成果已交付或功能已验收                       |
| PR #8          | 已合并至远程 main：`336f8f8`                                          | 仅本地生命周期骨架，不能代替真实运行与停止实现                             |

规划依据的本地 HEAD 为 `1ba2f6adb7b2bb4e1d340b6e45969fbca58830e2`，整理时远程 main 已更新为 `336f8f8f031bae7ea460937ce7e93d2d7f856911`；本地 #10/#11 成果仍待与该版本整合交付。本轮为规格编写，不把文档中的历史门禁记录升级成本轮全量测试结果。

### 2. 保留的架构与产品约定

- 保持 Electron Forge/Webpack、React、TypeScript、Zod 和 Dockview 现有技术路径；先复用现有会话、停靠、IPC 与持久化模块，不重建应用外壳。
- 对话是默认主轴；上下文、能力、RunLog、Changes 与 Artifacts 按用户显式操作打开。结果到达不自动换布局、抢焦点、改草稿或强制滚动。
- Session、Run、意图修订、布局与模型上下文分别建模。关闭面板或会话标签不等于停止任务、删除记录或回滚文件。
- 目标澄清可选；执行、外发、写入和发布许可各自表达。沿用旧 READY 数据的迁移兼容性，同时避免把旧意图签署恢复成所有任务的强制步骤。
- main 持有项目目录册、运行注册表、授权与执行资源；preload 只暴露固定动作和可撤销订阅；renderer 消费经校验、脱敏的数据，不获得 SDK、密钥或通用文件系统入口。
- #10 的候选方向是 Agent 核心与模型接口的最小组合，完整 coding-agent SDK 按会话树、压缩或扩展的实际需要另行评估。研究中的版本是候选快照；引入时固定依赖与锁文件，复核 exports、认证默认行为和成品加载。
- P2 模型凭证只进入 main 的受限运行上下文，不读取用户全局凭证、自动发现工作区脚本或加载隐式默认工具。真实模型传输需明确 endpoint、模型和允许外发的材料集合；只读许可不代表允许外发。
- 现有主进程 IPC 是首选桥接。M4 的目标是双向事件与扩展能力；只有经决策票证明宿主隔离或跨进程需求时才增加 WebSocket/SSE，不预先引入第二套总线。

### 3. 长期阶段与退出条件

| 目标窗口           | 阶段与依赖                                                  | 交付物                                                                               | 退出条件                                                                                                                   |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 2026-10 下旬       | 基线整合与 P2 准备；复用 #10/#11 成果                       | 可追溯候选清单、继承资产处置、PR #8 合并后兼容性核对、#12 输入                       | 区分本地/远程状态；明确哪些成果待交付；不覆盖继承工作、不重复实现已完成预检；按现有审批完成票据与代码交接                  |
| 2026-10 下旬—11 月 | P2；#12 → #13 → 独立真实 Provider 验证                      | 有来源、可停止的只读 Harness；最小运行 UI；开发与成品加载证据                        | 受控适配器穿越真实 Electron；启动/流式/拒绝/失败/停止/断连均可解释；fixture 不变；真实 Provider 单独验证后才能标记 P2 完成 |
| 2026-11—12 月      | P3；依赖稳定运行契约，可与 P2 后半程并行                    | 接真实来源的上下文、能力、日志、改动/产物入口与单布局工作区                          | 无跨会话串流；新结果不扰动布局；正常/空/失效/错误状态可达；键盘、窄窗、恢复有证据；尚未实现的写入内容保持真实空态          |
| 2026-12 月         | P4 / M3 收口；依赖 P2 与可审阅结果                          | 先完成一种产物生成或代码修改闭环，再增加一个明确授权的命令场景；Diff、快照与受控回滚 | 在临时工作区实测批准/拒绝、旧许可、目标变化、部分完成、写失败和回滚；用户并发内容保留；实际能力与验收满足 M3 要求后才收口  |
| 2026-12—2027-01    | M4 与 P5；以稳定 P2/P4 契约为前置，Windows 基础问题可提前修 | 最小会话分支/历史恢复、有限原子能力与 Runbook；独立 Windows 包；可选桌宠薄宿主       | 分支不越权继承许可，历史浏览不修改文件；扩展不绕过宿主策略；包离开源码目录仍运行；Windows 核心操作可用；不以桌宠阻塞主链   |
| 2027-02—03         | M5；实验方案可在 P2 后预研，正式数据依赖冻结候选            | 同模型同任务的对照数据、分析图表、论文初稿、设计/实现证据索引                        | 任务与判据先冻结，失败与超时纳入分母，原始数据可追溯；结果可重算；论文描述与对应软件版本一致                               |
| 2027-04            | M6 候选冻结与验收                                           | 冻结候选、Windows 人工验收、安装/冷启动/恢复记录、论文修订稿                         | 完整门禁与人工门均有版本记录；关键数据/权限/恢复缺陷已解决；未完成项显式处置；冻结后只纳入经审查的必要修复                 |
| 2027-05            | M6 展演与终稿                                               | 在线演示脚本、明确标识的离线兜底、演示视频、答辩材料、终版归档候选                   | 至少一次从干净用户配置开始的完整排练；失败/停止/恢复也能说明；离线材料不冒充在线运行；归档可从清单定位与校验               |
| 2027-06            | 最终归档与缓冲                                              | 源码、依赖锁、Windows 包、实验数据/分析、论文、设计、视频、运行说明与校验清单        | 按实际收到的学校要求提交；核对最终版本、哈希和可打开性；个人档案留在私密交付渠道；记录未解决限制                           |

日期到达不等于验收通过。若前置门未过，后续可独立推进设计说明、论文已实现章节和离线测试准备，但不得越过权限或伪造里程碑完成。

### 4. P2 的立即执行顺序

1. 在 #12 接续原 #10/#11 的现有成果，核对与已合并 PR #8 的兼容性；交付责任人整理可审阅候选，按授权完成代码交付核对。原票归并关闭不等于该项通过，#12 的对应清单必须有证据后才能勾选。
2. 在 #12 定稿运行身份、事件顺序、启动失败、重复启动、停止请求与确认、取消/完成竞态、迟到事件和断连恢复。事件包含会话与运行身份、修订、序号、时间及来源；具体 schema、保留上限和背压规则在该票决定。
3. 在 #13 复用上述契约，落地主进程运行注册表、受控适配器、三个只读工具执行器和最小 Electron UI；把 Pi 在开发入口与打包成品中的无凭证加载探针纳入同一交付检查。
4. 执行器沿用 `read_file`、`list_directory`、`search_in_files` 白名单与既有预算。每次访问及发布结果时复核条目、路径和材料范围；搜索逐项检查，不缓存预检结果作为永久许可。拒绝不得回退到 shell、隐式换根或伪造空内容成功。
5. 先使用执行期间不变的隔离 fixture。若需要支持敌对并发文件替换，先验证更强的句柄隔离或不可变副本方案；不把当前元数据预检宣传为该威胁模型下的安全沙箱。
6. 受控验证完成后，另记真实 Provider 任务的授权范围、来源、开始/停止/结果与 usage。缺凭证、拒绝外发或服务不可用时保留明确的待验证状态，自动化工作可以完成，但 P2 真实链条件仍未满足。

### 5. P3—P5 / M4 的范围控制

- P3 逐类接真实内容，先上下文、能力与 RunLog，再接 P4 产生的 Diff 和 Artifacts。支持格式、空态和不可读状态均有明确 UI；不为截图补假统计、假任务或假预览。
- P4 把授权绑定到任务/运行、修订、目标路径、当前文件版本、允许操作和有效期。接受 Diff、写盘、自动检查、人工验收与交付分别记录；内容改变后原有验证结果失效。
- 回滚只处理该次受控变更；遇到用户并发修改时报告冲突并保留现场，不恢复整目录快照覆盖新内容。命令执行先经过独立策略决策票，定清威胁模型、允许命令与参数、工作目录、环境继承、可写范围、停止与部分副作用后，再实施明确场景；不接受模型任意拼接 shell 字符串。可先交付受控文件写入切片，命令决策未完成时保持待办，不顺带开放能力。
- M4 先实现一条分支/历史查看路径和少量内建能力组合。会话回退与文件回滚是不同动作；新分支不能重放旧权限或自动重新执行。完整扩展发现、第三方插件加载与复杂调度保持后续独立决策。
- P5 优先成品启动、会话恢复、输入法、字体、键盘与原生窗口操作。桌宠复用已有合法资源，只订阅明确批准的显示状态；可隐藏，不遮挡内容，也不获得执行权限。
- 数据 schema 的迁移、坏档保护和未知版本处理继续沿用会话持久化经验；更改事件或能力合同先检查旧数据兼容性，再升级版本。

### 6. 实验与学术交付

- 在 P2 后建立测量记录，在 M5 正式实验前冻结基线 Harness、Pioneer 变体、任务集合、评分规则、模型标识、提示输入、工具权限、预算、重复次数和失败分类。具体样本量及重复次数依据先导实验与可用预算定稿，不在本规格虚构结论。
- 对比至少覆盖上下文/Token 用量、完成率和端到端耗时。同模型同任务配对执行，记录缓存、网络、模型版本变化等混杂因素。评测任务与用于调试的任务分离；任务开始后不因结果不好而从样本中删除。
- 完成率分母包含所有预定尝试；拒绝、失败、超时、取消和未运行分别报告。Provider 未返回 usage 时记为缺失，不填零；估算值与实测值分开。报告重复运行的分布和不确定性，不预设“减少多少”“提升多少”。
- 每条数据关联任务、运行、配置与软件版本，保留脱敏原始记录和可重算分析。论文正文明确工程来源与第三方复用边界，不把 Prototype Tests 当作 Harness 对比实验，也不把界面设计覆盖当作用户研究结果。
- 需求、设计、实现章节随开发增量写作；M5 集中固化方法、结果和讨论，M6 修订终稿。学校格式、AIGC 使用记录及答辩要求以实际收到的规范为准，不编造阈值或已获审批。

### 7. 执行节奏、风险与取舍

- 一个切片只有一个交付责任人；近期保持一个主要整合前沿，独立调查与审阅可以并行。每周刷新当前版本、owner、原生 blockers、验收缺口和下一步；每 4—6 周做一次可运行演示与范围复核。
- 任务开始条件：输入和验收明确、依赖核对、授权边界清楚、可复用测试入口已选定。任务结束条件：可观察行为通过测试、适用人工门通过、独立 Diff 审阅、证据与交付版本一致。
- 高优先级始终为：会话不丢失、真实可停止的只读运行、权限与文件安全、可审阅结果、最小受控修改闭环、成品可运行、可复核实验、论文和归档。
- 延误时先缩减桌宠增强、额外格式预览、更多 Provider、复杂分支展示和插件广度，保留对应待办与限制说明。不能削减路径/权限检查、失败恢复、实验真实性或归档验证。
- 若 2026 年底仍未完成真实只读链，暂停增加扩展与装饰，把 2027 年 1 月用于运行闭环和成品稳定；同步调整 M4 深度与实验规模。若受控修改的安全条件仍不能满足，提交明确范围变更供人类决策，论文与演示按实际能力表述，不自行把未实现项写成完成。
- 最大风险及对策：继承资产未交付→显式候选清单和干净检出复验；Pi 成品加载不兼容→提前做打包探针；取消或文件竞态→主进程权威状态和失败用例；Provider 不稳定→独立真实验证记录与受控自动化；界面膨胀→复用组件、按需面板；临近答辩缺证据→持续采集并预留 4—6 月验收与归档窗口。

## Testing Decisions

### 主要行为入口：一条真实 Electron 任务链

复用现有 Playwright 启动真实 Electron、隔离用户配置、固定工作区 fixture 和退出后哈希检查的最高层入口。主验收链为：媒体库 → 新建/恢复会话 → 显式启动 → 流式输出与工具结果 → 停止/失败/完成 → 按需审阅 → 重启恢复。P4 在同一用户流程内扩充批准、写入与回滚，不另造只验证 renderer mock 的“端到端”。

P2 在 main 的 HarnessAdapter 边界注入受控运行器或传输，这是已有 #13 计划内的唯一新增替换点；保留真实 main、preload、renderer 与文件系统行为。底层 Contract Tests 是对现有安全/状态边界的补充，不增加另一套产品流程。

### 行为与证据矩阵

| 层次               | 复用经验与覆盖目标                                                                             | 成功判据与证据边界                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Contract Tests     | 现有 RuntimeSession、会话 reducer/存储/IPC、只读路径策略；补运行状态、事件序列、授权过期与迁移 | 断言输入/输出、拒绝结果和外部可见副作用，不断言私有函数调用次数、组件结构或 SDK 内部对象                                                |
| Real Electron E2E  | 现有意图初始化、同项目多会话、保存/关闭/重启恢复、停靠和窗口用例                               | 跨真实 main → preload → renderer；验证启动、流式、取消竞态、断连、跨会话隔离、布局不变性、错误恢复；受控运行器结果不得标作真实 Provider |
| 只读文件不变量     | 沿用 committed fixture 运行前后哈希                                                            | 包含成功、拒绝、停止与失败；项目 fixture 不变、凭证与全局配置不被读取或改写、日志不泄密                                                 |
| P4 文件变更        | 在同一 Electron 测试设施中使用独立临时可写副本                                                 | committed fixture 仍不变；副本仅出现明确批准的 diff，未授权路径不变；失败/取消/回滚的真实磁盘结果可复核                                 |
| 真实 Provider 验证 | 同一产品流程，替换为获得明确授权的模型传输                                                     | 单列 Provider、模型、允许材料、软件版本、结果与停止记录；无凭证/未运行如实标记，不由受控测试或重放补票                                  |
| Windows 与成品     | 现有 package smoke、原生目录选择器和窗口人工经验                                               | 开发目录外独立启动、冷启动/恢复、输入法、高 DPI/多显示器、键盘/读屏、强制颜色/减少动效适用项；人工证据单独记录                          |
| Prototype Tests    | 冻结 M1 历史模拟器及其探针                                                                     | Prototype Tests: 210/210 passed 是历史证据口径；不增加运行能力结论，也不替代上述层次                                                    |
| 实验与归档         | 冻结任务、脱敏记录、分析与校验清单                                                             | 从原始数据重算报告；失败保留；最终源码/包/论文/视频版本一致且文件可打开                                                                 |

### 门禁与可追溯性

- 每个实现候选先运行针对性检查，最终交接运行 `pnpm verify:repository` 与完整 `pnpm check`。`pnpm check` 保留格式、lint、类型、Contract Tests、Prototype Tests、Real Electron E2E 和最终 package smoke。
- 原生选择器、读屏、真实 Provider 和安装/冷启动不能由确定性 fixture 自动替代。已有人工证据可说明历史状态；受本次改动影响的场景必须重新验证。
- 每份证据记录版本、工作树是否含未提交资产、环境、输入、预期/实际结果和原始日志位置。干净检出与打包重建在正式交付前单独完成，不能以 dirty tree 通过代替可复现交付。
- `FAILED`、`BLOCKED`、`NOT_RUN` 和跳过均不算通过。缩减范围要记录决策并同步宣称；执行失败时保留原始记录和后续修复证据。

## Out of Scope

- 本次规格与 Issue 整理不实施 P2—M6 功能，不推送或发布代码、不调用真实 Provider。#10/#11/#14 的归并关闭仅调整跟踪位置；PR #8 的合并来自整理时核对到的远端变化。
- 车机 HMI、CockpitService、TUI、多端同步承诺、把动态模型路由作为独立卖点，以及恢复旧的全局专注/审阅/交付模式。
- 任意 shell、无边界文件访问、默认加载第三方工具/插件、自动读取全局凭证，或以只读许可代替外发、写入和发布许可。
- 用假 runner、假计时器、重放或静态界面冒充真实执行；用历史测试数字宣称当前模型能力或实验优越性。
- 在当前毕业目标内建设完整第三方插件市场、无限格式预览或跨平台发行矩阵；相关增量需独立需求与验收。
- 将个人学籍、导师、联系方式、凭证和私密材料公开到 Issue、日志或共享实验资产。

## Further Notes

- 本规格依据对话、既有票据和仓库事实综合；测试边界已获用户确认。随后按用户的 Issue 整理要求并入 #9，不再保留另一张开放的总计划票。
- #12 是当前契约与输入交付任务；#13 是被其阻塞的实施任务。原 #10/#11 全部未完事项转入 #12，原票归并关闭不会自动满足验收。
- `ready-for-agent` 只用于 #13，且须同时满足原生依赖；#12 保留既有 `ready-for-human` 契约决策状态。总计划本身不是执行任务。
- 阅读入口：[开发计划 #9](https://github.com/OasisViridis/Pioneer/issues/9)、[Runtime：读取权限与停止规则 #12](https://github.com/OasisViridis/Pioneer/issues/12)、[Harness：只读接入与验证 #13](https://github.com/OasisViridis/Pioneer/issues/13)。历史来源：[宿主研究 #10](https://github.com/OasisViridis/Pioneer/issues/10)、[只读策略 #11](https://github.com/OasisViridis/Pioneer/issues/11)、[原规格 #14](https://github.com/OasisViridis/Pioneer/issues/14)、[已合并 PR #8](https://github.com/OasisViridis/Pioneer/pull/8)。
- 本地核对资料包括 ROADMAP、THEMASTERPLAN、TEST_INFRA、现役 Wayfinder 开发计划、冻结原型开发计划、工作台产品规格、正式选题说明、P1 收口、#10 研究和 #11 策略规格。历史测试与设计记录不升级为当前真实运行证据。
