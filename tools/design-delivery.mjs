import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { format } from 'prettier';

const require = createRequire(
  new URL('../apps/desktop/package.json', import.meta.url),
);
const { z } = require('zod');
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const relative = z
  .string()
  .regex(/^[a-zA-Z0-9_.\-/]+$/)
  .refine(
    (p) =>
      !p.startsWith('/') &&
      !p.split('/').some((v) => !v || v === '.' || v === '..' || v === '.git'),
  );
export const requestSchema = z
  .object({
    schemaVersion: z.literal(1),
    featureId: z.string().regex(/^[a-z][a-z0-9-]{2,60}$/),
    issue: z.number().int().positive(),
    changeType: z.enum(['tokens', 'ui', 'infrastructure', 'behavior']),
    baseSha: sha,
    design: z
      .object({
        commit: sha,
        path: relative,
        sha256: digest,
        kind: z.enum(['snapshot-only', 'version']),
        version: z.string().min(1).nullable(),
        fileKey: z.string().regex(/^[a-zA-Z0-9]+$/),
        nodes: z.array(z.string().regex(/^\d+:\d+$/)).min(1),
      })
      .strict(),
    behaviorChanges: z.array(
      z.enum([
        'authorization',
        'external-send',
        'write',
        'command',
        'stop',
        'unknown-run-state',
      ]),
    ),
  })
  .strict();
const resultSchema = z
  .object({
    packageHash: digest,
    baseSha: sha,
    status: z.enum(['completed', 'failed']),
    files: z
      .array(
        z
          .object({
            path: relative,
            content: z.string().max(2_000_000),
            beforeSha256: digest.nullable(),
          })
          .strict(),
      )
      .max(80),
    model: z.string().regex(/^[a-zA-Z0-9 ._/-]{1,80}$/),
    cost: z.number().nonnegative().nullable(),
    manualInterventions: z.number().int().nonnegative(),
  })
  .strict();
export const repository = 'OasisViridis/Pioneer';
const prefix = `/repos/${repository}`;
const metadataStart = '<!-- pioneer-design-delivery\n';
const metadataEnd = '\n-->';
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export function fail(state, detail) {
  throw Object.assign(new Error(detail), { state });
}
export function gitRead(root, commit, file) {
  sha.parse(commit);
  relative.parse(file);
  return execFileSync('git', ['show', `${commit}:${file}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 4_000_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function readOptional(root, commit, file) {
  const entries = execFileSync('git', ['ls-tree', commit, '--', file], {
    cwd: root,
    encoding: 'utf8',
  });
  if (!entries) return null;
  if (!entries.startsWith('100644 '))
    fail('invalid-input', 'Symlinks and submodules are not delivery inputs');
  return gitRead(root, commit, file);
}
function safeContent(content) {
  if (
    /https?:\/\/(?!www\.figma\.com\/|github\.com\/|developers\.figma\.com\/)[^\s"<>]+|(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]+|sk-(?:proj-)?[A-Za-z0-9_-]{20,})/i.test(
      content,
    )
  )
    fail(
      'invalid-input',
      'Design snapshots must contain fixed content, not remote assets or credentials',
    );
}
export function prepare(root, raw, policy, read = gitRead) {
  const request = requestSchema.parse(raw);
  const feature = policy.features[request.featureId];
  if (
    !feature ||
    feature.issue !== request.issue ||
    feature.fileKey !== request.design.fileKey ||
    !feature.changeTypes.includes(request.changeType)
  )
    fail(
      'invalid-input',
      'Feature/Issue/file/change-type is outside the reviewed registry',
    );
  if (
    request.design.nodes.length !== new Set(request.design.nodes).size ||
    request.design.nodes.some((id) => !feature.nodes.includes(id))
  )
    fail('invalid-input', 'Duplicate or out-of-scope design node');
  const source = read(root, request.design.commit, request.design.path);
  if (hash(source) !== request.design.sha256)
    fail('invalid-input', 'Snapshot hash mismatch');
  safeContent(source);
  const snapshot = JSON.parse(source);
  if (
    snapshot.fileKey !== request.design.fileKey ||
    snapshot.kind !== request.design.kind ||
    (request.design.kind === 'snapshot-only'
      ? request.design.version !== null
      : !request.design.version ||
        snapshot.historicalVersionId !== request.design.version)
  )
    fail(
      'invalid-input',
      'Missing/mismatched design version; never relabel a live capture',
    );
  const nodes = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (request.design.nodes.includes(value.id)) nodes.push(value);
    for (const child of Object.values(value)) visit(child);
  };
  visit(snapshot);
  if (nodes.length !== request.design.nodes.length)
    fail(
      'missing-input',
      'Snapshot does not contain each requested node exactly once',
    );
  const mappings = JSON.parse(
    read(root, request.baseSha, 'design/sync/component-mappings.json'),
  );
  if (!mappings.complete) fail('missing-input', 'S1 mappings are not complete');
  const components = request.design.nodes.map((id) => {
    const mapping = mappings.components.find((c) => c.designNode === id);
    if (!mapping || mapping.status !== 'mapped')
      fail('missing-input', `No accepted mapping for ${id}`);
    const source = read(root, request.baseSha, mapping.code.path);
    const blob = createHash('sha1')
      .update(`blob ${Buffer.byteLength(source)}\0`)
      .update(source)
      .digest('hex');
    if (blob !== mapping.code.blob)
      fail('stale-input', 'Mapping source changed; review S1 mapping first');
    return {
      ...mapping,
      acceptedAt: request.baseSha,
      actualSourceSha256: hash(read(root, request.baseSha, mapping.code.path)),
    };
  });
  const designDifferences = nodes.flatMap((node) => {
    const mapping = components.find((item) => item.designNode === node.id);
    const differences = [];
    if (canonical(node.properties) !== canonical(mapping.designProperties))
      differences.push(
        `${node.id}: design properties changed; review mapping and behavior decisions`,
      );
    const variants = (node.children ?? [])
      .filter((child) => child.type === 'COMPONENT')
      .map((child) => child.name)
      .sort();
    if (
      canonical(variants) !==
      canonical(mapping.variants.map((variant) => variant.name).sort())
    )
      differences.push(
        `${node.id}: unmapped variant, including possible Unknown Run semantics`,
      );
    return differences;
  });
  const basis = feature.basis.map((file) => ({
    path: file,
    commit: request.baseSha,
    sha256: hash(read(root, request.baseSha, file)),
  }));
  const frozen = {
    schemaVersion: 1,
    request,
    nodes,
    components,
    designDifferences,
    basis,
    policy: feature,
    constraints: [
      'Design is visual evidence, not behavioral authority.',
      'Preserve retained S1 differences; no inferred Grant, stop or Unknown state.',
      'No automatic merge, issue edits, Figma writeback or real Provider execution.',
    ],
  };
  return { ...frozen, packageHash: hash(canonical(frozen)) };
}
export function validateOutput(root, pkg, raw) {
  const result = resultSchema.parse(raw);
  if (result.status !== 'completed')
    fail('agent-failed', 'Agent failed; no publication');
  if (
    result.packageHash !== pkg.packageHash ||
    result.baseSha !== pkg.request.baseSha
  )
    fail(
      'stale-output',
      'Agent output belongs to a different design or code revision',
    );
  if (!result.files.length) fail('empty-output', 'No implementation diff');
  const seen = new Set();
  for (const file of result.files) {
    if (seen.has(file.path)) fail('invalid-input', 'Duplicate output path');
    seen.add(file.path);
    if (
      !pkg.policy.allowedPaths.some((p) =>
        p.endsWith('/') ? file.path.startsWith(p) : p === file.path,
      ) ||
      /^(apps\/desktop\/src\/(main|preload|shared)\/|design\/deliveries\/|\.env|\.githooks\/)/.test(
        file.path,
      )
    )
      fail('behavior-conflict', `Unapproved output path: ${file.path}`);
    const original = readOptional(root, result.baseSha, file.path);
    if ((original === null ? null : hash(original)) !== file.beforeSha256)
      fail('stale-output', `Base content mismatch: ${file.path}`);
    if (original === file.content)
      fail('empty-output', `Unchanged output file: ${file.path}`);
    if (
      /gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-proj-[A-Za-z0-9_-]{30,}/.test(
        file.content,
      )
    )
      fail('invalid-input', 'Possible credential in agent output');
  }
  return result;
}
function metadata(body) {
  const start = body?.indexOf(metadataStart) ?? -1;
  if (start < 0) return null;
  const end = body.indexOf(metadataEnd, start + metadataStart.length);
  try {
    return JSON.parse(body.slice(start + metadataStart.length, end));
  } catch {
    return null;
  }
}
export function classify(error) {
  if (error.state) return error.state;
  if (error.name === 'ZodError' || error instanceof SyntaxError)
    return 'invalid-input';
  if (
    error.code === 'ENOENT' ||
    /does not exist in|exists on disk, but not in|invalid object name/.test(
      error.message,
    )
  )
    return 'missing-input';
  if (error.status === 429 || /rate limit/i.test(error.message))
    return 'rate-limited';
  if ([401, 403].includes(error.status)) return 'permission-denied';
  if (error.status === 404) return 'missing-input';
  if (error.status === 409 || error.status === 422) return 'review-required';
  return 'retryable-error';
}
async function optional(api, url) {
  try {
    return await api('GET', url);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}
export async function gate(pkg, api, actor) {
  const issue = await api('GET', `${prefix}/issues/${pkg.request.issue}`);
  if (issue.pull_request || issue.state !== 'open')
    return ['Existing target is not an open Issue'];
  if (!Number.isInteger(issue.issue_dependencies_summary?.blocked_by))
    fail(
      'missing-input',
      'Native dependency status unavailable; do not assume unblocked',
    );
  const reasons = [...pkg.designDifferences];
  const main = await api('GET', `${prefix}/git/ref/heads/main`);
  if (main.object.sha !== pkg.request.baseSha)
    reasons.push('Accepted main changed; re-prepare before implementation');
  if (issue.issue_dependencies_summary.blocked_by > 0)
    reasons.push('Original Issue still has open dependencies');
  if (issue.assignees?.some((a) => a.login !== actor))
    reasons.push('Another delivery owner is assigned');
  if (
    pkg.request.behaviorChanges.length ||
    pkg.request.changeType === 'behavior'
  )
    reasons.push(
      `Behavior decisions required: ${pkg.request.behaviorChanges.join(', ') || 'unspecified behavior'}`,
    );
  // Explicitly retain textual dependency fallbacks used by the repository.
  const fallback = issue.body?.match(/^Blocked by:\s*(.+)$/im)?.[1];
  for (const number of fallback?.matchAll(/#(\d+)/g) ?? []) {
    const dependency = await api('GET', `${prefix}/issues/${number[1]}`);
    if (dependency.state !== 'closed')
      reasons.push(`Open dependency #${number[1]}`);
  }
  return reasons;
}
export async function publish({ root, pkg, output, api, actor }) {
  const started = Date.now();
  const receipt = {
    featureId: pkg.request.featureId,
    issue: pkg.request.issue,
    packageHash: pkg.packageHash,
    retryable: true,
  };
  try {
    const reasons = await gate(pkg, api, actor);
    if (reasons.length) return { ...receipt, state: 'materials-only', reasons };
    const result = validateOutput(root, pkg, output);
    const outputHash = hash(canonical(result.files));
    const branch = `codex/design-${pkg.request.featureId}`;
    const packagePath = `design/deliveries/${pkg.request.featureId}/package.json`;
    // Stable branch + Issue registry is the unique delivery slot, not a second task DB.
    const prs = await api(
      'GET',
      `${prefix}/pulls?state=all&head=OasisViridis:${branch}&per_page=100`,
    );
    if (prs.length >= 100)
      fail('review-required', 'Ambiguous delivery history');
    const active = prs.filter((pr) => pr.state === 'open');
    if (active.length > 1)
      fail('review-required', 'Multiple active delivery PRs');
    if (active.length) {
      const pr = active[0];
      const prior = metadata(pr.body);
      if (
        !prior ||
        prior.featureId !== pkg.request.featureId ||
        prior.issue !== pkg.request.issue
      )
        fail(
          'review-required',
          'Existing branch is not owned by this delivery',
        );
      const unchanged =
        prior.packageHash === pkg.packageHash &&
        prior.outputHash === outputHash;
      return {
        ...receipt,
        state:
          unchanged && prior.headSha === pr.head.sha
            ? 'no-op'
            : 'review-required',
        pr: pr.html_url,
        headSha: pr.head.sha,
        previousPackageHash: prior.packageHash,
        proposedOutputHash: outputHash,
        reasons: unchanged
          ? ['Existing delivery retained; verify the current head separately']
          : [
              'Design/output changed: review the local package and patch; active code and PR text were preserved',
            ],
      };
    }
    if (prs.some((pr) => metadata(pr.body)?.packageHash === pkg.packageHash))
      fail(
        'review-required',
        'This input already has a closed delivery; do not reopen or duplicate it',
      );
    const main = await api('GET', `${prefix}/git/ref/heads/main`);
    if (main.object.sha !== pkg.request.baseSha)
      fail(
        'stale-base',
        'Accepted main advanced; prepare against the new base',
      );
    const manifest = {
      ...pkg,
      outputHash,
      files: result.files.map((f) => ({
        path: f.path,
        sha256: hash(f.content),
      })),
    };
    const manifestText = await format(JSON.stringify(manifest), {
      filepath: packagePath,
    });
    const existing = await optional(api, `${prefix}/git/ref/heads/${branch}`);
    let headSha;
    const message = `chore(design): prepare ${pkg.request.featureId}\n\nDesign-Delivery: ${pkg.packageHash}`;
    if (existing) {
      headSha = existing.object.sha;
      const commit = await api('GET', `${prefix}/git/commits/${headSha}`);
      const stored = await optional(
        api,
        `${prefix}/contents/${packagePath}?ref=${headSha}`,
      );
      if (
        commit.parents.length !== 1 ||
        commit.parents[0].sha !== pkg.request.baseSha ||
        commit.message !== message ||
        !stored?.content ||
        Buffer.from(stored.content, 'base64').toString('utf8') !== manifestText
      )
        fail(
          'review-required',
          'Preserve existing branch commits; cannot prove a recoverable publication',
        );
      // Only a byte-identical tree may resume after a PR creation failure.
      const comparison = await api(
        'GET',
        `${prefix}/compare/${pkg.request.baseSha}...${headSha}`,
      );
      if (
        comparison.files?.length !== result.files.length + 1 ||
        comparison.files.some(
          (f) =>
            f.filename !== packagePath &&
            !result.files.some((x) => x.path === f.filename),
        )
      )
        fail('review-required', 'Existing branch contains other files');
      for (const file of result.files) {
        const remote = await api(
          'GET',
          `${prefix}/contents/${file.path}?ref=${headSha}`,
        );
        if (
          Buffer.from(remote.content ?? '', 'base64').toString('utf8') !==
          file.content
        )
          fail('review-required', 'Existing branch contains human changes');
      }
    } else {
      const base = await api(
        'GET',
        `${prefix}/git/commits/${pkg.request.baseSha}`,
      );
      const tree = await api('POST', `${prefix}/git/trees`, {
        base_tree: base.tree.sha,
        tree: [
          ...result.files.map((f) => ({
            path: f.path,
            mode: '100644',
            type: 'blob',
            content: f.content,
          })),
          {
            path: packagePath,
            mode: '100644',
            type: 'blob',
            content: manifestText,
          },
        ],
      });
      const commit = await api('POST', `${prefix}/git/commits`, {
        message,
        tree: tree.sha,
        parents: [pkg.request.baseSha],
      });
      headSha = commit.sha;
      // Creation is atomic. No ref update, force-push, checkout or working-tree mutation.
      await api('POST', `${prefix}/git/refs`, {
        ref: `refs/heads/${branch}`,
        sha: headSha,
      });
    }
    const proof = {
      featureId: pkg.request.featureId,
      issue: pkg.request.issue,
      packageHash: pkg.packageHash,
      outputHash,
      headSha,
    };
    const body = `${metadataStart}${JSON.stringify(proof)}${metadataEnd}\n\n关联 #${pkg.request.issue}；保持原任务依赖、负责人和状态，由人工审阅后合并。\n\n设计：${pkg.request.design.kind} / ${pkg.request.design.version ?? pkg.request.design.sha256}\n\n节点：${pkg.request.design.nodes.map((id) => `[${id}](https://www.figma.com/design/${pkg.request.design.fileKey}?node-id=${id.replace(':', '-')})`).join('、')}\n\n固定设计包：[package.json](https://github.com/${repository}/blob/${headSha}/${packagePath})\n\n影响：${result.files.map((f) => `\`${f.path}\``).join('、')}\n\n检查：等待 [最终 head ${headSha} 的 Windows CI](https://github.com/${repository}/actions?query=branch%3A${branch})；运行 design:delivery verify 回读，不以旧 SHA 或 PR 创建成功冒充通过。\n\n待办：审阅 Diff 与保留的设计差异；确认 pnpm verify:repository、pnpm check 及真实 Electron 检查通过。模型：${result.model}；费用：${result.cost === null ? '未提供，不估算' : result.cost}；人工介入次数：${result.manualInterventions}。\n`;
    const fresh = await api('GET', `${prefix}/git/ref/heads/${branch}`);
    if (fresh.object.sha !== headSha)
      fail('review-required', 'Branch advanced before PR creation');
    const pr = await api('POST', `${prefix}/pulls`, {
      title: `[S2] ${pkg.request.featureId}：准备设计实现`,
      head: branch,
      base: 'main',
      body,
      draft: true,
    });
    return {
      ...receipt,
      state: 'validation-pending',
      pr: pr.html_url,
      prNumber: pr.number,
      headSha,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ...receipt,
      state: classify(error),
      detail: error.message,
      elapsedMs: Date.now() - started,
    };
  }
}
export async function verify(api, number) {
  const pr = await api('GET', `${prefix}/pulls/${number}`);
  const headSha = pr.head.sha;
  const result = await api(
    'GET',
    `${prefix}/actions/workflows/quality.yml/runs?head_sha=${headSha}&per_page=100`,
  );
  const runs = result.workflow_runs
    .filter(
      (run) =>
        run.head_sha === headSha &&
        run.head_branch === pr.head.ref &&
        ['push', 'pull_request', 'workflow_dispatch'].includes(run.event),
    )
    .sort((a, b) => b.id - a.id);
  const run = runs[0];
  let state = 'validation-not-triggered';
  let jobs = [];
  if (run) {
    if (run.status !== 'completed') state = 'validation-pending';
    else if (run.conclusion !== 'success') state = 'validation-failed';
    else {
      const response = await api(
        'GET',
        `${prefix}/actions/runs/${run.id}/jobs?per_page=100`,
      );
      jobs = response.jobs;
      const gate = jobs.find((job) => job.name === 'Windows / pnpm check');
      const required = [
        'Verify repository normalization',
        'Contract tests',
        'Electron E2E',
        'Package smoke',
        'Confirm aggregate quality and S1 acceptance',
      ];
      state =
        gate?.conclusion === 'success' &&
        required.every((name) =>
          gate.steps?.some(
            (step) => step.name === name && step.conclusion === 'success',
          ),
        )
          ? 'verified'
          : 'validation-incomplete';
    }
  }
  const current = await api('GET', `${prefix}/pulls/${number}`);
  if (current.head.sha !== headSha) state = 'stale-validation';
  return {
    state,
    retryable: state !== 'verified',
    pr: pr.html_url,
    headSha,
    currentHeadSha: current.head.sha,
    runId: run?.id ?? null,
    runUrl: run?.html_url ?? null,
    jobs: jobs.map((job) => ({ name: job.name, conclusion: job.conclusion })),
    checkedAt: new Date().toISOString(),
  };
}
