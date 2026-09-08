import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const mapping = JSON.parse(await readFile(path.join(root, 'concealed-labels.json'), 'utf8'));
const output = path.join(root, 'review-decisions');
await mkdir(output, { recursive: true });
const manifest = [];
for (const [label, slot] of Object.entries(mapping)) {
  const runId = `${slot.track}-${slot.variant}-${slot.effort}-${slot.replicate}`;
  let result;
  try {
    result = JSON.parse(
      await readFile(path.join(root, slot.variant, 'runs', runId, 'result.json'), 'utf8')
    );
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  const d = result.design ?? {};
  const decisions = {
    label,
    notice:
      'Generator-authored adaptation notes. These are claims to check against the final unit, not independent evidence or acceptance.',
    omissions: d.omissions ?? null,
    sourceMappings:
      d.mappings?.map(({ claimIndices, sources, targets }) => ({
        claimIndices,
        sources,
        targets
      })) ?? null,
    capabilities: d.representability
      ? {
          supported: d.representability.supported,
          unsupported: d.representability.unsupported,
          defaults: d.representability.defaults
        }
      : null,
    feasibility: d.feasibility ?? d.plan ?? null
  };
  await writeFile(path.join(output, `${label}.json`), JSON.stringify(decisions, null, 2) + '\n');
  manifest.push({ label, file: `${label}.json` });
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${manifest.length} decision supplements.`);
