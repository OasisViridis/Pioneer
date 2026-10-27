# Issue #13 打包成品运行记录

evidenceKind = **packaged-real-provider**。本记录补齐 [Issue #13](https://github.com/OasisViridis/Pioneer/issues/13) 完成标准中的「安装包运行记录」，即从 `electron-forge package` 成品在源码树之外完成一次真实 Provider 问答、查看只读工具结果并中途停止。开发入口记录见 [A09 真实 Provider 记录](issue13-real-provider.md)，整体验收矩阵见 [Issue #13 验证记录](issue13-verification.md)。

## 1. 身份与版本绑定

| 字段 | 值 |
| --- | --- |
| 软件 commit | `c12a20a03f7debe3060b7f8993cae0ebd85e1212`（`main` 合并 PR #50 后的提交） |
| dirty 状态 | 受跟踪文件干净；仅本地忽略目录（`tmp/`、`out/`、`.webpack/` 等）存在 |
| 运行入口 | `electron-forge package` 成品目录 `apps/desktop/out/@pioneer-desktop-win32-x64`，整体复制到 `%TEMP%\pioneer-issue13-package` 后从副本启动 |
| 渲染进程入口 | `...\Temp\pioneer-issue13-package\resources\app.asar\.webpack\renderer\main_window\index.html`（asar 内，未从源码目录加载） |
| `app.asar` SHA-256 | `5550f60af664c8d627cc780318316a85efc4d52ddbb11448fb322b4102bfe097`（33,884,214 字节） |
| 可执行文件 | `%TEMP%\pioneer-issue13-package\@pioneer-desktop.exe`（246,202,368 字节） |
| 平台 | Windows 11 x64（10.0.26200） |
| Node / pnpm / Electron / Pi | 终端 Node 24.17.0；pnpm 11.7.0；Electron 44.2.0（应用内嵌 Node 24.20.0）；`@earendil-works/pi-ai` 与 `pi-agent-core` 精确 1.4.0 |
| 驱动方式 | 启动参数 `--user-data-dir=<隔离目录> --remote-debugging-port=9333`；Playwright `chromium.connectOverCDP` 驱动真实渲染进程。不使用 `_electron.launch`，因为打包 fuse 关闭了 `--inspect` |

## 2. 授权与 Provider

- 授权沿用 2026-10-25 的 A09 授权：DeepSeek 官方端点、`deepseek-flash`、fixture 工作区材料。授权原文与首轮 NOT_RUN 诊断见 [A09 记录](issue13-real-provider.md)。
- Provider / endpoint origin：DeepSeek，`https://api.deepseek.com`（HTTPS）。
- 模型：`deepseek-flash`。用户口径的 "v41f" 解析记录沿用 A09 文档（官方目录无 `deepseek-v4.1-flash`）。
- 凭证：运行时从用户 ZCode provider 配置读取（尾号 `****2a2d`），只注入子进程环境变量 `DEEPSEEK_API_KEY`，不写入记录、不落盘、不入库。
- 外发材料：两段任务文本 + fixture 工作区 `alpha-app` 的 `README.md` 正文与根目录／`nested/` 目录名。无其它材料外发。

## 3. 运行设置与自动化边界

- `userData` 使用仓库内忽略目录 `tmp/issue13/packaged/user-data`，与用户全局配置隔离；`runs/journal.jsonl` 与 `pioneer-session-state.json` 都产生在该目录。
- 工作区使用 fixture 的临时副本 `tmp/issue13/packaged/workspace`，运行前后各做一次 SHA-256 清单哈希。
- 原生目录选择器未在打包成品中自动化：本次以预置 `pioneer-settings.json` 的 `rootPath` 让应用加载工作区。原生选择器的人工验收属 [M2 记录](m2-native-picker-smoke.md)，本记录不冒充该项。
- `PIONEER_E2E` 隔离缝按 `runtime-config.ts` 设计只在非打包构建生效，本次未使用受控适配器，两轮运行都由 `pi` 适配器执行（journal 中 `"adapter":"pi"`）。

## 4. 运行 1：completed，含真实只读工具结果

| 字段 | 值 |
| --- | --- |
| sessionId | `session:c3248474-9e23-445d-8298-38637ecd70e1` |
| runId | `run:179043676d54d75354a7696add488c70` |
| 任务 | 读取 `alpha-app` 项目里 `README.md` 的内容，先用 `read_file` 工具查看原文，再用一到两句话说明这个项目是什么 |
| journal accept | 2026-10-27T04:20:57.101Z |
| 工具请求 / 结果 | 2026-10-27T04:20:58.024Z / 2026-10-27T04:20:59.874Z |
| journal terminal | 2026-10-27T04:21:00.735Z，`completed`，`lastSeq` 15 |
| 工具调用（4 次，模型自行发起） | ① `read_file alpha-app/README.md` → 拒绝 `PATH_UNAVAILABLE`（项目根即 `alpha-app`，路径重复，预检未泄露绝对路径）；② `list_directory .` → `nested/`、`package.json`、`README.md`；③ `list_directory nested` → `not-a-project.txt`；④ `read_file README.md` → 成功返回 `# Alpha app` / `An alpha application fixture.` |
| 最终回答 | 模型先说明 `alpha-app/README.md` 不可用、项目根目录就是 `alpha-app`，再引用 README 原文，判断该项目是名为 Alpha app 的演示 fixture（回答中夹了一句英文过渡语，其余为中文） |
| 界面状态 | `.run-status` 显示「已完成」；工具结果与模型文本均出现在运行日志中 |

## 5. 运行 2：stopped，运行中途停止

| 字段 | 值 |
| --- | --- |
| sessionId | `session:6b80c690-607a-42ad-a47f-bf2875018143`（另一个会话，任务与结果各归各自会话） |
| runId | `run:571821cc4726c880da2825e439d81de5` |
| 任务 | 请用中文写一份约 800 字的报告，分析只读工作区里 `package.json` 与 `README.md` 的职责、差异和维护建议 |
| journal accept | 2026-10-27T04:21:01.393Z |
| 停止请求 | 2026-10-27T04:21:01.427Z（点击「停止」，落在首轮模型请求进行中） |
| journal terminal | 2026-10-27T04:21:01.424Z，`stopped`，`lastSeq` 4；按钮点击返回前主进程已收敛 |
| 界面状态 | `.run-status` 显示「已停止」；日志为「已受理 / 开始运行 / 停止请求（user）/ 已停止」 |

## 6. 不变量与持久化

| 检查项 | 结果 |
| --- | --- |
| fixture 副本前后哈希 | `1bceca9874f89bcc8986cc808144623257f6bedb114adb11c1f63767089246c5`（前后一致） |
| 会话状态持久化 | `pioneer-session-state.json` 版本 5，含 2 个会话，`openSessionIds` 2 项，`activeTabId` 指向第二个会话 |
| 运行日志 | `runs/journal.jsonl` 4 行：2 条 accept + 2 条 terminal；两条 accept 分属两个 session，`adapter` 均为 `pi`；terminal 分别为 `completed` 与 `stopped` |
| 凭证与路径 | 应用日志（`app.log`）只有一条 DevTools 监听地址；截图、报告与日志中没有 `sk-` 凭证，工具拒绝只返回固定错误码 |
| 源码树依赖 | 可执行文件、`app.asar`、渲染入口全部位于 `%TEMP%\pioneer-issue13-package`，渲染进程从该副本的 `app.asar` 加载；仓库内 `apps/desktop/out` 只作为复制源，运行不依赖仓库 `.webpack` 或源码目录 |

## 7. 证据文件（本地，不入库）

| 文件 | 内容 |
| --- | --- |
| `tmp/issue13/packaged/report.json` | 完整时间线、CDP 版本、面板转录、journal、会话状态、前后哈希 |
| `tmp/issue13/packaged/run1-complete.png` | 运行 1「已完成」与工具结果、模型回答 |
| `tmp/issue13/packaged/run2-stopped.png` | 运行 2「已停止」 |
| `tmp/issue13/packaged/journal.jsonl` | 两轮运行的 accept/terminal 记录 |
| `tmp/issue13/packaged/session-state.json` | 两个会话的持久化状态 |
| `tmp/issue13/a02-packaged-probe.json` | 同一成品上的 Pi 无凭证 import/构造/释放探针：`{"ok":true,"stage":"release","piAiVersion":"1.4.0"}` |
| 驱动脚本 `tmp/issue13/packaged-run.mjs` | 一次性证据脚本，非仓库测试资产 |

## 8. 限制

- 仓库当前只配置 `electron-forge package`（解包成品），没有 `make`／安装器目标；本记录的「安装包」指该成品目录，不声称已产出安装程序（NSIS/Squirrel 等）。
- 本轮两轮运行只覆盖 `read_file` 与 `list_directory`；`search_in_files` 已在 Contract 与 E2E 覆盖，未在打包成品的真实 Provider 运行中出现。
- `input/output tokens` 仍按合同记 null：Pi 适配器不读取 usage，本轮未填零。
- 原生目录选择器、窗口关闭协调与崩溃恢复不在本次打包成品记录内：前两项分别由 M2 人工记录与 E2E 覆盖，崩溃墓碑由 Contract 覆盖。
