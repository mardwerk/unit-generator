import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { generate } from '../../packages/core/dist/index.js';
import { loadBundledDefinition } from '../../packages/definitions/dist/index.js';
import { createLunaExecution, assertLunaReply } from './shared/execution-policy.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argument = (name, fallback) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
};
const variants = [
  'baseline',
  'direct',
  'plan',
  'critique',
  'combined',
  'refined',
  'compiler',
  'staged',
  'patch',
  'transport'
];
const variant = argument('--variant', 'baseline');
const track = argument('--track', 'hidden');
const streaming = argument('--stream', 'true') === 'true';
const effort = argument('--effort', 'high');
if (!['low', 'medium', 'high', 'xhigh'].includes(effort)) throw Error('Invalid reasoning effort.');
const replicate = Number(argument('--replicate', '1'));
if (
  !variants.includes(variant) ||
  !['hidden', 'brief'].includes(track) ||
  !Number.isInteger(replicate) ||
  replicate < 1
)
  throw Error('Invalid variant, track or replicate.');
const study = JSON.parse(await readFile(path.join(root, 'study.json'), 'utf8'));
const maxModelCalls =
  { compiler: 6, staged: 7, patch: 5, refined: 5, transport: 1 }[variant] ??
  study.perRunMaxModelCalls;
const sourceBytes = await readFile(path.join(root, study.sourceFile));
if (createHash('sha256').update(sourceBytes).digest('hex') !== study.sourceSha256)
  throw Error('Frozen research changed.');
const knowledge = JSON.parse(sourceBytes);
const input = { subject: study.subject, kind: 'character', knowledge };
if (track === 'brief')
  input.intent =
    "Design a long-range melee unit whose elastic attacks reach distant enemies. Organize its three upgrade paths around Conqueror's Haki, Observation Haki and Armament Haki. Represent its Gear forms as special forms that unlock characteristic attacks where the definition supports them. Distinguish the base state, Gears Second through Fifth and Gear Fourth variants; explain unsupported runtime behavior instead of claiming it is implemented.";
const runId = `${track}-${variant}-${effort}-${replicate}`;
const artifactDir = path.join(root, variant, 'runs', runId);
if (!args.includes('--live')) {
  console.log(
    JSON.stringify(
      {
        runId,
        variant,
        track,
        sourceSha256: study.sourceSha256,
        claimCount: knowledge.knowledge.claims.length,
        maxCalls: maxModelCalls,
        mode: 'plan-only-no-model-calls'
      },
      null,
      2
    )
  );
  process.exit(0);
}
if (
  study.status !== 'authorized' ||
  !Number.isInteger(study.totalCallBudget) ||
  study.totalCallBudget < 1
)
  throw Error('Study live-call budget is not configured.');
if (!study.tracks.includes(track)) throw Error('Track outside configured study.');
await mkdir(artifactDir, { recursive: true });
await writeFile(
  path.join(artifactDir, 'started.json'),
  JSON.stringify({ runId, at: new Date().toISOString() }, null, 2) + '\n',
  { flag: 'wx' }
);
// Only this coordinator makes provider calls. Agents run offline tests or inspect retained results.
process.loadEnvFile(path.join(root, '../../.env'));
const providerExecution = createLunaExecution(process.env, { effort, streaming });
const ledgerPath = path.join(root, 'call-ledger.jsonl');
const lockPath = path.join(root, 'ledger.lock');
async function locked(fn) {
  const until = Date.now() + 30_000;
  while (true) {
    try {
      await mkdir(lockPath);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() > until) throw Error('Budget ledger lock timeout');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    return await fn();
  } finally {
    await (await import('node:fs/promises')).rmdir(lockPath);
  }
}
async function ledger() {
  try {
    return (await readFile(ledgerPath, 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
let definition =
  variant === 'baseline' || variant === 'transport'
    ? await loadBundledDefinition()
    : await (await import(`./${variant}/prototype.mjs`)).createPrototype({ artifactDir });
if (variant === 'transport')
  definition = {
    ...definition,
    repairAttempts: 0,
    run: async (_input, ctx) => ({
      candidate: await ctx.model({
        stage: 'transport-probe',
        instructions: 'Return a JSON object with ok set to true.',
        input: {},
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['ok'],
          properties: { ok: { type: 'boolean' } }
        }
      })
    })
  };
let callNumber = 0;
const execution = {
  ...providerExecution,
  policy: { network: 'deny', discovery: false, followLinks: false, allowUngrounded: false },
  limits: {
    ...providerExecution.limits,
    maxModelCalls,
    maxRepairs: study.perRunMaxRepairs,
    maxResearchCalls: 1,
    timeoutMs: 1_200_000,
    callTimeoutMs: 360_000,
    maxOutputTokens: 24000
  },
  model: {
    async generate(call) {
      callNumber++;
      // Common request shaping prevents raw-source exposure from varying accidentally between stages.
      const request = call.input?.request;
      if (request && typeof request === 'object') {
        const withoutResearch = { ...request };
        delete withoutResearch.knowledge;
        delete withoutResearch.sources;
        const removedResearch = 'knowledge' in request || 'sources' in request;
        call = {
          ...call,
          input: {
            ...call.input,
            request: withoutResearch,
            ...(removedResearch && call.input.knowledge === undefined
              ? { knowledge: knowledge.knowledge }
              : {})
          }
        };
      }
      const inputByteAllowance =
        Buffer.byteLength(
          JSON.stringify({
            instructions: call.instructions,
            input: call.input,
            schema: call.schema
          })
        ) + 4096;
      const reservedUsd = (inputByteAllowance * 1.1 + call.maxOutputTokens * 3.96) / 1e6;
      const callId = `${runId}-${callNumber}`;
      await locked(async () => {
        const rows = await ledger();
        const reservations = rows.filter((row) => row.event === 'reserved');
        if (reservations.length >= study.totalCallBudget)
          throw Error('Study call budget exhausted.');
        const completed = new Map(
          rows
            .filter((row) => row.event === 'completed' && row.allowanceUsd !== null)
            .map((row) => [row.callId, row.allowanceUsd])
        );
        const spent = reservations
          .filter((row) => row.variant === variant)
          .reduce((sum, row) => sum + (completed.get(row.callId) ?? row.reservedUsd), 0);
        if (spent + reservedUsd > study.maxSpendUsdPerPrototype)
          throw Error('Prototype theoretical cost allowance exhausted.');
        await appendFile(
          ledgerPath,
          JSON.stringify({
            event: 'reserved',
            callId,
            runId,
            variant,
            effort,
            streaming,
            stage: call.stage,
            at: new Date().toISOString(),
            maxOutputTokens: call.maxOutputTokens,
            inputByteAllowance,
            reservedUsd
          }) + '\n'
        );
      });
      await writeFile(
        path.join(artifactDir, `call-${callNumber}-input.json`),
        JSON.stringify(
          {
            stage: call.stage,
            instructions: call.instructions,
            input: call.input,
            schema: call.schema
          },
          null,
          2
        ) + '\n'
      );
      const started = Date.now();
      try {
        const reply = await providerExecution.model.generate(call);
        await writeFile(
          path.join(artifactDir, `call-${callNumber}-output.json`),
          JSON.stringify(reply, null, 2) + '\n'
        );
        assertLunaReply(reply);
        const usage = reply.usage;
        const counted = Number.isFinite(usage?.inputTokens) && Number.isFinite(usage?.outputTokens);
        const longContext = counted && usage.inputTokens > 272000;
        const estimatedStandardUsd = counted
          ? (usage.inputTokens * (longContext ? 0.4 : 0.2) +
              usage.outputTokens * (longContext ? 1.8 : 1.2)) /
            1e6
          : null;
        const allowanceUsd = counted
          ? (usage.inputTokens * 1.1 + usage.outputTokens * 3.96) / 1e6
          : null;
        await appendFile(
          ledgerPath,
          JSON.stringify({
            event: 'completed',
            callId,
            runId,
            variant,
            effort,
            streaming,
            stage: call.stage,
            elapsedMs: Date.now() - started,
            model: reply.model,
            usage: usage ?? null,
            estimatedStandardUsd,
            allowanceUsd
          }) + '\n'
        );
        return reply;
      } catch (error) {
        await appendFile(
          ledgerPath,
          JSON.stringify({
            event: 'failed',
            callId,
            runId,
            stage: call.stage,
            elapsedMs: Date.now() - started,
            errorCode: error.code ?? 'provider-error',
            usage: null
          }) + '\n'
        );
        throw error;
      }
    }
  },
  onProgress(event) {
    if (event.type === 'progress')
      console.error(JSON.stringify({ runId, stage: event.stage, message: event.message }));
  }
};
const result = await generate(definition, input, execution);
await writeFile(path.join(artifactDir, 'result.json'), JSON.stringify(result, null, 2) + '\n', {
  flag: 'wx'
});
if (result.output ?? result.candidate)
  await writeFile(
    path.join(artifactDir, 'unit.json'),
    JSON.stringify(result.output ?? result.candidate, null, 2) + '\n',
    { flag: 'wx' }
  );
const { evaluateCandidate } = await import('./evaluation/evaluate.mjs');
const evaluated = evaluateCandidate(result.output ?? result.candidate ?? null, {
  research: knowledge,
  input
});
await writeFile(
  path.join(artifactDir, 'evaluation.json'),
  JSON.stringify(evaluated, null, 2) + '\n'
);
console.log(
  JSON.stringify(
    { runId, status: result.status, metadata: result.metadata, error: result.error, artifactDir },
    null,
    2
  )
);
