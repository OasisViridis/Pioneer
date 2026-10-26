# P1 · 可恢复会话收口 · 2026-10-03

**P1 COMPLETE；M3 仍 IN PROGRESS。下一片 P2 真实只读 Harness。**

## 已完成

生产 App 从媒体库进入新建／恢复会话，同项目可有多个独立会话。SessionTabStrip 与项目身份分开；关闭标签保留记录，MRU 和键盘焦点恢复可用。SessionWorkbench / DockSurface 使用一套可保存的停靠布局，旧专注／审阅／交付入口不再挂载。

对话可直接保存消息，也可按需澄清目标。修订、修改、取消、确认及 RuntimeSession 初始化保留在当前会话内，不成为普通消息的强制签署门。初始化快照与批准修订一致；modelAccess / toolExecution / fileMutation 均 false，日志与产物没有假运行结果。

main 注册发送方校验的固定会话 IPC，preload 提供经过校验的窄接口，renderer 保存最新快照；主进程原子替换自己的 userData 记录，不写项目文件。v1–v3 严格迁入 v4，选择旧活动布局并完整保留旧布局历史；读取不改原始字节，显式保存才升版。未知／损坏记录保留原件，不清空；用户修复后可重试读取。

关闭和刷新处理保存队列与已接受写入。保存失败可重试、继续编辑或不再重试并关闭。最后一种不会取消已经开始的原子写入，界面明确说明；主进程仍等待写入完成，避免把关闭超时误报成“已丢弃”。单实例锁阻止同一 profile 的第二写入者。

## 完成条件与证据

| 条件                                     | 当前证据                                                                                                                                                                    |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 媒体库新建／恢复、两个会话隔离、关闭重开 | `tests/e2e/p1-session.e2e.spec.ts` 同项目两会话；普通消息无需意图确认；草稿与消息不串会话                                                                                   |
| Electron 重启恢复草稿、意图、产物视图    | 同文件真实关闭／重新 launch；REV 1、文件清单选中；REV 2 初始化快照及三个 false 能力从实际 preload 读取                                                                      |
| 单布局保存、面板位置与键盘尺寸恢复       | 同文件移动上下文至另一列，左右与上下高度按键调整，保存布局后真实重启验证                                                                                                    |
| 迁移与原件保护                           | Contract 覆盖 v1–v3；真实 Electron 验证 v3 读字节不改、编辑后 v4 保留完整历史；v99 保留与人工修复后重试成功                                                                 |
| 保存失败与生命周期                       | `session-lifecycle.e2e.spec.ts` 与上述文件：真实 rename 障碍、恢复重试、刷新保护、慢关闭取消、超时后不再重试仍等待已接受写入、第二进程退出                                  |
| 取消／修订与会话归属                     | `session-workspace-reducer.test.ts`、`session-v4-migration.test.ts`、`task-intent.test.ts`、`m3-intent.e2e.spec.ts`；取消持久化由领域合同验证，不标作独立 Electron 重启场景 |
| 不恢复三模式、不用假执行                 | 实际 UI 断言无三模式 Tabs；能力面板和日志明确未接运行器；初始化不赋权                                                                                                       |
| 安全边界与 fixture 不变                  | 固定 IPC / sender / main-frame / URL 合同；每个真实 Electron 测试结束核对工作区 fixture 哈希                                                                                |

## 完整质量门

完整 `pnpm check` **exit 0**：格式、lint、应用及测试类型检查；**30 文件／200 Contract**；**7 文件／21 Real Electron E2E**；最后 package smoke 完成。

冻结 M1 **Prototype Tests 210/210** 和既有探针通过，单独计为历史原型门，不替代桌面证据。

日志：`tmp/p1-session-20261003/full-gate.log`，退出码：同目录 `full-gate.exitcode.txt`。168 项输入在完整门禁前记录 SHA-256，结束后逐项核对未变化； manifest、日志哈希和范围在[机器记录](p1-session-closeout-2026-10-03.json)。首次完整 PASS 日志也保留为 `full-gate-first-pass.log`；第二次增加产物视图重启断言后重新跑完整门，未用聚焦结果替代完整门。

修改前 136 项文件 ZIP 与 baseline manifest 保留在同目录；继承未提交候选、历史设计、窗口与测试文件未删除。独立只读审查未发现阻断的数据丢失或授权越界问题，关闭动作文案与恢复重试盲点已修复。实际 Electron 截图保留在 `tests/e2e/test-output/artifacts/p1-session.e2e-creates-ind-1ca05-yout-after-Electron-restart/session-before-restart.png`，已目视核对；不作为完整响应式、DPI 或读屏验收。

## 下一步

P2 复用 Pi Harness 接一条真实、可观察、可停止的只读任务；先核对官方接口、provider、鉴权和实际发送范围，不修改用户全局配置，不发送未经许可的个人工作区。P3 完整面板与真实内容、P4 受控写入、P5 窗口外壳／桌宠／系统级人工验证继续独立推进。

本次没有提交、推送、合并、发布，也没有将 P1 完成写成整个 M3 完成。
