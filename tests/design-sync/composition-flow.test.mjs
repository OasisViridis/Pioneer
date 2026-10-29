import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { eventRequest } from '../../tools/design-events.mjs';
import { gate, hash, prepare } from '../../tools/design-delivery.mjs';

test('reviewed composition can rebind an immutable event to a descendant accepted base', async () => {
  const dir = await mkdtemp(
    path.join(os.tmpdir(), 'pioneer-composition-flow-'),
  );
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const put = async (name, contents) => {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await writeFile(path.join(dir, name), contents);
  };
  const commit = (message) =>
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgSign=false',
      'commit',
      '-m',
      message,
    );
  try {
    git('init');
    const sourcePath =
      'apps/desktop/src/renderer/components/SessionTabStrip.tsx';
    const source = 'export function SessionTabStrip() {}\n';
    const blob = createHash('sha1')
      .update(`blob ${Buffer.byteLength(source)}\0`)
      .update(source)
      .digest('hex');
    const featureId = 'session-branch-tabs';
    const policy = {
      schemaVersion: 1,
      features: {
        [featureId]: {
          issue: 25,
          fileKey: 'FixtureFile',
          nodes: ['1093:1259'],
          changeTypes: ['ui'],
          compositionMappings: { '1093:1259': '921:632' },
          compositionApprovals: {
            '1093:1259': {
              '1093:1265': { Label: { type: 'TEXT', value: 'Branch' } },
            },
          },
          allowedPaths: [],
          basis: [],
        },
      },
    };
    const mapping = {
      designNode: '921:632',
      status: 'mapped',
      code: { path: sourcePath, blob },
      variants: [{ nodeId: '921:619', name: 'Active' }],
    };
    await put(sourcePath, source);
    await put(
      'design/sync/component-mappings.json',
      JSON.stringify({ complete: true, components: [mapping] }),
    );
    await put('design/delivery/features.json', JSON.stringify(policy));
    git('add', '.');
    commit('Event base');
    const originalBase = git('rev-parse', 'HEAD');
    const snapshotPath = 'design/delivery/events/fixture.json';
    const snapshot = JSON.stringify({
      fileKey: 'FixtureFile',
      kind: 'version',
      historicalVersionId: 'version1',
      nodes: [
        {
          id: '1093:1259',
          type: 'FRAME',
          children: [
            {
              id: '1093:1265',
              type: 'INSTANCE',
              componentId: '921:619',
              componentProperties: { Label: { type: 'TEXT', value: 'Branch' } },
              children: [
                { id: '1093:1266', type: 'TEXT', characters: 'Branch' },
              ],
            },
          ],
        },
      ],
    });
    git('switch', '-c', 'snapshot');
    await put(snapshotPath, snapshot);
    git('add', snapshotPath);
    commit('Fixed snapshot');
    const snapshotCommit = git('rev-parse', 'HEAD');
    git('switch', '-c', 'review', originalBase);
    policy.features[featureId].compositionSnapshotSha256 = {
      '1093:1259': hash(snapshot),
    };
    await put('design/delivery/features.json', JSON.stringify(policy));
    git('add', 'design/delivery/features.json');
    commit('Approve fixed snapshot');
    const reviewedBase = git('rev-parse', 'HEAD');
    const material = {
      featureId,
      issue: 25,
      changeType: 'ui',
      baseSha: originalBase,
      behaviorChanges: [],
      fileKey: 'FixtureFile',
      nodes: ['1093:1259'],
      version: 'version1',
      snapshotPath,
      snapshotSha256: hash(snapshot),
    };
    assert.throws(
      () => eventRequest(dir, material, snapshotCommit, policy),
      (error) => error.state === 'review-required',
    );
    const request = eventRequest(
      dir,
      material,
      snapshotCommit,
      policy,
      reviewedBase,
    );
    assert.equal(material.baseSha, originalBase);
    assert.equal(request.baseSha, reviewedBase);
    const pkg = prepare(dir, request, policy);
    const api = async (_method, url) =>
      url.endsWith('/git/ref/heads/main')
        ? { object: { sha: reviewedBase } }
        : {
            state: 'open',
            body: '',
            assignees: [],
            issue_dependencies_summary: { blocked_by: 0 },
          };
    assert.deepEqual(await gate(pkg, api, 'reviewer'), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
