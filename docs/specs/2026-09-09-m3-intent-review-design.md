# M3-A intent review domain — design

Date: 2026-09-09
Status: In implementation under user instruction to proceed with internal design/review and request human input at PR gates. This is not release or filesystem-execution authorization.

## Goal
Establish a UI-independent, pure TypeScript model for reviewing a task intent. Approval means ready for a future execution design, never permission to perform filesystem operations.

## Scope
Add shared task-intent contracts, runtime validation, a pure transition function and Contract Tests. Reuse existing TypeScript/Vitest and validation conventions; no new dependencies. Do not change renderer, preload, IPC, main services, demos, Figma, model integration or persistence.

## Model
An intent contains id, projectId (opaque existing ProjectSummary identity), revision (positive integer), instruction, nonempty ordered steps (unique id and summary), and status: draft, reviewing, ready or cancelled. No raw project path is accepted as executable authority. IDs are nonblank strings of at most 256 UTF-16 code units; instruction is nonblank and at most 16,384 code units; step summaries are nonblank and at most 2,048 code units; steps contain 1–100 entries. Validate whitespace without silently rewriting input. Revisions are positive safe integers; revision overflow is rejected. Unknown object keys are rejected. Domain functions receive all data explicitly and do not read clocks, generate random values or perform I/O.

Transitions:
- submit: draft -> reviewing after validation.
- revise: draft/reviewing/ready -> draft, replacing instruction and steps and incrementing revision; any prior confirmation is invalidated.
- confirm: reviewing -> ready, only for the caller's expected revision. Every action carries expectedRevision, so delayed submit/revise/cancel actions are rejected too.
- cancel: draft/reviewing/ready -> cancelled.
- cancelled is terminal. Invalid state or stale revision returns a stable typed error and does not mutate the input.
- Duplicate confirmation never creates an additional decision or side effect; it returns invalid-transition.

Confirmation is a domain review marker, not a security capability. A future executor must independently validate scope, permissions and freshness. No execution event stream, write/move/delete proposal schema, risk classifier or audit persistence is included in this slice.

## Architecture and candidate files
- apps/desktop/src/shared/contracts/task-intent.ts: serializable types and error/result unions.
- apps/desktop/src/shared/task-intent.ts: pure validation and transitions.
- tests/contract/task-intent.test.ts: input and transition coverage.

Follow existing validation patterns after inspecting their implementation. No import of Electron, filesystem, network, process or renderer modules.

## Acceptance
Contract tests cover valid inputs, blank/oversized strings, missing/duplicate steps, malformed status/revision, every allowed and rejected transition, stale confirmations, confirmation invalidation after revision, cancelled terminal state, input immutability and JSON round trips. Test names describe domain proof only, not real execution or Electron proof. Run strict test compilation, Contract Tests and full pnpm check; independent review before delivery.

## Delivery boundaries
Existing unrelated changes remain untouched and are not included in this slice's commit. M2 manual checks remain deferred, not passed; this design does not change M2 acceptance. User performed physical rename to D:\Projects\Pioneer; post-rename validation is tracked separately. No push, merge, cleanup or configuration migration is authorized by this design.
