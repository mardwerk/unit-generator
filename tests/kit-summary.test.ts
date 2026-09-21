import assert from 'node:assert/strict';
import test from 'node:test';
import { unitSummary, pathSummary } from '../src/core/blueprint/kit-summary.js';
import {
  defaultMechanicsDefinition,
  type Attack,
  type ResolvedBuild,
} from '../src/core/mechanics/index.js';

function attack(): Attack {
  return {
    name: 'Spark',
    cost: 250,
    delivery: 'projectile',
    damageType: 'energy',
    targeting: 'first',
    camo: false,
    stats: {
      damage: 10,
      intervalSeconds: 1,
      range: 20,
      pierce: 1,
      projectiles: 1,
      splashRadius: 0,
      slowPercent: 0,
      slowSeconds: 0,
      burnDamagePerSecond: 0,
      burnSeconds: 0,
      stunSeconds: 0,
    },
  };
}

function build(baseAttack: Attack): ResolvedBuild {
  return { selection: [5, 0, 0], baseAttack, abilities: [], cumulativeCost: 1000, tierDeltas: [] };
}

test('kit summary states immunity and detection separately from obstruction', () => {
  const base = attack();
  const summary = unitSummary(base, defaultMechanicsDefinition);
  assert.match(summary, /Single-target projectile/);
  assert.match(summary, /clear delivery path/);
  assert.match(summary, /without Camo detection/);
  assert.match(summary, /cannot affect purple enemies/);
  base.camo = true;
  assert.doesNotMatch(unitSummary(base, defaultMechanicsDefinition), /without Camo/);
  assert.match(unitSummary(base, defaultMechanicsDefinition), /clear delivery path/);
});

test('path summary includes tradeoffs and does not promise coverage beyond the target cap', () => {
  const base = attack();
  const after = structuredClone(base);
  after.stats.damage = 30;
  after.stats.intervalSeconds = 2;
  after.stats.range = 10;
  after.stats.splashRadius = 5;
  const summary = pathSummary(base, build(after));
  assert.match(summary, /Higher damage per hit/);
  assert.match(summary, /Tradeoffs: slower attacks, shorter reach/);
  assert.doesNotMatch(summary, /wider coverage/);
  after.stats.pierce = 3;
  assert.match(pathSummary(base, build(after)), /wider coverage/);
});
