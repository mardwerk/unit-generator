// Records the golden corpus the Go port is checked against.
// Runs the TypeScript suite with instrumented Engine exports, then keeps one
// entry per distinct input (and model exchange sequence) for each function.
// Usage: node scripts/golden/record.mjs [outDir]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const out = process.argv[2] ?? 'contracts/v1/golden';
const raw = mkdtempSync(join(tmpdir(), 'golden-'));
const run = (command, args, env = {}) =>
  execFileSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });

rmSync('.test-build', { recursive: true, force: true });
run('npx', ['tsc', '-p', 'tsconfig.test.json']);
run('node', ['scripts/golden/instrument.mjs', '.test-build']);
const tests = readdirSync('.test-build/tests')
  .filter((file) => file.endsWith('.test.js'))
  .map((file) => join('.test-build/tests', file));
run('node', ['--test', ...tests], { GOLDEN_DIR: raw });

/** Stable stringify so equal inputs share one key regardless of property order. */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

const groups = new Map();
for (const file of readdirSync(raw)) {
  const name = file.split('.')[0];
  const entries = groups.get(name) ?? new Map();
  groups.set(name, entries);
  for await (const line of createInterface({ input: createReadStream(join(raw, file)) })) {
    if (!line) continue;
    const entry = JSON.parse(line);
    delete entry.top;
    const key = createHash('sha256')
      .update(stable([entry.args, entry.model?.exchanges ?? null]))
      .digest('hex');
    if (!entries.has(key)) entries.set(key, entry);
  }
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [name, entries] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  const lines = [...entries]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, entry]) => JSON.stringify(entry));
  writeFileSync(join(out, `${name}.jsonl.gz`), gzipSync(lines.join('\n') + '\n', { level: 9 }));
  console.log(`${name}: ${lines.length}`);
}
rmSync(raw, { recursive: true, force: true });
