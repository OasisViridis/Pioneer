# S1 设计同步 · #35

#39 已合入 token 管线；本次基于 main `d11dede` 补齐三组件轻量映射与资产校验。完整处理八个变体，有意保留的差异与验收方式见 [映射验收](sync/mapping-acceptance.md)。

## 唯一生产输入

- [tokens/pioneer.tokens.json](tokens/pioneer.tokens.json)：26 个 DTCG token，单 Light。Git 审阅接受，Figma 提出设计变更。
- [生成 CSS](../apps/desktop/src/renderer/styles/tokens.css)：Style Dictionary 5.7.1 的标准 CSS transform/format，保留语义引用。只运行 `pnpm tokens:build`，禁止手改。
- [逐项差异](sync/token-diff.md)和 [101 项决定/版本/哈希](sync/evidence.json)：颜色、字体、几何、别名、F9 补充值、原生 modes 和历史材料的处理依据。

本次仅两项配色提案：工具底色 `#eef1f3 → #eeedea`、次级文字 `#646e72 → #64696f`；配套对比度测试防止只换背景而降低可读性。24 个旧变量名全部保留；字体栈和相对尺寸不变。#39 已将这对颜色合入 main。

## 显式导出 → PR → 回读

1. 按 [S0 read-requests.json](../docs/research/design-sync-s0/read-requests.json) 使用官方 MCP 只读导出指定集合/节点。保存新的独立快照与日期、文件/节点范围及已有 Issue，不覆写 S0 历史证据。2026-10-26 已重放 variables/components 请求，确认与 S0 完全一致。
2. 对照逐项差异，显式挑选需要接受的值和 alias，修改 `tokens/pioneer.tokens.json`。FLOAT 必须先确认是长度、行高还是无单位数值。当前仅接受 `color / dimension / fontFamily / number`；未知类型、额外主题或复合值直接拒绝，原始元数据保留在快照，不静默抹除。无需运行历史 Python 重建工具。
3. 在提案分支执行 `pnpm tokens:build`，将输入、生成 CSS、差异说明和映射索引放进同一 PR。当前这对颜色即为一次真实导出提案。不得直接推 main。
4. 运行 `pnpm design:check`、`pnpm verify:repository`、`pnpm check`；CI 复算实际输出，而不是先覆盖再比较。相同输入重复生成字节一致，无时间戳和环境路径。
5. 人类接受后按合并 commit 回读输入和输出，并运行 `pnpm tokens:check`。回退时整笔 revert 输入、生成 CSS 和消费者修改；不重放历史重建脚本。

Tokens Studio Git Sync 仍未验证；当前使用 S0 选定的明确文件导出路线，不需要插件 PAT、购买套餐、公开接收器或后台监听。未执行 Figma 回灌、Code Connect 发布、团队库发布、Webhook 或 Dev Resources 写入。

## 三组件索引与验收

[component-mappings.json](sync/component-mappings.json) 是 S0 选定的轻量索引，**不是官方 Code Connect 发布**。它包含三个真实导出、八个变体、可编译的组合示例、源码 blob 和实际 Electron 验收用例。

- Workspace Poster：Code/Map/Doc 明确保留既有渐变封面；Unavailable 通过真实 `unavailableReason` 禁用卡片、展示原因，成功重新扫描后恢复。
- PanelTab：映射到已有 `DockSurface` 的面板标题组合；Active/Inactive 使用焦点高亮，保留并排布局与现有菜单/拖动行为，不再误映射为 LocalTabs。
- SessionTab：映射到 `SessionTabStrip` 的单会话条目，使用真实 state/dispatch；关闭标签保留会话、草稿和后台 Run。

完整差异、版本边界和回退方式见 [mapping-acceptance.md](sync/mapping-acceptance.md)。新增的卡片属性作为本次源码扩展审阅，索引不会将它虚称为基线 main 中已有属性。

`pnpm design:check` 检查静态证据与正反向用例；`pnpm design:acceptance` 必须运行完整 `pnpm check`（含真实 Electron）后再确认三个映射完成。是否完成交付以对应提交的 CI 和合并记录为准。#33 是长期入口，不因本票自动关闭。

## 历史资产与当前装饰预算

`pnpm design:assets` 以只读方式校验 14 份历史源素材、12 份运行时副本、2 份字体及冻结历史材料的哈希，拒绝非批准消费者、保留素材进入运行时和预算漂移。不会重建 QA/ZIP，也不依赖作者的 home 目录。

[asset-policy.json](sync/asset-policy.json) 显式适配已接受的单工作区：会话使用十一种固定主题，organizing 资产保留但当前 App 没有 onboarding 位置。旧的三种布局池保留在历史政策中，不要求当前产品恢复布局切换。真实 Electron 校验一处插画上限、88/64/48px 尺寸、至少 24px 文字间距、380px 容器隐藏、重启稳定性、消息/错误/任务状态隐藏。

## 校验边界

- `pnpm tokens:check`：严格 JSON/重名、CSS 名冲突、alias 缺失/循环/类型不一致、DTCG 类型/单位、扫描 `apps/desktop/src` 的静态 `var(--pioneer-*|--hazel-*)` 消费者和字节漂移。
- 使用其他命名空间或动态拼接变量名不属于当前生产约定；新增这种用法前必须扩展消费者检查，不能靠 CSS fallback 掩盖活跃变量删除。
- `pnpm design:check`：上述检查 + 真实 TypeScript 导出/props、固定源码 blob、完整变体清单、S0 文件哈希、配色对比度和正反向用例。遇到代码接受或设计变体变化，需重新审阅索引。
- `pnpm check`：新增设计检查接入既有格式、lint、类型、Contract、Prototype、Electron、package smoke 总门禁。Electron fixture 检查生成样式实际应用，同时保留项目导航、Run 意图与 fixture 不变量验收。
- 生成器只写既定 tokens.css；check 仅内存复算和读取，不写 QA、ZIP、素材、Figma，也不修改 main/preload、IPC、Grant 或 Run 状态。

新增依赖是固定版本开发工具。依赖锁只增加设计工具条目，既有 package/snapshot 与 desktop importer 保持原样；`pnpm install --frozen-lockfile` 实测验证。没有放宽 pnpm 的供应链策略。
