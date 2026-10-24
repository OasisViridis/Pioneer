# P0 · 整合底座验收

2026-10-03，用户验收 v8 展示视频并恢复应用开发后，P0 已完成。M2 保持 COMPLETE、M3 保持 IN PROGRESS；P1 会话界面接线与 P2 真实 Harness 尚未完成。

## 实现

- 保留 Git-only main、继承的 dirty / untracked 内容和复工 ZIP；没有切分支、reset、整包提交或推送。
- 项目 Tabs / M3 保持原实现。新增独立会话 state、reducer 与 IPC 合同，修正 store / activity / docking / 保存队列／候选 UI 及测试导入；不是删候选让旧应用单独通过。
- 会话与窗口候选采用显式注入的窄 API；生产 preload 仍只支持 catalog 三方法。旧三模式界面未挂载，P1 接线前改为单会话面板结构。
- 补 PNG / SVG / WOFF2 的真实 Webpack asset 规则，打包核对过的 Noto Sans SC / Noto Serif SC 与 OFL；不覆盖 Hazel 配色。新增离线字体 E2E。
- 修复窗口同步事件回放被迟到初始快照覆盖的竞争，新增公开 observer seam 回归测试。
- 完成[F9 / main / Workbench 组件和行为映射](../plans/2026-10-03-p0-integration-map.md)及[继承文件去向清单](p0-integration-disposition-2026-10-03.json)。原型假 runner、默认 grants、localStorage 和模拟成功不移植为真实能力。

## 当前验证

完整 `pnpm check` **exit 0**，执行顺序未改、规则未放宽：

| 门                                    | 结果                     | 证明范围                                                              |
| ------------------------------------- | ------------------------ | --------------------------------------------------------------------- |
| format / lint / application typecheck | PASS                     | 含继承的候选源码，不只有 active App                                   |
| test types / Contract                 | 194 / 194，28 文件       | 主线与会话、窗口、存储、IPC 候选合同                                  |
| Prototype                             | 冻结 210 / 210；探针通过 | M1 模拟器，不是 Electron                                              |
| Real Electron E2E                     | 9 / 9，5 文件            | 原四文件 8 测试全部保留；新增离线字体加载／许可证校验                 |
| final package smoke                   | PASS                     | Windows x64 Forge 打包与 source-launch 输出准备，不等于安装包人工验收 |

[完整日志](../../tmp/development-resumption-20261003/p0-check-final.log)、[退出码](../../tmp/development-resumption-20261003/p0-check-final-exit.txt)、[门禁输入哈希](../../tmp/development-resumption-20261003/p0-gate-inputs.json)、[收口证据](p0-integration-closeout-2026-10-03.json)。

复工初始 lint / typecheck 失败和后续 IPC 通道红测试原样保留。沙箱内 Electron 的 GPU 子进程异常与 Playwright 调试连接断言已由隔离探针复现；相同应用与独立 user-data 在沙箱外打开真实页面并点击成功，完整门禁随后按获准沙箱外入口通过。没有修改 timeout、跳过 E2E 或禁用 GPU 来掩盖问题。

## 没有提前完成的部分

- App 仍挂 `ProjectWorkspace`。session / window / Hazel 候选 E2E 保留并受类型／lint检查，尚未加入 active runtime testMatch；它们需要 P1 / P5 接线和旧模式断言适配。
- v3 的三布局数据保留。P1 将当前布局迁为单会话布局，其他布局留作恢复历史；本轮不声称已迁移用户记录。
- 模型、Pi、工具、命令、写入、Diff、桌宠和原生三点／托盘未因此启用。READY 仍不是执行授权。

下一片 **P1**：真实 Electron 的两会话隔离、保存、关闭／重开、重启恢复与可选意图辅助。P1 后紧接 **P2** 的首条真实只读 Harness 任务，不等待完整面板库或桌宠。
