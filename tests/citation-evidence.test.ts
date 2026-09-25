import assert from 'node:assert/strict';
import test from 'node:test';
import { authorEvidence } from '../src/core/planned-v1/evidence.js';
import { bindDesignPlan, decodeDesignPlan } from '../src/core/planned-v1/plan.js';
import { designPlanSchema } from '../src/core/planned-v1/plan-schema.js';
import { decodeBlueprintOutput } from '../src/core/planned-v1/model-output.js';
import { validBlueprint } from './fixtures/blueprint.js';
import { pathKeys, tierKeys } from '../src/core/mechanics/schemas.js';
import { miraRequest } from './fixtures/core-fixtures.js';
import { defaultAuthoringDefinition } from '../src/core/default-profile.js';

function fixture() {
  const request = miraRequest();
  request.constraints = [];
  request.mechanicsDefinition = structuredClone(defaultAuthoringDefinition);
  request.documents[0]!.text = Array.from(
    { length: 96 },
    (_, index) =>
      `Mira's documented Spark variation number ${index + 1} strikes one visible target.`,
  ).join('\n\n');
  const evidence = authorEvidence(request);
  const ids = evidence.map((span) => span.id);
  assert.equal(ids.length, 96);
  const branch = {
    name: 'Spark progression',
    sourceIds: ids,
    buyFor: 'Develop a focused attack.',
    weakness: 'Needs clear target access.',
    capstoneValue: 'Concentrate the purchased attack.',
    referenceExample: 'Develop the same attack.',
    milestones: Object.fromEntries(
      tierKeys.map((tier) => [tier, 'Increase ordinary attack damage.']),
    ),
    crosspaths: [],
  };
  const plan = designPlanSchema.parse({
    concept: 'Adapt the supplied Spark evidence.',
    signature: { name: 'Spark', sourceIds: ids, adaptation: 'A visible ranged strike.' },
    repertoire: [
      { name: 'Spark', sourceIds: ids, limitation: 'Only supplied variants are documented.' },
    ],
    base: { name: 'Spark', sourceIds: ids.slice(0, 11), behavior: 'Strike a detected target.' },
    paths: Object.fromEntries(
      pathKeys.map((path) => [
        path,
        {
          ...branch,
          crosspaths: pathKeys
            .filter((other) => other !== path)
            .map((other) => ({ path: other, contribution: 'Develop ordinary attack damage.' })),
        },
      ]),
    ),
    omittedTechniques: [],
    scopeLimits: ['No external canon verification.'],
    upgradeIntents: Object.fromEntries(
      pathKeys.map((path) => [
        path,
        Object.fromEntries(
          tierKeys.map((tier) => [tier, { improves: ['damage'], unlock: 'none' }]),
        ),
      ]),
    ),
  });
  const { sourceFacts: _facts, proposals, ...blueprint } = validBlueprint();
  const wire = {
    ...blueprint,
    name: request.character.name,
    baseSourceIds: ids.slice(0, 11),
    unsupportedMechanics: proposals,
    constraintCoverage: [],
    paths: Object.fromEntries(
      pathKeys.map((path) => {
        const { sourceFactIndices: _indices, ...branch } = blueprint.paths[path];
        return [
          path,
          {
            ...branch,
            sourceIds: ids,
            tiers: Object.fromEntries(
              tierKeys.map((tier) => [
                tier,
                {
                  name: 'Stronger Spark',
                  cost: 100,
                  statChanges: [{ stat: 'damage', operation: 'add', value: 1 }],
                  slow: null,
                  burn: null,
                  camo: null,
                  delivery: null,
                  damageType: null,
                  targeting: null,
                  unlockBoost: null,
                  boostChanges: [],
                },
              ]),
            ),
          },
        ];
      }),
    ),
  };
  return { request, evidence, ids, plan, wire };
}

test('planning and bound numerical decoding preserve large known citation sets and exact source joins', () => {
  const { request, evidence, plan, wire } = fixture();
  const decodedPlan = decodeDesignPlan(plan, request);
  assert.equal(decodedPlan.base.sourceIds.length, 11);
  assert.equal(decodedPlan.paths.path1.sourceIds.length, 96);
  const blueprint = decodeBlueprintOutput(bindDesignPlan(wire, decodedPlan), request);
  assert.equal(blueprint.sourceFacts.length, 96);
  assert.deepEqual(
    blueprint.sourceFacts,
    evidence.map(({ documentId, text }) => ({ documentId, quote: text })),
  );
  for (const path of pathKeys)
    assert.deepEqual(
      blueprint.paths[path].sourceFactIndices,
      evidence.map((_, index) => index),
    );
});

test('unknown citations still fail independently in planning and numerical decoding', () => {
  const { request, plan, wire } = fixture();
  plan.base.sourceIds = ['not-supplied'];
  assert.throws(() => decodeDesignPlan(plan, request), /Unknown character evidence ID/);
  wire.baseSourceIds = ['not-supplied'];
  assert.throws(() => decodeBlueprintOutput(wire, request), /Invalid option/);
});

test('repeated citations preserve distinct union and do not fabricate duplicate source facts', () => {
  const { request, ids, wire, evidence } = fixture();
  wire.baseSourceIds = [ids[0]!, ids[0]!, ...ids.slice(1, 11)];
  for (const path of pathKeys) wire.paths[path]!.sourceIds = [ids[0]!, ids[0]!, ids[11]!];
  const blueprint = decodeBlueprintOutput(wire, request);
  assert.deepEqual(
    blueprint.sourceFacts,
    evidence.slice(0, 12).map(({ documentId, text }) => ({ documentId, quote: text })),
  );
  for (const path of pathKeys) assert.deepEqual(blueprint.paths[path].sourceFactIndices, [0, 11]);
});
