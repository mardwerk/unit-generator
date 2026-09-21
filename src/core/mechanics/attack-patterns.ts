import {
  attackSchema,
  mechanicsDefinitionSchema,
  type Attack,
  type EnemyProperty,
  type MechanicsDefinition,
} from './schemas.js';
import { assessTarget, resolvedIssues, MechanicsValidationError } from './resolve.js';

/** Geometry and primary collisions come from the host. No trajectory or wave simulation is implied. */
export interface AttackTarget {
  id: string;
  distanceFromUnit: number;
  /** Distance from the single selected primary impact, including for distinct-target volleys. */
  distanceFromPrimary: number;
  camo: boolean;
  obstructed: boolean;
  /** Required for secondary hits; omitted geometry cannot establish clear delivery. */
  obstructedFromPrimary?: boolean;
  properties: EnemyProperty[];
}
export interface SecondaryHit {
  targetId: string;
  damage: number;
  burnDamagePerSecond: number;
  burnSeconds: number;
  slowPercent: number;
  slowSeconds: number;
  stunSeconds: number;
}

function inputs(attack: Attack, targets: AttackTarget[], definition: MechanicsDefinition) {
  const parsed = attackSchema.parse(attack);
  const rules = mechanicsDefinitionSchema.parse(definition);
  const issues = resolvedIssues(
    { baseAttack: parsed, abilities: [], selection: [0, 0, 0], cumulativeCost: parsed.cost },
    rules,
    'attack',
  );
  if (issues.length) throw new MechanicsValidationError(issues);
  const ids = new Set<string>();
  for (const target of targets) {
    if (
      !target.id ||
      ids.has(target.id) ||
      !Number.isFinite(target.distanceFromUnit) ||
      target.distanceFromUnit < 0 ||
      !Number.isFinite(target.distanceFromPrimary) ||
      target.distanceFromPrimary < 0
    )
      throw new Error('Targets require unique IDs and finite nonnegative distances.');
    ids.add(target.id);
  }
  return { attack: parsed, definition: rules };
}
const nearest = (a: AttackTarget, b: AttackTarget) =>
  a.distanceFromPrimary - b.distanceFromPrimary || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Primary first; extra distinct shots use nearest eligible enemies and are never retargeted to the primary. */
export function selectVolleyTargets(
  attack: Attack,
  primaryId: string,
  targets: AttackTarget[],
  definition: MechanicsDefinition,
): string[] {
  const input = inputs(attack, targets, definition);
  const eligible = targets.filter((target) => {
    const access = assessTarget(input.attack, target, input.definition);
    return access.detected && access.reachable && target.distanceFromUnit <= attack.stats.range;
  });
  const primary = eligible.find((target) => target.id === primaryId);
  if (!primary) return [];
  if (attack.distribution !== 'distinct-targets')
    return Array.from({ length: attack.stats.projectiles }, () => primaryId);
  return [primary, ...eligible.filter((target) => target.id !== primaryId).sort(nearest)]
    .slice(0, attack.stats.projectiles)
    .map((target) => target.id);
}

/** Call once after a primary volley finishes. A miss emits nothing; children never emit children. */
export function resolveFollowUpHits(
  attack: Attack,
  primaryHitIds: string[],
  targets: AttackTarget[],
  definition: MechanicsDefinition,
): SecondaryHit[] {
  const input = inputs(attack, targets, definition);
  const effect = input.attack.followUp;
  if (!effect || !primaryHitIds.length) return [];
  const primaryHits = new Set(primaryHitIds);
  return targets
    .filter((target) => {
      const access = assessTarget(
        input.attack,
        { ...target, obstructed: target.obstructedFromPrimary !== false },
        input.definition,
      );
      return (
        !primaryHits.has(target.id) &&
        target.distanceFromPrimary <= effect.radius &&
        access.detected &&
        access.reachable
      );
    })
    .sort(nearest)
    .slice(0, effect.count)
    .map((target) => {
      const access = assessTarget(
        input.attack,
        { ...target, obstructed: target.obstructedFromPrimary !== false },
        input.definition,
      );
      const stats = input.attack.stats;
      return {
        targetId: target.id,
        damage: access.canDamage ? stats.damage * effect.damageMultiplier : 0,
        burnDamagePerSecond:
          effect.inheritStatuses && access.canDamage ? stats.burnDamagePerSecond : 0,
        burnSeconds: effect.inheritStatuses && access.canDamage ? stats.burnSeconds : 0,
        slowPercent: effect.inheritStatuses && access.canSlow ? stats.slowPercent : 0,
        slowSeconds: effect.inheritStatuses && access.canSlow ? stats.slowSeconds : 0,
        stunSeconds: effect.inheritStatuses && access.canStun ? stats.stunSeconds : 0,
      };
    });
}
