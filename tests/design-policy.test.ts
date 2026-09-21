import { resolveUnchecked } from '../src/core/mechanics/resolve.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { designPolicyIssues, specialtyMetrics } from '../src/core/mechanics/design-policy.js';
import { validateBlueprint } from '../src/core/mechanics/validate.js';
import {
  defaultMechanicsDefinition,
  pathKeys,
  tierKeys,
  type Change,
  type MechanicsDefinition,
  type UnitBlueprint,
} from '../src/core/mechanics/schemas.js';

function blueprint(): UnitBlueprint {
  const paths = {} as UnitBlueprint['paths'];
  for (const path of pathKeys) {
    const tiers = {} as UnitBlueprint['paths']['path1']['tiers'];
    for (const tier of tierKeys)
      tiers[tier] = {
        name: `${path} ${tier}`,
        cost: 100,
        changes: [{ kind: 'stat', target: 'base', stat: 'damage', operation: 'add', value: 1 }],
      };
    paths[path] = {
      name: path,
      theme: 'Focused attack improvement',
      rationale: 'Develop the supplied attack.',
      sourceFactIndices: [0],
      tiers,
    };
  }
  return {
    name: 'Practice Archer',
    role: 'Single target damage',
    weakness: 'Cannot damage Lead without upgrades.',
    sourceFacts: [{ documentId: 'character', quote: 'The archer fires arrows.' }],
    constraintCoverage: [],
    baseAttack: {
      name: 'Arrow',
      cost: 250,
      delivery: 'projectile',
      damageType: 'sharp',
      targeting: 'first',
      camo: false,
      stats: {
        damage: 10,
        intervalSeconds: 1,
        range: 20,
        pierce: 1,
        projectiles: 1,
        splashRadius: 0,
        slowPercent: 0,
        slowSeconds: 0,
        burnDamagePerSecond: 0,
        burnSeconds: 0,
        stunSeconds: 0,
      },
    },
    paths,
    proposals: [],
    reservedTechniques: [],
  };
}

const stat = (
  name: Extract<Change, { kind: 'stat' }>['stat'],
  operation: 'add' | 'multiply' | 'set',
  value: number,
): Change => ({ kind: 'stat', target: 'base', stat: name, operation, value });
function definition(): MechanicsDefinition {
  const definition = structuredClone(defaultMechanicsDefinition);
  definition.profile.designPolicy = {
    version: '1',
    distinctPathSpecializations: true,
    distinctFirstUpgrades: true,
    distinctCapstones: true,
    maxManualAbilityPaths: 1,
    minTier5SpecialtyMultiplier: 3,
    tier5Uniqueness: 'one-per-player-unit-type-and-path',
  };
  return definition;
}
function distinct(): UnitBlueprint {
  const unit = blueprint();
  const specialties = ['direct-damage', 'group-damage', 'attack-speed'] as const;
  const stats = ['damage', 'pierce', 'intervalSeconds'] as const;
  pathKeys.forEach((path, index) => {
    unit.paths[path].specialization = specialties[index]!;
    tierKeys.forEach((tier) => {
      unit.paths[path].tiers[tier].changes = [
        stat(
          stats[index]!,
          'multiply',
          index === 2 ? (tier === 'tier5' ? 0.25 : 0.8) : tier === 'tier5' ? 3 : 2,
        ),
      ];
    });
  });
  return unit;
}
function boost(name = 'Focus'): Change {
  return {
    kind: 'unlockBoost',
    target: 'base',
    boost: {
      name,
      durationSeconds: 10,
      cooldownSeconds: 60,
      damageMultiplier: 2,
      intervalMultiplier: 1,
      rangeBonus: 0,
    },
  };
}

test('legacy definitions remain unaffected and distinct strong paths satisfy the policy', () => {
  assert.deepEqual(designPolicyIssues(blueprint(), defaultMechanicsDefinition), []);
  assert.deepEqual(designPolicyIssues(distinct(), definition()), []);
});
test('specializations must be explicit and distinct', () => {
  const unit = distinct();
  delete unit.paths.path1.specialization;
  unit.paths.path3.specialization = 'group-damage';
  const issues = designPolicyIssues(unit, definition());
  assert.ok(issues.some((i) => i.path === 'paths.path1.specialization'));
  assert.ok(issues.some((i) => i.path === 'paths.path3.specialization'));
});
test('equal first-upgrade behavior is rejected despite price, name and add versus set differences', () => {
  const unit = distinct();
  unit.paths.path1.tiers.tier1.changes = [stat('damage', 'add', 5)];
  unit.paths.path2.tiers.tier1 = {
    name: 'Different label',
    cost: 999,
    changes: [stat('damage', 'set', 15)],
  };
  assert.ok(
    designPolicyIssues(unit, definition()).some(
      (i) => i.path === 'paths.path2.tiers.tier1' && /duplicates path1/.test(i.message),
    ),
  );
});
test('equal capstones ignore ability names, path ownership and prices', () => {
  const unit = distinct();
  unit.paths.path2.tiers = structuredClone(unit.paths.path1.tiers);
  unit.paths.path1.tiers.tier4.changes = [boost('First')];
  unit.paths.path2.tiers.tier4.changes = [boost('Second')];
  unit.paths.path2.tiers.tier5.cost = 9999;
  const issues = designPolicyIssues(unit, definition());
  assert.ok(
    issues.some((i) => i.path === 'paths.path2.tiers.tier5' && /duplicates path1/.test(i.message)),
  );
  assert.ok(
    issues.some((i) => i.path === 'paths.path2.tiers.tier4' && /at most 1/.test(i.message)),
  );
});
test('equal capstones ignore follow-up names on base attacks and active boosts', () => {
  for (const target of ['base', 'boost'] as const) {
    const unit = distinct();
    unit.paths.path2.tiers = structuredClone(unit.paths.path1.tiers);
    for (const path of ['path1', 'path2'] as const) {
      if (target === 'boost') unit.paths[path].tiers.tier4.changes = [boost(path)];
      unit.paths[path].tiers.tier5.changes.push({
        kind: 'followUp',
        target,
        value: { name: path, count: 3, damageMultiplier: 1, radius: 10, inheritStatuses: false },
      });
    }
    assert.ok(
      designPolicyIssues(unit, definition()).some(
        (issue) =>
          issue.path === 'paths.path2.tiers.tier5' && /duplicates path1/.test(issue.message),
      ),
      target,
    );
    const followUp = unit.paths.path2.tiers.tier5.changes.at(-1)!;
    assert.equal(followUp.kind, 'followUp');
    if (followUp.kind === 'followUp') followUp.value.count = 4;
    assert.ok(
      !designPolicyIssues(unit, definition()).some(
        (issue) =>
          issue.path === 'paths.path2.tiers.tier5' && /duplicates path1/.test(issue.message),
      ),
      `${target} mechanically distinct follow-up`,
    );
  }
});
test('the tier-five multiplier is enforced only when explicitly configured', () => {
  const unit = distinct();
  unit.paths.path1.tiers.tier5.changes = [stat('damage', 'multiply', 1.5)];
  const rules = definition();
  assert.ok(designPolicyIssues(unit, rules).some((issue) => /at least 3x/.test(issue.message)));
  delete rules.profile.designPolicy!.minTier5SpecialtyMultiplier;
  assert.deepEqual(designPolicyIssues(unit, rules), []);
});
test('a scalar-only tier three is rejected only by an explicit behavior-change policy', () => {
  const unit = distinct();
  const rules = definition();
  assert.deepEqual(designPolicyIssues(unit, rules), []);
  rules.profile.designPolicy!.requireTier3BehaviorChange = true;
  assert.equal(
    designPolicyIssues(unit, rules).filter((issue) => /Tier 3 must introduce/.test(issue.message))
      .length,
    3,
  );
  unit.paths.path1.tiers.tier3.changes.push({ kind: 'delivery', target: 'base', value: 'beam' });
  assert.ok(
    !designPolicyIssues(unit, rules).some((issue) => issue.path === 'paths.path1.tiers.tier3'),
  );
});
test('early identity policy permits scalar improvements and detection but rejects new attack patterns', () => {
  const rules = definition();
  rules.profile.designPolicy!.preserveEarlyAttackIdentity = true;
  for (const change of [
    stat('damage', 'add', 1),
    { kind: 'camo', target: 'base', value: true },
    { kind: 'delivery', target: 'base', value: 'beam' },
    stat('projectiles', 'add', 1),
    stat('stunSeconds', 'set', 1),
  ] as Change[]) {
    const unit = distinct();
    unit.paths.path1.tiers.tier1.changes = [change];
    const rejected = validateBlueprint(unit, rules).some((issue) =>
      /T1 and T2 improve/.test(issue.message),
    );
    const allowed = change.kind === 'camo' || (change.kind === 'stat' && change.stat === 'damage');
    assert.equal(rejected, !allowed, JSON.stringify(change));
    rules.profile.designPolicy!.preserveEarlyAttackIdentity = false;
    assert.ok(
      !validateBlueprint(unit, rules).some((issue) => /T1 and T2 improve/.test(issue.message)),
    );
    rules.profile.designPolicy!.preserveEarlyAttackIdentity = true;
  }
});
test('2.25x and 2.67x capstone gains fail the 3x policy with concrete ratios', () => {
  for (const gain of [2.25, 2.67]) {
    const unit = distinct();
    unit.paths.path1.tiers.tier5.changes = [stat('damage', 'multiply', gain)];
    const issue = designPolicyIssues(unit, definition()).find(
      (i) => i.path === 'paths.path1.tiers.tier5',
    );
    assert.ok(issue);
    assert.ok(issue.message.includes(`${gain}x`));
    assert.match(issue.message, /at least 3x/);
    assert.match(issue.message, /not simulated combat power/);
  }
});
test('control coverage and active peak or duty gains can establish strong capstones', () => {
  for (const specialty of ['control', 'ability-burst', 'range'] as const) {
    for (const duty of specialty === 'ability-burst' ? [false, true] : [false]) {
      const unit = distinct();
      unit.paths.path1.specialization = specialty;
      if (specialty === 'control') {
        unit.paths.path1.tiers.tier4.changes = [
          stat('slowPercent', 'set', 20),
          stat('slowSeconds', 'set', 1),
        ];
        unit.paths.path1.tiers.tier5.changes = [stat('slowPercent', 'multiply', 3)];
      } else if (specialty === 'ability-burst') {
        unit.paths.path1.tiers.tier4.changes = [boost()];
        unit.paths.path1.tiers.tier5.changes = [
          {
            kind: 'modifyBoost',
            target: 'base',
            stat: duty ? 'durationSeconds' : 'damageMultiplier',
            operation: 'multiply',
            value: 3,
          },
        ];
      } else unit.paths.path1.tiers.tier5.changes = [stat('range', 'multiply', 3)];
      assert.deepEqual(designPolicyIssues(unit, definition()), []);
    }
  }
});
test('a newly introduced control effect cannot multiply a zero tier-four specialty', () => {
  const unit = distinct();
  unit.paths.path1.specialization = 'control';
  unit.paths.path1.tiers.tier5.changes = [
    stat('slowPercent', 'set', 90),
    stat('slowSeconds', 'set', 2),
  ];
  assert.ok(
    designPolicyIssues(unit, definition()).some(
      (i) => i.path === 'paths.path1.tiers.tier5' && /no finite positive tier 4/.test(i.message),
    ),
  );
});
test('longer ability availability cannot pass the capstone gate while reducing peak output', () => {
  const unit = distinct();
  unit.paths.path1.specialization = 'ability-burst';
  unit.paths.path1.tiers.tier4.changes = [boost()];
  unit.paths.path1.tiers.tier5.changes = [
    {
      kind: 'modifyBoost',
      target: 'base',
      stat: 'durationSeconds',
      operation: 'multiply',
      value: 3,
    },
    {
      kind: 'modifyBoost',
      target: 'base',
      stat: 'damageMultiplier',
      operation: 'multiply',
      value: 0.5,
    },
  ];
  assert.ok(
    designPolicyIssues(unit, definition()).some(
      (issue) =>
        issue.path === 'paths.path1.tiers.tier5' && /retain peak output/.test(issue.message),
    ),
  );
});
test('nonfinite ratios never satisfy the specialty threshold', () => {
  const unit = distinct();
  unit.paths.path1.tiers.tier5.changes = [stat('damage', 'multiply', Infinity)];
  assert.ok(
    designPolicyIssues(unit, definition()).some((i) => i.path === 'paths.path1.tiers.tier5'),
  );
});

test('ability-burst requires established damage output rather than only a longer range boost', () => {
  const unit = distinct();
  unit.baseAttack.stats.damage = 0;
  unit.baseAttack.stats.slowPercent = 20;
  unit.baseAttack.stats.slowSeconds = 1;
  unit.paths.path1.specialization = 'ability-burst';
  unit.paths.path1.tiers.tier4.changes = [boost()];
  unit.paths.path1.tiers.tier5.changes = [
    {
      kind: 'modifyBoost',
      target: 'base',
      stat: 'durationSeconds',
      operation: 'multiply',
      value: 3,
    },
  ];
  assert.ok(
    designPolicyIssues(unit, definition()).some(
      (issue) => issue.path === 'paths.path1.tiers.tier5',
    ),
  );
});

test('capacity metrics retain burn refresh duty and cap control uptime', () => {
  const unit = distinct();
  Object.assign(unit.baseAttack.stats, {
    damage: 10,
    projectiles: 2,
    intervalSeconds: 2,
    pierce: 4,
    burnDamagePerSecond: 8,
    burnSeconds: 1,
    slowPercent: 25,
    slowSeconds: 4,
    stunSeconds: 0.5,
  });
  const build = resolveUnchecked(unit, [0, 0, 0]);
  assert.deepEqual(specialtyMetrics(build, 'direct-damage'), { 'direct damage rate': 14 });
  assert.deepEqual(specialtyMetrics(build, 'group-damage'), {
    'group damage rate upper bound': 56,
  });
  assert.deepEqual(specialtyMetrics(build, 'control'), {
    'slow coverage upper bound': 100,
    'stun coverage upper bound': 1,
  });
});

test('manual ability slots constrain direct callers while omitted slots preserve count-only policies', () => {
  const unit = distinct();
  unit.paths.path3.tiers.tier4.changes = [boost()];
  const rules = definition();
  assert.deepEqual(designPolicyIssues(unit, rules), []);
  rules.profile.designPolicy!.manualAbilityPath = 'path2';
  assert.ok(
    designPolicyIssues(unit, rules).some(
      (issue) => issue.path === 'paths.path3.tiers.tier4' && /only on path2/.test(issue.message),
    ),
  );
  rules.profile.designPolicy!.manualAbilityPath = 'path3';
  assert.deepEqual(designPolicyIssues(unit, rules), []);
  rules.profile.designPolicy!.manualAbilityPath = null;
  assert.ok(
    designPolicyIssues(unit, rules).some((issue) => /does not permit manual/.test(issue.message)),
  );
  assert.deepEqual(designPolicyIssues(distinct(), rules), []);
});
