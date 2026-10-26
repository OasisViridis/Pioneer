import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  validateMapping,
  validateVariantEvidence,
} from '../../tools/design-mappings.mjs';
import { root } from '../../tools/design-tokens.mjs';

const index = JSON.parse(
  await readFile(
    path.join(root, 'design/sync/component-mappings.json'),
    'utf8',
  ),
);
const s0 = JSON.parse(
  await readFile(
    path.join(root, 'docs/research/design-sync-s0/component-index.json'),
    'utf8',
  ),
);
const sources = await Promise.all(
  index.components.map((m) => readFile(path.join(root, m.code.path), 'utf8')),
);

test('all three real exports cover the eight frozen design variants with explicit differences', () => {
  for (let i = 0; i < index.components.length; i++)
    validateMapping(index.components[i], s0.components[i], sources[i]);
  assert.equal(index.components.flatMap((m) => m.variants).length, 8);
});

test('rejects invented props on the real poster, dock and session compositions', () => {
  for (let i = 0; i < index.components.length; i++) {
    const mapping = structuredClone(index.components[i]);
    mapping.usedProps.push('invented');
    assert.throws(
      () => validateMapping(mapping, s0.components[i], sources[i]),
      /Invented prop/,
    );
  }
});

test('rejects a nonexistent export and changed declared props', () => {
  const mapping = structuredClone(index.components[0]);
  mapping.code.exportName = 'WorkspacePoster';
  assert.throws(
    () => validateMapping(mapping, s0.components[0], sources[0]),
    /Missing real export/,
  );
  mapping.code.exportName = 'ProjectPoster';
  mapping.code.props.disabled = 'boolean';
  assert.throws(
    () => validateMapping(mapping, s0.components[0], sources[0]),
    /Real React props mismatch/,
  );
});

test('rejects omitted or new design variants and unreviewed source changes', () => {
  const mapping = structuredClone(index.components[0]);
  mapping.variants.pop();
  assert.throws(
    () => validateMapping(mapping, s0.components[0], sources[0]),
    /variant coverage/,
  );
  const design = structuredClone(s0.components[0]);
  design.properties.Cover.variantOptions.push('New');
  assert.throws(
    () => validateMapping(index.components[0], design, sources[0]),
    /variant drift/,
  );
  assert.throws(
    () =>
      validateMapping(
        index.components[0],
        s0.components[0],
        sources[0] + '\n// changed',
      ),
    /Component source drift/,
  );
});

test('an unsupported variant cannot be hidden behind a completed mapping', () => {
  const mapping = structuredClone(index.components[0]);
  mapping.variants.find((v) => v.name === 'Cover=Unavailable').status =
    'unsupported';
  assert.throws(
    () => validateMapping(mapping, s0.components[0], sources[0]),
    /Incomplete variants/,
  );
});

test('same-PR extensions retain accepted base evidence without pretending to be in main', () => {
  const mapping = structuredClone(index.components[0]);
  mapping.code.inAcceptedMain = true;
  assert.throws(
    () => validateMapping(mapping, s0.components[0], sources[0]),
    /already in main/,
  );
  mapping.code.inAcceptedMain = false;
  mapping.code.baseCommit = '';
  assert.throws(
    () => validateMapping(mapping, s0.components[0], sources[0]),
    /Missing accepted base version/,
  );
});

test('unaccepted unrelated candidates still require re-pinning and cannot generate usage', () => {
  const mapping = structuredClone(index.components[1]);
  mapping.code.inAcceptedMain = false;
  mapping.status = 'blocked';
  mapping.example = null;
  validateMapping(mapping, s0.components[1], null);
  assert.throws(
    () => validateMapping(mapping, s0.components[1], sources[1]),
    /re-pin accepted version/,
  );
  mapping.example = '<LocalTabs selected />';
  assert.throws(
    () => validateMapping(mapping, s0.components[1], null),
    /unaccepted code/,
  );
});

test('rejects a missing typed variant or Electron case instead of accepting prose alone', () => {
  const mapping = index.components[0];
  const names = mapping.variants.map((v) => v.name);
  const tests = new Map();
  for (const variant of mapping.variants)
    for (const proof of variant.evidence) tests.set(proof.path, [proof.test]);
  validateVariantEvidence(mapping, names, tests);
  assert.throws(
    () => validateVariantEvidence(mapping, names.slice(1), tests),
    /Typed example variant coverage/,
  );
  assert.throws(
    () => validateVariantEvidence(mapping, names, new Map()),
    /Missing enabled Electron test/,
  );
});
