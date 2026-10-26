# S1 候选验证记录

日期：2026-10-26（Asia/Shanghai）。基线：main `d5a2f87`。这是 #35 的 token 管线候选和映射阻塞记录，不是整票验收完成证明。

| 检查                             | 结果与范围                                                                                                                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Figma 只读回读                   | 101 个 native variables、三组件投影与 S0 一致；snapshot-only。没有外部写入。                                                                                                                                                                   |
| `pnpm install --frozen-lockfile` | 通过；未放宽供应链策略。新增固定版本开发依赖；既有锁定 package/snapshot、desktop importer 均未变化。                                                                                                                                           |
| `pnpm design:check`              | 23 项测试通过；生成可重放，alias/类型/单位/重名/删除/漂移反例、对比度、真实导出/props、变体和历史哈希校验通过。索引仍明确报告三个试点未全部完成。                                                                                              |
| `pnpm verify:repository`         | 6 项通过。                                                                                                                                                                                                                                     |
| 格式、lint、typecheck            | 通过。                                                                                                                                                                                                                                         |
| `pnpm test:prototype`            | 通过；这是冻结 M1 Prototype Tests 与探针，不是 Electron proof。                                                                                                                                                                                |
| `pnpm package:smoke`             | Linux 命令退出 0，生成 Linux 应用及 webpack 输出；不代表 Windows 安装包人工验收。                                                                                                                                                              |
| `pnpm check`                     | Linux 上在 Contract 阶段失败：189 通过、24 失败、1 unhandled error。未修改 main 在独立 worktree 复跑，失败的 24 个测试名称完全相同；涉及 Windows 根路径及 `C:\Temp`。没有为规避平台限制改动产品/测试路径规则。该命令未继续执行 Electron 阶段。 |
| Windows `pnpm check`             | 由候选 PR 的 Windows CI 执行，最终结果以 PR checks 与对应 commit 为准。本文件不预先宣称通过。                                                                                                                                                  |
| `pnpm design:acceptance`         | 按预期退出 1：#13 / PR #16 尚未合并，Unavailable 和 PanelTab API 缺口尚未处理。**不能关闭 #35。**                                                                                                                                              |

回归范围：新增 Electron 断言验证真实 renderer 的生成配色、字体栈和 rem 间距；保留原有项目导航、Runtime 意图和 fixture 不变量测试。主进程、preload、IPC、Grant、Run 契约与 reducer 没有修改。

Code Connect 官方发布/回读、Tokens Studio Git Sync、Figma 回灌、原生目录选择器人工验收均未执行。沿用 S0 轻量索引与文件导出路线，不将未执行项目标为通过。
