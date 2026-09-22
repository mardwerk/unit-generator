import assert from 'node:assert/strict';
import test from 'node:test';
import {
  referenceRecipes,
  referencePatternCompatible,
} from '../src/core/mechanics/reference-patterns.js';
import {
  defaultAuthoringDefinition,
  applyDefaultProfile,
  defaultProgression,
} from '../src/node/default-profile.js';
import { compileBlueprint, draftArtifactSchema, prepareRequest } from '../src/core/index.js';
import { renderArtifact } from '../src/presentation/markdown.js';
import { miraRequest } from './fixtures/core-fixtures.js';
import { defaultMechanicsDefinition, pathKeys } from '../src/core/mechanics/schemas.js';
import { validateBlueprint } from '../src/core/mechanics/validate.js';
import { allLegalBuilds, resolveUnchecked, resolvedIssues } from '../src/core/mechanics/resolve.js';

test('every complete reference arrangement validates all 64 default builds with the current authoring policy', () => {
  assert.ok(referenceRecipes.length > 0);
  assert.equal(new Set(referenceRecipes.map(({ id }) => id)).size, referenceRecipes.length);
  assert.equal(defaultAuthoringDefinition.profile.designPolicy?.manualAbilityPath, 'path2');
  assert.equal(
    defaultAuthoringDefinition.profile.designPolicy?.minTier5SpecialtyMultiplier,
    undefined,
  );
  const selections = allLegalBuilds(defaultAuthoringDefinition);
  assert.equal(selections.length, 64);
  for (const entry of referenceRecipes) {
    assert.ok(entry.version.length > 0);
    assert.equal(entry.definitionId, defaultMechanicsDefinition.id);
    assert.equal(entry.definitionRevision, defaultMechanicsDefinition.revision);
    const before = JSON.stringify(entry);
    assert.deepEqual(validateBlueprint(entry.blueprint, defaultAuthoringDefinition), [], entry.id);
    for (const selection of selections) {
      const build = resolveUnchecked(entry.blueprint, selection);
      assert.deepEqual(
        resolvedIssues(
          build,
          defaultAuthoringDefinition,
          `builds.${selection.join('-')}`,
          entry.blueprint,
        ),
        [],
        `${entry.id}: ${selection.join('-')}`,
      );
      assert.ok(build.abilities.every((ability) => ability.path === 'path2'));
    }
    assert.equal(JSON.stringify(entry), before);
    for (const path of pathKeys) {
      assert.equal(entry.purchaseRationale[path].length, 5);
      assert.ok(
        entry.purchaseRationale[path].every((explanation) => explanation.trim().length > 0),
      );
    }
    assert.match(entry.provenance.valueBasis, /proposed/);
    assert.ok(entry.limitations.length > 0);
  }
});

test('reference catalogue is deeply frozen while a caller can adapt an isolated copy', () => {
  const entry = referenceRecipes[0]!;
  assert.ok(Object.isFrozen(referenceRecipes));
  assert.ok(Object.isFrozen(entry.blueprint.paths.path1.tiers.tier1.changes));
  assert.ok(Object.isFrozen(entry.blueprint.baseAttack.stats));
  assert.ok(Object.isFrozen(entry.purchaseRationale.path1));
  assert.throws(() => {
    entry.blueprint.baseAttack.stats.damage = 999;
  }, TypeError);
  assert.throws(() => {
    entry.purchaseRationale.path1.push('mutation');
  }, TypeError);
  const copy = structuredClone(entry.blueprint);
  copy.name = 'Independent adaptation';
  copy.baseAttack.name = 'Named source technique';
  assert.notEqual(copy.name, entry.blueprint.name);
  assert.notEqual(copy.baseAttack.name, entry.blueprint.baseAttack.name);
});

test('validation rejects tampered counts rather than rounding or silently repairing a recipe', () => {
  const altered = structuredClone(referenceRecipes[0]!.blueprint);
  altered.paths.path1.tiers.tier1.changes = [
    { kind: 'stat', target: 'base', stat: 'projectiles', operation: 'multiply', value: 1.5 },
  ];
  const before = JSON.stringify(altered);
  const issues = validateBlueprint(altered, defaultAuthoringDefinition);
  assert.ok(
    issues.some((issue) => /projectiles/.test(issue.message) && /1\.5/.test(issue.message)),
  );
  assert.equal(JSON.stringify(altered), before);
});

test('reference compatibility protects rules and scale while leaving policy and ceilings to validation', () => {
  assert.equal(referencePatternCompatible(defaultMechanicsDefinition), true);
  assert.equal(referencePatternCompatible(defaultAuthoringDefinition), true);
  const compatible = structuredClone(defaultAuthoringDefinition);
  compatible.revision = 'custom-revision';
  compatible.label = 'Custom label';
  compatible.profile.authoringMode = 'reference-patterns-v1';
  compatible.profile.maxUpgradeCost = 1;
  compatible.profile.designPolicy!.minTier5SpecialtyMultiplier = 4;
  compatible.rules.damageImmunities.sharp.reverse();
  compatible.rules.slowImmune.reverse();
  assert.equal(referencePatternCompatible(compatible), true);
  assert.ok(validateBlueprint(referenceRecipes[0]!.blueprint, compatible).length > 0);
  for (const change of [
    (value: typeof compatible) => {
      value.id = 'another-definition';
    },
    (value: typeof compatible) => {
      value.rules.damageImmunities.energy = [];
    },
    (value: typeof compatible) => {
      value.rules.damageImmunities.normal = ['lead'];
    },
    (value: typeof compatible) => {
      value.rules.slowImmune = ['boss'];
    },
    (value: typeof compatible) => {
      value.rules.stunImmune = [];
    },
    (value: typeof compatible) => {
      value.progression.maxPurchasedPaths = 1;
    },
    (value: typeof compatible) => {
      value.profile.currency = 'Ink';
    },
    (value: typeof compatible) => {
      value.profile.referenceScale!.baseDamage = 10;
    },
    (value: typeof compatible) => {
      value.profile.referenceScale!.incrementalUpgradeCosts[0] = 999;
    },
    (value: typeof compatible) => {
      delete value.profile.referenceScale;
    },
  ]) {
    const altered = structuredClone(defaultAuthoringDefinition);
    change(altered);
    const before = JSON.stringify(altered);
    assert.equal(referencePatternCompatible(altered), false);
    assert.equal(JSON.stringify(altered), before);
  }
});

test('only detailed Markdown exposes pattern history without claiming mechanically unchanged provenance', async () => {
  const input = applyDefaultProfile(miraRequest());
  input.constraints = [];
  input.documents = input.documents.filter((document) => document.kind !== 'decisions');
  input.progression = structuredClone(defaultProgression);
  const prepared = await prepareRequest(input);
  const recipe = referenceRecipes[0]!;
  const blueprint = structuredClone(recipe.blueprint);
  blueprint.name = input.character.name;
  blueprint.referencePattern = { id: recipe.id, version: recipe.version };
  blueprint.sourceFacts = [
    {
      documentId: 'E1',
      quote: 'Mira senses presences behind walls and fires a Spark at one target.',
    },
  ];
  const artifact = draftArtifactSchema.parse({
    schemaVersion: '1',
    kind: 'draft',
    prepared,
    candidate: compileBlueprint(blueprint, prepared.request),
    run: {
      id: 'reference-render',
      modelId: 'fixture:no-model',
      startedAt: '2026-09-21T00:00:00Z',
      completedAt: '2026-09-21T00:00:00Z',
    },
  });
  const details = renderArtifact(artifact, { details: true });
  assert.ok(
    details.includes(`Recorded reference pattern: ${recipe.id}, version ${recipe.version}.`),
  );
  assert.match(details, /fixed proposed pattern/);
  assert.match(details, /authoring history, not proof that external edits preserved/);
  assert.doesNotMatch(renderArtifact(artifact), /Recorded reference pattern:/);
  delete artifact.candidate.blueprint!.referencePattern;
  assert.doesNotMatch(renderArtifact(artifact, { details: true }), /Recorded reference pattern:/);
});

test('the nonburn energy arrangement retains status-free mechanics in every crosspath and active boost', () => {
  const entry = referenceRecipes.find(({ id }) => id === 'pulsed-energy-impact-v2')!;
  assert.equal(entry.blueprint.baseAttack.delivery, 'beam');
  assert.equal(entry.blueprint.baseAttack.damageType, 'energy');
  for (const selection of allLegalBuilds(defaultAuthoringDefinition)) {
    const build = resolveUnchecked(entry.blueprint, selection);
    for (const attack of [
      build.baseAttack,
      ...build.abilities.map((ability) => ability.boostedAttack),
    ]) {
      assert.equal(attack.stats.burnDamagePerSecond, 0);
      assert.equal(attack.stats.burnSeconds, 0);
      assert.equal(attack.stats.slowPercent, 0);
      assert.equal(attack.stats.slowSeconds, 0);
      assert.equal(attack.stats.stunSeconds, 0);
      assert.equal(attack.camo, false);
    }
  }
});
