export type ExperimentUsageSource = 'reported' | 'missing' | 'estimated';

export interface ExperimentUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  source: ExperimentUsageSource;
  estimated: null;
}

export declare const PROTOCOL_ID: string;
export declare const CAPTURE_SCHEMA_VERSION: number;
export declare const PROTOCOL_VERSION: number;
export declare const DATASET_VERSION: number;
export declare const EVIDENCE_KINDS: readonly string[];
export declare const VARIANT_IDS: readonly string[];
export declare const TASK_CATEGORIES: readonly string[];
export declare const PRODUCT_RUN_STATUSES: readonly string[];
export declare const TERMINAL_RUN_STATUSES: readonly string[];
export declare const DATASET_RUN_STATUSES: readonly string[];
export declare const DATASET_VERDICTS: readonly string[];
export declare const OUTCOME_CLASSES: readonly string[];
export declare const RUN_FAILURE_CODES: readonly string[];
export declare const STOP_REASONS: readonly string[];
export declare const NOT_RUN_REASON_CODES: readonly string[];
export declare const PRODUCT_RUN_ADAPTERS: readonly string[];
export declare const RUN_ADAPTERS: readonly string[];
export declare const TOOL_NAMES: readonly string[];
export declare const ANSWER_BYTE_CAP: number;
export declare const ANSWERS_ANSWER_BYTE_CAP: number;
export declare const ID_PATTERN: RegExp;
export declare const ATTEMPT_ID_PATTERN: RegExp;
export declare const TASK_ID_PATTERN: RegExp;
export declare const RUBRIC_ID_PATTERN: RegExp;
export declare const SHA256_PATTERN: RegExp;
export declare const ISO_DATETIME_PATTERN: RegExp;

export declare class ExperimentError extends Error {
  readonly details: readonly string[];
  constructor(message: string, details?: readonly string[]);
}

export declare function sha256Hex(input: string | Uint8Array): string;
export declare function byteLength(value: string): number;
export declare function truncateUtf8(value: string, maxBytes: number): string;
export declare function canonicalAnswerText(answerText: string): string;
export declare function scanSensitiveValue(value: string): string | null;
export declare function validateJournalRecord(
  record: unknown,
  label?: string,
): Record<string, unknown>;
export declare function validateRunEvent(
  event: unknown,
  label?: string,
): Record<string, unknown>;
export declare function deriveUsage(
  events: readonly Record<string, unknown>[],
): ExperimentUsage;
