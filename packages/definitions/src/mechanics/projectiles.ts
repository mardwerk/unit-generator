import { Type, type Static, type TSchema } from '@sinclair/typebox';
import { blocked, distance, type Point, type Obstacle } from './geometry.js';
import type { CombatTarget } from './combat.js';
import { eventPriority, type MechanicsScheduler } from './scheduler.js';
import { statusEffectSchema } from './status.js';
import {
  applyContactDamageModifiers,
  contactDamageModifierSchema,
  type AppliedModifierSource
} from './modifiers.js';
import {
  compileTargetPredicate,
  localizeTargetingSchema,
  targetPredicateSchema,
  type TargetContext,
  type TargetEntity
} from './targeting.js';

const number = (minimum = 0) => Type.Number({ minimum, maximum: 100000 });
const speed = () => Type.Number({ exclusiveMinimum: 0, maximum: 100000 });
const objectOptions = { additionalProperties: false };
const interval = () => Type.Number({ exclusiveMinimum: 0, maximum: 100000 });
const childFields = <T extends TSchema>(projectile: T) => ({
  count: Type.Integer({ minimum: 1, maximum: 256 }),
  spreadDegrees: Type.Optional(Type.Number({ minimum: 0, maximum: 360 })),
  atTarget: Type.Optional(Type.Boolean()),
  inheritHitTargets: Type.Optional(Type.Boolean()),
  projectile
});
export const projectileDefinitionSchema = Type.Recursive(
  (Self) =>
    Type.Object(
      {
        id: Type.String({ minLength: 1, maxLength: 512 }),
        damage: number(),
        appliesDamage: Type.Optional(Type.Boolean()),
        damageModifiers: Type.Optional(Type.Array(contactDamageModifierSchema, { maxItems: 256 })),
        detectConcealed: Type.Boolean(),
        immuneTo: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
        onHit: Type.Optional(Type.Array(statusEffectSchema, { maxItems: 32 })),
        targetFilter: Type.Optional(targetPredicateSchema),
        radius: number(),
        pierce: Type.Number({ minimum: 0, maximum: 1e9 }),
        collides: Type.Optional(Type.Boolean()),
        ignorePierceExhaustion: Type.Optional(Type.Boolean()),
        throughWalls: Type.Optional(Type.Boolean()),
        ignoreBlockers: Type.Optional(Type.Boolean()),
        hitReset: Type.Optional(
          Type.Object(
            {
              intervalSeconds: interval(),
              mode: Type.Union([Type.Literal('all'), Type.Literal('outside-contact')])
            },
            objectOptions
          )
        ),
        pierceRefresh: Type.Optional(Type.Object({ intervalSeconds: interval() }, objectOptions)),
        flight: Type.Union([
          Type.Object(
            { kind: Type.Literal('straight'), speed: speed(), lifetimeSeconds: number() },
            objectOptions
          ),
          Type.Object(
            { kind: Type.Literal('stationary'), lifetimeSeconds: number() },
            objectOptions
          ),
          Type.Object({ kind: Type.Literal('aimed-impact'), speed: speed() }, objectOptions)
        ]),
        children: Type.Optional(
          Type.Array(
            Type.Union([
              Type.Object(
                {
                  trigger: Type.Union([
                    Type.Literal('contact'),
                    Type.Literal('expire'),
                    Type.Literal('exhaust'),
                    Type.Literal('blocker')
                  ]),
                  ...childFields(Self)
                },
                objectOptions
              ),
              Type.Object(
                {
                  ...childFields(Self),
                  trigger: Type.Literal('interval'),
                  atTarget: Type.Optional(Type.Literal(false)),
                  schedule: Type.Object(
                    {
                      initialDelaySeconds: number(),
                      intervalSeconds: interval(),
                      maxEmissions: Type.Union([
                        Type.Integer({ minimum: 1, maximum: 4096 }),
                        Type.Null()
                      ])
                    },
                    objectOptions
                  )
                },
                objectOptions
              )
            ]),
            { maxItems: 64 }
          )
        )
      },
      objectOptions
    ),
  { $id: 'SharedProjectileDefinition' }
);
export type ProjectileDefinition = Static<typeof projectileDefinitionSchema>;
export type ProjectileEmission = NonNullable<ProjectileDefinition['children']>[number];

/** Hoist repeated recursive graphs once when publishing an enclosing JSON Schema. */
export function localizeProjectileSchema<T>(schema: T): T {
  const key = 'SharedProjectileDefinition';
  const reference = `#/$defs/${key}`;
  const copy = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  let found = false;
  const visit = (value: unknown, definitionRoot = false): unknown => {
    if (Array.isArray(value)) return value.map((entry) => visit(entry));
    if (!value || typeof value !== 'object') return value;
    const entry = value as Record<string, unknown>;
    if (entry.$id === key && !definitionRoot) {
      found = true;
      return { $ref: reference };
    }
    const result: Record<string, unknown> = {};
    for (const [name, child] of Object.entries(entry)) {
      if (name === '$id' && child === key) continue;
      if (name === '$ref' && child === key) {
        found = true;
        result[name] = reference;
      } else result[name] = visit(child);
    }
    return result;
  };
  const result = visit(copy) as Record<string, unknown>;
  if (found)
    result.$defs = {
      ...(result.$defs as Record<string, unknown> | undefined),
      [key]: visit(JSON.parse(JSON.stringify(projectileDefinitionSchema)), true)
    };
  return localizeTargetingSchema(result) as T;
}

export const projectileDefinitionJsonSchema = localizeProjectileSchema(projectileDefinitionSchema);

export type ProjectileCollider = CombatTarget & TargetEntity & { collisionRadius?: number };
export type ProjectileClock = Pick<MechanicsScheduler, 'now' | 'schedule'>;
export interface ProjectileContact<T extends ProjectileCollider> {
  node: ProjectileDefinition;
  damage: number;
  damageModifierSources: AppliedModifierSource[];
  root: boolean;
  target: T;
  point: Point;
  at: number;
  projectileId: string;
}
export interface ProjectileActor {
  readonly id: string;
  readonly alive: boolean;
  readonly position: Point;
  /** Recompute future contacts after target positions or eligibility change. */
  refresh(): void;
  cancel(): void;
}
export interface ProjectileOptions<T extends ProjectileCollider> {
  projectile: ProjectileDefinition;
  origin: Point;
  aim: Point & { id?: string };
  scheduler: ProjectileClock;
  targets: () => T[];
  obstacles?: Obstacle[];
  eligible?: (node: ProjectileDefinition, target: T) => boolean;
  targetContext?: TargetContext<T>;
  onContact: (event: ProjectileContact<T>) => void;
  onEmit?: (actor: ProjectileActor, node: ProjectileDefinition) => void;
  onEnd?: (event: {
    node: ProjectileDefinition;
    point: Point;
    at: number;
    projectileId: string;
    reason: 'expire' | 'exhaust' | 'blocker';
  }) => void;
}
const EPS = 1e-8;
const projectileSequences = new WeakMap<ProjectileClock, number>();

/** First contact of a ray and circular collider, in distance units. */
function circleContact(origin: Point, direction: Point, target: Point, radius: number) {
  const dx = target.x - origin.x,
    dy = target.y - origin.y;
  const along = dx * direction.x + dy * direction.y;
  const squared = dx * dx + dy * dy;
  if (squared <= radius * radius + EPS) return 0;
  const acrossSquared = squared - along * along;
  if (along < 0 || acrossSquared > radius * radius + EPS) return undefined;
  return Math.max(0, along - Math.sqrt(Math.max(0, radius * radius - acrossSquared)));
}

function blockerDistance(origin: Point, direction: Point, length: number, obstacles: Obstacle[]) {
  const endpoint = { x: origin.x + direction.x * length, y: origin.y + direction.y * length };
  if (!blocked(origin, endpoint, obstacles)) return undefined;
  // Bisection uses the same inclusive segment policy as ordinary shared targeting.
  let lo = 0,
    hi = length;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (
      blocked(
        origin,
        { x: origin.x + direction.x * mid, y: origin.y + direction.y * mid },
        obstacles
      )
    )
      hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Launches actors on the caller's clock. Damage and game-specific procs use onContact. */
export function emitProjectile<T extends ProjectileCollider>(
  options: ProjectileOptions<T>
): ProjectileActor {
  // Freeze the graph so a later purchase/form change cannot rewrite an airborne shot.
  const graph = structuredClone(options.projectile);
  const targetContext = {
    ...options.targetContext,
    source: options.targetContext?.source
      ? structuredClone(options.targetContext.source)
      : undefined
  };
  let emitted = 0;
  const spawn = (
    node: ProjectileDefinition,
    origin: Point,
    aim: Point & { id?: string },
    inherited: Set<string>,
    depth: number
  ): ProjectileActor => {
    if (depth > 32 || ++emitted > 4096) throw new Error('Projectile emission budget exceeded.');
    if (node.appliesDamage !== false && node.damageModifiers?.length && !targetContext.source)
      throw new Error('Projectile contact damage modifiers require launch owner facts.');
    const serial = (projectileSequences.get(options.scheduler) ?? 0) + 1;
    projectileSequences.set(options.scheduler, serial);
    const id = `${graph.id}:${serial}`;
    if (
      !Number.isFinite(node.radius) ||
      node.radius < 0 ||
      !Number.isFinite(node.pierce) ||
      node.pierce < 0 ||
      (node.flight.kind !== 'stationary' &&
        (!Number.isFinite(node.flight.speed) || node.flight.speed <= 0)) ||
      (node.flight.kind !== 'aimed-impact' &&
        (!Number.isFinite(node.flight.lifetimeSeconds) || node.flight.lifetimeSeconds < 0))
    )
      throw new Error('Invalid projectile geometry, speed, pierce, or lifetime.');
    const launched = options.scheduler.now;
    const aimPoint = { ...aim };
    const length = distance(origin, aimPoint);
    const direction =
      length > EPS
        ? { x: (aimPoint.x - origin.x) / length, y: (aimPoint.y - origin.y) / length }
        : { x: 1, y: 0 };
    const velocity = node.flight.kind === 'stationary' ? 0 : node.flight.speed;
    const lifetime =
      node.flight.kind === 'aimed-impact' ? length / velocity : node.flight.lifetimeSeconds;
    const end = launched + lifetime;
    let alive = true;
    let remaining = node.pierce;
    let stoppedAt: Point | undefined;
    const hit = new Set(inherited);
    const cancellations = new Set<() => void>();
    let predictions = new Map<string, { at: number; cancel: () => void }>();
    const position = (): Point =>
      stoppedAt ?? {
        x:
          origin.x +
          direction.x *
            velocity *
            Math.max(0, Math.min(lifetime, options.scheduler.now - launched)),
        y:
          origin.y +
          direction.y * velocity * Math.max(0, Math.min(lifetime, options.scheduler.now - launched))
      };
    const filter = node.targetFilter ? compileTargetPredicate(node.targetFilter) : undefined;
    const candidate = (target: T) => node.collides !== false && !hit.has(target.id);
    const eligible = (target: T) =>
      candidate(target) &&
      target.health > EPS &&
      !target.invulnerable &&
      (!target.concealed || node.detectConcealed) &&
      (options.eligible?.(node, target) ?? true) &&
      (!filter ||
        filter.test(target, {
          ...targetContext,
          origin: position(),
          headingDegrees: (Math.atan2(direction.y, direction.x) * 180) / Math.PI,
          lineOfSight:
            targetContext.lineOfSight ?? ((a, b) => !blocked(a, b, options.obstacles ?? []))
        }));
    const schedule = (at: number, priority: number, run: () => void) => {
      const cancelEvent = options.scheduler.schedule(at, priority, () => {
        cancellations.delete(cancel);
        run();
      });
      const cancel = () => {
        cancelEvent();
        cancellations.delete(cancel);
      };
      cancellations.add(cancel);
      return cancel;
    };
    const emitChild = (child: ProjectileEmission, point: Point, target?: T) => {
      const center = child.atTarget && target ? { x: target.x, y: target.y } : point;
      const spread = ((child.spreadDegrees ?? 0) * Math.PI) / 180;
      for (let i = 0; i < child.count; i++) {
        // A full circle excludes the duplicate endpoint; a partial arc includes both ends.
        const fraction =
          child.count === 1 ? 0 : spread === Math.PI * 2 ? i / child.count : i / (child.count - 1);
        const angle =
          Math.atan2(direction.y, direction.x) +
          (child.count === 1 ? 0 : spread * (fraction - 0.5));
        spawn(
          child.projectile,
          center,
          {
            x: center.x + Math.cos(angle) * Math.max(1, length),
            y: center.y + Math.sin(angle) * Math.max(1, length),
            ...(target ? { id: target.id } : {})
          },
          child.inheritHitTargets ? hit : new Set(),
          depth + 1
        );
      }
    };
    const children = (trigger: string, point: Point, target?: T) => {
      for (const child of node.children ?? [])
        if (child.trigger === trigger) emitChild(child, point, target);
    };
    const finish = (reason: 'expire' | 'exhaust' | 'blocker', target?: T) => {
      if (!alive) return;
      stoppedAt = position();
      alive = false;
      for (const cancel of cancellations) cancel();
      predictions.clear();
      children(reason, stoppedAt, target);
      options.onEnd?.({
        node,
        point: stoppedAt,
        at: options.scheduler.now,
        projectileId: id,
        reason
      });
    };
    const contact = (target: T) => {
      if (!alive || !eligible(target)) return;
      const point = position();
      const modified =
        node.appliesDamage !== false && node.damageModifiers?.length
          ? applyContactDamageModifiers(
              node.damage,
              target,
              targetContext.source!,
              node.damageModifiers,
              targetContext
            )
          : { value: node.damage, appliedSources: [] };
      hit.add(target.id);
      remaining -= 1;
      options.onContact({
        node,
        damage: modified.value,
        damageModifierSources: modified.appliedSources,
        root: depth === 0,
        target,
        point,
        at: options.scheduler.now,
        projectileId: id
      });
      children('contact', point, target);
      if (remaining <= EPS && !node.ignorePierceExhaustion) finish('exhaust', target);
    };
    const refresh = () => {
      if (!alive || node.flight.kind === 'aimed-impact') return;
      const current = position();
      const now = options.scheduler.now;
      const contacts = options
        .targets()
        .filter(candidate)
        .map((target) => {
          const radius = node.radius + (target.collisionRadius ?? 0);
          const contactDistance =
            velocity === 0
              ? distance(current, target) <= radius + EPS
                ? 0
                : undefined
              : circleContact(current, direction, target, radius);
          return {
            target,
            at:
              contactDistance === undefined
                ? Infinity
                : now + (velocity === 0 ? 0 : contactDistance / velocity)
          };
        })
        .filter((candidate) => candidate.at < end || (lifetime === 0 && candidate.at === end))
        .sort((a, b) => a.at - b.at || a.target.id.localeCompare(b.target.id));
      // Preserve ID ordering at equal timestamps. If a time group changes, reschedule
      // that whole group rather than letting a reused event jump ahead of a new target.
      const previousGroups = new Map<number, string[]>();
      const nextGroups = new Map<number, string[]>();
      for (const [id, prediction] of predictions) {
        const group = previousGroups.get(prediction.at) ?? [];
        group.push(id);
        previousGroups.set(prediction.at, group);
      }
      for (const { target, at } of contacts) {
        const group = nextGroups.get(at) ?? [];
        group.push(target.id);
        nextGroups.set(at, group);
      }
      const reusableTimes = new Set(
        [...nextGroups]
          .filter(([at, ids]) => {
            const previous = previousGroups.get(at);
            return (
              previous?.length === ids.length && ids.every((id, index) => id === previous[index])
            );
          })
          .map(([at]) => at)
      );
      const next = new Map<string, { at: number; cancel: () => void }>();
      const added: (() => void)[] = [];
      try {
        for (const { target, at } of contacts) {
          const prior = predictions.get(target.id);
          if (prior?.at === at && reusableTimes.has(at)) {
            next.set(target.id, prior);
            continue;
          }
          const prediction = {
            at,
            cancel: schedule(at, eventPriority.impact, () => {
              predictions.delete(target.id);
              if (!alive) return;
              // Targets may have moved or disappeared since this candidate was queued.
              const liveTarget = options.targets().find((candidate) => candidate.id === target.id);
              if (
                !liveTarget ||
                distance(position(), liveTarget) >
                  node.radius + (liveTarget.collisionRadius ?? 0) + EPS
              )
                return;
              if (!node.throughWalls && blocked(position(), liveTarget, options.obstacles ?? []))
                return;
              contact(liveTarget);
            })
          };
          added.push(prediction.cancel);
          next.set(target.id, prediction);
        }
      } catch (error) {
        for (const cancel of added) cancel();
        throw error;
      }
      // Keep the previous predictions valid until every new event has been accepted.
      // Unchanged contacts reuse their handles, so a no-op refresh needs no queue space.
      for (const [id, prior] of predictions) if (next.get(id) !== prior) prior.cancel();
      predictions = next;
    };
    const actor: ProjectileActor = {
      id,
      get alive() {
        return alive;
      },
      get position() {
        return { ...position() };
      },
      refresh,
      cancel() {
        if (!alive) return;
        stoppedAt = position();
        alive = false;
        for (const cancel of cancellations) cancel();
        predictions.clear();
      }
    };
    options.onEmit?.(actor, node);
    if (node.pierce === 0 && !node.ignorePierceExhaustion) {
      schedule(launched, eventPriority.emission, () => finish('exhaust'));
      return actor;
    }
    // These are normalized launch-clock timers. Expiry wins equal timestamps; timer order is
    // pierce refresh, hit reset, child emission, then contacts. Native frame phase is separate.
    const pulse = (
      initialDelay: number,
      period: number,
      max: number | null,
      priority: number,
      run: () => void
    ) => {
      if (
        !Number.isFinite(initialDelay) ||
        initialDelay < 0 ||
        !Number.isFinite(period) ||
        period <= 0 ||
        (max !== null && (!Number.isInteger(max) || max < 1 || max > 4096))
      )
        throw new Error('Invalid projectile timer.');
      let count = 0;
      const next = () => {
        const at = launched + initialDelay + count * period;
        if (!alive || at >= end || (max !== null && count >= max)) return;
        schedule(at, priority, () => {
          if (!alive) return;
          run();
          count++;
          next();
        });
      };
      next();
    };
    if (node.pierceRefresh)
      pulse(
        node.pierceRefresh.intervalSeconds,
        node.pierceRefresh.intervalSeconds,
        null,
        eventPriority.emission,
        () => {
          remaining = node.pierce;
        }
      );
    if (node.hitReset)
      pulse(
        node.hitReset.intervalSeconds,
        node.hitReset.intervalSeconds,
        null,
        eventPriority.emission + 0.1,
        () => {
          if (node.hitReset!.mode === 'all') hit.clear();
          else {
            const current = position();
            const targets = new Map(options.targets().map((target) => [target.id, target]));
            for (const id of hit) {
              const target = targets.get(id);
              if (
                !target ||
                distance(current, target) > node.radius + (target.collisionRadius ?? 0) + EPS
              )
                hit.delete(id);
            }
          }
          refresh();
        }
      );
    for (const child of node.children ?? [])
      if (child.trigger === 'interval')
        pulse(
          child.schedule.initialDelaySeconds,
          child.schedule.intervalSeconds,
          child.schedule.maxEmissions,
          eventPriority.emission + 0.2,
          () => emitChild(child, position())
        );
    if (node.flight.kind === 'aimed-impact') {
      schedule(end, eventPriority.impact, () => {
        const target = options.targets().find((candidate) => candidate.id === aimPoint.id);
        if (
          target &&
          distance(aimPoint, target) <= node.radius + (target.collisionRadius ?? 0) + EPS &&
          (node.throughWalls || !blocked(origin, target, options.obstacles ?? []))
        )
          contact(target);
        finish('expire');
      });
    } else {
      refresh();
      // Zero-life area children resolve their contacts once, then expire at the same timestamp.
      schedule(end, lifetime === 0 ? eventPriority.impact + 0.5 : eventPriority.expire, () =>
        finish('expire')
      );
    }
    if (!(node.ignoreBlockers ?? node.throughWalls) && velocity > 0) {
      const blocker = blockerDistance(
        origin,
        direction,
        lifetime * velocity,
        options.obstacles ?? []
      );
      if (blocker !== undefined)
        schedule(launched + blocker / velocity, eventPriority.expire, () => finish('blocker'));
    }
    return actor;
  };
  return spawn(graph, { ...options.origin }, { ...options.aim }, new Set(), 0);
}
