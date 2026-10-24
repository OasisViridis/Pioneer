# DESIGN.md: Claude 公开产品页面

## Source

- Capture: 2026-09-28（Asia/Shanghai），Firecrawl `/v2/scrape`。
- 主视觉页：[Claude Cowork](https://claude.com/product/cowork)；产品范围页：[Download Claude / Desktop](https://claude.com/download)；产物模式页：[Claude Artifacts](https://claude.com/features/artifacts)。
- 每页均分别抓取 `branding,images` 与 1440px 宽全页截图；原始品牌/图片结果在 [`.firecrawl/`](./.firecrawl/) 中，分别包含 28、1、13 个图片 URL。
- **证据边界**：这些是公开营销/下载页面及其演示画面，不是已登录 Claude Desktop 的客户端 DOM、组件库或完整设计 token。产品演示图只证明页面如何展示产品，不证明实际客户端尺寸。
- 抓取浏览器在下载页显示 Linux 主 CTA，属于该次浏览器环境，不代表用户的 Windows 客户端；全页静态截图也不能证明滚动动画的最终状态。

## Reference screenshots

![Claude Cowork full-page screenshot](./.firecrawl/cowork-full.png)

![Claude Desktop download full-page screenshot](./.firecrawl/desktop-full.png)

![Claude Artifacts full-page screenshot](./.firecrawl/artifacts-full.png)

上述截图是页面布局、密度与视觉层级的主要证据；结构化 `branding` 只作交叉核对，不压过可见画面。

## Design summary

Claude 页面采用暖白纸面、深色正文、少量高对比实心按钮、细分隔线和大块留白。展示型标题使用 serif，说明及控件使用 sans。产品演示被置于淡色大容器里，外围文案很少。最值得移植的是**任务正在推进、用户能看见并审阅产物**的层级，而不是营销页尺寸或 Anthropic 品牌外观。

## Design tokens（源页面观察）

| 类别            | 观察或抽取                                                                         | 置信度与边界                                             |
| --------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 浅底            | Firecrawl 返回背景 `#FAF9F5`；截图呈暖白/浅米白                                    | 高，适用于这三张网页；非客户端背景保证                   |
| 主文字/实心按钮 | Firecrawl 返回 `#141413`；截图可见近黑正文及实心主按钮                             | 高，网页观察                                             |
| 字族            | Firecrawl 检出 Anthropic Sans / Anthropic Serif；截图可见展示标题 serif、说明 sans | 中高；不主张复制专有字体                                 |
| 网格与圆角      | Firecrawl 给出 4px 基础单位、按钮约 8px 圆角；截图可见细线、浅描边和圆角展示容器   | 中；未测出完整 CSS 间距体系                              |
| 阴影            | 主/次按钮抽取为 `none`；截图以边界和底色区分大部分模块                             | 中；不能推断所有 hover/浮层状态                          |
| 强调色          | Firecrawl 的 `primary #3898EC`、`secondary #FFFF00` 与三张截图主视觉明显不符       | **拒绝作为设计 token**；很可能是被抓到的次级/默认 CSS 值 |
| 动效            | 静态全页截图无法可靠测量时长、曲线或交互反馈                                       | 未验证；不要从营销页推断客户端 motion                    |

## Components and page patterns

1. **目标—过程—结果**：Cowork 首屏用小型进度卡提示任务进行中，后续以产品演示和极短说明呈现“执行后可审阅”的结果；这是公开演示，不是实时运行截图。
2. **主次按钮**：主按钮近黑实心，次按钮浅底；截图中的低对比边界不等于结构化抽取已确认次按钮描边。文本短，操作层级明确。不要复制具体品牌配色。
3. **能力分组**：能力、插件、权限等以稀疏列/行与细边界分隔，不把每个能力做成厚重卡片。
4. **产物卡**：Artifacts 首屏演示对话旁的文件卡，包含类型、标题、可见范围和打开动作；实际产品规则另以[官方帮助](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them)核对。
5. **内容承载**：长页面用少量版心、宽幅演示容器、短标题和低密度说明组织叙事；案例内的绿色/紫色/杏色是**示例产物的配色**，不是 Claude 通用 UI token。
6. **Desktop 入口**：下载页用一个简短主叙述引向桌面版，再用浅描边卡片按平台/扩展分区。它不提供客户端全局导航的可靠视觉证据。

## Content style

- 页面文案以简短标题、1–2 句说明和一个清晰动作组成；关键状态和权限说明不藏在装饰性标语里。
- 复用的是信息层级：用户目标、Agent 活动、需人处理、可交付产物。**不要复用 Claude/Anthropic 名称、品牌图标、插画、照片或长文案。**

## Agent build instructions（给 Pioneer 的适配边界）

- 把公开页面的暖感转译为 Pioneer 现有浅灰画布/暖白面板，不引入新的大面积米白或 Claude 橙色。
- 保留 Pioneer 单排全局会话 Tabs、对话主轴与按需停靠；把 Agent 过程、审批和产物放进现有局部面板，不新增第二套导航。
- 用 Hazel 藏蓝做主操作，银灰做细边界，薄荷/香槟只承载语义状态；状态必须有文字，不能只靠颜色。
- 用 Noto Sans SC / Inter 保证中文长文可读；借鉴 serif 页面标题的**层级对比**，不把营销页 72px 大标题或专有字体搬进工作台。
- 产品示例应使用 Pioneer 自己的工作区/会话/产物数据；没有真实运行器时不得把演示卡标成真实执行结果。

## Rerun inputs

```yaml
workflow: firecrawl-website-design-clone
source_urls:
  - https://claude.com/product/cowork
  - https://claude.com/download
  - https://claude.com/features/artifacts
target_stack: Electron + React + CSS
output: docs/design/references/claude-2026-09-28/DESIGN.md
```
