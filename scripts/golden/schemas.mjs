// Records how each contract schema validates deterministic mutations of valid
// values, and its JSON Schema. Needs a compiled .test-build and the recorded corpus.
// Usage: node scripts/golden/schemas.mjs [goldenDir]
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const golden = process.argv[2] ?? 'contracts/v1/golden';
const load = async (module) => import(pathToFileURL(resolve('.test-build/src', module)).href);
const { z } = await import('zod');
const core = await load('core/index.js');
const mech = await load('core/mechanics/schemas.js');
const planSchemas = await load('core/planned-v1/plan-schema.js');
const purchase = await load('core/planned-v1/purchase-plan.js');
const output = await load('core/planned-v1/model-output.js');

const entries = (fn) =>
  gunzipSync(readFileSync(join(golden, `${fn}.jsonl.gz`)))
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
const ok = (fn) => entries(fn).filter((entry) => 'output' in entry);
const planned = (value) => JSON.stringify(value).includes('"mechanicsDefinition"');

// Valid bases taken from the recorded corpus.
const results = ok('reviewDraft').map((entry) => entry.output);
const plannedResult = results.find(
  (result) =>
    result.candidate.blueprint && result.prepared.request.mechanicsDefinition.profile.designPolicy,
);
const baseResult = results.find(
  (result) =>
    result.candidate.blueprint && !result.prepared.request.mechanicsDefinition.profile.designPolicy,
);
const revision = results.find(
  (result) => result.prepared.request.previous && result.candidate.blueprint,
);
const legacyResult = results.find((result) => !result.candidate.blueprint);
const checked = ok('checkDraft')
  .map((entry) => entry.output)
  .find((value) => value.draft.candidate.blueprint);
const draft = checked.draft;
const drafts = entries('draftUnit').filter((entry) => 'output' in entry && planned(entry.args));
const mechanicsExchange = (result) => {
  for (const entry of drafts)
    if (entry.output.prepared.inputHash === result.prepared.inputHash) {
      const exchange = entry.model.exchanges.find(
        (item) => item.response?.output?.paths?.path1?.tiers,
      );
      if (exchange) return exchange.response.output;
    }
  throw new Error('No mechanics exchange for ' + result.prepared.inputHash);
};
const planOutput = entries('decodeDesignPlan').find(
  (entry) => 'output' in entry && entry.output.upgradeIntents,
).output;
const compactPlan = entries('expandPurchasePlan').find(
  (entry) =>
    entry.args[0] && entry.args[0].contract && !entry.args[0].upgradeIntents && 'output' in entry,
)?.args[0];
const review = {
  summary: 'A scoped review.',
  findings: [
    {
      ...(plannedResult.findings.find((f) => f.method === 'model') ?? {
        id: 'model.example',
        method: 'model',
        category: 'scope',
        severity: 'info',
        outcome: 'pass',
        subject: 'baseAttack',
        rule: 'A rule.',
        message: 'A message.',
        evidence: ['E1'],
        action: null,
      }),
    },
  ],
};
const blueprint = plannedResult.candidate.blueprint;

const cases = [
  ['attack', mech.attackSchema, null, blueprint.baseAttack],
  [
    'boost',
    mech.boostSchema,
    null,
    blueprint.paths.path2.tiers.tier4.changes.find((c) => c.kind === 'unlockBoost')?.boost ?? {
      name: 'Focus',
      durationSeconds: 8,
      cooldownSeconds: 30,
      damageMultiplier: 2,
      intervalMultiplier: 0.75,
      rangeBonus: 5,
    },
  ],
  ['blueprint', mech.blueprintSchema, null, blueprint],
  ['diagnosticBlueprint', mech.diagnosticBlueprintSchema, null, blueprint],
  [
    'mechanicsDefinition',
    mech.mechanicsDefinitionSchema,
    null,
    plannedResult.prepared.request.mechanicsDefinition,
  ],
  ['request', core.requestSchema, null, plannedResult.prepared.request],
  ['request', core.requestSchema, null, revision.prepared.request],
  ['prepared', core.preparedSchema, null, baseResult.prepared],
  ['candidate', core.candidateSchema, null, legacyResult.candidate],
  ['draft', core.draftArtifactSchema, null, draft],
  ['checked', core.checkedArtifactSchema, null, checked],
  ['result', core.resultSchema, null, plannedResult],
  ['finding', core.findingSchema, null, plannedResult.findings[0]],
  [
    'modelUsage',
    core.modelUsageSchema,
    null,
    {
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3,
      reasoningTokens: 0,
      cachedInputTokens: null,
      costUsd: 0.5,
      actualModel: 'm',
      provider: 'p',
      generationId: 'g',
    },
  ],
  ['semanticReview', core.semanticReviewSchema, null, review],
  ['designPlan', planSchemas.designPlanSchema, null, planOutput],
  ['designPlanAuthoring', planSchemas.designPlanAuthoringSchema, null, planOutput],
  ['unitProfile', core.unitProfileSchema, null, core.defaultUnitProfile],
  ['modelOutput', null, baseResult.prepared.request, mechanicsExchange(baseResult)],
  ['modelOutput', null, plannedResult.prepared.request, mechanicsExchange(plannedResult)],
  ['purchasePlanOutput', null, plannedResult.prepared.request, compactPlan],
  ['purchasePlanOutput', null, baseResult.prepared.request, compactPlan],
];

function paths(value, at = [], out = []) {
  out.push(at);
  if (Array.isArray(value)) value.forEach((item, index) => paths(item, [...at, index], out));
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) paths(item, [...at, key], out);
  return out;
}
function get(value, path) {
  return path.reduce((node, key) => node[key], value);
}
function ops(value, isKey) {
  const list = [];
  if (isKey) list.push('delete');
  list.push('null');
  if (typeof value === 'string')
    list.push('num0', 'strEmpty', 'strSpace', 'strLong', 'trimPad', 'obj');
  else if (typeof value === 'number') list.push('strX', 'num0', 'numNeg', 'numFrac', 'numBig');
  else if (typeof value === 'boolean') list.push('strX', 'num0');
  else if (Array.isArray(value)) list.push('strX', 'arrEmpty', 'dupElem', 'obj');
  else if (value && typeof value === 'object') list.push('strX', 'arrEmpty', 'extraKey');
  else list.push('strX', 'num0');
  return list;
}
function mutate(base, path, op) {
  const copy = structuredClone(base);
  if (!path.length) return apply(copy, op);
  const parent = get(copy, path.slice(0, -1));
  const key = path.at(-1);
  if (op === 'delete') {
    delete parent[key];
    return copy;
  }
  parent[key] = apply(parent[key], op);
  return copy;
}
function apply(value, op) {
  switch (op) {
    case 'null':
      return null;
    case 'num0':
      return 0;
    case 'numNeg':
      return -1;
    case 'numFrac':
      return 1.5;
    case 'numBig':
      return 10000000;
    case 'strX':
      return 'x';
    case 'strEmpty':
      return '';
    case 'strSpace':
      return '   ';
    case 'strLong':
      return 'x'.repeat(2000);
    case 'trimPad':
      return `  ${value}  `;
    case 'obj':
      return {};
    case 'arrEmpty':
      return [];
    case 'dupElem':
      return [...value, structuredClone(value.at(-1) ?? null)];
    case 'extraKey':
      return { ...value, zzExtra: 1 };
  }
  throw new Error(op);
}
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function result(schema, input) {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? { outputHash: hash(parsed.data) }
    : { issues: parsed.error.issues.map(({ code, path, message }) => ({ code, path, message })) };
}

const lines = [];
for (const [name, fixed, context, base] of cases) {
  if (!base) throw new Error(`No base for ${name}`);
  const schema =
    fixed ??
    (name === 'modelOutput'
      ? output.modelOutputSchema(context)
      : purchase.purchasePlanOutputSchema(context));
  const all = paths(base);
  const step = Math.max(1, Math.ceil(all.length / 400));
  const chosen = all.filter((path, index) => path.length <= 2 || index % step === 0);
  const tried = [{ path: [], op: 'none', ...result(schema, base) }];
  for (const path of chosen) {
    const value = path.length ? get(base, path) : base;
    const isKey = path.length > 0 && !Array.isArray(get(base, path.slice(0, -1)));
    for (const op of ops(value, isKey))
      tried.push({ path, op, ...result(schema, mutate(base, path, op)) });
  }
  lines.push(
    JSON.stringify({
      schema: name,
      context,
      base,
      jsonSchema: z.toJSONSchema(schema, { reused: 'inline' }),
      cases: tried,
    }),
  );
  console.log(`${name}: ${tried.length} cases`);
}
writeFileSync(join(golden, 'schemas.jsonl.gz'), gzipSync(lines.join('\n') + '\n', { level: 9 }));
