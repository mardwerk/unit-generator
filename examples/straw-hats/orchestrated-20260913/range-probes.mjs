import { readFile, writeFile } from 'node:fs/promises';
import {
  compileMangaBuild,
  createMangaEncounterFromBuild
} from '../../../packages/definitions/dist/manga-mayhem/index.js';
const [output, ...paths] = process.argv.slice(2),
  out = [];
if (!output || !paths.length)
  throw new Error('Usage: node range-probes.mjs OUTPUT.json UNIT.json ...');
for (const path of paths) {
  const unit = JSON.parse(await readFile(path));
  const edges = [];
  for (let p = 0; p < 3; p++)
    for (let t = 1; t <= 5; t++) {
      const a = [0, 0, 0],
        b = [0, 0, 0];
      a[p] = t - 1;
      b[p] = t;
      const before = compileMangaBuild(unit, a),
        after = compileMangaBuild(unit, b);
      if (after.modifiers.reachAdd <= before.modifiers.reachAdd) continue;
      const form = before.forms.find((f) => f.id === unit.baseForm),
        next = after.forms.find((f) => f.id === unit.baseForm),
        distance = (form.primary.reach + next.primary.reach) / 2;
      const run = (build) => {
        const enc = createMangaEncounterFromBuild(build, [
          {
            id: 'boundary',
            x: distance,
            y: 0,
            health: 100000,
            weakWilled: true,
            stunnable: true,
            slowable: true,
            displaceable: true
          }
        ]);
        const s = enc.advance(15);
        return {
          damage: 100000 - s.targets[0].health,
          primaryHits: s.events.filter((e) => e.type === 'primary').length,
          control: s.statuses[0].movementPreventedSeconds
        };
      };
      edges.push({ path: p, tier: t, distance, before: run(before), after: run(after) });
    }
  out.push({ path, id: unit.id, edges });
}
await writeFile(output, JSON.stringify(out, null, 2));
