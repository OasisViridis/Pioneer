# Pioneer Test Taxonomy (TEST_INFRA)

> Current verification taxonomy for the Pioneer repository. Milestone status is authoritative only in [`themasterplan/ROADMAP.md`](themasterplan/ROADMAP.md).

## Test levels

| Level | Scope and evidence boundary | Command |
|---|---|---|
| **Contract Tests** | Deterministic TypeScript units for shared schemas, normalized paths, scanner behavior, IPC/sender validation, settings write scope, runtime configuration, and tab invariants. | `pnpm test:contract` |
| **Prototype Tests** | The frozen M1 simulator: the moved 210-case suite plus static and adversarial probes. It verifies historical prototype behavior only, not an Electron product. | Executable now: `pnpm test:prototype`. |
| **Real E2E** | Playwright launches the real Electron process chain, crosses main → preload → renderer, exercises Library/Settings/project Tabs against a committed fixture, and verifies fixture immutability after close. | `pnpm test:e2e` |
| **Packaged Acceptance** | Packages `apps/desktop`, then launches the shipped `@pioneer-desktop.exe` through the doubly-gated acceptance seam (`PIONEER_ACCEPTANCE=1` in a packaged build only) and drives the real renderer over Chromium CDP. Proves startup, workspace scan, one completed read-only run with a real `read_file` result, one `accept` and one `terminal` journal record sharing a run id, and unchanged fixture hashes. | `pnpm acceptance:packaged` |

## Aggregate gate

The primary gate is `pnpm check`. It runs, in order: format check; strict lint; desktop typecheck; Contract Tests; frozen Prototype Tests; Real E2E (including its package build); and a final package smoke. The duplicate final build is intentional. M2 is **COMPLETE**; `pnpm check` continues as the primary quality gate for M3.

Packaged Acceptance is deliberately outside `pnpm check` because it repackages the desktop app and starts the shipped executable; run it per milestone and on any change to the launch seam, packaging configuration, or run-layer main code.

## Evidence boundaries

- The frozen M1 **Prototype Tests** result is **210/210 passed** and covers the historical 18-function simulator plus static/adversarial probes. It is not Electron proof.
- The native directory picker is outside the deterministic E2E fixture seam; M2 manual acceptance evidence was completed in [`docs/testing/m2-native-picker-smoke.md`](docs/testing/m2-native-picker-smoke.md), and subsequent fixture seams must not pretend to substitute for manual verification.
- No renderer mock can support a Real E2E claim: that claim requires the Electron main → preload → renderer flow against filesystem fixtures.
- Packaged Acceptance is a packaged-artifact proof, not a provider proof: it uses the deterministic controlled adapter, so it does not show a real model provider working inside the shipped build. See [`docs/testing/issue53-packaged-acceptance.md`](docs/testing/issue53-packaged-acceptance.md) and [`docs/testing/issue13-real-provider.md`](docs/testing/issue13-real-provider.md).
- Playwright's `_electron.launch` cannot attach to the shipped build because the `EnableNodeCliInspectArguments` fuse is off; the packaged acceptance spec therefore drives the renderer over CDP and reads run facts from main-process artifacts (startup report and run journal), never from renderer claims.
- See [`TEST_READY.md`](TEST_READY.md) for the historical M1 readiness record, not a current product-runtime certification.

## Current commands

```powershell
pnpm format:check     # Prettier check over current engineering sources
pnpm lint             # strict type-aware TypeScript and React lint
pnpm typecheck        # desktop TypeScript compiler check
pnpm test:contract    # deterministic M2 contract suites
pnpm test:prototype   # frozen M1 Prototype Tests and probes
pnpm test:e2e         # real Electron Playwright flow
pnpm acceptance:packaged  # packaged build + one read-only run (not in pnpm check)
pnpm package:smoke    # final package build smoke
pnpm check            # full authoritative gate in the order above
pnpm check:m15        # retained M1.5 repository/prototype regression gate
```
