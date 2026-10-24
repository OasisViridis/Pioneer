# WC1 · Windows宿主的macOS式窗口合同

> 2026-10-01。来自用户明确要求；[运行时接线候选](../testing/wc1-runtime-2026-10-01.md)已过新鲜完整门和聚焦独立审阅，**Windows人工验收尚未完成，WC1仍IN PROGRESS**。[预接线记录](../testing/wc1-prewiring-2026-10-01.md)保留历史事实。编排见[统一计划WC1](../plans/2026-09-30-pioneer-unified-development-plan.md)。不改变[Hazel × Claude v3.2](../design/DESIGN-SYSTEM.md)与[产品合同](../design/workbench-product-spec.md)的业务、配色、字体、密度或装饰规范，不单独关闭ROADMAP里程碑。

## 1. 范围与决定

应用仍运行于Windows。左上红/黄/绿三点及窗口操作语义采用macOS式逻辑；Apple HIG仅补充窗口层。红点关闭原生窗口，黄点最小化到Windows任务栏，绿点切换原生全屏；**关闭窗口≠退出应用，全屏≠最大化，关闭窗口≠关闭会话Tab**。

| 情境              | 明确决定                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 点击红点 / Alt+F4 | 请求当前窗口的`BrowserWindow.close()`，进入既有保存/关闭协调；不得直接destroy/hide/quit。完成保存才关闭，失败可重试、继续编辑或显式放弃；会话与草稿保留，不自动停止任务。 |
| 最后一个窗口关闭  | 进程保留，由Windows通知区域的Pioneer入口提供“打开Pioneer”“退出Pioneer”；从开始菜单/快捷方式再启动也能重开。托盘是Windows宿主适配，不将黄点改为托盘隐藏。                  |
| 托盘不可用        | 必须保留可操作的窗口并解释原因，不能留下不可发现的无窗进程，也不能把红点静默改成退出。该降级路径须独立测试；托盘部署未通过时不能宣称WC1完成。                             |
| 明确退出Pioneer   | 窗口菜单与托盘提供同名动作。活窗口复用既有保存门；取消/失败退回可操作状态并清除退出意图。无窗口时只在已接受的存储写入全部settle后退出。                                   |
| 黄色 / 任务栏恢复 | 使用原生minimize/restore，恢复同会话、草稿、布局及合理焦点；不隐藏窗口，不改变会话状态或权限。                                                                            |
| 绿色              | 切换原生全屏；从main事件确认进入/退出，恢复进入前的普通边界或最大化状态。非CSS假全屏，不模拟Spaces/Split View。                                                           |
| 最大化/还原       | 独立可发现的窗口菜单动作；非全屏时双击空白标题栏切换最大化/还原，按钮/Tabs/输入区不响应标题栏双击。全屏时该动作禁用并解释，不混用两个状态。                               |
| 系统退出          | 用户退出与Windows会话结束分开处理，保留安全收尾；不得自动重启电脑或通过关闭sandbox绕过。系统结束时序和限制需真机人工证据，模拟事件不能冒充系统退出验收。                  |

托盘新增仅服务于本需求的close/quit/reopen合同，不增加自动启动、后台Agent运行或设置页面。应用未接运行器时不得借“后台运行”声称任务持续执行。

## 2. 复用现有接缝

接线前`main/window.ts`为默认系统窗口，`main/index.ts`在Windows最后窗口关闭后退出，`second-instance`遇到已销毁窗口直接返回。当前已新增app级close/quit/reopen和窄窗口接口，三点已穿越真实Electron接线；该候选尚不能代替Windows外壳人工验收。

- 沿用`main/window-lifecycle.ts`的`createPendingSaveTracker`与`createCloseCoordinator`，以及renderer现有`use-session-state`保存队列/关闭截止时间/失败确认。main已接受的保存需settle；不能再建立一套互相竞争的保存或关闭状态机。
- 将“请求关闭窗口”“请求退出应用”“允许最终退出”分开。重复关闭请求合并，取消退出后不得让下一次普通关闭变成退出；保存失败不能提前destroy sender。退出完成前不接受重开产生新的写入者。
- 保留全局单实例锁及现有userData身份。无窗第二实例复用`openMainWindow`；早于app ready/catalog初始化的重开请求暂存一次，ready后处理，不能创建重复窗口/存储写入者。
- 每次重开使用新的窗口级协调器，清理旧监听/窄IPC并绑定新的可信webContents。无窗时禁止旧renderer继续发窗口动作；重开不得重复注册handler。

## 3. 窄窗口接口与状态

以下已通过固定preload接口接入运行时。renderer只请求动作，main拥有真实窗口状态；不暴露window ID、任意方法名、路径、命令或Electron事件对象。具体通过范围见[当前证据](../testing/wc1-runtime-2026-10-01.md)，[Windows人工检查表](../testing/wc1-windows-manual-2026-10-01.md)保持待验。

- `getWindowState()`与`onWindowStateChanged(callback)`：初始快照与可卸载订阅；只含是否focused/minimized/maximized/fullscreen等必要状态。监听原生状态事件，不以按钮点击乐观推断成功。
- `closeWindow()`、`minimizeWindow()`、`toggleFullscreen()`、`toggleMaximize()`、`quitApp()`：各自固定channel、严格payload-free合同、可信顶层sender校验；不得使用通用`windowMethod(name,args)`。
- 动作请求被接收不代表关闭、全屏或退出已完成。close invoke先正常返回，再进入原生close事件，保存队列仍有机会响应；状态失败应以真实状态回读和可理解文字反馈恢复。
- 全屏前状态记录只服务于恢复；拖拽/缩放/最大化结果以main为准，renderer不能提交任意bounds来替代原生窗口状态。

## 4. 控件与Windows兼容性

左上固定红/黄/绿顺序，三点使用独立窗口控制token，不复用业务危险/成功色。可见圆点可以紧凑，实际交互目标沿用至少32px且不重叠；提供动作名称/tooltip、正常/hover/pressed/focus/disabled/inactive状态，不只依靠颜色。非活动窗口的状态由main焦点事件驱动。

空白标题栏可拖动，所有按钮、Tabs、搜索/输入与菜单均为no-drag。不得同时保留一组右侧重复原生按钮，窄/短窗口不能让三点遮挡业务动作。现有会话Ctrl+W合同不变。

**先做原生外壳兼容探针，再选窗口样式：**必须验证Alt+Space系统菜单、原生边缘缩放、Win+方向键/Snap、任务栏与多显示器边界。不能把自绘菜单截图冒充Windows系统菜单，不能默认自绘绿点自动获得Windows原生Snap悬停浮层。若所选无框样式不能满足这些合同，需解决接缝/记录真实限制，不以删测试或退化为仅图标方案通过。

## 5. 顺序与证据门

1. **原生外壳探针：**隔离profile验证候选窗口样式、系统菜单/拖拽/缩放/Snap；不修改个人配置，不破坏现有应用安全参数。
2. **生命周期：**复用关闭门完成close/quit/reopen、单实例早期时序和托盘失败恢复，先Contract再真实Electron；不能只测试模拟对象。
3. **窗口状态与三点：**窄IPC/preload、main状态广播、当前v3组件补充与renderer控件。Figma只增加窗口控件合同，不重开全局设计或覆盖历史页。
4. **真实Electron E2E：**main→preload→renderer触发最小化、全屏、最大化/还原；验证原生标志/恢复边界、红点不关闭Tab、慢写/失败/取消、最后窗口关闭后的同profile重开、第二实例不重复写入、显式退出和旧订阅清理。fixture/profile与个人数据隔离。
5. **人工Windows：**系统菜单、Snap、通知区域重开/退出、混合DPI/多屏/负坐标、200%缩放/强制颜色/键盘/读屏及系统结束路径分别记录。没有对应证据保持待验；不自动改系统缩放、注销或重启来完成测试。
6. **集成门：**新鲜完整`pnpm check`、候选内容身份及独立Diff审阅；只证明窗口切片，不替代M2原生picker、P12当前v3实点或Agent运行链。未发布/推送/合并。

## 6. 一手参考与跨平台声明

[Apple HIG · Windows](https://developer.apple.com/design/human-interface-guidelines/windows)推荐系统提供的窗口；这里自绘macOS式控件是用户明确要求的跨平台例外，不声称Apple原生Windows控件或HIG认证。[Mac窗口操作](https://support.apple.com/guide/mac-help/work-with-app-windows-mchlp2469/mac)支持关闭与退出区分，[Mac全屏操作](https://support.apple.com/guide/mac-help/use-apps-in-full-screen-mchl9c21d2be/mac)支持绿点全屏语义。Windows托盘、重开策略与快捷键是本项目适配决定，不扩大Apple HIG到整套应用视觉。
