import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  WILSON_Z,
  signTest,
  wilsonInterval,
} from '../../tools/experiments/lib/stats.mjs';
import {
  REPOSITORY_ROOT,
  cleanup,
  createPilotFixture,
  createTempRoot,
  readJson,
  readJsonl,
  runExperimentCli,
  sha256,
  writeNdjson,
} from './helpers.mjs';

const PROTOCOL_PATH = path.join(
  REPOSITORY_ROOT,
  'docs',
  'experiments',
  'm5a',
  'v1',
  'protocol.json',
);
const PLAN_PATH = path.join(
  REPOSITORY_ROOT,
  'docs',
  'experiments',
  'm5a',
  'v1',
  'analysis-plan.json',
);

function prepare(root) {
  const fixture = createPilotFixture(root);
  const outDir = path.join(root, 'out');
  const build = runExperimentCli('build-dataset.mjs', [
    '--captures',
    fixture.capturesRoot,
    '--tasks',
    fixture.tasksPath,
    '--out',
    outDir,
  ]);
  assert.equal(build.status, 0, build.stderr);
  return { fixture, outDir };
}

function analyzeArgs(outDir, tasksPath, extra = []) {
  return [
    '--dataset',
    path.join(outDir, 'dataset.jsonl'),
    '--tasks',
    tasksPath,
    '--protocol',
    PROTOCOL_PATH,
    '--plan',
    PLAN_PATH,
    '--out',
    outDir,
    ...extra,
  ];
}

test('Wilson 95% interval hits the documented boundaries', () => {
  const zero = wilsonInterval(0, 10);
  assert.ok(zero !== null);
  assert.ok(Math.abs(zero.low - 0) < 1e-12);
  assert.ok(Math.abs(zero.high - 0.2775327998628892) < 1e-9);

  const one = wilsonInterval(10, 10);
  assert.ok(one !== null);
  assert.ok(Math.abs(one.high - 1) < 1e-12);
  assert.ok(Math.abs(one.low - 0.7224672001371108) < 1e-9);

  const half = wilsonInterval(5, 10);
  assert.ok(half !== null);
  assert.ok(Math.abs(half.low - 0.23659309) < 0.0005);
  assert.ok(Math.abs(half.high - 0.76340691) < 0.0005);
  assert.equal(half.center, 0.5);

  assert.equal(wilsonInterval(0, 0), null);
  assert.equal(WILSON_Z, 1.959963984540054);

  const n72 = wilsonInterval(36, 72);
  assert.ok(n72 !== null);
  assert.ok(Math.abs((n72.high - n72.low) / 2 - 0.1125) < 0.001);
});

test('sign test is exact and excludes zero differences', () => {
  const result = signTest([1, -1, -1, 0]);
  assert.equal(result.n, 3);
  assert.equal(result.positive, 1);
  assert.equal(result.negative, 2);
  assert.equal(result.zero, 1);
  assert.equal(result.pValue, 1);
});

test('analyze emits the three denominators, task-level primary and descriptive Wilson', () => {
  const root = createTempRoot();
  try {
    const { fixture, outDir } = prepare(root);
    const result = runExperimentCli(
      'analyze.mjs',
      analyzeArgs(outDir, fixture.tasksPath),
    );
    assert.equal(result.status, 0, result.stderr);

    const summary = readJson(path.join(outDir, 'summary.json'));
    assert.deepEqual(summary.denominator, {
      plannedDenominator: 11,
      executedCount: 9,
      coverage: 0.8182,
    });
    assert.equal(summary.plannedDenominator, 11);
    assert.equal(summary.executedCount, 9);
    assert.equal(summary.completionRate, 0.2727);
    assert.equal(summary.successRateAmongExecuted, 0.3333);
    assert.equal(summary.coverage, 0.8182);
    assert.equal(summary.evidenceKind, 'controlled');

    assert.deepEqual(summary.counts.status, {
      completed: 5,
      failed: 1,
      stopped: 1,
      unknown: 2,
      not_run: 2,
    });
    assert.equal(summary.counts.completedPass, 3);
    assert.equal(summary.counts.completedFail, 2);
    assert.equal(summary.counts.timedOut, 1);
    assert.equal(summary.counts.countsOnlyMeaningfulForCompleted, true);
    assert.equal(summary.counts.verdictCounts.pass, 4);
    assert.equal(summary.counts.completedVerdictCounts.pass, 3);
    assert.equal(summary.counts.completedVerdictCounts.fail, 2);
    assert.equal(summary.counts.completedVerdictCounts.unscorable, 0);
    assert.equal(summary.counts.completedVerdictCounts.not_run, 0);
    assert.equal(summary.counts.notRunReasons.AUTHORIZATION_MISSING, 1);
    assert.equal(summary.counts.notRunReasons.PROVIDER_UNAVAILABLE, 1);

    assert.equal(summary.usageCoverage.reported, 3);
    assert.equal(summary.usageCoverage.missing, 8);
    assert.equal(summary.usageCoverage.inputTokens.count, 3);
    assert.equal(summary.usageCoverage.inputTokens.mean, 67);
    assert.equal(summary.usageCoverage.inputTokens.total, 200);
    assert.equal(summary.usageCoverage.outputTokens.mean, 13);

    assert.equal(summary.duration.count, 7);
    assert.equal(summary.duration.medianMs, 1000);
    assert.equal(summary.duration.p90Ms, 48900);
    assert.equal(summary.duration.excluded.notRun, 2);
    assert.equal(summary.duration.excluded.unknown, 2);

    assert.equal(summary.byVariant.length, 2);
    assert.deepEqual(
      summary.byVariant.map((group) => group.variantId),
      ['fixed-prefix-no-tools', 'pioneer-readonly-tools'],
    );
    assert.ok(summary.byVariantCategory.length >= 2);
    assert.equal(summary.cells.length, 11);

    assert.equal(summary.taskLevel.taskCount, 7);
    assert.equal(summary.taskLevel.summary.meanDifference, -0.25);
    assert.equal(summary.taskLevel.summary.minDifference, -1);
    assert.equal(summary.taskLevel.summary.medianDifference, -0.5);
    assert.equal(summary.taskLevel.summary.maxDifference, 1);
    assert.equal(summary.exploratorySignTest.n, 3);
    assert.equal(summary.exploratorySignTest.positive, 1);
    assert.equal(summary.exploratorySignTest.negative, 2);
    assert.equal(summary.exploratorySignTest.zero, 1);
    assert.equal(summary.exploratorySignTest.pValue, 1);
    assert.equal(summary.exploratorySignTest.label, 'exploratory-only');

    assert.equal(summary.descriptiveAttemptLevel.completedPass, 3);
    assert.ok(summary.descriptiveAttemptLevel.completionRate.wilson95.low > 0);
    assert.match(summary.descriptiveAttemptLevel.caveat, /重复不是独立试验/);
    assert.equal(summary.answersVerification.present, true);
    assert.equal(summary.answersVerification.checked, 5);
    assert.equal(summary.answersVerification.matched, 5);
    assert.equal(summary.answersVerification.mismatched, 0);

    const markdown = fs.readFileSync(path.join(outDir, 'summary.md'), 'utf8');
    assert.match(markdown, /evidenceKind: controlled/);
    assert.match(markdown, /controlled pipeline check, not real model results/);
    assert.match(markdown, /重复不是独立试验/);
    assert.match(markdown, /plannedDenominator/);
    assert.match(
      markdown,
      /非 completed 行的 verdict 只表示该行已有的回答文本能否匹配 rubric，不进入任何比率；主指标只用 completed 且 pass 的行。/,
    );
    assert.match(markdown, /verdictCounts（含全部行/);
  } finally {
    cleanup(root);
  }
});

test('analyze exits non-zero and lists attemptIds when answers disagree', () => {
  const root = createTempRoot();
  try {
    const { fixture, outDir } = prepare(root);
    const answersPath = path.join(outDir, 'answers.ndjson');
    const answers = readJsonl(answersPath);
    const target = answers.find((entry) => entry.attemptId === 'a-0001');
    assert.ok(target !== undefined);
    target.normalizedAnswer = 'nothing to see here';
    target.answerSha256 = sha256(target.normalizedAnswer);
    target.answerBytes = Buffer.byteLength(target.normalizedAnswer);
    writeNdjson(answersPath, answers);

    const result = runExperimentCli(
      'analyze.mjs',
      analyzeArgs(outDir, fixture.tasksPath),
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /answers\.ndjson verification failed/);
    assert.match(result.stderr, /a-0001/);

    const summary = readJson(path.join(outDir, 'summary.json'));
    assert.equal(summary.answersVerification.mismatched, 1);
    assert.deepEqual(summary.answersVerification.mismatchedAttemptIds, [
      'a-0001',
    ]);
    assert.equal(
      summary.answersVerification.details[0].reason,
      'VERDICT_MISMATCH',
    );
    assert.equal(summary.answersVerification.details[0].datasetVerdict, 'pass');
    assert.equal(
      summary.answersVerification.details[0].recomputedVerdict,
      'fail',
    );
  } finally {
    cleanup(root);
  }
});

test('analyze skips the score recheck when answers.ndjson is absent', () => {
  const root = createTempRoot();
  try {
    const { fixture, outDir } = prepare(root);
    fs.rmSync(path.join(outDir, 'answers.ndjson'));
    const result = runExperimentCli(
      'analyze.mjs',
      analyzeArgs(outDir, fixture.tasksPath),
    );
    assert.equal(result.status, 0, result.stderr);
    const summary = readJson(path.join(outDir, 'summary.json'));
    assert.equal(summary.answersVerification.present, false);
    assert.equal(summary.answersVerification.checked, 0);
  } finally {
    cleanup(root);
  }
});

test('analyze requires --tasks instead of silently skipping the recheck', () => {
  const root = createTempRoot();
  try {
    const { outDir } = prepare(root);
    const result = runExperimentCli('analyze.mjs', [
      '--dataset',
      path.join(outDir, 'dataset.jsonl'),
      '--protocol',
      PROTOCOL_PATH,
      '--plan',
      PLAN_PATH,
      '--out',
      outDir,
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing required option --tasks/);
  } finally {
    cleanup(root);
  }
});
