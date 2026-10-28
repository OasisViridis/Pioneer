import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  canonical,
  hash,
  fail,
  metadata,
  repository,
  requestSchema,
  prepare,
} from './design-delivery.mjs';

const prefix = `/repos/${repository}`;
const secretHash = (s) => createHash('sha256').update(s).digest();

// A replay may observe a newer main, but must not change an already reviewed input.
export async function persistEventMaterial(directory, result) {
  const { snapshotText, ...material } = result;
  if (
    !/^[a-f0-9]{64}$/.test(material.eventKey) ||
    !/^[a-f0-9]{40}$/.test(material.baseSha) ||
    typeof snapshotText !== 'string' ||
    hash(snapshotText) !== material.snapshotSha256
  )
    fail('invalid-input', 'Invalid event material');
  await mkdir(directory, { recursive: true });
  const lock = path.join(directory, `${material.eventKey}.lock`);
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code === 'EEXIST')
      fail(
        'review-required',
        'Event material is being written or needs recovery',
      );
    throw error;
  }
  try {
    const snapshotPath = path.join(
      directory,
      `${material.eventKey}.snapshot.json`,
    );
    const materialPath = path.join(
      directory,
      `${material.eventKey}.material.json`,
    );
    const readOptional = async (file) => {
      try {
        return await readFile(file, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    };
    const [existingSnapshot, existingText] = await Promise.all([
      readOptional(snapshotPath),
      readOptional(materialPath),
    ]);
    if (existingSnapshot === null && existingText === null) {
      await writeFile(snapshotPath, snapshotText, { mode: 0o600, flag: 'wx' });
      await writeFile(materialPath, JSON.stringify(material, null, 2) + '\n', {
        mode: 0o600,
        flag: 'wx',
      });
      return material;
    }
    let existing;
    try {
      existing = JSON.parse(existingText);
    } catch {
      fail(
        'review-required',
        'Existing event material is incomplete or invalid',
      );
    }
    if (
      existingSnapshot !== snapshotText ||
      !/^[a-f0-9]{40}$/.test(existing?.baseSha) ||
      canonical({ ...existing, baseSha: null }) !==
        canonical({ ...material, baseSha: null })
    )
      fail(
        'review-required',
        'Existing event material differs; preserve and review it',
      );
    return existing;
  } finally {
    await rmdir(lock);
  }
}

async function versions(figma, file) {
  const path = `/v1/files/${file}/versions`;
  let next = path;
  const seen = new Set();
  const result = [];
  while (next) {
    if (seen.has(next) || seen.size >= 50)
      fail('review-required', 'Version pagination is incomplete');
    seen.add(next);
    const response = await figma('GET', next);
    if (!Array.isArray(response.versions))
      fail('invalid-input', 'Malformed version history');
    result.push(...response.versions);
    next = response.pagination?.next_page;
    if (next) {
      const url = new URL(next, 'https://api.figma.com');
      if (
        url.origin !== 'https://api.figma.com' ||
        url.pathname !== path ||
        url.username ||
        url.password ||
        url.hash
      )
        fail('invalid-input', 'Untrusted pagination URL');
      next = url.pathname + url.search;
    }
  }
  return result;
}

// Only retain design data needed by S2, never remote assets, user identities or commands.
function projectNode(node, budget) {
  if (++budget.count > 10_000)
    fail('review-required', 'Design subtree exceeds review budget');
  if (!node || typeof node.id !== 'string' || typeof node.type !== 'string')
    fail('invalid-input', 'Invalid design node');
  const result = { id: node.id, type: node.type, name: node.name };
  for (const field of [
    'characters',
    'absoluteBoundingBox',
    'layoutMode',
    'itemSpacing',
    'paddingLeft',
    'paddingRight',
    'paddingTop',
    'paddingBottom',
  ])
    if (node[field] !== undefined) result[field] = node[field];
  if (node.componentPropertyDefinitions)
    result.properties = node.componentPropertyDefinitions;
  if (node.children)
    result.children = node.children.map((child) => projectNode(child, budget));
  return result;
}

export async function inspectEvent({
  event,
  config,
  policy,
  passcode,
  figma,
  github,
}) {
  if (config?.enabled !== true)
    return { state: 'event-disabled', retryable: false };
  if (
    typeof passcode !== 'string' ||
    passcode.length < 16 ||
    typeof event?.passcode !== 'string' ||
    !timingSafeEqual(secretHash(passcode), secretHash(event.passcode))
  )
    fail('permission-denied', 'Webhook authentication failed');
  if (
    !config.webhookId ||
    String(event.webhook_id) !== String(config.webhookId)
  )
    fail('permission-denied', 'Webhook identity mismatch');
  if (event.event_type === 'PING')
    return { state: 'ignored-ping', retryable: false };
  if (event.event_type !== 'FILE_VERSION_UPDATE')
    return { state: 'ignored-event-type', retryable: false };
  if (
    ['nodes', 'node_ids', 'featureId', 'issue', 'command', 'prompt'].some((k) =>
      Object.hasOwn(event, k),
    )
  )
    fail('invalid-input', 'Event may not override trusted routing');
  const routes =
    config.routes?.filter(
      (r) =>
        r.label === event.label &&
        policy.features[r.featureId]?.fileKey === event.file_key,
    ) ?? [];
  if (routes.length !== 1)
    fail('invalid-input', 'File or release label is outside the registry');
  const route = routes[0];
  const feature = policy.features[route.featureId];
  if (
    !/^[a-z][a-z0-9-]{2,60}$/.test(route.featureId) ||
    !/^[a-zA-Z0-9]+$/.test(feature.fileKey) ||
    !Array.isArray(route.nodes) ||
    !route.nodes.length ||
    new Set(route.nodes).size !== route.nodes.length ||
    route.nodes.some(
      (id) => !/^\d+:\d+$/.test(id) || !feature.nodes.includes(id),
    ) ||
    !feature.changeTypes.includes(route.changeType) ||
    !Array.isArray(route.behaviorChanges)
  )
    fail('invalid-input', 'Unreviewed route configuration');
  if (
    typeof event.version_id !== 'string' ||
    !/^[a-zA-Z0-9_-]+$/.test(event.version_id)
  )
    fail('invalid-input', 'Missing fixed version');
  const history = await versions(figma, feature.fileKey);
  const releases = history.filter((v) => v.label === route.label);
  if (
    !releases.length ||
    releases.some((v) => !Number.isFinite(Date.parse(v.created_at)))
  )
    fail('missing-input', 'Release history unavailable');
  releases.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  if (releases[1] && releases[1].created_at === releases[0].created_at)
    fail('review-required', 'Ambiguous release ordering');
  if (!releases.some((v) => v.id === event.version_id))
    fail('invalid-input', 'Event version/label not confirmed by Figma');
  if (releases[0].id !== event.version_id)
    return { state: 'ignored-old-version', retryable: false };
  const branch = `codex/design-${route.featureId}`;
  const prs = await github(
    'GET',
    `${prefix}/pulls?state=all&head=OasisViridis:${branch}&per_page=100`,
  );
  if (
    !Array.isArray(prs) ||
    prs.length >= 100 ||
    prs.filter((p) => p.state === 'open').length > 1
  )
    fail('review-required', 'Ambiguous delivery history');
  for (const pr of prs) {
    const proof = metadata(pr.body);
    if (proof?.featureId !== route.featureId || proof.issue !== feature.issue)
      fail('review-required', 'Delivery slot has unrelated history');
    const stored = await github(
      'GET',
      `${prefix}/contents/design/deliveries/${route.featureId}/package.json?ref=${pr.head.sha}`,
    );
    if (stored.encoding !== 'base64')
      fail('missing-input', 'Delivery package unavailable');
    const pkg = JSON.parse(
      Buffer.from(stored.content, 'base64').toString('utf8'),
    );
    if (
      pkg.request?.design?.version === event.version_id &&
      pkg.request.design.fileKey === feature.fileKey
    )
      return {
        state: 'existing-delivery',
        retryable: false,
        pr: pr.html_url,
        headSha: pr.head.sha,
      };
    if (pr.state === 'open')
      return { state: 'review-required', retryable: false, pr: pr.html_url };
  }
  const query = new URLSearchParams({
    ids: route.nodes.join(','),
    version: event.version_id,
  });
  const source = await figma(
    'GET',
    `/v1/files/${feature.fileKey}/nodes?${query}`,
  );
  if (source.version !== event.version_id)
    fail('invalid-input', 'Fixed version read mismatch');
  const budget = { count: 0 };
  const nodes = route.nodes.map((id) => {
    const node = source.nodes?.[id]?.document;
    if (node?.id !== id)
      fail('missing-input', 'Required node missing from fixed version');
    return projectNode(node, budget);
  });
  const base = await github('GET', `${prefix}/git/ref/heads/main`);
  if (!/^[a-f0-9]{40}$/.test(base.object?.sha))
    fail('missing-input', 'Accepted main unavailable');
  const snapshot = {
    schemaVersion: 1,
    kind: 'version',
    fileKey: feature.fileKey,
    historicalVersionId: event.version_id,
    historicalLabel: route.label,
    scope:
      'Selected node structure; excludes image bytes, vectors and external asset URLs. Not pixel reconstruction.',
    nodes,
  };
  const eventKey = hash(
    canonical({
      featureId: route.featureId,
      fileKey: feature.fileKey,
      version: event.version_id,
      nodes: [...route.nodes].sort(),
    }),
  );
  const snapshotText = JSON.stringify(snapshot, null, 2) + '\n';
  return {
    state: 'awaiting-local-agent',
    retryable: false,
    eventKey,
    featureId: route.featureId,
    issue: feature.issue,
    baseSha: base.object.sha,
    changeType: route.changeType,
    behaviorChanges: route.behaviorChanges,
    fileKey: feature.fileKey,
    nodes: route.nodes,
    version: event.version_id,
    snapshotPath: `design/delivery/events/${eventKey}.json`,
    snapshotSha256: hash(snapshotText),
    snapshotText,
    automation: 'not-deployed',
  };
}

// After a local agent reviews and commits the snapshot, reuse the real S2 validator.
export function eventRequest(root, material, snapshotCommit, policy) {
  const request = requestSchema.parse({
    schemaVersion: 1,
    featureId: material.featureId,
    issue: material.issue,
    changeType: material.changeType,
    baseSha: material.baseSha,
    behaviorChanges: material.behaviorChanges,
    design: {
      commit: snapshotCommit,
      path: material.snapshotPath,
      sha256: material.snapshotSha256,
      kind: 'version',
      version: material.version,
      fileKey: material.fileKey,
      nodes: material.nodes,
    },
  });
  prepare(root, request, policy);
  return request;
}
