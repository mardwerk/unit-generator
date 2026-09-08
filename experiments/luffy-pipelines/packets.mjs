import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const mapping = JSON.parse(await readFile(path.join(root, 'concealed-labels.json'), 'utf8'));
const research = JSON.parse(await readFile(path.join(root, 'shared/research.json'), 'utf8'));
const output = path.join(root, 'review-packets');
await mkdir(output, { recursive: true });
const manifest = [];
for (const [label, slot] of Object.entries(mapping)) {
  const runId = `${slot.track}-${slot.variant}-${slot.effort}-${slot.replicate}`;
  const dir = path.join(root, slot.variant, 'runs', runId);
  let result, evaluation;
  try {
    result = JSON.parse(await readFile(path.join(dir, 'result.json'), 'utf8'));
    evaluation = JSON.parse(await readFile(path.join(dir, 'evaluation.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  const packet = {
    label,
    track: slot.track,
    replicate: slot.replicate,
    subject: research.subject,
    designerBrief: result.input?.intent ?? null,
    knowledge: research.knowledge,
    execution: {
      status: result.status,
      error: result.error ?? null,
      validation: result.validation
    },
    unit: result.output ?? result.candidate ?? null,
    evidence: {
      validity: evaluation.validity,
      dimensions: evaluation.dimensions,
      observations: evaluation.observations,
      diagnostics: evaluation.diagnostics,
      distantTargetProbe: evaluation.distantTargetProbe,
      formProbes: evaluation.formProbes,
      limits: evaluation.limits
    }
  };
  await writeFile(path.join(output, `${label}.json`), JSON.stringify(packet, null, 2) + '\n');
  manifest.push({ label, track: slot.track, replicate: slot.replicate, file: `${label}.json` });
}
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest));
