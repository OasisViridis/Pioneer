# S1 token 差异与接受决定

基线：`d5a2f87ab2c79af76ffbe721fc32472404345952`；历史 v2/v3 固定于 `395df15cd544d1d6f8bb8adb0fa292ff23f3c901`。2026-10-26 回读六集合、101 个原生变量与三组件投影，和 S0 相同。全部都是 snapshot-only，没有历史 Figma version ID。

## 进入生产的变化

| CSS 变量               | main      | 此 PR 提案 | 原因                                                                                            |
| ---------------------- | --------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `--hazel-tool-surface` | `#eef1f3` | `#eeedea`  | 接受 native `color/surface-muted`；`--pioneer-surface-muted` 保持 alias。                       |
| `--hazel-secondary`    | `#646e72` | `#64696f`  | 接受 native `color/secondary`；确保次级文字在新浅底上达到 4.5:1，`--pioneer-muted` 保持 alias。 |

其余 22 个原有 CSS 变量保留名称、解析值和语义关系。新增 `--pioneer-font-body` 与 `--pioneer-line-height-body` 仅抽取原有字体栈和单位行高，应用值不变。`--pioneer-space: 1rem` 与 `--pioneer-radius: 0.75rem` 不改为 px；原生 FLOAT 的几何语义需显式确定，不能仅凭数值推断单位。

## 原生变量逐项清单

完整别名 ID、历史值和理由见 [evidence.json](evidence.json)。accept 表示进入此 PR 的接受提案，最终接受点是合并 commit；preserve-runtime-difference 保留主线差异；preserve-design-only 保留设计证据，不加入生产输入。

| 集合 | 名称 | 原生解析值 | runtime | 决定 |
| --- | --- | --- | --- |
| v3 / Primitives | `color/canvas` | `#f6f5f1` | `--hazel-canvas` | preserve-runtime-difference |
| v3 / Primitives | `color/surface` | `#fdfcfa` | `--hazel-surface` | preserve-runtime-difference |
| v3 / Primitives | `color/surface-muted` | `#eeedea` | `--hazel-tool-surface` | accept |
| v3 / Primitives | `color/ink` | `#2c3547` | `--hazel-ink` | accept |
| v3 / Primitives | `color/secondary` | `#64696f` | `--hazel-secondary` | accept |
| v3 / Primitives | `color/navy` | `#333c50` | `--hazel-navy` | accept |
| v3 / Primitives | `color/navy-hover` | `#212a3b` | 无 | preserve-design-only |
| v3 / Primitives | `color/on-navy` | `#f9f9f9` | 无 | preserve-design-only |
| v3 / Primitives | `color/silver` | `#d9d7d2` | `--hazel-line` | preserve-runtime-difference |
| v3 / Primitives | `color/control-border` | `#858d92` | 无 | preserve-design-only |
| v3 / Primitives | `color/mint` | `#dce9df` | `--hazel-mint` | preserve-runtime-difference |
| v3 / Primitives | `color/success-ink` | `#35644b` | `--hazel-success-ink` | accept |
| v3 / Primitives | `color/notice` | `#ede4d6` | `--hazel-warm` | accept |
| v3 / Primitives | `color/gold` | `#c6af94` | `--hazel-gold` | accept |
| v3 / Primitives | `color/gold-ink` | `#76614b` | `--hazel-gold-ink` | accept |
| v3 / Primitives | `color/rose` | `#ebdada` | 无 | preserve-design-only |
| v3 / Primitives | `color/risk` | `#b25352` | 无 | preserve-design-only |
| v3 / Primitives | `color/risk-ink` | `#934342` | 无 | preserve-design-only |
| v3 / Primitives | `color/slate` | `#dde2e9` | `--hazel-slate` | accept |
| v3 / Primitives | `color/jade` | `#dceadf` | `--hazel-jade` | accept |
| v3 / Primitives | `color/berry` | `#944b59` | 无 | preserve-design-only |
| v3 / Primitives | `number/0` | `0` | 无 | preserve-design-only |
| v3 / Primitives | `number/4` | `4` | 无 | preserve-design-only |
| v3 / Primitives | `number/8` | `8` | 无 | preserve-design-only |
| v3 / Primitives | `number/12` | `12` | 无 | preserve-design-only |
| v3 / Primitives | `number/16` | `16` | 无 | preserve-design-only |
| v3 / Primitives | `number/24` | `24` | 无 | preserve-design-only |
| v3 / Primitives | `number/32` | `32` | 无 | preserve-design-only |
| v3 / Primitives | `number/48` | `48` | 无 | preserve-design-only |
| v3 / Primitives | `number/64` | `64` | 无 | preserve-design-only |
| v3 / Primitives | `number/1` | `1` | 无 | preserve-design-only |
| v3 / Primitives | `number/2` | `2` | 无 | preserve-design-only |
| v3 / Primitives | `number/14` | `14` | 无 | preserve-design-only |
| v3 / Primitives | `number/15` | `15` | 无 | preserve-design-only |
| v3 / Primitives | `number/20` | `20` | 无 | preserve-design-only |
| v3 / Primitives | `number/36` | `36` | 无 | preserve-design-only |
| v3 / Primitives | `number/40` | `40` | 无 | preserve-design-only |
| v3 / Color | `color/canvas` | `#f6f5f1` | `--pioneer-background` | preserve-runtime-difference |
| v3 / Color | `color/surface` | `#fdfcfa` | `--pioneer-surface` | preserve-runtime-difference |
| v3 / Color | `color/surface-muted` | `#eeedea` | `--pioneer-surface-muted` | accept |
| v3 / Color | `color/text-primary` | `#2c3547` | `--pioneer-foreground` | accept |
| v3 / Color | `color/text-secondary` | `#64696f` | `--pioneer-muted` | accept |
| v3 / Color | `color/text-on-action` | `#f9f9f9` | 无 | preserve-design-only |
| v3 / Color | `color/action` | `#333c50` | 无 | preserve-design-only |
| v3 / Color | `color/action-hover` | `#212a3b` | 无 | preserve-design-only |
| v3 / Color | `color/border-subtle` | `#d9d7d2` | `--pioneer-border` | preserve-runtime-difference |
| v3 / Color | `color/border-control` | `#858d92` | 无 | preserve-design-only |
| v3 / Color | `color/focus` | `#333c50` | `--pioneer-focus` | preserve-runtime-difference |
| v3 / Color | `color/notice-surface` | `#ede4d6` | `--pioneer-notice` | accept |
| v3 / Color | `color/notice-border` | `#c6af94` | 无 | preserve-design-only |
| v3 / Color | `color/notice-text` | `#2c3547` | 无 | preserve-design-only |
| v3 / Color | `color/success-surface` | `#dce9df` | 无 | preserve-design-only |
| v3 / Color | `color/success-text` | `#35644b` | 无 | preserve-design-only |
| v3 / Color | `color/error-surface` | `#ebdada` | 无 | preserve-design-only |
| v3 / Color | `color/error-text` | `#934342` | 无 | preserve-design-only |
| v3 / Color | `color/danger-action` | `#b25352` | 无 | preserve-design-only |
| v3 / Color | `color/identity-slate` | `#dde2e9` | 无 | preserve-design-only |
| v3 / Color | `color/identity-jade` | `#dceadf` | 无 | preserve-design-only |
| v3 / Color | `color/icon` | `#64696f` | 无 | preserve-design-only |
| v3 / Color | `color/code-surface` | `#212a3b` | 无 | preserve-design-only |
| v3 / Color | `color/code-text` | `#f9f9f9` | 无 | preserve-design-only |
| v3 / Color | `color/decorative-berry` | `#944b59` | 无 | preserve-design-only |
| v3 / Geometry | `space/0` | `0` | 无 | preserve-design-only |
| v3 / Geometry | `space/4` | `4` | 无 | preserve-design-only |
| v3 / Geometry | `space/8` | `8` | 无 | preserve-design-only |
| v3 / Geometry | `space/12` | `12` | 无 | preserve-design-only |
| v3 / Geometry | `space/16` | `16` | `--pioneer-space` | preserve-runtime-difference |
| v3 / Geometry | `space/24` | `24` | 无 | preserve-design-only |
| v3 / Geometry | `space/32` | `32` | 无 | preserve-design-only |
| v3 / Geometry | `space/48` | `48` | 无 | preserve-design-only |
| v3 / Geometry | `space/64` | `64` | 无 | preserve-design-only |
| v3 / Geometry | `radius/0` | `0` | 无 | preserve-design-only |
| v3 / Geometry | `radius/8` | `8` | 无 | preserve-design-only |
| v3 / Geometry | `radius/12` | `12` | `--pioneer-radius` | preserve-runtime-difference |
| v3 / Geometry | `radius/16` | `16` | 无 | preserve-design-only |
| v3 / Geometry | `stroke/1` | `1` | 无 | preserve-design-only |
| v3 / Geometry | `stroke/2` | `2` | 无 | preserve-design-only |
| v3 / Geometry | `type/12` | `12` | 无 | preserve-design-only |
| v3 / Geometry | `type/14` | `14` | 无 | preserve-design-only |
| v3 / Geometry | `type/15` | `15` | 无 | preserve-design-only |
| v3 / Geometry | `type/20` | `20` | 无 | preserve-design-only |
| v3 / Geometry | `type/24` | `24` | 无 | preserve-design-only |
| v3 / Geometry | `control/32` | `32` | 无 | preserve-design-only |
| v3 / Geometry | `control/36` | `36` | 无 | preserve-design-only |
| v3 / Geometry | `control/40` | `40` | 无 | preserve-design-only |
| v3 / Geometry | `control/48` | `48` | 无 | preserve-design-only |
| v3 / Window Primitives | `window/close` | `#ff5f57` | 无 | preserve-design-only |
| v3 / Window Primitives | `window/minimize` | `#febc2e` | 无 | preserve-design-only |
| v3 / Window Primitives | `window/fullscreen` | `#28c840` | 无 | preserve-design-only |
| v3 / Window Primitives | `window/inactive` | `#b8b3b1` | 无 | preserve-design-only |
| v3 / Window Controls | `color/close` | `#ff5f57` | 无 | preserve-design-only |
| v3 / Window Controls | `color/minimize` | `#febc2e` | 无 | preserve-design-only |
| v3 / Window Controls | `color/fullscreen` | `#28c840` | 无 | preserve-design-only |
| v3 / Window Controls | `color/inactive` | `#b8b3b1` | 无 | preserve-design-only |
| F9 / Source additions | `f9/navy-deep` | `#252c3b` | 无 | preserve-design-only |
| F9 / Source additions | `f9/silver-2` | `#e7e5e0` | 无 | preserve-design-only |
| F9 / Source additions | `f9/mint-2` | `#c6dccb` | 无 | preserve-design-only |
| F9 / Source additions | `f9/mint-ink` | `#2f5e45` | 无 | preserve-design-only |
| F9 / Source additions | `f9/gold-soft` | `#f1e9de` | 无 | preserve-design-only |
| F9 / Source additions | `f9/desk` | `#c9cbc8` | 无 | preserve-design-only |
| F9 / Source additions | `f9/map-tint` | `#e4e6e3` | 无 | preserve-design-only |

## 字体、文字样式与 modes

- 六集合只有 Light（S0 原始 mode ID、scopes、codeSyntax 全部保留）。当前生成只输出一个 `:root`，不引入深色主题。
- 历史 v2/v3 与 F9 的 Noto Sans SC、Noto Serif SC、JetBrains Mono 和字体 style/字重/字号/行高保留在 S0 快照与 evidence.json。生产保持 Inter → Noto Sans SC → system-ui → sans-serif；本 PR 不新增字体；同步 main `fd26d06` 后，沿用 #13 已接受的 Noto Sans SC / Noto Serif SC 字体资产与 fonts.css，不改其加载方式。
- 当前 main 的组件字号、布局间距仍是局部 CSS 常量；没有把所有 FLOAT 自动转成 px，也不全量重排界面。
- 七个 F9 补充值全部保留为设计专用；没有 main 消费者，暂不输出 CSS。
- Window 两集合重复声明同一 WEB codeSyntax，保留原始元数据，禁止直接扁平化为同名 token；当前 main 用原生窗口，不迁移这些颜色。

## 历史资产和过时工具

初始基线 `d5a2f87` 未包含历史 Hazel v3 包、ZIP、provenance、decoration-policy 与 v2 JSON；历史固定 commit 路径和 SHA-256 保留在 evidence.json。合并前同步 main `fd26d06` 后已继承 #13 的这些材料，本 PR 相对该 main 不改资产、ZIP/manifest 或运行时素材接入。原生变量与历史文字样式差异保留，未迁移内容不是已接受输入。

历史 `build-local.py` 和 `validate-kit.py` **退出日常生产路线**：它们含重建 CSS、写 QA/ZIP 及读取用户目录生成图的副作用。当前复用的是纯读的对比度公式、S0 哈希及已有 Electron fixture 不变量。素材哈希/装饰预算的运行时规则仍须按 #13 已接受的主线适配；本票未运行历史 12 素材预算，不将继承资产等同于该预算通过。

## 参考

- [DTCG 2025.10](https://www.designtokens.org/tr/2025.10/format/)：color 使用 sRGB 对象；dimension 使用 value + px/rem；语义使用 `{group.token}`。
- [Style Dictionary CSS format](https://styledictionary.com/reference/hooks/formats/predefined/)：标准 `css/variables` + `outputReferences`。
- [S0 导出请求](../../docs/research/design-sync-s0/read-requests.json)：只读固定范围，不依赖 Variables REST 或插件 Git Sync。
