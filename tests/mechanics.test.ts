import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allLegalBuilds,
  assessTarget,
  blueprintSchema,
  defaultMechanicsDefinition,
  mechanicsDefinitionSchema,
  pathKeys,
  resolveBuild,
  tierKeys,
  validateBlueprint,
  type Change,
  type UnitBlueprint,
} from '../src/core/mechanics/index.js';

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
  name: 'damage' | 'pierce' | 'intervalSeconds',
  operation: 'add' | 'multiply' | 'set',
  value: number,
): Change => ({ kind: 'stat', target: 'base', stat: name, operation, value });
function withBoost(): UnitBlueprint {
  const unit = blueprint();
  unit.paths.path2.tiers.tier4.changes = [
    {
      kind: 'unlockBoost',
      target: 'base',
      boost: {
        name: 'Focus',
        durationSeconds: 10,
        cooldownSeconds: 30,
        damageMultiplier: 2,
        intervalMultiplier: 0.5,
        rangeBonus: 3,
      },
    },
  ];
  unit.paths.path2.tiers.tier5.changes = [
    { kind: 'modifyBoost', target: 'base', stat: 'damageMultiplier', operation: 'add', value: 1 },
  ];
  return unit;
}

test('ordinary progression enumerates exactly 64 legal builds, including six complete crosspaths', () => {
  const builds = allLegalBuilds();
  assert.equal(builds.length, 64);
  for (const selection of [
    [0, 0, 0],
    [2, 2, 0],
    [5, 2, 0],
    [5, 0, 2],
    [2, 5, 0],
    [0, 5, 2],
    [2, 0, 5],
    [0, 2, 5],
  ])
    assert.ok(builds.some((entry) => entry.join() === selection.join()));
  const unit = blueprint();
  assert.deepEqual(validateBlueprint(unit), []);
  for (const selection of [
    [3, 3, 0],
    [1, 1, 1],
    [-1, 0, 0],
    [6, 0, 0],
    [0.5, 0, 0],
  ] as [number, number, number][])
    assert.throws(() => resolveBuild(unit, selection), /selection:/);
});

test('canonical arithmetic preserves crosspath additions through a baseline setter and multipliers', () => {
  const unit = blueprint();
  unit.paths.path1.tiers.tier3.changes = [
    stat('damage', 'set', 20),
    stat('damage', 'add', 3),
    stat('damage', 'multiply', 2),
  ];
  const result = resolveBuild(unit, [3, 2, 0]);
  assert.equal(result.baseAttack.stats.damage, 54);
  unit.paths.path1.tiers.tier3.changes.reverse();
  assert.equal(resolveBuild(unit, [3, 2, 0]).baseAttack.stats.damage, 54);
  assert.equal(result.cumulativeCost, 750);
  assert.equal(result.tierDeltas.length, 5);
  assert.equal(result.tierDeltas.at(-1)!.afterAttack.stats.damage, 54);
  assert.equal(result.tierDeltas.at(-1)!.cumulativeCost, 750);
});

test('unlocked and improved boosts use the full purchased attack including the secondary path', () => {
  const unit = withBoost();
  unit.paths.path1.tiers.tier2.changes = [{ kind: 'camo', target: 'base', value: true }];
  const result = resolveBuild(unit, [2, 5, 0]);
  const ability = result.abilities[0]!;
  assert.equal(result.baseAttack.stats.damage, 14);
  assert.equal(ability.boostedAttack.stats.damage, 42);
  assert.equal(ability.boostedAttack.stats.intervalSeconds, 0.5);
  assert.equal(ability.boostedAttack.stats.range, 23);
  assert.equal(ability.boostedAttack.camo, true);
  assert.equal(ability.initiallyReady, true);
  assert.equal(ability.cooldownSeconds, 30);
  assert.equal(resolveBuild(unit, [2, 3, 0]).abilities.length, 0);
  assert.equal(unit.baseAttack.stats.damage, 10);
});

test('all legal combinations are checked for negative stats, not just individual paths', () => {
  const unit = blueprint();
  unit.paths.path1.tiers.tier1.changes = [stat('damage', 'add', -6)];
  unit.paths.path2.tiers.tier1.changes = [stat('damage', 'add', -6)];
  assert.ok(
    validateBlueprint(unit).some((issue) => issue.path === 'builds.1-1-0.baseAttack.stats.damage'),
  );
  assert.throws(() => resolveBuild(unit, [1, 1, 0]), /damage/);
});

test('invalid intervals and fractional counts cannot resolve', () => {
  const unit = blueprint();
  unit.paths.path1.tiers.tier1.changes = [stat('intervalSeconds', 'set', 0)];
  assert.ok(validateBlueprint(unit).some((issue) => issue.path.endsWith('intervalSeconds')));
  unit.paths.path1.tiers.tier1.changes = [stat('pierce', 'multiply', 1.5)];
  assert.ok(validateBlueprint(unit).some((issue) => issue.path.endsWith('pierce')));
});

test('boost modification requires the same path unlock and early activation is rejected', () => {
  const unit = withBoost();
  unit.paths.path1.tiers.tier5.changes = [
    { kind: 'modifyBoost', target: 'base', stat: 'durationSeconds', operation: 'add', value: 1 },
  ];
  assert.ok(validateBlueprint(unit).some((issue) => issue.message.includes('no tier 4 boost')));
  const early = withBoost();
  early.paths.path1.tiers.tier1.changes = structuredClone(early.paths.path2.tiers.tier4.changes);
  assert.ok(
    validateBlueprint(early).some((issue) => issue.message.includes('only unlock at tier 4')),
  );
});

test('a slow pair is one early capability, while slow and camo exceed the early budget', () => {
  const unit = blueprint();
  unit.paths.path1.tiers.tier1.changes = [
    { kind: 'stat', target: 'base', stat: 'slowPercent', operation: 'set', value: 20 },
    { kind: 'stat', target: 'base', stat: 'slowSeconds', operation: 'set', value: 2 },
  ];
  assert.deepEqual(validateBlueprint(unit), []);
  unit.paths.path1.tiers.tier1.changes.push({ kind: 'camo', target: 'base', value: true });
  assert.ok(validateBlueprint(unit).some((issue) => issue.message.includes('capability group')));
  unit.paths.path1.tiers.tier1.changes.pop();
  unit.paths.path1.tiers.tier1.changes.pop();
  assert.ok(
    validateBlueprint(unit).some((issue) =>
      issue.message.includes('positive percent and duration'),
    ),
  );
});

test('no-op purchases, ineffective boosts, missing source references and unsupported operations are rejected', () => {
  const unit = blueprint();
  unit.paths.path1.tiers.tier1.changes = [stat('damage', 'add', 0)];
  unit.paths.path3.sourceFactIndices = [4];
  const issues = validateBlueprint(unit);
  assert.ok(issues.some((issue) => issue.message.includes('changes no behavior')));
  assert.ok(issues.some((issue) => issue.message.includes('source fact that does not exist')));
  const unsupported = structuredClone(blueprint()) as unknown as Record<string, unknown>;
  unsupported.summons = [{ count: 1 }];
  assert.equal(blueprintSchema.safeParse(unsupported).success, false);
  const boosted = withBoost();
  const change = boosted.paths.path2.tiers.tier4.changes[0]!;
  if (change.kind !== 'unlockBoost') throw new Error('Expected boost');
  change.boost.damageMultiplier = 1;
  change.boost.intervalMultiplier = 1;
  change.boost.rangeBonus = 0;
  assert.ok(
    validateBlueprint(boosted).some((issue) => issue.message.includes('boost must change')),
  );
});

test('detection never bypasses obstruction and damage immunity does not silently become control immunity', () => {
  const attack = blueprint().baseAttack;
  attack.camo = true;
  assert.deepEqual(assessTarget(attack, { camo: true, obstructed: true, properties: [] }), {
    detected: true,
    reachable: false,
    canDamage: false,
    canSlow: false,
    canStun: false,
  });
  assert.equal(
    assessTarget(attack, { camo: false, obstructed: false, properties: ['lead'] }).canDamage,
    false,
  );
  attack.damageType = 'normal';
  assert.equal(
    assessTarget(attack, { camo: false, obstructed: false, properties: ['lead'] }).canDamage,
    true,
  );
  attack.damageType = 'energy';
  assert.equal(
    assessTarget(attack, { camo: false, obstructed: false, properties: ['purple'] }).canDamage,
    false,
  );
  attack.damageType = 'explosive';
  attack.stats.slowPercent = 10;
  attack.stats.slowSeconds = 1;
  assert.equal(
    assessTarget(attack, { camo: false, obstructed: false, properties: ['black'] }).canDamage,
    false,
  );
  assert.equal(
    assessTarget(attack, { camo: false, obstructed: false, properties: ['black'] }).canSlow,
    true,
  );
  assert.equal(
    assessTarget(attack, { camo: false, obstructed: false, properties: ['blimp'] }).canSlow,
    false,
  );
});

test('definition snapshots customize supported limits without changing global defaults', () => {
  const definition = structuredClone(defaultMechanicsDefinition);
  definition.progression.maxPurchasedPaths = 1;
  assert.equal(allLegalBuilds(definition).length, 16);
  assert.equal(allLegalBuilds().length, 64);
  assert.throws(() => {
    defaultMechanicsDefinition.profile.currency = 'mutated';
  }, TypeError);
  definition.profile.maxUpgradeCost = 50;
  assert.ok(
    validateBlueprint(blueprint(), definition).some((issue) =>
      issue.message.includes('cost ceiling'),
    ),
  );
  assert.equal(
    mechanicsDefinitionSchema.safeParse({ ...definition, summons: true }).success,
    false,
  );
});

test('durations, bounds and readiness remain separate from permanent attack properties', () => {
  const unit = withBoost();
  unit.paths.path2.tiers.tier5.changes = [
    { kind: 'modifyBoost', target: 'base', stat: 'durationSeconds', operation: 'set', value: 31 },
  ];
  assert.ok(
    validateBlueprint(unit).some((issue) =>
      issue.message.includes('Duration may not exceed cooldown'),
    ),
  );
  unit.paths.path2.tiers.tier5.changes = [
    { kind: 'modifyBoost', target: 'base', stat: 'damageMultiplier', operation: 'set', value: -1 },
  ];
  assert.ok(validateBlueprint(unit).some((issue) => issue.path.includes('abilities')));
});

test('pure downgrade purchases fail while numerical and ability tradeoffs remain valid', () => {
  const unit = blueprint();
  unit.paths.path1.tiers.tier3.changes = [stat('intervalSeconds', 'add', 0.15)];
  assert.ok(
    validateBlueprint(unit).some(
      (issue) =>
        issue.path === 'paths.path1.tiers.tier3' &&
        issue.message.includes('only reduces or preserves'),
    ),
  );
  unit.paths.path1.tiers.tier3.changes.push(stat('damage', 'add', 2));
  assert.deepEqual(validateBlueprint(unit), []);

  const boosted = withBoost();
  boosted.paths.path2.tiers.tier5.changes = [
    { kind: 'modifyBoost', target: 'base', stat: 'cooldownSeconds', operation: 'add', value: 5 },
  ];
  assert.ok(
    validateBlueprint(boosted).some(
      (issue) =>
        issue.path === 'paths.path2.tiers.tier5' &&
        issue.message.includes('only reduces or preserves'),
    ),
  );
  boosted.paths.path2.tiers.tier5.changes.push({
    kind: 'modifyBoost',
    target: 'base',
    stat: 'damageMultiplier',
    operation: 'add',
    value: 1,
  });
  assert.deepEqual(validateBlueprint(boosted), []);
});

test('splash radius needs spare target capacity to be a purchase benefit', () => {
  const unit = blueprint();
  unit.paths.path1.tiers.tier1.changes = [
    { kind: 'stat', target: 'base', stat: 'splashRadius', operation: 'add', value: 3 },
  ];
  assert.ok(
    validateBlueprint(unit).some(
      (issue) =>
        issue.path === 'paths.path1.tiers.tier1' &&
        issue.message.includes('only reduces or preserves'),
    ),
  );
  unit.paths.path1.tiers.tier1.changes.push(stat('pierce', 'add', 1));
  assert.deepEqual(validateBlueprint(unit), []);
});

test('splash requires spare target capacity in base, purchased and boosted attacks', () => {
  const base = blueprint();
  base.baseAttack.stats.splashRadius = 3;
  assert.ok(
    validateBlueprint(base).some(
      (issue) =>
        issue.path === 'builds.0-0-0.baseAttack.stats.splashRadius' &&
        issue.message.includes('Splash requires pierce of at least 2'),
    ),
  );
  base.baseAttack.stats.pierce = 2;
  assert.deepEqual(validateBlueprint(base), []);

  const unit = withBoost();
  unit.paths.path2.tiers.tier3.changes = [
    stat('damage', 'add', 100),
    { kind: 'stat', target: 'base', stat: 'splashRadius', operation: 'add', value: 3 },
  ];
  const issues = validateBlueprint(unit);
  for (const path of [
    'builds.0-3-0.baseAttack.stats.splashRadius',
    'builds.0-4-0.abilities.0.boostedAttack.stats.splashRadius',
  ])
    assert.ok(
      issues.some(
        (issue) => issue.path === path && issue.message.includes('Splash requires pierce'),
      ),
    );
  assert.throws(() => resolveBuild(unit, [0, 4, 0]));
  unit.paths.path2.tiers.tier3.changes.push(stat('pierce', 'add', 1));
  assert.deepEqual(validateBlueprint(unit), []);
});

test('boost damage upgrades must change direct damage on a pure control build', () => {
  const unit = withBoost();
  unit.baseAttack.stats.damage = 0;
  unit.baseAttack.stats.slowPercent = 20;
  unit.baseAttack.stats.slowSeconds = 2;
  for (const tier of ['tier1', 'tier2', 'tier3'] as const) {
    unit.paths.path2.tiers[tier].changes = [
      { kind: 'stat', target: 'base', stat: 'range', operation: 'add', value: 1 },
    ];
  }
  assert.ok(
    validateBlueprint(unit).some(
      (issue) =>
        issue.path === 'paths.path2.tiers.tier5' &&
        issue.message.includes('only reduces or preserves'),
    ),
  );
  unit.baseAttack.stats.damage = 1;
  assert.deepEqual(validateBlueprint(unit), []);
  unit.baseAttack.stats.damage = 0;
  unit.paths.path2.tiers.tier5.changes = [
    {
      kind: 'modifyBoost',
      target: 'base',
      stat: 'intervalMultiplier',
      operation: 'multiply',
      value: 0.8,
    },
  ];
  assert.deepEqual(validateBlueprint(unit), []);
});

test('harmful activation is rejected even when its purchase also improves the permanent attack', () => {
  for (const permanentBenefit of [false, true]) {
    const unit = withBoost();
    const unlock = unit.paths.path2.tiers.tier4.changes[0]!;
    assert.equal(unlock.kind, 'unlockBoost');
    if (unlock.kind !== 'unlockBoost') assert.fail('Expected a boost fixture.');
    Object.assign(unlock.boost, { damageMultiplier: 0.5, intervalMultiplier: 2, rangeBonus: 0 });
    if (permanentBenefit) unit.paths.path2.tiers.tier4.changes.push(stat('damage', 'add', 100));
    assert.ok(
      validateBlueprint(unit).some(
        (issue) =>
          issue.path === 'builds.0-4-0.abilities.0' &&
          issue.message.includes('must improve damage, attack interval or range'),
      ),
    );
    assert.throws(() => resolveBuild(unit, [0, 4, 0]));
    // Any actual supported improvement can compensate for another dimension's loss.
    for (const benefit of [
      { damageMultiplier: 2, intervalMultiplier: 2, rangeBonus: 0 },
      { damageMultiplier: 0.5, intervalMultiplier: 0.5, rangeBonus: 0 },
      { damageMultiplier: 0.5, intervalMultiplier: 2, rangeBonus: 1 },
    ]) {
      Object.assign(unlock.boost, benefit);
      assert.deepEqual(validateBlueprint(unit), []);
    }
  }
});

test('a damage multiplier cannot compensate for harmful activation when purchased damage is zero', () => {
  const unit = withBoost();
  unit.baseAttack.stats.damage = 0;
  unit.baseAttack.stats.slowPercent = 20;
  unit.baseAttack.stats.slowSeconds = 2;
  for (const tier of ['tier1', 'tier2', 'tier3'] as const)
    unit.paths.path2.tiers[tier].changes = [
      { kind: 'stat', target: 'base', stat: 'range', operation: 'add', value: 1 },
    ];
  const unlock = unit.paths.path2.tiers.tier4.changes[0]!;
  if (unlock.kind !== 'unlockBoost') assert.fail('Expected a boost fixture.');
  Object.assign(unlock.boost, { damageMultiplier: 2, intervalMultiplier: 2, rangeBonus: 0 });
  assert.ok(
    validateBlueprint(unit).some(
      (issue) =>
        issue.path === 'builds.0-4-0.abilities.0' &&
        issue.message.includes('must improve damage, attack interval or range'),
    ),
  );
});

test('fractional projectile failures identify the value and purchased modifier without rounding', () => {
  const unit = blueprint();
  unit.paths.path2.tiers.tier2.changes = [
    { kind: 'stat', target: 'base', stat: 'projectiles', operation: 'multiply', value: 1.5 },
  ];
  const issues = validateBlueprint(unit);
  for (const build of ['0-2-0', '0-2-1', '0-2-2', '0-2-3']) {
    const issue = issues.find(
      ({ path }) => path === `builds.${build}.baseAttack.stats.projectiles`,
    );
    assert.ok(issue);
    assert.match(issue.message, /Resolved projectiles is 1\.5; must be a positive integer/);
    assert.match(issue.message, /paths\.path2\.tiers\.tier2\.changes\.0: multiply 1\.5/);
    assert.match(issue.message, /base 1/);
  }
  assert.throws(() => resolveBuild(unit, [0, 2, 0]), /Resolved projectiles is 1\.5/);
  assert.equal(unit.paths.path2.tiers.tier2.changes[0]!.kind, 'stat');
});

test('fractional count multipliers remain valid when every composed count is integral', () => {
  const unit = blueprint();
  unit.baseAttack.stats.pierce = 2;
  unit.paths.path2.tiers.tier2.changes = [stat('pierce', 'multiply', 1.5)];
  assert.deepEqual(validateBlueprint(unit), []);
  assert.equal(resolveBuild(unit, [0, 2, 0]).baseAttack.stats.pierce, 3);
  unit.paths.path1.tiers.tier1.changes = [stat('pierce', 'add', 1)];
  const issue = validateBlueprint(unit).find(
    ({ path }) => path === 'builds.1-2-0.baseAttack.stats.pierce',
  );
  assert.ok(issue);
  assert.match(issue.message, /Resolved pierce is 4\.5/);
  assert.match(issue.message, /paths\.path1\.tiers\.tier1\.changes\.0: add 1/);
  assert.match(issue.message, /paths\.path2\.tiers\.tier2\.changes\.0: multiply 1\.5/);
});
