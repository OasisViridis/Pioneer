import { canonical, hash, fail, repository } from './design-delivery.mjs';
import { planWriteback } from './design-writeback.mjs';
import { remoteFailure } from './design-remote.mjs';

const key = (r) => `${r.file_key}/${r.node_id}/${r.url}`;

// Fresh GitHub evidence is mandatory; never trust an editable saved resource list.
export async function writeback({
  github,
  figma,
  number,
  featureId,
  policy,
  approval,
  apply = false,
}) {
  const plan = await planWriteback(github, number, featureId, policy);
  if (!plan.resources.length) return plan;
  if (
    approval?.commit !== plan.commit ||
    approval?.pr !== number ||
    approval?.featureId !== featureId
  )
    fail(
      'invalid-input',
      'Approval must bind this PR, feature and merge commit',
    );
  let url;
  try {
    url = new URL(approval.acceptanceUrl);
  } catch {
    fail('invalid-input', 'Acceptance URL is required');
  }
  if (
    url.origin !== 'https://github.com' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith(`/${repository}/blob/${plan.commit}/docs/`) ||
    !url.pathname.endsWith('.md')
  )
    fail(
      'invalid-input',
      'Acceptance must be a document fixed to the merge commit',
    );
  // Existence is not an automatic human-acceptance claim; the approval is explicit.
  const acceptancePath = url.pathname.split(`/blob/${plan.commit}/`)[1];
  const acceptance = await github(
    'GET',
    `/repos/${repository}/contents/${acceptancePath}?ref=${plan.commit}`,
  );
  if (acceptance?.type !== 'file' || acceptance.encoding !== 'base64')
    fail('missing-input', 'Fixed acceptance document is unavailable');
  const resources = [...plan.resources];
  for (const { file_key, node_id } of plan.resources.filter(
    (r) => r.url === plan.links.pr,
  ))
    resources.push({
      file_key,
      node_id,
      name: `Pioneer ${featureId} ${plan.commit.slice(0, 12)} acceptance`,
      url: url.href,
    });
  const receipt = {
    commit: plan.commit,
    pr: number,
    featureId,
    acceptanceUrl: url.href,
    codeConnect: 'pending-separate-publication',
    manualAcceptance: 'linked-not-independently-verified',
    realProviderAcceptance: 'not-assessed',
  };
  if (!apply || approval.approved !== true)
    return {
      ...receipt,
      state: 'writeback-preview',
      resources,
      retryable: false,
    };

  const read = async () => {
    const found = [];
    for (const file of new Set(resources.map((r) => r.file_key))) {
      const nodes = [
        ...new Set(
          resources.filter((r) => r.file_key === file).map((r) => r.node_id),
        ),
      ];
      const response = await figma(
        'GET',
        `/v1/files/${file}/dev_resources?node_ids=${encodeURIComponent(nodes.join(','))}`,
      );
      if (
        !Array.isArray(response.dev_resources) ||
        response.dev_resources.some(
          (r) =>
            r.file_key !== file ||
            !nodes.includes(r.node_id) ||
            typeof r.url !== 'string',
        )
      )
        fail('invalid-input', 'Malformed Dev Resources readback');
      found.push(...response.dev_resources);
    }
    return found;
  };
  const missing = (found) =>
    resources.filter((r) => !found.some((f) => key(f) === key(r)));
  let found;
  try {
    found = await read();
  } catch (error) {
    return {
      ...receipt,
      ...remoteFailure(error),
      retryable: true,
      phase: 'preflight',
    };
  }
  const pending = missing(found);
  if (!pending.length)
    return {
      ...receipt,
      state: 'links-verified',
      retryable: false,
      created: 0,
    };
  // Never delete existing human links to make room. Figma caps each node at ten.
  for (const r of pending) {
    const atNode = (item) =>
      item.file_key === r.file_key && item.node_id === r.node_id;
    if (found.filter(atNode).length + pending.filter(atNode).length > 10)
      return {
        ...receipt,
        state: 'capacity-blocked',
        retryable: false,
        missing: pending,
      };
  }
  const latest = await planWriteback(github, number, featureId, policy);
  if (
    latest.commit !== plan.commit ||
    hash(canonical(latest.resources)) !== hash(canonical(plan.resources))
  )
    return { ...receipt, state: 'stale-validation', retryable: true };
  let failure;
  try {
    const response = await figma('POST', '/v1/dev_resources', {
      dev_resources: pending,
    });
    if (
      !Array.isArray(response.links_created) ||
      !Array.isArray(response.errors) ||
      response.errors.length
    )
      failure = { state: 'partial-write', status: null };
  } catch (error) {
    failure = remoteFailure(error);
  }
  // A 200 can be partial; a timeout can have committed. Read before any retry.
  try {
    found = await read();
  } catch (error) {
    return {
      ...receipt,
      ...remoteFailure(error),
      retryable: true,
      phase: 'readback',
      writeOutcome: 'unknown',
    };
  }
  const remaining = missing(found);
  return remaining.length
    ? {
        ...receipt,
        state: failure?.state ?? 'writeback-incomplete',
        retryable: true,
        failure,
        missing: remaining,
      }
    : {
        ...receipt,
        state: 'links-verified',
        retryable: false,
        confirmed: resources.length,
        attempted: pending.length,
      };
}
