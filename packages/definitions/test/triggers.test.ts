import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMechanicsScheduler, eventPriority } from '../src/mechanics/scheduler.js';
import {
  createTriggerRuntime,
  type EventTrigger,
  type TriggerEvent
} from '../src/mechanics/triggers.js';

const rule = (overrides: Partial<EventTrigger> = {}): EventTrigger => ({
  id: 'response',
  event: 'leak',
  cooldownSeconds: 0,
  action: { kind: 'activate-ability', abilityId: 'shield' },
  ...overrides
});

describe('shared encounter triggers', () => {
  it('completes pre-leak reactions before the caller decides whether a leak occurred', () => {
    const clock = createMechanicsScheduler();
    let escaped = true;
    const actions: string[] = [];
    const runtime = createTriggerRuntime(clock, {
      execute: (action) => {
        actions.push(action.kind);
        escaped = false;
        return true;
      }
    });
    runtime.subscribe('guardian', rule({ event: 'pre-leak' }));
    runtime.subscribe(
      'observer',
      rule({ event: 'leak', action: { kind: 'attack', attackId: 'retaliate' } })
    );
    runtime.dispatch({ kind: 'pre-leak', targetId: 'escaping' });
    if (escaped) runtime.dispatch({ kind: 'leak', targetId: 'escaping' });
    expect(actions).toEqual(['activate-ability']);
  });

  it('keeps registration order and queues nested target events after their parent', () => {
    const clock = createMechanicsScheduler();
    const actions: string[] = [];
    const runtime = createTriggerRuntime(clock, {
      execute: (_action, event, source) => {
        actions.push(`${source}:${event.kind}`);
        if (source === 'first') runtime.dispatch({ kind: 'target-pop', targetId: 'target' });
        return true;
      }
    });
    runtime.subscribe('first', rule({ event: 'target-spawn' }));
    runtime.subscribe('second', rule({ event: 'target-spawn' }));
    runtime.subscribe('third', rule({ event: 'target-pop' }));
    runtime.dispatch({ kind: 'target-spawn', targetId: 'target' });
    expect(actions).toEqual(['first:target-spawn', 'second:target-spawn', 'third:target-pop']);
  });

  it('reports nested pre-leak dispatch as queued until the outer event completes', () => {
    let protectedTarget = false;
    const runtime = createTriggerRuntime(createMechanicsScheduler(), {
      execute: (_action, event) => {
        if (event.kind === 'target-spawn') {
          expect(runtime.dispatch({ kind: 'pre-leak', targetId: 'target' })).toBe(false);
          expect(protectedTarget).toBe(false);
        } else protectedTarget = true;
        return true;
      }
    });
    runtime.subscribe('spawn-observer', rule({ event: 'target-spawn' }));
    runtime.subscribe('guardian', rule({ event: 'pre-leak' }));
    expect(runtime.dispatch({ kind: 'target-spawn', targetId: 'target' })).toBe(true);
    expect(protectedTarget).toBe(true);
  });

  it('resets only per-round counts before simultaneous activations and retains cooldown', () => {
    const clock = createMechanicsScheduler();
    const times: number[] = [];
    const runtime = createTriggerRuntime(clock, {
      execute: () => {
        times.push(clock.now);
        return true;
      }
    });
    runtime.subscribe('source', rule({ cooldownSeconds: 5, maxPerRound: 1 }));
    runtime.dispatch({ kind: 'round-start', round: 1 });
    runtime.dispatch({ kind: 'leak' });
    runtime.schedule(5, { kind: 'leak' });
    runtime.schedule(5, { kind: 'round-start', round: 2 });
    runtime.schedule(6, { kind: 'round-start', round: 3 });
    runtime.schedule(6, { kind: 'leak' });
    runtime.schedule(10, { kind: 'leak' });
    clock.advance(10, true);
    expect(times).toEqual([0, 5, 10]);
    expect(runtime.snapshot().subscriptions[0]).toMatchObject({ readyAt: 15, usedThisRound: 1 });
  });

  it('does not repeat round-end expiry or reset a limit on duplicate/stale boundaries', () => {
    const clock = createMechanicsScheduler();
    const actions: string[] = [];
    const runtime = createTriggerRuntime(clock, {
      execute: (_action, event) => {
        actions.push(event.kind);
        return true;
      }
    });
    runtime.subscribe('source', rule({ maxPerRound: 1 }));
    runtime.subscribe('expiry', rule({ event: 'round-end' }));
    runtime.dispatch({ kind: 'round-start', round: 2 });
    runtime.dispatch({ kind: 'leak' });
    runtime.dispatch({ kind: 'round-start', round: 2 });
    runtime.dispatch({ kind: 'round-start', round: 1 });
    runtime.dispatch({ kind: 'leak' });
    runtime.dispatch({ kind: 'round-end', round: 1 });
    runtime.dispatch({ kind: 'round-end', round: 2 });
    runtime.dispatch({ kind: 'round-end', round: 2 });
    expect(actions).toEqual(['leak', 'round-end']);
  });

  it('checks factual conditions and current eligibility without consuming rejected attempts', () => {
    const clock = createMechanicsScheduler();
    let enabled = false;
    let accepted = false;
    let calls = 0;
    const runtime = createTriggerRuntime(clock, {
      eligible: () => enabled,
      execute: () => {
        calls++;
        return accepted;
      }
    });
    runtime.subscribe(
      'source',
      rule({
        event: 'lives-lost',
        cooldownSeconds: 10,
        maxPerRound: 1,
        condition: {
          requiresTargetTags: ['large'],
          excludesTargetTags: ['shielded'],
          minLivesLost: 2
        }
      })
    );
    const event: TriggerEvent = { kind: 'lives-lost', targetTags: ['large'], livesLost: 2 };
    runtime.dispatch(event);
    enabled = true;
    runtime.dispatch({ ...event, targetTags: ['large', 'shielded'] });
    runtime.dispatch({ ...event, targetTags: [] });
    runtime.dispatch({ ...event, livesLost: 1 });
    runtime.dispatch({ kind: 'lives-lost', targetTags: ['large'] });
    expect(calls).toBe(0);
    runtime.dispatch(event);
    expect(runtime.snapshot().subscriptions[0]).toMatchObject({ usedThisRound: 0, readyAt: 0 });
    accepted = true;
    runtime.dispatch(event);
    runtime.dispatch(event);
    expect(calls).toBe(2);
  });

  it('expires a temporary modifier on the shared clock before an activation at its boundary', () => {
    const clock = createMechanicsScheduler();
    let multiplier = 1;
    const observed: number[] = [];
    const runtime = createTriggerRuntime(clock, {
      execute: (action) => {
        if (action.kind !== 'apply-modifier') return false;
        observed.push(multiplier);
        multiplier = 0.7;
        clock.schedule(clock.now + action.durationSeconds, eventPriority.expire, () => {
          multiplier = 1;
        });
        return true;
      }
    });
    runtime.subscribe(
      'source',
      rule({
        event: 'lives-lost',
        cooldownSeconds: 3,
        action: { kind: 'apply-modifier', modifierId: 'haste', durationSeconds: 3 }
      })
    );
    runtime.dispatch({ kind: 'lives-lost', livesLost: 1 });
    expect(multiplier).toBe(0.7);
    runtime.schedule(3, { kind: 'lives-lost', livesLost: 1 });
    clock.advance(3, true);
    expect(observed).toEqual([1, 1]);
    clock.advance(6, true);
    expect(multiplier).toBe(1);
  });

  it('cancels a removed source mid-event and defers new subscriptions until the next event', () => {
    const clock = createMechanicsScheduler();
    const sources: string[] = [];
    const runtime = createTriggerRuntime(clock, {
      execute: (_action, _event, source) => {
        sources.push(source);
        if (source === 'first') {
          runtime.clear('removed');
          runtime.subscribe('added', rule());
        }
        return true;
      }
    });
    const cancel = runtime.subscribe('first', rule());
    runtime.subscribe('removed', rule());
    runtime.dispatch({ kind: 'leak' });
    cancel();
    runtime.dispatch({ kind: 'leak' });
    expect(sources).toEqual(['first', 'added']);
  });

  it('cancels queued events explicitly and clears all scheduled work', () => {
    const clock = createMechanicsScheduler();
    let calls = 0;
    const runtime = createTriggerRuntime(clock, {
      execute: () => {
        calls++;
        return true;
      }
    });
    runtime.subscribe('source', rule());
    runtime.schedule(1, { kind: 'leak' })();
    runtime.schedule(2, { kind: 'leak' });
    runtime.clear();
    runtime.subscribe('replacement', rule());
    clock.advance(3, true);
    expect(calls).toBe(0);
  });

  it('bounds zero-cooldown event cycles and remains usable after a callback error', () => {
    const clock = createMechanicsScheduler();
    const runtime = createTriggerRuntime(
      clock,
      {
        execute: () => {
          runtime.dispatch({ kind: 'leak' });
          return true;
        }
      },
      4
    );
    const cancel = runtime.subscribe('source', rule());
    expect(() => runtime.dispatch({ kind: 'leak' })).toThrow('dispatch budget');
    expect(runtime.snapshot().subscriptions[0]!.usedThisRound).toBe(4);
    cancel();
    expect(() => runtime.dispatch({ kind: 'leak' })).not.toThrow();
    const failure = createTriggerRuntime(clock, {
      execute: () => {
        throw new Error('partial effect');
      }
    });
    failure.subscribe('source', rule({ maxPerRound: 1 }));
    expect(() => failure.dispatch({ kind: 'leak' })).toThrow('partial effect');
    expect(() => failure.dispatch({ kind: 'leak' })).not.toThrow();
  });

  it('rejects malformed rules, duplicate identities, and invalid boundary events', () => {
    const runtime = createTriggerRuntime(createMechanicsScheduler(), { execute: () => true });
    expect(() => runtime.subscribe('source', rule({ cooldownSeconds: -1 }))).toThrow(
      'Invalid event trigger'
    );
    runtime.subscribe('source', rule());
    expect(() => runtime.subscribe('source', rule())).toThrow('Duplicate');
    expect(() => runtime.dispatch({ kind: 'round-start' })).toThrow('Invalid trigger event');
    expect(() => runtime.dispatch({ kind: 'leak', livesLost: NaN })).toThrow(
      'Invalid trigger event'
    );
  });
});

// Optional private scalar verification. Public fixtures above are synthetic.
const sourceFile = process.env.BTD6_TRIGGER_REFERENCE_FILE;
it.skipIf(!sourceFile)('executes captured automatic ability event flags and cooldown', () => {
  const reference = JSON.parse(readFileSync(sourceFile!, 'utf8')) as {
    sourceFacts: { nodes: { type?: string; fields?: Record<string, unknown> }[] };
  };
  const node = reference.sourceFacts.nodes.find(
    (n) =>
      n.type?.includes('.AbilityModel,') &&
      (n.fields?.activateOnPreLeak ||
        n.fields?.activateOnLeak ||
        n.fields?.activateOnLivesLost ||
        n.fields?.activateOnRoundEnd)
  );
  expect(node).toBeDefined();
  const fields = node!.fields!;
  const mapping = {
    activateOnPreLeak: 'pre-leak',
    activateOnLeak: 'leak',
    activateOnLivesLost: 'lives-lost',
    activateOnRoundEnd: 'round-end'
  } as const;
  const clock = createMechanicsScheduler();
  let count = 0;
  const runtime = createTriggerRuntime(clock, {
    execute: () => {
      count++;
      return true;
    }
  });
  const cooldown = Number(fields.Cooldown ?? fields.cooldown);
  for (const [flag, event] of Object.entries(mapping)) {
    if (!fields[flag]) continue;
    runtime.subscribe('captured', rule({ id: flag, event, cooldownSeconds: cooldown }));
    runtime.dispatch({ kind: 'round-start', round: 1 });
    runtime.dispatch({ kind: event, round: 1, livesLost: 1 });
    expect(runtime.snapshot().subscriptions.find((s) => s.id === flag)!.readyAt).toBe(
      clock.now + cooldown
    );
  }
  expect(count).toBe(Object.keys(mapping).filter((flag) => fields[flag]).length);
});

const buffSourceFile = process.env.BTD6_TRIGGER_BUFF_REFERENCE_FILE;
it.skipIf(!buffSourceFile)(
  'executes captured leak buff duration and cooldown under a declared frame normalization',
  () => {
    const reference = JSON.parse(readFileSync(buffSourceFile!, 'utf8')) as {
      sourceFacts: { nodes: { type?: string; fields?: Record<string, unknown> }[] };
    };
    const node = reference.sourceFacts.nodes.find((n) =>
      n.type?.includes('.VigilanteTowerBehaviorModel,')
    );
    expect(node).toBeDefined();
    const fields = node!.fields!;
    // This fixture declares 60 source frames per second. The capture alone does not prove that rate.
    const framesPerSecond = 60;
    const duration = Number(fields.loseLifeBuffDurationFrames) / framesPerSecond;
    const cooldown = Number(fields.loseLifeBuffCooldownFrames) / framesPerSecond;
    const clock = createMechanicsScheduler();
    let applications = 0;
    let buff: { attackSpeed: number; range: number } | null = null;
    const runtime = createTriggerRuntime(clock, {
      execute: (action) => {
        if (action.kind !== 'apply-modifier') return false;
        applications++;
        buff = {
          attackSpeed: Number(fields.loseLifeAttackSpeedBuff),
          range: Number(fields.loseLifeRangeBuff)
        };
        clock.schedule(clock.now + action.durationSeconds, eventPriority.expire, () => {
          buff = null;
        });
        return true;
      }
    });
    runtime.subscribe(
      'captured',
      rule({
        event: 'lives-lost',
        cooldownSeconds: cooldown,
        condition: { minLivesLost: 1 },
        action: { kind: 'apply-modifier', modifierId: 'captured-buff', durationSeconds: duration }
      })
    );
    runtime.dispatch({ kind: 'lives-lost', livesLost: 1 });
    expect(buff).toEqual({
      attackSpeed: fields.loseLifeAttackSpeedBuff,
      range: fields.loseLifeRangeBuff
    });
    clock.advance(duration, true);
    expect(buff).toBeNull();
    runtime.dispatch({ kind: 'lives-lost', livesLost: 1 });
    expect(applications).toBe(1);
    clock.advance(cooldown, true);
    runtime.dispatch({ kind: 'lives-lost', livesLost: 1 });
    expect(applications).toBe(2);
  }
);
