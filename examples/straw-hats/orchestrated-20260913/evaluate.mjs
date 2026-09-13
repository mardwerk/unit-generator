import { bossScenario, targetFacts, supportProbe, supportProtocol } from './probes.mjs';
// Run pnpm build:packages first. Inputs are explicit newly generated units only.
import { readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  compileMangaBuild,
  legalMangaTiers,
  validateMangaUnit,
  createMangaEncounterFromBuild
} from '../../../packages/definitions/dist/manga-mayhem/index.js';
import { qualifyUnit } from '../../../packages/unit-lab/dist/index.js';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log(
    'Usage: node examples/straw-hats/orchestrated-20260913/evaluate.mjs [--out report.json] [--hearing present|absent] [--budgets 1000,5000,15000,50000] unit.json ...\nA directory is searched recursively for unit.json only. A manifest must be {"units":["relative/path/unit.json", ...]}. No default units or fixtures are loaded.'
  );
  process.exit(0);
}
let output = resolve('examples/straw-hats/orchestrated-20260913/balance.json');
let budgets = [1000, 5000, 15000, 50000];
let hearing = 'present';
const inputs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') output = resolve(args[++i]);
  else if (args[i] === '--hearing') hearing = args[++i];
  else if (args[i] === '--budgets') budgets = args[++i].split(',').map(Number);
  else inputs.push(resolve(args[i]));
}
if (!['present', 'absent'].includes(hearing))
  throw new Error('--hearing must be present or absent.');
if (!inputs.length || budgets.some((b) => !Number.isFinite(b) || b <= 0))
  throw new Error('Supply explicit input units and positive budgets.');
async function expand(path) {
  if ((await stat(path)).isDirectory()) {
    const entries = await readdir(path, { withFileTypes: true });
    return (
      await Promise.all(
        entries
          .filter((e) => e.isDirectory() || e.name === 'unit.json')
          .map((e) => expand(join(path, e.name)))
      )
    ).flat();
  }
  const value = JSON.parse(await readFile(path, 'utf8'));
  if (Array.isArray(value.units))
    return (
      await Promise.all(
        value.units.map((p) => {
          if (typeof p !== 'string') throw new Error('Manifest units must be file path strings.');
          return expand(resolve(dirname(path), p));
        })
      )
    ).flat();
  return [path];
}
const paths = [...new Set((await Promise.all(inputs.map(expand))).flat())];
if (!paths.length)
  throw new Error('No unit.json files found. Candidate files require explicit paths.');
const tiers = [];
for (let a = 0; a <= 5; a++)
  for (let b = 0; b <= 5; b++)
    for (let c = 0; c <= 5; c++) if (legalMangaTiers([a, b, c])) tiers.push([a, b, c]);
const duration = 60,
  step = 0.25,
  speed = 1.5,
  exitX = 30;
const scenarios = [
  { id: 'dense-wave', count: 40, health: 500 },
  bossScenario,
  { id: 'concealment', count: 24, health: 500, concealed: true },
  { id: 'obstacles', count: 24, health: 500, obstacles: [{ x1: -35, y1: 1, x2: 35, y2: 1 }] },
  { id: 'control-immune', count: 40, health: 500, immune: true },
  { id: 'fast-wave', count: 40, health: 500, speed: 3 },
  { id: 'spread-wave', count: 40, health: 500, spread: 3 }
].map((scenario) => ({ ...scenario, tags: hearing === 'present' ? ['can-hear'] : [] }));
function run(build, scenario, policy) {
  const targets = Array.from({ length: scenario.count }, (_, i) => ({
    id: `enemy-${i}`,
    x: -30 - i * 0.4,
    y: 2 + (i % 3) * (scenario.spread ?? 0.3),
    health: scenario.health,
    pathPosition: Math.max(0, 20 - i * 0.4),
    ...targetFacts(scenario)
  }));
  const encounter = createMangaEncounterFromBuild(build, targets, {
    obstacles: scenario.obstacles ?? []
  });
  const leaked = new Map();
  let snap = encounter.snapshot(),
    formRequests = 0,
    techniqueRequests = 0;
  for (let tick = 0; tick < duration / step; tick++) {
    if (policy.form !== snap.form && encounter.requestForm(policy.form)) formRequests++;
    if (policy.technique && encounter.requestTechnique()) techniqueRequests++;
    snap = encounter.advance(step);
    const statuses = new Map(snap.statuses.map((s) => [s.targetId, s]));
    for (const target of snap.targets) {
      if (target.health <= 0 || leaked.has(target.id)) continue;
      const movement =
        (scenario.speed ?? speed) * step * (statuses.get(target.id)?.speedMultiplier ?? 1);
      const x = target.x + movement;
      if (x >= exitX) {
        leaked.set(target.id, target.health);
        encounter.replaceTarget(target.id, [], false);
      } else encounter.updateTarget(target.id, { x, pathPosition: target.pathPosition + movement });
    }
    snap = encounter.snapshot();
  }
  const remaining = snap.targets.filter((t) => t.health > 0);
  const damage =
    targets.length * scenario.health -
    remaining.reduce((n, t) => n + t.health, 0) -
    [...leaked.values()].reduce((a, b) => a + b, 0);
  return {
    scenario: scenario.id,
    policy: `${policy.form}/${policy.technique ? 'technique' : 'automatic'}`,
    cost: build.cost,
    tiers: build.tiers,
    damage,
    kills: targets.length - remaining.length - leaked.size,
    leaks: leaked.size,
    survivors: remaining.length,
    leakedHealth: [...leaked.values()].reduce((a, b) => a + b, 0),
    movementPreventedSeconds: snap.statuses.reduce((n, s) => n + s.movementPreventedSeconds, 0),
    formRequests,
    techniqueRequests,
    finalStamina: snap.stamina,
    eventCounts: snap.events.reduce(
      (counts, e) => ((counts[e.type] = (counts[e.type] ?? 0) + 1), counts),
      {}
    )
  };
}
const report = {
  generatedAt: new Date().toISOString(),
  protocol: {
    durationSeconds: duration,
    movementStepSeconds: step,
    speed,
    exitX,
    targetHearing: hearing,
    protocolVersion: hearing === 'present' ? 'moving-60s-hearing-v2' : 'moving-60s-no-hearing-v1',
    scenarios,
    supportProtocol,
    budgets,
    policies:
      'Each unlocked form is retried every step after forced exit. Automatic-only and contextual Technique requested every step when available. Full starting stamina; identical target geometry/health/speed across units. Each build is a single placement.'
  },
  limits: [
    'Synthetic scenarios establish bounded comparisons, not live-game balance or source fidelity.',
    'Movement is caller-integrated after each 0.25-second advance using end-of-step status speed. Displacement from the runtime is preserved. Control timing and boundary crossings are approximate.',
    'No tower HP, incoming enemy attacks, air targets, placement count or multi-unit synergy are modeled. Separate support probes use declared synthetic ally HP and injuries; they do not establish that live-game towers take damage.',
    'All enemies exist from time zero, initially outside short reach. Survivors at 60 seconds are reported separately from leaks. No replenishment or layered health. Separate economy probes explicitly start rounds and collect once per second.',
    'Matched spending uses the same budget cap, chooses one affordable build per unit and reports actual spend and unspent budget. Costs need not match exactly; unused money provides no combat value.',
    'Technique requests are greedy. Fixed-form reentry policies are not an exhaustive optimal rotation search. Best results per scenario are an optimistic policy selection.',
    'Explicit file paths and SHA-256 identify evaluated artifacts. Fresh generation provenance must be checked against generation receipts separately.'
  ],
  units: []
};
for (const path of paths) {
  const bytes = await readFile(path),
    unit = JSON.parse(bytes);
  const issues = validateMangaUnit(unit);
  if (issues.length) {
    report.units.push({ path, sha256: createHash('sha256').update(bytes).digest('hex'), issues });
    continue;
  }
  const qualification = qualifyUnit({ definitionId: 'manga-mayhem', candidate: unit });
  const results = [];
  const supportResults = [];
  for (const selection of tiers) {
    const build = compileMangaBuild(unit, selection);
    supportResults.push(supportProbe(build));
    for (const form of build.forms)
      for (const technique of [false, true]) {
        if (technique && !form.techniques.some((t) => t.unlockTier <= build.highestTier)) continue;
        for (const scenario of scenarios)
          results.push(run(build, scenario, { form: form.id, technique }));
      }
  }
  const best = (rows) =>
    rows.sort(
      (a, b) =>
        b.damage - a.damage ||
        b.movementPreventedSeconds - a.movementPreventedSeconds ||
        a.cost - b.cost
    )[0] ?? null;
  const edges = [];
  for (let p = 0; p < 3; p++)
    for (let t = 1; t <= 5; t++) {
      const before = [0, 0, 0],
        after = [0, 0, 0];
      before[p] = t - 1;
      after[p] = t;
      edges.push({
        path: p,
        tier: t,
        name: unit.paths[p].upgrades[t - 1].name,
        purchaseCost: unit.paths[p].upgrades[t - 1].cost,
        scenarios: scenarios.map((s) => {
          const a = best(
            results.filter((r) => r.scenario === s.id && r.tiers.join() === before.join())
          );
          const b = best(
            results.filter((r) => r.scenario === s.id && r.tiers.join() === after.join())
          );
          return {
            scenario: s.id,
            before: a,
            after: b,
            damageDelta: b.damage - a.damage,
            controlDelta: b.movementPreventedSeconds - a.movementPreventedSeconds
          };
        })
      });
    }
  const matchedSpending = budgets.flatMap((budget) =>
    scenarios.map((s) => {
      const winner = best(results.filter((r) => r.scenario === s.id && r.cost <= budget));
      return { budget, scenario: s.id, winner, unspent: winner ? budget - winner.cost : null };
    })
  );
  report.units.push({
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    id: unit.id,
    name: unit.name,
    legalBuilds: tiers.length,
    qualification,
    purchaseEdges: edges,
    matchedSpending,
    supportResults,
    results
  });
  console.error(
    `Evaluated ${unit.name ?? unit.id}: ${tiers.length} builds, 15 purchases, ${results.length} moving probes.`
  );
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(output);
