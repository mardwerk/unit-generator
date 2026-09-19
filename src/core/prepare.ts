import { requestSchema, type AuthorRequest, type PreparedRequest } from './schemas.js';

/** Freeze cloned, validated artifacts so callers cannot change retained evidence. */
export function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
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
  if (new Set(values).size !== values.length) throw new Error(`${subject} must have unique identifiers or values`);
}

function validateRequest(request: AuthorRequest): void {
  unique(request.documents.map((document) => document.id), 'Documents');
  unique(request.constraints.map((constraint) => constraint.id), 'Constraints');
  if (!request.documents.some((document) => document.kind === 'source')) {
    throw new Error('At least one supplied source document is required; a character name is insufficient evidence');
  }
  if (request.previous !== null && request.feedback === null) throw new Error('A revision requires explicit feedback');
  const progression = request.progression;
  if (progression === null) return;
  unique(progression.paths.map((path) => path.id), 'Progression paths');
  for (const path of progression.paths) unique(path.tiers, `Progression path ${path.id} tiers`);
  if (progression.maxActivePaths > progression.paths.length) throw new Error('maxActivePaths exceeds declared path count');
  if (progression.maxPathsAboveTier !== null && progression.maxPathsAboveTier.count > progression.paths.length) {
    throw new Error('maxPathsAboveTier.count exceeds declared path count');
  }
  for (const combination of progression.allowedTierCombinations ?? []) {
    if (combination.length !== progression.paths.length || combination.some((tier, index) => tier !== 0 && !progression.paths[index]!.tiers.includes(tier))) {
      throw new Error('Allowed tier combinations must give one declared tier or zero for every path in declaration order');
    }
    if (combination.filter((tier) => tier > 0).length > progression.maxActivePaths ||
        (progression.maxTotalTiers !== null && combination.reduce((total, tier) => total + tier, 0) > progression.maxTotalTiers) ||
        (progression.maxPathsAboveTier !== null && combination.filter((tier) => tier > progression.maxPathsAboveTier!.tier).length > progression.maxPathsAboveTier.count)) {
      throw new Error('An allowed tier combination contradicts the supplied progression limits');
    }
  }
}

export async function prepareRequest(input: unknown): Promise<PreparedRequest> {
  const request = requestSchema.parse(input);
  validateRequest(request);
  return freeze({ schemaVersion: '1', kind: 'prepared', inputHash: await hashRequest(request), request });
}

export async function verifyPrepared(prepared: PreparedRequest): Promise<void> {
  validateRequest(prepared.request);
  if (await hashRequest(prepared.request) !== prepared.inputHash) throw new Error('Prepared input hash does not match its retained request');
}
