import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { applyDamage, canTarget, type CombatTarget } from './combat.js';
import { distance, type Obstacle, type Point } from './geometry.js';
import { eventPriority, type MechanicsScheduler } from './scheduler.js';
import { statusEffectSchema, type StatusEffect } from './status.js';

const nonnegative = Type.Number({ minimum: 0, maximum: 1e9 });
const id = Type.String({ minLength: 1, maxLength: 128 });
export const zoneProfileSchema = Type.Object(
  {
    id,
    center: Type.Optional(
      Type.Object(
        {
          x: Type.Number({ minimum: -1e9, maximum: 1e9 }),
          y: Type.Number({ minimum: -1e9, maximum: 1e9 })
        },
        { additionalProperties: false }
      )
    ),
    radius: Type.Union([nonnegative, Type.Null()]),
    innerRadius: nonnegative,
    includeInner: Type.Boolean(),
    includeOuter: Type.Boolean(),
    intervalSeconds: Type.Number({ minimum: 0.001, maximum: 1e9 }),
    initialDelaySeconds: nonnegative,
    triggerImmediate: Type.Boolean(),
    durationSeconds: Type.Optional(nonnegative),
    damage: nonnegative,
    detectConcealed: Type.Boolean(),
    immuneTo: Type.Array(id, { maxItems: 64, uniqueItems: true }),
    throughWalls: Type.Boolean(),
    statuses: Type.Optional(Type.Array(statusEffectSchema, { maxItems: 32 }))
  },
  { additionalProperties: false }
);
export type ZoneProfile = Static<typeof zoneProfileSchema>;

export interface ZoneDamageEvent<T extends CombatTarget> {
  at: number;
  id: string;
  sourceId: string;
  profile: ZoneProfile;
  target: T;
  amount: number;
  applied: number;
}
export interface ZoneEvent {
  at: number;
  kind: 'zone-place' | 'zone-remove' | 'zone-expire';
  id: string;
  sourceId: string;
}
export interface ZoneCallbacks<T extends CombatTarget> {
  obstacles?: Obstacle[];
  eligible?: (target: T, profile: ZoneProfile, sourceId: string) => boolean;
  damage?: (
    target: T,
    raw: number,
    sourceId: string,
    profile: ZoneProfile
  ) => ReturnType<typeof applyDamage>;
  onDamage?: (event: ZoneDamageEvent<T>) => void;
  onStatus?: (target: T, effect: StatusEffect, sourceId: string, damageApplied: number) => void;
  onEvent?: (event: ZoneEvent) => void;
}
interface ZoneEntry {
  id: string;
  sourceId: string;
  profile: ZoneProfile;
  center: Point;
  expiresAt: number;
  nextTickAt: number | null;
  cancelTick?: () => void;
  cancelExpiry?: () => void;
}

/** Euclidean distance between target center and zone center. Null radius has no outer bound.
 * The caller declares both boundaries; no radius tolerance changes adjacent-band membership.
 */
export function zoneContains(profile: ZoneProfile, center: Point, target: Point) {
  const d = distance(center, target);
  return (
    (profile.includeInner ? d >= profile.innerRadius : d > profile.innerRadius) &&
    (profile.radius === null || (profile.includeOuter ? d <= profile.radius : d < profile.radius))
  );
}

/** Zones sample current targets at each tick. Each placement has an independent clock and
 * stacks damage with other placements. Timed statuses belong to the caller's shared ledger;
 * removing a zone stops future applications, while already applied statuses keep their duration.
 * Native path placement, mutator replacement and child-layer propagation require source policy.
 */
export function createZoneRuntime<T extends CombatTarget>(
  clock: Pick<MechanicsScheduler, 'now' | 'schedule'>,
  targets: T[] | (() => T[]),
  callbacks: ZoneCallbacks<T> = {}
) {
  let sequence = 0;
  const entries = new Map<string, ZoneEntry>();
  function remove(instanceId: string, expired = false) {
    const entry = entries.get(instanceId);
    if (!entry) return false;
    entries.delete(instanceId);
    entry.cancelTick?.();
    entry.cancelExpiry?.();
    callbacks.onEvent?.({
      at: clock.now,
      kind: expired ? 'zone-expire' : 'zone-remove',
      id: entry.id,
      sourceId: entry.sourceId
    });
    return true;
  }
  return {
    place(input: ZoneProfile, sourceId: string, origin: Point) {
      if (
        !Value.Check(zoneProfileSchema, input) ||
        !sourceId ||
        ![origin.x, origin.y].every(Number.isFinite) ||
        (input.radius !== null && input.innerRadius > input.radius)
      )
        throw new Error('Invalid zone profile or placement.');
      if (input.statuses?.length && !callbacks.onStatus)
        throw new Error('Zone statuses require the shared status application callback.');
      const profile = structuredClone(input);
      const instanceId = JSON.stringify([sourceId, profile.id, sequence++]);
      const entry: ZoneEntry = {
        id: instanceId,
        sourceId,
        profile,
        center: { x: origin.x + (profile.center?.x ?? 0), y: origin.y + (profile.center?.y ?? 0) },
        expiresAt:
          profile.durationSeconds === undefined ? Infinity : clock.now + profile.durationSeconds,
        nextTickAt: null
      };
      entries.set(instanceId, entry);
      function scheduleTick(at: number) {
        if (!entries.has(instanceId) || at >= entry.expiresAt) return;
        entry.nextTickAt = at;
        entry.cancelTick = clock.schedule(at, eventPriority.impact, () => {
          entry.nextTickAt = null;
          if (!entries.has(instanceId)) return;
          const current = typeof targets === 'function' ? targets() : targets;
          for (const target of [...current].sort((a, b) => a.id.localeCompare(b.id))) {
            if (!entries.has(instanceId)) break;
            if (
              !zoneContains(profile, entry.center, target) ||
              !canTarget(target, {
                origin: entry.center,
                range: Infinity,
                detectConcealed: profile.detectConcealed,
                obstacles: profile.throughWalls ? [] : callbacks.obstacles
              }) ||
              (callbacks.eligible && !callbacks.eligible(target, profile, sourceId))
            )
              continue;
            if (!entries.has(instanceId)) break;
            // Immunity blocks damage before vulnerability modifiers can add flat damage.
            const immune = profile.immuneTo.some((tag) => target.tags?.includes(tag));
            const hit = immune
              ? { amount: 0, applied: 0 }
              : callbacks.damage
                ? callbacks.damage(target, profile.damage, sourceId, profile)
                : applyDamage(target, profile.damage);
            callbacks.onDamage?.({
              at: clock.now,
              id: instanceId,
              sourceId,
              profile,
              target,
              ...hit
            });
            if (!entries.has(instanceId)) break;
            for (const effect of profile.statuses ?? []) {
              if (!entries.has(instanceId)) break;
              callbacks.onStatus!(target, effect, instanceId, hit.applied);
            }
          }
          scheduleTick(clock.now + profile.intervalSeconds);
        });
      }
      if (Number.isFinite(entry.expiresAt))
        entry.cancelExpiry = clock.schedule(entry.expiresAt, eventPriority.expire, () =>
          remove(instanceId, true)
        );
      scheduleTick(
        clock.now +
          profile.initialDelaySeconds +
          (profile.triggerImmediate ? 0 : profile.intervalSeconds)
      );
      callbacks.onEvent?.({ at: clock.now, kind: 'zone-place', id: instanceId, sourceId });
      return {
        id: instanceId,
        get alive() {
          return entries.has(instanceId);
        },
        remove: () => remove(instanceId)
      };
    },
    remove,
    clear(sourceId?: string) {
      for (const entry of [...entries.values()])
        if (sourceId === undefined || entry.sourceId === sourceId) remove(entry.id);
    },
    snapshot() {
      return [...entries.values()].map((entry) => ({
        id: entry.id,
        sourceId: entry.sourceId,
        profile: structuredClone(entry.profile),
        center: { ...entry.center },
        nextTickAt: entry.nextTickAt,
        expiresAt: Number.isFinite(entry.expiresAt) ? entry.expiresAt : null
      }));
    }
  };
}
