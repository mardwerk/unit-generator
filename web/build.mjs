// Builds the web client into web/dist, which the Go binary embeds.
// Usage: node web/build.mjs
import { copyFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';

const web = new URL('./', import.meta.url);
const dist = new URL('dist/', web);
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'styles.css', 'mardwerk.png'])
  await copyFile(new URL(`public/${file}`, web), new URL(file, dist));
await build({
  entryPoints: [new URL('src/main.tsx', web).pathname],
  outfile: new URL('app.js', dist).pathname,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2023',
  minify: true,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
});
