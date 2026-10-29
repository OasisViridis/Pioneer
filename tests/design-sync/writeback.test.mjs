import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canonical,
  hash,
  qualityJobsPassed,
} from '../../tools/design-delivery.mjs';
import { writeback } from '../../tools/design-writeback-apply.mjs';
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
    if (endpoint.includes('/contents/docs/testing/acceptance.md'))
      return { type: 'file', encoding: 'base64', content: 'ZXZpZGVuY2U=' };
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

function publisher() {
  const fixture = boundary();
  const links = [];
  const posts = [];
  const approval = {
    approved: true,
    pr: 48,
    featureId: 's2-design-delivery',
    commit,
    acceptanceUrl: `https://github.com/OasisViridis/Pioneer/blob/${commit}/docs/testing/acceptance.md`,
  };
  let mode = 'success';
  const figma = async (method, endpoint, body) => {
    if (method === 'GET') return { dev_resources: structuredClone(links) };
    assert.equal(endpoint, '/v1/dev_resources');
    posts.push(structuredClone(body.dev_resources));
    if (mode === 'denied')
      throw Object.assign(new Error('secret server body'), { status: 403 });
    if (mode === 'rate')
      throw Object.assign(new Error('secret server body'), {
        status: 429,
        retryAfter: '60',
      });
    const added =
      mode === 'partial' ? body.dev_resources.slice(0, 2) : body.dev_resources;
    links.push(...added);
    if (mode === 'timeout') throw new Error('unknown transport outcome');
    return { links_created: added, errors: mode === 'partial' ? [{}] : [] };
  };
  const run = (apply = true) =>
    writeback({
      github: fixture.api,
      figma,
      number: 48,
      featureId: 's2-design-delivery',
      policy,
      approval,
      apply,
    });
  return {
    ...fixture,
    links,
    posts,
    approval,
    run,
    setMode: (value) => {
      mode = value;
    },
  };
}
test('preview and an unapproved apply never write; approval is tied to merge SHA', async () => {
  const p = publisher();
  assert.equal((await p.run(false)).state, 'writeback-preview');
  p.approval.approved = false;
  assert.equal((await p.run()).state, 'writeback-preview');
  assert.equal(p.posts.length, 0);
  p.approval.commit = 'd'.repeat(40);
  await assert.rejects(p.run(), /bind this PR/);
});
test('writeback readback succeeds and three replays preserve human links with no new POST', async () => {
  const p = publisher();
  p.links.push({
    file_key: 'EQis9ep9ZQsEenrUVXwlFU',
    node_id: '921:706',
    url: 'https://github.com/OasisViridis/Pioneer/issues/33',
    name: 'Human reference',
  });
  assert.equal((await p.run()).state, 'links-verified');
  for (let i = 0; i < 3; i++)
    assert.equal((await p.run()).state, 'links-verified');
  assert.equal(p.posts.length, 1);
  assert.equal(p.links.length, 19);
  assert.equal(p.links[0].name, 'Human reference');
});
test('partial 200 is not success; retry reads first and creates only missing links', async () => {
  const p = publisher();
  p.setMode('partial');
  const first = await p.run();
  assert.equal(first.state, 'partial-write');
  assert.equal(first.missing.length, 16);
  p.setMode('success');
  assert.equal((await p.run()).state, 'links-verified');
  assert.equal(p.posts[1].length, 16);
  assert.equal(new Set(p.links.map((r) => `${r.node_id}/${r.url}`)).size, 18);
});
test('timeout after committing is resolved by readback, without a second POST', async () => {
  const p = publisher();
  p.setMode('timeout');
  assert.equal((await p.run()).state, 'links-verified');
  assert.equal((await p.run()).state, 'links-verified');
  assert.equal(p.posts.length, 1);
});
test('per-node capacity blocks before mutation and never deletes human resources', async () => {
  const p = publisher();
  for (let i = 0; i < 5; i++)
    p.links.push({
      file_key: 'EQis9ep9ZQsEenrUVXwlFU',
      node_id: '921:706',
      url: `https://github.com/OasisViridis/Pioneer/issues/${i + 1}`,
    });
  assert.equal((await p.run()).state, 'capacity-blocked');
  assert.equal(p.posts.length, 0);
});
test('expired credentials and rate limits remain visible without leaking server errors', async () => {
  for (const [mode, expected] of [
    ['denied', 'permission-denied'],
    ['rate', 'rate-limited'],
  ]) {
    const p = publisher();
    p.setMode(mode);
    const result = await p.run();
    assert.equal(result.state, expected);
    assert.equal(JSON.stringify(result).includes('secret server body'), false);
  }
});
test('arbitrary acceptance URLs and stale merged evidence cannot publish', async () => {
  const p = publisher();
  p.approval.acceptanceUrl = 'https://example.com/accept';
  await assert.rejects(p.run(), /Acceptance must/);
  assert.equal(p.posts.length, 0);
  const q = publisher();
  q.state.run.head_sha = 'f'.repeat(40);
  assert.equal((await q.run()).state, 'merge-validation-pending');
  assert.equal(q.posts.length, 0);
});

test('readback failure reports an unknown write outcome and remains retryable', async () => {
  const p = boundary();
  let reads = 0;
  let writes = 0;
  const result = await writeback({
    github: p.api,
    number: 48,
    featureId: 's2-design-delivery',
    policy,
    approval: {
      approved: true,
      pr: 48,
      featureId: 's2-design-delivery',
      commit,
      acceptanceUrl: `https://github.com/OasisViridis/Pioneer/blob/${commit}/docs/testing/acceptance.md`,
    },
    apply: true,
    figma: async (method) => {
      if (method === 'POST') {
        writes++;
        return { links_created: [], errors: [] };
      }
      if (++reads === 1) return { dev_resources: [] };
      throw new Error('connection lost');
    },
  });
  assert.equal(result.phase, 'readback');
  assert.equal(result.writeOutcome, 'unknown');
  assert.equal(result.retryable, true);
  assert.equal(writes, 1);
});
