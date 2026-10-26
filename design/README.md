# S1 设计同步 · #35

本 PR 完成 token 生产管线和映射证据校验，**不是 #35 全部验收通过**。基于已接受 main `d5a2f87`，不依赖或修改 #13 施工分支。

## 唯一生产输入

- [tokens/pioneer.tokens.json](tokens/pioneer.tokens.json)：26 个 DTCG token，单 Light。Git 审阅接受，Figma 提出设计变更。
- [生成 CSS](../apps/desktop/src/renderer/styles/tokens.css)：Style Dictionary 5.7.1 的标准 CSS transform/format，保留语义引用。只运行 `pnpm tokens:build`，禁止手改。
- [逐项差异](sync/token-diff.md)和 [101 项决定/版本/哈希](sync/evidence.json)：颜色、字体、几何、别名、F9 补充值、原生 modes 和历史材料的处理依据。

本次仅两项配色提案：工具底色 `#eef1f3 → #eeedea`、次级文字 `#646e72 → #64696f`；配套对比度测试防止只换背景而降低可读性。24 个旧变量名全部保留；字体栈和相对尺寸不变。尚未合并的输入是提案，不是已发布生产版本。

## 显式导出 → PR → 回读

1. 按 [S0 read-requests.json](../docs/research/design-sync-s0/read-requests.json) 使用官方 MCP 只读导出指定集合/节点。保存新的独立快照与日期、文件/节点范围及已有 Issue，不覆写 S0 历史证据。2026-10-26 已重放 variables/components 请求，确认与 S0 完全一致。
2. 对照逐项差异，显式挑选需要接受的值和 alias，修改 `tokens/pioneer.tokens.json`。FLOAT 必须先确认是长度、行高还是无单位数值。当前仅接受 `color / dimension / fontFamily / number`；未知类型、额外主题或复合值直接拒绝，原始元数据保留在快照，不静默抹除。无需运行历史 Python 重建工具。
3. 在提案分支执行 `pnpm tokens:build`，将输入、生成 CSS、差异说明和映射索引放进同一 PR。当前这对颜色即为一次真实导出提案。不得直接推 main。
4. 运行 `pnpm design:check`、`pnpm verify:repository`、`pnpm check`；CI 复算实际输出，而不是先覆盖再比较。相同输入重复生成字节一致，无时间戳和环境路径。
5. 人类接受后按合并 commit 回读输入和输出，并运行 `pnpm tokens:check`。回退时整笔 revert 输入、生成 CSS 和消费者修改；不重放历史重建脚本。

Tokens Studio Git Sync 仍未验证；当前使用 S0 选定的明确文件导出路线，不需要插件 PAT、购买套餐、公开接收器或后台监听。未执行 Figma 回灌、Code Connect 发布、团队库发布、Webhook 或 Dev Resources 写入。

## 三组件索引与真实阻塞

[component-mappings.json](sync/component-mappings.json) 是 S0 选定的轻量索引，**不是官方 Code Connect 发布**。Agent 可从节点定位真实导出、固定 commit/blob、props、契约与测试文件；八个变体全部有处理决定。

| 设计组件                   | 已核对的代码                             | 当前结果                                                                                                                    |
| -------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Workspace Poster `921:706` | main 的 `ProjectPoster(project, onOpen)` | Code/Map/Doc 保留 seeded-gradient 差异；Unavailable 无可用状态/禁用 API，禁止生成可点击卡片。部分对应，未完成全部变体支持。 |
| PanelTab `921:648`         | #13 的 `LocalTabs` 候选                  | 不在 main，且职责不等价；不得虚构 active/onClose/停靠 props。等待已接受的真实停靠组合 API或另行审阅替换试点。               |
| SessionTab `921:632`       | #13 的 `SessionTabStrip` 候选            | 不在 main；后续在列表组合层使用 state/dispatch，不能把单 Tab 映成独立 Strip。关闭 Tab 不能等同停止 Run。                    |

因此 `pnpm design:acceptance` **预期失败**并列出 S1 阻塞；不要关闭 #35 或父入口 #33。`pnpm design:check` 仅证明当前管线和诚实的索引证据有效，明确输出 `3/3 pilots still incomplete`，不声称三组件映射验收通过。

#13 合并后须重新固定 accepted commit/blob、核对真实导出和 props，再处理 Unavailable 与 PanelTab 职责缺口。届时更新索引、映射测试和完整验收门槛；不要把仅调整状态字符串当成完成。Code Connect 权限若变化，需另行实测发布及回读，不能借此索引推导官方成功。

## 校验边界

- `pnpm tokens:check`：严格 JSON/重名、CSS 名冲突、alias 缺失/循环/类型不一致、DTCG 类型/单位、扫描 `apps/desktop/src` 的静态 `var(--pioneer-*|--hazel-*)` 消费者和字节漂移。
- 使用其他命名空间或动态拼接变量名不属于当前生产约定；新增这种用法前必须扩展消费者检查，不能靠 CSS fallback 掩盖活跃变量删除。
- `pnpm design:check`：上述检查 + 真实 TypeScript 导出/props、固定源码 blob、完整变体清单、S0 文件哈希、配色对比度和正反向用例。遇到代码接受或设计变体变化，需重新审阅索引。
- `pnpm check`：新增设计检查接入既有格式、lint、类型、Contract、Prototype、Electron、package smoke 总门禁。Electron fixture 检查生成样式实际应用，同时保留项目导航、Run 意图与 fixture 不变量验收。
- 生成器只写既定 tokens.css；check 仅内存复算和读取，不写 QA、ZIP、素材、Figma，也不修改 main/preload、IPC、Grant 或 Run 状态。

新增依赖是固定版本开发工具。依赖锁只增加设计工具条目，既有 package/snapshot 与 desktop importer 保持原样；`pnpm install --frozen-lockfile` 实测验证。没有放宽 pnpm 的供应链策略。
