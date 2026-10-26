import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readAssetEvidence,
  validateAssets,
} from '../../tools/design-assets.mjs';

const baseline = await readAssetEvidence();

test('historical assets, runtime copies, fonts and single-workspace budget remain traceable', () => {
  assert.deepEqual(validateAssets(baseline), {
    historicalAssets: 14,
    runtimeAssets: 12,
    fonts: 2,
  });
});

test('rejects a changed runtime image even if its filename is still allowed', () => {
  const files = new Map(baseline.files);
  files.set(
    'apps/desktop/src/renderer/assets/hazel/paper-butterfly.png',
    Buffer.from('corrupted'),
  );
  assert.throws(
    () => validateAssets({ ...baseline, files }),
    /Runtime asset hash/,
  );
});

test('rejects an extra or reserved runtime asset and a foreign consumer', () => {
  assert.throws(
    () =>
      validateAssets({
        ...baseline,
        runtimeFiles: [...baseline.runtimeFiles, 'compass-seal.svg'],
      }),
    /catalog mismatch/,
  );
  const sources = new Map(baseline.sources);
  sources.set(
    'apps/desktop/src/renderer/components/Extra.tsx',
    "import art from '../assets/hazel/paper-butterfly.png';",
  );
  assert.throws(
    () => validateAssets({ ...baseline, sources }),
    /Unapproved asset consumer/,
  );
});

test('rejects relaxed decoration budgets, missing selection entries and replaced historical evidence', () => {
  const policy = structuredClone(baseline.policy);
  policy.budget.activeTaskIllustrations = 1;
  assert.throws(() => validateAssets({ ...baseline, policy }), /budget drift/);
  policy.budget.activeTaskIllustrations = 0;
  policy.conversationPool.pop();
  assert.throws(
    () => validateAssets({ ...baseline, policy }),
    /account for every approved asset/,
  );
  const files = new Map(baseline.files);
  files.set(
    'docs/design/hazel-v3/Pioneer-Hazel-v3-assets.zip',
    Buffer.from('replaced'),
  );
  assert.throws(
    () => validateAssets({ ...baseline, files }),
    /Historical asset evidence changed/,
  );
});
