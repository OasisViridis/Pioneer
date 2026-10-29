import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeback } from './design-writeback-apply.mjs';
import {
  inspectEvent,
  eventRequest,
  persistEventMaterial,
} from './design-events.mjs';
import { figmaApi, githubApi, remoteFailure } from './design-remote.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...args] = process.argv.slice(2);
const read = async (file) =>
  JSON.parse(await readFile(path.resolve(root, file), 'utf8'));
const out = path.join(root, 'tmp/design-external');
const save = async (name, value) => {
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, name), JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
  });
};
try {
  const policy = await read('design/delivery/features.json');
  let result;
  if (command === 'writeback') {
    result = await writeback({
      github: githubApi,
      figma: figmaApi(process.env.FIGMA_ACCESS_TOKEN),
      number: Number(args[0]),
      featureId: args[1],
      approval: await read(args[2]),
      policy,
      apply: args.includes('--apply'),
    });
  } else if (command === 'event-inspect') {
    // Raw event files contain a passcode: keep them outside Git and delete via the operator's retention policy.
    const raw = await readFile(path.resolve(root, args[0]), 'utf8');
    if (Buffer.byteLength(raw) > 256_000)
      throw new Error('Event exceeds size limit');
    result = await inspectEvent({
      event: JSON.parse(raw),
      config: await read(args[1]),
      policy,
      passcode: process.env.FIGMA_WEBHOOK_PASSCODE,
      figma: figmaApi(process.env.FIGMA_ACCESS_TOKEN),
      github: githubApi,
    });
    if (result.state === 'awaiting-local-agent') {
      // Deterministic filenames, no remote mutation, no model or shell execution from event text.
      result = await persistEventMaterial(out, result);
    }
  } else if (command === 'event-request') {
    if (
      args.length !== 2 &&
      (args.length !== 4 || args[2] !== '--reviewed-base')
    )
      throw new Error(
        'Expected material, snapshot commit and optional --reviewed-base SHA',
      );
    const material = await read(args[0]);
    const request = eventRequest(root, material, args[1], policy, args[3]);
    await save(`${request.featureId}.request.json`, request);
    result = {
      state: 'request-prepared',
      request: `tmp/design-external/${request.featureId}.request.json`,
      originalBaseSha: material.baseSha,
      reviewedBaseSha: request.baseSha,
      next: 'design:delivery prepare; only ready-for-agent permits implementation',
    };
  } else throw new Error('Unknown external delivery command');
  await save('receipt.json', result);
  console.log(JSON.stringify(result));
  if (
    ![
      'links-verified',
      'writeback-preview',
      'ignored-ping',
      'ignored-event-type',
      'ignored-old-version',
      'existing-delivery',
      'request-prepared',
    ].includes(result.state)
  )
    process.exitCode = 1;
} catch (error) {
  const failure = remoteFailure(error);
  const result = { ...failure, retryable: failure.state !== 'review-required' };
  await save('receipt.json', result);
  console.log(JSON.stringify(result));
  process.exitCode = 1;
}
