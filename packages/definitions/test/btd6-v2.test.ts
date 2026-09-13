import { describe, expect, it } from 'vitest';
import {
  createBtd6EncounterV2,
  compileBtd6BuildV2,
  prepareBtd6CompilerV2,
  createBtd6FixtureV2,
  probeBtd6BuildV2,
  validateBtd6UnitV2,
  validateBtd6ModelV2,
  enumerateBtd6Builds,
  inspectBtd6PurchaseEdges,
  createBtd6Fixture
} from '../src/btd6-derived/index.js';
import { createMechanicsScheduler, eventPriority } from '../src/mechanics/scheduler.js';
import { createModelRuntime } from '../src/mechanics/model.js';
import { supportedRange } from '../src/mechanics/support.js';
import type { Btd6ModelV2, Btd6BuildV2 } from '../src/btd6-derived/v2-schema.js';
const target = (id = 'target', x = 10, y = 0) => ({
  id,
  x,
  y,
  health: 100,
  progress: x,
  strength: 1
});
const model = () => {
  const m = createBtd6FixtureV2().base!;
  for (const a of m.attacks) {
    delete a.projectile;
    a.delivery = 'contact';
  }
  return m;
};
const build = (model: Btd6ModelV2): Btd6BuildV2 => ({
  schemaVersion: 'btd6-derived.build/0.2',
  unitId: 'sentry',
  tiers: [0, 0, 0],
  cost: 0,
  model,
  adaptations: [],
  unsupported: []
});
describe('generalized BTD6 adapter', () => {
  it('compiles all legal selections and does not alias exact endpoint snapshots', () => {
    const unit = createBtd6FixtureV2();
    expect(validateBtd6UnitV2(unit)).toEqual([]);
    const compile = prepareBtd6CompilerV2(unit);
    for (const tiers of enumerateBtd6Builds()) expect(compile(tiers).tiers).toEqual(tiers);
    const snapshot = structuredClone(unit.base!);
    snapshot.attacks[0]!.damage = 50;
    snapshot.attacks[0]!.projectile!.damage = 50;
    unit.endpoints = [{ tiers: [5, 2, 0], model: snapshot }];
    const selected = compileBtd6BuildV2(unit, [5, 2, 0]);
    selected.model.attacks[0]!.damage = 0;
    expect(compileBtd6BuildV2(unit, [5, 2, 0]).model.attacks[0]!.damage).toBe(50);
    expect(compileBtd6BuildV2(unit, [5, 1, 0]).model.attacks[0]!.damage).toBe(17);
  });
  it('stores all captured endpoints explicitly while unresolved endpoints cannot qualify or execute', () => {
    const unit = createBtd6FixtureV2();
    unit.resolution = 'captured-endpoints';
    unit.endpoints = enumerateBtd6Builds().map((tiers) => ({
      tiers,
      model: tiers.every((n) => n === 0) ? unit.base : null,
      ...(tiers.some((n) => n > 0) ? { unsupported: ['source behavior not mapped'] } : {})
    }));
    expect(validateBtd6UnitV2(unit).every((e) => e.code === 'unresolved-model')).toBe(true);
    expect(validateBtd6UnitV2(unit, { allowUnresolved: true })).toEqual([]);
    expect(compileBtd6BuildV2(unit, [0, 0, 0]).model).toEqual(unit.base);
    expect(() => compileBtd6BuildV2(unit, [1, 0, 0])).toThrow('Unresolved captured endpoint');
    unit.endpoints[63]!.model = { ...model(), targeting: { modes: ['first'], default: 'strong' } };
    expect(() => compileBtd6BuildV2(unit, [0, 0, 0])).toThrow('Default targeting');
  });
  it('reports masked purchase edges and ignores display-only changes and JSON key order', () => {
    const unit = createBtd6Fixture();
    unit.paths[0]!.upgrades[0]!.operations = [
      { kind: 'display-range', operator: 'add', value: 20 }
    ];
    const edges = inspectBtd6PurchaseEdges(unit);
    expect(
      edges
        .filter((e) => e.upgradeId === unit.paths[0]!.upgrades[0]!.id)
        .every((e) => !e.modelChanged && e.displayChanged)
    ).toBe(true);
    expect(edges.length).toBeGreaterThan(64);
  });
  it('executes child explosion contacts around impact beyond acquisition range, with separate immunity', () => {
    const m = model(),
      a = m.attacks[0]!;
    Object.assign(a, {
      delivery: 'projectile',
      damage: 0,
      pierce: 1,
      intervalSeconds: 10,
      reach: { kind: 'radius', radius: 10, throughWalls: false },
      projectile: {
        id: 'shell',
        damage: 0,
        detectConcealed: false,
        immuneTo: [],
        radius: 0,
        pierce: 1,
        flight: { kind: 'straight', speed: 10, lifetimeSeconds: 2 },
        children: [
          {
            trigger: 'contact',
            count: 1,
            atTarget: true,
            inheritHitTargets: false,
            projectile: {
              id: 'blast',
              damage: 3,
              detectConcealed: false,
              immuneTo: ['black'],
              radius: 5,
              pierce: 3,
              throughWalls: true,
              flight: { kind: 'stationary', lifetimeSeconds: 0.1 }
            }
          }
        ]
      }
    });
    const result = probeBtd6BuildV2(build(m), {
      durationSeconds: 1.2,
      targets: [
        target('aim', 10),
        target('splash', 14),
        { ...target('immune', 12), tags: ['black'] },
        target('outside', 16)
      ]
    });
    expect(result.targets.map((t) => [t.id, t.health])).toEqual([
      ['aim', 97],
      ['splash', 97],
      ['immune', 100],
      ['outside', 100]
    ]);
    expect(result.damage).toBe(6);
    const mutations = structuredClone(m);
    mutations.attacks[0]!.projectile!.children![0]!.projectile.radius = 2;
    expect(
      probeBtd6BuildV2(build(mutations), {
        durationSeconds: 1.2,
        targets: [target('aim', 10), target('splash', 14)]
      }).damage
    ).toBe(3);
  });
  it('propagates root attack upgrade arithmetic to the projectile graph', () => {
    const unit = createBtd6FixtureV2(),
      a = unit.base!.attacks[0]!;
    a.projectile = {
      id: 'bolt-flight',
      damage: 2,
      detectConcealed: false,
      radius: 0,
      pierce: 1,
      flight: { kind: 'straight', speed: 10, lifetimeSeconds: 5 }
    };
    const resolved = compileBtd6BuildV2(unit, [2, 0, 0]);
    expect(resolved.model.attacks[0]!.projectile!.damage).toBe(5);
    a.projectile.damage = 4;
    expect(validateBtd6ModelV2(unit.base).some((e) => e.code === 'projectile-policy')).toBe(true);
  });
  it('uses round-capped pickups, explicit collection and expiry instead of time-based income', () => {
    const m = model();
    m.attacks = [];
    m.income = [
      {
        id: 'fruit',
        amount: 20,
        emissionsPerRound: 4,
        intervalSeconds: 0.05,
        pickupLifetimeSeconds: 1,
        autoCollect: false
      }
    ];
    const result = probeBtd6BuildV2(build(m), {
      durationSeconds: 3,
      targets: [],
      roundStarts: [0, 2],
      collections: [{ at: 0.3 }]
    });
    expect(result.events.filter((e) => e.kind === 'produce')).toHaveLength(8);
    expect(result.cash).toBe(80);
    expect(result.pickups).toHaveLength(4);
    expect(probeBtd6BuildV2(build(m), { durationSeconds: 3, targets: [] }).cash).toBe(0);
    expect(result.events.filter((e) => e.kind === 'pickup-expire')).toHaveLength(0);
  });
  it('extends an ally attack range using the shared unique support policy', () => {
    const support = model();
    support.attacks = [];
    support.support = [
      {
        id: 'aura',
        radius: 40,
        global: false,
        includesOwner: false,
        stackGroup: 'range',
        rangeMultiplier: 0.1,
        rangeAdditive: 0
      }
    ];
    const result = probeBtd6BuildV2(build(support), {
      durationSeconds: 0.1,
      targets: [target('edge', 44)],
      allies: [{ id: 'ally', x: 0, y: 0, model: model() }]
    });
    expect(result.damage).toBe(2);
    expect(result.supportedRanges[1]!.attacks[0]!.radius).toBe(44);
    expect(
      probeBtd6BuildV2(build(support), {
        durationSeconds: 0.1,
        targets: [target('outside', 45)],
        allies: [{ id: 'ally', x: 0, y: 0, model: model() }]
      }).damage
    ).toBe(0);
    expect(() =>
      supportedRange(40, { id: 'ally', x: 0, y: 0 }, [
        { id: 'a', x: 0, y: 0, support: support.support },
        { id: 'b', x: 0, y: 0, support: [{ ...support.support[0]!, rangeMultiplier: 0.2 }] }
      ])
    ).toThrow('Conflicting unique');
  });
  it('keeps permanent actors alive during a timed summon and resumes the parent after expiration', () => {
    const m = model();
    m.actors = [
      { id: 'permanent', attacks: [{ ...m.attacks[0]!, id: 'p', damage: 1, intervalSeconds: 1 }] },
      { id: 'temporary', attacks: [{ ...m.attacks[0]!, id: 't', damage: 5, intervalSeconds: 0.5 }] }
    ];
    m.passiveSummons = [
      { id: 'pet', actorId: 'permanent', startDelaySeconds: 0, lifetimeSeconds: 0 }
    ];
    m.abilities = [
      {
        id: 'summon',
        name: 'Summon',
        cooldownSeconds: 5,
        durationSeconds: 2,
        effect: { kind: 'summon', actorId: 'temporary', suppressParentAttacks: true }
      }
    ];
    const result = probeBtd6BuildV2(build(m), {
      durationSeconds: 4.1,
      targets: [target()],
      activations: [
        { at: 1, abilityId: 'summon' },
        { at: 2, abilityId: 'summon' }
      ]
    });
    expect(
      result.events
        .filter((e) => e.kind === 'emission' && e.id.endsWith('/sentry/bolt'))
        .map((e) => e.at)
    ).toEqual([0, 4]);
    expect(
      result.events
        .filter((e) => e.kind === 'emission' && e.id.endsWith('/sentry/permanent/p'))
        .map((e) => e.at)
    ).toEqual([1, 2, 3, 4]);
    expect(
      result.events
        .filter((e) => e.kind === 'emission' && e.id.endsWith('/sentry/temporary/t'))
        .map((e) => e.at)
    ).toEqual([1.5, 2, 2.5]);
    expect(result.actors.map((a) => a.templateId)).toEqual(['permanent']);
    expect(result.events.find((e) => e.kind === 'rejected')?.reason).toBe('cooldown');
  });
  it('uses the shared status ledger for control independently from damage immunity', () => {
    const m = model();
    m.attacks[0]!.intervalSeconds = 10;
    m.attacks[0]!.onHit = [
      { kind: 'slow', durationSeconds: 2, speedMultiplier: 0.5, immuneTo: ['boss'] }
    ];
    const result = probeBtd6BuildV2(build(m), {
      durationSeconds: 3,
      targets: [{ ...target(), tags: ['lead'] }]
    });
    expect(result.damage).toBe(0);
    expect(result.control.target).toEqual({ controlledSeconds: 2, movementPreventedSeconds: 1 });
  });
});
describe('shared mechanical clock and actor scheduling', () => {
  it('expires before simultaneous emissions and exposes the next live event', () => {
    const clock = createMechanicsScheduler();
    const order: string[] = [];
    clock.schedule(1, eventPriority.emission, () => order.push('attack'));
    clock.schedule(1, eventPriority.expire, () => order.push('expire'));
    const cancel = clock.schedule(0.5, eventPriority.impact, () => order.push('cancelled'));
    cancel();
    expect(clock.nextTime).toBe(1);
    clock.advance(1);
    expect(order).toEqual([]);
    clock.advance(1, true);
    expect(order).toEqual(['expire', 'attack']);
  });
  it('rejects a second model start and removes all child attacks at exact expiration', () => {
    const clock = createMechanicsScheduler();
    const emitted: number[] = [];
    const attack = {
      id: 'attack',
      damage: 1,
      range: 10,
      shape: { kind: 'single' as const },
      delivery: 'direct-contact' as const,
      detectConcealed: false,
      intervalSeconds: 1,
      projectiles: 1
    };
    const runtime = createModelRuntime(
      clock,
      {
        attacks: [],
        actors: [{ id: 'child', attacks: [attack] }],
        passiveSummons: [
          { id: 'spawn', actorId: 'child', startDelaySeconds: 0, lifetimeSeconds: 2 }
        ],
        income: [],
        rangeSupport: []
      },
      {
        id: 'root',
        origin: { x: 0, y: 0 },
        onAttack: () => emitted.push(clock.now),
        onEvent: () => {}
      }
    );
    runtime.start();
    expect(() => runtime.start()).toThrow('already started');
    clock.advance(3);
    expect(emitted).toEqual([1]);
  });
});

describe('account operations in the encounter', () => {
  const bank = () => ({
    id: 'bank',
    qualification: { kind: 'provided-policy' as const, reference: 'test policy' },
    capacity: 1000,
    interestRate: 0.1,
    interestOrder: 'after-income' as const,
    roundDeposit: 10,
    withdrawalPolicy: { mode: 'partial' as const, atCapacity: 'retain' as const },
    loan: { limit: 100, repaymentFraction: 0.5 }
  });
  it('uses one wallet for ally pickups, interest, loan repayment and account abilities', () => {
    const m = model();
    m.attacks = [];
    m.accounts = [bank()];
    m.abilities = [
      {
        id: 'loan',
        name: 'Loan',
        cooldownSeconds: 10,
        effect: { kind: 'account', operation: { kind: 'borrow', accountId: 'bank', amount: 40 } }
      }
    ];
    const ally = model();
    ally.attacks = [];
    ally.income = [
      {
        id: 'fruit',
        amount: 20,
        emissionsPerRound: 1,
        intervalSeconds: 0.1,
        pickupLifetimeSeconds: 1,
        autoCollect: true
      }
    ];
    const encounter = createBtd6EncounterV2(build(m), {
      targets: [],
      allies: [{ id: 'farm', x: 0, y: 0, model: ally }],
      roundStarts: [0]
    });
    expect(encounter.activate('loan')).toBe(true);
    encounter.advance(0.2);
    expect(encounter.snapshot().cash).toBe(60);
    encounter.accountOperation({
      kind: 'deposit',
      accountId: 'sentry/bank',
      amount: 20,
      funding: 'wallet'
    });
    encounter.accountOperation({ kind: 'end-round', roundId: 1 });
    expect(encounter.snapshot().accounts[0]!.balance).toBe(33);
    encounter.accountOperation({
      kind: 'withdraw',
      accountId: 'sentry/bank',
      repaymentAccountId: 'sentry/bank'
    });
    expect(encounter.snapshot().cash).toBe(56.5);
    expect(encounter.snapshot().accounts[0]!.debt).toBe(23.5);
    const before = encounter.snapshot();
    expect(() =>
      encounter.applyEntityChanges({ removeIds: ['sentry'], replacements: [], additions: [] })
    ).toThrow('Close an account');
    expect(encounter.snapshot()).toEqual(before);
    encounter.accountOperation({
      kind: 'close',
      accountId: 'sentry/bank',
      balance: 'withdraw',
      debt: 'retain'
    });
    encounter.applyEntityChanges({ removeIds: ['sentry'], replacements: [], additions: [] });
    expect(encounter.snapshot().accounts[0]).toMatchObject({ closed: true, debt: 23.5 });
  });
  it('rejects an unaffordable ability without consuming its cooldown', () => {
    const m = model();
    m.accounts = [bank()];
    m.abilities = [
      {
        id: 'deposit',
        name: 'Deposit',
        cooldownSeconds: 10,
        effect: {
          kind: 'account',
          operation: { kind: 'deposit', accountId: 'bank', amount: 20, funding: 'wallet' }
        }
      }
    ];
    const encounter = createBtd6EncounterV2(build(m), { targets: [] });
    expect(encounter.activate('deposit')).toBe(false);
    encounter.accountOperation({ kind: 'payout', amount: 20 });
    expect(encounter.activate('deposit')).toBe(true);
    expect(encounter.snapshot().accounts[0]!.balance).toBe(20);
    expect(encounter.snapshot().cash).toBe(0);
  });
});
describe('scheduler and actor update regressions', () => {
  it('reclaims cancelled queue entries before the budget check', () => {
    const clock = createMechanicsScheduler(1);
    clock.schedule(1, 0, () => {})();
    expect(() => clock.schedule(2, 0, () => {})).not.toThrow();
  });
  it('does not duplicate unchanged permanent passive actors on upgrade', () => {
    const clock = createMechanicsScheduler();
    const profile = {
      attacks: [],
      actors: [{ id: 'pet', attacks: [] }],
      passiveSummons: [{ id: 'spawn', actorId: 'pet', startDelaySeconds: 0, lifetimeSeconds: 0 }],
      income: [],
      rangeSupport: []
    };
    const runtime = createModelRuntime(clock, profile, {
      id: 'root',
      origin: { x: 0, y: 0 },
      onAttack: () => {},
      onEvent: () => {}
    });
    runtime.start();
    clock.advance(1);
    runtime.updateProfile(structuredClone(profile));
    clock.advance(2);
    expect(runtime.snapshot().actors).toHaveLength(1);
  });
});

describe('composed shared mechanics in the tower-defense adapter', () => {
  it('executes global reach independently of the numeric display radius', () => {
    const m = model();
    m.attacks[0]!.reach = { kind: 'global', radius: 0.01, throughWalls: true };
    expect(
      probeBtd6BuildV2(build(m), { durationSeconds: 0.1, targets: [target('far', 1000)] }).damage
    ).toBe(2);
  });
  it('lets a child impact detect a concealed target its parent cannot acquire', () => {
    const m = model(),
      a = m.attacks[0]!;
    a.intervalSeconds = 10;
    a.impact = {
      radius: 5,
      damage: 3,
      pierce: 5,
      detectsCamo: true,
      throughWalls: true,
      immuneTo: []
    };
    const result = probeBtd6BuildV2(build(m), {
      durationSeconds: 0.1,
      targets: [target('aim', 10), { ...target('concealed', 12), concealed: true }]
    });
    expect(result.targets.find((t) => t.id === 'concealed')!.health).toBe(97);
  });
  it('shares ability cooldown and round limits between manual and trigger activation', () => {
    const m = model();
    m.attacks = [];
    m.abilities = [
      {
        id: 'cash',
        name: 'Cash',
        cooldownSeconds: 1,
        maxActivationsPerRound: 1,
        effect: { kind: 'account', operation: { kind: 'payout', amount: 10 } }
      }
    ];
    m.triggers = [
      {
        id: 'panic',
        event: 'pre-leak',
        cooldownSeconds: 0,
        action: { kind: 'activate-ability', abilityId: 'cash' }
      }
    ];
    const encounter = createBtd6EncounterV2(build(m), { targets: [], roundStarts: [0, 2] });
    encounter.advance(0.1);
    expect(encounter.activate('cash')).toBe(true);
    encounter.dispatch({ kind: 'pre-leak' });
    expect(encounter.snapshot().cash).toBe(10);
    encounter.advance(2.1);
    encounter.dispatch({ kind: 'pre-leak' });
    expect(encounter.snapshot().cash).toBe(20);
  });
  it('applies persistent zone damage and expires before a simultaneous tick', () => {
    const m = model();
    m.attacks = [];
    m.zones = [
      {
        id: 'burn',
        radius: 5,
        innerRadius: 0,
        includeInner: true,
        includeOuter: true,
        intervalSeconds: 1,
        initialDelaySeconds: 0,
        triggerImmediate: true,
        durationSeconds: 2,
        damage: 3,
        detectConcealed: false,
        immuneTo: [],
        throughWalls: true
      }
    ];
    const result = probeBtd6BuildV2(build(m), {
      durationSeconds: 3,
      targets: [target('inside', 5), target('outside', 6)]
    });
    expect(result.damage).toBe(6);
    expect(result.targets[1]!.health).toBe(100);
  });
  it('modifies actual emission cadence and samples a moving actor origin for flight', () => {
    const m = model();
    m.modifiers = [
      {
        id: 'haste',
        stat: 'attack.intervalSeconds',
        operation: 'multiply',
        value: 0.5,
        group: 'haste',
        stacking: 'unique',
        maxStacks: 1,
        radius: null,
        includesOwner: true,
        includesSubordinates: true
      }
    ];
    expect(
      probeBtd6BuildV2(build(m), { durationSeconds: 1.1, targets: [target()] })
        .events.filter((e) => e.kind === 'emission')
        .map((e) => e.at)
    ).toEqual([0, 0.5, 1]);
    const a = {
      ...m.attacks[0]!,
      intervalSeconds: 1,
      delivery: 'projectile' as const,
      projectile: {
        id: 'flight',
        damage: 2,
        pierce: 1,
        detectConcealed: false,
        radius: 0,
        flight: { kind: 'aimed-impact' as const, speed: 10 }
      }
    };
    delete m.modifiers;
    m.attacks = [];
    m.actors = [
      { id: 'moving', attacks: [a], motion: { kind: 'straight', speed: 5, headingDegrees: 0 } }
    ];
    m.passiveSummons = [
      { id: 'spawn', actorId: 'moving', startDelaySeconds: 0, lifetimeSeconds: 0 }
    ];
    const result = probeBtd6BuildV2(build(m), { durationSeconds: 1.6, targets: [target()] });
    expect(result.events.filter((e) => e.kind === 'damage').map((e) => e.at)).toEqual([1.5]);
  });
});

describe('explicit target lifecycle', () => {
  it('propagates an existing status to caller-supplied children at parent destruction', () => {
    const m = model();
    const a = m.attacks[0]!;
    a.damage = 0;
    a.intervalSeconds = 10;
    a.statuses = [
      {
        id: 'slow',
        kind: 'slow',
        durationSeconds: 2,
        speedMultiplier: 0.5,
        immuneTo: [],
        stacking: { scope: 'source', reapply: 'refresh', maxStacks: 1 },
        combine: 'strongest',
        propagation: { overrideDistributionBlocker: false }
      }
    ];
    m.attacks.push({ ...a, id: 'kill', damage: 100, statuses: [] });
    const result = probeBtd6BuildV2(build(m), {
      durationSeconds: 3,
      targets: [target('parent', 10)],
      targetReplacements: { parent: { targets: [target('child', 10)] } }
    });
    expect(result.targets.find((t) => t.id === 'parent')!.health).toBe(0);
    expect(result.targets.find((t) => t.id === 'child')!.health).toBe(100);
    expect(result.control.child).toEqual({ controlledSeconds: 2, movementPreventedSeconds: 1 });
    const blocked = probeBtd6BuildV2(build(m), {
      durationSeconds: 3,
      targets: [target('parent', 10)],
      targetReplacements: { parent: { targets: [target('child', 10)], distributionBlocked: true } }
    });
    expect(blocked.control.child!.controlledSeconds).toBe(0);
  });
  it('refreshes in-flight contacts after an explicit target movement', () => {
    const m = model(),
      a = m.attacks[0]!;
    a.delivery = 'projectile';
    a.intervalSeconds = 10;
    a.projectile = {
      id: 'flight',
      damage: a.damage,
      pierce: a.pierce,
      detectConcealed: false,
      radius: 0,
      flight: { kind: 'straight', speed: 10, lifetimeSeconds: 3 }
    };
    const encounter = createBtd6EncounterV2(build(m), { targets: [target()] });
    encounter.advance(0.5);
    encounter.updateTarget('target', { x: 15 });
    encounter.advance(1.6);
    expect(
      encounter
        .snapshot()
        .events.filter((e) => e.kind === 'damage')
        .map((e) => e.at)
    ).toEqual([1.5]);
    const before = encounter.snapshot();
    expect(() => encounter.replaceTarget('target', [target('target')])).toThrow(
      'Invalid replacement'
    );
    expect(encounter.snapshot()).toEqual(before);
  });
});

describe('encounter ownership', () => {
  it('executes ally reactions on their own runtime and keeps their activation limits separate', () => {
    const m = model();
    m.attacks = [];
    m.abilities = [
      {
        id: 'cash',
        name: 'Cash',
        cooldownSeconds: 1,
        maxActivationsPerRound: 1,
        effect: { kind: 'account', operation: { kind: 'payout', amount: 10 } }
      }
    ];
    m.triggers = [
      {
        id: 'panic',
        event: 'pre-leak',
        cooldownSeconds: 0,
        action: { kind: 'activate-ability', abilityId: 'cash' }
      }
    ];
    const ally = structuredClone(m);
    ally.abilities[0]!.effect = { kind: 'account', operation: { kind: 'payout', amount: 20 } };
    const encounter = createBtd6EncounterV2(build(m), {
      targets: [],
      allies: [{ id: 'ally', x: 0, y: 0, model: ally }]
    });
    encounter.dispatch({ kind: 'round-start', round: 1 });
    encounter.dispatch({ kind: 'pre-leak' });
    expect(encounter.snapshot().cash).toBe(30);
    encounter.advance(2);
    encounter.dispatch({ kind: 'round-start', round: 1 });
    encounter.dispatch({ kind: 'pre-leak' });
    expect(encounter.snapshot().cash).toBe(30);
    encounter.dispatch({ kind: 'round-start', round: 2 });
    encounter.dispatch({ kind: 'pre-leak' });
    expect(encounter.snapshot().cash).toBe(60);
    encounter.applyEntityChanges({ removeIds: ['ally'], replacements: [], additions: [] });
    encounter.advance(4);
    encounter.dispatch({ kind: 'round-start', round: 3 });
    encounter.dispatch({ kind: 'pre-leak' });
    expect(encounter.snapshot().cash).toBe(70);
  });
  it('uses fractional contact capacity as a budget consumed by whole contacts', () => {
    const m = model();
    m.attacks[0]!.pierce = 1.5;
    expect(
      probeBtd6BuildV2(build(m), {
        durationSeconds: 0.1,
        targets: [target('a', 1), target('b', 2), target('c', 3)]
      }).damage
    ).toBe(4);
  });
});
