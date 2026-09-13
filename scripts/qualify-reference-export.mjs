import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import {
  qualifyUnit,
  qualifyBtd6EndpointReference,
  checkBtd6Capabilities
} from '../packages/unit-lab/dist/index.js';

const [directory, destination, mode] = process.argv.slice(2);
if (!directory || !destination || (mode !== undefined && mode !== '--without-legacy-calibration'))
  throw new Error(
    'Usage: node scripts/qualify-reference-export.mjs PRIVATE_EXPORT_DIRECTORY PRIVATE_REPORT_PATH [--without-legacy-calibration]'
  );
const root = resolve(directory);
const manifestBytes = await readFile(resolve(root, 'translation-report.btd6-reference.json'));
const manifest = JSON.parse(manifestBytes);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const rows = [];
const examples = new Map();
for (const entry of manifest.exports) {
  const path = resolve(root, entry.file);
  if (!path.startsWith(`${root}/`)) throw new Error('Export path escapes its directory.');
  const bytes = await readFile(path);
  if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256)
    throw new Error(`Export integrity failed: ${entry.id}`);
  const value = JSON.parse(bytes);
  const row = {
    id: entry.id,
    kind: entry.kind,
    qualification: entry.qualification,
    sourceSha256: entry.sourceSha256,
    gaps: (value.gaps ?? []).map((g) => ({ code: g.code, pointer: g.pointer, reason: g.reason }))
  };
  if (
    value.model &&
    ['btd6-derived.model/0.1', 'btd6-derived.model/0.2'].includes(value.modelContract)
  ) {
    const build = {
      schemaVersion: 'btd6-derived.build/0.1',
      unitId: value.endpoint.family,
      tiers: value.endpoint.tiers,
      cost: value.endpoint.cost ?? 0,
      model: value.model,
      adaptations: [],
      unsupported: (value.gaps ?? []).map((g) => g.reason)
    };
    row.report = qualifyBtd6EndpointReference(value);
    if (
      value.modelContract === 'btd6-derived.model/0.1' &&
      ['NinjaMonkey', 'NinjaMonkey-100', 'NinjaMonkey-200', 'SniperMonkey'].includes(entry.id)
    )
      examples.set(entry.id, { build, value });
  }
  if (entry.kind === 'unit')
    row.report = qualifyUnit({
      definitionId: value.schemaVersion === 'btd6-derived/0.2' ? 'tower-defense' : 'btd6-derived',
      candidate: value
    });
  rows.push(row);
}

// Frozen independently before running this script by the release reviewer. All are development cases.
// These constants come from captured field mappings. [0,2) with t0 firing is the local probe policy.
const oracles = [
  {
    id: 'NinjaMonkey',
    interval: 0.62,
    damage: 1,
    pierce: 2,
    camo: true,
    single: 4,
    dense: 8,
    range: 0
  },
  {
    id: 'NinjaMonkey-100',
    interval: 0.434,
    damage: 1,
    pierce: 2,
    camo: true,
    single: 5,
    dense: 10,
    range: 0
  },
  {
    id: 'NinjaMonkey-200',
    interval: 0.434,
    damage: 1,
    pierce: 4,
    camo: true,
    single: 5,
    dense: 20,
    range: 0
  },
  {
    id: 'SniperMonkey',
    interval: 1.59,
    damage: 2,
    pierce: 1,
    camo: false,
    single: 4,
    dense: 4,
    range: 4
  }
];
const calibration = [];
const target = (i, distance = 20, camo = false) => ({
  id: `target-${i}`,
  distance,
  camo,
  progress: 4 - i,
  strength: 1
});
for (const oracle of mode === '--without-legacy-calibration' ? [] : oracles) {
  const selected = examples.get(oracle.id);
  if (!selected) throw new Error(`Required calibration endpoint missing: ${oracle.id}`);
  const { build, value } = selected;
  const attack = build.model.attacks[0];
  if (
    build.model.attacks.length !== 1 ||
    attack.projectiles !== 1 ||
    (attack.onHit ?? []).length ||
    attack.delivery !== (oracle.id === 'SniperMonkey' ? 'instant' : 'projectile') ||
    attack.reach.kind !== (oracle.id === 'SniperMonkey' ? 'global' : 'radius') ||
    attack.reach.radius !== (oracle.id === 'SniperMonkey' ? 9999999 : 40) ||
    attack.intervalSeconds !== oracle.interval ||
    attack.damage !== oracle.damage ||
    attack.pierce !== oracle.pierce ||
    attack.detectsCamo !== oracle.camo
  )
    throw new Error(
      `Source-bound oracle fields changed for ${oracle.id}; review expectations before rerunning.`
    );
  const evidence = `Captured source ${value.provenance.sourceArtifact}, SHA256 ${value.provenance.sourceSha256}. Release reviewer fixed analytic expectations before seeing results. Probe has half-open [0,2), time-zero firing, stationary immortal targets.`;
  const cases = [
    {
      id: 'ordinary',
      intendedJob: 'Single-target contact at distance20',
      evidence,
      scenario: { durationSeconds: 2, targets: [target(0)] },
      expected: {
        minimumDamage: oracle.single,
        maximumDamage: oracle.single,
        minimumContactedTargets: 1,
        maximumContactedTargets: 1
      }
    },
    {
      id: 'dense',
      intendedJob: 'Four-target contact capacity',
      evidence,
      scenario: { durationSeconds: 2, targets: Array.from({ length: 4 }, (_, i) => target(i)) },
      expected: {
        minimumDamage: oracle.dense,
        maximumDamage: oracle.dense,
        minimumContactedTargets: oracle.pierce,
        maximumContactedTargets: oracle.pierce
      }
    },
    {
      id: 'range',
      intendedJob: 'Radius or global reach at distance41',
      evidence,
      scenario: { durationSeconds: 2, targets: [target(0, 41)] },
      expected: { minimumDamage: oracle.range, maximumDamage: oracle.range }
    },
    {
      id: 'camo',
      intendedJob: 'Captured concealment eligibility',
      evidence,
      scenario: { durationSeconds: 2, targets: [target(0, 20, true)] },
      expected: {
        minimumDamage: oracle.camo ? oracle.single : 0,
        maximumDamage: oracle.camo ? oracle.single : 0
      }
    }
  ];
  const variants = [
    { id: 'intact', expectedBlocked: false, mutate: () => {} },
    {
      id: 'renamed',
      expectedBlocked: false,
      mutate: (b) => {
        b.unitId = 'renamed';
        b.model.attacks[0].id = 'renamed-attack';
      }
    },
    {
      id: 'zero-damage',
      expectedBlocked: true,
      mutate: (b) => {
        b.model.attacks[0].damage = 0;
      }
    },
    {
      id: 'tenfold-interval',
      expectedBlocked: true,
      mutate: (b) => {
        b.model.attacks[0].intervalSeconds *= 10;
      }
    },
    {
      id: 'reversed-detection',
      expectedBlocked: true,
      mutate: (b) => {
        b.model.attacks[0].detectsCamo = !oracle.camo;
      }
    },
    {
      id: 'radius-one',
      expectedBlocked: oracle.id !== 'SniperMonkey',
      mutate: (b) => {
        b.model.attacks[0].reach.radius = 1;
      }
    }
  ];
  for (const variant of variants) {
    const candidate = structuredClone(build);
    variant.mutate(candidate);
    const report = checkBtd6Capabilities(candidate, cases);
    calibration.push({
      endpoint: oracle.id,
      variant: variant.id,
      expectedBlocked: variant.expectedBlocked,
      agreed: (report.readiness === 'blocked') === variant.expectedBlocked,
      report
    });
  }
}
const output = {
  schemaVersion: 'reference-qualification-run/0.1',
  createdAt: new Date().toISOString(),
  manifestSha256: sha256(manifestBytes),
  snapshotId: manifest.snapshotId,
  evaluationPartition: 'development-all-exposed',
  sourceIntegrity: 'export-file-hashes-rechecked',
  sourcePayloadHashesRechecked: false,
  liveGameParity: false,
  counts: {
    exports: rows.length,
    endpoints: rows.filter((r) => r.kind === 'endpoint').length,
    upgrades: rows.filter((r) => r.kind === 'upgrade').length,
    units: rows.filter((r) => r.kind === 'unit').length,
    familyBuildsProbed: rows
      .filter((r) => r.kind === 'unit')
      .reduce((n, r) => n + (r.report?.coverage.evaluatedBuilds ?? 0), 0),
    familyPurchaseEdges: rows
      .filter((r) => r.kind === 'unit')
      .reduce((n, r) => n + (r.report?.coverage.purchaseEdges ?? 0), 0),
    qualificationReports: rows.filter((r) => r.report).length,
    probed: rows.filter((r) => (r.report?.coverage.probes ?? 0) > 0).length,
    probeBlocked: rows.filter((r) => r.report?.readiness === 'blocked').length,
    sourceFactsOnly: rows.filter((r) => !r.report).length,
    unexecutedRecords: rows.filter((r) => !r.report?.coverage.probes).length,
    probes: rows.reduce((n, r) => n + (r.report?.coverage.probes ?? 0), 0),
    calibrationCases: calibration.length,
    calibrationAgreements: calibration.filter((c) => c.agreed).length
  },
  qualification:
    'Captured field/probe compatibility and deliberate corruption checks. No overall score and no untouched holdout.',
  rows,
  calibration
};
await mkdir(dirname(resolve(destination)), { recursive: true });
await writeFile(destination, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ destination: resolve(destination), ...output.counts }));
if (calibration.some((c) => !c.agreed)) process.exitCode = 1;
