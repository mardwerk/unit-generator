import assert from 'node:assert/strict';
import test from 'node:test';
import { planFeasibilityIssues } from '../src/core/planned-v1/plan-feasibility.js';
import { designPlanSchema, type UnitDesignPlan } from '../src/core/planned-v1/plan-schema.js';
import { defaultMechanicsDefinition, pathKeys, tierKeys } from '../src/core/mechanics/schemas.js';

function fixture() {
  const plan = designPlanSchema.parse({
    concept: 'Develop an aimed attack.',
    signature: { name: 'Spark', sourceIds: ['source:0'], adaptation: 'An aimed attack.' },
    repertoire: [{ name: 'Spark', sourceIds: ['source:0'], limitation: 'Needs clear delivery.' }],
    base: { name: 'Spark', sourceIds: ['source:0'], behavior: 'Fire an aimed attack.' },
    paths: Object.fromEntries(
      pathKeys.map((path) => [
        path,
        {
          name: path,
          sourceIds: ['source:0'],
          buyFor: 'Improve sustained damage.',
          weakness: 'Needs clear delivery.',
          milestones: Object.fromEntries(tierKeys.map((tier) => [tier, 'Improve the attack.'])),
          capstoneValue: 'Sustain pressure on durable targets.',
          crosspaths: pathKeys
            .filter((other) => other !== path)
            .map((other) => ({
              path: other,
              contribution: 'Develop the ordinary attack.',
            })),
          referenceExample: 'Develop an existing attack.',
        },
      ]),
    ),
    omittedTechniques: [],
    scopeLimits: [],
    upgradeIntents: Object.fromEntries(
      pathKeys.map((path) => [
        path,
        Object.fromEntries(
          tierKeys.map((tier) => [tier, { improves: ['damage'], unlock: 'none' }]),
        ),
      ]),
    ),
  }) as UnitDesignPlan & { upgradeIntents: NonNullable<UnitDesignPlan['upgradeIntents']> };
  const definition = structuredClone(defaultMechanicsDefinition);
  return { plan, definition };
}

test('legacy plans and feasible intents pass without mutating inputs or reviewing creative prose', () => {
  const { plan, definition } = fixture();
  plan.paths.path1.capstoneValue = 'An impossibly dramatic cosmic finale.';
  const before = structuredClone({ plan, definition });
  assert.deepEqual(planFeasibilityIssues(plan, definition), []);
  assert.deepEqual({ plan, definition }, before);
  const legacy: UnitDesignPlan = structuredClone(plan);
  delete legacy.upgradeIntents;
  assert.deepEqual(planFeasibilityIssues(legacy, definition), []);
});

test('active promises require the same path to explicitly unlock its tier four boost', () => {
  for (const intent of [
    { improves: ['active-damage'] as const, unlock: 'none' as const },
    { improves: [] as const, unlock: 'active-follow-up' as const },
  ]) {
    const { plan, definition } = fixture();
    plan.upgradeIntents.path2.tier4 = { improves: [], unlock: 'manual-boost' };
    plan.upgradeIntents.path1.tier5 = { ...intent, improves: [...intent.improves] };
    const issues = planFeasibilityIssues(plan, definition);
    assert.equal(issues.length, 1);
    assert.equal(issues[0]!.path, 'upgradeIntents.path1.tier5');
    assert.match(issues[0]!.message, /same-path manual-boost at tier4/);
    plan.upgradeIntents.path1.tier4 = { improves: [], unlock: 'manual-boost' };
    assert.deepEqual(planFeasibilityIssues(plan, definition), []);
  }
});

test('a later or incorrectly timed boost cannot satisfy an earlier active promise', () => {
  const { plan, definition } = fixture();
  plan.upgradeIntents.path1.tier3 = { improves: ['active-damage'], unlock: 'none' };
  plan.upgradeIntents.path1.tier4 = { improves: [], unlock: 'manual-boost' };
  assert.match(planFeasibilityIssues(plan, definition)[0]!.message, /same-path/);
  plan.upgradeIntents.path1.tier3 = { improves: [], unlock: 'manual-boost' };
  plan.upgradeIntents.path1.tier4 = { improves: ['damage'], unlock: 'none' };
  plan.upgradeIntents.path1.tier5 = { improves: ['active-duration'], unlock: 'none' };
  assert.match(planFeasibilityIssues(plan, definition)[0]!.message, /same-path/);
});

test('repeated capability unlocks fail but later improvements and another path remain valid', () => {
  for (const unlock of [
    'camo',
    'slow',
    'burn',
    'stun',
    'splash',
    'follow-up',
    'distinct-volley',
  ] as const) {
    const { plan, definition } = fixture();
    plan.upgradeIntents.path1.tier3 = { improves: [], unlock };
    plan.upgradeIntents.path2.tier3 = { improves: [], unlock };
    assert.deepEqual(planFeasibilityIssues(plan, definition), []);
    plan.upgradeIntents.path1.tier5 = { improves: [], unlock };
    const issues = planFeasibilityIssues(plan, definition);
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /again after tier3/);
  }
  const { plan, definition } = fixture();
  plan.upgradeIntents.path1.tier3 = { improves: [], unlock: 'slow' };
  plan.upgradeIntents.path1.tier4 = { improves: ['slow'], unlock: 'none' };
  assert.deepEqual(planFeasibilityIssues(plan, definition), []);
});

test('mode changes may recur and ordinary follow-up differs from active-only follow-up', () => {
  for (const unlock of ['delivery-change', 'damage-type-change', 'targeting-change'] as const) {
    const { plan, definition } = fixture();
    plan.upgradeIntents.path1.tier3 = { improves: [], unlock };
    plan.upgradeIntents.path1.tier5 = { improves: [], unlock };
    assert.deepEqual(planFeasibilityIssues(plan, definition), []);
  }
  const { plan, definition } = fixture();
  plan.upgradeIntents.path1.tier3 = { improves: [], unlock: 'follow-up' };
  plan.upgradeIntents.path1.tier4 = { improves: [], unlock: 'manual-boost' };
  plan.upgradeIntents.path1.tier5 = { improves: [], unlock: 'active-follow-up' };
  assert.deepEqual(planFeasibilityIssues(plan, definition), []);
});

test('primitive budgets count paired status wire fields and merge matching unlock improvements', () => {
  const { plan, definition } = fixture();
  definition.profile.earlyTierMaxChanges = 3;
  plan.upgradeIntents.path1.tier3 = { improves: ['slow', 'burn'], unlock: 'slow' };
  const issues = planFeasibilityIssues(plan, definition);
  assert.equal(issues.length, 1);
  assert.match(issues[0]!.message, /at least 4 primitive effects.*3-effect budget/);
  plan.upgradeIntents.path1.tier3 = { improves: ['slow', 'damage'], unlock: 'slow' };
  assert.deepEqual(planFeasibilityIssues(plan, definition), []);
  plan.upgradeIntents.path1.tier5 = { improves: ['slow', 'burn', 'range'], unlock: 'none' };
  assert.match(planFeasibilityIssues(plan, definition)[0]!.message, /at least 5 primitive effects/);
});

test('custom early boundaries and global ceilings govern the effect budget', () => {
  const { plan, definition } = fixture();
  definition.profile.earlyTierThrough = 2;
  definition.profile.earlyTierMaxChanges = 1;
  plan.upgradeIntents.path1.tier3 = { improves: ['slow', 'burn'], unlock: 'none' };
  assert.deepEqual(planFeasibilityIssues(plan, definition), []);
  delete definition.profile.earlyTierThrough;
  assert.match(planFeasibilityIssues(plan, definition)[0]!.message, /1-effect budget/);
  definition.profile.earlyTierMaxChanges = 3;
  definition.profile.maxChangesPerTier = 2;
  plan.upgradeIntents.path1.tier3 = { improves: ['damage', 'range', 'pierce'], unlock: 'none' };
  assert.match(planFeasibilityIssues(plan, definition)[0]!.message, /2-effect budget/);
});

test('one boost unlock can satisfy every initial active dimension', () => {
  const { plan, definition } = fixture();
  definition.profile.maxChangesPerTier = 1;
  plan.upgradeIntents.path1.tier4 = {
    improves: ['active-damage', 'active-attack-rate', 'active-duration', 'active-frequency'],
    unlock: 'manual-boost',
  };
  assert.deepEqual(planFeasibilityIssues(plan, definition), []);
  plan.upgradeIntents.path1.tier5 = {
    improves: ['active-duration', 'active-frequency'],
    unlock: 'none',
  };
  assert.match(planFeasibilityIssues(plan, definition)[0]!.message, /at least 2 primitive effects/);
});

test('permanent damage and rate can also improve active output without extra primitives', () => {
  const { plan, definition } = fixture();
  definition.profile.maxChangesPerTier = 2;
  plan.upgradeIntents.path1.tier4 = { improves: [], unlock: 'manual-boost' };
  plan.upgradeIntents.path1.tier5 = {
    improves: ['damage', 'attack-rate', 'active-damage', 'active-attack-rate'],
    unlock: 'none',
  };
  assert.deepEqual(planFeasibilityIssues(plan, definition), []);
});

test('follow-up improvements may share permanent damage and unlock fields but not active-only unlocks', () => {
  const { plan, definition } = fixture();
  definition.profile.maxChangesPerTier = 1;
  plan.upgradeIntents.path1.tier5 = { improves: ['damage', 'follow-up'], unlock: 'none' };
  assert.deepEqual(planFeasibilityIssues(plan, definition), []);
  plan.upgradeIntents.path1.tier5 = { improves: ['follow-up'], unlock: 'follow-up' };
  assert.deepEqual(planFeasibilityIssues(plan, definition), []);
  plan.upgradeIntents.path1.tier4 = { improves: [], unlock: 'manual-boost' };
  plan.upgradeIntents.path1.tier5 = { improves: ['follow-up'], unlock: 'active-follow-up' };
  assert.match(planFeasibilityIssues(plan, definition)[0]!.message, /at least 2 primitive effects/);
  plan.upgradeIntents.path1.tier5 = {
    improves: ['active-damage', 'follow-up'],
    unlock: 'none',
  };
  assert.deepEqual(planFeasibilityIssues(plan, definition), []);
});
