import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrototype, checkPlan } from './prototype.mjs';
import { evaluateCandidate } from './evaluate.mjs';
import { loadBundledDefinition } from '../../../packages/definitions/dist/index.js';
import { generate } from '../../../packages/core/dist/index.js';

const knowledge = {
  subject: 'Monkey D. Luffy',
  identity: {
    status: 'resolved',
    name: 'Monkey D. Luffy',
    continuity: 'supplied',
    explanation: 'Test source'
  },
  claims: [{ text: 'A supplied test claim.', sourceIds: ['s1'], kind: 'evidence' }],
  gaps: []
};
const rawSourceSentinel = 'RAW_SOURCE_MUST_NEVER_REACH_GENERATION';
const research = {
  schemaVersion: '0.2',
  status: 'success',
  subject: knowledge.subject,
  sources: [
    {
      id: 's1',
      title: 'Supplied',
      content: rawSourceSentinel,
      origin: 'supplied',
      status: 'read',
      truncated: false,
      omissions: []
    }
  ],
  knowledge,
  reused: true,
  grounding: 'grounded',
  gaps: []
};
const paths = (prefix) =>
  [1, 2, 3].map((n) => ({
    id: `${prefix}${n}`,
    name: `Path ${n}`,
    role: 'Test role',
    tradeoff: 'Test tradeoff'
  }));
const makePlan = () => ({
  identity: 'Test identity',
  sourceAnchors: [{ claimIndexes: [0], gameplayConnection: 'Test adaptation' }],
  alternatives: [
    { id: 'a', organizingPrinciple: 'Organization A', paths: paths('a') },
    { id: 'b', organizingPrinciple: 'Organization B', paths: paths('b') }
  ],
  selectedAlternativeId: 'b',
  selectionReason: 'Supplied intent',
  adaptations: [
    {
      claimIndexes: [0],
      decision: 'adapt',
      sourceTrait: 'Test trait',
      gameTreatment: 'Test treatment',
      contractReason: 'Test contract feasibility'
    }
  ],
  implementation: {
    loop: 'Test loop',
    limitsCheck: 'Test limits',
    paths: paths('b').map((p) => ({
      id: p.id,
      ownedProperties: ['test.cooldown'],
      requiredActionIds: [],
      tiers: [1, 2, 3, 4, 5].map((tier) => ({
        id: `${p.id}-t${tier}`,
        tier,
        change: 'Test change',
        contractOperations: ['modify-action']
      }))
    }))
  }
});

test('selection integrity and bounded public plan', () => {
  assert.equal(checkPlan(makePlan(), knowledge).selectedAlternativeId, 'b');
  const mismatch = makePlan();
  mismatch.implementation.paths[0].id = 'a1';
  assert.throws(() => checkPlan(mismatch, knowledge), /selected alternative/);
  const invalidClaim = makePlan();
  invalidClaim.sourceAnchors[0].claimIndexes = [3];
  assert.throws(() => checkPlan(invalidClaim, knowledge), /Unknown claim/);
  const tooLarge = makePlan();
  tooLarge.identity = 'x'.repeat(25000);
  assert.throws(() => checkPlan(tooLarge, knowledge), /limit/i);
});

test('forwards intent and evidence, retains selected plan, preserves contract', async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), 'luffy-plan-smoke-'));
  try {
    const definition = await createPrototype({ artifactDir });
    const base = await loadBundledDefinition();
    assert.deepEqual(definition.outputSchema, base.outputSchema);
    assert.deepEqual(definition.validation.checks, base.validation.checks);
    const input = {
      subject: knowledge.subject,
      knowledge: research,
      sources: [rawSourceSentinel],
      intent: 'Unique supplied intent sentinel'
    };
    const calls = [];
    const ctx = {
      research: async (request) => {
        assert.equal(request.knowledge, research);
        return research;
      },
      model: async (call) => {
        calls.push(call);
        return call.stage === 'plan' ? makePlan() : { invalidTestCandidate: true };
      }
    };
    const result = await definition.run(input, ctx);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.input.request.intent, input.intent);
      assert.deepEqual(call.input.knowledge, knowledge);
    }
    assert.deepEqual(
      calls[1].input.plan.alternatives.map((a) => a.id),
      ['b']
    );
    assert.equal(result.design.plan.alternatives.length, 2);
    assert.ok(Buffer.byteLength(JSON.stringify(result.design)) < 64 * 1024);
    assert.deepEqual(
      JSON.parse(await readFile(join(artifactDir, 'public-plan.json'), 'utf8')),
      result.design.plan
    );
    await definition.repair(result.candidate, [], input, ctx, result.design);
    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.equal(JSON.stringify(call).includes(rawSourceSentinel), false);
      assert.equal('knowledge' in call.input.request, false);
      assert.equal('sources' in call.input.request, false);
    }
    assert.deepEqual(
      calls[2].input.plan.alternatives.map((a) => a.id),
      ['b']
    );
    const report = evaluateCandidate(result.candidate, {
      research,
      input,
      plan: result.design.plan
    });
    assert.equal(report.findings.find((f) => f.check === 'selected-paths').status, 'failed');
    const coreResult = await generate(definition, input, {
      policy: { network: 'deny' },
      limits: { maxModelCalls: 3 },
      model: {
        generate: async (call) => ({
          value: call.stage === 'plan' ? makePlan() : { invalidTestCandidate: true },
          mode: 'json'
        })
      }
    });
    assert.equal(coreResult.status, 'failed');
    assert.equal(coreResult.metadata.modelCalls, 3);
    assert.equal(coreResult.metadata.repairs, 1);
    assert.equal(coreResult.validation.structure.status, 'failed');
  } finally {
    await rm(artifactDir, { recursive: true, force: true });
  }
});

test('requires shared successful knowledge before any research or model calls', async () => {
  const definition = await createPrototype();
  const ctx = {
    research: () => assert.fail('Unexpected research call'),
    model: () => assert.fail('Unexpected model call')
  };
  await assert.rejects(
    definition.run({ subject: knowledge.subject }, ctx),
    /shared ResearchResult/
  );
  await assert.rejects(
    definition.run(
      { subject: knowledge.subject, knowledge: { ...research, status: 'failed' } },
      ctx
    ),
    /shared ResearchResult/
  );
});
