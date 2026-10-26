# Pioneer M2 Desktop Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first long-lived Pioneer product slice: a secure Electron application that scans real immediate child directories read-only, presents them as project posters, and manages unique closable project tabs.

**Architecture:** Electron main owns native UI, settings, path validation, and filesystem reads; preload exposes three typed catalog methods; React owns visible state and tab interaction; shared modules contain serializable contracts only. Contract Tests drive boundaries first, while Playwright Electron Real E2E proves the production main/preload/renderer chain against copied filesystem fixtures.

**Tech Stack:** Electron 44.2.0, Electron Forge 7.11.2 with Webpack, React 19.2.8, TypeScript 6.0.3, pnpm 11.7.0, Zod 4.5.4, Vitest 5.0.0, Playwright 1.62.1, ESLint 10.9.1, Prettier 3.9.6.

## Global Constraints

- Complete and verify the M1.5 plan first; start M2 from its clean local parent.
- Use test-driven development for contracts, scanner, IPC, settings, reducer, and the Real E2E path: RED → minimal GREEN → refactor.
- The selected workspace is read-only. Do not write files, run scripts, invoke Git, follow out-of-root links, or recursively enumerate descendants.
- Electron may write only its own settings under `app.getPath('userData')`; Real E2E uses an isolated temporary `userData` path.
- Keep `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, a restrictive CSP, denied navigation/new windows, narrow `contextBridge` methods, and validated IPC sender/input.
- Do not import from `demos/` into `apps/desktop`. Do not modify the Figma file. CSS in this phase is semantic and minimal; approved Figma geometry, typography, color, spacing, icons, and motion wait for explicit handoff.
- Do not add agent execution, terminals, workspace mutation, recursive/multi-root scan, network poster scraping, installers, signing, auto-update, or releases.
- Use Jujutsu snapshots per task. Do not push, merge, publish, release, or rename the live checkout until the explicit closing gate.

---

### Task 1: Scaffold the formal Electron workspace

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/forge.config.ts`
- Create: `apps/desktop/webpack.main.config.ts`
- Create: `apps/desktop/webpack.renderer.config.ts`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/main/window.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/renderer/index.html`
- Create: `apps/desktop/src/renderer/index.tsx`
- Create: `apps/desktop/src/renderer/App.tsx`
- Create: `apps/desktop/src/renderer/global.d.ts`
- Create: `apps/desktop/src/renderer/styles/tokens.css`
- Create: `apps/desktop/src/renderer/styles/app.css`

- [ ] **Step 1: Add pinned root tooling**

Extend root `package.json` with these development dependencies at exact versions:

```json
{
  "devDependencies": {
    "@playwright/test": "1.62.1",
    "@types/node": "24.13.3",
    "@typescript-eslint/eslint-plugin": "8.69.0",
    "@typescript-eslint/parser": "8.69.0",
    "@vitest/coverage-v8": "5.0.0",
    "eslint": "10.9.1",
    "eslint-plugin-react": "7.37.5",
    "eslint-plugin-react-hooks": "7.1.1",
    "globals": "17.12.0",
    "prettier": "3.9.6",
    "typescript": "6.0.3",
    "vitest": "5.0.0"
  }
}
```

TypeScript 6.0.3 is intentional: `@typescript-eslint/*` 8.69.0 supports TypeScript below 6.1, whereas TypeScript 7 would violate the peer range.

- [ ] **Step 2: Add the desktop package**

Create `apps/desktop/package.json` with name `@pioneer/desktop`, `private: true`, `main: .webpack/main`, runtime dependencies `react@19.2.8`, `react-dom@19.2.8`, `zod@4.5.4`, and these exact development dependencies:

```json
{
  "@electron-forge/cli": "7.11.2",
  "@electron-forge/plugin-fuses": "7.11.2",
  "@electron-forge/plugin-webpack": "7.11.2",
  "@electron/fuses": "2.1.3",
  "@types/react": "19.2.18",
  "@types/react-dom": "19.2.7",
  "copy-webpack-plugin": "14.0.0",
  "css-loader": "7.1.5",
  "electron": "44.2.0",
  "html-webpack-plugin": "5.6.8",
  "style-loader": "4.0.0",
  "ts-loader": "9.6.2",
  "typescript": "6.0.3",
  "webpack": "5.110.3"
}
```

Add package scripts `start`, `build` (`electron-forge package`), and `typecheck` (`tsc --noEmit`). Add root script `dev` as `pnpm --filter @pioneer/desktop start`. Do not add makers because installers are outside M2.

- [ ] **Step 3: Configure Forge and TypeScript**

Use Forge Webpack entry points named `main_window` with one preload script. Set `packagerConfig.asar: true`. Configure `FusesPlugin` with `FuseVersion.V1`, `RunAsNode: false`, `EnableCookieEncryption: true`, `EnableNodeOptionsEnvironmentVariable: false`, `EnableNodeCliInspectArguments: false`, `EnableEmbeddedAsarIntegrityValidation: true`, and `OnlyLoadAppFromAsar: true`. Verify the packaged main and preload are loaded from ASAR. Configure `BrowserWindow` through `window.ts`, not inline in `index.ts`.

`tsconfig.json` must use strict mode, `jsx: react-jsx`, `module: Node16`, `moduleResolution: Node16`, DOM + ES2023 libs, `noUncheckedIndexedAccess`, and include every file under `src` plus the Forge config files. With no package-level `type: module`, this emits CommonJS for Forge while avoiding legacy module-resolution behavior.

- [ ] **Step 4: Add the smallest launchable renderer**

Render only a minimal semantic shell: a top-level `<main>`, a tablist with Library and Settings labels, and a content panel saying the catalog is loading. Import `tokens.css` and `app.css`; limit tokens to neutral fallback values and document that Figma owns final visual values.

Define Forge globals in the main source:

```ts
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
```

- [ ] **Step 5: Install and launch the skeleton**

```powershell
pnpm install
pnpm --filter @pioneer/desktop typecheck
pnpm --filter @pioneer/desktop start
```

Expected: Electron opens the React shell with no renderer console error. This is a manual launch observation, not Real E2E evidence.

- [ ] **Step 6: Snapshot the skeleton**

```powershell
jj describe -m "feat: scaffold Pioneer Electron desktop app"
jj new
```

---

### Task 2: Define shared catalog and IPC contracts

**Files:**
- Create: `apps/desktop/src/shared/contracts/catalog.ts`
- Create: `apps/desktop/src/shared/contracts/errors.ts`
- Create: `apps/desktop/src/shared/contracts/ipc.ts`
- Create: `apps/desktop/src/shared/contracts/tabs.ts`
- Create: `apps/desktop/src/shared/validation.ts`
- Create: `tests/contract/catalog-contract.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing contract-schema tests**

Cover valid round trips and rejection of unknown warning codes, missing project IDs, invalid timestamps, and non-string paths. Define each IPC request as an empty argument tuple and test that any extra argument is rejected. Import the not-yet-created schemas from `apps/desktop/src/shared/validation.ts`.

Expected public types:

```ts
export type CatalogWarningCode =
  | 'ROOT_UNAVAILABLE'
  | 'CHILD_UNREADABLE'
  | 'OUTSIDE_ROOT_LINK'
  | 'METADATA_INVALID';

export interface ProjectSummary {
  id: string;
  name: string;
  absolutePath: string;
  description: string | null;
  technologies: string[];
  hasGitRepository: boolean;
  lastModifiedAt: string;
  coverSeed: string;
}

export interface CatalogResult {
  rootPath: string | null;
  projects: ProjectSummary[];
  warnings: CatalogWarning[];
  scannedAt: string | null;
}
```

Expected root availability failures remain serializable `CatalogResult` values with `projects: []` and a warning whose stable code is `ROOT_UNAVAILABLE`; they do not leak a raw filesystem exception. The renderer may preserve an earlier in-memory result and mark it stale when this result arrives.

- [ ] **Step 2: Add the Vitest command and confirm RED**

Configure Vitest to include only `tests/contract/**/*.test.ts`. Add root script:

```json
"test:contract": "vitest run --config vitest.config.ts"
```

Run: `pnpm test:contract`

Expected: FAIL because shared contract modules do not exist.

- [ ] **Step 3: Implement serializable types, schemas, and channel constants**

Export Zod schemas matching the TypeScript types and only these channels:

```ts
export const IPC_CHANNELS = {
  selectRoot: 'catalog:select-root',
  getCatalog: 'catalog:get',
  rescan: 'catalog:rescan',
} as const;
```

Define the preload surface in shared code:

```ts
export interface PioneerDesktopApi {
  selectRoot(): Promise<CatalogResult | null>;
  getCatalog(): Promise<CatalogResult>;
  rescan(): Promise<CatalogResult>;
}
```

Also export `type EmptyIpcRequest = readonly []`. Main handlers must receive zero payload arguments; a call with any extra argument fails closed before dialog, settings, or filesystem access.

Keep Electron objects and React types out of `src/shared`.

- [ ] **Step 4: Run Contract Tests GREEN**

Run: `pnpm test:contract`

Expected: all schema and serialization cases pass.

- [ ] **Step 5: Snapshot the shared boundary**

```powershell
jj describe -m "feat: define catalog and IPC contracts"
jj new
```

---

### Task 3: Implement the one-level read-only scanner

**Files:**
- Create: `apps/desktop/src/main/catalog/fs-adapter.ts`
- Create: `apps/desktop/src/main/catalog/path-policy.ts`
- Create: `apps/desktop/src/main/catalog/metadata.ts`
- Create: `apps/desktop/src/main/catalog/scanner.ts`
- Create: `tests/contract/path-policy.test.ts`
- Create: `tests/contract/scanner.test.ts`
- Create: `tests/helpers/hash-tree.ts`
- Create: `tests/fixtures/workspaces/library/alpha-app/README.md`
- Create: `tests/fixtures/workspaces/library/alpha-app/package.json`
- Create: `tests/fixtures/workspaces/library/alpha-app/nested/not-a-project.txt`
- Create: `tests/fixtures/workspaces/library/beta-notes/README.md`
- Create: `tests/fixtures/workspaces/library/broken-metadata/package.json`

- [ ] **Step 1: Add deterministic fixtures**

Use distinct modification timestamps in tests through the filesystem adapter rather than relying on committed file mtimes. `alpha-app` has a valid package description and dependencies; `beta-notes` has a README first paragraph; `broken-metadata/package.json` is deliberately malformed. The nested file proves scanning stops after immediate children. Add `hashFixtureTree(root)` in `tests/helpers/hash-tree.ts` so Contract Tests and Real E2E can compare sorted relative paths plus SHA-256 contents before and after scans.

- [ ] **Step 2: Write path-policy tests RED**

Test these signatures:

```ts
normalizeRootPath(input: string): string
isPathInsideRoot(root: string, candidate: string): boolean
projectIdFromPath(normalizedPath: string): string
```

Cover Windows drive-letter casing, trailing separators, same-name folders at different paths, `..` escapes, and a resolved symlink/junction candidate outside the root.

Run: `pnpm test:contract`

Expected: FAIL because path-policy functions do not exist.

- [ ] **Step 3: Implement canonical path identity**

Use `path.resolve`, platform-aware normalization, and a stable SHA-256 digest of the normalized absolute path for `ProjectSummary.id` and `coverSeed`. Do not expose an unstable array index as identity.

- [ ] **Step 4: Write scanner tests RED**

Define an injectable adapter with only read operations:

```ts
export interface CatalogFs {
  readdir(path: string): Promise<readonly DirentLike[]>;
  realpath(path: string): Promise<string>;
  readTextPrefix(path: string, maxBytes: number): Promise<string>;
  stat(path: string): Promise<{ mtime: Date; isDirectory(): boolean }>;
  access(path: string): Promise<void>;
}

export interface DirentLike {
  name: string;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}
```

Test: immediate directories only; file children ignored; metadata precedence; newest-first sorting; invalid metadata warning with sibling retained; unreadable child warning with sibling retained; unavailable root returns `ROOT_UNAVAILABLE`; ordinary directory accepted; in-root symbolic link accepted only after `realpath`; outside-root symbolic link/junction skipped; broken link warned and skipped; and no adapter write method exists. Every candidate is contained using its resolved real path, not the directory entry name alone.

- [ ] **Step 5: Implement metadata and scanner minimally**

Expose:

```ts
readProjectMetadata(projectPath: string, fs: CatalogFs): Promise<Pick<ProjectSummary,
  'description' | 'technologies' | 'hasGitRepository' | 'lastModifiedAt'>>

scanWorkspace(rootPath: string, options?: { fs?: CatalogFs; now?: () => Date }): Promise<CatalogResult>
```

Bound reads to `README.md`, `package.json`, `.git` existence, and the child directory stat. Call `readTextPrefix(..., 65_536)` for README content and use the first non-heading paragraph. Never recurse.

- [ ] **Step 6: Run scanner tests GREEN and check fixture immutability**

```powershell
pnpm test:contract
git status --short -- tests/fixtures/workspaces
```

Expected: Contract Tests pass; the scanner test's before/after `hashFixtureTree` values are identical; Git lists only the intended newly created fixtures, never test-run mutations.

- [ ] **Step 7: Snapshot the scanner**

```powershell
jj describe -m "feat: add read-only project catalog scanner"
jj new
```

---

### Task 4: Add settings, validated IPC, and the narrow preload facade

**Files:**
- Create: `apps/desktop/src/main/settings-store.ts`
- Create: `apps/desktop/src/main/catalog/catalog-service.ts`
- Create: `apps/desktop/src/main/ipc.ts`
- Create: `apps/desktop/src/main/security.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/window.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/global.d.ts`
- Create: `tests/contract/settings-store.test.ts`
- Create: `tests/contract/ipc.test.ts`

- [ ] **Step 1: Write settings-store tests RED**

Specify one JSON file below an injected `userData` directory, atomic replacement through a temporary sibling file, schema validation on load, and `null` recovery for a missing/corrupt record. The only persisted field is `rootPath`.

Run: `pnpm test:contract`

Expected: FAIL because the settings store does not exist.

- [ ] **Step 2: Implement the isolated settings store**

Expose `createSettingsStore(userDataPath)` with `loadRoot(): Promise<string | null>` and `saveRoot(rootPath: string): Promise<void>`. This is the only M2 module allowed to write, and tests must prove its target stays under injected `userDataPath`.

- [ ] **Step 3: Write IPC/service tests RED**

Create dependency-injected handlers so tests do not launch Electron. Cover:

- remembered-root catalog load;
- picker cancel returns `null` and preserves catalog/root;
- selected root is validated before save/scan;
- root failure returns stable structured error state;
- concurrent rescan calls share one in-flight promise;
- sender validation rejects an untrusted frame before any filesystem call;
- unexpected argument payloads are rejected;
- initial `getCatalog()` loads the remembered root exactly once;
- an unavailable remembered root returns `ROOT_UNAVAILABLE`, while `CatalogService` retains its prior in-memory catalog as stale when one exists.

- [ ] **Step 4: Implement catalog service and IPC registration**

`CatalogService` owns current in-memory catalog, stale fallback, and single-flight rescan. `registerCatalogIpc` registers only the three `IPC_CHANNELS`. Inject the trusted `BrowserWindow`; accept only events whose `event.sender.id` equals that window's `webContents.id` and whose `senderFrame` is its main frame. As a secondary check, compare against an injected expected renderer URL: the exact Forge dev origin derived from `MAIN_WINDOW_WEBPACK_ENTRY`, or the exact packaged `file:` URL. Navigation remains denied. Contract tests cover the legitimate main frame, a foreign sender, a child frame, and a sender after navigation. Validate every result with the shared schema before returning it.

- [ ] **Step 5: Expose only `window.pioneer`**

Use `contextBridge.exposeInMainWorld('pioneer', api)` with one `ipcRenderer.invoke` per declared method. Never expose `ipcRenderer`, `send`, dynamic channel names, Node globals, or filesystem methods. Type `Window.pioneer` as `PioneerDesktopApi`.

- [ ] **Step 6: Enforce BrowserWindow security**

In `window.ts`, set:

```ts
webPreferences: {
  preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
}
```

Add a CSP that allows only bundled self resources in packaged mode. The development policy may additionally allow the exact Forge localhost origin and its WebSocket endpoint; do not use a wildcard remote origin. Deny `will-navigate` away from the exact app URL and make `setWindowOpenHandler` return `{ action: 'deny' }`.

- [ ] **Step 7: Run Contract Tests GREEN**

Run: `pnpm test:contract`

Expected: settings, validation, single-flight, sender, and preload contract tests pass.

- [ ] **Step 8: Snapshot the desktop boundary**

```powershell
jj describe -m "feat: add secure catalog IPC boundary"
jj new
```

---

### Task 5: Drive the tab model with reducer contracts

**Files:**
- Create: `apps/desktop/src/renderer/state/tabs-reducer.ts`
- Create: `tests/contract/tabs-reducer.test.ts`

- [ ] **Step 1: Write reducer tests RED**

Use these stable IDs:

```ts
export const LIBRARY_TAB_ID = 'library';
export const SETTINGS_TAB_ID = 'settings';
export const projectTabId = (projectId: string) => `project:${projectId}`;
```

Test: Library and Settings are fixed; project open activates it; duplicate open does not duplicate; opening updates MRU order; closing a background tab preserves active tab; closing active selects most-recent valid tab; with no dynamic tab left, fallback is Library; fixed tabs cannot close.

Run: `pnpm test:contract`

Expected: FAIL because the reducer does not exist.

- [ ] **Step 2: Implement the reducer without UI dependencies**

Define `TabsState` as `tabs`, `activeTabId`, and `mruTabIds`. Define actions `OPEN_PROJECT`, `ACTIVATE_TAB`, and `CLOSE_TAB`. Store the `ProjectSummary` on a project tab so renderer views do not re-query by display name.

- [ ] **Step 3: Run reducer tests GREEN**

Run: `pnpm test:contract`

Expected: all uniqueness and close-fallback invariants pass.

- [ ] **Step 4: Snapshot the state model**

```powershell
jj describe -m "feat: add deterministic project tab reducer"
jj new
```

---

### Task 6: Write the acceptance test, then implement the React product slice

**Files:**
- Modify: `apps/desktop/src/renderer/App.tsx`
- Create: `apps/desktop/src/renderer/hooks/use-catalog.ts`
- Create: `apps/desktop/src/renderer/components/TabStrip.tsx`
- Create: `apps/desktop/src/renderer/components/ProjectLibrary.tsx`
- Create: `apps/desktop/src/renderer/components/ProjectPoster.tsx`
- Create: `apps/desktop/src/renderer/components/ProjectOverview.tsx`
- Create: `apps/desktop/src/renderer/components/SettingsView.tsx`
- Create: `apps/desktop/src/renderer/components/CatalogNotice.tsx`
- Modify: `apps/desktop/src/renderer/styles/tokens.css`
- Modify: `apps/desktop/src/renderer/styles/app.css`
- Create: `docs/testing/m2-native-picker-smoke.md`
- Create: `tests/e2e/playwright.config.ts`
- Create: `tests/e2e/pioneer.e2e.spec.ts`
- Create: `tests/e2e/fixture-integrity.ts`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Write the Real E2E behavior before the renderer**

The test must launch Electron with Playwright `_electron`, point it at `apps/desktop`, set `PIONEER_E2E=1`, set `PIONEER_E2E_ROOT` to the committed `tests/fixtures/workspaces/library`, and isolate `PIONEER_E2E_USER_DATA` under a test-output temporary directory. Resolve the Electron binary under pnpm strict isolation with `createRequire(path.join(desktopDir, 'package.json'))('electron')` and pass that result as Playwright's `executablePath`; do not depend on accidental root hoisting.

Assert through renderer locators:

1. posters come from the real fixture child directories;
2. the nested file never appears as a poster;
3. opening `alpha-app` creates one dynamic tab;
4. clicking its poster again still leaves one matching tab and focuses it;
5. opening `beta-notes`, returning to `alpha-app`, then closing `alpha-app` selects `beta-notes` by MRU;
6. closing the last project tab returns to Library;
7. Settings shows the fixture root;
8. partial invalid-metadata warning is visible without hiding valid siblings.

Compute fixture hashes before launch and after close and assert they are identical.

- [ ] **Step 2: Add the command and confirm RED**

Add root scripts:

```json
"build:desktop": "pnpm --filter @pioneer/desktop build",
"test:e2e": "pnpm build:desktop && playwright test --config tests/e2e/playwright.config.ts"
```

Run: `pnpm test:e2e`

Expected: FAIL because the app does not yet expose the required library/poster/tab behavior and ignores the deterministic E2E root/userData seam.

- [ ] **Step 3: Implement catalog state transitions**

`useCatalog` must expose `{ status, result, stale, error, chooseRoot, rescan }` and represent `loading`, `empty`, `ready`, `partial`, and `error`. On first mount it calls `window.pioneer.getCatalog()` exactly once. Picker cancellation leaves the previous state unchanged. A `ROOT_UNAVAILABLE` result retains the last in-memory result with `stale: true` when one exists.

- [ ] **Step 4: Connect the tab strip to the reducer**

Render a semantic `role="tablist"`; fixed Library and Settings tabs have no close button. Dynamic project tabs are keyed by `ProjectSummary.id`, expose a named close button, and dispatch activation/close actions. No component computes uniqueness independently of the reducer.

- [ ] **Step 5: Build the project library behavior**

Implement name search, manual rescan, root switching, and default newest-first display. The no-root state has one primary `Choose workspace` button. Partial warnings are non-blocking and accessible. Poster cards show name, concise description, technologies, Git presence, and relative recency.

- [ ] **Step 6: Build deterministic covers and overview tabs**

Generate cover class/gradient inputs only from `coverSeed`; do not fetch images. Poster activation dispatches `OPEN_PROJECT`. The project overview is read-only and shows canonical path plus discovered metadata. It has no run, terminal, edit, delete, or Git action.

- [ ] **Step 7: Build minimal Settings**

Show current root, `Change workspace`, application version, and build mode only. Route root changes through `window.pioneer.selectRoot()`.

- [ ] **Step 8: Apply neutral semantic styling**

Provide usable focus states, keyboard-visible controls, responsive poster columns, and overflow behavior. Add this source comment at the token definition:

```css
/* Neutral engineering fallback only. Approved Figma tokens replace these values after explicit handoff. */
```

Do not port pixel values from the frozen HTML demos and do not describe the result as Figma-complete.

- [ ] **Step 9: Type-check and manually smoke the slice**

```powershell
pnpm --filter @pioneer/desktop typecheck
pnpm --filter @pioneer/desktop start
```

Expected: choose-root, poster open/refocus, tab close, Settings, search, and rescan are manually operable. Record this as a manual smoke only.

Use `docs/testing/m2-native-picker-smoke.md` to record Windows evidence for: cancel leaves state unchanged; selecting a valid root loads its immediate children; switching roots replaces the catalog; selecting an unreadable/unavailable disposable root produces a recoverable message. Record date, application build, selected disposable test roots, observed outcome, and console status. Do not use a production workspace to manufacture an error.

- [ ] **Step 10: Confirm RED is now isolated to the launch seam**

Run: `pnpm test:e2e`

Expected: the renderer builds with the required controls, but the test remains red because the E2E root and isolated `userData` are intentionally not wired until Task 7. Fix any earlier build, type, or runtime error without weakening the test.

- [ ] **Step 11: Snapshot the renderer slice and failing acceptance test**

```powershell
jj describe -m "feat: add project library and dynamic tabs"
jj new
```

---

### Task 7: Implement the launch seam and prove the real Electron boundary

**Files:**
- Create: `apps/desktop/src/main/runtime-config.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `tests/e2e/pioneer.e2e.spec.ts`

- [ ] **Step 1: Implement the launch-only runtime seam**

`runtime-config.ts` must ignore E2E variables unless `PIONEER_E2E === '1'` and `app.isPackaged === false`. Normalize/validate both paths. In that mode only, call `app.setPath('userData', validatedUserDataPath)` before settings are created and seed catalog selection from the validated root. Production behavior remains picker/settings driven.

- [ ] **Step 2: Confirm stable accessible locators**

Prefer roles/names. Add `data-testid` only for non-semantic state such as the warning summary or active-tab identity. Do not expose internal Electron channels to the page.

- [ ] **Step 3: Run Real E2E GREEN**

Run: `pnpm test:e2e`

Expected: Playwright launches the Forge-bundled application entry, all eight assertions pass, Electron exits cleanly, and fixture hashes are unchanged.

- [ ] **Step 4: Snapshot the integration proof**

```powershell
jj describe -m "test: add real Electron end-to-end coverage"
jj new
```

---

### Task 8: Establish the full M2 quality gate and update truth documents

**Files:**
- Modify: `package.json`
- Modify: `eslint.config.mjs`
- Modify: `.prettierrc.json`
- Modify: `.prettierignore`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `PROJECT.md`
- Modify: `TEST_INFRA.md`
- Modify: `themasterplan/ROADMAP.md`
- Create: `docs/runbooks/m2-push-and-checkout-rename.md`

- [ ] **Step 1: Add real formatting, lint, type, and aggregate commands**

Use these root scripts:

```json
{
  "format:check": "prettier --check apps/desktop tests/contract tests/e2e tests/helpers package.json pnpm-workspace.yaml eslint.config.mjs vitest.config.ts",
  "lint": "eslint apps/desktop/src tests/contract tests/e2e *.config.*",
  "typecheck": "pnpm --filter @pioneer/desktop typecheck",
  "package:smoke": "pnpm --filter @pioneer/desktop build",
  "check": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:contract && pnpm test:prototype && pnpm test:e2e && pnpm package:smoke"
}
```

The duplicated package build is intentional as a final smoke after tests; if runtime proves too expensive, replace it with an artifact-existence/hash smoke only through a reviewed plan amendment, not silently.

- [ ] **Step 2: Make lint and format pass without weakening rules**

Configure ESLint flat config for strict TypeScript, React Hooks, browser renderer globals, and Node main/test globals. Ignore generated `.webpack`, `out`, Playwright output, archived assets, and vendored prototype HTML. Add the same generated/frozen boundaries to `.prettierignore`, including `demos/`, `design-specs/`, `archive/`, `tests/prototype/`, `.webpack/`, `out/`, and Playwright output. Do not disable unsafe-any/no-floating-promise rules globally to make the gate green.

- [ ] **Step 3: Promote the repository documentation to M2 truth**

- `AGENTS.md`: primary gate is `pnpm check`; list Contract, Prototype, and Real E2E separately.
- `README.md`: document `pnpm install`, `pnpm --filter @pioneer/desktop start`, and all test commands; state visual implementation is an engineering fallback pending Figma handoff.
- `PROJECT.md`: describe actual `apps/desktop` boundaries and M3 exclusions.
- `TEST_INFRA.md`: replace “reserved” wording for Contract and Real E2E with their executable commands and covered evidence.
- `themasterplan/ROADMAP.md`: M1.5 `COMPLETE`, M2 `IN PROGRESS` until the full gate and review pass.

Create `docs/runbooks/m2-push-and-checkout-rename.md` as a non-executing post-delivery runbook. It must require: explicit push authorization; fresh remote verification; closing processes that hold the checkout; renaming only the exact sibling path `D:\Projects\Pioneer` to `D:\Projects\Pioneer`; reopening from the new path; then `jj status`, `git remote -v`, and `pnpm check`. State that this implementation plan must not execute the runbook automatically.

- [ ] **Step 4: Run the full authoritative gate**

Run: `pnpm check`

Expected, in order: format/lint/typecheck pass; Contract Tests pass; Prototype Tests show 210/210; Playwright launches real Electron and passes; package smoke exits 0.

- [ ] **Step 5: Run repository hygiene checks**

```powershell
git diff --check
rg -n -i "Pionner|D:[/\\]+Project[/\\]+demo-thesis-2027|file:///" README.md AGENTS.md PROJECT.md TEST_INFRA.md TEST_READY.md themasterplan figma-bridge 开题PPT逐页文案.md
rg -n "FIGMA_TOKEN\s*=|figd_[A-Za-z0-9_-]+" --glob "!pnpm-lock.yaml" .
```

Expected: all exit cleanly; no stale current path, absolute file link, or embedded Figma token exists.

- [ ] **Step 6: Request an independent code review**

Use `superpowers:requesting-code-review` against the complete M2 diff. Require review of path containment, junction handling, settings write scope, sender validation, preload exposure, tab invariants, fixture immutability, and Figma-boundary compliance. Fix accepted findings and rerun the smallest affected test plus `pnpm check`.

- [ ] **Step 7: Mark M2 foundation complete only after evidence**

After the full gate and review pass, change `themasterplan/ROADMAP.md` from M2 `IN PROGRESS` to `M2 FOUNDATION COMPLETE`; leave all M3 work planned.

- [ ] **Step 8: Seal the local change without pushing**

```powershell
jj status
jj diff --stat
jj describe -m "feat: complete Pioneer M2 desktop foundation"
jj bookmark set codex/m15-m2-foundation -r "@"
jj new
```

Expected: a new empty working change and a local bookmark pointing to the reviewed implementation. Stop for human push authorization.
