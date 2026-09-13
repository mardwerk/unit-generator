import { describe, expect, it } from 'vitest';
import {
  createBtd6Fixture,
  createBtd6FixtureV2,
  compileBtd6Build,
  compileBtd6BuildV2,
  probeBtd6BuildV2
} from '@mardwerk/unit-definitions/btd6-derived';
import { createMangaFixture } from '@mardwerk/unit-definitions/manga-mayhem';
import {
  qualifyUnit,
  qualifyBtd6BuildV2,
  checkBtd6Capabilities,
  checkBtd6MechanicsV2
} from '../src/qualification.js';

describe('ability availability in bounded qualification', () => {
  const delayedBuild = (initialCooldownSeconds: number) => {
    const build = compileBtd6BuildV2(createBtd6FixtureV2(), [0, 0, 0]);
    build.model.attacks[0]!.intervalSeconds = 100;
    build.model.abilities = [
      {
        id: 'delayed',
        name: 'Delayed strike',
        cooldownSeconds: 10,
        initialCooldownSeconds,
        effect: { kind: 'attack', attacks: [structuredClone(build.model.attacks[0]!)] }
      }
    ];
    return build;
  };

  it.each([0, 5])('probes an ability after its %i-second initial cooldown', (initialCooldown) => {
    const build = delayedBuild(initialCooldown);
    const report = qualifyBtd6BuildV2(build);
    expect(report.readiness).toBe('review-required');
    expect(report.findings.some((finding) => finding.code.startsWith('ABILITY_ACTIVATION_'))).toBe(
      false
    );
    const executed = probeBtd6BuildV2(build, {
      durationSeconds: initialCooldown + 1,
      targets: [
        {
          id: 'target',
          x: 1,
          y: 0,
          health: 1000,
          progress: 1,
          strength: 1,
          tags: [],
          concealed: false
        }
      ],
      activations: [{ at: initialCooldown, abilityId: 'delayed' }]
    });
    expect(executed.events).toContainEqual({
      at: initialCooldown,
      kind: 'activate',
      id: 'delayed'
    });
  });

  it.each([600, 601])(
    'leaves activation outside the probe horizon unassessed: %i seconds',
    (initialCooldown) => {
      const report = qualifyBtd6BuildV2(delayedBuild(initialCooldown));
      expect(report.readiness).toBe('review-required');
      expect(
        report.findings.some((finding) => finding.code === 'ABILITY_ACTIVATION_UNASSESSED')
      ).toBe(true);
      expect(report.coverage.unassessed.some((gap) => gap.includes('initial cooldown'))).toBe(true);
      expect(report.findings.some((finding) => finding.code === 'ABILITY_ACTIVATION_FAILED')).toBe(
        false
      );
    }
  );

  it.each(['maxActivationsPerRound', 'maxActivationsPerGame'] as const)(
    'does not call an ability available when %s is zero',
    (limit) => {
      const build = delayedBuild(0);
      build.model.abilities[0]![limit] = 0;
      const report = qualifyBtd6BuildV2(build);
      expect(report.readiness).toBe('review-required');
      expect(report.coverage.unassessed.some((gap) => gap.includes('allowance is zero'))).toBe(
        true
      );
    }
  );

  it('records an unmet target requirement without declaring the ability broken', () => {
    const build = delayedBuild(0);
    const ability = build.model.abilities[0]!;
    if (ability.effect.kind !== 'attack') throw Error('Expected authored attack ability');
    ability.effect.cancelIfNoTargets = true;
    ability.effect.attacks[0]!.reach = { kind: 'radius', radius: 0, throughWalls: false };
    const report = qualifyBtd6BuildV2(build);
    expect(report.readiness).toBe('review-required');
    expect(report.coverage.unassessed.some((gap) => gap.includes('no-targets'))).toBe(true);
    expect(report.findings.some((finding) => finding.code === 'ABILITY_ACTIVATION_FAILED')).toBe(
      false
    );
  });

  it('measures transformation expiry from its delayed activation', () => {
    const build = delayedBuild(5);
    build.model.abilities = [
      {
        id: 'delayed-form',
        name: 'Delayed form',
        initialCooldownSeconds: 5,
        cooldownSeconds: 1000,
        durationSeconds: 598,
        effect: { kind: 'transform', attacks: [structuredClone(build.model.attacks[0]!)] }
      }
    ];
    const report = qualifyBtd6BuildV2(build);
    expect(report.readiness).toBe('review-required');
    expect(report.coverage.unassessed).toContain(
      'Ability delayed-form expiry exceeds the probe limit.'
    );
    const ability = build.model.abilities[0]!;
    if ('durationSeconds' in ability) ability.durationSeconds = 2;
    const short = qualifyBtd6BuildV2(build);
    expect(short.coverage.unassessed.some((gap) => gap.includes('expiry'))).toBe(false);
  });

  it('still blocks a failed ability whose operation cannot execute under its account policy', () => {
    const build = delayedBuild(0);
    build.model.accounts = [
      {
        id: 'bank',
        qualification: { kind: 'provided-policy', reference: 'Authored no-loan policy.' },
        capacity: 100,
        interestRate: 0,
        interestOrder: 'before-income',
        roundDeposit: 0,
        withdrawalPolicy: { mode: 'partial', atCapacity: 'retain' }
      }
    ];
    build.model.abilities = [
      {
        id: 'borrow',
        name: 'Unsupported loan',
        cooldownSeconds: 10,
        effect: { kind: 'account', operation: { kind: 'borrow', accountId: 'bank', amount: 10 } }
      }
    ];
    const report = qualifyBtd6BuildV2(build);
    expect(report.readiness).toBe('blocked');
    expect(report.findings.some((finding) => finding.code === 'ABILITY_ACTIVATION_FAILED')).toBe(
      true
    );
  });
});

describe('production qualification', () => {
  it('supplies explicit ordinary target facts to tag-dependent projectile and range probes', () => {
    const unit = createBtd6FixtureV2();
    unit.base!.attacks[0]!.projectile!.damageModifiers = [
      {
        id: 'armored-bonus',
        stat: 'attack.damage',
        operation: 'add',
        value: 2,
        group: 'armored-bonus',
        stacking: 'unique',
        maxStacks: 1,
        radius: null,
        includesOwner: true,
        includesSubordinates: true,
        recipientFilter: { kind: 'membership', field: 'tags', mode: 'all', values: ['armored'] }
      }
    ];
    const result = qualifyUnit({ definitionId: 'tower-defense', candidate: unit });
    expect(result.findings.filter((f) => f.code === 'PROBE_EXECUTION_FAILED')).toEqual([]);
    expect(result.coverage.evaluatedBuilds).toBe(64);
    expect(result.coverage.purchaseEdges).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.code === 'RANGE_BOUNDARY_OBSERVATION')).toBe(true);
  }, 30000);

  it('observes explicit status tags and warns when flat bonuses damage a zero-base Technique', () => {
    const unit = createMangaFixture();
    const technique = unit.forms[1]!.techniques[0]!;
    technique.damage = 0;
    technique.onHit = [
      {
        id: 'sleep',
        kind: 'stun',
        durationSeconds: 2,
        immuneTo: [],
        requiresTags: ['sleep-eligible', 'weak-willed', 'stunnable'],
        requiresDamage: false,
        speedMultiplier: 0,
        combine: 'strongest',
        stacking: { scope: 'target', reapply: 'refresh', maxStacks: 1 }
      }
    ];
    const result = qualifyUnit({ definitionId: 'manga-mayhem', candidate: unit });
    const observed = result.findings.find(
      (finding) => finding.code === 'CONDITIONAL_STATUS_OBSERVATION'
    );
    expect(observed?.evidence?.untaggedApplications).toEqual([]);
    expect(observed?.evidence?.missingRequiredFactApplications).toEqual([]);
    expect(observed?.evidence?.taggedApplications).toContain('sleep');
    expect(
      result.findings.some(
        (finding) =>
          finding.code === 'ZERO_BASE_DAMAGE_RECEIVES_FLAT_BONUS' && finding.severity === 'warning'
      )
    ).toBe(true);
    expect(result.readiness).toBe('review-required');
  }, 30000);
  it('reports contact-trigger tradeoffs without rejecting useful numeric adaptations', () => {
    const unit = createMangaFixture();
    unit.paths[0]!.upgrades[1]!.modifiers.pulse = {
      cycles: 3,
      radius: 10,
      cap: 3,
      stun: 0.4,
      interval: 1
    };
    unit.paths[0]!.upgrades[2]!.modifiers.pulse = {
      cycles: 4,
      radius: 15,
      cap: 3,
      stun: 0.4,
      interval: 1
    };
    unit.paths[2]!.upgrades[2]!.modifiers.emission = {
      cycles: 3,
      damage: 30,
      width: 3,
      length: 8,
      cap: 3
    };
    unit.paths[2]!.upgrades[3]!.modifiers.emission = {
      ...unit.paths[2]!.upgrades[2]!.modifiers.emission!,
      cycles: 4,
      damage: 60
    };
    const result = qualifyUnit({ definitionId: 'manga-mayhem', candidate: unit });
    const warnings = result.findings.filter(
      (finding) => finding.code === 'CONTACT_TRIGGER_REQUIREMENT_INCREASED'
    );
    expect(warnings.map((finding) => finding.location).sort()).toEqual([
      '/paths/0/upgrades/2',
      '/paths/2/upgrades/3'
    ]);
    expect(warnings.every((finding) => finding.severity === 'warning')).toBe(true);
    expect(
      result.findings.some((finding) => finding.code === 'CONTACT_TRIGGER_EXECUTION_SEMANTICS')
    ).toBe(true);
    expect(result.readiness).toBe('review-required');
  }, 30000);
  it.each(['projectile', 'multi-hit'])(
    'blocks unsupported %s sweeps before running probes',
    (kind) => {
      const unit = createMangaFixture();
      const technique = unit.forms.flatMap((form) => form.techniques)[0]!;
      technique.shape = { kind: 'sweep', width: 3, cap: 3 };
      if (kind === 'projectile')
        Object.assign(technique, {
          delivery: 'projectile',
          projectileSpeed: 10,
          projectileRadius: 1
        });
      else Object.assign(technique, { hits: 2, hitSpan: 0.1 });
      const result = qualifyUnit({ definitionId: 'manga-mayhem', candidate: unit });
      expect(result.readiness).toBe('blocked');
      expect(result.coverage.probes).toBe(0);
      expect(result.findings.some((finding) => finding.code === 'MANGA_CONTRACT')).toBe(true);
    }
  );
  it('qualifies the production tower-defense definition with the shared contract', () => {
    const result = qualifyUnit({ definitionId: 'tower-defense', candidate: createBtd6FixtureV2() });
    expect(result.definitionId).toBe('tower-defense');
    expect(result.coverage.evaluatedBuilds).toBe(64);
    expect(result.coverage.probes).toBeGreaterThan(0);
    expect(result.findings.filter((finding) => finding.dimension === 'validity')).toEqual([]);
    for (const candidate of [{}, createBtd6Fixture()]) {
      const invalid = qualifyUnit({ definitionId: 'tower-defense', candidate });
      expect(invalid.readiness).toBe('blocked');
      expect(invalid.coverage.probes).toBe(0);
      expect(invalid.findings.some((finding) => finding.dimension === 'validity')).toBe(true);
    }
  }, 30000);
  it.each(['btd6-derived', 'tower-defense'])(
    'warns about unchanged existing reach when %s adds a useful attack',
    (definitionId) => {
      const unit = definitionId === 'tower-defense' ? createBtd6FixtureV2() : createBtd6Fixture();
      unit.paths[0]!.upgrades[0]!.operations = [
        { kind: 'display-range', operator: 'add', value: 10 },
        { kind: 'replace-attack', attack: { ...unit.base!.attacks[0]!, id: 'added-attack' } }
      ];
      const result = qualifyUnit({ definitionId, candidate: unit });
      const purchase = result.findings.filter(
        (finding) => finding.location === '/paths/0/upgrades/0'
      );
      expect(
        purchase.some((finding) => finding.code === 'DISPLAY_RANGE_WITHOUT_ATTACK_REACH')
      ).toBe(true);
      expect(purchase.some((finding) => finding.code === 'PURCHASE_NO_EXECUTABLE_CHANGE')).toBe(
        false
      );
    },
    30000
  );
  it('reports missing captured endpoints while exercising available shared-engine models', () => {
    const original = createBtd6Fixture();
    const model = { ...original.base, actors: [], passiveSummons: [], income: [], support: [] };
    const unit = {
      ...original,
      schemaVersion: 'btd6-derived/0.2',
      resolution: 'captured-endpoints',
      base: model,
      endpoints: [
        { tiers: [0, 0, 0], model },
        { tiers: [1, 0, 0], model: null, unsupported: ['Missing captured behavior translation.'] }
      ]
    };
    const result = qualifyUnit({ definitionId: 'btd6-derived', candidate: unit });
    expect(result.readiness).toBe('blocked');
    expect(result.coverage.evaluatedBuilds).toBe(1);
    expect(result.findings.some((f) => f.code === 'unresolved-model')).toBe(true);
  });
  it('does not reward actor declarations that no summon can execute', () => {
    const original = createBtd6Fixture();
    const unit = {
      ...original,
      schemaVersion: 'btd6-derived/0.2',
      base: { ...original.base, actors: [], passiveSummons: [], income: [], support: [] }
    };
    const candidate: unknown = {
      ...unit,
      paths: unit.paths.map((path, i) =>
        i
          ? path
          : {
              ...path,
              upgrades: path.upgrades.map((upgrade, tier) =>
                tier
                  ? upgrade
                  : {
                      ...upgrade,
                      operations: [
                        {
                          kind: 'grant-actor',
                          actor: { id: 'unused', attacks: [original.base.attacks[0]] }
                        }
                      ]
                    }
              )
            }
      )
    };
    const result = qualifyUnit({ definitionId: 'btd6-derived', candidate });
    expect(result.findings.some((f) => f.code === 'PURCHASE_NO_EXECUTABLE_CHANGE')).toBe(true);
  }, 30000);
  it('rejects vacuous, unknown and conflicting intended-job expectations', () => {
    const build = compileBtd6Build(createBtd6Fixture(), [0, 0, 0]);
    expect(() => checkBtd6Capabilities(build, [])).toThrow();
    for (const expected of [
      {},
      { minimumDamage: undefined },
      { unknownBound: 1 },
      { minimumDamage: 10, maximumDamage: 1 }
    ])
      expect(() =>
        checkBtd6Capabilities(build, [
          {
            id: 'invalid-bound',
            intendedJob: 'No false pass',
            evidence: 'Independent example',
            scenario: { durationSeconds: 1, targets: [] },
            expected
          }
        ])
      ).toThrow();
  });
  it('checks income as its own intended job through the shared runtime', () => {
    const original = compileBtd6Build(createBtd6Fixture(), [0, 0, 0]);
    const build = {
      ...original,
      schemaVersion: 'btd6-derived.build/0.2' as const,
      model: {
        ...original.model,
        actors: [],
        passiveSummons: [],
        support: [],
        income: [
          {
            id: 'income',
            amount: 10,
            emissionsPerRound: 2,
            intervalSeconds: 1,
            pickupLifetimeSeconds: 5,
            autoCollect: true
          }
        ]
      }
    };
    const cases = [
      {
        id: 'income',
        intendedJob: 'Produce and collect two 10-cash emissions',
        evidence:
          'Analytic source-independent fixture: full cycles at t1 and t2, auto-collection enabled.',
        scenario: { durationSeconds: 2.1, targets: [], roundStarts: [0] },
        expected: { produced: { minimum: 20, maximum: 20 }, cash: { minimum: 20, maximum: 20 } }
      }
    ];
    expect(checkBtd6MechanicsV2(build, cases).readiness).toBe('review-required');
    build.model.income[0]!.amount = 0;
    expect(checkBtd6MechanicsV2(build, cases).readiness).toBe('blocked');
  });
  it('blocks an invalid candidate without awarding a quality score', () => {
    const result = qualifyUnit({ definitionId: 'btd6-derived', candidate: {} });
    expect(result.readiness).toBe('blocked');
    expect(result.coverage.probes).toBe(0);
    expect(result).not.toHaveProperty('score');
  });
  it('does not demand outside canon for an original concept or waive its mechanical checks', () => {
    const result = qualifyUnit({
      definitionId: 'btd6-derived',
      candidate: {},
      research: [
        {
          schemaVersion: '0.2',
          subject: 'Original sentry',
          status: 'success',
          sources: [],
          reused: false,
          grounding: 'original-concept',
          gaps: []
        }
      ]
    });
    expect(result.readiness).toBe('blocked');
    expect(result.findings.some((finding) => finding.code === 'SOURCE_FIDELITY_UNASSESSED')).toBe(
      false
    );
    expect(
      result.findings.some((finding) => finding.code === 'SOURCE_FIDELITY_NOT_APPLICABLE')
    ).toBe(true);
  });
  it('checks every legal purchase edge and catches purchases masked by final replacements', () => {
    const unit = createBtd6Fixture();
    unit.paths[2]!.upgrades[4]!.operations = [
      { kind: 'replace-attack', attack: { ...unit.base.attacks[0]!, damage: 100 } }
    ];
    const result = qualifyUnit({ definitionId: 'btd6-derived', candidate: unit });
    expect(result.coverage.evaluatedBuilds).toBe(64);
    expect(result.coverage.purchaseEdges).toBeGreaterThan(100);
    expect(result.findings.some((f) => f.code === 'PURCHASE_NO_EXECUTABLE_CHANGE')).toBe(true);
    expect(result.readiness).toBe('blocked');
  });
  it('blocks display-only purchases even when their cost changes', () => {
    const unit = createBtd6Fixture();
    unit.paths[0]!.upgrades[0]!.operations = [
      { kind: 'display-range', operator: 'add', value: 10 }
    ];
    expect(qualifyUnit({ definitionId: 'btd6-derived', candidate: unit }).readiness).toBe(
      'blocked'
    );
  });
  it('does not treat the unused radius of a global attack as a purchase benefit', () => {
    const unit = createBtd6Fixture();
    unit.base.attacks[0]!.reach.kind = 'global';
    unit.paths[0]!.upgrades[0]!.operations = [
      {
        kind: 'attack-stat',
        attackId: unit.base.attacks[0]!.id,
        stat: 'radius',
        operator: 'add',
        value: 10
      }
    ];
    const result = qualifyUnit({ definitionId: 'btd6-derived', candidate: unit });
    expect(result.findings.some((f) => f.code === 'PURCHASE_NO_EXECUTABLE_CHANGE')).toBe(true);
  });
  it('reports unused instant pierce without treating a harmless source field as invalid', () => {
    const unit = createBtd6Fixture();
    unit.base.attacks[0]!.delivery = 'instant';
    unit.base.attacks[0]!.pierce = 40;
    const result = qualifyUnit({ definitionId: 'btd6-derived', candidate: unit });
    expect(result.findings.some((f) => f.code === 'INSTANT_PIERCE_UNUSED')).toBe(true);
  }, 60000);
  it('blocks a promised crowd stun when instantaneous selection reaches only one target', () => {
    const build = compileBtd6Build(createBtd6Fixture(), [0, 0, 0]);
    Object.assign(build.model.attacks[0]!, {
      delivery: 'contact',
      pierce: 40,
      onHit: [{ kind: 'stun', durationSeconds: 3, speedMultiplier: 0, immuneTo: [] }]
    });
    const cases = [
      {
        id: 'crowd-stun',
        intendedJob: 'Stun forty eligible targets',
        evidence:
          'Independent design requirement: one cast stuns forty eligible targets for three seconds.',
        scenario: {
          durationSeconds: 3,
          targets: Array.from({ length: 40 }, (_, i) => ({
            id: `t${i}`,
            distance: 20,
            progress: i,
            strength: 1
          }))
        },
        expected: { minimumControlledTargets: 40, minimumMovementPreventedSeconds: 120 }
      }
    ];
    expect(checkBtd6Capabilities(build, cases).readiness).toBe('review-required');
    build.model.attacks[0]!.delivery = 'instant';
    expect(checkBtd6Capabilities(build, cases).readiness).toBe('blocked');
  });
  it('places low-reach Manga probes inside contact reach and preserves label invariance', () => {
    const unit = createMangaFixture();
    for (const form of unit.forms) form.primary.reach = 0.5;
    const original = qualifyUnit({ definitionId: 'manga-mayhem', candidate: unit });
    unit.name = 'Different label';
    unit.forms[0]!.primary.name = 'Also renamed';
    const renamed = qualifyUnit({ definitionId: 'manga-mayhem', candidate: unit });
    expect(renamed).toEqual(original);
    expect(original.coverage.evaluatedBuilds).toBe(64);
    const observation = original.findings.find((f) => f.code === 'AUTOMATIC_CONTACT_OBSERVATION');
    expect(observation?.evidence?.distance).toBe(0.25);
    expect(observation?.evidence?.damage).toBeGreaterThan(0);
    expect(original.findings.some((f) => f.code === 'SOURCE_FIDELITY_UNASSESSED')).toBe(true);
  }, 60000);
  it('checks an independent intended-job bound and detects loss of damage', () => {
    const build = compileBtd6Build(createBtd6Fixture(), [0, 0, 0]);
    const cases = [
      {
        id: 'single',
        intendedJob: 'Two 2-damage contacts in [0,2)',
        evidence:
          'Fixture has damage2 and one-second cadence. Analytic expectation includes t0 and t1.',
        scenario: {
          durationSeconds: 2,
          targets: [{ id: 'target', distance: 20, progress: 1, strength: 1 }]
        },
        expected: { minimumDamage: 4, maximumDamage: 4, minimumContactedTargets: 1 }
      }
    ];
    expect(checkBtd6Capabilities(build, cases).readiness).toBe('review-required');
    build.model.attacks[0]!.damage = 0;
    const broken = checkBtd6Capabilities(build, cases);
    expect(broken.readiness).toBe('blocked');
    expect(broken.findings[0]!.code).toBe('INTENDED_JOB_FAILED');
  });
});
