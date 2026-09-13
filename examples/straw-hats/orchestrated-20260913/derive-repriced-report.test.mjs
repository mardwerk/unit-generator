import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('repricing changes affordability and purchase prices, preserves measured damage, rejects attack edits', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'repricing-'));
  try {
    const unit = {
      schema: 'mardwerk.manga-mayhem.unit',
      version: '0.1',
      id: 'synthetic-price',
      name: 'Synthetic',
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
    const bytes = JSON.stringify(unit),
      hash = createHash('sha256').update(bytes).digest('hex');
    const base = {
        cost: 100,
        tiers: [0, 0, 0],
        scenario: 'wave',
        damage: 10,
        movementPreventedSeconds: 0
      },
      upgrade = { ...base, cost: 200, tiers: [1, 0, 0], damage: 20 };
    const report = {
      protocol: { budgets: [150], scenarios: [{ id: 'wave' }] },
      units: [
        {
          sha256: hash,
          results: [base, upgrade],
          supportResults: [{ cost: 200, tiers: [1, 0, 0], healed: 7 }],
          purchaseEdges: [
            { path: 0, tier: 1, purchaseCost: 100, scenarios: [{ before: base, after: upgrade }] }
          ],
          matchedSpending: []
        }
      ]
    };
    const input = join(dir, 'before.json'),
      final = join(dir, 'after.json'),
      measured = join(dir, 'report.json'),
      out = join(dir, 'out.json');
    await writeFile(input, bytes);
    await writeFile(measured, JSON.stringify(report));
    unit.paths[0].upgrades[0].cost = 40;
    await writeFile(final, JSON.stringify(unit));
    const run = () =>
      spawnSync(
        process.execPath,
        [
          'examples/straw-hats/orchestrated-20260913/derive-repriced-report.mjs',
          measured,
          input,
          final,
          out
        ],
        { encoding: 'utf8' }
      );
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const derived = JSON.parse(await readFile(out));
    assert.equal(derived.units[0].matchedSpending[0].winner.damage, 20);
    assert.equal(derived.units[0].matchedSpending[0].winner.cost, 140);
    assert.equal(derived.units[0].supportResults[0].healed, 7);
    assert.equal(derived.units[0].purchaseEdges[0].purchaseCost, 40);
    assert.equal(derived.derivation.measurementUnitSha256, hash);
    unit.forms[0].primary.damage = 11;
    await writeFile(final, JSON.stringify(unit));
    assert.notEqual(run().status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
