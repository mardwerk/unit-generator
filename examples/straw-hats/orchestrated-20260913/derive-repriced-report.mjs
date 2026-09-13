import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { validateMangaUnit } from '../../../packages/definitions/dist/manga-mayhem/index.js';

const [reportPath, predecessorPath, finalPath, outputPath, ...flags] = process.argv.slice(2);
if (!outputPath || flags.some((flag) => flag !== '--allow-descriptions'))
  throw new Error(
    'Usage: node derive-repriced-report.mjs MEASURED.json PREDECESSOR.json FINAL.json OUT.json [--allow-descriptions]'
  );
const read = async (path) => {
  const bytes = await readFile(path);
  return { value: JSON.parse(bytes), sha256: createHash('sha256').update(bytes).digest('hex') };
};
const [measured, predecessor, final] = await Promise.all([
  read(reportPath),
  read(predecessorPath),
  read(finalPath)
]);
if (measured.value.units.length !== 1) throw new Error('Supply a one-unit measured report.');
const previous = measured.value.units[0];
if (previous.sha256 !== predecessor.sha256)
  throw new Error('Predecessor bytes do not match measured unit SHA-256.');
const issues = validateMangaUnit(final.value);
if (issues.length) throw new Error(JSON.stringify(issues));
function differences(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return [{ path, before: a, after: b }];
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((key) =>
    differences(a[key], b[key], `${path}/${key}`)
  );
}
const changed = differences(predecessor.value, final.value);
const allowedCost = (path) =>
  path === '/cost' || /^\/paths\/[0-2]\/upgrades\/[0-4]\/cost$/.test(path);
const allowedDescription = (path) =>
  flags.includes('--allow-descriptions') && /\/description$/.test(path);
const prohibited = changed.filter(
  (change) => !allowedCost(change.path) && !allowedDescription(change.path)
);
if (prohibited.length)
  throw new Error(
    `Non-price executable changes prohibit derivation: ${JSON.stringify(prohibited)}`
  );
const cost = (tiers) =>
  final.value.cost +
  tiers.reduce(
    (total, tier, path) =>
      total + final.value.paths[path].upgrades.slice(0, tier).reduce((sum, u) => sum + u.cost, 0),
    0
  );
const report = structuredClone(measured.value),
  unit = report.units[0];
for (const row of [...unit.results, ...unit.supportResults]) row.cost = cost(row.tiers);
for (const edge of unit.purchaseEdges) {
  edge.purchaseCost = final.value.paths[edge.path].upgrades[edge.tier - 1].cost;
  for (const scenario of edge.scenarios) {
    scenario.before.cost = cost(scenario.before.tiers);
    scenario.after.cost = cost(scenario.after.tiers);
  }
}
const best = (rows) =>
  rows.sort(
    (a, b) =>
      b.damage - a.damage ||
      b.movementPreventedSeconds - a.movementPreventedSeconds ||
      a.cost - b.cost
  )[0] ?? null;
unit.matchedSpending = report.protocol.budgets.flatMap((budget) =>
  report.protocol.scenarios.map((scenario) => {
    const winner = best(
      unit.results.filter((row) => row.scenario === scenario.id && row.cost <= budget)
    );
    return { budget, scenario: scenario.id, winner, unspent: winner ? budget - winner.cost : null };
  })
);
unit.path = resolve(finalPath);
unit.sha256 = final.sha256;
unit.name = final.value.name;
unit.id = final.value.id;
report.generatedAt = new Date().toISOString();
report.derivation = {
  method: 'derived-price-only',
  measuredReportPath: resolve(reportPath),
  measuredReportSha256: measured.sha256,
  measurementUnitPath: resolve(predecessorPath),
  measurementUnitSha256: predecessor.sha256,
  finalUnitPath: resolve(finalPath),
  finalUnitSha256: final.sha256,
  changedFields: changed,
  note: 'Every non-price executable field was verified equal. Original combat, control, support and policy observations are retained. Recomputed build costs, all purchase prices and affordable-build frontiers; shared highest-tier form unlocks remain represented by the measured complete legal-build enumeration. Qualification remains the original executable-mechanics qualification; final contract validation was rerun.',
  finalContractIssues: issues
};
await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    outputPath,
    method: report.derivation.method,
    costChanges: changed.filter((change) => allowedCost(change.path)).length,
    descriptionChanges: changed.filter((change) => allowedDescription(change.path)).length,
    finalSha256: final.sha256,
    measurementSha256: predecessor.sha256
  })
);
