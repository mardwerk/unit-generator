import { z } from 'zod';
import type { RulePack } from '../rulepack/schemas.js';
import { unsupportedBindingDiagnostic } from '../rulepack/schemas.js';
import type { ReferencePack } from '../reference/relationships.js';
import { assertReferencePackCoherent } from '../reference/relationships.js';
import type { DesignProfile } from './profile.js';

/**
 * DesignPlan: the selected mapping between the reference and the ruleset.
 *
 * Inputs: subject + bindings of reference concepts to pack systems + invariants.
 * Outcome: validated plan, or an incompatibility naming the active pack and
 * the required module.
 *
 * This records why the reference is organized this way. The detailed unit
 * definition (blueprint) records exactly how the resulting unit behaves under
 * the selected pack. Invariants constrain later generation: numerical tuning
 * cannot quietly repurpose a specialization, and a novelty pass cannot
 * replace the chosen organization.
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
  /** Reference concept ids used as specialization paths. */
  paths: string[];
  /** Reference concept id used as shared forms, when any. */
  sharedForms: string | null;
  assessment: string;
};

export type LayoutSelection = {
  selected: LayoutCandidate;
  rejected: LayoutCandidate[];
  profile: string;
};

/**
 * Compare alternative layouts before filling slots.
 * Inputs: reference pack + active rule pack + design profile.
 * Outcome: selected layout with rejected alternatives and reasons.
 *
 * Layout search stays in the framework. Character-specific content arrives
 * through the reference pack; structural permission arrives through the
 * rule pack; taste arrives through the profile.
 */
export function compareLayouts(
  reference: ReferencePack,
  pack: RulePack,
  profile: DesignProfile,
): LayoutSelection {
  assertReferencePackCoherent(reference);
  const concepts = new Set(reference.concepts.map((c) => c.id));
  const formFamilies = reference.relationships
    .filter((r) => r.kind === 'develops_into')
    .map((r) => r.from);
  const sharedFamily = formFamilies.find((id) => concepts.has(id)) ?? null;

  const coexistence = reference.relationships.filter((r) => r.kind === 'can_coexist_with');
  const coexisting: string[] = [];
  for (const rel of coexistence) {
    for (const id of [rel.from, rel.to])
      if (concepts.has(id) && !coexisting.includes(id)) coexisting.push(id);
  }
  const pathConcepts =
    coexisting.length >= pack.normal_progression.path_count
      ? coexisting.slice(0, pack.normal_progression.path_count)
      : [...reference.concepts.map((c) => c.id)].slice(0, pack.normal_progression.path_count);

  const coherent: LayoutCandidate = {
    id: 'coherent-mastery-with-shared-forms',
    description: `Parallel mastery paths (${pathConcepts.join(', ')}) with shared form progression where supported.`,
    paths: pathConcepts,
    sharedForms: pack.shared_form_progression.enabled ? sharedFamily : null,
    assessment:
      'Preserves the distinction between different kinds of mastery and shared character development.',
  };
  const combatRoles: LayoutCandidate = {
    id: 'combat-role-paths',
    description: 'Speed, heavy damage and returning attacks as paths.',
    paths: pathConcepts,
    sharedForms: null,
    assessment: 'Mechanically possible, but weak organization of the documented identity.',
  };
  const competingForms: LayoutCandidate = {
    id: 'gears-as-competing-paths',
    description: 'Successive forms as competing paths.',
    paths: pathConcepts,
    sharedForms: null,
    assessment:
      'Makes successive forms compete as alternative identities and risks making one branch feel like a later version of another.',
  };
  const rejected = profile.examples.some(
    (e) => e.layout === 'combat-role-paths' && e.verdict === 'reject',
  )
    ? [combatRoles, competingForms]
    : [competingForms];
  return { selected: coherent, rejected, profile: `${profile.id}@${profile.version}` };
}

/**
 * Record the selected interpretation as a DesignPlan.
 * Inputs: reference + pack + winning layout.
 * Outcome: plan with explicit bindings and invariants.
 */
export function planFromLayout(
  reference: ReferencePack,
  pack: RulePack,
  layout: LayoutCandidate,
): DesignLayoutPlan {
  const base =
    reference.relationships.find((r) => r.kind === 'expresses_identity')?.from ??
    reference.concepts[0]!.id;
  const keys = Array.from({ length: pack.normal_progression.path_count }, (_, i) =>
    String.fromCharCode(65 + i),
  );
  const specialization_paths: Record<string, string> = {};
  layout.paths.slice(0, keys.length).forEach((concept, i) => {
    specialization_paths[keys[i]!] = concept;
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
 * Validate a DesignPlan against the active pack.
 * Inputs: plan + reference + active pack.
 * Outcome: list of issues; empty means the mapping is supported.
 *
 * A plan must never make itself valid by changing its ruleset. The pack is a
 * read-only input. Unsupported bindings produce an explicit incompatibility
 * instead of silently adding private mechanics.
 */
export function validateLayoutPlan(
  plan: DesignLayoutPlan,
  reference: ReferencePack,
  pack: RulePack,
): PlanValidationIssue[] {
  const parsed = designLayoutPlanSchema.parse(plan);
  assertReferencePackCoherent(reference);
  const known = new Set(reference.concepts.map((c) => c.id));
  const issues: PlanValidationIssue[] = [];
  const expectedPack = `${pack.id}@${pack.version}`;
  if (parsed.rulePack !== expectedPack)
    issues.push({
      path: 'rulePack',
      message: `Plan targets ${parsed.rulePack} but the active pack is ${expectedPack}. Candidates cannot edit their governing pack.`,
    });
  const checkRef = (id: string, path: string) => {
    if (!known.has(id)) issues.push({ path, message: `Unknown reference concept: ${id}` });
  };
  checkRef(parsed.bindings.base_identity, 'bindings.base_identity');
  for (const [slot, id] of Object.entries(parsed.bindings.specialization_paths))
    checkRef(id, `bindings.specialization_paths.${slot}`);
  if (
    Object.keys(parsed.bindings.specialization_paths).length !== pack.normal_progression.path_count
  )
    issues.push({
      path: 'bindings.specialization_paths',
      message: `Expected ${pack.normal_progression.path_count} specialization paths under ${expectedPack}, found ${Object.keys(parsed.bindings.specialization_paths).length}.`,
    });
  if (parsed.bindings.shared_forms) {
    checkRef(parsed.bindings.shared_forms, 'bindings.shared_forms');
    if (!pack.shared_form_progression.enabled) {
      const diagnostic = unsupportedBindingDiagnostic('shared_forms', pack, 'shared-forms@1.0.0');
      issues.push({ path: 'bindings.shared_forms', message: diagnostic.message });
    }
  }
  return issues;
}

/**
 * Enforce that a revision cannot weaken its governing pack.
 * Inputs: original pack ref + revised pack ref.
 * Outcome: throws when the revision edits the pack to fit the candidate.
 */
export function assertPackImmutable(originalRef: string, revisedRef: string): void {
  if (originalRef !== revisedRef)
    throw new Error(
      `Candidates cannot edit their governing pack (was ${originalRef}, now ${revisedRef}).`,
    );
}
