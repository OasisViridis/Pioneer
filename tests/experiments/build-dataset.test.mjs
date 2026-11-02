import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  at,
  cleanup,
  createPilotFixture,
  createTempRoot,
  makeAccept,
  makeAttempt,
  makeCapture,
  makeEvent,
  makeTask,
  makeTasksDocument,
  makeTerminal,
  readJson,
  readJsonl,
  runExperimentCli,
  sha256,
  writeCaptureDirectory,
  writeJson,
  writeNdjson,
} from './helpers.mjs';

function buildArgs(fixture, outDir) {
  return [
    '--captures',
    fixture.capturesRoot,
    '--tasks',
    fixture.tasksPath,
    '--out',
    outDir,
  ];
}

function captureFile(fixture, captureName, fileName) {
  return path.join(fixture.capturesRoot, captureName, fileName);
}

test('build writes a sorted dataset, answers and a report with input hashes', () => {
  const root = createTempRoot();
  try {
    const fixture = createPilotFixture(root);
    const outDir = path.join(root, 'out');
    const result = runExperimentCli(
      'build-dataset.mjs',
      buildArgs(fixture, outDir),
    );
    assert.equal(result.status, 0, result.stderr);

    const rows = readJsonl(path.join(outDir, 'dataset.jsonl'));
    assert.equal(rows.length, 11);
    const attemptIds = rows.map((row) => row.attemptId);
    assert.deepEqual(attemptIds, [...attemptIds].sort());
    assert.equal(new Set(attemptIds).size, attemptIds.length);

    const answers = readJsonl(path.join(outDir, 'answers.ndjson'));
    assert.equal(answers.length, 5);
    assert.deepEqual(
      answers.map((entry) => entry.attemptId),
      ['a-0001', 'a-0002', 'b-0001', 'b-0002', 'b-0003'],
    );

    const report = readJson(path.join(outDir, 'build-report.json'));
    assert.equal(report.totals.captures, 2);
    assert.equal(report.totals.accepted, 2);
    assert.equal(report.totals.rejected, 0);
    assert.equal(report.totals.rows, 11);
    assert.equal(report.totals.answers, 5);
    for (const capture of report.captures) {
      assert.equal(capture.errors.length, 0);
      for (const name of ['capture.json', 'journal.ndjson', 'events.ndjson']) {
        assert.match(capture.files[name].sha256, /^[0-9a-f]{64}$/);
        assert.ok(capture.files[name].bytes > 0);
      }
    }
    assert.equal(report.tasks.taskCount, 7);
    assert.equal(report.corpus.corpusId, 'pioneer-demos-m1-frozen');
    assert.equal(report.corpus.verified, true);
    assert.equal(report.corpus.fileCount, 1);
    assert.match(report.corpus.manifestSha256, /^[0-9a-f]{64}$/);

    const byAttempt = new Map(rows.map((row) => [row.attemptId, row]));
    assert.equal(byAttempt.get('a-0001').run.adapter, 'pi');
    assert.equal(byAttempt.get('a-0001').run.notRunReason, null);
    assert.equal(
      byAttempt.get('a-0007').run.notRunReason,
      'AUTHORIZATION_MISSING',
    );
    assert.equal(byAttempt.get('a-0007').notes, 'no Provider authorization');
    assert.equal(
      byAttempt.get('b-0004').run.notRunReason,
      'PROVIDER_UNAVAILABLE',
    );
  } finally {
    cleanup(root);
  }
});

test('answers.ndjson hash and bytes equal the dataset row for every answer', () => {
  const root = createTempRoot();
  try {
    const fixture = createPilotFixture(root);
    const outDir = path.join(root, 'out');
    const result = runExperimentCli(
      'build-dataset.mjs',
      buildArgs(fixture, outDir),
    );
    assert.equal(result.status, 0, result.stderr);
    const rows = readJsonl(path.join(outDir, 'dataset.jsonl'));
    const answers = readJsonl(path.join(outDir, 'answers.ndjson'));
    const rowsByAttempt = new Map(rows.map((row) => [row.attemptId, row]));
    const completedRows = rows.filter((row) => row.run.status === 'completed');
    assert.equal(answers.length, completedRows.length);
    for (const answer of answers) {
      const row = rowsByAttempt.get(answer.attemptId);
      assert.ok(
        row !== undefined,
        `missing dataset row for ${answer.attemptId}`,
      );
      assert.equal(row.run.status, 'completed');
      assert.equal(answer.answerSha256, sha256(answer.normalizedAnswer));
      assert.equal(
        answer.answerBytes,
        Buffer.byteLength(answer.normalizedAnswer),
      );
      assert.equal(row.result.answerSha256, answer.answerSha256);
      assert.equal(row.result.answerBytes, answer.answerBytes);
    }
    const unknownRow = rowsByAttempt.get('a-0005');
    assert.equal(unknownRow.run.status, 'unknown');
    assert.equal(unknownRow.result.answerSha256, sha256('partial alpha'));
    assert.equal(
      unknownRow.result.answerBytes,
      Buffer.byteLength('partial alpha'),
    );
  } finally {
    cleanup(root);
  }
});

test('build is byte-deterministic across two runs', () => {
  const root = createTempRoot();
  try {
    const fixture = createPilotFixture(root);
    const firstOut = path.join(root, 'out-1');
    const secondOut = path.join(root, 'out-2');
    const first = runExperimentCli(
      'build-dataset.mjs',
      buildArgs(fixture, firstOut),
    );
    const second = runExperimentCli(
      'build-dataset.mjs',
      buildArgs(fixture, secondOut),
    );
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    for (const name of [
      'dataset.jsonl',
      'answers.ndjson',
      'build-report.json',
    ]) {
      assert.equal(
        fs.readFileSync(path.join(firstOut, name), 'utf8'),
        fs.readFileSync(path.join(secondOut, name), 'utf8'),
        `${name} differs between builds`,
      );
    }
  } finally {
    cleanup(root);
  }
});

test('a Windows absolute path rejects the capture and names file:line:field', () => {
  const root = createTempRoot();
  try {
    const fixture = createPilotFixture(root);
    const file = captureFile(fixture, 'v1-pioneer', 'capture.json');
    const capture = readJson(file);
    capture.environment.corpusId = 'C:\\Users\\oasis\\secret-corpus';
    writeJson(file, capture);
    const outDir = path.join(root, 'out');
    const result = runExperimentCli(
      'build-dataset.mjs',
      buildArgs(fixture, outDir),
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /experiment:build-dataset: build failed/);
    assert.match(result.stderr, /capture\.json:\d+:environment\.corpusId/);
    assert.match(result.stderr, /windows-absolute-path/);
    assert.equal(fs.existsSync(path.join(outDir, 'dataset.jsonl')), false);
    assert.equal(fs.existsSync(path.join(outDir, 'answers.ndjson')), false);
    const report = readJson(path.join(outDir, 'build-report.json'));
    assert.ok(
      report.captures.some((captureEntry) => captureEntry.errors.length > 0),
    );
  } finally {
    cleanup(root);
  }
});

test('an sk- credential in events rejects the capture and names body.text', () => {
  const root = createTempRoot();
  try {
    const fixture = createPilotFixture(root);
    const file = captureFile(fixture, 'v1-pioneer', 'events.ndjson');
    const events = readJsonl(file);
    const delta = events.find(
      (event) => event.runId === 'run:1' && event.body.type === 'text.delta',
    );
    delta.body.text = 'token sk-1234567890abcdef should be rejected';
    writeNdjson(file, events);
    const outDir = path.join(root, 'out');
    const result = runExperimentCli(
      'build-dataset.mjs',
      buildArgs(fixture, outDir),
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /events\.ndjson:\d+:body\.text/);
    assert.match(result.stderr, /credential-sk/);
    assert.equal(fs.existsSync(path.join(outDir, 'dataset.jsonl')), false);
  } finally {
    cleanup(root);
  }
});

test('normalized answers are scanned before answers.ndjson is written', () => {
  const root = createTempRoot();
  try {
    const fixture = createPilotFixture(root);
    const file = captureFile(fixture, 'v1-pioneer', 'events.ndjson');
    const events = readJsonl(file);
    const delta = events.find(
      (event) => event.runId === 'run:1' && event.body.type === 'text.delta',
    );
    // Markdown removal turns this into a contiguous sk- credential, so the
    // capture scan passes and the answers.ndjson scan must catch it.
    delta.body.text = 'token sk-`1234567890abcdef';
    writeNdjson(file, events);
    const outDir = path.join(root, 'out');
    const result = runExperimentCli(
      'build-dataset.mjs',
      buildArgs(fixture, outDir),
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /answers\.ndjson:\d+:normalizedAnswer/);
    assert.equal(fs.existsSync(path.join(outDir, 'answers.ndjson')), false);
  } finally {
    cleanup(root);
  }
});

test('build rejects a corpus file whose recorded bytes do not match disk', () => {
  const root = createTempRoot();
  try {
    const fixture = createPilotFixture(root);
    const tasks = readJson(fixture.tasksPath);
    tasks.corpus.files[0].bytes += 1;
    writeJson(fixture.tasksPath, tasks);
    const outDir = path.join(root, 'out');
    const result = runExperimentCli(
      'build-dataset.mjs',
      buildArgs(fixture, outDir),
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /corpus file mismatch: demos\/README\.md/);
    assert.equal(fs.existsSync(path.join(outDir, 'dataset.jsonl')), false);
  } finally {
    cleanup(root);
  }
});

test('capture corpusManifestSha256 must match the recomputed corpus manifest', () => {
  const root = createTempRoot();
  try {
    const fixture = createPilotFixture(root);
    const file = captureFile(fixture, 'v1-pioneer', 'capture.json');
    const capture = readJson(file);
    capture.environment.corpusManifestSha256 = 'e'.repeat(64);
    writeJson(file, capture);
    const outDir = path.join(root, 'out');
    const result = runExperimentCli(
      'build-dataset.mjs',
      buildArgs(fixture, outDir),
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /corpusManifestSha256 mismatch/);
    assert.match(result.stderr, /expected [0-9a-f]{64}, actual e{64}/);
    assert.equal(fs.existsSync(path.join(outDir, 'dataset.jsonl')), false);
  } finally {
    cleanup(root);
  }
});

test('duplicate attemptId across captures fails the build', () => {
  const root = createTempRoot();
  try {
    const tasksPath = path.join(root, 'tasks.json');
    writeJson(tasksPath, makeTasksDocument([makeTask('t01')]));
    const capturesRoot = path.join(root, 'captures');
    const runCapture = (directory, attemptId, variantId, runId) => {
      writeCaptureDirectory(directory, {
        capture: makeCapture({
          attempts: [
            makeAttempt({ attemptId, taskId: 't01', runId, variantId }),
          ],
          variantId,
        }),
        journal: [
          makeAccept({ runId, time: at(0) }),
          makeTerminal({
            runId,
            status: 'completed',
            time: at(1000),
            lastSeq: 2,
          }),
        ],
        events: [
          makeEvent({
            runId,
            seq: 1,
            time: at(0),
            body: { type: 'run.accepted' },
          }),
          makeEvent({
            runId,
            seq: 2,
            time: at(1000),
            body: { type: 'run.completed', usage: null },
          }),
        ],
      });
    };
    runCapture(
      path.join(capturesRoot, 'v1-pioneer'),
      'a-0001',
      'pioneer-readonly-tools',
      'run:1',
    );
    runCapture(
      path.join(capturesRoot, 'v0-fixed'),
      'a-0001',
      'fixed-prefix-no-tools',
      'run:2',
    );
    const outDir = path.join(root, 'out');
    const result = runExperimentCli('build-dataset.mjs', [
      '--captures',
      capturesRoot,
      '--tasks',
      tasksPath,
      '--out',
      outDir,
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /duplicate attemptId "a-0001"/);
    assert.equal(fs.existsSync(path.join(outDir, 'dataset.jsonl')), false);
  } finally {
    cleanup(root);
  }
});
