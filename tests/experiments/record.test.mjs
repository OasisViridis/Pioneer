import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  ANSWER_BYTE_CAP,
  buildCaptureResult,
  normalizeForMatch,
  scoreAnswer,
  validateTasksDocument,
} from '../../tools/experiments/lib/record.mjs';
import {
  at,
  cleanup,
  createTempRoot,
  createPilotFixture,
  makeAccept,
  makeAttempt,
  makeCapture,
  makeEvent,
  makeNotRun,
  makeTask,
  makeTasksDocument,
  makeTerminal,
  makeTombstone,
  readJsonl,
  runExperimentCli,
  sha256,
  writeCaptureDirectory,
} from './helpers.mjs';

const CAPTURE_HASHES = {
  captureManifestSha256: '1'.repeat(64),
  journalSha256: '2'.repeat(64),
  eventsSha256: '3'.repeat(64),
};

function tasksFor(taskIds) {
  return validateTasksDocument(
    makeTasksDocument(
      taskIds.map((taskId) =>
        makeTask(taskId, {
          rubric: {
            kind: 'contains_all',
            match: 'substring',
            literals: ['alpha'],
            forbidden: [],
          },
        }),
      ),
    ),
  ).tasks;
}

function buildRows({
  attempts,
  notRun = [],
  journal = [],
  events = [],
  taskIds = ['t01'],
}) {
  const capture = makeCapture({ attempts, notRun });
  return buildCaptureResult({
    capture,
    journalRecords: journal,
    events,
    tasks: tasksFor(taskIds),
    captureHashes: CAPTURE_HASHES,
    label: 'test capture',
  }).rows;
}

test('usage: null or missing event stays null with source missing', () => {
  const journal = [
    makeAccept({ runId: 'run:1', time: at(0) }),
    makeTerminal({
      runId: 'run:1',
      status: 'completed',
      time: at(1000),
      lastSeq: 3,
    }),
  ];
  const events = [
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
      body: { type: 'text.delta', text: 'alpha' },
    }),
    makeEvent({
      runId: 'run:1',
      seq: 3,
      time: at(1000),
      body: { type: 'run.completed', usage: null },
    }),
  ];
  const rows = buildRows({
    attempts: [
      makeAttempt({ attemptId: 'a-0001', taskId: 't01', runId: 'run:1' }),
    ],
    journal,
    events,
  });
  assert.deepEqual(rows[0].usage, {
    inputTokens: null,
    outputTokens: null,
    source: 'missing',
    estimated: null,
  });
});

test('usage: both reported numbers are kept and never replaced by 0', () => {
  const journal = [
    makeAccept({ runId: 'run:1', time: at(0) }),
    makeTerminal({
      runId: 'run:1',
      status: 'completed',
      time: at(1000),
      lastSeq: 3,
    }),
  ];
  const events = [
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
      body: { type: 'text.delta', text: 'alpha' },
    }),
    makeEvent({
      runId: 'run:1',
      seq: 3,
      time: at(1000),
      body: {
        type: 'run.completed',
        usage: { inputTokens: 0, outputTokens: 7 },
      },
    }),
  ];
  const row = buildRows({
    attempts: [
      makeAttempt({ attemptId: 'a-0001', taskId: 't01', runId: 'run:1' }),
    ],
    journal,
    events,
  })[0];
  assert.deepEqual(row.usage, {
    inputTokens: 0,
    outputTokens: 7,
    source: 'reported',
    estimated: null,
  });
});

test('usage: one null token falls back to missing and keeps both null', () => {
  const journal = [
    makeAccept({ runId: 'run:1', time: at(0) }),
    makeTerminal({
      runId: 'run:1',
      status: 'completed',
      time: at(1000),
      lastSeq: 3,
    }),
  ];
  const events = [
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
      body: { type: 'text.delta', text: 'alpha' },
    }),
    makeEvent({
      runId: 'run:1',
      seq: 3,
      time: at(1000),
      body: {
        type: 'run.completed',
        usage: { inputTokens: 12, outputTokens: null },
      },
    }),
  ];
  const row = buildRows({
    attempts: [
      makeAttempt({ attemptId: 'a-0001', taskId: 't01', runId: 'run:1' }),
    ],
    journal,
    events,
  })[0];
  assert.deepEqual(row.usage, {
    inputTokens: null,
    outputTokens: null,
    source: 'missing',
    estimated: null,
  });
});

test('failed (timeout) rows are retained with a failure code and duration', () => {
  const journal = [
    makeAccept({ runId: 'run:3', time: at(0) }),
    makeTerminal({
      runId: 'run:3',
      status: 'failed',
      code: 'RUN_DEADLINE',
      time: at(120000),
      lastSeq: 3,
    }),
  ];
  const events = [
    makeEvent({
      runId: 'run:3',
      seq: 1,
      time: at(0),
      body: { type: 'run.accepted' },
    }),
    makeEvent({
      runId: 'run:3',
      seq: 2,
      time: at(10),
      body: { type: 'run.started' },
    }),
    makeEvent({
      runId: 'run:3',
      seq: 3,
      time: at(120000),
      body: { type: 'run.failed', code: 'RUN_DEADLINE' },
    }),
  ];
  const row = buildRows({
    attempts: [
      makeAttempt({ attemptId: 'a-0003', taskId: 't01', runId: 'run:3' }),
    ],
    journal,
    events,
  })[0];
  assert.equal(row.run.status, 'failed');
  assert.equal(row.run.failureCode, 'RUN_DEADLINE');
  assert.equal(row.run.stopReason, null);
  assert.equal(row.run.terminalAt, at(120000));
  assert.equal(row.run.durationMs, 120000);
  assert.equal(row.result.verdict, 'unscorable');
});

test('stopped rows keep the stop reason from run.stop_requested', () => {
  const journal = [
    makeAccept({ runId: 'run:4', time: at(0) }),
    makeTerminal({
      runId: 'run:4',
      status: 'stopped',
      time: at(500),
      lastSeq: 3,
    }),
  ];
  const events = [
    makeEvent({
      runId: 'run:4',
      seq: 1,
      time: at(0),
      body: { type: 'run.accepted' },
    }),
    makeEvent({
      runId: 'run:4',
      seq: 2,
      time: at(100),
      body: { type: 'run.stop_requested', reason: 'user' },
    }),
    makeEvent({
      runId: 'run:4',
      seq: 3,
      time: at(500),
      body: { type: 'run.stopped' },
    }),
  ];
  const row = buildRows({
    attempts: [
      makeAttempt({ attemptId: 'a-0004', taskId: 't01', runId: 'run:4' }),
    ],
    journal,
    events,
  })[0];
  assert.equal(row.run.status, 'stopped');
  assert.equal(row.run.stopReason, 'user');
  assert.equal(row.run.failureCode, null);
  assert.equal(row.run.terminalAt, at(500));
});

test('tombstone rows become unknown/host_restarted without a terminal time', () => {
  const journal = [
    makeAccept({ runId: 'run:5', time: at(0) }),
    makeTombstone({ runId: 'run:5', time: at(1000) }),
  ];
  const events = [
    makeEvent({
      runId: 'run:5',
      seq: 1,
      time: at(0),
      body: { type: 'run.accepted' },
    }),
    makeEvent({
      runId: 'run:5',
      seq: 2,
      time: at(10),
      body: { type: 'text.delta', text: 'partial alpha' },
    }),
  ];
  const row = buildRows({
    attempts: [
      makeAttempt({ attemptId: 'a-0005', taskId: 't01', runId: 'run:5' }),
    ],
    journal,
    events,
  })[0];
  assert.equal(row.run.status, 'unknown');
  assert.equal(row.run.terminalAt, null);
  assert.equal(row.run.durationMs, null);
  assert.equal(row.run.failureCode, null);
  assert.equal(row.run.stopReason, null);
  assert.equal(row.run.lastSeq, 2);
  assert.equal(row.notes, 'host_restarted');
  assert.equal(row.result.verdict, 'pass');
});

test('accept without terminal or tombstone becomes a retained unknown row with a note', () => {
  const journal = [makeAccept({ runId: 'run:6', time: at(0) })];
  const events = [
    makeEvent({
      runId: 'run:6',
      seq: 1,
      time: at(0),
      body: { type: 'run.accepted' },
    }),
  ];
  const row = buildRows({
    attempts: [
      makeAttempt({ attemptId: 'a-0006', taskId: 't01', runId: 'run:6' }),
    ],
    journal,
    events,
  })[0];
  assert.equal(row.run.status, 'unknown');
  assert.equal(row.notes, 'terminal_record_missing');
  assert.equal(row.run.terminalAt, null);
});

test('not_run rows are retained with null usage, zero tool calls and a reason note', () => {
  const row = buildRows({
    attempts: [
      makeAttempt({
        attemptId: 'a-0007',
        taskId: 't01',
        runId: null,
      }),
    ],
    notRun: [
      makeNotRun({
        attemptId: 'a-0007',
        reason: 'AUTHORIZATION_MISSING',
        note: 'no Provider authorization',
      }),
    ],
  })[0];
  assert.equal(row.run.status, 'not_run');
  assert.equal(row.result.verdict, 'not_run');
  assert.equal(row.run.durationMs, null);
  assert.equal(row.run.sessionId, null);
  assert.equal(row.run.projectId, null);
  assert.equal(row.run.runId, null);
  assert.equal(row.run.revision, null);
  assert.equal(row.run.adapter, null);
  assert.equal(row.run.lastSeq, null);
  assert.deepEqual(row.run.toolCalls, {
    requested: 0,
    succeeded: 0,
    rejected: 0,
    failed: 0,
    cancelled: 0,
  });
  assert.deepEqual(row.usage, {
    inputTokens: null,
    outputTokens: null,
    source: 'missing',
    estimated: null,
  });
  assert.equal(row.result.answerSha256, null);
  assert.equal(row.result.answerBytes, null);
  assert.equal(row.run.notRunReason, 'AUTHORIZATION_MISSING');
  assert.equal(row.notes, 'no Provider authorization');
});

test('tool calls are paired by callId', () => {
  const journal = [
    makeAccept({ runId: 'run:1', time: at(0) }),
    makeTerminal({
      runId: 'run:1',
      status: 'completed',
      time: at(1000),
      lastSeq: 8,
    }),
  ];
  const body = (type, extra = {}) => ({ type, ...extra });
  const events = [
    makeEvent({
      runId: 'run:1',
      seq: 1,
      time: at(0),
      body: body('run.accepted'),
    }),
    makeEvent({
      runId: 'run:1',
      seq: 2,
      time: at(10),
      body: body('tool.requested', { callId: 'call:1', tool: 'read_file' }),
    }),
    makeEvent({
      runId: 'run:1',
      seq: 3,
      time: at(11),
      body: body('tool.requested', {
        callId: 'call:2',
        tool: 'search_in_files',
      }),
    }),
    makeEvent({
      runId: 'run:1',
      seq: 4,
      time: at(20),
      body: body('tool.result', {
        callId: 'call:1',
        result: { status: 'rejected', code: 'PATH_OUTSIDE_PROJECT' },
      }),
    }),
    makeEvent({
      runId: 'run:1',
      seq: 5,
      time: at(21),
      body: body('tool.result', {
        callId: 'call:2',
        result: { status: 'succeeded', text: 'alpha', truncated: false },
      }),
    }),
    makeEvent({
      runId: 'run:1',
      seq: 6,
      time: at(30),
      body: body('text.delta', { text: 'alpha' }),
    }),
    makeEvent({
      runId: 'run:1',
      seq: 7,
      time: at(40),
      body: body('run.completed', {
        usage: { inputTokens: 1, outputTokens: 2 },
      }),
    }),
  ];
  const row = buildRows({
    attempts: [
      makeAttempt({ attemptId: 'a-0001', taskId: 't01', runId: 'run:1' }),
    ],
    journal,
    events,
  })[0];
  assert.deepEqual(row.run.toolCalls, {
    requested: 2,
    succeeded: 1,
    rejected: 1,
    failed: 0,
    cancelled: 0,
  });
});

test('scoring normalizes Markdown and supports word boundaries and negative rubrics', () => {
  assert.equal(
    normalizeForMatch('**Alpha** `code`\n\n- item'),
    'alpha code item',
  );
  const task = {
    rubric: {
      kind: 'contains_all',
      match: 'word',
      literals: ['alpha'],
      forbidden: [],
    },
  };
  assert.equal(scoreAnswer(task, 'alphabet').verdict, 'fail');
  assert.equal(scoreAnswer(task, 'the alpha value').verdict, 'pass');
  const negative = {
    rubric: {
      kind: 'contains_none',
      match: 'substring',
      literals: ['delta'],
      forbidden: ['zeta'],
    },
  };
  assert.equal(scoreAnswer(negative, 'delta only').verdict, 'pass');
  assert.equal(scoreAnswer(negative, 'delta and zeta').verdict, 'fail');
  assert.equal(scoreAnswer(negative, 'zeta').verdict, 'fail');
  assert.equal(scoreAnswer(task, '   ').verdict, 'unscorable');
  assert.equal(
    scoreAnswer(task, 'a'.repeat(ANSWER_BYTE_CAP + 1)).verdict,
    'unscorable',
  );
});

test('contains_all with forbidden requires literals present and forbidden absent', () => {
  const task = {
    rubric: {
      kind: 'contains_all',
      match: 'substring',
      literals: ['alpha', 'beta'],
      forbidden: ['cdn.example'],
    },
  };
  assert.equal(scoreAnswer(task, 'alpha beta').verdict, 'pass');
  assert.equal(scoreAnswer(task, 'alpha beta cdn.example').verdict, 'fail');
  assert.equal(scoreAnswer(task, 'alpha only').verdict, 'fail');
});

test('answer text never reaches dataset.jsonl; answers.ndjson only has normalized text', () => {
  const root = createTempRoot();
  try {
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
    const datasetText = fs.readFileSync(
      path.join(outDir, 'dataset.jsonl'),
      'utf8',
    );
    for (const answer of [
      'The answer is Alpha.',
      'I found no such token.',
      'partial alpha',
      'beta',
      'gamma',
    ]) {
      assert.equal(
        datasetText.includes(answer),
        false,
        `dataset leaked answer text: ${answer}`,
      );
    }
    const rows = readJsonl(path.join(outDir, 'dataset.jsonl'));
    const row = rows.find((entry) => entry.attemptId === 'a-0001');
    assert.equal(row.result.answerSha256, sha256('the answer is alpha.'));
    assert.equal(
      row.result.answerBytes,
      Buffer.byteLength('the answer is alpha.'),
    );
    const answers = readJsonl(path.join(outDir, 'answers.ndjson'));
    const answer = answers.find((entry) => entry.attemptId === 'a-0001');
    assert.equal(answer.normalizedAnswer, 'the answer is alpha.');
    assert.equal(answer.answerSha256, sha256('the answer is alpha.'));
    assert.equal(answer.answerSha256, row.result.answerSha256);
    assert.equal(answer.answerBytes, row.result.answerBytes);
  } finally {
    cleanup(root);
  }
});

test('build keeps every attempt routable by attemptId, taskId and variant', () => {
  const root = createTempRoot();
  try {
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
    const rows = readJsonl(path.join(outDir, 'dataset.jsonl'));
    assert.equal(rows.length, 11);
    const byAttempt = new Map(rows.map((row) => [row.attemptId, row]));
    for (const [attemptId, taskId, variantId] of [
      ['a-0001', 't01', 'pioneer-readonly-tools'],
      ['a-0003', 't03', 'pioneer-readonly-tools'],
      ['a-0007', 't07', 'pioneer-readonly-tools'],
      ['b-0002', 't02', 'fixed-prefix-no-tools'],
      ['b-0004', 't04', 'fixed-prefix-no-tools'],
    ]) {
      const row = byAttempt.get(attemptId);
      assert.equal(row.task.taskId, taskId);
      assert.equal(row.variant.variantId, variantId);
    }
  } finally {
    cleanup(root);
  }
});

test('HTML fragments and comments are not treated as absolute paths', () => {
  const root = createTempRoot();
  try {
    const captureDir = path.join(root, 'captures', 'html');
    const capture = makeCapture({
      attempts: [
        makeAttempt({ attemptId: 'a-0001', taskId: 't01', runId: 'run:1' }),
      ],
    });
    writeCaptureDirectory(captureDir, {
      capture,
      journal: [
        makeAccept({ runId: 'run:1', time: at(0) }),
        makeTerminal({
          runId: 'run:1',
          status: 'completed',
          time: at(1000),
          lastSeq: 3,
        }),
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
          body: {
            type: 'text.delta',
            text: '</div> /> // comment alpha',
          },
        }),
        makeEvent({
          runId: 'run:1',
          seq: 3,
          time: at(1000),
          body: { type: 'run.completed', usage: null },
        }),
      ],
    });
    const tasksPath = path.join(root, 'tasks.json');
    fs.writeFileSync(
      tasksPath,
      JSON.stringify(makeTasksDocument([makeTask('t01')]), null, 2),
    );
    const build = runExperimentCli('build-dataset.mjs', [
      '--captures',
      path.join(root, 'captures'),
      '--tasks',
      tasksPath,
      '--out',
      path.join(root, 'out'),
    ]);
    assert.equal(build.status, 0, build.stderr);
  } finally {
    cleanup(root);
  }
});
