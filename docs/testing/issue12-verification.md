# Issue #12 本地候选验证与交接

验证日期：2026-10-24。候选位于 `codex/issue12-run-contract`，基于远程 main `336f8f8f031bae7ea460937ce7e93d2d7f856911`。输入来源与继承资产处置见[核对记录](issue12-input-reconciliation.md)；实施决策见[运行合同](../specs/2026-10-24-p2-run-contract.md)。最终代码提交、门禁输入和成品哈希保存于[机器记录](issue12-verification.json)。

## 本轮证据

本轮在从远程 main 新建的隔离工作树安装锁文件依赖，移入 #10/#11 的六个文件并加入 #12 合同/探针。没有使用原主工作树的 node_modules、P1 未提交源文件或打包结果。实际工作树无 `.jj`，使用 Git 分支；本机存在 jj 可执行文件不代表该工作树已经初始化 Jujutsu。

| 检查 | 实际结果 | 边界 |
| --- | --- | --- |
| 定向协议与授权探针 | 32/32 通过 | 合同模型，真实 Promise/AbortSignal；无 Pi、工具文件 IO 或 Electron 接线 |
| pnpm verify:repository | 6/6 通过 | 仓库规范化 |
| pnpm check：格式、lint、应用/测试类型 | 通过 | 完整候选 |
| Contract Tests | 19 文件、213/213 通过 | 包含原 PR #8、#11 策略和新增 32 项；不沿用原继承 P1 树的数量 |
| Prototype Tests | 210/210 通过 | 冻结 M1 模拟器与历史探针 |
| Real Electron E2E | 8/8 通过，fixture hash 由各用例 teardown 核对 | 远程基线的真实 main → preload → renderer 行为；没有将其升级为新 Harness E2E |
| package smoke | 成功结束，实际 Windows exe 与 resources/app.asar 均生成并哈希 | 构建产物；未宣称 Pi 成品加载或独立成品人工验收 |
| 独立审阅 | 停止语义发现已修复，最终复核无残留 | 读 Diff/合同及隔离探针；审阅代理独立测试受沙箱缓存错误影响，最终完整测试以主代理正常宿主日志为准 |

最终完整门禁运行环境：Windows x64，Node **24.22.1**，pnpm **11.7.0**，Electron **44.2.0**。Node 只在当前命令 PATH 中选择本机已有运行时，未修改系统配置或依赖锁。清除 `ELECTRON_RUN_AS_NODE` 后运行真实 Electron。完整门禁退出码 0；日志为本地忽略目录 `tmp/issue12/full-check-final.log`，规范化为 `normalization-final.log`，定向测试为 `probes.log`，日志 SHA-256 在机器记录中。

## 停止语义审阅与修复

- Abort 只能生成请求；模型或工具任一未结束时无终态，先完成/先停止按主进程事件提交顺序处理。
- 工具失败立即触发其余资源 Abort；保持 TOOL_FAILED 原因，直到模型也收敛才发 failed。
- timeout 和断连均保持 unknown。即使 pending 资源归零，也必须获得显式 quiescence 确认，不能由空列表、计时器或 prompt resolve 推断已停止。
- 对应回归覆盖模型先结束、工具先结束、无 pending 的断连/超时、Abort 后拒绝、deadline/撤销、恢复不重放。未调用真实模型或 SDK 来冒充该证据。

## 构建环境问题及可复验条件

首次完整命令在系统 Node 24.17.0 下退出码为 0，日志却停在 Finalizing package，没有成品目录，因此该次 package smoke **不算通过**。隔离 extract-zip 探针使用 SHA-256 正确的 Electron 官方缓存，复现读取到第一项末尾后 Promise 未完成、进程提前退出。

这与 [Node #63487](https://github.com/nodejs/node/issues/63487) 的 extract-zip/yauzl/fd-slicer 流生命周期问题一致；[yauzl #170](https://github.com/thejoshwolfe/yauzl/pull/170) 解释了旧 destroy 模式。使用本机 Node 24.22.1 对同一缓存完整解压成功，随后整个门禁及打包完成。失败的原始记录 `full-check.log`、`package-debug.log`、`extract-probe.log` 仍保留；初次 lint 的两处非空断言也已修正，日志为 `full-check-initial-lint.log`。

复验应选择本次通过的 Node 24.22.1，运行冻结锁文件安装、规范化和完整门禁，并核对 `apps/desktop/out/@pioneer-desktop-win32-x64/@pioneer-desktop.exe` 与 `resources/app.asar` 确实存在且本次重建。单独看到命令退出码 0 不足以证明 package smoke。没有为了通过测试关闭 asar/fuses、替换 Electron 或手工修改依赖实现。

## Issue 清单对照与剩余交付门

| #12 要求 | 当前证据/状态 |
| --- | --- |
| #10/#11、远程 main、继承树核对并交付 | 本地候选核对与干净基底整合完成；原文件内容保留。远程发布/最终远端版本核对 **待用户授权** |
| 注册表、会话/项目/窗口、修订与权限 | 合同 §1、§2、严格请求 schema 和授权探针 |
| 身份、seq、时间/来源与事件类型 | 合同 §3、共享 schema、事件分类与有界文本探针 |
| 重复/迟到/竞态/背压/关闭/崩溃 | 合同 §1、§3—§5；探针验证顺序/缓冲/未知恢复，生产实现归 #13 |
| 隔离取消证明 | 真实异步资源 + AbortSignal + 明确 quiescence gate 的协议探针 |
| 白名单/路径复检/预算/外发 | 原 #11 文件与合同 §5；预检不被升级为永久许可 |
| #13 清单/替换点/真实 Provider 记录 | 合同 §2 的唯一 adapter factory seam、§6 A01—A09 和独立记录字段 |

本轮未推送、创建 PR、合并、关闭 Issue 或启动 #13。Pi 开发/成品加载、生产运行注册表、只读执行器、Harness Electron 接线与真实 Provider 验证均为 #13 的 NOT_RUN 项；本候选不声明 P2 已接通。代码发布前需用户明确授权；发布后仍须检查最终远端版本，不能把本地提交当已远程交付。
