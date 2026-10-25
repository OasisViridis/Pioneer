# Figma & Figma Make 设计与协作开发方案
> 当前同步路线与能力核验见 [#34 · S0 研究交付](../research/design-sync-s0/README.md)（2026-10-25—26）。
> 下文保留早期协作规划；不代表 Code Connect、变量生成或外部写入已经启用。

> **项目**：Wonderwall-Pi Agent (2027 届数字媒体技术毕业设计)
> **设计目标**：利用 Figma 建立全局设计系统变量 (Variables / Styles)，并利用 Figma Make 快速生成高保真界面与组件原型。

---

## 1. 协作工作流规划 (Workflow)

```
[设计系统定义 (Design Tokens)]
       │
       ▼
[Figma Variables & Styles (Tokens 落地)]
       │
       ▼
[Figma Make 提示词生成 (.md 提示词)]  ───►  [Figma Make 一键生成 UI 原型]
       │                                              │
       ▼                                              ▼
[人工微调与组件对齐 (Autolayout + Components)]  ◄──────┘
       │
       ▼
[HTML/CSS 交互 Demo 验证与导出 (design-specs / demos)]
```

---

## 2. Figma 文件结构与页面划分 (Figma Page Structure)

在 Figma 项目中建议建立如下 5 个 Page：

1. **`01 · Cover & Tokens`**：
   - 封面（项目名称、学号、姓名、导师）；
   - Color Variables（Canvas, Surface, Ink, Accent, Dark）；
   - Typography Styles（SF Pro 标题/正文，SF Mono 状态/代码）；
   - Spacing & Radius Tokens。
2. **`02 · Component Sets`**：
   - `Pill / Badge`（P0, P1, Model, Status）；
   - `Intent Card`（Default, Expanded, Executing, Success, Error）；
   - `Light-Hint Bar`（Collapsed, Expanded Profile Drawer）；
   - `Bookshelf Project Card`（Git Repo, Scratchpad, Dirty Workspace）；
   - `Terminal Prompt Bar`（Active, Busy, Copied）；
   - `Clean-up Diff Row`（Rename, Group, Delete-Warning）。
3. **`03 · Design Spec Exemplars`**：
   - Frame 1: Design Tokens & Typography Spec (1920×1080)；
   - Frame 2: Components & Interaction Specs (1920×1080)；
   - Frame 3: Restraint Principle & Model Pathology Hints (1920×1080)。
4. **`04 · Core Agent Page Demos`**：
   - Screen 1: GUI 书架与工作区首页 (Desktop 1440×900 / 1920×1080)；
   - Screen 2: 意图核对与执行会话页 (Desktop 1440×900 / 1920×1080)；
   - Screen 3: 任务收尾与输出页 (Desktop 1440×900 / 1920×1080)。
5. **`05 · Mobile & Headless Views`**：
   - 手机端远程审批与打断界面 (iPhone 16 Pro 393×852)；
   - 无头端状态与离线语音播报卡片。

---

## 3. Figma Make 使用指南与协同规则

1. **结构驱动 (Structure-Driven)**：向 Figma Make 输入提示词时，必须明确图层树结构、AutoLayout 属性（Fill container / Hug contents）、间距数值与颜色 Token。
2. **拒绝 AI 味**：提示词中明确写明禁止渐变背景、禁止极光光晕、禁止毛玻璃大面积阴影、禁止雷达图，只允许实色背景与 1px 发丝线。
3. **组件原子化**：先让 Figma Make 生成基础组件，再在组合页面中调用该组件实例。
