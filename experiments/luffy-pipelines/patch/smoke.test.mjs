import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accepted, generate, validate } from '../../../packages/core/dist/index.js';
import { classicFixture, loadBundledDefinition } from '../../../packages/definitions/dist/index.js';
import { createPrototype } from './prototype.mjs';
import { allowedEdits, applyProposal, digest, LIMITS } from './patch.mjs';

const subject = 'Clockwork sentry';
const input = {
  subject,
  kind: 'original',
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
const valid = classicFixture(input);
const base = await loadBundledDefinition();
const options = { definition: base, input, claimCount: 1 };
const finding = {
  kind: 'validation-error',
  candidatePaths: ['/economy/baseCostCredits'],
  sourceClaimIndices: [],
  evidence: 'The default medium placement band is 450 to 750.',
  change: 'Use a cost within the band.'
};
const edit = (op, path, value) => ({
  op,
  path,
  valueJson: JSON.stringify(value),
  findingIndices: [0]
});
const proposal = (candidate, edits = [], findings = [finding]) => ({
  baseDigest: digest(candidate),
  findings,
  edits,
  uncertainties: []
});

test('a scalar cost correction passes real request validation without a full replacement', async () => {
  const draft = structuredClone(valid);
  draft.economy.baseCostCredits = 100;
  assert.equal(accepted(await validate(base, draft, input)), false);
  const result = await applyProposal(
    draft,
    proposal(draft, [edit('replace', '/economy/baseCostCredits', 600)]),
    options
  );
  assert.equal(result.status, 'applied', JSON.stringify(result.issues));
  assert.equal(result.candidate.economy.baseCostCredits, 600);
  assert.equal(draft.economy.baseCostCredits, 100);
  assert.equal(accepted(result.validation), true);
});

test('array append, removal and reference updates commit together using snapshot indices', async () => {
  const action = structuredClone(valid.actions[1]);
  action.id = 'replacement-sentinel';
  const edits = [edit('append', '/actions', action), edit('remove', '/actions/1', null)];
  for (let n = 0; n < valid.upgradeGraph.nodes.length; n++)
    for (let o = 0; o < valid.upgradeGraph.nodes[n].operations.length; o++)
      if (valid.upgradeGraph.nodes[n].operations[o].actionId === 'sentinel')
        edits.push(edit('replace', `/upgradeGraph/nodes/${n}/operations/${o}/actionId`, action.id));
  const result = await applyProposal(valid, proposal(valid, edits), options);
  assert.equal(result.status, 'applied', JSON.stringify(result.issues));
  assert.deepEqual(
    result.candidate.actions.map((a) => a.id),
    ['primary', 'surge', 'replacement-sentinel']
  );
  const broken = await applyProposal(
    valid,
    proposal(valid, [edit('remove', '/actions/1', null)]),
    options
  );
  assert.equal(broken.status, 'rejected');
  assert.ok(broken.issues.some((i) => /refer|action|unknown/iu.test(i.message)));
  assert.deepEqual(broken.candidate, valid);
});

test('validation failure and malformed second edit roll back the entire transaction', async () => {
  for (const bad of [
    edit('replace', '/actions/0/rangeWorldUnits', -3),
    edit('replace', '/missing', 12)
  ]) {
    const outcome = await applyProposal(
      valid,
      proposal(valid, [edit('replace', '/name', 'Edited name'), bad]),
      options
    );
    assert.equal(outcome.status, 'rejected');
    assert.deepEqual(outcome.candidate, valid);
    assert.equal(valid.name, subject);
  }
});

test('root, unknown, prototype, noncanonical, stale, overlapping and oversized proposals are rejected', async () => {
  const cases = [
    proposal(valid, [edit('replace', '', valid)]),
    proposal(valid, [edit('replace', '/actions', [])]),
    proposal(valid, [edit('replace', '/actions/999', {})]),
    proposal(valid, [edit('replace', '/actions/01/name', 'bad')]),
    proposal(valid, [edit('replace', '/__proto__/polluted', true)]),
    proposal(valid, [edit('replace', '/actions/0/constructor', {})]),
    proposal(valid, [
      {
        ...edit('replace', '/actions/0/delivery', null),
        valueJson: '{"__proto__":{"polluted":true}}'
      }
    ]),
    proposal(valid, [edit('replace', '/name', 'x'.repeat(LIMITS.valueBytes))]),
    proposal(valid, [
      edit('replace', '/actions/0', valid.actions[0]),
      edit('replace', '/actions/0/name', 'other')
    ]),
    { ...proposal(valid), baseDigest: '0'.repeat(64) },
    proposal(valid, [{ ...edit('replace', '/name', 'other'), op: 'copy' }]),
    proposal(valid, [edit('replace', '/name', 'other')], [{ ...finding, sourceClaimIndices: [1] }]),
    proposal(
      valid,
      [edit('replace', '/name', 'other')],
      [{ ...finding, kind: 'meaningful-omission' }]
    ),
    proposal(valid, [{ ...edit('replace', '/name', 'other'), findingIndices: [1] }]),
    proposal(
      valid,
      Array.from({ length: LIMITS.edits + 1 }, () => edit('append', '/tags', 'new'))
    ),
    proposal(
      valid,
      Array.from({ length: 4 }, () => edit('append', '/tags', 'x'.repeat(7000)))
    )
  ];
  for (const value of cases) {
    const outcome = await applyProposal(valid, value, options);
    assert.equal(outcome.status, 'rejected', JSON.stringify(value).slice(0, 200));
    assert.ok(outcome.issues.length);
    assert.deepEqual(outcome.candidate, valid);
  }
  assert.equal({}.polluted, undefined);
  assert.equal(allowedEdits(valid).replace.includes('/upgradeGraph'), false);
});

async function runCase(t, responses, limits = { maxModelCalls: 5, maxRepairs: 9 }) {
  const artifactDir = await mkdtemp(fileURLToPath(new URL('./test-artifacts-', import.meta.url)));
  t.after(() => rm(artifactDir, { recursive: true, force: true }));
  const definition = await createPrototype({ artifactDir });
  const stages = [];
  const result = await generate(definition, input, {
    policy: { network: 'deny', discovery: false },
    limits,
    model: {
      async generate(call) {
        stages.push(call.stage);
        assert.ok(responses.length, 'Unexpected extra model call');
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return { mode: 'fixture', value: structuredClone(response) };
      }
    }
  });
  return {
    result,
    stages,
    definition,
    artifact: async (name) => JSON.parse(await readFile(join(artifactDir, name + '.json'), 'utf8'))
  };
}

test('two-call run retains unchanged schema/checks and completed executable diagnostics', async (t) => {
  const { result, stages, definition, artifact } = await runCase(t, [
    valid,
    proposal(valid, [], [])
  ]);
  assert.equal(result.status, 'success', JSON.stringify(result.error));
  assert.deepEqual(stages, ['draft', 'review-patch']);
  assert.equal(result.metadata.modelCalls, 2);
  assert.equal(result.research[0].reused, true);
  assert.deepEqual(definition.outputSchema, base.outputSchema);
  assert.equal(definition.validation.validate.toString(), base.validation.validate.toString());
  const mechanical = await artifact('02-mechanical-review');
  assert.equal(mechanical.status, 'complete');
  assert.ok(mechanical.diagnostics);
  assert.ok(mechanical.simulations.length > 0);
});

test('damaging patch preserves valid draft and reports the rejected proposal explicitly', async (t) => {
  const patch = proposal(valid, [edit('replace', '/economy/baseCostCredits', 100)]);
  const { result, stages, artifact } = await runCase(t, [valid, patch]);
  assert.equal(result.status, 'success');
  assert.deepEqual(result.output, valid);
  assert.equal(result.design.review.status, 'rejected');
  assert.ok(result.design.review.issues.length);
  assert.deepEqual(await artifact('03-review-patch-proposal'), patch);
  assert.deepEqual(await artifact('03-review-patch-after'), valid);
  assert.equal(stages.length, 2);
});

test('invalid draft uses a bounded third-call outer repair and keeps before/after artifacts', async (t) => {
  const invalid = structuredClone(valid);
  invalid.economy.baseCostCredits = 100;
  const fix = proposal(invalid, [edit('replace', '/economy/baseCostCredits', 600)]);
  const { result, stages, artifact } = await runCase(t, [invalid, proposal(invalid, [], []), fix]);
  assert.equal(result.status, 'success', JSON.stringify(result.error));
  assert.deepEqual(stages, ['draft', 'review-patch', 'repair']);
  assert.equal(result.metadata.repairs, 1);
  assert.equal(result.metadata.modelCalls, 3);
  assert.equal(result.design.repair.status, 'applied');
  assert.equal((await artifact('02-mechanical-review')).status, 'unavailable');
  assert.equal((await artifact('04-repair-before')).candidate.economy.baseCostCredits, 100);
  assert.equal((await artifact('04-repair-after')).economy.baseCostCredits, 600);
});

test('unrepairable structure preserves partial candidate and stops after one repair', async (t) => {
  const invalid = {};
  const { result, stages } = await runCase(t, [
    invalid,
    proposal(invalid, [], []),
    proposal(invalid, [], [])
  ]);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.candidate, invalid);
  assert.equal(result.metadata.modelCalls, 3);
  assert.equal(result.metadata.repairs, 1);
  assert.deepEqual(stages, ['draft', 'review-patch', 'repair']);
});

test('review transport failures and caller call-budget exhaustion preserve the valid draft', async (t) => {
  for (const [responses, limits, status] of [
    [[valid, new Error('Gateway unavailable')], { maxModelCalls: 5 }, 'review-failed'],
    [[valid], { maxModelCalls: 1 }, 'review-failed']
  ]) {
    const { result } = await runCase(t, responses, limits);
    assert.equal(result.status, 'success', JSON.stringify(result.error));
    assert.deepEqual(result.output, valid);
    assert.equal(result.design.review.status, status);
    assert.ok(result.design.review.issues.length);
    assert.ok(result.metadata.modelCalls <= (limits.maxModelCalls ?? 5));
  }
});

test('shared research is required before any model call and base preflight is preserved', async () => {
  const definition = await createPrototype();
  const result = await generate(
    definition,
    { subject },
    {
      model: {
        generate() {
          assert.fail('Unexpected model call');
        }
      }
    }
  );
  assert.equal(result.status, 'failed');
  assert.equal(result.metadata.modelCalls, 0);
  assert.ok(
    definition
      .preflight({
        subject,
        knowledge: input.knowledge,
        constraints: { excludedMechanics: ['damage'] }
      })
      .some((issue) => issue.code === 'conflicting-constraint')
  );
});
