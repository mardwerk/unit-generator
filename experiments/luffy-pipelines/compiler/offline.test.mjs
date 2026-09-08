import assert from 'node:assert/strict';
import test from 'node:test';
import { generate, validate, accepted } from '../../../packages/core/dist/index.js';
import { loadBundledDefinition } from '../../../packages/definitions/dist/index.js';
import { createPrototype, lowerIR } from './prototype.mjs';
const subject = 'Training construct';
const knowledge = {
  schemaVersion: '0.2',
  status: 'success',
  subject,
  reused: false,
  grounding: 'original-concept',
  gaps: [],
  sources: [],
  knowledge: {
    subject,
    identity: {
      status: 'resolved',
      name: subject,
      continuity: 'Original',
      explanation: 'Offline test.'
    },
    claims: [
      {
        text: 'A construct emits bolts, ground waves, and a bright pulse.',
        sourceIds: [],
        kind: 'original-concept'
      }
    ],
    gaps: []
  }
};
const input = { subject, kind: 'original', knowledge };
export function fixture() {
  return {
    name: subject,
    summary: 'A configurable training weapon.',
    roles: ['damage'],
    placementCost: 500,
    baseRange: 30,
    actions: ['projectile', 'line-strike', 'aura'].map((delivery, i) => ({
      name: `Attack ${i}`,
      summary: 'Deals damage.',
      claims: [0],
      enabled: i === 0,
      trigger: 'interval',
      cooldown: 1,
      windup: 0,
      range: 20 + i * 5,
      targeting: 'first',
      targets: i + 1,
      delivery,
      pierce: i + 1,
      shots: i + 1,
      speed: i === 0 ? 50 : 0,
      radius: i === 2 ? 4 : 0,
      lifetime: 0,
      effects: [{ kind: 'damage', amount: 10, damageType: 'physical' }]
    })),
    paths: [0, 1, 2].map((i) => ({
      name: `Choice ${i}`,
      summary: 'Improves one attack.',
      tiers: [0, 1, 2, 3, 4].map((t) => ({
        name: `Upgrade ${i}.${t}`,
        summary: t === 0 && i > 0 ? 'Enables an attack.' : 'Raises attack damage.',
        claims: [0],
        cost: (t + 1) * 200,
        changes: [
          {
            action: i,
            parameter: t === 0 && i > 0 ? 'enable' : 'damage',
            value: t === 0 && i > 0 ? 1 : 15 + t * 5
          }
        ]
      }))
    })),
    omissions: []
  };
}
test('lowered fixture passes real core and bundled trusted validation unchanged', async () => {
  const base = await loadBundledDefinition();
  const definition = await createPrototype();
  assert.deepEqual(definition.outputSchema, base.outputSchema);
  assert.deepEqual(definition.validation.checks, base.validation.checks);
  assert.deepEqual(
    definition.preflight({ constraints: { allowedMechanics: ['status'] } }),
    base.preflight({ constraints: { allowedMechanics: ['status'] } })
  );
  const lowered = lowerIR(fixture(), knowledge.knowledge);
  const report = await validate(definition, lowered.candidate, input);
  assert.equal(accepted(report), true, JSON.stringify(report));
  assert.equal(lowered.mappings.length, 18);
  assert.deepEqual(
    lowered.candidate.actions.map((a) => a.delivery.type),
    ['projectile', 'line-strike', 'aura']
  );
  assert.deepEqual(
    lowered.candidate.actions.map((a) => a.rangeWorldUnits),
    [20, 25, 30]
  );
  assert.deepEqual(
    lowered.candidate.actions.map((a) => a.emitters[0].projectilesPerCycle),
    [1, 2, 3]
  );
});
test('invalid structure, nonexistent action/claim and cross-path writes fail without correction', () => {
  assert.throws(() => lowerIR({}, knowledge.knowledge));
  for (const mutate of [
    (ir) => (ir.paths[0].tiers[0].changes[0].action = 7),
    (ir) => (ir.actions[0].claims = [1]),
    (ir) => (ir.paths[1].tiers[2].changes[0].action = 0)
  ]) {
    const ir = fixture();
    mutate(ir);
    assert.throws(
      () => lowerIR(ir, knowledge.knowledge),
      (e) => e.issues.length > 0
    );
  }
});
test('core execution uses one successful call, targeted IR repair, or stops after exactly three', async () => {
  for (const scenario of ['valid', 'repairable', 'invalid']) {
    const calls = [];
    const result = await generate(await createPrototype(), input, {
      policy: { network: 'deny', discovery: false },
      limits: { maxModelCalls: 6 },
      model: {
        async generate(call) {
          calls.push(call);
          return {
            mode: 'fixture',
            value:
              scenario === 'valid' || (scenario === 'repairable' && calls.length === 2)
                ? fixture()
                : {}
          };
        }
      }
    });
    assert.equal(
      result.status,
      scenario === 'invalid' ? 'failed' : 'success',
      JSON.stringify(result.error)
    );
    assert.equal(result.metadata.modelCalls, { valid: 1, repairable: 2, invalid: 3 }[scenario]);
    assert.equal(result.research[0].reused, true);
    if (calls.length > 1) assert.ok(calls[1].input.issues.length);
  }
});
test('manual unlock lowers to action enable and ability grant and validates', async () => {
  const ir = fixture();
  ir.actions[2].trigger = 'manual';
  const { candidate } = lowerIR(ir, knowledge.knowledge);
  assert.deepEqual(
    candidate.upgradeGraph.nodes[10].operations.map((o) => o.type),
    ['enable-action', 'grant-ability']
  );
  const report = await validate(await createPrototype(), candidate, input);
  assert.equal(accepted(report), true, JSON.stringify(report));
});
test('profile failures survive lowering and are repaired only by model', async () => {
  const ir = fixture();
  ir.paths[0].tiers[0].changes = [{ action: 0, parameter: 'range', value: 500 }];
  const calls = [];
  const result = await generate(await createPrototype(), input, {
    policy: { network: 'deny', discovery: false },
    limits: { maxModelCalls: 6 },
    model: {
      async generate(call) {
        calls.push(call);
        return { mode: 'fixture', value: calls.length === 1 ? ir : fixture() };
      }
    }
  });
  assert.equal(result.status, 'success', JSON.stringify(result.error));
  assert.ok(calls[1].input.issues.some((i) => i.message.includes('80')));
  assert.equal(result.output.upgradeGraph.nodes[0].operations[0].type, 'modify-effect');
});

test('exhausted repairs retain the last lowered candidate and its validation issues after three calls', async () => {
  const ir = fixture();
  ir.paths[0].tiers[0].changes = [{ action: 0, parameter: 'range', value: 500 }];
  let calls = 0;
  const result = await generate(await createPrototype(), input, {
    policy: { network: 'deny', discovery: false },
    limits: { maxModelCalls: 6 },
    model: {
      async generate() {
        calls++;
        return { mode: 'fixture', value: calls === 1 ? ir : {} };
      }
    }
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.metadata.modelCalls, 3);
  assert.deepEqual(result.candidate, lowerIR(ir, knowledge.knowledge).candidate);
  assert.deepEqual(result.design.ir, ir);
  assert.equal(result.validation.system.status, 'failed');
  assert.ok(result.design.issues.some((i) => i.message.includes('80')));
  assert.ok(result.design.exhaustedRepairIssues.length);
  assert.equal(result.output, undefined);
});
