import assert from 'node:assert/strict';
import test from 'node:test';
import { generate } from '../../../packages/core/dist/index.js';
import { classicFixture, loadBundledDefinition } from '../../../packages/definitions/dist/index.js';
import { createPrototype } from './prototype.mjs';
import { evaluateCandidate } from './evaluate.mjs';

const subject = 'Clockwork sentry';
const knowledge = {
  schemaVersion: '0.2',
  status: 'success',
  subject,
  reused: false,
  grounding: 'grounded',
  gaps: [],
  sources: [
    {
      id: 'test-source',
      title: 'Test source',
      content: 'Clockwork sentry fires measured pulses.',
      origin: 'supplied',
      status: 'read',
      truncated: false,
      omissions: []
    }
  ],
  knowledge: {
    subject,
    identity: {
      status: 'resolved',
      name: subject,
      continuity: 'Test continuity',
      explanation: 'Offline fixture.'
    },
    claims: [
      {
        text: 'Clockwork sentry fires measured pulses.',
        sourceIds: ['test-source'],
        kind: 'evidence'
      }
    ],
    gaps: []
  }
};
const input = {
  subject,
  kind: 'character',
  continuity: 'Test continuity',
  knowledge,
  intent: 'Keep the requested intent sentinel.',
  context: { sentinel: 'request-context' },
  constraints: { noManualAbilities: true }
};

test('fake context preserves request and evidence without examples or extra calls', async () => {
  const definition = await createPrototype();
  const base = await loadBundledDefinition();
  assert.deepEqual(definition.outputSchema, base.outputSchema);
  assert.deepEqual(definition.configuration, base.configuration);
  assert.deepEqual(definition.validation.checks, base.validation.checks);
  assert.equal(definition.repairAttempts, 1);
  assert.deepEqual(definition.examples, []);
  const calls = [];
  let researchCalls = 0;
  const fixture = classicFixture(input);
  const result = await definition.run(input, {
    signal: new AbortController().signal,
    policy: { network: 'deny', discovery: false, followLinks: false, allowUngrounded: false },
    progress() {},
    async research(request) {
      researchCalls++;
      assert.deepEqual(request.knowledge, knowledge);
      return knowledge;
    },
    async model(call) {
      calls.push(call);
      return fixture;
    }
  });
  assert.equal(researchCalls, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.request.subject, input.subject);
  assert.equal(calls[0].input.request.intent, input.intent);
  assert.deepEqual(calls[0].input.request.constraints, input.constraints);
  assert.deepEqual(calls[0].input.request.context, input.context);
  assert.deepEqual(calls[0].input.knowledge, knowledge.knowledge);
  assert.deepEqual(result.candidate, fixture);
});

test('actual core runner accepts one draft and repairs once when necessary', async () => {
  const definition = await createPrototype();
  const fixture = classicFixture(input);
  for (const scenario of ['valid', 'repairable', 'unrepairable']) {
    const calls = [];
    const result = await generate(definition, input, {
      policy: { network: 'deny', discovery: false },
      limits: { maxModelCalls: 2, maxRepairs: 9 },
      model: {
        async generate(call) {
          calls.push(call);
          if (call.stage === 'repair') {
            assert.deepEqual(call.input.request, input);
            assert.ok(call.input.issues.length > 0);
          }
          return {
            mode: 'fixture',
            value:
              scenario === 'valid' || (scenario === 'repairable' && call.stage === 'repair')
                ? fixture
                : {}
          };
        }
      }
    });
    assert.equal(result.metadata.modelCalls, scenario === 'valid' ? 1 : 2);
    assert.equal(result.metadata.repairs, scenario === 'valid' ? 0 : 1);
    assert.equal(
      result.status,
      scenario === 'unrepairable' ? 'failed' : 'success',
      JSON.stringify(result.error)
    );
    assert.equal(result.research[0].reused, true);
    assert.deepEqual(
      calls.map((call) => call.stage),
      scenario === 'valid' ? ['draft'] : ['draft', 'repair']
    );
  }
});

test('absent shared research fails without spending a model call', async () => {
  const request = { ...input };
  delete request.knowledge;
  const result = await generate(await createPrototype(), request, {
    model: {
      async generate() {
        assert.fail('Unexpected model call');
      }
    }
  });
  assert.equal(result.error.code, 'shared-knowledge-required');
  assert.equal(result.metadata.modelCalls, 0);
});

test('diagnostics expose evidence and actual operations without aggregate scores', () => {
  const result = evaluateCandidate(classicFixture(input), { input });
  assert.equal(result.claims.length, 1);
  assert.equal(result.paths.length, 3);
  assert.equal(result.paths.flatMap((path) => path.tiers).length, 15);
  assert.ok(result.paths.every((path) => path.operationKinds.length));
  assert.ok(result.actions.length);
  assert.equal(result.score, undefined);
});
