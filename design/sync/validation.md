# S1 候选验证记录

日期：2026-10-26（Asia/Shanghai）。初始基线：main `d5a2f87`；合并前同步基线：main `fd26d06`（已含 PR #16 和 #40）。这是 #35 的 token 管线候选和映射阻塞记录，不是整票验收完成证明。

| 检查                             | 结果与范围                                                                                                                                                                                                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Figma 只读回读                   | 101 个 native variables、三组件投影与 S0 一致；snapshot-only。没有外部写入。                                                                                                                                                                                                                        |
| `pnpm install --frozen-lockfile` | 通过；未放宽供应链策略。新增固定版本开发依赖；既有锁定 package/snapshot、desktop importer 均未变化。                                                                                                                                                                                                |
| `pnpm design:check`              | 初始 23 项、同步 main 后 24 项测试通过；生成可重放，alias/类型/单位/重名/删除/漂移反例、对比度、真实导出/props、变体和历史哈希校验通过。索引仍明确报告三个试点未全部完成。                                                                                                                          |
| `pnpm verify:repository`         | 6 项通过。                                                                                                                                                                                                                                                                                          |
| 格式、lint、typecheck            | 通过。                                                                                                                                                                                                                                                                                              |
| `pnpm test:prototype`            | 通过；这是冻结 M1 Prototype Tests 与探针，不是 Electron proof。                                                                                                                                                                                                                                     |
| `pnpm package:smoke`             | Linux 命令退出 0，生成 Linux 应用及 webpack 输出；不代表 Windows 安装包人工验收。                                                                                                                                                                                                                   |
| `pnpm check`                     | Linux 上在 Contract 阶段失败：189 通过、24 失败、1 unhandled error。初始基线 main `d5a2f87` 在独立 worktree 复跑，失败的 24 个测试名称完全相同；涉及 Windows 根路径及 `C:\Temp`。没有为规避平台限制改动产品/测试路径规则。该命令未继续执行 Electron 阶段。                                          |
| Windows `pnpm check`             | 初始提交 `900422f` 的 [Windows CI #90](https://github.com/OasisViridis/Pioneer/actions/runs/40254951480) 通过（213 项 Contract、8 项真实 Electron E2E）。同步 main 后必须重新执行，以 [PR #39 最新提交 checks](https://github.com/OasisViridis/Pioneer/pull/39/checks) 为准，旧结果不能代表新提交。 |
| `pnpm design:acceptance`         | 按预期退出 1：PR #16 已合并并重新固定三个导出的 commit/blob；Unavailable、PanelTab API 和 SessionTab 视觉/组合验收仍未完成。**不能关闭 #35。**                                                                                                                                                      |

回归范围：新增 Electron 断言验证真实 renderer 的生成配色、字体栈和 rem 间距；保留原有项目导航、Runtime 意图和 fixture 不变量测试。主进程、preload、IPC、Grant、Run 契约与 reducer 没有修改。

Code Connect 官方发布/回读、Tokens Studio Git Sync、Figma 回灌、原生目录选择器人工验收均未执行。沿用 S0 轻量索引与文件导出路线，不将未执行项目标为通过。

合并前同步：解决 `package.json` 格式命令冲突，保留 main 的 `newSessionForProject` 会话入口并叠加生成样式断言。新增接受后真实导出/props 校验用例，Unavailable 防护只用于 Cover 组件；既有未接受候选与虚构 props 的拒绝路径仍受测试保护。`pnpm install --frozen-lockfile`、24 项设计测试、6 项仓库检查、格式、lint、typecheck 均重新通过。完整 Windows 门禁等待最新提交 CI，不修改产品或 fixture 来绕过环境边界。

## 三组件与资产补全（main d11dede 之后）

本次交付把八个变体连接到真实 typed JSX 示例，新增目录不可验证状态，改用已有 DockSurface 组合，补齐 SessionTab 的交互与关闭 Run 不变性检查。历史资产通过新的纯读校验，运行时预算通过当前单工作区的 Electron 用例验证。

本地：frozen lockfile 安装、28 项设计测试、6 项仓库检查、示例类型检查通过。完整结果需以最新 PR 提交的 Windows CI 为准；Linux 环境缺少图形运行依赖；本次 package smoke 的 webpack 构建通过，但 Electron 解包被仓库既有 win32 bsdtar 补丁拒绝，退出 1。本文件不将计划运行或静态注册当作 Electron / 打包通过，Windows CI 是本次完整门禁的验证环境。

CI 的最终门禁改为 `pnpm design:acceptance`，内部执行完整 `pnpm check` 后检查三组件无未完成项。`s1-visual-evidence` artifact 保存实际截图；像素完全一致、官方 Code Connect 发布和人工无障碍验收不在本次通过声明中。
