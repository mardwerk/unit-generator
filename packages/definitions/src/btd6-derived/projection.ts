import { jsonCopy } from '@mardwerk/unit-core';
import { validateBtd6Model, isLegalBtd6Build } from './compiler.js';
import type { Btd6Model, Btd6Tiers } from './schema.js';

export interface Btd6ModelProjection {
  schemaVersion: 'btd6-derived.model/0.1';
  translatorVersion: 'btd6-field-projection/0.1';
  qualification: 'field-projection-only' | 'unsupported';
  model: Btd6Model | null;
  endpoint: { family: string; model: string; tiers: Btd6Tiers };
  gaps: { code: string; pointer: string; reason: string }[];
  provenance: {
    snapshotId: string;
    sourceRootHash: string;
    sourceArtifact: string;
    sourceSha256: string;
    sourceGameVersion: string;
    sourceBuildId: string;
    qualification: 'source-integrity-verified';
    evaluationPartition: 'development';
  };
}

/** Validates the consumer boundary, not the underlying private source hashes. */
export function consumeBtd6ModelProjection(value: unknown) {
  const copied: unknown = jsonCopy(value);
  if (!copied || typeof copied !== 'object') throw new Error('Projection must be an object.');
  const projection = copied as Btd6ModelProjection;
  if (
    projection.schemaVersion !== 'btd6-derived.model/0.1' ||
    projection.translatorVersion !== 'btd6-field-projection/0.1'
  )
    throw new Error('Unsupported BTD6 target or translator version.');
  if (!['field-projection-only', 'unsupported'].includes(projection.qualification))
    throw new Error('Unsupported projection qualification.');
  if (
    !Array.isArray(projection.gaps) ||
    !projection.gaps.every(
      (g) =>
        g &&
        typeof g.code === 'string' &&
        typeof g.pointer === 'string' &&
        typeof g.reason === 'string' &&
        g.reason.length > 0
    )
  )
    throw new Error('Projection gaps must be explicit.');
  if (
    !projection.endpoint ||
    !Array.isArray(projection.endpoint.tiers) ||
    !isLegalBtd6Build(projection.endpoint.tiers) ||
    typeof projection.endpoint.family !== 'string' ||
    typeof projection.endpoint.model !== 'string'
  )
    throw new Error('Invalid projection endpoint.');
  const source = projection.provenance;
  if (
    !source ||
    !['snapshotId', 'sourceArtifact', 'sourceGameVersion', 'sourceBuildId'].every(
      (key) =>
        typeof source[key as keyof typeof source] === 'string' &&
        source[key as keyof typeof source].length > 0
    ) ||
    !/^[a-f0-9]{64}$/.test(source.sourceRootHash) ||
    !/^[a-f0-9]{64}$/.test(source.sourceSha256) ||
    source.qualification !== 'source-integrity-verified' ||
    source.evaluationPartition !== 'development'
  )
    throw new Error('Unsupported or invalid projection provenance.');
  if (projection.qualification === 'unsupported') {
    if (projection.model !== null || projection.gaps.length === 0)
      throw new Error('Unsupported projections require a null model and recorded gaps.');
  } else if (validateBtd6Model(projection.model).length)
    throw new Error('Invalid projected combat model.');
  return {
    projection,
    unsupported: projection.gaps.map((g) => `${g.code} at ${g.pointer}: ${g.reason}`),
    evidence: {
      targetContractValidated: true as const,
      sourceIntegrityRechecked: false as const,
      liveGameParity: false as const
    }
  };
}
