/**
 * Fixture builders for the experiment tool tests.
 * Every fixture is schema-valid synthetic data; nothing here depends on the
 * Lead's pilot captures.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL('../..', import.meta.url)),
);

export const PROTOCOL_ID = 'm5a-harness-context-comparison';
export const SOFTWARE_COMMIT = '13ccfe5f0c9f8cc376aec08eb21cd91162719237';
export const BASE_TIME = Date.parse('2026-11-03T00:00:00.000Z');

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const demoBuffer = fs.readFileSync(
  path.join(REPOSITORY_ROOT, 'demos', 'README.md'),
);
export const CORPUS_FILES = Object.freeze([
  {
    path: 'demos/README.md',
    sha256: sha256(demoBuffer),
    bytes: demoBuffer.byteLength,
  },
]);
export const CORPUS_MANIFEST_SHA256 = sha256(JSON.stringify([...CORPUS_FILES]));

export const ENVIRONMENT = Object.freeze({
  softwareCommit: SOFTWARE_COMMIT,
  dirty: false,
  platform: 'win32-x64',
  nodeVersion: '24.17.0',
  electronVersion: '44.2.0',
  provider: 'deepseek',
  modelId: 'deepseek-flash',
  endpointOrigin: 'https://api.deepseek.com',
  corpusId: 'pioneer-demos-m1-frozen',
  corpusManifestSha256: CORPUS_MANIFEST_SHA256,
});

export function at(offsetMs) {
  return new Date(BASE_TIME + offsetMs).toISOString();
}

export function createTempRoot(prefix = 'pioneer-m5a-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function createRepositoryTempRoot(prefix = 'pioneer-m5a-freeze-') {
  const tmpRoot = path.join(REPOSITORY_ROOT, 'tmp');
  fs.mkdirSync(tmpRoot, { recursive: true });
  return fs.mkdtempSync(path.join(tmpRoot, prefix));
}

export function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function writeNdjson(file, records) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    records.map((record) => JSON.stringify(record)).join('\n') +
      (records.length > 0 ? '\n' : ''),
    'utf8',
  );
}

export function makeTask(taskId, overrides = {}) {
  return {
    taskId,
    category: 'locate-exact-fact',
    prompt: `Question ${taskId}: which literal is present?`,
    materialScope: {
      root: 'demos',
      allowedFiles: ['demos/README.md'],
    },
    rubricId: `r${taskId.slice(1)}`,
    rubric: {
      kind: 'contains_all',
      match: 'substring',
      literals: ['alpha'],
      forbidden: [],
    },
    groundTruth: {
      answerSummary: 'alpha',
      evidence: [
        {
          path: CORPUS_FILES[0].path,
          sha256: CORPUS_FILES[0].sha256,
          hint: 'rg -n alpha demos/README.md',
        },
      ],
    },
    maxDurationMs: 120000,
    ...overrides,
  };
}

export function makeTasksDocument(tasks, overrides = {}) {
  return {
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    protocolVersion: 1,
    datasetVersion: 1,
    corpus: {
      corpusId: 'pioneer-demos-m1-frozen',
      root: 'demos',
      files: CORPUS_FILES.map((file) => ({ ...file })),
      totalBytes: CORPUS_FILES.reduce((total, file) => total + file.bytes, 0),
    },
    tasks,
    ...overrides,
  };
}

export function makeAttempt({
  attemptId,
  taskId,
  runId,
  variantId = 'pioneer-readonly-tools',
  repetition = 1,
  orderIndex = 1,
}) {
  return {
    attemptId,
    taskId,
    variantId,
    repetition,
    orderIndex,
    runId,
    status: 'registered',
  };
}

export function makeNotRun({
  attemptId,
  reason = 'AUTHORIZATION_MISSING',
  note = 'no Provider authorization for this attempt',
}) {
  return { attemptId, reason, note };
}

export function makeCapture({
  attempts,
  notRun = [],
  variantId = 'pioneer-readonly-tools',
  evidenceKind = 'controlled',
  repetition = 1,
  orderIndex = 1,
  harnessVersion = 'v1',
  environment = ENVIRONMENT,
}) {
  return {
    schemaVersion: 1,
    protocolId: PROTOCOL_ID,
    protocolVersion: 1,
    datasetVersion: 1,
    evidenceKind,
    variantId,
    harnessVersion,
    repetition,
    orderIndex,
    environment: { ...environment },
    attempts,
    notRun,
  };
}

export function makeAccept({
  runId,
  time,
  sessionId = 'session:s1',
  projectId = 'project:p1',
  revision = 1,
  adapter = 'pi',
}) {
  return {
    kind: 'accept',
    runId,
    sessionId,
    projectId,
    revision,
    taskDigest: `sha256:${'c'.repeat(64)}`,
    adapter,
    windowEpoch: 0,
    rootRevision: 0,
    requestId: `req:${runId}`,
    at: time,
  };
}

export function makeTerminal({
  runId,
  status,
  code = null,
  time,
  lastSeq,
  stopRequestedAt = null,
}) {
  return {
    kind: 'terminal',
    runId,
    status,
    code,
    at: time,
    lastSeq,
    stopRequestedAt,
  };
}

export function makeTombstone({ runId, time }) {
  return { kind: 'tombstone', runId, reason: 'host_restarted', at: time };
}

function sourceOf(bodyType) {
  if (bodyType === 'text.delta') return 'model';
  if (bodyType.startsWith('tool.')) return 'tool';
  return 'host';
}

export function makeEvent({
  runId,
  seq,
  time,
  body,
  sessionId = 'session:s1',
  projectId = 'project:p1',
  revision = 1,
  adapter = 'pi',
}) {
  return {
    sessionId,
    projectId,
    runId,
    revision,
    version: 1,
    seq,
    at: time,
    source: sourceOf(body.type),
    adapter,
    body,
  };
}

export function writeCaptureDirectory(
  directory,
  { capture, journal = [], events = [] },
) {
  fs.mkdirSync(directory, { recursive: true });
  writeJson(path.join(directory, 'capture.json'), capture);
  writeNdjson(path.join(directory, 'journal.ndjson'), journal);
  writeNdjson(path.join(directory, 'events.ndjson'), events);
}

/**
 * Two captures (V1 + V0) that exercise completed/failed/stopped/unknown and
 * not_run rows, missing and reported usage, tool calls and task-level pairing.
 */
export function createPilotFixture(root) {
  const tasksPath = path.join(root, 'tasks.json');
  writeJson(
    tasksPath,
    makeTasksDocument([
      makeTask('t01', {
        rubric: {
          kind: 'contains_all',
          match: 'substring',
          literals: ['alpha'],
          forbidden: [],
        },
      }),
      makeTask('t02', {
        category: 'aggregate-count',
        rubric: {
          kind: 'contains_all',
          match: 'substring',
          literals: ['beta'],
          forbidden: [],
        },
      }),
      makeTask('t03', {
        category: 'cross-file-synthesis',
        rubric: {
          kind: 'contains_all',
          match: 'substring',
          literals: ['gamma'],
          forbidden: [],
        },
      }),
      makeTask('t04', {
        category: 'negative-scope',
        rubric: {
          kind: 'contains_none',
          match: 'substring',
          literals: ['delta'],
          forbidden: ['zeta'],
        },
      }),
      makeTask('t05', {
        rubric: {
          kind: 'contains_all',
          match: 'substring',
          literals: ['alpha'],
          forbidden: [],
        },
      }),
      makeTask('t06', {
        category: 'aggregate-count',
        rubric: {
          kind: 'contains_all',
          match: 'substring',
          literals: ['omega'],
          forbidden: [],
        },
      }),
      makeTask('t07', {
        category: 'cross-file-synthesis',
        rubric: {
          kind: 'contains_all',
          match: 'substring',
          literals: ['theta'],
          forbidden: [],
        },
      }),
    ]),
  );

  const capturesRoot = path.join(root, 'captures');
  const v1Dir = path.join(capturesRoot, 'v1-pioneer');
  const v0Dir = path.join(capturesRoot, 'v0-fixed');

  const v1Attempts = [
    makeAttempt({
      attemptId: 'a-0001',
      taskId: 't01',
      runId: 'run:1',
      orderIndex: 1,
    }),
    makeAttempt({
      attemptId: 'a-0002',
      taskId: 't02',
      runId: 'run:2',
      orderIndex: 2,
    }),
    makeAttempt({
      attemptId: 'a-0003',
      taskId: 't03',
      runId: 'run:3',
      orderIndex: 3,
    }),
    makeAttempt({
      attemptId: 'a-0004',
      taskId: 't04',
      runId: 'run:4',
      orderIndex: 4,
    }),
    makeAttempt({
      attemptId: 'a-0005',
      taskId: 't05',
      runId: 'run:5',
      orderIndex: 5,
    }),
    makeAttempt({
      attemptId: 'a-0006',
      taskId: 't06',
      runId: 'run:6',
      orderIndex: 6,
    }),
    makeAttempt({
      attemptId: 'a-0007',
      taskId: 't07',
      runId: null,
      orderIndex: 7,
    }),
  ];
  writeCaptureDirectory(v1Dir, {
    capture: makeCapture({
      attempts: v1Attempts,
      notRun: [
        makeNotRun({
          attemptId: 'a-0007',
          reason: 'AUTHORIZATION_MISSING',
          note: 'no Provider authorization',
        }),
      ],
      variantId: 'pioneer-readonly-tools',
    }),
    journal: [
      makeAccept({ runId: 'run:1', time: at(0) }),
      makeAccept({ runId: 'run:2', time: at(2000) }),
      makeAccept({ runId: 'run:3', time: at(4000) }),
      makeAccept({ runId: 'run:4', time: at(130000) }),
      makeAccept({ runId: 'run:5', time: at(140000) }),
      makeAccept({ runId: 'run:6', time: at(160000) }),
      makeTerminal({
        runId: 'run:1',
        status: 'completed',
        time: at(1250),
        lastSeq: 6,
      }),
      makeTerminal({
        runId: 'run:2',
        status: 'completed',
        time: at(3500),
        lastSeq: 4,
      }),
      makeTerminal({
        runId: 'run:3',
        status: 'failed',
        code: 'RUN_DEADLINE',
        time: at(124000),
        lastSeq: 3,
      }),
      makeTerminal({
        runId: 'run:4',
        status: 'stopped',
        time: at(130500),
        lastSeq: 3,
      }),
      makeTombstone({ runId: 'run:5', time: at(150000) }),
    ],
    events: [
      makeEvent({
        runId: 'run:1',
        seq: 1,
        time: at(0),
        body: { type: 'run.accepted' },
      }),
      makeEvent({
        runId: 'run:1',
        seq: 2,
        time: at(10),
        body: { type: 'run.started' },
      }),
      makeEvent({
        runId: 'run:1',
        seq: 3,
        time: at(20),
        body: { type: 'tool.requested', callId: 'call:1', tool: 'read_file' },
      }),
      makeEvent({
        runId: 'run:1',
        seq: 4,
        time: at(30),
        body: {
          type: 'tool.result',
          callId: 'call:1',
          result: {
            status: 'succeeded',
            text: 'alpha',
            truncated: false,
          },
        },
      }),
      makeEvent({
        runId: 'run:1',
        seq: 5,
        time: at(40),
        body: { type: 'text.delta', text: 'The answer is Alpha.' },
      }),
      makeEvent({
        runId: 'run:1',
        seq: 6,
        time: at(1250),
        body: {
          type: 'run.completed',
          usage: { inputTokens: 100, outputTokens: 20 },
        },
      }),
      makeEvent({
        runId: 'run:2',
        seq: 1,
        time: at(2000),
        body: { type: 'run.accepted' },
      }),
      makeEvent({
        runId: 'run:2',
        seq: 2,
        time: at(2010),
        body: { type: 'run.started' },
      }),
      makeEvent({
        runId: 'run:2',
        seq: 3,
        time: at(2020),
        body: { type: 'text.delta', text: 'I found no such token.' },
      }),
      makeEvent({
        runId: 'run:2',
        seq: 4,
        time: at(3500),
        body: { type: 'run.completed', usage: null },
      }),
      makeEvent({
        runId: 'run:3',
        seq: 1,
        time: at(4000),
        body: { type: 'run.accepted' },
      }),
      makeEvent({
        runId: 'run:3',
        seq: 2,
        time: at(4010),
        body: { type: 'run.started' },
      }),
      makeEvent({
        runId: 'run:3',
        seq: 3,
        time: at(124000),
        body: { type: 'run.failed', code: 'RUN_DEADLINE' },
      }),
      makeEvent({
        runId: 'run:4',
        seq: 1,
        time: at(130000),
        body: { type: 'run.accepted' },
      }),
      makeEvent({
        runId: 'run:4',
        seq: 2,
        time: at(130100),
        body: { type: 'run.stop_requested', reason: 'user' },
      }),
      makeEvent({
        runId: 'run:4',
        seq: 3,
        time: at(130500),
        body: { type: 'run.stopped' },
      }),
      makeEvent({
        runId: 'run:5',
        seq: 1,
        time: at(140000),
        body: { type: 'run.accepted' },
      }),
      makeEvent({
        runId: 'run:5',
        seq: 2,
        time: at(140010),
        body: { type: 'text.delta', text: 'partial alpha' },
      }),
      makeEvent({
        runId: 'run:6',
        seq: 1,
        time: at(160000),
        body: { type: 'run.accepted' },
      }),
    ],
  });

  const v0Attempts = [
    makeAttempt({
      attemptId: 'b-0001',
      taskId: 't01',
      runId: 'run:11',
      variantId: 'fixed-prefix-no-tools',
      orderIndex: 1,
    }),
    makeAttempt({
      attemptId: 'b-0002',
      taskId: 't02',
      runId: 'run:12',
      variantId: 'fixed-prefix-no-tools',
      orderIndex: 2,
    }),
    makeAttempt({
      attemptId: 'b-0003',
      taskId: 't03',
      runId: 'run:13',
      variantId: 'fixed-prefix-no-tools',
      orderIndex: 3,
    }),
    makeAttempt({
      attemptId: 'b-0004',
      taskId: 't04',
      runId: null,
      variantId: 'fixed-prefix-no-tools',
      orderIndex: 4,
    }),
  ];
  writeCaptureDirectory(v0Dir, {
    capture: makeCapture({
      attempts: v0Attempts,
      notRun: [
        makeNotRun({
          attemptId: 'b-0004',
          reason: 'PROVIDER_UNAVAILABLE',
          note: 'Provider unavailable during the controlled pilot',
        }),
      ],
      variantId: 'fixed-prefix-no-tools',
    }),
    journal: [
      makeAccept({ runId: 'run:11', time: at(0), adapter: 'controlled' }),
      makeAccept({ runId: 'run:12', time: at(2000), adapter: 'controlled' }),
      makeAccept({ runId: 'run:13', time: at(4000), adapter: 'controlled' }),
      makeTerminal({
        runId: 'run:11',
        status: 'completed',
        time: at(800),
        lastSeq: 3,
      }),
      makeTerminal({
        runId: 'run:12',
        status: 'completed',
        time: at(2900),
        lastSeq: 3,
      }),
      makeTerminal({
        runId: 'run:13',
        status: 'completed',
        time: at(5000),
        lastSeq: 3,
      }),
    ],
    events: [
      makeEvent({
        adapter: 'controlled',
        runId: 'run:11',
        seq: 1,
        time: at(0),
        body: { type: 'run.accepted' },
      }),
      makeEvent({
        adapter: 'controlled',
        runId: 'run:11',
        seq: 2,
        time: at(10),
        body: { type: 'text.delta', text: 'beta' },
      }),
      makeEvent({
        adapter: 'controlled',
        runId: 'run:11',
        seq: 3,
        time: at(800),
        body: { type: 'run.completed', usage: null },
      }),
      makeEvent({
        adapter: 'controlled',
        runId: 'run:12',
        seq: 1,
        time: at(2000),
        body: { type: 'run.accepted' },
      }),
      makeEvent({
        adapter: 'controlled',
        runId: 'run:12',
        seq: 2,
        time: at(2010),
        body: { type: 'text.delta', text: 'beta' },
      }),
      makeEvent({
        adapter: 'controlled',
        runId: 'run:12',
        seq: 3,
        time: at(2900),
        body: {
          type: 'run.completed',
          usage: { inputTokens: 50, outputTokens: 10 },
        },
      }),
      makeEvent({
        adapter: 'controlled',
        runId: 'run:13',
        seq: 1,
        time: at(4000),
        body: { type: 'run.accepted' },
      }),
      makeEvent({
        adapter: 'controlled',
        runId: 'run:13',
        seq: 2,
        time: at(4010),
        body: { type: 'text.delta', text: 'gamma' },
      }),
      makeEvent({
        adapter: 'controlled',
        runId: 'run:13',
        seq: 3,
        time: at(5000),
        body: {
          type: 'run.completed',
          usage: { inputTokens: 50, outputTokens: 10 },
        },
      }),
    ],
  });

  return { root, capturesRoot, tasksPath };
}

export function runExperimentCli(scriptName, args, cwd = REPOSITORY_ROOT) {
  const result = spawnSync(
    process.execPath,
    [path.join(REPOSITORY_ROOT, 'tools', 'experiments', scriptName), ...args],
    { cwd, encoding: 'utf8' },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function readJsonl(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}
