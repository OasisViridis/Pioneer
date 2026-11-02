/**
 * Shared structural assertions for the M5-A experiment tooling.
 *
 * These helpers only check shapes, ranges and enum membership. Domain rules
 * (required capture fields, run-state invariants, denominator rules) stay in
 * record.mjs / dataset.mjs.
 */

export const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Exact ISO date-time shape accepted by `z.iso.datetime()` in the pinned zod
 * version (seconds required, fractional seconds optional, `Z` only).
 */
export const ISO_DATETIME_PATTERN =
  /^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?Z$/;

export class ExperimentError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ExperimentError';
    this.details = details;
  }
}

export function fail(message) {
  throw new ExperimentError(message);
}

export function assertObject(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${path}: expected an object`);
  }
}

export function assertExactKeys(value, path, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${path}: unknown field "${key}"`);
  }
}

export function requireKeys(value, path, keys) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail(`${path}: missing field "${key}"`);
    }
  }
}

export function assertArray(value, path, options = {}) {
  if (!Array.isArray(value)) fail(`${path}: expected an array`);
  if (value.length < (options.min ?? 0)) {
    fail(`${path}: expected at least ${options.min} item(s)`);
  }
}

export function assertString(value, path, options = {}) {
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

export function assertInteger(value, path, options = {}) {
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

export function assertBoolean(value, path) {
  if (typeof value !== 'boolean') fail(`${path}: expected a boolean`);
}

export function assertEnum(value, path, allowed) {
  if (!allowed.includes(value)) {
    fail(`${path}: expected one of ${allowed.join(', ')}`);
  }
}

export function assertDatetime(value, path, options = {}) {
  const nullable = options.nullable === true;
  assertString(value, path, { min: 20, nullable });
  if (value === null) return;
  if (!ISO_DATETIME_PATTERN.test(value)) {
    fail(`${path}: expected an ISO 8601 UTC date-time`);
  }
}

export function assertHash(value, path, options = {}) {
  const nullable = options.nullable === true;
  assertString(value, path, { pattern: SHA256_PATTERN, nullable });
}
