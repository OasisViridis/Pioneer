// One delivery slot per feature and fixed design version. The old
// codex/design-<featureId> branch remains readable for merged PRs, but new
// deliveries must not reuse a branch that already served another version.
export function deliveryBranch(featureId, version) {
  if (!/^[a-z][a-z0-9-]{2,60}$/.test(featureId))
    throw new Error('Invalid delivery feature id');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(version))
    throw new Error('Invalid delivery design version');
  return `codex/design-${featureId}-${version}`;
}
