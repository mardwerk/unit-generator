import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { schemaIssues, type JsonSchema } from '@mardwerk/unit-core';
import { applyModifiers } from '../src/mechanics/modifiers.js';
import { localizeTargetingSchema } from '../src/mechanics/targeting.js';
import {
  createModifierAccumulator,
  modifierAccumulatorSchema,
  type ModifierAccumulatorProfile
} from '../src/mechanics/modifier-accumulator.js';

const profile = (patch: Partial<ModifierAccumulatorProfile> = {}): ModifierAccumulatorProfile => ({
  id: 'synthetic-counter',
  threshold: 10,
  maxStacks: 3,
  inactivitySeconds: 2,
  modifier: {
    id: 'synthetic-ramp',
    stat: 'attack.damage',
    operation: 'add',
    value: 2,
    group: 'synthetic-ramp',
    stacking: 'stack',
    maxStacks: 3,
    radius: null,
    includesOwner: true,
    includesSubordinates: true
  },
  ...patch
});
const owner = { id: 'owner', parentId: null, x: 0, y: 0 };
const damage = (
  modifiers: ReturnType<ReturnType<typeof createModifierAccumulator>['snapshot']>['modifiers']
) => applyModifiers(1, 'attack.damage', owner, [{ ...owner, modifiers }]).value;

it('retains partial earnings, crosses thresholds and caps executable modifier stacks', () => {
  const counter = createModifierAccumulator(profile());
  expect(damage(counter.earn(9, 0).modifiers)).toBe(1);
  expect(damage(counter.earn(1, 0).modifiers)).toBe(3);
  expect(counter.earn(15, 0)).toMatchObject({ earned: 25, stacks: 2 });
  const capped = counter.earn(1e100, 0);
  expect(capped).toMatchObject({ earned: 30, stacks: 3 });
  expect(damage(capped.modifiers)).toBe(7);
  expect(capped.modifiers.map((m) => m.id)).toEqual([
    'synthetic-counter/stack/1',
    'synthetic-counter/stack/2',
    'synthetic-counter/stack/3'
  ]);
});

it('resets at inactivity boundaries before a same-time earning event', () => {
  const counter = createModifierAccumulator(profile());
  counter.earn(20, 0);
  expect(counter.snapshot(1.999).stacks).toBe(2);
  expect(counter.earn(10, 2)).toMatchObject({
    earned: 10,
    stacks: 1,
    lastEarnedAt: 2,
    expiresAt: 4
  });
  expect(counter.snapshot(4)).toMatchObject({
    earned: 0,
    stacks: 0,
    lastEarnedAt: null,
    expiresAt: null
  });
});

it('refreshes expiry for positive earning at the cap but not zero or invalid events', () => {
  const counter = createModifierAccumulator(profile());
  counter.earn(30, 0);
  expect(counter.earn(1, 1).expiresAt).toBe(3);
  expect(counter.earn(0, 2).expiresAt).toBe(3);
  expect(() => counter.earn(-1, 2.5)).toThrow('nonnegative');
  expect(counter.snapshot(2)).toMatchObject({ at: 2, earned: 30, expiresAt: 3 });
  expect(counter.snapshot(3).stacks).toBe(0);
});

it('supports explicit reset and no automatic expiry with monotonically increasing time', () => {
  const counter = createModifierAccumulator(profile({ inactivitySeconds: null }));
  counter.earn(10, 0);
  expect(counter.snapshot(100).stacks).toBe(1);
  expect(counter.reset(100)).toMatchObject({ earned: 0, stacks: 0, lastEarnedAt: null });
  expect(() => counter.snapshot(99)).toThrow('nondecreasing');
  expect(() => counter.earn(1, NaN)).toThrow('finite');
  expect(() => counter.earn(Infinity, 101)).toThrow('finite');
  expect(counter.snapshot(100).at).toBe(100);
});

it('uses the existing modifier multiplication policy and predicates with isolated returned data', () => {
  const input = profile();
  input.modifier = {
    ...input.modifier,
    operation: 'multiply',
    value: 0.5,
    recipientFilter: { kind: 'identity', field: 'id', values: ['owner'] }
  };
  const counter = createModifierAccumulator(input);
  input.modifier.value = 99;
  const two = counter.earn(20, 0);
  expect(damage(two.modifiers)).toBe(0.25);
  two.modifiers[0]!.value = 10;
  expect(damage(counter.snapshot(0).modifiers)).toBe(0.25);
  expect(
    applyModifiers(1, 'attack.damage', { ...owner, id: 'other' }, [
      { ...owner, modifiers: counter.snapshot(0).modifiers }
    ]).value
  ).toBe(1);
});

it('rejects invalid caps, nonnumeric/set profiles and localizes the repeated target schema', () => {
  for (const patch of [
    { threshold: 0 },
    { threshold: Infinity },
    { maxStacks: 257 },
    { maxStacks: 2 },
    { inactivitySeconds: 0 }
  ])
    expect(() => createModifierAccumulator(profile(patch))).toThrow('Invalid');
  const set = profile();
  Object.assign(set.modifier, { operation: 'set' });
  expect(() => createModifierAccumulator(set)).toThrow('Invalid');
  const input = profile();
  input.modifier.recipientFilter = { kind: 'not', predicate: { kind: 'constant', value: false } };
  expect(Value.Check(modifierAccumulatorSchema, input)).toBe(true);
  const schema = localizeTargetingSchema(
    Type.Object({ a: modifierAccumulatorSchema, b: modifierAccumulatorSchema })
  );
  expect(
    schemaIssues(JSON.parse(JSON.stringify(schema)) as JsonSchema, { a: input, b: input })
  ).toEqual([]);
});

const druidFile = process.env.BTD6_ACCUMULATOR_DRUID_REFERENCE_FILE;
it.skipIf(!druidFile)(
  'executes private captured threshold/bonus/cap and independent mutations',
  () => {
    const source = JSON.parse(readFileSync(druidFile!, 'utf8'));
    const fields = source.behaviors[6].damageModifierWrathModel;
    expect(String(fields.$type)).toContain('.DamageModifierWrathModel,');
    expect(fields.collisionPass).toBe(0);
    // The adapter supplies these earnings explicitly. This does not claim that the
    // source Wrath ability earns stacks from dealt damage instead of live RBE.
    const execute = (
      earned: number,
      threshold = fields.rbeThreshold,
      bonus = fields.damage,
      cap = fields.maxDamageBoost
    ) => {
      const maxStacks = cap / bonus;
      const input = profile({ threshold, maxStacks, inactivitySeconds: null });
      input.modifier = { ...input.modifier, value: bonus, maxStacks };
      return damage(createModifierAccumulator(input).earn(earned, 0).modifiers) - 1;
    };
    expect(execute(fields.rbeThreshold - 1)).toBe(0);
    expect(execute(fields.rbeThreshold)).toBe(fields.damage);
    expect(execute((fields.rbeThreshold * fields.maxDamageBoost) / fields.damage)).toBe(
      fields.maxDamageBoost
    );
    expect(execute(fields.rbeThreshold, fields.rbeThreshold * 2)).toBe(0);
    expect(
      execute(1e9, fields.rbeThreshold, fields.damage, fields.maxDamageBoost - fields.damage)
    ).toBe(fields.maxDamageBoost - fields.damage);
    expect(execute(fields.rbeThreshold, fields.rbeThreshold, fields.damage * 2)).toBe(
      fields.damage * 2
    );
  }
);

const skywardenFile = process.env.BTD6_ACCUMULATOR_SKYWARDEN_REFERENCE_FILE;
it.skipIf(!skywardenFile)(
  'expires a private captured stack cap under explicit frame conversion',
  () => {
    const source = JSON.parse(readFileSync(skywardenFile!, 'utf8'));
    const fields = source.behaviors[9];
    expect(String(fields.$type)).toContain('.DamageBasedAttackSpeedModel,');
    // 60 frames/second is caller-supplied test policy, not established native timing.
    // Output only establishes the stack count. The source .05 rate formula is unqualified.
    const inactivitySeconds = fields.maxTimeInFramesWithoutDamage / 60;
    const input = profile({
      threshold: fields.damageThreshold,
      maxStacks: fields.maxStacks,
      inactivitySeconds
    });
    input.modifier.maxStacks = fields.maxStacks;
    const counter = createModifierAccumulator(input);
    expect(counter.earn(fields.damageThreshold * 20, 0).stacks).toBe(fields.maxStacks);
    expect(counter.snapshot(inactivitySeconds - 0.001).stacks).toBe(fields.maxStacks);
    expect(counter.snapshot(inactivitySeconds).stacks).toBe(0);
  }
);
