#!/usr/bin/env node
/**
 * analyze.mjs — recompute summary.json / summary.md from a dataset.
 *
 * Usage:
 *   node tools/experiments/analyze.mjs \
 *     --dataset <dataset.jsonl> \
 *     --tasks docs/experiments/m5a/v1/tasks.json \
 *     --protocol docs/experiments/m5a/v1/protocol.json \
 *     --plan docs/experiments/m5a/v1/analysis-plan.json \
 *     --out <output-directory> \
 *     [--answers <answers.ndjson>]
 *
 * When answers.ndjson exists (same directory as the dataset by default) the
 * scorer is re-run on every completed row and any verdict mismatch makes the
 * command exit non-zero after the summary is written.
 */

import fs from 'node:fs';
import path from 'node:path';

import { parseArgs, requiredValue, runCli } from './lib/cli.mjs';
import {
  computeSummary,
  parseAnswersNdjson,
  parseDatasetJsonl,
  renderSummaryMarkdown,
  verifyAnswers,
} from './lib/dataset.mjs';
import {
  findRepositoryRoot,
  frozenFileDifference,
  readFreezeManifest,
} from './lib/manifest.mjs';
import {
  ExperimentError,
  sha256Hex,
  validateTasksDocument,
} from './lib/record.mjs';

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function relativePosix(from, to) {
  return toPosix(path.relative(from, to)) || '.';
}

function repositoryRelative(root, file) {
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return toPosix(relative);
}

/**
 * Analysis-plan step 1: verify the freeze manifest for protocol.json and
 * tasks.json from the protocol directory. Prints every difference and returns
 * false when drift is found.
 */
function verifyFrozenInputs(protocolPath, tasksPath) {
  const protocolDir = path.dirname(protocolPath);
  const manifest = readFreezeManifest(protocolDir);
  const root = findRepositoryRoot(process.cwd());
  if (root === null) {
    throw new ExperimentError(
      'could not locate the repository root; run analyze from the repository root',
    );
  }
  const differences = [];
  for (const [label, file] of [
    ['protocol.json', protocolPath],
    ['tasks.json', tasksPath],
  ]) {
    const relative = repositoryRelative(root, file);
    if (relative === null) {
      differences.push(`${label} is outside the repository`);
      continue;
    }
    const difference = frozenFileDifference(manifest, relative, file);
    if (difference !== null) differences.push(difference);
  }
  if (differences.length > 0) {
    process.stderr.write(
      `experiment:analyze: freeze verification failed: ${differences.length} difference(s)\n`,
    );
    for (const difference of differences) {
      process.stderr.write(`- ${difference}\n`);
    }
    return false;
  }
  return true;
}

/**
 * Analysis-plan step 3: the denominator comes from build-report.json, not from
 * the row count. Both independent totals must agree with the dataset.
 */
function readBuildReport(datasetPath, datasetRowCount) {
  const reportPath = path.join(path.dirname(datasetPath), 'build-report.json');
  if (!fs.existsSync(reportPath)) {
    throw new ExperimentError(
      'build-report.json not found next to dataset.jsonl; rerun build-dataset',
    );
  }
  const buffer = fs.readFileSync(reportPath);
  let report;
  try {
    report = JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ExperimentError(`build-report.json: invalid JSON (${reason})`);
  }
  if (
    report === null ||
    typeof report !== 'object' ||
    !Array.isArray(report.captures)
  ) {
    throw new ExperimentError('build-report.json: expected a captures array');
  }
  let attemptCount = 0;
  let rowCount = 0;
  for (const [index, capture] of report.captures.entries()) {
    if (
      !Number.isSafeInteger(capture.attemptCount) ||
      !Number.isSafeInteger(capture.rowCount)
    ) {
      throw new ExperimentError(
        `build-report.json.captures[${index}]: attemptCount and rowCount must be integers`,
      );
    }
    attemptCount += capture.attemptCount;
    rowCount += capture.rowCount;
  }
  if (attemptCount !== rowCount || rowCount !== datasetRowCount) {
    throw new ExperimentError(
      `build-report.json mismatch: sum(attemptCount)=${attemptCount}, sum(rowCount)=${rowCount}, dataset rows=${datasetRowCount}`,
    );
  }
  return {
    path: relativePosix(process.cwd(), reportPath),
    sha256: sha256Hex(buffer),
    bytes: buffer.byteLength,
    plannedDenominator: attemptCount,
  };
}

function readJsonFile(file, label) {
  const buffer = fs.readFileSync(file);
  let value;
  try {
    value = JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ExperimentError(`${label}: invalid JSON (${reason})`);
  }
  return {
    value,
    digest: { sha256: sha256Hex(buffer), bytes: buffer.byteLength },
  };
}

function assertObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ExperimentError(`${label}: expected a JSON object`);
  }
}

function assertProtocolMatches(protocol, rows) {
  assertObject(protocol, 'protocol.json');
  if (protocol.protocolId !== undefined) {
    if (protocol.protocolId !== rows[0].protocolId) {
      throw new ExperimentError(
        `protocol.json.protocolId "${protocol.protocolId}" does not match the dataset`,
      );
    }
  }
  if (protocol.protocolVersion !== undefined) {
    if (protocol.protocolVersion !== rows[0].protocolVersion) {
      throw new ExperimentError(
        `protocol.json.protocolVersion does not match the dataset`,
      );
    }
  }
  if (
    protocol.datasetVersion !== undefined &&
    protocol.datasetVersion !== rows[0].datasetVersion
  ) {
    throw new ExperimentError(
      'protocol.json.datasetVersion does not match the dataset',
    );
  }
}

function assertPlanMatches(plan, rows) {
  assertObject(plan, 'analysis-plan.json');
  if (plan.protocolId !== undefined && plan.protocolId !== rows[0].protocolId) {
    throw new ExperimentError(
      `analysis-plan.json.protocolId "${plan.protocolId}" does not match the dataset`,
    );
  }
  if (
    plan.protocolVersion !== undefined &&
    plan.protocolVersion !== rows[0].protocolVersion
  ) {
    throw new ExperimentError(
      'analysis-plan.json.protocolVersion does not match the dataset',
    );
  }
}

function assertHomogeneousDataset(rows) {
  const first = rows[0];
  for (const row of rows) {
    if (
      row.protocolId !== first.protocolId ||
      row.protocolVersion !== first.protocolVersion ||
      row.datasetVersion !== first.datasetVersion
    ) {
      throw new ExperimentError(
        `dataset mixes protocol versions; first row is ${first.protocolId}@${first.protocolVersion}/dataset ${first.datasetVersion}`,
      );
    }
    if (row.evidenceKind !== first.evidenceKind) {
      throw new ExperimentError(
        'dataset mixes evidenceKind values (controlled and real-provider must not be pooled)',
      );
    }
  }
}

async function main() {
  const { values } = parseArgs(process.argv.slice(2), {
    string: ['dataset', 'tasks', 'protocol', 'plan', 'out', 'answers'],
  });
  const datasetPath = path.resolve(requiredValue(values, 'dataset'));
  const tasksPath = path.resolve(requiredValue(values, 'tasks'));
  const protocolPath = path.resolve(requiredValue(values, 'protocol'));
  const planPath = path.resolve(requiredValue(values, 'plan'));
  const outDir = path.resolve(requiredValue(values, 'out'));

  if (!fs.existsSync(datasetPath)) {
    throw new ExperimentError(
      `dataset file not found: ${values.get('dataset')}`,
    );
  }
  if (!fs.existsSync(tasksPath)) {
    throw new ExperimentError(`tasks file not found: ${values.get('tasks')}`);
  }
  if (!fs.existsSync(protocolPath)) {
    throw new ExperimentError(
      `protocol file not found: ${values.get('protocol')}`,
    );
  }
  if (!fs.existsSync(planPath)) {
    throw new ExperimentError(`plan file not found: ${values.get('plan')}`);
  }

  if (!verifyFrozenInputs(protocolPath, tasksPath)) {
    process.exitCode = 1;
    return;
  }

  const datasetBuffer = fs.readFileSync(datasetPath);
  const datasetRows = parseDatasetJsonl(
    datasetBuffer.toString('utf8').replace(/^\uFEFF/, ''),
    'dataset.jsonl',
  );
  if (datasetRows.length === 0) {
    throw new ExperimentError('dataset.jsonl has no rows');
  }
  assertHomogeneousDataset(datasetRows);
  const buildReport = readBuildReport(datasetPath, datasetRows.length);

  const protocol = readJsonFile(protocolPath, 'protocol.json');
  assertProtocolMatches(protocol.value, datasetRows);
  const plan = readJsonFile(planPath, 'analysis-plan.json');
  assertPlanMatches(plan.value, datasetRows);

  const tasksFile = readJsonFile(tasksPath, 'tasks.json');
  const tasks = validateTasksDocument(tasksFile.value, 'tasks.json');

  const explicitAnswers = values.get('answers');
  const answersPath =
    explicitAnswers !== undefined
      ? path.resolve(explicitAnswers)
      : path.join(path.dirname(datasetPath), 'answers.ndjson');
  const answersPresent = fs.existsSync(answersPath);
  if (explicitAnswers !== undefined && !answersPresent) {
    throw new ExperimentError(`answers file not found: ${explicitAnswers}`);
  }

  let answersVerification = {
    present: false,
    path: null,
    checked: 0,
    matched: 0,
    mismatched: 0,
    skipped: 0,
    mismatchedAttemptIds: [],
    skippedAttemptIds: [],
    details: [],
  };
  let answersInput = null;

  if (answersPresent) {
    const answersBuffer = fs.readFileSync(answersPath);
    const answers = parseAnswersNdjson(
      answersBuffer.toString('utf8').replace(/^\uFEFF/, ''),
      'answers.ndjson',
    );
    const verification = verifyAnswers({
      rows: datasetRows,
      answers,
      tasks: tasks.tasks,
      answerByteCap: tasks.answerByteCap,
    });
    answersVerification = {
      present: true,
      path: relativePosix(process.cwd(), answersPath),
      ...verification,
    };
    answersInput = {
      path: relativePosix(process.cwd(), answersPath),
      sha256: sha256Hex(answersBuffer),
      bytes: answersBuffer.byteLength,
    };
  }

  const summary = computeSummary({
    rows: datasetRows,
    meta: {
      inputs: {
        dataset: {
          path: relativePosix(process.cwd(), datasetPath),
          sha256: sha256Hex(datasetBuffer),
          bytes: datasetBuffer.byteLength,
        },
        buildReport: {
          path: buildReport.path,
          sha256: buildReport.sha256,
          bytes: buildReport.bytes,
        },
        answers: answersInput,
        protocol: {
          path: relativePosix(process.cwd(), protocolPath),
          ...protocol.digest,
        },
        plan: {
          path: relativePosix(process.cwd(), planPath),
          ...plan.digest,
        },
        tasks: {
          path: relativePosix(process.cwd(), tasksPath),
          ...tasksFile.digest,
        },
      },
    },
    answersVerification,
    plannedDenominator: buildReport.plannedDenominator,
  });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(outDir, 'summary.md'),
    renderSummaryMarkdown(summary),
    'utf8',
  );

  if (summary.answersVerification.mismatched > 0) {
    process.stderr.write(
      `experiment:analyze: answers.ndjson verification failed: ${summary.answersVerification.mismatched} mismatch(es): ${summary.answersVerification.mismatchedAttemptIds.join(', ')}\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `experiment:analyze: wrote summary.json and summary.md to ${toPosix(path.relative(process.cwd(), outDir)) || '.'} (plannedDenominator=${summary.denominator.plannedDenominator}, executedCount=${summary.denominator.executedCount})\n`,
  );
}

await runCli('analyze', main);
