import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const audit = fileURLToPath(new URL('./audit-manifest.mjs', import.meta.url));
const renderer = fileURLToPath(new URL('./render-units.mjs', import.meta.url));
const sha = (value) => createHash('sha256').update(value).digest('hex');
test('audits explicit synthetic ten-member exports and rejects tampering and false equivalence', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'manifest-audit-'));
  try {
    const members = [
      'luffy',
      'zoro',
      'nami',
      'usopp',
      'sanji',
      'chopper',
      'robin',
      'franky',
      'brook',
      'jinbe'
    ];
    const manifest = { units: [] },
      report = { units: [] };
    const save = (path, value) => writeFile(join(temp, path), JSON.stringify(value));
    for (const member of members) {
      await mkdir(join(temp, member));
      const unit = {
        schema: 'mardwerk.manga-mayhem.unit',
        version: '0.1',
        id: `synthetic-${member}`,
        name: member,
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
              name: 'Synthetic \u2014 contact',
              delivery: 'direct-contact',
              damage: 2,
              period: 1,
              windup: 0.2,
              reach: 5,
              shape: { kind: 'single' }
            },
            techniques: []
          }
        ],
        paths: Array.from({ length: 3 }, (_, p) => ({
          id: `path-${p}`,
          name: `Path ${p}`,
          upgrades: Array.from({ length: 5 }, (_, i) => ({
            name: `Purchase ${p}-${i}`,
            cost: 10,
            modifiers: { flatDamage: 1 }
          }))
        }))
      };
      const entry = {
        member,
        unit: `${member}/unit.json`,
        receipt: `${member}/receipt.json`,
        document: `docs/${unit.id}.md`,
        balanceReport: 'balance.json'
      };
      await save(entry.unit, unit);
      await save(entry.receipt, {
        id: member,
        status: 'success',
        manualUnitEdits: false,
        unitSha256: sha(JSON.stringify(unit))
      });
      report.units.push({ id: unit.id, sha256: sha(JSON.stringify(unit)) });
      manifest.units.push(entry);
    }
    await save('balance.json', report);
    await save('manifest.json', manifest);
    execFileSync(process.execPath, [
      renderer,
      '--out',
      join(temp, 'docs'),
      ...manifest.units.map((e) => join(temp, e.unit))
    ]);
    const run = () =>
      execFileSync(process.execPath, [audit, join(temp, 'manifest.json')], {
        encoding: 'utf8',
        stdio: 'pipe'
      });
    assert.equal(JSON.parse(run()).units.length, 10);
    const nami = manifest.units.find((entry) => entry.member === 'nami');
    const namiReceipt = JSON.parse(await readFile(join(temp, nami.receipt)));
    namiReceipt.id = 'nami-faithful';
    await save(nami.receipt, namiReceipt);
    assert.throws(run, /receipt job ID mismatch/);
    nami.receiptId = 'nami-faithful';
    await save('manifest.json', manifest);
    assert.equal(JSON.parse(run()).units.find((entry) => entry.member === 'nami').member, 'nami');
    nami.receiptId = 'nami-wrong';
    await save('manifest.json', manifest);
    assert.throws(run, /receipt job ID mismatch/);
    nami.receiptId = 'nami-faithful';
    await save('manifest.json', manifest);
    const first = manifest.units[0],
      original = JSON.parse(await readFile(join(temp, first.unit)));
    const predecessor = structuredClone(original);
    predecessor.description = 'Earlier display prose';
    await save('predecessor.json', predecessor);
    report.units[0].sha256 = sha(JSON.stringify(predecessor));
    await save('balance.json', report);
    assert.throws(run, /requires explicit predecessor evidence/);
    first.mechanicalEquivalence = { unit: 'predecessor.json' };
    await save('manifest.json', manifest);
    assert.equal(JSON.parse(run()).units[0].balance, 'verified description-only predecessor');
    predecessor.forms[0].primary.damage++;
    await save('predecessor.json', predecessor);
    report.units[0].sha256 = sha(JSON.stringify(predecessor));
    await save('balance.json', report);
    assert.throws(run, /differs beyond display descriptions/);
    report.units[0].sha256 = sha(JSON.stringify(original));
    await save('balance.json', report);
    const docPath = join(temp, first.document),
      doc = await readFile(docPath, 'utf8');
    await writeFile(
      docPath,
      doc.replace(/Source SHA-256: [a-f0-9]{64}/, `Source SHA-256: ${'0'.repeat(64)}`)
    );
    assert.throws(run, /rendered source byte hash mismatch/);
    await writeFile(docPath, doc);
    await save(first.receipt, {
      id: first.member,
      status: 'success',
      manualUnitEdits: true,
      unitSha256: sha(JSON.stringify(original))
    });
    assert.throws(run, /manualUnitEdits must be false/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
