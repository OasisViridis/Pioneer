import { planWriteback } from './design-writeback.mjs';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  classify,
  gate,
  gitRead,
  hash,
  prepare,
  publish,
  repository,
  validateOutput,
  verify,
} from './design-delivery.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const command = args[0];
const stdio = args.includes('--stdio');
const actorArg = args.indexOf('--actor');
const outputDir = path.resolve(root, 'tmp/design-delivery');
const json = async (file) =>
  JSON.parse(await readFile(path.resolve(root, file), 'utf8'));
let sequence = 0;
let lines;
const api = stdio
  ? async (method, endpoint, body) => {
      lines ??= createInterface({ input: process.stdin })[
        Symbol.asyncIterator
      ]();
      const id = ++sequence;
      console.log(
        JSON.stringify({ type: 'github-request', id, method, endpoint, body }),
      );
      const line = await lines.next();
      if (line.done) throw new Error('GitHub connector disconnected');
      const response = JSON.parse(line.value);
      if (response.id !== id)
        throw new Error('GitHub connector response mismatch');
      if (response.error)
        throw Object.assign(new Error(response.error.message), {
          status: response.error.status,
        });
      return response.value;
    }
  : async (method, endpoint, body) => {
      try {
        const output = execFileSync(
          'gh',
          [
            'api',
            '--method',
            method,
            endpoint,
            ...(body ? ['--input', '-'] : []),
          ],
          {
            input: body ? JSON.stringify(body) : undefined,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer: 8_000_000,
          },
        );
        return output.trim() ? JSON.parse(output) : null;
      } catch (error) {
        const message = error.stderr?.toString() || error.message;
        throw Object.assign(new Error(message), {
          status: Number(message.match(/HTTP (\d+)/)?.[1]),
        });
      }
    };
async function save(name, value) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, name),
    JSON.stringify(value, null, 2) + '\n',
  );
}
try {
  let receipt;
  if (command === 'writeback-plan') {
    receipt = await planWriteback(
      api,
      Number(args[1]),
      args[2],
      await json('design/delivery/features.json'),
    );
    await save('writeback-plan.json', receipt);
  } else if (command === 'verify') {
    const number = Number(args[1]);
    if (!Number.isSafeInteger(number) || number < 1)
      throw new Error('Expected PR number');
    receipt = await verify(api, number);
  } else {
    const raw = await json(args[1]);
    const policy = await json('design/delivery/features.json');
    const pkg = prepare(root, raw, policy);
    await save(`${raw.featureId}-package.json`, pkg);
    if (command === 'capture') {
      // Existing Codex session edits and stages its own files. Never run a shell/model
      // from design input; publication credentials remain with the API transport.
      const names = execFileSync(
        'git',
        ['diff', '--cached', '--name-only', '--diff-filter=ACM', raw.baseSha],
        { cwd: root, encoding: 'utf8' },
      )
        .trim()
        .split('\n')
        .filter(Boolean);
      const deleted = execFileSync(
        'git',
        [
          'diff',
          '--cached',
          '--name-only',
          '--diff-filter=DRTUXB',
          raw.baseSha,
        ],
        { cwd: root, encoding: 'utf8' },
      ).trim();
      if (deleted)
        throw new Error(
          'Deletions, renames, mode changes and conflicts require manual review',
        );
      const files = names.map((file) => {
        const indexEntry = execFileSync(
          'git',
          ['ls-files', '--stage', '--', file],
          { cwd: root, encoding: 'utf8' },
        );
        if (!indexEntry.startsWith('100644 '))
          throw new Error(
            'Only regular non-executable output files are supported',
          );
        const exists = execFileSync(
          'git',
          ['ls-tree', raw.baseSha, '--', file],
          { cwd: root, encoding: 'utf8' },
        ).trim();
        return {
          path: file,
          beforeSha256: exists ? hash(gitRead(root, raw.baseSha, file)) : null,
          content: execFileSync('git', ['show', `:${file}`], {
            cwd: root,
            encoding: 'utf8',
            maxBuffer: 2_000_000,
          }),
        };
      });
      const result = validateOutput(root, pkg, {
        packageHash: pkg.packageHash,
        baseSha: raw.baseSha,
        status: 'completed',
        files,
        model: 'existing Codex session',
        cost: null,
        manualInterventions: 0,
      });
      await save(`${raw.featureId}-output.json`, result);
      receipt = {
        state: 'captured',
        packageHash: pkg.packageHash,
        files: files.map((f) => f.path),
      };
    } else {
      const actor =
        actorArg >= 0
          ? args[actorArg + 1]
          : stdio
            ? null
            : execFileSync('gh', ['api', 'user', '--jq', '.login'], {
                encoding: 'utf8',
              }).trim();
      if (!actor) throw new Error('Connected GitHub actor is required');
      if (command === 'prepare') {
        const reasons = await gate(pkg, api, actor);
        receipt = {
          state: reasons.length ? 'materials-only' : 'ready-for-agent',
          packageHash: pkg.packageHash,
          reasons,
          repository,
        };
      } else if (command === 'deliver') {
        const output = await json(args[2]);
        receipt = await publish({ root, pkg, output, api, actor });
      } else
        throw new Error(
          'Usage: design:delivery prepare REQUEST | capture REQUEST | deliver REQUEST OUTPUT | verify PR [--stdio --actor LOGIN]',
        );
    }
  }
  await save('receipt.json', receipt);
  console.log(JSON.stringify({ type: 'result', ...receipt }));
  if (
    ![
      'verified',
      'captured',
      'ready-for-agent',
      'no-op',
      'validation-pending',
    ].includes(receipt.state)
  )
    process.exitCode = 1;
} catch (error) {
  const receipt = {
    state: classify(error),
    retryable: true,
    detail: error.message,
  };
  await save('receipt.json', receipt);
  console.log(JSON.stringify({ type: 'result', ...receipt }));
  process.exitCode = 1;
} finally {
  // readline keeps stdin alive after the final connector response.
  if (stdio) process.stdin.destroy();
}
