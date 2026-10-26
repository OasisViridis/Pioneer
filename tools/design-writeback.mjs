import {
  canonical,
  metadata,
  hash,
  repository,
  requestSchema,
  qualityJobsPassed,
  fail,
} from './design-delivery.mjs';

// GET only. Preparing a reviewable list grants no Figma write/merge authority.
export async function planWriteback(api, number, featureId, policy) {
  if (
    !Number.isSafeInteger(number) ||
    number < 1 ||
    !Object.hasOwn(policy.features, featureId)
  )
    fail('invalid-input', 'Known PR and registered feature required');
  const prefix = `/repos/${repository}`;
  const pr = await api('GET', `${prefix}/pulls/${number}`);
  if (
    !pr.merged ||
    pr.base.ref !== 'main' ||
    pr.base.repo.full_name !== repository ||
    !/^[a-f0-9]{40}$/.test(pr.merge_commit_sha ?? '')
  ) {
    return { state: 'awaiting-merge', retryable: true, resources: [] };
  }
  const commit = pr.merge_commit_sha;
  const file = `design/deliveries/${featureId}/package.json`;
  const content = await api('GET', `${prefix}/contents/${file}?ref=${commit}`);
  if (content.encoding !== 'base64')
    fail('missing-input', 'Fixed delivery package unavailable');
  const pkg = JSON.parse(
    Buffer.from(content.content, 'base64').toString('utf8'),
  );
  const { packageHash, outputHash, files, ...frozen } = pkg;
  if (typeof outputHash !== 'string' || !Array.isArray(files))
    fail('invalid-input', 'Published delivery metadata missing');
  if (hash(canonical(frozen)) !== packageHash)
    fail('invalid-input', 'Delivery package hash mismatch');
  const proof = metadata(pr.body);
  if (
    pr.head.ref !== `codex/design-${featureId}` ||
    pr.head.repo?.full_name !== repository ||
    proof?.featureId !== featureId ||
    proof.packageHash !== packageHash ||
    proof.outputHash !== outputHash ||
    proof.issue !== pkg.request.issue
  )
    fail(
      'invalid-input',
      'PR is not the delivery associated with this package',
    );
  const request = requestSchema.parse(pkg.request);
  const feature = policy.features[featureId];
  if (
    request.featureId !== featureId ||
    request.issue !== feature.issue ||
    request.design.fileKey !== feature.fileKey ||
    request.design.nodes.some((id) => !feature.nodes.includes(id)) ||
    new Set(request.design.nodes).size !== request.design.nodes.length
  )
    fail('invalid-input', 'Delivery package outside reviewed scope');
  const result = await api(
    'GET',
    `${prefix}/actions/workflows/quality.yml/runs?head_sha=${commit}&per_page=100`,
  );
  const run = result.workflow_runs
    .filter(
      (item) =>
        item.head_sha === commit &&
        item.head_branch === 'main' &&
        ['push', 'workflow_dispatch'].includes(item.event),
    )
    .sort((a, b) => b.id - a.id)[0];
  if (!run || run.status !== 'completed' || run.conclusion !== 'success')
    return {
      state: 'merge-validation-pending',
      commit,
      resources: [],
      retryable: true,
    };
  const { jobs } = await api(
    'GET',
    `${prefix}/actions/runs/${run.id}/jobs?per_page=100`,
  );
  if (!qualityJobsPassed(jobs))
    return {
      state: 'merge-validation-incomplete',
      commit,
      resources: [],
      retryable: true,
    };
  // Re-read before exposing a plan. No comments, issue state, or Figma status changes.
  const current = await api('GET', `${prefix}/pulls/${number}`);
  if (
    !current.merged ||
    current.merge_commit_sha !== commit ||
    current.head.sha !== pr.head.sha
  )
    return { state: 'stale-validation', resources: [], retryable: true };
  const base = `https://github.com/${repository}`;
  const links = {
    issue: `${base}/issues/${request.issue}`,
    pr: `${base}/pull/${number}`,
    commit: `${base}/commit/${commit}`,
    ci: `${base}/actions/runs/${run.id}`,
    package: `${base}/blob/${commit}/${file}`,
  };
  return {
    state: 'writeback-blocked',
    retryable: true,
    commit,
    packageHash,
    links,
    blockers: [
      'Figma Dev Resources scoped credential and write authorization not verified',
      'Code Connect publish entitlement not verified',
      'Human acceptance URL for this commit is still required',
    ],
    resources: request.design.nodes.flatMap((node_id) =>
      Object.entries(links).map(([kind, url]) => ({
        file_key: request.design.fileKey,
        node_id,
        name: `Pioneer ${featureId} ${commit.slice(0, 12)} ${kind}`,
        url,
      })),
    ),
    manualAcceptance: 'pending',
    realProviderAcceptance: 'pending',
  };
}
