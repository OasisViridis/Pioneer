# Pioneer M1 Prototype Test Readiness Record

> **Historical declaration time**: 2026-09-03T13:21:00Z
> **Historical publishing agent**: `teamwork_preview_test_writer_e2e_1` (E2E Testing Track)
> **Historical upstream review**: `76521ae9-7802-45c7-98d4-91c6d31ddf06` (Project Orchestrator)
> **Record scope**: frozen M1 prototype assets now located under `tests/prototype/`.

This record proves the frozen M1 prototype suite only. It does not prove an Electron main/preload/renderer flow, native directory selection, or the M2 product runtime.

---

## Historical M1 Prototype Tests evidence

The historical **Prototype Tests** record reports complete coverage of the 18 M1 prototype functions (F01–F18) through a four-tier simulator suite:

- Tier 1 feature coverage: 90 cases (baseline ≥90).
- Tier 2 boundary and corner coverage: 90 cases (baseline ≥90).
- Tier 3 cross-feature pairwise coverage: 20 cases (baseline ≥18).
- Tier 4 real-world workload scenarios: 10 cases (baseline ≥9).
- **Prototype Tests total: 210 structured cases (baseline ≥207).**
- **Prototype Tests execution result: 210/210 passed, 0 failed, 0 regressions (100%).**
- Historical CLI probe duration: 18 ms.

These are retained M1 simulator results. They do not change the M2 completion boundary or establish a Real E2E result.

## Historical assets, current paths

| Current path | Historical role |
|---|---|
| `tests/prototype/test-cases.js` | Frozen 210-case Prototype Tests asset library. |
| `tests/prototype/prototype-runner.html` | Frozen prototype test dashboard. |
| `tests/prototype/verify-prototype.js` | Prototype Tests CLI verification probe. |
| `tests/prototype/adversarial-probes.js` | Static/adversarial prototype probe. |
| `tests/prototype/adversarial-stress-probe.js` | Adversarial stress probe. |
| `tests/prototype/link-details-probe.js` | Prototype link/detail probe. |
| `tests/prototype/verify-presentation.js` | Historical presentation verification. **Removed 2026-09-11 together with its target `opencode-design/开题汇报-Agent-v1.html`.** |

## Historical verification output

The following retained output is evidence for the frozen M1 **Prototype Tests** suite, not a current Electron E2E run:

```text
================================================================================
  PIONEER PROTOTYPE TEST VERIFICATION SUITE (HISTORICAL CLI PROBE)
================================================================================

[Prototype Tests] Registered Total Tests: 210

--- STEP 1: COVERAGE & THRESHOLD AUDIT ---
[Prototype Tests] Total Test Cases: 210 (Threshold >= 207 OK)
[PASS] Tier 1 (Feature Coverage): 90 (Threshold >= 90 OK)
[PASS] Tier 2 (Boundary & Corner): 90 (Threshold >= 90 OK)
[PASS] Tier 3 (Cross-Feature Pairwise): 20 (Threshold >= 18 OK)
[PASS] Tier 4 (Real-World Workloads): 10 (Threshold >= 9 OK)
[PASS] All 18 prototype functions had >=5 Tier 1 and >=5 Tier 2 tests.

--- STEP 2: PROTOTYPE TEST EXECUTION ---
[Prototype Tests] Progress: 35/210 (17%)
[Prototype Tests] Progress: 70/210 (33%)
[Prototype Tests] Progress: 105/210 (50%)
[Prototype Tests] Progress: 140/210 (67%)
[Prototype Tests] Progress: 175/210 (83%)
[Prototype Tests] Progress: 210/210 (100%)

--- STEP 3: HISTORICAL RESULTS ---
[Prototype Tests] Total Executed: 210
[Prototype Tests] Passed: 210
[Prototype Tests] Failed: 0
[Prototype Tests] Execution Time: 18ms
[Prototype Tests] ALL 210 TEST CASES PASSED (PASS RATE: 100%)
================================================================================
```

## Current execution boundary

Run the frozen M1 suite through the current command:

```powershell
pnpm test:prototype
```

The taxonomy in [`TEST_INFRA.md`](TEST_INFRA.md) defines the separate Contract Tests and Real E2E boundaries. Their commands are fully implemented (`pnpm test:contract` and `pnpm test:e2e`) and verified as part of the primary `pnpm check` gate.
