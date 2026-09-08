import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inspectExecution } from './index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const studyRoot = path.dirname(here);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const files = (await readdir(studyRoot, { recursive: true }))
  .filter((file) => /(^|\/)runs\/[^/]+\/unit\.json$/.test(file))
  .sort();
const destination = path.join(here, 'candidates');
await mkdir(destination, { recursive: true });
const summary = {
  inspectedAt: new Date().toISOString(),
  inspectorSha256: hash(await readFile(path.join(here, 'index.mjs'))),
  purpose:
    'Separate execution mechanism inspection of retained candidates. No frozen evaluator or historical metric changes.',
  countMeaning:
    'Counts describe sampled comparison findings, not independent defects or quality scores.',
  candidates: []
};
for (const file of files) {
  const bytes = await readFile(path.join(studyRoot, file));
  const candidate = JSON.parse(bytes);
  const runId = path.basename(path.dirname(file));
  const report = inspectExecution(candidate);
  const masked = report.findings.filter(
    (finding) => finding.code === 'COOLDOWN_REDUCTION_MASKED_BY_INTERVAL'
  );
  const changed = report.findings.filter(
    (finding) => finding.code === 'INTERVAL_SCHEDULE_PERIOD_CHANGED'
  );
  const unique = new Map(
    masked.map((finding) => [
      JSON.stringify([
        finding.change.type,
        finding.change.upgradeId ?? finding.change.formId,
        finding.actionId
      ]),
      {
        change: finding.change,
        actionId: finding.actionId,
        before: finding.before,
        after: finding.after
      }
    ])
  );
  await writeFile(
    path.join(destination, `${runId}.json`),
    JSON.stringify(
      {
        candidateFile: file,
        candidateSha256: hash(bytes),
        inspectorSha256: summary.inspectorSha256,
        ...report
      },
      null,
      2
    ) + '\n'
  );
  summary.candidates.push({
    runId,
    candidateFile: file,
    candidateSha256: hash(bytes),
    status: report.status,
    validationIssueCount: report.validationIssues.length,
    compilationIssueCount: report.compilationIssues.length,
    compiledSelectionCount: report.coverage.compiledSelections.length,
    upgradeComparisonCount: report.coverage.upgradeComparisons.length,
    formComparisonCount: report.coverage.formComparisons.length,
    maskedComparisonCount: masked.length,
    changedPeriodComparisonCount: changed.length,
    maskedChanges: [...unique.values()],
    formEnablement: [
      ...new Map(
        report.formInventory.map((entry) => [
          JSON.stringify([
            entry.formId,
            entry.newlyEnabledActions.map((action) => action.actionId)
          ]),
          {
            formId: entry.formId,
            newlyEnabledActionIds: entry.newlyEnabledActions.map((action) => action.actionId)
          }
        ])
      ).values()
    ]
  });
}
await writeFile(path.join(here, 'candidate-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(
  JSON.stringify(
    summary.candidates.map(
      ({ runId, status, maskedComparisonCount, changedPeriodComparisonCount, maskedChanges }) => ({
        runId,
        status,
        maskedComparisonCount,
        changedPeriodComparisonCount,
        distinctMaskedChanges: maskedChanges.length
      })
    ),
    null,
    2
  )
);
