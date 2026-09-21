import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  authorUnit,
  checkDraft,
  draftUnit,
  prepareRequest,
  type ModelUsage,
} from '../src/core/index.js';
import {
  formatCost,
  formatEstimatedCost,
  stageUsageRows,
  summarizeUsage,
  usageSummaryText,
} from '../src/presentation/usage.js';
import { renderArtifact } from '../src/presentation/markdown.js';
import { FakeModel, miraRequest } from './fixtures/core-fixtures.js';

function usage(overrides: Partial<ModelUsage> = {}): ModelUsage {
  return {
    inputTokens: 100,
    outputTokens: 40,
    totalTokens: 140,
    reasoningTokens: 20,
    cachedInputTokens: 10,
    costUsd: 0.01,
    actualModel: 'actual/model',
    provider: 'provider',
    generationId: 'generation',
    ...overrides,
  };
}

test('revision totals include draft and review once, without adding reasoning or cached subsets', async () => {
  const result = structuredClone(await authorUnit(miraRequest(), new FakeModel()));
  result.run.draft.usage = usage({ costUsd: 0.02 });
  result.run.review.usage = usage({
    inputTokens: 50,
    outputTokens: 30,
    totalTokens: 80,
    costUsd: 0.03,
  });
  const summary = summarizeUsage(result);
  assert.deepEqual(summary.cost, { value: 0.05, partial: false });
  assert.deepEqual(summary.tokens, { value: 220, partial: false });
  assert.match(usageSummaryText(summary), /\$0\.05 USD; 220 tokens/);
  const detail = renderArtifact(result, { details: true });
  assert.match(detail, /Generation usage/);
  assert.match(detail, /actual\/model/);
  assert.match(detail, /Reasoning tokens \| 20/);
});

test('old results and missing metadata remain unavailable rather than free', async () => {
  const result = await authorUnit(miraRequest(), new FakeModel());
  const summary = summarizeUsage(result);
  assert.deepEqual(summary.cost, { value: null, partial: true });
  assert.deepEqual(summary.tokens, { value: null, partial: true });
  assert.equal(usageSummaryText(summary), 'Cost and token usage unavailable.');
  assert.doesNotMatch(renderArtifact(result), /\$0/);
  assert.ok(
    stageUsageRows(summary.stages[0]!).some(
      ([name, value]) => name === 'Reported cost' && value === 'Unavailable',
    ),
  );
});

test('an optional review that has not run is not missing billed usage', async () => {
  const draft = structuredClone(
    await draftUnit(await prepareRequest(miraRequest()), new FakeModel()),
  );
  draft.run.usage = usage({ costUsd: 0 });
  const checked = await checkDraft(draft);
  for (const artifact of [draft, checked]) {
    const summary = summarizeUsage(artifact);
    assert.deepEqual(summary.cost, { value: 0, partial: false });
    assert.deepEqual(summary.tokens, { value: 140, partial: false });
    assert.match(
      usageSummaryText(summary),
      /Reported cost for this revision: \$0\.00 USD; 140 tokens/,
    );
    assert.deepEqual(stageUsageRows(summary.stages[1]!)[0], ['Status', 'No completed stage']);
  }
});

test('cost and token completeness are independent and unknown fields are not inferred', async () => {
  const result = structuredClone(await authorUnit(miraRequest(), new FakeModel()));
  result.run.draft.usage = usage({ costUsd: 0, totalTokens: null });
  result.run.review.usage = usage({ costUsd: null, totalTokens: 20 });
  const summary = summarizeUsage(result);
  assert.deepEqual(summary.cost, { value: 0, partial: true });
  assert.deepEqual(summary.tokens, { value: 20, partial: true });
  assert.match(usageSummaryText(summary), /20 tokens \(partial\)/);
  result.run.review.usage.costUsd = 0;
  assert.deepEqual(summarizeUsage(result).cost, { value: 0, partial: false });
});

test('a positive reported cost never formats as zero', () => {
  assert.equal(formatCost(0), '$0.00 USD');
  assert.equal(formatCost(null), 'Unavailable');
  for (const cost of [0.001, 0.00000001, 1e-12, Number.MIN_VALUE]) {
    const formatted = formatCost(cost);
    assert.notEqual(formatted, '$0.00 USD');
    assert.ok(Number(formatted.replace('$', '').replace(' USD', '').replaceAll(',', '')) > 0);
  }
});

test('a failed optional role call remains unavailable and leaves costs partial', async () => {
  const result = structuredClone(await authorUnit(miraRequest(), new FakeModel()));
  result.run.draft.usage = usage({ costUsd: 0 });
  result.run.review.usage = usage({ costUsd: 0 });
  result.roles = {
    status: 'unavailable',
    provider: 'typesafe:jev',
    builds: [],
    note: 'Provider unavailable.',
  };
  const summary = summarizeUsage(result);
  assert.deepEqual(summary.cost, { value: 0, partial: true });
  assert.equal(summary.roleCostEstimate, null);
  assert.deepEqual(stageUsageRows(summary.stages[2]!)[0], ['Status', 'Unavailable']);
});

test('small estimates round to one significant digit without changing reported cost precision', () => {
  assert.equal(formatEstimatedCost(0.00018098), '$0.0002 USD');
  assert.equal(formatEstimatedCost(0.00000125), '$0.000001 USD');
  assert.equal(formatEstimatedCost(0.0099), '$0.01 USD');
  assert.equal(formatEstimatedCost(0), '$0 USD');
  assert.equal(formatEstimatedCost(null), 'Unavailable');
  assert.equal(formatCost(0.00018098), '$0.00018098 USD');
});
