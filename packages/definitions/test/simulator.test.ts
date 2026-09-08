import { describe, expect, it } from 'vitest';

import { canonicalJson } from '@mardwerk/manifest';

import type { Action, Effect, Resource, Status, Summon } from '../src/classic/schemas.js';
import type { SimulationScenario, UnitBuild } from '../src/classic/reports.js';
import {
  BUILT_IN_SCENARIOS,
  fingerprintSimulationScenario,
  fingerprintUnitBuild,
  simulateBuild,
  validateSimulationScenario
} from '../src/classic/simulator.js';
import { validateUnitBuild } from '../src/classic/validation.js';

const directAction = (id: string, effects: Effect[]): Action => ({
  id,
  name: id,
  summary: `${id} test action`,
  unlockedByDefault: true,
  tags: [],
  trigger: { type: 'interval', intervalSeconds: 1 },
  targeting: {
    id: `${id}.targeting`,
    type: 'first',
    maximumTargets: 1,
    includeTags: [],
    excludeTags: []
  },
  delivery: {
    id: `${id}.delivery`,
    type: 'direct-strike',
    maximumTargetsPerProjectile: 1
  },
  timing: { cooldownSeconds: 2, windupSeconds: 0, rateScope: 'aggregate' },
  rangeWorldUnits: 100,
  emitters: [{ id: `${id}.emitter`, emitterCount: 1, projectilesPerCycle: 1 }],
  effects,
  conditions: [],
  resourceCosts: [],
  stateInteractions: []
});

const damageEffect = (id: string, amountHitPoints = 10): Effect => ({
  id,
  type: 'damage',
  amountHitPoints,
  damageType: 'test'
});

const build = (actions: Action[], overrides: Partial<UnitBuild> = {}): UnitBuild => ({
  schemaVersion: '0.1',
  unitId: 'test-unit',
  name: 'Test Unit',
  roles: ['damage'],
  tags: [],
  selection: [],
  selectedFormIds: [],
  totalCostCredits: 100,
  placement: {
    footprintRadiusWorldUnits: 1,
    allowedSurfaces: ['ground'],
    rules: []
  },
  economy: { baseCostCredits: 100, costProfile: 'test' },
  baseStats: { rangeWorldUnits: 100, durabilityHitPoints: 100 },
  actions,
  abilities: [],
  resources: [],
  summons: [],
  forms: [],
  statuses: [],
  states: [],
  appliedOperations: [],
  ...overrides
});

const scenario = (durationSeconds = 10): SimulationScenario => ({
  schemaVersion: '0.1',
  id: 'test-scenario',
  purpose: 'Focused simulator test',
  durationSeconds,
  seed: 17,
  abilityPolicy: 'automatic',
  enemies: [
    {
      id: 'target-1',
      spawnSeconds: 0,
      startDistanceWorldUnits: 50,
      speedWorldUnitsPerSecond: 0,
      healthHitPoints: 10_000,
      tags: [],
      resistances: {}
    }
  ]
});

describe('simulateBuild', () => {
  it('credits passive income once per scenario wave at time zero alongside action income', () => {
    const action = directAction('income-action', [
      {
        id: 'income-effect',
        type: 'economy-change',
        amountCredits: 5,
        recipient: 'owner'
      }
    ]);
    action.targeting.type = 'self';
    const input = build([action], {
      economy: { baseCostCredits: 100, costProfile: 'test', incomePerWaveCredits: 20 }
    });
    const short = simulateBuild(input, scenario(0.01));
    const longer = simulateBuild(input, scenario(3));
    expect(short.economyGeneratedCredits).toBe(25);
    expect(longer.economyGeneratedCredits).toBe(30);
    expect(short.firstEffectSeconds).toBe(0);
    expect(short.warnings).toContain(
      'Passive incomePerWaveCredits is credited once at time 0; each scenario models one wave.'
    );
    expect(simulateBuild(build([], { economy: input.economy }), scenario(3))).toMatchObject({
      economyGeneratedCredits: 20,
      firstEffectSeconds: 0,
      damageHitPoints: 0
    });
  });

  it('keeps the built-in scenario catalog deeply frozen', () => {
    expect(Object.isFrozen(BUILT_IN_SCENARIOS)).toBe(true);
    expect(Object.isFrozen(BUILT_IN_SCENARIOS.grouped.enemies)).toBe(true);
    expect(Object.isFrozen(BUILT_IN_SCENARIOS.grouped.enemies[0]!.tags)).toBe(true);
    expect(() => BUILT_IN_SCENARIOS.grouped.enemies[0]!.tags.push('mutation')).toThrow(TypeError);
  });

  it('rejects malformed, non-finite, unbounded, and duplicate-ID scenarios before work', () => {
    const input = build([directAction('guarded', [damageEffect('guarded.damage')])]);
    const base = scenario();
    const duplicateIds = {
      ...base,
      enemies: [base.enemies[0]!, { ...base.enemies[0]! }]
    };
    const tooManyEnemies = {
      ...base,
      enemies: Array.from({ length: 257 }, (_, index) => ({
        ...base.enemies[0]!,
        id: `target-${index}`
      }))
    };
    const cases: [unknown, string, string][] = [
      [{ ...base, purpose: undefined }, 'SCHEMA_NON_JSON_VALUE', '/purpose'],
      [
        { ...base, durationSeconds: Number.POSITIVE_INFINITY },
        'SCHEMA_NON_FINITE_NUMBER',
        '/durationSeconds'
      ],
      [{ ...base, durationSeconds: 121 }, 'SCHEMA_RANGE', '/durationSeconds'],
      [{ ...base, seed: 4_294_967_296 }, 'SCHEMA_RANGE', '/seed'],
      [{ ...base, id: 'invalid/scenario' }, 'SCHEMA_PATTERN', '/id'],
      [{ ...base, id: 'invalid scenario' }, 'SCHEMA_PATTERN', '/id'],
      [
        { ...base, enemies: [{ ...base.enemies[0]!, id: 'invalid/enemy' }] },
        'SCHEMA_PATTERN',
        '/enemies/0/id'
      ],
      [
        { ...base, enemies: [{ ...base.enemies[0]!, id: 'invalid enemy' }] },
        'SCHEMA_PATTERN',
        '/enemies/0/id'
      ],
      [tooManyEnemies, 'SCHEMA_RANGE', '/enemies'],
      [duplicateIds, 'SCENARIO_ENEMY_ID_DUPLICATE', '/enemies/1/id']
    ];

    for (const [candidate, code, path] of cases) {
      expect(validateSimulationScenario(candidate).issues).toContainEqual(
        expect.objectContaining({ code, path })
      );
      expect(() => simulateBuild(input, candidate as SimulationScenario)).toThrow(
        `Invalid simulation scenario: ${code} at ${path}:`
      );
    }
  });

  it('is canonical-byte stable for identical seed and input', () => {
    const status: Status = {
      id: 'slow',
      name: 'Slow',
      kind: 'slow',
      magnitude: 0.25,
      maximumStacks: 1,
      refresh: 'refresh',
      removal: 'expiry'
    };
    const action = directAction('steady', [
      damageEffect('hit'),
      {
        id: 'burn',
        type: 'damage-over-time',
        amountHitPointsPerTick: 2,
        tickIntervalSeconds: 1,
        durationSeconds: 2,
        damageType: 'test',
        stacking: 'refresh',
        maximumStacks: 1
      },
      {
        id: 'slow-hit',
        type: 'status',
        statusId: status.id,
        durationSeconds: 1.5,
        stacks: 1,
        stacking: 'refresh'
      }
    ]);
    action.targeting.type = 'random';
    const input = build([action], { statuses: [status] });
    const grouped = structuredClone(BUILT_IN_SCENARIOS.grouped);

    const first = simulateBuild(input, grouped);
    const second = simulateBuild(input, grouped);

    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(first.statusUptimeTargetSeconds).toBeGreaterThan(0);
    expect(first.damageByAction.steady).toBeGreaterThan(0);
  });

  it('binds each report to the canonical complete build and scenario inputs', () => {
    const input = build([directAction('fingerprinted', [damageEffect('fingerprinted.damage')])]);
    const inputScenario = scenario();
    const report = simulateBuild(input, inputScenario);

    expect(report).toMatchObject({
      unitId: input.unitId,
      buildFingerprint: fingerprintUnitBuild(input),
      scenarioFingerprint: fingerprintSimulationScenario(inputScenario)
    });
    expect(report.buildFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(report.scenarioFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(fingerprintUnitBuild({ ...input, name: 'Changed metadata' })).not.toBe(
      report.buildFingerprint
    );
    expect(
      fingerprintSimulationScenario({ ...inputScenario, purpose: 'Changed metadata' })
    ).not.toBe(report.scenarioFingerprint);
  });

  it('reflects damage, cooldown, and projectile upgrade-like changes', () => {
    const baseAction = directAction('shot', [damageEffect('shot.damage')]);
    const baseReport = simulateBuild(build([baseAction]), scenario());

    const stronger = structuredClone(baseAction);
    const strongerDamage = stronger.effects[0];
    if (strongerDamage?.type === 'damage') strongerDamage.amountHitPoints = 20;

    const faster = structuredClone(baseAction);
    faster.timing.cooldownSeconds = 1;

    const additionalProjectile = structuredClone(baseAction);
    additionalProjectile.emitters[0]!.projectilesPerCycle = 2;

    expect(simulateBuild(build([stronger]), scenario()).damageHitPoints).toBeGreaterThan(
      baseReport.damageHitPoints
    );
    expect(simulateBuild(build([faster]), scenario()).hits).toBeGreaterThan(baseReport.hits);
    expect(
      simulateBuild(build([additionalProjectile]), scenario()).damageHitPoints
    ).toBeGreaterThan(baseReport.damageHitPoints);
  });

  it('uses rateScope to distinguish aggregate from per-emitter throughput', () => {
    const action = directAction('rate-scope', [damageEffect('rate.damage')]);
    action.emitters[0]!.emitterCount = 3;
    const aggregate = simulateBuild(build([action]), scenario(0.01));
    action.timing.rateScope = 'per-emitter';
    const perEmitter = simulateBuild(build([action]), scenario(0.01));

    expect(aggregate.hits).toBe(1);
    expect(perEmitter.hits).toBe(3);
  });

  it('uses exact distance and range comparisons for tiny positive gaps', () => {
    const ranged = directAction('exact-range', [damageEffect('exact-range.damage')]);
    ranged.rangeWorldUnits = 100;
    const outsideRange = scenario(0.01);
    outsideRange.enemies[0]!.startDistanceWorldUnits = 100 + 5e-10;

    expect(simulateBuild(build([ranged]), outsideRange).damageHitPoints).toBe(0);

    const delayed = directAction('exact-distance', [damageEffect('exact-distance.damage')]);
    delayed.unlockedByDefault = false;
    delayed.trigger = { type: 'manual' };
    const nearExit = scenario(1.01);
    nearExit.enemies[0]!.startDistanceWorldUnits = 1.5e-9;
    nearExit.enemies[0]!.speedWorldUnitsPerSecond = 1e-9;
    const report = simulateBuild(
      build([delayed], {
        abilities: [
          {
            id: 'delayed-ability',
            name: 'Delayed ability',
            summary: 'Fires after a tiny positive path remainder.',
            unlockedByDefault: true,
            type: 'automatic',
            actionId: delayed.id,
            cooldownSeconds: 10,
            initialCooldownSeconds: 1,
            maximumCharges: 1,
            rechargeSeconds: 10,
            playerComplexity: 0
          }
        ]
      }),
      nearExit
    );

    expect(report.damageHitPoints).toBe(10);
  });

  it('treats zero starting distance as the escaped boundary', () => {
    const atExit = scenario(0.01);
    atExit.enemies[0]!.startDistanceWorldUnits = 0;

    expect(validateSimulationScenario(atExit)).toMatchObject({ valid: true, issues: [] });
    expect(
      simulateBuild(build([directAction('exit-shot', [damageEffect('exit-shot.damage')])]), atExit)
    ).toMatchObject({ hits: 0, damageHitPoints: 0, kills: 0 });
  });

  it('executes an automatic ability through its resource generation and recovery cycle', () => {
    const abilityAction = directAction('charged-shot', [damageEffect('charged.damage', 25)]);
    abilityAction.unlockedByDefault = false;
    abilityAction.trigger = { type: 'manual' };
    abilityAction.resourceCosts = [{ resourceId: 'charge', amountPerCycle: 1 }];
    const charge: Resource = {
      id: 'charge',
      name: 'Charge',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 0,
      cap: 4,
      generation: [{ event: 'time', amount: 1, intervalSeconds: 2 }],
      spend: [{ event: 'ability', referenceId: 'charged-ability', amount: 1 }],
      recovery: { type: 'regeneration', amountPerSecond: 0.5 },
      persistence: 'encounter'
    };
    const input = build([abilityAction], {
      resources: [charge],
      abilities: [
        {
          id: 'charged-ability',
          name: 'Charged Ability',
          summary: 'Spends charge on an automatic shot.',
          unlockedByDefault: true,
          type: 'automatic',
          actionId: abilityAction.id,
          cooldownSeconds: 2,
          initialCooldownSeconds: 0,
          maximumCharges: 1,
          rechargeSeconds: 2,
          playerComplexity: 0,
          resourceId: charge.id
        }
      ]
    });

    const report = simulateBuild(input, scenario(8));

    expect(report.abilityContributionHitPoints).toBeGreaterThan(0);
    expect(report.resourcesGenerated.charge).toBeGreaterThan(0);
    expect(report.resourcesSpent.charge).toBeGreaterThan(0);
    expect(report.damageHitPoints).toBe(report.abilityContributionHitPoints);
  });

  it('retries resource-blocked abilities when funded while keeping successful-cast cooldowns', () => {
    const shot = directAction('funded-shot', [damageEffect('funded-shot.damage', 25)]);
    shot.unlockedByDefault = false;
    shot.trigger = { type: 'manual' };
    shot.timing.cooldownSeconds = 12;
    shot.resourceCosts = [{ resourceId: 'funding', amountPerCycle: 3 }];
    shot.conditions = [{ subject: 'resource', referenceId: 'funding', operator: 'gte', value: 3 }];
    const producer = directAction('funding-hit', [damageEffect('funding-hit.damage', 1)]);
    producer.timing.cooldownSeconds = 1;
    for (const source of ['time', 'regeneration', 'on-hit'] as const) {
      for (const policy of ['automatic', 'on-cooldown'] as const) {
        const funding: Resource = {
          id: 'funding',
          name: 'Funding',
          unlockedByDefault: true,
          ownershipScope: 'unit',
          startingAmount: 0,
          cap: 6,
          generation:
            source === 'time'
              ? [{ event: 'time', amount: 3, intervalSeconds: 2 }]
              : source === 'on-hit'
                ? [{ event: 'on-hit', actionId: producer.id, amount: 1 }]
                : [],
          spend: [{ event: 'action', referenceId: shot.id, amount: 3 }],
          recovery:
            source === 'regeneration'
              ? { type: 'regeneration', amountPerSecond: 1.5 }
              : { type: 'none' },
          persistence: 'encounter'
        };
        const input = build([shot, ...(source === 'on-hit' ? [producer] : [])], {
          resources: [funding],
          abilities: [
            {
              id: 'funded-ability',
              name: 'Funded ability',
              summary: 'Waits for funding without using its cooldown.',
              unlockedByDefault: true,
              type: policy === 'automatic' ? 'automatic' : 'active',
              actionId: shot.id,
              cooldownSeconds: 12,
              initialCooldownSeconds: 0,
              maximumCharges: 2,
              rechargeSeconds: 12,
              playerComplexity: 0,
              resourceId: funding.id
            }
          ]
        });
        expect(validateUnitBuild(input).issues).toEqual([]);
        const run = (duration: number) =>
          simulateBuild(input, { ...scenario(duration), abilityPolicy: policy });
        expect(run(1.9).abilityContributionHitPoints, `${source}/${policy}`).toBe(0);
        const funded = run(2.1);
        expect(funded.abilityContributionHitPoints, `${source}/${policy}`).toBe(25);
        expect(funded.resourcesSpent.funding).toBe(3);
        expect(run(13.9).abilityContributionHitPoints).toBe(25);
        expect(run(14.1).abilityContributionHitPoints).toBe(50);
        expect(funded.eventCount).toBeLessThan(25);
        expect(funded.warnings).toEqual([]);
      }
    }
  });

  it('consumes bounded ability charges before their independent recharge', () => {
    const abilityAction = directAction('burst-charges', [damageEffect('burst.damage')]);
    abilityAction.unlockedByDefault = false;
    abilityAction.trigger = { type: 'manual' };
    abilityAction.timing.cooldownSeconds = 0;
    const ability = {
      id: 'burst-ability',
      name: 'Burst Ability',
      summary: 'Uses stored charges before the long recharge.',
      unlockedByDefault: true,
      type: 'automatic' as const,
      actionId: abilityAction.id,
      cooldownSeconds: 1,
      initialCooldownSeconds: 0,
      maximumCharges: 1,
      rechargeSeconds: 10,
      playerComplexity: 0
    };

    const oneCharge = simulateBuild(
      build([abilityAction], { abilities: [ability] }),
      scenario(2.1)
    );
    const threeCharges = simulateBuild(
      build([abilityAction], { abilities: [{ ...ability, maximumCharges: 3 }] }),
      scenario(2.1)
    );

    expect(oneCharge.abilityContributionHitPoints).toBe(10);
    expect(threeCharges.abilityContributionHitPoints).toBe(30);
  });

  it('retains a charge and retries a failed cast after cooldown rather than recharge', () => {
    const action = directAction('retry-shot', [damageEffect('retry-shot.damage')]);
    action.unlockedByDefault = false;
    action.trigger = { type: 'manual' };
    action.timing.cooldownSeconds = 0;
    const input = build([action], {
      abilities: [
        {
          id: 'retry-ability',
          name: 'Retry ability',
          summary: 'Retries until its target has spawned.',
          unlockedByDefault: true,
          type: 'automatic',
          actionId: action.id,
          cooldownSeconds: 1,
          initialCooldownSeconds: 0,
          maximumCharges: 1,
          rechargeSeconds: 100,
          playerComplexity: 0
        }
      ]
    });
    const delayedTarget = scenario(2.01);
    delayedTarget.enemies[0]!.spawnSeconds = 2;

    expect(validateUnitBuild(input)).toMatchObject({ valid: true, issues: [] });
    const report = simulateBuild(input, delayedTarget);

    expect(report.hits).toBe(1);
    expect(report.damageHitPoints).toBe(10);
    expect(report.abilityContributionHitPoints).toBe(10);
  });

  it('bounds recursive secondary actions and concurrent summons', () => {
    const secondary = directAction('secondary', [
      damageEffect('secondary.damage', 3),
      {
        id: 'secondary.repeat',
        type: 'secondary-action',
        actionId: 'secondary',
        maximumTriggersPerCycle: 2
      }
    ]);
    secondary.unlockedByDefault = false;
    secondary.trigger = { type: 'manual' };
    secondary.timing.cooldownSeconds = 0;

    const summonAction = directAction('summon-shot', [damageEffect('summon.damage', 2)]);
    summonAction.unlockedByDefault = false;
    summonAction.timing.cooldownSeconds = 0.5;
    summonAction.trigger = { type: 'interval', intervalSeconds: 0.5 };

    const primary = directAction('primary', [
      {
        id: 'primary.secondary',
        type: 'secondary-action',
        actionId: secondary.id,
        maximumTriggersPerCycle: 1
      },
      {
        id: 'primary.spawn',
        type: 'spawn',
        summonId: 'helper',
        instances: 3,
        durationSeconds: 1.5
      }
    ]);
    primary.targeting.type = 'first';
    primary.timing.cooldownSeconds = 1;

    const summon: Summon = {
      id: 'helper',
      name: 'Helper',
      unlockedByDefault: true,
      targetType: 'enemy',
      selection: 'owner-target',
      activation: 'spawn-effect',
      actionId: summonAction.id,
      durationSeconds: 1.5,
      placementRangeWorldUnits: 0,
      maximumConcurrentInstances: 2,
      cooldownSeconds: 0,
      replacement: 'reject',
      removal: 'expiry'
    };
    const input = build([primary, secondary, summonAction], { summons: [summon] });

    const report = simulateBuild(input, scenario(4));

    expect(report.damageByAction.secondary).toBeGreaterThan(0);
    expect(report.summonContributionHitPoints).toBeGreaterThan(0);
    expect(report.eventCount).toBeLessThan(500);
    expect(report.warnings.some((warning) => warning.includes('limit'))).toBe(false);
  });

  it('truncates unsafe count arithmetic before count-driven loops', () => {
    const action = directAction('unsafe-counts', [damageEffect('unsafe.damage', 0)]);
    action.emitters[0]!.emitterCount = 1e308;
    action.emitters[0]!.projectilesPerCycle = 1e308;
    action.timing.rateScope = 'per-emitter';
    action.targeting.maximumTargets = 1e308;
    action.delivery.maximumTargetsPerProjectile = 1e308;

    const report = simulateBuild(build([action]), scenario(0.01));

    expect(report.eventCount).toBeLessThanOrEqual(4_100);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('not a safe non-negative integer'),
        expect.stringContaining('emissions exceed per-cycle cap 4096')
      ])
    );
  });

  it('separates primary aim limits from deterministic delivery collateral', () => {
    const action = directAction('bounded-targeting', [damageEffect('bounded.damage')]);
    const grouped = scenario(0.01);
    grouped.enemies = Array.from({ length: 3 }, (_, index) => ({
      ...grouped.enemies[0]!,
      id: `target-${index + 1}`
    }));

    action.targeting.maximumTargets = 1;
    action.delivery.maximumTargetsPerProjectile = 3;
    const collateral = simulateBuild(build([action]), grouped);
    expect(collateral.hits).toBe(3);
    expect(collateral.targetsAffected).toBe(3);

    action.delivery.maximumTargetsPerProjectile = 1;
    action.emitters[0]!.projectilesPerCycle = 3;
    const onePrimary = simulateBuild(build([action]), grouped);
    action.targeting.maximumTargets = 2;
    const twoPrimaries = simulateBuild(build([action]), grouped);

    expect(onePrimary.targetsAffected).toBe(1);
    expect(twoPrimaries.targetsAffected).toBe(2);
  });

  it('keeps linked interval and eligible ability schedules independent', () => {
    const action = directAction('linked-primary', [damageEffect('linked.damage')]);
    const ability = {
      id: 'linked-ability',
      name: 'Linked Ability',
      summary: 'Metadata links to an independently unlocked interval action.',
      unlockedByDefault: false,
      type: 'automatic' as const,
      actionId: action.id,
      cooldownSeconds: 2,
      initialCooldownSeconds: 1,
      maximumCharges: 1,
      rechargeSeconds: 2,
      playerComplexity: 0
    };

    const locked = simulateBuild(build([action], { abilities: [ability] }), scenario(3.1));
    const unlocked = simulateBuild(
      build([action], { abilities: [{ ...ability, unlockedByDefault: true }] }),
      scenario(3.1)
    );

    expect(locked.hits).toBe(2);
    expect(locked.damageHitPoints).toBe(20);
    expect(locked.abilityContributionHitPoints).toBe(0);
    expect(unlocked.hits).toBe(4);
    expect(unlocked.damageHitPoints).toBe(40);
    expect(unlocked.abilityContributionHitPoints).toBe(20);
  });

  it('attributes only admitted ability damage-over-time stacks to the ability', () => {
    const action = directAction('linked-dot', [
      {
        id: 'linked-dot.effect',
        type: 'damage-over-time',
        amountHitPointsPerTick: 10,
        tickIntervalSeconds: 1,
        durationSeconds: 1,
        damageType: 'test',
        stacking: 'stack',
        maximumStacks: 2
      }
    ]);
    action.trigger = { type: 'interval', intervalSeconds: 10 };
    action.timing.cooldownSeconds = 10;
    const input = build([action], {
      abilities: [
        {
          id: 'linked-dot-ability',
          name: 'Linked damage-over-time ability',
          summary: 'Adds one attributed stack beside the native stack.',
          unlockedByDefault: true,
          type: 'automatic',
          actionId: action.id,
          cooldownSeconds: 10,
          initialCooldownSeconds: 0,
          maximumCharges: 1,
          rechargeSeconds: 10,
          playerComplexity: 0
        }
      ]
    });

    expect(validateUnitBuild(input)).toMatchObject({ valid: true, issues: [] });
    const report = simulateBuild(input, scenario(1.01));

    expect(report.damageHitPoints).toBe(20);
    expect(report.abilityContributionHitPoints).toBe(10);
    expect(report.summonContributionHitPoints).toBe(0);
    expect(report.damageByAction[action.id]).toBe(20);
    expect(report.warnings).toEqual([]);
  });

  it('cancels summon wind-up and travel when the originating instance expires', () => {
    const summonAction = directAction('short-lived-output', [damageEffect('late.damage', 50)]);
    summonAction.unlockedByDefault = false;
    summonAction.timing.windupSeconds = 1;
    const spawn = directAction('short-lived-spawn', [
      {
        id: 'spawn.short-lived',
        type: 'spawn',
        summonId: 'short-lived',
        instances: 1,
        durationSeconds: 0.5
      }
    ]);
    const summon: Summon = {
      id: 'short-lived',
      name: 'Short-lived summon',
      unlockedByDefault: true,
      targetType: 'enemy',
      selection: 'nearest',
      activation: 'spawn-effect',
      actionId: summonAction.id,
      durationSeconds: 0.5,
      placementRangeWorldUnits: 0,
      maximumConcurrentInstances: 1,
      cooldownSeconds: 0,
      replacement: 'reject',
      removal: 'expiry'
    };

    const report = simulateBuild(
      build([spawn, summonAction], { summons: [summon] }),
      scenario(1.5)
    );

    expect(report.summonContributionHitPoints).toBe(0);
    expect(report.damageByAction['short-lived-output']).toBeUndefined();
  });

  it('refreshes the oldest summon by creation order and restarts only a stopped loop', () => {
    const summonAction = directAction('refresh-output', [damageEffect('refresh.damage', 1)]);
    summonAction.unlockedByDefault = false;
    summonAction.timing.cooldownSeconds = 1;
    summonAction.trigger = { type: 'interval', intervalSeconds: 1 };
    const spawn = directAction('refresh-spawn', [
      {
        id: 'spawn.refresh',
        type: 'spawn',
        summonId: 'refresh-helper',
        instances: 1,
        durationSeconds: 2
      }
    ]);
    spawn.trigger = { type: 'interval', intervalSeconds: 0.5 };
    spawn.timing.cooldownSeconds = 0.5;
    spawn.resourceCosts = [{ resourceId: 'spawn-charge', amountPerCycle: 1 }];
    const summon: Summon = {
      id: 'refresh-helper',
      name: 'Refresh helper',
      unlockedByDefault: true,
      targetType: 'enemy',
      selection: 'nearest',
      activation: 'spawn-effect',
      actionId: summonAction.id,
      durationSeconds: 2,
      placementRangeWorldUnits: 0,
      maximumConcurrentInstances: 2,
      cooldownSeconds: 0,
      replacement: 'refresh',
      removal: 'expiry'
    };
    const charge: Resource = {
      id: 'spawn-charge',
      name: 'Spawn charge',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 4,
      cap: 4,
      generation: [],
      spend: [],
      recovery: { type: 'none' },
      persistence: 'encounter'
    };

    const report = simulateBuild(
      build([spawn, summonAction], { summons: [summon], resources: [charge] }),
      scenario(2.6)
    );

    expect(report.hits).toBe(5);
    expect(report.summonContributionHitPoints).toBe(5);
  });

  it('fails closed on manually constructed invalid condition combinations', () => {
    const action = directAction('invalid-condition', [damageEffect('invalid.damage')]);
    action.conditions = [{ subject: 'target-tag', operator: 'neq', value: 'concealed' }];

    const report = simulateBuild(build([action]), scenario(0.01));

    expect(report.damageHitPoints).toBe(0);
    expect(report.warnings).toContain(
      'Action invalid-condition condition 0 is not executable; condition fails closed.'
    );
  });

  it('gates mixed global effects and costs on target eligibility before and after wind-up', () => {
    const action = directAction('conditional-mixed', [
      damageEffect('conditional-mixed.damage'),
      {
        id: 'conditional-mixed.economy',
        type: 'economy-change',
        amountCredits: 5,
        recipient: 'owner'
      }
    ]);
    action.conditions = [{ subject: 'target-tag', operator: 'contains', value: 'boss' }];
    action.timing.windupSeconds = 1;
    action.resourceCosts = [{ resourceId: 'energy', amountPerCycle: 1 }];
    const energy: Resource = {
      id: 'energy',
      name: 'Energy',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 1,
      cap: 1,
      generation: [],
      spend: [{ event: 'action', referenceId: action.id, amount: 1 }],
      recovery: { type: 'none' },
      persistence: 'encounter'
    };
    const input = build([action], { resources: [energy] });
    const untagged = scenario(1.1);
    const tagged = structuredClone(untagged);
    tagged.enemies[0]!.tags = ['boss'];
    const escapedDuringWindup = structuredClone(tagged);
    escapedDuringWindup.enemies[0]!.startDistanceWorldUnits = 0.5;
    escapedDuringWindup.enemies[0]!.speedWorldUnitsPerSecond = 1;

    expect(validateUnitBuild(input)).toMatchObject({ valid: true, issues: [] });
    const falseCondition = simulateBuild(input, untagged);
    const trueCondition = simulateBuild(input, tagged);
    const lostTarget = simulateBuild(input, escapedDuringWindup);

    expect(falseCondition).toMatchObject({
      damageHitPoints: 0,
      economyGeneratedCredits: 0,
      hits: 0,
      resourcesSpent: { energy: 0 }
    });
    expect(trueCondition).toMatchObject({
      damageHitPoints: 10,
      economyGeneratedCredits: 5,
      hits: 1,
      resourcesSpent: { energy: 1 }
    });
    expect(lostTarget).toMatchObject({
      damageHitPoints: 0,
      economyGeneratedCredits: 0,
      hits: 0,
      resourcesSpent: { energy: 1 }
    });
  });

  it('consumes hit-removal statuses once without consuming a same-hit replacement', () => {
    const mark = directAction('mark', [
      {
        id: 'mark.effect',
        type: 'status',
        statusId: 'one-hit-vulnerability',
        durationSeconds: 5,
        stacks: 1,
        stacking: 'replace'
      }
    ]);
    const firstHit = directAction('first-hit', [damageEffect('first.damage')]);
    const secondHit = directAction('second-hit', [damageEffect('second.damage')]);
    const vulnerability: Status = {
      id: 'one-hit-vulnerability',
      name: 'One-hit vulnerability',
      kind: 'vulnerability',
      magnitude: 1,
      maximumStacks: 1,
      refresh: 'replace',
      removal: 'hit'
    };

    const report = simulateBuild(
      build([mark, firstHit, secondHit], { statuses: [vulnerability] }),
      scenario(0.01)
    );

    expect(report.damageHitPoints).toBe(30);
  });

  it('retains status stacks on refresh and resets them on replace', () => {
    const statusAction = (id: string, stacking: Extract<Effect, { type: 'status' }>['stacking']) =>
      directAction(id, [
        {
          id: `${id}.effect`,
          type: 'status',
          statusId: 'stacked-vulnerability',
          durationSeconds: 5,
          stacks: 1,
          stacking
        }
      ]);
    const vulnerability: Status = {
      id: 'stacked-vulnerability',
      name: 'Stacked vulnerability',
      kind: 'vulnerability',
      magnitude: 0.5,
      maximumStacks: 3,
      refresh: 'stack',
      removal: 'expiry'
    };
    const hit = directAction('stack-hit', [damageEffect('stack.damage')]);
    const stacked = [statusAction('stack-one', 'stack'), statusAction('stack-two', 'stack')];

    const refreshed = simulateBuild(
      build([...stacked, statusAction('refresh-stacks', 'refresh'), hit], {
        statuses: [vulnerability]
      }),
      scenario(0.01)
    );
    const replaced = simulateBuild(
      build([...stacked, statusAction('replace-stacks', 'replace'), hit], {
        statuses: [vulnerability]
      }),
      scenario(0.01)
    );

    expect(refreshed.damageHitPoints).toBe(20);
    expect(replaced.damageHitPoints).toBe(15);
  });

  it('treats exactly expired status and damage-over-time state as absent on reapplication', () => {
    const vulnerability: Status = {
      id: 'expiring-vulnerability',
      name: 'Expiring vulnerability',
      kind: 'vulnerability',
      magnitude: 0.5,
      maximumStacks: 3,
      refresh: 'stack',
      removal: 'expiry'
    };
    const statusEffect: Extract<Effect, { type: 'status' }> = {
      id: 'expiring-status.effect',
      type: 'status',
      statusId: vulnerability.id,
      durationSeconds: 1,
      stacks: 1,
      stacking: 'stack'
    };
    const delayedReapplication = directAction('delayed-status', [
      statusEffect,
      damageEffect('delayed-status.damage')
    ]);
    delayedReapplication.trigger = { type: 'interval', intervalSeconds: 2 };
    delayedReapplication.timing.cooldownSeconds = 2;
    delayedReapplication.delivery = {
      ...delayedReapplication.delivery,
      type: 'projectile',
      projectileSpeedWorldUnitsPerSecond: 50
    };
    const initialStatus = directAction('initial-status', [
      { ...statusEffect, id: 'initial-status.effect' }
    ]);
    initialStatus.trigger = { type: 'interval', intervalSeconds: 2 };
    initialStatus.timing.cooldownSeconds = 2;

    const statusReport = simulateBuild(
      build([delayedReapplication, initialStatus], { statuses: [vulnerability] }),
      scenario(1)
    );

    const dotAction = directAction('expiring-dot', [
      {
        id: 'expiring-dot.effect',
        type: 'damage-over-time',
        amountHitPointsPerTick: 10,
        tickIntervalSeconds: 1,
        durationSeconds: 1,
        damageType: 'test',
        stacking: 'stack',
        maximumStacks: 3
      }
    ]);
    dotAction.trigger = { type: 'interval', intervalSeconds: 1 };
    dotAction.timing.cooldownSeconds = 1;

    const dotReport = simulateBuild(build([dotAction]), scenario(2));

    expect(statusReport.damageHitPoints).toBe(15);
    expect(dotReport.damageHitPoints).toBe(20);
  });

  it('counts a status-only impact as one hit and one on-hit generation event', () => {
    const status: Status = {
      id: 'impact-mark',
      name: 'Impact mark',
      kind: 'mark',
      magnitude: 1,
      maximumStacks: 1,
      refresh: 'replace',
      removal: 'expiry'
    };
    const action = directAction('status-only', [
      {
        id: 'status-only.effect',
        type: 'status',
        statusId: status.id,
        durationSeconds: 1,
        stacks: 1,
        stacking: 'replace'
      }
    ]);
    const resource: Resource = {
      id: 'on-hit-resource',
      name: 'On-hit resource',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 0,
      cap: 10,
      generation: [{ event: 'on-hit', amount: 2, actionId: action.id }],
      spend: [],
      recovery: { type: 'none' },
      persistence: 'encounter'
    };

    const report = simulateBuild(
      build([action], { statuses: [status], resources: [resource] }),
      scenario(0.01)
    );

    expect(report.hits).toBe(1);
    expect(report.targetsAffected).toBe(1);
    expect(report.resourcesGenerated[resource.id]).toBe(2);
  });

  it('records damage-over-time application before its first tick', () => {
    const action = directAction('slow-dot', [
      {
        id: 'slow-dot.effect',
        type: 'damage-over-time',
        amountHitPointsPerTick: 10,
        tickIntervalSeconds: 5,
        durationSeconds: 5,
        damageType: 'test',
        stacking: 'refresh',
        maximumStacks: 1
      }
    ]);

    const report = simulateBuild(build([action]), scenario(1));

    expect(report.damageHitPoints).toBe(0);
    expect(report.targetsAffected).toBe(1);
    expect(report.firstEffectSeconds).toBe(0);
  });

  it('executes compatible self effects while failing closed on unsupported target and resource cases', () => {
    const action = directAction('self-economy', [
      damageEffect('invalid-self-damage'),
      {
        id: 'self-income',
        type: 'economy-change',
        amountCredits: 5,
        recipient: 'owner'
      }
    ]);
    action.targeting.type = 'self';
    const reactive: Resource = {
      id: 'reactive-resource',
      name: 'Reactive resource',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 0,
      cap: 5,
      generation: [{ event: 'on-damage', amount: 1 }],
      spend: [],
      recovery: { type: 'none' },
      persistence: 'encounter'
    };

    const report = simulateBuild(build([action], { resources: [reactive] }), scenario(0.01));

    expect(report.economyGeneratedCredits).toBe(5);
    expect(report.damageHitPoints).toBe(0);
    expect(report.resourcesGenerated['reactive-resource']).toBe(0);
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        'Action self-economy cannot apply enemy-targeted effects with self targeting; skipped.',
        'Resource reactive-resource on-damage generation is unsupported and will not execute.'
      ])
    );
  });

  it('resets state to its initial value at the versioned expiry event', () => {
    const setter = directAction('set-temporary-state', [
      {
        id: 'state-marker',
        type: 'economy-change',
        amountCredits: 0,
        recipient: 'owner'
      }
    ]);
    setter.targeting.type = 'self';
    setter.stateInteractions = [{ stateId: 'temporary-state', operation: 'set', value: true }];
    const conditional = directAction('state-conditional', [damageEffect('conditional.damage')]);
    conditional.trigger = { type: 'interval', intervalSeconds: 0.75 };
    conditional.timing.cooldownSeconds = 0.75;
    conditional.conditions = [
      {
        subject: 'state',
        referenceId: 'temporary-state',
        operator: 'eq',
        value: true
      }
    ];

    const report = simulateBuild(
      build([setter, conditional], {
        states: [
          {
            id: 'temporary-state',
            name: 'Temporary state',
            initialValue: false,
            expirySeconds: 0.5
          }
        ]
      }),
      scenario(0.8)
    );

    expect(report.damageHitPoints).toBe(0);
  });

  it('spends resources only after finding a viable target or global output', () => {
    const attack = directAction('targetless-cost', [damageEffect('targetless.damage')]);
    attack.rangeWorldUnits = 1;
    attack.resourceCosts = [{ resourceId: 'energy', amountPerCycle: 1 }];
    const economy = directAction('global-cost', [
      {
        id: 'global-income',
        type: 'economy-change',
        amountCredits: 2,
        recipient: 'owner'
      }
    ]);
    economy.targeting.type = 'self';
    economy.resourceCosts = [{ resourceId: 'energy', amountPerCycle: 1 }];
    const energy: Resource = {
      id: 'energy',
      name: 'Energy',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 2,
      cap: 2,
      generation: [],
      spend: [],
      recovery: { type: 'none' },
      persistence: 'encounter'
    };

    const report = simulateBuild(
      build([attack, economy], {
        resources: [energy],
        abilities: [
          {
            id: 'targetless-ability',
            name: 'Targetless Ability',
            summary: 'Must not spend when no target is viable.',
            unlockedByDefault: true,
            type: 'automatic',
            actionId: attack.id,
            cooldownSeconds: 2,
            initialCooldownSeconds: 0,
            maximumCharges: 1,
            rechargeSeconds: 2,
            playerComplexity: 0,
            resourceId: energy.id
          }
        ]
      }),
      scenario(0.01)
    );

    expect(report.resourcesSpent.energy).toBe(1);
    expect(report.economyGeneratedCredits).toBe(2);
    expect(report.damageHitPoints).toBe(0);
  });

  it('rejects a resource payment with a tiny positive shortfall', () => {
    const action = directAction('exact-payment', [damageEffect('exact-payment.damage')]);
    action.resourceCosts = [{ resourceId: 'energy', amountPerCycle: 1 }];
    const energy: Resource = {
      id: 'energy',
      name: 'Energy',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 1 - 5e-10,
      cap: 1,
      generation: [],
      spend: [{ event: 'action', referenceId: action.id, amount: 1 }],
      recovery: { type: 'none' },
      persistence: 'encounter'
    };

    const report = simulateBuild(build([action], { resources: [energy] }), scenario(0.01));

    expect(report.damageHitPoints).toBe(0);
    expect(report.hits).toBe(0);
    expect(report.resourcesSpent.energy).toBe(0);
  });

  it('expires only the unspent remainder of each fungible resource lot', () => {
    const globalAction = (id: string, effect: Effect, cost = 0) => {
      const action = directAction(id, [effect]);
      action.unlockedByDefault = false;
      action.trigger = { type: 'manual' };
      action.targeting.type = 'self';
      action.resourceCosts = cost > 0 ? [{ resourceId: 'light', amountPerCycle: cost }] : [];
      return action;
    };
    const addOne = globalAction('add-one', {
      id: 'add-one.effect',
      type: 'resource-change',
      resourceId: 'light',
      operation: 'add',
      amount: 5
    });
    const addTwo = globalAction('add-two', {
      id: 'add-two.effect',
      type: 'resource-change',
      resourceId: 'light',
      operation: 'add',
      amount: 5
    });
    const spendOne = globalAction(
      'spend-one',
      { id: 'spend-one.output', type: 'economy-change', amountCredits: 1, recipient: 'owner' },
      3
    );
    const spendTwo = globalAction(
      'spend-two',
      { id: 'spend-two.output', type: 'economy-change', amountCredits: 1, recipient: 'owner' },
      4
    );
    const light: Resource = {
      id: 'light',
      name: 'Light',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 0,
      cap: 10,
      generation: [],
      spend: [],
      recovery: { type: 'none' },
      persistence: 'encounter',
      expirySeconds: 2
    };
    const ability = (id: string, actionId: string, initialCooldownSeconds: number) => ({
      id,
      name: id,
      summary: `${id} test activation`,
      unlockedByDefault: true,
      type: 'automatic' as const,
      actionId,
      cooldownSeconds: 100,
      initialCooldownSeconds,
      maximumCharges: 1,
      rechargeSeconds: 100,
      playerComplexity: 0
    });

    const report = simulateBuild(
      build([addOne, spendOne, addTwo, spendTwo], {
        resources: [light],
        abilities: [
          ability('add-one-ability', addOne.id, 0),
          ability('spend-one-ability', spendOne.id, 0.5),
          ability('add-two-ability', addTwo.id, 1),
          ability('spend-two-ability', spendTwo.id, 2.5)
        ]
      }),
      scenario(2.6)
    );

    expect(report.resourcesGenerated.light).toBe(10);
    expect(report.resourcesSpent.light).toBe(7);
    expect(report.economyGeneratedCredits).toBe(2);
  });

  it('expires resource lots before same-time ability attempts regardless of queue order', () => {
    const generate = directAction('generate-expiring', [
      {
        id: 'generate-expiring.effect',
        type: 'resource-change',
        resourceId: 'charge',
        operation: 'add',
        amount: 1
      }
    ]);
    generate.targeting.type = 'self';
    generate.trigger = { type: 'interval', intervalSeconds: 100 };
    generate.timing.cooldownSeconds = 100;
    const consume = directAction('consume-expiring', [damageEffect('consume-expiring.damage')]);
    consume.unlockedByDefault = false;
    consume.trigger = { type: 'manual' };
    consume.resourceCosts = [{ resourceId: 'charge', amountPerCycle: 1 }];
    const charge: Resource = {
      id: 'charge',
      name: 'Charge',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 0,
      cap: 1,
      generation: [],
      spend: [{ event: 'action', referenceId: consume.id, amount: 1 }],
      recovery: { type: 'none' },
      persistence: 'encounter',
      expirySeconds: 1
    };
    const input = build([generate, consume], {
      resources: [charge],
      abilities: [
        {
          id: 'consume-ability',
          name: 'Consume ability',
          summary: 'Attempts to spend the expiring charge at its expiry time.',
          unlockedByDefault: true,
          type: 'automatic',
          actionId: consume.id,
          cooldownSeconds: 10,
          initialCooldownSeconds: 1,
          maximumCharges: 1,
          rechargeSeconds: 10,
          playerComplexity: 0,
          resourceId: charge.id
        }
      ]
    });

    expect(validateUnitBuild(input)).toMatchObject({ valid: true, issues: [] });
    const report = simulateBuild(input, scenario(1.01));

    expect(report.resourcesGenerated.charge).toBe(1);
    expect(report.resourcesSpent.charge).toBe(0);
    expect(report.hits).toBe(0);
    expect(report.abilityContributionHitPoints).toBe(0);
  });

  it('applies status phases before same-hit damage while preserving declared phase order', () => {
    const vulnerability: Status = {
      id: 'same-hit-vulnerability',
      name: 'Same-hit vulnerability',
      kind: 'vulnerability',
      magnitude: 0.5,
      maximumStacks: 3,
      refresh: 'replace',
      removal: 'expiry'
    };
    const action = directAction('phased-hit', [
      damageEffect('a-damage'),
      {
        id: 'z-stack-status',
        type: 'status',
        statusId: vulnerability.id,
        durationSeconds: 1,
        stacks: 2,
        stacking: 'stack'
      },
      {
        id: 'a-replace-status',
        type: 'status',
        statusId: vulnerability.id,
        durationSeconds: 1,
        stacks: 1,
        stacking: 'replace'
      }
    ]);

    const report = simulateBuild(build([action], { statuses: [vulnerability] }), scenario(0.01));

    expect(report.damageHitPoints).toBe(15);
  });

  it('treats inherited resistance keys as absent', () => {
    const action = directAction('prototype-resistance', [
      {
        id: 'prototype-resistance.damage',
        type: 'damage',
        amountHitPoints: 10,
        damageType: 'toString'
      }
    ]);

    const report = simulateBuild(build([action]), scenario(0.01));

    expect(report.damageHitPoints).toBe(10);
    expect(Number.isFinite(report.damageHitPoints)).toBe(true);
    expect(report.warnings.some((warning) => warning.includes('capped'))).toBe(false);
  });

  it('does not record a kill while tiny positive health remains', () => {
    const target = scenario(0.01);
    target.enemies[0]!.healthHitPoints = 10 + 9e-11;

    const report = simulateBuild(
      build([directAction('exact-kill', [damageEffect('exact-kill.damage', 10)])]),
      target
    );

    expect(report.damageHitPoints).toBe(10);
    expect(report.kills).toBe(0);
  });

  it('clamps finite arithmetic overflow before producing the report', () => {
    const action = directAction('huge-economy', [
      {
        id: 'huge-income',
        type: 'economy-change',
        amountCredits: 1e308,
        recipient: 'owner'
      }
    ]);
    action.targeting.type = 'self';

    const report = simulateBuild(build([action]), scenario(3));

    expect(Number.isFinite(report.economyGeneratedCredits)).toBe(true);
    expect(report.warnings).toContain(
      'Economy contribution exceeded the finite report range; capped.'
    );
  });
});
