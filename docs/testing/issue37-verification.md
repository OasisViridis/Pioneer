# #37 · S3 检查、回传与事件接收

2026-10-27，基于 main `1cbface10f24667b8babc1b9d427f64d29588536`。关联 [#37](https://github.com/OasisViridis/Pioneer/issues/37)，不关闭长期入口 #33。

## 当前交付边界

代码准备了检查入口、Windows 像素比较与候选图工作流，以及合并后只读回填清单。**本票尚未完成**：Windows 基线还未经审阅，真实 Figma 回传与命名版本事件均未发生。不得用这份准备工作的 PR 自动关闭 #37。

S0 的[能力报告](../research/design-sync-s0/README.md)没有确认 Webhook 接收器、scoped REST 凭证、Dev Resources 写入或 Code Connect 发布权益。当前连接工具未暴露 Webhook/Dev Resources REST 操作。S2 已合并，但实际路线是当前 Codex 会话 + 发布工具，并没有 `repository_dispatch` 事件消费者，也没有获准的无人值守模型执行环境。不能把一个只打印 payload 的 workflow 当作已接通 S2。

## 旧测试盘点与真实选择范围

测试入口为 `tests/e2e/playwright.config.ts`；`pnpm test:e2e` 负责构建后启动真实 Electron。窗口、设计检查与 P1/P2 在同一个入口运行，不用截图替代授权/停止/隔离测试。

| 旧文件 / 用例 | 当前适用性与处置 | 实际替代入口 |
| --- | --- | --- |
| `hazel-design` 的多主题/重启 | 旧版 v3 record、专注/审阅/交付标签已被 v4 单布局替换，原文件不运行 | 已选入的 `design-decoration` 验证 11 个实际素材、hash、重启、窄窗、隐藏边界和错误态 |
| `hazel-design` 的 onboarding | 当前 ProjectLibrary 没有 Hazel 插画；`PIONEER_E2E_SKIP_INITIAL_ROOT` 也未被主进程读取，不能恢复一个不存在的功能 | `catalog-state` 验证选择目录/错误/重试，`design/sync/asset-policy.json` 明确 organizing 素材 dormant |
| `hazel-design` 的三宽度与本机草稿 | 旧选择器和布局标签不再存在，迁移仍适用的交互断言 | 新选入 `design-states`：1440/900/640、长文本、键盘可见焦点、减少动态效果、本机保存、消息出现后移除插画 |
| `window-chrome` 的自定义红黄绿、托盘、全屏、最大化、退出菜单 | `App.tsx` 未挂载 WindowChrome；main 未注册 window-ipc；原测试依赖的 tray/initialize seam 不存在。保留旧文件作历史规格，不计为当前 E2E 覆盖 | `window-controls` / `window-preload` 等 Contract Tests 仅证明独立模块；原生拖动、系统菜单、托盘、自定义 chrome 仍未验收 |
| `window-chrome` 的单写入者、慢保存、关闭取消、失败重试、损坏保护 | 复用现行 lifecycle，无需恢复未挂载 UI | 已选入 `session-lifecycle` 与 `p1-session`；新增 `window-lifecycle` 检查原生缩放/最小化/恢复后草稿保存与 reload |
| `window-chrome` 的 renderer crash + quit | 不搬用已经失效的自定义关闭接口 | `app-window-lifecycle` / `window-lifecycle` Contract Tests 覆盖协调器；该原生崩溃组合尚无当前 Real E2E，不能宣称通过 |
| `session-persistence` | 旧三布局与选择器已失效，不因本票顺便启用 | `p1-session`、`session-lifecycle`、`catalog-state`；历史文件不计入运行数 |
| `p2-run` / Run Contract | 保持原入口和受控 adapter；没有增加真实 Provider 调用 | 授权拒绝、运行、停止、会话隔离、读取限制及 fixture hash 原有检查继续运行 |

`window-lifecycle` 用 Electron 原生 API 操作窗口，再从 renderer 经 preload/main 保存和恢复草稿；它不是未挂载的 WindowDesktopApi 的集成证据。新测试与视觉截图均关闭 HTTP(S)，只使用本机 fixture，关闭应用后仍核对 fixture hash。

## Windows 视觉基线

- Windows CI 固定 `windows-2025`，依赖由 lockfile 固定，Electron 44.2.0、Playwright 1.62.1。托管镜像仍会更新，因此截图旁记录并比较 ImageVersion、OS build、Electron/Chromium、字体 SHA-256、语言和 devicePixelRatio；漂移会失败，需要单独审阅。
- 使用真实保存记录和确定的 Session ID，固定 renderer 时间、1440/900/640 × 1000 内容尺寸、DPR 1、Light、减少动态效果；等待本地字体加载和保存完成，不运行外部模型。截图断言关闭动画和光标闪烁。主进程真实定时器保持正常，避免冻结停止/保存逻辑。
- `pnpm test:visual` 在独立 Windows job 中比较经审阅应用截图，`updateSnapshots: none`。缺图/环境记录时失败，不写入基线、不静默跳过。当前缺少基线是明确阻塞，首次 CI 不会全绿。
- 首次 PR 没有 `environment.txt` 时，quality 的视觉 job 先抓取候选再执行严格比较；缺少已审阅基线仍失败。这样无需先合并新 workflow 就能取到待审图。候选只上传，不写基线。后续 `visual-candidate.yml` 只能手动调度，调用 `pnpm design:visual:candidate`，输出到被忽略的 `test-output/visual/candidates`。它不会提交、发布或修改 `visual-baselines`。候选工作流成功只表示抓图成功。
- 审阅人需检查正常/窄窗/长文本与焦点四张图及 `environment.txt`，把接受的文件通过单独 Diff 放入 `tests/e2e/visual-baselines/`，记录候选 run URL、源 SHA 和审阅结论。不能拿历史 Figma 导出或 Linux 图充当 Windows 基线。
- 比较测试临时反色制造一个明显变化，要求同一基线断言失败；移除样式后必须再次通过。该预期失败也保留差异附件。比较工作流以 SHA 命名上传 HTML/JSON、expected/actual/diff 和失败 trace。

真实 Windows 基线、故障注入产物和恢复通过证据尚待上述运行；测试文件存在不等于证据已取得。

## 合并后回填准备

```sh
pnpm design:delivery writeback-plan <PR编号> <已登记featureId>
```

沿用 S2 的 `gh api` / `--stdio --actor` 传输，仅发 GET。PR 必须已合并到本仓库 main；工具从 merge SHA 读取固定设计包、校验包 hash/文件/节点白名单，读取同一 merge SHA 的最新 quality run，并要求行为与视觉 job 的实际步骤均成功。输出 `tmp/design-delivery/writeback-plan.json`，包含原节点的 Issue、PR、commit、CI 和固定设计包链接；合并未发生、旧 SHA、缺少视觉 job 或跳过步骤都不输出发布资源。

该命令明确返回 `writeback-blocked`，非成功退出：实际 Dev Resources 写入授权、scoped 凭证、Code Connect 发布能力、同提交人工验收链接尚未确认。验收链接缺失不填假值；Windows/真实 Provider 人工验收保持 pending。清单是只读准备物，重复运行相同证据得到相同清单，没有创建评论、标记 COMPLETED 或改动 Issue 的能力。

后续获准写入时应按节点和固定 URL 读取已有资源，仅补缺项；收到部分成功或超时必须先回读再重试，保留人工链接。此写入/回读/重试逻辑及真实回填验收**尚未实现和验证**，不把只读清单算成已完成回传。Code Connect 须在明确获准后使用官方 CLI，不能以普通节点链接冒充映射发布。

## Webhook 保留阻塞

顺序仍是检查 → 获准回传 → Webhook。没有启动 HTTP 服务、安装 n8n、购买服务、添加外部凭证、创建 Figma 命名版本或启用 repository_dispatch。本轮不引入只有受控 payload 通过的假接收器。

后续真实接入必须先具备：获准 HTTPS/n8n 接收器、Figma Webhook 权益与 passcode、固定版本读取凭证、S2 的获准 dispatch 消费者及执行成本边界。按[官方事件字段](https://developers.figma.com/docs/rest-api/webhooks-events/)和[passcode 校验要求](https://developers.figma.com/docs/rest-api/webhooks-security/)处理：

1. 校验 passcode，再处理精确白名单文件的 `FILE_VERSION_UPDATE`；普通 `FILE_UPDATE` 仅记录漂移，不启动实现；命名版本必须匹配审阅过的命名约定。
2. 从可信配置取 feature/Issue/节点范围，不接受事件任意指定节点或指令；通过官方版本读取确认固定版本，新旧顺序来自版本记录，不能仅比较收到事件的时间。
3. 回传不创建命名版本；同一设计包仍交给 S2 的去重与单活跃 PR 保护，复用 GitHub 状态，不另建业务状态库。
4. 接收器重放同一真实事件三次，确认只产生或关联同一个 Draft PR。错 passcode、越界文件/节点、旧版本、普通编辑、回传循环、过期凭证和限流各有实际拒绝/忽略/重试记录。
5. 取得真实 Figma 投递 → 接收器 → S2 → PR → 最终 SHA 检查的链接；受控 payload 与手动触发不替代此证据。

## 验证记录

本地 Linux 执行结果（复用已有 checkout 的依赖目录，不是干净 Windows 安装）：

- `pnpm verify:repository`：6/6 通过。
- `pnpm design:check`：token/映射/类型/素材检查及 51 项设计同步测试通过，含新增回填清单与旧 SHA/缺视觉 job/越界/无关 PR 反例。
- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test:contract:types`：通过。
- `pnpm test:prototype`：通过；Prototype Tests 210/210，不是 Electron proof。
- `pnpm check`：未通过；Contract Tests 351 通过、24 失败，失败集中在 `ipc`、`path-policy`、`scanner` 的 Windows 盘符路径假设。未改这些文件，也没有放宽断言。
- `pnpm package:smoke`：Webpack 编译完成，但复用依赖中的 extract-zip 带有 win32 bsdtar 补丁，在 Linux 打包被拒绝；不能声称打包成功。
- Playwright 实际入口发现 29 项行为测试（12 文件），视觉入口发现 1 项组合比较。新增行为用例尝试启动 Electron 失败，窗口用例因 max-failures 未运行；没有将 list 或 trace 生成当作 Real E2E 通过。
- Windows CI、候选图审阅、真实 Figma 回填/事件：待执行。此记录不作为关闭 #37 的依据。
