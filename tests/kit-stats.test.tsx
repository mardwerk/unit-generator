import assert from 'node:assert/strict';
import { test } from 'node:test';
import { load } from 'cheerio';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  pathKeys,
  tierKeys,
  defaultMechanicsDefinition,
  type UnitBlueprint,
} from '../src/core/mechanics/index.js';
import { kitStats } from '../src/presentation/kit-stats.js';
import { compileBlueprint } from '../src/core/planned-v1/compile.js';
import { StatValues } from '../src/lab/client/kit-stats.js';
import { CharacterSheet } from '../src/lab/client/kit.js';
import { authorUnit } from '../src/core/index.js';
import { FakeModel, miraCandidate, miraRequest } from './fixtures/core-fixtures.js';

function blueprint(): UnitBlueprint {
  const paths = {} as UnitBlueprint['paths'];
  for (const path of pathKeys) {
    const tiers = {} as UnitBlueprint['paths']['path1']['tiers'];
    for (const tier of tierKeys)
      tiers[tier] = {
        name: `${path} ${tier}`,
        cost: 100,
        changes: [{ kind: 'stat', target: 'base', stat: 'damage', operation: 'add', value: 1 }],
      };
    paths[path] = {
      name: path,
      theme: 'Focused attack improvement',
      rationale: 'Develop the supplied attack.',
      sourceFactIndices: [0],
      tiers,
    };
  }
  return {
    name: 'Practice Archer',
    role: 'Single target damage',
    weakness: 'Cannot damage Lead without upgrades.',
    sourceFacts: [{ documentId: 'character', quote: 'The archer fires arrows.' }],
    constraintCoverage: [],
    baseAttack: {
      name: 'Arrow',
      cost: 250,
      delivery: 'projectile',
      damageType: 'sharp',
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
    },
    paths,
    proposals: [],
    reservedTechniques: [],
  };
}

function candidate(unit = blueprint()) {
  const request = miraRequest();
  request.mechanicsDefinition = structuredClone(defaultMechanicsDefinition);
  return compileBlueprint(unit, request);
}

test('stat cards resolve cumulative arithmetic and faster intervals from mechanics', () => {
  const unit = blueprint();
  unit.paths.path1.tiers.tier1.changes = [
    { kind: 'stat', target: 'base', stat: 'damage', operation: 'add', value: 2 },
  ];
  unit.paths.path1.tiers.tier2.changes = [
    { kind: 'stat', target: 'base', stat: 'damage', operation: 'set', value: 20 },
  ];
  unit.paths.path1.tiers.tier3.changes = [
    { kind: 'stat', target: 'base', stat: 'intervalSeconds', operation: 'multiply', value: 0.5 },
  ];
  const stats = kitStats(candidate(unit))!;
  assert.deepEqual(stats.tiers.get('path-1:2')?.changes, [
    { key: 'damage', before: 12, after: 22, improvement: true },
  ]);
  assert.deepEqual(stats.tiers.get('path-1:3')?.changes, [
    { key: 'intervalSeconds', before: 1, after: 0.5, improvement: true },
  ]);
});

test('camo, enum changes, new boosts and modified boosts retain exact values', () => {
  const unit = blueprint();
  unit.paths.path2.tiers.tier1.changes = [{ kind: 'camo', target: 'base', value: true }];
  unit.paths.path2.tiers.tier2.changes = [{ kind: 'damageType', target: 'base', value: 'normal' }];
  unit.paths.path2.tiers.tier4.changes = [
    {
      kind: 'unlockBoost',
      target: 'base',
      boost: {
        name: 'Focus',
        durationSeconds: 10,
        cooldownSeconds: 30,
        damageMultiplier: 2,
        intervalMultiplier: 0.5,
        rangeBonus: 3,
      },
    },
  ];
  unit.paths.path2.tiers.tier5.changes = [
    { kind: 'modifyBoost', target: 'base', stat: 'cooldownSeconds', operation: 'add', value: -5 },
  ];
  const stats = kitStats(candidate(unit))!;
  assert.deepEqual(stats.tiers.get('path-2:1')?.changes, [
    { key: 'camo', before: 'No', after: 'Yes' },
  ]);
  assert.deepEqual(stats.tiers.get('path-2:2')?.changes, [
    { key: 'damageType', before: 'sharp', after: 'normal' },
  ]);
  assert.ok(
    stats.tiers
      .get('path-2:4')
      ?.changes.some(
        (change) =>
          change.key === 'ability' && change.after === 'Focus' && change.before === undefined,
      ),
  );
  assert.deepEqual(stats.tiers.get('path-2:5')?.changes, [
    { key: 'cooldownSeconds', before: 30, after: 25, improvement: true },
  ]);
});

test('legacy and invalid mechanics never invent numeric changes', () => {
  assert.equal(kitStats(miraCandidate()), undefined);
  const draft = candidate();
  draft.blueprint!.baseAttack.stats.intervalSeconds = -1;
  assert.equal(kitStats(draft), undefined);
});

test('every upgrade has a native card button, independent image control and compact structured values', async () => {
  const result = structuredClone(await authorUnit(miraRequest(), new FakeModel()));
  result.candidate = candidate();
  result.prepared.request.mechanicsDefinition = {
    ...structuredClone(defaultMechanicsDefinition),
    profile: { ...defaultMechanicsDefinition.profile, currency: 'Crystals' },
  };
  const $ = load(
    renderToStaticMarkup(
      <CharacterSheet
        artifact={result}
        busy={false}
        icons={{ artifact: result, response: null, error: '', refresh: () => {} }}
      />,
    ),
  );
  assert.equal($('.tier-card').length, 15);
  assert.equal(
    $('.tier-card > .tier-content > button.card-open[aria-haspopup="dialog"]').length,
    15,
  );
  assert.equal($('button button').length, 0);
  assert.equal($('.tier-card .kit-icon').length, 15);
  const first = $('.tier-card').first();
  assert.equal(first.find('.kit-cost').attr('aria-label'), 'Crystals 100');
  assert.match(first.find('.kit-cost').attr('title')!, /Crystals/);
  assert.match(first.find('.stat-before').text(), /Previous: 10/);
  assert.match(first.find('.stat-after').text(), /New: 11/);
  assert.equal(first.find('.tier-change').length, 0);
  assert.equal($('.unit-identity .kit-cost').length, 0);
  assert.equal($('.general-information .kit-cost').attr('aria-label'), 'Crystals 250');
  assert.equal($('.general-information h3').text(), 'General information');
  assert.match($('.general-information').text(), /Purchase cost/);
  assert.equal($('.general-information dt').length, 1);
  assert.equal($('.general-information').text().includes(result.candidate.character.scope), false);
  assert.deepEqual(
    $('.unit-overview')
      .children()
      .map((_, element) => $(element).attr('class'))
      .get(),
    ['general-information', 'basic-attack'],
  );
  assert.equal($('.basic-attack .kit-stats svg').length > 0, true);
  assert.doesNotMatch($('.general-information').text(), /footprint/i);
  assert.equal($('.basic-attack .kit-cost').length, 0);
  assert.equal($('.basic-attack p').length, 0);
  assert.equal($('.basic-attack button.card-open[aria-haspopup="dialog"]').length, 1);
});

test('interval improvements and numerical tradeoffs are readable without color', () => {
  const html = renderToStaticMarkup(
    <StatValues
      changes={[
        { key: 'intervalSeconds', before: 1, after: 0.5, improvement: true },
        { key: 'damage', before: 10, after: 8, improvement: false },
        { key: 'intervalMultiplier', before: 0.5, after: 0.8, improvement: false },
      ]}
    />,
  );
  assert.match(html, /Faster/);
  assert.match(html, /Reduced/);
  assert.match(html, /Slower/);
});
