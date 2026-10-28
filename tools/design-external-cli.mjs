import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeback } from './design-writeback-apply.mjs';
import { inspectEvent, eventRequest } from './design-events.mjs';
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
      const { snapshotText, ...material } = result;
      // Deterministic filenames, no remote mutation, no model or shell execution from event text.
      await mkdir(out, { recursive: true });
      await writeFile(
        path.join(out, `${result.eventKey}.snapshot.json`),
        snapshotText,
        { mode: 0o600 },
      );
      await save(`${result.eventKey}.material.json`, material);
      result = material;
    }
  } else if (command === 'event-request') {
    const request = eventRequest(root, await read(args[0]), args[1], policy);
    await save(`${request.featureId}.request.json`, request);
    result = {
      state: 'request-prepared',
      request: `tmp/design-external/${request.featureId}.request.json`,
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
  const result = { ...remoteFailure(error), retryable: true };
  await save('receipt.json', result);
  console.log(JSON.stringify(result));
  process.exitCode = 1;
}
