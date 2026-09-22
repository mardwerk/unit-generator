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
 * Outcome: the validated pack, or a thrown error for duplicate concept
 * ids and dangling relationship endpoints.
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

/** Throw on duplicate concept ids and on endpoints naming no known concept. */
export function assertReferencePackCoherent(pack: ReferencePack): void {
  const parsed = referencePackSchema.parse(pack);
  const ids = parsed.concepts.map((concept) => concept.id);
  if (new Set(ids).size !== ids.length)
    throw new Error('Reference concepts must have unique identifiers.');
  const known = new Set(ids);
  for (const rel of parsed.relationships) {
    if (!known.has(rel.from) || !known.has(rel.to))
      throw new Error(
        `Reference relationship ${rel.from} ${rel.kind} ${rel.to} names an unknown concept.`,
      );
  }
}

/**
 * Return concept evidence ids absent from the retained source record.
 * Inputs: the pack plus the known span ids and source document ids.
 * Outcome: the dangling evidence ids, empty when every claim resolves.
 */
export function danglingReferenceEvidence(
  pack: ReferencePack,
  knownIds: readonly string[],
): string[] {
  const parsed = referencePackSchema.parse(pack);
  const known = new Set(knownIds);
  const dangling: string[] = [];
  for (const concept of parsed.concepts)
    for (const id of concept.evidenceIds)
      if (!known.has(id) && !dangling.includes(id)) dangling.push(id);
  return dangling;
}
