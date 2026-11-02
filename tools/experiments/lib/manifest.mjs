/**
 * Freeze-manifest helpers shared by freeze.mjs and analyze.mjs.
 *
 * The manifest is a repo-relative SHA-256/byte inventory:
 * {protocolId, protocolVersion, frozenAt, files: [{path, sha256, bytes}]}.
 */

import fs from 'node:fs';
import path from 'node:path';

import { ExperimentError, SHA256_PATTERN } from './assertions.mjs';
import { sha256Hex } from './record.mjs';

export const FREEZE_MANIFEST_NAME = 'freeze-manifest.json';

/** Protocol artifacts covered by every freeze manifest. */
export const FROZEN_PROTOCOL_FILE_NAMES = Object.freeze([
  'protocol.json',
  'tasks.json',
  'analysis-plan.json',
  'record-schema.json',
]);

export function toPosix(value) {
  return value.split(path.sep).join('/');
}

export function relativePosix(from, to) {
  return toPosix(path.relative(from, to)) || '.';
}

export function findRepositoryRoot(start) {
  let current = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function assertIsoDatetime(value) {
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

export function validateFreezeManifest(manifest) {
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

export function readFreezeManifest(protocolDir) {
  const manifestPath = path.join(protocolDir, FREEZE_MANIFEST_NAME);
  if (!fs.existsSync(manifestPath)) {
    throw new ExperimentError(
      `${FREEZE_MANIFEST_NAME} not found; run freeze.mjs --write first`,
    );
  }
  let value;
  try {
    value = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ExperimentError(`freeze-manifest.json: invalid JSON (${reason})`);
  }
  return validateFreezeManifest(value);
}

/**
 * Compare one file against a manifest entry. Returns a one-line difference or
 * null when the file matches.
 */
export function frozenFileDifference(manifest, repoRelativePath, absolutePath) {
  const entry = manifest.files.find((file) => file.path === repoRelativePath);
  if (entry === undefined) {
    return `untracked file (missing from manifest): ${repoRelativePath}`;
  }
  if (!fs.existsSync(absolutePath)) {
    return `missing file: ${repoRelativePath}`;
  }
  const buffer = fs.readFileSync(absolutePath);
  const digest = sha256Hex(buffer);
  if (digest !== entry.sha256 || buffer.byteLength !== entry.bytes) {
    return `hash mismatch: ${repoRelativePath} (manifest ${entry.sha256}/${entry.bytes}B, actual ${digest}/${buffer.byteLength}B)`;
  }
  return null;
}
