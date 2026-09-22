import assert from 'node:assert/strict';
import test from 'node:test';
import { referenceRecipes } from '../src/core/mechanics/reference-patterns.js';
import {
  allLegalBuilds,
  resolveUnchecked,
  selectionIssues,
} from '../src/core/mechanics/resolve.js';
import { type Attack, type BuildSelection } from '../src/core/mechanics/schemas.js';
import { defaultAuthoringDefinition } from '../src/core/default-profile.js';

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

test('early crosspaths preserve the purchased main attack pattern and follow-up scope', () => {
  for (const entry of referenceRecipes) {
    for (const selection of allLegalBuilds(defaultAuthoringDefinition)) {
      const build = resolveUnchecked(entry.blueprint, selection);
      const main = selection.findIndex((tier) => tier > 2);
      const bare = resolveUnchecked(
        entry.blueprint,
        main < 0 ? [0, 0, 0] : pure(main, selection[main]!),
      );
      assert.deepEqual(build.baseAttack.followUp, bare.baseAttack.followUp);
      assert.equal(build.baseAttack.distribution, bare.baseAttack.distribution);
      assert.equal(build.baseAttack.delivery, bare.baseAttack.delivery);
      assert.deepEqual(
        build.abilities.map((ability) => ability.boostedAttack.followUp),
        bare.abilities.map((ability) => ability.boostedAttack.followUp),
      );
    }
  }
});
