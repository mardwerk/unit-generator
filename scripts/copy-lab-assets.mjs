import { cp, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

const target = new URL('../dist/lab/public/', import.meta.url);
await mkdir(target, { recursive: true });
await cp(new URL('../data/assets/public/', import.meta.url), target, { recursive: true });
await build({
  entryPoints: [new URL('../src/lab/client/main.tsx', import.meta.url).pathname],
  outfile: new URL('app.js', target).pathname,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2023',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
