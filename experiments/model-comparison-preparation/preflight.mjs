// Offline planning only. This module imports no provider, credentials or network client.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
if (args.some((arg) => !['--check', '--require-ready', '--matrix'].includes(arg))) {
  console.error(
    'Only --check, --matrix and --require-ready are supported. This preparation tool cannot run live calls.'
  );
  process.exit(2);
}
const study = JSON.parse(await readFile(new URL('./study.json', import.meta.url), 'utf8'));
const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};
for (const record of [
  study.evaluation.rubricFreeze,
  study.directionFreeze.explicit,
  study.directionFreeze['withheld-direction']
]) {
  const bytes = await readFile(new URL(record.path, import.meta.url));
  expect(
    createHash('sha256').update(bytes).digest('hex') === record.sha256,
    `Frozen preparation artifact changed: ${record.path}`
  );
}
expect(study.liveExecutionEnabled === false, 'Preparation must keep liveExecutionEnabled false.');
expect(
  study.authorization.maxEstimatedUsdPerPrototype === 30,
  'Expected the accepted USD30 cap per prototype.'
);
expect(study.replicatesPerCell === 3, 'Changing repeat count requires a new protocol revision.');
expect(study.initialCasesPerLane === 1, 'This initial matrix reserves one case per lane.');
expect(
  study.prototypes.length === 2 && study.lanes.length === 2 && study.tracks.length === 2,
  'Expected two prototypes, two lanes and two tracks.'
);
expect(
  new Set(study.prototypes.map((p) => p.id)).size === study.prototypes.length,
  'Duplicate prototype IDs.'
);
for (const prototype of study.prototypes) {
  const expectedModel =
    prototype.id === 'astra-low-integrated'
      ? ['gpt-6-astra', 'low']
      : prototype.id === 'luna-high-standard'
        ? ['gpt-5.6-luna', 'high']
        : null;
  expect(
    expectedModel &&
      prototype.model === expectedModel[0] &&
      prototype.reasoning === expectedModel[1],
    `Unexpected model/reasoning contract for ${prototype.id}.`
  );
  expect(
    prototype.maximumRepairsPerAttempt === 1 &&
      Number.isInteger(prototype.maximumCallsPerAttempt) &&
      prototype.maximumCallsPerAttempt >= prototype.stages.length + 1,
    `Call bound disagrees with stages for ${prototype.id}.`
  );
}
const astra = study.prototypes.find((p) => p.id === 'astra-low-integrated');
expect(
  astra?.agentCount === 1 &&
    astra.executionDelegation === false &&
    astra.maximumCallsPerAttempt === astra.maximumResearchAndCreationCalls + 1,
  'Astra must remain one LOW agent with bounded research/creation turns and one possible repair.'
);
expect(
  study.lanes.every((lane) => lane.initialSubject === 'Monkey D. Luffy'),
  'Both initial lanes must generate Luffy.'
);
expect(
  study.futureImageResearchContract.minimumImages === 2 &&
    study.futureImageResearchContract.maximumImages === 6 &&
    study.futureImageResearchContract.minimumFullBodyImages >= 1 &&
    study.futureImageResearchContract.generateImages === false,
  'Image research contract changed.'
);

const matrix = [];
let cellOrdinal = 0;
for (let repeat = 1; repeat <= study.replicatesPerCell; repeat++) {
  for (const lane of study.lanes) {
    for (const track of study.tracks) {
      const prototypes =
        (cellOrdinal++ + repeat - 1) % 2 === 0 ? study.prototypes : [...study.prototypes].reverse();
      for (const prototype of prototypes)
        matrix.push({
          runId: `${lane.id}-${track.id}-${prototype.id}-r${repeat}`,
          lane: lane.id,
          caseId: lane.initialCaseId,
          track: track.id,
          prototype: prototype.id,
          model: prototype.model,
          reasoning: prototype.reasoning,
          repeat,
          maximumCalls: prototype.maximumCallsPerAttempt,
          budgetAccount: prototype.id,
          executable: false
        });
    }
  }
}
const maximumCalls = matrix.reduce((sum, row) => sum + row.maximumCalls, 0);
expect(matrix.length === study.plannedAttempts, 'Planned attempt count does not match the matrix.');
expect(
  maximumCalls === study.plannedMaximumCalls,
  'Planned call ceiling does not match the matrix.'
);
expect(new Set(matrix.map((row) => row.runId)).size === matrix.length, 'Run IDs are not unique.');

const blockers = Object.entries(study.prerequisites)
  .filter(([, value]) => value !== true)
  .map(([key]) => key);
for (const lane of study.lanes) {
  for (const field of [
    'schemaVersion',
    'definitionFreeze',
    'behaviorProbeFreeze',
    'initialSubject',
    'sourcePacketFreeze'
  ]) {
    if (!lane[field]) blockers.push(`${lane.id}.${field}`);
  }
}
for (const prototype of study.prototypes) {
  for (const field of ['implementation', 'promptFreeze'])
    if (!prototype[field]) blockers.push(`${prototype.id}.${field}`);
  const prices = study.pricing[prototype.model];
  if (
    !prices?.source ||
    [
      'inputPerMillion',
      'outputPerMillion',
      'reservationInputPerMillion',
      'reservationOutputPerMillion'
    ].some((field) => !Number.isFinite(prices[field]) || prices[field] <= 0)
  )
    blockers.push(`${prototype.model}.verifiedPricing`);
}
for (const [section, fields] of [
  ['evidencePolicy', ['retrievalContractFreeze', 'familyPartitionFreeze', 'exposureAuditFreeze']],
  ['evaluation', ['rubricFreeze', 'reviewPacketFreeze']]
])
  for (const field of fields) if (!study[section][field]) blockers.push(`${section}.${field}`);
if (study.pricing.verificationStatus !== 'verified' || !study.pricing.verifiedAt)
  blockers.push('pricing.verification');
// There is intentionally no runner here, even if someone fills every preparation field.
blockers.push('live-execution-managed-by-separate-runner-stage-gates');

console.log(
  JSON.stringify(
    {
      studyId: study.studyId,
      mode: 'offline-preparation-only',
      manifestValid: errors.length === 0,
      liveReady: false,
      plannedAttempts: matrix.length,
      maximumCalls,
      perPrototype: study.prototypes.map((p) => ({
        id: p.id,
        attempts: matrix.filter((row) => row.prototype === p.id).length,
        maximumCalls: matrix
          .filter((row) => row.prototype === p.id)
          .reduce((sum, row) => sum + row.maximumCalls, 0),
        estimatedUsdCap: study.authorization.maxEstimatedUsdPerPrototype
      })),
      errors,
      blockers,
      ...(args.includes('--matrix') ? { matrix } : {})
    },
    null,
    2
  )
);
process.exitCode = errors.length ? 2 : args.includes('--require-ready') ? 1 : 0;
