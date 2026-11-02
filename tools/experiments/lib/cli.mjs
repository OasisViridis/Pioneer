/**
 * Tiny CLI helpers shared by the experiment tools. Kept dependency-free so the
 * tools can run with a bare Node installation (no pnpm install required).
 */

export class CliError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliError';
  }
}

/**
 * Parse `--flag` booleans and `--key value` strings. Unknown options are a
 * hard error so a typo never silently changes an experiment run.
 */
export function parseArgs(argv, { boolean = [], string = [] } = {}) {
  const booleanKeys = new Set(boolean);
  const stringKeys = new Set(string);
  const flags = new Set();
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (typeof argument !== 'string' || !argument.startsWith('--')) {
      throw new CliError(`unexpected argument: ${String(argument)}`);
    }
    const key = argument.slice(2);
    if (booleanKeys.has(key)) {
      flags.add(key);
      continue;
    }
    if (stringKeys.has(key)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new CliError(`missing value for --${key}`);
      }
      if (values.has(key)) throw new CliError(`duplicate option --${key}`);
      values.set(key, value);
      index += 1;
      continue;
    }
    throw new CliError(`unknown option --${key}`);
  }
  return { flags, values };
}

export function requiredValue(values, key) {
  const value = values.get(key);
  if (value === undefined)
    throw new CliError(`missing required option --${key}`);
  return value;
}

/**
 * Run a CLI body and convert any failure into a one-line reason plus a
 * non-zero exit code. `--debug` is the only way to see a stack trace.
 */
export async function runCli(name, body) {
  const debug = process.argv.includes('--debug');
  try {
    await body();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`experiment:${name}: ${message}\n`);
    if (debug && error instanceof Error && typeof error.stack === 'string') {
      process.stderr.write(`${error.stack}\n`);
    }
    process.exitCode = 1;
  }
}
