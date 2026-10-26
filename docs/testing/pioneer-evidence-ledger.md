# Pioneer · 工程证据账本

## 当前核对 · 2026-10-26

- **P0、P1、P2 COMPLETE；M3 IN PROGRESS。** P2 只读 Harness 经 PR #16 合并进 `main`（merge `3f262fe`），随后合入七轮复审修复与 PR #40，HEAD 为 `fd26d06`。最后一次完整门禁在 `0bfd5de`：Contract 375/375（39 文件）、Prototype 210/210、Real Electron 24/24、package smoke，退出码 0；合并后 CI 的一次 200/201 目录边界用例超时已在 `474fb16` 修复。
- 模型接入与三只只读工具（`read_file`／`list_directory`／`search_in_files`）在显式一次性授权下可用；写入、命令、通用文件系统 IPC 与 Runtime 子进程仍关闭。真实 Provider 证据见 [A09 记录](issue13-real-provider.md)。
- 当前前沿为 P3：#17 面板接真实数据、#41 移除意图卡、#42 修正运行提示。证据细节见 [Issue #13 验证记录](issue13-verification.md)。

## 历史核对 · 2026-10-03（记录当时状态）

- **P0、P1 COMPLETE；M3 IN PROGRESS。** 生产 App 已挂 SessionWorkbench，main / preload / renderer 真接线，会话草稿／消息／意图／单布局恢复通过。Pi / 模型 / 工具 / 写入仍未接入，下一片 P2。
- 新完整 `pnpm check` exit 0：200 Contract、21 Real Electron E2E、最终 package；冻结 M1 Prototype 门独立通过。精确输入哈希、日志与场景见[P1 收口](p1-session-closeout-2026-10-03.md)。
- 真实流程包括两会话、关闭重开、重启、v3 迁移、损坏记录保留和修复后重试、原子写失败、刷新、慢关闭取消及超时关闭写屏障、单实例与离线字体。fixture 不变，未借此开放任务执行。
- 历史 P0 与旧 WC1 PASS 不倒填当前输入；旧 window / Hazel 专项候选未纳入本次 E2E 匹配。原生 picker、Windows DPI／读屏／强制颜色与桌宠继续单独验收。未提交／推送／发布。

## 历史核对 · 2026-10-02

- 应用开发仍暂停；施工队列只看[冻结原型开发计划](../plans/2026-10-01-pioneer-frozen-prototype-development-plan.md)，设计参考只看[F9 原生写回](../design/figma-make-f9-writeback-2026-10-02.md)。以下 10/1 条目描述当时的候选和状态，不自动恢复其施工队列。
- 当前 Git-only `main` 为 `10bd3b0c`；活动 renderer 是 `ProjectWorkspace`。本地 Workbench / 保存 / 窗口候选未接入此入口；RuntimeSession bootstrap 已有，但 model / tools / mutation 均关闭，Pi 与桌宠未接入。
- 10/1 WC1 候选 136 项输入重新逐项比对，110 相同、26 变化；其完整门禁仍是历史候选的 PASS，不是当前构建的 PASS。Windows 人工门仍待验。本轮不启动主应用、不运行新的 `pnpm check`。详见[输入与差异清单](workspace-closeout-2026-10-02.json)。
- 影片 v7 的用户验收发现面板切线错误，修复在独立 v7.1 工作区；成片仍待用户确认。素材与旧视频保留，工程验收和影片验收分别记录。

## 历史同步 · 2026-10-01

- **WC1真实接线候选：**审批恢复后[原生API探针](wc1-native-api-probe-2026-10-01.json)实际完成，三候选样式通过；`hidden/no-overlay/thickFrame`已接main/preload/renderer与三点，close/quit/reopen、托盘失败降级、单writer和保存/断连竞态有真实证据。[136输入候选](wc1-runtime-candidate-2026-10-01.json)身份`e6b1011e…4527`，[完整新门](wc1-runtime-full-gate-2026-10-01.json)exit0：180 Contract /210 Prototype /29 Electron +最终package，输入未变，聚焦独立只读审阅通过。首次package EBUSY的exit1与red/诊断日志保留，未手工清理目录或杀进程，以同一候选完整重跑。Figma窗口合同新增11变体/8专用变量，原86变量、15业务组件组及页结构未变。[当前记录](wc1-runtime-2026-10-01.md)将接线与静态设计分开；[Windows人工门](wc1-windows-manual-2026-10-01.md)均待验，WC1/W/M2/M3不关闭。

- **WC1预接线历史阶段：**[模块与接线清单](wc1-prewiring-2026-10-01.md)、[133输入候选](wc1-staged-candidate-2026-10-01.json)和[六条离线门](wc1-staged-offline-gates-2026-10-01.json)保留接线前事实。该阶段仅新建6模块/4 Contract文件，原123 F1c工程输入未变；候选身份`cc51eb96…6e68`在当时门禁前后不变，174 Contract含50新增、210 Prototype、最终package及格式/lint/typecheck全部exit0。独立审阅所提迟到全屏/恢复失败快照问题已修复。当时没有运行Electron或完整`pnpm check`；沙箱外探针受自动审批服务额度阻断未执行，未绕过；main/preload/renderer与三点/托盘未接线。后续运行时事实只看上条，不倒填本历史阶段。

- **PET新增计划要求：**用户要求适配自己的`dsh-manqu-pet`。已[只读核对12项源/素材指纹](manqu-pet-plan-audit-2026-10-01.json)，确认本机插件为DSH Web bundle，不是Pioneer现成接口或Codex原生overlay；[PET范围与完成门](../specs/2026-10-01-manqu-pet-adaptation.md)拆为PET1宿主/资源/交互、PET2真实权威事件。仅写计划/ROADMAP/本文与源审计，未修改应用、插件、资产或Figma，未启动DSH/测试/部署；F1c旧门禁不证明PET通过。原设计预算、WC1顺序、配置隔离与素材权利边界保留。

- **当前基准：**Hazel × Claude v3.2视觉 + Workbench产品合同；活动目标已恢复本地开发。唯一施工队列为统一计划，WC1仅新增窗口层。旧v2规范、原型和日志是历史资料，不重置v3或B1来追求更容易的PASS。
- **完整工程基线：**[111文件清单](resumption-baseline-2026-10-01.json)，HEAD仍为`cc82d8a`，脏树内容身份`6433382b7a6996fd46c259ea149a875fa68181c2ecd35f14ae6389bbd786c95d`。Node 24.19.0；未清理、checkout、提交或推送。本条是输入冻结，不是测试通过。
- **后续成功历史证据：**[9/30最终工程记录](../design/hazel-v3/qa/engineering-final.json)及`engineering-final.log`确证124 Contract、210 Prototype、18真实Electron E2E、package与聚合exit0；其中含B1活动查询跨Electron重启通过。10/1核对记录列出的13项文件均匹配；这是局部指纹，不外推整个历史工作树。早期失败/中断日志仍保留，不能抹掉后续成功结果。
- **不重复B1：**活动规格、schema v3迁移、活动查询/IPC与相关Contract已存在；当前UI继续路径仍是MRU。领域复用，用户可见排序由F1b接入并单独验证；B2引用管理仍未实施。
- **当前设计与归档：**[v3.1扩展](../design/hazel-v3/qa/expansion-completion.json)记录先前静态素材/Figma交付，原来的未接运行时状态保留为历史；F1a后续接入另记下条。[工作区归档](../design/hazel-v3/qa/workspace-archive-2026-10-01.json)验证4活动页+10历史页，未删内容。旧v2 P12已有5起点/57反应但未浏览器实点；当前v3不能继承为已通过。
- **F1a历史增量交付：**[114输入候选](resumption-candidate-2026-10-01.json)身份`e42ce03b82dd143a8dde08c86e9624e13f0976b324e33cb7837759f487b3a621`，相对基线9项修改/3PNG新增。[完整新门禁](resumption-v31-full-gate-2026-10-01.json) exit0：124 Contract / 210 Prototype / 19真实Electron + package；114哈希在门禁中及之后均不变。真实red→green、保存失败空态无图、实际截图与聚焦独立只读审阅见[运行时接入记录](../design/hazel-v3/qa/runtime-integration-2026-10-01.json)。该切片当时3配饰/关于页/窗口三点未实施，素材验证器只检查源接入，不能代替上述运行时门禁。
- **F1c当前v3.2交付：**[123输入候选](decoration-v32-candidate-2026-10-01.json)身份`ee45eea2a514cc035c0e5fda0dfa1304c7d2f25c704e502e90f191b8cdd4cd6f`；5项源码/测试修改、8个运行素材新增、1份独立主题合同。[完整新门禁](decoration-v32-full-gate-2026-10-01.json)exit0：124 Contract /210 Prototype /20真实Electron +最终package；123输入哈希不变。14资产中12项直接引用，复用6闲置配饰、加2原生SVG；同一欢迎槽替换，不叠图。主题精确哈希/11选择、真实重启/草稿稳定、引导88/64、配饰48、文字安全距、错误/消息撤图与fixture不变有实际证据；[资产审阅](../design/hazel-v3/qa/decoration-review-2026-10-01.json)记录独立审阅、Figma静态证据及真实截图。历史F1a/静态runtimeIntegrated:false不倒填，原规范§2–4/业务合同/安全配置未变。
- **剩余门：**WC1接线自动门已有新证据，Windows外壳人工门独立待验；自动开发接F1b活动UI/B2只读引用合同，PET1薄宿主调查可并行准备，PET2待权威事件。原生picker、Windows DPI/强制颜色/读屏、当前v3 P12实点、M2/M3里程碑均不自动完成。

## 历史整合条目 · 2026-09-30

> 2026-09-30整合开发计划时只读刷新。里程碑只看[ROADMAP](../../themasterplan/ROADMAP.md)，后续队列看[统一开发计划](../plans/2026-09-30-pioneer-unified-development-plan.md)。本次没有运行工程测试或修改应用源码。

| ID   | 当前来源 / 身份                                                                                                                  | 能证明什么                                                                                                                                    | 不能证明 / 下一项                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| E-01 | 本机只读`git status`/branch/HEAD与`.jj`存在检查，2026-09-30                                                                      | 当前`D:\Project\GitProject\Pioneer`，Git-only，`codex/hazel-session-workbench`，HEAD `cc82d8a38b013e9e6bcbc11cbc99bd07e706bc33`；大量既有脏树 | 不是已审候选；保留全部继承内容，未提交/切换/清理                                                                       |
| E-02 | `fix/m2-final-gate`本机ref同为上述SHA；对其只读name-only diff                                                                    | picker敏感已跟踪差异包括main/index、main/ipc、preload/index、ProjectLibrary.tsx                                                               | 尚未语义审阅，不能直接继承人工PASS；未跟踪会话生命周期文件另盘点                                                       |
| E-03 | [人工picker记录](m2-native-picker-smoke.md)，2026-09-09/13                                                                       | 取消为user-reported PASS；G1/G2/G3在已审旧构建为human-observed PASS                                                                           | 不能无条件外推当前集成树；需E0差异与适用性决定，必要时复验                                                             |
| E-04 | `tests/hazel-docking-check.log`，文件时间2026-09-28 01:12（本机时区），本轮直接读取                                              | 19测试文件/115 Contract PASS，210 Prototype PASS，16 Real Electron E2E PASS；进入最终打包                                                     | 末尾停在`Finalizing package`，未含最终package成功/聚合退出码；**不能证明完整pnpm check结束并通过**；旧计数不是当前结果 |
| E-05 | [v2完成审计](../design/design-reset-completion-audit-2026-09-30.json)和[当前QA](../design/design-reset-final-qa-2026-09-30.json) | 静态设计交付；7页1697文字，119精确描边/28中文回退明确记录；21窗口81状态交接一致                                                               | 不证明代码同步、P12点击、Windows或M2/M3工程验收                                                                        |
| E-06 | 9/30 Figma只读[main终审](../design/design-reset-strict-qa-717-1578-2026-09-30.json)                                              | main717:1578存在；0原型起点、0带反应节点                                                                                                      | P12须先建新连线，不能继承归档132:2旧五起点                                                                             |
| E-07 | `shared/contracts/task-intent.ts`、`shared/task-intent.ts`、`tests/contract/task-intent.test.ts`实际存在且已跟踪                 | M3-A纯schema和转换实现存在；ready不产生执行权                                                                                                 | 本轮未跑新鲜测试或独立源码审阅；不存在完整M3交付证明                                                                   |
| E-08 | 只读源码盘点：会话schema/store、App继续逻辑、WorkbenchPanels和包清单                                                             | 本地会话/停靠持久化已有；最近继续用MRU，context为ProjectOverview；无真实运行器接入证据                                                        | 最近活动时间、上下文引用、main授权/事件链、Pi适配需单独实施；不能把项目mtime当会话活动                                 |

## 范围分栏（不移动文件）

- **M2基础：**main catalog/settings/IPC、preload API、ProjectLibrary/Overview/Poster、基础Tabs与相关Contract/E2E；被审候选由E0明确。
- **Workbench继承扩展：**session-state/store/ipc/window-lifecycle、会话组件/hook/save queue、docking及跨重启/关闭E2E；单独验收，不塞进M2关闭前置。
- **M3-A：**上述3个现有纯域文件和相应历史规格；独立复验。
- **设计/计划迁移：**docs/design、docs/plans、docs/specs、README/ROADMAP；原docs/superpowers迁出形成的已删除/新增状态保留，不借整合重做清理。

执行时为每条新增真实证据填候选SHA或脏树内容身份、日期、命令/退出码、可见结果与独立review。未取得的列保持待验，不复制旧PASS填充。
