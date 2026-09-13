#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const foundation = resolve(root, '..', 'foundation');
const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log(`Usage: node scripts/setup.mjs [--local-foundation]

Install frozen dependencies and build Foundation and Unit Generator.
An absent sibling Foundation checkout is fetched at foundation-revision.json.
An existing checkout must match that revision and have no local changes.
--local-foundation explicitly uses an existing development checkout as it is.
It never resets, pulls, cleans, or changes the revision of an existing checkout.`);
  process.exit(0);
}

function output(command, commandArgs, cwd = root) {
  return execFileSync(command, commandArgs, { cwd, encoding: 'utf8' }).trim();
}

function run(command, commandArgs, cwd = root) {
  execFileSync(command, commandArgs, { cwd, stdio: 'inherit' });
}

try {
  if (args.some((arg) => arg !== '--local-foundation'))
    throw new Error('Unknown argument. Run node scripts/setup.mjs --help.');
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw new Error('Node.js 24 or newer is required.');
  const packageManager = JSON.parse(
    readFileSync(join(root, 'package.json'), 'utf8')
  ).packageManager;
  const expectedPnpm = packageManager.replace(/^pnpm@/, '');
  const actualPnpm = output('pnpm', ['--version']);
  if (actualPnpm !== expectedPnpm)
    throw new Error(`Use pnpm ${expectedPnpm}; found ${actualPnpm}.`);
  const pin = JSON.parse(readFileSync(join(root, 'foundation-revision.json'), 'utf8'));
  if (
    pin.repository !== 'https://github.com/mardwerk/foundation.git' ||
    !/^[a-f0-9]{40}$/.test(pin.revision)
  )
    throw new Error('Invalid foundation-revision.json.');

  if (!existsSync(foundation)) {
    if (args.includes('--local-foundation'))
      throw new Error('--local-foundation requires an existing sibling Foundation checkout.');
    const temporary = mkdtempSync(resolve(root, '..', '.foundation-setup-'));
    try {
      run('git', ['init', '--quiet', temporary]);
      run('git', ['remote', 'add', 'origin', pin.repository], temporary);
      run('git', ['fetch', '--depth=1', 'origin', pin.revision], temporary);
      run('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], temporary);
      renameSync(temporary, foundation);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }

  const actualRevision = output('git', ['rev-parse', 'HEAD'], foundation);
  const dirty = output('git', ['status', '--porcelain'], foundation);
  if (!args.includes('--local-foundation') && (actualRevision !== pin.revision || dirty))
    throw new Error(
      `Existing Foundation is ${actualRevision}${dirty ? ' with local changes' : ''}. ` +
        `This release requires ${pin.revision}. Nothing in that checkout was changed. ` +
        'Use a fresh parent directory for the pinned setup, or pass --local-foundation to build your development checkout.'
    );
  console.log(
    `Using Foundation ${actualRevision}${args.includes('--local-foundation') ? ' (local development checkout)' : ' (release pin)'}.`
  );
  run('pnpm', ['install', '--frozen-lockfile'], foundation);
  run(
    'pnpm',
    [
      '--filter',
      '@mardwerk/manifest',
      '--filter',
      '@mardwerk/model-client',
      '--filter',
      '@mardwerk/ui',
      'build'
    ],
    foundation
  );
  run('pnpm', ['install', '--frozen-lockfile']);
  run('pnpm', ['build']);
  console.log(
    'Setup complete. Run pnpm dev to open Unit Lab. Configure a model connection to generate.'
  );
} catch (error) {
  console.error(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
