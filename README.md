# Pioneer

> **基于TypeScript的模块化智能体交互系统设计与实现**  
> 毕业设计课题（2026-10-08 按导师意见确认）。Pioneer 是这个课题的工程实现：用桌面界面组织本地项目、会话和 Agent 的运行状态，项目用海报墙浏览，会话用标签页隔离，执行过程摊在按需打开的停靠面板里。

[Figma 设计稿](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=925-3)（公开可查看） · [Figma 交互原型](https://nix-medley-14707825.figma.site/)（可直接打开） · [apps/desktop 桌面工程源码](apps/desktop/) · [课题定位](选题收敛说明.md)

## 这个项目在做什么

Pioneer 的设计前提是：项目、会话与运行状态都应当是可操作的对象，而不是藏在侧边栏和聊天气泡里。它由此分成两条并行主线。

**交互系统**：本地项目从媒体库海报墙进入，同一项目可以开多个会话；会话内是对话加可停靠的面板，布局能保存，重启后恢复。

**Harness 工程**：把上下文组装、工具白名单与模型接入拆成可替换的模块，复用 Pi Agent Harness 的运行底座。目标是让同一条任务在不同 Harness 下可比较，比较的指标是上下文用量、完成率与耗时，这也是论文实验的落点。

两者的取舍与不做的范围写在[选题收敛说明](选题收敛说明.md)，视觉与交互规范写在[产品定义与美学纲领](产品定义与美学纲领.md)。

## 当前状态

里程碑以 [ROADMAP](themasterplan/ROADMAP.md) 为唯一权威，下表只做导航。

| 阶段或工作包                 | 状态                                | 证据                                                                                                                                                         |
| ---------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1 开题定音、M1.5 仓库规范化 | 完成                                | ROADMAP 里程碑表；冻结原型保留为历史设计基线                                                                                                                 |
| M2 只读桌面切片              | 完成                                | 受限 preload、海报墙、契约与真实 Electron 测试均通过；原生目录选择器的人工验收见[记录](docs/testing/m2-native-picker-smoke.md)                               |
| M3 任务执行                  | 进行中                              | P0 整合底座与 P1 可恢复会话于 2026-10-03 收口，见 [P1 收口记录](docs/testing/p1-session-closeout-2026-10-03.md)                                              |
| P2 真实只读 Harness          | 已合并 `main`（PR #16，2026-10-26） | 验证清单见 [Issue #13 验证记录](docs/testing/issue13-verification.md)；真实 Provider 运行见 [A09 记录](docs/testing/issue13-real-provider.md)                |
| P3 及之后                    | 进行中（#41、#42 已合并；#17 待做） | #17 至 #32 十六张已发布；2026-10-26 追加 #41、#42（移除意图卡、修正运行提示），设计同步另有 #33 至 #37；#41 由 PR #46 合并，运行任务改为在运行日志里直接填写 |

以上按 2026-10-27 的 `main`（`55f8130`）核对；#41 已移除意图卡，任务不再需要「确认意图」这一步。

### 现在能做的事

- 扫描指定目录的即时子目录，把本地项目陈列成海报墙；不做递归，不改动被扫描的目录
- 同一项目开多个会话，各自的草稿与消息互不干扰
- 会话内是对话加四个可选面板（上下文、能力、改动、产物）；面板能拖到左右两栏、调整宽高、收起，布局可保存并在重启后恢复
- 上下文面板读的是真实项目概览；改动与产物面板目前是空状态，真实数据随 P3 接入
- 草稿、消息与布局写入 Electron `userData`；关窗前先确认保存，读取失败时保留原始记录而不是覆盖
- 在运行日志里写下任务并点「启动运行」；不启动就不调用模型，工具只走只读白名单

### 还没做的事

- 写入项目文件、执行命令、可逆快照与回滚
- 插件库、会话分支与历史回退
- 打包成品内的真实 Provider 运行仍是人工授权流程（2026-10-27 已在 `electron-forge package` 成品上留证，见 [Issue #13 打包成品运行记录](docs/testing/issue13-packaged-run.md)），尚未纳入自动门禁

## Harness 目前接到哪一步

P2 只接通一条只读链路，边界都放在主进程里：

| 环节     | 现状                                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模型接入 | `pi-ai` 与 `pi-agent-core` 1.4.0，经主进程适配器调用；运行未启动时不发请求                                                                           |
| 只读工具 | `read_file`（单次 64 KiB）、`list_directory`（200 条目）、`search_in_files`（深度 16、1000 文件、每文件 64 KiB、合计 4 MiB、100 命中）；路径先过预检 |
| 外发材料 | 运行前勾选可外发文件；主进程绑定相对路径、字节数与 SHA-256。未列入清单返回 `MATERIAL_NOT_ALLOWED`，清单文件内容变化返回 `CONTENT_NOT_ALLOWED` 并停止 |
| 运行时   | 主进程管理 Run 生命周期，append-only 事件日志；停止先等收敛，宽限期（默认 5 秒）到期由主进程强制结束并记固定失败码（含 `ADAPTER_DISCONNECTED`）       |
| 会话历史 | 每次终态把任务与有界结果摘要写入 session state v6，每会话最多 20 条，重启后恢复；主进程日志只存摘要                                                   |
| 授权     | 每次运行签发一次性 Grant，绑定任务内容、会话、revision、发起窗口与材料清单，超时或内容变更后重新授权                                                  |
| 凭证     | 只在主进程内从环境变量读取后交给适配器；不进仓库，不写日志，事件与错误码里也不出现                                                                   |
| 未接通   | 写入、命令、通用文件系统 IPC、Runtime 子进程                                                                                                         |

[A09 记录](docs/testing/issue13-real-provider.md)里，模型在一次运行中发起四次工具调用：其中一次因路径重复被预检拒绝且未泄露绝对路径，模型自行纠正后读到目标文件；另一次运行在执行中被用户停止，落在 `stopped`。

## 技术架构

代码分层固定为四层，源码在 [apps/desktop/src](apps/desktop/src/)：

| 层       | 职责                                                                          | 位置           |
| -------- | ----------------------------------------------------------------------------- | -------------- |
| 主进程   | 窗口生命周期、只读扫描、设置与会话存储、Harness 运行宿主                      | `src/main`     |
| 预加载   | 经 `contextBridge` 暴露窄接口 `window.pioneer`，不提供通用 IPC 或文件系统方法 | `src/preload`  |
| 渲染进程 | React 界面：海报墙、会话 Tabs、停靠面板、运行日志                             | `src/renderer` |
| 共享契约 | Zod schema、IPC 通道常量、路径与状态模型，跨进程共用                          | `src/shared`   |

应用依赖取自 `apps/desktop/package.json`，Node 与 pnpm 取自根 `package.json` 的 `engines` 与 `packageManager`：

| 依赖                                  | 版本             |
| ------------------------------------- | ---------------- |
| Electron                              | 44.2.0           |
| React / React DOM                     | 19.2.8           |
| TypeScript                            | 6.0.3            |
| Zod                                   | 4.5.4            |
| Pi Agent（`pi-ai` / `pi-agent-core`） | 1.4.0            |
| Electron Forge / Webpack              | 7.11.2 / 5.110.3 |

界面令牌有两处来源：设计稿版本在 `docs/design/hazel-v3/tokens.json`，运行时用的是 `renderer/styles/tokens.css` 里的 M3 工作区调色板。两套色值尚未合流（例如 canvas 一处是 `#F6F5F1`，另一处是 `#f1f2ee`）。

## 快速开始

环境要求：Node 不低于 24（`engines.node` 写的是 `>=24`），pnpm 11.7.0（`packageManager` 已固定，用 Corepack 启用最省事）。自动化门禁与人工验收目前都在 Windows 上完成（CI 用 `windows-latest`），其它平台未经验证。

```bash
# 安装依赖
pnpm install

# 启动桌面端开发模式
pnpm dev
```

首次启动后先在媒体库选择项目根目录，它只扫描该目录的即时子目录，不递归、不写入。

质量门禁按证据层级分开跑，不要用一层的结果代替另一层：

| 命令                     | 检查什么                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify:repository` | 仓库规范化：公开身份与旧路径、绝对 `file://` 链接、210 声明必须限定为 Prototype Tests、README 必须链到 `apps/desktop` |
| `pnpm test:contract`     | 共享契约、路径遏制、IPC 与 sender 校验、设置存储与 Tabs                                                               |
| `pnpm test:prototype`    | 冻结的 M1 模拟器 210 项用例，属 Prototype Tests 证据，不是 Electron 证据                                              |
| `pnpm test:e2e`          | Playwright 启动真实 Electron，跨 main → preload → renderer，并校验 fixture 未被改动                                   |
| `pnpm check`             | 依次跑格式、lint、类型、上述三层测试与 package smoke                                                                  |

最近一次完整门禁记录在 2026-10-27（分支 `codex/issue13-remaining`，见 [Issue #13 验证记录](docs/testing/issue13-verification.md)）：契约 348/348（36 文件）、冻结原型 210/210（Prototype Tests）、真实 Electron 27/27、仓库规范化 6/6。数字随提交变化，引用时带上日期与版本。

`test:e2e` 的 `testMatch` 只列了 8 个 spec；`window-chrome`、`session-persistence`、`hazel-design` 三个 spec 不在白名单内，因此不进 `pnpm check`，也不进 CI。

## 目录结构

```text
apps/desktop/src/
├── main/        Electron 主进程：窗口、扫描、设置与会话存储、Harness 运行宿主
├── preload/     contextBridge 暴露的窄接口 window.pioneer
├── renderer/    React 界面：海报墙、会话 Tabs、停靠面板、运行日志
└── shared/      跨进程契约：Zod schema、IPC 通道、路径与状态模型
tests/
├── contract/    确定性契约测试
├── e2e/         Playwright 与真实 Electron
├── prototype/   冻结的 M1 模拟器与探针
├── fixtures/    只读测试工作区
└── repository/  仓库规范化门禁
```

## 文档入口

| 想了解                           | 去哪看                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| 里程碑与阶段状态                 | [ROADMAP](themasterplan/ROADMAP.md)                                                 |
| 当前施工前沿与后续票             | [Wayfinder 开发计划](docs/plans/2026-10-10-pioneer-wayfinder-development-plan.md)   |
| 长期交付范围与验收条件           | [长期开发规格](docs/specs/2026-10-24-pioneer-long-term-development-spec.md)         |
| 三层测试的证据边界               | [TEST_INFRA](TEST_INFRA.md)                                                         |
| 术语：Session、Run、Grant、收敛  | [GLOSSARY](GLOSSARY.md)                                                             |
| 课题定位（题目、双主线、时间线） | [选题收敛说明](选题收敛说明.md)                                                     |
| 产品形态与美学                   | [产品定义与美学纲领](产品定义与美学纲领.md)（v2.1，题名已同步 2026-10-08 正式题目） |
| 设计系统与色板令牌               | [Hazel v3](docs/design/hazel-v3/tokens.json)                                        |
| 文档总导航                       | [docs/README](docs/README.md)                                                       |

## 参与与边界

- 本地代码与用户数据默认不外发；真实模型只使用明确获准的 Provider、模型与材料清单。
- 数据外发、磁盘写入、破坏性操作与远程推送都需要人类明确许可，Agent 不自行扩大权限。
- 桌宠与插画只做装饰，不承担运行状态或授权提示。
- 交付走 [AGENTS.md](AGENTS.md) 的单一交付责任人流程，`pnpm check` 是合并前的门禁；合并、推送与清理未经许可不执行。

## 协议

工程源码遵循 [MIT License](LICENSE) 开源。外部字体、设计素材与参考图集保留原作者版权。
