/**
 * Dataset validation and deterministic analysis for the M5-A experiment.
 *
 * The row shape mirrors docs/experiments/m5a/v1/record-schema.json. Analysis
 * follows docs/experiments/m5a/v1/analysis-plan.json: three denominator layers,
 * task-level primary comparison, attempt-level Wilson only as descriptive.
 */

import {
  ANSWER_BYTE_CAP,
  DATASET_RUN_STATUSES,
  DATASET_VERDICTS,
  EVIDENCE_KINDS,
  OUTCOME_CLASSES,
  PROTOCOL_ID,
  RUN_FAILURE_CODES,
  STOP_REASONS,
  TASK_CATEGORIES,
  VARIANT_IDS,
  byteLength,
  sha256Hex,
  scoreAnswer,
} from './record.mjs';
import {
  mean,
  median,
  percentile,
  round4,
  signTest,
  sum,
  wilsonInterval,
} from './stats.mjs';

const ROW_KEYS = [
  'schemaVersion',
  'protocolId',
  'protocolVersion',
  'datasetVersion',
  'evidenceKind',
  'attemptId',
  'rowId',
  'task',
  'variant',
  'repetition',
  'orderIndex',
  'run',
  'usage',
  'result',
  'environment',
  'capture',
  'notes',
];

const TASK_ROW_KEYS = ['taskId', 'category', 'promptSha256', 'rubricId'];
const VARIANT_ROW_KEYS = ['variantId', 'harnessVersion'];
const RUN_KEYS = [
  'sessionId',
  'projectId',
  'runId',
  'revision',
  'adapter',
  'status',
  'failureCode',
  'stopReason',
  'startedAt',
  'terminalAt',
  'durationMs',
  'lastSeq',
  'toolCalls',
];
const TOOL_CALL_KEYS = [
  'requested',
  'succeeded',
  'rejected',
  'failed',
  'cancelled',
];
const USAGE_KEYS = ['inputTokens', 'outputTokens', 'source', 'estimated'];
const ESTIMATED_KEYS = ['inputTokens', 'outputTokens', 'method'];
const RESULT_KEYS = [
  'scoringMode',
  'verdict',
  'rubricId',
  'matchedLiterals',
  'requiredLiterals',
  'answerSha256',
  'answerBytes',
];
const ENVIRONMENT_KEYS = [
  'softwareCommit',
  'dirty',
  'platform',
  'nodeVersion',
  'electronVersion',
  'provider',
  'modelId',
  'endpointOrigin',
  'corpusId',
  'corpusManifestSha256',
];
const CAPTURE_KEYS = ['captureManifestSha256', 'journalSha256', 'eventsSha256'];
const ANSWERS_KEYS = [
  'attemptId',
  'taskId',
  'variantId',
  'normalizedAnswer',
  'answerSha256',
  'answerBytes',
];

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ATTEMPT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
const TASK_ID_PATTERN = /^t[0-9]{2}$/;
const RUBRIC_ID_PATTERN = /^r[0-9]{2}$/;
const ISO_DATETIME_PATTERN =
  /^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?Z$/;

class DatasetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DatasetError';
  }
}

function fail(message) {
  throw new DatasetError(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, path) {
  if (!isPlainObject(value)) fail(`${path}: expected an object`);
}

function assertExactKeys(value, path, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${path}: unknown field "${key}"`);
  }
}

function requireKeys(value, path, keys) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail(`${path}: missing field "${key}"`);
    }
  }
}

function assertArray(value, path, options = {}) {
  if (!Array.isArray(value)) fail(`${path}: expected an array`);
  if (value.length < (options.min ?? 0)) {
    fail(`${path}: expected at least ${options.min} item(s)`);
  }
}

function assertString(value, path, options = {}) {
  const {
    min = 0,
    max = Number.POSITIVE_INFINITY,
    pattern = null,
    nullable = false,
  } = options;
  if (value === null && nullable) return;
  if (typeof value !== 'string') {
    fail(`${path}: expected a string${nullable ? ' or null' : ''}`);
  }
  if (value.length < min) fail(`${path}: must be at least ${min} characters`);
  if (value.length > max) fail(`${path}: must be at most ${max} characters`);
  if (pattern !== null && !pattern.test(value)) {
    fail(`${path}: has an invalid format`);
  }
}

function assertInteger(value, path, options = {}) {
  const {
    min = Number.NEGATIVE_INFINITY,
    max = Number.POSITIVE_INFINITY,
    nullable = false,
  } = options;
  if (value === null && nullable) return;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    fail(`${path}: expected a safe integer${nullable ? ' or null' : ''}`);
  }
  if (value < min) fail(`${path}: must be >= ${min}`);
  if (value > max) fail(`${path}: must be <= ${max}`);
}

function assertBoolean(value, path) {
  if (typeof value !== 'boolean') fail(`${path}: expected a boolean`);
}

function assertDatetime(value, path, nullable = false) {
  assertString(value, path, { min: 20, nullable });
  if (value === null) return;
  if (!ISO_DATETIME_PATTERN.test(value)) {
    fail(`${path}: expected an ISO 8601 UTC date-time`);
  }
}

function assertEnum(value, path, allowed) {
  if (!allowed.includes(value)) {
    fail(`${path}: expected one of ${allowed.join(', ')}`);
  }
}

function assertHash(value, path, nullable = false) {
  assertString(value, path, { pattern: SHA256_PATTERN, nullable });
}

function validateToolCalls(toolCalls, path) {
  assertObject(toolCalls, path);
  assertExactKeys(toolCalls, path, TOOL_CALL_KEYS);
  requireKeys(toolCalls, path, TOOL_CALL_KEYS);
  for (const key of TOOL_CALL_KEYS) {
    assertInteger(toolCalls[key], `${path}.${key}`, { min: 0 });
  }
}

function validateUsage(usage, path) {
  assertObject(usage, path);
  assertExactKeys(usage, path, USAGE_KEYS);
  requireKeys(usage, path, USAGE_KEYS);
  assertInteger(usage.inputTokens, `${path}.inputTokens`, {
    min: 0,
    nullable: true,
  });
  assertInteger(usage.outputTokens, `${path}.outputTokens`, {
    min: 0,
    nullable: true,
  });
  assertEnum(usage.source, `${path}.source`, [
    'reported',
    'missing',
    'estimated',
  ]);
  const bothNull = usage.inputTokens === null && usage.outputTokens === null;
  if (usage.source === 'missing') {
    if (!bothNull) {
      fail(
        `${path}.source: missing requires inputTokens and outputTokens to be null`,
      );
    }
    if (usage.estimated !== null) {
      fail(`${path}.estimated: must be null when source is missing`);
    }
  } else if (usage.source === 'reported') {
    if (usage.inputTokens === null || usage.outputTokens === null) {
      fail(`${path}.source: reported requires both token values`);
    }
    if (usage.estimated !== null) {
      fail(`${path}.estimated: must be null when source is reported`);
    }
  } else {
    assertObject(usage.estimated, `${path}.estimated`);
    assertExactKeys(usage.estimated, `${path}.estimated`, ESTIMATED_KEYS);
    requireKeys(usage.estimated, `${path}.estimated`, ESTIMATED_KEYS);
    assertInteger(
      usage.estimated.inputTokens,
      `${path}.estimated.inputTokens`,
      { min: 0 },
    );
    assertInteger(
      usage.estimated.outputTokens,
      `${path}.estimated.outputTokens`,
      { min: 0 },
    );
    if (usage.estimated.method !== 'bytes/4') {
      fail(`${path}.estimated.method: expected "bytes/4"`);
    }
  }
}

function validateEnvironment(environment, path) {
  assertObject(environment, path);
  assertExactKeys(environment, path, ENVIRONMENT_KEYS);
  requireKeys(environment, path, ENVIRONMENT_KEYS);
  assertString(environment.softwareCommit, `${path}.softwareCommit`, {
    pattern: /^[0-9a-f]{40}$/,
  });
  assertBoolean(environment.dirty, `${path}.dirty`);
  assertString(environment.platform, `${path}.platform`, {
    min: 1,
    max: 64,
  });
  assertString(environment.nodeVersion, `${path}.nodeVersion`, {
    min: 1,
    max: 32,
  });
  assertString(environment.electronVersion, `${path}.electronVersion`, {
    min: 1,
    max: 32,
  });
  assertString(environment.provider, `${path}.provider`, {
    min: 1,
    max: 64,
  });
  assertString(environment.modelId, `${path}.modelId`, {
    min: 1,
    max: 128,
  });
  assertString(environment.endpointOrigin, `${path}.endpointOrigin`, {
    pattern: /^https:\/\/[^/?#@]+$/,
  });
  assertString(environment.corpusId, `${path}.corpusId`, {
    min: 1,
    max: 64,
  });
  assertHash(environment.corpusManifestSha256, `${path}.corpusManifestSha256`);
}

export function validateDatasetRow(row, label = 'dataset row') {
  assertObject(row, label);
  assertExactKeys(row, label, ROW_KEYS);
  requireKeys(row, label, ROW_KEYS);
  if (row.schemaVersion !== 1) {
    fail(`${label}.schemaVersion: expected 1`);
  }
  if (row.protocolId !== PROTOCOL_ID) {
    fail(`${label}.protocolId: expected "${PROTOCOL_ID}"`);
  }
  assertInteger(row.protocolVersion, `${label}.protocolVersion`, { min: 1 });
  assertInteger(row.datasetVersion, `${label}.datasetVersion`, { min: 1 });
  assertEnum(row.evidenceKind, `${label}.evidenceKind`, EVIDENCE_KINDS);
  assertString(row.attemptId, `${label}.attemptId`, {
    pattern: ATTEMPT_ID_PATTERN,
  });
  assertString(row.rowId, `${label}.rowId`, {
    pattern: /^[a-z-]+:v[0-9]+:[a-z0-9-]+$/,
  });
  const expectedRowId = `${row.evidenceKind}:v${row.datasetVersion}:${row.attemptId}`;
  if (row.rowId !== expectedRowId) {
    fail(`${label}.rowId: expected "${expectedRowId}"`);
  }

  assertObject(row.task, `${label}.task`);
  assertExactKeys(row.task, `${label}.task`, TASK_ROW_KEYS);
  requireKeys(row.task, `${label}.task`, TASK_ROW_KEYS);
  assertString(row.task.taskId, `${label}.task.taskId`, {
    pattern: TASK_ID_PATTERN,
  });
  assertEnum(row.task.category, `${label}.task.category`, TASK_CATEGORIES);
  assertHash(row.task.promptSha256, `${label}.task.promptSha256`);
  assertString(row.task.rubricId, `${label}.task.rubricId`, {
    pattern: RUBRIC_ID_PATTERN,
  });

  assertObject(row.variant, `${label}.variant`);
  assertExactKeys(row.variant, `${label}.variant`, VARIANT_ROW_KEYS);
  requireKeys(row.variant, `${label}.variant`, VARIANT_ROW_KEYS);
  assertEnum(row.variant.variantId, `${label}.variant.variantId`, VARIANT_IDS);
  assertString(row.variant.harnessVersion, `${label}.variant.harnessVersion`, {
    min: 1,
    max: 32,
  });

  assertInteger(row.repetition, `${label}.repetition`, { min: 1, max: 3 });
  assertInteger(row.orderIndex, `${label}.orderIndex`, { min: 1, max: 72 });

  assertObject(row.run, `${label}.run`);
  assertExactKeys(row.run, `${label}.run`, RUN_KEYS);
  requireKeys(row.run, `${label}.run`, RUN_KEYS);
  assertString(row.run.sessionId, `${label}.run.sessionId`, {
    min: 1,
    max: 512,
    nullable: true,
  });
  assertString(row.run.projectId, `${label}.run.projectId`, {
    min: 1,
    max: 512,
    nullable: true,
  });
  assertString(row.run.runId, `${label}.run.runId`, {
    min: 1,
    max: 512,
    nullable: true,
  });
  assertInteger(row.run.revision, `${label}.run.revision`, {
    min: 1,
    nullable: true,
  });
  assertEnum(row.run.adapter, `${label}.run.adapter`, [
    'pi',
    'controlled',
    null,
  ]);
  assertEnum(row.run.status, `${label}.run.status`, DATASET_RUN_STATUSES);
  assertEnum(row.run.failureCode, `${label}.run.failureCode`, [
    ...RUN_FAILURE_CODES,
    null,
  ]);
  assertEnum(row.run.stopReason, `${label}.run.stopReason`, [
    ...STOP_REASONS,
    null,
  ]);
  assertDatetime(row.run.startedAt, `${label}.run.startedAt`, true);
  assertDatetime(row.run.terminalAt, `${label}.run.terminalAt`, true);
  assertInteger(row.run.durationMs, `${label}.run.durationMs`, {
    min: 0,
    nullable: true,
  });
  assertInteger(row.run.lastSeq, `${label}.run.lastSeq`, {
    min: 0,
    nullable: true,
  });
  validateToolCalls(row.run.toolCalls, `${label}.run.toolCalls`);

  validateUsage(row.usage, `${label}.usage`);

  assertObject(row.result, `${label}.result`);
  assertExactKeys(row.result, `${label}.result`, RESULT_KEYS);
  requireKeys(row.result, `${label}.result`, RESULT_KEYS);
  if (row.result.scoringMode !== 'deterministic') {
    fail(`${label}.result.scoringMode: expected "deterministic"`);
  }
  assertEnum(row.result.verdict, `${label}.result.verdict`, DATASET_VERDICTS);
  assertString(row.result.rubricId, `${label}.result.rubricId`, {
    pattern: RUBRIC_ID_PATTERN,
  });
  assertInteger(row.result.matchedLiterals, `${label}.result.matchedLiterals`, {
    min: 0,
  });
  assertInteger(
    row.result.requiredLiterals,
    `${label}.result.requiredLiterals`,
    { min: 0 },
  );
  assertHash(row.result.answerSha256, `${label}.result.answerSha256`, true);
  assertInteger(row.result.answerBytes, `${label}.result.answerBytes`, {
    min: 0,
    nullable: true,
  });

  validateEnvironment(row.environment, `${label}.environment`);

  assertObject(row.capture, `${label}.capture`);
  assertExactKeys(row.capture, `${label}.capture`, CAPTURE_KEYS);
  requireKeys(row.capture, `${label}.capture`, CAPTURE_KEYS);
  for (const key of CAPTURE_KEYS) {
    assertHash(row.capture[key], `${label}.capture.${key}`);
  }

  if (row.notes !== null) {
    assertString(row.notes, `${label}.notes`, { max: 512 });
  }

  const status = row.run.status;
  const verdict = row.result.verdict;
  if ((status === 'not_run') !== (verdict === 'not_run')) {
    fail(`${label}: verdict must be not_run iff status is not_run`);
  }
  if (row.task.rubricId !== row.result.rubricId) {
    fail(`${label}.result.rubricId: must equal task.rubricId`);
  }

  if (status === 'not_run') {
    for (const key of [
      'sessionId',
      'projectId',
      'runId',
      'revision',
      'adapter',
      'lastSeq',
      'startedAt',
      'terminalAt',
      'durationMs',
    ]) {
      if (row.run[key] !== null) {
        fail(`${label}.run.${key}: must be null when status is not_run`);
      }
    }
    if (row.usage.source !== 'missing') {
      fail(`${label}.usage.source: not_run rows must be missing`);
    }
    if (row.result.answerSha256 !== null || row.result.answerBytes !== null) {
      fail(`${label}: not_run rows must not have answer digests`);
    }
    if (row.notes === null || row.notes.length === 0) {
      fail(`${label}.notes: not_run rows require a reason code`);
    }
    for (const key of TOOL_CALL_KEYS) {
      if (row.run.toolCalls[key] !== 0) {
        fail(`${label}.run.toolCalls.${key}: not_run rows must be 0`);
      }
    }
  } else {
    for (const key of [
      'sessionId',
      'projectId',
      'runId',
      'revision',
      'adapter',
      'startedAt',
    ]) {
      if (row.run[key] === null) {
        fail(`${label}.run.${key}: must not be null when status is ${status}`);
      }
    }
    if (status === 'completed') {
      if (row.run.failureCode !== null) {
        fail(`${label}.run.failureCode: completed rows must have null`);
      }
      if (row.run.stopReason !== null) {
        fail(`${label}.run.stopReason: completed rows must have null`);
      }
      if (row.run.terminalAt === null) {
        fail(`${label}.run.terminalAt: completed rows require a terminal time`);
      }
    }
    if (status === 'failed') {
      if (row.run.failureCode === null) {
        fail(`${label}.run.failureCode: failed rows require a failure code`);
      }
      if (row.run.stopReason !== null) {
        fail(`${label}.run.stopReason: failed rows must have null`);
      }
      if (row.run.terminalAt === null) {
        fail(`${label}.run.terminalAt: failed rows require a terminal time`);
      }
    }
    if (status === 'stopped') {
      if (row.run.stopReason === null) {
        fail(`${label}.run.stopReason: stopped rows require a stop reason`);
      }
      if (row.run.failureCode !== null) {
        fail(`${label}.run.failureCode: stopped rows must have null`);
      }
      if (row.run.terminalAt === null) {
        fail(`${label}.run.terminalAt: stopped rows require a terminal time`);
      }
    }
    if (status === 'unknown') {
      if (row.run.terminalAt !== null) {
        fail(
          `${label}.run.terminalAt: unknown rows must not have a terminal time`,
        );
      }
      if (row.run.durationMs !== null) {
        fail(`${label}.run.durationMs: unknown rows must not have a duration`);
      }
      if (row.run.failureCode !== null || row.run.stopReason !== null) {
        fail(`${label}: unknown rows must not infer a failure or stop reason`);
      }
    }
  }

  if (row.run.startedAt !== null && row.run.terminalAt !== null) {
    const expected =
      Date.parse(row.run.terminalAt) - Date.parse(row.run.startedAt);
    if (!Number.isSafeInteger(expected) || expected < 0) {
      fail(`${label}.run: terminal time is before the start time`);
    }
    if (row.run.durationMs !== expected) {
      fail(
        `${label}.run.durationMs: expected ${expected} (terminalAt - startedAt)`,
      );
    }
  } else if (row.run.durationMs !== null) {
    fail(
      `${label}.run.durationMs: must be null when either endpoint is missing`,
    );
  }

  return row;
}

export function parseDatasetJsonl(text, label = 'dataset.jsonl') {
  const rows = [];
  const seen = new Set();
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.length === 0) continue;
    const lineLabel = `${label}:${index + 1}`;
    let value;
    try {
      value = JSON.parse(line);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new DatasetError(`${lineLabel}: invalid JSON (${reason})`);
    }
    validateDatasetRow(value, lineLabel);
    if (seen.has(value.attemptId)) {
      throw new DatasetError(
        `${lineLabel}: duplicate attemptId "${value.attemptId}"`,
      );
    }
    seen.add(value.attemptId);
    rows.push(value);
  }
  return rows;
}

export function parseAnswersNdjson(text, label = 'answers.ndjson') {
  const answers = [];
  const seen = new Set();
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.length === 0) continue;
    const lineLabel = `${label}:${index + 1}`;
    let value;
    try {
      value = JSON.parse(line);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new DatasetError(`${lineLabel}: invalid JSON (${reason})`);
    }
    assertObject(value, lineLabel);
    assertExactKeys(value, lineLabel, ANSWERS_KEYS);
    requireKeys(value, lineLabel, ANSWERS_KEYS);
    assertString(value.attemptId, `${lineLabel}.attemptId`, {
      pattern: ATTEMPT_ID_PATTERN,
    });
    assertString(value.taskId, `${lineLabel}.taskId`, {
      pattern: TASK_ID_PATTERN,
    });
    assertEnum(value.variantId, `${lineLabel}.variantId`, VARIANT_IDS);
    assertString(value.normalizedAnswer, `${lineLabel}.normalizedAnswer`);
    assertHash(value.answerSha256, `${lineLabel}.answerSha256`);
    assertInteger(value.answerBytes, `${lineLabel}.answerBytes`, { min: 0 });
    const bytes = byteLength(value.normalizedAnswer);
    if (bytes > 4096) {
      throw new DatasetError(
        `${lineLabel}.normalizedAnswer: exceeds the 4096-byte budget`,
      );
    }
    if (seen.has(value.attemptId)) {
      throw new DatasetError(
        `${lineLabel}: duplicate attemptId "${value.attemptId}"`,
      );
    }
    seen.add(value.attemptId);
    answers.push(value);
  }
  return answers;
}

/* -------------------------------------------------------------------------- */
/* Analysis                                                                   */
/* -------------------------------------------------------------------------- */

function rate(numerator, denominator) {
  return denominator === 0 ? null : round4(numerator / denominator);
}

function proportion(numerator, denominator) {
  const interval =
    denominator === 0 ? null : wilsonInterval(numerator, denominator);
  return {
    numerator,
    denominator,
    pointEstimate: rate(numerator, denominator),
    wilson95:
      interval === null
        ? null
        : { low: round4(interval.low), high: round4(interval.high) },
  };
}

function countBy(values, keys) {
  const counts = {};
  for (const key of keys) counts[key] = 0;
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function outcomeClassOf(row) {
  const status = row.run.status;
  if (status === 'completed') {
    if (row.result.verdict === 'pass') return 'completed_pass';
    if (row.result.verdict === 'fail') return 'completed_fail';
    return 'completed_unscorable';
  }
  return status;
}

function isTimedOut(row) {
  return (
    (row.run.status === 'failed' && row.run.failureCode === 'RUN_DEADLINE') ||
    (row.run.status === 'stopped' && row.run.stopReason === 'deadline')
  );
}

function notRunReasonOf(row) {
  if (row.notes === null) return null;
  const separator = row.notes.indexOf(':');
  return separator === -1 ? row.notes : row.notes.slice(0, separator);
}

function usageMetrics(rows) {
  const reportedRows = rows.filter((row) => row.usage.source === 'reported');
  const inputValues = reportedRows.map((row) => row.usage.inputTokens);
  const outputValues = reportedRows.map((row) => row.usage.outputTokens);
  const executedCount = rows.filter(
    (row) => row.run.status !== 'not_run',
  ).length;
  const missing = rows.filter((row) => row.usage.source === 'missing').length;
  const estimated = rows.filter(
    (row) => row.usage.source === 'estimated',
  ).length;
  return {
    plannedDenominator: rows.length,
    executedCount,
    reported: reportedRows.length,
    missing,
    estimated,
    coverageRate: rate(reportedRows.length, rows.length),
    reportedAmongExecuted: rate(reportedRows.length, executedCount),
    inputTokens: {
      count: inputValues.length,
      mean: inputValues.length === 0 ? null : Math.round(mean(inputValues)),
      median: inputValues.length === 0 ? null : Math.round(median(inputValues)),
      total: inputValues.length === 0 ? null : sum(inputValues),
    },
    outputTokens: {
      count: outputValues.length,
      mean: outputValues.length === 0 ? null : Math.round(mean(outputValues)),
      median:
        outputValues.length === 0 ? null : Math.round(median(outputValues)),
      total: outputValues.length === 0 ? null : sum(outputValues),
    },
    note: 'Missing usage stays null and never becomes 0; estimated values are not mixed into reported means.',
  };
}

function durationMetrics(rows) {
  const durations = rows
    .map((row) => row.run.durationMs)
    .filter((value) => value !== null);
  const completedPassDurations = rows
    .filter(
      (row) =>
        row.run.status === 'completed' &&
        row.result.verdict === 'pass' &&
        row.run.durationMs !== null,
    )
    .map((row) => row.run.durationMs);
  return {
    plannedDenominator: rows.length,
    count: durations.length,
    excluded: {
      notRun: rows.filter((row) => row.run.status === 'not_run').length,
      unknown: rows.filter((row) => row.run.status === 'unknown').length,
      otherMissing: rows.filter(
        (row) =>
          row.run.status !== 'not_run' &&
          row.run.status !== 'unknown' &&
          row.run.durationMs === null,
      ).length,
    },
    medianMs: durations.length === 0 ? null : Math.round(median(durations)),
    p90Ms:
      durations.length === 0 ? null : Math.round(percentile(durations, 0.9)),
    completedPass: {
      count: completedPassDurations.length,
      medianMs:
        completedPassDurations.length === 0
          ? null
          : Math.round(median(completedPassDurations)),
    },
  };
}

function toolCallMetrics(rows) {
  const totals = {};
  for (const key of TOOL_CALL_KEYS) {
    totals[key] = sum(rows.map((row) => row.run.toolCalls[key]));
  }
  return {
    totals,
    meanRequested:
      rows.length === 0
        ? null
        : Math.round(mean(rows.map((row) => row.run.toolCalls.requested))),
  };
}

function answerByteMetrics(rows) {
  const values = rows
    .map((row) => row.result.answerBytes)
    .filter((value) => value !== null);
  return {
    count: values.length,
    medianBytes: values.length === 0 ? null : Math.round(median(values)),
    p90Bytes: values.length === 0 ? null : Math.round(percentile(values, 0.9)),
  };
}

function aggregateRows(rows) {
  const statuses = rows.map((row) => row.run.status);
  const verdicts = rows.map((row) => row.result.verdict);
  const completedVerdicts = rows
    .filter((row) => row.run.status === 'completed')
    .map((row) => row.result.verdict);
  const outcomes = rows.map(outcomeClassOf);
  const executedCount = rows.filter(
    (row) => row.run.status !== 'not_run',
  ).length;
  const completedPass = rows.filter(
    (row) => row.run.status === 'completed' && row.result.verdict === 'pass',
  ).length;
  const completedFail = rows.filter(
    (row) => row.run.status === 'completed' && row.result.verdict === 'fail',
  ).length;
  const completedUnscorable = rows.filter(
    (row) =>
      row.run.status === 'completed' && row.result.verdict === 'unscorable',
  ).length;
  const failureCodes = countBy(
    rows
      .filter((row) => row.run.failureCode !== null)
      .map((row) => row.run.failureCode),
    RUN_FAILURE_CODES,
  );
  const stopReasons = countBy(
    rows
      .filter((row) => row.run.stopReason !== null)
      .map((row) => row.run.stopReason),
    STOP_REASONS,
  );
  const notRunReasonValues = rows
    .filter((row) => row.run.status === 'not_run')
    .map(notRunReasonOf)
    .filter((value) => value !== null)
    .sort();
  const notRunReasons = countBy(notRunReasonValues, notRunReasonValues);
  return {
    plannedDenominator: rows.length,
    executedCount,
    completionRate: rate(completedPass, rows.length),
    successRateAmongExecuted: rate(completedPass, executedCount),
    coverage: rate(executedCount, rows.length),
    counts: {
      status: countBy(statuses, DATASET_RUN_STATUSES),
      countsOnlyMeaningfulForCompleted: true,
      verdictCounts: countBy(verdicts, DATASET_VERDICTS),
      completedVerdictCounts: countBy(completedVerdicts, DATASET_VERDICTS),
      outcomeClass: countBy(outcomes, OUTCOME_CLASSES),
      completedPass,
      completedFail,
      completedUnscorable,
      timedOut: rows.filter(isTimedOut).length,
      failureCodes,
      stopReasons,
      notRunReasons,
    },
    descriptiveAttemptLevel: {
      label: 'descriptive-only',
      caveat: '重复不是独立试验，该区间只描述本次数据；主分析单位为任务。',
      plannedDenominator: rows.length,
      executedCount,
      completedPass,
      completionRate: proportion(completedPass, rows.length),
      successRateAmongExecuted: proportion(completedPass, executedCount),
    },
    usageCoverage: usageMetrics(rows),
    duration: durationMetrics(rows),
    toolCalls: toolCallMetrics(rows),
    answerBytes: answerByteMetrics(rows),
  };
}

function buildVariantGroups(rows) {
  const variants = [
    ...new Set(rows.map((row) => row.variant.variantId)),
  ].sort();
  return variants.map((variantId) => ({
    variantId,
    ...aggregateRows(rows.filter((row) => row.variant.variantId === variantId)),
  }));
}

function buildVariantCategoryGroups(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.variant.variantId}\u0000${row.task.category}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, groupRows]) => {
      const [variantId, category] = key.split('\u0000');
      return {
        variantId,
        category,
        ...aggregateRows(groupRows),
      };
    })
    .sort((left, right) => {
      if (left.variantId !== right.variantId) {
        return left.variantId < right.variantId ? -1 : 1;
      }
      return left.category < right.category ? -1 : 1;
    });
}

function buildCells(rows) {
  const cells = new Map();
  for (const row of rows) {
    const key = `${row.variant.variantId}\u0000${row.task.taskId}`;
    let cell = cells.get(key);
    if (cell === undefined) {
      cell = {
        variantId: row.variant.variantId,
        taskId: row.task.taskId,
        category: row.task.category,
        plannedAttempts: 0,
        executedAttempts: 0,
        completedPass: 0,
        completedFail: 0,
        completedUnscorable: 0,
        failed: 0,
        stopped: 0,
        unknown: 0,
        notRun: 0,
        statusCounts: countBy([], DATASET_RUN_STATUSES),
      };
      cells.set(key, cell);
    }
    cell.plannedAttempts += 1;
    if (row.run.status !== 'not_run') cell.executedAttempts += 1;
    cell.statusCounts[row.run.status] += 1;
    if (row.run.status === 'completed') {
      if (row.result.verdict === 'pass') cell.completedPass += 1;
      else if (row.result.verdict === 'fail') cell.completedFail += 1;
      else cell.completedUnscorable += 1;
    } else if (row.run.status === 'failed') {
      cell.failed += 1;
    } else if (row.run.status === 'stopped') {
      cell.stopped += 1;
    } else if (row.run.status === 'unknown') {
      cell.unknown += 1;
    } else {
      cell.notRun += 1;
    }
  }
  return [...cells.values()]
    .map((cell) => ({
      ...cell,
      successRate: rate(cell.completedPass, cell.plannedAttempts),
      successRateAmongExecuted: rate(cell.completedPass, cell.executedAttempts),
      majorityPass: cell.completedPass >= 2,
    }))
    .sort((left, right) => {
      if (left.variantId !== right.variantId) {
        return left.variantId < right.variantId ? -1 : 1;
      }
      return left.taskId < right.taskId ? -1 : 1;
    });
}

function buildTaskLevel(rows, cells) {
  const taskIds = [...new Set(rows.map((row) => row.task.taskId))].sort();
  const categories = new Map(
    rows.map((row) => [row.task.taskId, row.task.category]),
  );
  const variantOrder = ['pioneer-readonly-tools', 'fixed-prefix-no-tools'];
  const tasks = taskIds.map((taskId) => {
    const variants = {};
    for (const variantId of variantOrder) {
      const cell = cells.find(
        (candidate) =>
          candidate.taskId === taskId && candidate.variantId === variantId,
      );
      variants[variantId] = {
        plannedAttempts: cell?.plannedAttempts ?? 0,
        executedAttempts: cell?.executedAttempts ?? 0,
        passCount: cell?.completedPass ?? 0,
        failCount: cell?.completedFail ?? 0,
        unscorableCount: cell?.completedUnscorable ?? 0,
        notRunCount: cell?.notRun ?? 0,
        failedCount: cell?.failed ?? 0,
        stoppedCount: cell?.stopped ?? 0,
        unknownCount: cell?.unknown ?? 0,
        successRate: cell?.successRate ?? null,
        successRateAmongExecuted: cell?.successRateAmongExecuted ?? null,
      };
    }
    const left = variants['pioneer-readonly-tools'].successRate;
    const right = variants['fixed-prefix-no-tools'].successRate;
    const difference =
      left === null || right === null ? null : round4(left - right);
    return {
      taskId,
      category: categories.get(taskId),
      variants,
      difference,
    };
  });
  const numericDifferences = tasks
    .map((task) => task.difference)
    .filter((value) => value !== null);
  const sign = signTest(numericDifferences);
  const passCountDistribution = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const cell of cells) {
    if (cell.completedPass <= 3) {
      passCountDistribution[cell.completedPass] += 1;
    }
  }
  return {
    unit: 'task',
    pairing: 'taskId',
    taskCount: tasks.length,
    differenceDefinition:
      'successRate(pioneer-readonly-tools) - successRate(fixed-prefix-no-tools) per taskId',
    tasks,
    summary: {
      taskCount: tasks.length,
      tasksWithDifference: numericDifferences.length,
      meanDifference:
        numericDifferences.length === 0
          ? null
          : round4(mean(numericDifferences)),
      minDifference:
        numericDifferences.length === 0
          ? null
          : Math.min(...numericDifferences),
      medianDifference:
        numericDifferences.length === 0
          ? null
          : round4(median(numericDifferences)),
      maxDifference:
        numericDifferences.length === 0
          ? null
          : Math.max(...numericDifferences),
      differences: tasks.map((task) => ({
        taskId: task.taskId,
        difference: task.difference,
      })),
      passCountDistribution,
    },
    signTest: {
      method: 'exact-binomial-sign-test',
      sides: 2,
      label: 'exploratory-only',
      ignoreZeroDifferences: true,
      unit: 'task',
      ...sign,
      pValue:
        sign.pValue === null || sign.pValue === undefined
          ? null
          : Math.round(sign.pValue * 1e6) / 1e6,
    },
  };
}

/**
 * Verify answers.ndjson against the dataset and task rubrics. Mismatches are
 * consistency findings, never primary metrics.
 */
export function verifyAnswers({ rows, answers, tasks, answerByteCap }) {
  const answerById = new Map(answers.map((entry) => [entry.attemptId, entry]));
  const rowById = new Map(rows.map((row) => [row.attemptId, row]));
  const mismatches = [];
  const skipped = [];
  let checked = 0;
  let matched = 0;

  for (const row of rows) {
    if (row.run.status !== 'completed') continue;
    const entry = answerById.get(row.attemptId);
    if (entry === undefined) {
      mismatches.push({
        attemptId: row.attemptId,
        reason: 'MISSING_ANSWER',
      });
      continue;
    }
    answerById.delete(row.attemptId);
    if (entry.taskId !== row.task.taskId) {
      mismatches.push({
        attemptId: row.attemptId,
        reason: 'TASK_MISMATCH',
        expected: row.task.taskId,
        actual: entry.taskId,
      });
      continue;
    }
    if (entry.variantId !== row.variant.variantId) {
      mismatches.push({
        attemptId: row.attemptId,
        reason: 'VARIANT_MISMATCH',
        expected: row.variant.variantId,
        actual: entry.variantId,
      });
      continue;
    }
    if (
      entry.answerSha256 !== sha256Hex(entry.normalizedAnswer) ||
      entry.answerBytes !== byteLength(entry.normalizedAnswer)
    ) {
      mismatches.push({
        attemptId: row.attemptId,
        reason: 'ANSWER_DIGEST_MISMATCH',
      });
      continue;
    }
    // An unscorable verdict with a non-empty canonical answer can only come
    // from the raw answer exceeding the scoring byte cap: answers.ndjson is
    // truncated to 4096 bytes, so replaying it cannot reproduce unscorable.
    if (
      row.result.verdict === 'unscorable' &&
      entry.normalizedAnswer.length > 0
    ) {
      skipped.push({
        attemptId: row.attemptId,
        reason: 'UNSCORABLE_ABOVE_ANSWER_CAP',
      });
      continue;
    }
    const task = tasks.get(row.task.taskId);
    if (task === undefined) {
      mismatches.push({
        attemptId: row.attemptId,
        reason: 'UNKNOWN_TASK',
        taskId: row.task.taskId,
      });
      continue;
    }
    const scored = scoreAnswer(task, entry.normalizedAnswer, answerByteCap);
    checked += 1;
    if (scored.verdict !== row.result.verdict) {
      mismatches.push({
        attemptId: row.attemptId,
        reason: 'VERDICT_MISMATCH',
        datasetVerdict: row.result.verdict,
        recomputedVerdict: scored.verdict,
      });
    } else {
      matched += 1;
    }
  }

  for (const [attemptId, entry] of answerById) {
    const row = rowById.get(attemptId);
    if (row === undefined) {
      mismatches.push({ attemptId, reason: 'UNKNOWN_ATTEMPT' });
      continue;
    }
    mismatches.push({ attemptId, reason: 'UNEXPECTED_ANSWER' });
  }

  mismatches.sort((left, right) => (left.attemptId < right.attemptId ? -1 : 1));
  return {
    checked,
    matched,
    mismatched: mismatches.length,
    skipped: skipped.length,
    mismatchedAttemptIds: mismatches.map((item) => item.attemptId),
    skippedAttemptIds: skipped.map((item) => item.attemptId),
    details: mismatches,
  };
}

/**
 * Compute the full summary object. `meta` carries input paths/hashes and the
 * answers verification block produced by the CLI.
 */
export function computeSummary({ rows, meta, answersVerification }) {
  const root = aggregateRows(rows);
  const cells = buildCells(rows);
  const taskLevel = buildTaskLevel(rows, cells);
  const evidenceKinds = [...new Set(rows.map((row) => row.evidenceKind))];
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inputs: meta.inputs,
    protocolId: rows[0]?.protocolId ?? PROTOCOL_ID,
    protocolVersion: rows[0]?.protocolVersion ?? null,
    datasetVersion: rows[0]?.datasetVersion ?? null,
    evidenceKind: evidenceKinds.length === 1 ? evidenceKinds[0] : 'mixed',
    denominator: {
      plannedDenominator: root.plannedDenominator,
      executedCount: root.executedCount,
      coverage: root.coverage,
    },
    plannedDenominator: root.plannedDenominator,
    executedCount: root.executedCount,
    completionRate: root.completionRate,
    successRateAmongExecuted: root.successRateAmongExecuted,
    coverage: root.coverage,
    counts: root.counts,
    descriptiveAttemptLevel: root.descriptiveAttemptLevel,
    usageCoverage: root.usageCoverage,
    duration: root.duration,
    toolCalls: root.toolCalls,
    answerBytes: root.answerBytes,
    byVariant: buildVariantGroups(rows),
    byVariantCategory: buildVariantCategoryGroups(rows),
    cells,
    taskLevel,
    exploratorySignTest: taskLevel.signTest,
    answersVerification,
  };
}

function formatRate(value) {
  return value === null ? 'n/a' : value.toFixed(4);
}

function formatPercent(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(2)}%`;
}

function formatInt(value) {
  return value === null ? 'n/a' : String(value);
}

function formatInterval(proportionValue) {
  if (
    proportionValue === null ||
    proportionValue.wilson95 === null ||
    proportionValue.wilson95 === undefined
  ) {
    return 'n/a';
  }
  return `[${proportionValue.wilson95.low.toFixed(4)}, ${proportionValue.wilson95.high.toFixed(4)}]`;
}

function table(headers, rows) {
  const lines = [];
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of rows) {
    lines.push(`| ${row.join(' | ')} |`);
  }
  return lines.join('\n');
}

/**
 * Render the human-readable summary. Every number is read from the summary
 * object; no value is typed by hand.
 */
export function renderSummaryMarkdown(summary) {
  const lines = [];
  const counts = summary.counts;
  lines.push('# M5-A 实验汇总');
  lines.push('');
  lines.push(`- protocolId: ${summary.protocolId}`);
  lines.push(`- protocolVersion: ${formatInt(summary.protocolVersion)}`);
  lines.push(`- datasetVersion: ${formatInt(summary.datasetVersion)}`);
  lines.push(`- evidenceKind: ${summary.evidenceKind}`);
  if (summary.evidenceKind === 'controlled') {
    lines.push('');
    lines.push('controlled pipeline check, not real model results');
  }
  lines.push('');
  lines.push('## 分母（三层）');
  lines.push('');
  lines.push(
    table(
      ['plannedDenominator', 'executedCount', 'coverage'],
      [
        [
          summary.denominator.plannedDenominator,
          summary.denominator.executedCount,
          formatRate(summary.denominator.coverage),
        ],
      ],
    ),
  );
  lines.push('');
  lines.push(
    `not_run 计入 plannedDenominator 但不计入 executedCount，也不当作模型答错。`,
  );
  lines.push('');
  lines.push('## 计数');
  lines.push('');
  lines.push(
    table(
      ['status', 'count'],
      DATASET_RUN_STATUSES.map((status) => [status, counts.status[status]]),
    ),
  );
  lines.push('');
  lines.push('### completed 行的 verdict');
  lines.push('');
  lines.push(
    '非 completed 行的 verdict 只表示该行已有的回答文本能否匹配 rubric，不进入任何比率；主指标只用 completed 且 pass 的行。',
  );
  lines.push('');
  lines.push(
    table(
      ['verdict', 'count (completed only)'],
      DATASET_VERDICTS.map((verdict) => [
        verdict,
        counts.completedVerdictCounts[verdict],
      ]),
    ),
  );
  lines.push('');
  lines.push(
    `- verdictCounts（含全部行，仅作说明，不进入比率）: ${DATASET_VERDICTS.map(
      (verdict) => `${verdict}=${counts.verdictCounts[verdict]}`,
    ).join(', ')}`,
  );
  lines.push('');
  lines.push(`- completedFail: ${counts.completedFail}`);
  lines.push(`- completedUnscorable: ${counts.completedUnscorable}`);
  lines.push(`- timedOut: ${counts.timedOut}`);
  lines.push(
    `- notRunReasons: ${
      Object.keys(counts.notRunReasons).length === 0
        ? 'none'
        : Object.entries(counts.notRunReasons)
            .map(([reason, count]) => `${reason}=${count}`)
            .join(', ')
    }`,
  );
  lines.push('');
  lines.push('## 主指标（任务级）');
  lines.push('');
  lines.push(
    table(
      [
        'taskId',
        'category',
        'V0 pass/attempts',
        'V0 rate',
        'V1 pass/attempts',
        'V1 rate',
        'V1 - V0',
      ],
      summary.taskLevel.tasks.map((task) => [
        task.taskId,
        task.category,
        `${task.variants['fixed-prefix-no-tools'].passCount}/${task.variants['fixed-prefix-no-tools'].plannedAttempts}`,
        formatRate(task.variants['fixed-prefix-no-tools'].successRate),
        `${task.variants['pioneer-readonly-tools'].passCount}/${task.variants['pioneer-readonly-tools'].plannedAttempts}`,
        formatRate(task.variants['pioneer-readonly-tools'].successRate),
        formatRate(task.difference),
      ]),
    ),
  );
  lines.push('');
  lines.push(
    `- meanDifference: ${formatRate(summary.taskLevel.summary.meanDifference)}`,
  );
  lines.push(
    `- minDifference: ${formatRate(summary.taskLevel.summary.minDifference)}`,
  );
  lines.push(
    `- medianDifference: ${formatRate(summary.taskLevel.summary.medianDifference)}`,
  );
  lines.push(
    `- maxDifference: ${formatRate(summary.taskLevel.summary.maxDifference)}`,
  );
  lines.push(
    `- difference distribution: ${summary.taskLevel.summary.differences
      .map((item) => `${item.taskId}=${formatRate(item.difference)}`)
      .join(', ')}`,
  );
  lines.push(
    `- cell pass-count distribution: 0=${summary.taskLevel.summary.passCountDistribution[0]}, 1=${summary.taskLevel.summary.passCountDistribution[1]}, 2=${summary.taskLevel.summary.passCountDistribution[2]}, 3=${summary.taskLevel.summary.passCountDistribution[3]}`,
  );
  lines.push('');
  lines.push('## 探索性符号检验（任务级）');
  lines.push('');
  lines.push(
    `- method: ${summary.exploratorySignTest.method}; label: ${summary.exploratorySignTest.label}; unit: ${summary.exploratorySignTest.unit}`,
  );
  lines.push(
    `- non-zero differences: ${summary.exploratorySignTest.n}; positive: ${summary.exploratorySignTest.positive}; negative: ${summary.exploratorySignTest.negative}; ties: ${summary.exploratorySignTest.zero}`,
  );
  lines.push(
    `- exact two-sided p-value: ${summary.exploratorySignTest.pValue}`,
  );
  lines.push('- 12 个任务太少，只作方向性旁证，不作确认性显著性结论。');
  lines.push('');
  lines.push('## 尝试级描述统计（不是主结论）');
  lines.push('');
  lines.push(
    `- planned denominator: ${summary.descriptiveAttemptLevel.plannedDenominator}`,
  );
  lines.push(
    `- completedPass: ${summary.descriptiveAttemptLevel.completedPass}`,
  );
  lines.push(
    `- completionRate (completed_pass / planned): ${formatRate(summary.descriptiveAttemptLevel.completionRate.pointEstimate)}; Wilson 95% ${formatInterval(summary.descriptiveAttemptLevel.completionRate)}`,
  );
  lines.push(
    `- successRateAmongExecuted: ${formatRate(summary.descriptiveAttemptLevel.successRateAmongExecuted.pointEstimate)}; Wilson 95% ${formatInterval(summary.descriptiveAttemptLevel.successRateAmongExecuted)}`,
  );
  lines.push(
    `- 注意：重复不是独立试验，该 Wilson 区间只描述本次数据，主分析单位为任务。`,
  );
  lines.push('');
  lines.push('## usage 覆盖率');
  lines.push('');
  lines.push(
    table(
      ['planned', 'executed', 'reported', 'missing', 'estimated', 'coverage'],
      [
        [
          summary.usageCoverage.plannedDenominator,
          summary.usageCoverage.executedCount,
          summary.usageCoverage.reported,
          summary.usageCoverage.missing,
          summary.usageCoverage.estimated,
          formatRate(summary.usageCoverage.coverageRate),
        ],
      ],
    ),
  );
  lines.push('');
  lines.push(
    `- reported input tokens: count=${summary.usageCoverage.inputTokens.count}, mean=${formatInt(summary.usageCoverage.inputTokens.mean)}, median=${formatInt(summary.usageCoverage.inputTokens.median)}, total=${formatInt(summary.usageCoverage.inputTokens.total)}`,
  );
  lines.push(
    `- reported output tokens: count=${summary.usageCoverage.outputTokens.count}, mean=${formatInt(summary.usageCoverage.outputTokens.mean)}, median=${formatInt(summary.usageCoverage.outputTokens.median)}, total=${formatInt(summary.usageCoverage.outputTokens.total)}`,
  );
  if (summary.usageCoverage.reported === 0) {
    lines.push(
      '- token 指标不可测：没有任何 Provider 报告 usage 的 run，缺失值未补 0。',
    );
  }
  lines.push('');
  lines.push('## 耗时');
  lines.push('');
  lines.push(
    `- count: ${summary.duration.count}; median: ${formatInt(summary.duration.medianMs)} ms; p90: ${formatInt(summary.duration.p90Ms)} ms`,
  );
  lines.push(
    `- excluded: not_run=${summary.duration.excluded.notRun}, unknown=${summary.duration.excluded.unknown}, other missing=${summary.duration.excluded.otherMissing}`,
  );
  lines.push(
    `- completed_pass subset: count=${summary.duration.completedPass.count}, median=${formatInt(summary.duration.completedPass.medianMs)} ms`,
  );
  lines.push('');
  lines.push('## 按变体');
  lines.push('');
  lines.push(
    table(
      [
        'variantId',
        'planned',
        'executed',
        'completed_pass',
        'completionRate',
        'successRateAmongExecuted',
        'coverage',
        'reported usage',
        'medianMs',
        'p90Ms',
      ],
      summary.byVariant.map((group) => [
        group.variantId,
        group.plannedDenominator,
        group.executedCount,
        group.counts.completedPass,
        formatRate(group.completionRate),
        formatRate(group.successRateAmongExecuted),
        formatRate(group.coverage),
        group.usageCoverage.reported,
        formatInt(group.duration.medianMs),
        formatInt(group.duration.p90Ms),
      ]),
    ),
  );
  lines.push('');
  lines.push('## 按变体 × 任务类别');
  lines.push('');
  lines.push(
    table(
      [
        'variantId',
        'category',
        'planned',
        'executed',
        'completed_pass',
        'completionRate',
        'successRateAmongExecuted',
        'medianMs',
      ],
      summary.byVariantCategory.map((group) => [
        group.variantId,
        group.category,
        group.plannedDenominator,
        group.executedCount,
        group.counts.completedPass,
        formatRate(group.completionRate),
        formatRate(group.successRateAmongExecuted),
        formatInt(group.duration.medianMs),
      ]),
    ),
  );
  lines.push('');
  lines.push('## 任务格 pass 分布（每格 3 次重复）');
  lines.push('');
  lines.push(
    table(
      [
        'variantId',
        'taskId',
        'category',
        'planned',
        'executed',
        'completed_pass',
        'majorityPass',
      ],
      summary.cells.map((cell) => [
        cell.variantId,
        cell.taskId,
        cell.category,
        cell.plannedAttempts,
        cell.executedAttempts,
        cell.completedPass,
        cell.majorityPass ? 'pass' : 'not_pass',
      ]),
    ),
  );
  lines.push('');
  lines.push('## answers.ndjson 复算一致性');
  lines.push('');
  if (!summary.answersVerification.present) {
    lines.push('- answers.ndjson: not present (score recheck skipped)');
  } else {
    lines.push(`- answers.ndjson: ${summary.answersVerification.path}`);
    lines.push(
      `- checked: ${summary.answersVerification.checked}; matched: ${summary.answersVerification.matched}; mismatched: ${summary.answersVerification.mismatched}; skipped: ${summary.answersVerification.skipped}`,
    );
    if (summary.answersVerification.mismatchedAttemptIds.length > 0) {
      lines.push(
        `- mismatched attemptId: ${summary.answersVerification.mismatchedAttemptIds.join(', ')}`,
      );
    }
    if (summary.answersVerification.skippedAttemptIds.length > 0) {
      lines.push(
        `- skipped attemptId (answer above byte cap): ${summary.answersVerification.skippedAttemptIds.join(', ')}`,
      );
    }
    lines.push('- 该项只是评分一致性自检，不进入主指标。');
  }
  lines.push('');
  lines.push('## 输入');
  lines.push('');
  for (const [key, value] of Object.entries(summary.inputs)) {
    if (value === null) continue;
    lines.push(`- ${key}: ${value.path} (sha256 ${value.sha256})`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export { ANSWER_BYTE_CAP };
