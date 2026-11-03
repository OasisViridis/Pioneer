import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import {
  canonical,
  hash,
  qualityJobsPassed,
} from '../../tools/design-delivery.mjs';
import { writeback } from '../../tools/design-writeback-apply.mjs';
import { figmaApi, remoteFailure } from '../../tools/design-remote.mjs';

// An auditable failure drill over a real localhost HTTP socket. It drives the
// production figmaApi -> writeback -> readback path with a stateful fake
// service. It is not a real Figma acceptance and never claims to be one.

const policy = JSON.parse(
  await readFile('design/delivery/features.json', 'utf8'),
);
const delivery = JSON.parse(
  await readFile('design/deliveries/s2-design-delivery/package.json', 'utf8'),
);
const commit = 'c'.repeat(40);
const approval = {
  approved: true,
  pr: 48,
  featureId: 's2-design-delivery',
  commit,
  acceptanceUrl: `https://github.com/OasisViridis/Pioneer/blob/${commit}/docs/testing/acceptance.md`,
};

function githubFixture() {
  const pr = {
    merged: true,
    merge_commit_sha: commit,
    head: {
      sha: 'a'.repeat(40),
      ref: 'codex/design-s2-design-delivery',
      repo: { full_name: 'OasisViridis/Pioneer' },
    },
    body:
      '<!-- pioneer-design-delivery\n' +
      JSON.stringify({
        featureId: 's2-design-delivery',
        issue: 36,
        packageHash: delivery.packageHash,
        outputHash: delivery.outputHash,
      }) +
      '\n-->',
    base: { ref: 'main', repo: { full_name: 'OasisViridis/Pioneer' } },
  };
  const run = {
    id: 7,
    head_sha: commit,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
  };
  const jobs = [
    {
      name: 'Windows / pnpm check',
      conclusion: 'success',
      steps: [
        'Verify repository normalization',
        'Contract tests',
        'Electron E2E',
        'Package smoke',
        'Confirm aggregate quality and S1 acceptance',
      ].map((name) => ({ name, conclusion: 'success' })),
    },
    {
      name: 'Windows / reviewed visual baseline',
      conclusion: 'success',
      steps: [
        { name: 'Compare reviewed Windows baseline', conclusion: 'success' },
      ],
    },
  ];
  assert.equal(qualityJobsPassed(jobs), true);
  return async (method, endpoint) => {
    assert.equal(method, 'GET');
    if (endpoint.endsWith('/pulls/48')) return structuredClone(pr);
    if (endpoint.includes('/contents/docs/testing/acceptance.md'))
      return { type: 'file', encoding: 'base64', content: 'ZXZpZGVuY2U=' };
    if (endpoint.includes('/contents/')) {
      assert.ok(endpoint.endsWith(`?ref=${commit}`));
      return {
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(delivery)).toString('base64'),
      };
    }
    if (endpoint.includes('/workflows/quality.yml/runs'))
      return { workflow_runs: [run] };
    if (endpoint.includes('/actions/runs/')) return { jobs };
    throw new Error(`Unexpected GitHub endpoint: ${endpoint}`);
  };
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

// A stateful Dev Resources endpoint. `mode` controls only how POST responds;
// committed links are recorded before a transport failure so the drill can
// prove the client reconciles by reading back instead of blindly retrying.
function fakeFigma() {
  const state = {
    links: [],
    posts: [],
    mode: 'ok',
    failRead: 0,
    reads: 0,
    endpoints: [],
  };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    state.endpoints.push(`${request.method} ${url.pathname}`);
    const json = (status, body, headers = {}) =>
      response
        .writeHead(status, { 'content-type': 'application/json', ...headers })
        .end(jsonBody(body));
    if (request.headers['x-figma-token'] !== 'drill-token')
      return json(401, { error: 'missing token' });
    if (
      request.method === 'GET' &&
      /^\/v1\/files\/[A-Za-z0-9]+\/dev_resources$/.test(url.pathname)
    ) {
      state.reads++;
      if (state.mode === 'denied-read')
        return json(403, { error: 'no read access' });
      if (state.failRead > 0 && state.reads > 1) {
        state.failRead--;
        return json(500, { error: 'readback unavailable' });
      }
      return json(200, { dev_resources: structuredClone(state.links) });
    }
    if (request.method === 'POST' && url.pathname === '/v1/dev_resources') {
      const body = JSON.parse(await readBody(request));
      state.posts.push(structuredClone(body.dev_resources));
      if (state.mode === 'rate')
        return json(429, { error: 'slow down' }, { 'retry-after': '45' });
      if (state.mode === 'denied') return json(403, { error: 'no access' });
      if (state.mode === 'partial') {
        const added = body.dev_resources.slice(0, 2);
        state.links.push(...added);
        return json(200, { links_created: added, errors: [{}] });
      }
      state.links.push(...body.dev_resources);
      if (state.mode === 'abort-after-commit') {
        request.socket.destroy();
        return undefined;
      }
      return json(200, {
        links_created: body.dev_resources,
        errors: [],
      });
    }
    return json(404, { error: 'unsupported operation' });
  });
  return { server, state };
}

function jsonBody(value) {
  return Buffer.from(JSON.stringify(value));
}

async function withDrill(run) {
  const { server, state } = fakeFigma();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  // Keep the production transport and only redirect the already-validated
  // https URL to the local socket; no token or URL policy is relaxed.
  const fetcher = (url, options) =>
    fetch(new URL(url.pathname + url.search, base), options);
  const figma = figmaApi('drill-token', fetcher);
  try {
    return await run({ state, figma });
  } finally {
    // Every drill scenario may touch only the Dev Resources endpoint; a
    // writeback must never create a named version, so it cannot loop a
    // FILE_VERSION_UPDATE back into the intake.
    assert.ok(
      state.endpoints.every(
        (endpoint) =>
          endpoint === 'POST /v1/dev_resources' ||
          /^GET \/v1\/files\/[A-Za-z0-9]+\/dev_resources$/.test(endpoint),
      ),
      `Unexpected endpoint: ${state.endpoints.join(', ')}`,
    );
    server.closeAllConnections();
    server.close();
    // A keep-alive client socket must not keep the test-runner child alive.
    server.unref();
  }
}

const run = (figma) =>
  writeback({
    github: githubFixture(),
    figma,
    number: 48,
    featureId: 's2-design-delivery',
    policy,
    approval,
    apply: true,
  });

test('drill: a real HTTP 200 partial write is not success; retry only fills missing links', async () => {
  await withDrill(async ({ state, figma }) => {
    state.mode = 'partial';
    const first = await run(figma);
    assert.equal(first.state, 'partial-write');
    assert.equal(first.retryable, true);
    assert.equal(first.missing.length, 16);
    assert.equal(state.links.length, 2);
    assert.equal(state.posts.length, 1);
    state.mode = 'ok';
    const second = await run(figma);
    assert.equal(second.state, 'links-verified');
    assert.equal(second.attempted, 16);
    assert.equal(second.confirmed, 18);
    assert.equal(state.posts.length, 2);
    assert.equal(state.posts[1].length, 16);
    assert.equal(
      new Set(state.links.map((item) => `${item.node_id}/${item.url}`)).size,
      18,
    );
    assert.ok(
      state.endpoints.every(
        (endpoint) =>
          endpoint.endsWith(' /v1/dev_resources') ||
          /^GET \/v1\/files\/[A-Za-z0-9]+\/dev_resources$/.test(endpoint),
      ),
    );
  });
});

test('drill: a transport abort after commit is reconciled by readback without a second POST', async () => {
  await withDrill(async ({ state, figma }) => {
    state.mode = 'abort-after-commit';
    const first = await run(figma);
    assert.equal(first.state, 'links-verified');
    assert.equal(state.links.length, 18);
    assert.equal(state.posts.length, 1);
    const replay = await run(figma);
    assert.equal(replay.state, 'links-verified');
    assert.equal(replay.created, 0);
    assert.equal(state.posts.length, 1);
  });
});

test('drill: readback failure reports an unknown outcome, then a rerun reads instead of reposting', async () => {
  await withDrill(async ({ state, figma }) => {
    state.failRead = 1;
    const first = await run(figma);
    assert.equal(first.state, 'retryable-error');
    assert.equal(first.phase, 'readback');
    assert.equal(first.writeOutcome, 'unknown');
    assert.equal(first.retryable, true);
    assert.equal(state.posts.length, 1);
    assert.equal(state.links.length, 18);
    const second = await run(figma);
    assert.equal(second.state, 'links-verified');
    assert.equal(second.created, 0);
    assert.equal(state.posts.length, 1);
  });
});

test('drill: rate limits and permission failures stay visible and do not create links', async () => {
  for (const [mode, expected] of [
    ['rate', 'rate-limited'],
    ['denied', 'permission-denied'],
  ]) {
    await withDrill(async ({ state, figma }) => {
      state.mode = mode;
      const result = await run(figma);
      assert.equal(result.state, expected);
      assert.equal(result.retryable, expected === 'rate-limited');
      assert.equal(state.links.length, 0);
      assert.equal(state.posts.length, 1);
      if (mode === 'rate') {
        assert.equal(result.failure.retryAfter, '45');
        assert.equal(
          remoteFailure(
            Object.assign(new Error(), { status: 429, retryAfter: '45' }),
          ).retryAfter,
          '45',
        );
      }
      assert.equal(JSON.stringify(result).includes('no access'), false);
    });
  }
});

test('drill: a permission failure on the preflight read is permanent and sends no POST', async () => {
  await withDrill(async ({ state, figma }) => {
    state.mode = 'denied-read';
    const result = await run(figma);
    assert.equal(result.state, 'permission-denied');
    assert.equal(result.retryable, false);
    assert.equal(result.phase, 'preflight');
    assert.equal(state.posts.length, 0);
    assert.equal(state.links.length, 0);
    assert.equal(JSON.stringify(result).includes('no read access'), false);
  });
});

test('drill: per-node capacity blocks before any POST and preserves human links', async () => {
  await withDrill(async ({ state, figma }) => {
    for (let index = 0; index < 5; index++)
      state.links.push({
        file_key: 'EQis9ep9ZQsEenrUVXwlFU',
        node_id: '921:706',
        url: `https://github.com/OasisViridis/Pioneer/issues/${index + 1}`,
        name: 'Human reference',
      });
    const result = await run(figma);
    assert.equal(result.state, 'capacity-blocked');
    assert.equal(state.posts.length, 0);
    assert.equal(state.links.length, 5);
    assert.equal(state.links[0].name, 'Human reference');
  });
});

test('drill: three post-success replays create no new POST, link or state change', async () => {
  await withDrill(async ({ state, figma }) => {
    state.links.push({
      file_key: 'EQis9ep9ZQsEenrUVXwlFU',
      node_id: '921:706',
      url: 'https://github.com/OasisViridis/Pioneer/issues/33',
      name: 'Human reference',
    });
    const first = await run(figma);
    assert.equal(first.state, 'links-verified');
    const snapshot = hash(canonical(state.links));
    for (let index = 0; index < 3; index++) {
      const replay = await run(figma);
      assert.equal(replay.state, 'links-verified');
      assert.equal(replay.created, 0);
    }
    assert.equal(state.posts.length, 1);
    assert.equal(state.links.length, 19);
    assert.equal(state.links[0].name, 'Human reference');
    assert.equal(hash(canonical(state.links)), snapshot);
  });
});
