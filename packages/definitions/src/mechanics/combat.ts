import type { ExecutableAttack, AttackShape, DamageModifiers } from './schema.js';
export type { ExecutableAttack, AttackShape, DamageModifiers } from './schema.js';
import { distance, linePoint, blocked, type Point, type Obstacle } from './geometry.js';
export interface CombatTarget extends Point {
  tags?: string[];
  damageTaken?: { additive: number; multiplier: number };
  id: string;
  health: number;
  armor?: number;
  concealed?: boolean;
  invulnerable?: boolean;
}
export interface Ally extends Point {
  id: string;
  health: number;
  maximumHealth: number;
}
export interface Targeting {
  origin: Point;
  range: number;
  detectConcealed?: boolean;
  obstacles?: Obstacle[];
  lineOrigin?: Point;
  impact?: Point;
}
export interface ProjectileFlight extends Point {
  target: string;
  radius: number;
  travelSeconds: number;
}
const EPS = 1e-8;
export function combatDamage(
  raw: number,
  armor: number,
  modifiers: DamageModifiers = {},
  excludeFlat = false
) {
  const total =
    (raw + (excludeFlat ? 0 : (modifiers.flatDamage ?? 0))) * (modifiers.damageMultiplier ?? 1);
  const internal = modifiers.internalFraction ?? 0;
  return total * (internal + (1 - internal) * (1 - armor * (1 - (modifiers.armorIgnore ?? 0))));
}
export function applyDamage(
  target: CombatTarget,
  raw: number,
  modifiers: DamageModifiers = {},
  excludeFlat = false
) {
  const base = combatDamage(raw, target.armor ?? 0, modifiers, excludeFlat);
  const amount =
    (base + (target.damageTaken?.additive ?? 0)) * (target.damageTaken?.multiplier ?? 1);
  if (amount <= EPS || target.invulnerable || target.health <= EPS)
    return { amount: 0, applied: 0 };
  const applied = Math.min(target.health, amount);
  target.health -= applied;
  return { amount, applied };
}
export function canTarget(target: CombatTarget, options: Targeting) {
  return (
    target.health > EPS &&
    !target.invulnerable &&
    (!target.concealed || !!options.detectConcealed) &&
    distance(options.origin, target) <= options.range + EPS &&
    !blocked(options.lineOrigin ?? options.origin, target, options.obstacles ?? [])
  );
}
export function selectContactTargets<T extends CombatTarget>(
  target: T,
  shape: AttackShape,
  targets: T[],
  options: Targeting
): T[] {
  if (shape.kind === 'single') return [target];
  const impact = options.impact ?? target;
  const others = targets.filter(
    (t) =>
      t.id !== target.id &&
      canTarget(t, { ...options, lineOrigin: shape.kind === 'sweep' ? options.origin : impact }) &&
      (shape.kind === 'area'
        ? distance(impact, t) <= shape.radius + EPS
        : (() => {
            const p = linePoint(t, options.origin, target);
            return (
              p.along >= 0 &&
              p.along <= distance(options.origin, target) + EPS &&
              p.across <= shape.width / 2
            );
          })())
  );
  return [
    target,
    ...others.sort((a, b) => distance(impact, a) - distance(impact, b) || a.id.localeCompare(b.id))
  ].slice(0, shape.cap);
}
export function launchProjectile(
  origin: Point,
  target: CombatTarget,
  speed: number,
  radius: number
): ProjectileFlight {
  if (!Number.isFinite(speed) || speed <= 0 || !Number.isFinite(radius) || radius <= 0)
    throw new Error('Invalid projectile speed or radius.');
  return {
    target: target.id,
    x: target.x,
    y: target.y,
    radius,
    travelSeconds: distance(origin, target) / speed
  };
}
export function projectileHits(
  flight: Pick<ProjectileFlight, 'target' | 'x' | 'y' | 'radius'>,
  target: CombatTarget,
  options: Omit<Targeting, 'range'>
) {
  return (
    flight.target === target.id &&
    canTarget(target, { ...options, range: Infinity }) &&
    distance(flight, target) <= flight.radius + EPS
  );
}
export function healAllies(
  allies: Ally[],
  options: { origin: Point; radius: number; cap: number; heal: number; obstacles?: Obstacle[] }
) {
  return allies
    .filter(
      (a) =>
        a.health > EPS &&
        a.health < a.maximumHealth &&
        distance(options.origin, a) <= options.radius + EPS &&
        !blocked(options.origin, a, options.obstacles ?? [])
    )
    .sort(
      (a, b) => a.health / a.maximumHealth - b.health / b.maximumHealth || a.id.localeCompare(b.id)
    )
    .slice(0, options.cap)
    .map((a) => {
      const amount = Math.min(options.heal, a.maximumHealth - a.health);
      a.health += amount;
      return { target: a.id, amount };
    });
}

/** Resolves the common contact operation; adapters schedule it and apply game-specific proc policy. */
export function resolveAttack<T extends CombatTarget>(
  attack: ExecutableAttack,
  origin: Point,
  target: T,
  targets: T[],
  options: {
    obstacles?: Obstacle[];
    impact?: Point;
    includeZero?: boolean;
    appliesDamage?: boolean;
  } = {}
) {
  if (
    !canTarget(target, {
      origin,
      range: options.impact ? Infinity : attack.range,
      detectConcealed: attack.detectConcealed,
      obstacles: options.obstacles
    })
  )
    return [];
  const contacts = selectContactTargets(target, attack.shape, targets, {
    origin,
    range: options.impact ? Infinity : attack.range,
    detectConcealed: attack.detectConcealed,
    ...options
  });
  return contacts
    .map((target) => ({
      target,
      ...(options.appliesDamage === false
        ? { amount: 0, applied: 0 }
        : applyDamage(target, attack.damage, attack.modifiers))
    }))
    .filter((hit) => options.includeZero || hit.applied > EPS);
}
