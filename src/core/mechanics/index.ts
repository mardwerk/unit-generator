export * from './schemas.js';
export {
  allLegalBuilds,
  assessTarget,
  MechanicsValidationError,
  type ResolvedBuild,
  type ResolvedAbility,
  type TierDelta,
} from './resolve.js';
export { validateBlueprint } from './validate.js';
export {
  referenceWaves,
  simulateWave,
  killsByWave,
  usefulnessIssues,
  minUsefulFollowUpRadius,
  type WaveSpec,
  type WaveResult,
  type ActiveAbility,
} from './simulation.js';
export {
  selectVolleyTargets,
  resolveFollowUpHits,
  type AttackTarget,
  type SecondaryHit,
} from './attack-patterns.js';

import {
  blueprintSchema,
  mechanicsDefinitionSchema,
  defaultMechanicsDefinition,
  type BuildSelection,
  type MechanicsDefinition,
  type UnitBlueprint,
} from './schemas.js';
import {
  MechanicsValidationError,
  selectionIssues,
  withTierDeltas,
  type ResolvedBuild,
} from './resolve.js';
import { validateBlueprint } from './validate.js';

export function resolveBuild(
  blueprint: UnitBlueprint,
  selection: BuildSelection,
  definition: MechanicsDefinition = defaultMechanicsDefinition,
): ResolvedBuild {
  const issues = validateBlueprint(blueprint, definition);
  if (issues.length) throw new MechanicsValidationError(issues);
  const parsedDefinition = mechanicsDefinitionSchema.parse(definition);
  const invalidSelection = selectionIssues(selection, parsedDefinition);
  if (invalidSelection.length) throw new MechanicsValidationError(invalidSelection);
  return withTierDeltas(blueprintSchema.parse(blueprint), selection);
}

export { compareCapstonePurchases } from './purchase-comparison.js';
