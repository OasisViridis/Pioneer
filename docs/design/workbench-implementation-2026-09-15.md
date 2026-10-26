# Hazel Workbench · 本体实现记录

> **历史实现与分层证据记录。** 当前 v2 设计入口和施工顺序见[统一开发计划](../plans/2026-09-30-pioneer-unified-development-plan.md)。2026-09-30 复读旧日志发现最终 package / 聚合退出结果未留存；下文当时的“完整门禁通过”表述不能替代现可证明的分层 PASS 或当前修订的新鲜门禁，见[工程证据账本](../testing/pioneer-evidence-ledger.md)。原记录保留，不抹掉已取得的测试证据。

依据：`workbench-design-delivery.md` 与 Figma workbench / S01（469:1941）。用户于 2026-09-15 明确要求实现本体。2026-09-16 重新读取 S01、W01、W02 的设计上下文，以下是整个目标的进度，而不是以第一切片替代最终交付。

## 全目标验收矩阵

| 定稿要求                           | 当前实现 / 证据                                                                                                                                                                       | 剩余                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| W01 工作区入口、媒体库海报墙       | 真实 catalog；纵向卡片；Hazel 专属色；名称/路径/描述/技术搜索；真实会话计数；继续/新建                                                                                                | 最近活跃过滤与整体空/异常页继续对照                          |
| 单排会话 Tabs，3–5 可见而非上限    | 单工作区可多会话；1280 下 3、1440 起 5；全部会话可搜索；6 会话 E2E                                                                                                                    | 完整数量/窗口边界仍需补充                                    |
| S01 内联重命名、拖动排序、关闭保留 | Enter 保存 / Esc 取消；Alt+方向键替代拖动；关闭+MRU+恢复；手动名称不被首条消息覆盖                                                                                                    | 最终门禁中的实际拖动回归                                     |
| 每会话草稿、局部 Tabs、布局独立    | 纯 reducer；每布局保留模块组合/顺序；关闭不删记录；已用同一 userData 实际关闭/重启 Electron 验证恢复                                                                                  | 后续新增停靠尺寸、引用等字段同步纳入版本化持久化             |
| Agent 对话为主，宽幅产物并列       | 840px 阅读列；审阅/交付；固定 composer 与独立长记录滚动；1280×800 几何断言                                                                                                            | 更完整的面板拖动停靠/布局保存                                |
| 上下文/能力/Diff/产物              | 真实工作区概览；模块菜单移动/收起；局部预览/文件/验收 Tabs                                                                                                                            | 上下文引用管理及真实运行器的数据绑定                         |
| 运行/批准/停止/断连语义            | 当前运行器未接入，明确未发送/未执行；没有伪造 Agent 回复、Diff、命令或通过记录                                                                                                        | 真实运行器的接入属于工程后续，不可把空状态算成这些功能已提供 |
| Hazel 美术及 UI 字阶               | 银 #D3D3D3、藏蓝、薄荷、香槟金、暖白；共用工作区身份色；无巨大 PPT 标题；无常驻历史树/时间轴/第二排项目 Tabs                                                                          | 全范围终审仍待整个目标完成后                                 |
| 键盘与边界                         | LocalTabs roving/Arrow/Home/End；浮层 Esc 与焦点恢复；重扫/换根不保留失效新建入口                                                                                                     | 完整面板停靠无障碍随功能补齐                                 |
| 安全与交付门禁                     | catalog 三个只读/选根通道不放宽；新增固定会话 load/save/close-result 与无载荷 close-requested 事件；同一 sender/mainFrame/URL 校验；fixture hash；不改模型/运行权限，不提交/合并/发布 | 每个后续能力均保持相应测试与独立审阅                         |

## 已完成的工程与验证

- 分支 `codex/hazel-session-workbench`，从现有 M2 分支开展；现有未跟踪设计文档保留。
- 实际是 Git-only checkout（无 `.jj`），未创建新的 JJ 仓库、未推进 main。
- 纯 reducer 曾逐项得到失败→通过证据；最新 11 条 tabs 测试覆盖新增布局往返、手动名称、排序。
- 2026-09-16 静态检查：typecheck、lint 通过；Contract Tests **89/89** 通过。
- 真实 Electron：首次新工作台回归 6/6；加入紧凑窗口/视觉/改名/溢出/菜单/局部 Tabs 后 **7/7**。均通过 main → preload → renderer，运行前后 hash 验证 fixture 未修改。
- 原生目录选择器不是本轮自动化覆盖范围；不以 fixture seam 冒充人工选择器验收。
- 已查看实际 Electron 三张渲染：工作区库、专注会话、交付分栏。长记录独立滚动，composer 底部不超过 800px。
- 独立只读审阅发现四项并已修复：切布局丢自定义 panels、catalog 更新后的陈旧选择、全局 Tab 错误 aria-controls、本地 Tabs 缺键盘行为。
- 完整 `pnpm check` 当前执行日志：`tests/hazel-workbench-check.log`；完成结果另附下方，不能以此前分项通过替代完整门禁。

截图输出（测试会重新生成）：

- `tests/e2e/test-output/artifacts/tab-strip.e2e-keeps-the-12-cd95a-board-and-per-layout-panels/01-hazel-library.png`
- `tests/e2e/test-output/artifacts/tab-strip.e2e-keeps-the-12-cd95a-board-and-per-layout-panels/02-hazel-focus.png`
- `tests/e2e/test-output/artifacts/tab-strip.e2e-keeps-the-12-cd95a-board-and-per-layout-panels/03-hazel-delivery.png`

## 环境与证据边界

- 受限进程环境中 Electron 的 GPU 子进程报 `0xc0000135` / Target crashed，发生在页面测试前。同一测试沙箱外通过，后续 Real E2E 使用已获准的沙箱外运行；未关闭 Electron sandbox / CSP / contextIsolation。
- 仅当前命令前置仓库 `node_modules/.bin` 到 PATH，解决本机 pnpm exec 查找不到 vitest。未重装依赖或修改全局配置。
- Frozen M1 Prototype Tests 不修改；其 210 项不是新 Electron UI 的证据。
- 不更新 ROADMAP 里程碑为 complete：本体设计目标仍在推进，尤其跨重启保存、完整停靠等不能被当前窗口版本替代。

## 会话持久化方案与后续完整停靠

1. 独立固定 `userData/pioneer-session-state.json`，不混写现有 root settings，复用原子临时文件替换模式。
2. 严格 Zod 会话快照 schema；固定 load/save、关闭协调结果 IPC；保持 sender/mainFrame/URL 守卫，catalog 三个 payload-free 通道不放宽。
3. hydration 前不接受编辑；保存单飞、最后状态优先、失败有明确可恢复提示。不静默丢草稿，不让保存失败覆盖原文件。
4. 用同一个隔离 user-data 真正关闭/重启 Electron，证明多会话、草稿、手动名称、关闭记录、局部 Tabs 和模块布局恢复，且 fixture hash 不变。
5. 面板停靠/尺寸与布局保存独立实现和验证；保留键盘菜单替代拖动。
6. 再做全目标完成审计、独立审阅和完整 pnpm check。未经用户授权不提交 PR / 合并 / 推送。

## 完整门禁结果 · 2026-09-16

`pnpm check` 本次最终退出码 **0**：format、lint、typecheck、Contract **89/89**、冻结 Prototype **210/210** 及原有 probes、真实 Electron E2E **7/7**、最终 package smoke 均完成。该次 E2E 还验证实际拖动排序及切换目录后旧工作区新建入口消失。`git diff --check` 通过。

这是第一 UI 切片的历史阶段门禁，不是整个 S01 已完成。持久化后续进展见下方；完整停靠和其他剩余项继续保留。无提交、合并、远程推送或发布。

## 会话持久化阶段 · 2026-09-16

- 会话仅写入 Electron userData 下固定 `pioneer-session-state.json`，当时为版本 1（现已升级至版本 2，见下方接手记录）；不碰工作区文件或 root settings。Zod 严格结构、引用唯一性、大小上限；调用 save 时即复制已验证快照，再串行原子替换，保存失败不静默重置。
- renderer hydration 完成前不接受操作。保存单飞并合并中间快照；错误保留最新待存状态，可明确重试。损坏文件阻断恢复、保留原字节，修复后可重试读取。
- 单实例锁避免相同 userData 多进程覆盖。main 统一协调正常关闭，等待 renderer 最新队列。关闭等待 8 秒未确认时进入可取消/重试/明确放弃状态；后台原子写不因等待超时自动中断。
- 取消关闭后的迟到 flush 不再关窗。main 在收到旧取消前观察到新关闭请求时，会重新通知，避免吞掉第二次关闭意图。
- 有待保存状态的刷新先保留窗口并完成保存，提示再次刷新；不把刷新变成关窗。异常强杀、断电、尚未到达 main 的 renderer 崩溃改动不承诺恢复。
- 独立审查发现的多实例覆盖、异步 beforeunload 把刷新变关窗、失败无退出入口、无限等待、取消与再次关闭竞态均已有针对性修正。`close-deadline` 和 coordinator 测试覆盖等待超时与请求重排队。
- 真实 Electron 新覆盖：同 profile 重启恢复标题/消息/草稿/关闭记录/局部 Tabs/布局；损坏文件修复重试；真实 rename 失败与重试；写入中关闭；同 profile 第二进程退出；写入中刷新；慢保存取消关闭；明确放弃后退出。每项前后校验工作区 fixture hash。
- 完整门禁日志：`tests/hazel-session-persistence-check.log`。最终 `pnpm check` 退出码 **0**：format、lint、typecheck、Contract **108/108**、冻结 Prototype **210/210** 与 probes、真实 Electron **15/15**、最终 package smoke 通过。`git diff --check` 通过。

当时后续仍需：模块拖动停靠与尺寸、可保存自定义布局、会话上下文引用、工作区最近活跃等定稿细节和全范围视觉/交互复核。运行器未接入，没有伪造 Agent 回复、Diff、文件或测试结果；不会把这些空态说成真实运行能力。目标继续保持 active。

## 停靠布局接手 · 2026-09-28

- 本机当前为 Git-only 工作副本，分支 `codex/hazel-session-workbench`，基线 `cc82d8a`；旧 jj 操作指南不适用于此副本。保留全部原有未提交改动，不推进 main、不提交或推送。
- 会话文件当前为严格版本 2：保存每种布局的两列停靠位置、隐藏面板、分栏比例、面板权重与已存布局。读取版本 1 时先验证、在内存中迁移；不因读取重写原文件，下次成功保存才写入版本 2。会话面板允许收起，但不得收起全部面板。
- 真实 Electron 新增定点链路：审阅布局中拖动上下文面板、指针调整左右比例、键盘调整面板高度、保存、关闭重启后恢复位置和尺寸；工作区 fixture 前后 hash 不变。1280×800 时超出高度的模块是临时收起，不把未渲染的标题误判为配置丢失。
- 主进程跟踪已接受但尚未落盘的会话保存：即使 renderer 尚未完成 hydration 或已崩溃，关窗也先等待这些保存结束；对应 Contract 测试覆盖未连接窗口时的等待行为。
- 当前完整门禁日志：`tests/hazel-docking-check.log`。`pnpm check` 退出码 **0**：格式、lint、typecheck、Contract **115/115**、冻结 Prototype **210/210** 与 probes、真实 Electron **16/16**、最终 package smoke 通过；`git diff --check` 通过。Electron E2E 在受限进程中启动前发生 `Target crashed`，该次通过证据来自获准的非沙箱测试进程；未关闭 Electron sandbox、CSP 或 contextIsolation。
- 尚未交付：真实 Agent 运行器、上下文引用管理、工作区最近活跃、全范围视觉/交互终审；原生目录选择器仍需人工证据。Figma Work 会话的 P10 已完成，P11「可读性与状态表达检查」是并行设计线，不能用本地 E2E 替代。
