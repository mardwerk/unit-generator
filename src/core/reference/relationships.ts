import { z } from 'zod';

/**
 * ReferencePack: the source concept and relationships between its abilities,
 * traits and limitations.
 *
 * Inputs: sourced concepts + proposed relationships with evidence.
 * Outcome: validated pack where sourced descriptions and inferred design
 * groupings have different statuses.
 *
 * The framework understands general relationship kinds. Luffy-specific
 * entries live in test fixtures and request inputs, never in this module.
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

export type RelationshipKind = (typeof relationshipKinds)[number];

export const referenceConceptSchema = z.strictObject({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  /** Sourced ability description vs inferred design grouping. */
  status: z.enum(['evidence', 'interpretation']),
  description: z.string().trim().min(1),
  evidenceIds: z.array(z.string().trim().min(1)),
});

export const referenceRelationshipSchema = z.strictObject({
  from: z.string().trim().min(1),
  kind: z.enum(relationshipKinds),
  to: z.string().trim().min(1),
  /** Evidence-backed claim vs inferred design use. */
  status: z.enum(['evidence', 'interpretation']),
  note: z.string().trim().min(1).optional(),
});

export const referencePackSchema = z.strictObject({
  subject: z.string().trim().min(1),
  concepts: z.array(referenceConceptSchema).min(1),
  relationships: z.array(referenceRelationshipSchema),
});

export type ReferencePack = z.infer<typeof referencePackSchema>;
export type ReferenceConcept = z.infer<typeof referenceConceptSchema>;
export type ReferenceRelationship = z.infer<typeof referenceRelationshipSchema>;

/**
 * Validate that every relationship endpoint names a known concept.
 * Inputs: reference pack. Outcome: throws on dangling references.
 */
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
