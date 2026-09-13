import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { summarizeOperations } from './summarize-operations.mjs';

async function fixture(t) {
  const run = await mkdtemp(path.join(tmpdir(), 'two-lane-operations-'));
  t.after(() => rm(run, { recursive: true, force: true }));
  const ledger = path.join(run, 'ledger.jsonl');
  const a = 'astra-low-integrated';
  const b = 'luna-high-standard';
  const calls = [
    {
      id: 'run/a/model-1',
      stage: 'research',
      amountUsd: 6,
      knownUsage: true,
      usage: { inputTokens: 100, outputTokens: 40 },
      latencyMs: 1000
    },
    {
      id: 'run/a/model-2',
      stage: 'repair',
      amountUsd: 7,
      knownUsage: false,
      usage: { inputTokens: 10 },
      latencyMs: 2000,
      error: { message: 'PRIVATE_ERROR_CONTENT' }
    },
    {
      id: 'run/d/model-1',
      stage: 'creation',
      amountUsd: 1,
      knownUsage: true,
      usage: { inputTokens: 50, outputTokens: 20 },
      latencyMs: 500
    }
  ];
  const summary = {
    runId: 'run',
    mode: 'offline',
    endedAt: '2026-09-09T00:10:00Z',
    attempts: [
      {
        id: 'a',
        lane: 'manga-mayhem',
        track: 'explicit',
        prototype: a,
        repeat: 1,
        status: 'probe-failure',
        mechanicalAcceptance: 'accepted',
        validation: { valid: true },
        calls: 2,
        callRecords: calls.slice(0, 2),
        latencyMs: 5000,
        finalCandidate: { description: 'PRIVATE_CANDIDATE_CONTENT' },
        sourceSnapshot: { sources: [{ status: 'failed', content: 'PRIVATE_SOURCE_CONTENT' }] },
        retrievalEvents: [
          { type: 'research-operation', elapsedMs: 200, result: 'PRIVATE_SOURCE_CONTENT' },
          { type: 'research-operation-failed', elapsedMs: 100, error: 'PRIVATE_SOURCE_CONTENT' }
        ],
        failure: { stage: 'probes', code: null, message: 'PRIVATE_ERROR_CONTENT' }
      },
      {
        id: 'b',
        lane: 'manga-mayhem',
        track: 'withheld-direction',
        prototype: a,
        repeat: 1,
        status: 'budget-limited',
        calls: 0
      },
      {
        id: 'c',
        lane: 'btd6-derived',
        track: 'explicit',
        prototype: b,
        repeat: 1,
        status: 'budget-limited',
        calls: 0,
        callRecords: [],
        latencyMs: 10
      },
      {
        id: 'd',
        lane: 'btd6-derived',
        track: 'withheld-direction',
        prototype: b,
        repeat: 1,
        status: 'accepted',
        mechanicalAcceptance: 'accepted',
        calls: 1,
        callRecords: [calls[2]],
        latencyMs: 800
      }
    ],
    balances: [
      {
        account: a,
        outstandingUsd: 7,
        spentAllowanceUsd: 8,
        estimatedStandardUsd: 3,
        unknownUsage: 1,
        committedUsd: 15
      },
      {
        account: b,
        outstandingUsd: 0,
        spentAllowanceUsd: 0.3,
        estimatedStandardUsd: 0.1,
        unknownUsage: 0,
        committedUsd: 0.3
      }
    ]
  };
  const started = {
    at: '2026-09-09T00:00:00Z',
    study: {
      plannedAttempts: 4,
      prototypes: [
        { id: a, model: 'model-a' },
        { id: b, model: 'model-b' }
      ]
    },
    execution: {
      pricing: {
        'model-a': {
          inputPerMillion: 10000,
          outputPerMillion: 25000,
          reservationInputPerMillion: 25000,
          reservationOutputPerMillion: 62500
        },
        'model-b': {
          inputPerMillion: 1000,
          outputPerMillion: 2500,
          reservationInputPerMillion: 3000,
          reservationOutputPerMillion: 7500
        }
      }
    }
  };
  const row = (value) => ({ at: '2026-09-09T00:05:00Z', ...value });
  const rows = [
    row({
      kind: 'reserve',
      id: 'prior/z/model-1',
      account: a,
      amountUsd: 4,
      attempt: 'z',
      stage: 'creation'
    }),
    row({
      kind: 'settle',
      id: 'prior/z/model-1',
      knownUsage: true,
      allowanceUsd: 3,
      estimatedStandardUsd: 1
    }),
    ...calls.flatMap((call, index) => [
      row({
        kind: 'reserve',
        id: call.id,
        account: index === 2 ? b : a,
        amountUsd: call.amountUsd,
        attempt: index === 2 ? 'd' : 'a',
        stage: call.stage
      }),
      row({
        kind: 'settle',
        id: call.id,
        knownUsage: call.knownUsage,
        usage: call.usage,
        ...(call.knownUsage
          ? { allowanceUsd: index === 2 ? 0.3 : 5, estimatedStandardUsd: index === 2 ? 0.1 : 2 }
          : {})
      })
    ]),
    row({
      at: '2026-09-09T00:11:00Z',
      kind: 'reserve',
      id: 'later/e/model-1',
      account: a,
      amountUsd: 2,
      attempt: 'e'
    })
  ];
  const saveSummary = () => writeFile(path.join(run, 'summary.json'), JSON.stringify(summary));
  await saveSummary();
  await writeFile(path.join(run, 'started.json'), JSON.stringify(started));
  await writeFile(ledger, rows.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  return { run, ledger, summary, saveSummary };
}

test('requires completion before reporting operational data', async (t) => {
  const f = await fixture(t);
  delete f.summary.endedAt;
  await f.saveSummary();
  await assert.rejects(
    summarizeOperations({ runDirectory: f.run, ledgerPath: f.ledger }),
    /completed run summary/
  );
});

test('retains all slots, diagnostic acceptance, unknown allowance and scoped ledger reconciliation', async (t) => {
  const f = await fixture(t);
  const report = await summarizeOperations({ runDirectory: f.run, ledgerPath: f.ledger });
  assert.equal(report.registeredPlannedSlots, 4);
  assert.equal(report.overall.plannedSlots, 4);
  assert.equal(report.overall.startedAttempts, 3);
  assert.equal(report.overall.unstartedSlots, 1);
  assert.deepEqual(report.overall.statuses, {
    'probe-failure': 1,
    'budget-limited': 2,
    accepted: 1
  });
  assert.equal(report.overall.mechanicalAcceptance.accepted, 2);
  assert.equal(
    report.slots.find((slot) => slot.attemptId === 'a').mechanicalAcceptance,
    'accepted'
  );
  assert.equal(report.overall.recordedModelCalls, 3);
  assert.equal(report.overall.repairCalls, 1);
  assert.equal(report.overall.sourceOperationFailures, 1);
  assert.equal(report.overall.failedCapturedSources, 1);
  assert.equal(report.overall.tokenUsage.knownInputTokens, 160);
  assert.equal(report.overall.tokenUsage.knownOutputTokens, 60);
  assert.equal(report.overall.tokenUsage.incompleteOrUnknownUsageCalls, 1);
  assert.equal(report.overall.cost.knownStandardApiEstimateUsd, 2.1);
  assert.equal(report.overall.cost.retainedUnknownOrUnsettledReservationsUsd, 7);
  assert.equal(report.overall.cost.committedConservativeAllowanceUsd, 12.3);
  assert.equal(report.overall.cost.isSubscriptionInvoice, false);
  assert.equal(report.runWallTimeMs, 600000);
  assert.equal(report.overall.latency.modelCallsByStage.repair.totalMs, 2000);
  assert.equal(report.overall.latency.recordedSourceOperations.totalMs, 300);
  assert.equal(report.byLaneTrackPrototype.length, 4);
  assert.equal(
    report.reconciliation.lifetimeLedgerBalancesAtCompletion.find(
      (item) => item.account === 'astra-low-integrated'
    ).committedUsd,
    15
  );
  assert.equal(
    report.reconciliation.reportedBalanceDifferences.every((item) =>
      Object.values(item.differences).every((value) => value === 0)
    ),
    true
  );
  assert.equal(report.warnings.length, 0);
  assert.doesNotMatch(
    JSON.stringify(report),
    /PRIVATE_|finalCandidate|sourceSnapshot|description|source content/
  );
});

test('missing ledger is explicitly unverified and retains unknown reservations without treating them as zero', async (t) => {
  const f = await fixture(t);
  await rm(f.ledger);
  const report = await summarizeOperations({ runDirectory: f.run, ledgerPath: f.ledger });
  assert.equal(report.reconciliation.ledgerAvailable, false);
  assert.match(report.accountingBasis, /not ledger-verified/);
  assert.equal(report.overall.cost.knownStandardApiEstimateUsd, 2.1);
  assert.equal(report.overall.cost.retainedUnknownOrUnsettledReservationsUsd, 7);
  assert.equal(report.overall.tokenUsage.incompleteOrUnknownUsageCalls, 1);
  assert.equal(report.warnings.length, 1);
});
