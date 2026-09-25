import { mechanicsDefinitionSchema, type MechanicsDefinition } from '../mechanics/schemas.js';
import type { AuthorRequest, ResolvedDocument } from '../schemas.js';

/** A supplied definition becomes ordinary, inspectable evidence in the retained request. */
export function definitionDocument(input: MechanicsDefinition): ResolvedDocument {
  const definition = mechanicsDefinitionSchema.parse(input);
  return {
    id: `mechanics:${definition.id}`,
    kind: 'rules',
    text: JSON.stringify(definition),
    origin: {
      location: `unit-mechanics:${definition.id}:${definition.revision}`,
      access: 'supplied',
      note: 'Explicit mechanics definition. Build resolution is implemented; combat simulation and balance are not certified.',
    },
  };
}

export function withDefinitionEvidence(request: AuthorRequest): AuthorRequest {
  if (!request.mechanicsDefinition) return request;
  const document = definitionDocument(request.mechanicsDefinition);
  const existing = request.documents.find((entry) => entry.id === document.id);
  if (existing && JSON.stringify(existing) !== JSON.stringify(document))
    throw new Error(
      'The mechanics evidence document differs from the supplied definition. Edit mechanicsDefinition, not its generated evidence document.',
    );
  return existing ? request : { ...request, documents: [...request.documents, document] };
}

export function definitionProgression(
  definition: MechanicsDefinition,
): NonNullable<AuthorRequest['progression']> {
  return {
    paths: [1, 2, 3].map((index) => ({ id: `path-${index}`, tiers: [1, 2, 3, 4, 5] })),
    maxActivePaths: definition.progression.maxPurchasedPaths,
    maxPathsAboveTier: {
      tier: definition.progression.crosspathTier,
      count: definition.progression.maxAdvancedPaths,
    },
    maxTotalTiers: null,
    allowedTierCombinations: null,
  };
}
