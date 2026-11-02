#!/usr/bin/env node
/**
 * build-dataset.mjs — turn capture directories into a de-identified dataset.
 *
 * Usage:
 *   node tools/experiments/build-dataset.mjs \
 *     --captures <capture-root-or-directory> \
 *     --tasks docs/experiments/m5a/v1/tasks.json \
 *     --out <output-directory>
 *
 * Outputs dataset.jsonl, answers.ndjson and build-report.json. If any capture
 * is rejected the build fails (non-zero) and the dataset/answers are not
 * written, so a partial denominator can never be mistaken for a result.
 */

import fs from 'node:fs';
import path from 'node:path';

import { parseArgs, requiredValue, runCli } from './lib/cli.mjs';
import { validateDatasetRow } from './lib/dataset.mjs';
import {
  ExperimentError,
  PROTOCOL_ID,
  assertCaptureIsDeidentified,
  buildCaptureResult,
  parseEventsNdjson,
  parseJournalNdjson,
  scanSensitiveValue,
  sha256Hex,
  validateCaptureManifest,
  validateTasksDocument,
} from './lib/record.mjs';

const CAPTURE_FILE_NAMES = ['capture.json', 'journal.ndjson', 'events.ndjson'];

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function relativePosix(from, to) {
  return toPosix(path.relative(from, to)) || '.';
}

function findCaptureDirectories(root) {
  const found = [];
  const walk = (directory) => {
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => (left.name < right.name ? -1 : 1));
    if (
      entries.some((entry) => entry.isFile() && entry.name === 'capture.json')
    ) {
      found.push(directory);
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) walk(path.join(directory, entry.name));
    }
  };
  walk(root);
  return found.sort((left, right) => {
    const leftKey = relativePosix(root, left);
    const rightKey = relativePosix(root, right);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function readBuffer(file) {
  return fs.readFileSync(file);
}

function readText(buffer) {
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

function fileDigest(buffer) {
  return { sha256: sha256Hex(buffer), bytes: buffer.byteLength };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function assertUniqueAttemptIds(rows, attemptOwners, captureDir) {
  for (const row of rows) {
    const owner = attemptOwners.get(row.attemptId);
    if (owner !== undefined) {
      throw new ExperimentError(
        `duplicate attemptId "${row.attemptId}" already emitted by capture "${owner}"`,
      );
    }
  }
}

async function main() {
  const { values } = parseArgs(process.argv.slice(2), {
    string: ['captures', 'tasks', 'out'],
  });
  const capturesArgument = requiredValue(values, 'captures');
  const tasksArgument = requiredValue(values, 'tasks');
  const outArgument = requiredValue(values, 'out');

  const capturesRoot = path.resolve(capturesArgument);
  const tasksPath = path.resolve(tasksArgument);
  const outDir = path.resolve(outArgument);

  if (
    !fs.existsSync(capturesRoot) ||
    !fs.statSync(capturesRoot).isDirectory()
  ) {
    throw new ExperimentError(
      `captures directory not found: ${capturesArgument}`,
    );
  }
  if (!fs.existsSync(tasksPath)) {
    throw new ExperimentError(`tasks file not found: ${tasksArgument}`);
  }

  const tasksBuffer = readBuffer(tasksPath);
  let tasksDocument;
  try {
    tasksDocument = JSON.parse(readText(tasksBuffer));
  } catch (error) {
    throw new ExperimentError(
      `tasks.json: invalid JSON (${errorMessage(error)})`,
    );
  }
  const tasks = validateTasksDocument(tasksDocument, 'tasks.json');

  const captureDirectories = findCaptureDirectories(capturesRoot);
  if (captureDirectories.length === 0) {
    throw new ExperimentError(
      `no capture directories containing capture.json found under ${capturesArgument}`,
    );
  }

  const report = {
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    tasks: {
      path: relativePosix(process.cwd(), tasksPath),
      ...fileDigest(tasksBuffer),
      taskCount: tasks.tasks.size,
    },
    captures: [],
    totals: {
      captures: 0,
      accepted: 0,
      rejected: 0,
      rows: 0,
      answers: 0,
    },
    errors: [],
  };

  const allRows = [];
  const allAnswers = [];
  const attemptOwners = new Map();

  for (const captureDir of captureDirectories) {
    const captureKey = relativePosix(capturesRoot, captureDir);
    const entry = {
      captureDir: captureKey,
      files: Object.fromEntries(CAPTURE_FILE_NAMES.map((name) => [name, null])),
      attemptCount: null,
      rowCount: 0,
      answerCount: 0,
      errors: [],
    };
    try {
      const buffers = new Map();
      for (const name of CAPTURE_FILE_NAMES) {
        const filePath = path.join(captureDir, name);
        if (!fs.existsSync(filePath)) {
          throw new ExperimentError(`missing required input file ${name}`);
        }
        const buffer = readBuffer(filePath);
        buffers.set(name, buffer);
        entry.files[name] = fileDigest(buffer);
      }
      const captureText = readText(buffers.get('capture.json'));
      const journalText = readText(buffers.get('journal.ndjson'));
      const eventsText = readText(buffers.get('events.ndjson'));

      assertCaptureIsDeidentified([
        { file: 'capture.json', text: captureText, format: 'json' },
        { file: 'journal.ndjson', text: journalText, format: 'ndjson' },
        { file: 'events.ndjson', text: eventsText, format: 'ndjson' },
      ]);

      let captureManifest;
      try {
        captureManifest = JSON.parse(captureText);
      } catch (error) {
        throw new ExperimentError(
          `capture.json: invalid JSON (${errorMessage(error)})`,
        );
      }
      const capture = validateCaptureManifest(captureManifest);
      if (
        tasks.protocolVersion !== undefined &&
        capture.protocolVersion !== tasks.protocolVersion
      ) {
        throw new ExperimentError(
          `capture.json.protocolVersion ${capture.protocolVersion} does not match tasks.json protocolVersion ${tasks.protocolVersion}`,
        );
      }
      if (
        tasks.datasetVersion !== undefined &&
        capture.datasetVersion !== tasks.datasetVersion
      ) {
        throw new ExperimentError(
          `capture.json.datasetVersion ${capture.datasetVersion} does not match tasks.json datasetVersion ${tasks.datasetVersion}`,
        );
      }
      if (
        tasks.corpus !== undefined &&
        tasks.corpus.corpusId !== capture.environment.corpusId
      ) {
        throw new ExperimentError(
          `capture.json.environment.corpusId does not match tasks.json corpus.corpusId`,
        );
      }

      const journalRecords = parseJournalNdjson(journalText, 'journal.ndjson');
      const events = parseEventsNdjson(eventsText, 'events.ndjson');
      const result = buildCaptureResult({
        capture,
        journalRecords,
        events,
        tasks: tasks.tasks,
        answerByteCap: tasks.answerByteCap,
        captureHashes: {
          captureManifestSha256: entry.files['capture.json'].sha256,
          journalSha256: entry.files['journal.ndjson'].sha256,
          eventsSha256: entry.files['events.ndjson'].sha256,
        },
        label: `capture "${captureKey}"`,
      });

      result.rows.forEach((row, index) => {
        validateDatasetRow(row, `${captureKey}/dataset.jsonl:${index + 1}`);
      });
      if (result.rows.length !== capture.attempts.length) {
        throw new ExperimentError(
          `emitted ${result.rows.length} rows for ${capture.attempts.length} registered attempts`,
        );
      }
      assertUniqueAttemptIds(result.rows, attemptOwners, captureKey);
      for (const row of result.rows) {
        attemptOwners.set(row.attemptId, captureKey);
      }
      allRows.push(...result.rows);
      allAnswers.push(...result.answers);
      entry.attemptCount = capture.attempts.length;
      entry.rowCount = result.rows.length;
      entry.answerCount = result.answers.length;
    } catch (error) {
      entry.errors.push(errorMessage(error));
      entry.rowCount = 0;
      entry.answerCount = 0;
    }
    report.captures.push(entry);
  }

  allRows.sort((left, right) =>
    left.attemptId < right.attemptId
      ? -1
      : left.attemptId > right.attemptId
        ? 1
        : 0,
  );
  allAnswers.sort((left, right) =>
    left.attemptId < right.attemptId
      ? -1
      : left.attemptId > right.attemptId
        ? 1
        : 0,
  );

  // The normalized answer is written in clear text, so scan it as well.
  allAnswers.forEach((answer, index) => {
    for (const field of [
      'attemptId',
      'taskId',
      'variantId',
      'normalizedAnswer',
    ]) {
      const pattern = scanSensitiveValue(answer[field]);
      if (pattern !== null) {
        report.errors.push(
          `answers.ndjson:${index + 1}:${field}: sensitive content (${pattern})`,
        );
        return;
      }
    }
  });

  report.totals.captures = report.captures.length;
  report.totals.rejected = report.captures.filter(
    (capture) => capture.errors.length > 0,
  ).length;
  report.totals.accepted = report.totals.captures - report.totals.rejected;
  report.totals.rows = allRows.length;
  report.totals.answers = allAnswers.length;

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'build-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  const failed = report.totals.rejected > 0 || report.errors.length > 0;
  if (failed) {
    const firstCaptureError = report.captures.find(
      (capture) => capture.errors.length > 0,
    );
    const firstError =
      firstCaptureError === undefined
        ? report.errors[0]
        : `${firstCaptureError.captureDir}: ${firstCaptureError.errors[0]}`;
    const totalErrors =
      report.errors.length +
      report.captures.reduce(
        (total, capture) => total + capture.errors.length,
        0,
      );
    process.stderr.write(
      `experiment:build-dataset: build failed (${totalErrors} error(s)); dataset.jsonl and answers.ndjson were not written; first: ${firstError}\n`,
    );
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(
    path.join(outDir, 'dataset.jsonl'),
    allRows.map((row) => JSON.stringify(row)).join('\n') +
      (allRows.length > 0 ? '\n' : ''),
    'utf8',
  );
  fs.writeFileSync(
    path.join(outDir, 'answers.ndjson'),
    allAnswers.map((answer) => JSON.stringify(answer)).join('\n') +
      (allAnswers.length > 0 ? '\n' : ''),
    'utf8',
  );

  process.stdout.write(
    `experiment:build-dataset: wrote ${allRows.length} rows and ${allAnswers.length} answers from ${report.totals.accepted} capture(s) to ${toPosix(path.relative(process.cwd(), outDir)) || '.'}\n`,
  );
}

await runCli('build-dataset', main);
