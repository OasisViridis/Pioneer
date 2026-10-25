# Issue #13 验证记录：P2 只读 Harness 接入

核对日期：2026-10-24。来源：[Issue #13](https://github.com/OasisViridis/Pioneer/issues/13)。基线为 PR #15 运行合同 v1 及其 2026-10-24 停止语义修订（`stopping → stopped/failed(固定错误码)`，`unknown` 仅作崩溃/重启墓碑）。分支：`codex/issue13-readonly-harness`（自 `origin/main` `0410d5a`）。

## 交付范围

| 模块 | 内容 |
| --- | --- |
| 合同修订 | `pioneer-run.ts` 新增 `STOP_TIMEOUT`/`ADAPTER_DISCONNECTED` 失败码；`run.unknown` 收窄为仅 `host_restarted`；合同 §2/§3/§4 同步修订；PR#15 协议探针改为 force-end 语义 |
| main 运行层 | `run-manager.ts`（串行 admission、单次 grant、容量上限、事件 seq/环形缓冲/订阅 ACK、停止宽限与强制结束、120s 总时限）、`run-journal.ts`（userData 有界原子日志 + host_restarted 墓碑恢复）、`run-ipc.ts`（固定通道 + 可信 sender 校验） |
| 适配器 | `adapter-seam.ts`（main 私有 HarnessAdapter seam）、`controlled-adapter.ts`（JSON 脚本化受控模型，仅测试启动配置注入）、`pi-adapter.ts`（`@earendil-works/pi-agent-core` + `pi-ai` 精确 1.4.0，预置 provider 表，无凭证不启动） |
| 只读工具 | `read-only-tools.ts` 执行器：read_file 64 KiB、list_directory 200 项、search 深度 16/1000 文件/64 KiB 每文件/4 MiB/100 hits，前后身份复检，二进制/链接/敏感路径拒绝 |
| UI | `run-view.ts` + `RunPanel.tsx`：五种可见状态（运行中/正在停止/已停止/已完成/失败+错误码），停止按钮自身承担「停止中…」即时反馈；`shared/contracts/intent-workspace.ts` 合并 P1 结构与 PR#8 lifecycle 保护 |
| P1 整合 | 继承工作树 P1 资产窄范围并入本分支（会话工作台、会话持久化、窗口生命周期），按 [issue12 核对记录](issue12-input-reconciliation.md) 的兼容规则合并 |

## 验证证据

| 项 | 命令/位置 | 结果 |
| --- | --- | --- |
| Contract Tests（含新增 run-manager 13 项、工具执行器 8 项、受控适配器 6 项、修订探针） | `pnpm test:contract` | 339/339 通过（2026-10-24） |
| Real E2E（受控适配器注入、真实文件 IO、fixture 前后哈希、隔离 userData） | `pnpm test:e2e` | 24/24 通过（1.2m；含 p2-run 3 项：完成+工具结果、停止、停止后重启） |
| Pi 依赖固定 | `apps/desktop/package.json` `@earendil-works/pi-agent-core@1.4.0`、`@earendil-works/pi-ai@1.4.0`（精确版本） | webpack 打包成功（Pi 以 chunk 形式进入 main bundle） |
| A02 开发入口探针 | `PIONEER_PI_PROBE_OUT` | `{"ok":true,"stage":"release","piAiVersion":"1.4.0","nodeVersion":"v24.20.0"}`（`tmp/issue13/pi-probe-dev.json`） |
| A02 打包成品探针 | `electron-forge package` 产物 + 同一探针（脱离源码目录、asar 打包） | `{"ok":true,"stage":"release","piAiVersion":"1.4.0","nodeVersion":"v24.20.0"}`（`tmp/issue13/pi-probe-packaged.json`） |
| 打包成品完整性 | `app.asar` SHA-256 | `5de730882514e99ad6504356bbe3d245eccec4f0dd029b979ff14831dfda8b57`（33,897,641 字节） |
| A08 完整门禁（开发树） | `pnpm check` | 退出码 0（2026-10-24：格式/lint/类型、Contract 339/339、Prototype 210/210、Real E2E 24/24、package smoke；日志 `tmp/issue13/full-check-2.log`） |
| A08 干净检出复建 | 分支 `92824a4e738ae7095f40f14235cd3c10dbafc942` 的 detached worktree + `pnpm install --frozen-lockfile` + 完整 `pnpm check` | 退出码 0（2026-10-25；Contract 339/339、Prototype 210/210、E2E 24/24、打包冒烟；日志 `tmp/issue13/a08-clean-check.log`；本地专属未跟踪档案不参与构建） |
| 仓库规范化 | `pnpm verify:repository` | 6/6 通过 |

### 打包工具链修复记录（extract-zip）

`electron-forge package` 在本机 Node 24.17.0 下静默退出且不产出 `out/`，最小复现为 `extract-zip@2.0.1`（`yauzl@2.10.0` 的 `openReadStream` 回调在 Node 24 永不触发，`fs.open`/`fd-slicer` 单测均正常）。修复：pnpm `patchedDependencies` 将 win32 平台的 zip 解压委托给系统自带 bsdtar（`patches/extract-zip@2.0.1.patch`，可经 `PIONEER_BSDTAR_PATH` 覆盖路径；非 win32 平台显式报错提示移除补丁）。上游修复后应移除该补丁。

## A01—A09 状态

| 编号 | 状态 | 证据 |
| --- | --- | --- |
| A01 admission/容量/幂等/墓碑 | PASS（Contract） | `tests/contract/run-manager.test.ts`；墓碑恢复与 RUN_ACTIVE/REQUEST_CONFLICT/JOURNAL_UNAVAILABLE/STALE_REVISION 路径 |
| A02 Pi 加载/构造/释放 | 见运行记录 | 开发入口与打包成品探针；依赖精确 1.4.0 + 锁文件 |
| A03 事件顺序/订阅/分页 | PASS（Contract + E2E） | 事件序列、早到缓冲（started 前的适配器消息）、32 条分批、ACK 续推、gap 标记 |
| A04 停止/竞态/故障 | PASS（Contract + E2E） | 成功先于停止、停止先于成功、STOP_TIMEOUT 强制结束、RUN_DEADLINE、无活 unknown |
| A05 三工具真实 IO | PASS（Contract + E2E） | read_file/list_directory/search 真实临时目录与 fixture IO、预算/truncation、敏感/二进制/链接拒绝 |
| A06 文件不变量 | PASS（E2E） | fixture 前后哈希一致；E2E userData 隔离（PIONEER_E2E_ROOT/USER_DATA 不相交）；不读用户全局凭证 |
| A07 P1 整合 | PASS（Contract + E2E） | 313+ 合同测试含 P1 会话/持久化/意图流；E2E 覆盖会话恢复与意图修订；按需面板，不自动导航 |
| A08 门禁 | 见门禁记录 | `pnpm verify:repository`、完整 `pnpm check`、独立审阅 |
| A09 真实 Provider | **NOT_RUN** | 本机无已授权 Provider 凭证；按合同「缺少授权或未运行时记录未验证」保留待办。记录字段见下 |

## A09 NOT_RUN 记录（固定字段）

- evidenceKind = real-provider；结果 = NOT_RUN
- **2026-10-25 用户已授权**：Provider = DeepSeek，模型 = `deepseek-v4.1-flash`（用户口述 "Deepseek v41f"），外发材料授权 = 任务文本 + fixture 工作区 `tests/fixtures/workspaces/library/alpha-app` 的 `README.md`（由实施者选定）。
- **阻塞原因（凭证无效）**：环境变量 `DEEPSEEK_API_KEY`（`sk-` 前缀、35 字符、尾号 `****f04b`，与 Windows 用户级环境变量一致）被 DeepSeek 官方端点拒绝：`https://api.deepseek.com` 的 `/models`、`/chat/completions` 与 `/anthropic/v1/messages` 均返回 `authentication_error`（"Your api key: ****f04b is invalid"，含 request_id），直连与经本地代理（127.0.0.1:7897）结果一致。本机未运行 Ollama/本地网关（11434 等端口无服务），环境无 `DEEPSEEK_BASE_URL`/OpenRouter 等替代凭证。
- 解除阻塞需要任一：① 在 platform.deepseek.com 重新生成有效 key 并更新 `DEEPSEEK_API_KEY`；② 若该 key 属于某个兼容网关，提供其 base URL（配置 `PIONEER_PI_ENDPOINT`）；③ 若指本地部署，启动相应服务并告知端口。
- 软件 commit/dirty 状态：本分支 HEAD（见门禁记录）；包 SHA-256、平台与 Node/Electron/Pi 版本随打包成品记录补充。
- 后续待办：凭证修复后以 `PIONEER_PI_PROVIDER_ID=deepseek PIONEER_PI_MODEL_ID=deepseek-v4.1-flash PIONEER_PI_API_KEY_ENV=DEEPSEEK_API_KEY` 在桌面应用完成一次真实问答 + 只读工具结果 + 中途停止，并按合同 §6 固定字段补全记录。拒绝外发/无凭证/服务不可用分别记录原因与 NOT_RUN/FAILED。

## 停止语义修订对照

| 场景 | 修订前（PR#15） | 修订后（本分支） |
| --- | --- | --- |
| 停止宽限 5s 到期 | `unknown(stop_timeout)` 活状态，保留占位继续等待 | 主进程强制结束，`failed(STOP_TIMEOUT)`，无活 unknown |
| 适配器通道断连 | `unknown(adapter_disconnected)` | 走停止路径；宽限内收敛 `stopped`，否则 `failed(ADAPTER_DISCONNECTED)` |
| 崩溃/重启恢复 | unknown 占位等待确认 | `run.unknown(host_restarted)` 墓碑：不占资源、不等待、不自动重跑 |
| 用户可见结果 | 含「结果未确认」活状态 | 仅五种：运行中/正在停止/已停止/已完成/失败（附固定错误码） |
