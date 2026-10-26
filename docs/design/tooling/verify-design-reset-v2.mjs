import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const design = path.join(root, 'docs/design');
const problems = [];
const readJSON = (name) =>
  JSON.parse(fs.readFileSync(path.join(design, name), 'utf8'));
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}
let jsonFiles = 0;
for (const file of walk(design).filter((p) => p.endsWith('.json'))) {
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
    jsonFiles++;
  } catch (error) {
    problems.push({ file: path.relative(root, file), error: error.message });
  }
}
const docs = [
  'README.md',
  'themasterplan/ROADMAP.md',
  'docs/plans/2026-09-28-pioneer-integrated-closeout.md',
  'docs/design/DESIGN-SYSTEM.md',
  'docs/design/workbench-product-spec.md',
  'docs/design/development-reset.md',
  'docs/design/design-reset-handoff.md',
  'docs/design/references/claude-2026-09-28/DESIGN.md',
  'docs/design/references/claude-2026-09-28/DESKTOP.md',
];
let localLinks = 0,
  externalLinks = 0;
for (const rel of docs) {
  const file = path.join(root, rel);
  const text = fs
    .readFileSync(file, 'utf8')
    .replace(/```[^\n]*\n[\s\S]*?```/g, '');
  for (const match of text.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const href = match[1].replace(/^<|>$/g, '').replace(/\s+".*"$/, '');
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      externalLinks++;
      continue;
    }
    const target = href.split('#')[0];
    if (!target) continue;
    localLinks++;
    if (
      !fs.existsSync(
        path.resolve(path.dirname(file), decodeURIComponent(target)),
      )
    )
      problems.push({ file: rel, missingLink: href });
  }
}
const ledger = readJSON('design-reset-state-2026-09-28.json');
const audit = readJSON('design-reset-completion-audit-2026-09-30.json');
const qa = readJSON('design-reset-final-qa-2026-09-30.json');
const componentMap = readJSON('design-reset-component-map-2026-09-29.json');
const coverage = audit.coverageEvidence.map((name) => ({
  name,
  data: readJSON(name).result,
}));
const states = coverage.flatMap((x) => x.data.states || []);
const screens = coverage.flatMap((x) => x.data.screens || []);
const components = coverage.flatMap((x) => x.data.components || []);
const assert = (ok, label) => {
  if (!ok) problems.push({ assertion: label });
};
assert(
  components.length === 14 &&
    components.reduce((n, c) => n + c.variants, 0) === 78,
  '14 component families / 78 variants',
);
assert(Object.keys(componentMap).length === 14, 'component map family count');
assert(
  coverage.some((x) => x.data.internalCloseVariants === 3),
  '3 internal Close variants',
);
assert(
  screens.length === 21 && ledger.screens.length === 21,
  '21 full windows',
);
assert(states.length === 81, '81 state compositions');
assert(
  new Set(screens.map((s) => s.screenId)).size === 21 &&
    new Set(states.map((s) => s.stateId)).size === 81,
  'unique screen/state IDs',
);
assert(
  qa.pages.length === 7 &&
    qa.pages.reduce((n, p) => n + p.structure.texts, 0) === 1697,
  '7 pages / 1697 text nodes',
);
for (const v of coverage)
  assert(
    !v.data.error && v.data.problems.length === 0,
    `${v.name}: coverage has no missing planned item`,
  );
for (const p of qa.pages) {
  assert(
    Object.values(p.structure.issues).every((a) => a.length === 0),
    `${p.structure.pageId}: no blocking structural issue`,
  );
  assert(
    p.contrast.failures.length === 0 &&
      p.contrast.unknown.length === 0 &&
      p.contrast.tested === p.structure.texts,
    `${p.structure.pageId}: every text node has passing actual solid-color contrast`,
  );
  for (const e of p.structure.documentedExceptions.insideStrokeBoundaryOffsets)
    assert(
      e.bounds[0] === 1 &&
        e.bounds[2] === e.parentSize[0] &&
        e.bounds[1] >= 0 &&
        e.bounds[1] + e.bounds[3] <= e.parentSize[1] + 0.01,
      `${e.id}: exact right-border offset`,
    );
  for (const e of p.structure.documentedExceptions.cjkCodeFallbacks)
    assert(
      e.adjacentCodePeer &&
        (e.adjacentCodePeer.end === e.start ||
          e.adjacentCodePeer.start === e.end),
      `${e.id}: CJK fallback has adjacent Code peer`,
    );
}
const handoff = fs.readFileSync(
  path.join(design, 'design-reset-handoff.md'),
  'utf8',
);
const rows = [...handoff.matchAll(/^\|\s*([A-Z]\d{2})\s*\|(.+)$/gm)];
assert(rows.length === 102, '21 screen and 81 state handoff rows');
for (const s of [
  ...screens.map((x) => ({ id: x.screenId, nodeId: x.nodeId })),
  ...states.map((x) => ({ id: x.stateId, nodeId: x.nodeId })),
]) {
  const found = rows.filter((r) => r[1] === s.id);
  assert(
    found.length === 1 &&
      found[0][2].includes('node-id=' + s.nodeId.replace(':', '-')),
    `${s.id}: exact live node handoff`,
  );
}
for (const requirement of audit.requirements)
  for (const href of requirement.evidence)
    assert(
      fs.existsSync(path.resolve(design, href)),
      `${requirement.id}: evidence ${href} exists`,
    );
for (const name of qa.pageEvidence)
  assert(
    fs.existsSync(path.join(design, name)),
    `${name}: current QA evidence exists`,
  );
const roadmap = fs.readFileSync(
  path.join(root, 'themasterplan/ROADMAP.md'),
  'utf8',
);
const plan = fs.readFileSync(
  path.join(root, 'docs/plans/2026-09-28-pioneer-integrated-closeout.md'),
  'utf8',
);
assert(
  /设计 P12[^\n]+PLANNED/.test(roadmap) &&
    /工程 M2[^\n]+IN PROGRESS/.test(roadmap) &&
    /工程 M3[^\n]+PLANNED/.test(roadmap),
  'P12/M2/M3 statuses not promoted',
);
assert(
  /Current \[Figma v2 main page `717:1578`\]/.test(plan),
  'P12 plan targets current main',
);
assert(
  !/当前状态[\s\S]*后续代码任务须等待用户明确恢复/.test(roadmap),
  'obsolete backend pause gate removed',
);
assert(
  /无需再次通知或征询复工授权/.test(roadmap) &&
    /local backend work to resume/.test(plan),
  'latest backend resume authorization preserved',
);
if (process.argv.includes('--final')) {
  assert(
    ledger.phase === 'complete-static-design-delivery' &&
      ledger.pending.length === 0 &&
      ledger.completed.includes('P4.d'),
    'closed static design ledger',
  );
  assert(
    audit.status === 'complete-static-design-delivery' &&
      audit.requirements.length === 8 &&
      audit.requirements.every((r) => r.result === 'PASS'),
    'all eight completion requirements passed',
  );
  assert(
    ledger.qa.structureAndTextContrast ===
      'design-reset-final-qa-2026-09-30.json',
    'ledger points to current final QA',
  );
  assert(
    ledger.backendResumeAuthorization.localBackendAsNeeded === true &&
      ledger.backendResumeAuthorization.repeatedResumeApprovalRequired ===
        false,
    'backend resumes without repeat authorization',
  );
  assert(
    ledger.prototype.pageId === '717:1578' &&
      ledger.prototype.starts === 0 &&
      ledger.prototype.reactionNodes === 0 &&
      ledger.prototype.p12.startsWith('PLANNED'),
    'static delivery does not promote P12',
  );
  assert(
    readJSON('design-reset-document-review-2026-09-30.json').result === 'PASS',
    'independent document review passed',
  );
}
const output = {
  date: '2026-09-30',
  mode: process.argv.includes('--final')
    ? 'final-closed-ledger'
    : 'asset-check',
  scope:
    'local design JSON, named authority/source-document links, exact handoff IDs/counts and static evidence; no application/runtime test',
  jsonFiles,
  localLinks,
  externalLinksRecordedNotHTTPTested: externalLinks,
  handoffRows: rows.length,
  screenRows: screens.length,
  stateRows: states.length,
  problems,
};
fs.writeFileSync(
  path.join(design, 'design-reset-local-checks-2026-09-30.json'),
  JSON.stringify(output, null, 2) + '\n',
);
console.log(JSON.stringify(output));
process.exitCode = problems.length ? 1 : 0;
