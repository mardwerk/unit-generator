import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const slots = JSON.parse(
  await readFile(path.join(root, process.argv[2] ?? 'slots-initial.json'), 'utf8')
);
let next = 0;
const outcomes = [];
async function worker() {
  while (next < slots.length) {
    const slot = slots[next++];
    const args = [
      path.join(root, 'run.mjs'),
      '--live',
      '--variant',
      slot.variant,
      '--track',
      slot.track,
      '--effort',
      slot.effort,
      '--replicate',
      String(slot.replicate)
    ];
    console.log(JSON.stringify({ event: 'started', slot }));
    const result = await new Promise((resolve) => {
      const child = spawn(process.execPath, args, {
        cwd: path.resolve(root, '../..'),
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
        process.stdout.write(chunk);
      });
      child.on('error', (error) =>
        resolve({ exitCode: null, error: String(error), stdout, stderr })
      );
      child.on('close', (code) => resolve({ exitCode: code, stdout, stderr }));
    });
    const record = { slot, ...result };
    outcomes.push(record);
    await writeFile(
      path.join(root, `${process.argv[2] ?? 'slots-initial.json'}.outcomes.json`),
      JSON.stringify(outcomes, null, 2) + '\n'
    );
    console.log(
      JSON.stringify({
        event: 'finished',
        slot,
        exitCode: result.exitCode,
        summary: result.stdout.slice(-1400)
      })
    );
  }
}
await Promise.all(
  Array.from({ length: Math.min(Number(process.argv[3] ?? 4), slots.length) }, worker)
);
