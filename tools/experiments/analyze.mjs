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

  const datasetBuffer = fs.readFileSync(datasetPath);
  const datasetRows = parseDatasetJsonl(
    datasetBuffer.toString('utf8').replace(/^\uFEFF/, ''),
    'dataset.jsonl',
  );
  if (datasetRows.length === 0) {
    throw new ExperimentError('dataset.jsonl has no rows');
  }
  assertHomogeneousDataset(datasetRows);

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
