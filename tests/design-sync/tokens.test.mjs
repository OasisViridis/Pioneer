import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  checkDrift,
  generateCss,
  inputPath,
  parseTokens,
  readConsumers,
  root,
  validateConsumers,
} from '../../tools/design-tokens.mjs';

const text = await readFile(path.join(root, inputPath), 'utf8');
const baseline = () => parseTokens(text);

test('real exported color and semantic aliases generate reproducibly for live consumers', async () => {
  const css = await generateCss(baseline());
  assert.equal(css, await generateCss(baseline()));
  assert.match(css, /--hazel-tool-surface: #eeedea;/i);
  assert.match(css, /--pioneer-surface-muted: var\(--hazel-tool-surface\);/);
  assert.match(css, /--pioneer-space: 1rem;/);
  validateConsumers(css, await readConsumers());
});

test('one real color proposal propagates through CSS while preserving its semantic alias', async () => {
  const input = baseline();
  input.hazel['tool-surface'].$value.components = [
    238 / 255,
    241 / 255,
    243 / 255,
  ];
  const before = await generateCss(input);
  const after = await generateCss(baseline());
  assert.equal(before.replace('#eef1f3', '#eeedea'), after);
});

for (const [name, mutate, message] of [
  [
    'missing alias',
    (d) => {
      d.pioneer.background.$value = '{hazel.absent}';
    },
    /Missing alias/,
  ],
  [
    'alias cycle',
    (d) => {
      d.hazel.canvas.$value = '{pioneer.background}';
    },
    /Alias cycle/,
  ],
  [
    'alias type mismatch',
    (d) => {
      d.pioneer.background.$value = '{pioneer.space}';
    },
    /Alias type mismatch/,
  ],
  [
    'invalid color',
    (d) => {
      d.hazel.canvas.$value.components[0] = 2;
    },
    /Invalid color/,
  ],
  [
    'legacy color string',
    (d) => {
      d.hazel.canvas.$value = '#ffffff';
    },
    /Invalid color/,
  ],
  [
    'wrong type',
    (d) => {
      d.pioneer.space.$type = 'spacing';
    },
    /Unsupported type/,
  ],
  [
    'wrong unit',
    (d) => {
      d.pioneer.space.$value.unit = 'em';
    },
    /Invalid dimension/,
  ],
  [
    'unitless dimension',
    (d) => {
      d.pioneer.space.$value = 16;
    },
    /Invalid dimension/,
  ],
  [
    'duplicate CSS name',
    (d) => {
      d.pioneer.font = { body: structuredClone(d.pioneer['font-body']) };
    },
    /Duplicate CSS name/,
  ],
]) {
  test(`rejects ${name}`, async () => {
    const input = baseline();
    mutate(input);
    await assert.rejects(generateCss(input), message);
  });
}

test('rejects duplicate JSON names including escaped spellings', () => {
  assert.throws(
    () => parseTokens('{"pioneer":{},"pion\\u0065er":{}}'),
    /Duplicate JSON name/,
  );
});

test('rejects deletion used by an existing renderer consumer even with a CSS fallback', async () => {
  const input = baseline();
  delete input.pioneer.focus;
  const css = await generateCss(input);
  assert.throws(
    () => validateConsumers(css, [['view.tsx', 'var(--pioneer-focus, blue)']]),
    /Live CSS variable missing/,
  );
  assert.throws(
    () => validateConsumers(css, [['app.css', 'var( --pioneer-focus)']]),
    /Live CSS variable missing/,
  );
});

test('rejects manual output edits and input/output drift', async () => {
  const css = await generateCss(baseline());
  assert.throws(
    () => checkDrift(css, css.replace('#eeedea', '#eef1f3')),
    /Generated CSS drift/,
  );
});
