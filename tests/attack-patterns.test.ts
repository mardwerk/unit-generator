import assert from 'node:assert/strict';
import test from 'node:test';
import {
  selectVolleyTargets,
  resolveFollowUpHits,
  type AttackTarget,
  type Attack,
} from '../src/core/mechanics/index.js';
import { defaultAuthoringDefinition } from '../src/core/default-profile.js';
import { validBlueprint } from './fixtures/blueprint.js';
import { resolveUnchecked } from '../src/core/mechanics/resolve.js';

const definition = defaultAuthoringDefinition;
function attack(): Attack {
  const value = validBlueprint().baseAttack;
  value.damageType = 'normal';
  value.stats.damage = 4;
  value.stats.range = 30;
  value.stats.projectiles = 3;
  value.distribution = 'distinct-targets';
  value.followUp = {
    name: 'Fragments',
    count: 2,
    damageMultiplier: 0.5,
    radius: 8,
    inheritStatuses: false,
  };
  return value;
}
function target(id: string, distance = 1, patch: Partial<AttackTarget> = {}): AttackTarget {
  return {
    id,
    distanceFromUnit: 10,
    distanceFromPrimary: distance,
    camo: false,
    obstructed: false,
    obstructedFromPrimary: false,
    properties: [],
    ...patch,
  };
}

test('distinct volleys preserve the primary, use nearest visible targets once, and waste spare shots', () => {
  const value = attack();
  const targets = [
    target('p'),
    target('b', 2),
    target('a', 2),
    target('hidden', 0, { camo: true }),
    target('far', 0, { distanceFromUnit: 31 }),
    target('wall', 0, { obstructed: true }),
  ];
  assert.deepEqual(selectVolleyTargets(value, 'p', targets, definition), ['p', 'a', 'b']);
  assert.deepEqual(selectVolleyTargets(value, 'p', targets.slice(0, 2), definition), ['p', 'b']);
  assert.deepEqual(selectVolleyTargets(value, 'hidden', targets, definition), []);
  delete value.distribution;
  assert.deepEqual(selectVolleyTargets(value, 'p', targets, definition), ['p', 'p', 'p']);
});

test('follow-ups require a hit, exclude all primary contacts and never multiply by volley count, pierce or splash', () => {
  const value = attack();
  value.stats.pierce = 20;
  value.stats.splashRadius = 5;
  const targets = [
    target('p'),
    target('other-primary'),
    target('b', 2),
    target('a', 2),
    target('far', 9),
  ];
  assert.deepEqual(resolveFollowUpHits(value, [], targets, definition), []);
  const hits = resolveFollowUpHits(value, ['p', 'other-primary', 'p'], targets, definition);
  assert.deepEqual(
    hits.map((hit) => [hit.targetId, hit.damage]),
    [
      ['a', 2],
      ['b', 2],
    ],
  );
  assert.ok(
    hits.every(
      (hit) => !('followUp' in hit) && !('projectiles' in hit) && !('splashRadius' in hit),
    ),
  );
});

test('secondary access uses impact-origin obstruction, explicit status inheritance and enemy immunities', () => {
  const value = attack();
  value.damageType = 'energy';
  value.followUp!.count = 8;
  value.followUp!.inheritStatuses = true;
  Object.assign(value.stats, {
    burnDamagePerSecond: 3,
    burnSeconds: 2,
    slowPercent: 20,
    slowSeconds: 1,
    stunSeconds: 0.2,
  });
  const targets = [
    target('ordinary'),
    target('purple', 1, { properties: ['purple'] }),
    target('boss', 1, { properties: ['boss'] }),
    target('wall', 0, { obstructedFromPrimary: true }),
    target('unknown', 0, { obstructedFromPrimary: undefined }),
    target('hidden', 0, { camo: true }),
  ];
  const hits = resolveFollowUpHits(value, ['p'], targets, definition);
  assert.equal(hits.length, 3);
  assert.equal(hits.find((hit) => hit.targetId === 'ordinary')!.burnDamagePerSecond, 3);
  assert.equal(hits.find((hit) => hit.targetId === 'purple')!.damage, 0);
  assert.equal(hits.find((hit) => hit.targetId === 'purple')!.burnDamagePerSecond, 0);
  assert.equal(hits.find((hit) => hit.targetId === 'boss')!.slowPercent, 0);
  assert.equal(hits.find((hit) => hit.targetId === 'boss')!.stunSeconds, 0);
  value.followUp!.inheritStatuses = false;
  assert.ok(
    resolveFollowUpHits(value, ['p'], targets, definition).every(
      (hit) => hit.burnSeconds === 0 && hit.slowPercent === 0 && hit.stunSeconds === 0,
    ),
  );
});

test('crosspath and boost damage reach secondary hits only in their declared scope', () => {
  const value = validBlueprint();
  value.paths.path2.tiers.tier5.changes = [
    {
      kind: 'followUp',
      target: 'boost',
      value: {
        name: 'Active fragments',
        count: 2,
        damageMultiplier: 0.5,
        radius: 5,
        inheritStatuses: false,
      },
    },
  ];
  const before = resolveUnchecked(value, [2, 4, 0]);
  const after = resolveUnchecked(value, [2, 5, 0]);
  assert.equal(before.baseAttack.followUp, undefined);
  assert.equal(before.abilities[0]!.boostedAttack.followUp, undefined);
  assert.equal(after.baseAttack.followUp, undefined);
  const boosted = after.abilities[0]!.boostedAttack;
  const hits = resolveFollowUpHits(boosted, ['p'], [target('a')], definition);
  assert.equal(hits[0]!.damage, boosted.stats.damage * 0.5);
  assert.equal(resolveFollowUpHits(after.baseAttack, ['p'], [target('a')], definition).length, 0);
});

test('extensions require declared support and malformed geometry cannot silently assign hits', () => {
  const old = structuredClone(definition);
  delete old.rules.attackExtensions;
  assert.throws(() => selectVolleyTargets(attack(), 'p', [target('p')], old), /does not enable/);
  assert.throws(
    () => resolveFollowUpHits(attack(), ['p'], [target('x'), target('x')], definition),
    /unique IDs/,
  );
  assert.throws(
    () => resolveFollowUpHits(attack(), ['p'], [target('x', NaN)], definition),
    /finite nonnegative/,
  );
});
