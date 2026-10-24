# M2 push and checkout runbook

## Status and authority

**Status: checkout rename retired.** The clean-room rebuild already established the canonical local checkout as `D:\Project\GitProject\Pioneer`, so there is no remaining source → destination rename operation for M2.

This document now records only the post-review remote push and local verification boundary. It is non-executing guidance: a reviewed implementation is not, by itself, authorization to merge or publish `main`.

## Remote push preconditions

1. Obtain explicit human authorization for the remote push or merge.
2. Fetch and verify the fresh remote state immediately before delivery. Confirm the intended remote, target branch/bookmark, and absence of an unexpected remote advance.
3. Push only the reviewed and locally sealed change. Stop if remote verification differs from the reviewed baseline.
4. Confirm that the expected remote revision is visible before marking the delivery complete.

## Canonical checkout

The canonical checkout is already:

```text
D:\Project\GitProject\Pioneer
```

Do **not** perform a rename when source and destination resolve to this same path. Historical instructions that attempted `D:\Project\GitProject\Pioneer` → `D:\Project\GitProject\Pioneer` were invalid and are intentionally retired.

If the checkout is ever relocated in the future, create a new, separately reviewed operational runbook containing two distinct, explicitly verified sibling paths. Do not infer a rename from this document.

## Post-delivery verification

From the canonical checkout, run:

```powershell
git status --short
git remote -v
pnpm check
```

Require all three to finish successfully. This checkout is Git-only; do not initialize jj merely to follow a historical command. A successful remote update alone is not proof that the checkout, dependencies, Electron launch, or full quality gate still works.

## Stop conditions

Stop without improvising if authorization is missing, the remote moved, the canonical checkout differs from `D:\Project\GitProject\Pioneer`, or any post-delivery command fails. Do not perform destructive cleanup, force-push, remote history rewriting, or an alternate-path rename as a workaround.
