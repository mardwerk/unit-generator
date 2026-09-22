import { z } from 'zod';

const text = z.string().trim().min(1);
const versionId = z.string().trim().min(1);

/**
 * Versioned RulePack.
 *
 * A RulePack selects permitted systems and defines progression, purchase
 * restrictions, economy and design conventions. It is configuration, not an
 * implementation: a rule file can authorize a behavior, but only the domain
 * backend (mechanics engine) can execute it.
 *
 * Inputs: pack document + active mechanics definition.
 * Outcome: validated pack with resolved inheritance, or a thrown error.
 */
export const rulePackSchema = z.strictObject({
  id: text,
  version: versionId,
  /** Executable domain backend this pack targets (e.g. td-combat@1.0.0). */
  domain: text,
  /** Pack this one extends. The extending pack must explicitly replace conflicts. */
  extends: text.nullable().optional(),
  normal_progression: z.strictObject({
    path_count: z.number().int().min(1).max(8),
    tiers_per_path: z.number().int().min(1).max(8),
    sequential_purchases: z.boolean(),
    /** CEL-like state predicates evaluated on the proposed state after purchase. */
    state_constraints: z.array(text),
  }),
  design_conventions: z.strictObject({
    tiers_1_and_2: text,
    tier_3: text,
    tiers_4_and_5: text,
  }),
  apex: z.strictObject({
    enabled: z.boolean(),
    acquisition_policy: text,
    composition: z.enum(['explicit_synthesis', 'automatic_union']),
    /** How the apex treats a shared form system when one is present. */
    form_policy: z
      .enum(['none', 'permanent_highest_form_when_present', 'suppress_forms'])
      .optional(),
  }),
  economy: z.strictObject({
    pricing_policy: text,
    currency: text.optional(),
  }),
  shared_form_progression: z.strictObject({
    enabled: z.boolean(),
    required_for_every_subject: z.boolean().optional(),
    scope: z.enum(['whole_unit', 'per_path']).optional(),
    unlocks: z
      .strictObject({
        metric: text,
        thresholds: z.array(z.number().int().nonnegative()),
      })
      .optional(),
    activation: text.optional(),
    resource: text.optional(),
    exit_conditions: z.array(text).optional(),
    recovery_behavior: text.optional(),
  }),
});

export type RulePack = z.infer<typeof rulePackSchema>;

export type PackIncompatibility = {
  binding: string;
  activePack: string;
  requiredModule: string;
  message: string;
};

/** Structured diagnostic when a plan asks for a system the active pack lacks. */
export function unsupportedBindingDiagnostic(
  binding: string,
  activePack: RulePack,
  requiredModule: string,
): PackIncompatibility {
  return {
    binding,
    activePack: `${activePack.id}@${activePack.version}`,
    requiredModule,
    message: [
      `Unsupported design binding: ${binding}`,
      ``,
      `Active pack: ${activePack.id}@${activePack.version}`,
      `Required module: ${requiredModule}`,
      ``,
      `Regenerate the layout using available systems,`,
      `or select a pack that provides this module.`,
    ].join('\n'),
  };
}
