# Project: Pioneer Modular AI Agent Interaction System Architecture

## Authority and current boundary

[`themasterplan/ROADMAP.md`](themasterplan/ROADMAP.md) is the sole authority for milestone status. M1.5 and M2 are complete. M3 starts from the approved Figma workspace contract and the first `Input → Intent Review → READY` vertical slice.

The current product implementation is the [`apps/desktop`](apps/desktop/) Electron + React + TypeScript application. M2 provides the completed read-only desktop foundation. M3 extends the renderer and shared task-intent domain without weakening the M2 filesystem or IPC boundaries.

## Approved M2 target: read-only workspace slice

M2 is limited to the following target boundary:

- shared serializable project-catalog types, IPC channel constants, validation schemas, and stable error codes;
- an Electron main process that owns settings, validates inputs and IPC senders, and scans immediate child directories read-only;
- a narrow preload facade, `window.pioneer`, exposing only `selectRoot()`, `getCatalog()`, and `rescan()`;
- a renderer-owned reducer that keeps Project Library and Settings fixed, opens project-overview tabs by unique project identity, and focuses an existing tab instead of duplicating it;
- a Jellyfin-inspired Library poster wall, unique project overview tabs, and minimal Settings; and
- Contract Tests plus Real E2E that launches the actual Electron process chain.

The scanner must not recurse, execute workspace code, modify the selected root, or expose arbitrary filesystem access. Workspace reorganization, mutation, organization drawers, and reversible snapshots are M3 or later work; they are outside M2.

## Implemented application boundaries

- `apps/desktop/src/main` owns Electron lifecycle, a guarded E2E-only runtime seam, sender-validated IPC registration, isolated settings under Electron `userData`, and immediate-child read-only scanning.
- `apps/desktop/src/preload` exposes only the typed `window.pioneer` catalog facade through `contextBridge`.
- `apps/desktop/src/renderer` owns React state and UI: Library, project overview, fixed Settings, keyboard-operable Tabs, and unique project-tab identity.
- `apps/desktop/src/shared` contains serializable contracts, fixed IPC channel names, schemas, and stable warning codes shared across process boundaries.
- `tests/contract` exercises deterministic domain and process-boundary behavior. `tests/e2e` launches the actual Electron chain against `tests/fixtures/workspaces/library` and verifies that fixture tree is unchanged.

The authoritative current workspace handoff is the Figma `Pioneer · DEMO Lab` page (`132:2`). For the first M3 slice, D03 `输入 / 新任务 Compose` (`135:258`) and D04 `输入 / 执行与批准` (`136:105`) define the interaction contract. Frozen HTML demos remain historical references only and are not imported into the desktop runtime.

## Formal desktop contracts

The target catalog is serializable across the Electron boundary. A `ProjectSummary` has a normalized-path-derived `id`, display metadata, Git presence, modification time, and deterministic cover seed. A `CatalogResult` contains the selected root, project list, structured warnings, and scan time. The main process may persist only its own settings under Electron `userData`.

The preload facade is intentionally narrow:

```ts
interface PioneerDesktopApi {
  selectRoot(): Promise<CatalogResult | null>;
  getCatalog(): Promise<CatalogResult>;
  rescan(): Promise<CatalogResult>;
}
```

It must not expose `ipcRenderer`, Node globals, arbitrary channels, or generic filesystem methods. The renderer never reads local files directly. Closing an active dynamic project tab returns to the most recently active valid tab, or Project Library if none remains.

## Verification taxonomy and completion boundaries

- **Contract Tests** are deterministic TypeScript units for shared schemas, normalized paths, the scanner, IPC, settings, security, runtime configuration, and the tab reducer. Run `pnpm test:contract`.
- **Prototype Tests** are the frozen M1 simulator plus static/adversarial probes. `pnpm test:prototype` executes them now; the historical 210-case result is Prototype Tests evidence, never Electron proof.
- **Real E2E** uses Playwright to launch Electron and cross main → preload → renderer against filesystem fixtures, including fixture immutability. Run `pnpm test:e2e`.
- `pnpm check` is the primary gate and runs formatting, lint, typecheck, all three evidence layers, and a final package smoke in a fixed order.

The native directory picker is outside the deterministic E2E fixture seam. A renderer mock cannot establish a Real E2E claim.

## M1 historical prototype inventory and contracts

The single-file demos are frozen M1 reference implementations. See [`demos/README.md`](demos/README.md) for their allowed-change policy and visual-handoff boundary. They are not the product runtime and must not be imported by the future Electron application.

The former feature matrix and simulator interface shapes are **historical M1 prototype contracts**, not formal M2 APIs. This explicitly includes `EventBus`, `approveIntent`, `rewindToNode`, `applyReorganization`, `rollback`, simulated tab methods, scene switchers, organization drawers, and snapshot flows. They document prototype behavior only; none establishes a current filesystem, IPC, Electron, or product contract.

The M1 simulator's four coverage tiers are historical **Prototype Tests** tiers. They are retained as prototype evidence, not a formal implementation boundary.

- `demos/00-pioneer-workbench.html` — integrated workbench reference;
- `demos/01-bookshelf-workspace.html` — Jellyfin-style workspace reference;
- `demos/02-session-intent-card.html` — modular execution-session reference;
- `demos/03-wrapup-and-gallery.html` — wrap-up and artifact-gallery reference;
- `demos/04-ppt-presentation-demo.html` — presentation-stage reference.

New product-domain behavior belongs in the `apps/desktop` Electron + React + TypeScript application.

## Repository layout

```text
Pioneer/
├── apps/desktop/          # Electron main, preload, renderer, and shared contracts
├── PROJECT.md
├── TEST_INFRA.md
├── TEST_READY.md
├── demos/                 # frozen M1 reference assets
├── tests/prototype/       # frozen M1 Prototype Tests and probes
├── tests/contract/        # deterministic TypeScript contract suites
├── tests/e2e/             # Playwright Real E2E and fixture-integrity checks
├── tests/fixtures/        # committed read-only Real E2E workspaces
└── tests/repository/      # repository-policy gate
```

## Approved M3 first vertical slice

The canonical scene vocabulary is `输入 / 审阅 / 输出 / 自定`.

- **输入** owns both task composition and pre-execution Intent Review. Intent Review is not the top-level **审阅** scene.
- **审阅** is reserved for reviewing Agent-modified files and Diff after a future execution runtime exists.
- **输出** is reserved for generated artifacts and the standard actions `打开 → 文件夹内打开 → 复制 → 复制路径`.
- **自定** is reserved for user-composed workspace modules.
- The first M3 vertical slice ends at TaskIntent status `ready`. It must not execute project code, mutate workspace files, start an Agent runtime, add generic filesystem IPC, or claim that approval caused execution.
- TaskIntent transitions reuse the shared `draft → reviewing → ready` domain contract. Revision, cancellation, and stale-revision protections remain domain-owned rather than UI-owned.

See [`docs/design/M3-INTERACTION-CONTRACT.md`](docs/design/M3-INTERACTION-CONTRACT.md).

## Approved M3 runtime-session bootstrap slice

The next M3 slice consumes an already approved `TaskIntent.status = ready` and creates a local, serializable `RuntimeSession` bootstrap record.

- Runtime bootstrap consumes the approved TaskIntent snapshot; it must not reinterpret the raw user instruction or silently regenerate the approved plan.
- A bootstrapped session is only `initialized`. It does not imply model access, tool execution, project-file mutation, event streaming, or a running Agent process.
- The bootstrap contract records all execution capabilities as disabled so later runtime work must cross an explicit new authorization boundary.
- No new generic filesystem IPC or preload capability is introduced by this slice.

See [`docs/design/M3-RUNTIME-SESSION-CONTRACT.md`](docs/design/M3-RUNTIME-SESSION-CONTRACT.md).

## Approved M3 runtime lifecycle / event skeleton

The third M3 slice creates a local `RuntimeLifecycle` around an initialized Runtime Session.

- lifecycle state starts at `initialized` with one deterministic `session.initialized` event;
- an explicit user action may move it to `start_requested` and append exactly one `runtime.start_requested` event;
- event sequence numbers are contiguous and event ids are derived from session identity plus sequence;
- duplicate start requests are rejected;
- the event skeleton contains no fabricated timestamps, token usage, tool output, or execution result;
- recording `start_requested` does not enable model access, tools, file writes, IPC, or a Runtime process.

See [`docs/design/M3-RUNTIME-LIFECYCLE-CONTRACT.md`](docs/design/M3-RUNTIME-LIFECYCLE-CONTRACT.md).

## M3 and later exclusions

Workspace mutation or reorganization, reversible snapshots, actual Agent runtime execution, model/provider integration, tool execution, external/runtime event transport (WebSocket/SSE), session trees, plugin runtime integration, and freeform/dockable workspaces remain later M3/M4 work and require separate design, authorization, and verification.
