import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { matrix, runStudy, assertExecution } from './runner.mjs';
import { BudgetExceeded, createLedger } from './ledger.mjs';

const study = JSON.parse(
  await readFile(new URL('../model-comparison-preparation/study.json', import.meta.url), 'utf8')
);
const execution = () => ({
  mode: 'offline',
  liveExecutionEnabled: false,
  directions: { explicit: 'EXPLICIT-ONLY-DIRECTION', 'withheld-direction': 'Monkey D. Luffy' },
  limits: {
    maxInputBytes: 100000,
    maxOutputBytes: 100000,
    maxOutputTokens: 1000,
    inputTokenOverhead: 4096,
    callTimeoutMs: 1000,
    attemptTimeoutMs: 10000
  },
  pricing: Object.fromEntries(
    ['gpt-6-astra', 'gpt-5.6-luna'].map((model) => [
      model,
      {
        inputPerMillion: 1,
        outputPerMillion: 2,
        reservationInputPerMillion: 2,
        reservationOutputPerMillion: 4,
        longContextThresholdInputTokens: 272000,
        longContextInputMultiplier: 2,
        longContextOutputMultiplier: 1.5
      }
    ])
  )
});
const knowledge = () => ({
  subject: 'Monkey D. Luffy',
  identity: {
    status: 'resolved',
    name: 'Monkey D. Luffy',
    continuity: 'One Piece manga continuity',
    explanation: 'Source matches subject.'
  },
  claims: [{ text: 'Luffy has elastic powers.', kind: 'evidence', sourceIds: ['s1'] }],
  gaps: []
});
function fixtures(overrides = {}) {
  const requests = [];
  const sessions = [];
  const research = {
    retrievalCost: 'free-replay',
    createSession({ attempt, record }) {
      const events = [];
      sessions.push({ attempt, events });
      return {
        tools: [{ name: 'read_source' }],
        async execute(name, args) {
          const event = {
            name,
            args,
            id: 's1',
            status: 'read',
            excerpt: 'Luffy has elastic powers.'
          };
          events.push(event);
          await record(event);
          return event;
        },
        async baseline() {
          events.push({ baseline: true });
          return { sources: [{ id: 's1', status: 'read', excerpt: 'Luffy has elastic powers.' }] };
        },
        snapshot() {
          return { events, sources: events };
        }
      };
    }
  };
  const model = {
    async generate(call) {
      requests.push(call);
      let value;
      if (call.stage === 'research') value = knowledge();
      else if (call.stage === 'integrated-research-and-creation')
        value = call.input.history.length
          ? { candidate: { valid: true, cadence: 2 }, research: knowledge() }
          : { toolCalls: [{ name: 'read_source', arguments: { url: 'fixture:s1' } }] };
      else value = { valid: true, cadence: 2 };
      return { value, model: call.requestedModel, usage: { inputTokens: 100, outputTokens: 100 } };
    }
  };
  const lanes = Object.fromEntries(
    study.lanes.map((lane) => [
      lane.id,
      {
        contract: { type: 'object' },
        authorPrompt: 'Author the requested unit using the contract and evidence.',
        hashes: { schema: 'fixture-schema', probes: 'fixture-probes' },
        validate(candidate) {
          return {
            valid: candidate?.valid === true,
            issues: candidate?.valid ? [] : ['valid must be true']
          };
        },
        probe(candidate) {
          return { cadence: candidate?.cadence ?? null, coverage: 'fixture-only' };
        }
      }
    ])
  );
  return { execution: execution(), model, research, lanes, requests, sessions, ...overrides };
}
async function temporary(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'two-lane-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'runs'));
  return {
    outputDir: path.join(directory, 'runs'),
    ledgerPath: path.join(directory, 'ledger.jsonl')
  };
}

test('registered matrix has 24 paired attempts and 132 maximum calls', () => {
  const rows = matrix(study);
  assert.equal(rows.length, 24);
  assert.equal(new Set(rows.map((r) => r.id)).size, 24);
  assert.equal(rows.filter((r) => r.prototype === 'astra-low-integrated').length, 12);
  assert.equal(rows[0].prototype, 'astra-low-integrated');
  assert.equal(rows[2].prototype, 'luna-high-standard');
  assert.throws(() => matrix({ ...study, replicatesPerCell: 2 }), /registered protocol/);
});

test('actual fake-model study executes tools, baseline research, fresh contexts and each lane probe', async (t) => {
  const options = fixtures();
  const paths = await temporary(t);
  const summary = await runStudy({ ...paths, runId: 'complete', study, ...options });
  assert.equal(summary.attempts.length, 24);
  assert.equal(summary.attempts.filter((r) => r.status === 'accepted').length, 24);
  assert.equal(options.sessions.length, 24);
  assert.equal(options.requests.length, 48);
  for (const row of summary.attempts) {
    assert.equal(row.calls, 2);
    assert.equal(row.probes.cadence, 2);
    assert.equal(row.toolRounds, row.prototype === 'astra-low-integrated' ? 1 : 0);
  }
  for (const call of options.requests) {
    assert.ok(call.maxOutputTokens <= options.execution.limits.maxOutputTokens);
    assert.equal(call.requestedReasoning, call.requestedModel === 'gpt-6-astra' ? 'low' : 'high');
    if (call.input.direction === 'Monkey D. Luffy')
      assert.ok(!JSON.stringify(call.input).includes('EXPLICIT-ONLY-DIRECTION'));
    if (call.stage === 'research') assert.equal(call.input.sources[0].id, 's1');
  }
  const firstTurns = options.requests.filter(
    (call) => call.stage === 'integrated-research-and-creation' && call.input.turnsRemaining === 7
  );
  assert.equal(firstTurns.length, 12);
  const firstRequest = JSON.parse(
    await readFile(
      path.join(paths.outputDir, 'complete', summary.attempts[0].id, 'call-1-request.json'),
      'utf8'
    )
  );
  assert.deepEqual(firstRequest.input.history, []);
});

test('one targeted repair per attempt; repairs preserve cadence behavior', async (t) => {
  const options = fixtures();
  options.model = {
    async generate(call) {
      const value =
        call.stage === 'research'
          ? knowledge()
          : call.stage === 'repair'
            ? { valid: true, cadence: 3 }
            : call.stage === 'integrated-research-and-creation'
              ? call.input.history.length
                ? { candidate: { valid: false, cadence: 1 }, research: knowledge() }
                : { toolCalls: [{ name: 'read_source', arguments: {} }] }
              : { valid: false, cadence: 1 };
      return { value, model: call.requestedModel, usage: { inputTokens: 100, outputTokens: 100 } };
    }
  };
  const summary = await runStudy({ ...(await temporary(t)), runId: 'repairs', study, ...options });
  for (const result of summary.attempts) {
    assert.equal(result.status, 'accepted');
    assert.equal(result.candidates.length, 2);
    assert.equal(result.callRecords.filter((call) => call.stage === 'repair').length, 1);
    assert.equal(result.probes.cadence, 3);
  }
});

test('ledger cap is serialized across concurrent reservations and both runs/lanes', async (t) => {
  const { ledgerPath } = await temporary(t);
  const ledger = createLedger(ledgerPath);
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, (_, i) =>
      ledger.reserve({
        id: `run-${i}/different-lane`,
        account: 'astra-low-integrated',
        amountUsd: 10
      })
    )
  );
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 3);
  assert.ok(
    results.find((result) => result.status === 'rejected').reason instanceof BudgetExceeded
  );
  assert.equal((await ledger.balances())[0].committedUsd, 30);
  await ledger.reserve({ id: 'other-prototype', account: 'luna-high-standard', amountUsd: 30 });
  assert.equal((await ledger.balances())[1].committedUsd, 30);
});

test('missing usage and failed calls retain reservations, and run IDs cannot be reused', async (t) => {
  const paths = await temporary(t);
  const options = fixtures();
  const baseGenerate = options.model.generate;
  options.model.generate = async (call) => {
    if (call.requestedModel === 'gpt-6-astra') throw Error('Synthetic transport failure');
    return { ...(await baseGenerate(call)), usage: undefined };
  };
  const summary = await runStudy({ ...paths, runId: 'unknown', study, ...options });
  assert.equal(summary.attempts.filter((r) => r.status === 'transport-failure').length, 12);
  assert.ok(summary.balances.every((b) => b.outstandingUsd > 0 && b.estimatedStandardUsd === 0));
  assert.equal(summary.balances[0].unknownUsage, 12);
  assert.equal(summary.balances[1].unknownUsage, 24);
  await assert.rejects(runStudy({ ...paths, runId: 'unknown', study, ...options }), /immutable/);
});

test('budget stop leaves planned slots unrun across both lanes and tracks', async (t) => {
  const options = fixtures();
  for (const rate of Object.values(options.execution.pricing))
    rate.reservationOutputPerMillion = 31000;
  const summary = await runStudy({ ...(await temporary(t)), runId: 'cap', study, ...options });
  assert.equal(options.requests.length, 0);
  assert.equal(summary.attempts.filter((r) => r.status === 'budget-limited').length, 24);
});

test('observed usage overrun retains actual charges and stops that prototype', async (t) => {
  const options = fixtures();
  const generate = options.model.generate;
  options.model.generate = async (call) => ({
    ...(await generate(call)),
    usage: { inputTokens: 20_000_000, outputTokens: 1 }
  });
  const summary = await runStudy({ ...(await temporary(t)), runId: 'overrun', study, ...options });
  assert.equal(summary.attempts.filter((r) => r.status === 'accounting-overrun').length, 2);
  assert.equal(summary.attempts.filter((r) => r.status === 'budget-limited').length, 22);
  assert.ok(summary.balances.every((b) => b.spentAllowanceUsd > 30 && b.estimatedStandardUsd > 20));
});

test('Astra retrieval rounds stop at five and do not create unregistered retries', async (t) => {
  const options = fixtures();
  const generate = options.model.generate;
  options.model.generate = async (call) =>
    call.requestedModel === 'gpt-6-astra'
      ? {
          value: { toolCalls: [{ name: 'read_source', arguments: {} }] },
          model: call.requestedModel,
          usage: { inputTokens: 1, outputTokens: 1 }
        }
      : generate(call);
  const summary = await runStudy({
    ...(await temporary(t)),
    runId: 'tool-bound',
    study,
    ...options
  });
  for (const row of summary.attempts.filter((r) => r.prototype === 'astra-low-integrated')) {
    assert.equal(row.status, 'research-failure');
    assert.equal(row.calls, 6);
    assert.equal(row.toolRounds, 5);
  }
});

test('model identity mismatch and invalid research provenance fail without extra calls', async (t) => {
  const options = fixtures();
  options.model.generate = async (call) => ({
    value: {
      ...knowledge(),
      claims: [{ text: 'bad citation', sourceIds: ['missing'], kind: 'evidence' }]
    },
    model: call.requestedModel === 'gpt-6-astra' ? 'gpt-5.6-luna' : call.requestedModel,
    usage: { inputTokens: 1, outputTokens: 1 }
  });
  const summary = await runStudy({ ...(await temporary(t)), runId: 'invalid', study, ...options });
  assert.ok(summary.attempts.every((r) => r.calls === 1));
  assert.equal(summary.attempts.filter((r) => r.status === 'research-failure').length, 12);
  assert.equal(summary.attempts.filter((r) => r.status === 'transport-failure').length, 12);
});

test('live mode fails closed and context limits block before dispatch', async (t) => {
  assert.throws(() => assertExecution(study, { ...execution(), mode: 'live' }), /gates/);
  const options = fixtures();
  options.execution.limits.maxInputBytes = 10;
  const summary = await runStudy({
    ...(await temporary(t)),
    runId: 'context-bound',
    study,
    ...options
  });
  assert.equal(options.requests.length, 0);
  assert.ok(summary.attempts.every((r) => r.calls === 0));
});

test('a model timeout aborts the request and retains unknown usage without retry', async (t) => {
  const options = fixtures();
  options.execution.limits.callTimeoutMs = 5;
  const signals = [];
  options.model.generate = (call) => {
    signals.push(call.signal);
    return new Promise(() => {});
  };
  const summary = await runStudy({ ...(await temporary(t)), runId: 'timeout', study, ...options });
  assert.equal(signals.length, 24);
  assert.ok(signals.every((signal) => signal.aborted));
  assert.ok(
    summary.attempts.every((attempt) => attempt.calls === 1 && attempt.failure.code === 'timeout')
  );
  assert.ok(
    summary.balances.every((balance) => balance.unknownUsage === 12 && balance.outstandingUsd > 0)
  );
});

test('overrun above the long-context threshold applies whole-request input and output rates', async (t) => {
  const options = fixtures();
  const paths = await temporary(t);
  const generate = options.model.generate;
  options.model.generate = async (call) => ({
    ...(await generate(call)),
    usage: {
      inputTokens: call.requestedModel === 'gpt-6-astra' ? 300000 : 272000,
      outputTokens: 1000
    }
  });
  const summary = await runStudy({ ...paths, runId: 'long-context-overrun', study, ...options });
  const astra = summary.balances.find((balance) => balance.account === 'astra-low-integrated');
  const luna = summary.balances.find((balance) => balance.account === 'luna-high-standard');
  assert.equal(astra.estimatedStandardUsd, (300000 * 1 * 2 + 1000 * 2 * 1.5) / 1e6);
  assert.equal(astra.spentAllowanceUsd, (300000 * 2 * 2 + 1000 * 4 * 1.5) / 1e6);
  assert.equal(luna.estimatedStandardUsd, (272000 * 1 + 1000 * 2) / 1e6);
  assert.equal(luna.spentAllowanceUsd, (272000 * 2 + 1000 * 4) / 1e6);
  const settlements = (await createLedger(paths.ledgerPath).rows()).filter(
    (row) => row.kind === 'settle'
  );
  assert.deepEqual(
    settlements.map((row) => row.longContext),
    [true, false]
  );
  assert.equal(
    summary.attempts.filter((attempt) => attempt.status === 'accounting-overrun').length,
    2
  );
  assert.equal(
    summary.attempts.filter((attempt) => attempt.status === 'budget-limited').length,
    22
  );
  assert.ok(
    summary.attempts.every((attempt) => attempt.continuity === 'One Piece manga continuity')
  );
});

test('Astra cannot finish without readable evidence and a source-cited research sidecar', async (t) => {
  const options = fixtures();
  const generate = options.model.generate;
  options.model.generate = (call) =>
    call.requestedModel === 'gpt-6-astra'
      ? {
          value: { candidate: { valid: true }, research: knowledge() },
          model: call.requestedModel,
          usage: { inputTokens: 1, outputTokens: 1 }
        }
      : generate(call);
  const summary = await runStudy({
    ...(await temporary(t)),
    runId: 'no-evidence',
    study,
    ...options
  });
  assert.equal(
    summary.attempts.filter((attempt) => attempt.status === 'research-failure').length,
    12
  );
});

test('a token-bound violation blocks the account across future run IDs even below USD30', async (t) => {
  const { ledgerPath } = await temporary(t);
  const ledger = createLedger(ledgerPath);
  await ledger.reserve({ id: 'old-run/model-1', account: 'astra-low-integrated', amountUsd: 1 });
  await ledger.settle({
    id: 'old-run/model-1',
    knownUsage: true,
    overrun: true,
    allowanceUsd: 2,
    estimatedStandardUsd: 1
  });
  await assert.rejects(
    ledger.reserve({ id: 'new-run/model-1', account: 'astra-low-integrated', amountUsd: 1 }),
    BudgetExceeded
  );
  assert.equal((await ledger.balances())[0].spentAllowanceUsd, 2);
});

test('probe failure preserves accepted validation, candidates and every planned attempt', async (t) => {
  const options = fixtures();
  options.lanes['manga-mayhem'].probe = () => {
    throw Error('Synthetic probe runtime failure.');
  };
  const summary = await runStudy({
    ...(await temporary(t)),
    runId: 'probe-failure',
    study,
    ...options
  });
  assert.equal(summary.attempts.length, 24);
  const failedProbes = summary.attempts.filter((attempt) => attempt.status === 'probe-failure');
  assert.equal(failedProbes.length, 12);
  assert.equal(summary.attempts.filter((attempt) => attempt.status === 'accepted').length, 12);
  for (const attempt of failedProbes) {
    assert.equal(attempt.mechanicalAcceptance, 'accepted');
    assert.equal(attempt.validation.valid, true);
    assert.equal(attempt.finalCandidate.valid, true);
    assert.equal(attempt.candidates.length, 1);
    assert.equal(attempt.calls, 2);
    assert.equal(attempt.failure.stage, 'probes');
    assert.equal(attempt.probes, null);
  }
  assert.ok(summary.attempts.every((attempt) => attempt.mechanicalAcceptance === 'accepted'));
});
