import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  compileMangaBuild,
  createMangaEncounterFromBuild
} from '../../../packages/definitions/dist/manga-mayhem/index.js';
const [path, output] = process.argv.slice(2);
if (!path || !output) throw new Error('Usage: node retarget-probe.mjs UNIT.json OUT.json');
const bytes = await readFile(path),
  unit = JSON.parse(bytes),
  edges = [];
for (let p = 0; p < 3; p++)
  for (let t = 1; t <= 5; t++) {
    const a = [0, 0, 0],
      b = [0, 0, 0];
    a[p] = t - 1;
    b[p] = t;
    const before = compileMangaBuild(unit, a),
      after = compileMangaBuild(unit, b);
    if (before.modifiers.retargetPrimary || !after.modifiers.retargetPrimary) continue;
    const primary = before.forms.find((f) => f.id === unit.baseForm).primary;
    if (primary.windup <= 0) continue;
    const distance = Math.min(5, primary.reach / 2),
      end = primary.windup + distance / (primary.projectileSpeed ?? Infinity) + 0.01;
    const run = (build) => {
      const e = createMangaEncounterFromBuild(build, [
        { id: 'lost', x: distance, y: 0, health: 100000, pathPosition: 2 },
        { id: 'replacement', x: distance, y: 0, health: 100000, pathPosition: 1 }
      ]);
      e.advance(primary.windup / 2);
      e.replaceTarget('lost', [], false);
      const s = e.advance(end - primary.windup / 2);
      return {
        replacementDamage: 100000 - s.targets.find((x) => x.id === 'replacement').health,
        primaryEvents: s.events.filter((x) => x.type === 'primary' && x.target === 'replacement')
      };
    };
    edges.push({
      path: p,
      tier: t,
      distance,
      durationSeconds: end,
      retirementAt: primary.windup / 2,
      before: run(before),
      after: run(after)
    });
  }
await writeFile(
  output,
  JSON.stringify(
    { path, sha256: createHash('sha256').update(bytes).digest('hex'), edges },
    null,
    2
  ) + '\n'
);
