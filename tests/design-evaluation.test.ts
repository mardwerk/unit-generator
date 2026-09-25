import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateUnitDesign,
  designEvaluationSchema,
} from '../src/core/planned-v1/design-evaluation.js';
import { compareCapstonePurchases } from '../src/core/mechanics/purchase-comparison.js';
import { referenceRecipes } from '../src/core/mechanics/reference-patterns.js';
import { validateBlueprint } from '../src/core/mechanics/validate.js';
import { allLegalBuilds, resolveUnchecked } from '../src/core/mechanics/resolve.js';
import {
  blueprintSchema,
  defaultMechanicsDefinition,
  pathKeys,
  tierKeys,
} from '../src/core/mechanics/schemas.js';

const fixture = () => structuredClone(referenceRecipes[0]!.blueprint);

test('purchase evidence is stable across reference object property order and artifact normalization', () => {
  for (const { blueprint } of referenceRecipes)
    assert.deepEqual(
      evaluateUnitDesign(blueprint, undefined, defaultMechanicsDefinition),
      evaluateUnitDesign(blueprintSchema.parse(blueprint), undefined, defaultMechanicsDefinition),
    );
});

test('evaluation computes legal milestone and sequential crosspath purchases without mutating mechanics', () => {
  const blueprint = fixture();
  blueprint.paths.path3.tiers.tier1.changes = [
    { kind: 'stat', target: 'base', stat: 'range', operation: 'add', value: 3 },
  ];
  blueprint.paths.path3.tiers.tier2.changes = [
    { kind: 'stat', target: 'base', stat: 'intervalSeconds', operation: 'multiply', value: 0.5 },
  ];
  const original = structuredClone(blueprint);
  const report = evaluateUnitDesign(blueprint, undefined, defaultMechanicsDefinition);
  assert.equal(report.scope, 'analytical-not-simulation');
  assert.equal(report.sourceClaims, null);
  const legal = new Set(allLegalBuilds(defaultMechanicsDefinition).map((build) => build.join(',')));
  for (const path of report.paths) {
    assert.equal(path.milestones.length, 3);
    assert.equal(path.crosspaths.length, 12);
    for (const change of [...path.milestones, ...path.crosspaths]) {
      assert.ok(legal.has(change.from.join(',')));
      assert.ok(legal.has(change.to.join(',')));
      assert.equal(
        change.incrementalGold,
        resolveUnchecked(blueprint, change.to).cumulativeCost -
          resolveUnchecked(blueprint, change.from).cumulativeCost,
      );
    }
  }
  const crosspaths = report.paths[0]!.crosspaths.filter((entry) => entry.secondaryPath === 'path3');
  assert.equal(crosspaths[0]!.metricDeltas.range!.change, 3);
  assert.equal(
    crosspaths[1]!.metricDeltas['attacks per second']!.after,
    crosspaths[1]!.metricDeltas['attacks per second']!.before! * 2,
  );
  assert.deepEqual(crosspaths[1]!.from, crosspaths[0]!.to);
  assert.deepEqual(
    crosspaths.map((entry) => entry.to[0]),
    [3, 3, 4, 4, 5, 5],
  );
  assert.deepEqual(blueprint, original);
  assert.deepEqual(designEvaluationSchema.parse(JSON.parse(JSON.stringify(report))), report);
});

test('same-budget copies retain legacy facts and sum only additive throughput bounds', () => {
  const blueprint = fixture();
  const comparison = compareCapstonePurchases(blueprint)[0]!;
  const count = Math.floor(comparison.tier5.totalGold / comparison.tier4.totalGold);
  assert.equal(comparison.tier4CopiesAtTier5Budget, count);
  assert.equal(comparison.sameBudgetTier4Copies.count, count);
  assert.equal(
    comparison.sameBudgetTier4Copies.additiveThroughputUpperBounds['direct damage rate'],
    comparison.tier4.metrics['direct damage rate']! * count,
  );
  assert.equal(comparison.sameBudgetTier4Copies.additiveThroughputUpperBounds.range, undefined);
  assert.equal(
    comparison.sameBudgetTier4Copies.additiveThroughputUpperBounds['active duty fraction'],
    undefined,
  );
  assert.equal(
    comparison.sameBudgetTier4Copies.perCopyMetrics.range,
    comparison.tier4.metrics.range,
  );
  assert.ok(comparison.tier4.metrics['attacks per second']! > 0);
});

test('crosspath evidence follows custom limits instead of assuming the default 64 builds', () => {
  const definition = structuredClone(defaultMechanicsDefinition);
  definition.progression.maxPurchasedPaths = 1;
  assert.ok(
    evaluateUnitDesign(fixture(), undefined, definition).paths.every(
      (path) => path.crosspaths.length === 0,
    ),
  );
  definition.progression.maxPurchasedPaths = 2;
  definition.progression.crosspathTier = 1;
  const report = evaluateUnitDesign(fixture(), undefined, definition);
  for (const path of report.paths) {
    assert.equal(path.crosspaths.length, 6);
    assert.ok(path.crosspaths.every((purchase) => purchase.tier === 1));
  }
});

test('zero-cost diagnostics avoid infinite copy counts while full evaluation requires valid costs', () => {
  const blueprint = fixture();
  blueprint.baseAttack.cost = 0;
  for (const path of pathKeys)
    for (const tier of tierKeys) blueprint.paths[path].tiers[tier].cost = 0;
  const report = compareCapstonePurchases(blueprint);
  assert.throws(() => evaluateUnitDesign(blueprint, undefined, defaultMechanicsDefinition));
  for (const path of report) {
    assert.equal(path.tier4CopiesAtTier5Budget, null);
    assert.deepEqual(path.sameBudgetTier4Copies.additiveThroughputUpperBounds, {});
  }
  const inspect = (value: unknown): void => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
    else if (value && typeof value === 'object') Object.values(value).forEach(inspect);
  };
  inspect(report);
});

test('retained claims and omissions remain proposals separate from observed deltas', () => {
  const blueprint = fixture();
  const branch = {
    name: 'Source technique',
    sourceIds: ['evidence-1'],
    buyFor: 'Reach distant targets.',
    weakness: 'Requires a clear path.',
    capstoneValue: 'Develop the same ranged attack.',
    milestones: {
      tier1: 'Reach farther.',
      tier2: 'Attack faster.',
      tier3: 'Specialize the attack.',
      tier4: 'Develop the attack.',
      tier5: 'Complete the attack.',
    },
    crosspaths: [
      { path: 'path2' as const, contribution: 'Proposed contribution.' },
      { path: 'path3' as const, contribution: 'Proposed contribution.' },
    ],
    referenceExample: 'A progression analogy.',
  };
  const plan = {
    concept: 'A sourced adaptation.',
    signature: { name: 'Technique', sourceIds: ['evidence-1'], adaptation: 'A ranged strike.' },
    repertoire: [
      { name: 'Technique', sourceIds: ['evidence-1'], limitation: 'Needs clear access.' },
    ],
    base: { name: 'Strike', sourceIds: ['evidence-1'], behavior: 'A ranged strike.' },
    paths: { path1: branch, path2: branch, path3: branch },
    scopeLimits: ['No evidence of current availability.'],
    omittedTechniques: [{ name: 'Teleport', reason: 'Movement is unsupported.' }],
  };
  const report = evaluateUnitDesign(blueprint, plan, defaultMechanicsDefinition);
  assert.deepEqual(report.sourceClaims?.scopeLimits, plan.scopeLimits);
  assert.deepEqual(report.sourceClaims?.omittedTechniques, plan.omittedTechniques);
  assert.equal(report.paths[0]!.purchaseClaim?.buyFor, branch.buyFor);
  assert.deepEqual(
    report.paths[0]!.milestones,
    evaluateUnitDesign(blueprint, undefined, defaultMechanicsDefinition).paths[0]!.milestones,
  );
});

test('active timing and follow-up scope remain visible when peak and duty metrics do not change', () => {
  const blueprint = fixture();
  blueprint.paths.path2.tiers.tier4.changes = [
    {
      kind: 'unlockBoost',
      target: 'base',
      boost: {
        name: 'Burst',
        durationSeconds: 8,
        cooldownSeconds: 30,
        damageMultiplier: 2,
        intervalMultiplier: 0.5,
        rangeBonus: 0,
      },
    },
    {
      kind: 'followUp',
      target: 'boost',
      value: {
        name: 'Echo',
        count: 1,
        damageMultiplier: 0.5,
        radius: 8,
        inheritStatuses: false,
      },
    },
  ];
  blueprint.paths.path2.tiers.tier5.changes = [
    {
      kind: 'modifyBoost',
      target: 'base',
      stat: 'durationSeconds',
      operation: 'multiply',
      value: 2,
    },
    {
      kind: 'modifyBoost',
      target: 'base',
      stat: 'cooldownSeconds',
      operation: 'multiply',
      value: 2,
    },
    { kind: 'modifyBoost', target: 'base', stat: 'rangeBonus', operation: 'add', value: 3 },
    {
      kind: 'followUp',
      target: 'boost',
      value: {
        name: 'Echo',
        count: 1,
        damageMultiplier: 0.5,
        radius: 8,
        inheritStatuses: true,
      },
    },
  ];
  // No burn means status inheritance changes no damage proxy. The effect is
  // still a distinct scope promise which must be inspectable in the report.
  blueprint.baseAttack.stats.burnDamagePerSecond = 0;
  blueprint.baseAttack.stats.burnSeconds = 0;
  const report = evaluateUnitDesign(blueprint, undefined, defaultMechanicsDefinition);
  const transition = report.paths[1]!.milestones[2]!;
  assert.equal(transition.metricDeltas['active duty fraction']!.change, 0);
  assert.equal(transition.metricDeltas['active peak direct damage rate']!.change, 0);
  assert.equal(transition.metricDeltas['active peak group damage rate upper bound']!.change, 0);
  assert.ok(transition.capabilityChanges.includes('path2 boost durationSeconds: 8 → 16'));
  assert.ok(transition.capabilityChanges.includes('path2 boost cooldownSeconds: 30 → 60'));
  assert.ok(transition.capabilityChanges.includes('path2 boost rangeBonus: 0 → 3'));
  assert.ok(
    transition.capabilityChanges.some(
      (change) =>
        change.startsWith('path2 active followUp:') && change.includes('"inheritStatuses":true'),
    ),
  );
  assert.ok(
    !transition.capabilityChanges.some((change) => change.includes('boost damageMultiplier')),
  );
  // A secondary purchase does not repeat unchanged boost fields.
  assert.ok(
    report.paths[1]!.crosspaths.every((purchase) =>
      purchase.capabilityChanges.every((change) => !change.includes('boost durationSeconds')),
    ),
  );
  // Borrowed cadence contributes at every advanced tier, but only purchased
  // boosts create active output. Crosspath summaries must not imply T3 access.
  blueprint.paths.path3.tiers.tier2.changes = [
    { kind: 'stat', target: 'base', stat: 'intervalSeconds', operation: 'multiply', value: 0.5 },
  ];
  const cadence = evaluateUnitDesign(
    blueprint,
    undefined,
    defaultMechanicsDefinition,
  ).paths[1]!.crosspaths.filter(
    (purchase) => purchase.secondaryPath === 'path3' && purchase.tier === 2,
  );
  assert.equal(cadence.length, 3);
  assert.equal(cadence[0]!.metricDeltas['active peak direct damage rate'], undefined);
  for (const purchase of cadence.slice(1)) {
    const active = purchase.metricDeltas['active peak direct damage rate']!;
    assert.equal(active.after, active.before! * 2);
    assert.equal(purchase.metricDeltas['active duty fraction']!.change, 0);
    assert.ok(!purchase.capabilityChanges.some((change) => change.includes('cooldownSeconds')));
  }
});

test('valid finite attack stats can overflow proxies without rejecting the unit or reporting zero', () => {
  const blueprint = fixture();
  blueprint.baseAttack.stats.intervalSeconds = 1e-320;
  for (const path of pathKeys)
    for (const tier of tierKeys)
      blueprint.paths[path].tiers[tier].changes = [
        { kind: 'stat', target: 'base', stat: 'damage', operation: 'add', value: 1 },
      ];
  assert.deepEqual(validateBlueprint(blueprint, defaultMechanicsDefinition), []);
  const report = evaluateUnitDesign(blueprint, undefined, defaultMechanicsDefinition);
  const delta = report.paths[0]!.milestones[0]!.metricDeltas['direct damage rate']!;
  assert.deepEqual(delta, { before: null, after: null, change: null });
  assert.equal(report.paths[0]!.capstoneComparison.tier4.metrics['attacks per second'], null);
  assert.equal(
    report.paths[0]!.capstoneComparison.sameBudgetTier4Copies.additiveThroughputUpperBounds[
      'direct damage rate'
    ],
    null,
  );
  assert.deepEqual(designEvaluationSchema.parse(JSON.parse(JSON.stringify(report))), report);
});

test('finite per-copy throughput is preserved when only the copy product overflows', () => {
  const blueprint = fixture();
  blueprint.baseAttack.stats.intervalSeconds = 1e-307;
  for (const path of pathKeys)
    for (const tier of tierKeys)
      blueprint.paths[path].tiers[tier].changes = [
        { kind: 'stat', target: 'base', stat: 'damage', operation: 'add', value: 1 },
      ];
  const comparison = compareCapstonePurchases(blueprint)[0]!;
  assert.ok(Number.isFinite(comparison.tier4.metrics['direct damage rate']));
  assert.ok(comparison.sameBudgetTier4Copies.count! > 3);
  assert.equal(
    comparison.sameBudgetTier4Copies.additiveThroughputUpperBounds['direct damage rate'],
    null,
  );
});
