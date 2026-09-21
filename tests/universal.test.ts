import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSystemOneClient,
  deriveTraits,
  draftUniversal,
  evolveUniversal,
  generateUniversal,
  intakeRuleset,
  rankRolesLocal,
  scoreBlueprint,
} from '../src/core/universal.js';
import { referenceRecipes } from '../src/core/mechanics/reference-patterns.js';
import {
  applyDefaultProfile,
  defaultAuthoringDefinition,
  draftUnit,
  prepareRequest,
  resolveBuild,
} from '../src/core/index.js';
import { miraRequest } from './fixtures/core-fixtures.js';

describe('universal intake accepts bad rulesets', () => {
  it('uses the starter when nothing is supplied', () => {
    const result = intakeRuleset(null);
    assert.equal(result.degraded, true);
    assert.ok(result.warnings.length > 0);
    assert.equal(result.definition.id, 'btd6-combat-v1');
  });

  it('passes a valid definition through untouched', () => {
    const result = intakeRuleset(structuredClone(defaultAuthoringDefinition));
    assert.equal(result.degraded, false);
    assert.equal(result.warnings.length, 0);
  });

  it('repairs negative ceilings and unknown extensions', () => {
    const result = intakeRuleset({
      profile: { currency: '', maxBaseCost: -5, maxUpgradeCost: 'free' },
      rules: { attackExtensions: ['teleport-army', 'distinct-volley'] },
      progression: { pathCount: 9, tiersPerPath: 99 },
    });
    assert.equal(result.degraded, true);
    assert.ok(result.definition.profile.maxBaseCost > 0);
    assert.deepEqual(result.definition.rules.attackExtensions, ['distinct-volley']);
    assert.ok(result.warnings.length >= 2);
  });
});

describe('universal generation works end to end', () => {
  it('generates a valid unit from a name and traits', () => {
    const result = generateUniversal({ name: 'Test Striker', traits: ['railgun', 'overdrive'] });
    assert.equal(result.blueprint.name, 'Test Striker');
    assert.ok(result.scores.length === 64);
    assert.ok(result.scores[0]!.fitness >= 0);
  });

  it('still generates when the ruleset is bad', () => {
    const result = generateUniversal({
      name: 'Bad Ruleset Unit',
      traits: ['punch'],
      ruleset: { profile: { maxBaseCost: -1 }, rules: {}, progression: { pathCount: 5 } },
    });
    assert.ok(result.blueprint.name.length > 0);
    assert.ok(result.warnings.length > 0);
    assert.ok(result.scores.length > 0);
  });

  it('scores the reference recipes without network calls', () => {
    const scores = scoreBlueprint(referenceRecipes[0]!.blueprint, defaultAuthoringDefinition);
    assert.equal(scores.length, 64);
    assert.ok(scores[0]!.dps > 0);
  });

  it('evolves a seed without making it worse', () => {
    const seed = generateUniversal({ name: 'Evo', traits: ['bolt'] });
    const before = seed.scores[0]!.fitness;
    const evolved = evolveUniversal(seed.blueprint, seed.definition, { budget: 40, seed: 3 });
    assert.ok(evolved.valid >= 1);
    assert.ok(evolved.fitness >= before);
  });
});

describe('universal derivation and default draft route', () => {
  it('derives punch and sense traits from evidence text', () => {
    const rubber = deriveTraits({
      character: { name: 'Monkey D. Luffy' },
      documents: [
        { kind: 'source', text: 'His rubber body stretches. He learned Haki and Gear Second.' },
      ],
    });
    assert.deepEqual(rubber, ['stretching punch', 'gear second', 'haki', 'heavy finisher']);
    const mira = deriveTraits(miraRequest());
    assert.equal(mira[0], 'senses');
  });

  it('picks the striker recipe for stretching traits', () => {
    const result = generateUniversal({
      name: 'Monkey D. Luffy',
      traits: ['stretching punch', 'heavy finisher', 'rapid flurry', 'haki'],
    });
    assert.equal(result.recipeId, 'kinetic-striker-v2');
  });

  it('grants reach and detection for stretching control traits', () => {
    const result = generateUniversal({
      name: 'Monkey D. Luffy',
      traits: ['stretching punch', 'heavy finisher', 'rapid flurry', 'haki'],
    });
    assert.equal(result.blueprint.baseAttack.stats.range, 32);
    const detected = resolveBuild(result.blueprint, [0, 0, 2], result.definition).baseAttack.camo;
    assert.equal(detected, true);
  });

  it('drafts through the shared draftUnit path with no model calls', async () => {
    const input = miraRequest();
    input.progression = null;
    const prepared = await prepareRequest(applyDefaultProfile(input));
    let called = 0;
    const draft = await draftUnit(prepared, {
      id: 'test:never',
      async generate() {
        called++;
        throw new Error('must not call a model');
      },
    });
    assert.equal(called, 0);
    assert.equal(draft.run.modelId, 'deterministic:universal-v1');
    assert.ok(draft.candidate.blueprint);
    assert.equal(draft.run.attempts?.length, 1);
    const direct = await draftUniversal(prepared);
    assert.equal(direct.candidate.blueprint?.name, draft.candidate.blueprint?.name);
  });
});

describe('decision backends share one shape', () => {
  it('posts System One JSON to any base URL', async () => {
    let seenUrl = '';
    let seenBody: Record<string, unknown> = {};
    const client = createSystemOneClient({
      baseUrl: 'http://localhost:8080',
      model: 'test-model',
      fetchImpl: (async (url: unknown, init: unknown) => {
        seenUrl = String(url);
        seenBody = JSON.parse(String((init as { body: string }).body));
        return { ok: true, json: async () => ({ answers: { role: { choice: 'sniper' } } }) };
      }) as typeof fetch,
    });
    const result = await client.decide({ build: '5-2-0' }, { role: { type: 'choice' } });
    assert.equal(seenUrl, 'http://localhost:8080/v1/systemone');
    assert.equal((seenBody as { model: string }).model, 'test-model');
    assert.deepEqual(result.answers, { role: { choice: 'sniper' } });
  });

  it('ranks roles locally with fixed confidence', () => {
    const rows = rankRolesLocal([
      { id: 'base', dps: 1, coverage: 2, range: 32 },
      { id: 'sniper', dps: 30, coverage: 2, range: 90 },
    ]);
    assert.equal(rows[1]!.role, 'sniper');
    assert.equal(rows[0]!.confidence, 0.5);
  });
});
