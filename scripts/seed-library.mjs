// Save checked-unit artifacts into the local UnitLab library.
// Usage: node scripts/seed-library.mjs <unit.json> [<unit.json> ...]
// Writes only to the local library directory; no model or network calls.
import { readFile } from 'node:fs/promises';
import { LabLibrary } from '../dist/lab/library.js';

const files = process.argv.slice(2);
if (!files.length) throw new Error('Usage: seed-library.mjs <unit.json> [...]');
const library = await LabLibrary.open();
for (const file of files) {
  const artifact = JSON.parse(await readFile(file, 'utf8'));
  const entry = await library.save(artifact);
  console.log(`Saved ${entry.character.name} as ${entry.id.slice(0, 12)}.`);
}
const state = await library.state();
console.log(`Library at ${state.directory} holds ${state.entries.length} entries.`);
