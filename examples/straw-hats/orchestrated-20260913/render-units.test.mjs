import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { format, resolveConfig } from 'prettier';

const renderer = fileURLToPath(new URL('./render-units.mjs', import.meta.url));
test('renders every synthetic purchase, profile and nested mechanic without changing the JSON', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'manga-render-'));
  try {
    const primary = {
      name: 'Synthetic \u2014 contact',
      delivery: 'direct-contact',
      damage: 2,
      period: 1,
      windup: 0.2,
      reach: 5,
      shape: { kind: 'single' }
    };
    const unit = {
      schema: 'mardwerk.manga-mayhem.unit',
      version: '0.1',
      id: 'synthetic',
      name: 'Synthetic',
      cost: 100,
      baseForm: 'base',
      stunProtectionSeconds: 1,
      stamina: {
        unlockTier: 1,
        maximum: 100,
        entryMinimum: 20,
        recoveryPerSecond: 5,
        reentrySeconds: 2,
        techniqueCost: 10,
        techniqueCooldown: 4
      },
      support: { name: 'Synthetic heal', interval: 2, radius: 3, cap: 2, heal: 1 },
      forms: [
        { id: 'base', name: 'Base', unlockTier: 0, drainPerSecond: 0, primary, techniques: [] },
        {
          id: 'alternate',
          name: 'Alternate',
          unlockTier: 1,
          drainPerSecond: 1,
          primary,
          techniques: [
            {
              id: 'shot',
              name: 'Synthetic shot',
              unlockTier: 1,
              damage: 3,
              windup: 0.5,
              recovery: 2,
              hits: 1,
              hitSpan: 0,
              shape: { kind: 'area', radius: 2, cap: 3 },
              delivery: 'projectile',
              projectileSpeed: 4,
              projectileRadius: 1,
              control: { slow: { fraction: 0.2, seconds: 1 } }
            },
            {
              id: 'combo',
              name: 'Synthetic combo',
              unlockTier: 2,
              damage: 4,
              windup: 0.5,
              recovery: 2,
              hits: 3,
              hitSpan: 1,
              shape: { kind: 'single' }
            }
          ]
        }
      ],
      paths: Array.from({ length: 3 }, (_, p) => ({
        id: `path-${p}`,
        name: `Path ${p}`,
        upgrades: Array.from({ length: 5 }, (_, i) => ({
          name: `Purchase ${p}-${i}`,
          description: 'A | B\nC',
          cost: (i + 1) * 10,
          modifiers: { flatDamage: 1 }
        }))
      })),
      mechanics: { attacks: [], actors: [], passiveSummons: [], income: [], rangeSupport: [] }
    };
    const input = join(temp, 'unit.json');
    const out = join(temp, 'docs');
    await writeFile(input, JSON.stringify(unit));
    execFileSync(process.execPath, [renderer, '--out', out, input]);
    const rendered = await readFile(join(out, 'synthetic.md'), 'utf8');
    assert.equal(
      rendered,
      await format(rendered, { ...(await resolveConfig(renderer)), parser: 'markdown' })
    );
    const unpadded = rendered.replace(/[ \t]+\|/g, ' |').replace(/\|[ \t]+/g, '| ');
    assert.ok(!rendered.includes('\u2014'));
    assert.ok(rendered.includes('Synthetic - contact'));
    assert.ok(rendered.includes('Synthetic \\u2014 contact'));
    assert.equal((rendered.match(/\|[ \t]*Purchase \d-\d/g) ?? []).length, 15);
    assert.equal((rendered.match(/^\|[ \t]*[025]-[025]-[025][ \t]*\|/gm) ?? []).length, 6);
    assert.ok(unpadded.includes('| 5-2-0 | 280 |'));
    assert.ok(unpadded.includes('| 5 | Purchase 0-4 | 50 | 250 |'));
    assert.ok(rendered.includes('A \\| B<br>C'));
    assert.ok(unpadded.includes('| control.slow.fraction | 0.2 |'));
    assert.ok(unpadded.includes('| stamina.techniqueCooldown | 4 |'));
    assert.ok(unpadded.includes('| support.interval | 2 |'));
    assert.ok(unpadded.includes('| passiveSummons | [] |'));
    assert.ok(rendered.includes('First scheduled launch at 0.5s; final scheduled launch at 0.5s'));
    assert.ok(
      rendered.includes('First scheduled contact at 0.5s; final scheduled contact at 1.5s')
    );
    assert.ok(rendered.includes('Per-use authored hit damage sum: 12.'));
    assert.deepEqual(JSON.parse(rendered.split('```json\n')[1].split('\n```')[0]), unit);
    assert.throws(
      () =>
        execFileSync(process.execPath, [renderer, '--out', out, input, input], { stdio: 'pipe' }),
      /Duplicate unit ID/
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
