# Pioneer Integrated Closeout Implementation Plan

> **编排已由[2026-09-30统一开发计划](2026-09-30-pioneer-unified-development-plan.md)接手。** 本文保留设计收口与历史验收范围，不再作为第二套待执行队列；当前候选、历史日志边界及并行顺序以新计划和ROADMAP为准。

> **Execution boundary (updated 2026-09-30):** The user explicitly authorized local backend work to resume when needed without another resume notification or approval request. Code slices still need focused scope and real quality gates; this does not authorize unrequested frontend changes, provider/config changes, data export, publication or destructive cleanup.

**Goal:** Close the design P11/P12 and engineering M2 evidence gaps without conflating Figma, historical logs, local-only Workbench functionality, or future Agent execution.

**2026-09-30 design closeout:** The user's later goal expands the design lane to a global Claude × Hazel v2 specification and development-draft reset. Follow [DESIGN-SYSTEM](../design/DESIGN-SYSTEM.md) and the [reset ledger](../design/development-reset.md): the static v2 reset is complete, with 13 main windows, 8 responsive samples, and 81 state compositions. P11 static checks pass; runtime accessibility and the legacy private checklist remain unverified. Current v2 main has zero prototype starts/reaction-bearing nodes, so P12 must first build its v2 flows. The narrow original Task 2 is not a substitute for the expanded deliverable. M2 and publication gates remain unchanged; local backend resumption is separately authorized as above.

**Architecture:** The [authoritative ROADMAP](../../themasterplan/ROADMAP.md) keeps M-stage status. This plan has independent design and engineering lanes that meet at explicit evidence gates. Historical [M2](2026-09-04-m2-desktop-foundation.md) and [M3-A](2026-09-09-m3-intent-review.md) implementation plans remain slice-specific; distant M3-B/M4 features need their own specs and plans rather than fabricated file-level instructions now.

**Tech Stack:** Figma Design/Prototype; Electron + React + TypeScript; Zod/Vitest; Playwright Electron; pnpm on Windows. Current checkout is Git-only even though older governance text assumes jj.

## Global Constraints

- Last audited 2026-09-28: `D:\Project\GitProject\Pioneer`, branch `codex/hazel-session-workbench`, HEAD `cc82d8a`, with pre-existing local changes. Reconfirm all volatile facts before execution.
- The 2026-09-30 user authorization supersedes the earlier Work session's backend pause. Tasks 1–3 are planning/design/documentation work; backend portions of Tasks 4–6 may proceed as needed without asking again. Do not enlarge this authorization into unrelated frontend work or bypass quality/publication/destructive-operation gates.
- Preserve every unexplained local file and existing Figma node. No checkout rename, repository cleanup, branch switch, broad commit, push, merge, publication, or destructive filesystem action from this plan.
- M2 is read-only with narrow IPC. No workspace writes, command execution, model call, invented Agent reply, fake Diff/validation success, or privilege granted by the M3-A `ready` state.
- No workspace data leaves this computer by default. A future remote Provider test needs an explicit user-approved recipient and data scope; mock/local testing is the default until then.
- Keep Contract, frozen M1 Prototype, real Electron E2E, native-picker human checks, Figma screenshot checks, and Windows accessibility checks as separate evidence columns. Link each result to the tested revision/date.
- When a task's original P-stage checklist is unavailable, use the newly stated acceptance below as a **reconstructed** rule and record any later recovered differences; never retroactively mark P01–P07 done.

---

### Task 1: Reconcile the design and engineering baseline — no code changes

**Files:** Read `themasterplan/ROADMAP.md`, `docs/design/workbench-product-spec.md`, `docs/design/workbench-implementation-2026-09-15.md`, `docs/testing/m2-native-picker-smoke.md`, `TEST_INFRA.md`; create or update `docs/testing/pioneer-evidence-ledger.md` with attributable facts. Change ROADMAP status only through its named completion gate.

- [ ] Read the current `AGENTS.md`, `git status --short`, branch/HEAD and the presence of `.jj`; record the exact checkout being audited. Do not alter the dirty worktree.
- [ ] Classify the existing changes into M2 foundation, Workbench local-only extension, M3-A, design documentation, and unrelated material. Record paths without moving them.
- [ ] Re-read the **entire** picker smoke record: G1/G2/G3 are human-observed PASS on `fix/m2-final-gate`; earlier Pending entries are historical. Record the old reviewed build identity and what has changed in the picker-sensitive path.
- [ ] Read the other Work conversation's P10 handoff and try to recover its `Pioneer-阶段推进计划.md` attachment. If unavailable, explicitly note that P01–P07 names and the old P11/P12 checklist have not been recovered.
- [ ] Verify all links in the rebuilt ROADMAP resolve locally and that M2 remains IN PROGRESS, M3 PLANNED, P10 COMPLETE and P12 PLANNED. P11 and the later v2 reset follow their current evidence-backed ROADMAP entries; do not restore an older NEXT label over newer progress.

**Done when:** One evidence ledger names source, date/revision, result, and uncovered scope for each claim; no status was promoted from file existence alone.

### Task 2: Finish P11 · 可读性与状态表达 — Figma lane, no code

**Files/objects:** Current v2 [main `717:1578`](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=717-1578), states `743:1574` and responsive `757:1574`; follow [reset handoff](../design/design-reset-handoff.md) and [current static QA](../design/design-reset-final-qa-2026-09-30.json). The former workbench `299:725` and P10 `686:2824` are archived references, not active edit targets.

**Delivered static acceptance (2026-09-30), not a fresh TODO list:**

- The handoff inventories 21 windows and 81 states, including 1440/1280/900/640, height-constrained and 759/760 samples. Archived P10 evidence retains its original identity.
- Editable layers and reviewed composition/fix screenshots cover hierarchy, state text, fixed input/action regions and compact fallbacks. Node-specific focus/return and independent-scroll rules are in the handoff; they are design contracts, not live keyboard/scroll results.
- The current seven-page QA checks all 1,697 text nodes against actual solid-color backgrounds, not three palette examples. Functional border/focus targets and decorative-boundary exceptions are documented in the global specification. Exact inside-stroke geometry and adjacent CJK-code fallback spans are separately recorded, not hidden.
- Old nodes, variables and prototype reactions are preserved. All final acceptance calls are read-only; current QA supersedes but does not erase historical reports.

**Still pending outside this static delivery:** actual Windows keyboard/IME/reader/forced-colors/200%/reduced-motion acceptance, runtime non-text boundary behavior, and comparison with the recovered private legacy P11 checklist. Do not mark these passed from the static audit.

**Done when:** P11 has a node-level readability/state audit and any changes are visually checked. It is not a WCAG or Electron accessibility certification.

### Task 3: Finish P12 · main 原型连续流程 — Figma lane, no code

**Files/objects:** Current [Figma v2 main page `717:1578`](https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=717-1578); create `docs/design/workbench-p12-flow-audit.md`. Page `132:2` is now `archive · main (pre-v2)` and is historical reference only; do not edit or count its old flows as v2 P12 evidence.

- [ ] First verify the live page is named `main` and has ID `717:1578`. Inventory its actual prototype starts, reactions and relevant variable defaults before editing. The previous Work report's five starts and 117 defaults belong to the old main; do not assume they exist on v2 or silently reuse them. If v2 has no runnable starts yet, record the gap and build the required v2 flows before claiming a click audit.
- [ ] For each start node, run the actual prototype from start to expected result. Record every action, destination node ID, visible state and a return or recovery path. Include approve/refuse, cancel/close, and disconnected/failed paths where the corresponding flow offers them.
- [ ] Use current v2 responsive examples as layout references. The archived P10 examples are historical comparison only; neither static sample proves a main-page click path. Add or repair v2 reactions only within the verified scope; preserve v2 screen IDs and all archived nodes/reactions/default variables. Future capability branches must retain their visible design-example labels.
- [ ] Re-run the touched flows and capture screenshots of both the successful result and at least one non-happy path per affected flow. Mark untested branches explicitly.

**Done when:** The flow audit has an actual click trace for every current start node and no claimed success rests solely on a static screenshot.

### Task 4: Requalify M2 picker evidence on the chosen revision — after code resume

**Files:** `docs/testing/m2-native-picker-smoke.md`, picker-sensitive source in `apps/desktop/src/main/`, `apps/desktop/src/preload/` and `apps/desktop/src/renderer/components/ProjectLibrary.tsx`; no workspace fixture mutation.

- [ ] Identify the exact candidate review revision and compare picker-sensitive changes with the reviewed `fix/m2-final-gate` build. After confirming the ref exists, use `git diff --name-status fix/m2-final-gate -- apps/desktop/src/main apps/desktop/src/preload apps/desktop/src/renderer/components/ProjectLibrary.tsx`; inspect uncommitted changes in those same paths separately.
- [ ] If behavior and native-dialog path are demonstrably unchanged, document why G1/G2/G3 old human PASS applies to the candidate revision, with reviewer sign-off. If changed or uncertain, use the disposable roots and exact G1/G2/G3 procedure already specified in `docs/testing/m2-native-picker-smoke.md` on the candidate Windows build.
- [ ] Keep the earlier user-reported cancel PASS and G1/G2/G3 human observations separately attributed. Do not turn automated picker fixture tests into manual evidence.

**Done when:** The candidate revision has an explicit picker evidence decision, not a copied PASS or erased historical PASS.

### Task 5: Run the M2 final gate and independent review — after code resume

**Files:** Scoped M2 foundation source and tests, `themasterplan/ROADMAP.md`; log under `tests/` with a revision/date-specific name. Preserve the current Workbench branch separately.

- [ ] Select a reviewable M2-foundation-only candidate (the existing `fix/m2-final-gate` ref or an equivalent isolated revision). Do not review the dirty Workbench extension as an M2 prerequisite, and do not delete or overwrite it to obtain isolation.
- [ ] Run `pnpm check` and record process exit code plus counts for Contract, Prototype and real Electron E2E; then run `git diff --check`. If the constrained Electron launcher crashes before tests, follow the documented approved non-sandbox **test-process** path without disabling app sandbox/CSP/contextIsolation.
- [ ] Obtain an independent reviewer assessment of the M2 candidate diff: read-only scan boundary, IPC sender/main-frame/URL checks, settings write scope, catalog/tab failure and recovery, and fixture immutability. Session/dock persistence belongs to a separate Workbench review unless it actually forms part of the selected M2 candidate.
- [ ] Launch the reviewed Windows build and verify the user-visible library/settings entry and selected native-picker outcome. Keep manual observations distinct from E2E.
- [ ] Only after the gate, applicable picker evidence and final review all pass, change M2 in ROADMAP to COMPLETE. PR/merge/push/release remains a separate human gate.

**Done when:** The status change cites one reviewed revision, a complete fresh log, independent review and applicable manual evidence.

### Task 6: Separate the local Workbench and M3-A work from M2 — after code resume

**Files:** `docs/design/workbench-implementation-2026-09-15.md`, `docs/plans/2026-09-09-m3-intent-review.md`, and their named source/tests.

- [ ] For the local-only Workbench, create focused specs for recent-activity data and context-reference management. Each must define identity, persistence/version migration, empty/stale/failure behavior, keyboard focus and real Electron proof; do not hide them inside M2 foundation acceptance.
- [ ] Complete the current Workbench visual/interaction review against P11/P12 and actual Windows UI. Keep “saved locally” visibly different from “sent to model.”
- [ ] Review the three M3-A files named in its existing plan. Run `pnpm exec vitest run tests/contract/task-intent.test.ts`, strict type/lint checks, then a fresh `pnpm check`; obtain independent review before marking **M3-A only** complete.
- [ ] Write separate M3-B and M4-A specifications only after the above boundaries are stable. M3-B must define intent/permission/event state; M4-A must define a real observable read-only Pi bridge. Do not plan write/exec capability into either by implication.

**Done when:** Workbench local-only gaps and M3-A have separate evidence/status; M3 overall remains PLANNED until its own future gates are met.

## Self-check and handoff

- [ ] Every status claim points to a revision/date/source; no P-stage design result is labeled a production feature.
- [ ] No step expands the backend-resume authorization into unrelated frontend/provider changes, data export or destructive operations.
- [ ] No step creates an executor permission from `ready`, skips independent review, or uses frozen M1 tests as Electron proof.
- [ ] Before future execution, recheck the actual checkout path, VCS mode, current Figma nodes, package state and prior test logs.
