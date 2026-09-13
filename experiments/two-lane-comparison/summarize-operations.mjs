// Read-only operational reporting after completion. No candidate or source text is emitted.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const finite = (value) => Number.isFinite(value) && value >= 0;
const tokens = (value) => Number.isSafeInteger(value) && value >= 0;
const sum = (items, get) => items.reduce((total, item) => total + (get(item) ?? 0), 0);
const countBy = (items, get) =>
  items.reduce((counts, item) => {
    const key = get(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
function duration(values) {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  if (!sorted.length)
    return {
      observations: 0,
      totalMs: 0,
      medianMs: null,
      p95Ms: null,
      minimumMs: null,
      maximumMs: null
    };
  const middle = Math.floor(sorted.length / 2);
  return {
    observations: sorted.length,
    totalMs: sum(sorted, (v) => v),
    medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    minimumMs: sorted[0],
    maximumMs: sorted.at(-1)
  };
}
function amount(reservation, settlement) {
  const known = settlement?.knownUsage === true;
  return {
    id: reservation.id,
    account: reservation.account,
    attempt: reservation.attempt,
    stage: reservation.stage ?? 'unknown',
    kind: reservation.stage === 'research-tool' ? 'tool' : 'model',
    reservedUsd: finite(reservation.amountUsd) ? reservation.amountUsd : null,
    knownUsage: known,
    usage: settlement?.usage ?? null,
    knownStandardUsd:
      known && finite(settlement.estimatedStandardUsd) ? settlement.estimatedStandardUsd : null,
    knownAllowanceUsd: known && finite(settlement.allowanceUsd) ? settlement.allowanceUsd : null,
    retainedReservationUsd: !known && finite(reservation.amountUsd) ? reservation.amountUsd : 0,
    settlement: !settlement ? 'unsettled' : known ? 'known' : 'unknown-usage',
    overrun: settlement?.overrun === true
  };
}
function estimatesWithoutLedger(call, attempt, rates) {
  const known =
    call.knownUsage === true && tokens(call.usage?.inputTokens) && tokens(call.usage?.outputTokens);
  const long = known && call.usage.inputTokens > rates?.longContextThresholdInputTokens;
  const inputMultiplier = long ? rates.longContextInputMultiplier : 1;
  const outputMultiplier = long ? rates.longContextOutputMultiplier : 1;
  const estimate = (input, output) =>
    known && finite(input) && finite(output)
      ? (call.usage.inputTokens * input * inputMultiplier +
          call.usage.outputTokens * output * outputMultiplier) /
        1e6
      : null;
  return {
    id: call.id,
    account: attempt.prototype,
    attempt: attempt.id,
    stage: call.stage ?? 'unknown',
    kind: 'model',
    reservedUsd: finite(call.amountUsd) ? call.amountUsd : null,
    knownUsage: known,
    usage: call.usage ?? null,
    knownStandardUsd: estimate(rates?.inputPerMillion, rates?.outputPerMillion),
    knownAllowanceUsd: estimate(
      rates?.reservationInputPerMillion,
      rates?.reservationOutputPerMillion
    ),
    retainedReservationUsd: !known && finite(call.amountUsd) ? call.amountUsd : 0,
    settlement: 'not-ledger-verified',
    overrun: call.error?.code === 'accounting-overrun'
  };
}
function ledgerBalances(rows) {
  const reservations = rows.filter((row) => row.kind === 'reserve');
  const settlements = new Map(
    rows.filter((row) => row.kind === 'settle').map((row) => [row.id, row])
  );
  return [...new Set(reservations.map((row) => row.account))].map((account) => {
    const charges = reservations
      .filter((row) => row.account === account)
      .map((row) => amount(row, settlements.get(row.id)));
    const outstandingUsd = sum(charges, (row) => row.retainedReservationUsd);
    const spentAllowanceUsd = sum(charges, (row) => row.knownAllowanceUsd);
    return {
      account,
      outstandingUsd,
      spentAllowanceUsd,
      estimatedStandardUsd: sum(charges, (row) => row.knownStandardUsd),
      unknownUsage: charges.filter((row) => row.settlement === 'unknown-usage').length,
      committedUsd: outstandingUsd + spentAllowanceUsd
    };
  });
}
function aggregate(slots) {
  const calls = slots.flatMap((slot) => slot.callRecords);
  const charges = slots.flatMap((slot) => slot.charges);
  const modelCharges = charges.filter((charge) => charge.kind === 'model');
  const stages = [...new Set(calls.map((call) => call.stage))];
  return {
    plannedSlots: slots.length,
    startedAttempts: slots.filter((slot) => slot.started).length,
    attemptsWithRecordedCalls: slots.filter((slot) => slot.callRecords.length > 0).length,
    unstartedSlots: slots.filter((slot) => !slot.started).length,
    statuses: countBy(slots, (slot) => slot.status),
    mechanicalAcceptance: countBy(slots, (slot) => slot.mechanicalAcceptance),
    recordedModelCalls: calls.length,
    modelReservations: modelCharges.length,
    repairCalls: calls.filter((call) => call.stage === 'repair').length,
    attemptsRepaired: slots.filter((slot) =>
      slot.callRecords.some((call) => call.stage === 'repair')
    ).length,
    sourceOperations: sum(slots, (slot) => slot.sourceOperations),
    sourceOperationFailures: sum(slots, (slot) => slot.sourceOperationFailures),
    failedCapturedSources: sum(slots, (slot) => slot.failedCapturedSources),
    modelCallFailures: calls.filter((call) => call.failed).length,
    modelCallsByStage: countBy(calls, (call) => call.stage),
    tokenUsage: {
      completeUsageCalls: modelCharges.filter((charge) => charge.knownUsage).length,
      incompleteOrUnknownUsageCalls: modelCharges.filter((charge) => !charge.knownUsage).length,
      knownInputTokens: sum(modelCharges, (charge) =>
        tokens(charge.usage?.inputTokens) ? charge.usage.inputTokens : 0
      ),
      knownOutputTokens: sum(modelCharges, (charge) =>
        tokens(charge.usage?.outputTokens) ? charge.usage.outputTokens : 0
      ),
      inputUsageMissingCalls: modelCharges.filter((charge) => !tokens(charge.usage?.inputTokens))
        .length,
      outputUsageMissingCalls: modelCharges.filter((charge) => !tokens(charge.usage?.outputTokens))
        .length
    },
    cost: {
      knownStandardApiEstimateUsd: sum(charges, (charge) => charge.knownStandardUsd),
      chargesWithoutStandardEstimate: charges.filter((charge) => charge.knownStandardUsd === null)
        .length,
      knownConservativeAllowanceUsd: sum(charges, (charge) => charge.knownAllowanceUsd),
      retainedUnknownOrUnsettledReservationsUsd: sum(
        charges,
        (charge) => charge.retainedReservationUsd
      ),
      committedConservativeAllowanceUsd: sum(
        charges,
        (charge) => (charge.knownAllowanceUsd ?? 0) + charge.retainedReservationUsd
      ),
      originalReservationsUsd: sum(charges, (charge) => charge.reservedUsd),
      settledUnknownUsageReservations: charges.filter(
        (charge) => charge.settlement === 'unknown-usage'
      ).length,
      unsettledReservations: charges.filter((charge) => charge.settlement === 'unsettled').length,
      overrunSettlements: charges.filter((charge) => charge.overrun).length,
      toolReservations: charges.filter((charge) => charge.kind === 'tool').length,
      isSubscriptionInvoice: false
    },
    latency: {
      attempt: duration(slots.map((slot) => slot.latencyMs)),
      modelCalls: duration(calls.map((call) => call.latencyMs)),
      modelCallsByStage: Object.fromEntries(
        stages.map((stage) => [
          stage,
          duration(calls.filter((call) => call.stage === stage).map((call) => call.latencyMs))
        ])
      ),
      recordedSourceOperations: duration(slots.flatMap((slot) => slot.sourceLatencies))
    }
  };
}

export async function summarizeOperations({ runDirectory, ledgerPath }) {
  const run = path.resolve(runDirectory);
  const summary = await readJson(path.join(run, 'summary.json'));
  if (!summary.endedAt || !Array.isArray(summary.attempts))
    throw Error('A completed run summary is required.');
  const started = await readJson(path.join(run, 'started.json'));
  const warnings = [];
  const file = ledgerPath ?? path.resolve(run, '../../call-ledger.jsonl');
  let rows = null;
  try {
    const body = await readFile(file, 'utf8');
    if (body && !body.endsWith('\n')) throw Error('Ledger has an incomplete trailing row.');
    rows = body
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    warnings.push(
      'Ledger unavailable. Model-call estimates are reconstructed from retained usage and frozen requested-model rates; ledger reconciliation and tool accounting remain unavailable.'
    );
  }
  const runPrefix = `${summary.runId}/`;
  const runReservations =
    rows?.filter((row) => row.kind === 'reserve' && row.id?.startsWith(runPrefix)) ?? [];
  const settlements = new Map(
    (rows ?? []).filter((row) => row.kind === 'settle').map((row) => [row.id, row])
  );
  const prototypeModels = new Map(
    started.study.prototypes.map((prototype) => [prototype.id, prototype.model])
  );
  const slots = summary.attempts.map((attempt) => {
    const recorded = Array.isArray(attempt.callRecords) ? attempt.callRecords : [];
    const sourceEvents = (attempt.retrievalEvents ?? []).filter((event) =>
      ['research-operation', 'research-operation-failed'].includes(event.type)
    );
    const charges = rows
      ? runReservations
          .filter((reservation) => reservation.attempt === attempt.id)
          .map((reservation) => amount(reservation, settlements.get(reservation.id)))
      : recorded.map((call) =>
          estimatesWithoutLedger(
            call,
            attempt,
            started.execution.pricing?.[prototypeModels.get(attempt.prototype)]
          )
        );
    if (attempt.calls !== recorded.length)
      warnings.push(`Reported call count disagrees with retained call records for ${attempt.id}.`);
    if (rows)
      for (const call of recorded) {
        const charge = charges.find((row) => row.id === call.id);
        if (!charge) warnings.push(`Missing ledger reservation for ${call.id}.`);
        else if (finite(call.amountUsd) && Math.abs(call.amountUsd - charge.reservedUsd) > 1e-8)
          warnings.push(`Reservation amount mismatch for ${call.id}.`);
        if (charge && typeof call.knownUsage === 'boolean' && call.knownUsage !== charge.knownUsage)
          warnings.push(
            `Usage completeness differs between call record and ledger for ${call.id}.`
          );
        if (charge)
          for (const field of ['inputTokens', 'outputTokens'])
            if (
              tokens(call.usage?.[field]) &&
              tokens(charge.usage?.[field]) &&
              call.usage[field] !== charge.usage[field]
            )
              warnings.push(`Recorded ${field} differs from ledger settlement for ${call.id}.`);
      }
    return {
      attemptId: attempt.id,
      lane: attempt.lane,
      track: attempt.track,
      prototype: attempt.prototype,
      repeat: attempt.repeat,
      started: Array.isArray(attempt.callRecords),
      status: attempt.status,
      mechanicalAcceptance:
        attempt.mechanicalAcceptance ??
        (attempt.validation?.valid === true
          ? 'accepted'
          : attempt.validation?.valid === false
            ? 'rejected'
            : 'unchecked'),
      failureStage: attempt.failure?.stage ?? null,
      failureCode: attempt.failure?.code ?? null,
      callRecords: recorded.map((call) => ({
        id: call.id,
        stage: call.stage ?? 'unknown',
        latencyMs: finite(call.latencyMs) ? call.latencyMs : null,
        failed: !!call.error
      })),
      charges,
      sourceOperations: sourceEvents.length,
      sourceOperationFailures: sourceEvents.filter(
        (event) => event.type === 'research-operation-failed'
      ).length,
      failedCapturedSources: (attempt.sourceSnapshot?.sources ?? []).filter(
        (source) => source.status === 'failed'
      ).length,
      sourceLatencies: sourceEvents.map((event) => event.elapsedMs).filter(finite),
      latencyMs: finite(attempt.latencyMs) ? attempt.latencyMs : null
    };
  });
  const planned = started.study.plannedAttempts;
  if (slots.length !== planned)
    warnings.push(
      `The completed summary records ${slots.length} slots against ${planned} planned slots.`
    );
  if (new Set(slots.map((slot) => slot.attemptId)).size !== slots.length)
    warnings.push('Duplicate attempt IDs appear in the summary.');
  const grouped = (keys) => {
    const groups = new Map();
    for (const slot of slots) {
      const key = keys.map((field) => slot[field]).join('/');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(slot);
    }
    return [...groups.values()].map((items) => ({
      group: Object.fromEntries(keys.map((key) => [key, items[0][key]])),
      ...aggregate(items)
    }));
  };
  const atCompletion =
    rows?.filter((row) => typeof row.at === 'string' && row.at <= summary.endedAt) ?? null;
  const lifetime = atCompletion ? ledgerBalances(atCompletion) : null;
  const comparisons = (summary.balances ?? []).map((reported) => {
    const observed = lifetime?.find((balance) => balance.account === reported.account);
    return {
      account: reported.account,
      ledgerAtCompletionAvailable: !!observed,
      differences: observed
        ? Object.fromEntries(
            [
              'outstandingUsd',
              'spentAllowanceUsd',
              'estimatedStandardUsd',
              'unknownUsage',
              'committedUsd'
            ].map((key) => [key, reported[key] - observed[key]])
          )
        : null
    };
  });
  if (rows?.some((row) => typeof row.at !== 'string'))
    warnings.push(
      'Some ledger rows lack timestamps and cannot participate in lifetime reconciliation at completion.'
    );
  const assignedReservations = new Set(
    slots.flatMap((slot) => slot.charges.map((charge) => charge.id))
  );
  const orphanReservations = runReservations
    .filter((row) => !assignedReservations.has(row.id))
    .map((row) => ({ id: row.id, account: row.account, amountUsd: row.amountUsd }));
  if (orphanReservations.length)
    warnings.push(
      'Some run reservations have no matching summary slot. They are listed separately and excluded from grouped totals.'
    );
  const elapsed = Date.parse(summary.endedAt) - Date.parse(started.at);
  return {
    schemaVersion: 'two-lane-operational-report/0.1',
    runId: summary.runId,
    mode: summary.mode,
    completedAt: summary.endedAt,
    registeredPlannedSlots: planned,
    recordedSlots: slots.length,
    runWallTimeMs: finite(elapsed) ? elapsed : null,
    accountingBasis: rows
      ? 'retained ledger settlements and reservations'
      : 'retained call usage and frozen requested-model rates; not ledger-verified',
    qualifications: [
      'Known standard cost is an API-equivalent estimate based on requested-model rates, not a subscription invoice or attestation of proxy billing.',
      'Unknown usage is not zero. Retained reservations are conservative allowances, not measured charges.',
      'Original reservation totals can exceed the cap across settled calls; the cap concerns committed allowance per prototype over the entire ledger.',
      'Started attempts have retained callRecords, including empty arrays for failures before a model call. Unstarted budget-limited slots stay in the planned matrix.',
      'Stage latency covers recorded model calls and source operations only; validation, probing and other time are included in attempt elapsed time without invented stage breakdowns.',
      'Source operation failures and failed captured-source records may describe the same event and must not be added as unique failures.'
    ],
    overall: aggregate(slots),
    byPrototype: grouped(['prototype']),
    byLane: grouped(['lane']),
    byTrack: grouped(['track']),
    byLaneTrackPrototype: grouped(['lane', 'track', 'prototype']),
    slots: slots.map((slot) => ({
      attemptId: slot.attemptId,
      lane: slot.lane,
      track: slot.track,
      prototype: slot.prototype,
      repeat: slot.repeat,
      started: slot.started,
      status: slot.status,
      mechanicalAcceptance: slot.mechanicalAcceptance,
      failureStage: slot.failureStage,
      failureCode: slot.failureCode,
      metrics: aggregate([slot])
    })),
    reconciliation: {
      ledgerAvailable: rows !== null,
      lifetimeLedgerBalancesAtCompletion: lifetime,
      reportedBalanceDifferences: comparisons,
      orphanRunReservations: orphanReservations
    },
    warnings
  };
}

export async function main(args = process.argv.slice(2)) {
  if (
    ![2, 4].includes(args.length) ||
    args[0] !== '--run-dir' ||
    (args.length === 4 && args[2] !== '--ledger')
  )
    throw Error(
      'Usage: node summarize-operations.mjs --run-dir <completed-run> [--ledger <ledger.jsonl>]'
    );
  return summarizeOperations({ runDirectory: args[1], ledgerPath: args[3] });
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main()
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
