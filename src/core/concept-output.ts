import { z } from 'zod';
import { conceptCandidateSchema, type AuthorRequest } from './schemas.js';

/** Ground external references without restricting the concept's proposed behavior. */
export function conceptOutputSchema(request: AuthorRequest) {
  const shape = conceptCandidateSchema.shape;
  const documentIds = request.documents.map((document) => document.id);
  const constraintIds = request.constraints.map((constraint) => constraint.id);
  const decisionIds = [
    ...constraintIds,
    ...request.documents
      .filter((document) => document.kind === 'decisions')
      .map((document) => document.id),
  ];
  const evidence = references(documentIds);
  const decisionRefs = references(decisionIds);
  const pathId = request.progression
    ? identifier(request.progression.paths.map((path) => path.id))
    : shape.paths.element.shape.id;

  return conceptCandidateSchema.extend({
    basicAttack: shape.basicAttack.extend({ evidence, decisionRefs }),
    paths: z.array(
      shape.paths.element.extend({
        id: pathId,
        tiers: z
          .array(shape.paths.element.shape.tiers.element.extend({ evidence, decisionRefs }))
          .min(1),
      }),
    ),
    abilities: z.array(
      shape.abilities.element.extend({ evidence, decisionRefs, pathId: pathId.nullable() }),
    ),
    mechanics: z.array(shape.mechanics.element.extend({ evidence })),
    sources: boundedArray(
      shape.sources.element.extend({ documentId: identifier(documentIds) }),
      documentIds,
    ),
    constraintCoverage: boundedArray(
      shape.constraintCoverage.element.extend({ constraintId: identifier(constraintIds) }),
      constraintIds,
    ),
    representativeBuilds: z.array(
      shape.representativeBuilds.element.extend({
        selections: z.array(
          shape.representativeBuilds.element.shape.selections.element.extend({ pathId }),
        ),
      }),
    ),
    unresolvedQuestions: z.array(shape.unresolvedQuestions.element.extend({ evidence })),
    crosspaths: z.array(
      shape.crosspaths.element.extend({ mainPathId: pathId, secondaryPathId: pathId }),
    ),
  });
}

function identifier(ids: string[]) {
  return ids.length ? z.enum([...new Set(ids)]) : z.string().trim().min(1);
}

function boundedArray<T extends z.ZodType>(element: T, ids: string[]) {
  const array = z.array(element);
  return ids.length ? array : array.max(0);
}

function references(ids: string[]) {
  return boundedArray(identifier(ids), ids);
}
