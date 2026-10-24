# P0 · F9 / main / Workbench 整合对应表

唯一运行底座是当前 checkout 的 Electron Forge / Webpack 主线，不另建 Make 工程、不覆盖项目 Tabs 和 M3 意图 reducer。P0 补全候选合同与测试；P1 才把会话界面接到 main → preload → renderer。

## 来源与模块去向

F9 文件名已从[冻结 ZIP 清单](../design/make/frozen/2026-10-01-f9/manifest.json)和源码只读核对；画板入口见[F9 写回](../design/figma-make-f9-writeback-2026-10-02.md)。

| F9 参考                                                  | 主线／候选接缝                                                     | 采用方式与阶段                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `Library.tsx`                                            | `ProjectLibrary`、`ProjectPoster`、catalog IPC                     | 保留真实只读扫描；P1 借用海报、搜索、项目会话入口，不复制示例工作区和假统计                               |
| `Session.tsx` / `SessionView`                            | `Conversation`、`SessionTitle`、`SessionList`                      | P1 复用完整对话构图、草稿与恢复入口；保留真实未连接状态，不复制模拟回复                                   |
| `Session.tsx` / `ReviewPane`                             | `ProjectWorkspace`、`intent-workspace`、TaskIntent、RuntimeSession | P1 将修订／取消／初始化适配为会话内可选澄清，保留权限边界；不恢复独立审阅页                               |
| `Workbench.tsx`                                          | `DockSurface`、`ResizeHandle`、`docking.ts`                        | 旧双列算法是迁移参考；P1 单会话布局，P3 按需打开／拆分／合并／键盘操作，不复制整个 Make reducer           |
| `Modules.tsx` / `Context`                                | `WorkbenchPanels` / `ProjectOverview`                              | 现候选只有概览；P2–P3 接明确选择的真实引用与发送清单                                                      |
| `Modules.tsx` / `Caps`                                   | 固定 preload、main 授权、后续 Pi adapter                           | P2 权限由 main 控制；原型开关与默认 grants 不移植为执行许可                                               |
| `Modules.tsx` / `Log`                                    | 后续运行事件合同                                                   | P2 真实 run/session 身份与顺序；原型计时器不采用                                                          |
| `Modules.tsx` / `Preview`、`Session.tsx` / `DeliverPane` | `WorkbenchPanels` / output tab 候选                                | P3–P4 接真实产物、Diff 与核验；原型报表、成功数字、自动验收不采用                                         |
| `store.ts`                                               | `session-state.ts`、store、save queue、独立会话 reducer            | P0 v1–v3 合同与旧数据兼容；P1 持久化升版并保存旧三布局历史，不复制 localStorage 或 reset/corrupt 调试操作 |
| `Shell.tsx` / `TitleBar`、`QuitDialog`                   | `WindowChrome`、`window-api`、窗口 lifecycle / controls            | P0 独立 typed port 与 Contract 测试；P5 原生接线和人工门，不复制假窗口或网页任务栏                        |
| `Settings.tsx`                                           | `SettingsView` / settings IPC                                      | 保留真实目录设置；其他偏好逐项实现，不把原型静态值当已支持                                                |
| `Pet.tsx`、`Notes.tsx`、`ui.tsx`                         | Hazel 资产、Modal / LocalTabs / PanelMenu 等                       | 复用合适的 view 与装饰；桌宠插件薄适配留 P5，不赋予任务权限                                               |

## P0 实现与未合并候选

- 项目库继续使用 `contracts/tabs.ts` 和 `tabs-reducer.ts`。会话使用新 `contracts/session-workspace.ts` 和 `session-workspace-reducer.ts`；两个 state 不能相互持久化。当前 M3 与 RuntimeSession 原件未改。
- `session-state-ipc`、store、save queue、activity、docking 使用独立会话合同；候选 Contract Tests 全部纳入现有门禁，没有删测试、扩大 `any` 或放宽规则。
- `useSessionState(initialApi)` 和 `WindowChrome({ api })` 注入独立端口。当前生产 `window.pioneer` 仍只暴露 catalog 三方法；没有加虚构方法或空实现。
- `SessionWorkbench` **保留但未挂载**。其中旧三模式工具栏与 Hazel 的按模式映射在 P1 接线前替换；`Layout` 三值仅供旧持久化和迁移测试，不作为最终导航。
- 窗口 controls / lifecycle / restore-bounds 和 preload `window-api` 保留为经过合同测试的候选。窗口快照已修复同步事件回放被迟到快照覆盖的竞争；没有提前宣称三点／托盘已接入。
- 候选 session / window / Hazel E2E 保留，类型检查覆盖，但 runtime 接线与旧模式测试改写在 P1 / P5。现役 E2E 保留原四文件并新增离线字体文件，不缩小运行范围。
- 逐文件处置见[机器清单](../testing/p0-integration-disposition-2026-10-03.json)：原件仍可由复工 ZIP 恢复；历史文档迁移与既有删除不重新执行，生成的测试输出可以重跑，不能当业务源码。

## 字体与装饰预算

- 已将核对 SHA 的 Noto Sans SC / Noto Serif SC 完整变量 WOFF2 与各自 OFL 放入 `apps/desktop/src/renderer/assets/fonts/`，由 Webpack 本地打包。来源、轴、字节及哈希保留在旁边 `font-manifest.json`。不裁剪中文字符、不另下载字体。
- 新增 `fonts.css`，不覆盖原 Hazel token。真实 Electron 已在阻断 HTTP(S) 的情况下加载两字体的 400 / 500 / 700 字重，并核对打包许可证。
- JetBrains Mono 未随该包提供；代码字体继续保留系统等宽回退，不冒称已离线打包。P1 / P5 再决定是否另行引入合法本地资源。
- 沿用[装饰预算](../design/hazel-v3/decoration-policy.json)：单视图最多一张插图，活动／错误／权限／未知态不加插图。没有新增装饰素材，也没有将 ThreeUI 素材库整套搬入应用；旧模式素材池仅作历史参考。

P0 恢复的是**可编译、可验证的整合底座**，不是完成的 F9 界面或真实 Harness。P1 的验收仍是两会话隔离、关闭／重开／重启恢复与可选意图辅助；P2 紧接首条真实只读任务。
