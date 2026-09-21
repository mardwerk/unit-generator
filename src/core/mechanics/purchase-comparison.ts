import { resolveUnchecked } from './resolve.js';
import { pathKeys, type BuildSelection, type UnitBlueprint } from './schemas.js';
import { specialtyMetrics } from './design-policy.js';

/** Analytic purchase comparisons, not measured combat output or a balance score. */
export function compareCapstonePurchases(blueprint: UnitBlueprint) {
  return pathKeys.map((path, index) => {
    const selection: BuildSelection = [0, 0, 0];
    selection[index] = 4;
    const before = resolveUnchecked(blueprint, selection);
    selection[index] = 5;
    const after = resolveUnchecked(blueprint, selection);
    const metrics = (build: typeof before) => ({
      ...specialtyMetrics(build, 'direct-damage'),
      ...specialtyMetrics(build, 'group-damage'),
      ...specialtyMetrics(build, 'control'),
      ...(build.abilities.length ? specialtyMetrics(build, 'ability-burst') : {}),
    });
    return {
      path,
      tier4: { totalGold: before.cumulativeCost, metrics: metrics(before) },
      tier5: { totalGold: after.cumulativeCost, metrics: metrics(after) },
      tier4CopiesAtTier5Budget: Math.floor(after.cumulativeCost / before.cumulativeCost),
      assumption:
        'Ideal sustained access to eligible targets. Group/control metrics are capacity upper bounds; active peaks are not sustained output. Multiple copies require extra placement space. No waves, buffs, geometry, actual crowd density or balance are simulated.',
    };
  });
}
