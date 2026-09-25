import { allLegalBuilds, resolveUnchecked, resolvedIssues } from '../mechanics/resolve.js';
import {
  pathKeys,
  tierKeys,
  type BuildSelection,
  type MechanicsDefinition,
  type MechanicsIssue,
  type UnitBlueprint,
} from '../mechanics/schemas.js';
import type { UnitDesignPlan, UpgradeIntent } from './plan-schema.js';

type ResolvedBuild = ReturnType<typeof resolveUnchecked>;
type Path = (typeof pathKeys)[number];
type Improvement = UpgradeIntent['improves'][number];

/** Concrete dimensions only. Increasing one promised dimension may trade off another. */
function measures(build: ResolvedBuild, path: Path, dimension: Improvement): number[] {
  const attack = build.baseAttack;
  const stats = attack.stats;
  const active = build.abilities.find((ability) => ability.path === path);
  switch (dimension) {
    case 'damage':
      return [stats.damage];
    case 'attack-rate':
      return [1 / stats.intervalSeconds];
    case 'range':
      return [stats.range];
    case 'pierce':
      return [stats.pierce];
    case 'projectiles':
      return [stats.projectiles];
    case 'splash':
      return [stats.splashRadius];
    case 'slow':
      return [stats.slowPercent, stats.slowSeconds];
    case 'burn':
      return [stats.burnDamagePerSecond, stats.burnSeconds];
    case 'stun':
      return [stats.stunSeconds];
    case 'follow-up':
      return attack.followUp
        ? [
            attack.followUp.count,
            attack.followUp.damageMultiplier * stats.damage,
            attack.followUp.radius,
            Number(attack.followUp.inheritStatuses),
          ]
        : [0, 0, 0, 0];
    case 'active-damage':
      return [active?.boostedAttack.stats.damage ?? 0];
    case 'active-attack-rate':
      return [active ? 1 / active.boostedAttack.stats.intervalSeconds : 0];
    case 'active-duration':
      return [active?.durationSeconds ?? 0];
    case 'active-frequency':
      return [active ? 1 / active.cooldownSeconds : 0];
  }
}

function hasActiveFollowUp(blueprint: UnitBlueprint, path: Path, tier: number): boolean {
  return tierKeys
    .slice(0, tier)
    .some((key) =>
      blueprint.paths[path].tiers[key].changes.some(
        (change) => change.kind === 'followUp' && change.target === 'boost',
      ),
    );
}

function unlocked(
  before: ResolvedBuild,
  after: ResolvedBuild,
  intent: UpgradeIntent['unlock'],
  path: Path,
  tier: number,
  blueprint: UnitBlueprint,
  definition: MechanicsDefinition,
): boolean {
  const a = before.baseAttack;
  const b = after.baseAttack;
  switch (intent) {
    case 'none':
      return true;
    case 'manual-boost':
      return (
        tier === definition.rules.manualBoostUnlockTier &&
        !before.abilities.some((entry) => entry.path === path) &&
        after.abilities.some((entry) => entry.path === path)
      );
    case 'follow-up':
      return !a.followUp && !!b.followUp;
    case 'active-follow-up':
      return (
        !hasActiveFollowUp(blueprint, path, tier - 1) &&
        hasActiveFollowUp(blueprint, path, tier) &&
        after.abilities.some((entry) => entry.path === path && !!entry.boostedAttack.followUp)
      );
    case 'camo':
      return !a.camo && b.camo;
    case 'distinct-volley':
      return a.distribution !== 'distinct-targets' && b.distribution === 'distinct-targets';
    case 'splash':
      return a.stats.splashRadius === 0 && b.stats.splashRadius > 0;
    case 'slow':
      return a.stats.slowPercent === 0 && b.stats.slowPercent > 0;
    case 'burn':
      return a.stats.burnDamagePerSecond === 0 && b.stats.burnDamagePerSecond > 0;
    case 'stun':
      return a.stats.stunSeconds === 0 && b.stats.stunSeconds > 0;
    case 'delivery-change':
      return a.delivery !== b.delivery;
    case 'damage-type-change':
      return a.damageType !== b.damageType;
    case 'targeting-change':
      return a.targeting !== b.targeting;
  }
}

/** Accept parsed mechanics; invalid resolved values cannot establish a promised improvement. */
export function planIntentIssues(
  blueprint: UnitBlueprint,
  plan: Pick<UnitDesignPlan, 'upgradeIntents'>,
  definition: MechanicsDefinition,
): MechanicsIssue[] {
  if (!plan.upgradeIntents) return [];
  const builds = allLegalBuilds(definition).map((selection) => ({
    selection,
    build: resolveUnchecked(blueprint, selection),
  }));
  if (builds.some(({ build }) => resolvedIssues(build, definition, 'build').length)) return [];
  const issues = new Map<string, MechanicsIssue>();
  for (const { selection, build: after } of builds) {
    pathKeys.forEach((path, index) => {
      const tier = selection[index]!;
      if (!tier) return;
      const key = tierKeys[tier - 1]!;
      const intent = plan.upgradeIntents![path][key];
      const previous: BuildSelection = [...selection];
      previous[index] = tier - 1;
      const before = resolveUnchecked(blueprint, previous);
      const report = (promise: string) => {
        const id = `${path}.${key}.${promise}`;
        if (!issues.has(id))
          issues.set(id, {
            path: `paths.${path}.tiers.${key}.planIntent`,
            message: `The retained plan promises ${promise}, but this purchase does not implement it in legal build ${selection.join('-')}. Implement the promised dimension; an unrelated benefit does not satisfy it.`,
          });
      };
      for (const dimension of intent.improves) {
        const prior = measures(before, path, dimension);
        if (!measures(after, path, dimension).some((value, metric) => value > prior[metric]!))
          report(`improved ${dimension}`);
      }
      if (!unlocked(before, after, intent.unlock, path, tier, blueprint, definition))
        report(`unlock ${intent.unlock}`);
    });
  }
  return [...issues.values()];
}
