# Issue #53 验证记录：打包成品完成一次只读运行

核对日期：2026-11-02。来源：[Issue #53](https://github.com/OasisViridis/Pioneer/issues/53)。基线 `main` `28e6882`（合并 PR #61 后），分支 `feat/p3-packaged-acceptance`，验证代码提交 `bb2d380`。机读摘要见 [issue53-acceptance.json](issue53-acceptance.json)。本机环境：Windows，Node 24.17.0，pnpm 11.7.0，Electron 44.2.0，electron-forge 7.11.2，Playwright 1.62.1。

## 结论

`pnpm acceptance:packaged` 一次跑通：清空上一轮证据与打包产物并写本次运行标记 → 重新打包 → 启动 `@pioneer-desktop.exe` → 读到 fixture 工作区 → 外发材料自动勾选 → 写任务 → 启动运行 → `已完成` → 校验 journal、runlog 面板与 fixture 哈希。退出码 0，测试本体 3.2 秒，打包另计。

## 为什么不用 Playwright `_electron.launch`

2026-10-27 两次用 `_electron.launch` 驱动打包成品都停在 `firstWindow`（60 秒超时）。本分支上重测：对 `apps/desktop/out/@pioneer-desktop-win32-x64/@pioneer-desktop.exe` 调用 `electron.launch({ executablePath, timeout: 20000 })`，20.6 秒后以 `TimeoutError: Timeout 20000ms exceeded` 拒绝，拿不到窗口句柄。

根因在 fuses：`apps/desktop/forge.config.ts` 设了 `EnableNodeCliInspectArguments: false`。Playwright 1.62 启动 Electron 时固定拼 `--inspect=0 --remote-debugging-port=0`（见 `node_modules/playwright-core/lib/coreBundle.js` 第 43975 行），主进程 inspector 被 fuse 关掉后就连不上，窗口对象自然拿不到。只放开 env seam 不解决这一层。

现在的做法：命令行传 `--remote-debugging-port=0`，从验收 userData 目录的 `DevToolsActivePort` 读端口，用 `chromium.connectOverCDP` 驱动真实 renderer。终态以主进程启动报告与 journal 为准；renderer 只回答「人看到什么」——运行状态、runlog 面板、工具结果文本。没有为兼容测试重新打开任何 fuse。

## 入口形态（issue 待办 1 的结论）

采用 issue 三选一里的 ③ 形态，并补一个启动探测文件：

1. 打包 + `PIONEER_ACCEPTANCE=1` 双重开关。开发构建即使设了开关也不生效，`resolvePackagedAcceptanceConfig` 先判 `isPackaged`。
2. 五个变量缺一不可，全部要求绝对路径并按最近存在的祖先做 `realpath` 规范化：`PIONEER_ACCEPTANCE_WORKSPACE`、`PIONEER_ACCEPTANCE_USER_DATA`、`PIONEER_ACCEPTANCE_EVIDENCE`、`PIONEER_ACCEPTANCE_REPORT`、`PIONEER_ACCEPTANCE_RUN_SCRIPT`。开关一旦打开，缺项直接抛错，不会退回真实 profile。
3. 工作区、userData 与证据目录三者互不包含；报告与运行脚本必须落在证据目录内，且两者不得是同一个文件。已存在的报告/脚本叶子必须是普通文件，符号链接一律拒绝，避免借链接把写入引到别处；Windows 下路径比较按大小写不敏感处理。
4. 验收 userData 与证据目录都不得是、包含或位于应用自己的 profile 目录；路径都按最近存在的祖先做 canonical 化，junction 或别名写法不能绕过。
5. 没有显式脚本就拒绝：受控适配器的默认脚本不读任何文件，会造出「已完成但没读过文件」的假通过。
6. 启动报告记录 `isPackaged`、Electron/Node 版本、工作区根、项目清单、适配器、`executablePath` 与全部 IPC 通道名（18 条）。报告经唯一临时名 + 独占创建 + rename 原子写入；`executablePath` 与被测 exe 做 realpath 比对，`channels` 来自单一 `acceptanceChannels()`。
7. 每次运行先删掉 `apps/desktop/out` 与上一轮证据，再写 `tmp/issue53-acceptance/run.json`（startedAt + commit/dirty）；spec 既要求 exe 存在，也拒绝比该时间戳更旧的文件，旧成品不能冒充本轮证据。
8. 顺带修掉一个门禁缺口：打包成品此前只靠 `PIONEER_E2E=1` + `PIONEER_E2E_RUN_ADAPTER=controlled` 就能选到受控适配器（`run-host.ts` 旧判断不看 `isPackaged`）。`selectRunHostAdapter` 现在在打包构建里完全不读这两个变量，只认验收配置解析出的脚本路径。这是 issue 未点名的成品行为变化，PR 描述里单列。

没有采用 ① 的面板回执：启动报告不写「哪些面板可用」，五块面板由 spec 从 UI 直接断言（上下文、能力、运行日志、改动、产物）。这是对 ③ 的自愿加强，不算 ① 的实现；报告里保留 `channels` 只用于证明打包 asar 带的是当前通道表。

## 证据

| 项           | 位置 / 命令                                                      | 结果                                                                                                                                                                |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 一条命令     | `pnpm acceptance:packaged`                                       | 退出码 0；`1 passed (3.2s)` + 打包                                                                                                                                  |
| 启动报告     | `tmp/issue53-acceptance/latest/evidence/startup-report.json`     | `isPackaged: true`、`electronVersion: 44.2.0`、`workspaceRoot` 为 fixture 根、3 个项目、`adapterKind: controlled`、`executablePath` 与 out 目录 exe 相同、18 条通道 |
| 运行 journal | `tmp/issue53-acceptance/latest/evidence/journal.jsonl`           | `accept` 与 `terminal` 各一条且 `runId` 一致，`status: completed`，`adapter: controlled`，无 tombstone                                                              |
| runlog 面板  | `tmp/issue53-acceptance/latest/evidence/packaged-run-events.png` | 元素截图：`会话 · alpha-app`、journal 记录的那个 run id、`已完成`、`#4 工具请求：read_file`、`#5 工具结果：# Alpha app / An alpha application fixture.`             |
| 运行控制     | `tmp/issue53-acceptance/latest/evidence/packaged-run-status.png` | 整窗截图：runlog 头部 `修订 1 · 已完成`、run id、`#4 工具请求：read_file`，右侧会话面板可见；与 runlog 元素截图不是同一张图                                         |
| 应用日志     | `tmp/issue53-acceptance/latest/evidence/packaged-app.log`        | 约 0.1 KB，一行 `DevTools listening on ws://…`；日志流出错或为空会让本轮判失败                                                                                      |
| 打包代码     | `apps/desktop/out/@pioneer-desktop-win32-x64/resources/app.asar` | SHA-256 `d7a5d569…531c`，是打进成品的 app 代码；与 exe 哈希、run.json 的 commit 一起锚定这轮产物                                                                    |
| 真实读取内容 | `summary.json` 的 `run.readme`                                   | `tests/fixtures/workspaces/library/alpha-app/README.md`，43 字节，SHA-256 `28effecf…e010`；两行正文都出现在 runlog 里                                               |
| fixture 不变 | `summary.json` 的 `fixture`                                      | 前后哈希同为 `1bceca98…46c5`，`unchanged: true`                                                                                                                     |
| 聚合证据     | `tmp/issue53-acceptance/latest/summary.json`                     | `outcome: passed`、`cleanupErrors: []`、`log.errors: []`；`outcome` 在 fixture 哈希、清理与日志检查之后才定                                                         |
| 机读摘要     | [issue53-acceptance.json](issue53-acceptance.json)               | 提交进仓库的稳定事实：app.asar SHA-256 `d7a5d569…531c`、exe SHA-256 `1c0cb295…3c7e`、通道数、journal 计数、README 哈希、fixture 前后哈希、门禁计数                  |

每次运行的端口、进程号、runId、时间戳都不同，`summary.json` 记录当次值；上表只列稳定事实。

## 门禁

| 项           | 命令                     | 结果                                                                                                                                                              |
| ------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 仓库规范化   | `pnpm verify:repository` | 6/6                                                                                                                                                               |
| 完整门禁     | `pnpm check`             | 退出码 0（2026-11-02）：design:check（含 102 个 node 测试）、Contract 417/417、Prototype 210/210、Real E2E 39/39、package smoke；日志 `tmp/issue53-check-r10.log` |
| 新增合同测试 | `pnpm test:contract`     | `acceptance-config.test.ts` 17 条、`acceptance-report.test.ts` 2 条、`run-host-adapter-selection.test.ts` 4 条                                                    |

## 没做的事

1. 没有把打包验收接进 CI。issue 允许「CI 或本机一条命令」，当前门禁是本机一条命令；现有 `Pioneer Quality Gate` workflow 只跑 `pnpm check`。
2. 没有证明打包成品里的真实模型 Provider：仍用确定性受控适配器。真实 provider 证据见 [issue13 真实 Provider 记录](issue13-real-provider.md)。
3. 「读到指定文件」的证据是三条独立事实合起来的：runlog 里出现工具请求与工具结果、结果文本与磁盘上 README 的内容哈希一致、fixture 前后哈希不变；runlog 显示的 run id 与 journal 的 terminal 记录相同。journal 只记 accept/terminal，不记工具调用明细；要主进程独立记每次工具调用需要改运行层协议，本 issue 明确不做。
4. 应用进程在断言后以 `taskkill /PID <pid> /T /F` 结束，没有走窗口关闭或托盘退出路径。journal 在终态时已原子落盘；启动阶段（端口超时或 spawn 失败）也会杀掉子进程并关闭日志流。
5. 截图与原始日志留在 `tmp/`（gitignored），不提交二进制产物；稳定事实与门禁计数已写入本目录的机读 JSON。
