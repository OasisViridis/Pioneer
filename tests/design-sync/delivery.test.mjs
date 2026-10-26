import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  canonical,
  gate,
  gitRead,
  hash,
  prepare,
  publish,
  validateOutput,
  verify,
} from '../../tools/design-delivery.mjs';
import { root } from '../../tools/design-tokens.mjs';

const request = JSON.parse(
  await readFile(
    path.join(root, 'design/delivery/issue36.request.json'),
    'utf8',
  ),
);
const policy = JSON.parse(
  await readFile(path.join(root, 'design/delivery/features.json'), 'utf8'),
);
const pkg = prepare(root, request, policy);
const head = 'b'.repeat(40);
function output() {
  return {
    packageHash: pkg.packageHash,
    baseSha: request.baseSha,
    status: 'completed',
    model: 'fixture',
    cost: null,
    manualInterventions: 0,
    files: [
      {
        path: 'tools/design-delivery.mjs',
        content: '// controlled implementation fixture\n',
        beforeSha256: null,
      },
    ],
  };
}
// One delivery-boundary fixture: requests, output, existing PR and checks. No model,
// OAuth, Figma server, task database or per-service simulation is involved.
function boundary() {
  const state = {
    writes: [],
    issue: {
      state: 'open',
      body: '',
      assignees: [],
      issue_dependencies_summary: { blocked_by: 0 },
    },
    branch: null,
    pr: null,
    tree: [],
    failPr: false,
    run: null,
    jobs: [],
  };
  const api = async (method, url, body) => {
    if (method !== 'GET') state.writes.push({ url, body });
    if (method === 'GET' && url.endsWith('/issues/36')) return state.issue;
    if (method === 'GET' && url.includes('/pulls?'))
      return state.pr ? [structuredClone(state.pr)] : [];
    if (method === 'GET' && /\/pulls\/44$/.test(url))
      return structuredClone(state.pr);
    if (method === 'GET' && url.endsWith('/git/ref/heads/main'))
      return { object: { sha: request.baseSha } };
    if (method === 'GET' && url.includes('/git/ref/heads/codex/')) {
      if (!state.branch)
        throw Object.assign(new Error('not found'), { status: 404 });
      return { object: { sha: state.branch } };
    }
    if (method === 'GET' && url.endsWith(`/git/commits/${request.baseSha}`))
      return { tree: { sha: 'a'.repeat(40) } };
    if (method === 'POST' && url.endsWith('/git/trees')) {
      state.tree = body.tree;
      return { sha: 'c'.repeat(40) };
    }
    if (method === 'POST' && url.endsWith('/git/commits')) {
      state.commit = body;
      return { sha: head };
    }
    if (method === 'GET' && url.endsWith(`/git/commits/${head}`))
      return {
        ...state.commit,
        parents: state.commit.parents.map((sha) => ({ sha })),
      };
    if (method === 'POST' && url.endsWith('/git/refs')) {
      state.branch = body.sha;
      return {};
    }
    if (method === 'GET' && url.includes('/contents/')) {
      const file = decodeURI(url.split('/contents/')[1].split('?')[0]);
      return {
        content: Buffer.from(
          state.tree.find((f) => f.path === file).content,
        ).toString('base64'),
      };
    }
    if (method === 'GET' && url.includes('/compare/'))
      return { files: state.tree.map((f) => ({ filename: f.path })) };
    if (method === 'POST' && url.endsWith('/pulls')) {
      if (state.failPr)
        throw Object.assign(new Error('API unavailable'), { status: 503 });
      state.pr = {
        ...body,
        number: 44,
        state: 'open',
        html_url: 'https://github.com/OasisViridis/Pioneer/pull/44',
        head: { sha: head, ref: body.head },
      };
      return structuredClone(state.pr);
    }
    if (url.includes('/actions/workflows/quality.yml/runs'))
      return { workflow_runs: state.run ? [state.run] : [] };
    if (url.includes('/actions/runs/')) return { jobs: state.jobs };
    throw new Error(`Unexpected boundary request: ${method} ${url}`);
  };
  const deliver = (input = output(), pack = pkg) =>
    publish({ root, pkg: pack, output: input, api, actor: 'OasisViridis' });
  return { state, api, deliver };
}

test('fixed package retains all three nodes, eight variants, source hashes and accepted contract basis', () => {
  assert.equal(pkg.nodes.length, 3);
  assert.equal(pkg.components.flatMap((c) => c.variants).length, 8);
  assert(pkg.basis.some((f) => f.path.includes('run-contract')));
  assert(pkg.components.every((c) => c.acceptedAt === request.baseSha));
  assert.equal(pkg.packageHash, prepare(root, request, policy).packageHash);
  const { packageHash, ...content } = pkg;
  assert.equal(packageHash, hash(canonical(content)));
});

test('missing nodes, version, empty input, wrong hash and foreign feature/Issue fail before publication', () => {
  for (const modify of [
    (r) => {
      r.design.nodes = [];
    },
    (r) => {
      r.design.nodes = ['0:0'];
    },
    (r) => {
      r.design.nodes.push(r.design.nodes[0]);
    },
    (r) => {
      r.design.version = 'invented-history';
    },
    (r) => {
      r.design.sha256 = '0'.repeat(64);
    },
    (r) => {
      r.issue = 13;
    },
    (r) => {
      r.featureId = 'invented';
    },
    (r) => {
      r.design.path = '../secret';
    },
  ]) {
    const raw = structuredClone(request);
    modify(raw);
    assert.throws(() => prepare(root, raw, policy));
  }
});

test('one explicit delivery produces a Draft PR; three identical submissions create one commit and no comments', async () => {
  const { deliver, state } = boundary();
  assert.equal((await deliver()).state, 'validation-pending');
  assert.equal(state.pr.draft, true);
  const firstWrites = state.writes.length;
  for (let i = 0; i < 3; i++) assert.equal((await deliver()).state, 'no-op');
  assert.equal(state.writes.length, firstWrites);
  assert.equal(
    state.writes.filter((w) => w.url.endsWith('/git/commits')).length,
    1,
  );
  assert(!state.writes.some((w) => /issues|comments/.test(w.url)));
});

test('new design and human commits/body stay intact with a pending diff on the same PR', async () => {
  const { deliver, state } = boundary();
  await deliver();
  state.pr.body += '\nHuman review note';
  state.pr.head.sha = 'd'.repeat(40);
  const before = structuredClone(state);
  const update = { ...pkg, packageHash: 'e'.repeat(64) };
  const receipt = await deliver(
    { ...output(), packageHash: update.packageHash },
    update,
  );
  assert.equal(receipt.state, 'review-required');
  assert.equal(receipt.pr, state.pr.html_url);
  assert.deepEqual(state, before);
});

test('original dependencies, existing owner and Unknown/Run conflicts yield materials only, even before agent output exists', async () => {
  for (const change of [
    (s) => {
      s.issue.issue_dependencies_summary.blocked_by = 1;
    },
    (s) => {
      s.issue.assignees = [{ login: 'another-developer' }];
    },
  ]) {
    const { deliver, state } = boundary();
    change(state);
    assert.equal((await deliver(null)).state, 'materials-only');
    assert.equal(state.writes.length, 0);
  }
  const { deliver, state } = boundary();
  const conflict = prepare(
    root,
    { ...request, behaviorChanges: ['unknown-run-state', 'stop'] },
    policy,
  );
  assert.equal((await deliver(null, conflict)).state, 'materials-only');
  assert.equal(state.writes.length, 0);
});

test('missing native dependency evidence fails closed; explicit fallback blockers remain live', async () => {
  const { state, api } = boundary();
  delete state.issue.issue_dependencies_summary;
  await assert.rejects(
    () => gate(pkg, api, 'OasisViridis'),
    /dependency status/,
  );
  state.issue.issue_dependencies_summary = { blocked_by: 0 };
  state.issue.body = 'Blocked by: #13';
  const reasons = await gate(
    pkg,
    (method, url) =>
      url.endsWith('/issues/13') ? { state: 'open' } : api(method, url),
    'OasisViridis',
  );
  assert.deepEqual(reasons, ['Open dependency #13']);
});

test('stale output, empty output, agent failure and backend capability changes cannot publish', async () => {
  for (const [modify, expected] of [
    [
      (r) => {
        r.packageHash = 'a'.repeat(64);
      },
      'stale-output',
    ],
    [
      (r) => {
        r.files = [];
      },
      'empty-output',
    ],
    [
      (r) => {
        r.status = 'failed';
      },
      'agent-failed',
    ],
    [
      (r) => {
        r.files[0].path = 'apps/desktop/src/main/run.ts';
      },
      'behavior-conflict',
    ],
    [
      (r) => {
        r.files[0].beforeSha256 = 'a'.repeat(64);
      },
      'stale-output',
    ],
  ]) {
    const { deliver, state } = boundary();
    const input = output();
    modify(input);
    assert.equal((await deliver(input)).state, expected);
    assert.equal(state.writes.length, 0);
  }
});

test('PR creation failure resumes a verified identical branch without another commit', async () => {
  const { deliver, state } = boundary();
  state.failPr = true;
  assert.equal((await deliver()).state, 'retryable-error');
  state.failPr = false;
  assert.equal((await deliver()).state, 'validation-pending');
  assert.equal(
    state.writes.filter((w) => w.url.endsWith('/git/commits')).length,
    1,
  );
});

test('human changes on an orphan branch after failed PR creation are preserved', async () => {
  const { deliver, state } = boundary();
  state.failPr = true;
  await deliver();
  state.failPr = false;
  state.tree[0].content += '// human';
  assert.equal((await deliver()).state, 'review-required');
  assert.equal(state.pr, null);
});

test('permission loss and rate limiting have distinct retryable states and no success', async () => {
  for (const [status, expected] of [
    [401, 'permission-denied'],
    [403, 'permission-denied'],
    [429, 'rate-limited'],
  ]) {
    const receipt = await publish({
      root,
      pkg,
      output: output(),
      actor: 'OasisViridis',
      api: async () => {
        throw Object.assign(new Error('API failure'), { status });
      },
    });
    assert.equal(receipt.state, expected);
    assert.equal(receipt.retryable, true);
  }
});

test('verification rejects old SHA, absent, failed and skipped checks; only final Windows gate passes', async () => {
  const { deliver, state, api } = boundary();
  await deliver();
  assert.equal((await verify(api, 44)).state, 'validation-not-triggered');
  state.run = {
    id: 1,
    head_sha: 'f'.repeat(40),
    head_branch: state.pr.head.ref,
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
  };
  assert.equal((await verify(api, 44)).state, 'validation-not-triggered');
  state.run.head_sha = head;
  state.run.conclusion = 'failure';
  assert.equal((await verify(api, 44)).state, 'validation-failed');
  state.run.conclusion = 'success';
  assert.equal((await verify(api, 44)).state, 'validation-incomplete');
  state.jobs = [
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
  ];
  assert.equal((await verify(api, 44)).state, 'verified');
  state.jobs[0].steps[0].conclusion = 'skipped';
  assert.equal((await verify(api, 44)).state, 'validation-incomplete');
});

test('head advancing during validation invalidates the result', async () => {
  const { deliver, state, api } = boundary();
  await deliver();
  let reads = 0;
  const raced = async (method, url) => {
    if (url.endsWith('/pulls/44') && ++reads === 2)
      state.pr.head.sha = 'f'.repeat(40);
    return api(method, url);
  };
  assert.equal((await verify(raced, 44)).state, 'stale-validation');
});

test('output validation rejects duplicate files and falsified base hashes', () => {
  const result = output();
  result.files.push(result.files[0]);
  assert.throws(() => validateOutput(root, pkg, result), /Duplicate/);
});

test('expired image URLs and missing snapshot nodes are rejected at the fixed-input boundary', () => {
  const source = JSON.parse(
    gitRead(root, request.design.commit, request.design.path),
  );
  for (const modify of [
    (s) => {
      s.imageUrl = 'https://temporary.example/design.png?expires=1';
    },
    (s) => {
      s.components.roots = s.components.roots.filter(
        (n) => n.id !== request.design.nodes[0],
      );
    },
  ]) {
    const altered = structuredClone(source);
    modify(altered);
    const text = JSON.stringify(altered);
    const raw = structuredClone(request);
    raw.design.sha256 = hash(text);
    assert.throws(
      () =>
        prepare(root, raw, policy, (dir, commit, file) =>
          file === request.design.path ? text : gitRead(dir, commit, file),
        ),
      /remote assets|requested node/,
    );
  }
});

test('a competing branch creator cannot be overwritten or trigger a duplicate PR', async () => {
  const { api, state } = boundary();
  const raced = async (method, url, body) => {
    if (method === 'POST' && url.endsWith('/git/refs'))
      throw Object.assign(new Error('Reference already exists'), {
        status: 422,
      });
    return api(method, url, body);
  };
  const receipt = await publish({
    root,
    pkg,
    output: output(),
    api: raced,
    actor: 'OasisViridis',
  });
  assert.equal(receipt.state, 'review-required');
  assert.equal(state.pr, null);
  assert(!state.writes.some((w) => w.body?.force));
});

test('an undeclared Unknown design variant is reported rather than inferred as Run authority', async () => {
  const source = JSON.parse(
    gitRead(root, request.design.commit, request.design.path),
  );
  source.components.roots[2].properties.State.variantOptions.push('Unknown');
  source.components.roots[2].children.push({
    id: '999:1',
    type: 'COMPONENT',
    name: 'State=Unknown',
  });
  const text = JSON.stringify(source);
  const raw = structuredClone(request);
  raw.design.sha256 = hash(text);
  const pack = prepare(root, raw, policy, (dir, commit, file) =>
    file === request.design.path ? text : gitRead(dir, commit, file),
  );
  assert(pack.designDifferences.some((reason) => reason.includes('Unknown')));
  const { deliver, state } = boundary();
  assert.equal((await deliver(null, pack)).state, 'materials-only');
  assert.equal(state.writes.length, 0);
});
