import { readFile, writeFile } from 'node:fs/promises';
import {
  compileMangaBuild,
  createMangaEncounterFromBuild
} from '../../../packages/definitions/dist/manga-mayhem/index.js';
import { targetFacts } from './probes.mjs';
const duration = 60,
  step = 0.25,
  speed = 1.5,
  exitX = 30;
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
    displacementDistance: snap.events
      .filter((e) => e.type === 'displace')
      .reduce((n, e) => n + (e.amount ?? 0), 0),
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
const [output, ...paths] = process.argv.slice(2);
if (!output || !paths.length)
  throw new Error('Usage: node displacement-probe.mjs OUT.json REPORT.json ...');
const results = [];
for (const path of paths) {
  const report = JSON.parse(await readFile(path)),
    u = report.units[0],
    unit = JSON.parse(await readFile(u.path));
  if (report.derivation)
    throw new Error(
      'Use original measured reports; this probe applies its own stated Luffy price projection.'
    );
  const costScale = unit.id.includes('luffy') ? 2 : 1;
  const candidates = u.results
    .filter(
      (r) =>
        r.scenario === 'dense-wave' && r.cost * costScale <= 5000 && r.policy.endsWith('/technique')
    )
    .map((row) => {
      const form = unit.forms.find((f) => row.policy === `${f.id}/technique`);
      const technique = form.techniques
        .filter((t) => t.unlockTier <= Math.max(...row.tiers))
        .sort((a, b) => b.unlockTier - a.unlockTier)[0];
      return {
        row,
        upperBound: (row.eventCounts.displace ?? 0) * (technique?.control?.displacement ?? 0)
      };
    })
    .sort((a, b) => b.upperBound - a.upperBound || a.row.cost - b.row.cost)
    .slice(0, 5);
  const probes = candidates.map(({ row, upperBound }) => {
    const form = unit.forms.find((f) => row.policy === `${f.id}/technique`);
    const observed = run(
      compileMangaBuild(unit, row.tiers),
      { id: 'dense-wave', count: 40, health: 500 },
      { form: form.id, technique: true }
    );
    return {
      ...observed,
      originalCost: observed.cost,
      cost: observed.cost * costScale,
      upperBound
    };
  });
  results.push({ path, unitPath: u.path, sha256: u.sha256, costScale, probes });
}
await writeFile(
  output,
  JSON.stringify(
    {
      method:
        'Actual distance sums for five affordable policies with highest displace-count times declared distance upper bound, using the same moving wave as evaluate.mjs. Luffy x2 costs are a stated price-only projection. This is a shortlist, not exhaustive optimal displacement search.',
      results
    },
    null,
    2
  ) + '\n'
);
