export type { ModelClient, ModelRequest, ModelResponse, ModelFailure } from './model.js';
export { ModelExecutionError } from './model.js';
export * from './schemas.js';
export { prepareRequest } from './prepare.js';
export { draftUnit, type OperationOptions } from './draft.js';
export { checkDraft } from './check.js';
export { reviewDraft } from './review.js';
export { authorUnit } from './author.js';
export {
  defaultProfile,
  defaultProgression,
  defaultAuthoringDefinition,
  starterAuthoringTask,
  applyDefaultProfile,
} from './default-profile.js';

export * from './mechanics/index.js';
export { definitionProgression, definitionDocument } from './blueprint/definition.js';
export { compileBlueprint } from './blueprint/compile.js';

export * from './roles.js';

export { designPlanSchema, type UnitDesignPlan } from './blueprint/plan-schema.js';
export {
  designEvaluationSchema,
  evaluateUnitDesign,
  type DesignEvaluation,
} from './blueprint/design-evaluation.js';
export { designPlanRequest, decodeDesignPlan } from './blueprint/plan.js';
export {
  rulePackSchema,
  getRulePack,
  publicThreePathPack,
  fourPathPack,
  unsupportedBindingDiagnostic,
  type RulePack,
} from './rulepack.js';
export {
  referencePackSchema,
  referenceConceptSchema,
  referenceRelationshipSchema,
  relationshipKinds,
  assertReferencePackCoherent,
  type ReferencePack,
} from './reference.js';
export {
  designProfileSchema,
  defaultDesignProfile,
  designLayoutPlanSchema,
  compareLayouts,
  planFromLayout,
  validateLayoutPlan,
  assertPackImmutable,
  assertSupportedBehavior,
  type DesignProfile,
  type DesignLayoutPlan,
  type LayoutCandidate,
} from './design.js';
