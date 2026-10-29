import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { gate, prepare } from '../../tools/design-delivery.mjs';
import { inspectEvent } from '../../tools/design-events.mjs';

const featureId = 'session-branch-tabs';
const issue = 25;
const fileKey = 'PioneerFile';
const frameId = '1093:1259';
const componentSetId = '921:632';
const activeVariantId = '921:619';
const baseSha = 'b'.repeat(40);
const snapshotCommit = 'a'.repeat(40);
const snapshotPath = `design/delivery/events/${'c'.repeat(64)}.json`;
const sourcePath = 'apps/desktop/src/renderer/components/SessionTabStrip.tsx';
const source = 'export function SessionTabStrip() {}\n';
const sourceBlob = createHash('sha1')
  .update(`blob ${Buffer.byteLength(source)}\0`)
  .update(source)
  .digest('hex');

function frame({
  type = 'FRAME',
  instances = [activeVariantId],
  omitComponentId = false,
} = {}) {
  return {
    id: frameId,
    name: 'Session branch tabs',
    type,
    children: instances.map((componentId, index) => ({
      id: `1093:${String(1265 + index)}`,
      type: 'INSTANCE',
      name: 'Session tab',
      componentProperties: {},
      ...(omitComponentId ? {} : { componentId }),
    })),
  };
}

function fixture({
  designNode = frame(),
  featureNodes = [frameId],
  mappings = { [frameId]: componentSetId },
  requestNodes = [frameId],
  snapshotVersion = 'version-fixed-1',
  requestVersion = 'version-fixed-1',
} = {}) {
  const policy = {
    features: {
      [featureId]: {
        issue,
        fileKey,
        nodes: featureNodes,
        changeTypes: ['ui'],
        compositionMappings: mappings,
        compositionApprovals: { [frameId]: { '1093:1265': {} } },
        basis: [],
      },
    },
  };
  const mapping = {
    designNode: componentSetId,
    status: 'mapped',
    designProperties: {},
    variants: [
      { nodeId: activeVariantId, name: 'State=Active' },
      { nodeId: '921:627', name: 'State=Inactive' },
    ],
    code: { path: sourcePath, blob: sourceBlob },
  };
  const snapshot = JSON.stringify({
    schemaVersion: 1,
    kind: 'version',
    fileKey,
    historicalVersionId: snapshotVersion,
    nodes: [designNode],
  });
  policy.features[featureId].compositionSnapshotSha256 = {
    [frameId]: createHash('sha256').update(snapshot).digest('hex'),
  };
  const request = {
    schemaVersion: 1,
    featureId,
    issue,
    changeType: 'ui',
    baseSha,
    behaviorChanges: [],
    design: {
      commit: snapshotCommit,
      path: snapshotPath,
      sha256: createHash('sha256').update(snapshot).digest('hex'),
      kind: 'version',
      version: requestVersion,
      fileKey,
      nodes: requestNodes,
    },
  };
  const read = (root, commit, path) => {
    if (commit === baseSha && path === 'design/delivery/features.json')
      return JSON.stringify(policy);
    if (commit === baseSha && path === 'design/sync/component-mappings.json')
      return JSON.stringify({ complete: true, components: [mapping] });
    if (commit === baseSha && path === sourcePath) return source;
    if (commit === snapshotCommit && path === snapshotPath) return snapshot;
    throw new Error(`Unexpected fixture read: ${commit}:${path}`);
  };
  return { policy, request, read, mapping };
}

test('accepts a registered frame composed from a mapped session tab variant', () => {
  const f = fixture();
  const pkg = prepare('unused-root', f.request, f.policy, f.read);
  assert.equal(pkg.nodes.length, 1);
  assert.equal(pkg.nodes[0].id, frameId);
  assert.equal(pkg.nodes[0].children[0].componentId, activeVariantId);
  assert.equal(pkg.components.length, 1);
  assert.equal(pkg.components[0].designNode, componentSetId);
  assert.equal(pkg.components[0].acceptedAt, baseSha);
});

test('controlled fixed-version event projects a reviewable composition and passes only after exact snapshot approval', async () => {
  const f = fixture();
  const label = `Pioneer READY ${featureId}`;
  const event = {
    event_type: 'FILE_VERSION_UPDATE',
    webhook_id: '1',
    file_key: fileKey,
    version_id: 'fixed1',
    label,
    passcode: 'fixture-passcode-1234',
  };
  const config = {
    enabled: true,
    webhookId: '1',
    routes: [
      {
        featureId,
        label,
        nodes: [frameId],
        changeType: 'ui',
        behaviorChanges: [],
      },
    ],
  };
  const figma = async (_method, url) =>
    url.endsWith('/versions')
      ? {
          versions: [
            { id: 'fixed1', label, created_at: '2026-10-29T00:00:00Z' },
          ],
        }
      : { version: 'fixed1', nodes: { [frameId]: { document: frame() } } };
  const github = async (_method, url) =>
    url.includes('/pulls?') ? [] : { object: { sha: baseSha } };
  const material = await inspectEvent({
    event,
    config,
    policy: f.policy,
    passcode: event.passcode,
    figma,
    github,
  });
  assert.equal(material.state, 'awaiting-local-agent');
  const request = {
    ...f.request,
    design: {
      ...f.request.design,
      path: material.snapshotPath,
      sha256: material.snapshotSha256,
      version: material.version,
    },
  };
  const read = (root, commit, path) =>
    path === material.snapshotPath
      ? material.snapshotText
      : f.read(root, commit, path);
  const before = prepare('unused-root', request, f.policy, read);
  assert.match(before.designDifferences.join(' '), /snapshot requires review/);
  f.policy.features[featureId].compositionSnapshotSha256[frameId] =
    material.snapshotSha256;
  const after = prepare('unused-root', request, f.policy, read);
  assert.deepEqual(after.designDifferences, []);
  assert.equal(after.nodes[0].children[0].componentId, activeVariantId);
});

test('allows a valid registered composition through the open, unblocked Issue gate', async () => {
  const f = fixture();
  const pkg = prepare('unused-root', f.request, f.policy, f.read);
  const api = async (method, url) => {
    assert.equal(method, 'GET');
    if (url.endsWith(`/issues/${issue}`))
      return {
        state: 'open',
        body: '',
        assignees: [],
        issue_dependencies_summary: { blocked_by: 0 },
      };
    if (url.endsWith('/git/ref/heads/main'))
      return { object: { sha: baseSha } };
    throw new Error(`Unexpected gate request: ${method} ${url}`);
  };

  assert.deepEqual(await gate(pkg, api, 'OasisViridis'), []);
});

test('rejects an unregistered frame even when its component instances are mapped', () => {
  const f = fixture({ mappings: {} });
  assert.throws(() => prepare('unused-root', f.request, f.policy, f.read));
});

test('rejects a composition registry that is not accepted at the pinned base', () => {
  const f = fixture();
  const read = (root, commit, path) =>
    path === 'design/delivery/features.json'
      ? JSON.stringify({ features: {} })
      : f.read(root, commit, path);
  assert.throws(
    () => prepare('unused-root', f.request, f.policy, read),
    (e) => e.state === 'review-required',
  );
});

test('rejects a frame outside the feature node allowlist', () => {
  const f = fixture({ featureNodes: [componentSetId] });
  assert.throws(() => prepare('unused-root', f.request, f.policy, f.read));
});

test('rejects an instance without a component ID', () => {
  const f = fixture({ designNode: frame({ omitComponentId: true }) });
  assert.throws(() => prepare('unused-root', f.request, f.policy, f.read));
});

test('rejects an unknown component ID in a registered frame', () => {
  const f = fixture({ designNode: frame({ instances: ['999:1'] }) });
  assert.throws(() => prepare('unused-root', f.request, f.policy, f.read));
});

test('rejects changed or missing instance properties before the Issue gate', () => {
  for (const properties of [
    { Label: { type: 'TEXT', value: '自动运行' } },
    undefined,
  ]) {
    const node = frame();
    if (properties === undefined) delete node.children[0].componentProperties;
    else node.children[0].componentProperties = properties;
    const f = fixture({ designNode: node });
    assert.throws(
      () => prepare('unused-root', f.request, f.policy, f.read),
      (e) => e.state === 'review-required',
    );
  }
});

test('keeps the composition materials-only until its exact fixed snapshot is reviewed', async () => {
  const node = frame();
  node.children[0].children = [
    { id: '1093:1400', type: 'TEXT', characters: '自动运行' },
  ];
  const f = fixture({ designNode: node });
  f.policy.features[featureId].compositionSnapshotSha256[frameId] = 'd'.repeat(
    64,
  );
  const pkg = prepare('unused-root', f.request, f.policy, f.read);
  const api = async (_method, url) =>
    url.endsWith('/git/ref/heads/main')
      ? { object: { sha: baseSha } }
      : {
          state: 'open',
          body: '',
          assignees: [],
          issue_dependencies_summary: { blocked_by: 0 },
        };
  const reasons = await gate(pkg, api, 'reviewer');
  assert.match(reasons.join(' '), /fixed composition snapshot requires review/);
});

test('rejects additional or removed reviewed instances', () => {
  const extra = fixture({
    designNode: frame({ instances: [activeVariantId, activeVariantId] }),
  });
  assert.throws(() =>
    prepare('unused-root', extra.request, extra.policy, extra.read),
  );
  const missing = fixture();
  missing.policy.features[featureId].compositionApprovals[frameId][
    '1093:1277'
  ] = {};
  assert.throws(
    () => prepare('unused-root', missing.request, missing.policy, missing.read),
    (e) => e.state === 'review-required',
  );
});

test('rejects an unapproved nested instance even under a mapped instance', () => {
  const node = frame();
  node.children[0].children = [
    { id: '1093:1400', name: 'Nested', type: 'INSTANCE', componentId: '999:1' },
  ];
  const f = fixture({ designNode: node });
  assert.throws(() => prepare('unused-root', f.request, f.policy, f.read));
});

test('rejects an unreviewed variant from an otherwise mapped component set', () => {
  const f = fixture({ designNode: frame({ instances: ['921:650'] }) });
  assert.throws(() => prepare('unused-root', f.request, f.policy, f.read));
});

test('rejects a composition frame with no component instances', () => {
  const f = fixture({ designNode: frame({ instances: [] }) });
  assert.throws(() => prepare('unused-root', f.request, f.policy, f.read));
});

test('rejects a registered composition node whose fixed-version node is not a frame', () => {
  const f = fixture({ designNode: frame({ type: 'COMPONENT_SET' }) });
  assert.throws(() => prepare('unused-root', f.request, f.policy, f.read));
});

test('rejects a request that claims a component-set node is the composition frame', () => {
  const f = fixture({ requestNodes: [componentSetId] });
  assert.throws(() => prepare('unused-root', f.request, f.policy, f.read));
});

test('rejects a request whose fixed version does not match the pinned snapshot', () => {
  const f = fixture({ requestVersion: 'version-other' });
  assert.throws(() => prepare('unused-root', f.request, f.policy, f.read));
});

test('does not accept a current-canvas capture as a composition version', () => {
  const f = fixture();
  f.request.design.kind = 'snapshot-only';
  f.request.design.version = null;
  assert.throws(
    () => prepare('unused-root', f.request, f.policy, f.read),
    (e) => e.state === 'invalid-input',
  );
});

test('preserves the existing exact mapped-component request path', () => {
  const exactNode = {
    id: componentSetId,
    name: 'Session tab variants',
    type: 'COMPONENT_SET',
    properties: {},
    children: [
      { id: activeVariantId, type: 'COMPONENT', name: 'State=Active' },
    ],
  };
  const f = fixture({
    designNode: exactNode,
    featureNodes: [componentSetId],
    mappings: {},
    requestNodes: [componentSetId],
  });
  f.policy.features[featureId].nodes = [componentSetId];
  f.policy.features[featureId].compositionMappings = {};
  f.request.design.nodes = [componentSetId];
  const pkg = prepare('unused-root', f.request, f.policy, f.read);
  assert.equal(pkg.nodes[0].id, componentSetId);
  assert.equal(pkg.components[0].designNode, componentSetId);
});
