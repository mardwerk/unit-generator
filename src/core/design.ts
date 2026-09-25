import { z } from 'zod';
import type { RulePack } from './rulepack.js';
import { unsupportedBindingDiagnostic } from './rulepack.js';
import type { ReferencePack } from './reference.js';
import { assertReferencePackCoherent, referencePackSchema } from './reference.js';
import type { MechanicsDefinition } from './mechanics/schemas.js';

/**
 * DesignPlan (experimental). It records the selected mapping between the
 * reference and the ruleset: why the reference is organized this way. The
 * blueprint records how the resulting unit behaves under the selected
 * pack. Nothing here executes. Numerical build resolution and purchase
 * legality stay on the 3-by-5 MechanicsDefinition.
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

/**
 * Optional interpretation record for the planned-v1 route. The request
 * carries it; the planner must honor its bindings, and the checker
 * re-validates the retained copy. Absent means the default route runs
 * unchanged.
 */
export const interpretationInputSchema = z.strictObject({
  reference: referencePackSchema,
  layout: designLayoutPlanSchema,
});

export type InterpretationInput = z.infer<typeof interpretationInputSchema>;

export type LayoutCandidate = {
  id: string;
  description: string;
  paths: string[];
  sharedForms: string | null;
};

/**
 * Record an explicit layout selection from caller-supplied candidates.
 * Candidates arrive from the caller or a model with their selection, not
 * from a generator recipe. Every candidate needs genuinely different
 * bindings: same paths and shared forms under another label is one
 * layout, not an alternative.
 */
export function selectLayout(
  reference: ReferencePack,
  pack: RulePack,
  candidates: LayoutCandidate[],
  selectedId: string,
): { selected: LayoutCandidate; rejected: LayoutCandidate[] } {
  assertReferencePackCoherent(reference);
  if (!candidates.length) throw new Error('Supply at least one layout candidate.');
  const ids = candidates.map((candidate) => candidate.id);
  if (new Set(ids).size !== ids.length)
    throw new Error('Layout candidates must have unique identifiers.');
  const known = new Set(reference.concepts.map((concept) => concept.id));
  const seen = new Set<string>();
  for (const candidate of candidates) {
    for (const id of [
      ...candidate.paths,
      ...(candidate.sharedForms ? [candidate.sharedForms] : []),
    ])
      if (!known.has(id)) throw new Error(`Layout ${candidate.id} names unknown concept: ${id}`);
    if (candidate.paths.length !== pack.normal_progression.path_count)
      throw new Error(
        `Layout ${candidate.id} binds ${candidate.paths.length} paths but ${pack.id}@${pack.version} needs ${pack.normal_progression.path_count}.`,
      );
    const binding = JSON.stringify({ paths: candidate.paths, sharedForms: candidate.sharedForms });
    if (seen.has(binding))
      throw new Error(
        `Layout ${candidate.id} repeats another candidate's bindings under a new label.`,
      );
    seen.add(binding);
  }
  const selected = candidates.find((candidate) => candidate.id === selectedId);
  if (!selected) throw new Error(`Selected layout is not among the candidates: ${selectedId}`);
  return { selected, rejected: candidates.filter((candidate) => candidate !== selected) };
}

/**
 * Record the winning layout as a plan. Unsupported proposals are
 * preserved here and reported by validation, never silently dropped.
 * Defaults: base identity uses the first expresses_identity relationship's
 * source, or the first concept when absent. The three fixed invariants below
 * are helper defaults, not deductions from source evidence or caller rules.
 * Callers should edit the returned base/invariants before supplying the record
 * when those defaults do not express their intent.
 * Slots sort alphabetically onto path1 and up, which the plan citation
 * check in planned-v1/plan.ts relies on.
 */
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
      shared_forms: layout.sharedForms,
      apex: {
        specialization_policy: pack.apex.enabled ? 'integrate_all_paths' : 'none',
        form_policy: pack.shared_form_progression.enabled ? 'shared_forms_when_present' : 'none',
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
 * Validate a plan against the active pack and reference. The pack is
 * read-only here. A plan never makes itself valid by changing its ruleset.
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
  if (parsed.subject !== reference.subject)
    issues.push({
      path: 'subject',
      message: `Plan subject ${parsed.subject} does not match reference subject ${reference.subject}.`,
    });
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
  if (!pack.apex.enabled) {
    if (parsed.bindings.apex.specialization_policy !== 'none')
      issues.push({
        path: 'bindings.apex.specialization_policy',
        message: `${expectedPack} disables the apex. Bind no specialization policy.`,
      });
    if (parsed.bindings.apex.form_policy !== 'none')
      issues.push({
        path: 'bindings.apex.form_policy',
        message: `${expectedPack} disables the apex. Bind no form policy.`,
      });
  }
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

const BASE_BEHAVIORS = new Set([
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
  'manual-boost',
]);

/**
 * Compiler boundary. A name such as future_sight means nothing unless the
 * active Definition can execute it. Extension behaviors need the matching
 * attack extension enabled. New operations need a reviewed backend module.
 * Prose alone never adds one.
 */
export function assertSupportedBehavior(effect: string, definition: MechanicsDefinition): void {
  if (BASE_BEHAVIORS.has(effect)) return;
  const extensions = definition.rules.attackExtensions ?? [];
  if (effect === 'distinct-volley' && extensions.includes('distinct-volley')) return;
  if (
    (effect === 'follow-up' || effect === 'active-follow-up') &&
    extensions.includes('volley-follow-up')
  )
    return;
  throw new Error(
    [
      `Unsupported behavior: ${effect}`,
      ``,
      `Active backend: ${definition.id}:${definition.revision}`,
      `The backend defines no executable operation named ${effect} under this Definition.`,
      ``,
      `Record it as a reserved technique or an unapproved extension proposal,`,
      `or implement it as a reviewed backend module first.`,
    ].join('\n'),
  );
}
