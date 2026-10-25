# #34 · S0 设计同步核验与试点输入

核验窗口：2026-10-25—2026-10-26（Asia/Shanghai；跨午夜完成）。范围：[S0 #34](https://github.com/OasisViridis/Pioneer/issues/34)，设计约定来自长期入口 [#33](https://github.com/OasisViridis/Pioneer/issues/33)，后续实施为 [#35](https://github.com/OasisViridis/Pioneer/issues/35)。

**结论：选择「现有官方 MCP 只读导出 → 固定文件 + 轻量映射索引 → 普通 GitHub PR」路线。** 当前 Code Connect 读取被套餐门拒绝；团队库发布、Tokens Studio Git Sync、Webhook 与 Dev Resources 写入均未验证，不是已部署能力。无需为 S0 购买服务。三个试点均已定位真实导出与完整设计变体，但只有 ProjectPoster 存在于 main，且三个候选都不能宣称已完成 F9 生产映射。

## 1. 输入、版本与交付文件

| 输入            | 固定证据                                                                                                                                                                                                                                                                                                                                                     | 解释                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 已接受 main     | `0410d5a8a1e8a262b811721e5cfa8234d4b79795`                                                                                                                                                                                                                                                                                                                   | 本票基线；有 ProjectPoster / 项目级 TabStrip，没有 LocalTabs / SessionTabStrip                                      |
| #13 开发分支    | `codex/issue13-readonly-harness` @ `395df15cd544d1d6f8bb8adb0fa292ff23f3c901`                                                                                                                                                                                                                                                                                | [PR #16](https://github.com/OasisViridis/Pioneer/pull/16) 在核验时 open、未合并；只读查看，不复制实现、不改变其状态 |
| 当前设计        | [F9 当前页 824:1279](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1279)                                                                                                                                                                                                                                                           | 本次读取 live 节点，固化为 snapshot-only；没有取得历史 version ID                                                   |
| 既有同步方案    | [FIGMA-COLLABORATION-PLAN.md](../../design/FIGMA-COLLABORATION-PLAN.md)、[tools/figma-sync.js](../../../tools/figma-sync.js)、[figma-bridge](../../../figma-bridge/README.md)                                                                                                                                                                                | main 中的早期设计协作与只读 REST 工具，不是当前 token 自动管线                                                      |
| 历史研究与回填  | #13 固定 commit 中的 [2026-10-01 工作流盘点](https://github.com/OasisViridis/Pioneer/blob/395df15cd544d1d6f8bb8adb0fa292ff23f3c901/docs/research/tech-stack-and-figma-workflow-2026-10-01.md)、[2026-10-02 F9 回填](https://github.com/OasisViridis/Pioneer/blob/395df15cd544d1d6f8bb8adb0fa292ff23f3c901/docs/design/figma-make-f9-writeback-2026-10-02.md) | 历史设计证据，在核验 main 中不存在；其中“开发暂停”“运行器未接入”不是当前工程结论                                    |
| 历史 token/素材 | 同一开发 commit 的 `docs/design/hazel-v3/`、`pioneer-design-tokens-v2.json`                                                                                                                                                                                                                                                                                  | 保留原日期、原用途；不是第二份生产真源，不复制私密素材                                                              |

交付：

- [component-index.json](component-index.json)：三个组件的节点、变体、精确 props、代码 commit/blob、映射缺口和契约/测试文件。
- [design-snapshot.json](design-snapshot.json)：三组件八变体、指定场景 11 个节点锚点及 W01 已解析变量/文字样式的投影快照。
- [native-variables.json](native-variables.json)：六个明确选定的原生变量集合，共 101 个变量，保留 modes、alias、scopes 和 codeSyntax；不是生产 DTCG。
- [read-requests.json](read-requests.json)：实际运行的只读 MCP 请求与二次回读方法。
- [validation.json](validation.json)：文件哈希、节点/代码/链接核对及本次门禁结果。

## 2. 能力矩阵

状态含义：**可用**仅表示指定操作已实际成功；**不可用**表示当前连接实际拒绝；**未验证**表示没有足够实测证据。没有尝试写入的能力不能因只读成功而升级为可用。矩阵适用于上述核验窗口、当前连接和指定 Pioneer 文件。

账号只保留必要事实：`tier=student`、`seat=Full`、角色 `admin`。不保存 handle、email、用户/团队 ID、MCP session UUID、调试 UUID 或原始身份响应；账号所属套餐也不证明目标文件所属团队或发布权。

| 能力/操作               | 本账号结果             | 验证方法、结果和原因                                                                                                                       | 后续路线                                                                        |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 官方 MCP 节点/设计读取  | **可用**               | `get_metadata` 读取 824:1279；`get_design_context(925:194)` 返回参考代码、样式与截图；只读 `use_figma` 成功读取两页节点                    | 用固定节点输入；生成参考代码不作为应用代码或验收结果                            |
| MCP 变量读取/文件导出   | **可用**               | `get_variable_defs(925:130 / 925:194)` 成功；Plugin API 导出六集合、101 变量，保留未解析 alias；实际 JSON 已落入本包                       | 作为 Figma 设计提案输入，显式转换及审阅后进入 Git                               |
| MCP 修改/导入变量       | **未验证**             | 本轮所有脚本只读；没有创建、改名、重绑定、删除或回写设计                                                                                   | S1 如获具体写入授权，单独记录请求、回读、差异与回退                             |
| Code Connect 读取       | **不可用（当前连接）** | `get_code_connect_map(925:130)` 与 `get_context_for_code_connect(925:130)` 均返回套餐限制文字，未返回映射；工具 `isError=false` 不能当成功 | 使用本包轻量索引；没有调用发布接口                                              |
| Code Connect 发布/回读  | **未验证**             | 未发布、无获准库/模板发布记录                                                                                                              | 将来先复核实际权限，不能以“Full seat”替代测试                                   |
| 团队库查询              | **可用（查询）**       | `get_libraries` 返回已订阅 0、可添加 8 个 community 库、无下一页                                                                           | 仅证明查询结果；不能据此断言账号不能发布库                                      |
| 团队库发布              | **未验证**             | 未执行 Publish，未验证此文件归属与发布权限                                                                                                 | 官方列出 Education 支持且要求文件编辑权；需获准小范围发布+回读才可确认          |
| Tokens Studio Git Sync  | **未验证**             | 当前 connector 不暴露该插件配置/许可/同步状态；未打开插件、未读取或配置 PAT、未 push/pull                                                  | 单文件 Git Sync 官方有免费路线；先用 MCP 导出文件。插件授权后固定提案分支再验证 |
| Webhook 读取/创建/投递  | **未验证**             | 当前工具未提供 Webhook REST 通道；没有专用凭证、接收器或真实事件记录；未启动服务                                                           | 留给 #37，需限定 context、公开 HTTPS 接收器和真实事件/重试/去重证据             |
| Dev Resources 读取/写入 | **未验证**             | 未调用相应 REST API；没有提供可用于此操作的 scoped 凭证，未尝试创建链接                                                                    | 现阶段以仓库节点 URL 索引替代；#37 再做获准写入与回读                           |
| Variables REST API      | **未验证，不作为依赖** | 没有调用 REST；当前官方文档列 Enterprise 等限制。不能把 Plugin API 成功说成 REST 成功                                                      | 已跑通不依赖该 REST API 的只读 MCP/Plugin 导出                                  |
| Figma 历史版本读取      | **未验证**             | 现有调用无 version 选择参数，也没有获取 version-history 凭证                                                                               | 本次明确为 snapshot-only；Git 中的快照可重放，未来 live 读取不能冒充历史版本    |

**Code Connect 条件冲突：** 当前官方 [介绍页](https://developers.figma.com/docs/code-connect/)已列 Professional、Organization、Enterprise，Professional 有单库/单框架限制；本次 MCP 拒绝文案仍只列 Organization/Enterprise。这是文档与当前连接行为的差异，不能推导“所有 Professional 或教育账号都不可用”，也不构成购买建议。S1 若工具或账号条件变化，重新实测并附证据。

官方条件参考（均在本次核验窗口查阅；只作条件说明，不代替本账号结果）：

- [团队库发布](https://help.figma.com/hc/en-us/articles/360025508373-Publish-a-library)
- [Tokens Studio GitHub 配置](https://docs.tokens.studio/token-storage/remote/sync-git-github)与[单文件免费/多文件和分支功能说明](https://docs.tokens.studio/get-started/pro-licence)
- [Variables REST](https://developers.figma.com/docs/rest-api/variables/)
- [Webhook](https://developers.figma.com/docs/rest-api/webhooks/)、[Dev Resources](https://developers.figma.com/docs/rest-api/dev-resources/)、[scope 清单](https://developers.figma.com/docs/rest-api/scopes/)

## 3. 三组件试点：定位成立，等价关系按实际能力收窄

| 设计组件与全部变体                                                                                                                                            | 真实 React 导出 / 版本                       | 映射决定                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [Workspace Poster 921:706](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=921-706)：Cover=Code / Map / Doc / Unavailable，四种均 200×174 | `ProjectPoster`，main `0410d5a`；#13 同 blob | **部分对应**。单卡粒度吻合；名称/描述可对应 project，但 Cover 分类和 Unavailable 没有 props 支持              |
| [PanelTab 921:648](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=921-648)：State=Active / Inactive；Label 文本；高 36                   | `LocalTabs<T>`，仅 #13 `395df15`             | **拒绝直接映射，保留为条件试点**。标签文字/选中视觉相似，职责不等价；不得发布伪造的 PanelTab → LocalTabs 映射 |
| [SessionTab 921:632](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=921-632)：State=Active / Inactive；Label 文本；高 34                 | `SessionTabStrip`，仅 #13 `395df15`          | **组合层对应候选**。设计为一个 Tab，代码负责整条列表；等待实现被接受后重新固定 commit                         |

### Workspace Poster → ProjectPoster

实际导出仅有 `project: ProjectSummary`、`onOpen(project): void`。ProjectSummary 提供 id、name、absolutePath、description、technologies、hasGitRepository、lastModifiedAt、coverSeed；没有 cover 类型、disabled 或 availability 字段。代码用 coverSeed 生成渐变，不是 F9 四种封面。嵌套标题和说明也不是 Figma 的 TEXT 属性，不能编造 Label 属性映射。

因此 S1 必须明确三种可用封面如何表达，以及 Unavailable 应由何处提供状态/原因；可以保留有记录的差异，不能把四变体均写为支持。main 的 ProjectLibrary 实际导入该组件，但“已在产品使用”不等于“F9 视觉已接入”。

依据：共享 catalog 契约、catalog-contract 测试、pioneer Electron E2E 中的真实项目卡→唯一项目 Tab 与 fixture 不变量；路径和 commit 见索引。F9 200×174 只是设计尺寸，本次不改 CSS。

### PanelTab 与 LocalTabs 不等价

LocalTabs 的全部 props 是 `items / value / onChange / label / className / panelId`，渲染 `role=tablist` 与按钮，支持方向键、Home/End。真实调用位于 WorkbenchPanels，输入的是 `preview / files / verification`，经 `SET_OUTPUT_TAB` 切换产物视图。

F9 PanelTab 属于停靠面板标题；包括关闭图标和面板组织语义。LocalTabs 没有关闭、拖动、停靠或菜单能力。实际停靠实现当前位于 #13 的 DockSurface（`session / dispatch / renderPanel`），渲染带拖动手柄和菜单的 module-header，也没有导出独立 PanelTab。**不能把 State 映为不存在的 active prop，或把关闭图标映为不存在的 onClose prop。**

S0 选择该项用于明确不合法映射；S1 不能在负例仍存在时勾选“三个映射全部完成”。处理次序：等 #13 接受后，结合既有 #17 的面板职责选择真实已接受的组合 API；如需替换试点，在同一 S1 PR 明确替换节点与理由。不要在本票提取新组件或接手 #17。

### SessionTab → SessionTabStrip

实际 props 只有 `state: SessionWorkspaceState` 和 `dispatch: Dispatch<SessionWorkspaceAction>`。state 提供 sessions、openSessionIds、activeTabId、mruTabIds；Label 来自 session.title，选中来自 activeTabId，项目副标题来自 session.project.name。Library/Settings 标签是固定项，不可关闭；会话项关闭 dispatch CLOSE_TAB。

单个 Figma SessionTab 不能直接生成一个独立的 SessionTabStrip。后续应在容纳多个设计实例的标题栏组合层构造列表状态，或使用另行接受的单 Tab API。不存在名为 SessionTab 的真实 React 导出，也不存在可直接传给 Strip 的 label、selected、onClose。main 的 TabStrip 是项目级导航，其 TabsState 与独立会话状态不同，不能用同名视觉替代会话身份。

依据：#13 的 session-workspace 契约、reducer 测试、tab-strip 与 p1-session E2E 文件。关闭只隐藏 Tab，不删除 session，不停止 Run。测试文件的存在和先前报告不等于本轮重新跑过 Electron。

## 4. Token 单一生产来源与执行路线

**决定：生产接受权在 Git。S1 的唯一生产输入选为 `design/tokens/pioneer.tokens.json`（DTCG、单 Light），由 Style Dictionary 生成现有 renderer 的 `styles/tokens.css`。** 这个新输入路径及生成器在 S0 尚未创建/启用。切换之前，唯一实际生效的 token 定义仍是 main 的 [tokens.css](../../../apps/desktop/src/renderer/styles/tokens.css)，由 renderer/index.tsx 导入。S1 必须在同一 PR 原子切换来源与生成输出，之后禁止手改生成 CSS。

Figma 原生变量作为设计提案来源；Tokens Studio 作为可选导入/导出工具，不能另设可独立覆盖生产的真源。历史 JSON/CSS 只作对照。一次导入、接受与回读：

1. 从本包固定输入开始；新变更先通过同样只读请求形成新快照，记录具体节点、原生 alias/modes、base commit 和已有 Issue。
2. 将获选的原生值转换为单份 DTCG 提案。FLOAT 不自动等于 px，语义 alias、间距、字体与复合样式须显式决策；不可只拿已解析的 get_variable_defs 值抹掉 alias。
3. 在提案分支提交 DTCG、确定性生成 CSS、差异说明和映射索引。保留实际使用的兼容 CSS 变量；执行 #35 的 alias/单位/重复名/删除消费者/漂移校验及工程门禁。
4. 人类审阅接受后，以合并 commit 标记生产来源。Git 回读输入与生成输出 hash；若获得指定 Figma 写入授权，再导入这一接受版本并回读比对。没有写入授权时记录“设计回灌未执行”，不得声称双向同步。
5. 回退使用同一 PR 的输入/生成输出一起 revert；历史快照保持不变。

| 路线                     | 可执行步骤                                                                                                     | 当前证据与限制                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 默认：现有 MCP 文件导出  | 按 read-requests 获取六集合 JSON → 固定原始导出 → S1 转换 DTCG → 正常 Git 分支/PR                              | 本轮已实测读取与落盘；不需要额外 PAT 或公网服务；转换/生成由 #35 实施                                 |
| Tokens Studio 免费单文件 | 用户在插件中导入审核后的 token 单文件；维护者先创建提案分支，插件固定到该分支、单 JSON 路径；由 GitHub 创建 PR | 官方支持不等于本账号已配置。需插件和仓库限定的 Contents 权限；不直推 main，不依赖付费分支切换或多文件 |
| 插件 Git Sync 不可用     | 插件本地文件/JSON 导出，或继续使用已验证的 MCP 原生变量导出，再由正常 Git PR 提交                              | 不需升级套餐；插件导出本身本轮未执行，MCP 替代路线已执行                                              |
| 旧工具                   | tools/figma-sync.js 仅作已有只读检查参考                                                                       | 未运行。它输出图片 URL，不能代替完整 token 导出；comment 分支引用未定义函数，不作为当前同步入口       |

初始差异样例（不是全部迁移结论）：

| 语义          | main 与 #13 当前 CSS | 本次 F9 节点变量 | S1 决策要求              |
| ------------- | -------------------- | ---------------- | ------------------------ |
| background    | #f1f2ee              | #f6f5f1          | 审阅接受或保留差异       |
| surface       | #f9faf7              | #fdfcfa          | 同上                     |
| surface-muted | #eef1f3              | #eeedea          | 同上                     |
| muted         | #646e72              | #64696f          | 检查对比度与现有消费者   |
| border        | #d3d3d3              | #d9d7d2          | 弱分隔不能替代控件边界   |
| foreground    | #2c3547              | #2c3547          | 值一致，继续保留语义别名 |

六集合导出包含 v3 Primitives/Color/Geometry、Window Primitives/Controls、F9 Source additions。F9 七项保持原名与 codeSyntax：navy-deep、silver-2、mint-2、mint-ink、gold-soft、desk、map-tint；原生名为 `f9/…`，WEB 名实际为 `--color-…`，不能根据文字约定杜撰 CSS 名。字体需另结合本包 W01 文字样式；101 变量不代表文件的全部字体/样式或所有历史集合。

## 5. 固定场景与重放边界

**指定场景：L01 选择工作区 → W01 新会话正常态。** 此场景使 Workspace Poster、SessionTab 和 PanelTab 共同进入试点输入；对应既有 #13、#17、#25 的产品边界，当前工程实施留给原票，#35 只处理 token 与映射。

固定范围：

- 设计页 824:1279：场景锚点 925:31 / 925:194；标题栏 925:32 / 925:195；面板标签容器 925:272；四张海报实例 925:130 / 925:136 / 925:144 / 925:151；新会话标签 925:229；对话面板标签 925:273。
- 组件页 824:1278：组件集 921:706 / 921:648 / 921:632 及其全部八个变体后代。
- 变量范围：上节六集合原生数据；W01 另保存节点已解析变量与文字样式。

这是**可重放的结构/映射输入投影**，不是完整 .fig 文件、完整页面树、可交互原型或可离线还原的像素图。省略图像、SVG 路径和无关文本；场景父节点 ID 可指向投影范围外的节点。完整视觉参考仍定位上述 Figma URL，本轮已查看 W01 工具截图；原始截图、临时资源 URL 和私密素材不入交付包。

离线重放：检出本包所在 commit，按 validation.json 核验文件 SHA-256，读取两个快照和索引。这样读取的是同一份已固定输入，不需要 Figma 历史能力。

在线复核：新任务先 create_session，再按 read-requests 的两页读取脚本分别执行，并读取变量；脚本不写设计。比较解析后的 JSON，变化应作为新设计提案，不能覆盖旧证据或声称仍是“2026-10-01 历史版”。本次对组件、场景和 W01 变量做过二次 live 读取，结果相同；原生变量导出也单独二次核对。

## 6. 后续缺口与明确归属

| 缺口                                                         | 后续责任阶段          | 完成前的限制                                                                                                     |
| ------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Code Connect 实际权限、目标库、模板发布与回读                | S1 #35                | 当前走轻量映射，不买套餐、不称官方已发布                                                                         |
| 团队库发布权限与目标文件归属                                 | S1 按需               | 无发布试点证据，不迁移/覆盖设计库                                                                                |
| Tokens Studio 插件许可与仓库限定凭证                         | S1 可选               | 不读取用户全局凭证；如启用，使用限定仓库、短有效期、最小 Contents 权限，由用户在授权界面配置                     |
| 历史版本 API                                                 | S2 #36 按需           | 需 file_versions:read 等匹配 scope；在此之前保持 snapshot-only                                                   |
| Webhook context 权限、公开接收器、认证/防重放/重试、真实事件 | S3 #37                | 需适用 webhook scope、限定文件或团队授权；公开端点可能产生托管/隧道费用，尚未选择供应商或产生费用                |
| Dev Resources scoped 凭证与链接外发范围                      | S3 #37                | 需 file_dev_resources:read/write 的实际能力核验；具体写入须获准，不发私密资料 URL                                |
| #13 未接受代码、PanelTab 粒度缺口                            | 原 #13/#17 与 S1 衔接 | 不改变原票范围/状态；S1 在代码被接受后重新固定版本并解决/替换条件试点                                            |
| S1 DTCG 生成、CI 与实际组件验证                              | #35                   | 当前研究包不代表已装 Style Dictionary、已迁移 token 或已有可运行映射                                             |
| 真实 Electron/Windows、素材验收                              | 对应实现票            | 现有 main 的 m2-native-picker-smoke、#13 的 issue13-verification/real-provider 是各自版本证据；本轮不续用其 PASS |

复用资产检查时，可参考 #13 的 `docs/design/tooling/verify-design-reset-v2.mjs`、Hazel provenance/decoration-policy 及 QA。它们不在核验 main，且历史脚本可能依赖整套旧台账或写 QA/ZIP；S1 应先核对副作用与前提，不整包复制执行。本票没有新增或改动资产。

## 7. 验收记录与交付状态

| #34 完成条件                               | 本次证据                                    |
| ------------------------------------------ | ------------------------------------------- |
| 有日期、方法、三态与原因的能力矩阵         | §2；实际拒绝与未执行写入分开                |
| 三组件节点/版本/变体/真实 props/契约与粒度 | §3 与 component-index；明确完整对应尚未成立 |
| main、#13 和历史证据分开                   | §1；索引包含 commit、blob、inAcceptedMain   |
| token 单一来源及无需升级的路线             | §4；原生导出已实测，S1 生成尚未实施         |
| 指定场景固定输入并重读                     | §5、快照、read-requests、validation         |
| 凭证/公开接收器/费用/授权缺口与脱敏        | §2/6；不保存原始身份、令牌或私密素材        |

本次只新增研究资料与现有方案入口链接；未改应用源码、配置、锁文件、设计画布或 #13。执行了适用的仓库文档门禁和数据一致性检查，详见 validation.json。Contract、Prototype、Electron E2E、package smoke 与 Windows 人工验收没有在本次重新执行，不标 PASS。

S0 交付的是研究结果和可执行输入。PR 审阅/合并前仍是交付候选；#34 不以“未验证能力已通过”方式关闭。长期规范 #33 始终保持 Open，PR 不包含自动关闭 #33 的语句。
