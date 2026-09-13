import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyDamage, type CombatTarget } from '../src/mechanics/combat.js';
import { createMechanicsScheduler } from '../src/mechanics/scheduler.js';
import { createStatusRuntime, type StatusEffect } from '../src/mechanics/status.js';

const policy = { scope: 'source' as const, reapply: 'refresh' as const, maxStacks: 1 };
const slow = (overrides: Partial<StatusEffect> = {}): StatusEffect =>
  ({
    kind: 'slow',
    id: 'resin',
    durationSeconds: 4,
    speedMultiplier: 0.5,
    immuneTo: [],
    stacking: policy,
    combine: 'strongest',
    ...overrides
  }) as StatusEffect;
const dot = (overrides: Partial<StatusEffect> = {}): StatusEffect =>
  ({
    kind: 'damage-over-time',
    id: 'corrosion',
    durationSeconds: 6,
    immuneTo: [],
    stacking: policy,
    damage: 3,
    intervalSeconds: 2,
    initialDelaySeconds: 0,
    triggerImmediate: false,
    tickOnExpiry: false,
    damageImmuneTo: [],
    refreshTicks: 'preserve',
    ...overrides
  }) as StatusEffect;
function setup() {
  const clock = createMechanicsScheduler();
  const target = {
    id: 'target',
    x: 0,
    y: 0,
    health: 100,
    tags: ['shell', 'hidden'],
    concealed: true
  };
  const runtime = createStatusRuntime(clock, [target]);
  const snapshot = () => runtime.snapshot('target')[0]!;
  return { clock, target, runtime, snapshot };
}

describe('shared status mechanics', () => {
  it('refreshes each source independently and integrates overlapping control once', () => {
    const { clock, runtime, snapshot } = setup();
    runtime.apply('one', 'target', slow());
    clock.advance(2, true);
    runtime.apply('two', 'target', slow({ speedMultiplier: 0.25 }));
    runtime.apply('one', 'target', slow());
    expect(snapshot().active.map((entry) => entry.expiresAt)).toEqual([6, 6]);
    expect(snapshot().speedMultiplier).toBe(0.25);
    clock.advance(7, true);
    expect(snapshot().active).toEqual([]);
    expect(snapshot().controlledSeconds).toBe(6);
    expect(snapshot().movementPreventedSeconds).toBe(4);
  });
  it('keeps a nonrefreshing expiry and scopes post-expiry immunity to its source', () => {
    const { clock, runtime, snapshot } = setup();
    const effect = slow({ stacking: { ...policy, reapply: 'keep' }, immunitySeconds: 3 });
    runtime.apply('one', 'target', effect);
    clock.advance(2, true);
    expect(runtime.apply('one', 'target', effect)).toBe(false);
    clock.advance(4, true);
    expect(runtime.apply('one', 'target', effect)).toBe(false);
    expect(runtime.apply('two', 'target', effect)).toBe(true);
    expect(snapshot().immunity).toEqual([{ id: 'resin', sourceId: 'one', until: 7 }]);
    clock.advance(7, true);
    expect(runtime.apply('one', 'target', effect)).toBe(true);
  });
  it('preserves the later expiry for same-time stuns and rejects ineligible contacts', () => {
    const { clock, target } = setup();
    const runtime = createStatusRuntime(clock, [target], {
      eligible: (_, effect) => effect.id !== 'disabled'
    });
    const effect: StatusEffect = {
      kind: 'stun',
      id: 'lock',
      durationSeconds: 5,
      speedMultiplier: 0,
      combine: 'strongest',
      immuneTo: [],
      stacking: { ...policy, scope: 'target', reapply: 'extend' }
    };
    runtime.apply('one', 'target', effect);
    runtime.apply('two', 'target', { ...effect, durationSeconds: 2 });
    expect(runtime.snapshot()[0]!.active[0]!.expiresAt).toBe(5);
    expect(runtime.apply('one', 'target', slow({ immuneTo: ['shell'] }))).toBe(false);
    expect(runtime.apply('one', 'target', slow({ requiresTags: ['missing'] }))).toBe(false);
    expect(runtime.apply('one', 'target', slow({ id: 'disabled' }))).toBe(false);
    expect(runtime.apply('one', 'target', slow({ requiresDamage: true }))).toBe(false);
    expect(
      runtime.apply('one', 'target', slow({ requiresDamage: true }), { damageApplied: 1 })
    ).toBe(true);
  });
  it('limits stacks and aggregates damage debuffs before independent expiry', () => {
    const { clock, runtime, snapshot } = setup();
    const effect: StatusEffect = {
      kind: 'damage-taken',
      id: 'mark',
      durationSeconds: 3,
      immuneTo: [],
      stacking: { ...policy, scope: 'target', reapply: 'stack', maxStacks: 2 },
      additive: 2,
      multiplier: 1.25,
      combine: 'multiply'
    };
    runtime.apply('one', 'target', effect);
    clock.advance(1, true);
    runtime.apply('two', 'target', effect);
    expect(runtime.apply('three', 'target', effect)).toBe(false);
    expect(snapshot().damageTakenAdditive).toBe(4);
    expect(snapshot().damageTakenMultiplier).toBe(1.5625);
    clock.advance(3, true);
    expect(snapshot().damageTakenAdditive).toBe(2);
    clock.advance(4, true);
    expect(snapshot().damageTakenMultiplier).toBe(1);
  });
  it('applies damage debuffs through shared damage and restores preexisting modifiers', () => {
    const clock = createMechanicsScheduler();
    const target: CombatTarget = {
      id: 'target',
      x: 0,
      y: 0,
      health: 100,
      damageTaken: { additive: 1, multiplier: 2 }
    };
    const runtime = createStatusRuntime(clock, [target]);
    const effect: StatusEffect = {
      kind: 'damage-taken',
      id: 'mark',
      durationSeconds: 2,
      immuneTo: [],
      stacking: policy,
      additive: 2,
      multiplier: 1.5,
      combine: 'strongest'
    };
    runtime.apply('one', 'target', effect);
    expect(applyDamage(target, 3).applied).toBe(18);
    clock.advance(2, true);
    expect(applyDamage(target, 3).applied).toBe(8);
    expect(target.damageTaken).toEqual({ additive: 1, multiplier: 2 });
  });
  it('stops integrating movement prevention at a settled lethal hit', () => {
    const { clock, target, runtime, snapshot } = setup();
    runtime.apply('one', 'target', slow());
    clock.advance(2, true);
    runtime.settle(target.id);
    applyDamage(target, 100);
    clock.advance(10, true);
    expect(snapshot().movementPreventedSeconds).toBe(1);
    expect(snapshot().controlledSeconds).toBe(2);
  });
  it('preserves tick cadence when refreshed between the final tick and expiry', () => {
    const { clock, target, runtime } = setup();
    runtime.apply('one', 'target', dot({ durationSeconds: 3 }));
    clock.advance(2.5, true);
    expect(target.health).toBe(97);
    runtime.apply('one', 'target', dot({ durationSeconds: 3 }));
    clock.advance(5.5, true);
    expect(target.health).toBe(94);
  });
  it('executes delayed immediate and expiry ticks and reevaluates damage immunity', () => {
    const { clock, target, runtime } = setup();
    runtime.apply(
      'one',
      'target',
      dot({
        triggerImmediate: true,
        initialDelaySeconds: 1,
        tickOnExpiry: true,
        durationSeconds: 5,
        damageImmuneTo: ['shell']
      })
    );
    clock.advance(1, true);
    expect(target.health).toBe(100);
    runtime.apply('one', 'target', {
      kind: 'property',
      id: 'cleanse',
      durationSeconds: null,
      immuneTo: [],
      stacking: policy,
      addTags: [],
      removeTags: ['shell']
    });
    clock.advance(5, true);
    expect(target.health).toBe(94);
    expect(runtime.snapshot()[0]!.active).toEqual([]);
  });
  it('restarts a tick timer only when requested and cancels pending damage on clear', () => {
    const { clock, target, runtime } = setup();
    runtime.apply('one', 'target', dot({ refreshTicks: 'restart' }));
    clock.advance(1, true);
    runtime.apply('one', 'target', dot({ refreshTicks: 'restart' }));
    clock.advance(2, true);
    expect(target.health).toBe(100);
    clock.advance(3, true);
    expect(target.health).toBe(97);
    runtime.clear('target');
    clock.advance(10, true);
    expect(target.health).toBe(97);
  });
  it('restores overlapping properties without undoing a permanent cleanse', () => {
    const { clock, target, runtime } = setup();
    const effect: StatusEffect = {
      kind: 'property',
      id: 'reveal',
      durationSeconds: 3,
      immuneTo: [],
      stacking: policy,
      addTags: ['exposed'],
      removeTags: ['hidden'],
      concealed: false
    };
    runtime.apply('one', 'target', effect);
    clock.advance(1, true);
    runtime.apply('two', 'target', effect);
    runtime.apply('cleanser', 'target', {
      ...effect,
      id: 'permanent',
      durationSeconds: null,
      addTags: [],
      removeTags: ['shell']
    });
    clock.advance(3, true);
    expect(target.tags).toEqual(['exposed']);
    expect(target.concealed).toBe(false);
    clock.advance(4, true);
    expect(target.tags).toEqual(['hidden']);
    expect(target.concealed).toBe(false);
  });
  it('keeps caller property updates beneath active overlays and restores the updated baseline', () => {
    const { clock, target, runtime } = setup();
    runtime.snapshot();
    runtime.apply('source', target.id, {
      kind: 'property',
      id: 'reveal',
      durationSeconds: 2,
      immuneTo: [],
      stacking: policy,
      addTags: ['exposed'],
      removeTags: ['hidden'],
      concealed: false
    });
    expect(runtime.updateProperties(target.id, { tags: ['hidden', 'new'], concealed: true })).toBe(
      true
    );
    expect(target.tags).toEqual(['new', 'exposed']);
    expect(target.concealed).toBe(false);
    runtime.updateProperties(target.id, {});
    clock.advance(2, true);
    expect(target.tags).toEqual(['hidden', 'new']);
    expect(target.concealed).toBe(true);
    runtime.updateProperties(target.id, { concealed: false });
    expect(target.tags).toEqual(['hidden', 'new']);
    expect(target.concealed).toBe(false);
    expect(runtime.updateProperties('missing', { tags: [] })).toBe(false);
  });
  it('checks eligibility at a scheduled application after purchase activation', () => {
    const { clock, target } = setup();
    let purchased = false;
    const runtime = createStatusRuntime(clock, [target], { eligible: () => purchased });
    clock.schedule(2, 2, () => {
      purchased = true;
    });
    clock.schedule(1, 4, () => expect(runtime.apply('one', 'target', slow())).toBe(false));
    clock.schedule(2, 4, () => expect(runtime.apply('one', 'target', slow())).toBe(true));
    clock.advance(2, true);
    expect(runtime.snapshot()[0]!.active).toHaveLength(1);
    expect(runtime.nextEventAt).toBe(6);
  });
  it('rejects invalid tick periods and conflicting policies for a live status ID', () => {
    const { runtime } = setup();
    expect(() => runtime.apply('one', 'target', dot({ intervalSeconds: 0 }))).toThrow(
      'Invalid status'
    );
    runtime.apply('one', 'target', slow());
    expect(() =>
      runtime.apply('two', 'target', slow({ stacking: { ...policy, reapply: 'stack' } }))
    ).toThrow('stacking policy');
  });
});

// Reads private scalar policy fields without publishing captured fixtures.
const sourceFile = process.env.BTD6_STATUS_REFERENCE_FILE;
it.skipIf(!sourceFile)('executes captured slow duration and refresh fields', () => {
  const reference = JSON.parse(readFileSync(sourceFile!, 'utf8')) as {
    sourceFacts: { nodes: { type?: string; fields?: Record<string, unknown> }[] };
  };
  const node = reference.sourceFacts.nodes.find(
    (n) =>
      n.type?.includes('.SlowModel,') &&
      typeof n.fields?.lifespan === 'number' &&
      Number(n.fields.lifespan) > 0
  );
  expect(node).toBeDefined();
  const fields = node!.fields!;
  const duration = Number(fields.lifespan);
  const { clock, runtime, snapshot } = setup();
  const effect = slow({
    durationSeconds: duration,
    speedMultiplier: Number(fields.multiplier),
    stacking: { ...policy, reapply: fields.dontRefreshDuration ? 'keep' : 'refresh' }
  });
  runtime.apply('source', 'target', effect);
  clock.advance(duration / 2, true);
  runtime.apply('source', 'target', effect);
  const expiry = fields.dontRefreshDuration ? duration : duration * 1.5;
  expect(snapshot().active[0]!.expiresAt).toBe(expiry);
  clock.advance(expiry, true);
  expect(snapshot().active).toEqual([]);
});

describe('explicit target lifecycle for statuses', () => {
  const target = (id: string, health = 100, tags: string[] = []) => ({
    id,
    health,
    x: 0,
    y: 0,
    tags
  });
  it('dispatches destruction payload once, cancels timers, and requires a callback handler', () => {
    const clock = createMechanicsScheduler();
    const targets = [target('parent'), target('victim')];
    const effect = dot({ onDestroy: { damage: 7, immuneTo: [], delivery: 'callback' } });
    expect(() => createStatusRuntime(clock, targets).apply('source', 'parent', effect)).toThrow(
      'destroyPayload'
    );
    let calls = 0;
    const runtime = createStatusRuntime(clock, targets, {
      destroyPayload: (parent, amount, sourceId) => {
        expect([parent.id, sourceId]).toEqual(['parent', 'source']);
        calls++;
        applyDamage(targets[1]!, amount);
      }
    });
    runtime.apply('source', 'parent', effect);
    expect(runtime.destroy('parent')).toEqual({ payloads: 1, propagated: 0 });
    expect(runtime.destroy('parent')).toEqual({ payloads: 0, propagated: 0 });
    clock.advance(10, true);
    expect(calls).toBe(1);
    expect(targets[1]!.health).toBe(93);
    expect(runtime.nextEventAt).toBe(Infinity);
  });
  it('copies remaining duration and tick phase without restarting an immediate payload', () => {
    const clock = createMechanicsScheduler();
    const targets = [target('parent'), target('child')];
    const runtime = createStatusRuntime(clock, targets);
    runtime.apply(
      'source',
      'parent',
      dot({ triggerImmediate: true, propagation: { overrideDistributionBlocker: false } })
    );
    clock.advance(1, true);
    expect(targets[0]!.health).toBe(97);
    expect(runtime.replace('parent', ['child'])).toEqual({ payloads: 0, propagated: 1 });
    expect(runtime.snapshot('child')[0]!.active[0]!.expiresAt).toBe(6);
    clock.advance(1, true);
    expect(targets[1]!.health).toBe(100);
    clock.advance(2, true);
    expect(targets[1]!.health).toBe(97);
    clock.advance(6, true);
    expect(targets[1]!.health).toBe(94);
    expect(runtime.snapshot('child')[0]!.active).toEqual([]);
  });
  it('damages eligible replacements before propagating to survivors', () => {
    const clock = createMechanicsScheduler();
    const targets = [
      target('parent'),
      target('fragile', 5),
      target('survivor'),
      target('immune', 100, ['shell'])
    ];
    const runtime = createStatusRuntime(clock, targets);
    runtime.apply(
      'source',
      'parent',
      dot({
        immuneTo: ['shell'],
        propagation: { overrideDistributionBlocker: false },
        onDestroy: { damage: 8, immuneTo: ['shell'], delivery: 'replacements' }
      })
    );
    expect(runtime.destroy('parent', ['fragile', 'survivor', 'immune'])).toEqual({
      payloads: 2,
      propagated: 1
    });
    expect(targets.map((t) => t.health)).toEqual([100, 0, 92, 100]);
    expect(runtime.snapshot('fragile')[0]!.active).toEqual([]);
    expect(runtime.snapshot('survivor')[0]!.active).toHaveLength(1);
    expect(runtime.snapshot('immune')[0]!.active).toEqual([]);
  });
  it('honors distribution blockers, opt-in propagation, and the explicit override', () => {
    const clock = createMechanicsScheduler();
    const targets = [target('parent'), target('child')];
    const runtime = createStatusRuntime(clock, targets);
    runtime.apply('source', 'parent', slow({ id: 'local' }));
    runtime.apply(
      'source',
      'parent',
      slow({ id: 'blocked', propagation: { overrideDistributionBlocker: false } })
    );
    runtime.apply(
      'source',
      'parent',
      slow({ id: 'carried', propagation: { overrideDistributionBlocker: true } })
    );
    expect(runtime.replace('parent', ['child'], { distributionBlocked: true }).propagated).toBe(1);
    expect(runtime.snapshot('child')[0]!.active.map((a) => a.effect.id)).toEqual(['carried']);
  });
  it('propagates permanent property changes and expires temporary child overlays', () => {
    const clock = createMechanicsScheduler();
    const targets = [
      target('parent', 100, ['shell', 'hidden']),
      target('child', 100, ['shell', 'hidden'])
    ];
    const runtime = createStatusRuntime(clock, targets);
    const effect: StatusEffect = {
      kind: 'property',
      id: 'cleanse',
      durationSeconds: null,
      immuneTo: [],
      stacking: policy,
      removeTags: ['shell'],
      addTags: [],
      propagation: { overrideDistributionBlocker: false }
    };
    runtime.apply('source', 'parent', effect);
    runtime.apply('source', 'parent', { ...effect, removeTags: ['hidden'] });
    runtime.apply('source', 'parent', {
      ...effect,
      id: 'mark',
      durationSeconds: 2,
      removeTags: [],
      addTags: ['marked']
    });
    expect(runtime.replace('parent', ['child']).propagated).toBe(2);
    expect(targets[1]!.tags).toEqual(['marked']);
    clock.advance(2, true);
    expect(targets[1]!.tags).toEqual([]);
  });
  it('does not turn expiry, clear, or live replacement into a destruction payload', () => {
    for (const reason of ['expiry', 'clear', 'replace']) {
      const clock = createMechanicsScheduler();
      const targets = [target('parent')];
      let payloads = 0;
      const runtime = createStatusRuntime(clock, targets, {
        destroyPayload: () => {
          payloads++;
        }
      });
      runtime.apply(
        'source',
        'parent',
        dot({ onDestroy: { damage: 7, immuneTo: [], delivery: 'callback' } })
      );
      if (reason === 'expiry') clock.advance(6, true);
      else if (reason === 'clear') runtime.clear('parent');
      else runtime.replace('parent', []);
      runtime.destroy('parent');
      expect(payloads).toBe(0);
    }
  });
  it('validates replacement references before cancelling parent statuses', () => {
    const clock = createMechanicsScheduler();
    const targets = [target('parent')];
    const runtime = createStatusRuntime(clock, targets);
    runtime.apply('source', 'parent', slow());
    expect(() => runtime.replace('parent', ['missing'])).toThrow('Unknown replacement');
    expect(() => runtime.replace('parent', ['parent'])).toThrow('distinct IDs');
    expect(runtime.snapshot('parent')[0]!.active).toHaveLength(1);
    runtime.destroy('parent');
    expect(runtime.apply('source', 'parent', slow())).toBe(false);
    runtime.clear('parent');
    expect(runtime.apply('source', 'parent', slow())).toBe(true);
  });
  it('does not replay the lethal tick when its damage callback replaces the target', () => {
    const clock = createMechanicsScheduler();
    const targets = [target('parent', 3), target('child')];
    const runtime = createStatusRuntime(clock, targets, {
      damage: (hit, amount) => {
        applyDamage(hit, amount);
        if (hit.health <= 0) runtime.destroy(hit.id, ['child']);
      }
    });
    runtime.apply(
      'source',
      'parent',
      dot({ requiresDamage: true, propagation: { overrideDistributionBlocker: false } }),
      { damageApplied: 1 }
    );
    clock.advance(2, true);
    expect(targets[0]!.health).toBe(0);
    expect(targets[1]!.health).toBe(100);
    expect(runtime.snapshot('child')[0]!.active).toHaveLength(1);
    clock.advance(4, true);
    expect(targets[1]!.health).toBe(97);
  });
});

const destructionSourceFile = process.env.BTD6_STATUS_DESTRUCTION_REFERENCE_FILE;
it.skipIf(!destructionSourceFile)(
  'feeds captured destruction damage into an explicit callback policy',
  () => {
    const reference = JSON.parse(readFileSync(destructionSourceFile!, 'utf8')) as {
      sourceFacts: { nodes: { type?: string; fields?: Record<string, unknown> }[] };
    };
    const node = reference.sourceFacts.nodes.find(
      (n) => n.type?.includes('.DamageOverTimeModel,') && n.fields?.damageOnDestroy === true
    );
    expect(node).toBeDefined();
    const fields = node!.fields!;
    const clock = createMechanicsScheduler();
    const targets = [{ id: 'parent', health: 100, x: 0, y: 0 }];
    const payloads: number[] = [];
    const runtime = createStatusRuntime(clock, targets, {
      destroyPayload: (_, amount) => {
        payloads.push(amount);
      }
    });
    runtime.apply(
      'source',
      'parent',
      dot({
        damage: Number(fields.damage),
        intervalSeconds: Number(fields.interval),
        onDestroy: { damage: Number(fields.damage), immuneTo: [], delivery: 'callback' }
      })
    );
    runtime.destroy('parent');
    expect(payloads).toEqual([fields.damage]);
    // Every captured payloadCount is zero. This check does not assign it a tick-limit meaning.
    expect(fields.payloadCount).toBe(0);
  }
);
