import { jsonCopy } from '@mardwerk/unit-core';
import { isLegalBtd6Build, validateBtd6Model } from './compiler.js';
import { validateBtd6ModelV2 } from './v2-compiler.js';
import type { Btd6Model, Btd6Tiers } from './schema.js';
import type { Btd6ModelV2 } from './v2-schema.js';
export interface Btd6EndpointReference {
  schemaVersion: 'btd6-derived.endpoint-reference/0.2';
  translatorVersion: 'btd6-field-projection/0.2';
  modelContract: 'btd6-derived.model/0.1' | 'btd6-derived.model/0.2';
  qualification: 'field-projection-only' | 'unsupported';
  model: Btd6Model | Btd6ModelV2 | null;
  endpoint: {
    family: string;
    model: string;
    tiers: Btd6Tiers;
    category: string;
    cost: number;
    appliedUpgrades: string[];
    upgrades: { tower: string; upgrade: string }[];
  };
  mappings: { target: string; sources: string[]; derivation?: string }[];
  gaps: { code: string; pointer: string; reason: string }[];
  sourceFacts: {
    root: { $ref: string };
    nodes: {
      pointer: string;
      type: string | null;
      kind: 'object' | 'array';
      fields: Record<string, unknown>;
    }[];
  };
  provenance: {
    snapshotId: string;
    sourceRootHash: string;
    sourceArtifact: string;
    sourceSha256: string;
    sourceGameVersion: string;
    sourceBuildId: string;
    evaluationPartition: 'all-units-exposed';
    sourceVersionQualification: 'static-export-version-unverified';
  };
  evidence: {
    sourceIntegrity: 'verified';
    localExecution: 'not-run' | 'passed';
    liveGameParity: false;
    goldReference: false;
  };
}
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const pointer = (value: unknown): value is string =>
  typeof value === 'string' && (value === '' || /^\/(?:[^~]|~[01])*$/.test(value));
/** Checks transport and model contracts. Private hash integrity and execution claims are not rechecked. */
export function consumeBtd6EndpointReference(value: unknown) {
  const reference = jsonCopy(value, 64 * 1024 * 1024) as Btd6EndpointReference;
  if (
    !reference ||
    typeof reference !== 'object' ||
    reference.schemaVersion !== 'btd6-derived.endpoint-reference/0.2' ||
    reference.translatorVersion !== 'btd6-field-projection/0.2' ||
    !['btd6-derived.model/0.1', 'btd6-derived.model/0.2'].includes(reference.modelContract)
  )
    throw new Error('Unsupported BTD6 endpoint reference or model contract.');
  const endpoint = reference.endpoint;
  if (
    !endpoint ||
    !nonempty(endpoint.family) ||
    !nonempty(endpoint.model) ||
    !nonempty(endpoint.category) ||
    !Array.isArray(endpoint.tiers) ||
    !isLegalBtd6Build(endpoint.tiers) ||
    !Number.isFinite(endpoint.cost) ||
    endpoint.cost < 0 ||
    !Array.isArray(endpoint.appliedUpgrades) ||
    !endpoint.appliedUpgrades.every(nonempty) ||
    !Array.isArray(endpoint.upgrades) ||
    !endpoint.upgrades.every((u) => u && nonempty(u.tower) && nonempty(u.upgrade))
  )
    throw new Error(
      'Invalid regular endpoint reference. Paragon and hero progression use separate contracts.'
    );
  if (
    !Array.isArray(reference.gaps) ||
    !reference.gaps.every((g) => g && nonempty(g.code) && pointer(g.pointer) && nonempty(g.reason))
  )
    throw new Error('Invalid reference gaps.');
  if (
    !Array.isArray(reference.mappings) ||
    !reference.mappings.every(
      (m) =>
        m &&
        pointer(m.target) &&
        Array.isArray(m.sources) &&
        m.sources.every(pointer) &&
        (m.derivation === undefined || nonempty(m.derivation))
    )
  )
    throw new Error('Invalid reference mappings.');
  const source = reference.provenance;
  if (
    !source ||
    !['snapshotId', 'sourceArtifact', 'sourceGameVersion', 'sourceBuildId'].every((key) =>
      nonempty(source[key as keyof typeof source])
    ) ||
    !/^[a-f0-9]{64}$/.test(source.sourceRootHash) ||
    !/^[a-f0-9]{64}$/.test(source.sourceSha256) ||
    source.evaluationPartition !== 'all-units-exposed' ||
    source.sourceVersionQualification !== 'static-export-version-unverified'
  )
    throw new Error('Invalid reference provenance.');
  const evidence = reference.evidence;
  if (
    !evidence ||
    evidence.sourceIntegrity !== 'verified' ||
    !['not-run', 'passed'].includes(evidence.localExecution) ||
    evidence.liveGameParity !== false ||
    evidence.goldReference !== false
  )
    throw new Error('Invalid reference evidence.');
  const graph = reference.sourceFacts;
  if (!graph || graph.root?.$ref !== '' || !Array.isArray(graph.nodes) || graph.nodes.length === 0)
    throw new Error('Invalid source fact graph.');
  const nodes = new Map(graph.nodes.map((node) => [node.pointer, node]));
  if (nodes.size !== graph.nodes.length || !nodes.has(''))
    throw new Error('Duplicate or missing source fact node.');
  for (const node of graph.nodes) {
    if (
      !pointer(node.pointer) ||
      !['object', 'array'].includes(node.kind) ||
      !(node.type === null || nonempty(node.type)) ||
      !node.fields ||
      typeof node.fields !== 'object' ||
      Array.isArray(node.fields)
    )
      throw new Error('Invalid source fact node.');
    const fields = Object.entries(node.fields);
    if (node.kind === 'array' && fields.some(([key], index) => key !== String(index)))
      throw new Error('Source array indices must be contiguous.');
    for (const [key, field] of fields) {
      if (field !== null && typeof field === 'object') {
        if (
          Array.isArray(field) ||
          Object.keys(field).length !== 1 ||
          !('$ref' in field) ||
          typeof field.$ref !== 'string' ||
          !nodes.has(field.$ref) ||
          field.$ref !== `${node.pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`
        )
          throw new Error('Invalid source fact reference.');
      } else if (!['string', 'number', 'boolean'].includes(typeof field) && field !== null)
        throw new Error('Invalid source scalar.');
    }
  }
  if (reference.qualification === 'unsupported') {
    if (reference.model !== null || reference.gaps.length === 0)
      throw new Error('Unsupported references require null model and explicit gaps.');
  } else if (
    reference.qualification !== 'field-projection-only' ||
    (reference.modelContract === 'btd6-derived.model/0.1'
      ? validateBtd6Model(reference.model)
      : validateBtd6ModelV2(reference.model)
    ).length
  )
    throw new Error('Invalid reference model.');
  return {
    reference,
    unsupported: reference.gaps.map((g) => `${g.code} at ${g.pointer}: ${g.reason}`),
    evidence: {
      targetContractValidated: true as const,
      sourceIntegrityRechecked: false as const,
      sourceExecutionRechecked: false as const,
      liveGameParity: false as const,
      goldReference: false as const
    }
  };
}
