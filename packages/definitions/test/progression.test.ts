import { describe, expect, it } from 'vitest';
import { createMechanicsScheduler, eventPriority } from '../src/mechanics/scheduler.js';
import { createModelRuntime, type MechanicalModel } from '../src/mechanics/model.js';
import { applyDamage } from '../src/mechanics/combat.js';
import {
  applyExperienceTransaction,
  applyFusionTransaction
} from '../src/mechanics/progression.js';
import {
  createBtd6ProgressionRuntime,
  createBtd6ProgressionEncounter
} from '../src/btd6-derived/progression-runtime.js';
import { createBtd6FixtureV2 as createBaseFixtureV2 } from '../src/btd6-derived/v2-fixture.js';
import { compileBtd6BuildV2 } from '../src/btd6-derived/v2-compiler.js';
import {
  createBtd6DegreeScaling,
  scaleBtd6DegreeModel
} from '../src/btd6-derived/degree-scaling.js';
import { roundExperienceAwards, scaleProgressionStat } from '../src/mechanics/progression.js';
import {
  createBtd6FusionPolicy,
  createBtd6HeroProgression,
  createBtd6RoundExperiencePolicy,
  resolveBtd6Fusion,
  type Btd6FusionRequest
} from '../src/btd6-derived/progression.js';
import {
  advanceProgression,
  fusionDegree,
  resolveFusion,
  type FusionPolicy,
  type ProgressionPolicy
} from '../src/mechanics/progression.js';

// These progression scenarios declare contact attacks or explicit aimed flights below.
// Keep their timing independent of the bundled fixture's evolving projectile graph.
function createBtd6FixtureV2() {
  const unit = createBaseFixtureV2();
  for (const attack of unit.base!.attacks) delete attack.projectile;
  return unit;
}

// Exact field values from BTD6 56.3 build 24829026 runtime export at /data/progression.
// The tests declare award handling and contribution arithmetic as a provided policy.
const capturedDegrees = [
  0, 2000, 2324, 2666, 3027, 3408, 3808, 4228, 4669, 5131, 5615, 6121, 6650, 7203, 7779, 8379, 9004,
  9654, 10330, 11032, 11761, 12518, 13302, 14114, 14955, 15825, 16725, 17655, 18616, 19609, 20633,
  21689, 22778, 23900, 25056, 26246, 27471, 28732, 30028, 31360, 32729, 34135, 35579, 37061, 38582,
  40143, 41743, 43383, 45064, 46786, 48550, 50356, 52205, 54098, 56034, 58014, 60039, 62109, 64225,
  66387, 68596, 70853, 73157, 75509, 77910, 80360, 82860, 85410, 88011, 90664, 93368, 96124, 98933,
  101795, 104711, 107681, 110706, 113787, 116923, 120115, 123364, 126670, 130034, 133456, 136937,
  140478, 144078, 147738, 151459, 155241, 159085, 162991, 166960, 170993, 175089, 179249, 183474,
  187764, 192120, 200000
];
const capturedCosts = [
  180, 460, 1000, 1860, 3280, 5180, 8320, 9380, 13620, 16380, 14400, 16650, 14940, 16380, 17820,
  19260, 20700, 16470, 17280
];
const progression: ProgressionPolicy = {
  qualification: {
    kind: 'provided-policy',
    reference:
      'Captured 56.3 /data/progression/heroXpCalibration/baseSteps; incremental cost consumption and overflow retention supplied by this test.'
  },
  initialLevel: 1,
  steps: capturedCosts.map((cost, i) => ({ level: i + 2, cost, unlock: `model-${i + 2}` })),
  overflow: 'retain'
};
const fusion: FusionPolicy = {
  qualification: {
    kind: 'provided-policy',
    reference:
      'Captured 56.3 degree table and coefficients; illustrative sacrifice eligibility and arithmetic, not verified game semantics.'
  },
  requirements: [
    { kind: 'top', minimum: 1 },
    { kind: 'middle', minimum: 1 },
    { kind: 'bottom', minimum: 1 }
  ],
  contributions: [
    {
      id: 'damage',
      source: { kind: 'sacrifices', metric: 'damage', kinds: ['top', 'middle', 'bottom'] },
      operations: [{ kind: 'divide', value: 180 }, { kind: 'floor' }, { kind: 'cap', value: 90000 }]
    },
    { id: 'extra', source: { kind: 'input', key: 'power' }, operations: [] }
  ],
  maximumPower: 200000,
  degrees: capturedDegrees.map((minimumPower, i) => ({ degree: i + 1, minimumPower }))
};
const sacrifices = ['top', 'middle', 'bottom'].map((kind, i) => ({
  id: `actor-${i}`,
  kind,
  metrics: { damage: 120000 }
}));

describe('shared progression operations', () => {
  it('consumes captured incremental XP costs and returns exact model unlock boundaries', () => {
    const state = { level: 1, experience: 0 };
    expect(advanceProgression(state, 179, progression)).toMatchObject({
      state: { level: 1, experience: 179 },
      transitions: [],
      toNextLevel: 1
    });
    const first = advanceProgression(state, 180, progression);
    expect(first).toMatchObject({
      state: { level: 2, experience: 0 },
      transitions: [{ level: 2, unlock: 'model-2' }],
      toNextLevel: 460
    });
    const next = advanceProgression(first.state, 1467, progression);
    expect(next).toMatchObject({
      state: { level: 4, experience: 7 },
      transitions: [
        { level: 3, unlock: 'model-3' },
        { level: 4, unlock: 'model-4' }
      ],
      toNextLevel: 1853
    });
    expect(state).toEqual({ level: 1, experience: 0 });
  });
  it('handles every captured level and declares max-level overflow behavior', () => {
    const total = capturedCosts.reduce((a, b) => a + b, 0);
    const result = advanceProgression({ level: 1, experience: 0 }, total + 9, progression);
    expect(result.state).toEqual({ level: 20, experience: 9 });
    expect(result.transitions).toHaveLength(19);
    expect(result.toNextLevel).toBeNull();
    expect(
      advanceProgression(result.state, 5, { ...progression, overflow: 'discard' })
    ).toMatchObject({ state: { level: 20, experience: 0 }, discarded: 14 });
    expect(() => advanceProgression(result.state, -1, progression)).toThrow();
    expect(() => advanceProgression({ level: 21, experience: 0 }, 0, progression)).toThrow();
    expect(() =>
      advanceProgression({ level: 1, experience: 0 }, 0, {
        ...progression,
        steps: [progression.steps[1]!]
      })
    ).toThrow('consecutive');
  });
  it('selects every captured degree at and immediately below its threshold', () => {
    capturedDegrees.forEach((power, i) => {
      expect(fusionDegree(power, fusion)).toBe(i + 1);
      if (i) expect(fusionDegree(power - 1, fusion)).toBe(i);
    });
    expect(fusionDegree(999999, fusion)).toBe(100);
  });
  it('checks eligibility before calculating contributions and prevents duplicate sacrifices', () => {
    expect(resolveFusion({ sacrifices: sacrifices.slice(1), inputs: {} }, fusion)).toMatchObject({
      eligible: false,
      power: null,
      degree: null,
      missing: [{ kind: 'top', required: 1, actual: 0 }]
    });
    expect(() =>
      resolveFusion({ sacrifices: [...sacrifices, sacrifices[0]!], inputs: { power: 0 } }, fusion)
    ).toThrow('distinct');
    expect(() => resolveFusion({ sacrifices, inputs: {} }, fusion)).toThrow('fusion input power');
  });
  it('sums sacrifice counters, applies declared operations in order, and clamps total power', () => {
    const result = resolveFusion({ sacrifices, inputs: { power: 324 } }, fusion);
    expect(result).toMatchObject({
      eligible: true,
      power: 2324,
      degree: 3,
      contributions: [
        { id: 'damage', power: 2000 },
        { id: 'extra', power: 324 }
      ]
    });
    const capped = resolveFusion(
      {
        sacrifices: sacrifices.map((s) => ({ ...s, metrics: { damage: 1e9 } })),
        inputs: { power: 200000 }
      },
      fusion
    );
    expect(capped).toMatchObject({
      power: 200000,
      degree: 100,
      contributions: [
        { id: 'damage', power: 90000 },
        { id: 'extra', power: 200000 }
      ]
    });
    const ordered = {
      ...fusion,
      contributions: [
        {
          id: 'ordered',
          source: { kind: 'input' as const, key: 'power' },
          operations: [{ kind: 'floor' as const }, { kind: 'multiply' as const, value: 2 }]
        }
      ]
    };
    expect(resolveFusion({ sacrifices, inputs: { power: 1.9 } }, ordered).power).toBe(2);
    expect(() => fusionDegree(1, { ...fusion, degrees: [{ degree: 1, minimumPower: 1 }] })).toThrow(
      'zero'
    );
  });
});

// Secondary arithmetic policy is pinned in btd6ProgressionDocumentation.
const capturedFusion = {
  degreeCount: 100,
  powerDegreeRequirements: capturedDegrees,
  maxInvestment: 200000,
  maxPowerFromPops: 90000,
  maxPowerFromMoneySpent: 60000,
  maxPowerFromNonTier5Count: 10000,
  maxPowerFromTier5Count: 50000,
  popsOverX: 180,
  moneySpentOverX: 20000,
  nonTier5TowersMultByX: 100,
  tier5TowersMultByX: 6000,
  paidContributionPenalty: 0.05
};
const documentedFusion = createBtd6FusionPolicy(
  capturedFusion,
  100000,
  'BTD6 56.3 build24829026 /data/progression/paragon'
);
const originalRequest: Btd6FusionRequest = {
  family: 'DartMonkey',
  originalIds: ['a', 'b', 'c'],
  injectedCash: 0,
  totems: 0,
  towers: [
    { id: 'a', family: 'DartMonkey', tiers: [5, 0, 0], damage: 180000, cashSpent: 100000 },
    { id: 'b', family: 'DartMonkey', tiers: [0, 5, 0], damage: 0, cashSpent: 100000 },
    { id: 'c', family: 'DartMonkey', tiers: [0, 0, 5], damage: 0, cashSpent: 100000 }
  ]
};
describe('documented default progression policies', () => {
  it('maps exact captured hero XP observations to executable model unlocks', () => {
    const steps = capturedCosts.map((xpCost, i) => ({
      level: i + 2,
      xpCost,
      upgradeId: `captured-upgrade-${i + 2}`
    }));
    const policy = createBtd6HeroProgression(steps, 'BTD6 56.3 heroXpCalibration/baseSteps');
    expect(policy.qualification.kind).toBe('documented-policy');
    expect(advanceProgression({ level: 1, experience: 0 }, 640, policy).transitions).toEqual([
      { level: 2, unlock: 'captured-upgrade-2' },
      { level: 3, unlock: 'captured-upgrade-3' }
    ]);
    expect(() => createBtd6HeroProgression(steps.slice(1), 'capture')).toThrow('2 through 20');
  });
  it('excludes original tier-5 costs and counts, includes damage, and resolves an extra sacrifice', () => {
    expect(resolveBtd6Fusion(originalRequest, documentedFusion)).toMatchObject({
      eligible: true,
      power: 1000,
      degree: 1
    });
    const request: Btd6FusionRequest = {
      ...originalRequest,
      injectedCash: 105,
      towers: [
        ...originalRequest.towers,
        { id: 'd', family: 'DartMonkey', tiers: [4, 2, 0], damage: 180000, cashSpent: 10000 }
      ]
    };
    expect(resolveBtd6Fusion(request, documentedFusion)).toMatchObject({
      power: 4620,
      degree: 8,
      contributions: [
        { id: 'pops', power: 2000 },
        { id: 'money-spent', power: 2020 },
        { id: 'non-tier-5-upgrades', power: 600 },
        { id: 'extra-tier-5', power: 0 },
        { id: 'totems', power: 0 }
      ]
    });
    expect(
      resolveBtd6Fusion(
        { ...originalRequest, injectedCash: 1 },
        documentedFusion
      ).contributions.find((c) => c.id === 'money-spent')?.power
    ).toBe(0.2);
  });
  it('clamps pooled injected and sacrificed cash and caps total degree power', () => {
    const request: Btd6FusionRequest = {
      ...originalRequest,
      injectedCash: 315000,
      totems: 100,
      towers: [
        ...originalRequest.towers,
        { id: 'd', family: 'DartMonkey', tiers: [0, 0, 5], damage: 18000000, cashSpent: 300000 }
      ]
    };
    expect(resolveBtd6Fusion(request, documentedFusion)).toMatchObject({
      power: 200000,
      degree: 100,
      contributions: [
        { id: 'pops', power: 90000 },
        { id: 'money-spent', power: 60000 },
        { id: 'non-tier-5-upgrades', power: 0 },
        { id: 'extra-tier-5', power: 6000 },
        { id: 'totems', power: 200000 }
      ]
    });
  });
  it('rejects unsupported earned cash, wrong families and invalid originals', () => {
    expect(
      resolveBtd6Fusion(
        { ...originalRequest, towers: originalRequest.towers.slice(1) },
        documentedFusion
      )
    ).toMatchObject({ eligible: false, degree: null });
    expect(() =>
      resolveBtd6Fusion(
        {
          ...originalRequest,
          towers: originalRequest.towers.map((t) => ({ ...t, cashEarned: 1 }))
        },
        documentedFusion
      )
    ).toThrow('Cash-earned');
    expect(() =>
      resolveBtd6Fusion({ ...originalRequest, family: 'BoomerangMonkey' }, documentedFusion)
    ).toThrow('selected family');
    expect(() =>
      resolveBtd6Fusion({ ...originalRequest, originalIds: ['b', 'a', 'c'] }, documentedFusion)
    ).toThrow('selected path');
    expect(() =>
      createBtd6FusionPolicy({ ...capturedFusion, degreeCount: 99 }, 100000, 'capture')
    ).toThrow('incomplete');
  });
});

describe('progression roster transactions', () => {
  const base = () => createBtd6FixtureV2().base!;
  const creation = { allowed: true, reason: 'Scenario supplies eligible creation context' };
  it('rejects unavailable or invalid fusion models without consuming any entity', () => {
    const entities = originalRequest.towers.map((tower) => ({ id: tower.id, value: base() }));
    const commits: unknown[] = [];
    const runtime = createBtd6ProgressionRuntime(entities, [], {
      commit: (change) => commits.push(change)
    });
    const before = runtime.snapshot();
    expect(() =>
      runtime.fuse(originalRequest, documentedFusion, { id: 'fused', degrees: {} }, creation)
    ).toThrow('Missing fusion model');
    const invalid = base();
    invalid.attacks[0]!.damage = -1;
    expect(() =>
      runtime.fuse(
        originalRequest,
        documentedFusion,
        { id: 'fused', degrees: { 1: invalid } },
        creation
      )
    ).toThrow('Invalid progression model');
    expect(
      runtime.fuse(
        { ...originalRequest, towers: originalRequest.towers.slice(1) },
        documentedFusion,
        { id: 'fused', degrees: { 1: base() } },
        creation
      ).committed
    ).toBe(false);
    expect(runtime.snapshot()).toEqual(before);
    expect(() =>
      runtime.fuse(
        originalRequest,
        documentedFusion,
        { id: 'fused', degrees: { 1: base() } },
        { allowed: false, reason: 'Upgrade is locked' }
      )
    ).toThrow('Upgrade is locked');
    expect(runtime.snapshot()).toEqual(before);
    expect(commits).toEqual([]);
    const fused = base();
    fused.attacks[0]!.damage = 25;
    const result = runtime.fuse(
      originalRequest,
      documentedFusion,
      {
        id: 'fused',
        degrees: { 1: fused }
      },
      creation
    );
    expect(result.committed).toBe(true);
    expect(result.consumed).toEqual(['a', 'b', 'c']);
    expect(runtime.snapshot().map((e) => [e.id, e.value.attacks[0]!.damage])).toEqual([
      ['fused', 25]
    ]);
    expect(commits).toEqual([
      { removeIds: ['a', 'b', 'c'], replacements: [], additions: [{ id: 'fused', model: fused }] }
    ]);
    expect(entities).toHaveLength(3);
  });
  it('resolves every crossed hero unlock before changing the model or experience', () => {
    const upgraded = base();
    upgraded.attacks[0]!.damage = 9;
    const commits: unknown[] = [];
    const runtime = createBtd6ProgressionRuntime(
      [{ id: 'hero', value: base(), progression: { level: 1, experience: 0 } }],
      [{ entityId: 'hero', policy: progression, unlocks: { 'model-2': upgraded } }],
      { commit: (change) => commits.push(change) }
    );
    const before = runtime.snapshot();
    expect(() => runtime.awardExperience('hero', 640)).toThrow('model-3');
    expect(runtime.snapshot()).toEqual(before);
    expect(commits).toEqual([]);
    runtime.awardExperience('hero', 180);
    expect(runtime.snapshot()[0]).toMatchObject({
      progression: { level: 2, experience: 0 },
      value: { attacks: [{ damage: 9 }] }
    });
    expect(commits).toEqual([
      { removeIds: [], additions: [], replacements: [{ id: 'hero', model: upgraded }] }
    ]);
  });
  it('keeps its roster unchanged if the encounter rejects a complete commit batch', () => {
    const runtime = createBtd6ProgressionRuntime(
      originalRequest.towers.map((t) => ({ id: t.id, value: base() })),
      [],
      {
        commit() {
          throw new Error('placement rejected');
        }
      }
    );
    const before = runtime.snapshot();
    expect(() =>
      runtime.fuse(
        originalRequest,
        documentedFusion,
        { id: 'fused', degrees: { 1: base() } },
        creation
      )
    ).toThrow('placement rejected');
    expect(runtime.snapshot()).toEqual(before);
  });
  it('executes documented round awards and requires explicit multiplayer distribution', () => {
    const policy = createBtd6RoundExperiencePolicy();
    expect(
      [1, 20, 21, 50, 51, 99].map(
        (round) => roundExperienceAwards(round, ['hero'], policy)[0]!.award
      )
    ).toEqual([40, 420, 460, 1620, 1710, 6030]);
    expect(() => roundExperienceAwards(100, ['hero'], policy)).toThrow(
      'No experience award policy'
    );
    expect(
      roundExperienceAwards(20, ['hero'], createBtd6RoundExperiencePolicy('expert'))[0]!.award
    ).toBe(546);
    const unlocked = base();
    unlocked.attacks[0]!.damage = 7;
    const runtime = createBtd6ProgressionRuntime(
      [{ id: 'hero', value: base(), progression: { level: 1, experience: 0 } }],
      [{ entityId: 'hero', policy: progression, unlocks: { 'model-2': unlocked } }]
    );
    expect(runtime.completeRound(20, ['hero'], policy).transitions).toEqual([
      { id: 'hero', level: 2, unlock: 'model-2' }
    ]);
    expect(runtime.snapshot()[0]!.progression).toEqual({ level: 2, experience: 240 });
    expect(() => runtime.completeRound(1, ['hero', 'other'], policy)).toThrow(
      'explicit provided policy'
    );
    const supplied = {
      ...policy,
      qualification: {
        kind: 'provided-policy' as const,
        reference: 'Scenario declares equal distribution'
      },
      distribution: 'equal' as const
    };
    expect(roundExperienceAwards(1, ['hero', 'other'], supplied)).toEqual([
      { id: 'hero', award: 20 },
      { id: 'other', award: 20 }
    ]);
    const supported = createBtd6ProgressionRuntime(
      [{ id: 'hero', value: base(), progression: { level: 1, experience: 0 } }],
      [{ entityId: 'hero', policy: progression, unlocks: { 'model-2': unlocked } }],
      {
        commit() {},
        adjustRoundExperience(_id, award) {
          return award * 1.5;
        }
      }
    );
    expect(supported.completeRound(1, ['hero'], policy).awards).toEqual([
      { id: 'hero', baseAward: 40, award: 60 }
    ]);
    const before = runtime.snapshot();
    expect(() => runtime.completeRound(1, ['hero', 'other'], supplied)).toThrow(
      'Missing hero progression binding'
    );
    expect(runtime.snapshot()).toEqual(before);
  });
});

describe('documented degree combat scaling', () => {
  const policy = createBtd6DegreeScaling(
    {
      degreeCount: 100,
      attackCooldownReductionX: 50,
      piercePercentPerDegree: 1,
      pierceIncreasePerDegree: 0.1,
      damagePercentPerDegree: 1,
      damageIncreasePerDegree: 1,
      damageIncreaseForDegrees: 10
    },
    'BTD6 56.3 /data/progression/paragon'
  );
  it('uses the documented tenth-degree and degree-100 rules with explicit rounding', () => {
    expect([1, 10, 11, 100].map((level) => scaleProgressionStat(15, level, policy.damage))).toEqual(
      [15, 16.4, 17.5, 40]
    );
    expect(scaleProgressionStat(210, 20, policy.pierce)).toBe(250.9);
    expect(scaleProgressionStat(210, 100, policy.pierce)).toBe(430);
    expect(scaleProgressionStat(0.4, 100, policy.interval)).toBe(0.2347);
  });
  it('changes selected combat fields only and requires an explicit degree-1 baseline', () => {
    const base = createBtd6FixtureV2().base!;
    Object.assign(base.attacks[0]!, { damage: 15, pierce: 210, intervalSeconds: 0.4 });
    const selection = {
      baselineDegree: 1 as const,
      baselineReference: 'Scenario-provided degree-1 baseline; raw export has no degree envelope',
      attacks: [
        {
          attackId: base.attacks[0]!.id,
          damage: true,
          pierce: true,
          interval: true,
          childProjectileIds: []
        }
      ]
    };
    const scaled = scaleBtd6DegreeModel(base, 100, policy, selection);
    expect(scaled.attacks[0]).toMatchObject({ damage: 40, pierce: 430, intervalSeconds: 0.2347 });
    expect(scaleBtd6DegreeModel(base, 20, policy, selection).attacks[0]!.pierce).toBe(250.9);
    expect(scaled.displayRange).toBe(base.displayRange);
    expect(base.attacks[0]!.damage).toBe(15);
    const actorAttack = { ...base.attacks[0]!, id: 'actor-attack' };
    const activatedAttack = { ...base.attacks[0]!, id: 'activated-attack' };
    base.actors = [{ id: 'minion', attacks: [actorAttack] }];
    base.abilities = [
      {
        id: 'burst',
        name: 'Burst',
        cooldownSeconds: 2,
        effect: { kind: 'attack', attacks: [activatedAttack] }
      }
    ];
    const selectedStats = { damage: true, pierce: true, interval: true, childProjectileIds: [] };
    const nested = scaleBtd6DegreeModel(base, 100, policy, {
      ...selection,
      actors: [{ actorId: 'minion', attacks: [{ attackId: 'actor-attack', ...selectedStats }] }],
      abilities: [
        {
          abilityId: 'burst',
          cooldown: true,
          attacks: [{ attackId: 'activated-attack', ...selectedStats }]
        }
      ]
    });
    expect(nested.actors[0]!.attacks[0]!.damage).toBe(40);
    expect(nested.abilities[0]!.cooldownSeconds).toBe(1.2);

    expect(() =>
      scaleBtd6DegreeModel(base, 100, policy, { ...selection, baselineReference: '' })
    ).toThrow('degree-1 baseline');
  });
});

describe('shared progression on an active mechanical clock', () => {
  const model = (damage: number): MechanicalModel => ({
    attacks: [
      {
        id: 'attack',
        damage,
        shape: { kind: 'single' },
        range: 20,
        detectConcealed: false,
        delivery: 'direct-contact',
        intervalSeconds: 1,
        projectiles: 1
      }
    ],
    actors: [],
    passiveSummons: [],
    income: [],
    rangeSupport: []
  });
  it('retains an emitted attack snapshot across a level transition on the same clock', () => {
    const clock = createMechanicsScheduler();
    const target = { id: 'target', x: 10, y: 0, health: 100 };
    const impacts: Array<[number, number]> = [];
    let entities = [{ id: 'hero', value: model(2), progression: { level: 1, experience: 0 } }];
    const runtime = createModelRuntime(clock, entities[0]!.value, {
      id: 'hero',
      origin: { x: 0, y: 0 },
      onEvent() {},
      onAttack(attack) {
        clock.schedule(clock.now + 0.8, eventPriority.impact, () => {
          const hit = applyDamage(target, attack.damage);
          impacts.push([clock.now, hit.applied]);
        });
      }
    });
    runtime.start();
    clock.advance(0.5, true);
    const result = applyExperienceTransaction(
      entities,
      'hero',
      180,
      progression,
      { 'model-2': model(7) },
      () => {}
    );
    runtime.updateProfile(result.entities[0]!.value);
    entities = result.entities as typeof entities;
    clock.advance(2.4);
    expect(entities[0]!.progression.level).toBe(2);
    expect(impacts.map(([at, damage]) => [Number(at.toFixed(2)), damage])).toEqual([
      [0.8, 2],
      [2.3, 7]
    ]);
    expect(target.health).toBe(91);
  });
  it('keeps attacks alive after failed fusion and stops sacrifices only on successful creation', () => {
    const clock = createMechanicsScheduler();
    const target = { id: 'target', x: 10, y: 0, health: 100 };
    let entities = originalRequest.towers.map((tower) => ({ id: tower.id, value: model(1) }));
    const runtimes = new Map<string, ReturnType<typeof createModelRuntime>>();
    const spawn = (id: string, profile: MechanicalModel) => {
      const runtime = createModelRuntime(clock, profile, {
        id,
        origin: { x: 0, y: 0 },
        onEvent() {},
        onAttack(attack) {
          applyDamage(target, attack.damage);
        }
      });
      runtimes.set(id, runtime);
      runtime.start();
    };
    for (const entity of entities) spawn(entity.id, entity.value);
    const input = {
      sacrifices: entities.map((entity) => ({
        id: entity.id,
        kind: ['top', 'middle', 'bottom'][entities.indexOf(entity)]!,
        metrics: { damage: 0 }
      })),
      inputs: { power: 0 }
    };
    clock.advance(0.5);
    expect(() =>
      applyFusionTransaction(entities, input, fusion, { id: 'fused', degrees: {} }, () => {})
    ).toThrow('Missing fusion model');
    clock.advance(1.1);
    expect(target.health).toBe(94);
    const result = applyFusionTransaction(
      entities,
      input,
      fusion,
      { id: 'fused', degrees: { 1: model(10) } },
      () => {}
    );
    expect(result.committed).toBe(true);
    for (const id of result.consumed) {
      runtimes.get(id)!.stop();
      runtimes.delete(id);
    }
    entities = result.entities;
    spawn('fused', result.entities.find((entity) => entity.id === 'fused')!.value);
    clock.advance(2.2);
    expect(target.health).toBe(74);
    expect([...runtimes.keys()]).toEqual(['fused']);
    expect(entities.map((entity) => entity.id)).toEqual(['fused']);
  });
});

describe('progression in the continuous default encounter', () => {
  const base = () => createBtd6FixtureV2().base!;
  const build = (id: string, model: ReturnType<typeof base>) => ({
    schemaVersion: 'btd6-derived.build/0.2' as const,
    unitId: id,
    tiers: [0, 0, 0] as [number, number, number],
    cost: 0,
    model,
    adaptations: [],
    unsupported: []
  });
  const target = () => ({ id: 'target', x: 8, y: 0, health: 100, progress: 1, strength: 1 });
  it('keeps in-flight damage and existing actor profiles across a hero model transition', () => {
    const initial = base();
    Object.assign(initial.attacks[0]!, {
      damage: 2,
      intervalSeconds: 1,
      delivery: 'projectile',
      projectileSpeed: 10,
      projectileRadius: 0.1
    });
    initial.actors = [
      {
        id: 'pet',
        attacks: [
          {
            ...initial.attacks[0]!,
            id: 'pet-attack',
            damage: 1,
            intervalSeconds: 0.6,
            projectileSpeed: 20
          }
        ]
      }
    ];
    initial.passiveSummons = [
      { id: 'pet-create', actorId: 'pet', startDelaySeconds: 0, lifetimeSeconds: 0 }
    ];
    const upgraded = structuredClone(initial);
    upgraded.attacks[0]!.damage = 7;
    upgraded.actors[0]!.attacks[0]!.damage = 50;
    upgraded.passiveSummons = [];
    const runtime = createBtd6ProgressionEncounter(
      build('hero', initial),
      { targets: [target()] },
      {
        heroes: [
          {
            entityId: 'hero',
            initialState: { level: 1, experience: 0 },
            policy: progression,
            unlocks: { 'model-2': upgraded }
          }
        ]
      }
    );
    runtime.advance(0.5);
    runtime.awardExperience('hero', 180);
    const result = runtime.advance(2.4);
    expect(
      result.events.filter((event) => event.kind === 'damage').map((event) => event.amount)
    ).toEqual([2, 1, 1, 1, 7]);
    expect(result.targets[0]!.health).toBe(88);
    expect(result.actors).toHaveLength(1);
    expect(result.progression).toEqual([{ id: 'hero', state: { level: 2, experience: 0 } }]);
  });
  it('rejects invalid creation atomically and executes the fused unit, abilities and income', () => {
    const initial = base();
    Object.assign(initial.attacks[0]!, { damage: 1, intervalSeconds: 1 });
    const runtime = createBtd6ProgressionEncounter(build('a', initial), {
      targets: [target()],
      roundStarts: [1.2],
      allies: [
        { id: 'b', x: 0, y: 0, model: initial },
        { id: 'c', x: 0, y: 0, model: initial }
      ]
    });
    runtime.advance(0.5);
    const before = runtime.snapshot();
    const fused = base();
    Object.assign(fused.attacks[0]!, { damage: 10, intervalSeconds: 1 });
    fused.abilities = [
      {
        id: 'burst',
        name: 'Burst',
        cooldownSeconds: 5,
        effect: {
          kind: 'attack',
          attacks: [{ ...fused.attacks[0]!, id: 'burst-attack', damage: 4 }]
        }
      }
    ];
    fused.income = [
      {
        id: 'income',
        amount: 5,
        emissionsPerRound: 1,
        intervalSeconds: 0.1,
        pickupLifetimeSeconds: 1,
        autoCollect: true
      }
    ];
    const eligible = {
      allowed: true,
      reason: 'Scenario supplies an unlocked legal placement and purchase'
    };
    const invalidEffective = structuredClone(fused);
    invalidEffective.modifiers = [
      {
        id: 'invalid-interval',
        group: 'invalid-interval',
        stacking: 'unique',
        maxStacks: 1,
        radius: null,
        includesOwner: true,
        includesSubordinates: true,
        stat: 'attack.intervalSeconds',
        operation: 'multiply',
        value: 0
      }
    ];
    expect(() =>
      runtime.fuse(
        originalRequest,
        documentedFusion,
        { id: 'fused', degrees: { 1: invalidEffective }, position: { x: 0, y: 0 } },
        eligible
      )
    ).toThrow();
    expect(runtime.snapshot()).toEqual(before);

    expect(() =>
      runtime.fuse(
        originalRequest,
        documentedFusion,
        { id: 'fused', degrees: { 1: fused }, position: { x: NaN, y: 0 } },
        eligible
      )
    ).toThrow('explicit result position');
    expect(runtime.snapshot()).toEqual(before);
    runtime.advance(1.1);
    const result = runtime.fuse(
      originalRequest,
      documentedFusion,
      { id: 'fused', degrees: { 1: fused }, position: { x: 0, y: 0 } },
      eligible
    );
    expect(result.committed).toBe(true);
    expect(runtime.activate('burst')).toBe(true);
    const final = runtime.advance(2.2);
    expect(final.targets[0]!.health).toBe(70);
    expect(final.placements.map((placement) => placement.id)).toEqual(['fused']);
    expect(final.cash).toBe(5);
  });
});

it('executes progression declared in the compiled Default unit, including recipient XP support', () => {
  const unit = createBtd6FixtureV2();
  unit.id = 'hero';
  const unlocked = structuredClone(unit.base!);
  unlocked.attacks[0]!.damage = 9;
  unit.heroProgression = {
    policy: progression,
    initialState: { level: 1, experience: 0 },
    unlocks: Object.fromEntries(progression.steps.map((step) => [step.unlock, unlocked]))
  };
  unit.fusionPolicy = documentedFusion;
  unit.fusionModels = { '1': unlocked };
  const compiled = compileBtd6BuildV2(unit, [0, 0, 0]);
  expect(compiled.fusionPolicy).toEqual(documentedFusion);
  const support = structuredClone(unit.base!);
  support.attacks = [];
  support.modifiers = [
    {
      id: 'xp',
      group: 'xp-support',
      stacking: 'unique',
      maxStacks: 1,
      radius: 20,
      includesOwner: false,
      includesSubordinates: false,
      stat: 'progression.xpMultiplier',
      operation: 'multiply',
      value: 1.5
    }
  ];
  const runtime = createBtd6ProgressionEncounter(compiled, {
    targets: [{ id: 'target', x: 8, y: 0, health: 100, progress: 1, strength: 1 }],
    allies: [{ id: 'support', x: 0, y: 0, model: support }]
  });
  runtime.advance(0.5);
  expect(runtime.completeRound(1, ['hero'], createBtd6RoundExperiencePolicy()).awards).toEqual([
    { id: 'hero', baseAward: 40, award: 60 }
  ]);
  runtime.completeRound(3, ['hero'], createBtd6RoundExperiencePolicy());
  const result = runtime.advance(1.6);
  expect(result.progression.find((entity) => entity.id === 'hero')!.state).toEqual({
    level: 2,
    experience: 0
  });
  expect(result.placements.find((entity) => entity.id === 'hero')!.model.attacks[0]!.damage).toBe(
    9
  );
  expect(result.targets[0]!.health).toBe(89);
  const towerUnit = createBtd6FixtureV2();
  towerUnit.id = 'a';
  towerUnit.fusionPolicy = documentedFusion;
  towerUnit.fusionModels = { '1': unlocked };
  const towerBuild = compileBtd6BuildV2(towerUnit, [0, 0, 0]);
  const fusionRuntime = createBtd6ProgressionEncounter(towerBuild, {
    targets: [],
    allies: [
      { id: 'b', x: 0, y: 0, model: towerUnit.base! },
      { id: 'c', x: 0, y: 0, model: towerUnit.base! }
    ]
  });
  const fused = fusionRuntime.fuseConfigured(
    originalRequest,
    { id: 'fused', position: { x: 0, y: 0 } },
    { allowed: true, reason: 'Scenario supplies creation eligibility' }
  );
  expect(fused.committed).toBe(true);
  expect(
    fusionRuntime
      .snapshot()
      .placements.map((entity) => [entity.id, entity.model.attacks[0]!.damage])
  ).toEqual([['fused', 9]]);
});
