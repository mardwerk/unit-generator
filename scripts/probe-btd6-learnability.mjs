// Bounded research probe. Measures what a scorer trained on the checked-in BTD6
// package could actually learn. No model calls, no network.
// Run from the repository root:
//
//   node scripts/probe-btd6-learnability.mjs research/btd6/raw/btd6_towers.json
//
// Test 1 fits a word-to-role classifier on 25 towers and predicts the held-out
// tower, repeated across all 26, then compares against the majority baseline.
// Test 2 prints per-tier price spreads and the tier 4 / tier 5 overlap.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = process.argv[2] ?? 'research/btd6/raw/btd6_towers.json';
const data = JSON.parse(await readFile(resolve(process.cwd(), source), 'utf8'));

const upgrades = [];
for (const tower of data.towers)
  for (const path of tower.paths)
    for (const upgrade of path.upgrades)
      upgrades.push({
        tower: tower.id,
        text: (upgrade.description ?? '').toLowerCase(),
        label: upgrade.towerdefense_type,
        tier: upgrade.tier,
        price: upgrade.incremental_cost?.by_difficulty?.medium ?? null,
      });

const words = (text) =>
  text
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);

const counts = {};
for (const upgrade of upgrades) counts[upgrade.label] = (counts[upgrade.label] ?? 0) + 1;
const topLabel = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

let correct = 0;
let majorityCorrect = 0;
let total = 0;
for (const held of [...new Set(upgrades.map((upgrade) => upgrade.tower))]) {
  const table = {};
  for (const upgrade of upgrades) {
    if (upgrade.tower === held) continue;
    for (const word of new Set(words(upgrade.text))) {
      table[word] = table[word] ?? {};
      table[word][upgrade.label] = (table[word][upgrade.label] ?? 0) + 1;
    }
  }
  for (const upgrade of upgrades) {
    if (upgrade.tower !== held) continue;
    total += 1;
    if (upgrade.label === topLabel) majorityCorrect += 1;
    const votes = {};
    for (const word of new Set(words(upgrade.text))) {
      const cell = table[word];
      if (!cell) continue;
      const best = Object.entries(cell).sort((a, b) => b[1] - a[1])[0];
      votes[best[0]] = (votes[best[0]] ?? 0) + best[1];
    }
    if (Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] === upgrade.label) correct += 1;
  }
}
console.log(
  `role-from-prose leave-one-tower-out: ${correct}/${total} = ${((100 * correct) / total).toFixed(1)}%`,
);
console.log(
  `majority baseline (${topLabel}): ${majorityCorrect}/${total} = ${((100 * majorityCorrect) / total).toFixed(1)}%`,
);

const byTier = {};
for (const upgrade of upgrades) {
  if (upgrade.price == null) continue;
  byTier[upgrade.tier] = byTier[upgrade.tier] ?? [];
  byTier[upgrade.tier].push(upgrade.price);
}
for (const tier of Object.keys(byTier).sort()) {
  const values = byTier[tier].slice().sort((a, b) => a - b);
  console.log(
    `tier ${tier}: n=${values.length} median=${values[Math.floor(values.length / 2)]} min=${values[0]} max=${values[values.length - 1]}`,
  );
}
const t4 = byTier[4].slice().sort((a, b) => a - b);
const t5 = byTier[5].slice().sort((a, b) => a - b);
console.log(`T4 max=${t4[t4.length - 1]} vs T5 min=${t5[0]} overlap=${t4[t4.length - 1] > t5[0]}`);
