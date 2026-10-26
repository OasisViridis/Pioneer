# README 一手事实核查 · 独立复核版（2026-10-26）

> 用途：为「按现行项目状态重写 README」提供可追溯证据。**只读调研，未改任何源码或文档。**

## 0. 碰撞说明与基线

### 0.1 碰撞（必须先读）

本工作树 `D:\Project\GitProject\Pioneer\.agents\worktrees\docs-readme-current-state` 在本次调研进行中**已被另一会话并发修改**：

| 时间 | 文件 | 变化 |
| --- | --- | --- |
| 20:07:15 | `README.md` | 已被重写为 115 行 / 8807 字节（`git status` 显示 `M README.md`） |
| 20:09:47 | `docs/research/2026-10-26-readme-source-audit.md` | 已存在一份 74 行的同名核查文件 |
| 20:09:55 | `docs/research/README.md` | 已加入该文件的索引行 |

按「不覆盖他人改动」的规则，**我没有覆盖那个同名文件**（写入被文件观察策略拒绝，随后确认内容确实来自另一会话），也没有改动 `README.md`。本文因此另起一个文件名，定位是**对同一问题的一手证据复核 + 对已有两份产物的逐条校对**。

> ⚠️ 并发写作仍在进行中：本文引用的重写版 README 内容取样自 2026-10-26 20:10 前后的磁盘状态，若该会话继续修改，行号与措辞可能变化——本文对重写版给的是**节标题 + 引文**，便于重新定位。

### 0.2 三种状态的判定口径（全文共用）

| 记号 | 含义 | 判定方式（可复现） |
| --- | --- | --- |
| **M（已合并 main）** | 已进入 `origin/main` | `git merge-base --is-ancestor <commit> origin/main` 退出码 0，或 `git ls-tree origin/main -- <path>` 有该文件 |
| **B（仅本分支）** | 提交在 `codex/issue13-readonly-harness`，`origin/main` 不含 | 同上反向判定 |
| **W（未提交工作树）** | 只存在于工作树/index，任何 ref 都没有 | `git status` 有改动，且 `git log --all -- <path>` 找不到对应提交 |

### 0.3 基线（命令输出原样）

```
$ git rev-parse --abbrev-ref HEAD        -> codex/issue13-readonly-harness
$ git rev-parse HEAD                     -> 395df15cd544d1d6f8bb8adb0fa292ff23f3c901  (2026-10-25 10:09)
$ git log -1 --format='%h %ci' main        -> 1ba2f6a 2026-10-24 00:17   （本地 main，落后）
$ git log -1 --format='%h %ci' origin/main -> fd26d06 2026-10-26 13:10
$ git merge-base --is-ancestor 395df15 origin/main ; exit 0     ← HEAD 已在 origin/main 之内
$ git rev-list --count 395df15..origin/main     -> 22            ← 但本项目 checkout 落后 22 个提交
$ git log --all --diff-filter=D --oneline -- apps/desktop/src/renderer/components/SessionIntent.tsx
  （空）                                                        ← SessionIntent 的删除不在任何提交里
$ git log origin/main --oneline | grep -i 'pull request #16'
  3f262fe Merge pull request #16 from OasisViridis/codex/issue13-readonly-harness
```

**本轮最容易被写错的前提**：`HEAD` 不是仓库最新状态。PR #16 **已经合并进 `origin/main`**（`3f262fe`），其后还有 7 轮 review 修复共 20 个提交与 PR #40（`fd26d06`）。本 checkout 的 harness 代码是 **review 前版本**：`origin/main` 多出 `apps/desktop/src/main/harness/text-budget.ts`，且 `run-manager.ts` 相对本 checkout 还有约 +457 行（`git diff --stat 395df15 origin/main -- apps/desktop/src`）。

### 0.4 本轮执行的命令（全部只读；未跑 install / build / check / Playwright 执行）

```powershell
git status --short; git branch -a; git log --oneline -15; git log origin/main --oneline -20
git ls-tree -r --name-only origin/main -- <paths>; git show origin/main:<file>
git diff; git diff --stat; git diff origin/main -- <file>
node -e "const s=require('./tests/prototype/test-cases.js'); ..."           # totalTests
node_modules\.bin\vitest.cmd run --config vitest.config.ts --reporter=dot  # 37 files / 339 tests / exit 0
node_modules\.bin\playwright.cmd test --config tests/e2e/playwright.config.ts --list   # 仅收集，不启动 Electron
Get-ChildItem / Select-String / 正则计数
```

`vitest` 与 `playwright --list` 都不启动 Electron、不产出 dist/coverage；`--list` 只做用例收集，不属于被禁止的重门禁。

---

## 1. 工作区与依赖事实

### 1.1 只有 `apps/*`，**不存在 `packages/`**

- `pnpm-workspace.yaml:1-3`：`packages: [apps/*]`，`nodeLinker: hoisted`。
- `Test-Path packages` → `False`；`apps/` 下只有 `desktop`，其包名 `@pioneer/desktop`。
- 排除 `node_modules`/`tmp`/`.private`/`.agents/worktrees` 后，受跟踪的 `package.json` 只有根与 `apps/desktop` 两份。

> README 不能写「monorepo 含 packages/ 共享包」。共享代码靠 `apps/desktop/src/shared/` 目录（`shared/contracts/*`、`shared/docking.ts`、`shared/runtime-session.ts` 等）。

### 1.2 根 `package.json`（`package.json:1-41`）

| 字段 | 值 | 位置 |
| --- | --- | --- |
| name / version / private / license | `pioneer` / `0.1.0` / `true` / `MIT` | `:2-5` |
| packageManager | `pnpm@11.7.0` | `:6` |
| engines.node | `>=24` | `:7-9` |
| scripts | 见 §3.5 | `:10-26` |
| devDependencies | `@playwright/test 1.62.1`、`typescript 6.0.3`、`vitest 5.0.0`、`@vitest/coverage-v8 5.0.0`、`eslint 10.9.1`、`prettier 3.9.6`、`@types/node 24.13.3`、`eslint-plugin-react 7.37.5`、`eslint-plugin-react-hooks 7.1.1`、`globals 17.12.0`、`@typescript-eslint/* 8.69.0`、`@eslint/compat 2.1.1` | `:27-41` |

`pnpm-workspace.yaml:4-14` 使用 `minimumReleaseAgeExclude`、`allowBuilds`、`patchedDependencies`（`patches/extract-zip@2.0.1.patch`）——pnpm 10/11 时代配置，是判断 pnpm 下限的一手依据。

### 1.3 `apps/desktop/package.json` 真实依赖（`:1-33`）

运行时 5 个，全部精确版本（无 `^`/`~`）：

| 依赖 | 版本 | 代码用途 |
| --- | --- | --- |
| `@earendil-works/pi-agent-core` | `1.4.0` | `new core.Agent(...)`，`src/main/harness/pi-adapter.ts:273-286` |
| `@earendil-works/pi-ai` | `1.4.0` | `createModels`/`streamSimple`/provider 表/TypeBox，`pi-adapter.ts:98-113,126-154,279` |
| `react` | `19.2.8` | `src/renderer/index.tsx:1` |
| `react-dom` | `19.2.8` | 同上 |
| `zod` | `4.5.4` | 契约校验，`src/shared/contracts/*`、`src/main/ipc.ts:95` |

devDependencies 关键项：`electron 44.2.0`、`@electron-forge/{cli,plugin-webpack,plugin-fuses} 7.11.2`、`@electron/fuses 2.1.3`、`webpack 5.110.3`、`ts-loader 9.6.2`、`typescript 6.0.3`、`@types/react 19.2.18`、`@types/react-dom 19.2.7`、`copy-webpack-plugin 14.0.0`、`css-loader 7.1.5`、`style-loader 4.0.0`、`html-webpack-plugin 5.6.8`（`:18-33`）。

工程入口：`main: ".webpack/main"`（`:5`）、`start: electron-forge start`（`:7`）、`build: electron-forge package && node scripts/prepare-source-launch.cjs`（`:8`）、`typecheck: tsc --noEmit`（`:9`）。Forge 的 renderer entryPoints = `src/renderer/index.html` + `src/renderer/index.tsx` + `src/preload/index.ts`（`apps/desktop/forge.config.ts:52-70`），并启用 fuses（`:71-80`：`OnlyLoadAppFromAsar`、`EnableEmbeddedAsarIntegrityValidation` 等）。

### 1.4 lockfile 复核（`pnpm-lock.yaml`）

| 包 | specifier → 解析版本 | 位置 |
| --- | --- | --- |
| electron | `44.2.0` → `44.2.0`（engines `node >= 22.12.0`） | `:96-98`、`:1598-1600` |
| react / react-dom | `19.2.8` → `19.2.8` | `:62-67`、`:3307` |
| zod | `4.5.4` → `4.5.4` | `:68-70`、`:4193` |
| typescript | `6.0.3` → `6.0.3`（另有传递依赖 `5.4.5`） | `:47-49`、`:108-110`、`:3839` |
| vitest | `5.0.0` → `5.0.0` | `:50-52` |

lockfile 头：`lockfileVersion: '9.0'`（`:1`）。本机实测：`node --version` = `v24.17.0`；`pnpm --version` = `11.7.0`。

---

## 2. 入口真实形态：谁在渲染，谁只是候选

### 2.1 唯一入口是 `App.tsx`

- `src/renderer/index.tsx:3,15`：`import { App } from './App'` → `createRoot(...).render(<App />)`；根 DOM 为 `index.html` 的 `#root`。
- 结构（`src/renderer/App.tsx`）：

| 区域 | 组件 | 行 |
| --- | --- | --- |
| 顶层 Tab 条 | `SessionTabStrip` | `:41` |
| `library` 页 | `ProjectLibrary` + `SessionList`（最近会话） | `:42-63` |
| `settings` 页 | `SettingsView` | `:64-79` |
| 会话页 | `SessionWorkbench`（`key=session.id`） | `:80-94` |
| 保存状态条 | `persistence-footer`（保存中/已保存/失败重试） | `:95-111` |
| 项目 → 新建会话弹层 | `Modal` + `SessionList` | `:129-162` |
| 关闭前保存弹层 | `Modal` | `:163-202` |

`SessionWorkbench` 之下：`SessionTitle`、`PanelMenu`、`DockSurface`、`Conversation`、`WorkbenchPanel`（`SessionWorkbench.tsx:9-13,123-141`）。

### 2.2 真实挂载树

```
index.tsx → App
  ├─ SessionTabStrip
  ├─ ProjectLibrary → ProjectPoster（.poster-grid，ProjectLibrary.tsx:133-142）+ CatalogNotice
  ├─ SessionList
  ├─ SettingsView → CatalogNotice
  ├─ SessionWorkbench
  │    ├─ SessionTitle / PanelMenu / 布局提示条
  │    └─ DockSurface → PanelMenu / ResizeHandle / Modal
  │         ├─ Conversation → HazelCompanion / RunPanel
  │         └─ WorkbenchPanel → ProjectOverview / LocalTabs
  └─ Modal（项目弹层、关闭弹层）
```

### 2.3 **从未被 import 的本地候选**（`grep` 全仓库零引用，仅定义行）

| 文件 | 证据 |
| --- | --- |
| `components/ProjectWorkspace.tsx` | `grep '(HazelMark\|ProjectWorkspace\|WindowChrome\|TabStrip)'` 仅命中定义 `:10,102,104` |
| `components/TabStrip.tsx` | 仅定义 `:11,22,25`；入口用的是 `SessionTabStrip`（`App.tsx:6,41`） |
| `components/WindowChrome.tsx` | 仅定义 `:7`；`tests/` 内零命中 |
| `components/HazelMark.tsx` | 仅定义 `:2` |

二手文档与代码一致：`PROJECT.md:30` — "The active renderer uses `SessionWorkbench` … `ProjectWorkspace` remains unmounted legacy reference; `WindowChrome` is still a later-stage candidate."

### 2.4 各主题真实状态

| 主题 | 真实状态 | 证据 |
| --- | --- | --- |
| Tabs | 已接入（**会话级** Tab，非项目级）；`library`/`settings` 为保留页 | `App.tsx:41-94`；`SessionTabStrip.tsx:13`；`renderer/state/tabs-reducer.ts`；`tests/contract/tabs-reducer.test.ts` |
| 海报墙 | 已接入：种子色封面、相对更新时间、搜索过滤、Rescan/Change workspace | `ProjectLibrary.tsx:34-46,133-142`；`ProjectPoster.tsx:31-45`；`hooks/use-catalog.ts` |
| Dock 布局 | **已接入且有测试**：两列、拖拽换列/换位、列比例与面板权重、隐藏/恢复、窄窗 compact、面板放大 | `SessionWorkbench.tsx:123`；`DockSurface.tsx:62-80`；`shared/docking.ts:10-122`；`tests/contract/docking.test.ts`；`tests/e2e/p1-session.e2e.spec.ts:181` |
| Dock **未实现** | 只有固定两列：无「拆分为新分组」、无「同组内 Tab 叠放」 | `shared/contracts/session-workspace.ts` 的 `DockLayout.columns` 为 `[DockPanelId[], DockPanelId[]]`；`docking.ts:31-49,58-83` |
| RunPanel | **已接入**，收在 `Conversation` 的 `<details class="run-log">` 折叠区（默认收起） | `Conversation.tsx:44-54`；`RunPanel.tsx:16` |
| Conversation | 已接入；输入框只 `SAVE_MESSAGE`（**不发模型**），消息文案 "已保留 · 尚未发送" | `Conversation.tsx:21-24,87,98-103,142-144` |
| SessionIntent（意图卡） | **W 删除；M/B 保留且是运行前置** | `git ls-tree origin/main -- .../SessionIntent.tsx` 存在；`git show origin/main:.../RunPanel.tsx` 仍含 `intentState.phase==='session' && runtime!==null`；`git log --all --diff-filter=D` 为空 |
| 面板成熟度 | 上下文=真实项目概览；能力=写死"未连接/未提供/未授权"；改动=空状态；产物=三个空状态页签 | `WorkbenchPanels.tsx:34-58,60-68,69-104` |
| UI 语言 | **中英混排**：`ProjectLibrary`（"Project library / Rescan / Change workspace / Search projects / No project directories were found."）、`SettingsView`（"Settings / Current workspace / Application version / Build mode"）为英文，会话区为中文 | `ProjectLibrary.tsx:84,97,99,105,123,146-147`；`SettingsView.tsx:31-45` |

### 2.5 `SessionIntent` 删除的确切含义

- M/B：`Conversation` 渲染 `<SessionIntent>`；运行按钮仅在意图 READY 且 RuntimeSession 已初始化后出现；文案「运行器尚未连接」。
- W：不再渲染意图卡；`RunPanel` 自带「运行任务」文本框 + 单次「启动运行」；文案「运行器默认不启动」（`Conversation.tsx:73-76`、`RunPanel.tsx:77-99`）。
- **一键启动仍连发 5 个意图动作** `RESET → SET_INSTRUCTION → SUBMIT → CONFIRM → BOOTSTRAP_SESSION`（`RunPanel.tsx:40-49`）⇒ 去掉的是"必经的中间摘要卡"这一 UI，**状态机仍在**。
- **main 的 run 层不依赖 RuntimeSession/intent**：`grep 'runtimeSession|RuntimeSession|intent' src/main` 只命中 3 条无关注释（`app-window-lifecycle.ts:16`、`runtime-config.ts:50`、`window-controls.ts:166`）。运行授权独立走 `run:authorize → run:start`。
- W 同时删掉 1 个 E2E 用例（断言 `capabilities = {modelAccess:false, toolExecution:false, fileMutation:false}`）与 1 个 spec 文件（2 个用例），并少 1 条 `playwright.config` 白名单。

---

## 3. 测试清单与口径（真实命令输出）

### 3.1 Contract：**37 文件 / 339 用例**（实测，exit 0）

```
$ node_modules\.bin\vitest.cmd run --config vitest.config.ts --reporter=dot
 Test Files  37 passed (37)
      Tests  339 passed (339)
   Duration  2.69s
$ $LASTEXITCODE -> 0
```

- 范围：`vitest.config.ts:5` → `include: ['tests/contract/**/*.test.ts']`；`Get-ChildItem tests\contract -Filter *.test.ts` = 37。
- **静态正则会低估**：`^\s*(it|test)\(` = 262、`expect(` = 842；原因是有 11 个 `it.each([...])`（`pioneer-run.test.ts:196,272`、`read-only-tool-policy.test.ts:17,32,64,230,294,321`、`runtime-config.test.ts:36`、`pioneer-run-launch.test.ts:42` 等）会展开成多用例。⇒ **用例数 339 ≠ 断言数 842**。
- `pnpm test:contract` 是两步：`tsc --noEmit -p tsconfig.tests.json` 然后 `vitest run`（`package.json:22-23`）；339 只是第二步。

### 3.2 Real E2E：门禁只跑 **7 spec / 21 用例**；目录内实有 **10 spec / 39 用例**

```
$ node_modules\.bin\playwright.cmd test --config tests/e2e/playwright.config.ts --list
Total: 21 tests in 7 files
```

`tests/e2e/playwright.config.ts:5-13` 的 `testMatch` 白名单只有 7 个文件。**以下 3 个 spec 永不被 `pnpm test:e2e` / `pnpm check` / CI 执行**：

| 未纳入门禁 | 用例 | expect |
| --- | --- | --- |
| `window-chrome.e2e.spec.ts` | 9 | 43 |
| `session-persistence.e2e.spec.ts` | 6 | 49 |
| `hazel-design.e2e.spec.ts` | 3 | 48 |
| 合计 | **18** | **140** |

门禁内 7 个：`pioneer` 1、`tab-strip` 1、`catalog-state` 4、`offline-fonts` 1、`p1-session` 6、`session-lifecycle` 5、`p2-run` 3 = **21**，与 `--list` 一致。

W 的改动把 `m3-intent.e2e.spec.ts` 从白名单删除并删掉该文件（HEAD 版本含 **2** 个用例），另删掉 `p1-session` 的 **1** 个用例（`git diff -- tests/e2e/{playwright.config.ts,p1-session.e2e.spec.ts,m3-intent.e2e.spec.ts}`）。⇒ 2026-10-24 记录的 **E2E 24/24** = 21（当前）+ 2 + 1，口径自洽（`docs/testing/issue13-verification.md:21`）。

### 3.3 `210` 的确切口径：**用例数，不是断言数**

```
$ node -e "const s=require('./tests/prototype/test-cases.js'); ..."
title=Pioneer Desktop Task Assistant Prototype Test Suite
totalTests=210   cases=210   tiers={tier1:90,tier2:90,tier3:20,tier4:10}   # 90+90+20+10=210
```

- `totalTests` = `TEST_CASES.length`；运行器 `for (const tc of TEST_CASES)` 逐个 `await tc.run(ctx)`，抛错即失败 ⇒ **一个用例内部可含多次断言**。
- 断言量级（静态正则，未去重）：`assertEqual(` **228** 处、`assert(` **63** 处、`throw new Error` 10 处。⇒ 说「210 条断言」是错的。
- `tests/prototype/verify-prototype.js:162` 的 "ALL **210** PROTOTYPE TESTS PASSED" 是**硬编码字面量**，不随 `suite.totalTests` 变化；真正判定在 `:92`（阈值 `< 207`）与 `:125`（打印 `suite.totalTests`）。引用 210 必须引 `suite.totalTests`。
- 该套件自带的 `PioneerContractSimulator` 模拟的是退役的 `input/review/output/custom` 场景（`test-cases.js` 顶部 `this.scenes = [...]`）；`TEST_INFRA.md:10,19` 自陈 "not Electron proof" ⇒ **不能当 Electron/产品证据**。
- `pnpm test:prototype` 实际跑 4 个脚本（`package.json:20`）：`verify-prototype.js`、`adversarial-probes.js`、`adversarial-stress-probe.js`、`link-details-probe.js`。

### 3.4 `tests/repository`：6 个 `node:test` 用例

`tests/repository/normalization.test.mjs` 中 `^test(` = 6；入口 `package.json:18`（`node --test tests/repository/normalization.test.mjs`）。

### 3.5 `pnpm check` 实际执行链（`package.json:25`）

```
pnpm check
├─ format:check   prettier --check apps/desktop tests/contract tests/e2e tests/helpers package.json pnpm-workspace.yaml eslint.config.mjs vitest.config.ts   (package.json:14)
├─ lint           eslint apps/desktop/src tests/contract tests/e2e *.config.*                                                                            (package.json:15)
├─ typecheck      pnpm --filter @pioneer/desktop typecheck → tsc --noEmit                                                                                 (:16 / apps/desktop/package.json:9)
├─ test:contract  tsc --noEmit -p tsconfig.tests.json && vitest run --config vitest.config.ts                                                             (:23)
├─ test:prototype verify-prototype.js && adversarial-probes.js && adversarial-stress-probe.js && link-details-probe.js                                    (:20)
├─ test:e2e       pnpm build:desktop && playwright test --config tests/e2e/playwright.config.ts                                                            (:24)
└─ package:smoke  pnpm --filter @pioneer/desktop build  (electron-forge package + prepare-source-launch.cjs)                                               (:17 / apps/desktop/package.json:8)
```

三条推论（README 容易写错）：

1. `pnpm check` **含两次打包**（`test:e2e` 内一次、`package:smoke` 再一次）。
2. `format:check` **不含** `tests/prototype`、`docs/`、`README.md` ⇒ README 排版不受门禁保护。
3. `pnpm check` 的 E2E 只跑 21 个用例，不是目录里全部 39 个。

CI：`.github/workflows/quality.yml:22,45,60,63,69` 依次 `verify:repository` → `test:prototype` → `test:e2e` → `pnpm check`；`m2-quality.yml:39,42` 是遗留门禁。

---

## 4. P2 / Issue #13 三分法

| 能力 | M | B | W | 证据 |
| --- | --- | --- | --- | --- |
| 运行合同 + 8 条 `run:*` 通道 | ✅ | — | — | `src/shared/contracts/run-ipc.ts:14-23`；`git ls-tree origin/main` 含 `run-manager.ts`/`run-journal.ts`/`run-ipc.ts` |
| 受控适配器（仅 E2E 启动注入） | ✅ | — | — | `src/main/harness/controlled-adapter.ts`；`run-host.ts:83-99` |
| Pi 适配器 + 三只读工具桥接 | ✅ | — | — | `pi-adapter.ts:168-231`（`buildReadOnlyTools`）、`:273-286`、`:283-285`（systemPrompt 限定只能用三个只读工具） |
| 三只读工具执行器（预算 + 前后身份复检） | ✅ | — | — | `read-only-tools.ts:21-30`（64KiB / 200 项 / 深度 16 / 1000 文件 / 4MiB / 100 hits）、`:78-105` |
| 只读预检策略（9 类拒绝码） | ✅（#11） | — | — | `read-only-tool-policy.ts:19-35,79-158`；`shared/contracts/read-only-tools.ts:3-7,37-47` |
| 运行面板 5 种可见状态 | ✅ | — | — | `renderer/state/run-view.ts:431-451`；`RunPanel.tsx:10-15` |
| 意图卡作为运行前置 | ✅ | — | **W 删除 UI** | `git ls-tree origin/main -- .../SessionIntent.tsx` 存在；W 的 `Conversation.tsx` 无该 import |
| 直接输入任务并一键启动 | ❌ | ❌ | ✅（仅 W） | `RunPanel.tsx:37-57,77-99` |
| 写入 / 命令 / 通用 FS IPC / Runtime 子进程 | ❌ | ❌ | ❌ | 见 §4.2 |

> 一句话：P2 的"真实只读 Harness"在 `origin/main` 已是**已合并、已 review、有真实 Provider 运行记录**的状态；本 checkout 落后 22 个提交；W 的意图卡移除与直接任务输入是**未提交、未 review、未合并**的第四条支线。

### 4.1 证据文件（`docs/testing/`）

| 记录 | 位置 | 关键内容 |
| --- | --- | --- |
| Issue #13 验证 | `docs/testing/issue13-verification.md:20-28` | Contract 339/339；E2E 24/24；A02 探针 `{"ok":true,"stage":"release","piAiVersion":"1.4.0"}`；A08 `pnpm check` exit 0；`verify:repository` 6/6 |
| A01–A09 状态 | `issue13-verification.md:36-46` | A05 三工具真实 IO PASS；A06 文件不变量 PASS；**A09 真实 Provider PASS（开发入口）** |
| A09 明细 | `docs/testing/issue13-real-provider.md:9-14,25-51` | 软件 commit `627f22b`；DeepSeek `https://api.deepseek.com`；模型解析为 `deepseek-flash`；Run 1 completed（4 次真实工具调用，1 次被 `PATH_UNAVAILABLE` 正确拒绝、未泄露绝对路径，模型自行纠正）；Run 2 stopped（启动后约 160ms、无文本产出）；fixture 前后哈希一致 |
| A09 边界 | `issue13-real-provider.md:11` | 打包成品内的真实 Provider 运行**未自动化**，"留作后续人工项" |
| 打包链路修复 | `issue13-verification.md:30-32` | `extract-zip@2.0.1` 在 Node 24 静默失败 → `patches/extract-zip@2.0.1.patch` 委派 bsdtar |

> 这些记录本身也有过期表述：`issue13-verification.md:3` 写「基线 … `origin/main` `0410d5a`」，当前 `origin/main` 已是 `fd26d06`。

### 4.2 仍关闭的能力：逐条证据

| 能力 | 关闭证据 |
| --- | --- |
| 写入 | 只读工具枚举仅 3 个（`shared/contracts/read-only-tools.ts:3-7`）；`read-only-tools.ts:1` 只 import `lstat/readdir/readFile`；`src/main` 的 `writeFile` 全用于**应用自身 userData**（`settings-store.ts:63`、`session-state-store.ts:138`、`run-host.ts:38`、`index.ts:252` 探针），无面向项目目录的写通道 |
| 命令 / 子进程 | `grep 'child_process|spawn(|execFile' apps/desktop/src` → **0 命中** |
| 通用 FS IPC | `IPC_CHANNELS` 只有 3 个**无参**通道（`shared/contracts/ipc.ts:5-9`）；`ipc.ts:11` 注释 "Every catalog IPC request is deliberately payload-free"；`:100-131` 三个 handler 全过 `EmptyIpcRequestSchema`；`preload/index.ts:7-18` 只暴露白名单 API；`run-ipc.ts:140` 明写 "It grants no direct adapter, Node, or file access." |
| Runtime 子进程 | 无启动外部 runtime 的代码；`pi-adapter.ts:273` 在 **main 进程内** `new core.Agent(...)` |
| 产品级自述 | `WorkbenchPanels.tsx:44-58` — "Agent 运行器：未连接 / 执行命令：未提供 / 写入工作区：未授权"；`Diff` 面板 `:66` "运行器尚未接入，没有执行命令或修改文件" |

> ⚠️ **语义精度**（写 README 必须二选一，不能含糊）：`RuntimeSession.capabilities` 三项被**硬编码为 `false` 字面量**（`shared/runtime-session.ts:25-29`；schema `z.literal(false)`，`shared/contracts/runtime-session.ts:32-34`），**而** P2 run 层已在显式授权下真实调用模型并执行 3 个只读工具。这是两套并行记账：P1 的 RuntimeSession 记"会话初始化时的能力快照"，P2 的 run 授权走独立一次性 grant。准确说法是「**模型与 3 个只读工具在显式授权下可用；写入、命令、通用 FS IPC、Runtime 子进程仍关闭**」——写"能力全部关闭"或"模型已全面接通"都会与一侧冲突。
>
> 另：A09 记录里「凭证 … 运行时注入子进程环境变量」（`issue13-real-provider.md:19`）与代码不符——代码是 main 进程内读 `environment[config.apiKeyEnv]`（`pi-adapter.ts:74,246`），全程没有子进程。该措辞不要照搬进 README。

---

## 5. 旧 `README.md`（121 行）逐节偏差

判定：**过时** / **无证据** / **夸大** / **仍准确**。

| # | 节 · 行 | 原句摘要 | 一手证据 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | H1 副标 L3-4 | "模块化 AI Agent 桌面工作台 … 像专业 IDE 一样自由停靠面板" | 停靠已实现但只有固定两列（`DockSurface.tsx:62-80`、`docking.ts:31-49`） | 夸大（轻）：把"两列停靠"说成 IDE 级自由停靠 |
| 2 | L6 链接组 | Figma 原型 / Figma 设计稿 / `apps/desktop/` / `选题收敛说明.md` | 本地两项 `Test-Path` = `True`；两个 Figma 链接**网络不可达，未证实** | 部分未证实 |
| 3 | 核心特性 1 · L24-26 | "媒体库式项目海报墙 … 点击即可快速检索、切换并进入工程上下文" | `ProjectLibrary.tsx:133-142`、`ProjectPoster.tsx:31-45`、`App.tsx:129-162` | 仍准确 |
| 4 | 核心特性 2 · L30 | "跨重启会话恢复已有本地候选代码，待与新工作台整合" | 早已接入且有 E2E：`main/session-state-store.ts`、`App.tsx:28-35,95-111`、`tests/e2e/p1-session.e2e.spec.ts:54`、`tests/contract/session-state-store.test.ts` | **过时 + 严重低估** |
| 5 | 核心特性 2 · L28-30 | "类似现代浏览器的顶部标签页" | 实为会话 Tab 条 + library/settings 保留页（`App.tsx:41-94`），无 `WindowChrome` 接入 | 夸大（措辞） |
| 6 | 核心特性 3 · L34 | "停靠算法与组件已有本地候选，当前 `main` 入口尚未接入" | 已接入：`SessionWorkbench.tsx:123`；`DockSurface.tsx` 378 行；`tests/contract/docking.test.ts`；`p1-session.e2e.spec.ts:181` | **过时 + 与事实相反** |
| 7 | 核心特性 3 · L34 | "目标支持拖拽拆分、重叠分组、收起与复原" | 收起/复原 ✅（`docking.ts:84-99`、`DockSurface.tsx:45`）；拖拽换列/换位 ✅；拆分新组 / 同组叠 Tab ❌ | "目标"措辞可接受，但需明说只有两列 |
| 8 | 核心特性 4 · L38 | "Pioneer **计划复用** Pi Agent Harness" | 已精确版本依赖并接线：`apps/desktop/package.json:12-13`、`pi-adapter.ts:234-325`、`run-host.ts:100-112` | **过时** |
| 9 | 核心特性 4 · L40 | "意图卡 … 不是所有任务开始前的必经关卡" | M/B：**是必经关卡**（`origin/main` 的 `RunPanel` 需 `intentState.phase==='session' && runtime!==null`）；W：已去掉卡片 | M 期相反 / W 期成立（须选基线并注明 W 未提交） |
| 10 | 核心特性 5 · L46 | "去除花哨的无意义动效与装饰性插画" | 代码有整套 Hazel 装饰资产并在 UI 渲染：`assets/hazel/` 12 个文件、`Conversation.tsx:67-69` 渲染 `HazelCompanion`、`hazel-design.e2e.spec.ts` 专测装饰 | **自相矛盾**（应限定为"装饰不承担状态/审批语义"，`docs/specs/2026-10-24-…md:146` 即此写法） |
| 11 | 核心特性 5 · L46 | "清晰的中文字体排版阶梯" | `assets/fonts/NotoSansSC/NotoSerifSC-Variable.woff2`、`styles/fonts.css`、`styles/tokens.css`、`tests/e2e/offline-fonts.e2e.spec.ts:11` | 仍准确（但 UI 中英混排，见 #12） |
| 12 | 全篇 | 中文工作台 | `ProjectLibrary.tsx:84,97,99,105,123,146-147`、`SettingsView.tsx:31-45` 为英文 | 产品一致性问题；README 不应宣称"全中文" |
| 13 | 开发进度 · L52 | "P0 与 P1 已通过完整门禁，**下一片 P2 真实只读 Harness**" | P2 已合并（`origin/main` 含 harness/run 层）；A09 PASS（`issue13-verification.md:46`） | **过时** |
| 14 | 状态表 · L56 | "主线：只读扫描、海报墙、会话 Tabs、草稿／**意图**／停靠布局保存与重启恢复" | 除"意图"外均有测试；"意图"在 W 中已从 UI 移除，但 `intentState` 仍在数据层（`session-workspace-reducer.ts:139-152`） | 部分过时（按基线二选一） |
| 15 | 状态表 · L57 | "TypeScript/Zod IPC、受限 preload、意图修订与本地 RuntimeSession 初始化" | `ipc.ts`、`preload/index.ts`、`shared/runtime-session.ts:9-33`、`tests/contract/{ipc,security,session-preload,runtime-session}.test.ts` | 仍准确（注意 capabilities 恒 false，见 §4.2） |
| 16 | 状态表 · L58 | "Pi 底座方案与接入边界**已设计**"；Roadmap 列"优先接通一条真实只读任务" | 已实现并合并：`pi-adapter.ts`（325 行）、`read-only-tools.ts`（265 行）、`run-host.ts`；A09 真实运行 | **严重过时** |
| 17 | 状态表 · L59 | "完整的 Figma Design 视觉规范与高保真可交互原型" | 仓库内仅 `docs/design/*`、`design-specs/`；Figma 本体**未证实** | 未证实 |
| 18 | 技术架构 · L67 | "Electron 44 + React 19 + TypeScript" | 44.2.0 / 19.2.8 / 6.0.3（`apps/desktop/package.json:14,27,31`；`pnpm-lock.yaml:96-98,62-67,47-49`） | 仍准确（宜补精确版本） |
| 19 | 技术架构 · L68 | "Electron Forge + Webpack 5" | 7.11.2 / 5.110.3（`apps/desktop/package.json:19-21,32`；`forge.config.ts:52-70`） | 仍准确 |
| 20 | 技术架构 · L69 | "Zod（运行时 IPC 契约强校验，严格隔离主进程与受限 preload）" | `zod 4.5.4`；`ipc.ts:65-79,95-97,105-108`；`preload/index.ts`；`tests/contract/{ipc,security}.test.ts` | 仍准确 |
| 21 | 技术架构 · L71 | "Vitest 覆盖窗口生命周期、草稿保存队列与停靠状态" | `tests/contract/{app-window-lifecycle,window-lifecycle,session-save-queue,docking}.test.ts`；实测 37 文件/339 用例 | 仍准确（可补数字） |
| 22 | 技术架构 · L72 | "Playwright 启动真实 Electron … 贯穿 main → preload → renderer" | 断言本身成立（`tests/e2e/p2-run.e2e.spec.ts:40-51` 用 `_electron.launch`）；**但**门禁只跑 7/10 spec、21/39 用例（`playwright.config.ts:5-13`） | **夸大**（缺覆盖范围限定） |
| 23 | 快速上手 · L80 | "Node.js：`>= 24.0.0`" | `package.json:7-9`；本机 `v24.17.0` | 仍准确 |
| 24 | 快速上手 · L81 | "pnpm `>= 9.0.0`" | `package.json:6` `pnpm@11.7.0`；`pnpm-workspace.yaml:4-14` 用 pnpm 10/11 专属配置 | **过时/偏低** |
| 25 | 快速上手 · L86-91 | `pnpm install` → `pnpm dev` 启动窗口 | `package.json:12` → `apps/desktop/package.json:7`（`electron-forge start`） | 仍准确 |
| 26 | 快速上手 · L95-104 | 三个测试命令，注释"TypeScript 类型检查 + 语法规范 + 测试" | 脚本存在（`:23-25`）；但 `pnpm check` 还含 **prototype 层**与**两次打包** | 不完整 |
| 27 | 快速上手 · 全节 | 未提 `verify:repository` / `check:m15` / `test:prototype` | 三者真实存在（`package.json:18,21,20`）；CI 先跑 `verify:repository`（`quality.yml:45`） | 缺失 |
| 28 | 深入阅读 · L110-115 | 五个本地文档 + Figma | 五个 `Test-Path` 全 `True`；Figma **未证实** | 仍准确（除外部链接） |
| 29 | 开源协议 · L121 | MIT | `LICENSE` 存在；`package.json:5` | 仍准确 |
| 30 | L42 | OpenAI 博客《Rethinking skills and prompts for GPT-6 Astra》 | 本环境 DNS 解析到非公网地址，**无法访问、未证实** | 未证实 |

### 5.1 五类必须改的陈述

1. **已交付写成"下一片/计划/候选"**：L30、L34、L38、L52、L58。
2. **意图卡在 M/B 与 W 下都不是"辅助工具"**：L40、L57 需按基线重写。
3. **测试口径不完整**：L72（E2E 覆盖范围）、L103（`pnpm check` 含 prototype 与两次打包）。
4. **版本下限过时**：L81。
5. **自相矛盾**：L46"去除装饰性插画" vs 代码中的 Hazel 装饰。

### 5.2 经核实**仍然准确**、重写应保留

- "一切皆 UI"定位（L18）——有 `ProjectLibrary`/`DockSurface`/`SessionWorkbench` 支撑。
- 海报墙（L24-26）、Zod+受限 preload（L69）、Forge+Webpack（L68）、MIT（L121）、Node `>=24`（L80）、`pnpm dev`/`test:contract`/`test:e2e` 脚本存在性（L90,97,100）。
- 正式题目字符串与 `选题收敛说明.md:6` 逐字一致（L52）。

---

## 6. 对本工作树两份既有产物的校对（最有行动价值）

### 6.1 对 `docs/research/2026-10-26-readme-source-audit.md`（另一会话所写，未改动）

| 该文件的位置 | 该文件的说法 | 一手证据 | 结论 |
| --- | --- | --- | --- |
| 四节表「仅本分支」行 | Pi 适配器与三只读工具 = **仅本分支** | `git ls-tree origin/main -- apps/desktop/src/main/harness/…` 全部存在；`3f262fe Merge pull request #16` | **错误**：应为「已合并 main」 |
| 五节表「Harness」行 | "分支已有三只读工具与 A09 记录，**但 PR #16 未合并**" | 同上 | **错误** |
| 三节「契约测试」行 | "37 个文件、**262 个 `it`/`test` 块**（块数不等于运行时用例数）" | 实跑 `vitest run` → 339 用例 | 数字保守；应直接给 **339** |
| 三节「真实 Electron」行 | "`tests/e2e` 下 10 个 spec、39 个 `test` 块" | `playwright --list` → **21 tests in 7 files**（`testMatch` 白名单） | **不完整**：漏了门禁只跑 21/39 这一关键事实 |
| 三节「210 口径」 | "冻结的 M1 模拟器用例数" | `suite.totalTests=210`、断言约 291 次 | 正确，建议补"不是断言数" |
| 七节 | 未跑完整 `pnpm check` | 本轮同（未跑），但已跑 vitest（339 通过）与 `playwright --list` | 可补 |

### 6.2 对重写版 `README.md`（工作树内 115 行 / 8807 字节，另一会话所写，未改动）

以下只列**与一手证据冲突或缺口**的条目；未列出的部分（四层进程边界、依赖版本表、`pnpm check` 顺序、目录结构、文档入口）核对通过。

| 重写版位置 | 现文 | 证据 | 判定 |
| --- | --- | --- | --- |
| §当前状态表 · P2 行 | "代码与验证记录在分支，**PR #16 未合并**" | `3f262fe Merge pull request #16`；`git merge-base --is-ancestor 395df15 origin/main` = 0；`git ls-tree origin/main` 含全部 harness 文件 | **必须改**：P2 代码已合并进 `main`（review 后还有 22 个提交） |
| §当前状态表 · 表下注 | "这些改动还没进 `main`" | 同上 | **必须改** |
| §现在能做的事 | "写下一个任务后**手动启动一次只读运行**；不启动就不调用模型" | 该交互是 **W（未提交）** 形态；`origin/main` 需先经意图卡确认 + 初始化 RuntimeSession 才出现"启动运行"（`git show origin/main:.../RunPanel.tsx`） | 需加状态限定，否则描述了一个未合并的 UI |
| §Harness 目前接到哪一步 · 只读工具行 | "`read_file`、`list_directory`、**`search`** 三个" | 实际工具名 `search_in_files`（`shared/contracts/read-only-tools.ts:6,26`；`run-ipc.ts:60`；`RunPanel.tsx:69`） | **必须改**（名字错） |
| §Harness · 凭证行 | "只经环境变量注入**子进程**，不落盘、不入库" | `grep 'child_process\|spawn('` → 0；`pi-adapter.ts:74,246` 在 main 进程内读 `environment[config.apiKeyEnv]` | **必须改**（没有子进程；该措辞来自 `issue13-real-provider.md:19` 的文档表述） |
| §质量门禁 · `pnpm test:e2e` 行 | "Playwright 启动真实 Electron，跨 main → preload → renderer，并校验 fixture 未被改动" | 成立，但只覆盖 `testMatch` 的 7 个 spec / 21 个用例（`playwright.config.ts:5-13`）；`window-chrome`/`session-persistence`/`hazel-design` 共 18 个用例不在门禁内 | 需补覆盖范围，否则读者会以为 10 个 spec 都在跑 |
| §当前状态表 · P3 行 | "16 张子 Issue（#17 至 #32）已发布" | 仓库内只有未提交计划文档的自述（`git diff -- docs/plans/2026-10-10-…md`）；GitHub 实时状态**未查询（无网络）** | 未证实（保留但别当已核事实） |
| §文档入口 · Hazel 行 | `docs/design/hazel-v3/tokens.json` | `Test-Path` = `True` | 准确 |

**门禁复核**：在本工作树跑 `node --test tests/repository/normalization.test.mjs` → **6/6 pass，exit 0**（2026-10-26 20:12），与另一会话的记录一致。该门禁只校验固定文档清单（`tests/repository/normalization.test.mjs:8-27` 的 9 份 `currentDocs` + 7 份 `testTruthDocs`），`docs/research/` 下文件不在其内，因此本文不会影响该门禁结论；同时说明重写版 README 已满足「`210` 行必须带 Prototype 限定且不得出现 E2E」与「必须以 `[含 apps/desktop 的标签](apps/desktop/)` 链接桌面工程」两条机械校验。

> 另外：重写版把旧 README 的"Prototype Tests 冒充 Electron 证据"风险规避得很好——它明确写"冻结的 M1 模拟器 210 项用例，属 Prototype Tests 证据，不是 Electron 证据"（`TEST_INFRA.md:19` 同口径）。这一点**不要**在后续修改中退回去。

---

## 7. 学术口径冲突清单（只列证据，不裁定）

| # | 冲突 | 甲方 | 乙方 | 性质 |
| --- | --- | --- | --- | --- |
| A1 | **当前阶段** | `选题收敛说明.md:147-149`：阶段表把「题目/架构校准 2026-09」标为"**当前阶段**" | `themasterplan/ROADMAP.md:26,54`：M3 IN PROGRESS（2026-11~12）；`docs/academic/2026-10-24-midterm-materials-baseline.md:40-41` 同 | 文档内部时间线不一致 |
| A2 | **模型/工具是否关闭** | `2026-10-24-midterm-materials-baseline.md:42`「模型接入、工具执行、文件写入**三项关闭**」；`ROADMAP.md:54`「…仍保持关闭」 | `apps/desktop/package.json:12-13`；`pi-adapter.ts:234-325`；`read-only-tools.ts`；`issue13-real-provider.md:27-36` 真实 4 次工具调用 | **文档 ↔ 代码直接冲突**（代码在 `origin/main`） |
| A3 | **P2 是否"前沿/未合并"** | `2026-10-24-midterm-materials-baseline.md:41`、`ROADMAP.md:31` | `3f262fe` 合并提交；`git ls-tree origin/main` 有 harness/run 层 | 文档过时 |
| A4 | **测试数字** | `2026-10-24-midterm-materials-baseline.md:43`：契约 **200**、原型 210、E2E **21**（标注"截至 2026-10-03"）；`ROADMAP.md:60` 同 | 本轮实测：契约 **339**、E2E 门禁内 **21**、原型 **210** | 时间戳差异（引用须带日期） |
| A5 | **意图核对面板是否核心交付** | `选题收敛说明.md:106-108`：模块化工作区含「意图核对面板」 | W：`SessionIntent.tsx` 已删、`Conversation.tsx` 不再渲染（`git log --all --diff-filter=D` 为空 ⇒ 未提交） | 方向冲突（若 W 定稿，选题书该条要改） |
| A6 | **"Tabs / Dockview"** | `选题收敛说明.md:54,94,106` 写 "Dockview" | 无 `dockview` 依赖（运行时只有 5 个依赖）；实为自研两列停靠 `shared/docking.ts` | 技术名词与实现不符 |
| A7 | **未提交计划文档的版本快照** | `git diff -- docs/plans/2026-10-10-…md`、`docs/specs/2026-10-24-…md`：远程 main `0410d5a`、CI SUCCESS、A09 **NOT_RUN** | `origin/main` = `fd26d06`；`395df15` 标题即 `docs(testing): record A09 real-provider PASS with DeepSeek`；`issue13-verification.md:46` A09 **PASS** | 文档快照落后于 git |
| A8 | **"当前 main 的 renderer"** | `ROADMAP.md:66`（标"历史"段仍用"当前"）："renderer 使用 `ProjectWorkspace`…停靠、持久化…未接入" | `App.tsx:41-94` 用 `SessionTabStrip`/`SessionWorkbench`；`ProjectWorkspace.tsx` 全仓库零引用 | 段落措辞与现状冲突 |
| A9 | **里程碑权威** | `ROADMAP.md:49-54`：M1/M1.5/M2 COMPLETE、M3 IN PROGRESS | 无相反证据；`docs/specs/2026-10-24-…md` 自陈"不改写 M3 完成状态" | 一致 |
| A10 | **题目英文名** | `选题收敛说明.md:7`、`docs/academic/2026-10-08-…md:9`：英文名**待确认** | README 未写英文名 | 一致（加英文名会违反此约束） |

**三份文档一致、可安全引用的事实**：正式题目 = `基于TypeScript的模块化智能体交互系统设计与实现`（`选题收敛说明.md:6,51,89`；`2026-10-08-topic-and-form-baseline.md:5`；`ROADMAP.md:4`；`2026-10-24-midterm-materials-baseline.md:38`）；原型 210 项；M3 未完成；2027-06 为唯一硬锚点（`选题收敛说明.md:144`）。

---

## 8. 无法证实项（不得写进 README 当事实）

1. **外部链接可达性**：`https://nix-medley-14707825.figma.site/`、Figma 设计稿 URL、`https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra` —— 本环境网络受限（`web_fetch` 返回 `URL hostname "developers.openai.com" resolves to a non-public IP address`），**未验证**。
2. **Figma 设计稿是否"完整"**：仓库内只能证明写回记录与 `design-specs/`，"完整高保真可交互原型"无法用仓库证据判定。
3. **`origin/main` 的 Contract 用例数**：339 是本 checkout 实测；`origin/main` 另有 22 个提交（含 `474fb16 test(contract): keep the list boundary case inside the CI budget`），数字可能不同——跑它需切换工作树/检出，属破坏性操作，不在只读范围。
4. **`pnpm check` 全绿**：本轮按规定未跑。`issue13-verification.md:26-27` 的 exit 0 绑定 `92824a4` 与 2026-10-24/25，不能覆盖 W 的未提交改动。
5. **`pnpm dev` 是否真能起窗口**：只验证了脚本链与 Forge 配置，未实际启动。
6. **GitHub 实时状态**：PR #16/#40 的评论、Issue #9/#13/#17–#32 的实时状态未查询（无网络），只用仓库内记录与本地 git。
7. **A09 的原始证据文件**：`tmp/issue13/a09-report.json`、`a09-run1-complete.png`、`a09-run2-stopped.png`、`a09-run.mjs` 属本地不入库，本轮未逐一打开核对。
8. **`docs/testing/m2-native-picker-smoke.md`** 的人工验收内容：只确认文件存在（`Test-Path` = `True`），未复核。
9. **重写版 README 的最终形态**：该文件正被另一会话编辑（20:07:15 写入），本文引文以取样时磁盘状态为准。

---

## 9. 给 README 定稿的边界约束（只列事实约束，不代写正文）

1. **先固定基线**：`origin/main`（推荐，真实主线）／本分支 HEAD／含 W 的当前工作树。三者对"意图卡是否存在""E2E 是 21 还是 24""PR #16 是否合并"的回答不同（§2.5、§3.2、§4）。
2. 能力描述用四态词表并逐条挂证据：`已合并并验证`（三只读工具）/`已实现未提交`（直接任务输入）/`已设计未实现`（写入、命令）/`仅规划`（会话分支、插件库）。
3. 测试段写清三层口径：Contract **339**（本 checkout 实测）／Prototype **210 用例**（非断言、非 Electron 证据）／Real E2E **门禁内 21 用例 / 7 spec**（另有 18 用例未纳入门禁）。
4. 能力边界照 §4.2 的"四项关闭"写；不要用 `RuntimeSession.capabilities` 的 `false` 否定已发生的只读模型运行。
5. 版本统一到 lockfile：Electron `44.2.0`、React `19.2.8`、TypeScript `6.0.3`、Zod `4.5.4`、Node `>=24`、pnpm `11.7.0`。
6. 学术口径冲突（§7）在 README 里**不要自行裁定**；README 只需与 `选题收敛说明.md` 的正式题目一致，里程碑以 ROADMAP 为权威并注明日期。
7. 工具名、凭证路径这类"差一个词就错"的细节，一律以 `shared/contracts/` 与 `src/main/` 源码为准（`search_in_files`；无子进程）。

---

### 附：关键命令输出（原样）

```
git status --short:
 M apps/desktop/src/renderer/components/Conversation.tsx
 M apps/desktop/src/renderer/components/RunPanel.tsx
 D apps/desktop/src/renderer/components/SessionIntent.tsx
 M apps/desktop/src/renderer/styles/session-workbench.css
 M docs/plans/2026-10-10-pioneer-wayfinder-development-plan.md
 M docs/specs/2026-10-24-pioneer-long-term-development-spec.md
 M tests/e2e/hazel-design.e2e.spec.ts
 D tests/e2e/m3-intent.e2e.spec.ts
 M tests/e2e/p1-session.e2e.spec.ts
 M tests/e2e/p2-run.e2e.spec.ts
 M tests/e2e/playwright.config.ts
?? .drops/  ?? .v2c/  ?? .video_agent/
?? docs/academic/  ?? docs/plans/2026-10-25-figma-github-sync-plan.md

vitest:            Test Files 37 passed (37) / Tests 339 passed (339) / exit 0
playwright --list: Total: 21 tests in 7 files
prototype:         totalTests=210  tiers={tier1:90,tier2:90,tier3:20,tier4:10}
workspace:         packages: apps/* ; Test-Path packages -> False ; apps/ -> desktop only
origin/main:       fd26d06 (含 3f262fe Merge PR #16)
本工作树并发改写:   M README.md (115 行 / 8807 B, 20:07:15) ; ?? docs/research/2026-10-26-readme-source-audit.md (20:09:47)
```
