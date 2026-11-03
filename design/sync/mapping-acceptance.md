# S1/S2 映射验收

基线：main `d11dedefbd732f97c5cf549b103f405f3741a3af`。2026-10-26 用户授权补齐 #35 的映射与资产校验缺口。沿用 S0 轻量索引；本次只读查看三个 Figma component set 的八个变体，没有修改 Figma 或发布 Code Connect。

2026-11-03 为 #37 的真实事件试点追加第四个组件 `830:1593` Permission Card（四个状态变体），仍不修改 Figma、不发布 Code Connect。该组件只作为只读预览和视觉证据，不授予权限。

## 映射粒度与差异决定

这里验收的是设计状态能定位到可使用的真实组件组合，并明确处理每个变体。不是像素完全一致，也不把当前组件没有的属性补成伪 API。

| Figma 变体                     | 真实映射与处理                                                                           | 有意保留的差异                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Workspace Poster · Code        | `ProjectPoster(project, onOpen)`                                                         | 保留 coverSeed 渐变，不从名称或技术栈猜分类，不新增插画。                                                |
| Workspace Poster · Map         | 同上                                                                                     | 同上；不冒充地图封面。                                                                                   |
| Workspace Poster · Doc         | 同上                                                                                     | 同上；不冒充文档封面。                                                                                   |
| Workspace Poster · Unavailable | `ProjectPoster(..., unavailableReason)`；ProjectLibrary 在 stale 时传入明确原因          | 表达目录状态尚未重新验证，而非断言每个项目目录已消失。卡片禁用、封面灰度、原因可读；成功 Rescan 后恢复。 |
| PanelTab · Active              | `DockSurface(session, dispatch, renderPanel)` 中获得焦点的面板标题；`:focus-within` 高亮 | 当前工作区并排显示面板，不引入 Figma 的堆叠标签布局。Active 表达焦点，不代表隐藏其他面板。               |
| PanelTab · Inactive            | 同一组合中未获得焦点的标题                                                               | 面板仍可见。关闭在既有“收起面板”菜单里；拖动与键盘菜单使用真实 DockSurface 行为，最后一个面板不能收起。  |
| SessionTab · Active            | `SessionTabStrip(state, dispatch)` 中 `state.activeTabId === session.id` 的条目          | 保留项目副标题、响应式宽度和现有色板；单个 Figma 节点不是整个 Strip。                                    |
| SessionTab · Inactive          | 同一 Strip 中其他已打开的会话条目                                                        | 保留可用鼠标点击的关闭按钮，键盘 tabindex 为 -1。关闭标签保留会话与草稿，不停止 Run。                    |

八个 S1 变体的 JSX 示例集中在 [component-examples.tsx](../../apps/desktop/design/component-examples.tsx)。`pnpm design:types` 对应用的真实导出与完整属性类型执行检查；示例不进入应用入口，不创建模拟产品数据或新的运行时切换点。

### S2 补充：Permission Card（第四组件）

| Figma 变体                 | 真实映射与处理                                                     | 有意保留的差异                                                             |
| -------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Permission Card · Awaiting | `PermissionCard(state="Awaiting", ...)`；Settings 设计预览只读展示 | 保留标题、说明、四个字段与两个动作标签；预览禁用按钮，不授予、不记录权限。 |
| Permission Card · Denied   | 同一组件的 `Denied` 状态                                           | 保留“重新核对范围 / 返回讨论”；预览禁用，不写入拒绝状态。                  |
| Permission Card · Expired  | 同一组件的 `Expired` 状态                                          | 保留失效说明与动作；不推断或复用旧授权。                                   |
| Permission Card · Approved | 同一组件的 `Approved` 状态                                         | 保留“撤回本次授权 / 查看批准范围”；批准不等于执行，组件不记录授权。        |

该组件的真实事件来源是命名版本 `2417598685933588034`、节点 `830:1593`。它当前只进入 Settings 的只读设计预览，不进入批准运行时；`onAction` 只把动作 id 交给调用方，组件本身没有授权副作用。等 #19 的真实审批状态落地后，再把预览替换为运行时入口。第四组件节选在 [component-index-extension.json](component-index-extension.json)，原始 S0 快照保持字节不变。

PanelTab 由 S0 的被否决候选 LocalTabs 改为已接受 main 中的 DockSurface 组合，设计节点不变。这不是替换试点，也不承担 #17 的上下文、能力或 RunLog 产品开发。

## 版本与证据

[component-mappings.json](component-mappings.json) 固定设计节点、变体、accepted base、当前源码 blob、完整 JSX 示例、消费样式及测试文件 blob。新增的 `unavailableReason` 明确标记为当前 PR 的扩展，不虚称它已存在于基线 main。合并后的真实交付 commit 由该 PR 的 merge commit 标识。

- `design-mappings.e2e.spec.ts`：真实目录卡片、目录不可验证时拒绝打开、Rescan 恢复；两条会话的 Active/Inactive 样式、关闭与重开；面板焦点、拖动、收起及草稿不变；Permission Card 四个状态只读预览且动作禁用。
- `permission-card.test.ts`：四个状态的标题、说明与动作标签；预览禁用；设计注解不出现在运行时；无授权副作用。
- `p2-run.e2e.spec.ts`：已运行会话关闭标签后重新打开仍在运行，随后由用户显式停止；保留真实 main → preload → renderer 与 fixture 哈希验证。
- `tab-strip.e2e.spec.ts` 与 `p1-session.e2e.spec.ts`：沿用键盘导航、关闭后的焦点恢复与布局持久化证据。
- `design-decoration.e2e.spec.ts`：当前单工作区的十一种会话主题、运行时资源哈希、尺寸、文字安全间距、窄屏隐藏、重启稳定性与消息状态；目录错误/重试由 `catalog-state` 覆盖。

这些文件必须出现在 Playwright 的实际 `testMatch` 中。`design:check` 校验索引与测试注册，不能替代执行；`design:acceptance` 会运行完整 `pnpm check`，包括真实 Electron 用例，再检查四个映射无未完成项。CI 上传 `electron-evidence-<sha>`（行为与设计证据）和 `visual-comparison-<sha>`（视觉比较报告）供回读。结果以具体提交的 CI 为准，不将测试名称或截图计划当作通过记录。

## 回退

保留 S0 快照与历史素材不变。若需要回退本次扩展，整体 revert 卡片状态、装饰显示、焦点样式、映射索引与相关测试；不得只改 JSON 状态来绕过门禁。Token 管线仍以 DTCG 为唯一生产输入。
