# Claude Desktop 客户端参考 · 证据边界

采集与核对：2026-09-28。本文按 **Pioneer 的会话、面板、权限和产物需求**筛选 Anthropic 官方公开材料，并非 Claude 全功能盘点；不是 Anthropic 提供的 Desktop design system，也不把网页 CSS 当作客户端 token。网页视觉另见 [DESIGN.md](DESIGN.md)。

## 证据等级

- **D｜官方客户端文档**：可作为交互行为的来源；界面排布若没有截图仍不能量尺寸。
- **P｜官方产品文章/演示画面**：可辅助看层级与任务叙事；可能是合成视频帧、旧版本或单一主题。
- **H｜Pioneer 自定规范**：是本项目的设计决策，不宣称为 Claude 原貌。
- **U｜未证实**：不可转写为 Claude Desktop 的精确规格。

| 来源                                                                                                                                                                                        | 可证实的内容                                                                                                                                    | 不能推断                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [Claude Code Desktop 文档](https://code.claude.com/docs/en/desktop) · D                                                                                                                     | 独立会话、并行运行、输入区环境/项目/模型/权限；聊天、Diff、浏览器、终端、文件、计划、任务等面板可排列/缩放；Diff 逐文件审阅、会话恢复和键盘操作 | Chat/Cowork 的像素布局；Pioneer 应复制三顶层 Tab 或常驻侧栏                                                 |
| [Claude Academy Desktop 导览](https://academy.claude.com/tutorials/navigating-the-claude-desktop-app) · D                                                                                   | 本地文件夹、连接器、浏览器/应用可进入任务上下文；Windows 快捷入口与系统托盘；本地任务依赖电脑在线                                               | Windows 客户端的具体 CSS、Mac 专属截图/语音入口可直接照搬                                                   |
| [Chat 与 Cowork 合并说明](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude)、[2026-09-16 产品文章](https://claude.com/blog/cowork-is-now-claude) · D/P | 合并为一段可由问答递进到代办任务的对话，仍按计划/账号逐步推出                                                                                   | 已面向所有用户、所有界面都已移除 Chat/Cowork 分栏。Code 文档仍描述三入口，不能把两种时间点混成一张“当前 UI” |
| [Artifacts 帮助](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them) · D                                                                              | 独立产物在会话旁打开；可返回、编辑、分享；长期产物有索引入口                                                                                    | 所有类型的预览尺寸、工具栏顺序或本项目已具有分享功能                                                        |
| [Computer use 权限](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork)、[Code Desktop 权限](https://code.claude.com/docs/en/desktop) · D               | 敏感访问显式请求，可拒绝/停止；权限与具体环境、应用和动作有关                                                                                   | Pioneer 已获文件写入或执行授权                                                                              |
| [Claude Code Desktop 重新设计](https://claude.com/blog/claude-code-desktop-redesign) · P                                                                                                    | 多任务、任务状态可扫视、会话旁审阅与工具面板；文章内嵌演示                                                                                      | 2026-04 演示帧是 2026-09 Windows 默认外观                                                                   |

## 视觉参考与采集物

- [Claude Code Desktop 文章全页](./.firecrawl/code-desktop-full.png)、[文中官方视频静帧](./.firecrawl/code-desktop-video-still.webp)；静帧可见并排会话及中间的 Preview / Diff / Terminal / Tasks / Plan，但属于**宣传视频封面，不是可量取的当前客户端截屏**。
- [统一 Claude 文章全页](./.firecrawl/unified-claude-full.png)。另两张视频封面分别是 [Docs/Slides/Designs 图标](./.firecrawl/unified-chat-video-still.jpg)和[旧 Chat/Cowork 切换演示](./.firecrawl/unified-artifacts-video-still.webp)，**不能作为现行导航规格**。
- 两篇文章分别用 Firecrawl `branding,images` 与全页 screenshot 抓取；结构化图片列表见 `.firecrawl/code-desktop-branding-images.json`、`.firecrawl/unified-claude-branding-images.json`。这些 `branding` 数值描述文章网页，不描述客户端。

## 可移植模式 / 明确不移植

| 可移植到 Pioneer 的模式                      | Pioneer 的具体落点                                        | 拒绝移植                                    |
| -------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- |
| 会话是可恢复的工作容器，任务与产物跟着会话走 | 单排全局会话 Tabs +“全部会话”；布局、草稿与结果按会话保存 | Claude 常驻会话侧栏、第二条顶层导航         |
| 对话先于工具，任务变复杂再展开计划/审阅/产物 | 默认专注对话；当前会话内按需打开停靠面板                  | 把 Chat、Agent、Code 分成互不连通的三套会话 |
| 能观察过程、区分等待用户与仍在运行           | 会话状态文案、审批卡、事件摘要、可审阅 Diff 与验收        | 演示数据伪装成真实工具调用                  |
| 对访问范围、写入和危险动作做显式核对         | 作用域、目标、后果、允许/拒绝与恢复路径均在任务内可见     | “切换面板即授权”、自动重复上次批准          |
| 产物独立于聊天气泡                           | 面板局部 Tabs：预览 / 文件 / 验收；保留来源和版本         | 复制 Claude 专有图标、文案、品牌色/字体     |

## 未得到的 Claude 规范

未发现 Anthropic 官方公开的 Claude Desktop 完整设计 token / 组件库。客户端的精确颜色、字号、间距、响应式断点、Windows 当前 Chat/Cowork 像素布局、所有 Artifacts 编辑器状态均为 **U**。Pioneer 应以自身的 [Hazel Workbench 规范](../../workbench-design-delivery.md)和[产品级交互规格](../../workbench-product-spec.md)给出**明确但原创**的实现决策；后续如有用户授权的真实客户端截图，应按版本、平台、主题追加证据，不静默覆盖本文件。

## 复跑输入

```yaml
workflow: firecrawl-website-design-clone
source_urls:
  - https://claude.com/blog/claude-code-desktop-redesign
  - https://claude.com/blog/cowork-is-now-claude
formats_per_url: [branding+images, full-page-screenshot]
target_stack: Electron + React + CSS
output: docs/design/references/claude-2026-09-28/DESKTOP.md
```
