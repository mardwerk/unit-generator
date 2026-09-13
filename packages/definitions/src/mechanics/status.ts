import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { applyDamage, type CombatTarget } from './combat.js';
import { eventPriority, type MechanicsScheduler } from './scheduler.js';

const object = <T extends Record<string, TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });
const id = Type.String({ minLength: 1, maxLength: 128 });
const nonnegative = Type.Number({ minimum: 0, maximum: 1e9 });
const positive = Type.Number({ exclusiveMinimum: 0, maximum: 1e9 });
const tags = Type.Array(id, { maxItems: 64, uniqueItems: true });
const stacking = object({
  scope: Type.Union([Type.Literal('source'), Type.Literal('target')]),
  reapply: Type.Union(['refresh', 'keep', 'extend', 'stack'].map((v) => Type.Literal(v))),
  maxStacks: Type.Integer({ minimum: 1, maximum: 256 })
});
const common = {
  id,
  durationSeconds: positive,
  immuneTo: tags,
  requiresTags: Type.Optional(tags),
  requiresDamage: Type.Optional(Type.Boolean()),
  stacking,
  immunitySeconds: Type.Optional(nonnegative),
  propagation: Type.Optional(object({ overrideDistributionBlocker: Type.Boolean() }))
};
const combine = Type.Union([Type.Literal('strongest'), Type.Literal('multiply')]);
export const statusEffectSchema = Type.Union([
  object({ ...common, kind: Type.Literal('stun'), speedMultiplier: Type.Literal(0), combine }),
  object({
    ...common,
    kind: Type.Literal('slow'),
    speedMultiplier: Type.Number({ minimum: 0, maximum: 1 }),
    combine
  }),
  object({
    ...common,
    kind: Type.Literal('damage-over-time'),
    damage: nonnegative,
    intervalSeconds: positive,
    initialDelaySeconds: nonnegative,
    triggerImmediate: Type.Boolean(),
    tickOnExpiry: Type.Boolean(),
    damageImmuneTo: tags,
    refreshTicks: Type.Union([Type.Literal('preserve'), Type.Literal('restart')]),
    onDestroy: Type.Optional(
      object({
        damage: nonnegative,
        immuneTo: tags,
        delivery: Type.Union([Type.Literal('replacements'), Type.Literal('callback')])
      })
    )
  }),
  object({
    ...common,
    kind: Type.Literal('damage-taken'),
    additive: nonnegative,
    multiplier: Type.Number({ minimum: 1, maximum: 1000 }),
    combine
  }),
  object({
    ...common,
    durationSeconds: Type.Union([positive, Type.Null()]),
    kind: Type.Literal('property'),
    addTags: tags,
    removeTags: tags,
    concealed: Type.Optional(Type.Boolean())
  })
]);
export type StatusEffect = Static<typeof statusEffectSchema>;
export interface StatusApplicationContext {
  damageApplied?: number;
}
export interface StatusSnapshot {
  targetId: string;
  tags: string[];
  speedMultiplier: number;
  damageTakenAdditive: number;
  damageTakenMultiplier: number;
  movementPreventedSeconds: number;
  controlledSeconds: number;
  immunity: { id: string; sourceId: string | null; until: number }[];
  active: { sourceId: string; effect: StatusEffect; expiresAt: number | null }[];
}
export interface StatusCallbacks<T extends CombatTarget> {
  eligible?: (target: T, effect: StatusEffect, sourceId: string) => boolean;
  damage?: (target: T, amount: number, sourceId: string, effect: StatusEffect) => void;
  changed?: (target: T, state: StatusSnapshot) => void;
  destroyPayload?: (
    target: T,
    amount: number,
    sourceId: string,
    effect: StatusEffect,
    replacements: T[]
  ) => void;
}
interface Entry {
  key: string;
  sourceId: string;
  effect: StatusEffect;
  expiresAt: number;
  cancelExpiry?: () => void;
  cancelTick?: () => void;
  nextTickAt?: number;
}
interface State<T> {
  target: T;
  entries: Entry[];
  permanent: Entry[];
  immunity: Map<string, number>;
  baseTags: Set<string>;
  baseConcealed: boolean | undefined;
  baseDamageTaken: CombatTarget['damageTaken'];
  lastAt: number;
  prevented: number;
  controlled: number;
}

/** The adapter supplies effect policy. `extend` retains the later expiry; it does not add durations.
 * Different status IDs combine multiplicatively. `strongest` selects within one status ID,
 * including instances from different sources. Statuses use seconds on the shared clock.
 */
export function createStatusRuntime<T extends CombatTarget>(
  clock: Pick<MechanicsScheduler, 'now' | 'schedule'>,
  targets: T[],
  callbacks: StatusCallbacks<T> = {}
) {
  const states = new Map<string, State<T>>();
  const ended = new Set<string>();
  const stateFor = (targetId: string) => {
    const target = targets.find((t) => t.id === targetId);
    if (!target) return undefined;
    let state = states.get(targetId);
    if (!state) {
      state = {
        target,
        entries: [],
        permanent: [],
        immunity: new Map(),
        baseTags: new Set(target.tags ?? []),
        baseConcealed: target.concealed,
        baseDamageTaken: target.damageTaken ? { ...target.damageTaken } : undefined,
        lastAt: clock.now,
        prevented: 0,
        controlled: 0
      };
      states.set(targetId, state);
    }
    return state;
  };
  function totals(state: State<T>) {
    const groups = new Map<string, Entry[]>();
    for (const entry of state.entries) {
      const group = groups.get(entry.effect.id) ?? [];
      group.push(entry);
      groups.set(entry.effect.id, group);
    }
    let speedMultiplier = 1;
    let damageTakenAdditive = 0;
    let damageTakenMultiplier = 1;
    for (const group of groups.values()) {
      const movement = group
        .map((e) => e.effect)
        .filter((e) => e.kind === 'stun' || e.kind === 'slow');
      if (movement.length) {
        speedMultiplier *=
          movement[0]!.combine === 'strongest'
            ? Math.min(...movement.map((e) => e.speedMultiplier))
            : movement.reduce((product, e) => product * e.speedMultiplier, 1);
      }
      const damage = group.map((e) => e.effect).filter((e) => e.kind === 'damage-taken');
      if (damage.length) {
        const strongest = damage[0]!.combine === 'strongest';
        damageTakenAdditive += strongest
          ? Math.max(...damage.map((e) => e.additive))
          : damage.reduce((sum, e) => sum + e.additive, 0);
        damageTakenMultiplier *= strongest
          ? Math.max(...damage.map((e) => e.multiplier))
          : damage.reduce((product, e) => product * e.multiplier, 1);
      }
    }
    return { speedMultiplier, damageTakenAdditive, damageTakenMultiplier };
  }
  function settle(state: State<T>, at = clock.now) {
    const speed = state.target.health > 0 ? totals(state).speedMultiplier : 1;
    state.prevented += Math.max(0, at - state.lastAt) * (1 - speed);
    state.controlled += Math.max(0, at - state.lastAt) * (speed < 1 ? 1 : 0);
    state.lastAt = at;
  }
  function snapshotState(state: State<T>): StatusSnapshot {
    const speed = state.target.health > 0 ? totals(state).speedMultiplier : 1;
    return {
      targetId: state.target.id,
      tags: [...(state.target.tags ?? [])],
      ...totals(state),
      movementPreventedSeconds: state.prevented + (clock.now - state.lastAt) * (1 - speed),
      controlledSeconds: state.controlled + (clock.now - state.lastAt) * (speed < 1 ? 1 : 0),
      immunity: [...state.immunity]
        .filter(([, until]) => until > clock.now)
        .map(([key, until]) => {
          const [id, sourceId] = JSON.parse(key) as [string, string | null];
          return { id, sourceId, until };
        }),
      active: state.entries.map((e) => ({
        sourceId: e.sourceId,
        effect: structuredClone(e.effect),
        expiresAt: Number.isFinite(e.expiresAt) ? e.expiresAt : null
      }))
    };
  }
  function properties(state: State<T>) {
    const next = new Set(state.baseTags);
    let concealed = state.baseConcealed;
    for (const { effect } of state.entries) {
      if (effect.kind !== 'property') continue;
      for (const tag of effect.removeTags) next.delete(tag);
      for (const tag of effect.addTags) next.add(tag);
      if (effect.concealed !== undefined) concealed = effect.concealed;
    }
    state.target.tags = [...next];
    if (concealed === undefined) delete state.target.concealed;
    else state.target.concealed = concealed;
  }
  function changed(state: State<T>) {
    properties(state);
    const modifiers = totals(state);
    if (modifiers.damageTakenAdditive === 0 && modifiers.damageTakenMultiplier === 1) {
      if (state.baseDamageTaken) state.target.damageTaken = { ...state.baseDamageTaken };
      else delete state.target.damageTaken;
    } else {
      state.target.damageTaken = {
        additive: (state.baseDamageTaken?.additive ?? 0) + modifiers.damageTakenAdditive,
        multiplier: (state.baseDamageTaken?.multiplier ?? 1) * modifiers.damageTakenMultiplier
      };
    }
    callbacks.changed?.(state.target, snapshotState(state));
  }
  function remove(state: State<T>, entry: Entry, expired: boolean) {
    settle(state);
    entry.cancelExpiry?.();
    entry.cancelTick?.();
    state.entries = state.entries.filter((e) => e !== entry);
    if (expired && entry.effect.immunitySeconds) {
      state.immunity.set(
        entry.key,
        Math.max(state.immunity.get(entry.key) ?? 0, entry.expiresAt + entry.effect.immunitySeconds)
      );
    }
    changed(state);
  }
  function expire(state: State<T>, entry: Entry) {
    if (Number.isFinite(entry.expiresAt)) {
      entry.cancelExpiry = clock.schedule(entry.expiresAt, eventPriority.expire, () =>
        remove(state, entry, true)
      );
    }
  }
  function tick(state: State<T>, entry: Entry, at: number) {
    const effect = entry.effect;
    entry.nextTickAt = at;
    if (
      effect.kind !== 'damage-over-time' ||
      at > entry.expiresAt ||
      (at === entry.expiresAt && !effect.tickOnExpiry)
    )
      return;
    entry.cancelTick = clock.schedule(
      at,
      effect.tickOnExpiry && at === entry.expiresAt
        ? eventPriority.expire - 1
        : eventPriority.impact,
      () => {
        entry.cancelTick = undefined;
        if (!state.entries.includes(entry)) return;
        const current = entry.effect;
        if (current.kind !== 'damage-over-time') return;
        // A replacement caused by this tick inherits the next tick, never this consumed one.
        entry.nextTickAt = clock.now + current.intervalSeconds;
        if (
          state.target.health > 0 &&
          !state.target.invulnerable &&
          !current.damageImmuneTo.some((tag) => state.target.tags?.includes(tag)) &&
          (!callbacks.eligible || callbacks.eligible(state.target, current, entry.sourceId))
        ) {
          settle(state);
          if (callbacks.damage)
            callbacks.damage(state.target, current.damage, entry.sourceId, current);
          else applyDamage(state.target, current.damage);
        }
        if (state.entries.includes(entry)) tick(state, entry, clock.now + current.intervalSeconds);
      }
    );
  }
  function startTicks(state: State<T>, entry: Entry) {
    const effect = entry.effect;
    if (effect.kind === 'damage-over-time') {
      tick(
        state,
        entry,
        clock.now +
          effect.initialDelaySeconds +
          (effect.triggerImmediate ? 0 : effect.intervalSeconds)
      );
    }
  }
  function applyStatus(
    sourceId: string,
    targetId: string,
    input: StatusEffect,
    context: StatusApplicationContext = {},
    inherited?: Entry
  ) {
    if (!Value.Check(statusEffectSchema, input)) throw new Error('Invalid status effect.');
    const effect = structuredClone(input);
    if (
      effect.kind === 'damage-over-time' &&
      effect.onDestroy?.delivery === 'callback' &&
      !callbacks.destroyPayload
    )
      throw new Error('Callback destruction payload requires a destroyPayload handler.');
    if (inherited && effect.durationSeconds !== null)
      effect.durationSeconds = inherited.expiresAt - clock.now;
    const state = stateFor(targetId);
    if (!state || ended.has(targetId) || state.target.health <= 0 || state.target.invulnerable)
      return false;
    // Callers can apply at an exclusive scheduler boundary before queued expiry callbacks run.
    for (const entry of [...state.entries])
      if (entry.expiresAt <= clock.now) remove(state, entry, true);
    if (
      effect.immuneTo.some((tag) => state.target.tags?.includes(tag)) ||
      effect.requiresTags?.some((tag) => !state.target.tags?.includes(tag)) ||
      (effect.requiresDamage &&
        !inherited &&
        !(context.damageApplied && context.damageApplied > 0)) ||
      (callbacks.eligible && !callbacks.eligible(state.target, effect, sourceId))
    )
      return false;
    const key = JSON.stringify([effect.id, effect.stacking.scope === 'source' ? sourceId : null]);
    if ((state.immunity.get(key) ?? 0) > clock.now) return false;
    const sameId = state.entries.filter((entry) => entry.effect.id === effect.id);
    if (
      sameId.some(
        (entry) =>
          entry.effect.kind !== effect.kind ||
          entry.effect.stacking.scope !== effect.stacking.scope ||
          entry.effect.stacking.reapply !== effect.stacking.reapply ||
          entry.effect.stacking.maxStacks !== effect.stacking.maxStacks ||
          ('combine' in entry.effect &&
            'combine' in effect &&
            entry.effect.combine !== effect.combine)
      )
    )
      throw new Error('One status ID must use one kind and stacking policy.');
    const matching = sameId.filter((entry) => entry.key === key);
    const existing = matching[0];
    if (existing && effect.stacking.reapply === 'keep') return false;
    if (effect.stacking.reapply === 'stack' && matching.length >= effect.stacking.maxStacks)
      return false;
    settle(state);
    const expiresAt =
      effect.durationSeconds === null ? Infinity : clock.now + effect.durationSeconds;
    if (effect.kind === 'property' && effect.durationSeconds === null) {
      for (const tag of effect.removeTags) state.baseTags.delete(tag);
      for (const tag of effect.addTags) state.baseTags.add(tag);
      if (effect.concealed !== undefined) state.baseConcealed = effect.concealed;
      if (effect.propagation) {
        const previous = state.permanent.find((entry) => entry.key === key)?.effect;
        const inheritedEffect = structuredClone(effect);
        if (previous?.kind === 'property') {
          inheritedEffect.removeTags = [
            ...new Set([...previous.removeTags, ...effect.removeTags])
          ].filter((tag) => !effect.addTags.includes(tag));
          inheritedEffect.addTags = [
            ...new Set([
              ...previous.addTags.filter((tag) => !effect.removeTags.includes(tag)),
              ...effect.addTags
            ])
          ];
          if (inheritedEffect.concealed === undefined && previous.concealed !== undefined)
            inheritedEffect.concealed = previous.concealed;
        }
        state.permanent = state.permanent.filter((entry) => entry.key !== key);
        state.permanent.push({ key, sourceId, effect: inheritedEffect, expiresAt: Infinity });
      }
      changed(state);
      return true;
    }
    if (existing && effect.stacking.reapply !== 'stack') {
      existing.cancelExpiry?.();
      existing.expiresAt =
        effect.stacking.reapply === 'extend' ? Math.max(existing.expiresAt, expiresAt) : expiresAt;
      existing.effect = effect;
      existing.sourceId = sourceId;
      expire(state, existing);
      if (effect.kind === 'damage-over-time') {
        existing.cancelTick?.();
        existing.cancelTick = undefined;
        if (inherited) {
          if (inherited.nextTickAt !== undefined) tick(state, existing, inherited.nextTickAt);
        } else if (effect.refreshTicks === 'restart') startTicks(state, existing);
        else if (existing.nextTickAt !== undefined) tick(state, existing, existing.nextTickAt);
      }
    } else {
      const entry: Entry = { key, effect, sourceId, expiresAt };
      state.entries.push(entry);
      expire(state, entry);
      if (inherited) {
        if (effect.kind === 'damage-over-time' && inherited.nextTickAt !== undefined)
          tick(state, entry, inherited.nextTickAt);
      } else startTicks(state, entry);
    }
    changed(state);
    return true;
  }
  /** The caller registers replacement targets before this event and supplies the relationship.
   * Destruction payloads run after parent timers are cancelled and before statuses reach survivors.
   * Replacement preserves remaining duration and tick phase, and checks each child's immunity.
   * This contract does not infer native layer graphs or the meaning of captured payloadCount.
   */
  function endTarget(
    targetId: string,
    replacementIds: string[],
    destroyed: boolean,
    options: { distributionBlocked?: boolean }
  ) {
    if (ended.has(targetId)) return { payloads: 0, propagated: 0 };
    if (new Set(replacementIds).size !== replacementIds.length || replacementIds.includes(targetId))
      throw new Error('Replacement targets must have distinct IDs different from their parent.');
    const replacements = replacementIds.map((id) => {
      const target = targets.find((target) => target.id === id);
      if (!target) throw new Error(`Unknown replacement target: ${id}`);
      return target;
    });
    const state = stateFor(targetId);
    if (!state) return { payloads: 0, propagated: 0 };
    // Keep the source entries until target references are validated; a bad event must not erase them.
    const entries = [
      ...state.entries.filter((entry) => entry.expiresAt > clock.now),
      ...state.permanent
    ];
    settle(state);
    ended.add(targetId);
    for (const entry of state.entries) {
      entry.cancelExpiry?.();
      entry.cancelTick?.();
    }
    state.entries = [];
    state.permanent = [];
    state.immunity.clear();
    changed(state);
    let payloads = 0;
    if (destroyed)
      for (const entry of entries) {
        const effect = entry.effect;
        if (effect.kind !== 'damage-over-time' || !effect.onDestroy) continue;
        const payload = effect.onDestroy;
        if (payload.delivery === 'callback') {
          callbacks.destroyPayload!(
            state.target,
            payload.damage,
            entry.sourceId,
            structuredClone(effect),
            replacements
          );
          payloads++;
        } else
          for (const target of replacements) {
            if (
              target.health <= 0 ||
              target.invulnerable ||
              payload.immuneTo.some((tag) => target.tags?.includes(tag))
            )
              continue;
            const child = stateFor(target.id)!;
            settle(child);
            if (callbacks.damage) callbacks.damage(target, payload.damage, entry.sourceId, effect);
            else applyDamage(target, payload.damage);
            payloads++;
          }
      }
    let propagated = 0;
    for (const entry of entries) {
      if (
        !entry.effect.propagation ||
        (options.distributionBlocked && !entry.effect.propagation.overrideDistributionBlocker)
      )
        continue;
      for (const target of replacements)
        if (applyStatus(entry.sourceId, target.id, entry.effect, {}, entry)) propagated++;
    }
    return { payloads, propagated };
  }
  return {
    apply(
      sourceId: string,
      targetId: string,
      effect: StatusEffect,
      context: StatusApplicationContext = {}
    ) {
      return applyStatus(sourceId, targetId, effect, context);
    },
    destroy(
      targetId: string,
      replacementIds: string[] = [],
      options: { distributionBlocked?: boolean } = {}
    ) {
      return endTarget(targetId, replacementIds, true, options);
    },
    replace(
      targetId: string,
      replacementIds: string[],
      options: { distributionBlocked?: boolean } = {}
    ) {
      return endTarget(targetId, replacementIds, false, options);
    },
    get nextEventAt() {
      const events = [...states.values()].flatMap((state) =>
        state.entries.flatMap((entry) => [
          entry.expiresAt,
          ...(entry.cancelTick && entry.nextTickAt !== undefined ? [entry.nextTickAt] : [])
        ])
      );
      return events.length ? Math.min(...events) : Infinity;
    },
    snapshot(targetId?: string) {
      return (targetId === undefined ? targets : targets.filter((t) => t.id === targetId)).map(
        (target) => snapshotState(stateFor(target.id)!)
      );
    },
    /** Detached host-authored facts for replacement factories, without status overlays. */
    baseTarget(targetId: string): T | undefined {
      const state = stateFor(targetId);
      if (!state) return undefined;
      const target = structuredClone(state.target);
      target.tags = [...state.baseTags];
      if (state.baseConcealed === undefined) delete target.concealed;
      else target.concealed = state.baseConcealed;
      if (state.baseDamageTaken === undefined) delete target.damageTaken;
      else target.damageTaken = structuredClone(state.baseDamageTaken);
      return target;
    },
    /** Update persistent target properties beneath active temporary overlays. */
    updateProperties(targetId: string, properties: { tags?: string[]; concealed?: boolean }) {
      if (
        (properties.tags !== undefined && !Value.Check(tags, properties.tags)) ||
        (properties.concealed !== undefined && typeof properties.concealed !== 'boolean')
      )
        throw new Error('Invalid target property update.');
      const state = stateFor(targetId);
      if (!state) return false;
      if (properties.tags !== undefined) state.baseTags = new Set(properties.tags);
      if (properties.concealed !== undefined) state.baseConcealed = properties.concealed;
      changed(state);
      return true;
    },
    clear(targetId: string, sourceId?: string) {
      if (sourceId === undefined) ended.delete(targetId);
      const state = stateFor(targetId);
      if (!state) return;
      for (const key of state.immunity.keys()) {
        if (sourceId === undefined || (JSON.parse(key) as [string, string | null])[1] === sourceId)
          state.immunity.delete(key);
      }
      for (const entry of [...state.entries])
        if (sourceId === undefined || entry.sourceId === sourceId) remove(state, entry, false);
      changed(state);
    },
    /** Call before target movement/death changes if collecting control duration. */
    settle(targetId: string) {
      const state = stateFor(targetId);
      if (state) settle(state);
    }
  };
}
export type StatusRuntime = ReturnType<typeof createStatusRuntime>;
