# Issue #13 A09 真实 Provider 运行记录

evidenceKind = **real-provider**（合同 §6 固定字段）

## 环境与版本绑定

| 字段 | 值 |
| --- | --- |
| 软件 commit | `627f22b5c891c035051a5a40422929de1484dbd3`（运行时工作树的受跟踪文件与该提交一致；运行所用 `.webpack` 构建产自该提交） |
| dirty 状态 | 受跟踪文件干净；仅本地忽略目录（tmp/logs 等）存在 |
| 运行入口 | 开发入口（`electron apps/desktop`，forge webpack 产物）。打包成品内的真实 Provider 运行未自动化：`PIONEER_E2E` 隔离缝按设计仅在非打包构建生效，打包成品需原生目录选择器人工授权，留作后续人工项 |
| 开发入口构建摘要 | `.webpack/main/index.js` SHA-256 `4d8c55d2d8514eea13f033dff3eb05c68f9ad81cbb017d7deef2ed84bef62ebf`；此前 A02 打包成品 `app.asar` SHA-256 `5de73088…8b57` 为工具接线前构建，不代表本次运行 |
| 平台 | Windows 11 x64（10.0.26200） |
| Node / Electron / pnpm / Pi | 终端 Node 24.17.0；Electron 44.2.0（应用内嵌 Node 24.20.0）；pnpm 11.7.0；`@earendil-works/pi-agent-core` 与 `pi-ai` 精确 1.4.0 |

## 授权

- 授权时间：2026-10-25（用户在会话中明确授权："A09 需要的模型用我环境变量里的 Deepseek v41f，材料随便你发"，随后在 ZCode 配置新 DSV4 key）。
- Provider / endpoint origin：DeepSeek，`https://api.deepseek.com`（HTTPS；凭证不出现在本记录——key `sk-…****2a2d` 保存于用户 ZCode provider 配置，运行时注入子进程环境变量 `DEEPSEEK_API_KEY`，不落盘、不入库）。
- 模型解析：用户指定 "v41f"（v4.1 flash）。DeepSeek 官方模型目录仅含 `deepseek-flash` 与 `deepseek-v4-pro`（`v4.1-flash` 仅存在于第三方网关目录）；按 flash 家族意图解析为 **`deepseek-flash`** 并在此如实记录。若需精确 `deepseek-v4.1-flash`，须改经相应网关另行授权。
- 外发材料清单（用户授权实施者选定）：两轮任务文本（见下）+ fixture 工作区 `tests/fixtures/workspaces/library/alpha-app` 内 `README.md`、根目录列表、`nested/not-a-project.txt` 文件名。无其它外发。

## 运行记录

会话 `session:f3309b91-2842-48e5-a7e6-74ca41e2b577`，projectId `e23d4c6e…a98d`，revision 1，adapter `pi`，windowEpoch 1。

### Run 1（completed，含真实只读工具结果）

| 字段 | 值 |
| --- | --- |
| runId | `run:301d241881af9d2e2a84e5b94795d528` |
| 开始（UI 启动点击后受理） | 2026-10-25T02:05:09.654Z（journal accept at） |
| 任务摘要 hash | `b254c2790097215a49a6cb55af0df7d0d775e3a5c71d9747afab4e09bb936a58`（任务："读取 alpha-app 项目里 README.md 的内容，先用 read_file 工具查看原文，再用一到两句话告诉我这个项目是什么。"） |
| 工具调用 | 模型发起 4 次：① `read_file alpha-app/README.md` → 拒绝 `PATH_UNAVAILABLE`（项目根即 alpha-app，模型路径重复——预检正确拒绝且未泄露绝对路径）；② `list_directory .` → `nested/ package.json README.md`；③ `list_directory nested` → `not-a-project.txt`；④ `read_file README.md` → 成功，返回真实内容 `# Alpha app / An alpha application fixture.`（模型据此自行纠正路径并用中文作答） |
| 本地收敛（journal terminal） | 2026-10-25T02:05:13.822Z，status `completed`，lastSeq 14 |
| input/output tokens | null（适配器未读取 usage，按合同记 null，不填零） |

### Run 2（stopped，运行中途停止）

| 字段 | 值 |
| --- | --- |
| runId | `run:4304841231b3cdd55448f38725eeb765` |
| 开始 | 2026-10-25T02:05:14.239Z（任务："请用中文写一份约 800 字的报告……"） |
| 停止请求 | 2026-10-25T02:05:14.399Z（UI 停止按钮，启动后约 160ms，落在首轮模型请求进行中；尚未产出任何文本） |
| 本地收敛 | 2026-10-25T02:05:14.402Z，status `stopped` |

## 不变量

- fixture 树前后 SHA-256 一致（`1bceca98…`，全文哈希存 `tmp/issue13/a09-fixture-before.txt`）：**PASS**。
- Chromium 配置隔离：`PIONEER_E2E_USER_DATA` 独立目录（`tmp/issue13/a09-user-data`）；未读取/修改用户全局配置与凭证。
- 事件/日志不含凭证或绝对路径正文（工具拒绝仅返回固定错误码；journal 仅含摘要 hash）。

## 证据文件（本地，不入库）

`tmp/issue13/a09-report.json`（完整时间线 + 面板转录 + journal）、`a09-run1-complete.png`、`a09-run2-stopped.png`、驱动脚本 `a09-run.mjs`。驱动为一回性证据脚本，非仓库测试资产。
