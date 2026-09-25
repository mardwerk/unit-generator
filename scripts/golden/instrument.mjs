// Rewrites compiled test-build modules so selected exports record their calls.
// Usage: node scripts/golden/instrument.mjs .test-build
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const build = process.argv[2] ?? '.test-build';
const here = dirname(fileURLToPath(import.meta.url));
copyFileSync(join(here, 'recorder.js'), join(build, 'golden-recorder.js'));

const targets = {
  'core/prepare.js': ['prepareRequest', 'hashRequest'],
  'core/draft.js': [['draftUnit', 1]],
  'core/check.js': ['checkDraft'],
  'core/review.js': [['reviewDraft', 1]],
  'core/profile.js': ['applyProfile', 'validateProfile', 'profileProgression'],
  'core/default-profile.js': ['applyDefaultProfile'],
  'core/check-progression.js': ['progressionBuildViolations'],
  'core/mechanics/index.js': ['resolveBuild'],
  'core/mechanics/resolve.js': ['allLegalBuilds', 'selectionIssues', 'assessTarget'],
  'core/mechanics/validate.js': ['validateBlueprint'],
  'core/mechanics/design-policy.js': ['designPolicyIssues', 'specialtyMetrics'],
  'core/mechanics/purchase-comparison.js': ['compareCapstonePurchases'],
  'core/planned-v1/compile.js': ['compileBlueprint'],
  'core/planned-v1/definition.js': [
    'definitionDocument',
    'definitionProgression',
    'withDefinitionEvidence',
  ],
  'core/planned-v1/design-evaluation.js': ['evaluateUnitDesign'],
  'core/planned-v1/design-guidance.js': ['designGuidance'],
  'core/planned-v1/evidence.js': ['evidenceSpans', 'authorEvidence'],
  'core/planned-v1/kit-summary.js': ['unitSummary', 'pathSummary'],
  'core/planned-v1/model-output.js': [
    'modelOutputJsonSchema',
    'decodeBlueprintOutput',
    'decodeBlueprintOutputForDiagnostics',
    'tierEffectLimit',
  ],
  'core/planned-v1/plan-feasibility.js': ['planFeasibilityIssues'],
  'core/planned-v1/plan-intent.js': ['planIntentIssues'],
  'core/planned-v1/plan.js': ['designPlanRequest', 'decodeDesignPlan', 'bindDesignPlan'],
  'core/planned-v1/purchase-plan.js': ['expandPurchasePlan', 'mechanicsPlan'],
  'core/planned-v1/repair.js': ['targetedTierRepair'],
  'core/planned-v1/repair-context.js': ['capstoneRepairContext', 'wireRepairContext'],
  'core/planned-v1/review.js': ['blueprintReviewRequest'],
  'core/planned-v1/validate.js': ['validateBlueprintRequest'],
  'presentation/markdown.js': ['renderArtifact'],
  'presentation/view.js': ['readArtifactView'],
  'presentation/kit-stats.js': ['kitStats'],
  'presentation/usage.js': ['summarizeUsage', 'usageSummaryText', 'stageUsageRows'],
};

for (const [module, names] of Object.entries(targets)) {
  const file = join(build, 'src', module);
  let source = readFileSync(file, 'utf8');
  const recorder = relative(dirname(file), join(build, 'golden-recorder.js')).replaceAll('\\', '/');
  const tail = [];
  for (const entry of names) {
    const [name, modelArg] = Array.isArray(entry) ? entry : [entry, -1];
    const pattern = new RegExp(`^export (async )?function ${name}\\(`, 'm');
    if (!pattern.test(source)) throw new Error(`${module}: no exported function ${name}`);
    source = source.replace(pattern, (_m, isAsync) => `${isAsync ?? ''}function ${name}__golden(`);
    tail.push(
      `export const ${name} = __record(${JSON.stringify(name)}, ${name}__golden, ${modelArg});`,
    );
  }
  source =
    `import { record as __record } from '${recorder.startsWith('.') ? recorder : './' + recorder}';\n` +
    source +
    '\n' +
    tail.join('\n') +
    '\n';
  writeFileSync(file, source);
}
console.log(`instrumented ${Object.keys(targets).length} modules`);
