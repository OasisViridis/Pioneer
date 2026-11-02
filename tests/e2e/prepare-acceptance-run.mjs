/**
 * Starts a packaged acceptance run: clears the previous evidence directory, the
 * previous package output and then records the run's own start time before the
 * package is rebuilt. The spec refuses an executable that predates the marker,
 * so an artifact carried over from an earlier build cannot pass as this run's
 * proof.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repositoryRoot = process.cwd();
const acceptanceRoot = path.join(repositoryRoot, 'tmp', 'issue53-acceptance');
const runPath = path.join(acceptanceRoot, 'run.json');
const packagedOutput = path.join(repositoryRoot, 'apps', 'desktop', 'out');

rmSync(path.join(acceptanceRoot, 'latest'), { recursive: true, force: true });
// Regenerable build output: removing it means the later assertion "the exe
// exists" proves this run packaged it, not that an old file survived.
rmSync(packagedOutput, { recursive: true, force: true });
mkdirSync(acceptanceRoot, { recursive: true });

let commit = null;
let dirty = null;
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf-8',
  }).trim();
  dirty =
    execFileSync('git', ['status', '--porcelain'], {
      cwd: repositoryRoot,
      encoding: 'utf-8',
    }).trim().length > 0;
} catch {
  // Keep nulls: the report must not claim a clean worktree git never saw.
}

const run = {
  kind: 'pioneer-packaged-acceptance-run',
  startedAt: new Date().toISOString(),
  commit,
  dirty,
};
const temporaryRunPath = `${runPath}.tmp`;
writeFileSync(temporaryRunPath, `${JSON.stringify(run, null, 2)}\n`, 'utf-8');
renameSync(temporaryRunPath, runPath);
console.log(
  `[acceptance] cleared previous evidence and package output; run started at ${run.startedAt}`,
);
