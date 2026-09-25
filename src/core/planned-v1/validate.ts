import type { AuthorRequest } from '../schemas.js';
import { validateBlueprint } from '../mechanics/index.js';
import type { UnitBlueprint, MechanicsIssue } from '../mechanics/schemas.js';

const normalize = (text: string) => text.normalize('NFKC').replace(/\s+/g, ' ').trim();

/** Quotes are verifiable evidence spans. Their interpretation still needs semantic review. */
export function validateBlueprintRequest(
  blueprint: UnitBlueprint,
  request: AuthorRequest,
): MechanicsIssue[] {
  if (!request.mechanicsDefinition)
    return [{ path: 'request', message: 'Supply a mechanics definition.' }];
  const issues = validateBlueprint(blueprint, request.mechanicsDefinition);
  if (blueprint.name !== request.character.name)
    issues.push({ path: 'name', message: 'Preserve the exact requested character name.' });
  for (const [index, fact] of blueprint.sourceFacts.entries()) {
    const source = request.documents.find(
      (doc) => doc.kind === 'source' && doc.id === fact.documentId,
    );
    if (
      !source ||
      normalize(fact.quote).length < 15 ||
      !normalize(source.text).includes(normalize(fact.quote))
    )
      issues.push({
        path: `sourceFacts.${index}`,
        message:
          'Use a verbatim quote of at least 15 characters from the named source document. Do not paraphrase or cite game rules as character canon.',
      });
  }
  const expected = request.constraints.map(({ id }) => id).sort();
  const actual = blueprint.constraintCoverage.map(({ constraintId }) => constraintId).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    issues.push({
      path: 'constraintCoverage',
      message:
        'Describe preservation of every supplied constraint exactly once; do not add other constraint IDs.',
    });
  return issues;
}
