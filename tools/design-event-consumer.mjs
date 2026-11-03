import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectDispatch, persistEventMaterial } from './design-events.mjs';
import {
  figmaApi,
  githubApi,
  remoteFailure,
  retryableState,
} from './design-remote.mjs';

// Phase A consumer: a receiver has already authenticated the Figma delivery.
// This process validates the restricted dispatch against repository config,
// re-verifies the fixed version, and prepares reviewable materials. It never
// creates a PR, calls a model, or accepts routing from the dispatch payload.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'tmp/design-external');
const parseJson = (text) => JSON.parse(text.replace(/^\uFEFF/, ''));
const readJson = async (file) =>
  parseJson(await readFile(path.resolve(root, file), 'utf8'));
const save = async (name, value) => {
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, name), JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
  });
};

try {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath)
    throw Object.assign(new Error('GITHUB_EVENT_PATH is required'), {
      state: 'invalid-input',
    });
  const event = parseJson(await readFile(eventPath, 'utf8'));
  if (!event || typeof event !== 'object' || Array.isArray(event))
    throw Object.assign(new Error('Invalid GitHub event'), {
      state: 'invalid-input',
    });
  const payload = event.client_payload;
  const configured = process.env.DESIGN_EVENT_CONFIG;
  let config;
  try {
    config = await readJson(configured ?? 'design/delivery/events.json');
  } catch (error) {
    if (error.code !== 'ENOENT' || configured) throw error;
    config = await readJson('design/delivery/events.example.json');
  }
  const policy = await readJson('design/delivery/features.json');
  let result = await inspectDispatch({
    payload,
    config,
    policy,
    figma: figmaApi(process.env.FIGMA_ACCESS_TOKEN),
    github: githubApi,
  });
  if (result.state === 'awaiting-local-agent')
    result = await persistEventMaterial(out, result);
  const receipt = {
    ...result,
    receiptVersion: 1,
    deliveryId: payload?.deliveryId ?? null,
    receivedAt: payload?.receivedAt ?? null,
  };
  await save('receipt.json', receipt);
  console.log(JSON.stringify({ type: 'result', ...receipt }));
  if (
    ![
      'ignored-ping',
      'ignored-event-type',
      'ignored-old-version',
      'existing-delivery',
    ].includes(result.state)
  )
    process.exitCode = 1;
} catch (error) {
  const failure = remoteFailure(error);
  const receipt = {
    ...failure,
    retryable: retryableState(failure.state),
    transport: 'repository_dispatch',
  };
  await save('receipt.json', receipt);
  console.log(JSON.stringify({ type: 'result', ...receipt }));
  process.exitCode = 1;
}
