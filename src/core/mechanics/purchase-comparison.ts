import { resolveUnchecked } from './resolve.js';
import { pathKeys, type BuildSelection, type UnitBlueprint } from './schemas.js';
import { specialtyMetrics } from './design-policy.js';

/** Analytic capacities, not measured combat output or a balance score. */
export function purchaseMetrics(
  build: ReturnType<typeof resolveUnchecked>,
): Record<string, number | null> {
  const values = {
    ...specialtyMetrics(build, 'direct-damage'),
    ...specialtyMetrics(build, 'group-damage'),
    ...specialtyMetrics(build, 'control'),
    ...specialtyMetrics(build, 'range'),
    ...specialtyMetrics(build, 'attack-speed'),
    ...(build.abilities.length ? specialtyMetrics(build, 'ability-burst') : {}),
  };
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, Number.isFinite(value) ? value : null]),
  );
}

/** Copy throughput assumes independent eligible targets and enough placement space. */
export function compareCapstonePurchases(blueprint: UnitBlueprint) {
  return pathKeys.map((path, index) => {
    const selection: BuildSelection = [0, 0, 0];
    selection[index] = 4;
    const before = resolveUnchecked(blueprint, selection);
    selection[index] = 5;
    const after = resolveUnchecked(blueprint, selection);
    const ratio = before.cumulativeCost > 0 ? after.cumulativeCost / before.cumulativeCost : NaN;
    const count = Number.isFinite(ratio) ? Math.floor(ratio) : null;
    const metrics = purchaseMetrics(before);
    const additiveThroughputUpperBounds: Record<string, number | null> = {};
    if (count !== null)
      for (const key of ['direct damage rate', 'group damage rate upper bound']) {
        const value = metrics[key];
        const product = value == null ? NaN : value * count;
        additiveThroughputUpperBounds[key] = Number.isFinite(product) ? product : null;
      }
    return {
      path,
      tier4: { totalGold: before.cumulativeCost, metrics },
      tier5: { totalGold: after.cumulativeCost, metrics: purchaseMetrics(after) },
      tier4CopiesAtTier5Budget: count,
      sameBudgetTier4Copies: {
        count,
        additiveThroughputUpperBounds,
        perCopyMetrics: metrics,
      },
      assumption:
        'Ideal sustained access to eligible targets. Group/control metrics are capacity upper bounds; active peaks are not sustained output. Copy throughput assumes independent target access and extra placement space; range, attack frequency, control coverage and active duty are per-copy values, not summed. A zero-cost tier-four build has no finite budget-limited copy count. Null metrics or counts are unavailable because the calculation has no finite numeric result. No waves, buffs, geometry, actual crowd density or balance are simulated.',
    };
  });
}
