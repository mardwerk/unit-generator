import { z } from 'zod';
import type { AuthorRequest } from '../schemas.js';
import { authorEvidence } from './evidence.js';
import {
  attackSchema,
  blueprintSchema,
  diagnosticBlueprintSchema,
  boostSchema,
  boostStatKeys,
  distributionSchema,
  followUpSchema,
  pathKeys,
  pathSpecializations,
  statKeys,
  tierKeys,
  type Change,
  type UnitBlueprint,
} from '../mechanics/schemas.js';

/** Shared authoring guidance also applies when a repair replaces only selected tiers. */
export const countArithmeticGuidance =
  'Both projectiles and pierce must resolve to positive integers in EVERY legal build, including intermediate tiers and crosspaths. Prefer whole-number add changes for counts. A multiplier of 1.5 on one projectile produces 1.5 and is invalid; add 1 produces 2. Fractional multipliers are allowed only when all composed counts remain integral. The engine never rounds counts. Repair the authored statChanges, not a derived builds field. Diagnostic changes indices refer to the decoded mechanics DSL; locate the corresponding stat in the wire tier statChanges.';

const operation = z.enum(['add', 'multiply', 'set']);
const ordinaryStats = statKeys.filter(
  (stat) => !['slowPercent', 'slowSeconds', 'burnDamagePerSecond', 'burnSeconds'].includes(stat),
) as Exclude<
  (typeof statKeys)[number],
  'slowPercent' | 'slowSeconds' | 'burnDamagePerSecond' | 'burnSeconds'
>[];
const tierOutput = z.strictObject({
  name: z.string().min(1).max(80),
  cost: z.number().positive(),
  statChanges: z
    .array(
      z.strictObject({
        stat: z.enum(ordinaryStats),
        operation,
        value: z.number(),
      }),
    )
    .max(4),
  slow: z
    .strictObject({
      percent: z.number().positive().max(100),
      durationSeconds: z.number().positive(),
    })
    .nullable(),
  burn: z
    .strictObject({
      damagePerSecond: z.number().positive(),
      durationSeconds: z.number().positive(),
    })
    .nullable(),
  camo: z.boolean().nullable(),
  delivery: attackSchema.shape.delivery.nullable(),
  damageType: attackSchema.shape.damageType.nullable(),
  targeting: attackSchema.shape.targeting.nullable(),
  distribution: distributionSchema.nullable().optional(),
  followUp: followUpSchema.nullable().optional(),
  activeFollowUp: followUpSchema.nullable().optional(),
  unlockBoost: boostSchema.nullable(),
  boostChanges: z
    .array(
      z.strictObject({
        stat: z.enum(boostStatKeys),
        operation,
        value: z.number(),
      }),
    )
    .max(4),
});
const pathOutput = blueprintSchema.shape.paths.shape.path1.omit({
  sourceFactIndices: true,
  specialization: true,
});

/** Separate fields avoid ambiguous object unions in provider structured-output grammars. */
export function modelOutputSchema(request: AuthorRequest) {
  const constraints = request.constraints.map(({ id }) => id);
  const coverage = blueprintSchema.shape.constraintCoverage.element.extend({
    constraintId: constraints.length ? z.enum(constraints) : z.string(),
  });
  const evidenceIds = authorEvidence(request).map(({ id }) => id);
  if (!evidenceIds.length)
    throw new Error('Supply source text with at least one passage of 15 characters.');
  const sourceIds = z.array(z.enum(evidenceIds)).min(1).max(96);
  const definition = request.mechanicsDefinition;
  const policy = definition?.profile.designPolicy;
  // Without a Definition, preserve the exploratory schema's extension choices.
  const allowsFollowUp =
    !definition || !!definition.rules.attackExtensions?.includes('volley-follow-up');
  const followUp = allowsFollowUp ? followUpSchema.nullable().optional() : z.null().optional();
  const distribution =
    !definition || definition.rules.attackExtensions?.includes('distinct-volley')
      ? distributionSchema.nullable().optional()
      : z.literal('same-primary').nullable().optional();
  const sourcedPath = (key: (typeof pathKeys)[number]) => {
    const allowsBoost =
      (policy?.maxManualAbilityPaths ?? 1) > 0 &&
      (policy?.manualAbilityPath === undefined || policy.manualAbilityPath === key);
    const atTier = (tier: number) =>
      tierOutput.extend({
        distribution,
        followUp,
        activeFollowUp:
          allowsBoost && tier >= (definition?.rules.manualBoostUnlockTier ?? 4)
            ? followUp
            : z.null().optional(),
        unlockBoost:
          allowsBoost && tier === (definition?.rules.manualBoostUnlockTier ?? 4)
            ? tierOutput.shape.unlockBoost
            : z.null(),
        boostChanges:
          allowsBoost && tier === (definition?.rules.manualBoostModifyTier ?? 5)
            ? tierOutput.shape.boostChanges
            : tierOutput.shape.boostChanges.max(0),
      });
    const output = pathOutput.extend({
      tiers: z.strictObject({
        tier1: atTier(1),
        tier2: atTier(2),
        tier3: atTier(3),
        tier4: atTier(4),
        tier5: atTier(5),
      }),
    });
    return policy
      ? output.extend({ sourceIds, specialization: z.enum(pathSpecializations) })
      : output.extend({ sourceIds });
  };
  return blueprintSchema
    .omit({ sourceFacts: true, proposals: true, referencePattern: true })
    .extend({
      baseAttack: attackSchema.extend({
        distribution,
        followUp,
      }),
      unsupportedMechanics: blueprintSchema.shape.proposals,
      baseSourceIds: sourceIds,
      name: z.literal(request.character.name),
      constraintCoverage: z.array(coverage).length(constraints.length),
      paths: z.strictObject({
        path1: sourcedPath('path1'),
        path2: sourcedPath('path2'),
        path3: sourcedPath('path3'),
      }),
    });
}

/** Inline provider schema. Shared references caused malformed responses in live probes. */
export function modelOutputJsonSchema(
  request: AuthorRequest,
  planned = false,
): Record<string, unknown> {
  const schema = providerJsonSchema(modelOutputSchema(request));
  if (planned) {
    // The retained plan already owns these fields. bindDesignPlan supplies them
    // before the same strict decoder runs, also for older full-shaped responses.
    type ObjectSchema = { properties: Record<string, ObjectSchema>; required: string[] };
    const omit = (node: ObjectSchema, fields: string[]) => {
      for (const field of fields) delete node.properties[field];
      node.required = node.required.filter((field) => !fields.includes(field));
    };
    const root = schema as unknown as ObjectSchema;
    const properties = root.properties;
    omit(root, ['baseSourceIds']);
    omit(properties.baseAttack!, ['name']);
    for (const path of pathKeys)
      omit(properties.paths!.properties[path]!, ['name', 'sourceIds', 'theme', 'rationale']);
  }
  return schema;
}

/** Shared provider grammar adaptation; runtime validation retains every bound.
 * Bounded strings and repeated bounded arrays can expand a modest JSON schema
 * into an oversized compiled grammar. Providers enforce shape, types and enums;
 * local decoding enforces text lengths and collection sizes before publication. */
export function providerJsonSchema(runtimeSchema: z.ZodType): Record<string, unknown> {
  const schema = z.toJSONSchema(runtimeSchema, { reused: 'inline' });
  // Live provider probes rounded requested 0.5 to 0 when numeric bounds were present.
  // Runtime schemas retain all bounds; the wire grammar only constrains numeric types.
  function adaptGrammar(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node.type === 'object' && node.properties) {
      // Optional wire fields accept null at runtime, while strict providers
      // require every property to be present. Legacy responses may still omit them.
      node.required = Object.keys(node.properties as object);
    }
    if (node.type === 'number') {
      delete node.exclusiveMinimum;
      delete node.minimum;
      delete node.exclusiveMaximum;
      delete node.maximum;
    }
    if (node.type === 'string') {
      delete node.minLength;
      delete node.maxLength;
    }
    // Strict consumers still require items on empty arrays. A tiny unused item
    // schema preserves that contract without repeating impossible tier effects.
    if (node.type === 'array') {
      if (node.maxItems === 0) node.items = { type: 'null' };
      else {
        delete node.minItems;
        delete node.maxItems;
      }
    }
    Object.values(node).forEach(adaptGrammar);
  }
  adaptGrammar(schema);
  return schema;
}

/** One limit calculation is shared by decoding and constrained repair choices. */
export function tierEffectLimit(request: AuthorRequest, tier: (typeof tierKeys)[number]): number {
  const profile = request.mechanicsDefinition?.profile;
  return Number(tier.slice(4)) <= (profile?.earlyTierThrough ?? 3)
    ? Math.min(profile?.earlyTierMaxChanges ?? 3, profile?.maxChangesPerTier ?? 4)
    : (profile?.maxChangesPerTier ?? 4);
}

/** Public decoding remains strict even when diagnostics can inspect excess effects. */
export function decodeBlueprintOutput(output: unknown, request: AuthorRequest): UnitBlueprint {
  const { blueprint, budgetIssues } = decodeBlueprintOutputForDiagnostics(output, request);
  if (budgetIssues.length) throw new z.ZodError(budgetIssues);
  return blueprintSchema.parse(blueprint);
}

/** Preserve every structurally valid authored effect so one repair sees independent
 * budget, domain and plan issues. This result is not publishable until validated. */
export function decodeBlueprintOutputForDiagnostics(
  output: unknown,
  request: AuthorRequest,
): {
  blueprint: UnitBlueprint;
  budgetIssues: z.core.$ZodIssue[];
} {
  const parsed = modelOutputSchema(request).parse(output);
  const issues: z.core.$ZodIssue[] = [];
  for (const path of pathKeys)
    for (const tier of tierKeys) {
      const fields = parsed.paths[path].tiers[tier];
      const nonnull = [
        'camo',
        'delivery',
        'damageType',
        'targeting',
        'unlockBoost',
        'distribution',
        'followUp',
        'activeFollowUp',
      ] as const;
      const selected = nonnull.filter((field) => fields[field] != null);
      const pairedCount = (fields.slow === null ? 0 : 2) + (fields.burn === null ? 0 : 2);
      const count =
        fields.statChanges.length + fields.boostChanges.length + selected.length + pairedCount;
      const limit = tierEffectLimit(request, tier);
      if (count < 1 || count > limit)
        issues.push({
          code: 'custom',
          path: ['paths', path, 'tiers', tier, 'statChanges'],
          message: `This tier contains ${count} effects: ${fields.statChanges.length} statChanges, ${fields.boostChanges.length} boostChanges, ${pairedCount} slow/burn primitive changes and ${selected.length} nonnull fields (${selected.join(', ') || 'none'}). Total must be 1 to ${limit}. ${count > limit ? `Remove at least ${count - limit} effects from those fields.` : 'Add one meaningful effect.'}`,
        });
    }
  const selectedIds = [
    ...new Set([
      ...parsed.baseSourceIds,
      ...pathKeys.flatMap((path) => parsed.paths[path].sourceIds),
    ]),
  ];
  const factIndices = new Map(selectedIds.map((id, index) => [id, index]));
  const paths = Object.fromEntries(
    pathKeys.map((key) => {
      const { sourceIds, ...path } = parsed.paths[key];
      return [
        key,
        {
          ...path,
          sourceFactIndices: [...new Set(sourceIds)].map((id) => factIndices.get(id)!),
          tiers: Object.fromEntries(
            tierKeys.map((tierKey) => {
              const tier = path.tiers[tierKey];
              const changes: Change[] = tier.statChanges.map((change) => ({
                kind: 'stat',
                target: 'base',
                ...change,
              }));
              if (tier.slow !== null)
                changes.push(
                  {
                    kind: 'stat',
                    target: 'base',
                    stat: 'slowPercent',
                    operation: 'set',
                    value: tier.slow.percent,
                  },
                  {
                    kind: 'stat',
                    target: 'base',
                    stat: 'slowSeconds',
                    operation: 'set',
                    value: tier.slow.durationSeconds,
                  },
                );
              if (tier.burn !== null)
                changes.push(
                  {
                    kind: 'stat',
                    target: 'base',
                    stat: 'burnDamagePerSecond',
                    operation: 'set',
                    value: tier.burn.damagePerSecond,
                  },
                  {
                    kind: 'stat',
                    target: 'base',
                    stat: 'burnSeconds',
                    operation: 'set',
                    value: tier.burn.durationSeconds,
                  },
                );
              if (tier.camo !== null)
                changes.push({ kind: 'camo', target: 'base', value: tier.camo });
              if (tier.delivery !== null)
                changes.push({ kind: 'delivery', target: 'base', value: tier.delivery });
              if (tier.distribution != null)
                changes.push({ kind: 'distribution', target: 'base', value: tier.distribution });
              if (tier.followUp != null)
                changes.push({ kind: 'followUp', target: 'base', value: tier.followUp });
              if (tier.activeFollowUp != null)
                changes.push({ kind: 'followUp', target: 'boost', value: tier.activeFollowUp });
              if (tier.damageType !== null)
                changes.push({ kind: 'damageType', target: 'base', value: tier.damageType });
              if (tier.targeting !== null)
                changes.push({ kind: 'targeting', target: 'base', value: tier.targeting });
              if (tier.unlockBoost !== null)
                changes.push({ kind: 'unlockBoost', target: 'base', boost: tier.unlockBoost });
              changes.push(
                ...tier.boostChanges.map((change): Change => ({
                  kind: 'modifyBoost',
                  target: 'base',
                  ...change,
                })),
              );
              return [tierKey, { name: tier.name, cost: tier.cost, changes }];
            }),
          ),
        },
      ];
    }),
  );
  const spans = new Map(authorEvidence(request).map((span) => [span.id, span]));
  const { baseSourceIds: _baseSourceIds, unsupportedMechanics, ...fields } = parsed;
  const sourceFacts = selectedIds.map((id) => {
    const span = spans.get(id)!;
    return { documentId: span.documentId, quote: span.text };
  });
  const { distribution, followUp, ...baseAttack } = fields.baseAttack;
  const blueprint = diagnosticBlueprintSchema.parse({
    ...fields,
    baseAttack: {
      ...baseAttack,
      ...(distribution == null ? {} : { distribution }),
      ...(followUp == null ? {} : { followUp }),
    },
    proposals: unsupportedMechanics,
    sourceFacts,
    paths,
  });
  return { blueprint, budgetIssues: issues };
}
