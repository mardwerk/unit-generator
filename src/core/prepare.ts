import { validateConceptRequest } from './concept.js';
import { resolveConceptRequest, validateConceptDefinition } from './concept-definition.js';
import { withDefinitionEvidence, definitionProgression } from './blueprint/definition.js';
import { authorEvidence } from './blueprint/evidence.js';
import { getRulePack, type RulePack } from './rulepack.js';
import { assertReferencePackCoherent, danglingReferenceEvidence } from './reference.js';
import { validateLayoutPlan } from './design.js';
import { requestSchema, type AuthorRequest, type PreparedRequest } from './schemas.js';
/** Freeze cloned, validated artifacts so callers cannot change retained evidence. */
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) {
      freeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

export async function hashRequest(request: AuthorRequest): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(requestSchema.parse(request)));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function unique(values: readonly (string | number)[], subject: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${subject} must have unique identifiers or values`);
  }
}

function validateRequest(request: AuthorRequest): void {
  validateConceptDefinition(request);
  validateConceptRequest(request);
  unique(
    request.documents.map((document) => document.id),
    'Documents',
  );
  unique(
    request.constraints.map((constraint) => constraint.id),
    'Constraints',
  );
  if (!request.documents.some((document) => document.kind === 'source')) {
    throw new Error(
      'At least one supplied source document is required; a character name is insufficient evidence',
    );
  }
  if (request.previous !== null && request.feedback === null) {
    throw new Error('A revision requires explicit feedback');
  }
  validateProgression(request.progression);
  validateInterpretation(request);
  if (request.mechanicsDefinition) {
    if (
      JSON.stringify(request.progression) !==
      JSON.stringify(definitionProgression(request.mechanicsDefinition))
    )
      throw new Error(
        'Progression must match the explicit mechanics definition. Use its three paths and crosspath limits.',
      );
    if (withDefinitionEvidence(request) !== request)
      throw new Error(
        'Prepared requests must retain their mechanics definition evidence. Run prepare again.',
      );
  }
}

export async function prepareRequest(input: unknown): Promise<PreparedRequest> {
  const request = requestSchema.parse(
    withDefinitionEvidence(resolveConceptRequest(requestSchema.parse(input))),
  );
  validateRequest(request);
  return freeze({
    schemaVersion: '1',
    kind: 'prepared',
    inputHash: await hashRequest(request),
    request,
  });
}

export async function verifyPrepared(prepared: PreparedRequest): Promise<void> {
  validateRequest(prepared.request);
  if ((await hashRequest(prepared.request)) !== prepared.inputHash) {
    throw new Error('Prepared input hash does not match its retained request');
  }
}

function validateInterpretation(request: AuthorRequest): void {
  const interpretation = request.interpretation;
  if (!interpretation) return;
  if (request.mechanicsDefinition?.profile.authoringMode !== 'planned-v1')
    throw new Error('An interpretation record needs the planned-v1 authoring route.');
  assertReferencePackCoherent(interpretation.reference);
  let pack: RulePack;
  try {
    pack = getRulePack(interpretation.layout.rulePack);
  } catch {
    throw new Error(`Unknown RulePack for the interpretation: ${interpretation.layout.rulePack}.`);
  }
  if (pack.normal_progression.path_count !== 3 || pack.normal_progression.tiers_per_path !== 5)
    throw new Error(
      'The numerical backend implements 3 paths of 5 tiers. Other packs stay layout-only.',
    );
  const issues = validateLayoutPlan(interpretation.layout, interpretation.reference, pack);
  if (issues.length)
    throw new Error(
      `The interpretation record is invalid: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
    );
  const known = [
    ...authorEvidence(request).map((span) => span.id),
    ...request.documents
      .filter((document) => document.kind === 'source')
      .map((document) => document.id),
  ];
  const dangling = danglingReferenceEvidence(interpretation.reference, known);
  if (dangling.length)
    throw new Error(`The interpretation cites unknown evidence: ${dangling.join(', ')}.`);
}

function validateProgression(progression: AuthorRequest['progression']): void {
  if (progression === null) {
    return;
  }
  unique(
    progression.paths.map((path) => path.id),
    'Progression paths',
  );
  for (const path of progression.paths) {
    unique(path.tiers, `Progression path ${path.id} tiers`);
  }
  if (progression.maxActivePaths > progression.paths.length) {
    throw new Error('maxActivePaths exceeds declared path count');
  }
  if (
    progression.maxPathsAboveTier !== null &&
    progression.maxPathsAboveTier.count > progression.paths.length
  ) {
    throw new Error('maxPathsAboveTier.count exceeds declared path count');
  }
  for (const combination of progression.allowedTierCombinations ?? []) {
    validateAllowedCombination(combination, progression);
  }
}

function validateAllowedCombination(
  combination: number[],
  progression: NonNullable<AuthorRequest['progression']>,
): void {
  const hasEveryPath = combination.length === progression.paths.length;
  const usesDeclaredTiers =
    hasEveryPath &&
    combination.every(
      (tier, index) => tier === 0 || progression.paths[index]!.tiers.includes(tier),
    );
  if (!usesDeclaredTiers) {
    throw new Error(
      'Allowed tier combinations must give one declared tier or zero for every path in ' +
        'declaration order',
    );
  }

  const activePathCount = combination.filter((tier) => tier > 0).length;
  const totalTiers = combination.reduce((total, tier) => total + tier, 0);
  const threshold = progression.maxPathsAboveTier;
  const exceedsActivePaths = activePathCount > progression.maxActivePaths;
  const exceedsTotalTiers =
    progression.maxTotalTiers !== null && totalTiers > progression.maxTotalTiers;
  const exceedsThreshold =
    threshold !== null &&
    combination.filter((tier) => tier > threshold.tier).length > threshold.count;
  if (exceedsActivePaths || exceedsTotalTiers || exceedsThreshold) {
    throw new Error('An allowed tier combination contradicts the supplied progression limits');
  }
}
