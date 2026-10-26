import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { root } from './design-tokens.mjs';

export function validateMapping(mapping, design, source) {
  assert(
    ['partial', 'blocked', 'mapped'].includes(mapping.status),
    'Invalid component mapping status',
  );
  assert.equal(mapping.designNode, design.ownerId, 'Design node mismatch');
  assert.deepEqual(
    mapping.designProperties,
    design.properties,
    'Design property/variant drift',
  );
  assert.deepEqual(
    mapping.variants.map((v) => v.name).sort(),
    design.variants.map((v) => v.name).sort(),
    'Design variant coverage mismatch',
  );
  for (const variant of mapping.variants) {
    assert(
      ['mapped', 'preserved-difference', 'unsupported', 'blocked'].includes(
        variant.status,
      ),
      `Unsupported mapping status: ${variant.status}`,
    );
    assert(
      variant.reason?.length > 0,
      'Every design variant needs a disposition',
    );
  }
  if (
    mapping.variants.some((v) => ['unsupported', 'blocked'].includes(v.status))
  )
    assert.notEqual(
      mapping.status,
      'mapped',
      'Incomplete variants cannot be marked mapped',
    );
  if (!mapping.code.inAcceptedMain && !mapping.code.proposedInThisPR) {
    assert.equal(
      source,
      null,
      'Candidate code now exists: re-pin accepted version and review mapping',
    );
    assert.equal(
      mapping.status,
      'blocked',
      'Unaccepted code cannot be marked mapped',
    );
    assert.equal(
      mapping.example,
      null,
      'Do not generate usage for unaccepted code',
    );
    return;
  }
  assert(source !== null, `Missing real export: ${mapping.code.exportName}`);
  const normalized = source.replaceAll('\r\n', '\n');
  const blob = createHash('sha1')
    .update(`blob ${Buffer.byteLength(normalized)}\0`)
    .update(normalized)
    .digest('hex');
  assert.equal(
    blob,
    mapping.code.blob,
    'Component source drift: review props/behavior and update version evidence',
  );
  const filename = path.join(root, mapping.code.path);
  const host = ts.createCompilerHost({ jsx: ts.JsxEmit.Preserve });
  const originalRead = host.readFile;
  host.readFile = (file) => (file === filename ? source : originalRead(file));
  const program = ts.createProgram(
    [filename],
    { jsx: ts.JsxEmit.Preserve, noResolve: true },
    host,
  );
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(filename);
  const exported = checker.getExportsOfModule(
    checker.getSymbolAtLocation(sourceFile),
  );
  const symbol = exported.find((s) => s.name === mapping.code.exportName);
  assert(symbol, `Missing real export: ${mapping.code.exportName}`);
  const signature = checker
    .getTypeOfSymbolAtLocation(symbol, sourceFile)
    .getCallSignatures()[0];
  assert(signature?.parameters[0], 'Expected a real React props parameter');
  const props = checker
    .getTypeOfSymbolAtLocation(signature.parameters[0], sourceFile)
    .getProperties()
    .map((p) => p.name)
    .sort();
  assert.deepEqual(
    Object.keys(mapping.code.props).sort(),
    props,
    'Real React props mismatch',
  );
  for (const prop of mapping.usedProps)
    assert(props.includes(prop), `Invented prop: ${prop}`);
  if (mapping.code.proposedInThisPR) {
    assert.match(
      mapping.code.baseCommit,
      /^[a-f0-9]{40}$/,
      'Missing accepted base version',
    );
    assert.match(
      mapping.code.mainBlob,
      /^[a-f0-9]{40}$/,
      'Missing accepted base blob',
    );
    assert.equal(
      mapping.code.inAcceptedMain,
      false,
      'Do not label a same-PR extension as already in main',
    );
  }
}

export function validateVariantEvidence(
  mapping,
  exampleNames,
  registeredTests,
) {
  assert.deepEqual(
    exampleNames.toSorted(),
    mapping.variants.map((v) => v.name).sort(),
    'Typed example variant coverage mismatch',
  );
  for (const variant of mapping.variants) {
    assert(variant.exercise?.length > 0, 'Missing variant exercise');
    assert(variant.evidence?.length > 0, 'Missing variant test evidence');
    for (const proof of variant.evidence)
      assert(
        registeredTests.get(proof.path)?.includes(proof.test),
        `Missing enabled Electron test: ${proof.path} / ${proof.test}`,
      );
  }
}

function registeredTestNames(source) {
  const file = ts.createSourceFile(
    'test.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const names = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'test' &&
      ts.isStringLiteral(node.arguments[0])
    )
      names.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

function sourceBlob(source) {
  const normalized = source.replaceAll('\r\n', '\n');
  return createHash('sha1')
    .update(`blob ${Buffer.byteLength(normalized)}\0`)
    .update(normalized)
    .digest('hex');
}

export async function checkMappings({ requireComplete = false } = {}) {
  const index = JSON.parse(
    await readFile(
      path.join(root, 'design/sync/component-mappings.json'),
      'utf8',
    ),
  );
  const s0 = JSON.parse(
    await readFile(
      path.join(root, 'docs/research/design-sync-s0/component-index.json'),
      'utf8',
    ),
  );
  assert.equal(
    index.route,
    'lightweight-index',
    'S0 fallback route must be explicit',
  );
  assert.equal(
    index.officialCodeConnectPublished,
    false,
    'No official publication evidence',
  );
  assert.deepEqual(
    index.components.map((m) => m.designNode).sort(),
    s0.components.map((m) => m.ownerId).sort(),
    'Three pilot inventory mismatch',
  );
  const exampleFile = path.join(root, index.examples.path);
  const configFile = path.join(root, 'apps/desktop/design/tsconfig.json');
  const config = ts.readConfigFile(configFile, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    path.dirname(configFile),
  );
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    diagnostics
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
      .join('\n'),
  );
  const checker = program.getTypeChecker();
  const examples = program.getSourceFile(exampleFile);
  assert(examples, 'Typed mapping examples are not compiled');
  const exports = checker.getExportsOfModule(
    checker.getSymbolAtLocation(examples),
  );
  const playwright = await readFile(
    path.join(root, 'tests/e2e/playwright.config.ts'),
    'utf8',
  );
  const registeredTests = new Map();
  for (const file of index.electronTests) {
    assert(
      playwright.includes(`'${path.basename(file)}'`),
      `Electron evidence is not in testMatch: ${file}`,
    );
    registeredTests.set(
      file,
      registeredTestNames(await readFile(path.join(root, file), 'utf8')),
    );
  }
  for (const [file, blob] of Object.entries(index.evidenceFiles))
    assert.equal(
      sourceBlob(await readFile(path.join(root, file), 'utf8')),
      blob,
      `Mapping evidence drift: ${file}`,
    );
  for (const mapping of index.components) {
    let source = null;
    try {
      source = await readFile(path.join(root, mapping.code.path), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    validateMapping(
      mapping,
      s0.components.find((c) => c.ownerId === mapping.designNode),
      source,
    );
    const symbol = exports.find((s) => s.name === mapping.examplesExport);
    assert(symbol, `Missing typed examples: ${mapping.examplesExport}`);
    const signature = checker
      .getTypeOfSymbolAtLocation(symbol, examples)
      .getCallSignatures()[0];
    const names = checker
      .getReturnTypeOfSignature(signature)
      .getProperties()
      .map((p) => p.name);
    validateVariantEvidence(mapping, names, registeredTests);
  }
  const blocked = index.components.filter((c) => c.status !== 'mapped');
  assert.equal(
    index.complete,
    blocked.length === 0,
    'Index completion flag disagrees with component evidence',
  );
  console.log(
    `Mapping evidence valid; ${blocked.length}/3 pilots still incomplete (see design/sync/component-mappings.json)`,
  );
  if (requireComplete)
    assert.equal(
      blocked.length,
      0,
      'S1 acceptance BLOCKED: missing component mapping/variant evidence; do not close #35',
    );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await checkMappings({
    requireComplete: process.argv.includes('--require-complete'),
  });
