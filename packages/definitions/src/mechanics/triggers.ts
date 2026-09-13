import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { eventPriority, type MechanicsScheduler } from './scheduler.js';

const object = <T extends Record<string, TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });
const id = Type.String({ minLength: 1, maxLength: 128 });
const nonnegative = Type.Number({ minimum: 0, maximum: 1e9 });
const tags = Type.Array(id, { uniqueItems: true, maxItems: 64 });
export const triggerEventKindSchema = Type.Union(
  (
    [
      'round-start',
      'round-end',
      'pre-leak',
      'leak',
      'lives-lost',
      'target-spawn',
      'target-pop'
    ] as const
  ).map((kind) => Type.Literal(kind))
);
export const triggerActionSchema = Type.Union([
  object({ kind: Type.Literal('activate-ability'), abilityId: id }),
  object({
    kind: Type.Literal('spawn-actor'),
    actorId: id,
    lifetimeSeconds: nonnegative,
    suppressParentAttacks: Type.Optional(Type.Boolean())
  }),
  object({ kind: Type.Literal('apply-modifier'), modifierId: id, durationSeconds: nonnegative }),
  object({ kind: Type.Literal('attack'), attackId: id })
]);
export const eventTriggerSchema = object({
  id,
  event: triggerEventKindSchema,
  cooldownSeconds: nonnegative,
  maxPerRound: Type.Optional(Type.Integer({ minimum: 0, maximum: 1e9 })),
  condition: Type.Optional(
    object({
      requiresTargetTags: Type.Optional(tags),
      excludesTargetTags: Type.Optional(tags),
      minLivesLost: Type.Optional(nonnegative)
    })
  ),
  action: triggerActionSchema
});
export type EventTrigger = Static<typeof eventTriggerSchema>;
export type TriggerAction = Static<typeof triggerActionSchema>;
export type TriggerEventKind = Static<typeof triggerEventKindSchema>;
export interface TriggerEvent {
  kind: TriggerEventKind;
  /** Required for round boundaries. Round numbers must increase on round-start. */
  round?: number;
  targetId?: string;
  targetTags?: string[];
  livesLost?: number;
}
export interface TriggerCallbacks {
  /** False means no action occurred. Exceptions consume the allowance and propagate. */
  execute: (action: TriggerAction, event: TriggerEvent, sourceId: string) => boolean;
  eligible?: (trigger: EventTrigger, event: TriggerEvent, sourceId: string) => boolean;
}
interface Subscription {
  sourceId: string;
  rule: EventTrigger;
  readyAt: number;
  usedThisRound: number;
  active: boolean;
}

/** Adapters emit encounter facts and execute actions. This runtime invents no target policy.
 * Top-level dispatch completes synchronously, including pre-leak reactions, and returns true.
 * Nested dispatch returns false and queues its event after every subscriber to the parent.
 * Decisions dependent on those reactions must wait for the outer dispatch to return.
 * Scheduled boundaries reset round limits
 * before scheduled activations; cooldowns carry across rounds. Callbacks must not advance
 * the shared clock. Subscriptions added during an event first observe the next event.
 */
export function createTriggerRuntime(
  clock: Pick<MechanicsScheduler, 'now' | 'schedule'>,
  callbacks: TriggerCallbacks,
  maxDispatchEvents = 10000
) {
  if (!Number.isInteger(maxDispatchEvents) || maxDispatchEvents < 1)
    throw new Error('Invalid trigger dispatch budget.');
  const subscriptions = new Set<Subscription>();
  const scheduled = new Set<() => void>();
  const pending: TriggerEvent[] = [];
  let dispatching = false;
  let round: number | null = null;
  let roundEnded = false;

  function validate(event: TriggerEvent) {
    if (
      !Value.Check(triggerEventKindSchema, event.kind) ||
      ((event.kind === 'round-start' || event.kind === 'round-end') &&
        (!Number.isInteger(event.round) || event.round! < 0)) ||
      (event.targetTags !== undefined && !Value.Check(tags, event.targetTags)) ||
      (event.targetId !== undefined && !Value.Check(id, event.targetId)) ||
      (event.livesLost !== undefined && !Value.Check(nonnegative, event.livesLost))
    )
      throw new Error('Invalid trigger event.');
  }

  function dispatch(input: TriggerEvent) {
    validate(input);
    if (pending.length >= maxDispatchEvents) throw new Error('Trigger dispatch budget exceeded.');
    pending.push(structuredClone(input));
    if (dispatching) return false;
    dispatching = true;
    let processed = 0;
    try {
      while (pending.length) {
        if (++processed > maxDispatchEvents) throw new Error('Trigger dispatch budget exceeded.');
        const event = pending.shift()!;
        if (event.kind === 'round-start') {
          // Repeated/stale boundary notifications cannot refresh limits or repeat actions.
          if (round !== null && event.round! <= round) continue;
          round = event.round!;
          roundEnded = false;
          for (const subscription of subscriptions) subscription.usedThisRound = 0;
        } else if (event.kind === 'round-end') {
          if (event.round !== round || roundEnded) continue;
          roundEnded = true;
        }
        for (const subscription of [...subscriptions]) {
          const { rule, sourceId } = subscription;
          if (
            !subscription.active ||
            rule.event !== event.kind ||
            clock.now < subscription.readyAt ||
            subscription.usedThisRound >= (rule.maxPerRound ?? Infinity)
          )
            continue;
          const condition = rule.condition;
          if (
            condition?.requiresTargetTags?.some((tag) => !event.targetTags?.includes(tag)) ||
            condition?.excludesTargetTags?.some((tag) => event.targetTags?.includes(tag)) ||
            (condition?.minLivesLost !== undefined &&
              (event.livesLost === undefined || event.livesLost < condition.minLivesLost)) ||
            (callbacks.eligible && !callbacks.eligible(rule, event, sourceId)) ||
            !subscription.active
          )
            continue;
          const previousReadyAt = subscription.readyAt;
          subscription.readyAt = clock.now + rule.cooldownSeconds;
          subscription.usedThisRound++;
          // Reserve before user code. A thrown callback may already have applied effects.
          if (!callbacks.execute(rule.action, event, sourceId)) {
            subscription.readyAt = previousReadyAt;
            subscription.usedThisRound--;
          }
        }
      }
    } finally {
      pending.length = 0;
      dispatching = false;
    }
    return true;
  }

  return {
    subscribe(sourceId: string, input: EventTrigger) {
      if (!Value.Check(id, sourceId) || !Value.Check(eventTriggerSchema, input))
        throw new Error('Invalid event trigger.');
      if ([...subscriptions].some((s) => s.sourceId === sourceId && s.rule.id === input.id))
        throw new Error('Duplicate event trigger for source.');
      const subscription: Subscription = {
        sourceId,
        rule: structuredClone(input),
        readyAt: clock.now,
        usedThisRound: 0,
        active: true
      };
      subscriptions.add(subscription);
      return () => {
        subscription.active = false;
        subscriptions.delete(subscription);
      };
    },
    dispatch,
    schedule(at: number, input: TriggerEvent) {
      validate(input);
      const event = structuredClone(input);
      const cancelEvent = clock.schedule(
        at,
        event.kind === 'round-start' || event.kind === 'round-end'
          ? eventPriority.round
          : eventPriority.activation,
        () => {
          scheduled.delete(cancel);
          dispatch(event);
        }
      );
      const cancel = () => {
        cancelEvent();
        scheduled.delete(cancel);
      };
      scheduled.add(cancel);
      return cancel;
    },
    /** Removing a source also disables its remaining callbacks in the current event. */
    clear(sourceId?: string) {
      for (const subscription of subscriptions) {
        if (sourceId === undefined || subscription.sourceId === sourceId) {
          subscription.active = false;
          subscriptions.delete(subscription);
        }
      }
      if (sourceId === undefined) {
        for (const cancel of scheduled) cancel();
        pending.length = 0;
      }
    },
    snapshot() {
      return {
        round,
        roundEnded,
        subscriptions: [...subscriptions].map(({ sourceId, rule, readyAt, usedThisRound }) => ({
          sourceId,
          id: rule.id,
          readyAt,
          usedThisRound
        }))
      };
    }
  };
}
export type TriggerRuntime = ReturnType<typeof createTriggerRuntime>;
