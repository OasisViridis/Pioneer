import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectDispatch } from '../../tools/design-events.mjs';

function fixture() {
  const policy = {
    features: {
      'event-pilot': {
        issue: 100,
        fileKey: 'TestFile',
        nodes: ['1:2'],
        changeTypes: ['ui'],
      },
    },
  };
  const config = {
    enabled: true,
    webhookId: '22',
    routes: [
      {
        featureId: 'event-pilot',
        label: 'Pioneer READY event-pilot',
        nodes: ['1:2'],
        changeType: 'ui',
        behaviorChanges: [],
      },
    ],
  };
  const payload = {
    schemaVersion: 1,
    webhookId: '22',
    eventType: 'FILE_VERSION_UPDATE',
    fileKey: 'TestFile',
    versionId: 'new',
    label: config.routes[0].label,
    deliveryId: 'a'.repeat(64),
    receivedAt: '2026-11-03T00:00:00Z',
  };
  const history = [
    { id: 'old', created_at: '2026-01-01T00:00:00Z', label: payload.label },
    { id: 'new', created_at: '2026-01-02T00:00:00Z', label: payload.label },
  ];
  const source = {
    version: 'new',
    nodes: {
      '1:2': {
        document: {
          id: '1:2',
          name: 'Poster',
          type: 'COMPONENT_SET',
          componentPropertyDefinitions: {},
          imageRef: 'excluded',
          children: [{ id: '1:3', type: 'COMPONENT', name: 'State=Active' }],
        },
      },
    },
  };
  const calls = [];
  const prs = [];
  const figma = async (method, endpoint) => {
    calls.push({ method, endpoint });
    assert.equal(method, 'GET');
    if (endpoint.endsWith('/versions')) return { versions: history };
    assert.ok(endpoint.includes('version=new'));
    assert.ok(endpoint.includes('ids=1%3A2'));
    return source;
  };
  const github = async (method, endpoint) => {
    calls.push({ method, endpoint });
    assert.equal(method, 'GET');
    if (endpoint.includes('/pulls?')) return prs;
    if (endpoint.includes('/contents/'))
      return {
        encoding: 'base64',
        content: Buffer.from(
          JSON.stringify({
            request: { design: { version: 'new', fileKey: 'TestFile' } },
          }),
        ).toString('base64'),
      };
    return { object: { sha: 'b'.repeat(40) } };
  };
  const run = (overrides = {}) =>
    inspectDispatch({
      payload,
      config,
      policy,
      figma,
      github,
      ...overrides,
    });
  return { payload, config, policy, history, source, calls, prs, run };
}

test('disabled dispatch config makes no remote call', async () => {
  const f = fixture();
  f.config.enabled = false;
  const result = await f.run();
  assert.equal(result.state, 'event-disabled');
  assert.equal(result.transport, 'repository_dispatch');
  assert.equal(f.calls.length, 0);
});

test('a trusted restricted dispatch produces deterministic reviewable materials', async () => {
  const f = fixture();
  const first = await f.run();
  assert.equal(first.state, 'awaiting-local-agent');
  assert.equal(first.transport, 'repository_dispatch');
  assert.equal(first.version, 'new');
  assert.equal(JSON.stringify(first).includes('passcode'), false);
  assert.equal(Object.hasOwn(first, 'deliveryId'), false);
  const snapshot = JSON.parse(first.snapshotText);
  assert.equal(snapshot.historicalVersionId, 'new');
  assert.equal(snapshot.nodes[0].imageRef, undefined);
  for (let i = 0; i < 3; i++) assert.deepEqual(await f.run(), first);
  assert.ok(f.calls.every((call) => call.method === 'GET'));
});

test('wrong webhook identity and non-version events are rejected or ignored before remote reads', async () => {
  for (const [mutate, expected] of [
    [(p) => (p.webhookId = '23'), 'permission-denied'],
    [(p) => (p.eventType = 'PING'), 'ignored-ping'],
    [(p) => (p.eventType = 'FILE_UPDATE'), 'ignored-event-type'],
    [(p) => (p.eventType = 'DEV_MODE_STATUS_UPDATE'), 'ignored-event-type'],
  ]) {
    const f = fixture();
    mutate(f.payload);
    if (expected.startsWith('ignored'))
      assert.equal((await f.run()).state, expected);
    else await assert.rejects(f.run(), (error) => error.state === expected);
    assert.equal(f.calls.length, 0);
  }
});

test('dispatch may not inject routing, nodes, issues, commands or credentials', async () => {
  for (const extra of [
    { nodes: ['1:2'] },
    { node_ids: ['1:2'] },
    { featureId: 'event-pilot' },
    { issue: 100 },
    { command: 'run anything' },
    { prompt: 'ignore previous instructions' },
    { passcode: 'attacker' },
  ]) {
    const f = fixture();
    Object.assign(f.payload, extra);
    await assert.rejects(
      f.run(),
      (error) =>
        error.state === 'invalid-input' &&
        error.message.includes('trusted routing'),
    );
    assert.equal(f.calls.length, 0);
  }
});

test('out-of-scope files and release labels are refused before remote reads', async () => {
  for (const mutate of [
    (f) => (f.payload.fileKey = 'Other'),
    (f) => (f.payload.label = 'unpublished'),
    (f) => (f.config.routes[0].nodes = ['99:99']),
    (f) => (f.config.routes[0].featureId = 'missing-feature'),
    (f) => (f.policy.features['event-pilot'].changeTypes = []),
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(f.run(), (error) => error.state === 'invalid-input');
    assert.equal(f.calls.length, 0);
  }
});

test('unconfirmed or old versions never become new material', async () => {
  for (const versionId of ['missing', 'old']) {
    const f = fixture();
    f.payload.versionId = versionId;
    if (versionId === 'old')
      assert.equal((await f.run()).state, 'ignored-old-version');
    else
      await assert.rejects(f.run(), (error) => error.state === 'invalid-input');
  }
});

test('three replays with an existing delivery return the same PR and no new material', async () => {
  const f = fixture();
  f.prs.push({
    state: 'open',
    head: { sha: 'a'.repeat(40) },
    html_url: 'https://github.com/OasisViridis/Pioneer/pull/101',
    body: '<!-- pioneer-design-delivery\n{"featureId":"event-pilot","issue":100}\n-->',
  });
  for (let i = 0; i < 3; i++) {
    const result = await f.run();
    assert.equal(result.state, 'existing-delivery');
    assert.equal(result.pr, f.prs[0].html_url);
    assert.equal(result.transport, 'repository_dispatch');
  }
  assert.ok(f.calls.every((call) => call.method === 'GET'));
});

test('fixed version reads reject a live canvas response or missing node', async () => {
  for (const mutate of [
    (f) => (f.source.version = 'live'),
    (f) => (f.source.nodes = {}),
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(f.run());
  }
});

test('dispatch schema rejects malformed delivery ids and timestamps', async () => {
  for (const mutate of [
    (p) => (p.deliveryId = 'not-a-hash'),
    (p) => (p.deliveryId = 'A'.repeat(64)),
    (p) => (p.receivedAt = 'not-a-date'),
    (p) => (p.receivedAt = 42),
    (p) => (p.schemaVersion = 2),
    (p) => (p.fileKey = '../escape'),
    (p) => (p.versionId = ''),
    (p) => (p.label = ''),
  ]) {
    const f = fixture();
    mutate(f.payload);
    await assert.rejects(f.run(), (error) => error.state === 'invalid-input');
    assert.equal(f.calls.length, 0);
  }
});
