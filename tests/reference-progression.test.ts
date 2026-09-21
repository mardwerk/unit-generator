import assert from 'node:assert/strict';
import test from 'node:test';
import { referenceRecipes } from '../src/core/mechanics/reference-patterns.js';
import {
  allLegalBuilds,
  resolveUnchecked,
  selectionIssues,
} from '../src/core/mechanics/resolve.js';
import { pathKeys, type Attack, type BuildSelection } from '../src/core/mechanics/schemas.js';
import { specialtyMetrics } from '../src/core/mechanics/design-policy.js';
import { defaultAuthoringDefinition } from '../src/core/default-profile.js';

const recipe = (id: string) => referenceRecipes.find((entry) => entry.id === id)!;
const pure = (index: number, tier: number): BuildSelection =>
  [0, 1, 2].map((path) => (path === index ? tier : 0)) as BuildSelection;

test('a T3 main path still permits later T1 and T2 crosspath purchases but no second advanced or third path', () => {
  for (const selection of [
    [3, 0, 0],
    [3, 1, 0],
    [3, 2, 0],
  ] as BuildSelection[]) {
    assert.deepEqual(selectionIssues(selection, defaultAuthoringDefinition), []);
  }
  for (const selection of [
    [3, 3, 0],
    [3, 2, 1],
  ] as BuildSelection[]) {
    assert.ok(selectionIssues(selection, defaultAuthoringDefinition).length > 0);
  }
  assert.equal(allLegalBuilds(defaultAuthoringDefinition).length, 64);
});
function signature(attack: Attack) {
  return {
    delivery: attack.delivery,
    targeting: attack.targeting,
    distribution: attack.distribution ?? 'same-primary',
    area: attack.stats.splashRadius > 0,
    stun: attack.stats.stunSeconds > 0,
    followUp: attack.followUp ?? null,
  };
}

test('all early purchases improve the original attack without introducing a different attack loop', () => {
  for (const entry of referenceRecipes) {
    const base = entry.blueprint.baseAttack;
    for (const selection of allLegalBuilds(defaultAuthoringDefinition).filter((build) =>
      build.every((tier) => tier <= 2),
    )) {
      const build = resolveUnchecked(entry.blueprint, selection);
      const attack = build.baseAttack;
      assert.deepEqual(signature(attack), signature(base), `${entry.id}/${selection}`);
      assert.equal(attack.stats.projectiles, base.stats.projectiles);
      assert.equal(attack.stats.burnDamagePerSecond > 0, base.stats.burnDamagePerSecond > 0);
      assert.equal(attack.stats.slowPercent > 0, base.stats.slowPercent > 0);
      assert.equal(build.abilities.length, 0);
    }
  }
});

test('every path transforms its T2 attack at T3 and materially develops that specialty at T5', () => {
  for (const entry of referenceRecipes) {
    pathKeys.forEach((path, index) => {
      const t2 = resolveUnchecked(entry.blueprint, pure(index, 2));
      const t3 = resolveUnchecked(entry.blueprint, pure(index, 3));
      const t4 = resolveUnchecked(entry.blueprint, pure(index, 4));
      const t5 = resolveUnchecked(entry.blueprint, pure(index, 5));
      const label = `${entry.id}/${path}`;
      assert.notDeepEqual(signature(t3.baseAttack), signature(t2.baseAttack), label);
      assert.equal(t4.baseAttack.followUp, undefined, label);
      assert.ok(
        t4.abilities.every((ability) => !ability.boostedAttack.followUp),
        label,
      );
      const ultimate = t5.abilities[0]?.boostedAttack ?? t5.baseAttack;
      if (ultimate.followUp) {
        assert.ok(ultimate.followUp.count >= 3, label);
        assert.ok(ultimate.followUp.radius > 0, label);
      }
      const specialty = entry.blueprint.paths[path].specialization!;
      const before = specialtyMetrics(t4, specialty);
      const after = specialtyMetrics(t5, specialty);
      assert.ok(
        Object.keys(before).some(
          (key) => before[key]! > 0 && after[key]! / before[key]! >= 3 - 1e-9,
        ),
        label,
      );
      if (t5.abilities.length) {
        assert.equal(
          t5.baseAttack.followUp,
          undefined,
          `${label}: ordinary attacks remain ordinary`,
        );
        assert.equal(t5.abilities[0]!.path, 'path2', label);
      }
    });
  }
});

test('Black Flame progresses into ignition, eruption and distributed barrage instead of a renamed beam', () => {
  const entry = recipe('pulsed-energy-pressure-v2');
  assert.equal(entry.blueprint.baseAttack.delivery, 'projectile');
  const ignition = resolveUnchecked(entry.blueprint, [3, 0, 0]).baseAttack;
  assert.equal(ignition.delivery, 'area');
  assert.equal(ignition.stats.splashRadius, 6);
  assert.equal(ignition.stats.burnDamagePerSecond, 3);
  const eruption = resolveUnchecked(entry.blueprint, [0, 3, 0]).baseAttack;
  assert.equal(eruption.delivery, 'area');
  assert.equal(eruption.stats.splashRadius, 4);
  const barrage = resolveUnchecked(entry.blueprint, [0, 0, 3]).baseAttack;
  assert.equal(barrage.distribution, 'distinct-targets');
  assert.equal(barrage.stats.projectiles, 2);
  const ignitionUltimate = resolveUnchecked(entry.blueprint, [5, 0, 0]).baseAttack;
  assert.equal(ignitionUltimate.followUp!.inheritStatuses, true);
  assert.equal(ignitionUltimate.stats.burnDamagePerSecond, 32);
  const activeUltimate = resolveUnchecked(entry.blueprint, [0, 5, 0]);
  assert.equal(activeUltimate.baseAttack.followUp, undefined);
  assert.equal(activeUltimate.abilities[0]!.boostedAttack.followUp!.count, 6);
});

test('crosspaths preserve the main behavior and cannot buy ultimate components through early tiers', () => {
  for (const entry of referenceRecipes) {
    for (const selection of allLegalBuilds(defaultAuthoringDefinition)) {
      const build = resolveUnchecked(entry.blueprint, selection);
      const main = selection.findIndex((tier) => tier > 2);
      if (main < 0 || selection[main]! < 5) {
        assert.equal(build.baseAttack.followUp, undefined);
        assert.ok(build.abilities.every((ability) => !ability.boostedAttack.followUp));
        continue;
      }
      const bare = resolveUnchecked(entry.blueprint, pure(main, 5));
      assert.deepEqual(build.baseAttack.followUp, bare.baseAttack.followUp);
      assert.equal(build.baseAttack.distribution, bare.baseAttack.distribution);
      assert.equal(build.baseAttack.delivery, bare.baseAttack.delivery);
      assert.deepEqual(
        build.abilities.map((ability) => ability.boostedAttack.followUp),
        bare.abilities.map((ability) => ability.boostedAttack.followUp),
      );
    }
  }
  const flame = recipe('pulsed-energy-pressure-v2').blueprint;
  const bare = resolveUnchecked(flame, [5, 0, 0]);
  const detection = resolveUnchecked(flame, [5, 2, 0]);
  assert.equal(detection.baseAttack.camo, true);
  assert.equal(detection.baseAttack.stats.range, bare.baseAttack.stats.range + 6);
  assert.deepEqual(detection.baseAttack.followUp, bare.baseAttack.followUp);
  const burnCrosspath = resolveUnchecked(flame, [2, 0, 5]).baseAttack;
  assert.equal(burnCrosspath.distribution, 'distinct-targets');
  assert.equal(burnCrosspath.stats.burnDamagePerSecond, 1);
  assert.equal(burnCrosspath.followUp!.inheritStatuses, true);
});

test('the focused area branch actually replaces broad splash while the crowd branch distributes area pulses', () => {
  const entry = recipe('close-area-control-v2');
  const focused = resolveUnchecked(entry.blueprint, [0, 0, 3]).baseAttack;
  assert.equal(focused.delivery, 'instant');
  assert.equal(focused.stats.splashRadius, 0);
  const crowd = resolveUnchecked(entry.blueprint, [3, 0, 0]).baseAttack;
  assert.equal(crowd.delivery, 'area');
  assert.equal(crowd.distribution, 'distinct-targets');
  assert.equal(crowd.stats.projectiles, 2);
});
