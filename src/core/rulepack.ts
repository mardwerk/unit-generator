import { z } from 'zod';
import { freeze } from './prepare.js';

/**
 * Versioned RulePack. It selects permitted systems and defines progression,
 * purchase restrictions and apex policy. It is configuration, not an
 * implementation. A rule file can authorize a behavior, but only the domain
 * backend in src/core/mechanics can execute it.
 *
 * Inputs: a pack reference such as td-three-path@1.0.0.
 * Outcome: the frozen pack, or a thrown error for an unknown reference.
 */
export const rulePackSchema = z.strictObject({
  id: z.string().trim().min(1),
  version: z.string().trim().min(1),
  /** Executable backend this pack targets, for example td-combat@1.0.0. */
  domain: z.string().trim().min(1),
  normal_progression: z.strictObject({
    path_count: z.number().int().min(1).max(8),
    tiers_per_path: z.number().int().min(1).max(8),
    sequential_purchases: z.boolean(),
    /** State predicates checked on the proposed state after a purchase. */
    state_constraints: z.array(z.string().trim().min(1)),
  }),
  apex: z.strictObject({
    enabled: z.boolean(),
    composition: z.enum(['explicit_synthesis', 'automatic_union']),
    form_policy: z.enum(['none', 'permanent_highest_form_when_present']).optional(),
  }),
  shared_form_progression: z.strictObject({
    enabled: z.boolean(),
  }),
});

export type RulePack = z.infer<typeof rulePackSchema>;

export const publicThreePathPack: RulePack = rulePackSchema.parse({
  id: 'td-three-path',
  version: '1.0.0',
  domain: 'td-combat@1.0.0',
  normal_progression: {
    path_count: 3,
    tiers_per_path: 5,
    sequential_purchases: true,
    state_constraints: [
      'levels.filter(t, t > 0).size() <= 2',
      'levels.filter(t, t > 2).size() <= 1',
    ],
  },
  apex: { enabled: true, composition: 'explicit_synthesis', form_policy: 'none' },
  shared_form_progression: { enabled: false },
});

/** Four-path probe. Layout search must handle it with no generator change. */
export const fourPathPack: RulePack = rulePackSchema.parse({
  id: 'td-four-path',
  version: '1.0.0',
  domain: 'td-combat@1.0.0',
  normal_progression: {
    path_count: 4,
    tiers_per_path: 5,
    sequential_purchases: true,
    state_constraints: [
      'levels.filter(t, t > 0).size() <= 2',
      'levels.filter(t, t > 2).size() <= 1',
    ],
  },
  apex: { enabled: true, composition: 'explicit_synthesis', form_policy: 'none' },
  shared_form_progression: { enabled: false },
});

const registry = new Map<string, RulePack>(
  [publicThreePathPack, fourPathPack].map((pack) => [`${pack.id}@${pack.version}`, pack]),
);

for (const pack of registry.values()) freeze(pack);

/** Resolve by id@version or bare id. */
export function getRulePack(ref: string): RulePack {
  const direct = registry.get(ref);
  if (direct) return direct;
  const found = [...registry.values()].find((pack) => pack.id === ref);
  if (!found) throw new Error(`Unknown RulePack: ${ref}`);
  return found;
}

export type PackIncompatibility = {
  binding: string;
  activePack: string;
  requiredModule: string;
  message: string;
};

/** Explicit diagnostic when a plan asks for a system the pack lacks. */
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
