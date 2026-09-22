import { z } from 'zod';

/**
 * ReferencePack. It describes the source concept and the relationships
 * between its abilities, traits and limitations.
 *
 * The framework knows these general relationship kinds. Character entries
 * arrive as request inputs or test fixtures, never as framework code.
 * Sourced descriptions and inferred design groupings carry different status.
 *
 * Inputs: concepts plus proposed relationships with evidence.
 * Outcome: the validated pack, or a thrown error for dangling references.
 */
export const relationshipKinds = [
  'belongs_to_family',
  'develops_into',
  'can_coexist_with',
  'replaces',
  'requires',
  'expresses_identity',
  'limited_by',
] as const;

export const referenceConceptSchema = z.strictObject({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  status: z.enum(['evidence', 'interpretation']),
  description: z.string().trim().min(1),
  evidenceIds: z.array(z.string().trim().min(1)),
});

export const referenceRelationshipSchema = z.strictObject({
  from: z.string().trim().min(1),
  kind: z.enum(relationshipKinds),
  to: z.string().trim().min(1),
  status: z.enum(['evidence', 'interpretation']),
  note: z.string().trim().min(1).optional(),
});

export const referencePackSchema = z.strictObject({
  subject: z.string().trim().min(1),
  concepts: z.array(referenceConceptSchema).min(1),
  relationships: z.array(referenceRelationshipSchema),
});

export type ReferencePack = z.infer<typeof referencePackSchema>;

/** Throw when a relationship endpoint names no known concept. */
export function assertReferencePackCoherent(pack: ReferencePack): void {
  const parsed = referencePackSchema.parse(pack);
  const known = new Set(parsed.concepts.map((concept) => concept.id));
  for (const rel of parsed.relationships) {
    if (!known.has(rel.from) || !known.has(rel.to))
      throw new Error(
        `Reference relationship ${rel.from} ${rel.kind} ${rel.to} names an unknown concept.`,
      );
  }
}
