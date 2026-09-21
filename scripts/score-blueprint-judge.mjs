// Bounded research prototype. Scores blueprints with a deterministic reward/punish
// judge built only from existing Engine functions. No model calls, no network.
// Run from the repository root after building:
//
//   pnpm build
//   node scripts/score-blueprint-judge.mjs
//
// Scores the five reference recipes, three mutated copies with known defects,
// and compares recipe price ratios against observed BTD6 ranges. Exit code is
// zero in all cases; read the printed totals instead of treating any score as
// a publish gate.
import { referenceRecipes } from '../dist/core/mechanics/reference-patterns.js';
import {
  designPolicyIssues,
  hasBehaviorTransition,
  specialtyMetrics,
} from '../dist/core/mechanics/design-policy.js';
import { resolveUnchecked } from '../dist/core/mechanics/resolve.js';
import { defaultAuthoringDefinition } from '../dist/core/default-profile.js';

const paths = ['path1', 'path2', 'path3'];

const signature = (blueprint, index, tier) => {
  const selection = [0, 0, 0];
  selection[index] = tier;
  const attack = resolveUnchecked(blueprint, selection).baseAttack;
  return JSON.stringify([
    attack.delivery,
    attack.targeting,
    attack.distribution ?? 'same-primary',
    Boolean(attack.followUp),
    attack.stats.damage,
    attack.stats.pierce,
    attack.stats.range,
    attack.stats.intervalSeconds,
    attack.stats.splashRadius,
    attack.stats.slowPercent,
    attack.stats.burnDamagePerSecond,
    attack.stats.stunSeconds,
    attack.stats.projectiles,
  ]);
};

const pure = (blueprint, index, tier) => {
  const selection = [0, 0, 0];
  selection[index] = tier;
  return resolveUnchecked(blueprint, selection);
};

// Six parameters, weights sum to 100. Any design policy failure caps the total
// at 49 so hard authoring gates keep their veto over the soft score.
export function scoreBlueprint(blueprint, definition) {
  const parts = {};
  const tier1 = paths.map((_, index) => signature(blueprint, index, 1));
  parts.distinctT1 = new Set(tier1).size === 3 ? 20 : -20;
  const tier3ok = paths.filter((_, index) =>
    hasBehaviorTransition(pure(blueprint, index, 2), pure(blueprint, index, 3)),
  ).length;
  parts.t3change = tier3ok === 3 ? 15 : -15 + tier3ok * 5;
  const manual = paths.filter((_, index) => pure(blueprint, index, 4).abilities.length > 0).length;
  parts.manual = manual <= 1 ? 15 : -15;
  const payoff = paths.filter((path) => {
    const specialization = blueprint.paths[path].specialization;
    if (!specialization) return false;
    const before = specialtyMetrics(pure(blueprint, paths.indexOf(path), 4), specialization);
    const after = specialtyMetrics(pure(blueprint, paths.indexOf(path), 5), specialization);
    return Object.entries(before).some(
      ([metric, value]) => value > 0 && after[metric] !== undefined && after[metric] / value >= 2,
    );
  }).length;
  parts.capstone = Math.round((payoff / 3) * 20 - (3 - payoff) * 5);
  const early = paths.flatMap((path) => ['tier1', 'tier2'].map((tier) => path + tier));
  const earlyOk = early.filter(
    (key) => blueprint.paths[key.slice(0, 5)].tiers[key.slice(5)].changes.length <= 3,
  ).length;
  parts.early = Math.round((earlyOk / early.length) * 15 - (early.length - earlyOk) * 5);
  const sourced = paths.filter(
    (path) => (blueprint.paths[path].sourceFactIndices?.length ?? 0) >= 1,
  ).length;
  parts.source = sourced === 3 ? 15 : -15 + sourced * 5;
  let total = Math.max(
    0,
    Math.min(
      100,
      Object.values(parts).reduce((a, b) => a + b, 0),
    ),
  );
  const issues = designPolicyIssues(blueprint, definition);
  if (issues.length > 0) total = Math.min(total, 49);
  return { total, parts, veto: issues.length > 0 };
}

const definition = defaultAuthoringDefinition;
const rows = referenceRecipes.map((recipe) => ({
  id: recipe.id,
  kind: 'good',
  ...scoreBlueprint(recipe.blueprint, definition),
}));

const duplicateT1 = structuredClone(referenceRecipes[0].blueprint);
duplicateT1.paths.path2.tiers.tier1 = structuredClone(duplicateT1.paths.path1.tiers.tier1);
duplicateT1.paths.path3.tiers.tier1 = structuredClone(duplicateT1.paths.path1.tiers.tier1);
rows.push({
  id: `${referenceRecipes[0].id} +dup-T1`,
  kind: 'bad',
  ...scoreBlueprint(duplicateT1, definition),
});

const weakT3 = structuredClone(referenceRecipes[0].blueprint);
weakT3.paths.path1.tiers.tier3 = {
  name: 'Minor tweak',
  cost: 850,
  changes: [{ kind: 'stat', target: 'base', stat: 'damage', operation: 'add', value: 1 }],
};
rows.push({
  id: `${referenceRecipes[0].id} +weak-T3`,
  kind: 'bad',
  ...scoreBlueprint(weakT3, definition),
});

const secondManual = structuredClone(referenceRecipes[0].blueprint);
secondManual.paths.path1.tiers.tier4 = {
  ...structuredClone(secondManual.paths.path2.tiers.tier4),
  name: 'Borrowed activation',
};
rows.push({
  id: `${referenceRecipes[0].id} +2nd-manual`,
  kind: 'bad',
  ...scoreBlueprint(secondManual, definition),
});

for (const row of rows) console.log(JSON.stringify(row));
console.log('--- price ratios T5/T4 incremental ---');
for (const recipe of referenceRecipes) {
  const ratios = paths.map(
    (path) =>
      recipe.blueprint.paths[path].tiers.tier5.cost / recipe.blueprint.paths[path].tiers.tier4.cost,
  );
  console.log(`${recipe.id} ${ratios.map((ratio) => ratio.toFixed(2)).join(',')}`);
}
console.log('BTD6 observed: range 1.579-19.643 median 6.25 (78 paths, Monkeyopolis excluded)');
