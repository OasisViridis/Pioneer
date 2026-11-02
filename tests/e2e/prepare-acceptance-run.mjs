/**
 * Starts a packaged acceptance run: clears the previous evidence directory and
 * records the run's own start time before the package is rebuilt. The spec
 * compares that timestamp with the executable's mtime, so an artifact carried
 * over from an earlier build cannot pass as this run's proof.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repositoryRoot = process.cwd();
const acceptanceRoot = path.join(repositoryRoot, 'tmp', 'issue53-acceptance');
const runPath = path.join(acceptanceRoot, 'run.json');

rmSync(path.join(acceptanceRoot, 'latest'), { recursive: true, force: true });
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
writeFileSync(runPath, `${JSON.stringify(run, null, 2)}\n`, 'utf-8');
console.log(
  `[acceptance] previous evidence cleared; run started at ${run.startedAt}`,
);
