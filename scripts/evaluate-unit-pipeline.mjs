import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

// Explicit, bounded research. No library or live server access.
const defaultModel = 'nex-agi/nex-n2.5-mini:free';
const maxResponseBytes = 1_000_000;
const maxRequestBytes = 300_000;
const defaultSettings = {
  reasoningEffort: 'none',
  temperature: 0.7,
  topP: 0.95,
  maxTokens: 16000,
  timeoutMs: 120_000,
};
const rubric = {
  structure:
    'All three declared paths have tiers 1 through 5, references resolve, and every legal build passes the supplied deterministic mechanics checks.',
  identity:
    'Powers attributed to canon are supported by the exact excerpt. Creative game names alone are not canon claims. Recognizable source identity informs actual behavior, not only labels. New game effects remain proposals.',
  contrast:
    'The three advanced paths have different tactical uses and limitations. Tier 3 establishes a specialization and tier 5 develops its own signature.',
  inheritance:
    'Each purchase makes a concrete change with a named target and value or operation. Legal crosspaths preserve purchased modifiers without granting unpurchased behavior.',
  overload:
    'Base and tiers 1 and 2 have no manual combat activation. Each early purchase adds at most one modest independent automatic capability; combined early builds remain readable.',
  readability:
    'One readable base loop, short tier deltas, no repeated full-kit descriptions. Record rendered word count as a diagnostic, not a quality score.',
  honesty:
    'Retain source-period gaps, secondary-source limits, proposed numerical status and unsupported mechanics. No invented approval, canon verification or balance certification.',
};
const stringify = (value) => JSON.stringify(value, null, 2);
const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : stringify(value))
    .digest('hex');
const save = (path, value) => writeFile(path, stringify(value));
class EvaluationError extends Error {}

async function readRecordedBody(response) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let bytes = 0;
  try {
    while (bytes <= maxResponseBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      // Retain one excess byte so the adapter reports its normal OUTPUT_LIMIT.
      const chunk = value.subarray(0, maxResponseBytes + 1 - bytes);
      chunks.push(chunk);
      bytes += chunk.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

async function main() {
  process.chdir(fileURLToPath(new URL('../', import.meta.url)));
  const runsDir = process.env.UNIT_RUNS_DIR ?? join(process.env.UNIT_DATA_DIR ?? 'data', 'runs');
  const flags = parseArgs({
    options: {
      corpus: { type: 'string', default: `${runsDir}/pipeline-corpus/manifest.json` },
      run: { type: 'boolean', default: false },
      smoke: { type: 'boolean', default: false },
      model: { type: 'string', default: defaultModel },
      provider: { type: 'string' },
      snapshot: { type: 'string' },
      reasoning: { type: 'string', default: 'none' },
      sampling: { type: 'string', default: 'fixed' },
      authoring: { type: 'string', default: 'default' },
      repetitions: { type: 'string' },
      characters: { type: 'string' },
      'legacy-snapshot-definition': { type: 'boolean', default: false },
      concurrency: { type: 'string', default: '1' },
      'skip-review': { type: 'boolean', default: false },
      'max-cost-usd': { type: 'string', default: '0' },
      'max-tokens': { type: 'string', default: '16000' },
    },
    strict: true,
  }).values;
  const concurrency = Number(flags.concurrency);
  if (![1, 2].includes(concurrency)) throw new EvaluationError('Concurrency must be 1 or 2.');
  if (!['none', 'low', 'medium', 'high'].includes(flags.reasoning))
    throw new EvaluationError('Reasoning must be none, low, medium or high.');
  if (!['fixed', 'provider-default'].includes(flags.sampling))
    throw new EvaluationError('Sampling must be fixed or provider-default.');
  const maxTokens = Number(flags['max-tokens']);
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1000 || maxTokens > 24000)
    throw new EvaluationError('Max tokens must be an integer from 1000 through 24000.');
  const maxCostUsd = Number(flags['max-cost-usd']);
  if (!Number.isFinite(maxCostUsd) || maxCostUsd < 0 || maxCostUsd > 2)
    throw new EvaluationError('Max cost must be a finite USD amount from 0 through 2.');
  const settings = {
    ...defaultSettings,
    reasoningEffort: flags.reasoning,
    maxTokens,
    ...(flags.sampling === 'provider-default' ? { temperature: null, topP: null } : {}),
  };
  if (!['default', 'direct', 'reference-patterns-v1', 'planned-v1'].includes(flags.authoring))
    throw new EvaluationError(
      'Authoring must be default, direct, planned-v1 or reference-patterns-v1.',
    );
  if (flags['legacy-snapshot-definition'] && !flags.snapshot)
    throw new EvaluationError('Legacy definition compatibility requires an explicit snapshot.');
  const model = flags.model;
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(?::free)?$/.test(model) || model === 'openrouter/free')
    throw new EvaluationError('Evaluation requires an explicit pinned model identifier.');
  const paid = !model.endsWith(':free');
  if (flags.provider !== undefined && (!paid || !flags.provider.trim()))
    throw new EvaluationError(
      '--provider requires a nonfree model and an exact nonempty provider name or tag.',
    );
  if (paid && maxCostUsd <= 0)
    throw new EvaluationError(
      'A nonfree model requires explicit --max-cost-usd greater than 0 and at most 2.',
    );
  let pricing = { prompt: 0, completion: 0, request: 0 };
  let pricingNote = 'Free-only zero price caps.';
  let selectedEndpoint = null;
  if (paid) {
    // The exact model's public endpoint catalogue supplies both current prices
    // and capabilities. Fetching the entire model catalogue adds no rate guard.
    const numericPrice = (rates, key) => {
      const raw = rates[key];
      if (key === 'request' && raw === undefined) return 0;
      if (!['string', 'number'].includes(typeof raw) || String(raw).trim() === '')
        throw new EvaluationError(
          'Model pricing must specify prompt, completion and request rates.',
        );
      const price = Number(raw);
      if (!Number.isFinite(price) || price < 0)
        throw new EvaluationError('Model pricing must be finite and nonnegative.');
      return price;
    };
    const endpointResponse = await fetch(`https://openrouter.ai/api/v1/models/${model}/endpoints`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!endpointResponse.ok)
      throw new EvaluationError('Could not obtain public endpoint capabilities and pricing.');
    const endpointCatalogue = await endpointResponse.json();
    const requiredParameters = [
      'structured_outputs',
      'response_format',
      'max_tokens',
      'reasoning',
      ...(flags.sampling === 'fixed' ? ['temperature', 'top_p'] : []),
    ];
    const eligible = (endpointCatalogue.data?.endpoints ?? [])
      .filter(
        (endpoint) =>
          endpoint.model_id === model &&
          (endpoint.status === undefined || endpoint.status === 0) &&
          // This runner sends ordinary chat requests, not a flex/priority service tier.
          !/\/(?:flex|priority|fast|batch)$/.test(endpoint.tag ?? '') &&
          (flags.provider === undefined ||
            endpoint.provider_name === flags.provider ||
            endpoint.tag === flags.provider) &&
          typeof endpoint.provider_name === 'string' &&
          endpoint.provider_name.length > 0 &&
          endpoint.pricing &&
          requiredParameters.every((parameter) =>
            endpoint.supported_parameters?.includes(parameter),
          ) &&
          (endpoint.max_completion_tokens == null ||
            endpoint.max_completion_tokens >= settings.maxTokens),
      )
      .flatMap((endpoint) => {
        try {
          const rates = Object.fromEntries(
            ['prompt', 'completion', 'request'].map((key) => [
              key,
              numericPrice(endpoint.pricing, key),
            ]),
          );
          const conservativeCallCostUsd =
            (maxRequestBytes + 1024) * rates.prompt +
            settings.maxTokens * rates.completion +
            rates.request;
          if (!Number.isFinite(conservativeCallCostUsd)) return [];
          return [{ endpoint, rates, conservativeCallCostUsd }];
        } catch {
          return [];
        }
      })
      .sort(
        (a, b) =>
          a.conservativeCallCostUsd - b.conservativeCallCostUsd ||
          String(a.endpoint.tag).localeCompare(String(b.endpoint.tag)),
      );
    const chosen = eligible[0];
    if (!chosen)
      throw new EvaluationError(
        'No priced endpoint supports every required structured-output and generation parameter.',
      );
    pricing = chosen.rates;
    selectedEndpoint = {
      provider: chosen.endpoint.provider_name,
      tag: chosen.endpoint.tag,
      requiredParameters,
      conservativeCallCostUsd: chosen.conservativeCallCostUsd,
      selectionInputTokenBound: maxRequestBytes + 1024,
      eligibleEndpoints: eligible.length,
      requestedProvider: flags.provider ?? null,
      providerOnly: [chosen.endpoint.tag ?? chosen.endpoint.provider_name],
      routing:
        'Selected provider allowlist, required parameters and endpoint price caps, with fallbacks disabled.',
    };
    pricingNote =
      chosen.endpoint.pricing.request === undefined
        ? 'Selected compatible endpoint omits request pricing. A zero request fee cap is explicitly enforced; no request fee is allowed.'
        : 'Selected compatible endpoint token rates and request fee are enforced as provider price caps.';
  }
  // Token rate caps are per million tokens; request pricing is per request.
  const perMillion = (price) => {
    if (price === 0) return '0';
    // Shift decimal text exactly: binary multiplication can turn 0.20 into
    // 0.19999999999999998 and accidentally exclude the selected endpoint.
    const [mantissa, exponent = '0'] = String(price).split('e');
    const [whole, fraction = ''] = mantissa.split('.');
    const digits = whole + fraction;
    const point = whole.length + Number(exponent) + 6;
    return point <= 0
      ? `0.${'0'.repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + '0'.repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  };
  const providerMaxPrice = {
    prompt: pricing.prompt === 0 ? '0' : perMillion(pricing.prompt),
    completion: pricing.completion === 0 ? '0' : perMillion(pricing.completion),
    request: String(pricing.request),
  };
  const corpus = JSON.parse(await readFile(flags.corpus, 'utf8'));
  if (
    corpus.version !== 1 ||
    !Array.isArray(corpus.entries) ||
    corpus.entries.length < 1 ||
    corpus.entries.length > 24 ||
    new Set(corpus.entries.map((e) => e.id)).size !== corpus.entries.length
  )
    throw new EvaluationError(
      'Corpus requires 1 through 24 distinct character entries and version 1.',
    );
  for (const entry of corpus.entries) {
    if (
      !/^[a-z0-9-]+$/.test(entry.id) ||
      !entry.character?.name ||
      !entry.documents?.length ||
      entry.documents.some((d) => d.kind !== 'source' || !d.text?.trim() || !d.origin?.location) ||
      !entry.provenance
    )
      throw new EvaluationError(
        'Every corpus entry needs a safe ID, character, source documents and provenance.',
      );
  }
  const characterIds = flags.characters?.split(',').map((id) => id.trim());
  if (
    characterIds &&
    (new Set(characterIds).size !== characterIds.length ||
      characterIds.some((id) => !corpus.entries.some((entry) => entry.id === id)))
  )
    throw new EvaluationError('Characters must be distinct comma-separated corpus IDs.');
  const selected = characterIds
    ? corpus.entries.filter((entry) => characterIds.includes(entry.id))
    : flags.smoke
      ? corpus.entries.slice(0, 2)
      : corpus.entries;
  const repetitions =
    flags.repetitions === undefined ? (flags.smoke ? 1 : 2) : Number(flags.repetitions);
  if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 10)
    throw new EvaluationError('Repetitions must be an integer from 1 through 10.');
  // Resolve the exact Definition for dry plans too, without using possibly stale dist output.
  let definitionExports;
  if (flags.snapshot) {
    definitionExports = await import(
      pathToFileURL(resolve(flags.snapshot, 'runtime/snapshot.mjs')).href
    );
  } else {
    const bundled = await build({
      stdin: {
        contents: "export {defaultAuthoringDefinition} from './src/node/default-profile.ts';",
        resolveDir: process.cwd(),
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
    });
    definitionExports = await import(
      `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
    );
  }
  const suppliedDefinition =
    definitionExports.defaultAuthoringDefinition ??
    (flags['legacy-snapshot-definition']
      ? definitionExports.defaultMechanicsDefinition
      : undefined);
  if (!suppliedDefinition)
    throw new EvaluationError(
      'Snapshot lacks defaultAuthoringDefinition. Use a current snapshot, or explicitly opt into its legacy Definition with --legacy-snapshot-definition.',
    );
  const definition = structuredClone(suppliedDefinition);
  if (flags.authoring !== 'default') definition.profile.authoringMode = flags.authoring;
  const primaryDrafts = selected.length * repetitions;
  const maxDraftCallsPerSample = definition.profile.authoringMode === 'planned-v1' ? 4 : 2;
  const reviewEnabled = !flags.smoke && !flags['skip-review'];
  const plan = {
    mode: flags.smoke ? 'development-smoke' : 'final-benchmark',
    reusedSnapshot: flags.snapshot ?? null,
    model,
    maxCostUsd,
    pricing,
    pricingNote,
    selectedEndpoint,
    providerMaxPrice,
    reservedCostUsd: 0,
    repetitions,
    authoring: definition.profile.authoringMode ?? 'direct',
    definitionRevision: definition.revision,
    definitionHash: hash(definition),
    legacySnapshotDefinition: !definitionExports.defaultAuthoringDefinition,
    maxConcurrentSamples: concurrency,
    settings,
    primaryDrafts,
    maxRepairAttemptsPerDraft: 1,
    maxDraftCalls: primaryDrafts * maxDraftCallsPerSample,
    maxReviewCalls: reviewEnabled ? primaryDrafts : 0,
    semanticReviewEnabled: reviewEnabled,
    maxProviderCalls: primaryDrafts * (maxDraftCallsPerSample + (reviewEnabled ? 1 : 0)),
    automaticTransportRetries: 0,
    corpusHash: hash(corpus),
    characters: selected.map((e) => ({
      id: e.id,
      character: e.character,
      sources: e.documents.map((d) => ({
        origin: d.origin,
        textSha256: hash(d.text),
        characters: d.text.length,
      })),
      provenance: e.provenance,
    })),
    rubric,
    note: 'Repeated stochastic samples per character are a bounded regression probe, not a general quality estimate. Model semantic review is separate from deterministic checks and human reading.',
  };
  if (!flags.run) {
    console.log(stringify(plan));
    return;
  }

  const directory = resolve(
    runsDir,
    'unit-pipeline',
    `${plan.mode}-${new Date().toISOString().replace(/[:.]/g, '-')}`,
  );
  await mkdir(`${directory}/runtime`, { recursive: true });
  const facade = `export {prepareRequest,draftUnit,checkDraft,reviewDraft} from './src/core/index.ts';export {defaultProfile,defaultProgression,defaultAuthoringDefinition,starterAuthoringTask} from './src/node/default-profile.ts';export {defaultMechanicsDefinition,blueprintSchema} from './src/core/mechanics/index.ts';export {validateBlueprintRequest} from './src/core/planned-v1/validate.ts';export {decodeBlueprintOutput} from './src/core/planned-v1/model-output.ts';export {targetedTierRepair} from './src/core/planned-v1/repair.ts';export {isReferenceAuthoring,decodeReferenceBlueprint} from './src/core/planned-v1/reference-authoring.ts';export {loadLocalEnvironment} from './src/node/environment.ts';export {OpenRouterModelClient} from './src/node/openrouter.ts';export {renderArtifact} from './src/presentation/markdown.ts';`;
  let sourceHashes = {};
  if (flags.snapshot) {
    const prior = resolve(flags.snapshot);
    await copyFile(`${prior}/runtime/snapshot.mjs`, `${directory}/runtime/snapshot.mjs`);
    sourceHashes = JSON.parse(await readFile(`${prior}/source-hashes.json`, 'utf8'));
  } else {
    const built = await build({
      stdin: { contents: facade, resolveDir: process.cwd(), loader: 'ts' },
      bundle: true,
      packages: 'external',
      platform: 'node',
      format: 'esm',
      outfile: `${directory}/runtime/snapshot.mjs`,
      metafile: true,
    });
    for (const path of Object.keys(built.metafile.inputs).filter((path) => path !== '<stdin>'))
      sourceHashes[path] = hash(await readFile(path, 'utf8'));
  }
  plan.runtimeSha256 = hash(await readFile(`${directory}/runtime/snapshot.mjs`, 'utf8'));
  await save(`${directory}/source-hashes.json`, sourceHashes);
  await save(`${directory}/corpus.json`, corpus);
  await save(`${directory}/plan.json`, plan);
  const api = await import(pathToFileURL(`${directory}/runtime/snapshot.mjs`).href);
  api.loadLocalEnvironment();
  if (!process.env.OPENROUTER_API_KEY?.trim())
    throw new EvaluationError('Set OPENROUTER_API_KEY in the ignored local .env.');
  const report = {
    directory: relative(process.cwd(), directory),
    startedAt: new Date().toISOString(),
    plan,
    maxCostUsd,
    pricing,
    pricingNote,
    selectedEndpoint,
    reservedCostUsd: 0,
    calls: [],
    samples: [],
  };
  let draftCalls = 0;
  let reviewCalls = 0;
  let providerCalls = 0;
  let rateLimited = false;
  let budgetExhausted = false;
  let modelDrift = false;
  let modelUnavailable = false;
  let reservedCostUsd = 0;
  let reportWrites = Promise.resolve();
  async function persistReport() {
    report.usage = {
      inputTokens: 0,
      outputTokens: 0,
      reportedCostUsd: 0,
      unavailableUsageCalls: 0,
      unavailableChargeCalls: 0,
      callsNotSentToProvider: 0,
    };
    for (const call of report.calls) {
      if (!call.sentToProvider) {
        report.usage.callsNotSentToProvider++;
        continue;
      }
      if (!call.usage) report.usage.unavailableUsageCalls++;
      report.usage.inputTokens += call.usage?.inputTokens ?? 0;
      report.usage.outputTokens += call.usage?.outputTokens ?? 0;
      if (call.usage?.costUsd == null) report.usage.unavailableChargeCalls++;
      else report.usage.reportedCostUsd += call.usage.costUsd;
    }
    const retainedReport = stringify(report);
    reportWrites = reportWrites.then(() => writeFile(`${directory}/report.json`, retainedReport));
    await reportWrites;
  }
  function recordingClient(folder, stage, authorRequest) {
    let stageCalls = 0;
    let previousWireOutput = null;
    let previousIssues = [];
    return {
      id: `openrouter:${model}`,
      async generate(request) {
        if (rateLimited || budgetExhausted || modelDrift || modelUnavailable)
          throw new EvaluationError(
            'Batch stopped after provider unavailability, rate limit, model drift or exhausted cost budget.',
          );
        stageCalls++;
        if (
          (stage === 'draft' &&
            (stageCalls > maxDraftCallsPerSample || draftCalls >= plan.maxDraftCalls)) ||
          (stage === 'review' && (stageCalls > 1 || reviewCalls >= plan.maxReviewCalls))
        )
          throw new EvaluationError('Provider call budget exhausted.');
        if (stage === 'draft') draftCalls++;
        else reviewCalls++;
        const callFolder = `${folder}/${stage}-call-${stageCalls}`;
        await mkdir(callFolder, { recursive: true });
        await save(`${callFolder}/model-request.json`, {
          system: request.system,
          prompt: request.prompt,
          schema: request.schema,
        });
        const call = {
          stage,
          index: stageCalls,
          folder: relative(directory, callFolder),
          startedAt: new Date().toISOString(),
        };
        report.calls.push(call);
        const start = performance.now();
        let harnessError;
        const client = new api.OpenRouterModelClient(
          {
            model,
            reasoningEffort: settings.reasoningEffort,
            timeoutMs: settings.timeoutMs,
            maxOutputBytes: maxResponseBytes,
          },
          async (input, init) => {
            try {
              const outbound = new Request(input, init);
              const body = JSON.parse(await outbound.clone().text());
              if (settings.temperature !== null) body.temperature = settings.temperature;
              if (settings.topP !== null) body.top_p = settings.topP;
              body.max_tokens = settings.maxTokens;
              if (body.model !== model) throw new EvaluationError('Fixed-model guard failed.');
              if (
                !paid &&
                (body.model !== model ||
                  body.provider?.max_price?.prompt !== '0' ||
                  body.provider?.max_price?.completion !== '0' ||
                  body.provider?.max_price?.request !== '0')
              )
                throw new EvaluationError('Free-only fixed-model guard failed.');
              body.provider = {
                ...body.provider,
                max_price: providerMaxPrice,
                ...(paid ? { only: selectedEndpoint.providerOnly } : {}),
                allow_fallbacks: false,
                require_parameters: true,
              };
              const wireBody = JSON.stringify(body);
              call.requestBodyBytes = Buffer.byteLength(wireBody, 'utf8');
              if (call.requestBodyBytes > maxRequestBytes)
                throw new EvaluationError(
                  `Model request body is ${call.requestBodyBytes} bytes, exceeding the 300000 byte evaluation bound.`,
                );
              if (providerCalls >= plan.maxProviderCalls)
                throw new EvaluationError('Provider request budget exhausted.');
              // Reserve before any await so concurrent samples cannot overspend.
              // Never release reservations, including errors and unknown usage.
              const upperInputTokens = Buffer.byteLength(wireBody, 'utf8') + 1024;
              const reservation =
                upperInputTokens * pricing.prompt +
                settings.maxTokens * pricing.completion +
                pricing.request;
              if (!Number.isFinite(reservation) || reservedCostUsd + reservation > maxCostUsd) {
                budgetExhausted = true;
                throw new EvaluationError(
                  'Conservative paid-call reservation exceeds the remaining batch budget.',
                );
              }
              providerCalls++;
              reservedCostUsd += reservation;
              plan.reservedCostUsd = report.reservedCostUsd = reservedCostUsd;
              call.reservedCostUsd = reservation;
              call.upperInputTokens = upperInputTokens;
              await save(`${callFolder}/wire-request.json`, body);
              await save(`${directory}/plan.json`, plan);
              await persistReport();
              call.sentToProvider = true;
              const response = await fetch(new Request(outbound, { body: wireBody }));
              call.httpStatus = response.status;
              if (response.status === 429) rateLimited = true;
              if ([400, 404, 422].includes(response.status)) modelUnavailable = true;
              // Consume the original body so aborting fetch also cancels the recorder.
              // A cloned tee could otherwise retain an unfinished provider stream.
              const responseBody = await readRecordedBody(response);
              if (!response.ok && responseBody.byteLength <= maxResponseBytes) {
                // Local diagnostics only. Never retain credentials even if echoed by an upstream.
                const safe = responseBody
                  .toString('utf8')
                  .replaceAll(process.env.OPENROUTER_API_KEY, '[REDACTED]');
                await writeFile(`${callFolder}/provider-error.txt`, safe);
              }
              if (response.ok && responseBody.byteLength <= maxResponseBytes) {
                let envelope;
                try {
                  envelope = JSON.parse(responseBody.toString('utf8'));
                } catch {
                  envelope = null;
                }
                if (paid && envelope && envelope.model !== model) {
                  modelDrift = true;
                  throw new EvaluationError(
                    'Provider returned a different model from the pinned identifier.',
                  );
                }
                if (envelope && Array.isArray(envelope.choices))
                  await save(`${callFolder}/completion-output.json`, {
                    model: envelope.model,
                    usage: envelope.usage,
                    choices: envelope.choices.map((choice) => ({
                      finish_reason: choice.finish_reason,
                      content: choice.message?.content,
                    })),
                  });
              }
              return new Response(responseBody, {
                status: response.status,
                headers: response.headers,
              });
            } catch (error) {
              if (error instanceof EvaluationError) harnessError = error;
              throw error;
            }
          },
        );
        try {
          const response = await client.generate(request);
          call.usage = response.usage ?? null;
          call.success = true;
          await save(`${callFolder}/model-response.json`, response);
          if (
            stage === 'draft' &&
            authorRequest.mechanicsDefinition?.profile.authoringMode !== 'planned-v1'
          ) {
            try {
              const repair =
                stageCalls > 1 && !api.isReferenceAuthoring?.(authorRequest)
                  ? api.targetedTierRepair(authorRequest, previousWireOutput, previousIssues)
                  : null;
              const applied =
                repair && hash(repair.request.schema) === hash(request.schema)
                  ? repair.apply(response.output)
                  : response.output;
              previousWireOutput = applied;
              await save(`${callFolder}/applied-output.json`, applied);
              const blueprint = api.isReferenceAuthoring?.(authorRequest)
                ? api.decodeReferenceBlueprint(applied, authorRequest)
                : api.decodeBlueprintOutput(applied, authorRequest);
              await save(`${callFolder}/decoded-blueprint.json`, blueprint);
              call.validationIssues = api.validateBlueprintRequest(blueprint, authorRequest);
            } catch (error) {
              call.validationIssues = Array.isArray(error?.issues)
                ? error.issues.map((issue) => ({
                    path: issue.path.join('.'),
                    message: issue.message,
                  }))
                : [{ path: 'output', message: 'Could not decode the blueprint output.' }];
            }
            previousIssues = call.validationIssues.map(
              (issue) => `${issue.path}: ${issue.message}`,
            );
            await save(`${callFolder}/validation-issues.json`, call.validationIssues);
          }
          return response;
        } catch (error) {
          if (error?.failure?.code === 'RATE_LIMIT') rateLimited = true;
          call.success = false;
          call.usage = error?.usage ?? null;
          call.failure = harnessError
            ? { code: 'EVALUATION_FAILED', message: harnessError.message }
            : (error?.failure ?? {
                code: 'EVALUATION_FAILED',
                message:
                  'Inspect saved inputs and local configuration. Raw transport details omitted.',
              });
          await save(`${callFolder}/failure.json`, { failure: call.failure, usage: call.usage });
          throw harnessError ?? error;
        } finally {
          call.elapsedMs = Math.round(performance.now() - start);
          await persistReport();
        }
      },
    };
  }

  const reviewQueue = [];
  async function runSample(entry, repetition) {
    const folder = `${directory}/${entry.id}-${repetition}`;
    await mkdir(folder, { recursive: true });
    const request = {
      schemaVersion: '1',
      task:
        api.starterAuthoringTask ??
        'Create one complete, concise Tower Defense Unit with a recognizable source-grounded identity, one readable base attack, three tactically distinct upgrade paths and all fifteen upgrades. Use only the supplied character evidence. Adapt within the supplied experimental mechanics definition and preserve its restrictions. Keep unsupported named techniques reserved or omitted, label all adaptation values proposed, and preserve source and story-period gaps.',
      character: entry.character,
      documents: [...entry.documents, api.defaultProfile],
      constraints: [],
      progression: api.defaultProgression,
      mechanicsDefinition: structuredClone(definition),
      previous: null,
      feedback: null,
    };
    await save(`${folder}/request.json`, request);
    const sample = {
      id: `${entry.id}-${repetition}`,
      character: entry.character.name,
      repetition,
      requestHash: hash(request),
    };
    report.samples.push(sample);
    const start = performance.now();
    try {
      const prepared = await api.prepareRequest(request);
      await save(`${folder}/prepared.json`, prepared);
      const draft = await api.draftUnit(
        prepared,
        recordingClient(folder, 'draft', prepared.request),
        {
          maxRepairAttempts: 1,
        },
      );
      await save(`${folder}/draft.json`, draft);
      const checked = await api.checkDraft(draft);
      await save(`${folder}/checked.json`, checked);
      const rendered = api.renderArtifact(checked);
      await writeFile(`${folder}/unit.md`, rendered);
      const candidate = draft.candidate;
      const tiers = candidate.paths.flatMap((path) => path.tiers);
      sample.draftReturned = true;
      sample.draftAttempts = draft.run.attempts ?? [];
      sample.repairUsed =
        sample.draftAttempts.some((attempt) => attempt.purpose === 'repair') ||
        sample.draftAttempts.filter((attempt) => attempt.purpose === 'plan').length > 1;
      sample.firstAttemptPass =
        sample.draftAttempts.filter((attempt) => attempt.purpose === 'design').length === 1 &&
        sample.draftAttempts.every((attempt) => attempt.issues.length === 0);
      sample.deterministicFailures = checked.findings.filter((f) => f.outcome === 'fail');
      sample.deterministicUnresolved = checked.findings.filter((f) => f.outcome === 'unresolved');
      sample.allThreeByFive =
        candidate.paths.length === 3 &&
        candidate.paths.every(
          (path) =>
            JSON.stringify(path.tiers.map((t) => t.tier).sort((a, b) => a - b)) === '[1,2,3,4,5]',
        );
      sample.inventedConfirmedEntries = [
        candidate.basicAttack,
        ...tiers,
        ...candidate.abilities,
      ].filter((item) => item.status === 'confirmed').length;
      sample.renderedWords = rendered.split(/\s+/).filter(Boolean).length;
      sample.maxTierBenefitWords = Math.max(
        ...tiers.map((tier) => tier.benefit.split(/\s+/).length),
      );
      sample.structuralPass =
        sample.allThreeByFive &&
        !sample.deterministicFailures.length &&
        sample.inventedConfirmedEntries === 0;
      sample.firstAttemptPass = sample.firstAttemptPass && sample.structuralPass;
      await persistReport();
      console.log(
        stringify({
          directory: report.directory,
          sample: sample.id,
          stage: 'draft',
          structuralPass: sample.structuralPass,
          firstAttemptPass: sample.firstAttemptPass,
        }),
      );
      if (reviewEnabled) reviewQueue.push({ checked, folder, sample });
    } catch (error) {
      sample.draftReturned = false;
      sample.failure =
        error instanceof EvaluationError
          ? { code: 'EVALUATION_FAILED', message: error.message }
          : (error?.failure ?? {
              code: 'EVALUATION_FAILED',
              message: 'Evaluation stage failed; inspect retained artifacts. Raw errors omitted.',
            });
      await save(`${folder}/failure.json`, sample.failure);
    }
    sample.elapsedMs = Math.round(performance.now() - start);
    await persistReport();
    console.log(
      stringify({
        directory: report.directory,
        sample: sample.id,
        draftReturned: sample.draftReturned,
        structuralPass: sample.structuralPass ?? false,
        deterministicFailures: sample.deterministicFailures?.length ?? null,
        reviewReturned: sample.reviewReturned ?? null,
        failure: sample.failure?.code ?? null,
        elapsedMs: sample.elapsedMs,
      }),
    );
  }
  generationBatch: for (let repetition = 1; repetition <= repetitions; repetition++) {
    const order = repetition % 2 === 1 ? selected : [...selected].reverse();
    for (let offset = 0; offset < order.length; offset += concurrency) {
      const batch = await Promise.allSettled(
        order.slice(offset, offset + concurrency).map((entry) => runSample(entry, repetition)),
      );
      if (batch.some((result) => result.status === 'rejected'))
        throw new EvaluationError('A sample could not be retained. Inspect saved artifacts.');
      if (rateLimited || budgetExhausted || modelDrift || modelUnavailable) break generationBatch;
    }
  }
  // Complete the generation batch before running any final semantic reviews.
  for (const { checked, folder, sample } of reviewQueue) {
    if (rateLimited || budgetExhausted || modelDrift || modelUnavailable) break;
    try {
      const result = await api.reviewDraft(checked, recordingClient(folder, 'review'));
      await save(`${folder}/result.json`, result);
      await writeFile(`${folder}/reviewed-unit.md`, api.renderArtifact(result));
      sample.reviewReturned = true;
      sample.semanticFindings = result.findings.filter((finding) => finding.method === 'model');
      sample.reviewSummary = result.reviewSummary;
    } catch (error) {
      sample.reviewReturned = false;
      sample.reviewFailure = error?.failure ?? {
        code: 'EVALUATION_FAILED',
        message: 'Review failed; draft retained.',
      };
    }
    await persistReport();
  }
  if (rateLimited)
    report.stoppedReason = 'Provider reported a rate limit; no further calls dispatched.';
  if (budgetExhausted)
    report.stoppedReason = 'Conservative cost reservations exhausted the batch budget.';
  if (modelDrift)
    report.stoppedReason = 'Provider returned a different model; no further calls dispatched.';
  if (modelUnavailable)
    report.stoppedReason =
      'Provider rejected the request or reported an unavailable endpoint (400/404/422); no further calls dispatched.';
  report.completedAt = new Date().toISOString();
  report.providerCalls = providerCalls;
  report.structuralPasses = report.samples.filter((sample) => sample.structuralPass).length;
  report.firstAttemptPasses = report.samples.filter((sample) => sample.firstAttemptPass).length;
  report.repairedPasses = report.samples.filter(
    (sample) => sample.structuralPass && sample.repairUsed,
  ).length;
  await persistReport();
  console.log(
    stringify({
      directory: report.directory,
      completed: true,
      samples: report.samples.length,
      structuralPasses: report.structuralPasses,
      providerCalls,
      maxCostUsd,
      reservedCostUsd,
      usage: report.usage,
    }),
  );
}
main().catch((error) => {
  console.error(
    error instanceof EvaluationError
      ? error.message
      : 'Pipeline evaluation failed. Inspect retained artifacts and corpus. No secrets or raw transport errors are printed.',
  );
  process.exitCode = 1;
});
