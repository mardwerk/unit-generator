import {
  pathKeys,
  tierKeys,
  type MechanicsDefinition,
  type MechanicsIssue,
} from '../mechanics/schemas.js';
import type { UnitDesignPlan, UpgradeIntent } from './plan-schema.js';

// Changes of an existing mode may legitimately recur. These unlocks instead
// promise an absent capability becoming present, with no typed disable intent.
const capabilities = new Set<UpgradeIntent['unlock']>([
  'manual-boost',
  'follow-up',
  'active-follow-up',
  'camo',
  'distinct-volley',
  'splash',
  'slow',
  'burn',
  'stun',
]);

/** Lower bound for the current model-output wire format, not an authored recipe. */
function minimumEffects(intent: UpgradeIntent): number {
  const effects = new Map<string, number>();
  const add = (key: string) => effects.set(key, key === 'slow' || key === 'burn' ? 2 : 1);
  const improves = new Set(intent.improves);
  if (intent.unlock !== 'none') add(intent.unlock);
  for (const dimension of improves) {
    // The one unlockBoost object includes every initial active parameter.
    if (dimension.startsWith('active-') && intent.unlock === 'manual-boost') continue;
    if (dimension === 'active-damage') add('damage');
    else if (dimension === 'active-attack-rate') add('attack-rate');
    // An existing follow-up's damage scales with ordinary damage. The base
    // repertoire is qualitative, so allow that overlap even without an unlock.
    else if (dimension === 'follow-up' && (improves.has('damage') || improves.has('active-damage')))
      continue;
    else add(dimension);
  }
  return [...effects.values()].reduce((sum, count) => sum + count, 0);
}

/** Reject contradictions in explicit promises, never infer feasibility from prose.
 * Passing this check does not establish executable mechanics or design quality. */
export function planFeasibilityIssues(
  plan: UnitDesignPlan,
  definition: MechanicsDefinition,
): MechanicsIssue[] {
  if (!plan.upgradeIntents) return [];
  const issues: MechanicsIssue[] = [];
  const boostTier = definition.rules.manualBoostUnlockTier;
  const boostKey = tierKeys[boostTier - 1]!;
  for (const path of pathKeys) {
    const intents = plan.upgradeIntents[path];
    const unlocked = new Map<UpgradeIntent['unlock'], string>();
    for (const [index, tier] of tierKeys.entries()) {
      const intent = intents[tier];
      const report = (message: string) =>
        issues.push({ path: `upgradeIntents.${path}.${tier}`, message });
      const needsBoost =
        intent.unlock === 'active-follow-up' ||
        intent.improves.some((dimension) => dimension.startsWith('active-'));
      if (needsBoost && (index + 1 < boostTier || intents[boostKey].unlock !== 'manual-boost'))
        report(
          `Active improvements and active-follow-up require an explicitly planned same-path manual-boost at ${boostKey}. The base attack and another path's boost cannot supply it.`,
        );
      if (capabilities.has(intent.unlock)) {
        const previous = unlocked.get(intent.unlock);
        if (previous)
          report(
            `Cannot unlock ${intent.unlock} again after ${previous} on the same path without a disable intent. Describe development of the existing capability as an improvement.`,
          );
        else unlocked.set(intent.unlock, tier);
      }
      const profile = definition.profile;
      const limit =
        index + 1 <= (profile.earlyTierThrough ?? 3)
          ? Math.min(profile.earlyTierMaxChanges, profile.maxChangesPerTier)
          : profile.maxChangesPerTier;
      const minimum = minimumEffects(intent);
      if (minimum > limit)
        report(
          `These promises require at least ${minimum} primitive effects, exceeding the Definition's ${limit}-effect budget. Slow and burn each require two wire stat changes; overlapping improvements and unlocks are counted once. Reduce the promised dimensions or move a purchase to another tier.`,
        );
    }
  }
  return issues;
}
