import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  compileMangaBuild,
  createMangaEncounterFromBuild
} from '../../../packages/definitions/dist/manga-mayhem/index.js';
const [path, output] = process.argv.slice(2);
if (!path || !output) throw new Error('Usage: node hearing-probe.mjs UNIT.json OUTPUT.json');
const bytes = await readFile(path),
  unit = JSON.parse(bytes),
  build = compileMangaBuild(unit, [1, 0, 0]);
const results = [];
for (const tags of [[], ['can-hear']])
  for (const techniques of [false, true]) {
    const targets = Array.from({ length: 20 }, (_, i) => ({
      id: `listener-${i}`,
      x: 5 + i * 0.1,
      y: 0,
      health: 100000,
      pathPosition: 20 - i,
      weakWilled: true,
      stunnable: true,
      slowable: true,
      displaceable: true,
      tags
    }));
    const encounter = createMangaEncounterFromBuild(build, targets);
    for (let t = 0; t < 120; t++) {
      if (techniques) encounter.requestTechnique();
      encounter.advance(0.25);
    }
    const result = encounter.snapshot();
    results.push({
      tags,
      techniques,
      damage: 2000000 - result.targets.reduce((s, t) => s + t.health, 0),
      techniqueDamage: result.events
        .filter((e) => e.type === 'technique')
        .reduce((s, e) => s + (e.amount ?? 0), 0),
      controlSeconds: result.statuses.reduce((s, t) => s + t.movementPreventedSeconds, 0),
      statusEvents: result.events.filter((e) => e.type === 'status')
    });
  }
await writeFile(
  output,
  JSON.stringify(
    {
      path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      tiers: [1, 0, 0],
      durationSeconds: 30,
      requestIntervalSeconds: 0.25,
      results
    },
    null,
    2
  ) + '\n'
);
