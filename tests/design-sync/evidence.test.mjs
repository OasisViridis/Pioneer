import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  inputPath,
  parseTokens,
  root,
  validateTokens,
} from '../../tools/design-tokens.mjs';

const evidence = JSON.parse(
  await readFile(path.join(root, 'design/sync/evidence.json'), 'utf8'),
);

test('historical S0 snapshots remain byte-identical and all native variables have a decision', async () => {
  for (const [file, expected] of Object.entries(evidence.files)) {
    const bytes = await readFile(path.join(root, file));
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      expected,
      file,
    );
  }
  const native = JSON.parse(
    await readFile(
      path.join(root, 'docs/research/design-sync-s0/native-variables.json'),
      'utf8',
    ),
  );
  assert.deepEqual(
    evidence.nativeVariableDecisions.map((v) => v.id).sort(),
    native.variables.map((v) => v.id).sort(),
  );
  for (const entry of evidence.nativeVariableDecisions)
    assert(
      [
        'accept',
        'preserve-runtime-difference',
        'preserve-design-only',
      ].includes(entry.decision),
    );
});

// Reuse the applicable contrast checks from the historical Hazel validator,
// against production values only, with no image-store, QA or ZIP writes.
test('production colors retain readable foreground and focus contrast', async () => {
  const { resolved } = validateTokens(
    parseTokens(await readFile(path.join(root, inputPath), 'utf8')),
  );
  function luminance(key) {
    return resolved
      .get(key)
      .components.map((c) =>
        c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
      )
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  }
  for (const [fg, bg, minimum] of [
    ['hazel.ink', 'hazel.canvas', 4.5],
    ['hazel.secondary', 'hazel.canvas', 4.5],
    ['hazel.secondary', 'hazel.tool-surface', 4.5],
    ['hazel.success-ink', 'hazel.mint', 4.5],
    ['pioneer.focus', 'hazel.canvas', 3],
  ]) {
    const a = luminance(fg),
      b = luminance(bg);
    assert(
      (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= minimum,
      `${fg}/${bg} contrast below ${minimum}`,
    );
  }
});
