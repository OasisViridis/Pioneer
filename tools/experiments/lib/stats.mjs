/**
 * Deterministic statistics helpers for the M5-A analysis.
 * No third-party dependencies: everything here is integer/float arithmetic.
 */

/** Wilson score interval z for a two-sided 95% interval (protocol v1 value). */
export const WILSON_Z = 1.959963984540054;

export function round4(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value * 10000) / 10000;
}

export function roundInt(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.round(value);
}

export function sum(values) {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

export function mean(values) {
  if (values.length === 0) return null;
  return sum(values) / values.length;
}

/**
 * Wilson score interval for a binomial proportion.
 * Returns null when there are no observations; never invents a denominator.
 */
export function wilsonInterval(successes, total, z = WILSON_Z) {
  if (!Number.isInteger(successes) || successes < 0) {
    throw new Error('wilsonInterval: successes must be a non-negative integer');
  }
  if (!Number.isInteger(total) || total < 0) {
    throw new Error('wilsonInterval: total must be a non-negative integer');
  }
  if (successes > total) {
    throw new Error('wilsonInterval: successes cannot exceed total');
  }
  if (total === 0) return null;
  const proportion = successes / total;
  const zSquared = z * z;
  const denominator = 1 + zSquared / total;
  const center = (proportion + zSquared / (2 * total)) / denominator;
  const halfWidth =
    (z *
      Math.sqrt(
        (proportion * (1 - proportion)) / total +
          zSquared / (4 * total * total),
      )) /
    denominator;
  return {
    low: Math.max(0, center - halfWidth),
    high: Math.min(1, center + halfWidth),
    center,
    z,
  };
}

/**
 * Linear-interpolated quantile over a copy of the input (same convention as
 * NumPy's default). Returns the single value when n === 1 and null when empty.
 */
export function quantile(values, q) {
  if (values.length === 0) return null;
  if (!(q >= 0 && q <= 1)) throw new Error('quantile: q must be within [0, 1]');
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const rest = position - lower;
  const base = sorted[lower];
  const next = sorted[lower + 1];
  if (next === undefined) return base;
  return base + rest * (next - base);
}

export function median(values) {
  return quantile(values, 0.5);
}

export function percentile(values, q) {
  return quantile(values, q);
}

/**
 * Exact two-sided sign test over task-level differences.
 * Zero differences are ties and are excluded, matching the standard sign test.
 */
export function signTest(differences) {
  const positive = differences.filter((value) => value > 0).length;
  const negative = differences.filter((value) => value < 0).length;
  const zero = differences.filter((value) => value === 0).length;
  const n = positive + negative;
  if (n === 0) {
    return { n: 0, positive, negative, zero, pValue: 1 };
  }
  const smaller = Math.min(positive, negative);
  let cumulative = 0;
  for (let k = 0; k <= smaller; k += 1) {
    cumulative += binomialCoefficient(n, k);
  }
  const pValue = Math.min(1, (2 * cumulative) / 2 ** n);
  return { n, positive, negative, zero, pValue };
}

function binomialCoefficient(n, k) {
  if (k < 0 || k > n) return 0;
  const smaller = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= smaller; index += 1) {
    result = (result * (n - smaller + index)) / index;
  }
  return Math.round(result);
}
