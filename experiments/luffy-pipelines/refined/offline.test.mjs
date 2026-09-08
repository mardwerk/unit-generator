import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, schemaIssues } from '../../../packages/core/dist/index.js';
import { classicFixture, loadBundledDefinition } from '../../../packages/definitions/dist/index.js';
import { compileResolvedSelection } from '../../../packages/definitions/dist/diagnostics.js';
import { digest } from '../patch/patch.mjs';
import { createPrototype, boundedFeasibilitySchema, upgradeVocabulary } from './prototype.mjs';

const subject = 'Clockwork sentry';
const input = {
  subject,
  kind: 'original',
  intent: 'Six mutually exclusive runtime modes unlock attacks.',
  knowledge: {
    schemaVersion: '0.2',
    status: 'success',
    subject,
    sources: [],
    reused: false,
    grounding: 'original-concept',
    gaps: [],
    knowledge: {
      subject,
      identity: {
        status: 'resolved',
        name: subject,
        continuity: 'Original',
        explanation: 'Offline fixture.'
      },
      claims: [
        {
          text: 'A clockwork sentry fires measured pulses.',
          sourceIds: [],
          kind: 'original-concept'
        }
      ],
      gaps: []
    }
  }
};
const unit = classicFixture(input);
const base = await loadBundledDefinition();
const plan = {
  identity: 'Measured pulses',
  requests: [
    {
      requirement: input.intent,
      status: 'adapted',
      treatment: 'Select a small encounter form subset.',
      limitation:
        'Runtime switching and mutual exclusion are unavailable; six declarations exceed the prominent mechanic budget.',
      claimIndices: []
    }
  ],
  baseAttack: {
    description: 'Measured pulse',
    delivery: 'projectile',
    rangeWorldUnits: 30,
    claimIndices: [0]
  },
  paths: ['Damage', 'Coverage', 'Burst'].map((name) => ({
    name,
    role: name,
    ownedProperties: [name],
    progression: ['First change', 'Second change', 'Third change', 'Fourth change', 'Final change'],
    claimIndices: [0]
  })),
  mechanics: [
    { name: 'Encounter setup', kind: 'form', implementation: 'One external form', claimIndices: [] }
  ],
  omissions: [
    {
      sourceTrait: 'Six runtime modes',
      reason: 'Unsupported semantics and declaration count.',
      claimIndices: []
    }
  ],
  uncertainties: []
};
const finding = {
  kind: 'validation-error',
  candidatePaths: ['/economy/baseCostCredits'],
  sourceClaimIndices: [],
  evidence: 'Cost is outside the medium placement band.',
  change: 'Use 600 credits.'
};
const proposal = (candidate, edits = []) => ({
  baseDigest: digest(candidate),
  findings: edits.length ? [finding] : [],
  edits,
  uncertainties: []
});
const edit = (value) => ({
  op: 'replace',
  path: '/economy/baseCostCredits',
  valueJson: JSON.stringify(value),
  findingIndices: [0]
});

async function runCase(t, responses) {
  const artifactDir = await mkdtemp(fileURLToPath(new URL('./test-artifacts-', import.meta.url)));
  t.after(() => rm(artifactDir, { recursive: true, force: true }));
  const definition = await createPrototype({ artifactDir });
  const calls = [];
  const result = await generate(definition, input, {
    policy: { network: 'deny', discovery: false },
    limits: { maxModelCalls: 5, maxRepairs: 10 },
    model: {
      async generate(call) {
        calls.push(call);
        assert.ok(responses.length, 'Unexpected extra call');
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return { mode: 'fixture', value: structuredClone(response) };
      }
    }
  });
  return {
    result,
    calls,
    definition,
    artifact: async (name) => JSON.parse(await readFile(join(artifactDir, name + '.json'), 'utf8'))
  };
}

test('normal full-DSL run uses three calls and retains feasibility and vocabulary', async (t) => {
  const { result, calls, definition } = await runCase(t, [plan, unit, proposal(unit)]);
  assert.equal(result.status, 'success', JSON.stringify(result.error));
  assert.deepEqual(
    calls.map((c) => c.stage),
    ['feasibility', 'draft', 'review-patch']
  );
  assert.deepEqual(result.output, unit);
  assert.deepEqual(definition.outputSchema, base.outputSchema);
  assert.deepEqual(result.design.feasibility.plan, plan);
  assert.equal(result.design.callBudget.maximum, 5);
  assert.equal(result.design.feasibilityAttempts.length, 1);
  for (const call of calls) {
    assert.ok(call.input.upgradeVocabulary.operations.length);
    assert.match(call.instructions, /Neither implements a projectile speed upgrade/u);
  }
});

test('invalid source index gets one targeted correction preserving original and errors', async (t) => {
  const bad = structuredClone(plan);
  bad.baseAttack.claimIndices = [78];
  const { result, calls, artifact } = await runCase(t, [bad, plan, unit, proposal(unit)]);
  assert.equal(result.status, 'success', JSON.stringify(result.error));
  assert.deepEqual(
    calls.map((c) => c.stage),
    ['feasibility', 'feasibility-repair', 'draft', 'review-patch']
  );
  assert.deepEqual(calls[1].input.previousFeasibility, bad);
  assert.ok(calls[1].input.feasibilityErrors.some((issue) => issue.path.includes('claimIndices')));
  assert.equal(calls[1].input.sourceClaims[0].index, 0);
  assert.deepEqual(await artifact('refined-feasibility-0-raw'), bad);
  assert.deepEqual(await artifact('refined-feasibility-1-raw'), plan);
  assert.deepEqual(result.design.feasibility.plan, plan);
  assert.equal(result.design.feasibilityAttempts.length, 2);
});

test('schema failure followed by valid plan and outer repair stays within five calls', async (t) => {
  const badPlan = structuredClone(plan);
  delete badPlan.identity;
  const badUnit = structuredClone(unit);
  badUnit.economy.baseCostCredits = 100;
  const { result, calls } = await runCase(t, [
    badPlan,
    plan,
    badUnit,
    proposal(badUnit),
    proposal(badUnit, [edit(600)])
  ]);
  assert.equal(result.status, 'success', JSON.stringify(result.error));
  assert.equal(calls.length, 5);
  assert.deepEqual(
    calls.map((c) => c.stage),
    ['feasibility', 'feasibility-repair', 'draft', 'review-patch', 'repair']
  );
  assert.equal(result.metadata.modelCalls, 5);
  assert.equal(result.metadata.repairs, 1);
  assert.equal(result.design.repair.status, 'applied');
});

test('exhausted source correction fails with two retained attempts and no draft', async (t) => {
  const bad = structuredClone(plan);
  bad.baseAttack.claimIndices = [78];
  const { result, calls, artifact } = await runCase(t, [bad, bad]);
  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'feasibility-repair-exhausted');
  assert.deepEqual(
    calls.map((c) => c.stage),
    ['feasibility', 'feasibility-repair']
  );
  assert.equal((await artifact('refined-feasibility-attempts')).length, 2);
  assert.deepEqual(await artifact('refined-feasibility-1-raw'), bad);
});

test('every source reference is schema-bounded, including zero available claims', () => {
  const schema = boundedFeasibilitySchema(1);
  assert.equal(schemaIssues(schema, plan).length, 0);
  for (const selector of [
    (p) => p.requests[0],
    (p) => p.baseAttack,
    (p) => p.paths[0],
    (p) => p.mechanics[0],
    (p) => p.omissions[0]
  ]) {
    const bad = structuredClone(plan);
    selector(bad).claimIndices = [1];
    assert.ok(schemaIssues(schema, bad).length);
  }
  const empty = structuredClone(plan);
  for (const row of [
    ...empty.requests,
    empty.baseAttack,
    ...empty.paths,
    ...empty.mechanics,
    ...empty.omissions
  ])
    row.claimIndices = [];
  assert.equal(schemaIssues(boundedFeasibilitySchema(0), empty).length, 0);
  empty.baseAttack.claimIndices = [0];
  assert.ok(schemaIssues(boundedFeasibilitySchema(0), empty).length);
});

test('schema vocabulary excludes speed mutation and real compiled shots do not change travel speed', () => {
  const vocabulary = upgradeVocabulary(base.outputSchema);
  const action = vocabulary.operations.find((operation) => operation.type === 'modify-action');
  assert.deepEqual(action.parameters, [
    'cooldownSeconds',
    'rangeWorldUnits',
    'emitterCount',
    'projectilesPerCycle',
    'maximumTargetsPerProjectile'
  ]);
  assert.equal(action.parameters.includes('projectileSpeedWorldUnitsPerSecond'), false);
  assert.ok(vocabulary.operations.some((operation) => operation.type === 'replace-action'));
  const before = compileResolvedSelection(unit, { upgradeIds: [], formIds: [] });
  const after = compileResolvedSelection(unit, {
    upgradeIds: ['force-1', 'force-2', 'force-3', 'force-4', 'force-5'],
    formIds: []
  });
  assert.equal(before.ok, true, JSON.stringify(before));
  assert.equal(after.ok, true, JSON.stringify(after));
  const first = before.build.actions.find((a) => a.id === 'primary');
  const last = after.build.actions.find((a) => a.id === 'primary');
  assert.equal(first.emitters[0].projectilesPerCycle, 1);
  assert.equal(last.emitters[0].projectilesPerCycle, 2);
  assert.equal(
    last.delivery.projectileSpeedWorldUnitsPerSecond,
    first.delivery.projectileSpeedWorldUnitsPerSecond
  );
});
