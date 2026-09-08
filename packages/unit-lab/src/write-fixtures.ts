import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { canonicalJson, canonicalManifestJson, type ArtifactManifest } from '@mardwerk/manifest';
import { hashBytes } from '@mardwerk/manifest/node';
import type { ReferenceBundleData } from '@mardwerk/unit-definitions/diagnostics';

import { SYNTHETIC_REFERENCE_BUNDLE } from './bundle.js';

type MutableBundle = {
  manifest: ArtifactManifest;
  artifacts: Record<string, unknown>;
};

const outputRoot = path.resolve(process.argv[2] ?? '../../fixtures');
const validRoot = path.join(outputRoot, 'synthetic-development');
const malformedRoot = path.join(outputRoot, 'malformed');

function cloneBundle(): MutableBundle {
  return structuredClone(SYNTHETIC_REFERENCE_BUNDLE) as MutableBundle;
}

function refreshIntegrity(bundle: MutableBundle, artifactId: string): void {
  const artifact = bundle.manifest.artifacts.find(({ id }) => id === artifactId);
  if (!artifact) throw new Error(`Missing manifest artifact: ${artifactId}`);
  const bytes = new TextEncoder().encode(canonicalJson(bundle.artifacts[artifactId]));
  artifact.bytes = bytes.byteLength;
  artifact.sha256 = hashBytes(bytes);
}

async function writeBundle(bundle: ReferenceBundleData): Promise<void> {
  const manifest = bundle.manifest as ArtifactManifest;
  for (const artifact of manifest.artifacts) {
    const destination = path.join(validRoot, ...artifact.path.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, canonicalJson(bundle.artifacts[artifact.id]), 'utf8');
  }
  await writeFile(path.join(validRoot, 'manifest.json'), canonicalManifestJson(manifest), 'utf8');
}

async function writeCase(
  name: string,
  expectedCategories: string[],
  bundle: MutableBundle
): Promise<void> {
  await writeFile(
    path.join(malformedRoot, `${name}.json`),
    canonicalJson({ schemaVersion: '0.1', expectedCategories, bundle }),
    'utf8'
  );
}

await rm(validRoot, { recursive: true, force: true });
await rm(malformedRoot, { recursive: true, force: true });
await mkdir(validRoot, { recursive: true });
await mkdir(malformedRoot, { recursive: true });
await writeBundle(SYNTHETIC_REFERENCE_BUNDLE);

const missingArtifact = cloneBundle();
delete missingArtifact.artifacts['vector-kite-unit'];
await writeCase('missing-artifact', ['artifact'], missingArtifact);

const wrongKind = cloneBundle();
wrongKind.manifest.artifacts.find(({ id }) => id === 'vector-kite-unit')!.kind =
  'mardwerk.unit-reference-coverage';
await writeCase('wrong-kind', ['schema', 'reference'], wrongKind);

const checksumMismatch = cloneBundle();
checksumMismatch.manifest.artifacts.find(({ id }) => id === 'vector-kite-unit')!.sha256 =
  '0'.repeat(64);
await writeCase('checksum-mismatch', ['artifact'], checksumMismatch);

const duplicateArtifact = cloneBundle();
duplicateArtifact.manifest.artifacts.push({
  ...duplicateArtifact.manifest.artifacts[0]!,
  path: 'duplicates/reference-set.json'
});
await writeCase('duplicate-artifact-id', ['manifest'], duplicateArtifact);

const unsafePath = cloneBundle();
unsafePath.manifest.artifacts[0]!.path = '../reference-set.json';
await writeCase('unsafe-path', ['manifest'], unsafePath);

const badPartition = cloneBundle();
(badPartition.artifacts['synthetic-reference-set'] as Record<string, unknown>).partition =
  'training';
refreshIntegrity(badPartition, 'synthetic-reference-set');
await writeCase('bad-partition', ['schema'], badPartition);

const unsupportedVersion = cloneBundle();
unsupportedVersion.manifest.artifacts.find(
  ({ id }) => id === 'synthetic-reference-set'
)!.schemaVersion = '9.9';
await writeCase('unsupported-version', ['artifact'], unsupportedVersion);

const absoluteProvenance = cloneBundle();
const provenance = absoluteProvenance.artifacts['vector-kite-provenance'] as {
  records: Array<{ note?: string }>;
};
provenance.records[0]!.note = 'Invalid fixture path: /Users/example/private-source.json';
refreshIntegrity(absoluteProvenance, 'vector-kite-provenance');
await writeCase('absolute-provenance-path', ['security'], absoluteProvenance);
