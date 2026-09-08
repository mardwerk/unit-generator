import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generate, schemaIssues } from '../../../packages/core/dist/index.js';
import { loadBundledDefinition } from '../../../packages/definitions/dist/index.js';
import {
  createPrototype,
  fragmentSchemas,
  inspectFragment,
  assemble,
  CALL_CEILING
} from './prototype.mjs';

const rawMarker = 'RAW_SOURCE_SENTINEL_DO_NOT_DUPLICATE';
const input = {
  subject: 'Workshop tester',
  knowledge: {
    schemaVersion: '0.2',
    status: 'success',
    subject: 'Workshop tester',
    sources: [
      {
        id: 'source-1',
        title: 'Original test description',
        content: rawMarker,
        origin: 'supplied',
        status: 'read',
        truncated: false,
        omissions: []
      }
    ],
    reused: true,
    grounding: 'grounded',
    gaps: [],
    knowledge: {
      subject: 'Workshop tester',
      identity: {
        status: 'resolved',
        name: 'Workshop tester',
        continuity: 'Test continuity',
        explanation: 'Offline original test subject.'
      },
      claims: [
        {
          text: 'The workshop tester fires timed metal shots with adjustable reach and force.',
          sourceIds: ['source-1'],
          kind: 'evidence'
        }
      ],
      gaps: []
    }
  }
};
const evidence = (targetId) => ({
  targetId,
  claimIds: ['c1'],
  adaptation: 'An original test trait becomes a bounded shot.',
  implementedBehavior: 'The declared operation changes the current attack value.',
  limitations: 'Offline contract example; no balance claim.'
});
const roster = {
  loop: 'Timed shots.',
  baseClaimIds: ['c1'],
  baseDesign: 'Declare b.attack with effect b.damage.',
  baseCollections: [],
  prominentMechanics: [],
  omissions: [],
  paths: ['p1', 'p2', 'p3'].map((id, i) => ({
    id,
    name: `Test path ${i + 1}`,
    summary: 'Develops one independent attack property.',
    claimIds: ['c1'],
    gameplay: 'A bounded numerical specialization for assembly tests.',
    tradeoff: 'Leaves other properties unchanged.',
    sharedWrites: [
      ['b.attack/action/cooldownSeconds'],
      ['b.attack/action/rangeWorldUnits'],
      ['b.attack/effect/b.damage/amountHitPoints']
    ][i],
    ownedMechanics: [],
    collections: []
  }))
};
const attack = {
  id: 'b.attack',
  name: 'Test shot',
  summary: 'Deals 10 damage once per second.',
  unlockedByDefault: true,
  tags: [],
  trigger: { type: 'interval', intervalSeconds: 0.15 },
  targeting: {
    id: 'b.targeting',
    type: 'first',
    maximumTargets: 1,
    includeTags: [],
    excludeTags: []
  },
  delivery: { id: 'b.delivery', type: 'direct-strike', maximumTargetsPerProjectile: 1 },
  timing: { cooldownSeconds: 1, windupSeconds: 0, rateScope: 'aggregate' },
  rangeWorldUnits: 20,
  emitters: [{ id: 'b.emitter', emitterCount: 1, projectilesPerCycle: 1 }],
  effects: [{ id: 'b.damage', type: 'damage', amountHitPoints: 10, damageType: 'physical' }],
  conditions: [],
  resourceCosts: [],
  stateInteractions: []
};
const fragments = {
  base: {
    unit: {
      schemaVersion: '0.1',
      id: 'workshop-tester',
      name: 'Workshop tester',
      summary: 'A timed shot with independent upgrades.',
      roles: ['damage'],
      tags: [],
      placement: { footprintRadiusWorldUnits: 1, allowedSurfaces: ['land'], rules: [] },
      economy: { baseCostCredits: 500, costProfile: 'medium' },
      baseStats: { rangeWorldUnits: 20, durabilityHitPoints: 100 },
      requirements: { visuals: [], animations: [] }
    },
    actions: [attack],
    evidence: [evidence('workshop-tester'), evidence('b.attack')]
  }
};
for (const [i, plan] of roster.paths.entries()) {
  const nodes = Array.from({ length: 5 }, (_, t) => ({
    id: `${plan.id}.t${t + 1}`,
    name: `Test tier ${t + 1}`,
    summary: 'Changes its assigned attack property.',
    path: plan.id,
    tier: t + 1,
    costCredits: 100 * (t + 1),
    prerequisites: t ? [`${plan.id}.t${t}`] : [],
    operations: [
      i === 2
        ? {
            type: 'modify-effect',
            actionId: 'b.attack',
            effectId: 'b.damage',
            parameter: 'amountHitPoints',
            operation: 'set',
            value: 12 + 4 * t
          }
        : {
            type: 'modify-action',
            actionId: 'b.attack',
            parameter: i === 0 ? 'cooldownSeconds' : 'rangeWorldUnits',
            operation: 'set',
            value: i === 0 ? 0.9 - t * 0.1 : 22 + 2 * t
          }
    ],
    tags: ['damage']
  }));
  fragments[plan.id] = {
    path: { id: plan.id, name: plan.name, summary: plan.summary },
    nodes,
    evidence: [evidence(plan.id), ...nodes.map((n) => evidence(n.id))]
  };
}
// A path-owned declaration proves concatenation and dependency unlocking, not just node merging.
fragments.p3.actions = [
  {
    ...structuredClone(attack),
    id: 'p3.shot',
    unlockedByDefault: false,
    targeting: { ...attack.targeting, id: 'p3.targeting' },
    delivery: { ...attack.delivery, id: 'p3.delivery' },
    emitters: [{ ...attack.emitters[0], id: 'p3.emitter' }],
    effects: [{ ...attack.effects[0], id: 'p3.damage' }]
  }
];
fragments.p3.nodes[2].operations.push({ type: 'enable-action', actionId: 'p3.shot' });
fragments.p3.evidence.push(evidence('p3.shot'));

const results = [];
async function runCase(name, mode = 'normal', maxModelCalls = 7) {
  const calls = [],
    def = await createPrototype();
  const result = await generate(def, input, {
    limits: { maxModelCalls, maxRepairs: 1 },
    model: {
      async generate(call) {
        calls.push(call);
        assert(
          !JSON.stringify(call).includes(rawMarker),
          'Raw sources leaked into a model prompt.'
        );
        let value;
        if (call.stage === 'staged-roster') {
          value = structuredClone(roster);
          if (mode === 'seven') delete value.loop;
          if (mode === 'conflict') value.paths[1].sharedWrites = value.paths[0].sharedWrites;
        } else if (call.stage === 'roster-fragment-repair') {
          value = structuredClone(roster);
          if (mode === 'conflict') value.paths[1].sharedWrites = value.paths[0].sharedWrites;
        } else if (call.stage === 'staged-assembly-repair')
          value = {
            changes: [{ owner: 'base', pointer: '/unit/economy/baseCostCredits', value: 500 }],
            explanation: 'Restore the required medium placement band.'
          };
        else {
          const owner = call.stage.replace('staged-', '').replace('-fragment-repair', '');
          value = structuredClone(fragments[owner]);
          if (owner === 'base' && mode === 'seven') value.unit.economy.baseCostCredits = 50;
          if (owner === 'p1' && mode === 'bad-fragment')
            value.nodes[0].operations[0].actionId = 'p2.foreign';
        }
        if (!['conflict', 'bad-fragment', 'seven'].includes(mode)) {
          const issues = schemaIssues(call.schema, value);
          if (issues.length) console.error(call.stage, issues);
          assert.deepEqual(issues, [], `Fake ${call.stage} must satisfy projected schema.`);
        }
        return { value, mode: 'fixture', model: 'offline-fake' };
      }
    }
  });
  assert.equal(result.metadata.modelCalls, calls.length);
  assert(calls.length <= CALL_CEILING);
  results.push({
    name,
    status: result.status,
    calls: calls.length,
    repairs: result.metadata.repairs,
    error: result.error,
    promptBytes: calls.map((c) => ({
      stage: c.stage,
      schema: JSON.stringify(c.schema).length,
      input: JSON.stringify(c.input).length
    }))
  });
  return { result, calls };
}

const standard = await runCase('five calls merge through unchanged real validators');
assert.equal(standard.result.status, 'success', JSON.stringify(standard.result, null, 2));
assert.equal(standard.calls.length, 5);
assert.equal(standard.result.output.actions.length, 2);
assert.equal(standard.result.output.upgradeGraph.nodes.length, 15);
assert.deepEqual(standard.result.output, assemble(fragments));
const original = await loadBundledDefinition(),
  prototype = await createPrototype();
assert.deepEqual(prototype.outputSchema, original.outputSchema);
assert.deepEqual(prototype.validation.checks, original.validation.checks);
const conflict = await runCase('duplicate ownership rejected before generation', 'conflict');
assert.equal(conflict.result.error?.code, 'invalid-fragment');
assert.equal(conflict.calls.length, 2);
const malformed = await runCase(
  'cross-path dependency rejected after one correction',
  'bad-fragment'
);
assert.equal(malformed.result.error?.code, 'invalid-fragment');
assert.equal(malformed.calls.length, 4);
const seven = await runCase('one fragment correction plus outer repair stays at seven', 'seven');
assert.equal(seven.result.status, 'success', JSON.stringify(seven.result, null, 2));
assert.equal(seven.calls.length, 7);
assert.equal(seven.result.metadata.repairs, 1);
const budget = await runCase('core budget stops fifth adapter call', 'normal', 4);
assert.equal(budget.result.error?.code, 'model-call-limit');
assert.equal(budget.calls.length, 4);
const schemas = fragmentSchemas(prototype.outputSchema),
  claims = [{ id: 'c1' }];
const bad = structuredClone(fragments.p1);
bad.nodes[0].operations[0].parameter = 'rangeWorldUnits';
assert(
  inspectFragment('p1', bad, roster, claims, schemas).some((i) => i.code === 'write-ownership')
);
const emptyEvidence = structuredClone(fragments.p1);
emptyEvidence.evidence.pop();
assert(
  inspectFragment('p1', emptyEvidence, roster, claims, schemas).some(
    (i) => i.code === 'evidence-missing'
  )
);
const dir = fileURLToPath(new URL('./offline/', import.meta.url));
await mkdir(dir, { recursive: true });
await writeFile(
  `${dir}/smoke-report.json`,
  JSON.stringify(
    {
      cases: results,
      additionalChecks: [
        'output schema unchanged',
        'unassigned shared write rejected',
        'missing evidence link rejected',
        'raw source sentinel absent from every call'
      ]
    },
    null,
    2
  ) + '\n'
);
console.log(
  JSON.stringify(
    results.map(({ name, status, calls }) => ({ name, status, calls })),
    null,
    2
  )
);
