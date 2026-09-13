import { describe, expect, it } from 'vitest';
import { createMechanicsScheduler, eventPriority } from '../src/mechanics/scheduler.js';
import {
  affordableResource,
  applyResourceOperation,
  createEconomyLedger,
  createResourceActivityRuntime,
  type ResourceActivityProfile
} from '../src/mechanics/economy.js';

const activity: ResourceActivityProfile = {
  id: 'beam',
  initialCost: 80,
  drain: { amount: 7, intervalSeconds: 0.5 },
  depletion: 'stop-before-unaffordable'
};

describe('shared finite resources', () => {
  it('checks reserved costs without spending and preserves continuous gain/loss arithmetic', () => {
    const balance = { amount: 100, maximum: 120 };
    expect(affordableResource(balance, 60, 40)).toBe(true);
    expect(affordableResource(balance, 60, 40.001)).toBe(false);
    expect(applyResourceOperation(balance, { kind: 'spend', amount: 60 }).balance.amount).toBe(40);
    const drained = applyResourceOperation(balance, { kind: 'lose', amount: 7 * 0.25 });
    expect(drained.balance.amount).toBe(98.25);
    const restored = applyResourceOperation(drained.balance, { kind: 'gain', amount: 4 * 0.25 });
    expect(restored.balance.amount).toBe(99.25);
    expect(balance).toEqual({ amount: 100, maximum: 120 });
    expect(() => applyResourceOperation(balance, { kind: 'spend', amount: 100.001 })).toThrow(
      'Insufficient'
    );
    expect(
      applyResourceOperation(balance, { kind: 'spend', amount: 100 + 1e-10, tolerance: 1e-9 })
    ).toMatchObject({ balance: { amount: 0 }, applied: 100 });
  });

  it('caps gains, clips losses and keeps uncapped resources explicit', () => {
    expect(
      applyResourceOperation({ amount: 90, maximum: 100 }, { kind: 'gain', amount: 15 })
    ).toMatchObject({ balance: { amount: 100 }, applied: 10, overflow: 5 });
    expect(
      applyResourceOperation({ amount: 90 }, { kind: 'gain', amount: 15 }).balance.amount
    ).toBe(105);
    expect(
      applyResourceOperation({ amount: 5, maximum: 100 }, { kind: 'lose', amount: 15 })
    ).toMatchObject({ balance: { amount: 0 }, applied: 5, depleted: true });
  });

  it('rejects nonfinite, negative and over-capacity balances before mutation', () => {
    for (const amount of [-1, NaN, Infinity]) {
      expect(() => applyResourceOperation({ amount: 10 }, { kind: 'gain', amount })).toThrow();
      expect(() => affordableResource({ amount: 10 }, amount)).toThrow();
    }
    expect(() => affordableResource({ amount: 11, maximum: 10 }, 1)).toThrow('maximum');
    expect(() => affordableResource({ amount: 1 }, 1, -1)).toThrow();
    expect(() =>
      applyResourceOperation({ amount: 1e308 }, { kind: 'gain', amount: 1e308 })
    ).toThrow();
  });

  it('uses the same arithmetic for cash costs and capped lives without cross-resource mutation', () => {
    const ledger = createEconomyLedger({ cash: 20, lives: 97, maximumLives: 100 });
    expect(ledger.apply({ kind: 'gain-lives', amount: 12 })).toMatchObject({
      state: { cash: 20, lives: 100 },
      applied: 3,
      overflow: 9
    });
    ledger.apply({ kind: 'debit-cash', amount: 20 });
    const before = ledger.state;
    expect(() => ledger.apply({ kind: 'debit-cash', amount: 1 })).toThrow('Insufficient');
    expect(ledger.state).toEqual(before);
    ledger.apply({ kind: 'lose-lives', amount: 101 });
    expect(ledger.state).toEqual({ cash: 0, lives: 0, maximumLives: 100 });
    ledger.apply({ kind: 'credit-cash', amount: 7 });
    const result = ledger.apply({ kind: 'gain-lives', amount: 1 });
    result.state.cash = 999;
    ledger.state.lives = 999;
    expect(ledger.state).toEqual({ cash: 7, lives: 1, maximumLives: 100 });
    const uncapped = createEconomyLedger({ lives: 200 });
    uncapped.apply({ kind: 'gain-lives', amount: 15 });
    expect(uncapped.state.lives).toBe(215);
  });
});

describe('periodic resource activities', () => {
  it('pays activation and exact periodic costs, then disables before an unaffordable drain', () => {
    const clock = createMechanicsScheduler();
    const stops: number[] = [];
    const runtime = createResourceActivityRuntime(clock, { amount: 100, maximum: 100 }, () =>
      stops.push(clock.now)
    );
    expect(runtime.activate(activity)).toBe(true);
    expect(runtime.balance.amount).toBe(20);
    clock.advance(0.5, true);
    expect(runtime.balance.amount).toBe(13);
    clock.advance(1, true);
    expect(runtime.balance.amount).toBe(6);
    clock.advance(1.5, true);
    expect(runtime.balance.amount).toBe(6);
    expect(runtime.isActive('beam')).toBe(false);
    expect(stops).toEqual([1.5]);
    expect(clock.nextTime).toBeNull();
  });

  it('shuts the enabled attack off before simultaneous emissions', () => {
    const clock = createMechanicsScheduler();
    let enabled = false;
    const runtime = createResourceActivityRuntime(clock, { amount: 100 }, () => {
      enabled = false;
    });
    const fired: number[] = [];
    if (runtime.activate(activity)) enabled = true;
    for (const at of [0.5, 1, 1.5, 2])
      clock.schedule(at, eventPriority.emission, () => {
        if (enabled) fired.push(clock.now);
      });
    clock.advance(2, true);
    expect(fired).toEqual([0.5, 1]);
  });

  it('spends the last partial amount only under the explicit alternative depletion policy', () => {
    const clock = createMechanicsScheduler();
    const runtime = createResourceActivityRuntime(clock, { amount: 100 });
    runtime.activate({ ...activity, depletion: 'spend-remainder-and-stop' });
    clock.advance(1.5, true);
    expect(runtime.balance.amount).toBe(0);
    expect(runtime.events.filter((e) => e.kind === 'drain').map((e) => e.amount)).toEqual([
      7, 7, 6
    ]);
    expect(runtime.activeIds).toEqual([]);
  });

  it('rejects unaffordable activation without spending, enabling attacks or taking cooldown', () => {
    const clock = createMechanicsScheduler();
    const runtime = createResourceActivityRuntime(clock, { amount: 79 });
    let enabled = false;
    let cooldown = 0;
    const activate = () => {
      if (!runtime.activate(activity)) return false;
      enabled = true;
      cooldown = 5;
      return true;
    };
    expect(activate()).toBe(false);
    expect({ enabled, cooldown, balance: runtime.balance.amount }).toEqual({
      enabled: false,
      cooldown: 0,
      balance: 79
    });
    expect(runtime.events).toEqual([]);
    expect(clock.nextTime).toBeNull();
    runtime.apply({ kind: 'gain', amount: 21 });
    expect(activate()).toBe(true);
    expect({ enabled, cooldown, balance: runtime.balance.amount }).toEqual({
      enabled: true,
      cooldown: 5,
      balance: 20
    });
    expect(runtime.activate(activity)).toBe(false);
    expect(runtime.balance.amount).toBe(20);
  });

  it('does not charge activation when scheduling fails', () => {
    const clock = createMechanicsScheduler(1);
    clock.schedule(100, eventPriority.emission, () => {});
    const runtime = createResourceActivityRuntime(clock, { amount: 100 });
    expect(() => runtime.activate(activity)).toThrow('budget');
    expect(runtime.balance.amount).toBe(100);
    expect(runtime.activeIds).toEqual([]);
    expect(runtime.events).toEqual([]);
  });

  it('cancels scheduled costs on stop or removal and protects profiles and snapshots', () => {
    const clock = createMechanicsScheduler();
    const profile = structuredClone(activity);
    const runtime = createResourceActivityRuntime(clock, { amount: 100 });
    runtime.activate(profile);
    profile.drain!.amount = 1000;
    runtime.balance.amount = 999;
    runtime.events[0]!.amount = 999;
    clock.advance(0.5, true);
    expect(runtime.balance.amount).toBe(13);
    expect(runtime.deactivate('beam')).toBe(true);
    runtime.apply({ kind: 'gain', amount: 100 });
    runtime.activate(activity);
    runtime.dispose();
    expect(runtime.activeIds).toEqual([]);
    expect(clock.nextTime).toBeNull();
    expect(runtime.activate(activity)).toBe(false);
    expect(() => runtime.apply({ kind: 'gain', amount: 1 })).toThrow('removed');
  });

  it('shares one pool across activities and respects explicit same-time gain ordering', () => {
    const clock = createMechanicsScheduler();
    const runtime = createResourceActivityRuntime(clock, { amount: 14 });
    const first = { ...activity, id: 'first', initialCost: 0 };
    const second = { ...activity, id: 'second', initialCost: 0 };
    runtime.activate(first);
    runtime.activate(second);
    clock.advance(0.5, true);
    expect(runtime.balance.amount).toBe(0);
    expect(runtime.activeIds).toEqual([]);
    clock.schedule(1, eventPriority.round, () => runtime.apply({ kind: 'gain', amount: 7 }));
    clock.advance(1, true);
    expect(runtime.balance.amount).toBe(7);
    expect(runtime.activeIds).toEqual([]);
    const beforeDrain = createMechanicsScheduler();
    const funded = createResourceActivityRuntime(beforeDrain, { amount: 6 });
    funded.activate({ ...activity, initialCost: 0 });
    beforeDrain.schedule(0.5, eventPriority.round, () => funded.apply({ kind: 'gain', amount: 1 }));
    beforeDrain.advance(0.5, true);
    expect(funded.balance.amount).toBe(0);
    expect(funded.events.find((e) => e.kind === 'drain')!.amount).toBe(7);
  });

  it('rejects invalid activity profiles', () => {
    const runtime = createResourceActivityRuntime(createMechanicsScheduler(), { amount: 100 });
    for (const invalid of [
      { ...activity, initialCost: -1 },
      { ...activity, drain: { amount: 0, intervalSeconds: 1 } },
      { ...activity, drain: { amount: 1, intervalSeconds: 0 } },
      { ...activity, drain: { amount: Infinity, intervalSeconds: 1 } }
    ])
      expect(() => runtime.activate(invalid)).toThrow();
    expect(runtime.balance.amount).toBe(100);
  });
});
