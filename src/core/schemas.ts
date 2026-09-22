import { designPlanSchema } from './blueprint/plan-schema.js';
import { designEvaluationSchema } from './blueprint/design-evaluation.js';
import { unitRoleRankingSchema } from './roles.js';
import { z } from 'zod';
import { blueprintSchema, mechanicsDefinitionSchema } from './mechanics/schemas.js';

const text = z.string().trim().min(1);

const refs = z.array(text);

const version = z.literal('1');

const decisionStatus = z.enum(['confirmed', 'proposed', 'open']);

const referenceUrl = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  }, 'Reference URLs must use HTTP or HTTPS without credentials');

export const visualReferenceSchema = z.strictObject({
  id: text,
  url: referenceUrl,
  sourceUrl: referenceUrl,
  caption: text,
  kind: z.enum(['appearance', 'pose', 'form', 'reference']),
  attribution: text.nullable(),
  width: z.number().int().positive().max(100_000).optional(),
  height: z.number().int().positive().max(100_000).optional(),
});

export const resolvedDocumentSchema = z.strictObject({
  id: text,
  kind: z.enum(['source', 'rules', 'decisions']),
  text: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0, 'Document must not be blank'),
  origin: z.strictObject({
    location: text,
    access: z.enum(['supplied', 'local-file', 'retrieved']),
    note: text.nullable(),
  }),
  visualReferences: z.array(visualReferenceSchema).optional(),
  visualNotes: z.array(text).optional(),
});

export const characterSchema = z.strictObject({
  name: text,
  work: text,
  scope: text,
});

export const findingSchema = z.strictObject({
  id: text,
  method: z.enum(['deterministic', 'model']),
  category: z.enum([
    'conflict',
    'missing_specification',
    'unsupported',
    'evidence',
    'coverage',
    'scope',
  ]),
  severity: z.enum(['error', 'warning', 'info']),
  outcome: z.enum(['pass', 'fail', 'unresolved', 'not_checked']),
  subject: text,
  rule: text,
  message: text,
  evidence: refs,
  action: text.nullable(),
});

const basicAttackSchema = z.strictObject({
  name: text,
  status: decisionStatus,
  decisionRefs: refs,
  behavior: text,
  delivery: text,
  targeting: text,
  limitations: text,
  mechanicIds: refs,
  evidence: refs,
});

const pathsSchema = z.array(
  z.strictObject({
    id: text,
    name: text,
    theme: text,
    tiers: z
      .array(
        z.strictObject({
          tier: z.number().int().positive(),
          name: text,
          status: decisionStatus,
          decisionRefs: refs,
          benefit: text,
          abilityIds: refs,
          evidence: refs,
        }),
      )
      .min(1),
  }),
);

const abilitiesSchema = z.array(
  z.strictObject({
    id: text,
    name: text,
    status: decisionStatus,
    decisionRefs: refs,
    description: text,
    availability: text,
    delivery: text,
    targeting: text,
    limitations: text,
    placement: z.enum(['innate', 'upgrade', 'conditional', 'reserved', 'omitted']),
    pathId: text.nullable(),
    tier: z.number().int().positive().nullable(),
    mechanicIds: refs,
    prerequisiteAbilityIds: refs,
    evidence: refs,
  }),
);

const mechanicsSchema = z.array(
  z.strictObject({
    id: text,
    name: text,
    behavior: text,
    status: z.enum(['specified', 'unspecified', 'proposed_extension', 'unsupported']),
    dependencies: refs,
    evidence: refs,
    requiredDecision: text.nullable(),
  }),
);

const sourcesSchema = z.array(
  z.strictObject({
    documentId: text,
    claims: z.array(text).min(1),
    limitations: text,
  }),
);

const constraintCoverageSchema = z.array(
  z.strictObject({
    constraintId: text,
    implementation: text,
  }),
);

const representativeBuildsSchema = z.array(
  z.strictObject({
    name: text,
    selections: z.array(
      z.strictObject({
        pathId: text,
        tier: z.number().int().nonnegative(),
      }),
    ),
    rationale: text,
  }),
);

const unresolvedQuestionsSchema = z.array(
  z.strictObject({
    id: text,
    question: text,
    affected: text,
    evidence: refs,
  }),
);

export const candidateSchema = z.strictObject({
  schemaVersion: version,
  character: characterSchema,
  role: text,
  basicAttack: basicAttackSchema,
  paths: pathsSchema,
  abilities: abilitiesSchema,
  mechanics: mechanicsSchema,
  sources: sourcesSchema,
  constraintCoverage: constraintCoverageSchema,
  representativeBuilds: representativeBuildsSchema,
  unresolvedQuestions: unresolvedQuestionsSchema,
  blueprint: blueprintSchema.optional(),
});

export const progressionSchema = z.strictObject({
  paths: z
    .array(
      z.strictObject({
        id: text,
        tiers: z.array(z.number().int().positive()).min(1),
      }),
    )
    .min(1),
  maxActivePaths: z.number().int().nonnegative(),
  maxPathsAboveTier: z
    .strictObject({
      tier: z.number().int().nonnegative(),
      count: z.number().int().nonnegative(),
    })
    .nullable(),
  maxTotalTiers: z.number().int().nonnegative().nullable(),
  allowedTierCombinations: z.array(z.array(z.number().int().nonnegative())).min(1).nullable(),
});

export const requestSchema = z.strictObject({
  schemaVersion: version,
  task: text,
  character: characterSchema,
  documents: z.array(resolvedDocumentSchema).min(1),
  constraints: z.array(
    z.strictObject({
      id: text,
      text,
    }),
  ),
  progression: progressionSchema.nullable(),
  mechanicsDefinition: mechanicsDefinitionSchema.optional(),
  previous: z
    .strictObject({
      resultId: text,
      draft: candidateSchema,
      findings: z.array(findingSchema),
    })
    .nullable(),
  feedback: text.nullable(),
});

export const preparedSchema = z.strictObject({
  schemaVersion: version,
  kind: z.literal('prepared'),
  inputHash: text,
  request: requestSchema,
});

const tokenCount = z.number().int().nonnegative().nullable();

export const modelUsageSchema = z.strictObject({
  inputTokens: tokenCount,
  outputTokens: tokenCount,
  totalTokens: tokenCount,
  reasoningTokens: tokenCount,
  cachedInputTokens: tokenCount,
  costUsd: z.number().finite().nonnegative().nullable(),
  actualModel: z.string().nullable(),
  provider: z.string().nullable(),
  generationId: z.string().nullable(),
});

export const modelRunSchema = z.strictObject({
  id: text,
  modelId: text,
  startedAt: text,
  completedAt: text,
  usage: modelUsageSchema.optional(),
  designPlan: designPlanSchema.optional(),
  designEvaluation: designEvaluationSchema.optional(),
  attempts: z
    .array(
      z.strictObject({
        number: z.number().int().positive(),
        purpose: z.enum(['plan', 'design', 'repair']),
        issues: z.array(text),
        usage: modelUsageSchema.optional(),
      }),
    )
    .optional(),
});

export const draftArtifactSchema = z.strictObject({
  schemaVersion: version,
  kind: z.literal('draft'),
  prepared: preparedSchema,
  candidate: candidateSchema,
  run: modelRunSchema,
  roles: unitRoleRankingSchema.optional(),
});

export const checkedArtifactSchema = z.strictObject({
  schemaVersion: version,
  kind: z.literal('checked'),
  draft: draftArtifactSchema,
  findings: z.array(findingSchema),
});

export const semanticReviewSchema = z.strictObject({
  summary: text,
  findings: z.array(
    findingSchema.extend({
      id: text.regex(/^model\.[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
      method: z.literal('model'),
    }),
  ),
});

export const resultSchema = z.strictObject({
  schemaVersion: version,
  kind: z.literal('result'),
  id: text,
  prepared: preparedSchema,
  candidate: candidateSchema,
  findings: z.array(findingSchema),
  reviewSummary: text,
  roles: unitRoleRankingSchema.optional(),
  run: z.strictObject({
    draft: modelRunSchema,
    review: modelRunSchema,
  }),
});

export type ResolvedDocument = z.infer<typeof resolvedDocumentSchema>;
export type VisualReference = z.infer<typeof visualReferenceSchema>;

export type AuthorRequest = z.infer<typeof requestSchema>;

export type UnitCandidate = z.infer<typeof candidateSchema>;

export type Finding = z.infer<typeof findingSchema>;

export type PreparedRequest = z.infer<typeof preparedSchema>;

export type DraftArtifact = z.infer<typeof draftArtifactSchema>;

export type CheckedArtifact = z.infer<typeof checkedArtifactSchema>;

export type AuthorResult = z.infer<typeof resultSchema>;

export type SemanticReview = z.infer<typeof semanticReviewSchema>;

export type ModelUsage = z.infer<typeof modelUsageSchema>;
