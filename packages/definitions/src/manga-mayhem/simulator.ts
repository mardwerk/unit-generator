import {
  createLayerRuntime,
  type LayerProfile,
  type LayerDamagePolicy,
  type LayerRegrowthPolicy
} from '../mechanics/layers.js';
import { affordableResource, applyResourceOperation } from '../mechanics/economy.js';
import { applyPathDisplacement } from '../mechanics/motion.js';
import { createMechanicalEffectsRuntime } from '../mechanics/effects.js';
import type { AccountOperation, AccountState } from '../mechanics/accounts.js';
import type { TriggerEvent } from '../mechanics/triggers.js';
import { compileTargetSelection } from '../mechanics/targeting.js';
import { createModelRuntime, type ScheduledAttack } from '../mechanics/model.js';
import { supportedRange, type SupportPlacement } from '../mechanics/support.js';
import { createStatusRuntime, type StatusEffect } from '../mechanics/status.js';
import { createMechanicsScheduler } from '../mechanics/scheduler.js';
import {
  emitProjectile,
  type ProjectileActor,
  type ProjectileDefinition
} from '../mechanics/projectiles.js';
import { distance, linePoint, blocked } from '../mechanics/geometry.js';
import {
  canTarget,
  resolveAttack,
  projectileHits,
  healAllies,
  applyDamage
} from '../mechanics/combat.js';
import { compileMangaBuild, type MangaBuild } from './compiler.js';
import type {
  MangaUnit,
  MangaTiers,
  MangaShape,
  MangaTechnique,
  MangaModifier
} from './schemas.js';
export interface MangaTarget {
  layer?: { profileId: string; regrowth?: LayerRegrowthPolicy };
  id: string;
  x: number;
  y: number;
  health: number;
  tags?: string[];
  ownerId?: string;
  parentId?: string | null;
  baseId?: string;
  damageTaken?: { additive: number; multiplier: number };
  armor?: number;
  concealed?: boolean;
  invulnerable?: boolean;
  weakWilled?: boolean;
  stunnable?: boolean;
  displaceable?: boolean;
  slowable?: boolean;
  /** Distance traveled along the straight encounter path. Displacement moves x backward as well. */
  pathPosition?: number;
}
export interface MangaObstacle {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface MangaEvent {
  time: number;
  type: string;
  target?: string;
  amount?: number;
  detail?: string;
}
export interface MangaAlly {
  id: string;
  x: number;
  y: number;
  health: number;
  maximumHealth: number;
  baseRange?: number;
}
export interface MangaOptions {
  layers?: {
    profiles: LayerProfile[];
    damagePolicy: LayerDamagePolicy;
    createTarget: (profile: LayerProfile, parent: MangaTarget) => MangaTarget;
    canRegrow?: (target: MangaTarget) => boolean;
  };
  accountState?: AccountState;
  supportPlacements?: SupportPlacement[];
  allies?: MangaAlly[];
  x?: number;
  y?: number;
  obstacles?: MangaObstacle[];
  priority?: 'first' | 'last' | 'strong' | 'close';
}
type Target = MangaTarget & {
  stunUntil: number;
  protectedUntil: number;
  slowUntil: number;
  slowFraction: number;
};
type Pending = {
  kind: 'primary' | 'technique';
  target: string;
  hitTimes: number[];
  next: number;
  damage: number;
  shape: MangaShape;
  technique?: MangaTechnique;
  onHit?: StatusEffect[];
  projectileSpeed?: number;
  projectileRadius?: number;
};
type Projectile = {
  actor?: ProjectileActor;
  attack: Pending;
  impactAt: number;
  x: number;
  y: number;
  radius: number;
  modifiers: MangaModifier;
};
const EPS = 1e-8;
const eligibilityTags = {
  weakWilled: 'weak-willed',
  stunnable: 'stunnable',
  displaceable: 'displaceable',
  slowable: 'slowable'
} as const;
function normalizeTargetFacts<T extends Partial<MangaTarget>>(target: T): T {
  const result = structuredClone(target);
  const tags = new Set(target.tags ?? []);
  for (const [key, tag] of Object.entries(eligibilityTags) as [
    keyof typeof eligibilityTags,
    string
  ][]) {
    if (target[key] === false && tags.has(tag))
      throw new Error(`Conflicting target facts: ${key} is false but tags includes ${tag}.`);
    if (target[key] === true) tags.add(tag);
    if (target[key] !== undefined || target.tags !== undefined) result[key] = tags.has(tag);
  }
  if (target.tags !== undefined || [...tags].length) result.tags = [...tags];
  return result;
}
function checkTarget(t: MangaTarget) {
  if (
    typeof t.id !== 'string' ||
    !t.id ||
    t.id.length > 256 ||
    !Number.isFinite(t.x) ||
    !Number.isFinite(t.y) ||
    !Number.isFinite(t.health) ||
    t.health < 0 ||
    !Number.isFinite(t.armor ?? 0) ||
    (t.armor ?? 0) < 0 ||
    (t.armor ?? 0) > 0.9 ||
    ['concealed', 'invulnerable', 'weakWilled', 'stunnable', 'displaceable', 'slowable'].some(
      (key) => {
        const value = t[key as keyof MangaTarget];
        return value !== undefined && typeof value !== 'boolean';
      }
    ) ||
    !Number.isFinite(t.pathPosition ?? 0) ||
    (t.pathPosition ?? 0) < 0 ||
    (t.tags !== undefined &&
      (!Array.isArray(t.tags) ||
        t.tags.length > 64 ||
        t.tags.some((tag) => typeof tag !== 'string'))) ||
    (t.damageTaken !== undefined &&
      (!Number.isFinite(t.damageTaken.additive) ||
        t.damageTaken.additive < 0 ||
        !Number.isFinite(t.damageTaken.multiplier) ||
        t.damageTaken.multiplier < 1))
  )
    throw new Error('Invalid encounter target.');
}
function checkAllies(allies: MangaAlly[]) {
  if (
    allies.length > 256 ||
    new Set(allies.map((a) => a.id)).size !== allies.length ||
    allies.some(
      (a) =>
        typeof a.id !== 'string' ||
        !a.id ||
        a.id.length > 256 ||
        ![a.x, a.y, a.health, a.maximumHealth].every(Number.isFinite) ||
        a.maximumHealth <= 0 ||
        a.health < 0 ||
        a.health > a.maximumHealth ||
        (a.baseRange !== undefined && (!Number.isFinite(a.baseRange) || a.baseRange < 0))
    )
  )
    throw new Error('Invalid allies.');
}
/** Deterministic stationary encounter. The caller supplies movement via updateTarget at encounter times. */
export function createMangaEncounter(
  unit: MangaUnit,
  tiers: MangaTiers = [0, 0, 0],
  targets: MangaTarget[] = [],
  options: MangaOptions = {}
) {
  return createMangaEncounterFromBuild(compileMangaBuild(unit, tiers), targets, options);
}
/** Uses an already validated compile result; takes a private copy so encounters cannot mutate it. */
export function createMangaEncounterFromBuild(
  compiled: MangaBuild,
  targets: MangaTarget[] = [],
  options: MangaOptions = {}
) {
  let build = structuredClone(compiled);
  const unit = build.unit;
  // No resource controls or transformed forms can exist without this optional contract block.
  const resource = unit.stamina ?? {
    unlockTier: 6,
    maximum: 0,
    entryMinimum: 0,
    recoveryPerSecond: 0,
    reentrySeconds: 0,
    techniqueCost: 0,
    techniqueCooldown: 0
  };
  const origin = { x: options.x ?? 0, y: options.y ?? 0 };
  const obstacles = structuredClone(options.obstacles ?? []);
  if (
    ![origin.x, origin.y, ...obstacles.flatMap((o) => [o.x1, o.y1, o.x2, o.y2])].every(
      Number.isFinite
    ) ||
    obstacles.length > 256
  )
    throw new Error('Invalid encounter geometry.');
  if (targets.length > 256 || new Set(targets.map((t) => t.id)).size !== targets.length)
    throw new Error('Target IDs must be unique; at most 256 targets.');
  targets.forEach(checkTarget);
  let enemies: Target[] = targets.map((t) => ({
    ...normalizeTargetFacts(t),
    stunUntil: 0,
    protectedUntil: 0,
    slowUntil: 0,
    slowFraction: 0
  }));
  checkAllies(options.allies ?? []);
  let allies = structuredClone(options.allies ?? []);
  let supportAt = build.support ? build.support.interval : Infinity;
  const projectiles: Projectile[] = [];
  const mechanicalProjectiles = new Map<string, ProjectileActor>();
  let mechanicsClock = createMechanicsScheduler(500000);
  let removed = false;
  let time = 0,
    formId = unit.baseForm,
    stamina = resource.maximum,
    reentryAt = 0,
    techniqueAt = 0,
    nextCycle = 0;
  let pending: Pending | undefined,
    queuedForm: string | undefined,
    queuedTechnique: { form: string; technique: string; target: string } | undefined;
  let recoveryKind: 'primary' | 'technique' = 'primary';
  let pulseCounter = 0,
    emissionCounter = 0,
    pulseAt = 0;
  let priority = options.priority ?? 'first';
  const events: MangaEvent[] = [];
  const makeStatuses = () =>
    createStatusRuntime(mechanicsClock, enemies, {
      changed: (target, state) => {
        for (const [key, tag] of Object.entries(eligibilityTags) as [
          keyof typeof eligibilityTags,
          string
        ][])
          target[key] = target.tags?.includes(tag) ?? false;
        const stun = state.active.find((s) => s.effect.id === 'manga-stun');
        if (stun?.expiresAt != null) {
          target.stunUntil = stun.expiresAt;
          target.protectedUntil = stun.expiresAt + unit.stunProtectionSeconds;
        }
        const slow = state.active.find((s) => s.effect.id === 'manga-slow');
        if (slow?.expiresAt != null && slow.effect.kind === 'slow') {
          target.slowUntil = slow.expiresAt;
          target.slowFraction = 1 - slow.effect.speedMultiplier;
        }
      },
      damage: (target, raw, source, effect) => {
        const hit = applyDamage(target, raw);
        if (hit.applied > EPS)
          events.push({
            time: mechanicsClock.now,
            type: 'damage-over-time',
            target: target.id,
            amount: hit.amount,
            detail: effect.id
          });
        afterDamage(target, hit);
      }
    });
  let statuses = makeStatuses();
  let layerRuntime: ReturnType<typeof createLayerRuntime<Target>> | undefined;
  const popped = new Set<string>();
  const afterDamage = (target: Target, hit: { amount: number; applied: number }) => {
    const result = layerRuntime?.afterDamage(target.id, hit, options.layers!.damagePolicy);
    if (target.health <= EPS && !result?.replaced) targetDestroyed(target);
  };
  const targetDestroyed = (target: Target, replacements?: string[]) => {
    statuses.destroy(target.id, replacements);
    if (!popped.has(target.id)) {
      popped.add(target.id);
      effectsRuntime.dispatch({
        kind: 'target-pop',
        targetId: target.id,
        ...(target.tags === undefined ? {} : { targetTags: target.tags })
      });
    }
  };
  const form = () => build.forms.find((f) => f.id === formId)!;
  const draining = () => !removed && form().drainPerSecond > 0;
  const resourceUnlocked = () => build.highestTier >= resource.unlockTier;
  const technique = () =>
    form()
      .techniques.filter((t) => t.unlockTier <= build.highestTier)
      .sort((a, b) => b.unlockTier - a.unlockTier)[0];
  const placements = () => [
    ...structuredClone(options.supportPlacements ?? []),
    { id: unit.id, ...origin, support: removed ? [] : (unit.mechanics?.rangeSupport ?? []) }
  ];
  const effectiveRange = (baseRange: number, recipient = { id: unit.id, ...origin }) =>
    supportedRange(baseRange, recipient, placements());
  const eligible = (t: Target, from = origin, reach = effectiveRange(form().primary.reach)) =>
    canTarget(t, {
      origin,
      range: reach,
      detectConcealed: !!build.modifiers.detectConcealed,
      obstacles,
      lineOrigin: from
    });
  const selections = Object.fromEntries(
    Object.entries({
      first: { by: 'path-progress', direction: 'desc' },
      last: { by: 'path-progress', direction: 'asc' },
      strong: { by: 'health', direction: 'desc' },
      close: { by: 'distance', direction: 'asc' }
    }).map(([key, order]) => [
      key,
      compileTargetSelection({ order: [order], tieBreak: 'id-ascending', limit: 1 })
    ])
  );
  const select = () =>
    selections[priority]!.select(
      enemies.filter((t) => eligible(t)),
      {
        origin,
        numericFact: (target, fact) =>
          fact === 'path-progress'
            ? (target.pathPosition ?? target.x)
            : fact === 'health'
              ? target.health
              : undefined
      }
    )[0];
  const canStun = (t: Target) =>
    t.health > EPS && t.weakWilled && t.stunnable && time + EPS >= t.protectedUntil;
  const stun = (t: Target, seconds: number) => {
    if (!canStun(t)) return;
    if (
      statuses.apply(unit.id, t.id, {
        id: 'manga-stun',
        kind: 'stun',
        durationSeconds: seconds,
        immuneTo: [],
        stacking: { scope: 'target', reapply: 'keep', maxStacks: 1 },
        immunitySeconds: unit.stunProtectionSeconds,
        speedMultiplier: 0,
        combine: 'strongest'
      })
    )
      events.push({ time, type: 'stun', target: t.id, amount: seconds });
  };
  const damage = (t: Target, raw: number, kind: string, modifiers = build.modifiers) => {
    statuses.settle(t.id);
    const { amount, applied } = applyDamage(t, raw, modifiers, kind === 'emission');
    if (applied <= EPS) return false;
    afterDamage(t, { amount, applied });
    events.push({ time, type: kind, target: t.id, amount });
    return true;
  };
  const changeForm = (id: string, exhausted = false) => {
    const oldPeriod = form().primary.period;
    const wasDraining = draining();
    formId = id;
    if (wasDraining && !draining()) reentryAt = time + resource.reentrySeconds;
    if (!exhausted && nextCycle > time && recoveryKind !== 'technique')
      nextCycle = time + ((nextCycle - time) / oldPeriod) * form().primary.period;
    queuedTechnique = undefined;
    events.push({ time, type: exhausted ? 'exhausted' : 'form', detail: id });
  };
  const finishContact = (attack: Pending) => {
    attack.next++;
    if (attack.next >= attack.hitTimes.length) {
      if (queuedForm) {
        changeForm(queuedForm);
        queuedForm = undefined;
      }
      pending = undefined;
    }
  };
  const resolve = (attack = pending!, projectile?: Projectile) => {
    const modifiers = projectile?.modifiers ?? build.modifiers;
    let target = enemies.find((t) => t.id === attack.target);
    if (
      !target ||
      !(projectile
        ? projectileHits({ ...projectile, target: attack.target }, target, {
            origin,
            detectConcealed: !!modifiers.detectConcealed,
            obstacles
          })
        : eligible(target))
    )
      target =
        !projectile && attack.kind === 'primary' && modifiers.retargetPrimary
          ? select()
          : undefined;
    if (!projectile && attack.projectileSpeed && target) {
      if (projectiles.length >= 4096) throw new Error('Projectile limit exceeded.');
      const shot: Projectile = {
        attack: { ...structuredClone(attack), target: target.id },
        impactAt: time + distance(origin, target) / attack.projectileSpeed,
        x: target.x,
        y: target.y,
        radius: attack.projectileRadius!,
        modifiers: structuredClone(modifiers)
      };
      projectiles.push(shot);
      shot.actor = emitProjectile({
        projectile: {
          id: attack.kind,
          damage: attack.damage,
          detectConcealed: !!modifiers.detectConcealed,
          radius: shot.radius,
          pierce: 1,
          flight: { kind: 'aimed-impact', speed: attack.projectileSpeed }
        },
        origin,
        aim: target,
        scheduler: mechanicsClock,
        targets: () => enemies,
        obstacles,
        onContact: () => resolve(shot.attack, shot),
        onEnd: (event) => {
          const index = projectiles.indexOf(shot);
          if (index >= 0) projectiles.splice(index, 1);
          if (event.reason !== 'exhaust') events.push({ time, type: 'miss', detail: attack.kind });
        }
      });
      events.push({ time, type: 'projectile-launch', target: target.id, detail: attack.kind });
      finishContact(attack);
      return;
    }
    if (!target) events.push({ time, type: 'miss', detail: attack.kind });
    else {
      for (const enemy of enemies) statuses.settle(enemy.id);
      const results = resolveAttack(
        {
          id: attack.kind,
          damage: attack.damage,
          shape: attack.shape,
          range: effectiveRange(form().primary.reach),
          detectConcealed: !!modifiers.detectConcealed,
          delivery: attack.projectileSpeed ? 'projectile' : 'direct-contact',
          modifiers
        },
        origin,
        target,
        enemies,
        { obstacles, impact: projectile, includeZero: true }
      );
      for (const hit of results.filter((hit) => hit.applied > EPS))
        events.push({ time, type: attack.kind, target: hit.target.id, amount: hit.amount });
      for (const hit of results) afterDamage(hit.target, hit);
      const contacted = results.filter((hit) => hit.applied > EPS).map((hit) => hit.target);
      for (const hit of results)
        for (const effect of attack.onHit ?? []) {
          if (statuses.apply(unit.id, hit.target.id, effect, { damageApplied: hit.applied }))
            events.push({ time, type: 'status', target: hit.target.id, detail: effect.id });
        }
      const stuns = new Map<Target, number>();
      if (modifiers.contactStun) for (const t of contacted) stuns.set(t, modifiers.contactStun);
      if (contacted.length && attack.kind === 'primary') {
        const pulse = modifiers.pulse;
        if (pulse) {
          pulseCounter = Math.min(pulse.cycles, pulseCounter + 1);
          if (pulseCounter >= pulse.cycles && time + EPS >= pulseAt) {
            pulseCounter = 0;
            pulseAt = time + pulse.interval;
            const affected = enemies
              .filter(
                (t) =>
                  eligible(t, target) && canStun(t) && distance(target, t) <= pulse.radius + EPS
              )
              .sort(
                (a, b) => distance(target!, a) - distance(target!, b) || a.id.localeCompare(b.id)
              )
              .slice(0, pulse.cap);
            for (const t of affected) stuns.set(t, Math.max(stuns.get(t) ?? 0, pulse.stun));
            events.push({ time, type: 'pulse', amount: affected.length });
          }
        }
        const emission = modifiers.emission;
        if (emission && ++emissionCounter >= emission.cycles) {
          emissionCounter = 0;
          const d = distance(origin, target);
          const end = {
            x: target.x + (d > EPS ? (target.x - origin.x) / d : 1) * emission.length,
            y: target.y + (d > EPS ? (target.y - origin.y) / d : 0) * emission.length
          };
          enemies
            .filter((t) => {
              const p = linePoint(t, target!, end);
              return (
                eligible(t, target!, Infinity) &&
                p.along >= -EPS &&
                p.along <= emission.length + EPS &&
                p.across <= emission.width / 2
              );
            })
            .sort((a, b) => distance(target!, a) - distance(target!, b) || a.id.localeCompare(b.id))
            .slice(0, emission.cap)
            .forEach((t) => damage(t, emission.damage, 'emission', modifiers));
        }
      }
      for (const [t, seconds] of stuns) stun(t, seconds);
      const control = attack.technique?.control;
      for (const t of contacted) {
        if (control?.displacement && t.displaceable && t.health > EPS) {
          const progress = t.pathPosition ?? Math.max(0, t.x);
          const offset = t.x - progress;
          t.pathPosition = progress;
          const result = applyPathDisplacement(
            { distance: control.displacement, direction: 'backward' },
            t,
            {
              bounds: { min: 0, max: Infinity },
              pointAt: (position) => ({ x: offset + position, y: t.y })
            }
          );
          if (result) {
            events.push({ time, type: 'displace', target: t.id, amount: result.distance });
            if (result.distance > 0) {
              for (const shot of projectiles) shot.actor?.refresh();
              for (const actor of mechanicalProjectiles.values()) actor.refresh();
            }
          }
        }
        if (control?.slow && t.slowable && t.health > EPS) {
          if (
            statuses.apply(unit.id, t.id, {
              id: 'manga-slow',
              kind: 'slow',
              durationSeconds: control.slow.seconds,
              immuneTo: [],
              stacking: { scope: 'target', reapply: 'refresh', maxStacks: 1 },
              speedMultiplier: 1 - control.slow.fraction,
              combine: 'strongest'
            })
          )
            events.push({ time, type: 'slow', target: t.id, amount: control.slow.fraction });
        }
      }
    }
    if (!projectile) finishContact(attack);
  };
  const requirement = () => {
    const t = technique();
    const wait = Number.isFinite(nextCycle) ? Math.max(0, nextCycle - time) : 0;
    return t
      ? resource.techniqueCost + form().drainPerSecond * (wait + t.windup + t.hitSpan)
      : null;
  };
  const startCycle = () => {
    if (removed) {
      nextCycle = Infinity;
      return;
    }
    const request = queuedTechnique;
    queuedTechnique = undefined;
    const t = technique();
    const requestedTarget = request && enemies.find((e) => e.id === request.target);
    if (
      request &&
      request.form === formId &&
      request.technique === t?.id &&
      requestedTarget &&
      eligible(requestedTarget) &&
      time + EPS >= techniqueAt &&
      affordableResource(
        { amount: stamina, maximum: resource.maximum },
        resource.techniqueCost,
        form().drainPerSecond * (t.windup + t.hitSpan),
        EPS
      )
    ) {
      recoveryKind = 'technique';
      stamina = applyResourceOperation(
        { amount: stamina, maximum: resource.maximum },
        { kind: 'spend', amount: resource.techniqueCost, tolerance: EPS }
      ).balance.amount;
      techniqueAt = time + resource.techniqueCooldown;
      pending = {
        kind: 'technique',
        target: requestedTarget.id,
        hitTimes: Array.from(
          { length: t.hits },
          (_, i) => time + t.windup + (t.hits > 1 ? (i * t.hitSpan) / (t.hits - 1) : 0)
        ),
        next: 0,
        damage: t.damage,
        shape: t.shape,
        technique: t,
        onHit: t.onHit,
        ...(t.delivery === 'projectile'
          ? { projectileSpeed: t.projectileSpeed, projectileRadius: t.projectileRadius }
          : {})
      };
      nextCycle = time + t.windup + t.recovery;
      events.push({ time, type: 'technique-commit', detail: t.id, amount: resource.techniqueCost });
    } else {
      if (request) events.push({ time, type: 'technique-cancel' });
      const target = select();
      if (!target) {
        nextCycle = Infinity;
        return;
      }
      recoveryKind = 'primary';
      const p = form().primary;
      pending = {
        kind: 'primary',
        target: target.id,
        hitTimes: [time + p.windup],
        next: 0,
        damage: p.damage,
        shape: p.shape,
        onHit: p.onHit,
        ...(p.delivery === 'projectile'
          ? { projectileSpeed: p.projectileSpeed, projectileRadius: p.projectileRadius }
          : {})
      };
      nextCycle = time + p.period;
      events.push({ time, type: 'primary-start', target: target.id, detail: formId });
    }
  };
  const runMechanicalAttack = (
    attack: ScheduledAttack,
    sourceId: string,
    from: { x: number; y: number }
  ) => {
    const ownerId = sourceId.slice(0, -(attack.id.length + 1));
    const owner = { id: ownerId, parentId: ownerId === unit.id ? null : unit.id, ...from };
    const range = effectiveRange(attack.range, owner);
    const target = selections.close!.select(
      enemies.filter((t) =>
        canTarget(t, { origin: from, range, detectConcealed: attack.detectConcealed, obstacles })
      ),
      { origin: from }
    )[0];
    if (!target) return;
    const contact = (
      victim: Target,
      raw: number,
      impact?: { x: number; y: number },
      single = false,
      node?: ProjectileDefinition,
      applyEffects = true
    ) => {
      for (const enemy of enemies) statuses.settle(enemy.id);
      const hits = resolveAttack(
        {
          ...attack,
          damage: raw,
          detectConcealed: node?.detectConcealed ?? attack.detectConcealed,
          range,
          ...(single ? { shape: { kind: 'single' as const } } : {})
        },
        from,
        victim,
        enemies,
        {
          obstacles: node?.throughWalls ? [] : obstacles,
          impact,
          includeZero: true,
          appliesDamage: node?.appliesDamage
        }
      );
      for (const hit of hits) {
        afterDamage(hit.target, hit);
        if (hit.applied > EPS)
          events.push({
            time: mechanicsClock.now,
            type: 'mechanical-hit',
            target: hit.target.id,
            amount: hit.amount,
            detail: sourceId
          });
        for (const effect of applyEffects ? (attack.onHit ?? []) : [])
          statuses.apply(sourceId, hit.target.id, effect, { damageApplied: hit.applied });
        for (const effect of node?.onHit ?? [])
          statuses.apply(`${sourceId}/node/${node!.id}`, hit.target.id, effect, {
            damageApplied: hit.applied
          });
      }
    };
    for (let i = 0; i < attack.projectiles; i++) {
      if (attack.delivery === 'direct-contact') contact(target, attack.damage);
      else {
        const graph = attack.projectile ?? {
          id: attack.id,
          damage: attack.damage,
          detectConcealed: attack.detectConcealed,
          radius: attack.projectileRadius!,
          pierce: 1,
          flight: { kind: 'aimed-impact' as const, speed: attack.projectileSpeed! }
        };
        emitProjectile({
          projectile: graph,
          origin: from,
          aim: target,
          scheduler: mechanicsClock,
          targets: () => enemies,
          obstacles,
          targetContext: { source: owner },
          onContact: (event) =>
            contact(
              event.target,
              event.damage,
              event.point,
              !!attack.projectile,
              event.node,
              event.root
            ),
          onEmit: (actor) => mechanicalProjectiles.set(actor.id, actor),
          onEnd: (event) => {
            mechanicalProjectiles.delete(event.projectileId);
          }
        });
      }
    }
  };
  const validateReplacementTargets = (replacements: MangaTarget[]) => {
    if (
      enemies.length + replacements.length > 256 ||
      new Set([...enemies, ...replacements].map((t) => t.id)).size !==
        enemies.length + replacements.length
    )
      throw new Error('Replacement targets must have new unique IDs; at most 256 targets.');
    replacements.forEach(checkTarget);
    if (!options.layers && replacements.some((child) => child.layer))
      throw new Error('Layered targets require explicit layer options.');
  };
  const layerRegistrations = (targets: Target[]) =>
    targets.flatMap((target) =>
      target.layer
        ? [{ target, profileId: target.layer.profileId, regrowth: target.layer.regrowth }]
        : []
    );
  const replaceTargets = (
    id: string,
    replacements: MangaTarget[],
    destroyed = false,
    internal = false
  ) => {
    const target = enemies.find((t) => t.id === id);
    if (!target) throw new Error('Unknown target.');
    if (!internal) validateReplacementTargets(replacements);
    const added = internal
      ? (replacements as Target[])
      : replacements.map((t) => ({
          ...normalizeTargetFacts(t),
          stunUntil: 0,
          protectedUntil: 0,
          slowUntil: 0,
          slowFraction: 0
        }));
    const registrations = internal ? [] : layerRegistrations(added);
    layerRuntime?.validateRegistrations(registrations);
    statuses.settle(id);
    enemies.push(...added);
    if (!internal) {
      layerRuntime?.remove(id);
      layerRuntime?.registerBatch(registrations);
    }
    target.health = 0;
    if (destroyed)
      targetDestroyed(
        target,
        replacements.map((t) => t.id)
      );
    else
      statuses.replace(
        id,
        replacements.map((t) => t.id)
      );
    spawnEvents(replacements);
    for (const shot of projectiles) shot.actor?.refresh();
    for (const actor of mechanicalProjectiles.values()) actor.refresh();
    if (!Number.isFinite(nextCycle)) nextCycle = time;
  };
  const makeLayers = (layerTargets = enemies, layerClock = mechanicsClock) => {
    if (!options.layers) {
      if (layerTargets.some((t) => t.layer))
        throw new Error('Layered targets require explicit layer options.');
      return undefined;
    }
    const runtime = createLayerRuntime<Target>(layerClock, options.layers.profiles, {
      createTarget: (profile, parent) => {
        const base = statuses.baseTarget(parent.id)!;
        for (const [key, tag] of Object.entries(eligibilityTags) as [
          keyof typeof eligibilityTags,
          string
        ][])
          base[key] = base.tags?.includes(tag) ?? false;
        return {
          ...normalizeTargetFacts(options.layers!.createTarget(profile, base)),
          layer: {
            profileId: profile.id,
            ...(parent.layer?.regrowth ? { regrowth: parent.layer.regrowth } : {})
          },
          stunUntil: 0,
          protectedUntil: 0,
          slowUntil: 0,
          slowFraction: 0
        };
      },
      validateReplacement: (_parent, children) => validateReplacementTargets(children),
      replaceTarget: (parent, children, reason) =>
        replaceTargets(parent.id, children, reason === 'destroyed', true),
      damage: (target, raw) => {
        const applied = Math.min(target.health, raw);
        target.health = Math.max(0, target.health - applied);
        if (applied > EPS)
          events.push({
            time: mechanicsClock.now,
            type: 'layer-overflow',
            target: target.id,
            amount: raw
          });
        return { amount: raw, applied };
      },
      canRegrow: options.layers.canRegrow
    });
    runtime.registerBatch(layerRegistrations(layerTargets));
    return runtime;
  };
  layerRuntime = makeLayers();
  let round = 0;
  const makeEffects = () =>
    createMechanicalEffectsRuntime(mechanicsClock, {
      targets: enemies,
      obstacles,
      accountState: options.accountState,
      owners: unit.mechanics
        ? [{ id: unit.id, parentId: null, ...origin, model: unit.mechanics }]
        : [],
      execute: (action, _event, ownerId) => {
        if (removed || ownerId !== unit.id || !unit.mechanics) return false;
        if (action.kind === 'spawn-actor') {
          modelRuntime?.summonActor(
            action.actorId,
            action.lifetimeSeconds,
            action.suppressParentAttacks
          );
          return !!modelRuntime;
        }
        if (action.kind === 'attack') return modelRuntime?.attack(action.attackId) ?? false;
        throw new Error(`Unsupported Manga trigger action: ${action.kind}`);
      },
      damage: (target, raw) => {
        statuses.settle(target.id);
        return applyDamage(target, raw);
      },
      onDamage: (event) => {
        if (event.applied > EPS)
          events.push({
            time: event.at,
            type: 'zone-hit',
            target: event.target.id,
            amount: event.amount,
            detail: event.id
          });
        afterDamage(event.target, event);
      },
      onStatus: (target, effect, sourceId, damageApplied) => {
        statuses.apply(sourceId, target.id, effect, { damageApplied });
      },
      onEvent: (event) =>
        events.push({
          time: event.at,
          type: event.kind,
          detail: event.id,
          ...(event.amount === undefined ? {} : { amount: event.amount })
        })
    });
  let effectsRuntime = makeEffects();
  const makeModel = () => {
    if (!unit.mechanics) return undefined;
    const runtime = createModelRuntime(mechanicsClock, unit.mechanics, {
      id: unit.id,
      origin,
      effects: effectsRuntime,
      onAttack: runMechanicalAttack,
      onEvent: (event) =>
        events.push({
          time: event.at,
          type: event.kind,
          detail: event.id,
          ...(event.amount === undefined ? {} : { amount: event.amount })
        })
    });
    runtime.start();
    return runtime;
  };
  let modelRuntime = makeModel();
  const spawnEvents = (targets: MangaTarget[]) => {
    for (const target of targets)
      effectsRuntime.dispatch({
        kind: 'target-spawn',
        targetId: target.id,
        ...(target.tags === undefined ? {} : { targetTags: target.tags })
      });
  };
  const api = {
    advance(seconds: number) {
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 120 || time + seconds > 3600)
        throw new Error('Advance must be 0..120 seconds, with at most 3600 encounter seconds.');
      const end = time + seconds;
      if (!Number.isFinite(nextCycle)) nextCycle = time;
      let iterations = 0;
      while (true) {
        if (++iterations > 500000) throw new Error('Encounter event limit exceeded.');
        mechanicsClock.advance(time, true);
        if (supportAt <= time + EPS && build.support) {
          const support = build.support;
          for (const result of healAllies(allies, { ...support, origin, obstacles }))
            events.push({ time, type: 'heal', ...result, detail: support.name });
          supportAt = time + support.interval;
        }
        if (pending && pending.hitTimes[pending.next]! <= time + EPS) resolve();
        if (draining() && stamina <= EPS) {
          stamina = 0;
          pending = undefined;
          queuedForm = undefined;
          changeForm(unit.baseForm, true);
        }
        if (!pending && nextCycle <= time + EPS) startCycle();
        if (pending && pending.hitTimes[pending.next]! <= time + EPS) continue;
        if (time >= end - EPS) break;
        const exhaustion = draining() ? time + stamina / form().drainPerSecond : Infinity;
        const next = Math.min(
          end,
          exhaustion,
          supportAt,
          mechanicsClock.nextTime ?? Infinity,
          pending?.hitTimes[pending.next] ?? Infinity,
          !pending ? nextCycle : Infinity
        );
        const delta = next - time;
        if (!removed && resourceUnlocked())
          stamina = applyResourceOperation(
            { amount: stamina, maximum: resource.maximum },
            {
              kind: draining() ? 'lose' : 'gain',
              amount: delta * (draining() ? form().drainPerSecond : resource.recoveryPerSecond)
            }
          ).balance.amount;
        time = next;
      }
      return api.snapshot();
    },
    requestForm(id: string) {
      const desired = build.forms.find((f) => f.id === id);
      if (
        removed ||
        !desired ||
        id === formId ||
        (desired.drainPerSecond > 0 &&
          (draining() ||
            time + EPS < reentryAt ||
            !affordableResource(
              { amount: stamina, maximum: resource.maximum },
              resource.entryMinimum,
              0,
              EPS
            )))
      )
        return false;
      if (pending) queuedForm = id;
      else changeForm(id);
      return true;
    },
    requestTechnique() {
      if (removed) return false;
      const t = technique(),
        needed = requirement(),
        target = select();
      if (
        !t ||
        needed === null ||
        !target ||
        time + EPS < techniqueAt ||
        !affordableResource({ amount: stamina, maximum: resource.maximum }, needed, 0, EPS) ||
        queuedTechnique
      )
        return false;
      queuedTechnique = { form: formId, technique: t.id, target: target.id };
      return true;
    },
    purchase(path: number) {
      if (removed) throw new Error('Removed units cannot purchase upgrades.');
      if (!Number.isInteger(path) || path < 0 || path > 2) throw new Error('Unknown path.');
      const next = [...build.tiers] as MangaTiers;
      next[path]!++;
      const updated = compileMangaBuild(unit, next);
      const oldPeriod = form().primary.period;
      const previousSupport = build.support;
      build = updated;
      if (build.support && !previousSupport) supportAt = time + build.support.interval;
      else if (build.support && previousSupport && supportAt > time)
        supportAt = time + ((supportAt - time) * build.support.interval) / previousSupport.interval;
      if (recoveryKind !== 'technique' && Number.isFinite(nextCycle) && nextCycle > time) {
        const ratio = form().primary.period / oldPeriod;
        nextCycle = time + (nextCycle - time) * ratio;
        if (pending)
          pending.hitTimes = pending.hitTimes.map((t) =>
            t > time ? time + (t - time) * ratio : t
          );
      }
      events.push({ time, type: 'purchase', detail: `${path}:${next[path]}` });
    },
    replaceTarget(id: string, replacements: MangaTarget[], destroyed = false) {
      replaceTargets(id, replacements, destroyed);
    },
    updateTarget(id: string, changes: Partial<Omit<MangaTarget, 'id'>>) {
      const target = enemies.find((t) => t.id === id);
      if (!target) throw new Error('Unknown target.');
      if (changes.layer !== undefined)
        throw new Error('Replace the target to change its layer profile.');
      if (target.layer && target.health <= EPS)
        throw new Error('Replace a retired layered target with a new identity.');
      const updatesFacts =
        changes.tags !== undefined || Object.keys(eligibilityTags).some((key) => key in changes);
      if (updatesFacts) {
        const input = structuredClone(changes);
        if (input.tags === undefined) {
          const tags = new Set(target.tags ?? []);
          for (const [key, tag] of Object.entries(eligibilityTags) as [
            keyof typeof eligibilityTags,
            string
          ][]) {
            if (input[key] === false) tags.delete(tag);
            if (input[key] === true) tags.add(tag);
          }
          input.tags = [...tags];
        }
        changes = normalizeTargetFacts(input);
      }
      checkTarget({ ...target, ...changes });
      layerRuntime?.validateHealth(id, changes.health ?? target.health);
      statuses.settle(id);
      const wasDead = target.health <= EPS;
      Object.assign(target, changes);
      if (changes.tags !== undefined || changes.concealed !== undefined)
        statuses.updateProperties(id, {
          ...(changes.tags === undefined ? {} : { tags: changes.tags }),
          ...(changes.concealed === undefined ? {} : { concealed: changes.concealed })
        });
      if (target.health <= EPS) {
        layerRuntime?.remove(id);
        targetDestroyed(target);
      } else if (wasDead) {
        statuses.clear(id);
        popped.delete(id);
        effectsRuntime.dispatch({
          kind: 'target-spawn',
          targetId: id,
          ...(target.tags === undefined ? {} : { targetTags: target.tags })
        });
      }
      for (const shot of projectiles) shot.actor?.refresh();
      for (const actor of mechanicalProjectiles.values()) actor.refresh();
      if (!Number.isFinite(nextCycle)) nextCycle = time;
    },
    remove() {
      if (removed) return false;
      removed = true;
      pending = undefined;
      queuedForm = undefined;
      queuedTechnique = undefined;
      nextCycle = Infinity;
      supportAt = Infinity;
      modelRuntime?.stop();
      events.push({ time, type: 'unit-remove' });
      return true;
    },
    startRound() {
      if (removed) return;
      round++;
      effectsRuntime.dispatch({ kind: 'round-start', round });
      modelRuntime?.startRound();
    },
    endRound() {
      if (round === 0) throw new Error('Start a round before ending it.');
      effectsRuntime.dispatch({ kind: 'round-end', round });
      return effectsRuntime.accountOperation({ kind: 'end-round', roundId: round });
    },
    dispatch(event: TriggerEvent) {
      return effectsRuntime.dispatch(event);
    },
    accountOperation(operation: AccountOperation) {
      return effectsRuntime.ownerAccountOperation(unit.id, operation);
    },
    collect(id: string) {
      return modelRuntime?.collect(id) ?? false;
    },
    collectAll() {
      modelRuntime?.collectAll();
    },
    updateAlly(id: string, changes: Partial<Omit<MangaAlly, 'id'>>) {
      const ally = allies.find((a) => a.id === id);
      if (!ally) throw new Error('Unknown ally.');
      checkAllies([{ ...ally, ...changes }]);
      Object.assign(ally, changes);
    },
    setPriority(value: MangaOptions['priority']) {
      if (!value || !['first', 'last', 'strong', 'close'].includes(value))
        throw new Error('Invalid target priority.');
      priority = value;
    },
    reset(nextTargets: MangaTarget[] = targets, nextAllies: MangaAlly[] = options.allies ?? []) {
      checkAllies(nextAllies);
      if (
        nextTargets.length > 256 ||
        new Set(nextTargets.map((t) => t.id)).size !== nextTargets.length
      )
        throw new Error('Invalid targets.');
      nextTargets.forEach(checkTarget);
      const nextEnemies = nextTargets.map((t) => ({
        ...normalizeTargetFacts(t),
        stunUntil: 0,
        protectedUntil: 0,
        slowUntil: 0,
        slowFraction: 0
      }));
      const nextClock = createMechanicsScheduler(500000);
      const nextLayers = makeLayers(nextEnemies, nextClock);
      allies = structuredClone(nextAllies);
      projectiles.length = 0;
      mechanicalProjectiles.clear();
      mechanicsClock = nextClock;
      supportAt = build.support ? build.support.interval : Infinity;
      enemies = nextEnemies;
      statuses = makeStatuses();
      removed = false;
      time = 0;
      formId = unit.baseForm;
      stamina = resource.maximum;
      reentryAt = 0;
      techniqueAt = 0;
      nextCycle = 0;
      pending = undefined;
      queuedForm = undefined;
      queuedTechnique = undefined;
      recoveryKind = 'primary';
      pulseCounter = 0;
      emissionCounter = 0;
      pulseAt = 0;
      events.length = 0;
      round = 0;
      popped.clear();
      layerRuntime = nextLayers;
      effectsRuntime = makeEffects();
      modelRuntime = makeModel();
      spawnEvents(enemies);
      return api.snapshot();
    },
    snapshot() {
      return structuredClone({
        schema: 'mardwerk.manga-mayhem.encounter',
        version: '0.1',
        time,
        removed,
        form: formId,
        stamina: resourceUnlocked() ? stamina : null,
        reentryAt,
        techniqueAt,
        nextCycle: Number.isFinite(nextCycle) ? nextCycle : null,
        technique: technique()?.id ?? null,
        techniqueRequirement: requirement(),
        pending: pending?.kind ?? null,
        queuedTechnique: !!queuedTechnique,
        pulseCounter,
        emissionCounter,
        tiers: build.tiers,
        allies: allies.map((ally) => ({
          ...ally,
          ...(ally.baseRange === undefined
            ? {}
            : { effectiveRange: effectiveRange(ally.baseRange, ally) })
        })),
        mechanics: modelRuntime?.snapshot() ?? null,
        effects: effectsRuntime.snapshot(),
        layers: layerRuntime?.snapshot() ?? [],
        mechanicalProjectiles: [...mechanicalProjectiles.values()].map((actor) => ({
          id: actor.id,
          position: actor.position
        })),
        statuses: statuses.snapshot(),
        supportAt: Number.isFinite(supportAt) ? supportAt : null,
        projectiles: projectiles.map((p) => ({
          target: p.attack.target,
          x: p.x,
          y: p.y,
          impactAt: p.impactAt,
          kind: p.attack.kind
        })),
        targets: enemies.map((t) => ({
          ...t,
          slowFraction: t.slowUntil > time ? t.slowFraction : 0
        })),
        events
      });
    }
  };
  spawnEvents(enemies);
  return api;
}
