import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { retainedProgressionReference } from '../src/core/blueprint/progression-reference.js';
import { designGuidance } from '../src/core/blueprint/design-guidance.js';
import { designPlanRequest } from '../src/core/blueprint/plan.js';
import { defaultAuthoringDefinition } from '../src/core/default-profile.js';
import { prepareRequest, definitionProgression } from '../src/core/index.js';
import { miraRequest } from './fixtures/core-fixtures.js';

test('concrete planning and mechanics references share qualified retained progression context', async () => {
  const request = miraRequest();
  request.mechanicsDefinition = structuredClone(defaultAuthoringDefinition);
  request.progression = definitionProgression(request.mechanicsDefinition);
  const prepared = await prepareRequest(request);
  assert.ok(designPlanRequest(prepared).prompt.includes(retainedProgressionReference));
  assert.ok(designGuidance(prepared.request).includes(retainedProgressionReference));
  assert.match(retainedProgressionReference, /accessed 2026-09-20/);
  assert.match(retainedProgressionReference, /not universal multipliers/);
  assert.match(retainedProgressionReference, /incremental Medium/);
  assert.match(retainedProgressionReference, /does not specify the T5 cooldown/);
  assert.match(retainedProgressionReference, /Critical counters.*unsupported analogies/);
  assert.match(retainedProgressionReference, /Enemy-class damage bonuses.*unsupported analogies/);
  assert.match(retainedProgressionReference, /Extra pierce is unused against one isolated target/);
});

test('reference values remain traceable to exact retained Dart and Boomerang upgrade rows', async () => {
  const dart = await readFile('research/btd6/source-snapshots/btd6-dart-2026-09-20.txt', 'utf8');
  const boomerang = await readFile(
    'research/btd6/source-snapshots/btd6-boomerang-2026-09-20.txt',
    'utf8',
  );
  for (const quote of [
    'CrossbowCOST: $490 / $575 / $620 / $690',
    'Sharp ShooterCOST: $1,740 / $2,050 / $2,215 / $2,460',
    'Crossbow MasterCOST: $18,275 / $21,500 / $23,220 / $25,800',
    'Deals 6 damage per hit, attacks every 0.475s instead of 0.95s',
    'Attacks every 0.2375s instead of 0.475s',
    '80 damage per Critical Hit',
    'Critical Hits every 5 shots instead of every 10 shots',
  ])
    assert.ok(dart.includes(quote), quote);
  for (const quote of [
    'Bionic BoomerangCOST: $1,060 / $1,250 / $1,350 / $1,500',
    'Turbo ChargeCOST: $3,570 / $4,200 / $4,535 / $5,040',
    'Perma ChargeCOST: $29,750 / $35,000 / $37,800 / $42,000',
    'Attacks 8x faster',
    'attack 5x faster and deal +1 damage for 10 seconds',
    'Has a cooldown of 45 seconds',
    'deals 4 damage by default. Ability now deals +8 damage for 15 seconds',
  ])
    assert.ok(boomerang.includes(quote), quote);
  for (const value of [
    '575',
    '2050',
    '21500',
    '0.475s',
    '0.2375s',
    '1250',
    '4200',
    '35000',
    '10s',
    '45s',
    '15s',
  ])
    assert.ok(retainedProgressionReference.includes(value), value);
});
