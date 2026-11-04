import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildClientPayload,
  handleRequest,
} from '../../workers/figma-webhook/src/index.js';

const PASSCODE = 'p'.repeat(32);
const TOKEN = 'github-token-for-tests-123456';
const ENV = {
  FIGMA_PASSCODE: PASSCODE,
  GITHUB_DISPATCH_TOKEN: TOKEN,
  GITHUB_REPOSITORY: 'OasisViridis/Pioneer',
};
const NOW = new Date('2026-11-04T00:00:00.000Z');

function post(body) {
  return new Request('https://worker.example/figma-webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function validBody(overrides = {}) {
  return {
    passcode: PASSCODE,
    event_type: 'FILE_VERSION_UPDATE',
    webhook_id: '4741884',
    file_key: 'EQis9ep9ZQsEenrUVXwlFU',
    version_id: '2417598685933588034',
    label: 'Pioneer READY change-approval-preview',
    ...overrides,
  };
}

test('health does not require a secret or a payload', async () => {
  const response = await handleRequest(
    new Request('https://worker.example/health'),
    {},
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('wrong passcode is refused before GitHub is called', async () => {
  let calls = 0;
  const response = await handleRequest(
    post(validBody({ passcode: 'x'.repeat(32) })),
    ENV,
    async () => {
      calls += 1;
      return new Response(null, { status: 204 });
    },
    () => NOW,
  );
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
});

test('PING and ordinary edits are ignored with 202', async () => {
  let calls = 0;
  for (const eventType of ['PING', 'FILE_UPDATE']) {
    const response = await handleRequest(
      post(validBody({ event_type: eventType })),
      ENV,
      async () => {
        calls += 1;
        return new Response(null, { status: 204 });
      },
      () => NOW,
    );
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { ok: true, ignored: true });
  }
  assert.equal(calls, 0);
});

test('a named version dispatches only the bounded payload', async () => {
  const raw = JSON.stringify(validBody());
  const calls = [];
  const response = await handleRequest(
    post(raw),
    ENV,
    async (url, init) => {
      calls.push({ url, init });
      return new Response(null, { status: 204 });
    },
    () => NOW,
  );
  assert.equal(response.status, 202);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://api.github.com/repos/OasisViridis/Pioneer/dispatches',
  );
  assert.equal(calls[0].init.headers.authorization, `Bearer ${TOKEN}`);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.event_type, 'figma-design-release');
  assert.deepEqual(body.client_payload, {
    schemaVersion: 1,
    webhookId: '4741884',
    eventType: 'FILE_VERSION_UPDATE',
    fileKey: 'EQis9ep9ZQsEenrUVXwlFU',
    versionId: '2417598685933588034',
    label: 'Pioneer READY change-approval-preview',
    deliveryId: createHash('sha256').update(raw).digest('hex'),
    receivedAt: NOW.toISOString(),
  });
  assert.equal(JSON.stringify(body).includes(PASSCODE), false);
});

test('the same raw body produces the same deliveryId', async () => {
  const raw = JSON.stringify(validBody());
  const first = await buildClientPayload(JSON.parse(raw), raw, NOW);
  const second = await buildClientPayload(JSON.parse(raw), raw, NOW);
  assert.equal(first.payload.deliveryId, second.payload.deliveryId);
  assert.match(first.payload.deliveryId, /^[0-9a-f]{64}$/);
  const changed = await buildClientPayload(JSON.parse(raw), `${raw} `, NOW);
  assert.notEqual(changed.payload.deliveryId, first.payload.deliveryId);
});

test('missing required fields are refused', async () => {
  const response = await handleRequest(
    post(validBody({ label: '' })),
    ENV,
    async () => new Response(null, { status: 204 }),
    () => NOW,
  );
  assert.equal(response.status, 400);
});

test('GitHub rejection is reported without leaking the payload', async () => {
  const response = await handleRequest(
    post(validBody()),
    ENV,
    async () => new Response('nope', { status: 403 }),
    () => NOW,
  );
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false });
});

test('oversized bodies are refused', async () => {
  const response = await handleRequest(
    post('x'.repeat(256 * 1024 + 1)),
    ENV,
    async () => new Response(null, { status: 204 }),
    () => NOW,
  );
  assert.equal(response.status, 413);
});

test('a missing secret fails closed', async () => {
  const response = await handleRequest(post(validBody()), {
    ...ENV,
    FIGMA_PASSCODE: '',
  });
  assert.equal(response.status, 500);
});
