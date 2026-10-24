# Pioneer M1.5 Repository Normalization and M2 Product Foundation Design

**Status:** Approved on 2026-09-04  
**Scope:** M1.5 repository normalization followed by the first M2 product vertical slice  
**Canonical repository:** `OasisSaber/Pioneer`  
**Canonical local path:** `D:\Projects\Pioneer`

## 1. Goal

Convert Pioneer from a design-prototype repository into a repository that can host a long-lived desktop product without discarding the existing graduation-design evidence.

The delivery has two ordered outcomes:

1. M1.5 establishes one identity, one documentation truth model, a frozen-demo boundary, and an honest three-level test taxonomy.
2. M2 creates a real Electron + React + TypeScript application that reads local project metadata through a secure desktop boundary and delivers the first complete interaction loop: project library → project poster → unique project tab → close and return.

## 2. Authoritative boundaries

### 2.1 Repository identity

- Product and repository name: `Pioneer`.
- GitHub repository: `https://github.com/OasisSaber/Pioneer`.
- Canonical local checkout: `D:\Projects\Pioneer`.
- `Pionner` and `D:\Project\demo-thesis-2027` are legacy physical paths, not valid current repository identities.
- Example workspace names used inside screenshots or fixture data may differ from `Pioneer`, but they must be explicitly identified as examples rather than repository paths.

The physical directory rename is the final operational step because renaming the live checkout invalidates the current Codex workspace. Documentation and code use the canonical path from M1.5 onward.

### 2.2 Documentation truth model

- `README.md` is the current public entry point. It reports what can be run now, links with repository-relative paths, and distinguishes prototypes from product code.
- `themasterplan/THEMASTERPLAN.md` is the durable vision and architecture charter. It does not claim milestone completion.
- `themasterplan/ROADMAP.md` is the sole milestone-status source. At the M2 foundation start it records M1 complete, M1.5 complete, and M2 in progress.
- `PROJECT.md` describes the formal product architecture and contracts. Historical prototype inventories move to explicitly historical documentation instead of defining the current product.
- `TEST_INFRA.md` defines the current three-level test taxonomy and commands.
- `TEST_READY.md` becomes a historical M1 prototype-readiness record and cannot be cited as proof that the Electron product works.
- `AGENTS.md` remains the delivery entry point and its primary verification command becomes `pnpm check` after the M2 skeleton exists.

### 2.3 Figma collaboration boundary

The active visual-design workstream is the user-managed Figma file:

<https://www.figma.com/design/EQis9ep9ZQsEenrUVXwlFU/Pioneer?node-id=0-1&t=j0sOVgTRV0rMWZNx-1>

This repository work must not edit that Figma file, invoke a write-capable Figma automation, or invent a competing visual system.

- This specification owns architecture, behavior, data contracts, security constraints, and test semantics.
- Figma owns approved component geometry, typography, color, spacing, iconography, and motion once the user explicitly hands those decisions to implementation.
- Until that handoff, the frozen HTML demos provide a non-authoritative visual baseline only.
- If an implementation detail conflicts with an approved Figma decision, the affected visual work pauses for reconciliation; scanner, IPC, domain, and test-contract work may continue.
- Figma credentials are supplied only through environment variables. No token is committed to the repository.

## 3. Frozen HTML demo policy

`demos/` and `design-specs/` are M1 design-reference assets, presentation material, and visual-regression baselines. They are not the Pioneer product runtime.

Allowed changes:

- repair a broken presentation interaction;
- preserve offline demonstration behavior;
- update an explicitly approved visual baseline;
- fix accessibility, security, or factual defects in the reference itself.

Disallowed changes:

- add new product-domain behavior because it is quicker than implementing it in React;
- use a demo as the runtime source imported by the Electron application;
- count simulator-only behavior as proof that the formal application works;
- keep growing a single HTML file into the application architecture.

`demos/README.md` records this policy and points to `apps/desktop` as the formal implementation.

## 4. Test taxonomy

### 4.1 Contract Tests

Contract Tests execute deterministic TypeScript units without launching the Electron UI. They verify boundaries that multiple processes depend on:

- project-catalog types and runtime validation;
- canonical path normalization and project identity;
- one-level scanner behavior against filesystem fixtures;
- inaccessible-child and partial-result behavior;
- IPC request and response contracts;
- tab reducer invariants, including uniqueness and close fallback.

Contract Tests may use temporary directories or committed fixtures. They may not replace the scanner with a renderer mock and then claim filesystem coverage.

Command: `pnpm test:contract`.

### 4.2 Prototype Tests

Prototype Tests preserve the existing 210-case simulator suite, offline HTML runner, and adversarial/static probes. They verify M1 reference artifacts and design-contract history.

They do not launch the formal Electron application and therefore do not prove main/preload/renderer integration, native directory selection, or real application behavior. The existing `210/210` statement is always labeled **Prototype Tests**.

Command: `pnpm test:prototype`.

### 4.3 Real E2E

Real E2E launches the actual Electron application through Playwright's Electron support and exercises production process boundaries:

1. Electron main process receives an E2E fixture root through an explicit launch-only configuration seam.
2. The real one-level filesystem scanner reads committed workspace fixtures.
3. The real preload bridge returns the typed catalog to the React renderer.
4. The renderer displays poster cards.
5. A poster opens one dynamic project tab.
6. Reopening the same poster focuses the existing tab instead of duplicating it.
7. Closing the active project tab returns to the most recently active valid tab.

No renderer-level API stub may be used for these flows. Native directory-picker UI itself may be covered separately because the deterministic E2E root deliberately avoids automating an operating-system dialog.

Command: `pnpm test:e2e`.

### 4.4 Aggregate gate

`pnpm check` runs, in order:

1. formatting and lint validation;
2. TypeScript type checking;
3. Contract Tests;
4. Prototype Tests;
5. Real E2E;
6. production build/package smoke validation.

A narrower gate cannot be used to support a broader completion claim.

## 5. Application architecture

### 5.1 Repository layout

```text
apps/desktop/
  src/main/
  src/preload/
  src/renderer/
  src/shared/
tests/
  contract/
  prototype/
  e2e/
  fixtures/workspaces/
```

The root is a pnpm workspace. M2 uses one modular desktop application rather than creating independent packages before a second consumer exists.

Electron Forge provides the desktop lifecycle and packaging foundation. React and TypeScript implement the renderer. The implementation uses the stable Forge TypeScript/Webpack route rather than relying on Forge's currently experimental Vite plugin. This decision may be revisited only through a documented architecture change.

This tooling choice follows Electron Forge's documented React + TypeScript integration and avoids its explicitly experimental Vite path:

- <https://www.electronforge.io/guides/framework-integration/react-with-typescript>
- <https://www.electronforge.io/templates/vite>

### 5.2 Process responsibilities

#### Main process

- creates the secure BrowserWindow;
- owns the native directory picker;
- loads and persists the most recently selected root under Electron `userData`;
- validates root paths;
- performs one-level, read-only project discovery;
- returns serializable data and structured warnings;
- validates IPC sender and input before filesystem access.

#### Preload

The preload script exposes one narrow, typed `window.pioneer` facade:

```ts
interface PioneerDesktopApi {
  selectRoot(): Promise<CatalogResult | null>;
  getCatalog(): Promise<CatalogResult>;
  rescan(): Promise<CatalogResult>;
}
```

It does not expose `ipcRenderer`, Node globals, arbitrary channels, or general filesystem methods.

#### Renderer

- owns visible loading, empty, ready, partial-warning, and recoverable-error states;
- renders the fixed Project Library tab, dynamic project tabs, and Settings tab;
- renders the Jellyfin-inspired poster wall;
- uses a focused React reducer for tab state;
- never reads local files directly.

#### Shared contracts

Shared code contains serializable domain types, IPC channel constants, validation schemas, and stable error codes. It contains no Electron runtime objects and no renderer components.

### 5.3 BrowserWindow security baseline

- `nodeIntegration: false`;
- `contextIsolation: true`;
- renderer sandbox enabled;
- no remote content in the product window;
- restrictive Content Security Policy;
- navigation and new-window creation denied unless an explicitly validated future feature requires them;
- IPC methods exposed one by one through `contextBridge`;
- IPC sender and all path-bearing inputs validated in main.

These constraints follow Electron's official context-isolation and security guidance:

- <https://www.electronjs.org/docs/latest/tutorial/context-isolation>
- <https://www.electronjs.org/docs/latest/tutorial/security>

## 6. Project catalog

### 6.1 Scan boundary

- The user selects one root directory through the native picker.
- Only immediate child directories are candidates.
- The scanner does not recurse into nested projects, dependencies, caches, or repositories.
- It does not execute project scripts or arbitrary Git hooks.
- It does not modify the selected root or any child.
- It may read bounded metadata from `README.md`, `package.json`, Git markers, and filesystem timestamps.
- Symlink and junction handling is explicit: a candidate resolving outside the selected root is skipped with a structured warning.
- An inaccessible child produces a warning while accessible siblings remain visible.

The application may write only its own settings under Electron `userData`.

### 6.2 Domain result

```ts
type CatalogWarningCode =
  | 'ROOT_UNAVAILABLE'
  | 'CHILD_UNREADABLE'
  | 'OUTSIDE_ROOT_LINK'
  | 'METADATA_INVALID';

interface ProjectSummary {
  id: string;
  name: string;
  absolutePath: string;
  description: string | null;
  technologies: string[];
  hasGitRepository: boolean;
  lastModifiedAt: string;
  coverSeed: string;
}

interface CatalogWarning {
  code: CatalogWarningCode;
  path: string;
  message: string;
}

interface CatalogResult {
  rootPath: string | null;
  projects: ProjectSummary[];
  warnings: CatalogWarning[];
  scannedAt: string | null;
}
```

`ProjectSummary.id` is derived from the normalized absolute path, not from the display name. This prevents duplicate tabs for the same project.

## 7. M2 interaction design

### 7.1 Project Library

- The Project Library tab is fixed and cannot be closed.
- With no configured root it shows a quiet empty state and one primary “Choose workspace” action.
- A successful scan sorts projects by most recent modification by default.
- M2 provides name search, manual rescan, and root switching.
- Poster cards show name, concise description, technology tags, Git presence, and relative recency.
- Missing artwork produces a deterministic abstract cover from `coverSeed`; the application performs no network image scraping.

### 7.2 Dynamic project tabs

- Clicking a poster opens a project tab keyed by `ProjectSummary.id`.
- Clicking the same poster again focuses the existing tab.
- A project tab shows a read-only overview, canonical path, and discovered metadata.
- Closing the active tab focuses the most recently active remaining tab; if none remains, it returns to Project Library.
- Agent execution, terminal panels, task persistence, workspace mutation, and Premiere-style panel docking are M3 or later work.

### 7.3 Settings

M2 Settings contains only the current scan root, a root-change action, and application/build information. It is not a general configuration center yet.

## 8. Error behavior

- Cancelling the directory picker returns `null` and leaves the current catalog unchanged.
- If a remembered root becomes unavailable, the renderer keeps the last in-memory catalog for the session, marks it stale, and offers root selection.
- Child-level failures return partial results with non-blocking warnings.
- A complete root failure returns a stable error code; raw filesystem paths may be shown locally in the UI but are not sent over a network.
- Rescan is single-flight: a second request focuses the existing progress state rather than starting a concurrent scan.
- Unexpected IPC payloads fail closed and do not reach filesystem operations.

## 9. Delivery sequence

### M1.5 repository normalization

1. Establish the canonical identity and relative links across public documentation.
2. Align README, THEMASTERPLAN, ROADMAP, PROJECT, TEST_INFRA, TEST_READY, and AGENTS with their defined truth roles.
3. Add the frozen-demo policy.
4. Move or rename legacy test assets so every command clearly identifies Prototype Tests.
5. Add the pnpm workspace and a working `pnpm test:prototype` entry. Reserve `test:contract`, `test:e2e`, and the aggregate `check` names in documentation; add each executable command only with the M2 test implementation it runs. No passing no-op test script is permitted.
6. Verify no current document presents `Pionner` or the old graduation-design checkout as the repository path.

### M2 first product slice

1. Create the Electron Forge + React + TypeScript application under `apps/desktop`.
2. Implement shared contracts and failing Contract Tests.
3. Implement the one-level read-only scanner and its boundary cases.
4. Implement validated IPC handlers and the narrow preload facade.
5. Implement the tab reducer and React application shell.
6. Implement the project library, poster cards, dynamic project overview tabs, and minimal Settings tab.
7. Implement Real E2E against committed fixture workspaces.
8. Run `pnpm check`, review the complete diff, and push only after human authorization.
9. Rename the physical checkout to `D:\Projects\Pioneer` and reopen the project from that path.

## 10. Acceptance criteria

M1.5 is complete only when:

- repository identity and current paths are unambiguous;
- README and milestone documents report consistent status;
- Demo assets are explicitly frozen as references;
- the 210 legacy cases are labeled Prototype Tests everywhere they are claimed;
- Contract Tests, Prototype Tests, and Real E2E have distinct definitions and reserved command names; M1.5 requires the Prototype command to run, while M2 supplies the executable Contract, Real E2E, and aggregate commands.

The M2 vertical slice is complete only when:

- `pnpm dev` launches the real Electron application;
- a user can select a root and see real immediate child directories as project posters;
- scanning does not write into the selected workspace;
- project tabs open uniquely, refocus without duplication, close, and fall back correctly;
- Contract Tests cover scanner, validation, IPC, and reducer behavior;
- Prototype Tests retain the 210/210 baseline;
- Real E2E crosses the actual Electron main, preload, and renderer boundary using filesystem fixtures;
- `pnpm check` passes from a clean checkout;
- code does not conflict with or write to the active Figma workstream.

## 11. Out of scope

- Agent execution and Pi-Agent integration;
- terminal/event-stream panels;
- workspace file mutation;
- task/session persistence;
- Premiere-style dockable panels;
- recursive or multi-root scanning;
- network poster scraping;
- automated Figma writes or unsupervised visual replacement;
- production signing, installers, auto-update, and release publication.
