import { describe, expect, it } from 'vitest';
import { createMechanicsScheduler } from '../src/mechanics/scheduler.js';
import {
  createMechanicalEffectsRuntime,
  type MechanicalEffectOwner
} from '../src/mechanics/effects.js';
import {
  createModelRuntime,
  validateMechanicalModel,
  type MechanicalModel
} from '../src/mechanics/model.js';
import { createActorRuntime } from '../src/mechanics/actors.js';
import { emitProjectile, type ProjectileCollider } from '../src/mechanics/projectiles.js';
import { createBtd6FixtureV2 } from '../src/btd6-derived/v2-fixture.js';
import { createBtd6EncounterV2 } from '../src/btd6-derived/v2-runtime.js';

const profile = (): MechanicalModel => ({
  attacks: [],
  actors: [],
  passiveSummons: [],
  income: [],
  rangeSupport: [],
  accounts: [
    {
      id: 'bank',
      qualification: { kind: 'provided-policy', reference: 'test' },
      capacity: 1000,
      interestRate: 0,
      interestOrder: 'after-income',
      roundDeposit: 10,
      withdrawalPolicy: { mode: 'partial', atCapacity: 'retain' }
    }
  ],
  triggers: [
    {
      id: 'react',
      event: 'target-pop',
      cooldownSeconds: 10,
      maxPerRound: 1,
      action: { kind: 'attack', attackId: 'hit' }
    }
  ],
  zones: [
    {
      id: 'field',
      radius: 10,
      innerRadius: 0,
      includeInner: true,
      includeOuter: true,
      intervalSeconds: 10,
      initialDelaySeconds: 0,
      triggerImmediate: true,
      durationSeconds: 5,
      damage: 1,
      detectConcealed: false,
      immuneTo: [],
      throughWalls: true
    }
  ]
});
function scene() {
  const clock = createMechanicsScheduler();
  const target = { id: 'target', x: 0, y: 0, health: 100 };
  let fired = 0;
  const events: string[] = [];
  const effects = createMechanicalEffectsRuntime(clock, {
    targets: [target],
    execute: () => {
      fired++;
      return true;
    },
    onEvent: (e) => events.push(e.kind)
  });
  const initial = profile();
  const owner: MechanicalEffectOwner = { id: 'owner', x: 0, y: 0, model: initial };
  const model = createModelRuntime(clock, initial, {
    id: owner.id,
    origin: owner,
    effects,
    onAttack() {},
    onEvent() {}
  });
  model.start();
  effects.dispatch({ kind: 'round-start', round: 1 });
  effects.dispatch({ kind: 'target-pop' });
  clock.advance(1, true);
  return { clock, target, effects, initial, owner, model, events, fired: () => fired };
}

describe('owner effect lifecycles', () => {
  it('preserves an unchanged reaction and field across an unrelated model update', () => {
    const s = scene();
    const before = s.effects.snapshot();
    const next = structuredClone(s.initial);
    next.accounts![0]!.roundDeposit = 20;
    s.model.updateProfile(next);
    s.effects.dispatch({ kind: 'target-pop' });
    s.clock.advance(1, true);
    const after = s.effects.snapshot();
    expect(after.triggers).toEqual(before.triggers);
    expect(after.zones).toEqual(before.zones);
    expect(after.accountProfiles[0]!.roundDeposit).toBe(20);
    expect(s.fired()).toBe(1);
    expect(s.target.health).toBe(99);
    s.clock.advance(5, true);
    expect(s.effects.snapshot().zones).toEqual([]);
  });

  it('changes only the addressed effects and ignores object key order', () => {
    const s = scene();
    const before = s.effects.snapshot();
    const next = structuredClone(s.initial);
    next.triggers![0] = Object.fromEntries(
      Object.entries(next.triggers![0]!).reverse()
    ) as (typeof next.triggers)[0];
    next.triggers!.push({ ...next.triggers![0]!, id: 'other' });
    next.zones!.push({ ...next.zones![0]!, id: 'other-field' });
    s.effects.setOwners([{ ...s.owner, model: next }]);
    expect(s.effects.snapshot().triggers.subscriptions[0]).toEqual(
      before.triggers.subscriptions[0]
    );
    expect(s.effects.snapshot().zones[0]).toEqual(before.zones[0]);
    next.triggers![1]!.cooldownSeconds = 20;
    next.zones![1]!.damage = 2;
    s.effects.updateOwner({ ...s.owner, model: next });
    expect(s.effects.snapshot().triggers.subscriptions[0]).toEqual(
      before.triggers.subscriptions[0]
    );
    expect(s.effects.snapshot().zones[0]).toEqual(before.zones[0]);
    next.triggers!.splice(1);
    next.zones!.splice(1);
    s.effects.updateOwner({ ...s.owner, model: next });
    expect(s.effects.snapshot().triggers).toEqual(before.triggers);
    expect(s.effects.snapshot().zones).toEqual(before.zones);
  });

  it('moves a field without resetting an unchanged reaction', () => {
    const s = scene();
    const before = s.effects.snapshot();
    s.effects.updateOwner({ ...s.owner, x: 2 });
    const after = s.effects.snapshot();
    expect(after.triggers).toEqual(before.triggers);
    expect(after.zones[0]!.center).toEqual({ x: 2, y: 0 });
    expect(after.zones[0]!.id).not.toBe(before.zones[0]!.id);
  });

  it('keeps an expired field expired until an explicit owner restart', () => {
    const s = scene();
    s.clock.advance(6, true);
    const next = structuredClone(s.initial);
    next.accounts![0]!.roundDeposit = 20;
    s.effects.updateOwner({ ...s.owner, model: next });
    expect(s.effects.snapshot().zones).toEqual([]);
    s.effects.stopOwner(s.owner.id);
    s.effects.startOwner({ ...s.owner, model: next });
    expect(s.effects.snapshot().zones[0]!.expiresAt).toBe(11);
    expect(s.effects.snapshot().triggers.subscriptions[0]).toMatchObject({
      readyAt: 6,
      usedThisRound: 0
    });
  });

  it('rejects an invalid model before committing its bank or live effects', () => {
    const s = scene();
    const before = s.effects.snapshot();
    const eventCount = s.events.length;
    const invalid = structuredClone(s.initial);
    invalid.accounts![0]!.roundDeposit = 99;
    invalid.triggers!.push({ ...invalid.triggers![0]! });
    expect(validateMechanicalModel(invalid)).toContainEqual(
      expect.objectContaining({ path: '/triggers', code: 'duplicate-id' })
    );
    expect(() => s.model.updateProfile(invalid)).toThrow();
    expect(s.effects.snapshot()).toEqual(before);
    expect(s.events).toHaveLength(eventCount);
  });

  it.each(['validateOwners', 'setOwners', 'startOwner', 'updateOwner'] as const)(
    'preflights the entire owner before %s can change live state',
    (method) => {
      const s = scene();
      const before = s.effects.snapshot();
      const eventCount = s.events.length;
      const invalid = structuredClone(s.owner);
      invalid.model.accounts![0]!.roundDeposit = 99;
      invalid.model.triggers!.push({ ...invalid.model.triggers![0]! });
      expect(() => {
        if (method === 'validateOwners' || method === 'setOwners') s.effects[method]([invalid]);
        else s.effects[method](invalid);
      }).toThrow();
      expect(s.effects.snapshot()).toEqual(before);
      expect(s.events).toHaveLength(eventCount);
      s.clock.advance(5, true);
      expect(s.effects.snapshot().zones).toEqual([]);
      expect(s.target.health).toBe(99);
    }
  );

  it('preflights zone geometry and required callbacks before removing existing effects', () => {
    const s = scene();
    const before = s.effects.snapshot();
    const invalid = structuredClone(s.owner);
    invalid.model.zones![0]!.innerRadius = 20;
    expect(() => s.effects.updateOwner(invalid)).toThrow('zone');
    invalid.model.zones![0]!.innerRadius = 0;
    invalid.model.zones![0]!.statuses = [
      {
        id: 'slow',
        kind: 'slow',
        durationSeconds: 1,
        speedMultiplier: 0.5,
        combine: 'strongest',
        immuneTo: [],
        stacking: { scope: 'source', reapply: 'refresh', maxStacks: 1 }
      }
    ];
    expect(() => s.effects.updateOwner(invalid)).toThrow('callback');
    expect(s.effects.snapshot()).toEqual(before);
  });

  it('rejects duplicate initial owners and permits local IDs on distinct owners', () => {
    const s = scene();
    expect(() =>
      createMechanicalEffectsRuntime(s.clock, {
        owners: [s.owner, s.owner],
        targets: [],
        execute: () => false,
        onEvent() {}
      })
    ).toThrow('distinct');
    s.effects.startOwner({ ...s.owner, id: 'other' });
    expect(s.effects.snapshot().triggers.subscriptions.map((entry) => entry.sourceId)).toEqual([
      'owner',
      'other'
    ]);
  });

  it('preserves unchanged effects through the BTD6 progression transaction', () => {
    const initial = createBtd6FixtureV2().base!;
    Object.assign(initial, {
      accounts: profile().accounts,
      zones: profile().zones,
      triggers: profile().triggers
    });
    initial.triggers![0]!.action = { kind: 'attack', attackId: initial.attacks[0]!.id };
    const encounter = createBtd6EncounterV2(
      {
        schemaVersion: 'btd6-derived.build/0.2',
        unitId: 'hero',
        tiers: [0, 0, 0],
        cost: 0,
        model: initial,
        adaptations: [],
        unsupported: []
      },
      { targets: [{ id: 'target', x: 8, y: 0, health: 1000, progress: 1, strength: 1 }] }
    );
    encounter.advance(0, true);
    encounter.dispatch({ kind: 'round-start', round: 1 });
    encounter.dispatch({ kind: 'target-pop' });
    encounter.advance(1, true);
    const before = encounter.snapshot();
    const next = structuredClone(initial);
    next.accounts![0]!.roundDeposit = 20;
    encounter.applyEntityChanges({
      removeIds: [],
      additions: [],
      replacements: [{ id: 'hero', model: next }]
    });
    const after = encounter.snapshot();
    expect(after.triggers).toEqual(before.triggers);
    expect(after.zones).toEqual(before.zones);
    expect(after.accountProfiles[0]!.roundDeposit).toBe(20);
  });
});

function projectileScene(budget: number) {
  const clock = createMechanicsScheduler(budget);
  const targets: ProjectileCollider[] = [{ id: 'target', x: 50, y: 0, health: 100 }];
  const contacts: string[] = [];
  const shot = emitProjectile({
    scheduler: clock,
    projectile: {
      id: 'shot',
      damage: 1,
      radius: 0,
      pierce: 10,
      detectConcealed: false,
      throughWalls: true,
      flight: { kind: 'straight', speed: 1, lifetimeSeconds: 100 }
    },
    origin: { x: 0, y: 0 },
    aim: { x: 50, y: 0 },
    targets: () => targets,
    onContact: ({ target }) => contacts.push(target.id)
  });
  return { clock, targets, contacts, shot };
}

describe('owned event cancellation', () => {
  it('reuses unchanged contact predictions without extra queue budget', () => {
    const s = projectileScene(2);
    for (let i = 0; i < 100; i++) s.shot.refresh();
    s.clock.advance(100, true);
    expect(s.contacts).toEqual(['target']);
    expect(s.shot.alive).toBe(false);
  });

  it('cancels superseded predictions and preserves the original expiry', () => {
    const s = projectileScene(3);
    for (let i = 0; i < 20; i++) {
      s.targets[0]!.x = 50 + i;
      s.shot.refresh();
    }
    s.clock.advance(68, true);
    expect(s.contacts).toEqual([]);
    s.clock.advance(100, true);
    expect(s.contacts).toEqual(['target']);
    expect(s.shot.alive).toBe(false);
  });

  it('retains the last good predictions when a refresh cannot schedule all new contacts', () => {
    const s = projectileScene(3);
    s.targets.push(
      { id: 'other', x: 60, y: 0, health: 100 },
      { id: 'third', x: 70, y: 0, health: 100 }
    );
    expect(() => s.shot.refresh()).toThrow('queue budget');
    s.clock.advance(100, true);
    expect(s.contacts).toEqual(['target']);
    expect(s.shot.alive).toBe(false);
  });

  it('keeps target ID ordering when refreshed contacts converge at the same time', () => {
    const clock = createMechanicsScheduler();
    const targets = [
      { id: 'z', x: 50, y: 0, health: 100 },
      { id: 'a', x: 60, y: 0, health: 100 }
    ];
    const contacts: string[] = [];
    const shot = emitProjectile({
      scheduler: clock,
      projectile: {
        id: 'shot',
        damage: 1,
        radius: 0,
        pierce: 1,
        detectConcealed: false,
        throughWalls: true,
        flight: { kind: 'straight', speed: 1, lifetimeSeconds: 100 }
      },
      origin: { x: 0, y: 0 },
      aim: { x: 50, y: 0 },
      targets: () => targets,
      onContact: ({ target }) => contacts.push(target.id)
    });
    targets[1]!.x = 50;
    shot.refresh();
    clock.advance(100, true);
    expect(contacts).toEqual(['a']);
  });

  it('cancels expiry events for repeatedly removed actors', () => {
    const clock = createMechanicsScheduler(2);
    const expired: string[] = [];
    const actors = createActorRuntime(clock, (actor) => expired.push(actor.id));
    for (let i = 0; i < 100; i++) {
      const actor = actors.spawn('owner', 'child', 100, {});
      expect(actors.remove(actor.id)).toBe(true);
    }
    expect(actors.snapshot()).toEqual([]);
    expect(clock.nextTime).toBeNull();
    clock.advance(100, true);
    expect(expired).toHaveLength(100);
  });

  it('cancels recursive child expiry once while independent children keep theirs', () => {
    const clock = createMechanicsScheduler(4);
    const expired: string[] = [];
    const actors = createActorRuntime(clock, (actor) => expired.push(actor.id));
    const parent = actors.spawn('owner', 'parent', 50, {});
    const child = actors.spawn(parent.id, 'child', 40, {});
    const independent = actors.spawn(parent.id, 'independent', 30, {}, false);
    actors.remove(parent.id);
    expect(expired).toEqual([child.id, parent.id]);
    expect(clock.nextTime).toBe(30);
    clock.advance(100, true);
    expect(expired).toEqual([child.id, parent.id, independent.id]);
    expect(actors.snapshot()).toEqual([]);
  });

  it('does not publish an actor when scheduling its expiry fails', () => {
    const clock = createMechanicsScheduler(1);
    const actors = createActorRuntime(clock, () => {});
    clock.schedule(1, 0, () => {});
    expect(() => actors.spawn('owner', 'child', 100, {})).toThrow('queue budget');
    expect(actors.snapshot()).toEqual([]);
    expect(clock.nextTime).toBe(1);
  });
});
