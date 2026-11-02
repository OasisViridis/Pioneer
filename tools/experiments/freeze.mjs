#!/usr/bin/env node
/**
 * freeze.mjs — write or verify the M5-A protocol freeze manifest.
 *
 * Usage:
 *   node tools/experiments/freeze.mjs --protocol-dir docs/experiments/m5a/v1 --write
 *   node tools/experiments/freeze.mjs --protocol-dir docs/experiments/m5a/v1 --verify
 *
 * The manifest covers protocol.json, tasks.json, analysis-plan.json and
 * record-schema.json in the protocol directory plus every .mjs under
 * tools/experiments. Paths are repository-relative and use forward slashes.
 */

import fs from 'node:fs';
import path from 'node:path';

import { parseArgs, requiredValue, runCli } from './lib/cli.mjs';
import { ExperimentError, sha256Hex } from './lib/record.mjs';

const PROTOCOL_FILE_NAMES = [
  'protocol.json',
  'tasks.json',
  'analysis-plan.json',
  'record-schema.json',
];
const MANIFEST_NAME = 'freeze-manifest.json';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function findRepositoryRoot(start) {
  let current = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function collectToolFiles(root) {
  const toolsRoot = path.join(root, 'tools', 'experiments');
  if (!fs.existsSync(toolsRoot)) {
    throw new ExperimentError('tools/experiments directory not found');
  }
  const found = [];
  const walk = (directory) => {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => (left.name < right.name ? -1 : 1));
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.mjs')) {
        found.push(entryPath);
      }
    }
  };
  walk(toolsRoot);
  return found;
}

function expectedFiles(root, protocolDir) {
  const protocolFiles = PROTOCOL_FILE_NAMES.map((name) =>
    path.join(protocolDir, name),
  );
  return [...protocolFiles, ...collectToolFiles(root)].sort((left, right) => {
    const leftKey = toPosix(path.relative(root, left));
    const rightKey = toPosix(path.relative(root, right));
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function assertInsideRepository(root, file) {
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ExperimentError(
      `file is outside the repository and cannot be frozen repo-relative: ${file}`,
    );
  }
  return toPosix(relative);
}

function assertIsoDatetime(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    throw new ExperimentError(
      'freeze-manifest.json.frozenAt: expected an ISO date-time',
    );
  }
}

function validateManifest(manifest) {
  if (
    manifest === null ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest)
  ) {
    throw new ExperimentError('freeze-manifest.json: expected a JSON object');
  }
  const allowed = ['protocolId', 'protocolVersion', 'frozenAt', 'files'];
  for (const key of Object.keys(manifest)) {
    if (!allowed.includes(key)) {
      throw new ExperimentError(`freeze-manifest.json: unknown field "${key}"`);
    }
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(manifest, key)) {
      throw new ExperimentError(`freeze-manifest.json: missing field "${key}"`);
    }
  }
  if (
    typeof manifest.protocolId !== 'string' ||
    manifest.protocolId.length === 0
  ) {
    throw new ExperimentError(
      'freeze-manifest.json.protocolId: expected a non-empty string',
    );
  }
  if (
    !Number.isSafeInteger(manifest.protocolVersion) ||
    manifest.protocolVersion < 1
  ) {
    throw new ExperimentError(
      'freeze-manifest.json.protocolVersion: expected a positive integer',
    );
  }
  assertIsoDatetime(manifest.frozenAt);
  if (!Array.isArray(manifest.files)) {
    throw new ExperimentError('freeze-manifest.json.files: expected an array');
  }
  const seen = new Set();
  for (const [index, file] of manifest.files.entries()) {
    const label = `freeze-manifest.json.files[${index}]`;
    if (file === null || typeof file !== 'object' || Array.isArray(file)) {
      throw new ExperimentError(`${label}: expected an object`);
    }
    const fileKeys = Object.keys(file).sort();
    if (
      fileKeys.length !== 3 ||
      fileKeys[0] !== 'bytes' ||
      fileKeys[1] !== 'path' ||
      fileKeys[2] !== 'sha256'
    ) {
      throw new ExperimentError(
        `${label}: expected exactly path, sha256 and bytes`,
      );
    }
    if (typeof file.path !== 'string' || file.path.length === 0) {
      throw new ExperimentError(`${label}.path: expected a non-empty string`);
    }
    if (file.path.includes('\\')) {
      throw new ExperimentError(
        `${label}.path: manifest paths must use forward slashes`,
      );
    }
    if (path.isAbsolute(file.path)) {
      throw new ExperimentError(`${label}.path: expected a relative path`);
    }
    if (seen.has(file.path)) {
      throw new ExperimentError(`${label}.path: duplicate entry`);
    }
    seen.add(file.path);
    if (typeof file.sha256 !== 'string' || !SHA256_PATTERN.test(file.sha256)) {
      throw new ExperimentError(`${label}.sha256: expected 64 lowercase hex`);
    }
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) {
      throw new ExperimentError(
        `${label}.bytes: expected a non-negative integer`,
      );
    }
  }
  return manifest;
}

function readProtocolIdentity(protocolDir) {
  const protocolPath = path.join(protocolDir, 'protocol.json');
  if (!fs.existsSync(protocolPath)) return null;
  let value;
  try {
    value = JSON.parse(fs.readFileSync(protocolPath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ExperimentError(`protocol.json: invalid JSON (${reason})`);
  }
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof value.protocolId !== 'string' ||
    !Number.isSafeInteger(value.protocolVersion)
  ) {
    throw new ExperimentError(
      'protocol.json: requires protocolId and protocolVersion',
    );
  }
  return {
    protocolId: value.protocolId,
    protocolVersion: value.protocolVersion,
  };
}

function writeManifest(root, protocolDir) {
  const identity = readProtocolIdentity(protocolDir);
  if (identity === null) {
    throw new ExperimentError(
      'protocol.json not found in the protocol directory',
    );
  }
  const files = [];
  for (const file of expectedFiles(root, protocolDir)) {
    const relativePath = assertInsideRepository(root, file);
    if (!fs.existsSync(file)) {
      throw new ExperimentError(`missing frozen file: ${relativePath}`);
    }
    const buffer = fs.readFileSync(file);
    files.push({
      path: relativePath,
      sha256: sha256Hex(buffer),
      bytes: buffer.byteLength,
    });
  }
  const manifest = {
    protocolId: identity.protocolId,
    protocolVersion: identity.protocolVersion,
    frozenAt: new Date().toISOString(),
    files,
  };
  fs.writeFileSync(
    path.join(protocolDir, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(
    `experiment:freeze: wrote ${MANIFEST_NAME} (${files.length} files)\n`,
  );
}

function verifyManifest(root, protocolDir) {
  const manifestPath = path.join(protocolDir, MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    throw new ExperimentError(`${MANIFEST_NAME} not found; run --write first`);
  }
  let rawManifest;
  try {
    rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ExperimentError(`freeze-manifest.json: invalid JSON (${reason})`);
  }
  const manifest = validateManifest(rawManifest);
  const manifestFiles = new Map(
    manifest.files.map((file) => [file.path, file]),
  );
  const expected = expectedFiles(root, protocolDir);
  const expectedPaths = new Set();
  const differences = [];

  for (const file of expected) {
    const relativePath = assertInsideRepository(root, file);
    expectedPaths.add(relativePath);
    const entry = manifestFiles.get(relativePath);
    if (entry === undefined) {
      differences.push(`untracked file: ${relativePath}`);
      continue;
    }
    if (!fs.existsSync(file)) {
      differences.push(`missing file: ${relativePath}`);
      continue;
    }
    const buffer = fs.readFileSync(file);
    const digest = sha256Hex(buffer);
    if (digest !== entry.sha256 || buffer.byteLength !== entry.bytes) {
      differences.push(
        `hash mismatch: ${relativePath} (manifest ${entry.sha256}/${entry.bytes}B, actual ${digest}/${buffer.byteLength}B)`,
      );
    }
  }

  for (const entry of manifest.files) {
    if (expectedPaths.has(entry.path)) continue;
    const absolute = path.resolve(root, entry.path);
    if (fs.existsSync(absolute)) {
      differences.push(`unexpected manifest entry: ${entry.path}`);
    } else {
      differences.push(`missing file: ${entry.path}`);
    }
  }

  const identity = readProtocolIdentity(protocolDir);
  if (identity !== null) {
    if (identity.protocolId !== manifest.protocolId) {
      differences.push(
        `protocolId mismatch: manifest "${manifest.protocolId}", current "${identity.protocolId}"`,
      );
    }
    if (identity.protocolVersion !== manifest.protocolVersion) {
      differences.push(
        `protocolVersion mismatch: manifest ${manifest.protocolVersion}, current ${identity.protocolVersion}`,
      );
    }
  }

  differences.sort();
  if (differences.length > 0) {
    process.stderr.write(
      `experiment:freeze: freeze verify failed: ${differences.length} difference(s)\n`,
    );
    for (const difference of differences) {
      process.stderr.write(`- ${difference}\n`);
    }
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `experiment:freeze: verified ${manifest.files.length} files against ${MANIFEST_NAME}\n`,
  );
}

async function main() {
  const { values, flags } = parseArgs(process.argv.slice(2), {
    boolean: ['write', 'verify'],
    string: ['protocol-dir'],
  });
  if (flags.has('write') === flags.has('verify')) {
    throw new ExperimentError('pass exactly one of --write or --verify');
  }
  const protocolDir = path.resolve(requiredValue(values, 'protocol-dir'));
  if (!fs.existsSync(protocolDir) || !fs.statSync(protocolDir).isDirectory()) {
    throw new ExperimentError(
      `protocol directory not found: ${values.get('protocol-dir')}`,
    );
  }
  const root = findRepositoryRoot(process.cwd());
  if (root === null) {
    throw new ExperimentError(
      'could not locate the repository root (no .git directory found)',
    );
  }
  if (flags.has('write')) {
    writeManifest(root, protocolDir);
  } else {
    verifyManifest(root, protocolDir);
  }
}

await runCli('freeze', main);
