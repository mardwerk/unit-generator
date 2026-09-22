import { z } from 'zod';
import { allLegalBuilds, resolveUnchecked } from '../mechanics/resolve.js';
import { compareCapstonePurchases, purchaseMetrics } from '../mechanics/purchase-comparison.js';
import {
  blueprintSchema,
  pathKeys,
  type BuildSelection,
  type MechanicsDefinition,
  type UnitBlueprint,
} from '../mechanics/schemas.js';
import { designPlanSchema, type UnitDesignPlan } from './plan-schema.js';

const finite = z.number().finite();
const metric = finite.nullable();
const metrics = z.record(z.string(), metric);
const selection = z.tuple([z.number().int(), z.number().int(), z.number().int()]);
const transition = z.object({
  from: selection,
  to: selection,
  incrementalGold: finite,
  metricDeltas: z.record(z.string(), z.object({ before: metric, after: metric, change: metric })),
  capabilityChanges: z.array(z.string()),
});
const comparison = z.object({
  path: z.enum(pathKeys),
  tier4: z.object({ totalGold: finite, metrics }),
  tier5: z.object({ totalGold: finite, metrics }),
  tier4CopiesAtTier5Budget: finite.nullable(),
  sameBudgetTier4Copies: z.object({
    count: finite.nullable(),
    additiveThroughputUpperBounds: metrics,
    perCopyMetrics: metrics,
  }),
  assumption: z.string(),
});
export const designEvaluationSchema = z.object({
  scope: z.literal('analytical-not-simulation'),
  sourceClaims: z
    .object({
      signature: designPlanSchema.shape.signature,
      scopeLimits: designPlanSchema.shape.scopeLimits,
      omittedTechniques: designPlanSchema.shape.omittedTechniques,
    })
    .nullable(),
  paths: z.array(
    z.object({
      path: z.enum(pathKeys),
      name: z.string(),
      purchaseClaim: z
        .object({
          buyFor: z.string(),
          weakness: z.string(),
          capstoneValue: z.string(),
          sourceIds: z.array(z.string()),
        })
        .nullable(),
      milestones: z.array(transition),
      capstoneComparison: comparison,
      crosspaths: z.array(
        transition.extend({ secondaryPath: z.enum(pathKeys), tier: z.number().int() }),
      ),
    }),
  ),
  limitations: z.array(z.string()),
});
export type DesignEvaluation = z.infer<typeof designEvaluationSchema>;

/** Evaluate already-valid mechanics independently of author-written explanations. */
export function evaluateUnitDesign(
  input: UnitBlueprint,
  plan: UnitDesignPlan | undefined,
  definition: MechanicsDefinition,
): DesignEvaluation {
  // Schema order makes nested capability descriptions stable across JSON parsing
  // and code-authored reference objects with a different property insertion order.
  const blueprint = blueprintSchema.parse(input);
  const legal = new Set(allLegalBuilds(definition).map((build) => build.join(',')));
  const compare = (from: BuildSelection, to: BuildSelection) => {
    const before = resolveUnchecked(blueprint, from);
    const after = resolveUnchecked(blueprint, to);
    const a = purchaseMetrics(before);
    const b = purchaseMetrics(after);
    const metricDeltas = Object.fromEntries(
      [...new Set([...Object.keys(a), ...Object.keys(b)])].map((key) => {
        // Missing active metrics mean no ability before purchase. Explicit null
        // means arithmetic overflow and must never become zero or a valid delta.
        const prior = a[key] === undefined ? 0 : a[key];
        const next = b[key] === undefined ? 0 : b[key];
        const delta = prior === null || next === null ? NaN : next - prior;
        return [key, { before: prior, after: next, change: Number.isFinite(delta) ? delta : null }];
      }),
    );
    const capabilityChanges: string[] = [];
    for (const key of [
      'delivery',
      'damageType',
      'targeting',
      'camo',
      'distribution',
      'followUp',
    ] as const)
      if (JSON.stringify(before.baseAttack[key]) !== JSON.stringify(after.baseAttack[key]))
        capabilityChanges.push(
          `${key}: ${JSON.stringify(before.baseAttack[key] ?? null)} → ${JSON.stringify(after.baseAttack[key] ?? null)}`,
        );
    for (const key of [
      'splashRadius',
      'slowPercent',
      'slowSeconds',
      'burnDamagePerSecond',
      'burnSeconds',
      'stunSeconds',
      'pierce',
      'projectiles',
      'damage',
    ] as const) {
      const prior = before.baseAttack.stats[key];
      const next = after.baseAttack.stats[key];
      if (prior !== next) capabilityChanges.push(`${key}: ${prior} → ${next}`);
    }
    for (const ability of after.abilities) {
      const prior = before.abilities.find((entry) => entry.path === ability.path);
      if (!prior) capabilityChanges.push(`manual boost unlocked on ${ability.path}`);
      // Equal duty fractions can hide different activation windows. Keep exact
      // changed boost parameters and follow-up scope alongside capacity proxies.
      for (const key of [
        'durationSeconds',
        'cooldownSeconds',
        'damageMultiplier',
        'intervalMultiplier',
        'rangeBonus',
      ] as const)
        if (prior?.[key] !== ability[key])
          capabilityChanges.push(
            `${ability.path} boost ${key}: ${prior?.[key] ?? null} → ${ability[key]}`,
          );
      const oldFollowUp = prior?.boostedAttack.followUp ?? null;
      const newFollowUp = ability.boostedAttack.followUp ?? null;
      if (JSON.stringify(oldFollowUp) !== JSON.stringify(newFollowUp))
        capabilityChanges.push(
          `${ability.path} active followUp: ${JSON.stringify(oldFollowUp)} → ${JSON.stringify(newFollowUp)}`,
        );
    }
    return {
      from,
      to,
      incrementalGold: after.cumulativeCost - before.cumulativeCost,
      metricDeltas,
      capabilityChanges,
    };
  };
  const capstones = compareCapstonePurchases(blueprint);
  return designEvaluationSchema.parse({
    scope: 'analytical-not-simulation',
    sourceClaims: plan
      ? {
          signature: plan.signature,
          scopeLimits: plan.scopeLimits,
          omittedTechniques: plan.omittedTechniques,
        }
      : null,
    paths: pathKeys.map((path, index) => {
      const claim = plan?.paths[path];
      const milestones = [3, 4, 5].flatMap((tier) => {
        const from: BuildSelection = [0, 0, 0];
        const to: BuildSelection = [0, 0, 0];
        from[index] = tier - 1;
        to[index] = tier;
        return legal.has(from.join(',')) && legal.has(to.join(',')) ? [compare(from, to)] : [];
      });
      const crosspaths = pathKeys.flatMap((secondaryPath, secondaryIndex) =>
        secondaryIndex === index
          ? []
          : [3, 4, 5].flatMap((mainTier) =>
              [1, 2].flatMap((tier) => {
                const from: BuildSelection = [0, 0, 0];
                const to: BuildSelection = [0, 0, 0];
                from[index] = to[index] = mainTier;
                from[secondaryIndex] = tier - 1;
                to[secondaryIndex] = tier;
                return legal.has(from.join(',')) && legal.has(to.join(','))
                  ? [{ secondaryPath, tier, ...compare(from, to) }]
                  : [];
              }),
            ),
      );
      return {
        path,
        name: blueprint.paths[path].name,
        purchaseClaim: claim
          ? {
              buyFor: claim.buyFor,
              weakness: claim.weakness,
              capstoneValue: claim.capstoneValue,
              sourceIds: claim.sourceIds,
            }
          : null,
        milestones,
        capstoneComparison: capstones[index],
        crosspaths,
      };
    }),
    limitations: [
      'Source and purchase claims are retained author proposals, not independently verified conclusions.',
      'Deltas measure resolved capacities under ideal target access. They do not establish combat outcomes, player preference or balance.',
      'Null metrics and deltas are unavailable because their calculation has no finite numeric result.',
      'A missing active metric is zero before its unlock. Active peaks are not sustained output; range and duty fraction are not additive across copies.',
      'No text interpretation or automatic quality score is applied. Scope limits and omitted techniques remain explicit for independent review.',
    ],
  });
}
