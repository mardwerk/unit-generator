// Build a standalone HTML gallery from saved checked-unit artifacts.
// Usage: node scripts/render-gallery.mjs <out.html> <unit.json> [<unit.json> ...]
// Reads the built core only for artifact parsing; no model or network calls.
import { readFile, writeFile } from 'node:fs/promises';

const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function viewOf(artifact) {
  const candidate = artifact?.draft?.candidate;
  if (!candidate) throw new Error('Expected a checked artifact with draft.candidate.');
  return candidate;
}

function tierRows(path) {
  return path.tiers
    .map(
      (tier) =>
        `<tr><td>T${tier.tier}</td><td>${escape(tier.name)}</td><td>${escape(tier.benefit)}</td></tr>`,
    )
    .join('\n');
}

function unitSection(candidate) {
  const base = candidate.basicAttack;
  const stats = candidate.blueprint?.baseAttack?.stats;
  const statLine = stats
    ? `${stats.damage} damage every ${stats.intervalSeconds}s, range ${stats.range}, pierce ${stats.pierce}, ${stats.projectiles} projectile(s)`
    : '';
  const paths = candidate.paths
    .map(
      (path) => `<div class="path">
<h3>${escape(path.name)}</h3>
<p class="theme">${escape(path.theme)}</p>
<table><thead><tr><th>Tier</th><th>Upgrade</th><th>Effect</th></tr></thead>
<tbody>${tierRows(path)}</tbody></table>
</div>`,
    )
    .join('\n');
  return `<section class="unit">
<h2>${escape(candidate.character.name)}</h2>
<p class="role">${escape(candidate.blueprint?.role ?? candidate.role)}</p>
<p class="theme">Weakness: ${escape(candidate.blueprint?.weakness ?? '')}</p>
<div class="base"><h3>Base: ${escape(base.name)}</h3>
<p>${escape(statLine)}</p>
<p>${escape(base.behavior)} ${escape(base.delivery)} ${escape(base.targeting)}</p>
<p class="limits">${escape(base.limitations)}</p></div>
${paths}
</section>`;
}

const [, , output, ...inputs] = process.argv;
if (!output || !inputs.length)
  throw new Error('Usage: render-gallery.mjs <out.html> <unit.json> [...]');
const sections = [];
for (const file of inputs) {
  const artifact = JSON.parse(await readFile(file, 'utf8'));
  sections.push(unitSection(viewOf(artifact)));
}
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Spine pipeline example units</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 24px; color: #1a1a1a; }
.unit { border: 1px solid #ccc; border-radius: 12px; padding: 20px; margin-bottom: 28px; }
.role { font-size: 1.1em; }
.base { background: #f6f6f6; border-radius: 8px; padding: 12px 16px; margin: 12px 0; }
.limits { color: #555; }
.path { margin-top: 16px; }
.theme { color: #444; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; vertical-align: top; }
th { background: #f0f0f0; }
</style>
</head>
<body>
<h1>Spine pipeline example units</h1>
<p>Generated from character names with the default BTD6-inspired profile. Values are proposed; balance is not certified.</p>
${sections.join('\n')}
</body>
</html>
`;
await writeFile(output, html);
console.log(`Wrote ${output} with ${sections.length} units.`);
