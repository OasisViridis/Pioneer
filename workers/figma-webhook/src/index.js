/**
 * Figma -> GitHub repository_dispatch receiver for #37.
 *
 * This Worker is deliberately tiny and has no storage:
 * - it validates the Figma passcode before reading the payload;
 * - it ignores PING and ordinary canvas edits;
 * - it forwards only the six bounded fields the GitHub consumer already
 *   validates in `tools/design-event-consumer.mjs`;
 * - it never logs the passcode, GitHub token or raw payload.
 *
 * Secrets live in Worker secrets, never in this file or the repository:
 * FIGMA_PASSCODE, GITHUB_DISPATCH_TOKEN.
 */

const MAX_BODY_BYTES = 256 * 1024;
const MAX_FIELD = 256;
const DISPATCH_EVENT = 'figma-design-release';

const encoder = new TextEncoder();

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function digest(value) {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(value)),
  );
}

async function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  let diff = a.length ^ b.length;
  for (let index = 0; index < a.length; index += 1) {
    diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return diff === 0;
}

function boundedString(value) {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > MAX_FIELD) return null;
  return value;
}

/**
 * Pure builder used by the contract test: it hashes the exact raw body so a
 * Figma retry maps to the same deliveryId, and never returns the passcode.
 */
export async function buildClientPayload(body, raw, now = new Date()) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { state: 'invalid' };
  }
  if (body.event_type !== 'FILE_VERSION_UPDATE') {
    return { state: 'ignored' };
  }
  const webhookId =
    typeof body.webhook_id === 'string' || typeof body.webhook_id === 'number'
      ? String(body.webhook_id)
      : '';
  const fileKey = boundedString(body.file_key);
  const versionId = boundedString(body.version_id);
  const label = boundedString(body.label);
  if (
    !boundedString(webhookId) ||
    fileKey === null ||
    versionId === null ||
    label === null
  ) {
    return { state: 'invalid' };
  }
  return {
    state: 'dispatch',
    payload: {
      schemaVersion: 1,
      webhookId,
      eventType: 'FILE_VERSION_UPDATE',
      fileKey,
      versionId,
      label,
      deliveryId: Array.from(await digest(raw), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
      receivedAt: now.toISOString(),
    },
  };
}

export async function handleRequest(
  request,
  env,
  fetchImpl = fetch,
  now = () => new Date(),
) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') {
    return json(200, { ok: true });
  }
  if (request.method !== 'POST' || url.pathname !== '/figma-webhook') {
    return json(404, { ok: false });
  }
  if (
    typeof env.FIGMA_PASSCODE !== 'string' ||
    env.FIGMA_PASSCODE.length < 16
  ) {
    return json(500, { ok: false });
  }
  if (
    typeof env.GITHUB_DISPATCH_TOKEN !== 'string' ||
    env.GITHUB_DISPATCH_TOKEN.length < 20 ||
    typeof env.GITHUB_REPOSITORY !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY)
  ) {
    return json(500, { ok: false });
  }

  const raw = await request.text();
  if (encoder.encode(raw).byteLength > MAX_BODY_BYTES) {
    return json(413, { ok: false });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { ok: false });
  }
  if (!(await safeEqual(body?.passcode, env.FIGMA_PASSCODE))) {
    return json(401, { ok: false });
  }

  const built = await buildClientPayload(body, raw, now());
  if (built.state === 'ignored') return json(202, { ok: true, ignored: true });
  if (built.state === 'invalid') return json(400, { ok: false });

  const response = await fetchImpl(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/dispatches`,
    {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'pioneer-figma-webhook',
      },
      body: JSON.stringify({
        event_type: DISPATCH_EVENT,
        client_payload: built.payload,
      }),
    },
  );
  if (!response.ok) return json(502, { ok: false });
  return json(202, { ok: true });
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
