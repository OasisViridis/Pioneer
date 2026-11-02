/**
 * M5-A experiment record tooling (protocol v1).
 *
 * This module is the single implementation of capture validation, de-identification,
 * deterministic scoring and dataset-row construction. It is intentionally dependency
 * free: only `node:` builtins are imported so `node tools/experiments/...` works in a
 * bare checkout.
 *
 * The field names below are frozen by docs/experiments/m5a/v1/protocol.json,
 * tasks.json, analysis-plan.json and record-schema.json. Do not rename them.
 */

import { createHash } from 'node:crypto';

import {
  ExperimentError,
  ISO_DATETIME_PATTERN,
  SHA256_PATTERN,
  assertArray,
  assertBoolean,
  assertDatetime,
  assertEnum,
  assertExactKeys,
  assertInteger,
  assertObject,
  assertString,
  fail,
  requireKeys,
} from './assertions.mjs';

export { ExperimentError, ISO_DATETIME_PATTERN, SHA256_PATTERN };

/** Frozen protocol identity (protocol.json). */
export const PROTOCOL_ID = 'm5a-harness-context-comparison';
export const CAPTURE_SCHEMA_VERSION = 1;
export const PROTOCOL_VERSION = 1;
export const DATASET_VERSION = 1;

export const EVIDENCE_KINDS = Object.freeze(['controlled', 'real-provider']);

/** Variant ids frozen in protocol v1 (V0 was renamed before data collection). */
export const VARIANT_IDS = Object.freeze([
  'pioneer-readonly-tools',
  'fixed-prefix-no-tools',
]);

export const TASK_CATEGORIES = Object.freeze([
  'locate-exact-fact',
  'aggregate-count',
  'cross-file-synthesis',
  'negative-scope',
]);

/** Mirrors RunStatusSchema.options from apps/desktop/src/shared/contracts/pioneer-run.ts. */
export const PRODUCT_RUN_STATUSES = Object.freeze([
  'starting',
  'running',
  'stopping',
  'unknown',
  'completed',
  'failed',
  'stopped',
]);

/** Journal terminal statuses (RunJournalTerminalSchema). */
export const TERMINAL_RUN_STATUSES = Object.freeze([
  'completed',
  'failed',
  'stopped',
]);

/** Statuses that may appear in a dataset row; `not_run` is experiment-layer only. */
export const DATASET_RUN_STATUSES = Object.freeze([
  'completed',
  'failed',
  'stopped',
  'unknown',
  'not_run',
]);

/** Verdicts allowed by record-schema.json. */
export const DATASET_VERDICTS = Object.freeze([
  'pass',
  'fail',
  'unscorable',
  'not_run',
]);

/** Derived outcome classes from analysis-plan.json step 4. */
export const OUTCOME_CLASSES = Object.freeze([
  'completed_pass',
  'completed_fail',
  'completed_unscorable',
  'failed',
  'stopped',
  'unknown',
  'not_run',
]);

/** Mirrors RunFailureCodeSchema.options; order is part of the frozen contract. */
export const RUN_FAILURE_CODES = Object.freeze([
  'START_FAILED',
  'MODEL_FAILED',
  'TOOL_FAILED',
  'PROTOCOL_ERROR',
  'OUTPUT_LIMIT',
  'RUN_DEADLINE',
  'AUTHORIZATION_REVOKED',
  'STOP_TIMEOUT',
  'ADAPTER_DISCONNECTED',
]);

/** Mirrors run.stop_requested.reason. */
export const STOP_REASONS = Object.freeze([
  'user',
  'window_closed',
  'deadline',
  'authorization_revoked',
  'host_failure',
]);

export const TOOL_NAMES = Object.freeze([
  'read_file',
  'list_directory',
  'search_in_files',
]);

const TOOL_REJECTION_CODES = Object.freeze([
  'TOOL_NOT_ALLOWED',
  'INVALID_TOOL_REQUEST',
  'INVALID_PATH',
  'PROJECT_UNAVAILABLE',
  'PATH_UNAVAILABLE',
  'PATH_OUTSIDE_PROJECT',
  'LINK_NOT_ALLOWED',
  'PATH_TYPE_NOT_ALLOWED',
  'SENSITIVE_PATH',
  'CONTENT_NOT_ALLOWED',
  'MATERIAL_NOT_ALLOWED',
  'BUDGET_EXCEEDED',
  'TOOL_FAILED',
  'CANCELLED',
]);

/** Protocol v1 answer cap for a scorable answer (scoring.answerByteCap). */
export const ANSWER_BYTE_CAP = 65536;
/** answers.ndjson keeps only a bounded normalized answer. */
export const ANSWERS_ANSWER_BYTE_CAP = 4096;
/** Mirrors RUN_LIMITS from the run contract where the capture format depends on it. */
export const RUN_EVENT_LIMITS = Object.freeze({
  eventBytes: 16384,
  textChunkBytes: 4096,
});

export const ID_PATTERN = /^[a-zA-Z0-9:_-]+$/;
export const ATTEMPT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
export const TASK_ID_PATTERN = /^t[0-9]{2}$/;
export const RUBRIC_ID_PATTERN = /^r[0-9]{2}$/;

/** Structured not_run reasons allowed by record-schema.json run.notRunReason. */
export const NOT_RUN_REASON_CODES = Object.freeze([
  'AUTHORIZATION_MISSING',
  'PROVIDER_UNAVAILABLE',
  'MATERIAL_MISSING',
  'BUDGET_EXHAUSTED',
  'OPERATOR_ABORT',
  'TOOL_UNAVAILABLE',
]);

/**
 * Adapters accepted by the collection layer.
 * - `pi` = the product Pi adapter.
 * - `controlled` = the product deterministic adapter, or a capture writer
 *   standing in for it.
 * - `baseline-runner` = the M5-A fixed-prefix baseline runner; it is never a
 *   product Run host, but V0 captures still need an adapter value.
 * The product schemas only allow controlled|pi; the parity test documents the
 * one intentional experiment-only addition.
 */
export const PRODUCT_RUN_ADAPTERS = Object.freeze(['controlled', 'pi']);
export const RUN_ADAPTERS = Object.freeze([
  ...PRODUCT_RUN_ADAPTERS,
  'baseline-runner',
]);

function assertByteLength(value, path, maxBytes) {
  if (Buffer.byteLength(value, 'utf8') > maxBytes) {
    fail(`${path}: exceeds the ${maxBytes}-byte budget`);
  }
}

export function sha256Hex(input) {
  return createHash('sha256').update(input).digest('hex');
}

export function byteLength(value) {
  return Buffer.byteLength(value, 'utf8');
}

export function truncateUtf8(value, maxBytes) {
  if (byteLength(value) <= maxBytes) return value;
  let output = '';
  let used = 0;
  for (const character of value) {
    const size = byteLength(character);
    if (used + size > maxBytes) break;
    output += character;
    used += size;
  }
  return output;
}

/* -------------------------------------------------------------------------- */
/* De-identification scanner                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Precise de-identification rules confirmed by the Lead. They deliberately do
 * not treat every `/` as a path: `</div>`, `/>` and `// comment` are legal
 * answer/HTML fragments and must not reject a capture.
 */
const SENSITIVE_PATTERNS = Object.freeze([
  {
    name: 'windows-absolute-path',
    test: (value) => /(?:^|[^A-Za-z0-9])[A-Za-z]:[\\/]/.test(value),
  },
  {
    name: 'unc-path',
    test: (value) => /\\\\[A-Za-z0-9._-]+\\/.test(value),
  },
  {
    name: 'posix-absolute-path',
    test: (value) =>
      /(?:^|\s)\/(?:Users|home|tmp|var|etc|opt|mnt|root|private)\//.test(value),
  },
  {
    name: 'credential-sk',
    test: (value) => /(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{8,}/.test(value),
  },
  {
    name: 'credential-bearer',
    test: (value) => /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/i.test(value),
  },
  {
    name: 'credential-pem',
    test: (value) => /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value),
  },
]);

/** Returns the first matching sensitive pattern name, or null. */
export function scanSensitiveValue(value) {
  if (typeof value !== 'string') return null;
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(value)) return pattern.name;
  }
  return null;
}

function walkStringFields(value, path, visit) {
  if (typeof value === 'string') {
    visit(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkStringFields(item, `${path}[${index}]`, visit);
    });
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      walkStringFields(child, path === '' ? key : `${path}.${key}`, visit);
    }
  }
}

function lineOfJsonString(rawText, value) {
  const needle = JSON.stringify(value);
  let index = rawText.indexOf(needle);
  if (index < 0) index = rawText.indexOf(value);
  if (index < 0) return 1;
  return rawText.slice(0, index).split('\n').length;
}

function jsonErrorLine(error) {
  if (!(error instanceof Error)) return 1;
  const match = /line (\d+)/.exec(error.message);
  return match === null ? 1 : Number(match[1]);
}

/**
 * Scan every string field of the capture inputs. `files` entries are
 * `{file, text, format: 'json'|'ndjson'}`. Returns violations with the source
 * file, line and field path (e.g. events.ndjson:4:body.text).
 */
export function scanCaptureInputs(files) {
  const violations = [];
  for (const file of files) {
    if (file.format === 'ndjson') {
      const lines = file.text.split('\n');
      lines.forEach((lineText, index) => {
        const trimmed = lineText.trim();
        if (trimmed.length === 0) return;
        let value;
        try {
          value = JSON.parse(trimmed);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new ExperimentError(
            `${file.file}:${index + 1}: invalid JSON (${reason})`,
          );
        }
        walkStringFields(value, '', (stringValue, fieldPath) => {
          const pattern = scanSensitiveValue(stringValue);
          if (pattern !== null) {
            violations.push({
              file: file.file,
              line: index + 1,
              field: fieldPath,
              pattern,
            });
          }
        });
      });
      continue;
    }
    let value;
    try {
      value = JSON.parse(file.text);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new ExperimentError(
        `${file.file}:${jsonErrorLine(error)}: invalid JSON (${reason})`,
      );
    }
    walkStringFields(value, '', (stringValue, fieldPath) => {
      const pattern = scanSensitiveValue(stringValue);
      if (pattern !== null) {
        violations.push({
          file: file.file,
          line: lineOfJsonString(file.text, stringValue),
          field: fieldPath,
          pattern,
        });
      }
    });
  }
  return violations;
}

export function formatViolation(violation) {
  return `${violation.file}:${violation.line}:${violation.field}: sensitive content (${violation.pattern})`;
}

/**
 * Scan the three capture inputs and throw when any credential/path shape is
 * present. The message names file, line and field; nothing is rewritten.
 */
export function assertCaptureIsDeidentified(files) {
  const violations = scanCaptureInputs(files);
  if (violations.length > 0) {
    const first = formatViolation(violations[0]);
    const suffix =
      violations.length > 1 ? ` (+${violations.length - 1} more)` : '';
    throw new ExperimentError(
      `${first}${suffix}`,
      violations.map(formatViolation),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Capture manifest validation (spec §3, strict)                              */
/* -------------------------------------------------------------------------- */

const CAPTURE_KEYS = [
  'schemaVersion',
  'protocolId',
  'protocolVersion',
  'datasetVersion',
  'evidenceKind',
  'variantId',
  'harnessVersion',
  'repetition',
  'orderIndex',
  'environment',
  'attempts',
  'notRun',
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

const ATTEMPT_KEYS = [
  'attemptId',
  'taskId',
  'variantId',
  'repetition',
  'orderIndex',
  'runId',
  'status',
];

const NOT_RUN_KEYS = ['attemptId', 'reason', 'note'];

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
  assertString(
    environment.corpusManifestSha256,
    `${path}.corpusManifestSha256`,
    { pattern: SHA256_PATTERN },
  );
}

/**
 * Validate capture.json against the frozen strict shape. Unknown fields are a
 * hard error (spec §3) and the attempt/notRun cross rules are enforced here.
 */
export function validateCaptureManifest(manifest, label = 'capture.json') {
  assertObject(manifest, label);
  assertExactKeys(manifest, label, CAPTURE_KEYS);
  requireKeys(manifest, label, CAPTURE_KEYS);
  assertInteger(manifest.schemaVersion, `${label}.schemaVersion`);
  if (manifest.schemaVersion !== CAPTURE_SCHEMA_VERSION) {
    fail(
      `${label}.schemaVersion: capture schema version must be ${CAPTURE_SCHEMA_VERSION}`,
    );
  }
  if (manifest.protocolId !== PROTOCOL_ID) {
    fail(`${label}.protocolId: expected "${PROTOCOL_ID}"`);
  }
  assertInteger(manifest.protocolVersion, `${label}.protocolVersion`, {
    min: 1,
  });
  assertInteger(manifest.datasetVersion, `${label}.datasetVersion`, { min: 1 });
  assertEnum(manifest.evidenceKind, `${label}.evidenceKind`, EVIDENCE_KINDS);
  assertEnum(manifest.variantId, `${label}.variantId`, VARIANT_IDS);
  assertString(manifest.harnessVersion, `${label}.harnessVersion`, {
    min: 1,
    max: 32,
  });
  assertInteger(manifest.repetition, `${label}.repetition`, {
    min: 1,
    max: 3,
  });
  assertInteger(manifest.orderIndex, `${label}.orderIndex`, {
    min: 1,
    max: 72,
  });
  validateEnvironment(manifest.environment, `${label}.environment`);

  assertArray(manifest.attempts, `${label}.attempts`, { min: 1 });
  const attemptIds = new Set();
  const runIds = new Set();
  manifest.attempts.forEach((attempt, index) => {
    const path = `${label}.attempts[${index}]`;
    assertObject(attempt, path);
    assertExactKeys(attempt, path, ATTEMPT_KEYS);
    requireKeys(attempt, path, ATTEMPT_KEYS);
    assertString(attempt.attemptId, `${path}.attemptId`, {
      pattern: ATTEMPT_ID_PATTERN,
    });
    if (attemptIds.has(attempt.attemptId)) {
      fail(`${path}.attemptId: duplicate attemptId "${attempt.attemptId}"`);
    }
    attemptIds.add(attempt.attemptId);
    assertString(attempt.taskId, `${path}.taskId`, {
      pattern: TASK_ID_PATTERN,
    });
    assertEnum(attempt.variantId, `${path}.variantId`, VARIANT_IDS);
    if (attempt.variantId !== manifest.variantId) {
      fail(`${path}.variantId: must match the capture variantId`);
    }
    assertInteger(attempt.repetition, `${path}.repetition`, {
      min: 1,
      max: 3,
    });
    assertInteger(attempt.orderIndex, `${path}.orderIndex`, {
      min: 1,
      max: 72,
    });
    if (attempt.runId !== null) {
      assertString(attempt.runId, `${path}.runId`, { min: 1, max: 512 });
      if (runIds.has(attempt.runId)) {
        fail(`${path}.runId: duplicate runId "${attempt.runId}"`);
      }
      runIds.add(attempt.runId);
    }
    if (attempt.status !== 'registered') {
      fail(`${path}.status: expected "registered"`);
    }
  });

  assertArray(manifest.notRun, `${label}.notRun`);
  const notRunIds = new Set();
  manifest.notRun.forEach((entry, index) => {
    const path = `${label}.notRun[${index}]`;
    assertObject(entry, path);
    assertExactKeys(entry, path, NOT_RUN_KEYS);
    requireKeys(entry, path, ['attemptId', 'reason']);
    assertString(entry.attemptId, `${path}.attemptId`, {
      pattern: ATTEMPT_ID_PATTERN,
    });
    if (notRunIds.has(entry.attemptId)) {
      fail(`${path}.attemptId: duplicate notRun entry`);
    }
    notRunIds.add(entry.attemptId);
    assertEnum(entry.reason, `${path}.reason`, NOT_RUN_REASON_CODES);
    if (entry.note !== undefined) {
      assertString(entry.note, `${path}.note`, { min: 0, max: 512 });
    }
  });

  const attemptsById = new Map(
    manifest.attempts.map((attempt) => [attempt.attemptId, attempt]),
  );
  for (const entry of manifest.notRun) {
    const attempt = attemptsById.get(entry.attemptId);
    if (attempt === undefined) {
      fail(
        `${label}.notRun: attemptId "${entry.attemptId}" is not registered in attempts`,
      );
    }
    if (attempt.runId !== null) {
      fail(
        `${label}.notRun: attempt "${entry.attemptId}" has runId but is marked not_run`,
      );
    }
  }
  for (const attempt of manifest.attempts) {
    if (attempt.runId === null && !notRunIds.has(attempt.attemptId)) {
      fail(
        `${label}.attempts: attempt "${attempt.attemptId}" has no run and no notRun record`,
      );
    }
  }
  return manifest;
}

/* -------------------------------------------------------------------------- */
/* tasks.json validation (shape confirmed by the Lead)                        */
/* -------------------------------------------------------------------------- */

const TASK_REQUIRED_KEYS = ['taskId', 'category', 'rubricId', 'rubric'];

function validateLiteralList(value, path) {
  assertArray(value, path);
  const seen = new Set();
  const literals = value.map((literal, index) => {
    const itemPath = `${path}[${index}]`;
    assertString(literal, itemPath, { min: 1 });
    if (!/^[\x20-\x7E]+$/.test(literal)) {
      fail(`${itemPath}: literals must be printable ASCII`);
    }
    if (seen.has(literal)) fail(`${itemPath}: duplicate literal "${literal}"`);
    seen.add(literal);
    return literal;
  });
  return literals;
}

function validateTaskDocumentEntry(task, index, label) {
  const path = `${label}.tasks[${index}]`;
  assertObject(task, path);
  requireKeys(task, path, TASK_REQUIRED_KEYS);
  assertString(task.taskId, `${path}.taskId`, { pattern: TASK_ID_PATTERN });
  assertEnum(task.category, `${path}.category`, TASK_CATEGORIES);
  assertString(task.rubricId, `${path}.rubricId`, {
    pattern: RUBRIC_ID_PATTERN,
  });

  if (task.prompt !== undefined) {
    assertString(task.prompt, `${path}.prompt`, { min: 1 });
  }
  if (task.promptSha256 !== undefined) {
    assertString(task.promptSha256, `${path}.promptSha256`, {
      pattern: SHA256_PATTERN,
    });
  }
  let promptSha256;
  if (task.prompt !== undefined) {
    const computed = sha256Hex(task.prompt);
    if (task.promptSha256 !== undefined && task.promptSha256 !== computed) {
      fail(
        `${path}.promptSha256: does not match the sha256 of prompt (expected ${computed})`,
      );
    }
    promptSha256 = computed;
  } else if (task.promptSha256 !== undefined) {
    promptSha256 = task.promptSha256;
  } else {
    fail(`${path}: requires either prompt or promptSha256`);
  }

  assertObject(task.rubric, `${path}.rubric`);
  const rubric = task.rubric;
  assertEnum(rubric.kind, `${path}.rubric.kind`, [
    'contains_all',
    'contains_none',
  ]);
  const match = rubric.match ?? 'substring';
  assertEnum(match, `${path}.rubric.match`, ['substring', 'word']);
  assertArray(rubric.literals, `${path}.rubric.literals`);
  const literals = validateLiteralList(
    rubric.literals,
    `${path}.rubric.literals`,
  );
  const forbidden =
    rubric.forbidden === undefined
      ? []
      : validateLiteralList(rubric.forbidden, `${path}.rubric.forbidden`);
  if (rubric.rubricId !== undefined) {
    assertString(rubric.rubricId, `${path}.rubric.rubricId`, {
      pattern: RUBRIC_ID_PATTERN,
    });
    if (rubric.rubricId !== task.rubricId) {
      fail(
        `${path}.rubric.rubricId: must equal the task-level rubricId "${task.rubricId}"`,
      );
    }
  }
  if (rubric.kind === 'contains_all') {
    if (literals.length === 0) {
      fail(
        `${path}.rubric.literals: contains_all requires at least one literal`,
      );
    }
    // contains_all may also carry forbidden literals: all required literals
    // must be present AND none of the forbidden literals may appear.
  } else if (literals.length === 0 && forbidden.length === 0) {
    fail(
      `${path}.rubric: contains_none requires literals or forbidden literals`,
    );
  }

  assertObject(task.groundTruth, `${path}.groundTruth`);
  assertString(
    task.groundTruth.answerSummary,
    `${path}.groundTruth.answerSummary`,
    { min: 1 },
  );
  assertArray(task.groundTruth.evidence, `${path}.groundTruth.evidence`, {
    min: 1,
  });
  task.groundTruth.evidence.forEach((evidence, evidenceIndex) => {
    const evidencePath = `${path}.groundTruth.evidence[${evidenceIndex}]`;
    assertObject(evidence, evidencePath);
    assertString(evidence.path, `${evidencePath}.path`, { min: 1 });
    assertString(evidence.sha256, `${evidencePath}.sha256`, {
      pattern: SHA256_PATTERN,
    });
    assertString(evidence.hint, `${evidencePath}.hint`, { min: 1 });
  });

  if (task.materialScope !== undefined) {
    assertObject(task.materialScope, `${path}.materialScope`);
    assertString(task.materialScope.root, `${path}.materialScope.root`, {
      min: 1,
    });
    assertArray(
      task.materialScope.allowedFiles,
      `${path}.materialScope.allowedFiles`,
    );
    task.materialScope.allowedFiles.forEach((file, fileIndex) => {
      assertString(file, `${path}.materialScope.allowedFiles[${fileIndex}]`, {
        min: 1,
      });
    });
  }
  if (task.maxDurationMs !== undefined) {
    assertInteger(task.maxDurationMs, `${path}.maxDurationMs`, { min: 1 });
  }

  return {
    taskId: task.taskId,
    category: task.category,
    promptSha256,
    rubricId: task.rubricId,
    rubric: { kind: rubric.kind, match, literals, forbidden },
    groundTruth: task.groundTruth,
    materialScope: task.materialScope,
    maxDurationMs: task.maxDurationMs,
  };
}

/**
 * Validate tasks.json and return a lookup plus the answer byte cap. Extra
 * top-level fields are tolerated because the task file is a planning document,
 * but every field the scorer reads is checked.
 */
export function validateTasksDocument(document, label = 'tasks.json') {
  assertObject(document, label);
  assertInteger(document.schemaVersion, `${label}.schemaVersion`);
  if (document.schemaVersion !== 1) {
    fail(`${label}.schemaVersion: expected 1`);
  }
  if (document.protocolId !== undefined) {
    if (document.protocolId !== PROTOCOL_ID) {
      fail(`${label}.protocolId: expected "${PROTOCOL_ID}"`);
    }
  }
  if (document.protocolVersion !== undefined) {
    assertInteger(document.protocolVersion, `${label}.protocolVersion`, {
      min: 1,
    });
  }
  if (document.datasetVersion !== undefined) {
    assertInteger(document.datasetVersion, `${label}.datasetVersion`, {
      min: 1,
    });
  }
  if (document.corpus !== undefined) {
    assertObject(document.corpus, `${label}.corpus`);
    assertString(document.corpus.corpusId, `${label}.corpus.corpusId`, {
      min: 1,
      max: 64,
    });
    assertString(document.corpus.root, `${label}.corpus.root`, { min: 1 });
    assertArray(document.corpus.files, `${label}.corpus.files`);
    document.corpus.files.forEach((file, index) => {
      const path = `${label}.corpus.files[${index}]`;
      assertObject(file, path);
      assertString(file.path, `${path}.path`, { min: 1 });
      assertString(file.sha256, `${path}.sha256`, { pattern: SHA256_PATTERN });
      assertInteger(file.bytes, `${path}.bytes`, { min: 0 });
    });
    if (document.corpus.totalBytes !== undefined) {
      assertInteger(document.corpus.totalBytes, `${label}.corpus.totalBytes`, {
        min: 0,
      });
    }
  }
  let answerByteCap = ANSWER_BYTE_CAP;
  if (document.scoring !== undefined) {
    assertObject(document.scoring, `${label}.scoring`);
    if (document.scoring.answerByteCap !== undefined) {
      assertInteger(
        document.scoring.answerByteCap,
        `${label}.scoring.answerByteCap`,
        { min: 1 },
      );
      answerByteCap = document.scoring.answerByteCap;
    }
  }
  assertArray(document.tasks, `${label}.tasks`, { min: 1 });
  const tasks = new Map();
  document.tasks.forEach((task, index) => {
    const normalized = validateTaskDocumentEntry(task, index, label);
    if (tasks.has(normalized.taskId)) {
      fail(`${label}.tasks: duplicate taskId "${normalized.taskId}"`);
    }
    tasks.set(normalized.taskId, normalized);
  });
  return {
    tasks,
    answerByteCap,
    protocolId: document.protocolId,
    protocolVersion: document.protocolVersion,
    datasetVersion: document.datasetVersion,
    corpus: document.corpus,
  };
}

/* -------------------------------------------------------------------------- */
/* Journal validation (mirrors RunJournalRecordSchema)                        */
/* -------------------------------------------------------------------------- */

const JOURNAL_ACCEPT_KEYS = [
  'kind',
  'runId',
  'sessionId',
  'projectId',
  'revision',
  'taskDigest',
  'adapter',
  'windowEpoch',
  'rootRevision',
  'requestId',
  'at',
];

const JOURNAL_TERMINAL_REQUIRED_KEYS = [
  'kind',
  'runId',
  'status',
  'code',
  'at',
  'lastSeq',
];

const JOURNAL_TERMINAL_KEYS = [
  ...JOURNAL_TERMINAL_REQUIRED_KEYS,
  'stopRequestedAt',
];

const JOURNAL_TOMBSTONE_KEYS = ['kind', 'runId', 'reason', 'at'];

function validateJournalAccept(record, label) {
  assertExactKeys(record, label, JOURNAL_ACCEPT_KEYS);
  requireKeys(record, label, JOURNAL_ACCEPT_KEYS);
  assertString(record.runId, `${label}.runId`, { min: 1, max: 512 });
  assertString(record.sessionId, `${label}.sessionId`, { min: 1, max: 512 });
  assertString(record.projectId, `${label}.projectId`, { min: 1, max: 512 });
  assertInteger(record.revision, `${label}.revision`, { min: 1 });
  assertString(record.taskDigest, `${label}.taskDigest`, { min: 1, max: 512 });
  assertEnum(record.adapter, `${label}.adapter`, RUN_ADAPTERS);
  assertInteger(record.windowEpoch, `${label}.windowEpoch`, { min: 0 });
  assertInteger(record.rootRevision, `${label}.rootRevision`, { min: 0 });
  assertString(record.requestId, `${label}.requestId`, { min: 1, max: 512 });
  assertDatetime(record.at, `${label}.at`);
}

function validateJournalTerminal(record, label) {
  assertExactKeys(record, label, JOURNAL_TERMINAL_KEYS);
  requireKeys(record, label, JOURNAL_TERMINAL_REQUIRED_KEYS);
  assertString(record.runId, `${label}.runId`, { min: 1, max: 512 });
  assertEnum(record.status, `${label}.status`, TERMINAL_RUN_STATUSES);
  // Matches RunJournalTerminalSchema.code: z.string().max(64).nullable().
  // The empty string is accepted here; status/code consistency is a build rule.
  assertString(record.code, `${label}.code`, {
    max: 64,
    nullable: true,
  });
  assertDatetime(record.at, `${label}.at`);
  assertInteger(record.lastSeq, `${label}.lastSeq`, { min: 0 });
  if (record.stopRequestedAt !== undefined) {
    assertDatetime(record.stopRequestedAt, `${label}.stopRequestedAt`, {
      nullable: true,
    });
  }
}

function validateJournalTombstone(record, label) {
  assertExactKeys(record, label, JOURNAL_TOMBSTONE_KEYS);
  requireKeys(record, label, JOURNAL_TOMBSTONE_KEYS);
  assertString(record.runId, `${label}.runId`, { min: 1, max: 512 });
  if (record.reason !== 'host_restarted') {
    fail(`${label}.reason: expected "host_restarted"`);
  }
  assertDatetime(record.at, `${label}.at`);
}

/**
 * Validate one RunJournalRecord against the product schema shape, except that
 * the collection layer also accepts the experiment-only adapter
 * `baseline-runner` (see RUN_ADAPTERS). The parity test in
 * tests/contract/experiment-record-parity.test.ts checks the accept and reject
 * behaviour against RunJournalRecordSchema for its case table.
 */
export function validateJournalRecord(record, label = 'journal record') {
  assertObject(record, label);
  if (record.kind === undefined) fail(`${label}: missing field "kind"`);
  if (record.kind === 'accept') {
    validateJournalAccept(record, label);
  } else if (record.kind === 'terminal') {
    validateJournalTerminal(record, label);
  } else if (record.kind === 'tombstone') {
    validateJournalTombstone(record, label);
  } else {
    fail(`${label}.kind: expected accept, terminal or tombstone`);
  }
  return record;
}

/* -------------------------------------------------------------------------- */
/* Run event validation                                                       */
/*                                                                            */
/* Product RunEventSchema allows adapter `controlled|pi`. The collection layer */
/* additionally accepts `baseline-runner` for the M5-A fixed-prefix baseline,  */
/* which is never a product Run host. This validator is therefore not a strict */
/* mirror of RunEventSchema; the parity test documents the difference.         */
/* -------------------------------------------------------------------------- */

const EVENT_KEYS = [
  'sessionId',
  'projectId',
  'runId',
  'revision',
  'version',
  'seq',
  'at',
  'source',
  'adapter',
  'body',
];

const EVENT_BODY_KEYS = {
  'run.accepted': ['type'],
  'run.started': ['type'],
  'text.delta': ['type', 'text'],
  'tool.requested': ['type', 'callId', 'tool'],
  'tool.result': ['type', 'callId', 'result'],
  'run.stop_requested': ['type', 'reason'],
  'run.unknown': ['type', 'reason'],
  'run.completed': ['type', 'usage'],
  'run.failed': ['type', 'code'],
  'run.stopped': ['type'],
};

function validateEventBody(body, label) {
  assertObject(body, label);
  if (typeof body.type !== 'string') fail(`${label}.type: expected a string`);
  const allowed = EVENT_BODY_KEYS[body.type];
  if (allowed === undefined) {
    fail(`${label}.type: unknown run event type "${body.type}"`);
  }
  assertExactKeys(body, label, allowed);
  requireKeys(body, label, allowed);
  switch (body.type) {
    case 'text.delta':
      assertString(body.text, `${label}.text`);
      assertByteLength(
        body.text,
        `${label}.text`,
        RUN_EVENT_LIMITS.textChunkBytes,
      );
      break;
    case 'tool.requested':
      assertString(body.callId, `${label}.callId`, { pattern: ID_PATTERN });
      if (body.tool !== null) {
        assertEnum(body.tool, `${label}.tool`, TOOL_NAMES);
      }
      break;
    case 'tool.result': {
      assertString(body.callId, `${label}.callId`, { pattern: ID_PATTERN });
      assertObject(body.result, `${label}.result`);
      const result = body.result;
      if (result.status === 'succeeded') {
        assertExactKeys(result, `${label}.result`, [
          'status',
          'text',
          'truncated',
        ]);
        requireKeys(result, `${label}.result`, ['status', 'text', 'truncated']);
        assertString(result.text, `${label}.result.text`);
        assertByteLength(
          result.text,
          `${label}.result.text`,
          RUN_EVENT_LIMITS.textChunkBytes,
        );
        assertBoolean(result.truncated, `${label}.result.truncated`);
      } else if (
        result.status === 'rejected' ||
        result.status === 'failed' ||
        result.status === 'cancelled'
      ) {
        assertExactKeys(result, `${label}.result`, ['status', 'code']);
        requireKeys(result, `${label}.result`, ['status', 'code']);
        assertEnum(result.code, `${label}.result.code`, TOOL_REJECTION_CODES);
      } else {
        fail(`${label}.result.status: unknown tool result status`);
      }
      break;
    }
    case 'run.stop_requested':
      assertEnum(body.reason, `${label}.reason`, STOP_REASONS);
      break;
    case 'run.unknown':
      if (body.reason !== 'host_restarted') {
        fail(`${label}.reason: expected "host_restarted"`);
      }
      break;
    case 'run.completed':
      if (body.usage !== null) {
        assertObject(body.usage, `${label}.usage`);
        assertExactKeys(body.usage, `${label}.usage`, [
          'inputTokens',
          'outputTokens',
        ]);
        requireKeys(body.usage, `${label}.usage`, [
          'inputTokens',
          'outputTokens',
        ]);
        assertInteger(body.usage.inputTokens, `${label}.usage.inputTokens`, {
          min: 0,
          nullable: true,
        });
        assertInteger(body.usage.outputTokens, `${label}.usage.outputTokens`, {
          min: 0,
          nullable: true,
        });
      }
      break;
    case 'run.failed':
      assertEnum(body.code, `${label}.code`, RUN_FAILURE_CODES);
      break;
    default:
      break;
  }
}

/**
 * Validate one RunEvent shape. The product schema admits controlled|pi; the
 * collection layer also admits baseline-runner (never a product Run host).
 * Exported for the parity test.
 */
export function validateRunEvent(event, label = 'run event') {
  assertObject(event, label);
  assertExactKeys(event, label, EVENT_KEYS);
  requireKeys(event, label, EVENT_KEYS);
  assertString(event.sessionId, `${label}.sessionId`, { pattern: ID_PATTERN });
  assertString(event.projectId, `${label}.projectId`, { pattern: ID_PATTERN });
  assertString(event.runId, `${label}.runId`, { pattern: ID_PATTERN });
  assertInteger(event.revision, `${label}.revision`, { min: 1 });
  if (event.version !== 1) fail(`${label}.version: expected 1`);
  assertInteger(event.seq, `${label}.seq`, { min: 1 });
  assertDatetime(event.at, `${label}.at`);
  assertEnum(event.source, `${label}.source`, ['host', 'model', 'tool']);
  assertEnum(event.adapter, `${label}.adapter`, RUN_ADAPTERS);
  validateEventBody(event.body, `${label}.body`);
  const expectedSource =
    event.body.type === 'text.delta'
      ? 'model'
      : event.body.type.startsWith('tool.')
        ? 'tool'
        : 'host';
  if (event.source !== expectedSource) {
    fail(
      `${label}.source: event source does not match its body (expected "${expectedSource}")`,
    );
  }
  const bytes = Buffer.byteLength(JSON.stringify(event), 'utf8');
  if (bytes > RUN_EVENT_LIMITS.eventBytes) {
    fail(
      `${label}: event exceeds the ${RUN_EVENT_LIMITS.eventBytes}-byte budget`,
    );
  }
  return event;
}

function parseNdjson(text, file, validate) {
  const records = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.length === 0) continue;
    let value;
    try {
      value = JSON.parse(line);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new ExperimentError(
        `${file}:${index + 1}: invalid JSON (${reason})`,
      );
    }
    validate(value, `${file}:${index + 1}`);
    records.push(value);
  }
  return records;
}

export function parseJournalNdjson(text, file = 'journal.ndjson') {
  return parseNdjson(text, file, validateJournalRecord);
}

export function parseEventsNdjson(text, file = 'events.ndjson') {
  return parseNdjson(text, file, validateRunEvent);
}

/* -------------------------------------------------------------------------- */
/* Deterministic scoring                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Normalize an answer (or a rubric literal) before literal matching:
 * Markdown decoration removed, Unicode whitespace collapsed, case folded.
 */
export function normalizeForMatch(text) {
  let value = text.normalize('NFC');
  value = value.replace(/```[^\n]*\n?/g, '');
  value = value.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  value = value.replace(/[*_~`]/g, '');
  value = value.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');
  value = value.replace(/^[ \t]{0,3}>[ \t]?/gm, '');
  value = value.replace(/^[ \t]*[-+*][ \t]+/gm, '');
  value = value.replace(/^[ \t]*\d+[.)][ \t]+/gm, '');
  value = value.toLowerCase();
  value = value.replace(/\s+/gu, ' ').trim();
  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function literalPresent(normalizedAnswer, normalizedLiteral, match) {
  if (match === 'word') {
    const pattern = new RegExp(
      `(?<![a-z0-9_])${escapeRegExp(normalizedLiteral)}(?![a-z0-9_])`,
      'u',
    );
    return pattern.test(normalizedAnswer);
  }
  return normalizedAnswer.includes(normalizedLiteral);
}

/**
 * Canonical answer text for every hash/byte-count field in dataset and
 * answers.ndjson: normalized text, bounded to the answers.ndjson budget.
 * `result.answerSha256` / `result.answerBytes` and the answers.ndjson pair are
 * byte-identical by construction.
 */
export function canonicalAnswerText(answerText) {
  return truncateUtf8(normalizeForMatch(answerText), ANSWERS_ANSWER_BYTE_CAP);
}

/**
 * Score one answer against the task rubric. Returns the de-identified result
 * block; the answer digest always describes `canonicalAnswerText(answerText)`,
 * never the raw text (which is not persisted).
 */
export function scoreAnswer(task, answerText, answerByteCap = ANSWER_BYTE_CAP) {
  const rubric = task.rubric;
  const normalizedAnswer = normalizeForMatch(answerText);
  const canonicalAnswer = canonicalAnswerText(answerText);
  const matchedLiterals = rubric.literals.filter((literal) =>
    literalPresent(normalizedAnswer, normalizeForMatch(literal), rubric.match),
  ).length;
  const rawAnswerBytes = byteLength(answerText);
  const forbiddenPresent = rubric.forbidden.some((literal) =>
    literalPresent(normalizedAnswer, normalizeForMatch(literal), rubric.match),
  );
  let verdict;
  if (normalizedAnswer.length === 0 || rawAnswerBytes > answerByteCap) {
    verdict = 'unscorable';
  } else if (rubric.kind === 'contains_all') {
    const requiredSatisfied = matchedLiterals === rubric.literals.length;
    verdict = requiredSatisfied && !forbiddenPresent ? 'pass' : 'fail';
  } else {
    const requiredSatisfied =
      rubric.literals.length === 0 || matchedLiterals >= 1;
    verdict = !forbiddenPresent && requiredSatisfied ? 'pass' : 'fail';
  }
  return {
    verdict,
    matchedLiterals,
    requiredLiterals: rubric.literals.length,
    answerSha256: sha256Hex(canonicalAnswer),
    answerBytes: byteLength(canonicalAnswer),
  };
}

/* -------------------------------------------------------------------------- */
/* Journal -> dataset status inference                                        */
/* -------------------------------------------------------------------------- */

export function deriveUsage(events) {
  const completedEvents = events.filter(
    (event) => event.body.type === 'run.completed',
  );
  if (completedEvents.length > 1) {
    throw new ExperimentError(
      'multiple run.completed events for one run; usage is ambiguous',
    );
  }
  const usage = completedEvents[0]?.body.usage ?? null;
  if (
    usage !== null &&
    Number.isInteger(usage.inputTokens) &&
    Number.isInteger(usage.outputTokens)
  ) {
    return {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      source: 'reported',
      estimated: null,
    };
  }
  return {
    inputTokens: null,
    outputTokens: null,
    source: 'missing',
    estimated: null,
  };
}

export function countToolCalls(events, label = 'run') {
  const requested = new Map();
  const results = new Map();
  const counts = {
    requested: 0,
    succeeded: 0,
    rejected: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const event of events) {
    if (event.body.type === 'tool.requested') {
      if (requested.has(event.body.callId)) {
        fail(
          `${label}: duplicate tool.requested for callId "${event.body.callId}"`,
        );
      }
      requested.set(event.body.callId, event);
      counts.requested += 1;
    } else if (event.body.type === 'tool.result') {
      if (results.has(event.body.callId)) {
        fail(
          `${label}: duplicate tool.result for callId "${event.body.callId}"`,
        );
      }
      if (!requested.has(event.body.callId)) {
        fail(
          `${label}: tool.result without a matching tool.requested for callId "${event.body.callId}"`,
        );
      }
      results.set(event.body.callId, event);
      counts[event.body.result.status] += 1;
    }
  }
  return counts;
}

function collectAnswerText(events) {
  const chunks = [];
  for (const event of events) {
    if (event.body.type === 'text.delta') chunks.push(event.body.text);
  }
  return chunks.join('');
}

function indexJournal(records, label) {
  const accepts = new Map();
  const terminals = new Map();
  const tombstones = new Map();
  for (const record of records) {
    const bucket =
      record.kind === 'accept'
        ? accepts
        : record.kind === 'terminal'
          ? terminals
          : tombstones;
    if (bucket.has(record.runId)) {
      fail(
        `${label}: duplicate ${record.kind} record for runId "${record.runId}"`,
      );
    }
    bucket.set(record.runId, record);
  }
  return { accepts, terminals, tombstones };
}

function groupEvents(events, label) {
  const byRun = new Map();
  for (const event of events) {
    const list = byRun.get(event.runId) ?? [];
    list.push(event);
    byRun.set(event.runId, list);
  }
  for (const [runId, list] of byRun) {
    list.sort((left, right) => left.seq - right.seq);
    for (let index = 1; index < list.length; index += 1) {
      if (list[index].seq === list[index - 1].seq) {
        fail(
          `${label}: duplicate event seq ${list[index].seq} for runId "${runId}"`,
        );
      }
    }
  }
  return byRun;
}

function stopReasonOf(events, runId) {
  const reasons = events
    .filter((event) => event.body.type === 'run.stop_requested')
    .map((event) => event.body.reason);
  if (reasons.length === 0) {
    fail(
      `run "${runId}": journal terminal is stopped but no run.stop_requested event exists`,
    );
  }
  for (const reason of reasons) {
    if (reason !== reasons[0]) {
      fail(`run "${runId}": conflicting run.stop_requested reasons`);
    }
  }
  return reasons[0];
}

function maxSeqOf(events) {
  let max = null;
  for (const event of events) {
    if (max === null || event.seq > max) max = event.seq;
  }
  return max;
}

/**
 * Build the dataset rows and answers.ndjson entries for one validated capture.
 * Any inconsistent run rejects the whole capture (no partial dataset).
 */
export function buildCaptureResult({
  capture,
  journalRecords,
  events,
  tasks,
  captureHashes,
  answerByteCap = ANSWER_BYTE_CAP,
  label = 'capture',
}) {
  const { accepts, terminals, tombstones } = indexJournal(
    journalRecords,
    `${label}/journal.ndjson`,
  );
  const eventsByRun = groupEvents(events, `${label}/events.ndjson`);
  const attemptRunIds = new Set(
    capture.attempts
      .map((attempt) => attempt.runId)
      .filter((runId) => runId !== null),
  );
  for (const runId of accepts.keys()) {
    if (!attemptRunIds.has(runId)) {
      fail(
        `${label}: journal accept runId "${runId}" is not registered in attempts`,
      );
    }
  }
  for (const runId of terminals.keys()) {
    if (!attemptRunIds.has(runId)) {
      fail(
        `${label}: journal terminal runId "${runId}" is not registered in attempts`,
      );
    }
  }
  for (const runId of tombstones.keys()) {
    if (!attemptRunIds.has(runId)) {
      fail(
        `${label}: journal tombstone runId "${runId}" is not registered in attempts`,
      );
    }
  }
  for (const runId of eventsByRun.keys()) {
    if (!attemptRunIds.has(runId)) {
      fail(`${label}: events runId "${runId}" is not registered in attempts`);
    }
  }

  const notRunById = new Map(
    capture.notRun.map((entry) => [entry.attemptId, entry]),
  );
  const rows = [];
  const answers = [];

  for (const attempt of capture.attempts) {
    const task = tasks.get(attempt.taskId);
    if (task === undefined) {
      fail(
        `${label}: attempt "${attempt.attemptId}" references unknown taskId "${attempt.taskId}"`,
      );
    }
    const notRun = notRunById.get(attempt.attemptId);
    if (notRun !== undefined) {
      rows.push(
        buildNotRunRow({ capture, attempt, task, notRun, captureHashes }),
      );
      continue;
    }

    const runId = attempt.runId;
    if (runId === null) {
      fail(
        `${label}: attempt "${attempt.attemptId}" has no runId and no notRun entry`,
      );
    }
    const accept = accepts.get(runId);
    if (accept === undefined) {
      fail(`${label}: no journal accept record for runId "${runId}"`);
    }
    const terminal = terminals.get(runId) ?? null;
    const tombstone = tombstones.get(runId) ?? null;
    const runEvents = eventsByRun.get(runId) ?? [];
    for (const event of runEvents) {
      if (
        event.sessionId !== accept.sessionId ||
        event.projectId !== accept.projectId ||
        event.runId !== accept.runId ||
        event.revision !== accept.revision
      ) {
        fail(
          `${label}: event identity does not match the journal accept for runId "${runId}"`,
        );
      }
      if (event.adapter !== accept.adapter) {
        fail(
          `${label}: event adapter does not match the journal accept for runId "${runId}"`,
        );
      }
    }

    let status;
    let failureCode = null;
    let stopReason = null;
    let terminalAt = null;
    let durationMs = null;
    let lastSeq = null;
    let notes = null;

    if (terminal !== null) {
      status = terminal.status;
      terminalAt = terminal.at;
      lastSeq = terminal.lastSeq;
      durationMs = Date.parse(terminal.at) - Date.parse(accept.at);
      if (!Number.isFinite(durationMs) || durationMs < 0) {
        fail(
          `${label}: runId "${runId}" has a terminal timestamp before its accept timestamp`,
        );
      }
      if (status === 'completed') {
        if (terminal.code !== null) {
          fail(
            `${label}: runId "${runId}" is completed but its terminal code is not null`,
          );
        }
        const failedEvents = runEvents.filter(
          (event) => event.body.type === 'run.failed',
        );
        if (failedEvents.length > 0) {
          fail(
            `${label}: runId "${runId}" is completed but has a run.failed event`,
          );
        }
      } else if (status === 'failed') {
        if (terminal.code === null) {
          fail(
            `${label}: runId "${runId}" is failed but its terminal code is null`,
          );
        }
        if (!RUN_FAILURE_CODES.includes(terminal.code)) {
          fail(
            `${label}: runId "${runId}" failed with unknown code "${terminal.code}"`,
          );
        }
        failureCode = terminal.code;
        for (const event of runEvents) {
          if (
            event.body.type === 'run.failed' &&
            event.body.code !== failureCode
          ) {
            fail(
              `${label}: runId "${runId}" terminal code and run.failed event disagree`,
            );
          }
        }
      } else if (status === 'stopped') {
        if (terminal.code !== null) {
          fail(
            `${label}: runId "${runId}" is stopped but its terminal code is not null`,
          );
        }
        stopReason = stopReasonOf(runEvents, runId);
      }
    } else if (tombstone !== null) {
      status = 'unknown';
      notes = 'host_restarted';
      lastSeq = maxSeqOf(runEvents);
    } else {
      status = 'unknown';
      notes = 'terminal_record_missing';
      lastSeq = maxSeqOf(runEvents);
    }

    const answerText = collectAnswerText(runEvents);
    const scored = scoreAnswer(task, answerText, answerByteCap);
    const canonicalAnswer = canonicalAnswerText(answerText);
    if (status === 'completed') {
      answers.push({
        attemptId: attempt.attemptId,
        taskId: attempt.taskId,
        variantId: attempt.variantId,
        normalizedAnswer: canonicalAnswer,
        answerSha256: scored.answerSha256,
        answerBytes: scored.answerBytes,
      });
    }

    rows.push({
      schemaVersion: 1,
      protocolId: capture.protocolId,
      protocolVersion: capture.protocolVersion,
      datasetVersion: capture.datasetVersion,
      evidenceKind: capture.evidenceKind,
      attemptId: attempt.attemptId,
      rowId: `${capture.evidenceKind}:v${capture.datasetVersion}:${attempt.attemptId}`,
      task: {
        taskId: task.taskId,
        category: task.category,
        promptSha256: task.promptSha256,
        rubricId: task.rubricId,
      },
      variant: {
        variantId: attempt.variantId,
        harnessVersion: capture.harnessVersion,
      },
      repetition: attempt.repetition,
      orderIndex: attempt.orderIndex,
      run: {
        sessionId: accept.sessionId,
        projectId: accept.projectId,
        runId: accept.runId,
        revision: accept.revision,
        adapter: accept.adapter,
        status,
        failureCode,
        stopReason,
        startedAt: accept.at,
        terminalAt,
        durationMs,
        lastSeq,
        toolCalls: countToolCalls(runEvents, `run "${runId}"`),
        notRunReason: null,
      },
      usage: deriveUsage(runEvents),
      result: {
        scoringMode: 'deterministic',
        verdict: scored.verdict,
        rubricId: task.rubricId,
        matchedLiterals: scored.matchedLiterals,
        requiredLiterals: scored.requiredLiterals,
        answerSha256: scored.answerSha256,
        answerBytes: scored.answerBytes,
      },
      environment: { ...capture.environment },
      capture: { ...captureHashes },
      notes,
    });
  }

  return { rows, answers };
}

function buildNotRunRow({ capture, attempt, task, notRun, captureHashes }) {
  const reason = notRun.reason;
  // notes carries only the free-text detail; the reason code is structured in
  // run.notRunReason so analysis never has to parse notes.
  const notes =
    typeof notRun.note === 'string' && notRun.note.length > 0
      ? notRun.note
      : null;
  if (notes !== null && notes.length > 512) {
    fail(
      `capture: notRun note for attempt "${attempt.attemptId}" is too long for notes (max 512)`,
    );
  }
  return {
    schemaVersion: 1,
    protocolId: capture.protocolId,
    protocolVersion: capture.protocolVersion,
    datasetVersion: capture.datasetVersion,
    evidenceKind: capture.evidenceKind,
    attemptId: attempt.attemptId,
    rowId: `${capture.evidenceKind}:v${capture.datasetVersion}:${attempt.attemptId}`,
    task: {
      taskId: task.taskId,
      category: task.category,
      promptSha256: task.promptSha256,
      rubricId: task.rubricId,
    },
    variant: {
      variantId: attempt.variantId,
      harnessVersion: capture.harnessVersion,
    },
    repetition: attempt.repetition,
    orderIndex: attempt.orderIndex,
    run: {
      sessionId: null,
      projectId: null,
      runId: null,
      revision: null,
      adapter: null,
      status: 'not_run',
      failureCode: null,
      stopReason: null,
      startedAt: null,
      terminalAt: null,
      durationMs: null,
      lastSeq: null,
      toolCalls: {
        requested: 0,
        succeeded: 0,
        rejected: 0,
        failed: 0,
        cancelled: 0,
      },
      notRunReason: reason,
    },
    usage: {
      inputTokens: null,
      outputTokens: null,
      source: 'missing',
      estimated: null,
    },
    result: {
      scoringMode: 'deterministic',
      verdict: 'not_run',
      rubricId: task.rubricId,
      matchedLiterals: 0,
      requiredLiterals: task.rubric.literals.length,
      answerSha256: null,
      answerBytes: null,
    },
    environment: { ...capture.environment },
    capture: { ...captureHashes },
    notes,
  };
}
