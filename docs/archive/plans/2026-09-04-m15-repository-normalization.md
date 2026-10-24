# Pioneer M1.5 Repository Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Pioneer` the only current repository identity, freeze the HTML prototypes as reference assets, and expose an honest, executable Prototype Test gate before product code is introduced.

**Architecture:** This phase changes repository organization and documentation, not product behavior. Existing simulator and static probes move intact under `tests/prototype`; a small repository-policy test prevents old checkout paths, misleading E2E claims, and absolute `file:///` links from returning to current documentation.

**Tech Stack:** Node.js 24, pnpm 11, JavaScript `node:test`, existing HTML/JavaScript prototype suite, Jujutsu 0.43 colocated with Git.

## Global Constraints

- Follow root `AGENTS.md` and `themasterplan/THEMASTERPLAN.md`; the root agent is the single delivery owner.
- Do not change `demos/*.html` behavior or visuals in this phase.
- Do not write to the active Figma file or add a Figma credential. Figma remains authoritative for future approved visual details.
- Preserve the 210-case suite and report it only as **Prototype Tests**, never as proof of Electron integration.
- Use repository-relative Markdown links. `demo-thesis-2027` may remain only inside explicitly labeled sample/fixture content.
- Add no passing no-op command for Contract Tests or Real E2E. M2 adds those commands with their real implementations.
- Do not push, merge, publish, release, or rename the live checkout during these tasks. The physical directory rename remains the final M2 operational step.

---

### Task 1: Add a repository-truth regression test

**Files:**
- Create: `tests/repository/normalization.test.mjs`
- Test: `tests/repository/normalization.test.mjs`

- [ ] **Step 1: Write the failing policy test**

Create a Node test that scans only current authority documents:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const currentDocs = [
  'README.md',
  'AGENTS.md',
  'PROJECT.md',
  'TEST_INFRA.md',
  'TEST_READY.md',
  'themasterplan/THEMASTERPLAN.md',
  'themasterplan/ROADMAP.md',
  'figma-bridge/README.md',
  '开题PPT逐页文案.md',
];

test('current documentation uses the canonical Pioneer identity', async () => {
  for (const relativePath of currentDocs) {
    const content = await readFile(path.join(repoRoot, relativePath), 'utf8');
    assert.doesNotMatch(content, /Pionner/i, `${relativePath} contains the legacy misspelling`);
    assert.doesNotMatch(content, /D:[\\/]+Project[\\/]+demo-thesis-2027/i, `${relativePath} contains the legacy checkout`);
    assert.doesNotMatch(content, /file:\/\/[\/]?[a-z]:\//i, `${relativePath} contains an absolute file link`);
  }
});

test('the legacy 210-case result is labeled as Prototype Tests', async () => {
  for (const relativePath of ['README.md', 'AGENTS.md', 'TEST_INFRA.md', 'TEST_READY.md']) {
    const content = await readFile(path.join(repoRoot, relativePath), 'utf8');
    if (/210(?:\/210|\s*(?:项|个|cases?))/i.test(content)) {
      assert.match(content, /Prototype Tests/i, `${relativePath} mislabels the 210-case suite`);
    }
  }
});
```

- [ ] **Step 2: Run the policy test and confirm RED**

Run: `node --test tests/repository/normalization.test.mjs`

Expected: FAIL with references to `Pionner`, `D:\Project\demo-thesis-2027`, absolute `file:///` links, and/or unlabeled 210-case claims.

- [ ] **Step 3: Commit the red test**

```powershell
jj describe -m "test: define M1.5 repository truth"
```

Do not create a new change yet; Tasks 2–6 make this same test green.

---

### Task 2: Normalize public identity, links, and milestone status

**Files:**
- Modify: `README.md`
- Modify: `themasterplan/THEMASTERPLAN.md`
- Modify: `themasterplan/ROADMAP.md`
- Modify: `PROJECT.md`
- Modify: `开题PPT逐页文案.md`
- Modify: `figma-bridge/README.md`
- Test: `tests/repository/normalization.test.mjs`

- [ ] **Step 1: Rewrite README as the current public entry point**

At the top, state the current truth without claiming the M2 app exists:

```md
# Pioneer

Pioneer is a desktop task-assistant project moving from an M1 HTML design prototype into an Electron + React + TypeScript product.

- Current runnable artifact: frozen M1 HTML design references under [`demos/`](demos/README.md).
- Current engineering milestone: M1.5 repository normalization; M2 desktop foundation follows.
- Canonical repository: `OasisSaber/Pioneer`.
- Canonical local checkout: `D:\Projects\Pioneer`.
```

Replace every `file:///d:/Project/demo-thesis-2027/...` target with a repository-relative link. Add a short “Verification levels” section that names Prototype Tests as the only executable level at M1.5 and points to `TEST_INFRA.md`.

- [ ] **Step 2: Restore each authority document to its assigned role**

Make these exact status distinctions:

- `themasterplan/THEMASTERPLAN.md`: durable vision and architecture only; canonical checkout is `D:\Projects\Pioneer`; demo files are historical reference implementations.
- `themasterplan/ROADMAP.md`: M1 `COMPLETE`, M1.5 `IN PROGRESS` while this plan is executing, M2 `PLANNED`; change M1.5 to `COMPLETE` only in Task 6 after its gate passes.
- `PROJECT.md`: formal target architecture is `apps/desktop`; move the single-file demo inventory under a clearly named “M1 historical prototype” section; `demo-thesis-2027` remains only as an explicitly labeled example project name if needed.
- `开题PPT逐页文案.md`: use relative Markdown links to the presentation and demo.
- `figma-bridge/README.md`: use repository-relative commands such as `python .\figma-bridge\bridge-server.py`; require `FIGMA_TOKEN` through the environment and do not display a token literal.

- [ ] **Step 3: Run the repository test**

Run: `node --test tests/repository/normalization.test.mjs`

Expected: failures from the files edited in this task disappear. `TEST_READY.md` path/history failures and 210-label failures may remain red until Task 6 converts that record.

- [ ] **Step 4: Inspect only the documentation diff**

Run: `jj diff -- README.md PROJECT.md themasterplan/THEMASTERPLAN.md themasterplan/ROADMAP.md 开题PPT逐页文案.md figma-bridge/README.md`

Expected: no product-code changes, no Figma writes, and no completion claim for Electron.

---

### Task 3: Freeze HTML demos as reference implementations

**Files:**
- Create: `demos/README.md`
- Modify: `README.md`
- Modify: `PROJECT.md`

- [ ] **Step 1: Add the demo policy**

Write `demos/README.md` with four sections: `Purpose`, `Allowed changes`, `Disallowed changes`, and `Formal product`. Include these enforceable statements:

```md
`demos/` contains M1 presentation assets, design-validation artifacts, and visual baselines. It is not the Pioneer product runtime.

Allowed changes are limited to repairing presentation behavior, preserving offline execution, applying an explicitly approved visual baseline, or fixing accessibility, security, and factual defects.

New product-domain behavior belongs in `apps/desktop`. The Electron application must not import these HTML files as runtime source.
```

Link the active Figma file as the user-managed visual authority and state that implementation requires an explicit visual handoff.

- [ ] **Step 2: Point the public and architecture docs at the policy**

In `README.md` and `PROJECT.md`, replace language that treats the integrated HTML workbench as the evolving app with links to `demos/README.md` and the planned `apps/desktop` implementation.

- [ ] **Step 3: Verify the frozen assets were not edited**

Run: `jj diff --stat`

Expected: `demos/README.md` is new and no `demos/*.html` file appears in the diff.

- [ ] **Step 4: Snapshot the documentation boundary**

```powershell
jj describe -m "docs: normalize Pioneer identity and freeze demos"
jj new
```

---

### Task 4: Move legacy automation into the Prototype Test layer

**Files:**
- Move: `tests/adversarial-probes.js` → `tests/prototype/adversarial-probes.js`
- Move: `tests/adversarial-stress-probe.js` → `tests/prototype/adversarial-stress-probe.js`
- Move: `tests/capture-screenshots.js` → `tests/prototype/capture-screenshots.js`
- Move: `tests/cdp-adversarial-audit.js` → `tests/prototype/cdp-adversarial-audit.js`
- Move: `tests/e2e-runner.html` → `tests/prototype/prototype-runner.html`
- Move: `tests/e2e-verification.js` → `tests/prototype/verify-prototype.js`
- Move: `tests/link-details-probe.js` → `tests/prototype/link-details-probe.js`
- Move: `tests/test-cases.js` → `tests/prototype/test-cases.js`
- Move: `tests/verify-presentation.js` → `tests/prototype/verify-presentation.js`

- [ ] **Step 1: Record the current baseline before moving files**

Run: `node tests/e2e-verification.js`

Expected: `210/210 Passed, 0 Failures`.

- [ ] **Step 2: Move all nine files without changing assertions**

Use `New-Item -ItemType Directory tests\prototype` and `Move-Item -LiteralPath ...` for each exact path above. Do not copy-and-delete with wildcards.

- [ ] **Step 3: Repair repository-root calculations**

Apply these path rules:

- In `adversarial-probes.js` and `adversarial-stress-probe.js`, set `ROOT_DIR = path.resolve(__dirname, '../..')` and `TESTS_DIR = __dirname`.
- In `adversarial-stress-probe.js`, change the runner filename from `e2e-runner.html` to `prototype-runner.html` and update its human-facing path/runner labels.
- In `link-details-probe.js`, resolve demos with `path.resolve(__dirname, '../..', 'demos')`.
- In `verify-presentation.js` and `cdp-adversarial-audit.js`, resolve `../../opencode-design/开题汇报-Agent-v1.html`.
- In `verify-prototype.js`, keep `test-cases.js` beside the runner and resolve `../../tools/figma-sync.js`.
- In `prototype-runner.html`, change demo links and iframe source from `../demos/...` to `../../demos/...`, but keep `<script src="test-cases.js"></script>`.
- In `capture-screenshots.js`, compute `repoRoot` from `../..`, default the target to `opencode-design/开题汇报-Agent-v1.html`, and require output through `PIONEER_SCREENSHOT_DIR` or a `--output` argument. Do not write into `.agents` by default.

- [ ] **Step 4: Rename human-facing suite labels**

Change runner headings, console banners, and comments from “Pioneer E2E Test Suite” to “Pioneer Prototype Test Suite”. Do not change test IDs, test count, assertions, or the explicitly historical text inside `TEST_READY.md` yet.

- [ ] **Step 5: Run the moved suite**

Run: `node tests/prototype/verify-prototype.js`

Expected: `210/210 Passed, 0 Failures`, labeled Prototype Tests.

- [ ] **Step 6: Run the supporting probes**

```powershell
node tests/prototype/adversarial-probes.js
node tests/prototype/adversarial-stress-probe.js
node tests/prototype/link-details-probe.js
node tests/prototype/verify-presentation.js
```

Expected: each exits 0. `capture-screenshots.js` and `cdp-adversarial-audit.js` remain opt-in browser utilities and are not part of the deterministic gate.

- [ ] **Step 7: Snapshot the structural move**

```powershell
jj describe -m "test: classify legacy suite as prototype tests"
jj new
```

---

### Task 5: Add the M1.5 pnpm workspace and executable gate

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `pnpm-lock.yaml`
- Modify: `.gitignore`
- Test: `tests/repository/normalization.test.mjs`

- [ ] **Step 1: Add the root workspace manifest**

Create `package.json`:

```json
{
  "name": "pioneer",
  "version": "0.1.0",
  "private": true,
  "license": "MIT",
  "packageManager": "pnpm@11.7.0",
  "engines": { "node": ">=24" },
  "scripts": {
    "verify:repository": "node --test tests/repository/normalization.test.mjs",
    "test:prototype": "node tests/prototype/verify-prototype.js && node tests/prototype/adversarial-probes.js && node tests/prototype/adversarial-stress-probe.js && node tests/prototype/link-details-probe.js && node tests/prototype/verify-presentation.js",
    "capture:prototype": "node tests/prototype/capture-screenshots.js",
    "check:m15": "pnpm verify:repository && pnpm test:prototype"
  }
}
```

Do not add `test:contract`, `test:e2e`, or `check` yet.

- [ ] **Step 2: Add the workspace declaration and ignores**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
```

Add `node_modules/`, `.pnpm-store/`, `out/`, and `.webpack/` to `.gitignore` without removing existing project-specific ignores.

- [ ] **Step 3: Generate the lockfile without adding dependencies**

Run: `pnpm install --lockfile-only`

Expected: `pnpm-lock.yaml` is created and no application package exists yet.

- [ ] **Step 4: Run the new M1.5 gate**

Run: `pnpm check:m15`

Expected: repository policy passes and all Prototype Tests/probes exit 0.

`tests/prototype/cdp-adversarial-audit.js` is intentionally outside `check:m15`: it requires a separately launched Chromium instance exposing DevTools on port `9223`. Run it only as an opt-in browser audit with that prerequisite recorded; absence of the CDP service is not a deterministic test failure.

- [ ] **Step 5: Snapshot the workspace gate**

```powershell
jj describe -m "build: add M1.5 pnpm verification gate"
jj new
```

---

### Task 6: Publish the three-level test truth and close M1.5

**Files:**
- Modify: `TEST_INFRA.md`
- Modify: `TEST_READY.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `themasterplan/ROADMAP.md`
- Modify: `PROJECT.md`
- Test: `tests/repository/normalization.test.mjs`

- [ ] **Step 1: Rewrite `TEST_INFRA.md` as the current taxonomy**

Define exactly:

1. Contract Tests: deterministic TypeScript units for shared schemas, paths, scanner, IPC, and tab reducer; command reserved as `pnpm test:contract` until M2 supplies it.
2. Prototype Tests: the moved 210-case simulator plus static/adversarial probes; executable now with `pnpm test:prototype`.
3. Real E2E: Playwright launches Electron and crosses main → preload → renderer against filesystem fixtures; command reserved as `pnpm test:e2e` until M2 supplies it.
4. Aggregate gate: M1.5 uses `pnpm check:m15`; M2 replaces the primary gate with `pnpm check` only after all real commands exist.

State that the native directory picker is outside the deterministic E2E fixture seam and that no renderer mock can support a Real E2E claim.

- [ ] **Step 2: Convert `TEST_READY.md` into a historical record**

Rename its title to `Pioneer M1 Prototype Test Readiness Record`, retain the original 210/210 evidence, update file paths to `tests/prototype/*`, and add this warning before the evidence:

```md
This record proves the frozen M1 prototype suite only. It does not prove an Electron main/preload/renderer flow, native directory selection, or the M2 product runtime.
```

- [ ] **Step 3: Align the operational entry points**

- In `AGENTS.md`, label the 18 functions and 210/210 result as frozen M1 Prototype coverage; set the current primary command to `pnpm check:m15`; mention that M2 will promote it to `pnpm check`.
- In `README.md`, change the current milestone line to “M1.5 complete; M2 desktop foundation in progress” without claiming any M2 feature complete. In `PROJECT.md`, use the same three test names and completion boundaries.
- In `themasterplan/ROADMAP.md`, mark M1.5 `COMPLETE` and M2 `IN PROGRESS` after the M1.5 gate below passes. This is the approved “M2 foundation start” truth point; no M2 feature is claimed complete.

- [ ] **Step 4: Run the repository policy and M1.5 gate**

```powershell
pnpm check:m15
git diff --check
```

Expected: all commands exit 0; Prototype output remains 210/210.

- [ ] **Step 5: Check for stale current-path and taxonomy claims**

Run:

```powershell
rg -n -i "Pionner|D:[/\\]+Project[/\\]+demo-thesis-2027|file:///" README.md AGENTS.md PROJECT.md TEST_INFRA.md TEST_READY.md themasterplan figma-bridge 开题PPT逐页文案.md
rg -n -i "210/210|210\s*(项|个|cases?)" README.md AGENTS.md PROJECT.md TEST_INFRA.md TEST_READY.md
```

Expected: the first command has no matches; every second-command match is locally qualified as Prototype Tests.

- [ ] **Step 6: Review and seal M1.5 locally**

```powershell
jj status
jj diff --stat
jj describe -m "docs: complete Pioneer M1.5 normalization"
jj bookmark set codex/m15-m2-foundation -r "@"
jj new
```

Expected: the new working change is empty; no push occurs. Continue with the M2 plan from this exact parent.
