import { resolveUnchecked } from './resolve.js';
import {
  pathKeys,
  statKeys,
  type Attack,
  type BuildSelection,
  type MechanicsDefinition,
  type MechanicsIssue,
  type UnitBlueprint,
} from './schemas.js';

type Build = ReturnType<typeof resolveUnchecked>;
type Specialization = NonNullable<UnitBlueprint['paths']['path1']['specialization']>;
const atLeast = (value: number, minimum: number) =>
  value >= minimum || Math.abs(value - minimum) <= 1e-12 * Math.max(1, minimum);

function directDamage(attack: Attack): number {
  const s = attack.stats;
  return (
    (s.damage * (attack.distribution === 'distinct-targets' ? 1 : s.projectiles)) /
      s.intervalSeconds +
    s.burnDamagePerSecond * Math.min(1, s.burnSeconds / s.intervalSeconds)
  );
}

/** Capacity heuristics for a pure build, without targets, movement, immunity or combat simulation. */
export function specialtyMetrics(
  build: Build,
  specialization: Specialization,
): Record<string, number> {
  const s = build.baseAttack.stats;
  switch (specialization) {
    case 'direct-damage':
      return { 'direct damage rate': directDamage(build.baseAttack) };
    case 'group-damage':
      return { 'group damage rate upper bound': groupDamage(build.baseAttack) };
    case 'attack-speed':
      return { 'attacks per second': 1 / s.intervalSeconds };
    case 'range':
      return { range: s.range };
    case 'control':
      return {
        'slow coverage upper bound':
          s.slowPercent * Math.min(1, s.slowSeconds / s.intervalSeconds) * s.pierce,
        'stun coverage upper bound': Math.min(1, s.stunSeconds / s.intervalSeconds) * s.pierce,
      };
    case 'ability-burst': {
      const ability = build.abilities[0];
      if (!ability) return {};
      return {
        'active peak direct damage rate': directDamage(ability.boostedAttack),
        'active peak group damage rate upper bound': groupDamage(ability.boostedAttack),
        'active duty fraction': Math.min(1, ability.durationSeconds / ability.cooldownSeconds),
      };
    }
  }
}

function attackBehavior(attack: Attack) {
  return [
    attack.delivery,
    attack.damageType,
    attack.targeting,
    attack.camo,
    attack.distribution ?? 'same-primary',
    attack.followUp
      ? [
          attack.followUp.count,
          attack.followUp.damageMultiplier,
          attack.followUp.radius,
          attack.followUp.inheritStatuses,
        ]
      : null,
    ...statKeys.map((stat) => attack.stats[stat]),
  ];
}

function groupDamage(attack: Attack): number {
  const s = attack.stats;
  const direct =
    directDamage(attack) *
    s.pierce *
    (attack.distribution === 'distinct-targets' ? s.projectiles : 1);
  const secondary = attack.followUp
    ? attack.followUp.count *
      ((s.damage * attack.followUp.damageMultiplier) / s.intervalSeconds +
        (attack.followUp.inheritStatuses
          ? s.burnDamagePerSecond * Math.min(1, s.burnSeconds / s.intervalSeconds)
          : 0))
    : 0;
  return direct + secondary;
}

/** A new attack shape or capability, not a rename or a larger existing scalar. */
export function hasBehaviorTransition(before: Build, after: Build): boolean {
  const a = before.baseAttack;
  const b = after.baseAttack;
  if (
    a.delivery !== b.delivery ||
    a.targeting !== b.targeting ||
    (a.distribution ?? 'same-primary') !== (b.distribution ?? 'same-primary')
  )
    return true;
  if (!a.followUp && b.followUp) return true;
  if (a.stats.projectiles === 1 && b.stats.projectiles > 1) return true;
  if (
    ['splashRadius', 'slowPercent', 'burnDamagePerSecond', 'stunSeconds'].some(
      (key) =>
        a.stats[key as keyof typeof a.stats] === 0 && b.stats[key as keyof typeof b.stats] > 0,
    )
  )
    return true;
  return after.abilities.some(
    (ability) =>
      !before.abilities.find((prior) => prior.path === ability.path)?.boostedAttack.followUp &&
      ability.boostedAttack.followUp,
  );
}
function behavior(build: Build): string {
  return JSON.stringify([
    attackBehavior(build.baseAttack),
    build.abilities.map((ability) => [
      ability.durationSeconds,
      ability.cooldownSeconds,
      attackBehavior(ability.boostedAttack),
    ]),
  ]);
}
function pureBuild(blueprint: UnitBlueprint, pathIndex: number, tier: number): Build {
  const selection: BuildSelection = [0, 0, 0];
  selection[pathIndex] = tier;
  return resolveUnchecked(blueprint, selection);
}

/** Optional authoring constraints. The caller validates blueprint syntax and resolved values first. */
export function designPolicyIssues(
  blueprint: UnitBlueprint,
  definition: MechanicsDefinition,
): MechanicsIssue[] {
  const policy = definition.profile.designPolicy;
  if (!policy) return [];
  const issues: MechanicsIssue[] = [];
  const specializations = new Set<Specialization>();
  const firstUpgrades = new Map<string, string>();
  const capstones = new Map<string, string>();
  let manualPaths = 0;
  pathKeys.forEach((path, index) => {
    const branch = blueprint.paths[path];
    const prefix = `paths.${path}`;
    const specialization = branch.specialization;
    if (!specialization) {
      issues.push({
        path: `${prefix}.specialization`,
        message: 'The design policy requires an explicit path specialization.',
      });
    } else {
      if (policy.distinctPathSpecializations && specializations.has(specialization))
        issues.push({
          path: `${prefix}.specialization`,
          message: `The design policy requires distinct path specializations; ${specialization} is already used.`,
        });
      specializations.add(specialization);
    }
    const tier4 = pureBuild(blueprint, index, 4);
    const tier5 = pureBuild(blueprint, index, 5);
    for (const [tier, required] of [
      [3, policy.requireTier3BehaviorChange],
      [5, policy.requireTier5BehaviorChange],
    ] as const) {
      if (
        required &&
        !hasBehaviorTransition(
          pureBuild(blueprint, index, tier - 1),
          pureBuild(blueprint, index, tier),
        )
      )
        issues.push({
          path: `${prefix}.tiers.tier${tier}`,
          message: `Tier ${tier} must introduce a supported attack behavior, such as a new delivery, distinct-target volley, status, splash or bounded follow-up. Increasing existing numbers or changing a name alone is insufficient.`,
        });
    }
    for (const [enabled, tier, build, seen] of [
      [policy.distinctFirstUpgrades, 1, pureBuild(blueprint, index, 1), firstUpgrades],
      [policy.distinctCapstones, 5, tier5, capstones],
    ] as const) {
      if (!enabled) continue;
      const signature = behavior(build);
      const previous = seen.get(signature);
      if (previous)
        issues.push({
          path: `${prefix}.tiers.tier${tier}`,
          message: `Resolved tier ${tier} behavior duplicates ${previous}; names and prices do not make a distinct upgrade.`,
        });
      else seen.set(signature, path);
    }
    if (
      tier4.abilities.length &&
      policy.manualAbilityPath !== undefined &&
      policy.manualAbilityPath !== path
    )
      issues.push({
        path: `${prefix}.tiers.tier4`,
        message:
          policy.manualAbilityPath === null
            ? 'The design policy does not permit manual abilities on any path.'
            : `The design policy permits a manual ability only on ${policy.manualAbilityPath}. This path must remain automatic.`,
      });
    if (tier4.abilities.length && ++manualPaths > policy.maxManualAbilityPaths)
      issues.push({
        path: `${prefix}.tiers.tier4`,
        message: `The design policy permits at most ${policy.maxManualAbilityPaths} paths with manual abilities.`,
      });
    const minimumMultiplier = policy.minTier5SpecialtyMultiplier;
    if (!specialization || minimumMultiplier === undefined) return;
    const before = specialtyMetrics(tier4, specialization);
    const after = specialtyMetrics(tier5, specialization);
    const ratios = Object.entries(before).flatMap(([metric, value]) => {
      const next = after[metric];
      return Number.isFinite(value) &&
        value > 0 &&
        next !== undefined &&
        Number.isFinite(next) &&
        Number.isFinite(next / value)
        ? [{ metric, ratio: next / value }]
        : [];
    });
    const peakRatios = ratios.filter((entry) => entry.metric.startsWith('active peak'));
    const improved = ratios.some(
      ({ metric, ratio }) =>
        atLeast(ratio, minimumMultiplier) &&
        (metric !== 'active duty fraction' ||
          (peakRatios.length > 0 && peakRatios.every((entry) => atLeast(entry.ratio, 1)))),
    );
    if (!improved) {
      const achieved = ratios.length
        ? ratios
            .map(({ metric, ratio }) => `${metric}: ${Number(ratio.toPrecision(4))}x`)
            .join('; ')
        : 'no finite positive tier 4 specialty metric is established';
      issues.push({
        path: `${prefix}.tiers.tier5`,
        message: `Tier 5 must improve an established ${specialization} specialty metric by at least ${policy.minTier5SpecialtyMultiplier}x over pure tier 4. Achieved ${achieved}.${specialization === 'ability-burst' ? ' A duty-only gain must also retain peak output.' : ''} These are capacity heuristics, including group/control upper bounds, not simulated combat power or a universal BTD6 balance rule.`,
      });
    }
  });
  return issues;
}
