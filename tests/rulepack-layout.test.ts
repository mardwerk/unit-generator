import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPackImmutable,
  assertSupportedBehavior,
  compareLayouts,
  defaultDesignProfile,
  fourPathPack,
  getRulePack,
  planFromLayout,
  publicThreePathPack,
  validateLayoutPlan,
} from '../src/core/index.js';
import { defaultMechanicsDefinition } from '../src/core/mechanics/schemas.js';
import { luffyReferencePack, plainSwordsmanReference } from './fixtures/luffy-reference.js';

test('public pack proposes Haki paths and apex but rejects silent shared Gear progression', () => {
  const reference = luffyReferencePack();
  const selection = compareLayouts(reference, publicThreePathPack, defaultDesignProfile);
  assert.equal(selection.selected.paths.length, 3);
  assert.equal(selection.selected.sharedForms, null);

  const smuggled = planFromLayout(reference, publicThreePathPack, {
    ...selection.selected,
    sharedForms: 'reference.gear_progression',
  });
  const issues = validateLayoutPlan(
    { ...smuggled, bindings: { ...smuggled.bindings, shared_forms: 'reference.gear_progression' } },
    reference,
    publicThreePathPack,
  );
  assert.ok(
    issues.some((issue) => issue.message.includes('Unsupported design binding: shared_forms')),
  );
  assert.ok(issues.some((issue) => issue.message.includes('td-three-path@1.0.0')));
  assert.ok(issues.some((issue) => issue.message.includes('shared-forms@1.0.0')));

  const supported = planFromLayout(reference, publicThreePathPack, selection.selected);
  assert.equal(supported.bindings.shared_forms, null);
  assert.deepEqual(validateLayoutPlan(supported, reference, publicThreePathPack), []);
  assert.equal(supported.bindings.apex.specialization_policy, 'integrate_all_paths');
});

test('four-path pack proposes and validates four-path layouts without generator code changes', () => {
  const reference = luffyReferencePack();
  const selection = compareLayouts(reference, fourPathPack, defaultDesignProfile);
  assert.equal(selection.selected.paths.length, 4);
  const plan = planFromLayout(reference, fourPathPack, selection.selected);
  assert.equal(Object.keys(plan.bindings.specialization_paths).length, 4);
  assert.deepEqual(validateLayoutPlan(plan, reference, fourPathPack), []);
});

test('a reference with no transformations does not invent mandatory forms', () => {
  const reference = plainSwordsmanReference();
  const selection = compareLayouts(reference, publicThreePathPack, defaultDesignProfile);
  assert.equal(selection.selected.sharedForms, null);
  const plan = planFromLayout(reference, publicThreePathPack, selection.selected);
  assert.equal(plan.bindings.shared_forms, null);
  assert.deepEqual(validateLayoutPlan(plan, reference, publicThreePathPack), []);
});

test('unsupported behavior fails with a specific missing-capability diagnostic', () => {
  assert.throws(
    () => assertSupportedBehavior('future_sight', defaultMechanicsDefinition),
    /Unsupported behavior: future_sight/,
  );
  assert.throws(
    () => assertSupportedBehavior('future_sight', defaultMechanicsDefinition),
    /Record it as a reserved technique/,
  );
  assert.doesNotThrow(() => assertSupportedBehavior('damage', defaultMechanicsDefinition));
});

test('a revision cannot weaken crosspath restrictions by editing its governing pack', () => {
  assert.throws(
    () => assertPackImmutable('td-three-path@1.0.0', 'td-three-path@9.9.9'),
    /Candidates cannot edit their governing pack/,
  );
  assert.doesNotThrow(() => assertPackImmutable('td-three-path@1.0.0', 'td-three-path@1.0.0'));
  assert.equal(getRulePack('td-three-path@1.0.0').id, 'td-three-path');
  assert.throws(() => getRulePack('no-such-pack@1.0.0'), /Unknown RulePack/);
});
