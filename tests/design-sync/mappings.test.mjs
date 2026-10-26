import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { validateMapping } from '../../tools/design-mappings.mjs';
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
const source = await readFile(
  path.join(root, index.components[0].code.path),
  'utf8',
);

test('real ProjectPoster props match the partial mapping and all four cover dispositions', () => {
  validateMapping(index.components[0], s0.components[0], source);
});

test('rejects an invented prop on the actual React export', () => {
  const mapping = structuredClone(index.components[0]);
  mapping.usedProps.push('disabled');
  assert.throws(
    () => validateMapping(mapping, s0.components[0], source),
    /Invented prop/,
  );
});

test('rejects a nonexistent export and changed declared props', () => {
  const mapping = structuredClone(index.components[0]);
  mapping.code.exportName = 'WorkspacePoster';
  assert.throws(
    () => validateMapping(mapping, s0.components[0], source),
    /Missing real export/,
  );
  mapping.code.exportName = 'ProjectPoster';
  mapping.code.props.disabled = 'boolean';
  assert.throws(
    () => validateMapping(mapping, s0.components[0], source),
    /Real React props mismatch/,
  );
});

test('rejects an omitted or new design variant instead of silently emitting default code', () => {
  const mapping = structuredClone(index.components[0]);
  mapping.variants.pop();
  assert.throws(
    () => validateMapping(mapping, s0.components[0], source),
    /variant coverage/,
  );
  const design = structuredClone(s0.components[0]);
  design.properties.Cover.variantOptions.push('New');
  assert.throws(
    () => validateMapping(index.components[0], design, source),
    /variant drift/,
  );
});

test('Unavailable cannot be mapped to a clickable project', () => {
  const mapping = structuredClone(index.components[0]);
  mapping.variants.find((v) => v.name === 'Cover=Unavailable').status =
    'preserved-difference';
  assert.throws(
    () => validateMapping(mapping, s0.components[0], source),
    /Unavailable has no safe real API/,
  );
});

test('an unsupported variant cannot be hidden behind a completed mapping status', () => {
  const mapping = structuredClone(index.components[0]);
  mapping.status = 'mapped';
  assert.throws(
    () => validateMapping(mapping, s0.components[0], source),
    /Incomplete variants/,
  );
});

test('unaccepted LocalTabs and SessionTabStrip remain blocked with no generated usage', () => {
  for (const i of [1, 2]) {
    validateMapping(index.components[i], s0.components[i], null);
    const mapping = structuredClone(index.components[i]);
    mapping.example = '<SessionTabStrip selected />';
    assert.throws(
      () => validateMapping(mapping, s0.components[i], null),
      /unaccepted code/,
    );
    assert.throws(
      () => validateMapping(index.components[i], s0.components[i], source),
      /re-pin accepted version/,
    );
  }
});
