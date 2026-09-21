import type { AuthorRequest } from '../schemas.js';
import { specialtyMetrics } from '../mechanics/design-policy.js';
import { resolveUnchecked } from '../mechanics/resolve.js';
import { pathKeys, type BuildSelection, type UnitBlueprint } from '../mechanics/schemas.js';
import { decodeBlueprintOutput } from './model-output.js';

/** Arithmetic evidence for a repair, never an automatic change to authored values. */
export function capstoneRepairContext(blueprint: UnitBlueprint, request: AuthorRequest) {
  const policy = request.mechanicsDefinition?.profile.designPolicy;
  const multiplier = policy?.minTier5SpecialtyMultiplier;
  if (multiplier === undefined) return [];
  return pathKeys.flatMap((path, index) => {
    const specialization = blueprint.paths[path].specialization;
    if (!specialization) return [];
    const selection: BuildSelection = [0, 0, 0];
    selection[index] = 4;
    const before = resolveUnchecked(blueprint, selection);
    selection[index] = 5;
    const after = resolveUnchecked(blueprint, selection);
    const tier4 = specialtyMetrics(before, specialization);
    const tier5 = specialtyMetrics(after, specialization);
    return [
      {
        path,
        specialization,
        tier4HasManualBoost: before.abilities.length > 0,
        tier4Attack: before.baseAttack.stats,
        tier5Attack: after.baseAttack.stats,
        metrics: Object.entries(tier4).flatMap(([metric, value]) => {
          const next = tier5[metric];
          const target = value * multiplier;
          if (!(value > 0) || !Number.isFinite(target) || !Number.isFinite(next)) return [];
          return [{ metric, tier4: value, tier5: next, minimumTier5: target }];
        }),
      },
    ];
  });
}

/** Invalid syntax or effect budgets may prevent resolution; retain the original findings. */
export function wireRepairContext(previous: unknown, request: AuthorRequest) {
  try {
    return capstoneRepairContext(decodeBlueprintOutput(previous, request), request);
  } catch {
    return [];
  }
}
