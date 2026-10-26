# Hazel × Claude · Pioneer v3.2

安静的工作台。制服藏蓝、银灰与薄荷果冻，融入暖纸面与阅读秩序。这是应用设计，不是角色宣传页。

## 入口

- [当前规范](../DESIGN-SYSTEM.md)
- [Figma 规范](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1276) / [组件](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1278) / [应用屏](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1279) / [素材](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=824-1277)
- [素材与 token ZIP](Pioneer-Hazel-v3-assets.zip)：14 素材（8 PNG / 6 SVG）、JSON/CSS、本文、复现配方、扩展与主题合同、来源元数据；不含原图、截图、profile、临时上传链接或日志。
- [来源记录](provenance.json)：12 参考图的哈希、尺寸、取舍与 14 项输出来源。
- [新增素材与布局样例](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=856-1296) / [精确提示集](expansion/prompts.json) / [机器可读合同](expansion/assets.json)。本次使用内置 `image_gen`，非 CLI。

## 素材使用

| 文件                      | 默认用途                               | 尺寸            |
| ------------------------- | -------------------------------------- | --------------- |
| `jelly-mark.svg`          | 品牌源素材；应用内联标记不计该文件使用 | 20px            |
| `jelly-companion.png`     | 无消息的新会话／进入空态               | 88px；窄屏 64px |
| `ribbon-outline.svg`      | 交付欢迎空态主题之一                   | 48px            |
| `uniform-ribbon.png`      | 交付欢迎空态主题之一，不常驻任务区     | 48px            |
| `compass-seal.svg`        | 仅设计来源素材；认证感强，不进应用     | 48px            |
| `cherry-pair.svg`         | 交付欢迎空态主题之一，不替代错误图标   | 48px            |
| `greendou-organizing.png` | L00 工作区空态，不表示已整理文件       | 88px；可选 64px |
| `greendou-listening.png`  | 专注欢迎主题之一，不表示语音或在线     | 88px／64px      |
| `greendou-reading.png`    | 审阅欢迎主题之一，不进入审阅结果面板   | 88px／64px      |
| `cherry-bookmark.png`     | 审阅欢迎主题之一；非收藏按钮           | 48px            |
| `paper-butterfly.png`     | 专注欢迎主题之一；非发送或成功         | 48px            |
| `jelly-ribbon-charm.png`  | 专注欢迎主题之一；非验证徽章           | 48px            |
| `jelly-outline.svg`       | 新增薄荷线稿绿冻，专注欢迎主题之一     | 48px            |
| `silver-paper-fold.svg`   | 新增银灰折纸，审阅欢迎主题之一         | 48px            |

一屏最多一张插画；已有消息时移除；会话容器不大于 380px 隐藏。PNG 空 alt + aria-hidden，不传达状态。SVG 是原创可编辑符号，不追踪原作者线稿。

v3.1 历史切片新增 3 种绿冻姿态与 3 种配饰，**不增加装饰预算**。Figma 四张原有空态已换为相应姿态；配饰只在素材页的布局样例中展示。新增 2 装饰家族 / 9 变体，图像为像素资产，其实例、排版和文字保持可编辑。10/1 F1a 已接入整理／专注／审阅欢迎姿态，只按空态布局选择；已有消息或保存错误时不渲染。原欢迎图保留；没有新增关于页、配饰交互、模型状态或任务能力。

v3.2 重用 6 件闲置配饰，新增 2 件原创原生 SVG；[主题合同](decoration-policy.json)将 12 项素材分为 11 种会话空态 + 1 种工作区引导。每屏只替换一张原图，88/64px 槽位不变，配饰保持 48px、文字安全距至少 24px；窄窗口工作区引导也遵循 64px。按固定会话身份与布局稳定选图，不轮播、不随打字或任务状态变化。徽章与品牌源素材留作设计专用，没有新增关于页或模型能力。

[当前主题槽位](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=880-313)含 12×2 槽位变体、比较板和三个单图布局例；W02 同槽替换为樱桃书签、R02 替换为纸蝶，原位置、尺寸、节点 ID 及页面归档组织保留。[当前审阅](qa/decoration-review-2026-10-01.json)分开记录源接入、Figma 静态证据与真实 Electron 门禁。

保留 Viridis 的双轨素材、语义变量、溯源与 QA；舍弃针织底、花束和标本标签。新增应用密度预算、离线打包与真实 Electron 验证。

## 验收

- 3 集合 / 86 变量 / 49 aliases / 11 文字样式。
- 14 主家族 / 78 变体，内部 Close 另 3；7 张原生可编辑关键屏，旧 v2 保留。
- v3.1 另有 2 装饰家族 / 9 变体、1 新增使用规范板及配饰布局样例。
- v3.2 复用原图和母组件，另有 1 单槽主题家族 / 24 变体；14 输出中 12 项接入应用，2 项留作设计源素材。不增加变量、文字样式或产品页。
- 原有 12 原图 + 6 输出获明确授权上传；本次 6 新输出按本轮“加入规范并落地设计稿”要求上传到同一文件，没有额外上传用户文件。
- [扩展验收](qa/expansion-completion.json)：6 PNG 真实 alpha、哈希／来源／提示词、Figma 实例与小尺寸渲染、ZIP 内容核对。
- 2026-09-30 `pnpm check` 最终退出 0：124 Contract、210 Prototype、18 Real Electron E2E + package smoke；这不是 v3.1 素材接入应用的证明。
- [F1a 运行时接入](qa/runtime-integration-2026-10-01.json)：10/1 新鲜完整 `pnpm check` exit0，124 Contract / 210 Prototype / 19 Real Electron E2E + package；114 工程输入哈希未变，聚焦独立审阅通过。三姿态离线加载、88／64px、窄容器隐藏、消息／实际保存失败时移除已测；当时配饰未接入；当前 v3.2 增量另记，不改历史证据。
- `qa/focus-1440.png` 等是真实运行截图；Figma 屏是组件与排版合同，不冒充像素同步或真实任务执行。
- [v3.2 当前资产审阅](qa/decoration-review-2026-10-01.json)：123 项输入候选的新鲜完整 `pnpm check` exit0，124 Contract / 210 Prototype / 20 Real Electron E2E + 最终 package；输入哈希未变。11 会话主题的实际资源哈希、同会话/布局重启与草稿稳定、88/64 引导、48 配饰、24px 安全距、窄容器及消息/错误撤图已测。当前运行截图另存 `qa/decoration-runtime-2026-10-01/`，不覆盖历史截图；聚焦只读独立审阅 PASS，范围与限制以该记录为准。
- 未验证 Windows 200% DPI、强制颜色、读屏、原生 picker；未发布团队库、PR 或软件。

## 工作区组织 · 2026-10-01

当前 Figma 收敛为 **5 页**：`00 · BASELINE · v3.2` → `10 · Hazel × Claude · 规范` → `11 · Hazel × Claude · 组件` → `12 · Hazel · 素材` → `99 · ARCHIVE`。四个当前页面 ID 不变，原画面未改；BASELINE 是 Make 下一轮设计的参考，不是像素锁定。

十个历史页合并到一个 [ARCHIVE 目录](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5889)，用十二个原生 Section 区分 v2 应用、规范、组件、状态、响应式、pre-v2 探索和技术载荷。用户已授权删除迁空旧页，实际只删除九个空页容器；没有删除原稿、组件、素材、变量或样式。

当前基线仍按工作区 → 本机会话 → 设置 → 响应式排列，画面内容和坐标不变。历史顶层原件只改归属与归档位置；原节点 ID、内部布局、实例关联、原型反应及流程起点已核对保留。旧页面级链接与原型 `page-id` 的迁移见 [设计归档与 Make 交接](../figma-archive-make-handoff-2026-10-01.md)，不能沿用“所有链接无需改写”的早先结论。

[合并归档 QA](qa/make-archive-consolidation-2026-10-01.json)记录本次校验和恢复边界；[早先整理记录](qa/workspace-archive-2026-10-01.json)仅对应重命名和排序，保留作历史。已删页面的原 ID 不能用位置清单重建。此次整理不启动开发目标，也不改变工程阶段或历史验收；设计由 Make 继续主导，应用开发仍暂停。

## 维护

### WC1 · 2026-10-01窗口补充

仅在已有`components · v3`增加[可编辑窗口合同](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=894-459)：三点8态、标题栏3态、窗口专用4个primitive和4个alias。原86变量、业务组件组、主画面及归档结构不改；[静态QA](qa/window-chrome-supplement-2026-10-01.json)记录ID和精确回读。运行时已接线且通过独立[136输入完整门](../../testing/wc1-runtime-2026-10-01.md)，该证据不来自Figma；Windows人工门尚未完成，不扩大为整套macOS皮肤或HIG认证。原`figma-state.json`与token统计保留其v3基准口径，窗口补充用本独立QA记录，不倒填旧验收。

`tooling/` 是过程记录，不是一键重置命令。Figma 脚本需外部状态，不能直接重复执行。`build-local.py` 会覆盖初始 manifest 与 CSS，已加显式确认门。最终状态以 `figma-state.json`、当前规范和 QA 为准。

素材验证及打包：`python docs/design/hazel-v3/tooling/validate-kit.py`。只读取本机素材与应用源文件，检查批准的 12 项主题源接入／字节一致、固定预算、24 变体与 2 项设计专用素材不进入运行目录，更新 QA 与 ZIP，不上传或修改应用；源扫描不等于运行时行为验收。

本次生成文件保存在 `assets/`，复现提示集在 `expansion/prompts.json`；原始参考路径只用于本机溯源，打包时换成文件名。6 张 Figma 最新渲染和小尺寸比较在 `qa/expansion-*.png`。旧工程日志与旧 Figma 验收保留原日期，不用新截图覆盖历史证据。

不是官方 Hazel 或 Anthropic 设计系统。作者身份、原图发布与商业权利未独立核验；不要把生成／原创演绎误标为官方资产。
