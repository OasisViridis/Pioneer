# Workbench progress — 2026-09-13

> 2026-10-01 归档迁移：下文保留原日期的设计与验收口径；页面级导航已转向 ARCHIVE 对应分区，P12 的 `page-id` 改为 `257-725`，不新增实点或运行时结论。迁移表与当前入口见 [设计归档与 Make 交接](figma-archive-make-handoff-2026-10-01.md)。

Status: IN PROGRESS. Figma design only, not application implementation.

Authoritative file: https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=908-5683
Editable page: workbench (299:725). Preserve main (132:2) and archive (257:725).

## Current invariant

One global session tab strip. Home is a workspace poster library, not project tabs. Agent conversation remains primary. File/Diff/Preview tabs are local to docked panels. Three to five visible sessions is an attention goal, not a hard cap. Hazel palette uses exact support silver #D3D3D3. No timeline or oversized PPT typography.

## Latest authoritative additions

| State | Node | Position |
| --- | --- | --- |
| E01 declined operation | 405:1576 | 200,10400 |
| E02 stopped, changes retained | 405:1659 | 2000,10400 |
| E02a stopping, waiting confirmation | 411:1666 | 200,11600 |
| E03 disconnected, execution unknown | 411:1744 | 2000,11600 |
| E04 reconciled, test unverified | 413:1775 | 200,12800 |
| E05 retry only approved test | 415:1816 | 2000,12800 |
| E06 test failed | 415:1894 | 200,14000 |
| O08 reconcile before retry wrapper | 413:1754 | 8400,6120 |
| O09 one-time test approval wrapper | 415:1805 | 10200,6120 |
| O10 failure explanation wrapper | 423:1896 | 8400,7320 |

All screen roots 1600x1000. Overlay wrappers same dimensions with bound scrim and centered editable cards.

Reactions:
- W03 decline 325:930 -> E01. E01 405:1608 -> W03; 405:1609 -> W01.
- W04 Stop I326:959;309:789 -> E02a. E02a footer 411:1699 -> E02.
- E02 status button 413:1769 / E03 413:1772 -> O08.
- O08 result 413:1761 -> E04; cancel 413:1763 closes overlay.
- E04 413:1803 -> O09. O09 415:1810 -> E05; cancel 415:1812 closes.
- E05 footer 415:1849 -> E06; Stop I415:1848;309:789 -> E02a.
- E06 415:1922 -> O10; O10 423:1902 closes.

The design clearly distinguishes stop requested / stop confirmed / connection lost. Interrupted tests have no valid pass/fail result. Reconciliation checks process state and existing changes before a separately approved test-only retry. No source rewrite, rollback, or real command execution occurs in this prototype.

## Actual browser evidence already observed

1. W01 -> W02 -> W03 -> decline -> E01 -> original request W03.
2. W03 approve -> W04 Stop -> E02a -> simulated confirmation -> E02.
3. E02 reconcile -> O08 -> E04 -> O09 approve -> E05 -> failed-result demo -> E06.
4. Screenshots of E01/E02/E02a/E03/E04/E05/E06 and O08/O09 were inspected. O10 final screenshot and E03 entry path remain to verify.
5. W06 delivery -> Asset session W08 -> search tab -> W06 delivery: phase and inactive status now retained. This was browser-tested after correcting conditional serialization.

## Stateful search-session routing

New collection: Pioneer · Prototype State, VariableCollectionId:420:1896, mode420:0.
- session/search/returnFrame: VariableID:420:1897, STRING, default299:728.
- session/search/status: VariableID:420:1898, STRING, default Pioneer · 进行中.
- session/search/open: VariableID:420:1899, BOOLEAN, defaulttrue.

Figma/tool limitation verified: conditionalBlocks with more than two blocks silently retains only first IF and second as ELSE. Nested CONDITIONAL actions are rejected. Working solution is multiple mutually exclusive top-level CONDITIONAL actions, each containing IF + empty ELSE.

Fifteen supported return frames: 299:728,324:885,326:930,299:729,343:973,349:1022,351:1079,355:1185,405:1576,405:1659,411:1666,411:1744,413:1775,415:1816,415:1894.

Each of these roots' Chrome Home/Asset/PPT/All actions first stores its current root ID and displayed search status, then navigates/opens the list. Active search tab remains a no-op. Return paths from inactive search tabs and list/resume use conditional routing.

Inactive Chrome IDs with search visible/status variable binding and return routing:
318:849,403:1537,352:1137,362:1251,395:1360,398:1430,399:1482.
Their All action chooses O04 wrapper390:1363 when searchOpen=true, or O04d wrapper390:1366 when false.

Resume/list/restore nodes 323:887,403:1660,365:1304,366:1353 set searchOpen=true then route. O04 description I365:1304;359:1232 is bound to search status. Close-keep 365:1320 sets returnFrame326:930/statusrunning/openfalse then W10.
Home summary labels323:885/403:1658 no longer hardcode a stale running status.

Pending: browser regression of closed -> Home -> PPT -> recent list -> restore; draft fourth-tab state is not yet integrated and All still models only 3/2 established sessions. Draft contexts need rules-only inspector. Do not call all persistence implemented.

## Remaining design delivery

- Complete draft browser checks and correct fourth-session list/navigation semantics.
- Output Preview/File/Verification interactions, W09 outline viewer; meaningful context/capability states.
- Path-unavailable, empty workspace, narrow 1280x800 and keyboard/focus guidance.
- Session rename/reorder/overflow design states or explicit editable interaction specification.
- Final all-root rendering, geometry, contrast, fonts, component/variable and link audit.
- Fresh main/archive protection check; prior recorded baseline was unchanged, but that baseline file is currently unavailable.
- Final editable guidelines, node manifest, local specification and evidence checklist.

## Environment note

On the next automatic continuation the old tmp/figma-workbench-2026-09-12 directory and tool stores were missing. The external Figma page and all 38 roots above were revalidated and remained present. Do not recreate screens from an old skeleton. Investigate current files; do not claim a new byte-exact main/archive comparison without the old baseline.

CUA browser helpers may reset. Inventory first when handles are missing. Browser1 iab is used. Wrapper getScreenshot returned a horizontally cropped panel view; raw supported browser.tabs.get(id).screenshot({fullPage:true}) returned the full1280x720 page without changing viewport. Use actual UI/AX after clicks. Mark handoff each turn if continuing.

## Latest regression and artifact viewer

- Actually clicked W04 close -> O05 -> keep -> W10 -> Home W01 -> PPT W09 -> All O04d -> Recent O04b -> Restore W04. The top strip remained at two sessions through Home/PPT; the list showed two; restoring returned the original search session with three tabs, no duplicate. This supersedes the pending closed-state regression above.
- O11 outline viewer wrapper441:1897, card441:1898 at10200,7320. Reused existing modal design, editable four-minute eight-section outline. W09 Open outline362:1282 opens it, Return441:1903 closes. Card screenshot inspected: readable, no clipping. Browser click regression for O11 is still pending.
- Latest read-only geometric/navigation audit: 37 screen/overlay roots (23 product states,14 overlay wrappers), all1600x1000. Zero visible descendant overflow beyond root bounds. Each product state has exactly one Session Chrome. No missing navigation targets, including conditional branches. Font families limited to Noto Sans SC, Inter and JetBrains Mono. This audit does NOT prove contrast, internal clipping, all click paths or runtime persistence.
- Current browser is W04 at node326-930. iab browser1/tab1 marked handoff. Local JS bindings prototypeTab,qaBrowser,qaTab may need reacquisition if the tool runtime resets.

## Draft state integration — latest continuation

New prototype vars (same collection420:1896/mode420:0): draft/open444:1898 BOOLEAN false; draft/phase444:1899 STRING empty; draft/title444:1900 STRING 新会话; draft/status444:1901 STRING Pioneer · 草稿. Prefix all IDs with VariableID:. Boolean scopes=[] is rejected by tool; retain explicitly supported ALL_SCOPES.

Source draft slot396:1402 now uses Inactive302:740; active W11/W11b/W12 instances explicitly swap back to Active302:733. Source Title#304:0 and WorkspaceState#304:1 use VariableAlias binding to draft title/status. Source click uses three mutually exclusive top-level CONDITIONAL actions: empty->W11,typed->W11b,sent->W12. It sets draft/open=true. Active three draft tabs clear their whole-tab action (no-op).

All20 other product-screen Chrome instances bind ShowDraft#396:0 to draft/open. No main/archive changes. Current Chrome set:306:747,310:793,318:849,324:886,326:931,343:974,349:1023,351:1080,352:1137,355:1186,362:1251,365:1326,403:1537,405:1577,405:1660,411:1667,411:1745,413:1776,415:1817,415:1895.

Entry323:889 and picker401:1538 now guard against overwriting an already-open draft: if open, return according to its phase; otherwise initialize empty draft and open W11. This is one representative draft slot, not arbitrary new-session runtime. Example397:1432 sets open/typed/title/status and W11b. Send I398:1446;309:789 sets open/sent/title梳理搜索验收清单/status已完成 and W12. Keep403:1707 closes tab but preserves typed and goes W13. Discard403:1711 sets openfalse/phaseempty and W01. Restore403:1663 sets opentyped and W11b.

Source close I396:1402;302:746 condition typed->O07 else closes open and W01. W11 close I395:1360;396:1402;302:739 closes open/W01; W11b close I398:1430;396:1402;302:739 opensO07; W12 close I399:1482;396:1402;302:739 closes open/W01. Recently closed fourth-session history is NOT yet modeled; do not claim full persistence. New-entry guard returns an existing sent slot as well (finite demo limitation to document/refine).

Both All-session cards now have optional draft/first-reply Inspector Row:451:1892 under365:1295;451:1896 under368:1357. Visible bound draft/open; Title/Description props alias draft title/status. Row navigation uses same three-phase route. Labels I365:1300;304:729 and I368:1361;304:729 now say 已打开 without a stale hardcoded count.

Tool gotcha: hidden instance descendants are skipped by default. Set figma.skipInvisibleInstanceChildren=false before inspecting them. Direct getNodeByIdAsync on I396:1402;302:746 still returned null, but obtaining the source and findOne Close returned a mutable node. Use the returned node object, not a second hidden-ID lookup. Component TEXT property VariableAliases avoid hidden child traversal for content bindings.

Browser currently W11b398-1429 after W04 + -> O06 -> W11 -> example. Actual screenshots verified empty and typed four-tab states. Next verify: switch to Asset and back via fourth tab; All lists fourth session; close/keep/restore; send first reply and return. Browser1/tab1 marked handoff in this continuation; bindings may reset. The latest guard write happened after page refresh, so reload if specifically testing duplicate-new-entry guard.

## Make acceleration attempt and output views — 2026-09-13

User explicitly permitted trying Figma Make to reduce cost and accelerate the interactive prototype. Tool discovery found no callable Make-generation endpoint (generate_figma_design is webpage capture, not Make). The in-app browser visit to https://www.figma.com/files redirected to Figma login. No Make prompt was submitted, no Make file created, no AI credit saving verified. Existing Figma connector remains available; do not treat browser login as a design-work blocker. Login tab2 is kept for user handoff. Preserve main132:2 and archive257:725; work only in workbench299:725.

Completed in current continuation:
- W06 now has local Preview / Files / Verification views in the SAME screen343:973; no new whole-screen copy. New collection VariableCollectionId:460:1892, modes460:0 Preview /460:1 Files /460:2 Verification. Three visibility bools460:1893/1895/1897 and three tabFill colors460:1894/1896/1898 (prefix VariableID:). Active tab color aliases Hazel slate; inactive transparent. This is prototype state, not application persistence.
- Files panel461:1892, heading461:1935, file rows461:1936/461:1940. Both rows open the existing combined Diff view299:729, not separate file editor implementations.
- Verification panel462:1892, heading462:1893, rows462:1894/462:1895/462:1900. Describes expected search behavior, regression scope and explicit demo-only evidence boundary; does not claim real tests passed.
- Local buttons344:1022/344:1024/344:1026 set variable mode; preview344:1028 visibility bound. Button345:1070 now says 查看界面 and selects Preview.
- Browser clicked Files and Verification: selected style and panel contents changed without navigating global session. Switched to PPT session, opened O11 outline and returned; returned Search stayed at W06 Verification. All visually inspected, no overlap/clipping visible.
- Draft browser regression actually passed: W11b -> Asset -> fourth draft tab -> W11b; All list displayed all four rows; selecting draft returned existing W11b; close -> O07 -> keep -> W13 library -> restore -> W11b -> Send -> W12 first reply. This supersedes those pending checks above. Duplicate-new guard, first-reply closed-history, and rules-only context inspector still not fully verified/implemented.
- W09 View outline -> O11 -> Return browser flow now verified.

Current browser1/tab1: W06 node343-973 in Verification mode. Tab2: Figma login. Both marked handoff. No repository app source, VCS, main or archive mutations in this continuation. No fresh full-file main/archive fingerprint comparison was performed.

Next: prefer a bounded Make trial after browser sign-in, using docs/design/figma-make-brief.md. Do not rebuild existing workbench or expand scope to arbitrary runtime persistence. If Make remains unavailable, finish remaining design-spec/boundary states using current editable Figma, then final visual audit.

## Final design specimens and Make launch — 2026-09-14

- Last goal continuation made concrete design/verification progress, not a wait: W14 compact layout and S01 editable specification are now in Figma.
- O12 wrapper466:1899/card466:1900 at8400,8520 reuses the contextual inspector with collection VariableCollectionId:466:1892; modes466:0 Draft,466:1 Asset,466:2 Presentation. Vars466:1893 title,1894 firstTitle,1895 firstDescription,1896 secondTitle,1897 secondDescription,1898 secondVisible (all prefix VariableID:). Root context triggers395:1364/398:1434/399:1486 -> Draft;352:1141 -> Asset;362:1255 -> Presentation. Header and second row mode switching verified in browser; first row INCORRECTLY stayed Project rules in Asset screenshot, root is diagnosing. Do not claim O12 all modes complete yet.
- Read-only contrast worker found 2 low-contrast active controls. I350:1082;304:731 and I351:1091;304:731 were changed from secondary to bound Hazel ink263:728. It inspected1,146 visible texts and found no other actionable candidates. Nearest opaque solid background method excludes images/disabled-state ambiguity.
- W14 compact reference root468:1897 at2000,14000 is1280x800. Font sizes preserved. Reading column468:1907 contains scroll region471:1941 h394 plus composer468:1926 y418/h148. Browser scroll verified: records move while input remains fixed and wholly visible. Previous first render exposed overflow; fixed before acceptance. It is a finite viewport design reference, not a production responsive implementation.
- S01 specification root469:1941 at3800,1400. Columns469:1945/469:1946 contain eight editable rules covering workspace entry, finite attention/no hard cap, rename/reorder/close, keyboard focus, docking/menu alternative, compact scrolling, context/capability boundaries and demo-only delivery. Screenshot inspected. Boundary-state group472:1941 has empty workspace472:1942, unavailable path472:1943 and focus specimen472:1944. These are editable UI state specimens, not runtime directory-picker or keyboard implementations.
- Capability inspector O03 already explicitly covers available, disabled, unavailable and approval-required states; no need to invent another full-screen capability flow.

Make account correction:
- The first attempt used the wrong browser Figma account Oasis and created empty file x9LFnWkfPYjB8Qm4DPIWAS. No prompt sent there. User corrected account; leave that empty file alone, do not delete without authorization.
- Current correct account visibly confirmed as OasisSaber, team9022303's team. User had opened a new empty Make file t2bRd26c4Mx7j2a6V2OJlx; root reused it rather than creating another.
- Renamed to Pioneer · Hazel Workbench · Interactive. User explicitly said paste the Design link directly into prompt. Root submitted one Chinese prompt containing exact user link299-725, confirmed visual/token/interaction requirements, no overwrite or publishing, and local UI simulation boundaries.
- Correct Make URL: https://www.figma.com/make/t2bRd26c4Mx7j2a6V2OJlx/Pioneer-Hazel-Workbench-Interactive . Current browser1/tab4 (provider bdb83910-cb29-4e78-9057-bc3f9e5501bd); selected model Claude Opus4.8 preserved. UI showed Stop and Thinking after send, so the generation is confirmed live. Re-poll this same file/tab; do not restart merely for an observation timeout.
- Tab5 holds original Pioneer Design, tab3 Figma Recents, tab2 landing. All are user-created/currently opened. Old prototype tab missing after reset; don't rely on previous qaTab/prototypeTab bindings.
- Make result has NOT been rendered or accepted yet. No published output, no real Agent run, no verified savings claim. Next inspect completed generation, click core paths, compare against existing workbench. Preserve main132:2/archive257:725 and existing editable screens.

Make live update: correct file t2bRd26c4Mx7j2a6V2OJlx showed Working for2m50s, Stop, and edits to index.css/store.ts/PosterWall.tsx on the same generation. Its visible response explicitly says it cannot read Figma Design links with its available tools, so this is specification-driven, not confirmed source-layer reuse. It is building the workbench from written constraints and exact Hazel palette. Do not restart. Compare rendered result to source before accepting; import source frames later only if necessary.
O12 follow-up: first-row instance properties had valid aliases and all three variable mode values, but browser showed default contents. Direct characters bindings were added to I466:1903;359:1231 and I466:1903;359:1232 to those same variables. This fix is written but NOT yet browser reverified.

## 2026-09-15 — 有界收尾交付

本节覆盖旧段落中的待办；历史记录不删除。最终证据索引见 workbench-design-delivery.md。

- O12 之后已实际验证：W08 素材目录/现有规范，W09 开题要求/当前提纲正确；W07c 与 O10 已完成最终渲染检查。
- Make V5–V7 的授权、草稿、搜索与 1280×800 检查结果见交付索引。V8 实际显示交付海报网格，且稳定执行→停止请求→确认停止→已停止可点通。
- V8 同一会话连续两次断连会复用错误恢复状态。V9 修复后，2026-09-15 用一次批量点击核对完整 7 步：批准→断连→核对回待批准→再次批准→手动完成→第二次断连→核对回待审阅；均通过。最终说明为“断连前已完成并进入待审阅，状态恢复为待审阅，未新增任何权限”。不是独立构建或真实命令测试。
- 原 Design 仅修改 workbench 的 W04：新增页脚 502:1942、断连入口 502:1943；原页脚 326:960 与根 326:930 重新建立容器关系。页脚 y982/h18，入口 x335/w87，截图可读不重叠，导航目标为 E03 411:1744；旧审阅目标 299:729 保留。再次 API 读取确认入口与 12 个关键屏幕存在。
- 当前页名称 main132:2 / archive257:725 / workbench299:725；S01 469:1941 保留可编辑原型与生产实现的边界说明。
- 用户要求减少浏览器消耗；pioneer-make 自动化已返回 PAUSED。不再逐项循环巡检，不增加新功能，不发布、不改本地源码/VCS。