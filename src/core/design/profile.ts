import { z } from 'zod';

/**
 * DesignProfile: project preferences through criteria and accepted/rejected
 * examples.
 *
 * Inputs: criteria + examples with reasons.
 * Outcome: validated profile used to compare layout candidates.
 *
 * The general preference is "preserve meaningful relationships in the source
 * when assigning abilities to progression systems", not "always use
 * Haki-like paths". A deliberately absurd crossover game would supply a
 * different profile.
 */
export const designProfileSchema = z.strictObject({
  id: z.string().trim().min(1),
  version: z.string().trim().min(1),
  criteria: z.array(z.string().trim().min(1)).min(1),
  examples: z.array(
    z.strictObject({
      layout: z.string().trim().min(1),
      verdict: z.enum(['accept', 'reject']),
      reason: z.string().trim().min(1),
    }),
  ),
});

export type DesignProfile = z.infer<typeof designProfileSchema>;

/** Default profile: coherent character mastery over unrelated combat roles. */
export const defaultDesignProfile: DesignProfile = designProfileSchema.parse({
  id: 'coherent-mastery',
  version: '1.0.0',
  criteria: [
    'Preserve meaningful relationships in the source when assigning abilities to progression systems.',
    'Keep a recognizable base identity across normal builds.',
    'Discourage unrelated mechanics at later tiers.',
    'Favor an apex that resolves limitations established by the ordinary unit.',
  ],
  examples: [
    {
      layout: 'haki-paths-with-shared-gear-forms',
      verdict: 'accept',
      reason:
        'Prefer the Haki-based layout because it separates parallel mastery from shared transformation progression.',
    },
    {
      layout: 'combat-role-paths',
      verdict: 'reject',
      reason:
        'Reject the combat-role layout because its branches do not organize the reference central relationships.',
    },
    {
      layout: 'gears-as-competing-paths',
      verdict: 'reject',
      reason:
        'Reject competing Gear paths because successive forms would compete as alternative identities and one branch would feel like a later version of another.',
    },
  ],
});
