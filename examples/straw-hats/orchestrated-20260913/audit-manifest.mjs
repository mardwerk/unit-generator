#!/usr/bin/env node
// All paths are explicit and relative to the manifest. Never discovers or selects artifacts.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const usage = `Usage: node audit-manifest.mjs FINAL_MANIFEST.json
Manifest: {"units":[{"member":"luffy","unit":"path/unit.json","receipt":"path/receipt.json","receiptId":"optional-exact-job-alias","document":"docs/luffy.md","balanceReport":"optional/report.json","mechanicalEquivalence":{"unit":"optional/explicit/predecessor/unit.json"}}]}
Exactly ten members are required: luffy,zoro,nami,usopp,sanji,chopper,robin,franky,brook,jinbe.
receiptId defaults to member and otherwise names the exact generation job ID; crew membership remains unchanged.
Paths resolve relative to the manifest. balanceReport uses evaluate.mjs output {units:[{id,sha256,...}]}.
A direct balance hash must match final file bytes. Otherwise mechanicalEquivalence.unit must match the evaluated hash and differ only in unit/path/purchase descriptions.
This verifies artifact consistency and receipt claims, not canon fidelity, balance approval or raw source availability.`;
if (process.argv.includes('--help')) {
  console.log(usage);
  process.exit(0);
}
assert.equal(process.argv.length, 3, usage);
const manifestFile = resolve(process.argv[2]);
const base = dirname(manifestFile);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function read(path, maximum = 256 * 1024 * 1024) {
  const info = await stat(path);
  assert.ok(
    info.isFile() && info.size <= maximum,
    `Expected a file no larger than ${maximum} bytes: ${path}`
  );
  return readFile(path);
}
const parse = async (path) => JSON.parse(await read(path));
const manifest = await parse(manifestFile);
assert.ok(Array.isArray(manifest.units), 'Manifest requires units array.');
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
assert.equal(manifest.units.length, 10, 'Expected exactly ten units.');
assert.deepEqual(
  manifest.units.map((entry) => entry.member).sort(),
  [...members].sort(),
  'Expected each known member exactly once.'
);
const ids = new Set(),
  documents = new Set();
const reports = new Map();
const results = [];
const pathFor = (entry, key) => {
  assert.ok(typeof entry[key] === 'string' && entry[key].length, `Missing explicit ${key} path.`);
  return resolve(base, entry[key]);
};
const mechanical = (unit) => {
  const copy = structuredClone(unit);
  delete copy.description;
  for (const path of copy.paths) {
    delete path.description;
    for (const upgrade of path.upgrades) delete upgrade.description;
  }
  return copy;
};
for (const entry of manifest.units) {
  const unitPath = pathFor(entry, 'unit'),
    receiptPath = pathFor(entry, 'receipt'),
    documentPath = pathFor(entry, 'document');
  const bytes = await read(unitPath, 16 * 1024 * 1024),
    unit = JSON.parse(bytes);
  const receipt = await parse(receiptPath);
  const document = (await read(documentPath, 16 * 1024 * 1024)).toString('utf8');
  assert.equal(unit.schema, 'mardwerk.manga-mayhem.unit');
  assert.equal(unit.version, '0.1');
  assert.ok(
    typeof unit.id === 'string' && !ids.has(unit.id),
    `Missing or duplicate unit ID: ${unit.id}`
  );
  ids.add(unit.id);
  assert.ok(!documents.has(documentPath), `Repeated document: ${documentPath}`);
  documents.add(documentPath);
  assert.equal(unit.paths.length, 3, `${entry.member}: expected three paths.`);
  assert.ok(
    unit.paths.every((path) => path.upgrades.length === 5),
    `${entry.member}: expected exactly 15 purchases.`
  );
  assert.equal(receipt.status, 'success', `${entry.member}: receipt must report success.`);
  const expectedReceiptId = entry.receiptId ?? entry.member;
  assert.ok(
    typeof expectedReceiptId === 'string' && expectedReceiptId.length > 0,
    `${entry.member}: receiptId must be a nonempty string.`
  );
  assert.equal(receipt.id, expectedReceiptId, `${entry.member}: receipt job ID mismatch.`);
  assert.equal(receipt.manualUnitEdits, false, `${entry.member}: manualUnitEdits must be false.`);
  assert.equal(
    receipt.unitSha256,
    hash(JSON.stringify(unit)),
    `${entry.member}: normalized unit hash differs from receipt.`
  );
  const documentHash = document.match(/Source SHA-256: ([a-f0-9]{64})\./)?.[1];
  assert.equal(documentHash, hash(bytes), `${entry.member}: rendered source byte hash mismatch.`);
  const unitLink = document.match(/\[the supplied executable JSON\]\(([^\n]+)\)/)?.[1];
  assert.ok(unitLink, `${entry.member}: missing document source link.`);
  assert.equal(
    resolve(dirname(documentPath), unitLink),
    unitPath,
    `${entry.member}: document links a different unit.`
  );
  const appendixStart = document.lastIndexOf('## Exact executable JSON\n\n```json\n');
  assert.ok(appendixStart >= 0, `${entry.member}: missing JSON appendix.`);
  const appendix = document
    .slice(appendixStart)
    .match(/^## Exact executable JSON\n\n```json\n([\s\S]*)\n```\n?$/)?.[1];
  assert.ok(appendix, `${entry.member}: malformed JSON appendix.`);
  assert.deepEqual(JSON.parse(appendix), unit, `${entry.member}: appendix differs from unit.`);
  const purchaseSection = document.slice(
    document.indexOf('### Path 1:'),
    document.indexOf('### Completed build prices')
  );
  assert.equal(
    (purchaseSection.match(/^\|[ \t]*[1-5][ \t]*\|/gm) ?? []).length,
    15,
    `${entry.member}: rendered purchase count differs.`
  );
  let balance = 'not supplied';
  if (entry.balanceReport) {
    const reportPath = pathFor(entry, 'balanceReport');
    if (!reports.has(reportPath)) reports.set(reportPath, await parse(reportPath));
    const report = reports.get(reportPath);
    assert.ok(Array.isArray(report.units), `Balance report requires units: ${reportPath}`);
    const matches = report.units.filter((item) => item.id === unit.id);
    assert.equal(
      matches.length,
      1,
      `${entry.member}: balance report must identify exactly one matching unit ID.`
    );
    const evaluated = matches[0];
    assert.ok(
      !evaluated.issues?.length,
      `${entry.member}: balance report contains validation issues.`
    );
    if (evaluated.sha256 === hash(bytes)) balance = 'exact file hash';
    else {
      assert.ok(
        entry.mechanicalEquivalence,
        `${entry.member}: different balance hash requires explicit predecessor evidence.`
      );
      const predecessorPath = pathFor(entry.mechanicalEquivalence, 'unit');
      const predecessorBytes = await read(predecessorPath, 16 * 1024 * 1024);
      assert.equal(
        hash(predecessorBytes),
        evaluated.sha256,
        `${entry.member}: predecessor file hash differs from balance report.`
      );
      assert.deepEqual(
        mechanical(JSON.parse(predecessorBytes)),
        mechanical(unit),
        `${entry.member}: predecessor differs beyond display descriptions.`
      );
      balance = 'verified description-only predecessor';
    }
  } else
    assert.ok(
      !entry.mechanicalEquivalence,
      `${entry.member}: equivalence evidence requires a balance report.`
    );
  results.push({
    member: entry.member,
    unitId: unit.id,
    normalizedSha256: receipt.unitSha256,
    fileSha256: hash(bytes),
    purchases: 15,
    balance
  });
}
console.log(
  JSON.stringify(
    { status: 'pass', manifest: relative(process.cwd(), manifestFile), units: results },
    null,
    2
  )
);
