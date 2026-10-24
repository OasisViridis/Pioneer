# Pioneer · Hazel × Claude Design System v3.2

> **F9 设计回填（2026-10-02）：** [当前应用稿与交接](figma-make-f9-writeback-2026-10-02.md)已写入原 Figma 文件。旧 v3.2 画板进入 ARCHIVE，组件页新增 F9 分区。原规范与 tokens 不覆盖，F9 补紧凑控件、文字样式与七个源码色值；装饰预算不变，应用开发仍暂停。意图摘要不再是所有任务的必经门，Harness 采用 README 的「脚手架，而不是囚笼」原则。

> **F9 冻结补充（2026-10-01）：** 本规范的 Hazel 视觉语言、素材来源和装饰预算保留，不由 Make 或 Apple HIG 替换。旧专注／审阅／交付布局与固定尺寸示例不再决定新会话的信息架构；行为按[冻结稿开发计划](../plans/2026-10-01-pioneer-frozen-prototype-development-plan.md)落实，可在原设计思路内调整排版与呈现。此处仅澄清适用范围，未修改 token／资产或 Figma 画布。

> 2026-10-01 · **当前全局视觉入口**。v3.2 重审资产使用，复用 6 件闲置配饰、补 2 件轻量 SVG，以替换同一空态槽位增加多样性，装饰预算不变。v3 基础与 F1a 历史证据保留；当前增量单独留证。行为仍以 [产品规格](workbench-product-spec.md) 为准，里程碑只看 [ROADMAP](../../themasterplan/ROADMAP.md)。WC1 的 Apple HIG 适配仅补窗口层，不替换本规范。

## 1. 权威与来源

- [Figma 规范](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1276)、[组件](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1278)、[应用基线](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1279)、[素材与来源](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1277)。四个 v3 页面是当前参考入口；旧 v2 与 pre-v2 稿件集中到一个 [ARCHIVE 目录](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5889)，原变量、状态矩阵与原型保留，不全局覆盖。页面迁移及下一轮 Make 的设计自由度见 [归档交接](figma-archive-make-handoff-2026-10-01.md)；本次归档不修改规范数值，也不恢复应用开发。
- [tokens.json](hazel-v3/tokens.json) 是机器可读规范；运行时入口是 `apps/desktop/src/renderer/styles/tokens.css`。完整系统与现有组件实现分开：不宣称所有尺寸 token 已被应用消费。
- 参照 `D:/Project/Resume/Viridis-UI-Kit` 的素材提取、透明 PNG + 可编辑 SVG、语义变量、来源记录、截图验收与打包方法；**不照搬**针织底纹、花束、标本标签和装饰密度。
- Hazel 来源为用户提供的 12 张图，提取银灰、制服藏蓝、薄荷果冻、樱桃、蝴蝶结和香槟徽章。18 项图片/素材上传现有 Pioneer Figma 已获明确同意；ZIP 不含 12 张原图。原图作者与商业权利未独立核验。
- v3.1 通过内置 `image_gen` 新生成 6 张透明 PNG；以原有果冻和制服蝴蝶结保持身份与笔触，参考图 10 的纸蝶／樱桃只取局部意象。新增上传仅为这 6 项生成输出，用于用户本次要求的规范与设计稿，不复用旧“18 项”授权范围来覆盖新素材。
- Claude 来源：[公开页面观察](references/claude-2026-09-28/DESIGN.md)、[客户端观察](references/claude-2026-09-28/DESKTOP.md)、本轮 [公开产品页](https://claude.com/product/cowork)。暖纸面、阅读排版、低噪声操作区是独立转译，不是 Anthropic 私有 token 或官方库。
- [v2 原文存档](hazel-v3/references/DESIGN-SYSTEM-v2.md) 与旧交付文件只记录历史，不再决定新界面外观。冻结 M1 demos/tests 未改；模型、provider、登录方式、权限与发布配置未改。

## 2. 设计原则

1. **任务是主角。** 唯一全局行：工作区库｜具体会话 Tabs｜新会话｜全部会话｜设置。会话使用一套可组合的停靠布局，不提供专注／审阅／交付分页或模式按钮。旧三模式仅保留为迁移历史。
2. **Hazel 是陪伴，不是壁纸。** 20px 单色果冻标记常驻；88px 插画只在进入与无消息的欢迎态。已有消息时移除；权限、错误、未知结果不卖萌。
3. **Claude 给阅读秩序，Hazel 给身份。** 暖白与留白承载内容，银灰与藏蓝建立识别。不能用果冻或徽章暗示已执行。
4. **先说明事实。** 当前运行器未连接；保存到会话不等于发送给模型。不伪造 Agent 回复、Diff、授权或产物。
5. **保留继承行为。** 换皮不修改目录只读、会话持久化、关闭确认、焦点返回、布局保存与权限合同。

## 3. 色彩与变量

| 角色                       | 色值                              | 规则                               |
| -------------------------- | --------------------------------- | ---------------------------------- |
| 画布 / 表面 / 弱表面       | `#F6F5F1` / `#FDFCFA` / `#EEEDEA` | 温暖但不过黄，不加纹理             |
| 正文 / 次文                | `#2C3547` / `#64696F`             | 风险与原因不靠淡化隐藏             |
| 主操作 / 悬停 / 反白       | `#333C50` / `#212A3B` / `#F9F9F9` | 当前主操作才强调，全局导航中性     |
| 装饰分隔 / 控件边界        | `#D9D7D2` / `#858D92`             | 输入用功能灰；银灰不作唯一功能边界 |
| 薄荷 / 成功字              | `#DCE9DF` / `#35644B`             | 有文字的真实成功                   |
| 提示底 / 香槟配饰          | `#EDE4D6` / `#C6AF94`             | 香槟不做正文或反复镶边             |
| 错误底 / 错误字 / 危险操作 | `#EBDADA` / `#934342` / `#B25352` | 失败与未知分开；说明对象与后果     |
| 工作区身份                 | `#DDE2E9` / `#DCEADF`             | 小识别块，配名称                   |
| 樱桃莓红                   | `#944B59`                         | 配饰，不替代危险色或状态           |

三层、仅 Light，共 **86 变量**：37 primitives（21 色 + 16 数值）、25 semantic colors、24 geometry。49 个语义值全部 alias；明确 scope 与 WEB 语法。旧变量不删、不改值。

正文色对要求至少 4.5:1，关键控件边界至少 3:1，依据 [WCAG 文本对比度](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) 与 [非文本对比度](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)。计算见 [本地 QA](hazel-v3/qa/local-validation.json)，逐项映射见 [token QA](hazel-v3/qa/figma-token-verification.json)。不等于整应用无障碍认证。

## 4. 字体与应用密度

- 11 样式。欢迎、工作区与设置主标题：Noto Serif SC Medium 28/40；普通中文 UI：Noto Sans SC；英文代码：JetBrains Mono；中文路径保留 Sans 回退。
- 字级：24/32 大标题、20/28 面板标题、16/24 卡片标题、15/24 阅读、14/22 正文、14/20 操作、12/18 元数据、14/22 与 12/20 等宽。
- 运行时 UI：Inter → Noto Sans SC → Microsoft YaHei → system；展示标题：Noto Serif SC → Songti SC → SimSun → Georgia。未打包或下载 Noto，Windows 本地回退与 Figma 字形可能不同，不声称像素完全一致。
- 间距 0/4/8/12/16/24/32/48/64；按钮圆角 8、面板 12、组合输入 16；常规控件可见高 36，命中区至少 32，两行身份 Tab 48。普通工作面无阴影；浮层才使用单层弱阴影。
- 工作区卡：64×64 身份块 + 16px 标题，去掉大封面、反复英文眉题与金色顶线；名称、描述、技术和本机会话信息保留。
- 对话阅读／输入列上限 840px。长路径换行，不挤走操作。Figma Composer 是状态合同样例，仍比运行时输入区更高；设计稿不是精确应用截图。

## 5. 装饰预算

| 场景                       | 允许                                        | 不允许                           |
| -------------------------- | ------------------------------------------- | -------------------------------- |
| 全局导航                   | 20px 单色 jelly mark + 可读功能名           | 角色头像替代功能名               |
| 进入／新会话空态           | 最多 1 张；88/64px 槽位，可用 48px 配饰替换 | 叠图、立绘侧栏、水印、花纹输入框 |
| 窄面板                     | 完全隐藏装饰，文字优先                      | 为图片把标题挤成窄条             |
| 关于／素材索引             | 48px 配饰之一；应用未新增关于页             | 配饰同时堆进任务区域             |
| 活跃会话、权限、错误、验收 | 0 张角色插画，清楚的文字                    | 表情包表示批准、运行或完成       |

文字安全距至少 24px。会话容器不大于 380px 时隐藏装饰；窗口不大于 900px 时伴随图 64px（含工作区引导），配饰仍为 48px，不放大。禁止纹理工作底、自动庆祝、反复金线与整屏星光。

### 5.1 绿冻家族与配饰扩展 · v3.1 历史交付

**身份不变。** 两只圆兔耳、扇边薄荷果冻、藏蓝眼睛、小微笑、奶油与单颗樱桃。柔和水粉笔触、低饱和色、少量高光。姿态只匹配空态语境，不根据任务状态、联网状态或模型事件切换。

| 新文件                    | 设计稿用法                                             | 禁止含义                   |
| ------------------------- | ------------------------------------------------------ | -------------------------- |
| `greendou-organizing.png` | L00 添加工作区空态，88px                               | 已整理／已修改文件         |
| `greendou-listening.png`  | W01 专注新会话，88px；R02 中屏，64px                   | 已连接、语音聆听或模型在线 |
| `greendou-reading.png`    | W02 审阅尚无内容的会话欢迎区，88px；不进入审阅结果面板 | AI 正在读文件或已验收      |
| `cherry-bookmark.png`     | 来源／关于类布局样例之一，48px                         | 收藏按钮、书签状态         |
| `paper-butterfly.png`     | 来源／关于类布局样例之一，48px                         | 发送、联网或成功           |
| `jelly-ribbon-charm.png`  | 来源／关于类布局样例之一，48px                         | 已验证或已批准             |

原有 `jelly-companion.png` 仍保留用于未指定新姿态的欢迎场景。10/1 F1a 已接入整理／专注／审阅欢迎姿态；仅按空态布局选图，保存失败或已有消息时不渲染。新增姿态在 Figma 中为 `Greendou Companion` 的 3×2 变体（88／64）；配饰为 `Hazel Accessory` 的 3 个 48px 变体。PNG 内部像素不可矢量编辑；尺寸、布局、实例和界面文字可编辑。配饰样例在素材页，不新增产品页面、功能或交互。

一屏最多一张指实际应用视图；素材目录允许并列比较。禁止将整张素材板导入应用。全部插画不可点击；工程落地时使用空 alt 与 `aria-hidden`。已有消息后移除，不让表情替代解释文字。

入口：[素材与布局样例](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=856-1296)、[扩展使用规范](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=857-1480)、[机器可读素材合同](hazel-v3/expansion/assets.json)、[精确生成提示集](hazel-v3/expansion/prompts.json)。

### 5.2 单槽主题与资产重审 · v3.2

素材输出共 **14 项（8 PNG / 6 SVG）**；应用直接引用 **12 项**，其中 11 种会话空态主题 + 1 种工作区引导。目录数、源码引用数与实际显示分别核对，不把内联品牌标记算成 `jelly-mark.svg` 的使用。

| 布局       | 可替换主题                                    |
| ---------- | --------------------------------------------- |
| 工作区引导 | 整理绿冻                                      |
| 专注欢迎   | 陪伴绿冻 / 纸蝶 / 果冻挂件 / 新增薄荷线稿绿冻 |
| 审阅欢迎   | 阅读绿冻 / 樱桃书签 / 新增银灰折纸            |
| 交付欢迎   | 原欢迎绿冻 / 制服蝴蝶结 / 线稿蝴蝶结 / 樱桃对 |

只替换原欢迎槽，不额外堆图。按不可变会话 ID 的最后一个 UTF-16 单元与布局池确定主题；同会话、同布局稳定，草稿编辑或重启不换图。无随机、轮播、任务状态或活动事件联动。只有无消息且无保存错误的欢迎态允许显示，所有布局首条消息后移除；不可点击，空 alt、`aria-hidden`。

两件新 SVG 为原创原生路径演绎，不追踪原图、不声称官方资产；Figma 内保持可编辑形状并复用现有色彩变量。认证感强的 `compass-seal.svg` 与近重复品牌源 `jelly-mark.svg` 留作来源素材，不进入欢迎主题。

[主题槽位与比较](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=880-313)、[主题合同](hazel-v3/decoration-policy.json)及[本轮资产审阅](hazel-v3/qa/decoration-review-2026-10-01.json)是当前 v3.2 入口；5.1 的固定姿态与配饰仅样例限制属于历史切片，不覆盖本节。没有增加产品页、功能或任务能力。

## 6. 组件与交互合同

Figma **14 主家族 / 78 变体**，内部 Close 另 3，共 81。Button、Field、Status、Session Tab、Local Tab、Workspace Poster、Panel Header、Session Row、Context Row、Artifact Card、Permission Card、Run Status、Validation、Composer 迁移到 v3。原生关联可编辑；未发布团队库或配置 Code Connect。

v3.1 的 **2 装饰家族 / 9 变体**保留；v3.2 另加 **1 单槽主题家族 / 24 变体**（12 主题 × 88/64 槽位），复用旧素材与母组件，不计入功能组件统计。色彩、变量、字体与业务组件没有重建。

- 关闭 Tab 不删除会话、不停止任务；面板、拖拽与布局操作不授权运行。
- 保存中、保存失败、未发送、未连接、未知结果分开表达。禁用状态仍可读，原因用文字解释。
- 键盘、重命名、独立草稿与持久化沿用已有合同。
- 640px 审阅临时收纳工具面板，显示“展开面板”，不改写保存布局；900px 工具栏可换行；1440px 增加空间，不增加装饰。
- Windows 200% DPI、强制颜色、读屏与原生目录选择器须独立人工验收，未被本轮自动化或 Figma 小画板替代。

## 7. 交付与证据

| 层级          | 交付                                                                                                                  | 边界                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 可编辑设计    | 4 活动页面、86 变量、11 样式、81 功能／内部变体 + 9 原装饰 + 24 主题槽位变体、7 关键屏                                | 静态设计，不是运行器或连续原型执行证明                                        |
| 素材          | 8 透明生成 PNG + 6 原生 SVG；12 参考图与取舍                                                                          | 独立演绎，不声称官方资产或商业授权                                            |
| 应用实现      | 色彩、字体回退、导航标记、欢迎图、紧凑卡片、输入边界                                                                  | 不新增后端能力，不改业务权限                                                  |
| 真实门禁      | 2026-09-30 `pnpm check`：124 Contract、210 Prototype、18 Electron E2E、最终 package smoke                             | 原有工程证据，不证明 v3.1 新姿态已接入运行时；Prototype 是模拟证据            |
| F1a 新门禁    | 2026-10-01 `pnpm check` exit0：124 Contract、210 Prototype、19 Electron E2E、最终 package；114 项工程输入哈希保持不变 | 只证明该候选与指定空态增量；不关闭 WC1、Windows 人工门或 M2/M3                |
| F1c v3.2 门禁 | 2026-10-01 `pnpm check` exit0：124 Contract、210 Prototype、20 Electron E2E + 最终 package；123 项输入哈希不变        | 证明同槽主题、离线资源、重启稳定及紧凑预算；不替代 Windows 人工门或运行器证明 |
| 视觉回归      | 640/900/1440 工作区、专注、审阅；已有消息无装饰；设置；离线图片加载                                                   | 真实 Electron + DOM 尺寸，不是 Windows DPI 验收                               |

入口：[交付 README](hazel-v3/README.md)、[工程门禁](hazel-v3/qa/engineering-final.json)、[Figma QA](hazel-v3/qa/figma-final-audit.json)。真实运行截图在 `hazel-v3/qa/`，完整最终日志保留。

v3.1 的独立证据：[扩展验收](hazel-v3/qa/expansion-completion.json)、[当时 Figma 结构验收](hazel-v3/qa/expansion-figma-audit.json)、[64／88／48px 比较](hazel-v3/qa/expansion-small-size.png)。`expansion-figma-*.png` 是 Figma 渲染，不是 Electron 截图。6 项生成输出已存于本地素材包；透明通道、源哈希、ZIP 内容及四张更新空态的实例／图像填充均独立检查。

[F1a 运行时接入记录](hazel-v3/qa/runtime-integration-2026-10-01.json)另记该候选身份、red→green、完整门禁、只读独立审阅与实际 Electron 截图。旧静态扩展记录保留原来的 `runtimeIntegrated: false`，不倒填；v3.2 当前事实由[本轮资产审阅](hazel-v3/qa/decoration-review-2026-10-01.json)单独记录。素材验证器只证明源文件接入与字节一致性，不代替 Electron 行为测试。

继承 E2E 的两个过期前提已修正：默认布局没有待保存更改；首条消息会自动成为会话标题。只修测试操作和选择器，未为通过测试改变产品行为。其他后端与未提交修改保留；未提交、推送、合并或发布。
