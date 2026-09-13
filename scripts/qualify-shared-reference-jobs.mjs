import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { compileBtd6BuildV2 } from '../packages/definitions/dist/btd6-derived/index.js';
import { checkBtd6MechanicsV2 } from '../packages/unit-lab/dist/index.js';

const [directory, destination] = process.argv.slice(2);
if (!directory || !destination)
  throw new Error(
    'Usage: node scripts/qualify-shared-reference-jobs.mjs PRIVATE_EXPORT_DIRECTORY PRIVATE_REPORT_PATH'
  );
const manifest = JSON.parse(
  await readFile(resolve(directory, 'translation-report.btd6-reference.json'), 'utf8')
);
const rows = [];
const source = async (name, tiers = [0, 0, 0]) => {
  const filename = `${name}.unit.btd6-reference.json`;
  const entry = manifest.exports.find((entry) => entry.file === filename);
  const bytes = await readFile(resolve(directory, filename));
  if (!entry || createHash('sha256').update(bytes).digest('hex') !== entry.sha256)
    throw new Error(`Export integrity failed: ${name}`);
  const endpointId = tiers.every((tier) => tier === 0) ? name : `${name}-${tiers.join('')}`;
  const endpoint = manifest.exports.find(
    (item) => item.kind === 'endpoint' && item.id === endpointId
  );
  if (!endpoint) throw new Error(`Missing endpoint provenance: ${endpointId}`);
  return {
    build: compileBtd6BuildV2(JSON.parse(bytes), tiers),
    evidence: `${endpoint.sourceArtifact}, SHA256 ${endpoint.sourceSha256}; translated unit file SHA256 ${entry.sha256}. Independent agent reviewer fixed these analytic expectations before the run. Scheduling is the local shared runtime contract, not measured live-game timing.`
  };
};
const evaluate = (family, name, build, cases, expectedBlocked) => {
  const report = checkBtd6MechanicsV2(build, cases);
  rows.push({
    family,
    name,
    expectedBlocked,
    agreed: (report.readiness === 'blocked') === expectedBlocked,
    report
  });
};
const exact = (value) => ({ minimum: value, maximum: value });
const farm = await source('BananaFarm');
const income = farm.build.model.income;
if (
  income.length !== 1 ||
  income[0].amount !== 20 ||
  income[0].emissionsPerRound !== 4 ||
  income[0].intervalSeconds !== 0.05 ||
  income[0].pickupLifetimeSeconds !== 15 ||
  income[0].autoCollect
)
  throw new Error('Farm source premises changed. Re-review expected jobs.');
const farmCases = [
  {
    id: 'production',
    intendedJob: 'Produce four pickups worth 20 cash each after full production intervals',
    evidence: farm.evidence,
    scenario: { durationSeconds: 0.201, targets: [], roundStarts: [0] },
    expected: { produced: exact(80), cash: exact(0), pickups: exact(4) }
  },
  {
    id: 'collection',
    intendedJob: 'Collect every live pickup after production',
    evidence: farm.evidence,
    scenario: {
      durationSeconds: 0.202,
      targets: [],
      roundStarts: [0],
      collections: [{ at: 0.201 }]
    },
    expected: { produced: exact(80), cash: exact(80), pickups: exact(0) }
  },
  {
    id: 'expiry',
    intendedJob: 'Uncollected pickups expire without awarding cash',
    evidence: farm.evidence,
    scenario: { durationSeconds: 15.201, targets: [], roundStarts: [0] },
    expected: { produced: exact(80), cash: exact(0), pickups: exact(0) }
  }
];
evaluate('BananaFarm', 'intact', farm.build, farmCases, false);
const namedFarm = structuredClone(farm.build);
namedFarm.model.income[0].id = 'renamed-production';
evaluate('BananaFarm', 'renamed', namedFarm, farmCases, false);
const emptyFarm = structuredClone(farm.build);
emptyFarm.model.income[0].amount = 0;
evaluate('BananaFarm', 'zero-value-production', emptyFarm, farmCases, true);
const autoFarm = structuredClone(farm.build);
autoFarm.model.income[0].autoCollect = true;
evaluate('BananaFarm', 'incorrect-auto-collection', autoFarm, farmCases, true);
const earlyExpiry = structuredClone(farm.build);
earlyExpiry.model.income[0].pickupLifetimeSeconds = 0.001;
evaluate('BananaFarm', 'premature-expiry', earlyExpiry, farmCases, true);

const village = await source('MonkeyVillage');
const support = village.build.model.support;
if (
  support.length !== 1 ||
  support[0].radius !== 40 ||
  support[0].rangeMultiplier !== 0.1 ||
  support[0].rangeAdditive !== 0 ||
  support[0].global ||
  support[0].includesOwner ||
  support[0].stackGroup !== 'Range:Support'
)
  throw new Error('Village source premises changed. Re-review expected jobs.');
const recipient = {
  displayRange: 10,
  targeting: { modes: ['first'], default: 'first' },
  attacks: [
    {
      id: 'recipient-attack',
      delivery: 'contact',
      intervalSeconds: 1,
      reach: { kind: 'radius', radius: 10, throughWalls: false },
      detectsCamo: false,
      damage: 1,
      pierce: 1,
      projectiles: 1,
      immuneTo: []
    }
  ],
  abilities: [],
  actors: [],
  passiveSummons: [],
  income: [],
  support: []
};
const rangeCase = (id, x, radius, duplicate = false) => ({
  id,
  intendedJob:
    'Apply captured range support to the eligible distinct recipient, respecting unique stacking',
  evidence: village.evidence,
  recipient: { placementId: 'recipient', attackId: 'recipient-attack' },
  scenario: {
    durationSeconds: 1,
    targets: [],
    allies: [
      { id: 'recipient', x, y: 0, model: recipient },
      ...(duplicate ? [{ id: 'duplicate-village', x: 0, y: 0, model: village.build.model }] : [])
    ]
  },
  expected: { recipientRange: exact(radius) }
});
const villageCases = [
  rangeCase('colocated', 0, 11),
  rangeCase('inside-radius', 20, 11),
  rangeCase('outside-radius', 41, 10),
  rangeCase('unique-stack', 20, 11, true)
];
evaluate('MonkeyVillage', 'intact', village.build, villageCases, false);
const namedVillage = structuredClone(village.build);
namedVillage.model.support[0].id = 'renamed-support';
evaluate('MonkeyVillage', 'renamed', namedVillage, villageCases, false);
const noBuff = structuredClone(village.build);
noBuff.model.support[0].rangeMultiplier = 0;
// The unchanged duplicate source would conflict with this mutation's stack value, so isolate the single-source job.
evaluate('MonkeyVillage', 'zero-multiplier', noBuff, villageCases.slice(0, 3), true);
const noRadius = structuredClone(village.build);
noRadius.model.support[0].radius = 0;
evaluate(
  'MonkeyVillage',
  'radius-zero-colocated-control',
  noRadius,
  villageCases.slice(0, 1),
  false
);
evaluate(
  'MonkeyVillage',
  'radius-zero-distant-recipient',
  noRadius,
  villageCases.slice(1, 2),
  true
);
const global = structuredClone(village.build);
global.model.support[0].global = true;
evaluate('MonkeyVillage', 'incorrect-global-support', global, villageCases.slice(2, 3), true);

for (const tier of [1, 2]) {
  const engineer = await source('EngineerMonkey', [tier, 0, 0]);
  const summon = engineer.build.model.passiveSummons;
  const interval = tier === 1 ? 10 : 5;
  if (
    summon.length !== 1 ||
    summon[0].lifetimeSeconds !== 25 ||
    summon[0].intervalSeconds !== interval ||
    summon[0].startDelaySeconds !== 0
  )
    throw new Error('Engineer source premises changed. Re-review expected jobs.');
  const evidence = `${engineer.evidence} Source supplies producer interval and lifespan 25. First spawn at 0 is the local scheduling policy. A stationary immortal enemy exercises child attacks. The source producer targets a RandomPosition deployment point; placement eligibility, spawn geometry, parent removal and redeployment are outside these cases.`;
  const cases = [
    {
      id: 'before-first-expiry',
      intendedJob: 'Recurring sentry creation before the first lifespan ends',
      evidence,
      scenario: {
        durationSeconds: 24.999,
        targets: [{ id: 'eligible-target', x: 1, y: 0, health: 1e9, progress: 1, strength: 1 }]
      },
      expected: { actorCreates: exact(tier === 1 ? 3 : 5), actorExpires: exact(0) }
    },
    {
      id: 'after-first-expiry',
      intendedJob: 'The first sentry expires at 25 while recurring production continues',
      evidence,
      scenario: {
        durationSeconds: 25.001,
        targets: [{ id: 'eligible-target', x: 1, y: 0, health: 1e9, progress: 1, strength: 1 }]
      },
      expected: { actorCreates: exact(tier === 1 ? 3 : 6), actorExpires: exact(1) }
    }
  ];
  const family = `EngineerMonkey-${tier}00`;
  evaluate(family, 'intact', engineer.build, cases, false);
  const named = structuredClone(engineer.build);
  const oldId = named.model.passiveSummons[0].actorId;
  named.model.actors.find((actor) => actor.id === oldId).id = 'renamed-sentry';
  named.model.passiveSummons[0].actorId = 'renamed-sentry';
  evaluate(family, 'renamed-template-and-reference', named, cases, false);
  const expiresEarly = structuredClone(engineer.build);
  expiresEarly.model.passiveSummons[0].lifetimeSeconds = 1;
  evaluate(family, 'premature-actor-expiry', expiresEarly, cases, true);
  const slowCreation = structuredClone(engineer.build);
  slowCreation.model.passiveSummons[0].intervalSeconds *= 2;
  evaluate(family, 'incorrect-production-interval', slowCreation, cases, true);
}

const report = {
  schemaVersion: 'shared-reference-job-review/0.1',
  createdAt: new Date().toISOString(),
  snapshotId: manifest.snapshotId,
  evaluationPartition: 'development-all-exposed',
  liveGameParity: false,
  reviewer:
    'Independent agent arithmetic and lifecycle review; no human playtest or balance claim.',
  count: rows.length,
  agreements: rows.filter((r) => r.agreed).length,
  rows
};
await mkdir(dirname(resolve(destination)), { recursive: true });
await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  JSON.stringify({
    destination: resolve(destination),
    count: report.count,
    agreements: report.agreements
  })
);
if (report.agreements !== report.count) process.exitCode = 1;
