import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './design-tokens.mjs';

const kit = 'docs/design/hazel-v3';
const runtime = 'apps/desktop/src/renderer/assets/hazel';
const fonts = 'apps/desktop/src/renderer/assets/fonts';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const parse = (bytes) =>
  JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));

export async function readAssetEvidence(base = root) {
  const files = new Map();
  async function read(file) {
    const bytes = await readFile(path.join(base, file));
    files.set(file, bytes);
    return bytes;
  }
  const history = parse(await read('design/sync/evidence.json'));
  const policy = parse(await read('design/sync/asset-policy.json'));
  const decoration = parse(await read(`${kit}/decoration-policy.json`));
  const provenance = parse(await read(`${kit}/provenance.json`));
  const fontManifest = parse(await read(`${fonts}/font-manifest.json`));
  for (const file of Object.keys(history.historicalFiles)) await read(file);
  for (const asset of provenance.assets)
    await read(`${kit}/assets/${asset.file}`);
  const runtimeFiles = await readdir(path.join(base, runtime));
  for (const file of runtimeFiles) await read(`${runtime}/${file}`);
  for (const font of fontManifest.files) await read(`${fonts}/${font.file}`);
  const sources = new Map();
  async function scan(directory) {
    for (const entry of await readdir(path.join(base, directory), {
      withFileTypes: true,
    })) {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await scan(file);
      else if (/\.(tsx?|css|html)$/.test(file))
        sources.set(file, await readFile(path.join(base, file), 'utf8'));
    }
  }
  await scan('apps/desktop/src');
  return {
    history,
    policy,
    decoration,
    provenance,
    fontManifest,
    files,
    runtimeFiles,
    sources,
  };
}

export function validateAssets(evidence) {
  const {
    history,
    policy,
    decoration,
    provenance,
    fontManifest,
    files,
    runtimeFiles,
    sources,
  } = evidence;
  // Reuse the read-only part of validate-kit.py. Never rebuild QA/ZIP files or
  // require the original author's home-directory image store.
  for (const [file, expected] of Object.entries(history.historicalFiles))
    assert.equal(
      digest(files.get(file)),
      expected,
      `Historical asset evidence changed: ${file}`,
    );
  assert.deepEqual(policy.budget, decoration.budget, 'Decoration budget drift');
  assert.deepEqual(
    policy.reservedNoRuntime,
    decoration.selection.reservedNoRuntime,
    'Reserved asset drift',
  );
  const allowed = decoration.assets.map((a) => a.file).sort();
  assert.equal(allowed.length, 12, 'Historical runtime catalog size');
  assert.deepEqual(
    runtimeFiles.toSorted(),
    allowed,
    'Runtime asset catalog mismatch',
  );
  assert.deepEqual(
    [...policy.conversationPool, ...policy.dormantAssets].sort(),
    allowed,
    'Current selection must account for every approved asset exactly once',
  );
  assert.equal(
    new Set(policy.conversationPool).size,
    11,
    'Single-workspace pool must contain eleven distinct themes',
  );
  for (const asset of provenance.assets) {
    assert.equal(
      digest(files.get(`${kit}/assets/${asset.file}`)),
      asset.sha256,
      `Historical asset hash: ${asset.file}`,
    );
  }
  for (const asset of decoration.assets) {
    assert.equal(
      provenance.assets.find((a) => a.file === asset.file)?.sha256,
      asset.sha256,
      `Asset provenance mismatch: ${asset.file}`,
    );
    assert.equal(
      digest(files.get(`${runtime}/${asset.file}`)),
      asset.sha256,
      `Runtime asset hash: ${asset.file}`,
    );
  }
  const used = new Set();
  for (const [file, source] of sources) {
    const found = provenance.assets
      .filter((a) => source.includes(a.file))
      .map((a) => a.file);
    if (!found.length) continue;
    assert.equal(
      file,
      'apps/desktop/src/renderer/components/HazelCompanion.tsx',
      `Unapproved asset consumer: ${file}`,
    );
    for (const name of found) {
      assert(allowed.includes(name), `Reserved asset imported: ${name}`);
      used.add(name);
    }
  }
  assert.deepEqual([...used].sort(), allowed, 'Approved asset imports missing');
  for (const font of fontManifest.files) {
    const bytes = files.get(`${fonts}/${font.file}`);
    assert.equal(bytes.length, font.bytes, `Font size: ${font.file}`);
    assert.equal(digest(bytes), font.sha256, `Font hash: ${font.file}`);
  }
  return {
    historicalAssets: provenance.assets.length,
    runtimeAssets: allowed.length,
    fonts: fontManifest.files.length,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = validateAssets(await readAssetEvidence());
  console.log(
    `Assets check: ${result.historicalAssets} historical assets, ${result.runtimeAssets} runtime copies, ${result.fonts} fonts; hashes and catalog verified (read-only)`,
  );
}
