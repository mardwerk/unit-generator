import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  authorUnit,
  checkDraft,
  draftArtifactSchema,
  draftUnit,
  ModelExecutionError,
  modelUsageSchema,
  prepareRequest,
  resultSchema,
  reviewDraft,
  type ModelClient,
  type ModelResponse,
  type ModelUsage,
} from '../src/core/index.js';
import { FakeModel, miraCandidate, miraRequest, miraReview } from './fixtures/core-fixtures.js';

function reportedUsage(generationId: string): ModelUsage {
  return {
    inputTokens: 100,
    outputTokens: 40,
    totalTokens: 140,
    reasoningTokens: 10,
    cachedInputTokens: 20,
    costUsd: 0.001,
    actualModel: 'test/model',
    provider: 'Test provider',
    generationId,
  };
}

test('usage remains attached to its draft and review through checks and serialization', async () => {
  const draftUsage = reportedUsage('draft-call');
  const reviewUsage = {
    ...reportedUsage('review-call'),
    inputTokens: 200,
    outputTokens: 60,
    totalTokens: 260,
    reasoningTokens: null,
    cachedInputTokens: null,
    costUsd: 0,
    actualModel: 'test/reviewer',
  };
  const responses: ModelResponse[] = [
    { output: miraCandidate(), usage: draftUsage },
    { output: miraReview(), usage: reviewUsage },
  ];
  const model: ModelClient = {
    id: 'test/router',
    async generate() {
      return responses.shift()!;
    },
  };
  const prepared = await prepareRequest(miraRequest());
  const draft = await draftUnit(prepared, model);
  assert.deepEqual(draft.run.usage, draftUsage);
  assert.ok(Object.isFrozen(draft.run.usage));
  draftUsage.inputTokens = 999;
  assert.equal(draft.run.usage!.inputTokens, 100);
  const checked = await checkDraft(JSON.parse(JSON.stringify(draft)));
  assert.deepEqual(checked.draft.run.usage, draft.run.usage);
  const result = await reviewDraft(checked, model);
  const saved = resultSchema.parse(JSON.parse(JSON.stringify(result)));
  assert.deepEqual(saved.run.draft.usage, draft.run.usage);
  assert.deepEqual(saved.run.review.usage, reviewUsage);
  assert.deepEqual(saved.prepared, prepared);
  assert.equal(saved.run.review.modelId, model.id);
});

test('concurrent calls retain the usage of their own response', async () => {
  const pending: ((response: ModelResponse) => void)[] = [];
  let firstStarted!: () => void;
  const firstReady = new Promise<void>((resolve) => {
    firstStarted = resolve;
  });
  let bothStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    bothStarted = resolve;
  });
  const model: ModelClient = {
    id: 'test/concurrent',
    generate() {
      return new Promise((resolve) => {
        pending.push(resolve);
        if (pending.length === 1) firstStarted();
        if (pending.length === 2) bothStarted();
      });
    },
  };
  const prepared = await prepareRequest(miraRequest());
  const first = draftUnit(prepared, model);
  await firstReady;
  const second = draftUnit(prepared, model);
  await started;
  pending[1]!({ output: miraCandidate(), usage: reportedUsage('second') });
  assert.equal((await second).run.usage!.generationId, 'second');
  pending[0]!({ output: miraCandidate(), usage: reportedUsage('first') });
  assert.equal((await first).run.usage!.generationId, 'first');
});

test('saved artifacts without usage stay valid without inserted defaults or changed hashes', async () => {
  const prepared = await prepareRequest(miraRequest());
  const draft = await draftUnit(prepared, new FakeModel());
  const result = await authorUnit(miraRequest(), new FakeModel());
  const oldDraft = JSON.parse(JSON.stringify(draft));
  const oldResult = JSON.parse(JSON.stringify(result));
  assert.equal(Object.hasOwn(oldDraft.run, 'usage'), false);
  assert.equal(Object.hasOwn(oldResult.run.draft, 'usage'), false);
  assert.equal(Object.hasOwn(oldResult.run.review, 'usage'), false);
  assert.deepEqual(draftArtifactSchema.parse(oldDraft), oldDraft);
  assert.deepEqual(resultSchema.parse(oldResult), oldResult);
  assert.deepEqual((await checkDraft(oldDraft)).draft.prepared, prepared);
});

test('usage validates token counts and cost while retaining unknown and zero values', async () => {
  const usage = reportedUsage('validation');
  for (const field of [
    'inputTokens',
    'outputTokens',
    'totalTokens',
    'reasoningTokens',
    'cachedInputTokens',
  ] as const) {
    for (const value of [-1, 0.5, Infinity, NaN, '100']) {
      assert.equal(modelUsageSchema.safeParse({ ...usage, [field]: value }).success, false);
    }
    assert.equal(modelUsageSchema.safeParse({ ...usage, [field]: 0 }).success, true);
    assert.equal(modelUsageSchema.safeParse({ ...usage, [field]: null }).success, true);
  }
  for (const value of [-0.01, Infinity, NaN, '0']) {
    assert.equal(modelUsageSchema.safeParse({ ...usage, costUsd: value }).success, false);
  }
  assert.equal(modelUsageSchema.safeParse({ ...usage, costUsd: null }).success, true);
  const unknown = Object.fromEntries(Object.keys(usage).map((key) => [key, null]));
  assert.deepEqual(modelUsageSchema.parse(unknown), unknown);

  const invalidModel: ModelClient = {
    id: 'test/invalid-usage',
    async generate() {
      return { output: miraCandidate(), usage: { ...usage, inputTokens: -1 } };
    },
  };
  await assert.rejects(draftUnit(await prepareRequest(miraRequest()), invalidModel), (error) => {
    assert.ok(error instanceof ModelExecutionError);
    assert.match(error.message, /Draft model execution failed/);
    assert.equal(Object.hasOwn(error, 'usage'), false);
    return true;
  });
  const checked = await checkDraft(
    await draftUnit(await prepareRequest(miraRequest()), new FakeModel()),
  );
  await assert.rejects(
    reviewDraft(checked, {
      id: invalidModel.id,
      async generate() {
        return { output: miraReview(), usage: { ...usage, outputTokens: 1.5 } };
      },
    }),
    (error) => {
      assert.ok(error instanceof ModelExecutionError);
      assert.match(error.message, /Review model execution failed/);
      assert.equal(Object.hasOwn(error, 'usage'), false);
      return true;
    },
  );
});

test('invalid draft and review output retain the billed usage of the rejected response', async () => {
  const prepared = await prepareRequest(miraRequest());
  const checked = await checkDraft(await draftUnit(prepared, new FakeModel()));
  const wrongEvidence = miraReview();
  wrongEvidence.findings[0]!.evidence = ['unknown-document'];
  const draftUsage = reportedUsage('invalid-draft');
  const reviewUsage = reportedUsage('invalid-review');
  const invalidDraft: ModelClient = {
    id: 'test/invalid-output',
    async generate() {
      return { output: {}, usage: draftUsage };
    },
  };
  await assert.rejects(draftUnit(prepared, invalidDraft), (error) => {
    assert.ok(error instanceof ModelExecutionError);
    assert.deepEqual(error.usage, draftUsage);
    assert.ok(Object.isFrozen(error.usage));
    return true;
  });
  for (const output of [{}, wrongEvidence]) {
    await assert.rejects(
      reviewDraft(checked, {
        id: 'test/invalid-review',
        async generate() {
          return { output, usage: reviewUsage };
        },
      }),
      (error) => {
        assert.ok(error instanceof ModelExecutionError);
        assert.deepEqual(error.usage, reviewUsage);
        assert.notEqual(error.usage!.generationId, draftUsage.generationId);
        return true;
      },
    );
  }
});

test('adapter failure usage is retained only when valid, without inventing unknown charges', async () => {
  const prepared = await prepareRequest(miraRequest());
  const usage = reportedUsage('provider-failure');
  const malformed = { ...usage, costUsd: -10 };
  for (const reported of [usage, malformed, undefined]) {
    const failure = new ModelExecutionError('Incomplete provider response.', reported);
    const model: ModelClient = {
      id: 'test/incomplete-response',
      async generate() {
        throw failure;
      },
    };
    await assert.rejects(draftUnit(prepared, model), (error) => {
      assert.ok(error instanceof ModelExecutionError);
      assert.equal(error.cause, failure);
      assert.deepEqual(error.usage, reported === usage ? usage : undefined);
      return true;
    });
  }
});
