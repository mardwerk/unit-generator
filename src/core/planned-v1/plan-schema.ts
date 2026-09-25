import { z } from 'zod';
import { pathKeys, tierKeys } from '../mechanics/schemas.js';

const text = z.string().trim().min(1).max(800);
// Citation bounds match the bounded authoring evidence catalogue, not a prose quota.
const sourceIds = z.array(z.string().min(1)).min(1).max(96);
const branch = z.strictObject({
  name: text.max(80),
  sourceIds,
  buyFor: text.max(300),
  weakness: text,
  milestones: z.strictObject({ tier1: text, tier2: text, tier3: text, tier4: text, tier5: text }),
  capstoneValue: text,
  crosspaths: z.array(z.strictObject({ path: z.enum(pathKeys), contribution: text })).length(2),
  referenceExample: text,
});

export const upgradeIntentSchema = z.strictObject({
  improves: z
    .array(
      z.enum([
        'damage',
        'attack-rate',
        'range',
        'pierce',
        'projectiles',
        'splash',
        'slow',
        'burn',
        'stun',
        'follow-up',
        'active-damage',
        'active-attack-rate',
        'active-duration',
        'active-frequency',
      ]),
    )
    .max(4),
  unlock: z.enum([
    'none',
    'manual-boost',
    'follow-up',
    'active-follow-up',
    'camo',
    'distinct-volley',
    'splash',
    'slow',
    'burn',
    'stun',
    'delivery-change',
    'damage-type-change',
    'targeting-change',
  ]),
});
export type UpgradeIntent = z.infer<typeof upgradeIntentSchema>;
const pathIntents = z.strictObject({
  tier1: upgradeIntentSchema,
  tier2: upgradeIntentSchema,
  tier3: upgradeIntentSchema,
  tier4: upgradeIntentSchema,
  tier5: upgradeIntentSchema,
});
export const upgradeIntentsSchema = z.strictObject({
  path1: pathIntents,
  path2: pathIntents,
  path3: pathIntents,
});

/** A retained design proposal, not evidence that its mechanics are executable. */
export const designPlanSchema = z.strictObject({
  contract: z.literal('purchase-plan-v1').optional(),
  concept: text,
  signature: z.strictObject({ name: text.max(80), sourceIds, adaptation: text }),
  repertoire: z
    .array(z.strictObject({ name: text.max(80), sourceIds, limitation: text }))
    .min(1)
    .max(32),
  base: z.strictObject({ name: text.max(80), sourceIds, behavior: text }),
  paths: z.strictObject({ path1: branch, path2: branch, path3: branch }),
  omittedTechniques: z.array(z.strictObject({ name: text.max(80), reason: text })).max(12),
  scopeLimits: z.array(text).max(24),
  upgradeIntents: upgradeIntentsSchema.optional(),
});
export type UnitDesignPlan = z.infer<typeof designPlanSchema>;

/** A small lexical floor catches empty placeholder output, not strategic quality.
 * Keep this authoring check separate so old retained plans remain inspectable. */
export const designPlanAuthoringSchema = designPlanSchema
  .extend({ upgradeIntents: upgradeIntentsSchema })
  .superRefine((plan, context) => {
    const wordSegments = new Intl.Segmenter(undefined, { granularity: 'word' });
    function inspect(value: unknown, path: (string | number)[]): void {
      if (path[0] === 'upgradeIntents') return;
      if (typeof value === 'string') {
        if (path.at(-1) === 'name' || path.includes('sourceIds') || path.at(-1) === 'path') return;
        const words = [...wordSegments.segment(value)].filter(
          (segment) => segment.isWordLike && /\p{L}/u.test(segment.segment),
        );
        const letters = value.match(/\p{L}/gu)?.length ?? 0;
        if (letters < 4 || words.length === 0)
          context.addIssue({
            code: 'custom',
            path,
            message:
              'Describe the proposed behavior or limitation in words, not punctuation or numeric placeholders.',
          });
      } else if (Array.isArray(value))
        value.forEach((entry, index) => inspect(entry, [...path, index]));
      else if (value && typeof value === 'object')
        for (const [key, child] of Object.entries(value)) inspect(child, [...path, key]);
    }
    inspect(plan, []);
    for (const path of pathKeys)
      for (const tier of tierKeys) {
        const intent = plan.upgradeIntents[path][tier];
        if (!intent.improves.length && intent.unlock === 'none')
          context.addIssue({
            code: 'custom',
            path: ['upgradeIntents', path, tier],
            message: 'Declare at least one supported improvement or unlock for this milestone.',
          });
      }
  });
