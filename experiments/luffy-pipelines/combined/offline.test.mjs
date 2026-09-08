import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from '../../../packages/core/dist/index.js';
import { classicFixture, loadBundledDefinition } from '../../../packages/definitions/dist/index.js';
import { digest } from '../patch/patch.mjs';
import { createPrototype, checkFeasibility, effectiveLimits } from './prototype.mjs';

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
    limits: { maxModelCalls: 4, maxRepairs: 10 },
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

test('full schema and valid forms survive feasibility, draft and atomic review', async (t) => {
  assert.ok(unit.forms.length, 'Fixture needs a real form');
  const { result, calls, definition, artifact } = await runCase(t, [plan, unit, proposal(unit)]);
  assert.equal(result.status, 'success', JSON.stringify(result.error));
  assert.deepEqual(
    calls.map((c) => c.stage),
    ['feasibility', 'draft', 'review-patch']
  );
  assert.equal(calls[0].input.sourceClaims[0].index, 0);
  assert.equal(calls[0].input.sourceClaims[0].text, input.knowledge.knowledge.claims[0].text);
  assert.equal(result.metadata.modelCalls, 3);
  assert.equal(result.research.length, 1);
  assert.deepEqual(result.output, unit);
  assert.deepEqual(definition.outputSchema, base.outputSchema);
  assert.equal(definition.validation.validate.toString(), base.validation.validate.toString());
  assert.deepEqual(result.design.feasibility.plan.requests, plan.requests);
  assert.ok(calls[2].input.executionReview.formInventory.length);
  assert.equal((await artifact('00-feasibility')).effectiveLimits.maximumProminentMechanics, 3);
  assert.ok((await artifact('execution-final-draft')).coverage.compiledSelections.length);
  for (const call of calls) {
    assert.equal('knowledge' in call.input.request, false);
    assert.equal('sources' in call.input.request, false);
    assert.deepEqual(call.input.knowledge, input.knowledge.knowledge);
  }
});

test('invalid draft is repaired with a fourth atomic call and no validator change', async (t) => {
  const bad = structuredClone(unit);
  bad.economy.baseCostCredits = 100;
  const { result, calls } = await runCase(t, [
    plan,
    bad,
    proposal(bad),
    proposal(bad, [edit(600)])
  ]);
  assert.equal(result.status, 'success', JSON.stringify(result.error));
  assert.deepEqual(
    calls.map((c) => c.stage),
    ['feasibility', 'draft', 'review-patch', 'repair']
  );
  assert.equal(result.metadata.modelCalls, 4);
  assert.equal(result.metadata.repairs, 1);
  assert.equal(result.design.repair.status, 'applied');
  assert.equal(result.output.economy.baseCostCredits, 600);
  assert.deepEqual(calls[3].input.feasibility.plan.requests, plan.requests);
});

test('failed and damaging review preserve a valid full draft', async (t) => {
  for (const response of [new Error('Review transport failed'), proposal(unit, [edit(100)])]) {
    const { result, calls } = await runCase(t, [plan, unit, response]);
    assert.equal(result.status, 'success', JSON.stringify(result.error));
    assert.deepEqual(result.output, unit);
    assert.ok(['review-failed', 'rejected'].includes(result.design.review.status));
    assert.equal(calls.length, 3);
  }
});

test('exhausted repair retains invalid candidate and does not become success', async (t) => {
  const bad = structuredClone(unit);
  bad.economy.baseCostCredits = 100;
  const { result, calls } = await runCase(t, [plan, bad, proposal(bad), proposal(bad)]);
  assert.equal(result.status, 'failed');
  assert.equal(calls.length, 4);
  assert.deepEqual(result.candidate, bad);
});

test('effective limits respect request restrictions and expose exact counting semantics', () => {
  const defaults = effectiveLimits(base, {});
  assert.deepEqual(defaults.placementCostCredits, [450, 750]);
  assert.equal(defaults.maximumRangeWorldUnits, 80);
  assert.equal(defaults.maximumManualAbilities, 1);
  assert.equal(defaults.maximumProminentMechanics, 3);
  const configured = effectiveLimits(
    { configuration: { maxRange: 100, maxManualAbilities: 2, maxProminentMechanics: 4 } },
    {}
  );
  assert.equal(configured.maximumRangeWorldUnits, 100);
  assert.equal(configured.maximumManualAbilities, 2);
  assert.equal(configured.maximumProminentMechanics, 4);
  const limits = effectiveLimits(base, {
    constraints: { noManualAbilities: true, maxProminentMechanics: 1, placementCostBand: 'low' }
  });
  assert.equal(limits.maximumManualAbilities, 0);
  assert.equal(limits.maximumProminentMechanics, 1);
  assert.deepEqual(limits.placementCostCredits, [200, 400]);
  assert.match(limits.intervalCadence, /max\(trigger.intervalSeconds, timing.cooldownSeconds\)/u);
  const over = structuredClone(plan);
  over.mechanics = Array.from({ length: 6 }, (_, i) => ({
    ...plan.mechanics[0],
    name: `Form ${i}`
  }));
  const checked = checkFeasibility(over, input.knowledge.knowledge, limits);
  assert.equal(checked.planningIssues[0].code, 'planned-mechanic-limit');
  assert.equal(
    checked.plan.mechanics.length,
    6,
    'Preserve disclosed discrepancy rather than silently deleting intent'
  );
});

test('source index outside shared facts fails before drafting', async (t) => {
  const bad = structuredClone(plan);
  bad.baseAttack.claimIndices = [99];
  const { result, calls } = await runCase(t, [bad]);
  assert.equal(result.status, 'failed');
  assert.equal(calls.length, 1);
  assert.equal(result.error.code, 'invalid-feasibility-source');
});
