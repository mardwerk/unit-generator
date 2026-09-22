import { z } from 'zod';
import type { RulePack } from './rulepack.js';
import { unsupportedBindingDiagnostic } from './rulepack.js';
import type { ReferencePack } from './reference.js';
import { assertReferencePackCoherent } from './reference.js';
import type { MechanicsDefinition } from './mechanics/schemas.js';

/**
 * DesignProfile. It holds accepted and rejected layout examples with
 * reasons. The standing preference is to preserve real relationships in
 * the source when assigning abilities to progression systems.
 *
 * Inputs: examples with verdicts and reasons.
 * Outcome: the validated profile used to compare layout candidates.
 */
export const designProfileSchema = z.strictObject({
  id: z.string().trim().min(1),
  version: z.string().trim().min(1),
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
  examples: [
    {
      layout: 'coherent-mastery-with-shared-forms',
      verdict: 'accept',
      reason: 'It separates parallel mastery from shared transformation progression.',
    },
    {
      layout: 'combat-role-paths',
      verdict: 'reject',
      reason: 'Its branches do not organize the central relationships in the reference.',
    },
    {
      layout: 'gears-as-competing-paths',
      verdict: 'reject',
      reason:
        'Successive forms would compete as alternative identities, and one branch would read as a later version of another.',
    },
  ],
});

/**
 * DesignPlan. It records the selected mapping between the reference and
 * the ruleset: why the reference is organized this way. The blueprint
 * records how the resulting unit behaves under the selected pack.
 * Invariants bind later generation: tuning cannot repurpose a
 * specialization, and a novelty pass cannot swap the organization.
 *
 * Inputs: subject, bindings of reference concepts to pack systems, invariants.
 * Outcome: the validated plan, or incompatibilities against the active pack.
 */
export const designLayoutPlanSchema = z.strictObject({
  subject: z.string().trim().min(1),
  rulePack: z.string().trim().min(1),
  bindings: z.strictObject({
    base_identity: z.string().trim().min(1),
    specialization_paths: z.record(z.string(), z.string()),
    shared_forms: z.string().trim().min(1).nullable(),
    apex: z.strictObject({
      specialization_policy: z.string().trim().min(1),
      form_policy: z.string().trim().min(1),
    }),
  }),
  design_invariants: z.array(z.string().trim().min(1)),
});

export type DesignLayoutPlan = z.infer<typeof designLayoutPlanSchema>;

export type LayoutCandidate = {
  id: string;
  description: string;
  paths: string[];
  sharedForms: string | null;
};

/**
 * Compare alternative layouts before filling upgrade slots.
 * Character content arrives through the reference pack. Structural
 * permission arrives through the rule pack. Taste arrives through the
 * profile, so a different project can prefer a different organization.
 */
export function compareLayouts(
  reference: ReferencePack,
  pack: RulePack,
  profile: DesignProfile,
): { selected: LayoutCandidate; rejected: LayoutCandidate[] } {
  assertReferencePackCoherent(reference);
  const concepts = new Set(reference.concepts.map((c) => c.id));
  const sharedFamily =
    reference.relationships.find((r) => r.kind === 'develops_into' && concepts.has(r.from))?.from ??
    null;
  const coexisting: string[] = [];
  for (const rel of reference.relationships.filter((r) => r.kind === 'can_coexist_with'))
    for (const id of [rel.from, rel.to])
      if (concepts.has(id) && !coexisting.includes(id)) coexisting.push(id);
  const paths = (
    coexisting.length >= pack.normal_progression.path_count ? coexisting : [...concepts]
  ).slice(0, pack.normal_progression.path_count);
  const candidates: LayoutCandidate[] = [
    {
      id: 'coherent-mastery-with-shared-forms',
      description: `Parallel mastery paths with shared form progression where supported.`,
      paths,
      sharedForms: pack.shared_form_progression.enabled ? sharedFamily : null,
    },
    {
      id: 'combat-role-paths',
      description: 'Speed, heavy damage and returning attacks as paths.',
      paths,
      sharedForms: null,
    },
    {
      id: 'gears-as-competing-paths',
      description: 'Successive forms as competing paths.',
      paths,
      sharedForms: null,
    },
  ];
  const isRejected = (candidate: LayoutCandidate) =>
    profile.examples.some((e) => e.layout === candidate.id && e.verdict === 'reject');
  const selected = candidates.find((c) => !isRejected(c)) ?? candidates[0]!;
  return { selected, rejected: candidates.filter((c) => c !== selected) };
}

/** Record the winning layout as a plan with explicit bindings and invariants. */
export function planFromLayout(
  reference: ReferencePack,
  pack: RulePack,
  layout: LayoutCandidate,
): DesignLayoutPlan {
  const base =
    reference.relationships.find((r) => r.kind === 'expresses_identity')?.from ??
    reference.concepts[0]!.id;
  const slots = Array.from({ length: pack.normal_progression.path_count }, (_, i) =>
    String.fromCharCode(65 + i),
  );
  const specialization_paths: Record<string, string> = {};
  layout.paths.slice(0, slots.length).forEach((concept, i) => {
    specialization_paths[slots[i]!] = concept;
  });
  return designLayoutPlanSchema.parse({
    subject: reference.subject,
    rulePack: `${pack.id}@${pack.version}`,
    bindings: {
      base_identity: base,
      specialization_paths,
      shared_forms: pack.shared_form_progression.enabled ? layout.sharedForms : null,
      apex: {
        specialization_policy: 'integrate_all_paths',
        form_policy: pack.shared_form_progression.enabled
          ? (pack.apex.form_policy ?? 'permanent_highest_form_when_present')
          : 'none',
      },
    },
    design_invariants: [
      'Every normal build retains the base fighting identity.',
      'Buying a specialization does not remove shared form access.',
      'Forms do not grant unpurchased specialization effects.',
    ],
  });
}

export type PlanValidationIssue = { path: string; message: string };

/**
 * Validate a plan against the active pack. The pack is read-only here.
 * A plan never makes itself valid by changing its ruleset.
 */
export function validateLayoutPlan(
  plan: DesignLayoutPlan,
  reference: ReferencePack,
  pack: RulePack,
): PlanValidationIssue[] {
  const parsed = designLayoutPlanSchema.parse(plan);
  assertReferencePackCoherent(reference);
  const known = new Set(reference.concepts.map((c) => c.id));
  const expectedPack = `${pack.id}@${pack.version}`;
  const issues: PlanValidationIssue[] = [];
  if (parsed.rulePack !== expectedPack)
    issues.push({
      path: 'rulePack',
      message: `Plan targets ${parsed.rulePack} but the active pack is ${expectedPack}. Candidates cannot edit their governing pack.`,
    });
  if (!known.has(parsed.bindings.base_identity))
    issues.push({
      path: 'bindings.base_identity',
      message: `Unknown reference concept: ${parsed.bindings.base_identity}`,
    });
  for (const [slot, id] of Object.entries(parsed.bindings.specialization_paths))
    if (!known.has(id))
      issues.push({
        path: `bindings.specialization_paths.${slot}`,
        message: `Unknown reference concept: ${id}`,
      });
  if (
    Object.keys(parsed.bindings.specialization_paths).length !== pack.normal_progression.path_count
  )
    issues.push({
      path: 'bindings.specialization_paths',
      message: `Expected ${pack.normal_progression.path_count} specialization paths under ${expectedPack}.`,
    });
  if (parsed.bindings.shared_forms) {
    if (!known.has(parsed.bindings.shared_forms))
      issues.push({
        path: 'bindings.shared_forms',
        message: `Unknown reference concept: ${parsed.bindings.shared_forms}`,
      });
    else if (!pack.shared_form_progression.enabled)
      issues.push({
        path: 'bindings.shared_forms',
        message: unsupportedBindingDiagnostic('shared_forms', pack, 'shared-forms@1.0.0').message,
      });
  }
  return issues;
}

/** Throw when a revision edits the governing pack to fit the candidate. */
export function assertPackImmutable(originalRef: string, revisedRef: string): void {
  if (originalRef !== revisedRef)
    throw new Error(
      `Candidates cannot edit their governing pack (was ${originalRef}, now ${revisedRef}).`,
    );
}

const SUPPORTED_BEHAVIORS = new Set([
  'damage',
  'attack-rate',
  'range',
  'pierce',
  'projectiles',
  'splash',
  'slow',
  'burn',
  'stun',
  'camo',
  'delivery-change',
  'damage-type-change',
  'targeting-change',
  'distinct-volley',
  'follow-up',
  'manual-boost',
  'active-follow-up',
]);

/**
 * Compiler boundary. A name such as future_sight means nothing unless the
 * backend defines it. New operations need a reviewed backend module.
 * Prose alone never adds one.
 */
export function assertSupportedBehavior(effect: string, definition: MechanicsDefinition): void {
  if (SUPPORTED_BEHAVIORS.has(effect)) return;
  throw new Error(
    [
      `Unsupported behavior: ${effect}`,
      ``,
      `Active backend: ${definition.id}:${definition.revision}`,
      `The backend defines no executable operation named ${effect}.`,
      ``,
      `Record it as a reserved technique or an unapproved extension proposal,`,
      `or implement it as a reviewed backend module first.`,
    ].join('\n'),
  );
}
