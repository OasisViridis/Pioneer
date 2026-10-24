# 工程复工 · 当前候选与验收记录

## E0：当前集成候选，不回退旧产品

- 当前候选是继承的实际工作副本，不是更容易通过的旧分支：`codex/hazel-session-workbench`，HEAD `cc82d8a38b013e9e6bcbc11cbc99bd07e706bc33`。
- [冻结清单](resumption-candidate-2026-09-30.json)包括 96 个源码、构建配置、测试及 fixture 文件，整体内容身份 `e7885ae1e687ea1f3139af62c35cc44b4b303cc59b6256d34e599819f57932cd`。本轮基线门禁前后逐文件校验无变化；未 reset、clean、checkout、提交或推送。
- M2 基础：catalog/scanner/path/settings、可信 sender、固定 preload 桥、基础库与导航。Workbench 扩展：session state / store / IPC / 关闭协调、会话与停靠 UI、持久化和生命周期测试。M3-A：纯意图模型与测试。设计迁出和其余继承内容不清理。
- 当前 [Workbench 产品合同](../design/workbench-product-spec.md) §0–1 是已授权的后续实现合同：会话优先导航、本机会话保存、多会话；旧 M2 项目 Tabs 是历史产品口径，不恢复旧模型以获得 PASS。

## E1：本机基线完整门禁

| 运行                              | 权威结果                                                                   | 解释                                                                                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 默认代理文件系统沙箱内            | [退出记录](resumption-baseline-gate-2026-09-30.json)，exit 1               | 格式/lint/types、115 Contract、210 Prototype PASS；16 Electron 用例启动/renderer crash，最终 package 未执行。保留失败日志 `tests/resumption-baseline-2026-09-30.log`，不改源码掩盖。                  |
| 同一候选，单个 Electron 定向诊断  | exit 0 / 1 passed，`tests/resumption-electron-direct-probe-2026-09-30.log` | 明确使用同一 bundled Node，在代理文件系统沙箱外复验。应用 sandbox/contextIsolation/CSP 未改变。一次误选全局 pnpm 的诊断被取消，不算测试证据。                                                         |
| 同一候选，沙箱外完整 `pnpm check` | [退出记录](resumption-baseline-unsandboxed-gate-2026-09-30.json)，exit 0   | 19 files / 115 Contract、210 Prototype、16 Real Electron E2E 全部 PASS，最终 package smoke 完成。Node 24.17.0 / pnpm 11.19.0；仅对命令进程补入已有 `.bin` 和明确 runtime 路径。没有安装或改全局配置。 |

完整日志 `tests/resumption-baseline-unsandboxed-2026-09-30.log` 是本机忽略的中间日志；JSON 留存最终退出码和候选身份。不能外推后续新字段、迁移或 v2 前端已通过。

## 独立审阅与剩余门

- Luna `m2_candidate_audit` 只读审阅当前 catalog、路径/符号链接 containment、设置写入范围、IPC sender/参数、窗口安全、session store/IPC/close lifecycle。未发现明确绕过；按当前产品合同复核了固定入口、session 唯一、多会话、重开、关闭保留和 MRU fallback。两个窄测试补强待做：重复 CREATE_SESSION ID；已有但非当前会话从全部会话重开只 focus、不重复。
- Luna `m3_domain_requalification` 只读对照 M3-A 原规格与三个完整文件。四状态/动作、stale revision、ready 修改失效、重复确认、取消终态、溢出、不可变/JSON 已有覆盖，未发现明确纯域缺陷；可补跨状态 stale 和各动作输出隔离。`ready` 无执行权。该基线完整门禁包含现有 M3-A 测试；后续补测试需再留新鲜证据。
- **原生 picker 仍待当前构建人工复验 G1/G2/G3。** 原 dialog/catalog 业务语义未改，旧 PASS 原样保留；但主屏、会话持久化和启动/关闭路径变化，旧记录没有精确产物身份，不能直接继承当前可见结果。fixture E2E 不代替原生对话框。
- P12 连线与实点、最近活跃、上下文引用、v2 界面/Windows 全范围验收仍未完成。因此 M2/Workbench 不改 COMPLETE，目标继续 active。

## 下一项

在可复验的 v2 本机基线上施工 B1：纯活动合同 → 严格 v3 迁移 → 当前可信 IPC 查询 → 真实 Electron 重启查询证据。B2 共用迁移，顺序施工；本轮不扩大到模型调用、运行器或命令执行。
