# P2 · Pi 包边界与 Electron 主进程适配器研究

研究日期：2026-10-23。来源：[Issue #10](https://github.com/OasisViridis/Pioneer/issues/10)，属于 [#9 决策地图](https://github.com/OasisViridis/Pioneer/issues/9)。本文回答包分发、宿主接口和凭证隔离三个问题，交付研究结论与接口草案。里程碑状态仍以 [ROADMAP](../../themasterplan/ROADMAP.md) 为准。

## 结论与选择

建议 P2 首条只读任务使用 `@earendil-works/pi-agent-core` 的 `Agent`，通过显式 `streamFn` 接入 `@earendil-works/pi-ai` 的独立 `Models` 对象；两包以本次核验的 `1.4.0` 为后续探针候选版本。Pioneer 自己持有会话、批准记录、工具权限、IPC 和持久化，不让 SDK 定义产品状态。`pi-coding-agent` 已完成边界评估，暂缓作为 P2 最小依赖；后续确需会话树、压缩或扩展时再单独评估其完整 SDK。选择依据见下文及 [Agent 源码][agent]、[Models 源码][models]。

本次没有安装 Pi、修改依赖/锁文件、调用 Provider、增加运行 IPC 或开放能力。现有 `RuntimeSession` 继续只表示 `initialized`，三个 capabilities 保持 `false`。本文不是已实现适配器、Pi 打包成功或 P2 完成的证明。

## 1. 官方分发与版本快照

旧仓库 `badlogic/pi-mono` 已重定向至 [earendil-works/pi](https://github.com/earendil-works/pi)。实时 npm registry 的 `latest` 查询结果如下，不能用搜索索引中的旧版 SDK 示例代替当前 API。

| 层       | 当前官方 npm 包                   | 本次 latest | Node engines | 责任与依赖                                                                   |
| -------- | --------------------------------- | ----------- | ------------ | ---------------------------------------------------------------------------- |
| 模型     | `@earendil-works/pi-ai`           | `1.4.0`     | `>=22.19.0`  | Provider、模型、认证与流式协议；含 Provider SDK、`pi-telemetry` 等依赖。     |
| 循环     | `@earendil-works/pi-agent-core`   | `1.4.0`     | `>=22.19.0`  | `Agent`、状态、事件与工具调度；直接依赖同版 `pi-ai` 和 `typebox`。           |
| 编程应用 | `@earendil-works/pi-coding-agent` | `1.4.0`     | `>=22.19.0`  | 编程工具、会话管理、配置与资源发现；还引入 TUI、MCP、codemode、WASM 等依赖。 |

三包均为 `type: module`，根导出提供 `import` 和类型声明；发布物是构建后的 `dist`，无需从 TypeScript 源码复制实现。`pi-ai` 另有 `providers/*`、`api/*`、`compat` 等公开入口；`pi-coding-agent` 另有 `rpc-entry`。普通 SDK 入口与 CLI/RPC 入口须分开处理。[npm ai][npm-ai] · [npm agent-core][npm-agent] · [npm coding-agent][npm-coding]

三个旧 `@mariozechner/*` 包本次 latest 均为 `0.73.1`，registry 均标记 deprecated 并指向对应 `@earendil-works/*` 包。`agent-core` 是架构层简称，实际包名包含 `pi-agent-core`。[旧 ai][npm-old-ai] · [旧 agent-core][npm-old-agent] · [旧 coding-agent][npm-old-coding]

源码审阅固定于官方 `v1.4.0` 对应提交 **`4a080252f06caf63a525d7873c5d94d3c23887e0`**。下文 Pi 源码链接均使用该提交；[tag API][tag] 可复核映射。[证据快照](2026-10-23-p2-pi-host-adapter.json) 保存精确包名、engines、exports、直接依赖、registry URL 与 `dist.integrity`。registry 未提供这三个新包的 `gitHead`，不声称源码 tag 与 npm tarball 已逐字节比对。真正引入时要固定三个版本、提交锁文件，并校验发布物完整性。

### 1.1 为什么先选择 Agent 层

`Agent` 默认工具列表为空，通过 `AgentOptions.streamFn` 接收模型传输，提供 `prompt`、`subscribe`、`abort`、`waitForIdle`。当前构造参数要求 `streamFn`；不能照搬旧示例中依赖隐式全局默认传输的用法。[agent]

`pi-ai` 根入口导出 `createModels`、内存存储及协议；Provider factories 位于各自子入口。`createModels` 的 credentials/modelsStore 默认在内存中，但 **authContext 默认仍读取环境变量并探测文件**。独立实例本身不足以保证凭证隔离，必须显式注入受限认证上下文。[ai-index] · [models] · [auth-context]

该方案让 Pioneer 只装配当前任务需要的消息与工具。会话树、自动压缩、扩展加载和模型自动选择不属于本票实现内容，也不能作为 `agent-core` 已自带的产品功能宣传。

### 1.2 coding-agent SDK 的默认行为

`createAgentSession()` 的参数默认会解析 `cwd`、全局 `agentDir`，创建 `ModelRuntime`、磁盘 SettingsManager/SessionManager，并加载 DefaultResourceLoader。默认工具含 read/bash/edit/write；`tools` 在此版本是 **名称字符串数组**，自定义定义放在 `customTools`。`tools: []` 或 `noTools: 'all'` 可以关闭工具，但不等于关闭资源发现、全局配置或 SDK 导入时的默认传输注册。[sdk]

文件型 AuthStorage 以 `auth.json` 为后端，能创建父目录/文件并在更新时落盘。这是其正常职责，却与本阶段不触碰用户全局凭证的要求不符。[auth-storage]

因此不使用全局安装的 `pi` 命令，不启动默认 CLI/RPC，不直接调用无参数 `createAgentSession()`。未来采用该层时，必须一起隔离 modelRuntime、settingsManager、sessionManager、resourceLoader、agentDir 和工具集合；仅设定工作目录或使用内存 SessionManager 不足以通过验收。精确隔离组合需要独立探针，不能把旧版 `authStorage/modelRegistry` 参数当作 `1.4.0` 工厂参数。

## 2. Node 与 Forge/Webpack 宿主判断

本地读取 [desktop package](../../apps/desktop/package.json)、[Forge 配置](../../apps/desktop/forge.config.ts)、[main Webpack 配置](../../apps/desktop/webpack.main.config.ts) 和 [tsconfig](../../apps/desktop/tsconfig.json) 得到：Electron `44.2.0`、Forge/Webpack 构建、TypeScript `module/moduleResolution: Node16`，应用 package 没有 `type: module`，入口为 `.webpack/main`。当前依赖和锁文件尚无上述 Pi 包。

本次通过本地开发版 Electron 可执行文件的 Node 模式读取 `process.versions`：Electron `44.2.0`、内嵌 Node **`24.20.0`**；终端 Node 为 `24.17.0`，pnpm 为 `11.7.0`。这证明两个 Node 版本满足声明范围；没有证明 Pi 已能被 Forge 构建、ASAR 打包或打包后的应用加载。

Electron main 使用 Node 的模块加载器，支持 ESM；沙箱 preload 不支持直接 ESM 导入。Forge 为 main、preload、renderer 建立不同入口。因此 SDK 依赖应只进入主进程适配模块，不改变 renderer/preload 的隔离配置。[Electron ESM][electron-esm] · [Forge Webpack][forge-webpack]

后续构建探针按以下顺序进行：

1. 在隔离目录安装精确版本并检查 npm `dist` 中真实 exports、动态导入、资源路径及传递依赖的 engines；不执行包脚本来下载额外工具。
2. 保留现有 Forge 主入口，先验证 Webpack 对选定 Agent/Provider 依赖图的打包结果；检查 `import.meta`、动态模块、目录资源是否仍可解析。不要直接把 ESM 包转换成未经验证的 CommonJS `require`。
3. 若必须将包 external 化，则显式保持 **Node 原生动态 import**，把包、传递依赖和资源带入 Forge 成品，并检查 pnpm 链接是否可脱离开发目录解析。仅配置 externals 不能证明依赖已被复制。此方案与 ESM bundle 方案择一验证后实施。
4. 在开发入口和打包产物中分别执行无凭证、无网络的 import/构造/释放探针，记录实际 `process.versions`；断开源码目录后验证成品仍能加载。保留 `asar: true` 与现有 fuses。只有确切依赖需要时才评估 unpack；没有证据不切换整仓 ESM、不关闭安全配置。
5. 使用 #13 的受控传输穿越 main → preload → renderer，验证只读工具、停止和 fixture 哈希。Pi 成品探针通过以前，兼容性结论限定为「版本声明兼容，构建/成品待验证」。

## 3. 现有 RuntimeSession 与主进程边界

[bootstrapRuntimeSession](../../apps/desktop/src/shared/runtime-session.ts) 当前是纯函数；[schema](../../apps/desktop/src/shared/contracts/runtime-session.ts) 将状态和三个 capabilities 固定为关闭。实际初始化由 [renderer reducer](../../apps/desktop/src/renderer/state/intent-workspace.ts) 调用。该快照锁定 ready 意图的 id/revision/projectId，**不是授权凭据，也没有 SDK 实例**。

P2 执行接线必须另建 main 内的运行注册表，持有 runId → SDK、AbortController、订阅和授权作用域。现有 RuntimeSession schema 不偷偷扩权：运行状态与能力投影应在 #12 明确新契约后再实现，历史初始化快照继续合法。

```mermaid
flowchart LR
    R[Renderer: Pioneer 数据与显式动作] --> P[Preload: 固定方法和可撤销订阅]
    P --> H[Main: 来源校验与运行授权]
    H --> A[PiHarnessAdapter: Agent + Models]
    A --> T[Pioneer 只读工具边界]
    A --> N[经授权的模型传输]
    A --> H
    H --> P
    P --> R
```

[现有 IPC](../../apps/desktop/src/main/ipc.ts)、[会话 IPC](../../apps/desktop/src/main/session-state-ipc.ts) 和 [安全约束](../../apps/desktop/src/main/security.ts) 提供 sender/window/origin 验证模式。后续运行 API 复用它，绑定具体窗口、项目与运行实例；跨窗口、过期修订及已销毁 sender 都须拒绝。preload 发布固定方法和事件投影，禁止任意 channel、任意路径、原始 SDK 对象或 Node 对象透传。[Electron security][electron-security]

### 3.1 接口草案（只描述宿主 seam）

以下是 **main 私有的概念接口**，不是已加入 shared contracts 的 TypeScript 定义，也不是 Pi 的真实 API。`AuthorizedLaunchContext`、`PioneerRuntimeEvent`、`RunOutcome` 的最终 schema 由 #11/#12 定稿后定义；这里不预设事件枚举或停止终态。

```ts
interface HarnessAdapter {
  start(context: AuthorizedLaunchContext): Promise<RunHandle>;
}

interface RunHandle {
  readonly runId: string;
  subscribe(listener: (event: PioneerRuntimeEvent) => void): () => void;
  requestStop(): void;
  readonly settled: Promise<RunOutcome>;
  dispose(): Promise<void>;
}
```

`AuthorizedLaunchContext` 由 main 验证和生成，至少绑定：RuntimeSession 的意图快照、项目根目录的受控引用、唯一 runId、可用工具策略、当前模型授权引用、上下文/输出预算，以及事件接收方。它不能由 renderer 直接作为「已授权」对象上传；密钥与 SDK 类型只驻留 main。

renderer 的动作只提交会话/项目标识和预期意图修订；在目前批准快照只存在 renderer 的情况下，还需建立 main 端的意图确认记录与修订绑定，再允许 launch。main 校验项目来自自身项目目录册、规范化并核对 ready 快照、确认用户本次批准的模型/外发范围。将 renderer 的 `status: ready` 改成 true 或重放旧批准都不能授予执行权限。意图确认与模型/数据外发授权分别记录。

调用与资源生命周期建议：

1. **准备**：建立事件缓冲与窗口绑定，解析批准的意图修订和项目引用；未获执行/外发授权时停止。准备过程不能自动探测模型、发网络请求或加载工作区配置。
2. **构造**：仅在 main 创建独立 `Models`、选定 Provider 和 `Agent`；显式传入 `streamFn`、精简消息和自定义工具列表，工具默认空集合。不调用进程级 `setDefaultStreamFn`，不重写用户原始意图。
3. **执行**：main 在启动前接上 SDK 订阅，投影并暂存有界事件，再调用 `Agent.prompt()`，防止 renderer 尚未订阅时丢失起始事件。窗口订阅通过 runId 过滤；SDK 原始消息、错误、headers、工具参数均不能直接发往 renderer。#12 决定序号、重连与背压规则。
4. **停止**：`Agent.abort()` 只发出取消；需等 `waitForIdle()` 和已启动工具实际结束，才有依据投影终态。`agent_end` 监听器也参与 idle 的收敛。不能因计时器到期、单次事件或 prompt Promise resolve 就报告成功；模型错误还需检查流中的 error/aborted 协议。[agent] · [agent-types]
5. **释放**：窗口关闭/崩溃、任务结束或启动失败都撤销订阅，停止活动执行并等待收敛；之后清除注册表和内存凭证引用。超时保留未确认语义，不能遗忘仍活动的任务；最终规则由 #12 规定。P2 重启仅恢复会话材料，不自动重放上次执行。

### 3.2 工具边界与事件归属

Pi 的 `AgentTool`、工具回调中的 signal、工具前后钩子供 main 适配；工具执行前后和模型流的错误必须转成 Pioneer 的脱敏结果。`beforeToolCall` 可作为附加拒绝点，不能替代底层文件访问检查。[agent-types]

Pioneer 的只读工具实现负责授权根目录、规范路径、symlink/junction、拒绝越界、文件大小/输出预算和敏感文件过滤。工作目录参数、Pi 的 read-only 工具名称或模型提示词都不是文件系统沙箱；不直接将上游内建 read/grep/ls 当作已经符合 Pioneer 规则的工具。白名单、路径竞态和错误协议交 #11；事件归一与取消确认交 #12。

## 4. 配置、凭证和数据外发

以下是后续适配器必须满足的设计要求，尚非当前运行能力。

| 入口或数据       | 主进程策略                                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用户全局 Pi 配置 | 不读写 `~/.pi/agent` 的 auth/models/settings/session，不全局安装 CLI，不改 `PI_*` 环境或用户已有模型选择。                                                                                                  |
| 凭证来源         | 只接受用户明确提供给 Pioneer 的本次授权；不探测 `.env`、工作区凭证、shell profile、云端 ADC/AWS 配置或其他应用凭证。                                                                                        |
| pi-ai 认证       | 显式注入独立内存 `CredentialStore`、`ModelsStore` 与受限 `AuthContext`；其 `env` 不回退整个 `process.env`，`fileExists` 不探测任意文件。未授权时返回缺失并拒绝运行。                                        |
| Provider 和模型  | 只注册批准的 Provider，固定 endpoint 与 model；不自动回退、发现模型或调用默认允许网络的 `Models.refresh()`。禁止未经审阅的自定义 URL/headers、OAuth 登录或动态配置。                                        |
| 网络             | 工具无 shell、写入或网络能力；模型传输是独立权限。首次真实调用前须明确 endpoint、模型及可发送材料。默认本地材料不外发；如未另获允许，只能做离线受控验证。重定向、重试和辅助请求也受 endpoint 边界约束。     |
| 上下文           | 工具结果会在后续模型轮次进入上下文，必须同时经过数据范围检查；只读不等于可外发。禁止自动扫描/上传整库、环境变量、全局 AGENTS/Skills、个人资料或凭证文件。                                                   |
| SDK 参数         | `pi-ai` 默认 AuthContext 可访问环境/文件；内存存储不解除这个风险。明确配置模型传输，不依赖环境猜测。                                                                                                        |
| 日志与持久化     | [会话存储](../../apps/desktop/src/main/session-state-store.ts) 不保存 API Key、认证 headers、SDK 实例或完整原始 Provider 响应。安全错误码加摘要取代原始异常；调试日志同样脱敏，输出文本仍按不可信内容处理。 |
| 遥测             | 不配置外部 exporter，不将 payload/headers 记录到诊断钩子。已审阅的 `pi-ai` 请求观察器默认使用 NOOP telemetry/metrics；此观察结果不代表所有传递依赖或未来 Provider 都已通过外发审计。[telemetry]             |
| 生命周期         | 凭证只在 main 内存存活，不通过 IPC 回传；执行收敛后删除引用。JavaScript 字符串不能保证可靠物理清零，因此不得承诺「已彻底擦除」。                                                                            |

`createModels({ credentials, modelsStore, authContext })` 是此版本可注入的入口；之后显式注册已批准的 Provider，并用其 `models.streamSimple` 作为 Agent 的传输。`InMemoryCredentialStore` 支持按 providerId 的 read/modify/delete，不使用全局文件后端。[models] · [credential-store] · [auth-context]

传输须保留 `Models` 实例绑定，例如 `streamFn: (model, context, options) => models.streamSimple(model, context, options)`，不能将依赖 `this` 的方法裸传。这里的 `models` 只持有当前批准的 Provider/凭证；缺少凭证时拒绝，不退回全局默认流。

## 5. 后续可执行验证与票据交接

本票不扩大已有测试 seam。研究产物以来源核验、仓库规范化和现有全量回归检查；接口仍是草案，没有为概念接口编写形式测试。

| 后续票据                                                 | 输入                                                       | 应验证的可观察行为                                                                                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#11](https://github.com/OasisViridis/Pioneer/issues/11) | 本文的自定义工具边界和外发区分                             | 具体白名单；`..`、绝对路径、symlink/junction、敏感文件拒绝；读取与输出预算；拒绝前后无写入。需人类决策后形成契约。                                       |
| [#12](https://github.com/OasisViridis/Pioneer/issues/12) | main 私有 run 注册表、`RunHandle` 草案、Pi abort/idle 差别 | 启动失败、早到事件、陈旧修订、跨 sender 访问、重复启动、迟到事件、取消与完成竞态、关闭/崩溃/重连；具体事件 schema 和停止确认语义。                       |
| [#13](https://github.com/OasisViridis/Pioneer/issues/13) | 定稿契约、候选依赖 `1.4.0` 和打包风险清单                  | 受控传输与 TestHarnessAdapter 的 Contract Tests；Forge 成品 import/构造/释放；真实 Electron IPC 展示与停止；fixture 哈希不变、全局配置不变、无凭证泄漏。 |
| 后续真实 Provider 验证                                   | 人类批准的 endpoint、模型与具体外发材料                    | 单独记录真实来源、停止、usage 和错误；不得用受控传输成功代替真实 Provider 验证。                                                                         |

研究结论可供 #12 使用；#12 仍需 #11 的路径/权限决策。本次不关闭 Issue、不写回地图、不改变 ready-for-human 票据状态。

### 5.1 本次检查记录

研究和检查针对起始 `HEAD` 为 `10bd3b0c93836288237488c13af71103b87e21df` 的继承工作副本，其中 P1 的部分实现与资料尚未提交。文中相对路径指向该工作副本；本次仅提交研究稿与证据快照，不收纳这些继承文件。测试结果不能当作干净 `HEAD`、Pi 接入或真实 Provider 的证明。

- `pnpm typecheck`：通过。
- `pnpm exec vitest run --config vitest.config.ts tests/contract/runtime-session.test.ts`：6/6 通过。
- `pnpm verify:repository`：6/6 通过。
- `pnpm check`：正常 Windows 宿主复跑退出码 0，含 200 项 Contract Tests、Prototype Tests: 210/210 passed、21 项 Real Electron E2E 及最终 package smoke。原始宿主日志保留于本地 `tmp/issue10/full-check-host.log`。初次沙箱运行因临时文件 ENOENT/rename EPERM 失败，原始日志为 `tmp/issue10/full-check.log`；两个结果分别保留。
- 本次无 Pi 导入/打包测试、真实 Provider 调用或人工产品验收。

## 一手来源

下列 registry 链接固定包版本；Pi 源码固定提交，便于后续实现逐项复核。

[npm-ai]: https://registry.npmjs.org/@earendil-works/pi-ai/1.4.0
[npm-agent]: https://registry.npmjs.org/@earendil-works/pi-agent-core/1.4.0
[npm-coding]: https://registry.npmjs.org/@earendil-works/pi-coding-agent/1.4.0
[npm-old-ai]: https://registry.npmjs.org/@mariozechner/pi-ai/0.73.1
[npm-old-agent]: https://registry.npmjs.org/@mariozechner/pi-agent-core/0.73.1
[npm-old-coding]: https://registry.npmjs.org/@mariozechner/pi-coding-agent/0.73.1
[tag]: https://api.github.com/repos/earendil-works/pi/git/ref/tags/v1.4.0
[agent]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/agent/src/agent.ts
[agent-types]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/agent/src/types.ts
[models]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/ai/src/models.ts
[ai-index]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/ai/src/index.ts
[auth-context]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/ai/src/auth/context.ts
[credential-store]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/ai/src/auth/credential-store.ts
[sdk]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/sdk.ts
[auth-storage]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/coding-agent/src/core/auth-storage.ts
[telemetry]: https://github.com/earendil-works/pi/blob/4a080252f06caf63a525d7873c5d94d3c23887e0/packages/ai/src/telemetry.ts
[electron-esm]: https://www.electronjs.org/docs/latest/tutorial/esm
[forge-webpack]: https://www.electronforge.io/config/plugins/webpack
[electron-security]: https://www.electronjs.org/docs/latest/tutorial/security
