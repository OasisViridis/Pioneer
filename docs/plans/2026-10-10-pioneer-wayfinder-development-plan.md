# Pioneer · Wayfinder 端到端全生命周期开发规划 (2026.10 — 2027.06)

> **课题名称**：基于TypeScript的模块化智能体交互系统设计与实现（2026-10-08 导师确认正式题目）  
> **项目代号**：Pioneer · **代码主目录**：[apps/desktop](../../apps/desktop/)（相对根目录：[apps/desktop](apps/desktop/)）  
> **GitHub 远端主决策地图**：[Issue #9: [Map] Pioneer 端到端全生命周期决策地图：从冻结原型到 2027.06 毕设终版归档](https://github.com/OasisViridis/Pioneer/issues/9)  
> **前置计划替代说明**：本计划正式替代 [2026-10-01 冻结原型开发计划](2026-10-01-pioneer-frozen-prototype-development-plan.md) 的后续实施队列；阶段总纲仍以 [themasterplan/ROADMAP.md](../../themasterplan/ROADMAP.md) 为准。

---

## 1. 终点锚定 (Destination: 2027.06 毕设终版归档)

在 2027 年 6 月完成毕业设计终版归档，实现课题《基于TypeScript的模块化智能体交互系统设计与实现》的完整工程与学术交付闭环：
- 交付具备「一切皆 UI」特征的桌面端模块化智能体交互系统（媒体库海报墙 + Dockview 可组合工作区面板）；
- 复用 Pi-Agent Harness 运行底座（轻量上下文组装、能力模块化沙箱、统一模型接口接入）；
- 产出相同模型与任务下的 Harness 对比实验数据（Token 消耗、任务完成率、端到端延迟）；
- 交付符合数字媒体技术专业规范的「设计、技术、内容、智能」四合一成果（源码、论文、高清演示视频与归档资产包）。

---

## 2. 核心架构与工程基线 (Notes)

### 2.1 双主线架构协同
Pioneer 的研发不是单纯给现有 Agent 套壳，也不是先写完所有静态 UI 面板再接模型，而是两条主线深度协同：
1. **主线一：交互系统 (Interaction System)**
   - **顶级框架**：Tabs 多标签页系统（`[ 📚 媒体库 ] | [ 📦 项目工作区 ] | [ ⚙️ 系统设置 ]`）；
   - **媒体库管理**：Jellyfin 风格项目工作区海报墙、即时子目录只读扫描、项目内多会话独立隔离；
   - **模块化工作区**：借鉴专业工作站（Adobe Premiere Pro / Blender）的可停靠布局理念，以 Dockview 为核心容器，对话为主控入口，改动 (Changes)、上下文 (Context)、能力 (Capabilities)、产物 (Artifacts)、日志 (RunLog) 按需显式打开与停靠；
   - **意图核对 (Intent Review)**：将任务编写、可选意图澄清、修改重提与显式确认收敛在会话内部，不设立全局阻塞式模式切换。
2. **主线二：Harness 工程 (Harness Engineering)**
   - **轻量上下文组装**：只装配当前任务所需的只读引用与必要信息，记录 Token 消耗，杜绝盲目注入全局技能文本与整库上下文；
   - **能力模块化**：工具白名单受控放行，严格区分只读工具与文件写入权限；
   - **统一运行时接入**：复用 Pi-Agent Harness 运行底座（`pi-ai` 多模型适配、`agent-core` 状态与总线、`coding-agent` 会话抽象），建立独立宿主适配器。

### 2.2 治理与交付准则 (TheMasterplan Single Delivery Owner)
- 严格遵循单一交付责任人机制：统管最终代码 Diff 审阅、Schema 迁移、数据存储升级与 VCS 提交；
- 继承并保护工作区未跟踪与修改内容，严禁执行 `git clean -fd` 等破坏性清理或盲目跨分支整包提交；
- 严格的人工审批关卡 (HITL)：数据外发、真实磁盘写入、破坏性操作与远程推送必须经过人类明确许可。

### 2.3 测试真相体系 (Test Truth Hierarchy)
严格遵守 [TEST_INFRA.md](../../TEST_INFRA.md) 的三层证据边界，禁止层级冒充：
- **Contract Tests (`pnpm test:contract`)**：验证共享契约、路径安全遏制、IPC 通信、设置存储与 Tabs Reducer；
- **Prototype Tests (`pnpm test:prototype`)**：冻结 M1 原型模拟器 210 项历史证据（声明严格限定为 Prototype Tests: 210/210 passed，不可冒充 Electron 测试）；
- **Real Electron E2E (`pnpm test:e2e`)**：Playwright 启动真实 Electron 跨越 main → preload → renderer 的完整生命周期流水线；
- 原生文件选择器与辅助读屏归属于人工验收门（见 `docs/testing/m2-native-picker-smoke.md`），自动化测试 seam 不得伪造人工证据。

### 2.4 本地安全与数据红线
- 本地代码与用户数据不出本机、零意外删除；
- 只读阶段严格锁定目录白名单，禁止 shell、写入与网络外部调用；
- 凭证隔离，严禁将 API Key 写入代码库或版本控制。

---

## 3. 已决决策与完成切片 (Decisions so far)

- **M1 · 开题定音 (COMPLETE)**：完成设计基线收敛与交互原型，权威源收敛于 Figma `Pioneer-PPT`，原型保持 Prototype Tests: 210/210 passed 历史记录。
- **M1.5 · 仓库规范化 (COMPLETE)**：统一公开身份、规范相对路径与三层测试真相，`pnpm check:m15` 门禁通过。
- **M2 · 桌面只读基础切片 (COMPLETE)**：Electron + React + TypeScript 桌面骨架，即时子目录只读扫描，受限 IPC/preload，Jellyfin 海报墙，通过完整 Contract、Real E2E、人工选择器门禁。
- **P0 · 整合底座与多源资产收敛 (COMPLETE, 2026-10-03)**：
  - 详见验收文档：[P0 收口报告](../testing/p0-integration-closeout-2026-10-03.md)；
  - 保持 Git-only main 事实与未提交资产快照；统一 Electron Forge + React 19 构建链；
  - 建立独立会话 state/reducer/IPC 合同，引入离线 Noto 字体并添加离线字体 E2E 测试；
  - 通过 194 项 Contract Tests、9 项 Real Electron E2E 测试，以及 Prototype Tests: 210/210 passed。
- **P1 · 可恢复任务会话与单布局工作区 (COMPLETE, 2026-10-03)**：
  - 详见验收文档：[P1 收口报告](../testing/p1-session-closeout-2026-10-03.md)；
  - 媒体库连接会话创建与恢复，实现同项目多会话独立隔离；
  - `SessionWorkbench` 采用 Dockview 单一停靠布局，彻底移除旧三模式入口；
  - 草稿、消息、可选意图澄清与单布局持久化通过 sender origin 校验写入 `userData`，不污染项目目录；
  - 本地 `RuntimeSession` bootstrap 仅生成状态合法快照（capabilities 均为 false），无假执行；
  - 通过 200 项 Contract Tests、21 项 Real Electron E2E 测试，以及 Prototype Tests: 210/210 passed。

---

## 4. 当前施工前沿 (The Frontier: P2 真实只读 Harness)

P2 是当前唯一处于活跃状态的施工前沿，核心使命是：**在 Electron 桌面环境中尽早跑通第一条真实、可观察、可停止的只读 Harness 任务**。

### 4.1 当前施工队列（2026-10-24 整理）

总入口为已置顶的 [Issue #9 · Pioneer 开发计划](https://github.com/OasisViridis/Pioneer/issues/9)。长期规格已并入该票；本地镜像见[长期开发计划与验收规格](../specs/2026-10-24-pioneer-long-term-development-spec.md)。

| 顺序 | 任务 | 状态与交付 |
| --- | --- | --- |
| 1 | [#12 · Runtime：读取权限与停止规则](https://github.com/OasisViridis/Pioneer/issues/12) | 当前入口，`ready-for-human`；承接 #10/#11 已有成果和全部剩余交付，定稿运行身份、权限、事件、停止与恢复协议 |
| 2 | [#13 · Harness：只读接入与验证](https://github.com/OasisViridis/Pioneer/issues/13) | 原生依赖 #12，`ready-for-agent`；依合同实现主进程适配器、只读工具、真实 Electron 接线及分层验证 |

原 #10 宿主研究、#11 只读预检已有本地成果，其交付核对统一转入 #12；原票按归并关闭，不表示功能完成。原 #14 完整规格并入 #9 后归档。活跃层级只有 #9 下的 #12、#13，执行顺序为 #12 → #13。

PR #8 已合并远程 main，提供本地生命周期骨架；#12 整合时须核对它与本地研究/预检及继承工作树的兼容性。该合并不代表模型、工具或项目写入已经接通。

### 4.2 P2 完成验收条件
1. 在隔离测试工作区中，主进程能成功调度只读 Harness 执行确定性目标（例如读取指定代码并输出分析报告）；
2. 渲染进程能够实时接收结构化流式事件并展示来源；
3. 用户触发中途停止时，能在主进程中确定性取消调用并返回确认，无虚假完成；
4. 自动化测试套件通过可控测试适配器全量通过，工作区 fixture 不变量未被破坏。

---

## 5. 战争迷雾与后续分层 (Not yet specified)

长期阶段目标、时间窗口和验收条件已在[长期规格](../specs/2026-10-24-pioneer-long-term-development-spec.md)中细化。以下阶段的具体接口与实施票仍在进入前沿时逐步决定：

- **Layer 1: M3 任务执行与受控工作区操作后半程**
  - **P3 完整面板体验与真实内容接线**：上下文、能力、日志、文本/产物视图按需加载与定位，布局持久性保持，窄窗自适应；
  - **P4 受控写入与命令执行安全切片**：一次性授权机制，代码修改 vs 产物生成分流，路径逃逸拦截，可逆快照与回滚机制；
  - **P5 Windows 成品体验、桌宠与发布包**：红绿灯原生窗口控制，离线字体打包分发，`dsh-manqu-pet` 薄宿主接入，安装包打包冒烟。
- **Layer 2: M4 调度与扩展闭环**
  - Pi-Agent 微内核双向事件总线（WebSocket / IPC 深度桥接）；
  - 会话分支树 (Session Tree) 与时光机状态回退算法；
  - Zod Schema 原子插件库（文件处理、工程整理、Runbook 沉淀）。
- **Layer 3: M5 实验数据固化与毕业论文初稿**
  - Harness 对比实验方案设计（测量相同模型与任务下的上下文用量、完成率与耗时）；
  - 冻结 M1 原型测试数据整理为论文图表；
  - 毕业论文核心章节起稿（《需求分析》《界面设计》《系统实现》）。
- **Layer 4: M6 答辩演练与最终封版归档**
  - 高清交互演示视频录制（双主线协同运转全流程）；
  - 作品展演双模保障方案（在线模型调用 + 本地离线兜底演示包）；
  - 查重、AIGC 使用记录留痕（对齐 `docs/academic/` 规范）与全工程交付归档。

---

## 6. 明确排除范围 (Out of scope)

以下内容已明确排除在 2027.06 目标之外，永久关闭，不升级为决策票：
- ❌ **车机 HMI (Supersonic) 及 `CockpitService` 车机单一权威模型**：全面作废，不作为交付物；
- ❌ **「多模型自适应 / 动态模型路由」作为独立宣传卖点**：降级为统一接入内部底层机制，不作为创新点主张；
- ❌ **传统 Chatbot 僵化三栏布局与常驻左侧历史会话栏**：彻底废弃，采用媒体库海报墙 + 会话内可停靠面板；
- ❌ **TUI 字符终端与多端时间观承诺**：保留历史记录，不作为开题与答辩承诺；
- ❌ **原型假 runner、假计时器推进、localStorage 模拟执行与全部成功的假结果**：严禁进入生产代码；
- ❌ **未经人类明确审批的自动化 Git 远程推送、代码合并与破坏性清理**。
