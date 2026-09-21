import { withDefinitionEvidence, definitionProgression } from './blueprint/definition.js';
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
  const request = withDefinitionEvidence(requestSchema.parse(input));
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
