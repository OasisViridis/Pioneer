import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { gitRead, hash } from '../../tools/design-delivery.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectEvent, eventRequest } from '../../tools/design-events.mjs';
import { figmaApi, remoteFailure } from '../../tools/design-remote.mjs';

function fixture() {
  const passcode = 'local-test-passcode-not-a-credential';
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
  const event = {
    event_type: 'FILE_VERSION_UPDATE',
    webhook_id: '22',
    file_key: 'TestFile',
    version_id: 'new',
    label: config.routes[0].label,
    passcode,
    timestamp: '2099-01-01T00:00:00Z',
  };
  const history = [
    { id: 'old', created_at: '2026-01-01T00:00:00Z', label: event.label },
    { id: 'new', created_at: '2026-01-02T00:00:00Z', label: event.label },
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
    inspectEvent({
      event,
      config,
      policy,
      passcode,
      figma,
      github,
      ...overrides,
    });
  return {
    event,
    config,
    policy,
    passcode,
    history,
    source,
    calls,
    prs,
    figma,
    run,
  };
}

test('disabled intake never reads credentials or makes network calls', async () => {
  const f = fixture();
  f.config.enabled = false;
  assert.equal((await f.run()).state, 'event-disabled');
  assert.equal(f.calls.length, 0);
});
test('bad passcode or wrong webhook identity fails before any remote access', async () => {
  for (const mutate of [
    (f) => {
      f.event.passcode = 'wrong';
    },
    (f) => {
      f.event.webhook_id = '23';
    },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(f.run(), (e) => e.state === 'permission-denied');
    assert.equal(f.calls.length, 0);
  }
});
test('ordinary edits, PING and writeback side effects do not start implementation', async () => {
  for (const type of ['FILE_UPDATE', 'DEV_MODE_STATUS_UPDATE', 'PING']) {
    const f = fixture();
    f.event.event_type = type;
    assert.match((await f.run()).state, /^ignored-/);
    assert.equal(f.calls.length, 0);
  }
});
test('out-of-scope files, nodes, event instructions and unreviewed release labels are rejected', async () => {
  for (const mutate of [
    (f) => {
      f.event.file_key = 'Other';
    },
    (f) => {
      f.event.label = 'unpublished';
    },
    (f) => {
      f.event.nodes = ['99:99'];
    },
    (f) => {
      f.event.command = 'run anything';
    },
    (f) => {
      f.config.routes[0].nodes = ['99:99'];
    },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(f.run(), (e) => e.state === 'invalid-input');
    assert.equal(f.calls.length, 0);
  }
});
test('server version history rejects old delivery even with a forged future event timestamp', async () => {
  const f = fixture();
  f.event.version_id = 'old';
  assert.equal((await f.run()).state, 'ignored-old-version');
  assert.equal(f.calls.length, 1);
});
test('three replays produce identical fixed materials, strip raw secrets and never mutate GitHub', async () => {
  const f = fixture();
  const first = await f.run();
  assert.equal(first.state, 'awaiting-local-agent');
  assert.equal(first.automation, 'not-deployed');
  for (let i = 0; i < 3; i++) assert.deepEqual(await f.run(), first);
  assert.equal(JSON.stringify(first).includes(f.passcode), false);
  assert.equal(first.snapshotText.includes('imageRef'), false);
  assert.equal(first.snapshotText.includes('historicalVersionId'), true);
  assert.ok(f.calls.every((c) => c.method === 'GET'));
});
test('three replays with an existing S2 delivery return that same PR', async () => {
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
  }
  assert.ok(f.calls.every((c) => c.method === 'GET'));
});
test('missing nodes and a live-version response cannot become a fixed snapshot', async () => {
  for (const mutate of [
    (f) => {
      f.source.version = 'live';
    },
    (f) => {
      f.source.nodes = {};
    },
  ]) {
    const f = fixture();
    mutate(f);
    await assert.rejects(f.run());
  }
});
test('history pagination follows only the same Figma endpoint and refuses truncated history', async () => {
  const f = fixture();
  let count = 0;
  const result = await f.run({
    figma: async (method, endpoint) => {
      if (endpoint.endsWith('/versions')) {
        count++;
        return {
          versions: [f.history[0]],
          pagination: {
            next_page:
              'https://api.figma.com/v1/files/TestFile/versions?before=old',
          },
        };
      }
      if (endpoint.includes('before=old')) {
        count++;
        return { versions: [f.history[1]] };
      }
      return f.source;
    },
  });
  assert.equal(result.state, 'awaiting-local-agent');
  assert.equal(count, 2);
  await assert.rejects(
    f.run({
      figma: async () => ({
        versions: [],
        pagination: { next_page: 'https://evil.example/steal' },
      }),
    }),
    /Untrusted pagination/,
  );
  await assert.rejects(
    f.run({
      figma: async () => ({
        versions: [],
        pagination: { next_page: '/v1/files/TestFile/versions' },
      }),
    }),
    /pagination is incomplete/,
  );
});
test('expired tokens and rate limits propagate without creating local success materials', async () => {
  for (const status of [403, 429]) {
    const f = fixture();
    await assert.rejects(
      f.run({
        figma: async () => {
          throw Object.assign(new Error('private'), { status });
        },
      }),
      (e) => remoteFailure(e).status === status,
    );
  }
});
test('event-request rejects forged material before reading Git', () => {
  assert.throws(() => eventRequest('.', { featureId: '../escape' }, 'bad', {}));
});
test('Figma transport uses fixed origin and environment token, redacts errors and never retries POST', async () => {
  const calls = [];
  const api = figmaApi('secret', async (url, options) => {
    calls.push({ url, options });
    return {
      ok: false,
      status: 429,
      headers: new Headers({ 'retry-after': '45' }),
      json: async () => ({ secret: 'must not appear' }),
    };
  });
  await assert.rejects(
    api('POST', '/v1/dev_resources', { dev_resources: [] }),
    (e) => {
      assert.deepEqual(remoteFailure(e), {
        state: 'rate-limited',
        status: 429,
        retryAfter: '45',
      });
      assert.equal(e.message.includes('secret'), false);
      return true;
    },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, 'https://api.figma.com');
  assert.equal(calls[0].options.redirect, 'error');
  await assert.rejects(api('GET', '//evil.example/steal'));
  await assert.rejects(api('POST', '/v1/files/TestFile/versions'));
  assert.equal(calls.length, 1);
});

test('Figma transport only sends requests to the delivery endpoints', async () => {
  const calls = [];
  const api = figmaApi('secret', async (url, options) => {
    calls.push({ url: url.pathname, method: options.method });
    return { ok: true, json: async () => ({}) };
  });
  for (const endpoint of [
    '/v1/files/TestFile/versions?before=old',
    '/v1/files/TestFile/nodes?ids=1%3A2&version=fixed',
    '/v1/files/TestFile/dev_resources?node_ids=1%3A2',
  ])
    await api('GET', endpoint);
  await api('POST', '/v1/dev_resources', { dev_resources: [] });
  for (const endpoint of [
    '/v1/users/me',
    '/v1/files/TestFile',
    '/v1/files/TestFile/comments',
    '/v1/files/TestFile/dev_resources/other',
  ])
    await assert.rejects(api('GET', endpoint), /Unsupported Figma operation/);
  assert.equal(calls.length, 4);
});

test('a reviewed snapshot committed in Git becomes a valid S2 request; edited hash is rejected', async () => {
  const original = JSON.parse(
    await readFile('design/delivery/issue36.request.json', 'utf8'),
  );
  const policy = JSON.parse(
    await readFile('design/delivery/features.json', 'utf8'),
  );
  const feature = policy.features[original.featureId];
  const mapping = JSON.parse(
    gitRead(
      process.cwd(),
      original.baseSha,
      'design/sync/component-mappings.json',
    ),
  );
  const snapshot = JSON.parse(
    gitRead(process.cwd(), original.design.commit, original.design.path),
  );
  snapshot.kind = 'version';
  snapshot.historicalVersionId = 'fixed-test-version';
  const text = JSON.stringify(snapshot) + '\n';
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pioneer-event-'));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  try {
    for (const file of new Set([
      ...feature.basis,
      ...mapping.components.map((c) => c.code.path),
    ])) {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
      await writeFile(
        path.join(dir, file),
        gitRead(process.cwd(), original.baseSha, file),
      );
    }
    await writeFile(path.join(dir, 'snapshot.json'), text);
    git('init');
    git('add', '.');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgSign=false',
      'commit',
      '-m',
      'Fixed test snapshot',
    );
    const commit = git('rev-parse', 'HEAD');
    const material = {
      ...original,
      baseSha: commit,
      fileKey: original.design.fileKey,
      nodes: original.design.nodes,
      version: 'fixed-test-version',
      snapshotPath: 'snapshot.json',
      snapshotSha256: hash(text),
    };
    const request = eventRequest(dir, material, commit, policy);
    assert.equal(request.design.kind, 'version');
    assert.equal(request.design.commit, commit);
    assert.equal(request.design.version, 'fixed-test-version');
    material.snapshotSha256 = '0'.repeat(64);
    assert.throws(
      () => eventRequest(dir, material, commit, policy),
      /Snapshot hash mismatch/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
