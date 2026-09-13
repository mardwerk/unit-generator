import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const readJson = async (name) => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));
export async function loadExecutionConfig() {
  const stage = await readJson('./gates.json');
  const pricing = await readJson('./pricing.json');
  const explicit = await readFile(
    new URL('../model-comparison-preparation/explicit-direction.txt', import.meta.url),
    'utf8'
  );
  const withheld = await readFile(
    new URL('../model-comparison-preparation/withheld-subject.txt', import.meta.url),
    'utf8'
  );
  return {
    mode: stage.gates.rootActivation ? 'live' : 'offline',
    liveExecutionEnabled: stage.gates.rootActivation === true,
    gates: stage.gates,
    stageEvidence: stage.evidence,
    limits: {
      maxInputBytes: 200000,
      inputTokenOverhead: 4096,
      maxOutputBytes: 2000000,
      maxOutputTokens: 16000,
      callTimeoutMs: 600000,
      attemptTimeoutMs: 1800000
    },
    pricing: pricing.rates,
    pricingEvidence: pricing,
    http: {
      endpointEnv: 'UNIT_OPENAI_ENDPOINT',
      apiKeyEnv: 'UNIT_OPENAI_API_KEY',
      apiKeyFileEnv: 'UNIT_OPENAI_API_KEY_FILE',
      envFile: new URL('../../.env', import.meta.url).pathname
    },
    directions: { explicit, 'withheld-direction': withheld }
  };
}

export async function assertLiveReady(study, execution) {
  const missing = Object.entries(execution.gates ?? {})
    .filter(([, ready]) => ready !== true)
    .map(([name]) => name);
  if (!execution.gates?.rootActivation || missing.length)
    throw Error(`Live stage gates pending: ${missing.join(', ') || 'rootActivation'}`);
  if (execution.mode !== 'live' || execution.liveExecutionEnabled !== true)
    throw Error('Root has not activated live execution.');
  if (execution.limits.maxInputBytes + execution.limits.inputTokenOverhead > 272000)
    throw Error('Short-context pricing bound does not cover this request limit.');
  for (const [model, rates] of Object.entries(execution.pricing)) {
    if (!rates.verifiedAt || rates.source !== 'https://developers.openai.com/api/docs/pricing')
      throw Error(`Current pricing evidence missing for ${model}.`);
    if (
      execution.limits.maxOutputTokens > rates.maxOutputTokens ||
      execution.limits.maxInputBytes +
        execution.limits.inputTokenOverhead +
        execution.limits.maxOutputTokens >
        rates.contextTokens
    )
      throw Error(`Token limits exceed documented ${model} capability.`);
  }
  for (const record of [
    study.evaluation.rubricFreeze,
    study.directionFreeze.explicit,
    study.directionFreeze['withheld-direction']
  ]) {
    const bytes = await readFile(
      new URL(`../model-comparison-preparation/${record.path}`, import.meta.url)
    );
    if (createHash('sha256').update(bytes).digest('hex') !== record.sha256)
      throw Error(`Frozen protocol changed: ${record.path}`);
  }
  for (const capture of execution.pricingEvidence.captureFiles) {
    const record = await readJson(capture);
    const bytes = await readFile(new URL(`evidence/${record.contentFile}`, import.meta.url));
    if (createHash('sha256').update(bytes).digest('hex') !== record.sha256)
      throw Error('Captured pricing evidence changed.');
  }
}
