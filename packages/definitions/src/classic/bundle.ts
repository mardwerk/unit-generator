import { Buffer } from 'node:buffer';
import { constants } from 'node:fs';
import { open, opendir, realpath } from 'node:fs/promises';
import path from 'node:path';

import {
  canonicalJson,
  canonicalManifestJson,
  validateManifest,
  type Artifact,
  type ArtifactManifest
} from '@mardwerk/manifest';
import {
  hashBytes,
  readManifest,
  resolveArtifactPath,
  verifyBundle
} from '@mardwerk/manifest/node';
import { Value } from '@sinclair/typebox/value';

import {
  REFERENCE_BUNDLE_SCHEMA_VERSION,
  UNIT_SPEC_SCHEMA_VERSION,
  VALIDATION_LIMITS,
  referenceAnnotationSchema,
  referenceCoverageSchema,
  referenceProvenanceSchema,
  referenceSetSchema,
  unitSpecSchema,
  type ReferenceAnnotation,
  type ReferenceCoverage,
  type ReferenceProvenance,
  type ReferenceSet,
  type UnitSpec
} from './schemas.js';
import { finiteJsonIssues, schemaIssues } from './schema-validation.js';
import { validateProvenance } from './validation.js';

export const UNIT_SPEC_ARTIFACT_KIND = 'mardwerk.unit-spec' as const;
export const REFERENCE_SET_ARTIFACT_KIND = 'mardwerk.unit-reference-set' as const;
export const REFERENCE_ANNOTATION_ARTIFACT_KIND = 'mardwerk.unit-reference-annotation' as const;
export const REFERENCE_COVERAGE_ARTIFACT_KIND = 'mardwerk.unit-reference-coverage' as const;
export const REFERENCE_PROVENANCE_ARTIFACT_KIND = 'mardwerk.unit-reference-provenance' as const;

export const REFERENCE_ARTIFACT_SCHEMA_VERSIONS = Object.freeze({
  [UNIT_SPEC_ARTIFACT_KIND]: UNIT_SPEC_SCHEMA_VERSION,
  [REFERENCE_SET_ARTIFACT_KIND]: REFERENCE_BUNDLE_SCHEMA_VERSION,
  [REFERENCE_ANNOTATION_ARTIFACT_KIND]: REFERENCE_BUNDLE_SCHEMA_VERSION,
  [REFERENCE_COVERAGE_ARTIFACT_KIND]: REFERENCE_BUNDLE_SCHEMA_VERSION,
  [REFERENCE_PROVENANCE_ARTIFACT_KIND]: REFERENCE_BUNDLE_SCHEMA_VERSION
});

export const REFERENCE_BUNDLE_LIMITS = Object.freeze({
  maximumArtifactCount: 1024,
  maximumFilesystemEntries: 4096,
  maximumJsonArtifactBytes: 8 * 1024 * 1024,
  maximumTotalArtifactBytes: 128 * 1024 * 1024
});

const ARTIFACT_SCHEMAS = {
  [UNIT_SPEC_ARTIFACT_KIND]: unitSpecSchema,
  [REFERENCE_SET_ARTIFACT_KIND]: referenceSetSchema,
  [REFERENCE_ANNOTATION_ARTIFACT_KIND]: referenceAnnotationSchema,
  [REFERENCE_COVERAGE_ARTIFACT_KIND]: referenceCoverageSchema,
  [REFERENCE_PROVENANCE_ARTIFACT_KIND]: referenceProvenanceSchema
} as const;

type SupportedArtifactKind = keyof typeof ARTIFACT_SCHEMAS;

export type ReferenceBundleIssueCategory =
  'manifest' | 'artifact' | 'schema' | 'reference' | 'partition' | 'security';

export interface ReferenceBundleIssue {
  category: ReferenceBundleIssueCategory;
  path: string;
  message: string;
}

export interface ReferenceBundleData {
  manifest: unknown;
  /** Parsed JSON artifacts keyed by manifest artifact ID. */
  artifacts: Readonly<Record<string, unknown>>;
}

export interface ValidatedReferenceBundle {
  manifest: ArtifactManifest;
  referenceSet: ReferenceSet;
  units: Readonly<Record<string, UnitSpec>>;
  annotations: Readonly<Record<string, ReferenceAnnotation>>;
  coverage: Readonly<Record<string, ReferenceCoverage>>;
  provenance: Readonly<Record<string, ReferenceProvenance>>;
}

export type ReferenceBundleValidation =
  | { valid: true; value: ValidatedReferenceBundle; issues: [] }
  | { valid: false; issues: ReferenceBundleIssue[] };

const CATEGORY_ORDER: Record<ReferenceBundleIssueCategory, number> = {
  manifest: 0,
  artifact: 1,
  schema: 2,
  reference: 3,
  partition: 4,
  security: 5
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function invalid(issues: ReferenceBundleIssue[]): ReferenceBundleValidation {
  issues.sort(
    (left, right) =>
      CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category] ||
      compareText(left.path, right.path) ||
      compareText(left.message, right.message)
  );
  return {
    valid: false,
    issues:
      issues.length >= VALIDATION_LIMITS.maximumIssues
        ? [
            ...issues.slice(0, VALIDATION_LIMITS.maximumIssues - 1),
            {
              category: 'schema',
              path: '/',
              message: `Validation stopped after ${VALIDATION_LIMITS.maximumIssues} issues.`
            }
          ]
        : issues
  };
}

function artifactPath(artifact: Artifact, suffix = ''): string {
  return `/${artifact.path}${suffix}`;
}

function isSupportedKind(kind: string): kind is SupportedArtifactKind {
  return Object.hasOwn(ARTIFACT_SCHEMAS, kind);
}

function addProvenanceIssues(
  artifact: Artifact,
  validationIssues: readonly {
    code: string;
    category: string;
    path: string;
    message: string;
  }[],
  issues: ReferenceBundleIssue[]
): void {
  for (const entry of validationIssues) {
    const suffix = entry.path.startsWith('/provenance')
      ? entry.path.slice('/provenance'.length)
      : entry.path;
    issues.push({
      category:
        entry.category === 'schema'
          ? 'schema'
          : entry.code === 'PROVENANCE_LOCAL_PATH'
            ? 'security'
            : 'reference',
      path: artifactPath(artifact, suffix),
      message: entry.message
    });
  }
}

function declaredLimitIssues(manifest: ArtifactManifest): ReferenceBundleIssue[] {
  const issues: ReferenceBundleIssue[] = [];
  if (manifest.artifacts.length > REFERENCE_BUNDLE_LIMITS.maximumArtifactCount) {
    issues.push({
      category: 'artifact',
      path: '/manifest.json/artifacts',
      message: `artifact count exceeds ${REFERENCE_BUNDLE_LIMITS.maximumArtifactCount}`
    });
  }
  let total = 0;
  for (const [index, artifact] of manifest.artifacts.entries()) {
    if (artifact.bytes === undefined) continue;
    if (artifact.bytes > REFERENCE_BUNDLE_LIMITS.maximumJsonArtifactBytes) {
      issues.push({
        category: 'artifact',
        path: `/manifest.json/artifacts/${index}/bytes`,
        message: `declared size exceeds ${REFERENCE_BUNDLE_LIMITS.maximumJsonArtifactBytes} bytes`
      });
    }
    total += artifact.bytes;
  }
  if (!Number.isSafeInteger(total) || total > REFERENCE_BUNDLE_LIMITS.maximumTotalArtifactBytes) {
    issues.push({
      category: 'artifact',
      path: '/manifest.json/artifacts',
      message: `declared total size exceeds ${REFERENCE_BUNDLE_LIMITS.maximumTotalArtifactBytes} bytes`
    });
  }
  return issues;
}

export async function readBoundedRegularFile(
  filePath: string,
  maximum: number
): Promise<Uint8Array> {
  const handle = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('artifact is not a regular file');
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const remaining = maximum - total;
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, remaining + 1));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) return Buffer.concat(chunks, total);
      if (bytesRead > remaining) throw new Error(`artifact exceeds ${maximum} bytes`);
      chunks.push(buffer.subarray(0, bytesRead));
      total += bytesRead;
    }
  } finally {
    await handle.close();
  }
}

async function regularFileSize(filePath: string): Promise<number> {
  const handle = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  );
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('artifact is not a regular file');
    return info.size;
  } finally {
    await handle.close();
  }
}

export async function treeLimitIssues(bundleRoot: string): Promise<ReferenceBundleIssue[]> {
  const directories = [path.resolve(bundleRoot)];
  let entries = 0;
  try {
    for (let index = 0; index < directories.length; index += 1) {
      const directory = await opendir(directories[index]!);
      for await (const entry of directory) {
        entries += 1;
        if (entries > REFERENCE_BUNDLE_LIMITS.maximumFilesystemEntries) {
          return [
            {
              category: 'artifact',
              path: '/',
              message: `bundle contains more than ${REFERENCE_BUNDLE_LIMITS.maximumFilesystemEntries} filesystem entries`
            }
          ];
        }
        if (entry.isDirectory()) directories.push(path.join(directory.path, entry.name));
      }
    }
    return [];
  } catch (error) {
    return [
      {
        category: 'artifact',
        path: '/',
        message: error instanceof Error ? error.message : 'bundle tree could not be inspected'
      }
    ];
  }
}

async function actualLimitIssues(
  bundleRoot: string,
  manifest: ArtifactManifest
): Promise<ReferenceBundleIssue[]> {
  const issues: ReferenceBundleIssue[] = [];
  let total = 0;
  for (const artifact of manifest.artifacts) {
    try {
      const size = await regularFileSize(resolveArtifactPath(bundleRoot, artifact.path));
      if (size > REFERENCE_BUNDLE_LIMITS.maximumJsonArtifactBytes) {
        issues.push({
          category: 'artifact',
          path: artifactPath(artifact),
          message: `artifact exceeds ${REFERENCE_BUNDLE_LIMITS.maximumJsonArtifactBytes} bytes`
        });
      }
      total += size;
    } catch (error) {
      issues.push({
        category: 'artifact',
        path: artifactPath(artifact),
        message: error instanceof Error ? error.message : 'artifact could not be inspected'
      });
    }
  }
  if (!Number.isSafeInteger(total) || total > REFERENCE_BUNDLE_LIMITS.maximumTotalArtifactBytes) {
    issues.push({
      category: 'artifact',
      path: '/manifest.json/artifacts',
      message: `actual total size exceeds ${REFERENCE_BUNDLE_LIMITS.maximumTotalArtifactBytes} bytes`
    });
  }
  return issues;
}

function duplicate(
  seen: Map<string, string>,
  value: string,
  path: string,
  noun: string,
  issues: ReferenceBundleIssue[],
  category: ReferenceBundleIssueCategory = 'reference'
): void {
  const first = seen.get(value);
  if (first === undefined) seen.set(value, path);
  else {
    issues.push({
      category,
      path,
      message: `duplicate ${noun} "${value}"; first declared at ${first}`
    });
  }
}

/** Validate parsed reference artifacts and their canonical byte integrity. */
export function validateReferenceBundleData(data: ReferenceBundleData): ReferenceBundleValidation {
  const manifestJsonIssues = finiteJsonIssues(
    data.manifest,
    '/manifest.json',
    REFERENCE_BUNDLE_LIMITS.maximumArtifactCount
  );
  if (manifestJsonIssues.length > 0) {
    return invalid(
      manifestJsonIssues.map(({ path: issuePath, message }) => ({
        category: 'manifest',
        path: issuePath,
        message
      }))
    );
  }
  const manifestResult = validateManifest(data.manifest);
  if (!manifestResult.valid) {
    const issues: ReferenceBundleIssue[] = manifestResult.errors
      .slice(0, VALIDATION_LIMITS.maximumIssues)
      .map(({ path, message }) => ({
        category: 'manifest',
        path: `/manifest.json${path === '/' ? '' : path}`,
        message
      }));
    if (manifestResult.errors.length > VALIDATION_LIMITS.maximumIssues) {
      issues[issues.length - 1] = {
        category: 'manifest',
        path: '/manifest.json',
        message: `Validation stopped after ${VALIDATION_LIMITS.maximumIssues} issues.`
      };
    }
    return invalid(issues);
  }

  const manifest = manifestResult.value;
  const issues: ReferenceBundleIssue[] = [];
  const parsed = new Map<string, unknown>();
  const artifactById = new Map(manifest.artifacts.map((artifact) => [artifact.id, artifact]));

  for (const [index, artifact] of manifest.artifacts.entries()) {
    if (issues.length >= VALIDATION_LIMITS.maximumIssues) break;
    const descriptorPath = `/manifest.json/artifacts/${index}`;
    if (!isSupportedKind(artifact.kind)) {
      issues.push({
        category: 'artifact',
        path: `${descriptorPath}/kind`,
        message: `unsupported artifact kind "${artifact.kind}"`
      });
      continue;
    }
    if (artifact.mediaType !== 'application/json') {
      issues.push({
        category: 'artifact',
        path: `${descriptorPath}/mediaType`,
        message: 'reference artifacts must use application/json'
      });
    }
    const expectedSchemaVersion = REFERENCE_ARTIFACT_SCHEMA_VERSIONS[artifact.kind];
    if (artifact.schemaVersion !== expectedSchemaVersion) {
      issues.push({
        category: 'artifact',
        path: `${descriptorPath}/schemaVersion`,
        message: `unsupported schema version "${artifact.schemaVersion ?? '(missing)'}"; expected "${expectedSchemaVersion}"`
      });
    }
    if (artifact.bytes === undefined || artifact.sha256 === undefined) {
      issues.push({
        category: 'artifact',
        path: descriptorPath,
        message: 'bytes and sha256 are required for every reference artifact'
      });
    }
    if (!Object.hasOwn(data.artifacts, artifact.id)) {
      issues.push({
        category: 'artifact',
        path: artifactPath(artifact),
        message: `artifact "${artifact.id}" is missing from the supplied data`
      });
      continue;
    }

    const value = data.artifacts[artifact.id];
    const jsonIssues = finiteJsonIssues(value, artifactPath(artifact));
    if (jsonIssues.length > 0) {
      issues.push(
        ...jsonIssues.map(({ path: issuePath, message }) => ({
          category: 'schema' as const,
          path: issuePath,
          message
        }))
      );
      continue;
    }
    const bytes = new TextEncoder().encode(canonicalJson(value));
    if (artifact.bytes !== undefined && artifact.bytes !== bytes.byteLength) {
      issues.push({
        category: 'artifact',
        path: `${descriptorPath}/bytes`,
        message: `declares ${artifact.bytes} bytes but canonical artifact data has ${bytes.byteLength}`
      });
    }
    if (artifact.sha256 !== undefined && artifact.sha256 !== hashBytes(bytes)) {
      issues.push({
        category: 'artifact',
        path: `${descriptorPath}/sha256`,
        message: 'checksum does not match canonical artifact data'
      });
    }
    parsed.set(artifact.id, value);
    for (const error of schemaIssues(ARTIFACT_SCHEMAS[artifact.kind], value)) {
      issues.push({
        category: 'schema',
        path: artifactPath(artifact, error.path),
        message: error.message
      });
    }
  }

  for (const id of Object.keys(data.artifacts)) {
    if (issues.length >= VALIDATION_LIMITS.maximumIssues) break;
    if (!artifactById.has(id)) {
      issues.push({
        category: 'artifact',
        path: `/artifacts/${id}`,
        message: `supplied artifact "${id}" is not declared in the manifest`
      });
    }
  }

  const setArtifacts = manifest.artifacts.filter(
    ({ kind }) => kind === REFERENCE_SET_ARTIFACT_KIND
  );
  if (setArtifacts.length !== 1) {
    issues.push({
      category: 'reference',
      path: '/manifest.json/artifacts',
      message: `expected exactly one ${REFERENCE_SET_ARTIFACT_KIND} artifact; found ${setArtifacts.length}`
    });
  }
  const setArtifact = setArtifacts[0];
  const referenceSet = setArtifact && parsed.get(setArtifact.id);
  if (!setArtifact || !Value.Check(referenceSetSchema, referenceSet)) return invalid(issues);

  const referenced = new Map<string, string>();
  const memberUnits = new Map<string, string>();
  const memberFamilies = new Map<string, string>();
  const unitIds = new Map<string, string>();
  const units = new Map<string, UnitSpec>();
  const annotations = new Map<string, ReferenceAnnotation>();
  const coverage = new Map<string, ReferenceCoverage>();
  const provenance = new Map<string, ReferenceProvenance>();

  for (const [index, member] of referenceSet.members.entries()) {
    if (issues.length >= VALIDATION_LIMITS.maximumIssues) break;
    const memberPath = artifactPath(setArtifact, `/members/${index}`);
    duplicate(memberUnits, member.unitId, `${memberPath}/unitId`, 'member unit ID', issues);
    duplicate(
      memberFamilies,
      member.familyId,
      `${memberPath}/familyId`,
      'family ID',
      issues,
      'partition'
    );

    const references = [
      ['unitArtifactId', member.unitArtifactId, UNIT_SPEC_ARTIFACT_KIND],
      ['annotationArtifactId', member.annotationArtifactId, REFERENCE_ANNOTATION_ARTIFACT_KIND],
      ['coverageArtifactId', member.coverageArtifactId, REFERENCE_COVERAGE_ARTIFACT_KIND],
      ...(member.provenanceArtifactId === undefined
        ? []
        : ([
            [
              'provenanceArtifactId',
              member.provenanceArtifactId,
              REFERENCE_PROVENANCE_ARTIFACT_KIND
            ]
          ] as const))
    ] as const;

    for (const [field, artifactId, expectedKind] of references) {
      const referencePath = `${memberPath}/${field}`;
      duplicate(referenced, artifactId, referencePath, 'artifact reference', issues);
      const artifact = artifactById.get(artifactId);
      if (!artifact) {
        issues.push({
          category: 'reference',
          path: referencePath,
          message: `references missing artifact "${artifactId}"`
        });
      } else if (artifact.kind !== expectedKind) {
        issues.push({
          category: 'reference',
          path: referencePath,
          message: `artifact "${artifactId}" has kind "${artifact.kind}"; expected "${expectedKind}"`
        });
      }
    }

    const unitArtifact = artifactById.get(member.unitArtifactId);
    const unit = parsed.get(member.unitArtifactId);
    let memberUnit: UnitSpec | undefined;
    if (unitArtifact && Value.Check(unitSpecSchema, unit)) {
      memberUnit = unit;
      if (unit.schemaVersion !== referenceSet.unitSpecSchemaVersion) {
        issues.push({
          category: 'reference',
          path: artifactPath(unitArtifact, '/schemaVersion'),
          message: `does not match reference set unitSpecSchemaVersion "${referenceSet.unitSpecSchemaVersion}"`
        });
      }
      if (unit.id !== member.unitId) {
        issues.push({
          category: 'reference',
          path: artifactPath(unitArtifact, '/id'),
          message: `unit ID "${unit.id}" does not match member unitId "${member.unitId}"`
        });
      }
      duplicate(unitIds, unit.id, artifactPath(unitArtifact, '/id'), 'unit ID', issues);
      units.set(member.unitId, unit);
    }

    const annotationArtifact = artifactById.get(member.annotationArtifactId);
    const annotation = parsed.get(member.annotationArtifactId);
    if (annotationArtifact && Value.Check(referenceAnnotationSchema, annotation)) {
      if (annotation.unitId !== member.unitId) {
        issues.push({
          category: 'reference',
          path: artifactPath(annotationArtifact, '/unitId'),
          message: `annotation unitId "${annotation.unitId}" does not match member unitId "${member.unitId}"`
        });
      }
      annotations.set(member.unitId, annotation);
    }

    const coverageArtifact = artifactById.get(member.coverageArtifactId);
    const coverageValue = parsed.get(member.coverageArtifactId);
    if (coverageArtifact && Value.Check(referenceCoverageSchema, coverageValue)) {
      if (coverageValue.unitId !== member.unitId) {
        issues.push({
          category: 'reference',
          path: artifactPath(coverageArtifact, '/unitId'),
          message: `coverage unitId "${coverageValue.unitId}" does not match member unitId "${member.unitId}"`
        });
      }
      if (
        coverageValue.status === 'partial' &&
        coverageValue.approximatedMechanics.length === 0 &&
        coverageValue.opaqueMechanics.length === 0 &&
        coverageValue.unsupportedMechanics.length === 0
      ) {
        issues.push({
          category: 'reference',
          path: artifactPath(coverageArtifact, '/status'),
          message: 'partial coverage must identify an approximated, opaque, or unsupported mechanic'
        });
      }
      if (
        coverageValue.status === 'unsupported' &&
        coverageValue.unsupportedMechanics.length === 0
      ) {
        issues.push({
          category: 'reference',
          path: artifactPath(coverageArtifact, '/unsupportedMechanics'),
          message: 'unsupported coverage must identify at least one unsupported mechanic'
        });
      }
      if (
        coverageValue.status === 'complete' &&
        (coverageValue.opaqueMechanics.length > 0 || coverageValue.unsupportedMechanics.length > 0)
      ) {
        issues.push({
          category: 'reference',
          path: artifactPath(coverageArtifact, '/status'),
          message: 'complete coverage may not identify opaque or unsupported mechanics'
        });
      }
      const classified = new Map<string, string>();
      mechanics: for (const field of [
        'supportedMechanics',
        'approximatedMechanics',
        'opaqueMechanics',
        'unsupportedMechanics'
      ] as const) {
        for (const [mechanicIndex, mechanic] of coverageValue[field].entries()) {
          if (issues.length >= VALIDATION_LIMITS.maximumIssues) break mechanics;
          duplicate(
            classified,
            mechanic,
            artifactPath(coverageArtifact, `/${field}/${mechanicIndex}`),
            'coverage mechanic',
            issues
          );
        }
      }
      coverage.set(member.unitId, coverageValue);
    }

    if (member.provenanceArtifactId !== undefined) {
      const provenanceArtifact = artifactById.get(member.provenanceArtifactId);
      const provenanceValue = parsed.get(member.provenanceArtifactId);
      if (provenanceArtifact && Value.Check(referenceProvenanceSchema, provenanceValue)) {
        addProvenanceIssues(
          provenanceArtifact,
          validateProvenance(provenanceValue, memberUnit ?? member.unitId).issues,
          issues
        );
        if (provenanceValue.normalizationVersion !== referenceSet.normalizationVersion) {
          issues.push({
            category: 'reference',
            path: artifactPath(provenanceArtifact, '/normalizationVersion'),
            message: `does not match reference set normalizationVersion "${referenceSet.normalizationVersion}"`
          });
        }
        if (
          referenceSet.sourceSnapshotId !== undefined &&
          provenanceValue.sourceSnapshotId !== referenceSet.sourceSnapshotId
        ) {
          issues.push({
            category: 'reference',
            path: artifactPath(provenanceArtifact, '/sourceSnapshotId'),
            message: `does not match reference set sourceSnapshotId "${referenceSet.sourceSnapshotId}"`
          });
        }
        provenance.set(member.unitId, provenanceValue);
      }
    }
  }

  for (const artifact of manifest.artifacts) {
    if (issues.length >= VALIDATION_LIMITS.maximumIssues) break;
    if (
      artifact.kind !== REFERENCE_SET_ARTIFACT_KIND &&
      isSupportedKind(artifact.kind) &&
      !referenced.has(artifact.id)
    ) {
      issues.push({
        category: 'reference',
        path: artifactPath(artifact),
        message: `artifact "${artifact.id}" is not referenced by a set member`
      });
    }
  }

  if (referenceSet.unitSpecSchemaVersion !== UNIT_SPEC_SCHEMA_VERSION) {
    issues.push({
      category: 'reference',
      path: artifactPath(setArtifact, '/unitSpecSchemaVersion'),
      message: `unsupported UnitSpec schema version "${referenceSet.unitSpecSchemaVersion}"`
    });
  }

  if (issues.length > 0) return invalid(issues);
  return {
    valid: true,
    value: {
      manifest,
      referenceSet,
      units: Object.fromEntries(units),
      annotations: Object.fromEntries(annotations),
      coverage: Object.fromEntries(coverage),
      provenance: Object.fromEntries(provenance)
    },
    issues: []
  };
}

/** Strictly verify and load a Foundation manifest bundle from a directory. */
export async function validateReferenceBundleDirectory(
  bundleRoot: string
): Promise<ReferenceBundleValidation> {
  let root: string;
  let declaredManifest: ArtifactManifest;
  try {
    root = await realpath(bundleRoot);
    declaredManifest = await readManifest(path.join(root, 'manifest.json'));
  } catch (error) {
    return invalid([
      {
        category: 'manifest',
        path: '/manifest.json',
        message: error instanceof Error ? error.message : 'manifest could not be read'
      }
    ]);
  }
  const limitIssues = declaredLimitIssues(declaredManifest);
  if (limitIssues.length > 0) return invalid(limitIssues);
  limitIssues.push(...(await treeLimitIssues(root)));
  if (limitIssues.length > 0) return invalid(limitIssues);
  limitIssues.push(...(await actualLimitIssues(root, declaredManifest)));
  if (limitIssues.length > 0) return invalid(limitIssues);

  const verification = await verifyBundle(root, {
    checksums: true,
    requireIntegrity: true,
    rejectUndeclared: true,
    requireCanonical: true
  });
  if (!verification.valid) {
    const manifestUnavailable = verification.manifest === undefined;
    return invalid(
      verification.errors.map(({ path: issuePath, message }) => {
        const manifestIssue = manifestUnavailable || issuePath === '/manifest.json';
        return {
          category: manifestIssue ? 'manifest' : 'artifact',
          path:
            issuePath === '/manifest.json' || issuePath.startsWith('/manifest.json/')
              ? issuePath
              : manifestIssue || issuePath.startsWith('/artifacts/')
                ? `/manifest.json${issuePath === '/' ? '' : issuePath}`
                : issuePath,
          message
        };
      })
    );
  }
  limitIssues.push(...declaredLimitIssues(verification.manifest));
  if (limitIssues.length > 0) return invalid(limitIssues);
  if (canonicalManifestJson(verification.manifest) !== canonicalManifestJson(declaredManifest)) {
    return invalid([
      {
        category: 'manifest',
        path: '/manifest.json',
        message: 'manifest changed during bundle validation'
      }
    ]);
  }

  const artifacts: Record<string, unknown> = {};
  const issues: ReferenceBundleIssue[] = [];
  for (const artifact of verification.manifest.artifacts) {
    try {
      const bytes = await readBoundedRegularFile(
        resolveArtifactPath(root, artifact.path),
        REFERENCE_BUNDLE_LIMITS.maximumJsonArtifactBytes
      );
      artifacts[artifact.id] = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch (error) {
      issues.push({
        category: 'schema',
        path: artifactPath(artifact),
        message: error instanceof Error ? error.message : 'artifact is not valid JSON'
      });
    }
  }
  return issues.length > 0
    ? invalid(issues)
    : validateReferenceBundleData({ manifest: verification.manifest, artifacts });
}
