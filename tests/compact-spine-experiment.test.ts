import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  draftCompactSpine,
  compactSpineSchema,
  compileCompactSpine,
  spines,
  type CompactSpineOutput,
} from '../src/experiments/compact-spine/index.js';
import {
  prepareRequest,
  definitionProgression,
  defaultMechanicsDefinition,
  pathKeys,
  tierKeys,
  ModelExecutionError,
  type AuthorRequest,
  type ModelUsage,
  type ModelRequest,
  type ModelResponse,
} from '../src/core/index.js';
import { authorEvidence } from '../src/core/blueprint/evidence.js';
import { FakeModel } from './fixtures/core-fixtures.js';

function request(): AuthorRequest {
  const definition = structuredClone(defaultMechanicsDefinition);
  definition.profile.currency = 'Test tokens';
  return {
    schemaVersion: '1',
    task: 'Adapt only the supplied Spark techniques. Keep all unrequested behavior during revisions.',
    character: { name: 'Mira', work: 'Original test brief', scope: 'Only the supplied statements' },
    documents: [
      {
        id: 'spark',
        kind: 'source',
        text: 'Mira launches a clear-path Spark projectile at one detected enemy.',
        origin: { location: 'original:spark', access: 'supplied', note: null },
      },
      {
        id: 'focus',
        kind: 'source',
        text: 'Mira can focus her aim to reach distant targets with that same Spark.',
        origin: { location: 'original:focus', access: 'supplied', note: null },
      },
      {
        id: 'pierce',
        kind: 'source',
        text: 'Mira can pass a Spark through a finite number of nearby enemies.',
        origin: { location: 'original:pierce', access: 'supplied', note: null },
      },
    ],
    constraints: [{ id: 'clear-path', text: 'Do not grant delivery through obstacles.' }],
    mechanicsDefinition: definition,
    progression: definitionProgression(definition),
    previous: null,
    feedback: null,
  };
}
function compact(input = request()): CompactSpineOutput {
  const spans = authorEvidence(input);
  const byDocument = (id: string) => spans.find((span) => span.documentId === id)!.id;
  return compactSpineSchema.parse({
    role: 'A clear-path Spark attacker.',
    weakness: 'Blocked delivery stops the attack.',
    baseAttack: {
      name: 'Spark',
      cost: 250,
      delivery: 'projectile',
      damageType: 'energy',
      targeting: 'first',
      camo: false,
      stats: {
        damage: 10,
        intervalSeconds: 1,
        range: 20,
        pierce: 1,
        projectiles: 1,
        splashRadius: 0,
        slowPercent: 0,
        slowSeconds: 0,
        burnDamagePerSecond: 0,
        burnSeconds: 0,
        stunSeconds: 0,
      },
    },
    baseSourceSpanIds: [byDocument('spark')],
    paths: Object.fromEntries(
      pathKeys.map((key, index) => [
        key,
        {
          name: key,
          specialization: ['direct-damage', 'range', 'group-damage'][index],
          theme: 'Develop the supplied Spark.',
          rationale: 'A proposed numerical adaptation of the selected evidence.',
          sourceSpanIds: [byDocument(['pierce', 'spark', 'focus'][index]!)],
          tiers: Object.fromEntries(
            tierKeys.map((tier, tierIndex) => [
              tier,
              {
                name: `${key} ${tier}`,
                cost: 100 * (tierIndex + 1),
                changes: [
                  {
                    kind: 'stat',
                    target: 'base',
                    stat: ['damage', 'range', 'pierce'][index],
                    operation: 'add',
                    value: 1,
                  },
                ],
              },
            ]),
          ),
        },
      ]),
    ),
    constraintCoverage: [
      {
        constraintId: 'clear-path',
        implementation:
          'The attack retains the supplied Definition clear-path requirement; this is an implementation account, not a semantic certificate.',
      },
    ],
    proposals: [
      {
        name: 'Independent kick',
        reason: 'The numerical backend does not implement an independently timed attack.',
      },
    ],
    reservedTechniques: [],
  });
}
const usage = (tokens: number): ModelUsage => ({
  inputTokens: tokens,
  outputTokens: tokens,
  totalTokens: 2 * tokens,
  reasoningTokens: null,
  cachedInputTokens: null,
  costUsd: 0.01,
  actualModel: 'double',
  provider: 'fixture',
  generationId: null,
});

test('explicit compact-spine experiment compiles exact selected spans and never gates on simulated usefulness', async () => {
  const prepared = await prepareRequest(request());
  const output = compact(prepared.request);
  const model = new FakeModel([output]);
  const result = await draftCompactSpine(prepared, model, { spineId: 'aimed' });
  assert.equal(result.experiment, 'compact-spine-v1');
  assert.equal(result.checked.findings.filter((f) => f.outcome === 'fail').length, 0);
  const blueprint = result.checked.draft.candidate.blueprint!;
  for (const [key, documentId] of [
    ['path1', 'pierce'],
    ['path2', 'spark'],
    ['path3', 'focus'],
  ] as const)
    assert.equal(
      blueprint.sourceFacts[blueprint.paths[key].sourceFactIndices[0]!]!.documentId,
      documentId,
    );
  assert.deepEqual(blueprint.constraintCoverage, output.constraintCoverage);
  assert.equal(
    result.checked.draft.candidate.abilities.length,
    0,
    'The recipe manual boost is not a requirement.',
  );
  assert.ok(result.checked.draft.candidate.paths[0]!.tiers[0]!.benefit.includes('Test tokens'));
  assert.equal(model.requests.length, 1);
  assert.match(model.requests[0]!.prompt, /not a validation result|never a validation result/);
  assert.ok(!model.requests[0]!.prompt.includes('Every paid tier must kill strictly more'));
  assert.ok(Object.isFrozen(spines));
});

test('revisions receive the complete prior candidate, numerical mechanics, feedback and governing Definition', async () => {
  const input = request();
  const initial = await draftCompactSpine(
    await prepareRequest(input),
    new FakeModel([compact(input)]),
    { spineId: 'aimed' },
  );
  input.previous = {
    resultId: initial.checked.draft.run.id,
    draft: initial.checked.draft.candidate,
    findings: initial.checked.findings,
  };
  input.feedback = 'Rename one upgrade. Preserve all previous values and restrictions.';
  const model = new FakeModel([compact(input)]);
  await draftCompactSpine(await prepareRequest(input), model, { spineId: 'aimed' });
  assert.ok(model.requests[0]!.prompt.includes(JSON.stringify(input.previous.draft)));
  assert.ok(model.requests[0]!.prompt.includes(input.feedback));
  assert.ok(model.requests[0]!.prompt.includes(JSON.stringify(input.mechanicsDefinition)));
});

test('invalid span joins trigger one targeted repair with original output and aggregate usage', async () => {
  const input = request();
  const invalid = compact(input);
  invalid.paths.path1.sourceSpanIds = ['invented-span'];
  const model = new FakeModel([
    { output: invalid, usage: usage(3) },
    { output: compact(input), usage: usage(5) },
  ]);
  const generate = model.generate.bind(model);
  model.generate = async (request) => (await generate(request)).output as ModelResponse;
  const result = await draftCompactSpine(await prepareRequest(input), model, { spineId: 'aimed' });
  assert.equal(model.requests.length, 2);
  assert.ok(model.requests[1]!.prompt.includes(JSON.stringify(invalid)));
  assert.match(model.requests[1]!.prompt, /Evidence joins are invalid/);
  assert.equal(result.checked.draft.run.usage?.totalTokens, 16);
  assert.equal(result.checked.draft.run.attempts?.length, 2);
  assert.throws(
    () => compileCompactSpine(invalid, result.checked.draft.prepared, authorEvidence(input)),
    /unknown IDs/,
  );
});

test('the actual supplied Definition rejects invalid outputs and no implicit recipe can override it', async () => {
  const input = request();
  input.mechanicsDefinition!.profile.maxStatValue = 21;
  const model = new FakeModel([compact(input)]);
  await assert.rejects(
    draftCompactSpine(await prepareRequest(input), model, {
      spineId: 'aimed',
      maxRepairAttempts: 0,
    }),
    ModelExecutionError,
  );
  assert.equal(model.requests.length, 1);
});

test('invalid requests, missing explicit selection and cancellation dispatch no calls', async () => {
  const model = new FakeModel([]);
  const prepared = await prepareRequest(request());
  const interpreted = structuredClone(prepared);
  Object.assign(interpreted.request, { interpretation: { id: 'supplied-intent' } });
  await assert.rejects(
    draftCompactSpine(interpreted, model, { spineId: 'aimed' }),
    /does not support pinned interpretations/,
  );
  const changed = structuredClone(prepared);
  changed.request.task = 'Changed without re-preparing';
  await assert.rejects(draftCompactSpine(changed, model, { spineId: 'aimed' }), /hash/);
  await assert.rejects(draftCompactSpine(prepared, model, { spineId: 'unknown' }), /explicit/);
  await assert.rejects(
    draftCompactSpine(prepared, model, { spineId: 'aimed', signal: AbortSignal.abort() }),
  );
  assert.equal(model.requests.length, 0);
});

test('default core and CLI contain no compact-spine routing or experiment imports', async () => {
  for (const path of [
    'src/core/draft.ts',
    'src/core/index.ts',
    'src/cli.ts',
    'src/node/character-source.ts',
  ]) {
    const source = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8').catch(() =>
      readFile(path, 'utf8'),
    );
    assert.doesNotMatch(source, /compact-spine|draftCompactSpine|prepareSpineRequest/);
  }
});

test('failed repairs retain usage from both attempts and never expose provider payloads', async () => {
  const input = request();
  const invalid = compact(input);
  invalid.paths.path1.sourceSpanIds = ['unknown'];
  let calls = 0;
  const model = {
    id: 'fixture',
    async generate(_request: ModelRequest): Promise<ModelResponse> {
      if (++calls === 1) return { output: invalid, usage: usage(3) };
      throw new ModelExecutionError('safe failure', usage(5), {
        failure: { code: 'RATE_LIMIT', message: 'Provider rate limit.' },
      });
    },
  };
  await assert.rejects(
    draftCompactSpine(await prepareRequest(input), model, { spineId: 'aimed' }),
    (error: unknown) => {
      assert.ok(error instanceof ModelExecutionError);
      assert.equal(error.usage?.totalTokens, 16);
      assert.equal(error.failure?.code, 'RATE_LIMIT');
      return true;
    },
  );
  assert.equal(calls, 2);
});
