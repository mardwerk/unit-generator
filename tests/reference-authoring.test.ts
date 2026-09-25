import assert from 'node:assert/strict';
import test from 'node:test';
import { draftUnit } from '../src/core/draft.js';
import { prepareRequest } from '../src/core/prepare.js';
import { ModelExecutionError } from '../src/core/model.js';
import {
  decodeReferenceBlueprint,
  isReferenceAuthoring,
  referenceBlueprintRequest,
} from '../src/core/planned-v1/reference-authoring.js';
import { attackEvidenceCandidates } from '../src/core/planned-v1/attack-evidence.js';
import { validateBlueprintRequest } from '../src/core/planned-v1/validate.js';
import { referenceRecipes } from '../src/core/mechanics/reference-patterns.js';
import { pathKeys, type UnitBlueprint } from '../src/core/mechanics/schemas.js';
import {
  applyDefaultProfile,
  defaultProgression,
  starterAuthoringTask,
  defaultProfile,
} from '../src/node/default-profile.js';
import { miraCandidate, miraRequest } from './fixtures/core-fixtures.js';
import { compileBlueprint } from '../src/core/planned-v1/compile.js';
import { renderArtifact } from '../src/presentation/markdown.js';

const cases = [
  [
    'physical-impact',
    'kinetic-striker-v2',
    'Mira uses Hammer Punch to strike enemies with a heavy physical punch.',
    'Hammer Punch',
  ],
  [
    'sharp-projectile',
    'piercing-projectile-v2',
    'Mira uses Water Blade to launch water at extreme pressure as a cutting blade.',
    'Water Blade',
  ],
  [
    'nonburn-energy',
    'pulsed-energy-impact-v2',
    'Mira fires Spark as a concentrated concussive energy beam.',
    'Spark',
  ],
  [
    'fire',
    'pulsed-energy-pressure-v2',
    'Mira projects Fire Wave, a flame attack that burns enemies.',
    'Fire Wave',
  ],
  [
    'area-control',
    'close-area-control-v2',
    'Mira uses Frost Field to freeze enemies across a surrounding area.',
    'Frost Field',
  ],
] as const;
function request(text: string = cases[0][2]) {
  const result = applyDefaultProfile(miraRequest());
  result.constraints = [];
  result.progression = structuredClone(defaultProgression);
  result.documents = result.documents.filter(
    (document) => document.kind === 'source' || document.id === defaultProfile.id,
  );
  result.documents.find((document) => document.kind === 'source')!.text = text;
  result.task = starterAuthoringTask;
  result.mechanicsDefinition!.profile.authoringMode = 'reference-patterns-v1';
  return result;
}
function output(index = 0) {
  const [modality, , text, motif] = cases[index]!;
  const candidate = attackEvidenceCandidates(request(text)).find(
    (entry) => entry.modality === modality,
  )!;
  return { attacks: [{ candidateId: candidate.id, motif: motif as string }] };
}

function mechanics(blueprint: UnitBlueprint) {
  const copy = structuredClone(blueprint);
  copy.name = 'name';
  copy.baseAttack.name = 'attack';
  delete copy.referencePattern;
  copy.sourceFacts = [];
  copy.proposals = [];
  copy.reservedTechniques = [];
  for (const path of pathKeys) {
    copy.paths[path].name = 'path';
    copy.paths[path].rationale = 'rationale';
    copy.paths[path].sourceFactIndices = [];
  }
  return copy;
}

test('all five modalities map to fixed recipes without changing mechanics or catalogue', () => {
  const before = JSON.stringify(referenceRecipes);
  cases.forEach(([, id, text, motif], index) => {
    const recipe = referenceRecipes.find((entry) => entry.id === id)!;
    const value = request(text);
    const result = decodeReferenceBlueprint(output(index), value);
    assert.deepEqual(mechanics(result), mechanics(recipe.blueprint));
    assert.deepEqual(result.referencePattern, { id, version: '2' });
    assert.equal(result.baseAttack.name, `${motif}: ${recipe.blueprint.baseAttack.name}`);
    for (const path of pathKeys) {
      assert.equal(result.paths[path].name, `${motif}: ${recipe.blueprint.paths[path].name}`);
      assert.deepEqual(result.paths[path].sourceFactIndices, [0]);
      assert.ok(result.paths[path].rationale.length <= 300);
    }
    assert.deepEqual(validateBlueprintRequest(result, value), []);
    result.baseAttack.stats.damage = 9999;
  });
  assert.equal(JSON.stringify(referenceRecipes), before);
});

test('plain energy never selects burning pressure', () => {
  const result = decodeReferenceBlueprint(output(2), request(cases[2][2]));
  assert.equal(result.referencePattern!.id, 'pulsed-energy-impact-v2');
  assert.doesNotMatch(JSON.stringify(result.paths), /"kind":"burn"/);
});

test('source facts preserve exact quoted behavior and reject unknown or fabricated evidence', () => {
  const result = decodeReferenceBlueprint(output(), request());
  assert.equal(result.sourceFacts[0]!.quote, cases[0][2]);
  for (const change of [
    { candidateId: 'unknown' },
    { behaviorQuote: 'Mira teleports directly into another dimension.' },
    { modality: 'teleport' },
  ]) {
    const value = output();
    Object.assign(value.attacks[0]!, change);
    assert.throws(() => decodeReferenceBlueprint(value, request()));
  }
});

test('motif normalization and character fallback never bypass exact behavior quotation', () => {
  const value = output();
  value.attacks[0]!.motif = 'HAMMER   PUNCH';
  assert.match(decodeReferenceBlueprint(value, request()).baseAttack.name, /^HAMMER PUNCH:/);
  value.attacks[0]!.motif = 'Unsupported Canon Name';
  assert.match(decodeReferenceBlueprint(value, request()).baseAttack.name, /^Mira:/);
  Object.assign(value.attacks[0]!, { behaviorQuote: request().character.name.padEnd(15, '.') });
  assert.throws(() => decodeReferenceBlueprint(value, request()));
});

test('first compatible attack wins and other extracted attacks become fixed omissions', () => {
  const text = `${cases[0][2]} ${cases[2][2]}`;
  const value = request(text);
  const candidates = attackEvidenceCandidates(value);
  const attacks = [
    { ...output().attacks[0]!, candidateId: candidates[0]!.id },
    { ...output(2).attacks[0]!, candidateId: candidates[1]!.id },
  ];
  const first = decodeReferenceBlueprint({ attacks }, value);
  assert.equal(first.referencePattern!.id, 'kinetic-striker-v2');
  assert.deepEqual(first.reservedTechniques, [
    {
      name: 'Spark',
      reason:
        'Source-described attack omitted from the selected game adaptation; grants no effects.',
    },
  ]);
  value.mechanicsDefinition!.profile.maxBaseCost = 300;
  // Neither of these attacks has an eligible recipe under this ceiling.
  assert.throws(
    () => decodeReferenceBlueprint({ attacks }, value),
    /No supported reference pattern/,
  );
});

test('an incompatible first recipe is skipped for the next eligible attack', () => {
  const value = request(`${cases[0][2]} ${cases[1][2]}`);
  value.mechanicsDefinition!.profile.maxBaseCost = 300;
  const candidates = attackEvidenceCandidates(value);
  const result = decodeReferenceBlueprint(
    {
      attacks: [
        { ...output(0).attacks[0]!, candidateId: candidates[0]!.id },
        { ...output(1).attacks[0]!, candidateId: candidates[1]!.id },
      ],
    },
    value,
  );
  assert.equal(result.referencePattern!.id, 'piercing-projectile-v2');
  assert.deepEqual(result.paths.path1.sourceFactIndices, [1]);
  assert.equal(result.reservedTechniques[0]!.name, 'Hammer Punch');
});

test('secondary character labels and same-modality strikes are not fictional omissions', () => {
  const value = request(`${cases[0][2]} ${cases[2][2]}`);
  const candidates = attackEvidenceCandidates(value);
  const primary = { candidateId: candidates[0]!.id, motif: 'Hammer Punch' };
  for (const motif of ['Invented Power', value.character.name]) {
    const result = decodeReferenceBlueprint(
      { attacks: [primary, { candidateId: candidates[1]!.id, motif }] },
      value,
    );
    assert.deepEqual(result.reservedTechniques, []);
  }
  const result = decodeReferenceBlueprint(
    { attacks: [primary, { ...primary, motif: 'physical punch' }] },
    value,
  );
  assert.deepEqual(result.reservedTechniques, []);
});

test('code owns all names beyond the motif, mechanics, rationale and omission reasons', () => {
  for (const extra of [
    { recipeId: 'piercing-projectile-v2' },
    { rationale: 'Grants teleportation.' },
    { damage: 100 },
    { reservedTechniques: [] },
  ]) {
    const value = output();
    Object.assign(value.attacks[0]!, extra);
    assert.throws(() => decodeReferenceBlueprint(value, request()));
  }
  const value = output();
  value.attacks = Array.from({ length: 4 }, () => value.attacks[0]!);
  assert.throws(() => decodeReferenceBlueprint(value, request()));
});

test('maximum length motifs keep every composed rationale within schema limits', () => {
  const motif = 'a'.repeat(40);
  cases.forEach(([, , text], index) => {
    const value = request(`${motif} ${text}`);
    const candidate = attackEvidenceCandidates(value).find(
      (entry) => entry.modality === cases[index]![0],
    )!;
    const extracted = output(index);
    Object.assign(extracted.attacks[0]!, { motif, candidateId: candidate.id });
    const result = decodeReferenceBlueprint(extracted, value);
    for (const path of pathKeys) assert.ok(result.paths[path].rationale.length <= 300);
    assert.deepEqual(validateBlueprintRequest(result, value), []);
  });
});

test('historical technique context survives in evidence and the readable decision list', async () => {
  const value = request(
    `Section: Skills > Former > Extra skills\nLink text: Fire Wave\n\n${cases[3][2]}`,
  );
  const source = value.documents.find((document) => document.kind === 'source')!;
  source.id = 'character-technique:example.fandom.com:Fire%20Wave';
  const candidate = attackEvidenceCandidates(value).find((entry) => entry.modality === 'fire')!;
  const blueprint = decodeReferenceBlueprint(
    { attacks: [{ candidateId: candidate.id, motif: 'Fire Wave' }] },
    value,
  );
  assert.ok(
    blueprint.sourceFacts.some((fact) => fact.quote === 'Section: Skills > Former > Extra skills'),
  );
  const unit = compileBlueprint(blueprint, value);
  assert.match(unit.unresolvedQuestions[0]!.question, /historical skill/);
  assert.match(
    unit.basicAttack.limitations,
    /current source-period availability is not established/,
  );
  const draft = await draftUnit(await prepareRequest(value), {
    id: 'fixture',
    async generate() {
      return { output: { attacks: [{ candidateId: candidate.id, motif: 'Fire Wave' }] } };
    },
  });
  assert.match(renderArtifact(draft), /Fire Wave is listed under/);
});

test('empty model selection yields a fixed honest no-fit without repair and retains usage', async () => {
  let calls = 0;
  const value = request();
  const usage = {
    inputTokens: 10,
    outputTokens: 12,
    totalTokens: 22,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    costUsd: 0.002,
    actualModel: 'fixture',
    provider: null,
    generationId: 'fixture-1',
  };
  await assert.rejects(
    draftUnit(await prepareRequest(value), {
      id: 'fixture:reference',
      async generate(model) {
        calls++;
        assert.match(model.prompt, /Biography, leadership/);
        return { output: { attacks: [] }, usage };
      },
    }),
    (error) =>
      error instanceof ModelExecutionError &&
      error.failure?.code === 'REQUEST_REJECTED' &&
      error.usage?.costUsd === 0.002 &&
      error.usage?.totalTokens === 22,
  );
  assert.equal(calls, 1);
});

test('reference workflow uses one model stage and supplies no recipe menu or path names', async () => {
  let calls = 0;
  const result = await draftUnit(await prepareRequest(request()), {
    id: 'fixture:reference',
    async generate(model) {
      calls++;
      assert.equal(model.schema.type, 'object');
      for (const recipe of referenceRecipes) {
        assert.ok(!model.prompt.includes(recipe.id));
        for (const path of pathKeys)
          assert.ok(!model.prompt.includes(recipe.blueprint.paths[path].name));
      }
      return { output: output() };
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.candidate.blueprint?.referencePattern?.id, 'kinetic-striker-v2');
  assert.equal(result.run.attempts?.[0]?.issues.length, 0);
});

test('opt-in mode falls back for explicit constraints, decisions, history and feedback', async () => {
  const direct = request();
  direct.mechanicsDefinition!.profile.authoringMode = 'direct';
  assert.equal(isReferenceAuthoring(direct), false);
  for (const modify of [
    (value: ReturnType<typeof request>) => {
      value.constraints.push({ id: 'keep', text: 'Keep a confirmed attack.' });
    },
    (value: ReturnType<typeof request>) => {
      value.previous = { resultId: 'prior', draft: miraCandidate(), findings: [] };
      value.feedback = 'Keep the previous design.';
    },
    (value: ReturnType<typeof request>) => {
      value.feedback = 'Preserve the previous attack.';
    },
    (value: ReturnType<typeof request>) => {
      value.documents.push({
        id: 'decision',
        kind: 'decisions',
        text: 'The unit must summon an ally.',
        origin: { location: 'user', access: 'supplied', note: null },
      });
    },
  ]) {
    const value = request();
    modify(value);
    const before = structuredClone(value);
    assert.equal(isReferenceAuthoring(value), false);
    assert.throws(() => decodeReferenceBlueprint(output(), value), /new starter request/);
    await assert.rejects(
      async () => referenceBlueprintRequest(await prepareRequest(value)),
      /new starter request/,
    );
    assert.deepEqual(value, before);
  }
});

test('historical allowance is explicit while a requested source period remains binding', async () => {
  for (const scope of [
    'Adapt a supported attack subset. No story period is specified.',
    'Use only the current end-of-story repertoire. Former skills are excluded.',
  ]) {
    const value = request(
      `Section: Skills > Former > Extra skills\nLink text: Fire Wave\n\n${cases[3][2]}`,
    );
    value.character.scope = scope;
    value.documents.find((document) => document.kind === 'source')!.id =
      'character-technique:example.fandom.com:Fire%20Wave';
    const before = structuredClone(value);
    const model = referenceBlueprintRequest(await prepareRequest(value));
    assert.match(model.prompt, /scope specifies no story period/);
    assert.match(model.prompt, /explicitly historical subset/);
    assert.match(model.prompt, /Explicit period constraints still take precedence/);
    assert.match(model.prompt, /never assert that a former attack is currently available/);
    const context = JSON.parse(model.prompt.split('\n\n').find((part) => part.startsWith('{'))!);
    assert.equal(context.character.scope, scope);
    assert.ok(context.evidenceSpans.some((span: { text: string }) => span.text.includes('Former')));
    assert.deepEqual(value, before);
  }
});

test('extractor preserves the starter Definition, repair findings and signal', async () => {
  const value = request();
  const controller = new AbortController();
  const model = referenceBlueprintRequest(
    await prepareRequest(value),
    output(),
    ['Unknown source ID'],
    controller.signal,
  );
  assert.equal(model.signal, controller.signal);
  assert.match(model.prompt, /Unknown source ID/);
  const context = JSON.parse(model.prompt.split('\n\n').find((part) => part.startsWith('{'))!);
  assert.deepEqual(context.definition, value.mechanicsDefinition);
  assert.deepEqual(
    context.documents,
    value.documents.filter((document) => document.kind !== 'source'),
  );
});

test('incompatible definitions and missing source documents cannot produce a reference draft', () => {
  const wrong = request();
  wrong.mechanicsDefinition!.id = 'another-game';
  assert.throws(() => decodeReferenceBlueprint(output(), wrong), /compatible btd6/);
  const constrained = request();
  constrained.mechanicsDefinition!.profile.maxBaseCost = 1;
  assert.throws(() => decodeReferenceBlueprint(output(), constrained), /No reference pattern/);
  const empty = request();
  empty.documents = empty.documents.filter((document) => document.kind !== 'source');
  assert.throws(() => decodeReferenceBlueprint(output(), empty), /source text/);
});
