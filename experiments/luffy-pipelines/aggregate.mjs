import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('./', import.meta.url));
const warnings = [];
const read = async (relative) => {
  try {
    return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') warnings.push({ file: relative, error: String(error) });
    return null;
  }
};
const files = await readdir(root, { recursive: true });
const study = await read('study.json');
const pricing = study.pricing;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const round = (value) => Math.round(value * 1e8) / 1e8;
const counts = (values) =>
  Object.fromEntries(
    [...new Set(values)]
      .filter(Boolean)
      .sort()
      .map((code) => [code, values.filter((value) => value === code).length])
  );
const idOf = (slot) => `${slot.track}-${slot.variant}-${slot.effort}-${slot.replicate}`;
const isSlot = (slot) =>
  slot &&
  ['hidden', 'brief'].includes(slot.track) &&
  typeof slot.variant === 'string' &&
  /^[a-z][a-z0-9-]*$/.test(slot.variant) &&
  ['low', 'medium', 'high', 'xhigh'].includes(slot.effort) &&
  Number.isInteger(slot.replicate) &&
  slot.replicate > 0;
const ignoredOutcomeFiles = files
  .filter((file) => /^slots-[^/]+\.outcomes\.json$/.test(file))
  .sort();
const slots = new Map();
const initial = new Set();
for (const file of files.filter((file) => /^slots-[a-z0-9-]+\.json$/.test(file)).sort()) {
  const entries = await read(file);
  if (!Array.isArray(entries)) {
    warnings.push({ code: 'INVALID_SLOT_MANIFEST', file });
    continue;
  }
  for (const [index, slot] of entries.entries()) {
    if (!isSlot(slot)) {
      warnings.push({ code: 'INVALID_SLOT_ROW_SKIPPED', file, index });
      continue;
    }
    const id = idOf(slot);
    slots.set(id, { ...slot, manifests: [...(slots.get(id)?.manifests ?? []), file] });
    if (file === 'slots-initial.json') initial.add(id);
  }
}
const ledgerRows = [];
for (const [index, line] of (await readFile(path.join(root, 'call-ledger.jsonl'), 'utf8'))
  .split('\n')
  .entries()) {
  if (!line.trim()) continue;
  try {
    ledgerRows.push(JSON.parse(line));
  } catch {
    warnings.push({ code: 'UNPARSED_LEDGER_LINE', line: index + 1 });
  }
}
const calls = new Map();
for (const row of ledgerRows) {
  if (!calls.has(row.callId))
    calls.set(row.callId, { callId: row.callId, runId: row.runId, rows: [] });
  calls.get(row.callId).rows.push(row);
}
const callSummary = [...calls.values()].map((call) => {
  const reservation = call.rows.find((row) => row.event === 'reserved');
  const terminal = call.rows.findLast((row) => ['completed', 'failed'].includes(row.event));
  const known =
    terminal?.event === 'completed' &&
    finite(terminal.usage?.inputTokens) &&
    finite(terminal.usage?.outputTokens);
  const standard = known
    ? (terminal.usage.inputTokens *
        (terminal.usage.inputTokens > 272000 ? 0.4 : pricing.standardInputPerMillionUsd) +
        terminal.usage.outputTokens *
          (terminal.usage.inputTokens > 272000 ? 1.8 : pricing.standardOutputPerMillionUsd)) /
      1e6
    : null;
  const allowance = known
    ? (terminal.allowanceUsd ??
      (terminal.usage.inputTokens * pricing.conservativeInputPerMillionUsd +
        terminal.usage.outputTokens * pricing.conservativeOutputPerMillionUsd) /
        1e6)
    : (reservation?.reservedUsd ?? null);
  return {
    callId: call.callId,
    runId: call.runId,
    stage: terminal?.stage ?? reservation?.stage,
    status: terminal?.event ?? 'reserved-pending',
    streaming: terminal?.streaming ?? reservation?.streaming ?? null,
    usage: known ? terminal.usage : null,
    elapsedMs: terminal?.elapsedMs ?? null,
    knownStandardUsd: standard === null ? null : round(standard),
    conservativeAllowanceUsd: allowance === null ? null : round(allowance),
    allowanceBasis: known ? 'completed-usage' : 'retained-reservation',
    errorCode: terminal?.errorCode ?? null
  };
});
for (const call of callSummary)
  if (!slots.has(call.runId)) {
    const parts = call.runId.match(/^([^-]+)-(.+)-(low|medium|high|xhigh)-(\d+)$/);
    if (parts)
      slots.set(call.runId, {
        track: parts[1],
        variant: parts[2],
        effort: parts[3],
        replicate: Number(parts[4]),
        manifests: []
      });
  }
for (const file of files.filter((file) => /^[^/]+\/runs\/[^/]+\/result\.json$/.test(file))) {
  const [, runId] = file.split('/runs/');
  const id = runId.split('/')[0];
  if (!slots.has(id)) {
    const parts = id.match(/^([^-]+)-(.+)-(low|medium|high|xhigh)-(\d+)$/);
    if (parts)
      slots.set(id, {
        track: parts[1],
        variant: parts[2],
        effort: parts[3],
        replicate: Number(parts[4]),
        manifests: []
      });
  }
}
function accounting(rows) {
  const known = rows.filter((row) => row.usage);
  return {
    calls: rows.length,
    completed: rows.filter((row) => row.status === 'completed').length,
    failed: rows.filter((row) => row.status === 'failed').length,
    pending: rows.filter((row) => row.status === 'reserved-pending').length,
    inputTokensKnown: known.reduce((sum, row) => sum + row.usage.inputTokens, 0),
    outputTokensKnown: known.reduce((sum, row) => sum + row.usage.outputTokens, 0),
    usageUnknownCalls: rows.length - known.length,
    knownStandardUsd: round(rows.reduce((sum, row) => sum + (row.knownStandardUsd ?? 0), 0)),
    conservativeAllowanceUsd: round(
      rows.reduce((sum, row) => sum + (row.conservativeAllowanceUsd ?? 0), 0)
    ),
    allowanceUnknownCalls: rows.filter((row) => row.conservativeAllowanceUsd === null).length
  };
}
const runs = [];
for (const [runId, slot] of [...slots].sort(([a], [b]) => a.localeCompare(b))) {
  const dir = `${slot.variant}/runs/${runId}`;
  const result = await read(`${dir}/result.json`);
  const evaluation = await read(`${dir}/evaluation.json`);
  const execution = await read(`execution-review/candidates/${runId}.json`);
  const unit = result?.output ?? result?.candidate ?? (await read(`${dir}/unit.json`));
  const runCalls = callSummary.filter((row) => row.runId === runId);
  const metadataCalls = result?.metadata?.calls ?? [];
  const actualStages = runCalls.length ? runCalls : metadataCalls;
  const validationCodes = [];
  for (const section of Object.values(result?.validation ?? {}))
    if (Array.isArray(section?.issues))
      validationCodes.push(...section.issues.map((issue) => issue.code));
  for (const key of ['schemaAndSemantics', 'profile', 'request'])
    validationCodes.push(...(evaluation?.validity?.[key] ?? []).map((issue) => issue.code));
  for (const failure of evaluation?.validity?.compilation ?? [])
    validationCodes.push(...failure.issues.map((issue) => issue.code));
  const findings = evaluation?.diagnostics?.reviewFindings;
  const probes = evaluation?.distantTargetProbe;
  const baseProbe = probes?.find(
    (probe) => probe.selection.upgradeIds.length === 0 && !probe.selection.formIds?.length
  );
  const cohort =
    slot.variant === 'transport'
      ? 'transport-only'
      : initial.has(runId)
        ? 'initial-nonstream'
        : 'streamed-study';
  runs.push({
    runId,
    ...slot,
    cohort,
    status: result?.status ?? (runCalls.length ? 'running-or-interrupted' : 'not-started'),
    candidatePresent: Boolean(unit),
    countedAsUnitAttempt: cohort !== 'transport-only' && Boolean(result || runCalls.length),
    error: result?.error ?? null,
    resultFile: result ? `${dir}/result.json` : null,
    callsReported: result?.metadata?.modelCalls ?? null,
    repairsReported: result?.metadata?.repairs ?? null,
    repairsByActualStage: actualStages.filter((call) => /repair/i.test(call.stage ?? '')).length,
    stages: actualStages.map((call) => ({
      stage: call.stage,
      status: call.status ?? (call.completed ? 'completed' : 'incomplete')
    })),
    elapsedMs: result?.metadata?.elapsedMs ?? null,
    accounting: accounting(runCalls),
    validation: {
      status: evaluation?.validity?.status ?? null,
      schemaAndSemanticsPassed:
        unit && evaluation ? evaluation.validity.schemaAndSemantics.length === 0 : null,
      profileIssueCodes: counts((evaluation?.validity?.profile ?? []).map((issue) => issue.code)),
      codes: counts(validationCodes),
      evaluationOutcome: evaluation?.outcome ?? null
    },
    findings: findings ? counts(findings.map((finding) => finding.code)) : null,
    buildCount: evaluation?.evaluations?.length ?? null,
    distantProbe: probes?.length
      ? {
          sampledBuilds: probes.length,
          buildsWithDamage: probes.filter((probe) => probe.report.damageHitPoints > 0).length,
          baseDamageHitPoints: baseProbe?.report.damageHitPoints ?? null,
          maximumDamageHitPoints: probes.length
            ? Math.max(...probes.map((probe) => probe.report.damageHitPoints))
            : null
        }
      : null,
    forms: unit
      ? {
          declared: unit.forms?.length ?? null,
          names: unit.forms?.map((form) => form.name) ?? [],
          individuallyProbed: evaluation?.formProbes?.length ?? null
        }
      : null,
    executionReview: execution
      ? {
          status: execution.status,
          findingCodes: counts(execution.findings.map((finding) => finding.code)),
          formInventoryCount: execution.formInventory.length,
          file: `execution-review/candidates/${runId}.json`
        }
      : null
  });
}
const cohortSummary = (cohort) => {
  const members = runs.filter((run) => run.cohort === cohort);
  return {
    registered: members.length,
    started: members.filter((run) => run.countedAsUnitAttempt).length,
    resultFiles: members.filter((run) => run.resultFile).length,
    candidates: members.filter((run) => run.candidatePresent && run.countedAsUnitAttempt).length,
    statuses: counts(members.map((run) => run.status)),
    accounting: accounting(
      callSummary.filter((call) => members.some((run) => run.runId === call.runId))
    )
  };
};
const summary = {
  generatedAt: new Date().toISOString(),
  scope: 'Saved artifacts only; no generation, rescoring or model calls.',
  overallQualityScore: null,
  accountingNotes: [
    'Known standard cost excludes unknown usage and is not a complete bill.',
    'Conservative allowance includes retained failed/unknown/pending call reservations.',
    'Stage repair count includes fragment repairs that metadata.repairs may omit.',
    'Transport-only fixture excluded from all unit attempt and candidate counts.',
    'Initial eight nonstream failures retained in a separate cohort; streaming cohorts remain small development samples.',
    'Distant probe damage does not establish faithful long-range melee. Findings concern sampled scenarios only.',
    'Schema-valid candidates may execute probes while failing classic-profile constraints; executable observations do not override invalid status.'
  ],
  pricing,
  totals: accounting(callSummary),
  cohorts: Object.fromEntries(
    ['initial-nonstream', 'streamed-study', 'transport-only'].map((cohort) => [
      cohort,
      cohortSummary(cohort)
    ])
  ),
  discovery: {
    ignoredOutcomeFiles,
    reason:
      'Outcome records are not slot definitions; only validated direct slot rows register runs.'
  },
  warnings,
  runs,
  calls: callSummary
};
await writeFile(path.join(root, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
const money = (value) => `$${value.toFixed(4)}`;
const esc = (value) =>
  String(value ?? '?')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
const lines = [
  '# Saved pipeline comparison',
  '',
  `Generated ${summary.generatedAt}. No overall quality score.`,
  '',
  `Known standard cost ${money(summary.totals.knownStandardUsd)}; conservative allowance ${money(summary.totals.conservativeAllowanceUsd)} including ${summary.totals.usageUnknownCalls} unknown-usage calls.`,
  '',
  'Calls are ledger reservations. Repairs show reported / actual repair-stage calls. Z/L/R are zero-gain, low-gain and regressing sampled transitions. Reach shows damaging builds / sampled builds at 50 units; it does not prove melee fidelity.',
  ''
];
for (const cohort of ['streamed-study', 'initial-nonstream', 'transport-only']) {
  lines.push(
    `## ${cohort}`,
    '',
    '| Run | Status / candidate | Calls; repairs | Seconds | Tokens in/out known | USD known / allowance | Z/L/R | Reach; forms | Validation / execution review |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'
  );
  for (const run of runs.filter((run) => run.cohort === cohort)) {
    const f = run.findings;
    const observed = f
      ? `${f.SCENARIO_NO_UTILITY_GAIN ?? 0}/${f.SCENARIO_LOW_UTILITY_GAIN ?? 0}/${f.SCENARIO_REGRESSING_UPGRADE_EDGE ?? 0}`
      : '?';
    const reach = run.distantProbe
      ? `${run.distantProbe.buildsWithDamage}/${run.distantProbe.sampledBuilds}`
      : 'unavailable';
    const codes =
      Object.keys(run.validation.codes).join(', ') ||
      run.error?.code ||
      run.validation.status ||
      '?';
    const execution = run.executionReview
      ? Object.entries(run.executionReview.findingCodes)
          .map(([code, n]) => `${code}:${n}`)
          .join(', ')
      : 'not reviewed';
    lines.push(
      `| ${run.runId} | ${run.status} / ${run.candidatePresent ? 'yes' : 'no'} | ${run.accounting.calls}; ${run.repairsReported ?? '?'}/${run.repairsByActualStage} | ${run.elapsedMs === null ? '?' : (run.elapsedMs / 1000).toFixed(1)} | ${run.accounting.inputTokensKnown}/${run.accounting.outputTokensKnown}${run.accounting.usageUnknownCalls ? ' + unknown' : ''} | ${money(run.accounting.knownStandardUsd)} / ${money(run.accounting.conservativeAllowanceUsd)} | ${observed} | ${reach}; ${run.forms?.declared ?? '?'} | ${esc(codes)}; ${esc(execution)} |`
    );
  }
  lines.push('');
}
lines.push(
  'Complete stage lists, validation codes, form names, optional execution-review references and per-call accounting are in [summary.json](summary.json). Source fidelity and adaptation judgments remain separate.'
);
await writeFile(path.join(root, 'comparison.md'), lines.join('\n') + '\n');
console.log(
  JSON.stringify(
    { runs: runs.length, totals: summary.totals, cohorts: summary.cohorts, warnings },
    null,
    2
  )
);
