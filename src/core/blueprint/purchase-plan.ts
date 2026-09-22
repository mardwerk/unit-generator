import { z } from 'zod';
import { pathKeys, tierKeys } from '../mechanics/schemas.js';
import { designPlanSchema, upgradeIntentSchema } from './plan-schema.js';
import type { AuthorRequest } from '../schemas.js';

const retainedBranch = designPlanSchema.shape.paths.shape.path1;
const milestone = upgradeIntentSchema.extend({ change: z.string().trim().min(1).max(800) });
const branch = retainedBranch.omit({ crosspaths: true, referenceExample: true }).extend({
  milestones: z.strictObject({
    tier1: milestone,
    tier2: milestone,
    tier3: milestone,
    tier4: milestone,
    tier5: milestone,
  }),
});

/** One description and one checkable promise per purchase. No repeated intent tree
 * or invented crosspath prose. The public retained plan stays backward compatible. */
export const purchasePlanSchema = designPlanSchema
  .omit({ upgradeIntents: true, interpretation: true })
  .extend({
    contract: z.literal('purchase-plan-v1'),
    paths: z.strictObject({ path1: branch, path2: branch, path3: branch }),
  });
type PurchasePlan = z.infer<typeof purchasePlanSchema>;

/** Provider choices mirror known rules. Dependency checks still run locally;
 * a small enum cannot establish source interpretation or purchasing quality. */
export function purchasePlanOutputSchema(request: AuthorRequest) {
  const definition = request.mechanicsDefinition;
  if (!definition) return purchasePlanSchema;
  const { rules, profile } = definition;
  const policy = profile.designPolicy;
  const pathSchema = (path: (typeof pathKeys)[number]) => {
    const allowsBoost =
      policy?.manualAbilityPath !== null &&
      (policy?.maxManualAbilityPaths ?? 1) > 0 &&
      (policy?.manualAbilityPath === undefined || policy.manualAbilityPath === path);
    const atTier = (tier: number) => {
      const active = allowsBoost && tier >= rules.manualBoostUnlockTier;
      const unlocks = upgradeIntentSchema.shape.unlock.options.filter((unlock) => {
        if (unlock === 'manual-boost') return allowsBoost && tier === rules.manualBoostUnlockTier;
        if (unlock === 'active-follow-up')
          return (
            active &&
            tier > rules.manualBoostUnlockTier &&
            !!rules.attackExtensions?.includes('volley-follow-up')
          );
        if (tier <= 2 && policy?.preserveEarlyAttackIdentity && !['none', 'camo'].includes(unlock))
          return false;
        if (unlock === 'distinct-volley')
          return !!rules.attackExtensions?.includes('distinct-volley');
        if (unlock === 'follow-up') return !!rules.attackExtensions?.includes('volley-follow-up');
        return true;
      });
      const improvements = upgradeIntentSchema.shape.improves.element.options.filter(
        (dimension) =>
          (!dimension.startsWith('active-') || active) &&
          (dimension !== 'follow-up' || !!rules.attackExtensions?.includes('volley-follow-up')),
      );
      return milestone.extend({
        improves: z.array(z.enum(improvements)).max(4),
        unlock: z.enum(unlocks),
      });
    };
    return branch.extend({
      milestones: z.strictObject({
        tier1: atTier(1),
        tier2: atTier(2),
        tier3: atTier(3),
        tier4: atTier(4),
        tier5: atTier(5),
      }),
    });
  };
  return purchasePlanSchema.extend({
    paths: z.strictObject({
      path1: pathSchema('path1'),
      path2: pathSchema('path2'),
      path3: pathSchema('path3'),
    }),
  });
}

/** Expand only code-owned bookkeeping; source interpretations and promises are unchanged. */
export function expandPurchasePlan(output: unknown): unknown {
  if (!output || typeof output !== 'object' || !('contract' in output)) return output;
  if ('upgradeIntents' in output) return output;
  const wire = purchasePlanSchema.parse(output);
  const { contract, paths, ...shared } = wire;
  return {
    ...shared,
    contract,
    paths: Object.fromEntries(
      pathKeys.map((path) => {
        const { milestones, ...branch } = paths[path];
        return [
          path,
          {
            ...branch,
            milestones: Object.fromEntries(tierKeys.map((tier) => [tier, milestones[tier].change])),
            crosspaths: pathKeys
              .filter((other) => other !== path)
              .map((other) => ({
                path: other,
                contribution: earlyPurchases(paths[other]),
              })),
            referenceExample:
              'BTD6 progression and tradeoffs inform this proposal; the supplied Definition alone authorizes mechanics.',
          },
        ];
      }),
    ),
    upgradeIntents: Object.fromEntries(
      pathKeys.map((path) => [
        path,
        Object.fromEntries(
          tierKeys.map((tier) => {
            const { improves, unlock } = paths[path].milestones[tier];
            return [tier, { improves, unlock }];
          }),
        ),
      ]),
    ),
  };
}

function earlyPurchases(branch: PurchasePlan['paths']['path1']): string {
  // Intent summaries, not assertions about applied crosspath effects. Resolved
  // contributions are computed separately by evaluateUnitDesign.
  const summary = `Proposed early purchases: ${branch.milestones.tier1.change} ${branch.milestones.tier2.change}`;
  return summary.length <= 800
    ? summary
    : 'Proposed contributions are the secondary path T1 and T2 milestones. Consult resolved purchase evidence for their actual effects.';
}

/** The numerical pass needs the decisions once, without compatibility bookkeeping. */
export function mechanicsPlan(plan: z.infer<typeof designPlanSchema>): unknown {
  return {
    concept: plan.concept,
    signature: plan.signature,
    repertoire: plan.repertoire,
    base: plan.base,
    paths: Object.fromEntries(
      pathKeys.map((path) => {
        const {
          crosspaths: _crosspaths,
          referenceExample: _reference,
          milestones,
          ...branch
        } = plan.paths[path];
        return [
          path,
          {
            ...branch,
            milestones: Object.fromEntries(
              tierKeys.map((tier) => [
                tier,
                {
                  change: milestones[tier],
                  ...plan.upgradeIntents?.[path][tier],
                },
              ]),
            ),
          },
        ];
      }),
    ),
    omittedTechniques: plan.omittedTechniques,
    scopeLimits: plan.scopeLimits,
  };
}
