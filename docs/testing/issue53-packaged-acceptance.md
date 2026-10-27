# Issue #53 验证记录：打包成品完成一次只读运行

核对日期：2026-10-27。来源：[Issue #53](https://github.com/OasisViridis/Pioneer/issues/53)。基线 `main` `b93d8e9`（合并 PR #52 后），分支 `feat/p3-packaged-acceptance`。本机环境：Windows，Node 24.17.0，pnpm 11.7.0，Electron 44.2.0，electron-forge 7.11.2，Playwright 1.62.1。

## 结论

`pnpm acceptance:packaged` 在 2026-10-27 一次跑通：重新打包 → 启动 `@pioneer-desktop.exe` → 读到 fixture 工作区 → 外发材料自动勾选 → 写任务 → 启动运行 → `已完成` → 校验 journal 与 fixture 哈希。退出码 0，测试本体 3.4 秒，打包另计。

## 为什么不用 Playwright `_electron.launch`

2026-10-27 两次用 `_electron.launch` 驱动打包成品都停在 `firstWindow`（60 秒超时）。本分支上重测一次：对 `apps/desktop/out/@pioneer-desktop-win32-x64/@pioneer-desktop.exe` 调用 `electron.launch({ executablePath, timeout: 20000 })`，20.6 秒后以 `TimeoutError: Timeout 20000ms exceeded` 拒绝，拿不到窗口句柄。

根因在 fuses：`apps/desktop/forge.config.ts` 设了 `EnableNodeCliInspectArguments: false`。Playwright 1.62 启动 Electron 时固定拼 `--inspect=0 --remote-debugging-port=0`（见 `node_modules/playwright-core/lib/coreBundle.js` 第 43975 行），主进程 inspector 被 fuse 关掉后就连不上，窗口对象自然拿不到。只放开 env seam 不解决这一层。

现在的做法：命令行传 `--remote-debugging-port=0`，从验收 userData 目录的 `DevToolsActivePort` 读端口，用 `chromium.connectOverCDP` 驱动真实 renderer；主进程事实来自它自己写的启动报告与 journal，不采信 renderer 自述。没有为兼容测试重新打开任何 fuse。

## 入口形态（issue 待办 1 的结论）

采用 issue 三选一里的 ③ 形态，并补一个启动探测文件：

1. 打包 + `PIONEER_ACCEPTANCE=1` 双重开关。开发构建即使设了开关也不生效，`resolvePackagedAcceptanceConfig` 先判 `isPackaged`。
2. 四个变量缺一不可，全部要求绝对路径并做 `realpath` 规范化：`PIONEER_ACCEPTANCE_WORKSPACE`、`PIONEER_ACCEPTANCE_USER_DATA`、`PIONEER_ACCEPTANCE_REPORT`、`PIONEER_ACCEPTANCE_RUN_SCRIPT`。
3. 工作区与 userData 必须互不包含；报告与运行脚本必须落在工作区之外，避免改动 fixture。
4. 没有显式脚本就拒绝：受控适配器的默认脚本不读任何文件，会造出「已完成但没读过文件」的假通过。
5. 启动报告记录 `isPackaged`、Electron/Node 版本、工作区根、项目清单、适配器类型与 16 条固定 IPC 通道。面板名称是 renderer 状态，由 UI 断言覆盖（「模块」菜单里的 上下文/能力/改动/产物）。
6. 顺带修掉一个门禁缺口：打包成品此前只靠 `PIONEER_E2E=1` + `PIONEER_E2E_RUN_ADAPTER=controlled` 就能选到受控适配器（`run-host.ts` 旧判断不看 `isPackaged`）。`selectRunHostAdapter` 现在在打包构建里完全不读这两个变量，只认验收配置解析出的脚本路径。

## 证据

| 项 | 位置 / 命令 | 结果 |
| --- | --- | --- |
| 一条命令 | `pnpm acceptance:packaged` | 退出码 0；重新打包 + `1 passed (3.4s)` |
| 启动报告 | `tmp/issue53-acceptance/latest/reports/startup-report.json` | `isPackaged: true`、`electronVersion: 44.2.0`、`workspaceRoot` 为 fixture 根、3 个项目、`adapterKind: controlled`、16 条通道 |
| 运行 journal | `tmp/issue53-acceptance/latest/evidence/journal.jsonl` | `accept` 与 `terminal` 各一条且 `runId` 一致（`run:abd358db…6846`），`status: completed`，`adapter: controlled`，无 tombstone |
| 状态截图 | `tmp/issue53-acceptance/latest/evidence/packaged-run-status.png` | 「已完成」+ 任务框内容 |
| 工具交换截图 | `tmp/issue53-acceptance/latest/evidence/packaged-run-events.png` | 「工具请求：read_file」→「工具结果：# Alpha app / An alpha application fixture.」→ 受控脚本收尾文本 → 「已完成」 |
| 进程日志 | `tmp/issue53-acceptance/latest/evidence/packaged-app.log` | `DevTools listening on ws://127.0.0.1:<port>/devtools/browser/...` |
| fixture 不变 | `tmp/issue53-acceptance/latest/summary.json` 的 `fixture` | 前后哈希同为 `1bceca98…46c5`，`unchanged: true` |
| 聚合证据 | `tmp/issue53-acceptance/latest/summary.json` | `outcome: passed`、`cleanupErrors: []`、`git.dirty: false`；含 commit、exe SHA-256、CDP 端口、进程号、runId |
| 打包成品 | `apps/desktop/out/@pioneer-desktop-win32-x64/@pioneer-desktop.exe` | SHA-256 `551c27c4…df3a` |

验收运行发生在干净工作树（HEAD `0e2b3ca`）上，`summary.json` 记录 `git.dirty: false`。

## 门禁

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 仓库规范化 | `pnpm verify:repository` | 6/6 |
| 完整门禁 | `pnpm check` | 退出码 0（2026-10-27）：design:check 45 项、Contract 365/365、Prototype 210/210、Real E2E 27/27、package smoke；日志 `tmp/issue53-check-rebased.log` |
| 新增合同测试 | `pnpm test:contract` | `acceptance-config.test.ts` 13 条 + `run-host-adapter-selection.test.ts` 4 条 |

## 没做的事

1. 没有把打包验收接进 CI。issue 允许「CI 或本机一条命令」，当前门禁是本机一条命令；现有 `Pioneer Quality Gate` workflow 只跑 `pnpm check`，不跑打包验收。
2. 没有证明打包成品里的真实模型 Provider：仍用确定性受控适配器，真实 provider 的证据见 [issue13 真实 Provider 记录](issue13-real-provider.md)。本 issue 只要求只读运行链路。
3. 应用进程在断言后以 `taskkill /PID <pid> /T /F` 结束，没有走窗口关闭或托盘退出路径。journal 在终态时已原子落盘，证据不受影响；退出路径本身不在本 issue 范围内。
4. 截图与日志留在 `tmp/`（gitignored），没有提交二进制产物；需要长期留档时按仓库惯例另行归档。
