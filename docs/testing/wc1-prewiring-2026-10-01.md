# WC1 · 预接线模块交付记录

> 2026-10-01。范围仅为窗口适配的离线基础模块；**未接入应用启动链、未选定窗口样式、未实现可见三点、未通过真实 Electron 或 Windows 验收**。阶段以[ROADMAP](../../themasterplan/ROADMAP.md)为准，要求以[WC1合同](../specs/2026-10-01-window-chrome.md)为准。

## 输入与非破坏性边界

- 开工重新核对 Git-only、`codex/hazel-session-workbench`、HEAD `cc82d8a38b013e9e6bcbc11cbc99bd07e706bc33`；全部继承脏树保留，未提交、切换、推送或清理。
- 原 F1c 的123个工程输入哈希全部不变。仅新增6个模块和4个Contract文件；未改 `main/index.ts`、`main/window.ts`、`preload/index.ts`、主API、renderer、CSP、安全参数、素材、设计token、Figma或插件。
- [133输入候选](wc1-staged-candidate-2026-10-01.json)身份：`cc51eb96ec64d47b2832480ee425e189c9593377bb0c3b7268f766dff42a6e68`。门禁前后逐项复核不变；此前lint失败的候选与日志另存，不覆盖历史成功证据。
- 继承工程快照在 `.private/wc1-baseline-2026-10-01/`；该目录不是发布包或新权威规范。

## 实际新增内容

| 模块 | 已实现的模块合同 | 仍未跨越的边界 |
| --- | --- | --- |
| `main/app-window-lifecycle.ts` | 关闭/退出意图分离、早期重开/退出合并、退出时阻止重开、accepted-save barrier、陈旧generation隔离、托盘不可用拒绝普通关闭、异常恢复与分类报告 | 尚未绑定真实close、before-quit、second-instance、托盘或保存失败结果 |
| `main/window-controls.ts` | 窄原生port、事件后读取状态、延后close/quit、全屏等待原生事件/超时、不把最大化当全屏、恢复前状态、迟到事件与异常快照保留、监听清理 | 使用fake port验证；未启动真实BrowserWindow |
| `main/window-restore-bounds.ts` | 根据main当前DIP workArea选最大重叠/最近屏、保留合法负坐标、移除屏/缩小工作区的可见约束 | 尚未绑定Electron `screen`；不证明混合DPI、多屏热插拔或小工作区可用性 |
| `main/window-ipc.ts` | 六个固定零payload channel、继承可信顶层sender与URL校验、旧handler/disposer保护 | 运行时尚未注册这些handler |
| `preload/window-api.ts` | 固定invoke、严格初始快照/订阅验证、不暴露Electron事件、幂等unsubscribe | 尚未由实际preload入口创建或暴露给renderer |
| `shared/window-state.ts` | 专用channel、严格snapshot和窄API类型；仅原生状态、转换中标志与托盘不可用原因 | `WindowDesktopApi`尚未合入运行时`PioneerDesktopApi` |

## 验证结果与独立审阅

- 新增50项聚焦Contract：17应用生命周期、21窗口IPC/状态（含installed Electron结构类型断言）、4 preload、8显示器边界。它们证明模块合同，**不是Electron proof**。
- [六条独立离线门](wc1-staged-offline-gates-2026-10-01.json)全部exit0：格式、lint、应用类型、严格Contract类型+174测试、冻结210 Prototype、最终package smoke。日志：`tests/wc1-staged-offline-gates-2026-10-01.log`。
- **没有运行`pnpm check`，没有运行本轮Electron E2E；不能称完整质量门通过。** 打包成功不等于安装/启动/原生体验成功，174中包含预接线模块测试。
- 行为red→green日志分别记录生命周期、窗口合同、preload；独立审阅提出的迟到全屏恢复缺陷和renderer通知异常有真实Contract失败与修复日志；当前workArea约束也保留失败日志。首轮lint失败修复后重新冻结并从格式起跑六条离线门。
- 两个Luna只读独立审阅覆盖生命周期、窗口状态/IPC/preload与恢复几何；相关缺陷已修复和回归。结论仅为预接线模块聚焦审阅通过；不将未实现的接线、托盘、UI或原生门记为PASS。详见[审计记录](wc1-staged-audit-2026-10-01.json)。

## 原生探针阻断（未执行）

隔离探针脚本已准备于 `.private/wc1-probe/`，计划比较默认系统框、`hidden`无overlay、frameless+thickFrame三类候选。样式/API依据本机Electron44.2.0类型与[Electron官方标题栏文档](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar)；类型允许不等于Windows体验通过。

沙箱外启动请求被**自动审批服务额度限制**挡住，工具明确表示审批未完成、动作未执行，不是安全拒绝。没有绕过审批，也没有改应用sandbox来重试；`wc1-native-api-probe-2026-10-01.json`没有产生。API flags、包输出、Contract和结构类型断言都不代替探针或Alt+Space/Snap人工结果。

## 下一轮接线顺序（仍是WC1完整范围）

1. 审批服务恢复并获准后运行隔离探针；再真实核对系统菜单、拖拽/边缘缩放、Snap、任务栏和多显示器，按实际证据决定窗口样式。不默认为三点获得原生Snap悬停层。
2. main统一一个sessionStore与accepted-save tracker，复用现有每窗close coordinator/renderer队列；`before-quit`只在最终门允许时退出，最后窗普通关闭保活并提供可发现托盘入口。托盘创建/丢失失败必须保留可操作窗和说明。
3. 保存取消或失败真实回调调用`cancelQuit()`，清退出意图。**失败后的重试不自动继承已清除的退出意图**；需要退出时重新明确请求。saved/discard也必须等实际native `closed`与已接受写入settle，不能把invoke完成当作应用已退出。
4. 每窗注册六个handler和main同步`webContents.send`状态广播；closed时清理，早期second-instance只暂存一次，禁止旧sender或重复writer。preload只展开窄adapter，renderer初始读取+订阅，不能暴露ipcRenderer本体。
5. 三点及独立最大化/退出菜单可用于加载/错误状态；窗口色token不覆盖业务色，目标≥32px，真实焦点/全屏/禁用反馈，drag/no-drag、Ctrl+W保留。仅补充当前v3组件，不重开全局设计或历史Figma页。
6. 新增真实Electron测试并适配旧“最后窗口关闭=退出”的假设，保留慢写、失败、取消、显式discard与fixture不变性；再新鲜完整`pnpm check`、内容身份与独立最终审阅。
7. Alt+Space/Snap、通知区域重开/退出、DPI/多屏/负坐标、键盘/读屏/强制颜色及系统结束路径单独人工记账，不自动注销/重启。原生picker、P12、M2/M3和PET依旧按各自门收口。
