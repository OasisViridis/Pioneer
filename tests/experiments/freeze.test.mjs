import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  PROTOCOL_ID,
  REPOSITORY_ROOT,
  cleanup,
  createRepositoryTempRoot,
  readJson,
  runExperimentCli,
  writeJson,
} from './helpers.mjs';

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function relativeToRepository(file) {
  return toPosix(path.relative(REPOSITORY_ROOT, file));
}

function makeProtocolDirectory(root) {
  const directory = path.join(root, 'v1');
  fs.mkdirSync(directory, { recursive: true });
  writeJson(path.join(directory, 'protocol.json'), {
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    protocolVersion: 1,
    datasetVersion: 1,
  });
  writeJson(path.join(directory, 'tasks.json'), {
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    protocolVersion: 1,
    tasks: [],
  });
  writeJson(path.join(directory, 'analysis-plan.json'), {
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    protocolVersion: 1,
    planVersion: 1,
  });
  writeJson(path.join(directory, 'record-schema.json'), {
    $id: 'pioneer:m5a/record-schema/1',
  });
  return directory;
}

function freezeArgs(directory, flag) {
  return ['--protocol-dir', directory, flag];
}

test('freeze --write covers the protocol files plus every tools .mjs, then --verify passes', () => {
  const root = createRepositoryTempRoot();
  try {
    const protocolDir = makeProtocolDirectory(root);
    const write = runExperimentCli(
      'freeze.mjs',
      freezeArgs(protocolDir, '--write'),
    );
    assert.equal(write.status, 0, write.stderr);
    const manifest = readJson(path.join(protocolDir, 'freeze-manifest.json'));
    assert.equal(manifest.protocolId, PROTOCOL_ID);
    assert.equal(manifest.protocolVersion, 1);
    assert.match(manifest.frozenAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(manifest.files.length >= 8);
    for (const file of manifest.files) {
      assert.equal(file.path.includes('\\'), false);
      assert.doesNotMatch(file.path, /^[A-Za-z]:/);
      assert.match(file.sha256, /^[0-9a-f]{64}$/);
      assert.ok(file.bytes >= 0);
    }
    const paths = manifest.files.map((file) => file.path);
    for (const name of [
      'protocol.json',
      'tasks.json',
      'analysis-plan.json',
      'record-schema.json',
    ]) {
      assert.ok(
        paths.includes(relativeToRepository(path.join(protocolDir, name))),
      );
    }
    for (const name of [
      'build-dataset.mjs',
      'analyze.mjs',
      'freeze.mjs',
      'lib/record.mjs',
      'lib/dataset.mjs',
      'lib/stats.mjs',
      'lib/cli.mjs',
    ]) {
      assert.ok(paths.includes(`tools/experiments/${name}`));
    }

    const verify = runExperimentCli(
      'freeze.mjs',
      freezeArgs(protocolDir, '--verify'),
    );
    assert.equal(verify.status, 0, verify.stderr);
    assert.match(verify.stdout, /verified/);
  } finally {
    cleanup(root);
  }
});

test('freeze --verify fails with a hash diff after a frozen file changes', () => {
  const root = createRepositoryTempRoot();
  try {
    const protocolDir = makeProtocolDirectory(root);
    const write = runExperimentCli(
      'freeze.mjs',
      freezeArgs(protocolDir, '--write'),
    );
    assert.equal(write.status, 0, write.stderr);
    const tasksFile = path.join(protocolDir, 'tasks.json');
    const tasks = readJson(tasksFile);
    tasks.tasks = [{ taskId: 't01' }];
    writeJson(tasksFile, tasks);
    const verify = runExperimentCli(
      'freeze.mjs',
      freezeArgs(protocolDir, '--verify'),
    );
    assert.equal(verify.status, 1);
    assert.match(verify.stderr, /freeze verify failed/);
    assert.match(
      verify.stderr,
      new RegExp(`hash mismatch: ${relativeToRepository(tasksFile)}`),
    );
  } finally {
    cleanup(root);
  }
});

test('freeze --verify reports missing and untracked files', () => {
  const root = createRepositoryTempRoot();
  try {
    const protocolDir = makeProtocolDirectory(root);
    const write = runExperimentCli(
      'freeze.mjs',
      freezeArgs(protocolDir, '--write'),
    );
    assert.equal(write.status, 0, write.stderr);
    const manifestPath = path.join(protocolDir, 'freeze-manifest.json');
    const manifest = readJson(manifestPath);
    manifest.files.push({
      path: 'tools/experiments/does-not-exist.mjs',
      sha256: 'd'.repeat(64),
      bytes: 1,
    });
    writeJson(manifestPath, manifest);
    fs.rmSync(path.join(protocolDir, 'record-schema.json'));

    const verify = runExperimentCli(
      'freeze.mjs',
      freezeArgs(protocolDir, '--verify'),
    );
    assert.equal(verify.status, 1);
    assert.match(
      verify.stderr,
      /missing file: tools\/experiments\/does-not-exist\.mjs/,
    );
    assert.match(
      verify.stderr,
      new RegExp(
        `missing file: ${relativeToRepository(path.join(protocolDir, 'record-schema.json'))}`,
      ),
    );
  } finally {
    cleanup(root);
  }
});

test('freeze --write fails when a required protocol file is missing', () => {
  const root = createRepositoryTempRoot();
  try {
    const protocolDir = makeProtocolDirectory(root);
    fs.rmSync(path.join(protocolDir, 'tasks.json'));
    const write = runExperimentCli(
      'freeze.mjs',
      freezeArgs(protocolDir, '--write'),
    );
    assert.equal(write.status, 1);
    assert.match(write.stderr, /missing frozen file: .*tasks\.json/);
    assert.equal(
      fs.existsSync(path.join(protocolDir, 'freeze-manifest.json')),
      false,
    );
  } finally {
    cleanup(root);
  }
});

test('freeze requires exactly one mode and an existing manifest for verify', () => {
  const root = createRepositoryTempRoot();
  try {
    const protocolDir = makeProtocolDirectory(root);
    const both = runExperimentCli('freeze.mjs', [
      '--protocol-dir',
      protocolDir,
      '--write',
      '--verify',
    ]);
    assert.equal(both.status, 1);
    assert.match(both.stderr, /exactly one of --write or --verify/);

    const verify = runExperimentCli(
      'freeze.mjs',
      freezeArgs(protocolDir, '--verify'),
    );
    assert.equal(verify.status, 1);
    assert.match(verify.stderr, /freeze-manifest\.json not found/);
  } finally {
    cleanup(root);
  }
});
