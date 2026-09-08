import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildManifest,
  canonicalJson,
  canonicalManifestJson,
  type ArtifactManifest
} from '@mardwerk/manifest';
import { hashBytes } from '@mardwerk/manifest/node';
import { afterEach, describe, expect, it } from 'vitest';

import { finiteJsonIssues } from '../src/classic/schema-validation.js';
import { VALIDATION_LIMITS } from '../src/classic/schemas.js';

import {
  REFERENCE_ANNOTATION_ARTIFACT_KIND,
  REFERENCE_ARTIFACT_SCHEMA_VERSIONS,
  REFERENCE_BUNDLE_LIMITS,
  REFERENCE_COVERAGE_ARTIFACT_KIND,
  REFERENCE_PROVENANCE_ARTIFACT_KIND,
  REFERENCE_SET_ARTIFACT_KIND,
  UNIT_SPEC_ARTIFACT_KIND,
  validateReferenceBundleData,
  validateReferenceBundleDirectory,
  type ReferenceBundleData
} from '../src/classic/bundle.js';

const unit = {
  schemaVersion: '0.1',
  id: 'ember-sentinel',
  name: 'Ember Sentinel',
  summary: 'An original short-range synthetic fixture.',
  roles: ['damage'],
  tags: ['synthetic'],
  placement: {
    footprintRadiusWorldUnits: 0.5,
    allowedSurfaces: ['ground'],
    rules: []
  },
  economy: { baseCostCredits: 100, costProfile: 'synthetic-default' },
  baseStats: { rangeWorldUnits: 8, durabilityHitPoints: 100 },
  resources: [],
  states: [],
  statuses: [],
  actions: [
    {
      id: 'spark',
      name: 'Spark',
      summary: 'Strikes one target.',
      unlockedByDefault: true,
      tags: ['damage'],
      trigger: { type: 'interval', intervalSeconds: 1 },
      targeting: {
        id: 'spark-targeting',
        type: 'first',
        maximumTargets: 1,
        includeTags: [],
        excludeTags: []
      },
      delivery: {
        id: 'spark-delivery',
        type: 'direct-strike',
        maximumTargetsPerProjectile: 1
      },
      timing: { cooldownSeconds: 1, windupSeconds: 0, rateScope: 'aggregate' },
      rangeWorldUnits: 8,
      emitters: [{ id: 'spark-emitter', emitterCount: 1, projectilesPerCycle: 1 }],
      effects: [{ id: 'spark-damage', type: 'damage', amountHitPoints: 5, damageType: 'heat' }],
      conditions: [],
      resourceCosts: [],
      stateInteractions: []
    }
  ],
  abilities: [],
  summons: [],
  forms: [],
  upgradeGraph: {
    paths: [],
    nodes: [],
    selectionRules: {
      maximumPrimaryPathTier: 5,
      maximumCrossPathTier: 2,
      maximumCrossPaths: 1,
      maximumSelectedNodes: 0
    }
  },
  requirements: { visuals: [], animations: [], audio: [] },
  extensions: { 'fixture.source': { scoreBonus: 999, ignored: true } }
};

const referenceSet = {
  schemaVersion: '0.1',
  id: 'synthetic-development',
  version: '1',
  unitSpecSchemaVersion: '0.1',
  partition: 'development',
  members: [
    {
      unitId: unit.id,
      familyId: 'ember-sentinel-family',
      unitArtifactId: 'unit-ember-sentinel',
      annotationArtifactId: 'annotation-ember-sentinel',
      coverageArtifactId: 'coverage-ember-sentinel',
      provenanceArtifactId: 'provenance-ember-sentinel'
    }
  ],
  normalizationVersion: 'synthetic-1',
  sourceSnapshotId: 'synthetic-snapshot-1'
};

const annotation = {
  schemaVersion: '0.1',
  unitId: unit.id,
  qualityClass: 'mature-reference',
  expectedHardAcceptance: true,
  expectedProfile: 'synthetic-default',
  declaredRoles: ['damage'],
  mechanicFamilies: ['direct-damage'],
  knownLimitations: [],
  annotationVersion: '1'
};

const coverage = {
  schemaVersion: '0.1',
  unitId: unit.id,
  status: 'complete',
  supportedMechanics: ['direct-damage'],
  approximatedMechanics: [],
  opaqueMechanics: [],
  unsupportedMechanics: [],
  warnings: []
};

const provenance = {
  schemaVersion: '0.1',
  unitId: unit.id,
  normalizationVersion: referenceSet.normalizationVersion,
  sourceSnapshotId: referenceSet.sourceSnapshotId,
  records: [
    {
      targetPointer: '/actions/0/effects/0/amountHitPoints',
      status: 'derived',
      sourceArtifact: 'synthetic-source-1',
      sourcePointer: '#/records/0/value',
      derivation: 'Normalized from an original synthetic fixture.',
      confidence: 1
    }
  ]
};

const artifactInputs = [
  ['reference-set', REFERENCE_SET_ARTIFACT_KIND, 'reference-set.json', referenceSet],
  ['unit-ember-sentinel', UNIT_SPEC_ARTIFACT_KIND, `units/${unit.id}.json`, unit],
  [
    'annotation-ember-sentinel',
    REFERENCE_ANNOTATION_ARTIFACT_KIND,
    `annotations/${unit.id}.json`,
    annotation
  ],
  [
    'coverage-ember-sentinel',
    REFERENCE_COVERAGE_ARTIFACT_KIND,
    `coverage/${unit.id}.json`,
    coverage
  ],
  [
    'provenance-ember-sentinel',
    REFERENCE_PROVENANCE_ARTIFACT_KIND,
    `provenance/${unit.id}.json`,
    provenance
  ]
] as const;

function fixture(): ReferenceBundleData & { manifest: ArtifactManifest } {
  const values = artifactInputs.map(
    ([id, kind, artifactPath, value]) => [id, kind, artifactPath, structuredClone(value)] as const
  );
  const artifacts = Object.fromEntries(values.map(([id, , , value]) => [id, value]));
  const manifest = buildManifest({
    bundleId: 'synthetic-reference-bundle',
    createdAt: '2026-01-01T00:00:00Z',
    producer: { name: 'mardwerk.unit-generator', version: '0.1.0', component: 'test' },
    artifacts: values.map(([id, kind, artifactPath, value]) => {
      const bytes = canonicalJson(value);
      return {
        id,
        kind,
        mediaType: 'application/json',
        path: artifactPath,
        schemaVersion: '0.1',
        bytes: Buffer.byteLength(bytes),
        sha256: hashBytes(bytes)
      };
    })
  });
  return { manifest, artifacts };
}

const roots: string[] = [];

async function writeBundle(data = fixture()): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'mardwerk-unit-bundle-'));
  roots.push(root);
  for (const artifact of data.manifest.artifacts) {
    const artifactFile = path.join(root, ...artifact.path.split('/'));
    await mkdir(path.dirname(artifactFile), { recursive: true });
    await writeFile(artifactFile, canonicalJson(data.artifacts[artifact.id]));
  }
  await writeFile(path.join(root, 'manifest.json'), canonicalManifestJson(data.manifest));
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('reference bundle validation', () => {
  it('accepts parsed data and a strict Foundation manifest directory', async () => {
    const data = fixture();
    const memory = validateReferenceBundleData(data);
    expect(memory).toMatchObject({ valid: true, issues: [] });
    if (memory.valid) {
      expect(memory.value.referenceSet.partition).toBe('development');
      expect(memory.value.units[unit.id]?.id).toBe(unit.id);
    }

    expect(await validateReferenceBundleDirectory(await writeBundle(data))).toMatchObject({
      valid: true,
      issues: []
    });
  });

  it('reports missing artifacts, wrong kinds, and duplicate references at stable paths', () => {
    const missing = fixture();
    delete (missing.artifacts as Record<string, unknown>)['annotation-ember-sentinel'];
    expect(validateReferenceBundleData(missing)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          category: 'artifact',
          path: `/annotations/${unit.id}.json`,
          message: expect.stringContaining('missing')
        })
      ])
    });

    const wrongKind = fixture();
    const coverageDescriptor = wrongKind.manifest.artifacts.find(
      ({ id }) => id === 'coverage-ember-sentinel'
    )!;
    coverageDescriptor.kind = UNIT_SPEC_ARTIFACT_KIND;
    expect(validateReferenceBundleData(wrongKind)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: '/reference-set.json/members/0/coverageArtifactId',
          message: expect.stringContaining(`expected "${REFERENCE_COVERAGE_ARTIFACT_KIND}"`)
        })
      ])
    });

    const duplicateMember = fixture();
    const set = structuredClone(referenceSet);
    set.members.push(structuredClone(set.members[0]));
    (duplicateMember.artifacts as Record<string, unknown>)['reference-set'] = set;
    const first = validateReferenceBundleData(duplicateMember);
    const second = validateReferenceBundleData(duplicateMember);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('duplicate member unit ID') }),
        expect.objectContaining({
          category: 'partition',
          message: expect.stringContaining('duplicate family ID')
        }),
        expect.objectContaining({
          message: expect.stringContaining('duplicate artifact reference')
        })
      ])
    });
  });

  it('bounds malformed manifest depth and width before Foundation validation', () => {
    const deep = fixture();
    const metadata: Record<string, unknown> = {};
    let cursor = metadata;
    for (let depth = 0; depth < 1_000; depth += 1) {
      const child: Record<string, unknown> = {};
      cursor.child = child;
      cursor = child;
    }
    (deep.manifest as ArtifactManifest).metadata = metadata;
    expect(() => validateReferenceBundleData(deep)).not.toThrow();
    const deepResult = validateReferenceBundleData(deep);
    expect(deepResult).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          category: 'manifest',
          path: expect.stringMatching(/^\/manifest\.json/u),
          message: expect.stringContaining('nested at most')
        })
      ])
    });
    if (!deepResult.valid) {
      expect(deepResult.issues.length).toBeLessThanOrEqual(VALIDATION_LIMITS.maximumIssues);
    }

    const wide = fixture();
    (wide.manifest as ArtifactManifest).artifacts = Array.from(
      { length: 3_000 },
      () => ({}) as ArtifactManifest['artifacts'][number]
    );
    const wideResult = validateReferenceBundleData(wide);
    expect(wideResult).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          category: 'manifest',
          path: '/manifest.json/artifacts',
          message: expect.stringContaining('at most 1024 items')
        })
      ])
    });
    if (!wideResult.valid) {
      expect(wideResult.issues.length).toBeLessThanOrEqual(VALIDATION_LIMITS.maximumIssues);
      expect(JSON.stringify(wideResult).length).toBeLessThan(10_000);
    }

    expect(
      finiteJsonIssues(
        { artifacts: Array.from({ length: 1_024 }, () => null) },
        '/manifest.json',
        REFERENCE_BUNDLE_LIMITS.maximumArtifactCount
      )
    ).toEqual([]);

    const atLimit = fixture();
    (atLimit.manifest as ArtifactManifest).artifacts = Array.from(
      { length: REFERENCE_BUNDLE_LIMITS.maximumArtifactCount },
      () => ({}) as ArtifactManifest['artifacts'][number]
    );
    const atLimitResult = validateReferenceBundleData(atLimit);
    expect(atLimitResult.valid).toBe(false);
    if (!atLimitResult.valid) {
      expect(atLimitResult.issues.length).toBeLessThanOrEqual(VALIDATION_LIMITS.maximumIssues);
      expect(JSON.stringify(atLimitResult).length).toBeLessThan(20_000);
      expect(atLimitResult.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining('Validation stopped') })
        ])
      );
    }
  });

  it('rejects unsafe paths and unsupported manifest, descriptor, and domain versions', () => {
    const unsafe = fixture();
    unsafe.manifest.artifacts[0]!.path = '../reference-set.json';
    expect(validateReferenceBundleData(unsafe)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ category: 'manifest', path: '/manifest.json/artifacts/0/path' })
      ])
    });

    const badManifest = fixture();
    (badManifest.manifest as { manifestVersion: string }).manifestVersion = '0.2';
    expect(validateReferenceBundleData(badManifest)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ category: 'manifest', path: '/manifest.json/manifestVersion' })
      ])
    });

    const badVersion = fixture();
    badVersion.manifest.artifacts[0]!.schemaVersion = '0.2';
    (badVersion.artifacts['reference-set'] as { schemaVersion: string }).schemaVersion = '0.2';
    expect(validateReferenceBundleData(badVersion)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          category: 'artifact',
          path: expect.stringContaining('/schemaVersion'),
          message: expect.stringContaining('unsupported schema version')
        }),
        expect.objectContaining({ category: 'schema', path: '/reference-set.json/schemaVersion' })
      ])
    });
  });

  it('checks canonical artifact integrity in memory', () => {
    const data = fixture();
    const descriptor = data.manifest.artifacts.find(({ id }) => id === 'unit-ember-sentinel')!;
    descriptor.sha256 = '0'.repeat(64);
    expect(validateReferenceBundleData(data)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          category: 'artifact',
          path: expect.stringMatching(/\/sha256$/u),
          message: 'checksum does not match canonical artifact data'
        })
      ])
    });
  });

  it('pins each artifact kind to its owning schema version', () => {
    expect(REFERENCE_ARTIFACT_SCHEMA_VERSIONS).toEqual({
      [UNIT_SPEC_ARTIFACT_KIND]: '0.1',
      [REFERENCE_SET_ARTIFACT_KIND]: '0.1',
      [REFERENCE_ANNOTATION_ARTIFACT_KIND]: '0.1',
      [REFERENCE_COVERAGE_ARTIFACT_KIND]: '0.1',
      [REFERENCE_PROVENANCE_ARTIFACT_KIND]: '0.1'
    });
  });

  it('requires partial and unsupported coverage to name the unsupported surface', () => {
    for (const status of ['partial', 'unsupported'] as const) {
      const data = fixture();
      (data.artifacts['coverage-ember-sentinel'] as { status: string }).status = status;
      expect(validateReferenceBundleData(data)).toMatchObject({
        valid: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            category: 'reference',
            message: expect.stringContaining(`${status} coverage`)
          })
        ])
      });
    }
  });

  it('rejects absolute analyst paths and executable or non-finite data', () => {
    for (const { derivation } of [
      { derivation: 'Derived from /home/analyst/private/export.json' },
      { derivation: 'Invalid provenance root: /private' },
      { derivation: 'Invalid provenance directory: /tmp/' }
    ]) {
      const absolutePath = fixture();
      const value = absolutePath.artifacts['provenance-ember-sentinel'] as typeof provenance;
      value.records[0]!.derivation = derivation;
      expect(validateReferenceBundleData(absolutePath)).toMatchObject({
        valid: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            category: 'security',
            path: `/provenance/${unit.id}.json/records/0/derivation`,
            message: expect.stringContaining('absolute local path')
          })
        ])
      });
    }

    const executable = fixture();
    (executable.artifacts['unit-ember-sentinel'] as Record<string, unknown>).extensions = {
      'fixture.source': { run: () => 'nope' }
    };
    expect(validateReferenceBundleData(executable)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          category: 'schema',
          message: expect.stringContaining('does not support values of type function')
        })
      ])
    });
  });

  it('bounds deeply nested JSON and oversized sidecar arrays without throwing', () => {
    const deep = fixture();
    const root: Record<string, unknown> = {};
    let cursor = root;
    for (let depth = 0; depth < 5_000; depth += 1) {
      const child: Record<string, unknown> = {};
      cursor.child = child;
      cursor = child;
    }
    (deep.artifacts['unit-ember-sentinel'] as Record<string, unknown>).extensions = {
      'fixture.source': root
    };
    expect(() => validateReferenceBundleData(deep)).not.toThrow();
    expect(validateReferenceBundleData(deep)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('nested at most') })
      ])
    });

    const wide = fixture();
    (wide.artifacts['annotation-ember-sentinel'] as typeof annotation).knownLimitations =
      Array.from({ length: 257 }, (_, index) => `limitation-${index}`);
    expect(validateReferenceBundleData(wide)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('at most 256 items') })
      ])
    });
  });

  it('caps schema-error amplification inside one artifact', () => {
    const data = fixture();
    (data.artifacts['unit-ember-sentinel'] as typeof unit).actions = Array.from(
      { length: VALIDATION_LIMITS.maximumCollectionItems },
      () => ({}) as (typeof unit.actions)[number]
    );
    const result = validateReferenceBundleData(data);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues.length).toBeLessThanOrEqual(VALIDATION_LIMITS.maximumIssues);
      expect(JSON.stringify(result).length).toBeLessThan(20_000);
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining('Validation stopped') })
        ])
      );
    }
  });

  it('requires strict URI-fragment source JSON Pointers', () => {
    expect(validateReferenceBundleData(fixture())).toMatchObject({ valid: true });

    for (const { sourcePointer } of [
      { sourcePointer: '/root/private.json' },
      { sourcePointer: '/usr/share/data.json' },
      { sourcePointer: '/workspace/export.json' },
      { sourcePointer: '/run/secrets/data' },
      { sourcePointer: 'C:\\private\\export.json' },
      { sourcePointer: '\\\\server\\share\\export.json' },
      { sourcePointer: 'file:///home/analyst/export.json' },
      { sourcePointer: '#/invalid~2escape' },
      { sourcePointer: '#/%ff' }
    ]) {
      const data = fixture();
      const value = data.artifacts['provenance-ember-sentinel'] as typeof provenance;
      value.records[0]!.sourcePointer = sourcePointer;
      expect(validateReferenceBundleData(data)).toMatchObject({
        valid: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            category: 'schema',
            path: `/provenance/${unit.id}.json/records/0/sourcePointer`,
            message: expect.stringMatching(/match|RFC 6901 URI-fragment/u)
          })
        ])
      });
    }
  });

  it('rejects oversized directory bundles before loading artifact JSON', async () => {
    const perArtifact = fixture();
    perArtifact.manifest.artifacts[0]!.bytes = REFERENCE_BUNDLE_LIMITS.maximumJsonArtifactBytes + 1;
    const perArtifactRoot = await writeBundle(perArtifact);
    await writeFile(
      path.join(perArtifactRoot, 'manifest.json'),
      canonicalManifestJson(perArtifact.manifest)
    );
    expect(await validateReferenceBundleDirectory(perArtifactRoot)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('declared size exceeds') })
      ])
    });

    const excessiveCount = buildManifest({
      bundleId: 'excessive-count',
      createdAt: '2026-01-01T00:00:00Z',
      producer: { name: 'mardwerk.test', version: '1', component: 'test' },
      artifacts: Array.from(
        { length: REFERENCE_BUNDLE_LIMITS.maximumArtifactCount + 1 },
        (_, index) => ({
          id: `artifact-${index}`,
          kind: UNIT_SPEC_ARTIFACT_KIND,
          mediaType: 'application/json',
          path: `artifacts/${index}.json`,
          schemaVersion: '0.1',
          bytes: 0,
          sha256: '0'.repeat(64)
        })
      )
    });
    const countRoot = await mkdtemp(path.join(tmpdir(), 'mardwerk-unit-bundle-'));
    roots.push(countRoot);
    await writeFile(path.join(countRoot, 'manifest.json'), canonicalManifestJson(excessiveCount));
    expect(await validateReferenceBundleDirectory(countRoot)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('artifact count exceeds') })
      ])
    });

    const excessiveTotal = buildManifest({
      bundleId: 'excessive-total',
      createdAt: '2026-01-01T00:00:00Z',
      producer: { name: 'mardwerk.test', version: '1', component: 'test' },
      artifacts: Array.from({ length: 17 }, (_, index) => ({
        id: `artifact-${index}`,
        kind: UNIT_SPEC_ARTIFACT_KIND,
        mediaType: 'application/json',
        path: `artifacts/${index}.json`,
        schemaVersion: '0.1',
        bytes: REFERENCE_BUNDLE_LIMITS.maximumJsonArtifactBytes,
        sha256: '0'.repeat(64)
      }))
    });
    const totalRoot = await mkdtemp(path.join(tmpdir(), 'mardwerk-unit-bundle-'));
    roots.push(totalRoot);
    await writeFile(path.join(totalRoot, 'manifest.json'), canonicalManifestJson(excessiveTotal));
    expect(await validateReferenceBundleDirectory(totalRoot)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('declared total size exceeds') })
      ])
    });

    const actualRoot = await writeBundle();
    await writeFile(
      path.join(actualRoot, `units/${unit.id}.json`),
      Buffer.alloc(REFERENCE_BUNDLE_LIMITS.maximumJsonArtifactBytes + 1)
    );
    expect(await validateReferenceBundleDirectory(actualRoot)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: `/units/${unit.id}.json`,
          message: `artifact exceeds ${REFERENCE_BUNDLE_LIMITS.maximumJsonArtifactBytes} bytes`
        })
      ])
    });
  });

  it('rejects a declared FIFO without blocking', async () => {
    const root = await writeBundle();
    const artifactFile = path.join(root, `units/${unit.id}.json`);
    await rm(artifactFile);
    execFileSync('mkfifo', [artifactFile]);
    expect(await validateReferenceBundleDirectory(root)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: `/units/${unit.id}.json`,
          message: 'artifact is not a regular file'
        })
      ])
    });
  }, 2_000);

  it('bounds undeclared directory traversal before Foundation verification', async () => {
    const root = await writeBundle();
    const undeclared = path.join(root, 'undeclared');
    await mkdir(undeclared);
    await Promise.all(
      Array.from({ length: REFERENCE_BUNDLE_LIMITS.maximumFilesystemEntries }, (_, index) =>
        mkdir(path.join(undeclared, String(index)))
      )
    );
    expect(await validateReferenceBundleDirectory(root)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: '/',
          message: expect.stringContaining('filesystem entries')
        })
      ])
    });
  });

  it('uses one canonical root when validating through a directory symlink', async () => {
    const root = await writeBundle();
    const links = await mkdtemp(path.join(tmpdir(), 'mardwerk-unit-bundle-link-'));
    roots.push(links);
    const link = path.join(links, 'bundle');
    await symlink(root, link, 'dir');
    expect(await validateReferenceBundleDirectory(link)).toMatchObject({ valid: true, issues: [] });
  });

  it('enforces checksums, canonical manifests, and undeclared-file rejection on disk', async () => {
    const checksumRoot = await writeBundle();
    await writeFile(path.join(checksumRoot, `units/${unit.id}.json`), '{}\n');
    expect(await validateReferenceBundleDirectory(checksumRoot)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ category: 'artifact', message: 'checksum does not match' })
      ])
    });

    const canonicalRoot = await writeBundle();
    const manifestFile = path.join(canonicalRoot, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as ArtifactManifest;
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
    expect(await validateReferenceBundleDirectory(canonicalRoot)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ category: 'manifest', message: 'manifest is not canonical JSON' })
      ])
    });

    const undeclaredRoot = await writeBundle();
    await writeFile(path.join(undeclaredRoot, 'extra.json'), '{}\n');
    expect(await validateReferenceBundleDirectory(undeclaredRoot)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          category: 'artifact',
          message: 'file is not declared in the bundle manifest'
        })
      ])
    });
  });
});
