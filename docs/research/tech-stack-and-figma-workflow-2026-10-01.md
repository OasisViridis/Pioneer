# Pioneer 当前技术栈与 Figma 协作方式：仓库证据盘点

> 盘点日期：2026-10-01  
> 范围：只读检查仓库源码、配置、Figma 官方文档和当前 Make 的 MCP 资源清单；未运行应用、构建或完整质量门，未修改 Figma。  
> 状态边界：本报告记录仓库快照，不代表恢复/启动开发；开发仍暂停，任务期间无代码、配置或远程设计文件变更。

## 摘要

Pioneer 当前桌面工程是 **Electron + React + TypeScript**，用 **Electron Forge + Webpack** 打包，用 **Zod** 校验进程间数据；测试分成 Vitest 合约测试、冻结的 M1 模拟原型测试、Playwright 真实 Electron E2E。这个版本已经有本机会话与窗口体验扩展，但它仍不是接入真实 Agent 的运行产品。

Pi Agent Harness 是 M4 的目标，不是当前源码依赖；SQLite、桌宠插件运行时及通用插件运行时没有在应用 package manifest 或桌面源码中发现。现有 `task-intent` 是有限的纯 TypeScript 状态转换，不会运行任务。

Figma 目前是设计权威/人工交接来源，仓库还留有一个官方 REST 只读检查/导出脚本、一个旧名 Wonderwall-Pi 插件和本地桥接服务器。检查到的这些工具没有形成 Hazel 设计 Token → 应用 CSS 的自动双向同步；`figma-bridge` README 所说的实时 AI 指令桥在当前服务器与 UI 源码中也没有闭合的命令投递链。

## 1. 仓库内实际技术栈

### 1.1 应用、构建和验证

| 层       | 当前证据                                                                                           | 状态                                                                    |
| -------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 桌面宿主 | Electron 44.2.0；Forge 7.11.2                                                                      | 由应用 manifest 固定；主进程源码实际导入 Electron API。                 |
| UI       | React / React DOM 19.2.8 + TypeScript 6.0.3                                                        | 应用实现；React 组件与 renderer TSX 在 `apps/desktop/src/renderer`。    |
| 构建     | Webpack 5.110.3、Electron Forge Webpack 插件、ts-loader、CSS/HTML 资源 loader；Forge Fuses         | 配置实际用于 main/preload/renderer bundle 与打包。不是 Vite 项目。      |
| 数据校验 | Zod 4.5.4                                                                                          | 共享合同、持久化状态与意图输入中有源码使用。                            |
| 质量工具 | pnpm 11.7.0；Prettier 3.9.6、ESLint 10.9.1、Vitest 5.0.0、Playwright Test 1.62.1、TypeScript 6.0.3 | 锁定在 manifest/lockfile；仓库脚本分别定义类型、合约、原型和 E2E 门禁。 |

可核对版本与脚本：根 [package.json 第 6–23 行](../../package.json#L6-L23)、[第 25–38 行](../../package.json#L25-L38)；桌面 [apps/desktop/package.json 第 6–30 行](../../apps/desktop/package.json#L6-L30)；锁文件中可查 [Electron 44.2.0](../../pnpm-lock.yaml#L1396-L1396)、[React 19.2.8 与 React DOM 19.2.8](../../pnpm-lock.yaml#L2990-L2998)、[Webpack 5.110.3](../../pnpm-lock.yaml#L3719-L3719)、[Zod 4.5.4](../../pnpm-lock.yaml#L3871-L3871)。锁文件也解析工具的传递依赖；传递依赖不等于应用主动选用的技术。

### 1.2 应用边界与功能

- 根 manifest 要求 Node `>=24`，指定 `pnpm@11.7.0`；这是项目要求，不是当前 shell 所选 Node 的运行版本证明。启动与 package 使用 `electron-forge`，实际配置为 [forge.config.ts](../../apps/desktop/forge.config.ts) 和 [webpack.renderer.config.ts](../../apps/desktop/webpack.renderer.config.ts)，不能把 Electron Vite/Builder 技能说明当成项目事实。
- UI 使用 React Hooks、纯函数 Tabs reducer 和自研停靠模型/组件；[状态钩子](../../apps/desktop/src/renderer/hooks/use-session-state.ts)用 `useState`、`useCallback`调用[reducer](../../apps/desktop/src/renderer/state/tabs-reducer.ts)，布局见[停靠模型](../../apps/desktop/src/shared/docking.ts)与[DockSurface](../../apps/desktop/src/renderer/components/DockSurface.tsx)。样式采用普通 CSS、CSS custom properties 和本地 PNG/SVG。当前直接依赖没有 Tailwind、shadcn、Zustand、Redux 或 Dockview；总纲的 Dockview 目标不等于当前已使用。
- **Main** 管理窗口生命周期、设置、目录扫描、输入和 IPC 发送端验证；catalog 扫描限定为用户选择根目录的直接子目录只读扫描。**Preload** 通过 `contextBridge` 暴露窄化、具名的 `window.pioneer` API；**renderer** 持有 React UI 和 Tabs 状态；`shared` 放可序列化合同、校验 schema 与固定 IPC 名称。见 [PROJECT.md 第 22–28 行](../../PROJECT.md#L22-L28) 及实现入口 [main/index.ts 第 1–25 行](../../apps/desktop/src/main/index.ts#L1-L25)、[preload/index.ts 第 1–45 行](../../apps/desktop/src/preload/index.ts#L1-L45)。
- 应用包含 Project Library/项目概览/Tabs/Settings、会话草稿与布局持久化、停靠面板、活动记录，以及 macOS 式窗口控制接线；这些是本地界面/状态基础，不代表模型调用已接通。[PROJECT.md 第 11–20 行](../../PROJECT.md#L11-L20) 记载 M2 只读目标；[ROADMAP.md 第 24–27 行](../../themasterplan/ROADMAP.md#L24-L27) 将 Workbench 扩展、WC1 窗口层与 PET 分开列阶段。
- 安全配置限制远程导航和弹窗；打包资源用 CSP，开发环境则允许 Forge 的精确 dev server origin。[security.ts 第 1–44 行](../../apps/desktop/src/main/security.ts#L1-L44)。目录能力不是任意文件访问：项目架构明确禁止递归扫描、执行 workspace 代码或改写被选目录。[PROJECT.md 第 11–20 行](../../PROJECT.md#L11-L20)。
- 数据由主进程调用 `app.getPath('userData')` 创建本机 settings/session 存储；两个 store 以带固定文件名的 JSON 状态文件实现，并使用 Node `fs/promises`。[main/index.ts 第 317–325 行](../../apps/desktop/src/main/index.ts#L317-L325)、[session-state-store.ts 第 1–15 行](../../apps/desktop/src/main/session-state-store.ts#L1-L15)、[settings-store.ts 第 1–11 行](../../apps/desktop/src/main/settings-store.ts#L1-L11)。当前 app manifest 与锁文件盘点未发现 SQLite/ORM 依赖。

### 1.3 测试层级与不能混用的证据

`pnpm check` 串联格式、lint、类型检查、Contract、Prototype、真实 Electron E2E 和 package smoke；`pnpm test:e2e` 的 Playwright 配置明确指向 Electron E2E 测试集。[package.json 第 13–23 行](../../package.json#L13-L23)、[Playwright 配置第 1–25 行](../../tests/e2e/playwright.config.ts#L1-L25)。仓库权威约定将 Contract、冻结原型和 Real E2E 区分开：Figma 静态稿、M1 Prototype Tests 或 Contract Tests 均不能单独证明 Electron 用户流程。[AGENTS.md 第 24–43 行](../../AGENTS.md#L24-L43)。

本次**没有运行**上述测试或完整 `pnpm check`，所以没有新增验证结论。项目 roadmap 当前仍标 M2 IN PROGRESS；设计、源码、自动测试、人工验收应分开陈述。[ROADMAP.md 第 7–17 行](../../themasterplan/ROADMAP.md#L7-L17)。

## 2. 目标、在途与未落地技术

| 领域                       | 文档/锁文件提及                                                                                                        | 当前源码证据                                                                                                                                    | 准确表述                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pi Agent Harness           | 作为项目总体目标和 M4-A 规划出现；展示材料提到 `pi-ai` / `agent-core` / `coding-agent`。                               | `apps/desktop/package.json` 没有这些应用依赖，桌面源码也未找到对应导入/调用。                                                                   | **计划接入，当前未接通。** 路线图明确 M4-A 待规格/实施；不要把产品称为已有真实 Agent runtime。[ROADMAP.md 第 33–34、58–62 行](../../themasterplan/ROADMAP.md#L33-L34) [另见第 58–62 行](../../themasterplan/ROADMAP.md#L58-L62)。                                                                              |
| SQLite                     | 未见当前 app manifest 声明 SQLite 驱动、ORM 或 schema migration 工具；锁文件搜索也未找到 `sqlite` / `better-sqlite3`。 | 本地设置和会话状态由 main 写入 `userData` 的文件存储代码管理。                                                                                  | **未使用 SQLite。** 只读源码盘点，不推断其他机器或仓库外工具。                                                                                                                                                                                                                                                 |
| M3 意图                    | ROADMAP 标为 PLANNED，M3-A 局部源码存在。                                                                              | `shared/task-intent.ts` 只校验、比较 revision，并将状态限定在 `draft/reviewing/ready/cancelled`；无 runner/Provider/工具调用。                  | **领域合同/状态核局部存在，不是执行器也不是权限执行链。** [task-intent.ts 第 27–48 行](../../apps/desktop/src/shared/task-intent.ts#L27-L48)、[schema 第 27–32 行](../../apps/desktop/src/shared/contracts/task-intent.ts#L27-L32)、[ROADMAP 第 33 行](../../themasterplan/ROADMAP.md#L33-L34)。               |
| 插件运行时 / dsh-manqu-pet | roadmap 已写 PET PLANNED 并链接独立适配要求；`PROJECT.md` 把插件运行时列作 M3+。                                       | 没有发现 desktop manifest 中的宠物/插件宿主依赖，也没有 `src` 下运行时桥接实现；应用内已静态导入 Hazel/Greendou PNG 与 SVG 素材。               | **视觉素材已进 renderer，DSH 桌宠/通用插件尚未集成。** 宠物适配计划不等于插件实际运行。[ROADMAP.md 第 27 行](../../themasterplan/ROADMAP.md#L27-L27)、[PROJECT.md 第 91 行](../../PROJECT.md#L91-L91)、[HazelCompanion.tsx 第 1–18 行](../../apps/desktop/src/renderer/components/HazelCompanion.tsx#L1-L18)。 |
| v3 设计 tokens             | 存在 `docs/design/hazel-v3/tokens.json` 和 `tokens.css`，应用也有 `apps/desktop/src/renderer/styles/tokens.css`。      | 源码样式表声明 CSS custom properties；repo scripts 中未见从 Figma 拉取并生成该 CSS 的自动化步骤。设计工具含静态一致性核验脚本，但不是实时同步。 | **有人工/受控交接及本地 token 对照，不是 Figma ↔ renderer 双向同步。** [设计 token JSON](../design/hazel-v3/tokens.json)、[应用 CSS tokens](../../apps/desktop/src/renderer/styles/tokens.css#L1-L24)。                                                                                                        |

## 3. 仓库内可见的 Figma 协作工具

### 3.1 实际存在的路径

1. **Figma MCP 配置**：根 [mcp_config.json 第 1–8 行](../../mcp_config.json#L1-L8)展示名称虽为 `Figma Desktop`，实际声明远程端点 `https://mcp.figma.com/mcp`。它是设计工具接入配置，不是应用运行时依赖，也不证明每轮有自动同步。
2. **官方 REST 脚本**：[`tools/figma-sync.js`](../../tools/figma-sync.js#L9-L36)从环境读取 `FIGMA_TOKEN` / `FIGMA_FILE_KEY`，请求 `api.figma.com/v1`；当前 CLI 实现读取文件结构/节点、输出状态和导出图片 URL。[第 48–92 行](../../tools/figma-sync.js#L48-L92)。脚本还有 `comment` 分支调用未定义的 `postComment`，因此不能把它描述成完整协作集成。[第 95–106 行](../../tools/figma-sync.js#L95-L106)。这次没有运行它，也没有读取 `.env` 或使用凭据。
3. **Figma 插件**：[`figma-bridge/manifest.json`](../../figma-bridge/manifest.json#L1-L13)是独立的 Figma 开发插件。其代码生成旧版 `Wonderwall-Pi` 名称的 Paint Styles 与设计片段，也能对页面列表做改名/排序；配色硬编码为 Apple 蓝、字体代码使用 Inter，**不是当前 Hazel v3.2 tokens 的同步管线**。[颜色/样式定义](../../figma-bridge/code.js#L8-L70)、[页面整理范围](../../figma-bridge/code.js#L259-L265)。插件自己调用 Figma Plugin API，不是 React 工程消费的 Figma Code Connect。
4. **本地桥接 server**：[`bridge-server.py`](../../figma-bridge/bridge-server.py#L5-L11)称仅绑定 loopback，并对 POST 要求 bridge token；实现中 POST 处理后仅返回 `{"status":"queued"...}`，[第 60–97 行](../../figma-bridge/bridge-server.py#L60-L97)。与之配套的 [`ui.html`](../../figma-bridge/ui.html)搜索未见向此 server 发出的 `fetch`/WebSocket 命令轮询或响应处理路径，因此仓库内没有证据支持 README 声称的“AI 终端实时操控 Figma 画布”已闭环。`figma-bridge/README.md` 是历史说明，且标题/示例仍称 Wonderwall-Pi。[README 第 1–5、19–24、47–55 行](../../figma-bridge/README.md#L1-L5)。
5. **历史协作计划**：[`docs/design/FIGMA-COLLABORATION-PLAN.md`](../design/FIGMA-COLLABORATION-PLAN.md)写的是 Wonderwall-Pi 旧产品，并描述 tokens → Variables/Styles → Make → 人工调整 → HTML/CSS demo 的目标流程；它不是当前自动化运行事实，不能覆盖新 Hazel 规范。

### 3.2 可据源码支持的交接边界

- 设计语言/关键屏/装饰资产由 Figma 作为可编辑设计成果维护；renderer 的 CSS、React 组件和图片资产在本仓库单独落地。Make 生成的交互原型、普通 Figma 设计页和应用代码是不同制品，不能只凭共享链接或 prompt 推定代码已更新。
- Hazel v3.2 的原始 token 参考为设计侧 JSON/CSS；`apps/desktop` 有自己的 `tokens.css`。本次源码没有找到持续生成、发布或拉取 Figma Tokens 的流水线、Code Connect package、自动设计变更触发器或 Figma → React 转译步骤。因此协作默认需要**人工确认设计、明确版本/页面、实现者对照 token 与状态规格、再通过应用测试与人工验收**。
- 截图/原型可供视觉对照，不是 Electron 运行证明；renderer 对设计的实现差异应记录在应用证据里，不应声称像素一致或 Figma 原型等价于本机交互。

## 4. 最新设计决策与现有规格/源码漂移

本会话最新确认（1A、2A）：移除“专注／审阅／交付”模式/分页入口；统一工作台以对话为默认主轴，Diff、预览和产物按需由用户点击打开为面板；结果到来时不自动展开或切换布局；审阅与交付动作仍保留在当前会话中。随后已产出交给 Figma Make 的提示词，但**本轮未核验 Make 的落实效果，现有产品规格和 React 源码仍保留三布局**。

该决策与现存正式设计合同及应用实现有明确漂移：

- [DESIGN-SYSTEM.md 第 17 行](../design/DESIGN-SYSTEM.md#L17-L17)仍定义三者为当前会话布局；[第 85–92 行](../design/DESIGN-SYSTEM.md#L85-L92)仍按三种布局组织欢迎态资产。
- [workbench-product-spec.md 第 12–20 行](../design/workbench-product-spec.md#L12-L20)仍画出专注/审阅/交付布局，并将对话定义为默认主轴、其它内容放在可停靠面板。它在“对话+面板”方向上相近，但保留了已决定取消的三态布局入口。
- React [SessionWorkbench.tsx 第 12–17、49–57 行](../../apps/desktop/src/renderer/components/SessionWorkbench.tsx#L12-L17)仍渲染三种布局切换；共享 [tabs.ts 第 7、19–30 行](../../apps/desktop/src/shared/contracts/tabs.ts#L7-L30)仍将布局作为持久化 session 状态字段，并将 saved/dock 布局以三态 Record 建模。

因此这属于**已经确定但尚未实现/同步文档的设计方向**，不能表述为现行 UI 或已获工程验收。后续若正式落地，需同步核对 Make、DESIGN-SYSTEM、Workbench 产品规格、布局/会话 schema 与恢复行为；保留旧会话数据的兼容处理需另行设计，不应由此份调研代改规范或源码。

## 5. Figma Design、Make 与工程的当前协作能力

### 5.1 三种不同制品

| 制品         | 当前入口                                                                                                                                                                                                                                                             | 职责                                                                      | 不代表什么                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Figma Design | [规范](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1276)、[组件](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1278)、[BASELINE](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1279) | 可编辑的语言、组件、素材和确认后的关键状态；BASELINE 是参考，不是像素锁。 | 不运行 Electron、不自动更新 renderer。                                   |
| Figma Make   | [Desktop App Prototype Design](https://www.figma.com/make/tcAZjzVznDTlTGcMqVGXqj/Desktop-App-Prototype-Design)                                                                                                                                                       | 交互探索与实点迭代，由用户指定 Opus 主导、Sonnet 迭代。                   | 浏览器里的窗口、托盘、宠物、执行/验收模拟不是 Windows 或真实运行器证据。 |
| Pioneer 仓库 | `apps/desktop`                                                                                                                                                                                                                                                       | React UI、main/preload、IPC、安全、持久化和桌面行为。                     | 不因 Make 改稿或复制 Design 成功自动完成集成。                           |

Design 入口来自[现有归档交接](../design/figma-archive-make-handoff-2026-10-01.md)，本轮未作远端 Design 全量审计。当前 Make 的只读 `get_design_context` 返回了 `package.json`、`src/App.tsx`、`src/main.tsx`、`src/index.css`、`vite.config.ts`，以及 `src/pioneer` 下的 Dock、flow、Library、Pet、Session、Shell、store 等源码和 Hazel PNG/SVG 资源链接。因此能确认它是独立的 TSX/CSS、带 Vite 配置的 Web 原型源树，不是 Pioneer 的 Forge 工程。客户端资源清单未列出这些动态文件，本轮未成功读取其 package 正文，不报告 Make 的精确依赖版本；浏览器读取超时，未重新实点。官方也说明 Make 可经 MCP 提供代码/素材资源：[Resources — Make → MCP](https://developers.figma.com/docs/figma-mcp-server/bringing-make-context-to-your-agent/)。

### 5.2 Design → Make → Design

- **Design → Make**：把具体 frame 通过 Send to Make、Add context 或复制粘贴提供给 Make，作为视觉和内容参考；不是自动把全部 Design 组件逻辑编译成工程。来源：[Attach files to a prompt](https://help.figma.com/hc/en-us/articles/31304529835671-Attach-files-to-a-prompt-in-the-Figma-agent-and-Figma-Make)。
- **Make → Design**：在具体原型状态使用 Copy design，得到可编辑静态图层；不链接回 Make、不自动连接设计系统、不保留交互。Figma 会尝试匹配已有颜色/数值/字符串变量，但不能把这称作完整组件/token 同步。来源：[Copy a Make preview as design layers](https://help.figma.com/hc/en-us/articles/35060759685015-Copy-a-Figma-Make-preview-as-design-layers)。
- **保留演示**：可以在 Design 等画布嵌入 Make URL；这是展示原型，不是复制交互连线或双向同步。来源：[Beyond the basics — Using Figma Make](https://help.figma.com/hc/en-us/articles/35710574222487-Beyond-the-basics-Using-Figma-Make)。

对 Pioneer 的建议：让 Make 快速验证工作台，挑选被确认的关键状态回到 Design 整理；不用每轮微调都完整复制回去，更不用静态复制代替点击验收。Make 的源码可作为参考移植到 renderer，但不能用 App/store 覆盖主应用、复制演示数据冒充真实执行，或为此切换整个构建系统。

### 5.3 代码输出与直接编辑现有仓库是两条路径

**独立 Make 文件**能下载代码，也能 Push to GitHub。后者只推送到 Make 为该文件创建的一对一仓库，不能选已有 Pioneer 仓库；它是单向推送，外部修改不回到 Make，下次推送可能覆盖外部修改，而且总是推默认分支。来源：[Push from Make to GitHub](https://help.figma.com/hc/en-us/articles/35463818346647-Push-from-Figma-Make-to-GitHub)。本轮未导出、连接 GitHub、创建仓库或发布。

**新功能 Make in your local codebase** 已能连接现有 Git 仓库，在本地预览并修改真实应用，形成提交和 PR。所以“Make 不能改已有仓库”不能再作为全局结论；但本次官方核查显示该功能仍为限量封闭测试、按组织批次开放，**仅 Mac，Windows 支持尚在计划中**。它面向既有 Web UI，不定位于后端、API、基础设施或非 Web 工程。来源：[官方设置与限制](https://help.figma.com/hc/en-us/articles/40789739982871-Make-in-your-local-codebase-Setup-gotchas-and-troubleshooting)、[Make in your local codebase](https://help.figma.com/hc/en-us/articles/40775535020695-Make-in-your-local-codebase)。

本项目判断：当前 Windows 宿主不满足此 beta 系统限制，账号资格未核对。官方没有明确说明 Electron 支持；renderer 视觉修改可作为将来可能的试验范围，整应用、main/preload/IPC、原生窗口、桌宠宿主和 E2E 是否受支持不能据此推定。新功能还会引入 `.figma/make` 配置与真实仓库变更，本轮不启用。

### 5.4 MCP、Code Connect、Make kits 与 token 管线

| 能力                       | 用途                                                                 | 本项目边界与采用判断                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dev Mode / MCP             | 将选定节点的布局、组件、变量、素材及 Make 代码资源提供给实现 agent。 | 已有工具接入，适合作为明确设计输入；MCP 本身不替 agent 整合和验收。要求复用现有 React/CSS 和 Forge 工程，不照抄默认示例栈。[MCP 与 agent 的分工](https://developers.figma.com/docs/figma-mcp-server/mcp-vs-agent/)。                                                                                                                             |
| Code Connect               | 显式连接 Figma 组件和现存代码组件，提供组件使用片段与属性映射。      | 规范记载未配置，本地未见连接定义；本轮未扫描远端映射。它不是自动实现或 token 同步。组件稳定后可选少量高复用项；方案/席位前提先核对，不是当前必须建设的系统。[官方介绍](https://developers.figma.com/docs/code-connect/)、[UI setup](https://developers.figma.com/docs/code-connect/code-connect-ui-setup/)。                                     |
| Make kits                  | 给 Make 提供 npm 包、已发布库样式/变量与指南。                       | 可减少重复上下文，但变量仅抽取子集生成简化 CSS，不保留完整语法/一对一映射；库变更需更新 kit，kit 改动不回写 Design。官方条件为付费方案 Full seat，本账号能力未核对；目前没有独立发布的 Pioneer UI 包，不为原型强行增加工具链。[Make kits](https://help.figma.com/hc/en-us/articles/39241689698839-Get-started-with-Make-kits)。                  |
| Variables API / token 导出 | Plugin API 能读写变量；REST API 可用于受控自动化。                   | 仍需明确映射、生成、版本控制和核验，不是开启后自动同步。REST Variables 文档有 Enterprise 组织 Full seat 等要求，本账号是否符合未知。先保持已有 JSON/CSS 对照，将来再决定自动化。[Plugin Variables](https://developers.figma.com/docs/plugins/working-with-variables/)、[REST Variables](https://developers.figma.com/docs/rest-api/variables/)。 |

本段区分平台能力、当前可读取的结果与项目已配置的管线；不为调研安装工具、发布库或扩大权限。

## 6. 推荐的轻量协作闭环

```text
Design：设计语言、组件、素材、参考屏
       ↓ 具体 frame + 简短设计意图
Make：交互探索、实点验证、迭代
       ↓ 选定版本/状态，Copy design；源码作为参考
Design：整理被确认的关键状态、组件、交付记录
       ↓ 节点 + Make URL/版本 + token/素材 + 行为边界
Pioneer renderer：复用现有 React/CSS、会话与停靠模型
       ↓ main/preload/IPC 适配、持久化与安全语义
分层验证：Contract / Prototype / Electron E2E / Windows 人工
```

这是建议，不是本轮执行完的自动同步管线，也不意味着恢复开发。每轮设计交接保留最小信息：Design 节点、Make 文件及版本/关键状态、本轮意图、需保留行为与未验证边界；不把旧 BASELINE 当像素锁。审批、Diff、应用、验收、交付由真实工程状态驱动；原型里的窗口/宠物另做宿主适配。

正式落实 1A/2A 时，应一起处理布局持久化兼容、欢迎主题槽位去耦和相关测试；不是只隐藏三个按钮就完成。ROADMAP 仍有更早的复工安排，但本会话后续“暂停开发”优先；这份调研不启动工程、不改模型/provider、不推进里程碑。

## 7. 核查范围与限制

- 本轮核对 manifest、lockfile、源码、配置、仓库文档和 Figma 官方说明；只读 VCS 盘点确认无 `.jj`、分支 `codex/hazel-session-workbench`、HEAD `cc82d8a38b013e9e6bcbc11cbc99bd07e706bc33`，已有大量未提交/未跟踪内容保留。
- Make 仅成功获取只读资源清单，未成功读取动态文件正文或重新实点；不宣称精确依赖、模式删除效果、自动化测试或宠物插件接入已验证。Design 组织引用现有交接记录，未作本轮远端全量审计。
- 未启动/安装插件、REST 脚本、本地桥接服务、应用、开发服务或 Electron；未连接/发布 GitHub，未修改 Figma；未检视仓库外的桌宠代码。
- 未读取真实 `.env`、私人令牌或个人 profile。本轮只新增本报告，不覆盖规范、计划或历史证据。
- 未运行工程门禁；源码定位和官方文档核对不构成 Contract/Prototype/Real E2E/package 或 Windows 人工 PASS。随后只对报告检查格式/本地链接，不能混称完整 `pnpm check`。
- 外部产品能力、方案与系统限制可能变化，未来实际采用前重查权限与兼容性。
