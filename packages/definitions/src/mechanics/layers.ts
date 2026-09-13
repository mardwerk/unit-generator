import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type { CombatTarget } from './combat.js';
import { eventPriority, type MechanicsScheduler } from './scheduler.js';

const id = Type.String({ minLength: 1, maxLength: 128 });
const positive = Type.Number({ exclusiveMinimum: 0, maximum: 1e9 });
const options = { additionalProperties: false };
export const layerProfileSchema = Type.Object(
  {
    id,
    maximumHealth: positive,
    children: Type.Array(id, { maxItems: 256 }),
    distributeDamageToChildren: Type.Boolean(),
    regrowth: Type.Optional(Type.Object({ toProfileId: id, intervalSeconds: positive }, options))
  },
  options
);
export const layerDamagePolicySchema = Type.Object(
  {
    distribute: Type.Boolean(),
    overrideBlocker: Type.Boolean(),
    allocation: Type.Union([
      Type.Literal('sequential'),
      Type.Literal('copy'),
      Type.Literal('split')
    ])
  },
  options
);
export const layerRegrowthPolicySchema = Type.Object(
  {
    ceilingProfileId: id,
    clock: Type.Union([Type.Literal('periodic'), Type.Literal('after-damage')]),
    health: Type.Union([Type.Literal('full'), Type.Literal('preserve-fraction')])
  },
  options
);
export type LayerProfile = Static<typeof layerProfileSchema>;
export type LayerDamagePolicy = Static<typeof layerDamagePolicySchema>;
export type LayerRegrowthPolicy = Static<typeof layerRegrowthPolicySchema>;
export interface LayerDamageResult {
  amount: number;
  applied: number;
}
export interface LayerDamageOutcome {
  replaced: boolean;
  totalApplied: number;
  replacementIds: string[];
}
export interface LayerRegistration<T extends CombatTarget> {
  target: T;
  profileId: string;
  regrowth?: LayerRegrowthPolicy;
  growthAt?: number;
}
export interface LayerHooks<T extends CombatTarget, C = unknown> {
  /** Construct from a detached parent without host side effects; the runtime sets profile health. */
  createTarget: (profile: LayerProfile, parent: T) => T;
  /** Check the complete child batch against host facts before any layer transition commits. */
  validateReplacement?: (parent: T, children: T[]) => void;
  /** Register children with the combat/status engine before returning. Regrowth is not a pop. */
  replaceTarget: (parent: T, children: T[], reason: 'destroyed' | 'regrown') => void;
  /** Apply and record already resolved overflow. Do not call afterDamage from this callback. */
  damage: (target: T, resolvedAmount: number, context: C | undefined) => LayerDamageResult;
  /** A blocked growth tick is skipped; the next attempt uses the current profile's interval. */
  canRegrow?: (target: T) => boolean;
}
interface LayerState<T> {
  target: T;
  profile: LayerProfile;
  regrowth?: LayerRegrowthPolicy;
  nextGrowthAt?: number;
  cancelGrowth?: () => void;
  retired: boolean;
  replacementIds: string[];
}

/** Explicit layer profiles run on the common clock. This does not infer a native graph,
 * overflow allocation, damage recalculation, growth ceiling, or growth timer policy.
 * The host calls afterDamage once after the common combat operation; layer overflow is
 * already resolved damage, so the host must not reapply attacker flat/multiplier bonuses.
 */
export function createLayerRuntime<T extends CombatTarget, C = unknown>(
  clock: Pick<MechanicsScheduler, 'now' | 'schedule'>,
  inputProfiles: LayerProfile[],
  hooks: LayerHooks<T, C>,
  maxTransitions = 10000
) {
  if (!Number.isInteger(maxTransitions) || maxTransitions < 1)
    throw new Error('Invalid layer transition budget.');
  if (inputProfiles.length > 1024) throw new Error('Layer profile budget exceeded.');
  const profiles = new Map<string, LayerProfile>();
  for (const input of inputProfiles) {
    if (!Value.Check(layerProfileSchema, input) || profiles.has(input.id))
      throw new Error('Invalid or duplicate layer profile.');
    profiles.set(input.id, structuredClone(input));
  }
  for (const profile of profiles.values()) {
    for (const child of [
      ...profile.children,
      ...(profile.regrowth ? [profile.regrowth.toProfileId] : [])
    ])
      if (!profiles.has(child)) throw new Error(`Unknown layer profile: ${child}`);
  }
  // Child cycles would turn one hit into an unbounded sequence of replacements.
  const visited = new Set<string>(),
    visiting = new Set<string>();
  function validateChildren(id: string) {
    if (visiting.has(id)) throw new Error('Layer child graph contains a cycle.');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const child of profiles.get(id)!.children) validateChildren(child);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of profiles.keys()) validateChildren(id);
  const states = new Map<string, LayerState<T>>();
  let transitions = 0;
  function consumeTransition() {
    if (transitions >= maxTransitions) throw new Error('Layer transition budget exceeded.');
    transitions++;
  }
  function profileFor(id: string) {
    const profile = profiles.get(id);
    if (!profile) throw new Error(`Unknown layer profile: ${id}`);
    return profile;
  }
  function allowedGrowth(state: LayerState<T>): boolean {
    if (!state.regrowth || state.profile.id === state.regrowth.ceilingProfileId) return false;
    const seen = new Set<string>();
    let profile: LayerProfile | undefined = state.profile;
    while (profile?.regrowth && !seen.has(profile.id)) {
      seen.add(profile.id);
      profile = profiles.get(profile.regrowth.toProfileId);
      if (profile?.id === state.regrowth.ceilingProfileId) return true;
    }
    return false;
  }
  function retire(state: LayerState<T>) {
    state.cancelGrowth?.();
    state.cancelGrowth = undefined;
    state.nextGrowthAt = undefined;
    state.retired = true;
  }
  function validateRegistrations(entries: LayerRegistration<T>[]) {
    const ids = new Set<string>();
    for (const { target, profileId, regrowth, growthAt } of entries) {
      const profile = profileFor(profileId);
      if (
        states.has(target.id) ||
        ids.has(target.id) ||
        typeof target.id !== 'string' ||
        !target.id ||
        !Number.isFinite(target.health) ||
        target.health <= 0 ||
        target.health > profile.maximumHealth
      )
        throw new Error('Invalid or duplicate layered target.');
      if (
        regrowth &&
        (!Value.Check(layerRegrowthPolicySchema, regrowth) ||
          !profiles.has(regrowth.ceilingProfileId))
      )
        throw new Error('Invalid regrowth ceiling or policy.');
      if (growthAt !== undefined && (!Number.isFinite(growthAt) || growthAt < clock.now))
        throw new Error('Cannot inherit an invalid or past growth tick.');
      ids.add(target.id);
    }
  }
  function registerBatch(entries: LayerRegistration<T>[]) {
    validateRegistrations(entries);
    for (const { target, profileId, regrowth, growthAt } of entries) {
      const state: LayerState<T> = {
        target,
        profile: profileFor(profileId),
        ...(regrowth ? { regrowth: structuredClone(regrowth) } : {}),
        retired: false,
        replacementIds: []
      };
      states.set(target.id, state);
      scheduleGrowth(state, growthAt);
    }
  }
  function createChildren(
    state: LayerState<T>,
    profileIds: string[],
    healthFraction = 1,
    growthAt?: number
  ) {
    const targets = profileIds.map((id) => {
      const profile = profileFor(id);
      const target = structuredClone(
        hooks.createTarget(structuredClone(profile), structuredClone(state.target))
      );
      if (!target.id || states.has(target.id))
        throw new Error('Layer replacement must create a new target ID.');
      target.health = profile.maximumHealth * healthFraction;
      return target;
    });
    if (new Set(targets.map((target) => target.id)).size !== targets.length)
      throw new Error('Duplicate child target IDs.');
    validateRegistrations(
      targets.map((target, index) => ({
        target,
        profileId: profileIds[index]!,
        regrowth: state.regrowth,
        growthAt
      }))
    );
    hooks.validateReplacement?.(state.target, targets);
    return targets;
  }
  function scheduleGrowth(state: LayerState<T>, requestedAt?: number) {
    if (state.retired || !state.regrowth || !state.profile.regrowth || state.target.health <= 0)
      return;
    const at = requestedAt ?? clock.now + state.profile.regrowth.intervalSeconds;
    if (at < clock.now) throw new Error('Cannot inherit a past growth tick.');
    state.nextGrowthAt = at;
    state.cancelGrowth = clock.schedule(at, eventPriority.activation, () => {
      state.cancelGrowth = undefined;
      state.nextGrowthAt = undefined;
      if (state.retired || state.target.health <= 0) return;
      if (!allowedGrowth(state) || hooks.canRegrow?.(state.target) === false) {
        scheduleGrowth(state);
        return;
      }
      const next = state.profile.regrowth!.toProfileId;
      const fraction =
        state.regrowth!.health === 'full' ? 1 : state.target.health / state.profile.maximumHealth;
      const children = createChildren(state, [next], fraction);
      consumeTransition();
      retire(state);
      registerBatch([{ target: children[0]!, profileId: next, regrowth: state.regrowth }]);
      // The old actor is retired by a profile transition, not by another damage award.
      state.target.health = 0;
      state.replacementIds = children.map((target) => target.id);
      hooks.replaceTarget(state.target, children, 'regrown');
    });
  }
  function handleDamage(
    targetId: string,
    hit: LayerDamageResult,
    policy: LayerDamagePolicy,
    context?: C
  ): LayerDamageOutcome {
    if (
      !Number.isFinite(hit.amount) ||
      !Number.isFinite(hit.applied) ||
      hit.applied < 0 ||
      hit.amount < hit.applied
    )
      throw new Error('Invalid resolved layer damage.');
    const state = states.get(targetId);
    if (!state || hit.applied === 0)
      return { replaced: false, totalApplied: hit.applied, replacementIds: [] };
    if (state.retired)
      return { replaced: true, totalApplied: 0, replacementIds: [...state.replacementIds] };
    if (state.target.health > 0) {
      if (state.regrowth?.clock === 'after-damage') {
        state.cancelGrowth?.();
        scheduleGrowth(state);
      }
      return { replaced: false, totalApplied: hit.applied, replacementIds: [] };
    }
    const growthAt = state.regrowth?.clock === 'periodic' ? state.nextGrowthAt : undefined;
    const children = createChildren(state, state.profile.children, 1, growthAt);
    consumeTransition();
    retire(state);
    registerBatch(
      children.map((target, index) => ({
        target,
        profileId: state.profile.children[index]!,
        regrowth: state.regrowth,
        growthAt
      }))
    );
    state.replacementIds = children.map((target) => target.id);
    hooks.replaceTarget(state.target, children, 'destroyed');
    const totalApplied =
      hit.applied + distributeDamage(state, hit.amount - hit.applied, policy, context);
    return { replaced: true, totalApplied, replacementIds: children.map((target) => target.id) };
  }
  function distributeDamage(
    state: LayerState<T>,
    overflow: number,
    policy: LayerDamagePolicy,
    context?: C
  ): number {
    let totalApplied = 0;
    if (
      overflow > 0 &&
      policy.distribute &&
      (state.profile.distributeDamageToChildren || policy.overrideBlocker)
    ) {
      let remaining = overflow;
      for (const childId of state.replacementIds) {
        const child = states.get(childId)!;
        const damage =
          policy.allocation === 'sequential'
            ? remaining
            : policy.allocation === 'split'
              ? overflow / state.replacementIds.length
              : overflow;
        if (damage <= 0) break;
        // A destruction callback may already have consumed this child. Follow its
        // successors without charging that callback's damage to the original hit.
        const applied = child.retired
          ? distributeDamage(child, damage, policy, context)
          : child.target.health > 0
            ? handleDamage(childId, hooks.damage(child.target, damage, context), policy, context)
                .totalApplied
            : 0;
        totalApplied += applied;
        if (policy.allocation === 'sequential') remaining = Math.max(0, remaining - applied);
      }
    }
    return totalApplied;
  }
  return {
    register(target: T, profileId: string, options: { regrowth?: LayerRegrowthPolicy } = {}) {
      registerBatch([{ target, profileId, regrowth: options.regrowth }]);
    },
    validateRegistrations,
    registerBatch,
    /** Check a host health update without changing the target or its growth clock. */
    validateHealth(targetId: string, health: number) {
      const state = states.get(targetId);
      if (
        state &&
        (state.retired ||
          !Number.isFinite(health) ||
          health < 0 ||
          health > state.profile.maximumHealth)
      )
        throw new Error('Invalid layered target health update.');
    },
    afterDamage(targetId: string, hit: LayerDamageResult, policy: LayerDamagePolicy, context?: C) {
      if (!Value.Check(layerDamagePolicySchema, policy))
        throw new Error('Invalid layer damage policy.');
      return handleDamage(targetId, hit, policy, context);
    },
    remove(targetId: string) {
      const state = states.get(targetId);
      if (state) retire(state);
    },
    snapshot() {
      return [...states.values()]
        .filter((state) => !state.retired)
        .map((state) => ({
          targetId: state.target.id,
          profileId: state.profile.id,
          health: state.target.health,
          maximumHealth: state.profile.maximumHealth,
          nextGrowthAt: state.nextGrowthAt ?? null,
          ceilingProfileId: state.regrowth?.ceilingProfileId ?? null
        }));
    },
    get nextEventAt() {
      return Math.min(
        Infinity,
        ...[...states.values()]
          .filter((state) => !state.retired)
          .map((state) => state.nextGrowthAt ?? Infinity)
      );
    }
  };
}
