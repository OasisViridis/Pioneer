# #37 · S3 检查、回传与事件接收

2026-10-27，最初基于 main `1cbface10f24667b8babc1b9d427f64d29588536`，随后同步 `c12a20a03f7debe3060b7f8993cae0ebd85e1212`（意图契约移除，会话记录升至 v5）。关联 [#37](https://github.com/OasisViridis/Pioneer/issues/37)，不关闭长期入口 #33。

## 当前交付边界

代码准备了检查入口、Windows 像素比较与候选图工作流，以及合并后只读回填清单。2026-10-28 用户委托 Codex 完成剩余视觉核验；已复核原图、修复输入框焦点对比度并接受[当前状态基线](../../tests/e2e/visual-baselines/README.md)，详见[审阅结论](issue37-visual-review.md)。2026-10-29 #58 已合并，分支同步 main `fef900a70934c6ad63434cf553ad85eed1a1db48`；最终提交的 CI 结果以 PR 记录为准。**本票尚未完成**：真实 Figma 回传与命名版本事件均未发生，且尚未授权合并。不得用这份准备工作的 PR 自动关闭 #37。

S0 的[能力报告](../research/design-sync-s0/README.md)没有确认 Webhook 接收器、scoped REST 凭证、Dev Resources 写入或 Code Connect 发布权益。当前连接工具未暴露 Webhook/Dev Resources REST 操作。S2 已合并，但实际路线是当前 Codex 会话 + 发布工具，并没有 `repository_dispatch` 事件消费者，也没有获准的无人值守模型执行环境。不能把一个只打印 payload 的 workflow 当作已接通 S2。

## 旧测试盘点与真实选择范围

测试入口为 `tests/e2e/playwright.config.ts`；`pnpm test:e2e` 负责构建后启动真实 Electron。窗口、设计检查与 P1/P2 在同一个入口运行，不用截图替代授权/停止/隔离测试。

| 旧文件 / 用例                                                    | 当前适用性与处置                                                                                                                           | 实际替代入口                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `hazel-design` 的多主题/重启                                     | 旧版 v3 record、专注/审阅/交付标签已被单布局替换，当前记录为 v5，原文件不运行                                                              | 已选入的 `design-decoration` 验证 11 个实际素材、hash、重启、窄窗、隐藏边界和错误态                                     |
| `hazel-design` 的 onboarding                                     | 当前 ProjectLibrary 没有 Hazel 插画；`PIONEER_E2E_SKIP_INITIAL_ROOT` 也未被主进程读取，不能恢复一个不存在的功能                            | `catalog-state` 验证选择目录/错误/重试，`design/sync/asset-policy.json` 明确 organizing 素材 dormant                    |
| `hazel-design` 的三宽度与本机草稿                                | 旧选择器和布局标签不再存在，迁移仍适用的交互断言                                                                                           | 新选入 `design-states`：1440/900/640、长文本、键盘可见焦点、减少动态效果、本机保存、消息出现后移除插画                  |
| `window-chrome` 的自定义红黄绿、托盘、全屏、最大化、退出菜单     | `App.tsx` 未挂载 WindowChrome；main 未注册 window-ipc；原测试依赖的 tray/initialize seam 不存在。保留旧文件作历史规格，不计为当前 E2E 覆盖 | `window-controls` / `window-preload` 等 Contract Tests 仅证明独立模块；原生拖动、系统菜单、托盘、自定义 chrome 仍未验收 |
| `window-chrome` 的单写入者、慢保存、关闭取消、失败重试、损坏保护 | 复用现行 lifecycle，无需恢复未挂载 UI                                                                                                      | 已选入 `session-lifecycle` 与 `p1-session`；新增 `window-lifecycle` 检查原生缩放/最小化/恢复后草稿保存与 reload         |
| `window-chrome` 的 renderer crash + quit                         | 不搬用已经失效的自定义关闭接口                                                                                                             | `app-window-lifecycle` / `window-lifecycle` Contract Tests 覆盖协调器；该原生崩溃组合尚无当前 Real E2E，不能宣称通过    |
| `session-persistence`                                            | 旧三布局与选择器已失效，不因本票顺便启用                                                                                                   | `p1-session`、`session-lifecycle`、`catalog-state`；历史文件不计入运行数                                                |
| `p2-run` / Run Contract                                          | 保持原入口和受控 adapter；没有增加真实 Provider 调用                                                                                       | 授权拒绝、运行、停止、会话隔离、读取限制及 fixture hash 原有检查继续运行                                                |

`window-lifecycle` 用 Electron 原生 API 操作窗口，再从 renderer 经 preload/main 保存和恢复草稿；它不是未挂载的 WindowDesktopApi 的集成证据。新测试与视觉截图均关闭 HTTP(S)，只使用本机 fixture，关闭应用后仍核对 fixture hash。

## Windows 视觉基线

- Windows CI 固定 `windows-2025`，依赖由 lockfile 固定，Electron 44.2.0、Playwright 1.62.1。托管镜像仍会更新，因此截图旁记录并比较 ImageVersion、OS build、Electron/Chromium、字体 SHA-256、语言和 devicePixelRatio；漂移会失败，需要单独审阅。
- 使用真实保存记录和确定的 Session ID，固定 renderer 时间、1440/900/640 × 1000 内容尺寸、DPR 1、Light、减少动态效果；等待本地字体加载和保存完成，不运行外部模型。截图断言关闭动画和光标闪烁。主进程真实定时器保持正常，避免冻结停止/保存逻辑。
- `pnpm test:visual` 在独立 Windows job 中比较固定应用截图，`updateSnapshots: none`。缺图/环境记录时失败，不写入基线、不静默跳过。基线已由用户委托 Codex 审阅接受；CI 通过只证明与已审阅图一致，不替代整个产品的设计验收。
- 首次 PR 没有 `environment.txt` 时，quality 的视觉 job 先抓取候选再执行严格比较；缺少已审阅基线仍失败。这样无需先合并新 workflow 就能取到待审图。候选只上传，不写基线。后续 `visual-candidate.yml` 只能手动调度，调用 `pnpm design:visual:candidate`，输出到被忽略的 `test-output/visual/candidates`。它不会提交、发布或修改 `visual-baselines`。候选工作流成功只表示抓图成功。
- 审阅人需检查正常/窄窗/长文本与焦点四张图及 `environment.txt`，把接受的文件通过单独 Diff 放入 `tests/e2e/visual-baselines/`，记录候选 run URL、源 SHA 和审阅结论。不能拿历史 Figma 导出或 Linux 图充当 Windows 基线。
- 比较测试临时反色制造一个明显变化，要求同一基线断言失败；移除样式后必须再次通过。该预期失败也保留差异附件。比较工作流以 SHA 命名上传 HTML/JSON、expected/actual/diff 和失败 trace。

真实 Windows 候选来自 [run 130](https://github.com/OasisViridis/Pioneer/actions/runs/40447866725)，三种宽度及长文本/焦点截图齐全，已逐张目视检查。该次严格比较按预期拒绝缺失基线。加入提案后的故障注入与恢复结果以 PR 所列最终 SHA 的真实运行结果为准；测试文件存在不等于证据已取得。

## 合并后回填准备

```sh
pnpm design:delivery writeback-plan <PR编号> <已登记featureId>
```

沿用 S2 的 `gh api` / `--stdio --actor` 传输，仅发 GET。PR 必须已合并到本仓库 main；工具从 merge SHA 读取固定设计包、校验包 hash/文件/节点白名单，读取同一 merge SHA 的最新 quality run，并要求行为与视觉 job 的实际步骤均成功。输出 `tmp/design-delivery/writeback-plan.json`，包含原节点的 Issue、PR、commit、CI 和固定设计包链接；合并未发生、旧 SHA、缺少视觉 job 或跳过步骤都不输出发布资源。

该命令明确返回 `writeback-blocked`，非成功退出：实际 Dev Resources 写入授权、scoped 凭证、Code Connect 发布能力、同提交人工验收链接尚未确认。验收链接缺失不填假值；Windows/真实 Provider 人工验收保持 pending。清单是只读准备物，重复运行相同证据得到相同清单，没有创建评论、标记 COMPLETED 或改动 Issue 的能力。

2026-10-28 已补充 `design:external writeback`：默认预览；显式授权记录与 `--apply` 后，根据新的合并/CI 证据执行 Dev Resources 写入，按节点和固定 URL 仅补缺项，部分成功/超时后先回读，容量不足不删除人工链接。逻辑已通过受控边界测试，**真实写入与重试验收仍未进行**。Code Connect 须另行用官方 CLI 发布，不能以链接回填冒充映射发布。配置、命令和本地接手步骤见[交接入口](../workflow/issue37-local-handoff.md)。

## Webhook 保留阻塞

顺序仍是检查 → 获准回传 → Webhook。没有启动 HTTP 服务、安装 n8n、购买服务、添加外部凭证、创建 Figma 命名版本或启用 repository_dispatch。本轮不引入只有受控 payload 通过的假接收器。

后续真实接入必须先具备：获准 HTTPS/n8n 接收器、Figma Webhook 权益与 passcode、固定版本读取凭证、S2 的获准 dispatch 消费者及执行成本边界。按[官方事件字段](https://developers.figma.com/docs/rest-api/webhooks-events/)和[passcode 校验要求](https://developers.figma.com/docs/rest-api/webhooks-security/)处理：

1. 校验 passcode，再处理精确白名单文件的 `FILE_VERSION_UPDATE`；普通 `FILE_UPDATE` 仅记录漂移，不启动实现；命名版本必须匹配审阅过的命名约定。
2. 从可信配置取 feature/Issue/节点范围，不接受事件任意指定节点或指令；通过官方版本读取确认固定版本，新旧顺序来自版本记录，不能仅比较收到事件的时间。
3. 回传不创建命名版本；同一设计包仍交给 S2 的去重与单活跃 PR 保护，复用 GitHub 状态，不另建业务状态库。
4. 接收器重放同一真实事件三次，确认只产生或关联同一个 Draft PR。错 passcode、越界文件/节点、旧版本、普通编辑、回传循环、过期凭证和限流各有实际拒绝/忽略/重试记录。
5. 取得真实 Figma 投递 → 接收器 → S2 → PR → 最终 SHA 检查的链接；受控 payload 与手动触发不替代此证据。

## 验证记录

本地 Linux 初次执行结果（基于最初 main；复用已有 checkout 的依赖目录，不是干净 Windows 安装）：

- `pnpm verify:repository`：6/6 通过。
- `pnpm design:check`：token/映射/类型/素材检查及 51 项设计同步测试通过，含新增回填清单与旧 SHA/缺视觉 job/越界/无关 PR 反例。
- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test:contract:types`：通过。
- `pnpm test:prototype`：通过；Prototype Tests 210/210，不是 Electron proof。
- `pnpm check`：未通过；Contract Tests 351 通过、24 失败，失败集中在 `ipc`、`path-policy`、`scanner` 的 Windows 盘符路径假设。未改这些文件，也没有放宽断言。
- `pnpm package:smoke`：Webpack 编译完成，但复用依赖中的 extract-zip 带有 win32 bsdtar 补丁，在 Linux 打包被拒绝；不能声称打包成功。
- 最初 Playwright 入口发现 29 项行为测试（12 文件）；同步 main 移除意图功能后为 27 项（11 文件），视觉入口为 1 项组合比较。Linux 新增行为用例尝试启动 Electron 失败，窗口用例因 max-failures 未运行；没有将 list 或 trace 生成当作 Real E2E 通过。
- Windows run 130 的仓库规范、设计同步、格式、lint、类型、Contract Tests 和 Prototype Tests 步骤通过，候选截图成功；其严格比较因缺少基线失败。新增基线提交及最终 Windows 全门禁结果记录在 [PR #51](https://github.com/OasisViridis/Pioneer/pull/51)。真实 Figma 回填/事件尚待接入。此记录不作为关闭 #37 的依据。

2026-10-28 补充：焦点修复后的正常 Windows 原图已独立审阅，三张正常宽度图和环境指纹未变。最终同提交结果以 PR 为准。本地 Linux 的全门禁仍受 Windows 路径假设限制；不将本地失败改写成成功。

## 2026-10-28 本地交接代码

用户要求不能在当前连接中完成的部分交给本地 Codex。新增独立 `design:external` 入口、禁用的路由配置样例和绑定 merge SHA 的审批样例。事件检查器核验 passcode/文件/节点/发布标签、服务端版本历史与固定节点读取，并复用已有 S2 PR 状态；输出确定性快照材料，审阅并提交后可转换为现有 S2 请求。未把它包装成自动消费者，`awaiting-local-agent` 非零退出；没有部署 Webhook、dispatch 工作流或模型调用。

Code Connect MCP 只读探测仍返回套餐/seat 限制，没有新建模板或发布映射。当前阶段完整指令、外部条件与真实验收矩阵均在[本地交接入口](../workflow/issue37-local-handoff.md)。新增受控边界测试不替代真实 Figma 写入或投递；最终 head 的本地与 Windows 检查结果继续写入 PR。

## 2026-10-28 Windows 本地接手

- 以 PR #51 head `b040e11e9523e634fd7c3c96cd0c683d5c64a077` 独立检出，保留原工作副本。修复本地事件重放在 main 前进时覆盖已固定 base SHA 的问题；冲突、半写入和残留锁保留现场并要求审阅。新回归用例检查三次重放、材料篡改、半写入和并发竞争。
- `pnpm verify:repository` 通过 6/6；`pnpm check` 通过格式、lint、类型、Contract Tests 348/348、Prototype Tests 210/210、真实 Electron E2E 29/29 和 package smoke。门禁运行中补充了并发用例，随后单独重跑最终 `pnpm design:check`，75/75 通过，并单独检查该用例的格式。Prototype Tests 不是 Electron 证据。
- 本机 `pnpm test:visual` 在像素比较前因环境指纹不匹配失败：本机 OS build `10.0.26200`、`local-windows`；已审阅 CI 基线为 `10.0.26100`、镜像 `20261021.278.1`。没有更新基线；本地修复尚无最终 head 的 Windows CI 视觉结果。

## 2026-10-29 会话标签试点准备

- #58 已合并，提供真实会话分支数据；#25 保持 Open。候选画板 `1093:1259` 当前由三个 `921:619` 实例组成，均属于现有映射组件集 `921:632`。这是 Figma 当前画布只读检查，不是命名版本或真实事件证据。
- 本 PR 提议 `session-branch-tabs` 注册范围，并支持受审组成画板：校验实例来源、实例属性、完整固定快照 SHA 和已接受 main 的登记。注册项进入 main 后，没有具体固定快照审批时只能返回 `materials-only`；尚未进入基线时返回 `review-required`。原事件材料的基线不变；明确审阅后可以绑定到其后代基线，再由交付门禁核对当前 main。
- 受控测试覆盖事件投影、属性及嵌套实例越界、快照变更、未接受登记和独立 Git 快照/后代基线；这些不是 Figma 真实投递、Dev Resources 回填或接收器验收。凭证、固定版本、合格 S2 交付和接收器仍未确认。
- PR #48 的 merge SHA `1cbface10f24667b8babc1b9d427f64d29588536` 对应 [quality run](https://github.com/OasisViridis/Pioneer/actions/runs/40367977047) 只有 Windows 质量作业，没有视觉作业，不能作为当前真实回填试点。当前 registry 仅有已关闭的 #36 交付；新试点仍待登记与验收。
- Figma MCP 对 `921:706` 的 Code Connect 探测仍拒绝，当前身份报告学生套餐 Full seat；文件所属团队、组件发布状态与实际权限尚未确认。[Figma 当前帮助文档](https://help.figma.com/hc/en-us/articles/23920389749655-Code-Connect) 与 MCP 返回的套餐提示不一致，不能据此断言必须购买。未发布 Code Connect，也未执行真实回填或接收器验收。
- 复审发现共用 Figma 传输层原先接受任意 `/v1/` GET；未发现事件可以控制该路径，但能力范围超过现有调用需要。现限定为文件版本、固定节点和 Dev Resources 三类 GET 及 Dev Resources POST；受控传输测试确认拒绝其他路径，不代表真实 Figma 集成通过。修改后再次运行 `pnpm check`：设计同步 76/76、Contract Tests 348/348、Prototype Tests 210/210、真实 Electron E2E 29/29 和 package smoke 通过；视觉比较仍在上述环境指纹处停止。
