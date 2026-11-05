import assert from 'node:assert/strict';
import test from 'node:test';

import { deliveryBranch } from '../../tools/design-delivery-branch.mjs';

test('a delivery slot is keyed by feature and fixed version', () => {
  assert.equal(
    deliveryBranch('change-approval-preview', '2417974925530194542'),
    'codex/design-change-approval-preview-2417974925530194542',
  );
  assert.equal(
    deliveryBranch('change-approval-preview', '2417974925530194542'),
    deliveryBranch('change-approval-preview', '2417974925530194542'),
  );
  assert.notEqual(
    deliveryBranch('change-approval-preview', '2417974925530194542'),
    deliveryBranch('change-approval-preview', '2417598685933588034'),
  );
});

test('invalid feature ids and versions are rejected', () => {
  assert.throws(() => deliveryBranch('Bad Id', '1'));
  assert.throws(() => deliveryBranch('change-approval-preview', '1/2'));
});
