# Issue #13 打包成品运行记录

evidenceKind = **real-provider**（合同 §6 固定字段）。本次是它的打包成品补充运行，`tmp/issue13/packaged/report.json` 的 `kind` 字段记为 `packaged-build-real-provider`。本记录提供 [Issue #13](https://github.com/OasisViridis/Pioneer/issues/13) 完成标准中「安装包运行记录」所需的打包成品真实运行证据：从 `electron-forge package` 目录成品完成一次真实 Provider 问答、查看只读工具结果并中途停止。成品副本位于源码树之外；驱动脚本的工作区与 `userData` 位于仓库 `tmp/`，是测试输入与输出，不参与应用加载。仓库没有安装器目标，本记录的「安装包」指该目录成品，不声称已产出安装程序。开发入口记录见 [A09 真实 Provider 记录](issue13-real-provider.md)，整体验收矩阵见 [Issue #13 验证记录](issue13-verification.md)。

## 1. 身份与版本绑定

| 字段 | 值 |
| --- | --- |
| 软件 commit | `c12a20a03f7debe3060b7f8993cae0ebd85e1212`（`main` 合并 PR #50 后的提交） |
| 版本核对 | 构建所用 worktree 的 HEAD 为 `c12a20a`（`origin/main`）；驱动脚本把该值写入报告 `commit` 字段，未保存 `git status` 产物 |
| 运行入口 | `electron-forge package` 成品目录 `apps/desktop/out/@pioneer-desktop-win32-x64`，整体复制到 `%TEMP%\pioneer-issue13-package` 后从副本启动 |
| 渲染进程入口 | `...\Temp\pioneer-issue13-package\resources\app.asar\.webpack\renderer\main_window\index.html`（asar 内，未从源码目录加载） |
| `app.asar` SHA-256 | `5550f60af664c8d627cc780318316a85efc4d52ddbb11448fb322b4102bfe097`（33,884,214 字节） |
| 可执行文件 | `%TEMP%\pioneer-issue13-package\@pioneer-desktop.exe`（246,202,368 字节） |
| 平台 | Windows 11 x64（10.0.26200） |
| Node / pnpm / Electron / Pi | 终端 Node 24.17.0；pnpm 11.7.0；Electron 44.2.0（应用内嵌 Node 24.20.0）；`@earendil-works/pi-ai` 1.4.0（探针报告）；`pi-agent-core` 由锁文件固定 1.4.0，探针 `piAgentCoreVersion` 为 null，不单独证明版本 |
| 驱动方式 | 启动参数 `--user-data-dir=<隔离目录> --remote-debugging-port=9333`；Playwright `chromium.connectOverCDP` 驱动真实渲染进程。不使用 `_electron.launch`，因为打包 fuse 关闭了 `--inspect` |

## 2. 授权与 Provider

- 授权：2026-10-27 复用 2026-10-25 的 A09 授权（DeepSeek 官方端点、`deepseek-flash`、fixture 工作区材料），未另生成范围摘要 hash。授权原文与首轮 NOT_RUN 诊断见 [A09 记录](issue13-real-provider.md)。
- Provider / endpoint origin：DeepSeek，`https://api.deepseek.com`（HTTPS）。
- 模型：`deepseek-flash`。用户口径的 "v41f" 解析记录沿用 A09 文档（官方目录无 `deepseek-v4.1-flash`）。
- 凭证：运行时从用户 ZCode provider 配置读取（尾号 `****2a2d`），只注入子进程环境变量 `DEEPSEEK_API_KEY`，不写入记录、不落盘、不入库。
- 外发材料清单（Egress Manifest）：两段任务文本、fixture 工作区 `alpha-app` 的 `README.md` 正文，以及根目录与 `nested/` 的目录项名称（`nested/`、`package.json`、`README.md`、`not-a-project.txt`）。模型请求另含固定的只读系统提示与三条工具 schema；未附加其它 fixture 文件内容。该清单与 A09 记录的授权范围一致。

## 3. 运行设置与自动化边界

- `userData` 使用仓库内忽略目录 `tmp/issue13/packaged/user-data`，与用户全局 `userData` 分离；`runs/journal.jsonl` 与 `pioneer-session-state.json` 都在该目录下。凭证只注入子进程环境，不复制进该目录。
- 工作区使用 fixture 的临时副本 `tmp/issue13/packaged/workspace`，运行前后各做一次 SHA-256 清单哈希。
- 原生目录选择器未在打包成品中自动化：本次以预置 `pioneer-settings.json` 的 `rootPath` 让应用加载工作区。原生选择器的人工验收属 [M2 记录](m2-native-picker-smoke.md)，本记录不冒充该项。
- `PIONEER_E2E` 隔离缝按 `runtime-config.ts` 设计只在非打包构建生效，本次未使用受控适配器，两轮运行都由 `pi` 适配器执行（journal 中 `"adapter":"pi"`）。
- 真实模型准入还需要启动环境：`PIONEER_PI_PROVIDER_ID=deepseek`、`PIONEER_PI_MODEL_ID=deepseek-flash`、`PIONEER_PI_ENDPOINT=https://api.deepseek.com`、`PIONEER_PI_API_KEY_ENV=DEEPSEEK_API_KEY` 与 `DEEPSEEK_API_KEY`；缺任一配置时运行层拒绝准入，不会自动改用其他 Provider。
- 工作区与 `userData` 是驱动脚本在仓库 `tmp/issue13/packaged/` 下准备的测试输入与输出；应用入口、`app.asar` 与渲染资源来自 `%TEMP%` 副本，不读取仓库 `.webpack` 或源码目录。

## 4. 运行 1：completed，含真实只读工具结果

| 字段 | 值 |
| --- | --- |
| sessionId | `session:c3248474-9e23-445d-8298-38637ecd70e1` |
| runId | `run:179043676d54d75354a7696add488c70` |
| revision | 1 |
| 任务原文 | 「读取 alpha-app 项目里 README.md 的内容，先用 read_file 工具查看原文，再用一到两句话告诉我这个项目是什么。」 |
| journal accept | 2026-10-27T04:20:57.101Z |
| 工具请求 / 结果（界面可见时间） | 2026-10-27T04:20:58.024Z / 2026-10-27T04:20:59.874Z；这是驱动脚本观察到界面出现该行的时间，不是工具执行耗时 |
| journal terminal | 2026-10-27T04:21:00.735Z，`completed`，`lastSeq` 15 |
| 工具调用（4 次，模型自行发起） | 工具名与结果来自运行日志；`read_file` 的路径由模型回答自述。① `read_file` → 拒绝 `PATH_UNAVAILABLE`（模型说明尝试的是 `alpha-app/README.md`；项目根即 `alpha-app`，该相对路径多了一层目录）；② `list_directory` → `nested/`、`package.json`、`README.md`；③ `list_directory` → `not-a-project.txt`；④ `read_file` → 成功返回 `# Alpha app` / `An alpha application fixture.` |
| 最终回答 | 模型说明 `alpha-app/README.md` 不在项目中、根目录下没有名为 `alpha-app` 的文件夹，随后读取根目录 `README.md` 并引用原文，判断该项目是名为 Alpha app 的演示 fixture（回答中夹了一句英文过渡语，其余为中文） |
| 界面状态 | `.run-status` 显示「已完成」；工具结果与模型文本均出现在运行日志中 |

## 5. 运行 2：stopped，运行中途停止

| 字段 | 值 |
| --- | --- |
| sessionId | `session:6b80c690-607a-42ad-a47f-bf2875018143`（另一个会话；accept 带 `sessionId`，terminal 只有 `runId`，两者按 `runId` 配对） |
| runId | `run:571821cc4726c880da2825e439d81de5` |
| revision | 1 |
| 任务原文 | 「请用中文写一份约 800 字的报告，逐段分析一个只读工作区中 package.json 与 README.md 各自承担的职责、内容差异和维护建议。」 |
| journal accept | 2026-10-27T04:21:01.393Z |
| 停止按钮点击返回 | 2026-10-27T04:21:01.427Z；点击前没有工具请求或模型文本 |
| journal terminal | 2026-10-27T04:21:01.424Z，`stopped`，`lastSeq` 4；主进程收敛早于按钮点击返回 |
| 界面状态 | `.run-status` 显示「已停止」；日志为「已受理 / 开始运行 / 停止请求（user）/ 已停止」 |

## 6. 不变量与持久化

| 检查项 | 结果 |
| --- | --- |
| fixture 副本前后哈希 | `1bceca9874f89bcc8986cc808144623257f6bedb114adb11c1f63767089246c5`（前后一致） |
| 会话状态持久化 | `pioneer-session-state.json` 版本 5，含 2 个会话，`openSessionIds` 2 项，`activeTabId` 指向第二个会话；两个会话的 `messages` 均为空（本轮未点「保存到会话」） |
| 运行日志 | `runs/journal.jsonl` 4 行：2 条 accept + 2 条 terminal；accept 带 `sessionId`、`taskDigest`、`adapter`、`revision`、`at`，terminal 带 `status`、`code`、`lastSeq`、`at`；accept 与 terminal 按 `runId` 配对，均不含任务原文与回答正文 |
| 凭证与路径 | 应用日志（`app.log`）只有一条 DevTools 监听地址；截图、报告与日志中没有 `sk-` 凭证，工具拒绝只返回固定错误码 |
| 源码树依赖 | 可执行文件、`app.asar`、渲染入口全部位于 `%TEMP%\pioneer-issue13-package`，渲染进程从该副本的 `app.asar` 加载；运行读取 `tmp/issue13/packaged/workspace` 并写入 `tmp/issue13/packaged/user-data`，不依赖仓库 `.webpack` 或源码目录 |

## 7. 证据文件（本地，不入库）

| 文件 | 内容 |
| --- | --- |
| `tmp/issue13/packaged/report.json` | 完整时间线、CDP 版本、面板转录、journal、会话状态、前后哈希 |
| `tmp/issue13/packaged/run1-complete.png` | 运行 1「已完成」与模型回答（日志已滚到底部，工具结果在 `report.json` 的 `panelText` 与 `tmp/issue13/packaged/run1-panel.txt` 中） |
| `tmp/issue13/packaged/run2-stopped.png` | 运行 2「已停止」 |
| `tmp/issue13/packaged/user-data/runs/journal.jsonl` | 两轮运行的 accept/terminal 记录 |
| `tmp/issue13/packaged/user-data/pioneer-session-state.json` | 两个会话的持久化状态 |
| `tmp/issue13/a02-packaged-probe.json` | 同一成品副本上的 Pi 无凭证 import/构造/释放探针：`{"ok":true,"stage":"release","piAiVersion":"1.4.0","piAgentCoreVersion":null,"nodeVersion":"v24.20.0","error":null}` |
| `tmp/issue13/a02-packaged-probe-context.json` | 探针对象：可执行文件路径、`app.asar` 路径、SHA-256 `5550f6…e097`、字节数与探针时间 |
| 驱动脚本 `tmp/issue13/packaged-run.mjs` | 一次性证据脚本，非仓库测试资产 |

## 8. 限制

- 仓库当前只配置 `electron-forge package`（解包成品），没有 `make`／安装器目标；本记录的「安装包」指该成品目录，不声称已产出安装程序（NSIS/Squirrel 等）。
- 本轮两轮运行只覆盖 `read_file` 与 `list_directory`；`search_in_files` 由 Contract 覆盖，E2E 与本次真实运行都未出现该工具。
- `input/output tokens`：报告与 journal 没有 usage 字段；Pi 适配器不读取 usage，按合同记 null，未填零。
- 合同 §6 的停止请求时间没有主进程侧采样：第 5 节记录的是脚本点击返回时间，且晚于 journal terminal，不能当作请求时刻。
- 第 1 项按运行层解释：journal 以 `runId` 保存两个会话的 accept/terminal，`pioneer-session-state.json` 保存两个空会话；任务原文与回答正文不持久化。若要求正文持久化，本记录不满足。
- 打包成品 run 2 停止发生得很快，未观察到「正在停止」过渡；等待收敛的顺序由 E2E `p2-run` 的受控等待用例覆盖，本记录不声称观察到该过渡。
- 原生目录选择器、窗口关闭协调与崩溃恢复不在本次打包成品记录内：前两项分别由 M2 人工记录与 E2E 覆盖，崩溃墓碑由 Contract 覆盖。
- A02 探针只证明 Pi 包可在该 asar 内 import/构造/释放，不证明真实 Provider 调用；真实调用证据是第 4、5 节的 journal 与界面记录。
