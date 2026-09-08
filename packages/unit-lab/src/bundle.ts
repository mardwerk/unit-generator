import {
  buildManifest,
  canonicalJson,
  type Artifact,
  type ArtifactManifest
} from '@mardwerk/manifest';
import { hashBytes } from '@mardwerk/manifest/node';
import {
  REFERENCE_ANNOTATION_ARTIFACT_KIND,
  REFERENCE_COVERAGE_ARTIFACT_KIND,
  REFERENCE_PROVENANCE_ARTIFACT_KIND,
  REFERENCE_SET_ARTIFACT_KIND,
  UNIT_SPEC_ARTIFACT_KIND,
  type ReferenceBundleData
} from '@mardwerk/unit-definitions/diagnostics';

import {
  SYNTHETIC_ANNOTATIONS,
  SYNTHETIC_COVERAGE,
  SYNTHETIC_PROVENANCE,
  SYNTHETIC_REFERENCE_SET,
  SYNTHETIC_UNITS
} from './synthetic.js';

type ArtifactInput = {
  id: string;
  kind: Artifact['kind'];
  path: string;
  value: unknown;
  dependsOn?: string[];
};

function descriptor({ id, kind, path, value, dependsOn }: ArtifactInput): Artifact {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  return {
    id,
    kind,
    path,
    mediaType: 'application/json',
    schemaVersion: '0.1',
    bytes: bytes.byteLength,
    sha256: hashBytes(bytes),
    ...(dependsOn === undefined ? {} : { dependsOn })
  };
}

const annotationByUnit = new Map(SYNTHETIC_ANNOTATIONS.map((value) => [value.unitId, value]));
const coverageByUnit = new Map(SYNTHETIC_COVERAGE.map((value) => [value.unitId, value]));
const provenanceByUnit = new Map(SYNTHETIC_PROVENANCE.map((value) => [value.unitId, value]));

const inputs: ArtifactInput[] = [
  {
    id: 'synthetic-reference-set',
    kind: REFERENCE_SET_ARTIFACT_KIND,
    path: 'reference-set.json',
    value: SYNTHETIC_REFERENCE_SET,
    dependsOn: SYNTHETIC_REFERENCE_SET.members.flatMap((member) => [
      member.unitArtifactId,
      member.annotationArtifactId,
      member.coverageArtifactId,
      member.provenanceArtifactId!
    ])
  },
  ...SYNTHETIC_UNITS.flatMap((unit): ArtifactInput[] => [
    {
      id: `${unit.id}-unit`,
      kind: UNIT_SPEC_ARTIFACT_KIND,
      path: `units/${unit.id}.json`,
      value: unit
    },
    {
      id: `${unit.id}-annotation`,
      kind: REFERENCE_ANNOTATION_ARTIFACT_KIND,
      path: `annotations/${unit.id}.json`,
      value: annotationByUnit.get(unit.id)!,
      dependsOn: [`${unit.id}-unit`]
    },
    {
      id: `${unit.id}-coverage`,
      kind: REFERENCE_COVERAGE_ARTIFACT_KIND,
      path: `coverage/${unit.id}.json`,
      value: coverageByUnit.get(unit.id)!,
      dependsOn: [`${unit.id}-unit`]
    },
    {
      id: `${unit.id}-provenance`,
      kind: REFERENCE_PROVENANCE_ARTIFACT_KIND,
      path: `provenance/${unit.id}.json`,
      value: provenanceByUnit.get(unit.id)!,
      dependsOn: [`${unit.id}-unit`]
    }
  ])
];

export const SYNTHETIC_REFERENCE_MANIFEST: ArtifactManifest = buildManifest({
  bundleId: 'synthetic-development-0.1.0',
  createdAt: '2026-01-01T00:00:00Z',
  producer: {
    name: '@mardwerk/unit-lab',
    version: '0.1.0',
    component: 'synthetic-reference-fixtures'
  },
  artifacts: inputs.map(descriptor),
  metadata: {
    referenceSetId: SYNTHETIC_REFERENCE_SET.id,
    partition: SYNTHETIC_REFERENCE_SET.partition,
    syntheticFixtureMode: true
  }
});

export const SYNTHETIC_REFERENCE_BUNDLE: ReferenceBundleData = {
  manifest: SYNTHETIC_REFERENCE_MANIFEST,
  artifacts: Object.fromEntries(inputs.map(({ id, value }) => [id, value]))
};
