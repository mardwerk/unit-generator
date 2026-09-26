// Builds the web client into src/web/dist, which the Go binary embeds.
// Usage: node src/web/build.mjs
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const web = new URL('./', import.meta.url);
const dist = new URL('dist/', web);
const path = (relative) => fileURLToPath(new URL(relative, web));
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'mardwerk.png'])
  await copyFile(new URL(`public/${file}`, web), new URL(file, dist));
const css = await postcss([tailwind({ base: path('.'), optimize: { minify: true } })]).process(
  await readFile(path('app/styles.css'), 'utf8'),
  { from: path('app/styles.css') },
);
await writeFile(new URL('styles.css', dist), css.css);
await build({
  entryPoints: [path('app/main.tsx')],
  outfile: path('dist/app.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2023',
  minify: true,
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
});
