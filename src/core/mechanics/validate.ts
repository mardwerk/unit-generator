import {
  diagnosticBlueprintSchema,
  mechanicsDefinitionSchema,
  defaultMechanicsDefinition,
  pathKeys,
  tierKeys,
  statKeys,
  boostStatKeys,
  type Attack,
  type BuildSelection,
  type MechanicsDefinition,
  type MechanicsIssue,
} from './schemas.js';
import { allLegalBuilds, resolveUnchecked, resolvedIssues } from './resolve.js';
import { designPolicyIssues } from './design-policy.js';

function capabilities(attack: Attack): Set<string> {
  const stats = attack.stats;
  const result = new Set<string>();
  if (stats.splashRadius > 0) result.add('splash');
  if (stats.slowPercent > 0) result.add('slow');
  if (stats.burnDamagePerSecond > 0) result.add('burn');
  if (stats.stunSeconds > 0) result.add('stun');
  if (attack.camo) result.add('camo');
  if (attack.distribution === 'distinct-targets') result.add('distinct-volley');
  if (attack.followUp) result.add('follow-up');
  return result;
}

function behavior(build: ReturnType<typeof resolveUnchecked>): string {
  return JSON.stringify({ baseAttack: build.baseAttack, abilities: build.abilities });
}

/** This rejects pure downgrades; it does not compare the value of different benefits. */
function hasBenefit(
  before: ReturnType<typeof resolveUnchecked>,
  after: ReturnType<typeof resolveUnchecked>,
): boolean {
  const prior = before.baseAttack;
  const next = after.baseAttack;
  if (
    statKeys.some((stat) => {
      if (stat === 'splashRadius' && next.stats.pierce <= 1) return false;
      return stat === 'intervalSeconds'
        ? next.stats[stat] < prior.stats[stat]
        : next.stats[stat] > prior.stats[stat];
    })
  )
    return true;
  if (
    (!prior.camo && next.camo) ||
    prior.damageType !== next.damageType ||
    prior.delivery !== next.delivery ||
    prior.targeting !== next.targeting
  )
    return true;
  if (prior.distribution !== next.distribution || (!prior.followUp && next.followUp)) return true;
  if (
    prior.followUp &&
    next.followUp &&
    (next.followUp.count > prior.followUp.count ||
      next.followUp.damageMultiplier > prior.followUp.damageMultiplier ||
      next.followUp.radius > prior.followUp.radius ||
      (!prior.followUp.inheritStatuses && next.followUp.inheritStatuses))
  )
    return true;
  return after.abilities.some((ability) => {
    const previous = before.abilities.find((entry) => entry.path === ability.path);
    if (!previous) return true;
    if (!previous.boostedAttack.followUp && ability.boostedAttack.followUp) return true;
    return boostStatKeys.some((stat) => {
      if (stat === 'damageMultiplier')
        return ability.boostedAttack.stats.damage > previous.boostedAttack.stats.damage;
      return stat === 'cooldownSeconds' || stat === 'intervalMultiplier'
        ? ability[stat] < previous[stat]
        : ability[stat] > previous[stat];
    });
  });
}

/** Validate syntax, all reachable build states, and each immediately purchasable upgrade. */
export function validateBlueprint(
  input: unknown,
  definition: MechanicsDefinition = defaultMechanicsDefinition,
): MechanicsIssue[] {
  const parsedDefinition = mechanicsDefinitionSchema.safeParse(definition);
  if (!parsedDefinition.success)
    return parsedDefinition.error.issues.map((issue) => ({
      path: `definition.${issue.path.join('.')}`,
      message: issue.message,
    }));
  const parsed = diagnosticBlueprintSchema.safeParse(input);
  if (!parsed.success)
    return parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
  const blueprint = parsed.data;
  const rules = parsedDefinition.data;
  const issues: MechanicsIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });
  if (blueprint.baseAttack.cost > rules.profile.maxBaseCost)
    add('baseAttack.cost', 'Exceeds the Definition base cost ceiling.');
  pathKeys.forEach((path, pathIndex) => {
    const branch = blueprint.paths[path];
    branch.sourceFactIndices.forEach((index, ref) => {
      if (index >= blueprint.sourceFacts.length)
        add(
          `paths.${path}.sourceFactIndices.${ref}`,
          'References a source fact that does not exist.',
        );
    });
    tierKeys.forEach((tierKey, tierIndex) => {
      const tier = tierIndex + 1;
      const upgrade = branch.tiers[tierKey];
      const prefix = `paths.${path}.tiers.${tierKey}`;
      if (upgrade.cost > rules.profile.maxUpgradeCost)
        add(`${prefix}.cost`, 'Exceeds the Definition incremental upgrade cost ceiling.');
      const changeLimit =
        tier <= (rules.profile.earlyTierThrough ?? 3)
          ? Math.min(rules.profile.earlyTierMaxChanges, rules.profile.maxChangesPerTier)
          : rules.profile.maxChangesPerTier;
      if (upgrade.changes.length > changeLimit)
        add(`${prefix}.changes`, 'Exceeds the Definition change budget.');
      if (upgrade.changes.length === 0)
        add(`${prefix}.changes`, 'Tier must contain at least one effect.');
      const unlocks = upgrade.changes.filter((change) => change.kind === 'unlockBoost');
      if (unlocks.length > 1)
        add(`${prefix}.changes`, 'Only one manual boost can be unlocked on a path.');
      upgrade.changes.forEach((change, changeIndex) => {
        const changePath = `${prefix}.changes.${changeIndex}`;
        if (
          (change.kind === 'stat' || change.kind === 'modifyBoost') &&
          change.operation === 'multiply' &&
          change.value <= 0
        )
          add(changePath, 'A multiplier must be positive.');
        if (change.kind === 'unlockBoost' && tier !== rules.rules.manualBoostUnlockTier)
          add(changePath, 'A manual boost can only unlock at tier 4.');
        if (change.kind === 'modifyBoost') {
          if (tier !== rules.rules.manualBoostModifyTier)
            add(changePath, 'A manual boost can only be modified at tier 5.');
          if (!branch.tiers.tier4.changes.some((entry) => entry.kind === 'unlockBoost'))
            add(changePath, 'This path has no tier 4 boost to modify.');
        }
        if (change.kind === 'followUp' && change.target === 'boost') {
          if (
            tier < rules.rules.manualBoostUnlockTier ||
            !branch.tiers.tier4.changes.some((entry) => entry.kind === 'unlockBoost')
          )
            add(changePath, "An active follow-up requires this path's purchased tier 4 boost.");
        }
      });
      if (tier <= 2) {
        const beforeSelection: BuildSelection = [0, 0, 0];
        beforeSelection[pathIndex] = tier - 1;
        const afterSelection: BuildSelection = [...beforeSelection];
        afterSelection[pathIndex] = tier;
        const before = resolveUnchecked(blueprint, beforeSelection).baseAttack;
        const after = resolveUnchecked(blueprint, afterSelection).baseAttack;
        const existing = capabilities(before);
        const added = [...capabilities(after)].filter((capability) => !existing.has(capability));
        if (before.damageType !== after.damageType) added.push('damage-type-access');
        if (
          rules.profile.designPolicy?.preserveEarlyAttackIdentity &&
          (added.some((capability) => capability !== 'camo') ||
            before.delivery !== after.delivery ||
            before.targeting !== after.targeting ||
            (before.stats.projectiles === 1 && after.stats.projectiles > 1))
        )
          add(
            `${prefix}.changes`,
            'T1 and T2 improve the existing basic attack. They cannot introduce a new attack pattern, status or delivery; personal detection and improvements to existing stats remain allowed. Specialize at T3.',
          );
        // Delivery and targeting remain properties of the same attack, not independent loops.
        if (added.length > rules.profile.earlyTierMaxNewCapabilities)
          add(
            `${prefix}.changes`,
            `Early tiers may add at most ${rules.profile.earlyTierMaxNewCapabilities} capability group; this adds ${added.join(', ')}.`,
          );
      }
    });
  });

  const legalBuilds = allLegalBuilds(rules);
  let resolvedValuesValid = true;
  const noOpTiers = new Set<string>();
  const downgradeTiers = new Set<string>();
  for (const selection of legalBuilds) {
    const build = resolveUnchecked(blueprint, selection);
    const buildIssues = resolvedIssues(build, rules, `builds.${selection.join('-')}`, blueprint);
    if (buildIssues.length) resolvedValuesValid = false;
    issues.push(...buildIssues);
    pathKeys.forEach((path, pathIndex) => {
      const tier = selection[pathIndex]!;
      if (!tier) return;
      const previousSelection: BuildSelection = [...selection];
      previousSelection[pathIndex] = tier - 1;
      const previous = resolveUnchecked(blueprint, previousSelection);
      const key = `paths.${path}.tiers.${tierKeys[tier - 1]}`;
      if (behavior(previous) === behavior(build)) {
        if (!noOpTiers.has(key)) {
          add(key, `Upgrade changes no behavior in legal build ${selection.join('-')}.`);
          noOpTiers.add(key);
        }
      } else if (!hasBenefit(previous, build) && !downgradeTiers.has(key)) {
        add(
          key,
          `Upgrade only reduces or preserves supported gameplay dimensions in legal build ${selection.join('-')}. Add a benefit; tradeoffs are allowed.`,
        );
        downgradeTiers.add(key);
      }
    });
  }
  // Report independent design defects in the same repair as effect-budget errors.
  // Invalid resolved values cannot support meaningful specialty comparisons.
  if (resolvedValuesValid) issues.push(...designPolicyIssues(blueprint, rules));
  return issues;
}
