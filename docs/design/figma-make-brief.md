# Figma Make · Pioneer workbench trial brief

> 2026-10-01 归档迁移：下文保留原日期的设计与验收口径；页面级导航已转向 ARCHIVE 对应分区，P12 的 `page-id` 改为 `257-725`，不新增实点或运行时结论。迁移表与当前入口见 [设计归档与 Make 交接](figma-archive-make-handoff-2026-10-01.md)。 旧试验提示词不约束新一轮 Opus / Sonnet 设计自由度。

Status (2026-09-15): delivered as an independent, unpublished frontend simulation in the correct OasisSaber account. Make file t2bRd26c4Mx7j2a6V2OJlx is Version 9. Actual bounded visual and interaction evidence is consolidated in workbench-design-delivery.md; the repeated-disconnect regression passed on 2026-09-15. Scheduled browser follow-up is paused. The text below is the original brief, not a verbatim transcript of subsequent prompts. Editable Figma remains the design authority; this is not a production Agent runtime.

## Bounded trial prompt

Create one independent interactive desktop prototype for Pioneer, a modular AI Agent workbench. This is a UI simulation: no model calls, terminal execution, file system access, backend, publication or installation. Preserve the existing Figma Design file and its main/archive pages unchanged. Use a new clearly named Make draft only.

Design authority: https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5683 . Reference the existing workbench rather than inventing a new visual system. Key screens: Library318:848, Focus299:728, Review299:729, Delivery343:973. If references cannot be read, report that instead of pretending to use them.

Build only the core attention loop:
1. Home is a media-library poster wall that helps select the right workspace, then resume or start a concrete session.
2. One top global strip switches concrete sessions directly, NOT projects. Three to five visible tabs is a design target, not a hard cap. Overflow goes into a searchable All sessions panel. A session remembers its draft, conversation, selected local output view and layout on switching. Closing an active run's tab does not silently stop it.
3. Agent conversation is primary. Context, capabilities, Diff, files and preview are optional docked panels. Panel-local tabs must not become another global navigation row. Provide focus, review and delivery layouts; no timeline or video-editor widgets.
4. Delivery has functional local Preview / Files / Verification tabs, with one shared conversation. Provide representative mock contents, transparent simulated run status and explicit approval boundaries. Include one draft-save/restore example. No fake real build or test claims.

Visual language: calm, precise, information-dense desktop UI. Normal UI headings20–24px, body14–15px, metadata12px. Noto Sans SC with system sans fallback; monospaced code. Restrained radius8–16px, spacing4/8/12/16/24/32px, thin separators, no oversized PPT headlines, gradients or neon/glass decoration.

Hazel palette: exact support silver #D3D3D3; canvas #F1F2EE; surface #F9FAF7; primary ink #2C3547; secondary #646E72; navy primary action #333C50; mint #D7E3DA; champagne gold #C6AF94 with readable gold ink #76614B; rose #EBDADA, warm #EDE4D6 and slate #DDE2E9 as soft workspace identity accents. Red #B25352 only for destructive/error cues. Use accents sparingly, not large blue fields. Keep the sober navy/silver identity, not a character illustration skin.

Seed sessions: 修复工作区搜索 (Pioneer), 整理参考素材 (Asset), 审阅开题讲稿 (Pioneer-PPT). Workspace names are secondary labels; titles name the actual conversation task. Branch remains main, not a renamed product or page title.

Make the 1280×800 and1600×1000 desktop layouts readable. At narrower widths collapse optional panels before compressing the conversation. Include visible keyboard focus and accessible names. Do not add a permanent project/history sidebar, hard session-count cap, or external integrations.

Deliver an unpublished working prototype and list exactly which interactions are real local simulation versus illustrative controls. Limit this first pass to the scope above; do not generate dozens of disconnected screens.

## Root review after generation

Check single session-strip semantics, poster wall entry, draft restoration, local output tabs, panel hierarchy, exact silver token, contrast, responsive layout and honest simulation status. Keep useful interaction work; do not replace editable source screens merely because Make produced a result. No Make output is accepted until these paths are clicked and visually checked.
