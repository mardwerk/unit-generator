import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultAuthoringDefinition } from '../src/core/default-profile.js';
import { pathKeys, tierKeys } from '../src/core/mechanics/schemas.js';
import { modelOutputJsonSchema, modelOutputSchema } from '../src/core/planned-v1/model-output.js';
import { miraRequest } from './fixtures/core-fixtures.js';

const followUp = {
  name: 'Echo',
  count: 1,
  damageMultiplier: 0.5,
  radius: 2,
  inheritStatuses: false,
};
function request() {
  return { ...miraRequest(), mechanicsDefinition: structuredClone(defaultAuthoringDefinition) };
}

test('numerical grammar permits active follow-ups only on the eligible path from boost unlock', () => {
  const input = request();
  input.mechanicsDefinition.rules.attackExtensions = ['volley-follow-up'];
  const schema = modelOutputSchema(input);
  for (const path of pathKeys)
    for (const tier of tierKeys) {
      const fields = schema.shape.paths.shape[path].shape.tiers.shape[tier].shape;
      assert.equal(
        fields.activeFollowUp.safeParse(followUp).success,
        path === 'path2' && (tier === 'tier4' || tier === 'tier5'),
        `${path}.${tier}`,
      );
      assert.equal(fields.activeFollowUp.safeParse(null).success, true);
      assert.equal(fields.activeFollowUp.safeParse(undefined).success, true);
      // Passive follow-ups remain available, including before manual boost unlock.
      assert.equal(fields.followUp.safeParse(followUp).success, true);
    }
});

test('custom manual path, omitted policy, and explicit prohibitions retain their semantics', () => {
  const input = request();
  input.mechanicsDefinition.rules.attackExtensions = ['volley-follow-up'];
  const policy = input.mechanicsDefinition.profile.designPolicy!;
  for (const setting of ['path3', undefined, null] as const) {
    policy.manualAbilityPath = setting;
    const schema = modelOutputSchema(input);
    for (const path of pathKeys) {
      const fields = schema.shape.paths.shape[path].shape.tiers.shape.tier4.shape;
      assert.equal(
        fields.activeFollowUp.safeParse(followUp).success,
        setting === undefined || setting === path,
      );
    }
  }
  delete policy.manualAbilityPath;
  policy.maxManualAbilityPaths = 0;
  const fields = modelOutputSchema(input).shape.paths.shape.path1.shape.tiers.shape.tier5.shape;
  assert.equal(fields.activeFollowUp.safeParse(followUp).success, false);
  assert.equal(
    fields.boostChanges.safeParse([{ stat: 'damageMultiplier', operation: 'add', value: 1 }])
      .success,
    false,
  );
  delete input.mechanicsDefinition.profile.designPolicy;
  assert.equal(
    modelOutputSchema(
      input,
    ).shape.paths.shape.path1.shape.tiers.shape.tier4.shape.activeFollowUp.safeParse(followUp)
      .success,
    true,
  );
});

test('extension availability constrains base and tier grammar without forbidding same-primary', () => {
  const input = request();
  delete input.mechanicsDefinition.rules.attackExtensions;
  const schema = modelOutputSchema(input);
  const fields = [
    schema.shape.baseAttack.shape,
    ...pathKeys.flatMap((path) =>
      tierKeys.map((tier) => schema.shape.paths.shape[path].shape.tiers.shape[tier].shape),
    ),
  ];
  for (const field of fields) {
    assert.equal(field.followUp.safeParse(followUp).success, false);
    assert.equal(field.distribution.safeParse('distinct-targets').success, false);
    assert.equal(field.distribution.safeParse('same-primary').success, true);
  }
  assert.equal(
    schema.shape.paths.shape.path2.shape.tiers.shape.tier4.shape.activeFollowUp.safeParse(followUp)
      .success,
    false,
  );
  input.mechanicsDefinition.rules.attackExtensions = ['volley-follow-up', 'distinct-volley'];
  assert.equal(
    modelOutputSchema(input).shape.baseAttack.shape.followUp.safeParse(followUp).success,
    true,
  );
  assert.equal(
    modelOutputSchema(input).shape.baseAttack.shape.distribution.safeParse('distinct-targets')
      .success,
    true,
  );
  assert.equal(
    modelOutputSchema(miraRequest()).shape.baseAttack.shape.followUp.safeParse(followUp).success,
    true,
  );
});

test('planned and direct provider grammars expose null-only forbidden active follow-ups', () => {
  const input = request();
  input.mechanicsDefinition.rules.attackExtensions = ['volley-follow-up'];
  for (const planned of [false, true]) {
    type Schema = { type?: string; properties: Record<string, Schema>; anyOf?: Schema[] };
    const schema = modelOutputJsonSchema(input, planned) as Schema;
    const paths = schema.properties.paths!.properties;
    for (const path of pathKeys)
      for (const tier of tierKeys) {
        const active = paths[path]!.properties.tiers!.properties[tier]!.properties.activeFollowUp!;
        if (path === 'path2' && (tier === 'tier4' || tier === 'tier5'))
          assert.ok(active.anyOf?.some((choice) => choice.type === 'object'));
        else assert.equal(active.type, 'null');
      }
  }
});
