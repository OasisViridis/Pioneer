# M3-A Intent Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Establish validated, immutable intent review transitions, as the first M3 slice, not full M3 delivery.

**Architecture:** Pure shared contracts and Zod schemas using the existing dependency. The transition function parses unknown input and returns a discriminated result; no execution authority is produced.

**Tech Stack:** TypeScript, existing Zod, Vitest.

## Global Constraints
- User superseded repeated design-approval checkpoints: proceed with internal implementation and independent review; retain PR/release and destructive-operation gates.
- Spec: docs/superpowers/specs/2026-09-09-m3-intent-review-design.md.
- No renderer, IPC, main, Figma, Demo, dependency or workspace-file modifications.
- Preserve existing unrelated changes; no broad commit, push, merge or cleanup.
- M2 manual checks remain deferred. This slice proves domain behavior only.

### Task 1: Validated intent model
Files: create apps/desktop/src/shared/contracts/task-intent.ts; apps/desktop/src/shared/task-intent.ts; tests/contract/task-intent.test.ts.
Interfaces: TaskIntent, IntentAction, IntentErrorCode, IntentResult; TaskIntentSchema and IntentActionSchema. Result is {ok:true,value:TaskIntent} or {ok:false,error:IntentErrorCode}. Error codes: INVALID_INTENT, INVALID_ACTION, STALE_REVISION, INVALID_TRANSITION, REVISION_OVERFLOW.
- [ ] Write failing schema tests for strict keys, blank/oversized fields, 1–100 unique steps, valid status and positive safe revision.
- [ ] Run targeted Vitest with pnpm exec vitest run tests/contract/task-intent.test.ts; verify expected RED.
- [ ] Implement types and strict Zod schemas using existing conventions, no new package.
- [ ] Run focused tests and pnpm test:contract:types; verify GREEN.

### Task 2: Pure review transitions
Same files. Interface: transitionIntent(intent: unknown, action: unknown): IntentResult.
- [ ] Write failing table tests for every status/action pair and matching/mismatched expectedRevision.
- [ ] Add tests for revise invalidating ready, duplicate confirm, cancelled terminal state, revision overflow, frozen inputs and independent output objects.
- [ ] Verify RED then implement submit/revise/confirm/cancel. Validate intent, then action, then revision, then allowed transition, then overflow for revise. Return deterministic errors in that order.
- [ ] Only revise increments revision; all other transitions preserve revision. Clone via schema parsing so outputs cannot mutate input aliases.
- [ ] Verify GREEN and JSON round trips; no filesystem hash test masquerading as execution proof.

### Task 3: Integration and review
- [ ] Format only the three new source/test files; run lint and strict type compilation.
- [ ] Run pnpm check and record exact output/exit code.
- [ ] Request independent GPT-5.6 Luna scoped review; flat structure, no child agents.
- [ ] Address verified issues and rerun relevant checks.
- [ ] Record this slice's evidence without marking full M3 complete or M2 manually accepted.

## Later M3 work, not discarded
Input/review/output workspaces, execution event flow, executor authority, persistence and reversible workspace operations still require follow-on designs, user authorization and appropriate integration evidence. UI work must coordinate with the user's Figma design. Completion of the current plan does not satisfy these remaining M3 deliverables.
