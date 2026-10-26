import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTree } from 'jsonc-parser';
import { format } from 'prettier';
import StyleDictionary from 'style-dictionary';

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
export const inputPath = 'design/tokens/pioneer.tokens.json';
export const outputPath = 'apps/desktop/src/renderer/styles/tokens.css';

// JSON.parse alone silently accepts duplicate properties, including escaped names.
export function parseTokens(text) {
  const data = JSON.parse(text);
  const tree = parseTree(text);
  function check(node) {
    if (node.type === 'object') {
      const names = new Set();
      for (const property of node.children ?? []) {
        const name = property.children[0].value;
        assert(!names.has(name), `Duplicate JSON name: ${name}`);
        names.add(name);
      }
    }
    for (const child of node.children ?? []) check(child);
  }
  check(tree);
  return data;
}

// Deliberately small accepted DTCG profile; Style Dictionary owns transforms,
// reference resolution and CSS formatting. Unsupported types fail closed.
export function validateTokens(data) {
  const tokens = new Map();
  const cssNames = new Set();
  function visit(group, parts = [], inheritedType) {
    assert(
      group && typeof group === 'object' && !Array.isArray(group),
      `Invalid group: ${parts}`,
    );
    const type = group.$type ?? inheritedType;
    if (Object.hasOwn(group, '$value')) {
      assert(parts.length > 0, 'Root cannot be a token');
      assert(
        Object.keys(group).every((key) =>
          ['$type', '$value', '$description', '$extensions'].includes(key),
        ),
        `Unsupported token field: ${parts}`,
      );
      const name = parts.join('-');
      assert(
        /^(pioneer|hazel)-[a-z0-9-]+$/.test(name),
        `Unsupported CSS namespace: ${name}`,
      );
      assert(!cssNames.has(name), `Duplicate CSS name: ${name}`);
      cssNames.add(name);
      tokens.set(parts.join('.'), { type, value: group.$value, name });
      return;
    }
    for (const [key, value] of Object.entries(group)) {
      if (['$type', '$description', '$extensions'].includes(key)) continue;
      assert(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key),
        `Unsupported token/group name: ${key}`,
      );
      visit(value, [...parts, key], type);
    }
  }
  visit(data);
  assert(tokens.size > 0, 'No production tokens');
  const resolved = new Map();
  function check(key, stack = []) {
    if (resolved.has(key)) return resolved.get(key);
    assert(
      !stack.includes(key),
      `Alias cycle: ${[...stack, key].join(' -> ')}`,
    );
    const token = tokens.get(key);
    assert(token, `Missing alias: ${key}`);
    const { type, value } = token;
    assert(
      ['color', 'dimension', 'fontFamily', 'number'].includes(type),
      `Unsupported type: ${key}: ${type}`,
    );
    const alias = typeof value === 'string' && /^\{([^{}]+)\}$/.exec(value);
    let actual = value;
    if (alias) {
      actual = check(alias[1], [...stack, key]);
      assert(tokens.get(alias[1]).type === type, `Alias type mismatch: ${key}`);
    }
    if (type === 'color') {
      assert(
        actual &&
          actual.colorSpace === 'srgb' &&
          Array.isArray(actual.components) &&
          actual.components.length === 3 &&
          actual.components.every(
            (n) => Number.isFinite(n) && n >= 0 && n <= 1,
          ) &&
          Number.isFinite(actual.alpha) &&
          actual.alpha >= 0 &&
          actual.alpha <= 1,
        `Invalid color: ${key}`,
      );
      assert(
        Object.keys(actual).every((k) =>
          ['colorSpace', 'components', 'alpha'].includes(k),
        ),
        `Unsupported color field: ${key}`,
      );
    } else if (type === 'dimension') {
      assert(
        actual &&
          Number.isFinite(actual.value) &&
          actual.value >= 0 &&
          ['px', 'rem'].includes(actual.unit) &&
          Object.keys(actual).length === 2,
        `Invalid dimension/unit: ${key}`,
      );
    } else if (type === 'fontFamily') {
      const families = Array.isArray(actual) ? actual : [actual];
      assert(
        families.length > 0 &&
          families.every(
            (s) => typeof s === 'string' && /^[a-zA-Z][a-zA-Z0-9 -]*$/.test(s),
          ),
        `Invalid fontFamily: ${key}`,
      );
    } else {
      assert(Number.isFinite(actual), `Invalid number: ${key}`);
    }
    resolved.set(key, actual);
    return actual;
  }
  for (const key of tokens.keys()) check(key);
  return { tokens, resolved };
}

export async function generateCss(data) {
  validateTokens(data);
  const dictionary = new StyleDictionary({
    tokens: structuredClone(data),
    usesDtcg: true,
    log: {
      warnings: 'error',
      verbosity: 'silent',
      errors: { brokenReferences: 'throw' },
    },
    platforms: {
      css: {
        transformGroup: 'css',
        files: [
          {
            destination: 'tokens.css',
            format: 'css/variables',
            options: { outputReferences: true, showFileHeader: false },
          },
        ],
      },
    },
  });
  const [{ output }] = await dictionary.formatPlatform('css');
  return format(
    `/* Generated from ${inputPath} by pnpm tokens:build. Do not edit. */\n${output}`,
    { parser: 'css', endOfLine: 'lf', singleQuote: true },
  );
}

export function validateConsumers(css, sources) {
  const defined = new Set(
    [...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]),
  );
  for (const [file, text] of sources) {
    for (const match of text.matchAll(
      /var\(\s*(--(?:pioneer|hazel)-[a-z0-9-]+)/g,
    )) {
      assert(
        defined.has(match[1]),
        `Live CSS variable missing: ${match[1]} in ${file}`,
      );
    }
  }
}

export async function readConsumers(
  directory = path.join(root, 'apps/desktop/src'),
) {
  const sources = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) sources.push(...(await readConsumers(file)));
    else if (
      /\.(css|tsx?|html)$/.test(file) &&
      file !== path.join(root, outputPath)
    )
      sources.push([file, await readFile(file, 'utf8')]);
  }
  return sources;
}

export function checkDrift(expected, actual) {
  assert.equal(
    actual,
    expected,
    'Generated CSS drift: run pnpm tokens:build and review both input and output',
  );
}

async function main() {
  const mode = process.argv[2];
  assert(
    ['build', 'check'].includes(mode),
    'Usage: node tools/design-tokens.mjs build|check',
  );
  const data = parseTokens(await readFile(path.join(root, inputPath), 'utf8'));
  const css = await generateCss(data);
  validateConsumers(css, await readConsumers());
  if (mode === 'build') await writeFile(path.join(root, outputPath), css);
  else checkDrift(css, await readFile(path.join(root, outputPath), 'utf8'));
  console.log(
    `Tokens ${mode}: ${validateTokens(data).tokens.size} DTCG tokens; aliases and live consumers verified`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
