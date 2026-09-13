#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createMangaFixture } from '../packages/definitions/dist/manga-mayhem/fixture.js';
import { createMangaEncounter } from '../packages/definitions/dist/manga-mayhem/simulator.js';
import { validateMangaUnit } from '../packages/definitions/dist/manga-mayhem/compiler.js';
import { createBtd6FixtureV2 } from '../packages/definitions/dist/btd6-derived/v2-fixture.js';
import { probeBtd6BuildV2 } from '../packages/definitions/dist/btd6-derived/v2-runtime.js';

// The same original attack and status must execute through both game adapters.
const slow = {
  id: 'shared-slow',
  kind: 'slow',
  durationSeconds: 2,
  speedMultiplier: 0.5,
  immuneTo: [],
  stacking: { scope: 'source', reapply: 'refresh', maxStacks: 1 },
  combine: 'strongest'
};
const projectile = {
  id: 'shared-projectile',
  damage: 3,
  detectConcealed: false,
  radius: 1,
  pierce: 1,
  flight: { kind: 'aimed-impact', speed: 10 }
};
const manga = createMangaFixture();
manga.forms.splice(1);
delete manga.stamina;
Object.assign(manga.forms[0].primary, { damage: 0, period: 120, windup: 0 });
manga.mechanics = {
  attacks: [
    {
      id: 'shared',
      damage: 3,
      shape: { kind: 'single' },
      range: 20,
      detectConcealed: false,
      delivery: 'projectile',
      projectileSpeed: 10,
      projectileRadius: 1,
      intervalSeconds: 10,
      projectiles: 1,
      onHit: [slow],
      projectile
    }
  ],
  actors: [],
  passiveSummons: [],
  income: [],
  rangeSupport: []
};
assert.deepEqual(validateMangaUnit(manga), []);
const model = createBtd6FixtureV2().base;
model.attacks = [
  {
    ...model.attacks[0],
    id: 'shared',
    damage: 3,
    intervalSeconds: 10,
    projectiles: 1,
    pierce: 1,
    delivery: 'projectile',
    reach: { kind: 'radius', radius: 20, throughWalls: false },
    detectsCamo: false,
    immuneTo: [],
    onHit: [],
    statuses: [slow],
    projectile
  }
];
model.abilities = [];
const build = {
  schemaVersion: 'btd6-derived.build/0.2',
  unitId: 'shared-tower',
  tiers: [0, 0, 0],
  cost: 0,
  model,
  adaptations: [],
  unsupported: []
};
for (const horizon of [0.9, 1.5, 3.1]) {
  const target = { id: 'enemy', x: 10, y: 0, health: 100, progress: 1, strength: 1 };
  const mangaResult = createMangaEncounter(manga, [0, 0, 0], [target]).advance(horizon);
  const towerResult = probeBtd6BuildV2(build, { durationSeconds: horizon, targets: [target] });
  const expectedDamage = horizon > 1 ? 3 : 0;
  const expectedControlled = Math.min(2, Math.max(0, horizon - 1));
  const mangaHits = mangaResult.events.filter((event) => event.type === 'mechanical-hit');
  const towerHits = towerResult.events.filter((event) => event.kind === 'damage');
  assert.equal(
    mangaHits.reduce((sum, event) => sum + event.amount, 0),
    expectedDamage
  );
  assert.equal(
    towerHits.reduce((sum, event) => sum + event.amount, 0),
    expectedDamage
  );
  if (expectedDamage) {
    assert.equal(mangaHits[0].time, 1);
    assert.equal(towerHits[0].at, 1);
  }
  for (const status of [mangaResult.statuses[0], towerResult.statuses[0]]) {
    assert.equal(status.controlledSeconds, expectedControlled);
    assert.equal(status.movementPreventedSeconds, expectedControlled / 2);
  }
}
console.log('Shared projectile impact and status lifecycle passed through both game adapters.');

// A persistent contact must obey both timers, and expiry wins at the boundary.
for (const [variant, expectedTimes] of [
  ['intact', [0, 0.25, 0.5, 0.75]],
  ['without-refresh', [0, 0.25]],
  ['without-reset', [0]]
]) {
  const recurring = {
    ...projectile,
    pierce: 2,
    flight: { kind: 'stationary', lifetimeSeconds: 1 },
    hitReset: { intervalSeconds: 0.25, mode: 'all' },
    pierceRefresh: { intervalSeconds: 0.25 }
  };
  if (variant === 'without-refresh') delete recurring.pierceRefresh;
  if (variant === 'without-reset') delete recurring.hitReset;
  const mangaUnit = structuredClone(manga);
  mangaUnit.mechanics.attacks[0].projectile = recurring;
  mangaUnit.mechanics.attacks[0].onHit = [];
  const towerBuild = structuredClone(build);
  Object.assign(towerBuild.model.attacks[0], { projectile: recurring, pierce: 2, statuses: [] });
  const target = { id: 'enemy', x: 0, y: 0, health: 100, progress: 1, strength: 1 };
  const mangaResult = createMangaEncounter(mangaUnit, [0, 0, 0], [target]).advance(1.1);
  const towerResult = probeBtd6BuildV2(towerBuild, { durationSeconds: 1.1, targets: [target] });
  assert.deepEqual(
    mangaResult.events.filter((e) => e.type === 'mechanical-hit').map((e) => e.time),
    expectedTimes,
    `Manga ${variant}`
  );
  assert.deepEqual(
    towerResult.events.filter((e) => e.kind === 'damage').map((e) => e.at),
    expectedTimes,
    `Tower ${variant}`
  );
}
console.log(
  'Recurring projectile timers, exhaustion and expiry passed through both game adapters.'
);
