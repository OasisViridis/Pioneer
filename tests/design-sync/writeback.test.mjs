import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canonical,
  hash,
  qualityJobsPassed,
} from '../../tools/design-delivery.mjs';
import { planWriteback } from '../../tools/design-writeback.mjs';

const policy = JSON.parse(
  await readFile('design/delivery/features.json', 'utf8'),
);
const original = JSON.parse(
  await readFile('design/deliveries/s2-design-delivery/package.json', 'utf8'),
);
const commit = 'c'.repeat(40);
function boundary() {
  const state = {
    pr: {
      merged: true,
      merge_commit_sha: commit,
      head: {
        sha: 'a'.repeat(40),
        ref: 'codex/design-s2-design-delivery',
        repo: { full_name: 'OasisViridis/Pioneer' },
      },
      body:
        '<!-- pioneer-design-delivery\n' +
        JSON.stringify({
          featureId: 's2-design-delivery',
          issue: 36,
          packageHash: original.packageHash,
          outputHash: original.outputHash,
        }) +
        '\n-->',
      base: { ref: 'main', repo: { full_name: 'OasisViridis/Pioneer' } },
    },
    pkg: structuredClone(original),
    run: {
      id: 1,
      head_sha: commit,
      head_branch: 'main',
      event: 'push',
      status: 'completed',
      conclusion: 'success',
    },
    jobs: [
      {
        name: 'Windows / pnpm check',
        conclusion: 'success',
        steps: [
          'Verify repository normalization',
          'Contract tests',
          'Electron E2E',
          'Package smoke',
          'Confirm aggregate quality and S1 acceptance',
        ].map((name) => ({ name, conclusion: 'success' })),
      },
      {
        name: 'Windows / reviewed visual baseline',
        conclusion: 'success',
        steps: [
          { name: 'Compare reviewed Windows baseline', conclusion: 'success' },
        ],
      },
    ],
    calls: [],
  };
  const api = async (method, endpoint) => {
    assert.equal(method, 'GET', 'Preparation must never publish');
    state.calls.push(endpoint);
    if (endpoint.endsWith('/pulls/48')) return structuredClone(state.pr);
    if (endpoint.includes('/contents/')) {
      assert.ok(endpoint.endsWith(`?ref=${commit}`));
      return {
        encoding: 'base64',
        content: Buffer.from(JSON.stringify(state.pkg)).toString('base64'),
      };
    }
    if (endpoint.includes('/workflows/quality.yml/runs'))
      return { workflow_runs: [state.run] };
    if (endpoint.includes('/actions/runs/')) return { jobs: state.jobs };
    throw new Error(endpoint);
  };
  return {
    state,
    api,
    plan: () => planWriteback(api, 48, 's2-design-delivery', policy),
  };
}
test('merged evidence yields a repeatable read-only resource list while external/manual gates remain blocked', async () => {
  const { state, plan } = boundary();
  const first = await plan();
  assert.equal(first.state, 'writeback-blocked');
  assert.equal(first.commit, commit);
  assert.equal(first.resources.length, 15);
  assert.equal(first.manualAcceptance, 'pending');
  for (let n = 0; n < 3; n++) assert.deepEqual(await plan(), first);
  assert.ok(state.calls.every((path) => !path.includes('/issues/33')));
});
test('unmerged PRs and wrong repository cannot prepare a publication list', async () => {
  for (const mutate of [
    (s) => {
      s.pr.merged = false;
    },
    (s) => {
      s.pr.base.repo.full_name = 'other/repo';
    },
  ]) {
    const { state, plan } = boundary();
    mutate(state);
    assert.equal((await plan()).state, 'awaiting-merge');
    assert.equal(state.calls.length, 1);
  }
});
test('old SHA, failed CI, missing visual job and skipped comparison never produce resources', async () => {
  for (const mutate of [
    (s) => {
      s.run.head_sha = 'f'.repeat(40);
    },
    (s) => {
      s.run.conclusion = 'failure';
    },
    (s) => {
      s.jobs.pop();
    },
    (s) => {
      s.jobs[1].steps[0].conclusion = 'skipped';
    },
  ]) {
    const { state, plan } = boundary();
    mutate(state);
    assert.deepEqual((await plan()).resources, []);
  }
});
test('out-of-scope nodes are refused even with a recomputed package hash', async () => {
  const { state, plan } = boundary();
  state.pkg.request.design.nodes.push('999:999');
  const {
    packageHash: _old,
    outputHash: _output,
    files: _files,
    ...frozen
  } = state.pkg;
  void [_old, _output, _files];
  state.pkg.packageHash = hash(canonical(frozen));
  state.pr.body = state.pr.body.replace(
    original.packageHash,
    state.pkg.packageHash,
  );
  await assert.rejects(plan(), /outside reviewed scope/);
});
test('partial visual job cannot satisfy delivery verification', () => {
  const { state } = boundary();
  assert.equal(qualityJobsPassed(state.jobs), true);
  state.jobs[1].steps = [];
  assert.equal(qualityJobsPassed(state.jobs), false);
});

test('an unrelated merged PR cannot reuse an older delivery package', async () => {
  const { state, plan } = boundary();
  state.pr.body = 'An unrelated change';
  await assert.rejects(plan(), /not the delivery/);
});
