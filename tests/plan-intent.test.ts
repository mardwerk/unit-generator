import assert from 'node:assert/strict';
import test from 'node:test';
import { planIntentIssues } from '../src/core/blueprint/plan-intent.js';
import type { UnitDesignPlan } from '../src/core/blueprint/plan-schema.js';
import { designPlanSchema } from '../src/core/blueprint/plan-schema.js';
import {
  checkDraft,
  compileBlueprint,
  prepareRequest,
  definitionProgression,
  defaultMechanicsDefinition,
  type DraftArtifact,
} from '../src/core/index.js';
import { miraRequest } from './fixtures/core-fixtures.js';
import { referenceRecipes } from '../src/core/mechanics/reference-patterns.js';
import { defaultAuthoringDefinition } from '../src/core/default-profile.js';
import { pathKeys, tierKeys, type UnitBlueprint } from '../src/core/mechanics/schemas.js';

function fixture() {
  const blueprint = structuredClone(referenceRecipes[0]!.blueprint);
  const upgradeIntents = {} as NonNullable<UnitDesignPlan['upgradeIntents']>;
  for (const path of pathKeys) {
    upgradeIntents[path] = {} as NonNullable<UnitDesignPlan['upgradeIntents']>['path1'];
    for (const tier of tierKeys) {
      blueprint.paths[path].tiers[tier].changes = [
        { kind: 'stat', target: 'base', stat: 'damage', operation: 'add', value: 1 },
      ];
      upgradeIntents[path][tier] = { improves: ['damage'], unlock: 'none' };
    }
  }
  return { blueprint, plan: { upgradeIntents } };
}
function boost(blueprint: UnitBlueprint) {
  blueprint.paths.path2.tiers.tier4.changes = [
    {
      kind: 'unlockBoost',
      target: 'base',
      boost: {
        name: 'Burst',
        damageMultiplier: 2,
        intervalMultiplier: 0.8,
        durationSeconds: 8,
        cooldownSeconds: 30,
        rangeBonus: 0,
      },
    },
  ];
}

test('retained plans without typed intents stay compatible and inputs remain unchanged', () => {
  const { blueprint, plan } = fixture();
  const before = structuredClone({ blueprint, plan });
  assert.deepEqual(planIntentIssues(blueprint, {}, defaultAuthoringDefinition), []);
  assert.deepEqual(planIntentIssues(blueprint, plan, defaultAuthoringDefinition), []);
  assert.deepEqual({ blueprint, plan }, before);
});

test('range cannot replace promised damage, attack rate or stronger active output', () => {
  const { blueprint, plan } = fixture();
  boost(blueprint);
  plan.upgradeIntents.path2.tier4 = { improves: [], unlock: 'manual-boost' };
  plan.upgradeIntents.path2.tier5 = {
    improves: ['damage', 'attack-rate', 'active-damage'],
    unlock: 'none',
  };
  blueprint.paths.path2.tiers.tier5.changes = [
    { kind: 'stat', target: 'base', stat: 'range', operation: 'add', value: 8 },
  ];
  const issues = planIntentIssues(blueprint, plan, defaultAuthoringDefinition);
  assert.equal(issues.length, 3);
  for (const dimension of ['damage', 'attack-rate', 'active-damage'])
    assert.ok(issues.some((issue) => issue.message.includes(`improved ${dimension}`)));
  assert.ok(issues.every((issue) => issue.path === 'paths.path2.tiers.tier5.planIntent'));
});

test('small promised improvements pass without a universal ratio and may trade off unpromised stats', () => {
  const { blueprint, plan } = fixture();
  blueprint.paths.path1.tiers.tier5.changes = [
    { kind: 'stat', target: 'base', stat: 'damage', operation: 'multiply', value: 1.01 },
    { kind: 'stat', target: 'base', stat: 'range', operation: 'multiply', value: 0.5 },
  ];
  assert.deepEqual(planIntentIssues(blueprint, plan, defaultAuthoringDefinition), []);
});

test('active promises concern the same path and resolved boosted output', () => {
  const { blueprint, plan } = fixture();
  boost(blueprint);
  plan.upgradeIntents.path2.tier4 = { improves: [], unlock: 'manual-boost' };
  plan.upgradeIntents.path2.tier5 = { improves: ['active-damage'], unlock: 'none' };
  // A permanent damage purchase also genuinely strengthens the purchased active attack.
  assert.deepEqual(planIntentIssues(blueprint, plan, defaultAuthoringDefinition), []);
  plan.upgradeIntents.path1.tier5 = { improves: ['active-damage'], unlock: 'none' };
  assert.ok(
    planIntentIssues(blueprint, plan, defaultAuthoringDefinition).some(
      (issue) => issue.path === 'paths.path1.tiers.tier5.planIntent',
    ),
  );
});

test('promised improvements must survive legal crosspath purchases', () => {
  const { blueprint, plan } = fixture();
  blueprint.paths.path1.tiers.tier1.changes = [
    { kind: 'stat', target: 'base', stat: 'damage', operation: 'set', value: 5 },
    { kind: 'stat', target: 'base', stat: 'range', operation: 'add', value: 1 },
  ];
  blueprint.paths.path2.tiers.tier1.changes = [
    { kind: 'stat', target: 'base', stat: 'damage', operation: 'set', value: 10 },
  ];
  const issue = planIntentIssues(blueprint, plan, defaultAuthoringDefinition).find(
    (entry) => entry.path === 'paths.path1.tiers.tier1.planIntent',
  );
  assert.ok(issue);
  assert.match(issue.message, /legal build 1-1-0/);
});

test('unlock promises distinguish new capabilities from names and existing effects', () => {
  const { blueprint, plan } = fixture();
  const effect = {
    name: 'Echo',
    count: 2,
    damageMultiplier: 0.5,
    radius: 8,
    inheritStatuses: false,
  };
  plan.upgradeIntents.path1.tier3 = { improves: [], unlock: 'follow-up' };
  blueprint.paths.path1.tiers.tier3.changes = [{ kind: 'followUp', target: 'base', value: effect }];
  assert.deepEqual(planIntentIssues(blueprint, plan, defaultAuthoringDefinition), []);
  plan.upgradeIntents.path1.tier4 = { improves: [], unlock: 'follow-up' };
  blueprint.paths.path1.tiers.tier4.changes = [
    { kind: 'followUp', target: 'base', value: { ...effect, name: 'Renamed' } },
  ];
  assert.ok(
    planIntentIssues(blueprint, plan, defaultAuthoringDefinition).some(
      (entry) => entry.path === 'paths.path1.tiers.tier4.planIntent',
    ),
  );
});

test('a base follow-up does not unlock an explicitly active-only follow-up', () => {
  const { blueprint, plan } = fixture();
  boost(blueprint);
  plan.upgradeIntents.path2.tier4 = { improves: [], unlock: 'manual-boost' };
  plan.upgradeIntents.path2.tier5 = { improves: [], unlock: 'active-follow-up' };
  const effect = {
    name: 'Echo',
    count: 2,
    damageMultiplier: 0.5,
    radius: 8,
    inheritStatuses: false,
  };
  blueprint.paths.path2.tiers.tier5.changes = [{ kind: 'followUp', target: 'base', value: effect }];
  assert.ok(planIntentIssues(blueprint, plan, defaultAuthoringDefinition).length);
  blueprint.paths.path2.tiers.tier5.changes = [
    { kind: 'followUp', target: 'boost', value: effect },
  ];
  assert.deepEqual(planIntentIssues(blueprint, plan, defaultAuthoringDefinition), []);
});

test('manual unlocks cannot be implemented by ordinary stats or a differently timed boost', () => {
  const { blueprint, plan } = fixture();
  plan.upgradeIntents.path2.tier3 = { improves: [], unlock: 'manual-boost' };
  assert.ok(
    planIntentIssues(blueprint, plan, defaultAuthoringDefinition).some(
      (issue) => issue.path === 'paths.path2.tiers.tier3.planIntent',
    ),
  );
});

async function savedDraft(): Promise<DraftArtifact> {
  const { blueprint, plan } = fixture();
  const request = miraRequest();
  request.constraints = [];
  request.mechanicsDefinition = structuredClone(defaultMechanicsDefinition);
  request.progression = definitionProgression(request.mechanicsDefinition);
  blueprint.name = request.character.name;
  const source = request.documents.find((entry) => entry.kind === 'source')!;
  blueprint.sourceFacts = [{ documentId: source.id, quote: source.text }];
  const prepared = await prepareRequest(request);
  const sourceIds = ['source1:0'];
  const designPlan = designPlanSchema.parse({
    ...plan,
    concept: 'Develop the supplied Spark.',
    signature: { name: 'Spark', sourceIds, adaptation: 'An aimed attack.' },
    repertoire: [{ name: 'Spark', sourceIds, limitation: 'Needs clear delivery.' }],
    base: { name: 'Spark', sourceIds, behavior: 'Fire an aimed attack.' },
    paths: Object.fromEntries(
      pathKeys.map((path) => [
        path,
        {
          name: path,
          sourceIds,
          buyFor: 'Improve direct damage.',
          weakness: 'Needs clear delivery.',
          milestones: Object.fromEntries(tierKeys.map((tier) => [tier, 'Improve direct damage.'])),
          capstoneValue: 'Stronger sustained damage.',
          crosspaths: pathKeys
            .filter((other) => other !== path)
            .map((other) => ({ path: other, contribution: 'Improve early attack damage.' })),
          referenceExample: 'Develop an existing attack.',
        },
      ]),
    ),
    omittedTechniques: [],
    scopeLimits: ['No simulation.'],
  });
  return JSON.parse(
    JSON.stringify({
      schemaVersion: '1',
      kind: 'draft',
      prepared,
      candidate: compileBlueprint(blueprint, prepared.request),
      run: {
        id: 'saved-plan',
        modelId: 'fixture',
        startedAt: '2026-09-21',
        completedAt: '2026-09-21',
        designPlan,
      },
    }),
  );
}

test('saved draft rechecks reproduce typed-intent guarantees without requiring old plans to contain intents', async () => {
  const draft = await savedDraft();
  assert.deepEqual(
    (await checkDraft(draft)).findings.filter((entry) => entry.outcome === 'fail'),
    [],
  );
  const blueprint = draft.candidate.blueprint!;
  blueprint.paths.path1.tiers.tier5.changes = [
    { kind: 'stat', target: 'base', stat: 'range', operation: 'add', value: 8 },
  ];
  // Recompile derived fields so this is a valid mechanical change, not a stale display.
  draft.candidate = compileBlueprint(blueprint, draft.prepared.request);
  const failures = (await checkDraft(draft)).findings.filter((entry) => entry.outcome === 'fail');
  assert.equal(failures.length, 1);
  assert.equal(failures[0]!.rule, 'planned-upgrade-intent');
  assert.equal(failures[0]!.subject, 'paths.path1.tiers.tier5.planIntent');
  assert.match(failures[0]!.message, /improved damage/);
  delete draft.run.designPlan!.upgradeIntents;
  assert.deepEqual(
    (await checkDraft(draft)).findings.filter((entry) => entry.outcome === 'fail'),
    [],
  );
});

test('saved draft rechecks do not resolve plan intent against invalid mechanics', async () => {
  const draft = await savedDraft();
  draft.candidate.blueprint!.paths.path1.tiers.tier5.changes = [
    { kind: 'stat', target: 'base', stat: 'pierce', operation: 'set', value: 0.5 },
  ];
  const findings = (await checkDraft(draft)).findings;
  assert.ok(findings.some((entry) => entry.rule === 'typed-mechanics' && entry.outcome === 'fail'));
  assert.ok(!findings.some((entry) => entry.rule === 'planned-upgrade-intent'));
});
