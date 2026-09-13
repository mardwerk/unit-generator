import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { generate, reviewCandidateSources, validate } from '../../packages/core/dist/index.js';
import { loadBundledDefinition } from '../../packages/definitions/dist/index.js';
import { createProvidersFromEnv } from '../../packages/providers/dist/index.js';
import { qualifyUnit } from '../../packages/unit-lab/dist/index.js';
import { preserveDefinition } from './preservation.mjs';

const { values } = parseArgs({
  options: {
    units: {
      type: 'string',
      default: 'luffy,zoro,nami,usopp,sanji,chopper,robin,franky,brook,jinbe'
    },
    mode: { type: 'string', default: 'default' },
    label: { type: 'string' },
    requests: { type: 'string', default: 'examples/straw-hats/requests' },
    repairs: { type: 'string', default: '1' },
    'max-sources': { type: 'string', default: '4' },
    network: { type: 'boolean', default: false },
    'fallback-reason': { type: 'string' },
    'review-result': { type: 'string' },
    'preserve-unit': { type: 'string' },
    'allow-change-paths': { type: 'string' }
  }
});
if (!values.label || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(values.label))
  throw new Error('Supply a new --label containing lowercase letters, numbers and hyphens.');
if (!['default', 'quality'].includes(values.mode))
  throw new Error('Choose --mode default or quality.');
const units = values.units.split(',');
if (units.some((id) => !/^[a-z][a-z0-9-]{0,49}$/.test(id)) || new Set(units).size !== units.length)
  throw new Error('Supply unique comma-separated request identifiers.');
if (values['review-result'] && units.length !== 1)
  throw new Error('Source re-review requires exactly one --units identifier.');
const repairs = values['review-result'] ? 0 : Number(values.repairs);
const maxSources = Number(values['max-sources']);
if (!Number.isInteger(maxSources) || maxSources < 1 || maxSources > 8)
  throw new Error('Choose --max-sources between 1 and 8.');
if (!Number.isInteger(repairs) || repairs < 0 || repairs > 1)
  throw new Error('Choose zero or one repair.');
try {
  process.loadEnvFile('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const configured = createProvidersFromEnv({
  ...process.env,
  UNIT_OPENAI_STREAM: process.env.UNIT_OPENAI_STREAM ?? 'true',
  UNIT_PROVIDER_TIMEOUT_MS: process.env.UNIT_PROVIDER_TIMEOUT_MS ?? '300000',
  UNIT_RUN_TIMEOUT_MS: process.env.UNIT_RUN_TIMEOUT_MS ?? '1800000'
});
const selectedMode = configured.modes.find((mode) => mode.id === values.mode);
const baseExecution = configured.executionForMode(values.mode);
let definition = await loadBundledDefinition('manga-mayhem');
const privateDir = resolve('.scratch/straw-hats/runs', values.label);
const publicDir = resolve('examples/straw-hats/runs', values.label);
await mkdir(resolve(privateDir, '..'), { recursive: true });
await mkdir(resolve(publicDir, '..'), { recursive: true });
await mkdir(privateDir);
await mkdir(publicDir);
const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
const save = (path, value) =>
  writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
let preservation = null;
if (values['allow-change-paths'] && !values['preserve-unit'])
  throw new Error('--allow-change-paths requires --preserve-unit.');
if (values['preserve-unit']) {
  if (units.length !== 1) throw new Error('Preservation requires exactly one unit job.');
  const source = await readFile(values['preserve-unit'], 'utf8');
  const reference = JSON.parse(source);
  const allowedPaths = values['allow-change-paths']?.split(',') ?? [];
  const baseline = await validate(definition, reference);
  if (baseline.structure.status !== 'passed' || baseline.system.status !== 'passed')
    throw new Error('Preserved unit must pass current structure and system validation.');
  const helperSource = await readFile(new URL('./preservation.mjs', import.meta.url), 'utf8');
  preservation = {
    reference: values['preserve-unit'],
    fileSha256: hash(source),
    unitSha256: hash(reference),
    allowedPaths,
    implementationSha256: hash(helperSource)
  };
  definition = preserveDefinition(definition, reference, allowedPaths);
  await save(resolve(privateDir, 'preserved-unit.json'), reference);
  await writeFile(resolve(privateDir, 'preservation.mjs'), helperSource, { flag: 'wx' });
}
const sourceReceipt = ({ content, ...source }) => ({
  ...source,
  characters: content.length,
  sha256: hash(content)
});
function publicResearch({ sources, knowledge, ...entry }) {
  return {
    ...entry,
    sources: sources.map(sourceReceipt),
    ...(knowledge
      ? {
          knowledgeSummary: {
            subject: knowledge.subject,
            identity: knowledge.identity,
            claimCount: knowledge.claims.length,
            knowledgeSha256: hash(knowledge)
          }
        }
      : {})
  };
}
function publicFidelity(report) {
  if (!report) return report;
  return {
    status: report.status,
    gaps: report.gaps,
    claims: report.claims.map((claim) => ({
      path: claim.path,
      status: claim.status,
      sourceMechanic: claim.sourceMechanic,
      relationship: claim.relationship,
      sourceId: claim.sourceId,
      passageId: claim.passageId,
      sourceSha256: claim.sourceSha256,
      sourceRange: claim.sourceRange,
      ...(claim.quote
        ? { quoteSha256: hash(claim.quote), quoteCharacters: claim.quote.length }
        : {})
    })),
    representation:
      'Compact public receipt. Complete source passages and detailed model review remain in the private production result.'
  };
}
function readableUnit(unit, request, result) {
  if (result.validation.structure.status !== 'passed')
    return `# ${request.subject}\n\nThe generated candidate did not pass structural validation. See [candidate JSON](./candidate.json) and [the receipt](./receipt.json).\n`;
  const clean = (value) =>
    String(value ?? '')
      .replaceAll('|', '\\|')
      .replaceAll('\n', ' ');
  const lines = [
    `# ${unit.name}`,
    '',
    unit.description ?? '',
    '',
    `Continuity: ${request.continuity ?? 'as supplied in the request'}.`,
    '',
    `Production ${result.operation === 'candidate-source-review' ? 'source re-review' : 'generation'} result: ${result.status}. Independent content review is recorded separately. Numerical values are game adaptations.`,
    '',
    '[Executable JSON](./' +
      (result.output ? 'unit.json' : 'candidate.json') +
      ') · [Provenance and validation](./receipt.json)',
    '',
    '## Forms and attacks',
    '',
    '| Form | Unlock tier | Primary attack | Delivery | Damage | Period | Reach | Techniques |',
    '| --- | ---: | --- | --- | ---: | ---: | ---: | --- |'
  ];
  for (const form of unit.forms ?? [])
    lines.push(
      `| ${clean(form.name)} | ${form.unlockTier} | ${clean(form.primary.name)} | ${clean(form.primary.delivery ?? 'contact')} | ${form.primary.damage} | ${form.primary.period} | ${form.primary.reach} | ${form.techniques.map((technique) => clean(technique.name)).join(', ') || 'None'} |`
    );
  lines.push('', '## Purchases', '');
  for (const path of unit.paths ?? []) {
    lines.push(
      `### ${path.name}`,
      '',
      path.description ?? '',
      '',
      '| Tier | Upgrade | Cost | Description | Executable modifiers |',
      '| ---: | --- | ---: | --- | --- |'
    );
    path.upgrades.forEach((upgrade, index) =>
      lines.push(
        `| ${index + 1} | ${clean(upgrade.name)} | ${upgrade.cost} | ${clean(upgrade.description)} | \`${clean(JSON.stringify(upgrade.modifiers))}\` |`
      )
    );
    lines.push('');
  }
  lines.push(
    'The executable export also contains targeting, timing, resource and geometry fields. Passing bounded validation and stationary probes does not establish balance or complete canon coverage.',
    ''
  );
  return lines
    .join('\n')
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}
const rates = {
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'gpt-6-astra': { input: 10, output: 50 }
};
await save(resolve(privateDir, 'definition.json'), {
  id: definition.id,
  version: definition.version,
  inputSchema: definition.inputSchema,
  outputSchema: definition.outputSchema,
  rules: definition.rules,
  instructions: definition.instructions,
  examples: definition.examples,
  fileDigest: definition.fileDigest,
  implementationVersion: definition.implementationVersion
});
const runnerSource = await readFile(new URL(import.meta.url), 'utf8');
await writeFile(resolve(privateDir, 'runner.mjs'), runnerSource, { flag: 'wx' });
const implementationHashes = {};
for (const name of ['core', 'definitions', 'providers', 'unit-lab']) {
  const directory = resolve('packages', name, 'dist');
  const files = (await readdir(directory, { recursive: true }))
    .filter((file) => file.endsWith('.js'))
    .sort();
  const hashes = {};
  for (const file of files) hashes[file] = hash(await readFile(resolve(directory, file), 'utf8'));
  implementationHashes[name] = hash(hashes);
  await save(resolve(privateDir, `${name}-implementation-hashes.json`), hashes);
}
const run = {
  preservation,
  implementationHashes,
  runnerSha256: hash(runnerSource),
  operation: values['review-result'] ? 'candidate-source-review' : 'generation',
  originalResult: values['review-result'] ?? null,
  label: values.label,
  startedAt: new Date().toISOString(),
  mode: selectedMode,
  streaming: process.env.UNIT_OPENAI_STREAM !== 'false',
  fallbackReason: values['fallback-reason'] ?? null,
  requests: values.requests,
  definition: {
    id: definition.id,
    version: definition.version,
    fileDigest: definition.fileDigest,
    inputSchemaSha256: hash(definition.inputSchema),
    outputSchemaSha256: hash(definition.outputSchema)
  },
  limits: {
    maxRepairs: repairs,
    maxModelCalls: values['review-result'] ? 2 : 4 + repairs * 2,
    maxResearchCalls: 1,
    maxSources,
    timeoutMs: baseExecution.limits?.timeoutMs ?? 1800000,
    callTimeoutMs: baseExecution.limits?.callTimeoutMs ?? 300000
  },
  pricing: {
    rates,
    currency: 'USD',
    unit: 'per million tokens',
    source: 'https://developers.openai.com/api/docs/pricing',
    verifiedAt: '2026-09-09',
    scope:
      'Standard API-equivalent estimate using published rates captured earlier today. Not a provider invoice. Agent development and independent review usage excluded. Unknown usage is not zero.'
  },
  results: []
};
await save(resolve(privateDir, 'start.json'), run);
for (const id of units) {
  const prior = values['review-result']
    ? JSON.parse(await readFile(values['review-result'], 'utf8'))
    : null;
  const request =
    prior?.input ?? JSON.parse(await readFile(resolve(values.requests, `${id}.json`), 'utf8'));
  if (prior && (!prior.research?.length || !(prior.output ?? prior.candidate)))
    throw new Error('Source re-review needs a retained generated candidate and research.');
  const local = resolve(privateDir, id),
    output = resolve(publicDir, id);
  await mkdir(local);
  await mkdir(output);
  await save(resolve(local, 'request.json'), request);
  let callNumber = 0;
  const transportCalls = [];
  const model = {
    generate: async (call) => {
      const sequence = ++callNumber;
      const requestCall = { ...call };
      delete requestCall.signal;
      const record = {
        sequence,
        stage: call.stage,
        startedAt: new Date().toISOString(),
        completed: false,
        inputTokenUpperBound: Buffer.byteLength(JSON.stringify(requestCall)) + 4096,
        maxOutputTokens: call.maxOutputTokens
      };
      await save(resolve(local, `call-${sequence}-request.json`), requestCall);
      transportCalls.push(record);
      try {
        const reply = await baseExecution.model.generate(call);
        Object.assign(record, {
          completed: true,
          endedAt: new Date().toISOString(),
          model: reply.model,
          mode: reply.mode,
          usage: reply.usage
        });
        await save(resolve(local, `call-${sequence}-reply.json`), reply);
        return reply;
      } catch (error) {
        Object.assign(record, {
          endedAt: new Date().toISOString(),
          errorCode: typeof error?.code === 'string' ? error.code : 'transport-error'
        });
        throw error;
      } finally {
        await save(resolve(local, `call-${sequence}-receipt.json`), record);
      }
    }
  };
  process.stdout.write(JSON.stringify({ id, event: 'start', mode: values.mode }) + '\n');
  const execution = {
    ...baseExecution,
    model,
    limits: { ...baseExecution.limits, ...run.limits },
    policy: {
      network: values.network ? 'allow' : 'deny',
      discovery: values.network,
      followLinks: false,
      allowUngrounded: false
    },
    evaluate: ({ definitionId, candidate, research }) =>
      qualifyUnit({ definitionId, candidate, research }),
    onProgress: (event) => {
      if (event.type === 'progress') process.stdout.write(JSON.stringify({ id, ...event }) + '\n');
    }
  };
  let result;
  if (prior) {
    const candidate = prior.output ?? prior.candidate;
    const validation = await validate(definition, candidate, request);
    const qualification = qualifyUnit({
      definitionId: definition.id,
      candidate,
      research: prior.research
    });
    if (
      ['structure', 'system', 'constraints'].some(
        (part) =>
          validation[part].status === 'failed' || validation[part].status === 'not-completed'
      ) ||
      qualification.readiness === 'blocked'
    )
      throw new Error(
        'Retained candidate no longer passes current mechanics checks; no paid source re-review was made.'
      );
    const review = await reviewCandidateSources(
      candidate,
      request,
      prior.research,
      execution,
      definition.rules
    );
    await save(resolve(local, 'source-review.json'), review);
    result = {
      operation: 'candidate-source-review',
      status: review.status,
      originalGeneration: {
        path: values['review-result'],
        status: prior.status,
        candidateSha256: hash(candidate)
      },
      definition: {
        id: definition.id,
        version: definition.version,
        fileDigest: definition.fileDigest,
        implementationVersion: definition.implementationVersion
      },
      input: request,
      research: prior.research,
      validation,
      qualification,
      fidelity: review.fidelity,
      fidelityAttempts: review.fidelityAttempts,
      metadata: review.metadata,
      sourceReviewIssues: review.issues,
      error: review.error,
      ...(review.status === 'success' ? { output: candidate } : { candidate })
    };
  } else result = await generate(definition, request, execution);
  await save(resolve(local, 'result.json'), result);
  const candidate = result.output ?? result.candidate;
  const sourceEvidence = result.research.flatMap((entry) => entry.sources).map(sourceReceipt);
  const callCosts = transportCalls.map((transportCall, index) => {
    const call = { ...transportCall, ...result.metadata.calls[index] };
    const rate = rates[selectedMode.model];
    const knownInput = Number.isFinite(call.usage?.inputTokens),
      knownOutput = Number.isFinite(call.usage?.outputTokens);
    return {
      ...call,
      knownInputTokens: knownInput ? call.usage.inputTokens : null,
      knownOutputTokens: knownOutput ? call.usage.outputTokens : null,
      knownStandardApiEquivalentUsd: rate
        ? ((knownInput ? call.usage.inputTokens * rate.input : 0) +
            (knownOutput ? call.usage.outputTokens * rate.output : 0)) /
          1e6
        : null,
      usageComplete: knownInput && knownOutput,
      costRateKnown: Boolean(rate),
      unknownUsageConservativeAllowanceUsd:
        knownInput && knownOutput
          ? 0
          : rate
            ? (call.inputTokenUpperBound *
                rate.input *
                (call.inputTokenUpperBound > 272000 ? 2 : 1) *
                2 *
                1.25 *
                1.1 +
                call.maxOutputTokens *
                  rate.output *
                  (call.inputTokenUpperBound > 272000 ? 1.5 : 1) *
                  2 *
                  1.1) /
              1e6
            : null
    };
  });
  const receipt = {
    id,
    operation: run.operation,
    originalGeneration: result.originalGeneration,
    status: result.status,
    manualUnitEdits: false,
    preservation,
    mode: selectedMode,
    fallbackReason: run.fallbackReason,
    requestSha256: hash(request),
    unitSha256: candidate ? hash(candidate) : null,
    definition: {
      ...result.definition,
      inputSchemaSha256: run.definition.inputSchemaSha256,
      outputSchemaSha256: run.definition.outputSchemaSha256
    },
    input: {
      ...request,
      ...(request.knowledge
        ? {
            knowledge: publicResearch(request.knowledge)
          }
        : {}),
      sources: (request.sources ?? []).map((source) =>
        typeof source === 'string' ? source : sourceReceipt(source)
      )
    },
    research: result.research.map(publicResearch),
    validation: result.validation,
    qualification: result.qualification,
    fidelity: publicFidelity(result.fidelity),
    fidelityAttempts: result.fidelityAttempts?.map(({ reportValid, error }) => ({
      reportValid,
      error
    })),
    sourceReviewIssues: result.sourceReviewIssues,
    metadata: result.metadata,
    error: result.error,
    accounting: {
      calls: callCosts,
      knownStandardApiEquivalentUsd: callCosts.reduce(
        (sum, call) => sum + (call.knownStandardApiEquivalentUsd ?? 0),
        0
      ),
      unknownUsageCalls: callCosts.filter((call) => !call.usageComplete).length,
      unknownUsageConservativeAllowanceUsd: callCosts.reduce(
        (sum, call) => sum + (call.unknownUsageConservativeAllowanceUsd ?? 0),
        0
      ),
      failedCalls: callCosts.filter((call) => !call.completed).length
    },
    privateArtifacts: `.scratch/straw-hats/runs/${values.label}/${id}`
  };
  await save(resolve(output, 'receipt.json'), receipt);
  if (candidate) {
    await save(resolve(output, result.output ? 'unit.json' : 'candidate.json'), candidate);
    await writeFile(resolve(output, 'README.md'), readableUnit(candidate, request, result), {
      flag: 'wx'
    });
    const packetId = randomUUID();
    const reviewDir = resolve('.scratch/straw-hats/review');
    await mkdir(reviewDir, { recursive: true });
    await save(resolve(reviewDir, `${packetId}.json`), {
      packetId,
      definitionId: definition.id,
      request: {
        subject: request.subject,
        continuity: request.continuity,
        intent: request.intent,
        context: request.context
      },
      candidate,
      validation: result.validation,
      qualification: result.qualification,
      fidelity: result.fidelity,
      fidelityAttempts: result.fidelityAttempts,
      attempts: result.metadata.calls.map(({ stage, completed, errorCode }) => ({
        stage,
        completed,
        errorCode
      })),
      sources: result.research.flatMap((entry) => entry.sources),
      sourceEvidence
    });
    await save(resolve(local, 'review-identity.json'), {
      packetId,
      id,
      mode: values.mode,
      label: values.label
    });
  }
  const summary = {
    id,
    status: result.status,
    error: result.error,
    blockers: result.qualification?.findings
      .filter((finding) => finding.severity === 'blocker')
      .map((finding) => finding.code),
    calls: result.metadata.modelCalls,
    repairs: result.metadata.repairs,
    accounting: receipt.accounting,
    publicArtifacts: `examples/straw-hats/runs/${values.label}/${id}`,
    privateArtifacts: `.scratch/straw-hats/runs/${values.label}/${id}`
  };
  run.results.push(summary);
  process.stdout.write(
    JSON.stringify({
      id,
      status: summary.status,
      error: summary.error,
      blockers: summary.blockers,
      calls: summary.calls,
      repairs: summary.repairs
    }) + '\n'
  );
}
run.completedAt = new Date().toISOString();
await save(resolve(publicDir, 'run.json'), run);
if (run.results.some((result) => result.status !== 'success')) process.exitCode = 1;
