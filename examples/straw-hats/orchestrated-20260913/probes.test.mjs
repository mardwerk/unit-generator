import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compileMangaBuild,
  createMangaEncounterFromBuild
} from '../../../packages/definitions/dist/manga-mayhem/index.js';
import { bossScenario, targetFacts, supportProbe } from './probes.mjs';
function synthetic() {
  return {
    schema: 'mardwerk.manga-mayhem.unit',
    version: '0.1',
    id: 'synthetic-probe',
    name: 'Synthetic probe',
    cost: 100,
    baseForm: 'base',
    stunProtectionSeconds: 1,
    forms: [
      {
        id: 'base',
        name: 'Base',
        unlockTier: 0,
        drainPerSecond: 0,
        primary: {
          name: 'Contact',
          delivery: 'direct-contact',
          damage: 10,
          period: 1,
          windup: 0,
          reach: 10,
          shape: { kind: 'single' }
        },
        techniques: []
      }
    ],
    paths: ['a', 'b', 'c'].map((id) => ({
      id,
      name: id,
      upgrades: Array.from({ length: 5 }, () => ({
        name: 'Damage',
        cost: 100,
        modifiers: { flatDamage: 10 }
      }))
    }))
  };
}
test('armored boss rejects contact stun while ordinary target is controlled', () => {
  const unit = synthetic();
  unit.paths[0].upgrades[0].modifiers = { contactStun: 2 };
  const build = compileMangaBuild(unit, [1, 0, 0]);
  const run = (scenario) =>
    createMangaEncounterFromBuild(build, [
      { id: 'enemy', x: 1, y: 0, health: 40000, ...targetFacts(scenario) }
    ]).advance(3);
  assert.equal(run(bossScenario).statuses[0].movementPreventedSeconds, 0);
  assert(run({}).statuses[0].movementPreventedSeconds > 0);
});
test('healing handles supplied injury, range support changes recipient range, economy follows exact rounds', () => {
  const unit = synthetic();
  unit.support = { name: 'Heal', interval: 1, radius: 5, cap: 2, heal: 10 };
  unit.mechanics = {
    attacks: [],
    actors: [],
    passiveSummons: [],
    income: [
      {
        id: 'cash',
        amount: 7,
        emissionsPerRound: 2,
        intervalSeconds: 1,
        pickupLifetimeSeconds: 10,
        autoCollect: false
      }
    ],
    rangeSupport: [
      {
        id: 'range',
        radius: 5,
        global: false,
        includesOwner: false,
        stackGroup: 'range',
        rangeMultiplier: 0.5,
        rangeAdditive: 2
      }
    ]
  };
  const protocol = {
    durationSeconds: 4,
    allies: [
      { id: 'living', x: 1, y: 0, health: 50, maximumHealth: 100, baseRange: 10 },
      { id: 'dead', x: 1, y: 0, health: 0, maximumHealth: 100, baseRange: 10 }
    ],
    injuries: [{ at: 2, id: 'living', damage: 15 }],
    roundStarts: [0, 2],
    collections: [1, 2, 3, 4]
  };
  const result = supportProbe(compileMangaBuild(unit), protocol);
  assert.equal(result.healed, 40);
  assert.equal(result.injuryApplied, 15);
  assert.equal(result.finalAllies.find((a) => a.id === 'living').health, 75);
  assert.equal(result.finalAllies.find((a) => a.id === 'dead').health, 0);
  assert.equal(result.rangeRecipients[0].effectiveRange, 17);
  assert.equal(result.produced, 28);
  assert.equal(result.collected, 28);
  assert.equal(result.cash, 28);
  assert.equal(result.remainingPickups.length, 0);
});
