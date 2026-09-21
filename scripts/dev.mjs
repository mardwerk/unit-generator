import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Node watch mode owns restarts. Keep the Lab in this process so Ctrl+C also stops the server.
console.log('Building mardwerk-unit...');
const compiler = spawn(
  process.execPath,
  [fileURLToPath(import.meta.resolve('typescript/bin/tsc')), '-p', 'tsconfig.json'],
  { stdio: 'inherit' },
);
let interrupted = false;
const stopCompiler = () => {
  interrupted = true;
  compiler.kill('SIGTERM');
};
process.once('SIGINT', stopCompiler);
process.once('SIGTERM', stopCompiler);

try {
  const code = await new Promise((resolve, reject) => {
    compiler.once('error', reject);
    compiler.once('exit', (code, signal) => resolve(signal ? 1 : code));
  });
  process.removeListener('SIGINT', stopCompiler);
  process.removeListener('SIGTERM', stopCompiler);
  if (interrupted || code !== 0) {
    process.exitCode = 1;
  } else {
    await import('./copy-lab-assets.mjs');
    console.log('Watching source files. Refresh the browser after changes. Stop with Ctrl+C.');
    await import('../dist/lab/main.js');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
