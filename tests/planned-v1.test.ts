import { executeLabOperation } from '../src/lab/operations.js';
import { inputBeforeStage } from '../src/lab/client/stage-input.js';
import { summarizeUsage } from '../src/presentation/usage.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkDraft,
  compileBlueprint,
  defaultMechanicsDefinition,
  definitionDocument,
  definitionProgression,
  draftArtifactSchema,
  draftUnit,
  ModelExecutionError,
  pathKeys,
  prepareRequest,
  requestSchema,
  resolveBuild,
  resultSchema,
  reviewDraft,
  tierKeys,
  type AuthorRequest,
  type ModelClient,
  type ModelRequest,
  type ModelResponse,
  type ModelUsage,
  type UnitBlueprint,
} from '../src/core/index.js';
import { z } from 'zod';
import { renderArtifact } from '../src/presentation/markdown.js';
import {
  decodeBlueprintOutput,
  decodeBlueprintOutputForDiagnostics,
  modelOutputSchema,
  modelOutputJsonSchema,
} from '../src/core/planned-v1/model-output.js';
import { authorEvidence, evidenceSpans } from '../src/core/planned-v1/evidence.js';
import { validateBlueprintRequest } from '../src/core/planned-v1/validate.js';
import { targetedTierRepair } from '../src/core/planned-v1/repair.js';
import { wireRepairContext } from '../src/core/planned-v1/repair-context.js';
import { FakeModel, miraCandidate, miraRequest } from './fixtures/core-fixtures.js';
import { applyDefaultProfile } from '../src/node/default-profile.js';

function request(): AuthorRequest {
  const result = miraRequest();
  result.task = 'Adapt Mira into a bounded combat Unit with a clear-path attack.';
  result.constraints = [{ id: 'clear-path', text: 'Attacks must require clear delivery.' }];
  result.mechanicsDefinition = structuredClone(defaultMechanicsDefinition);
  result.progression = definitionProgression(result.mechanicsDefinition);
  return result;
}

function blueprint(): UnitBlueprint {
  const paths = {} as UnitBlueprint['paths'];
  for (const [index, path] of pathKeys.entries()) {
    const tiers = {} as UnitBlueprint['paths']['path1']['tiers'];
    for (const [tierIndex, tier] of tierKeys.entries()) {
      tiers[tier] = {
        name: `${path} ${tier}`,
        cost: 100 * (tierIndex + 1),
        changes: [
          {
            kind: 'stat',
            target: 'base',
            stat: index === 0 ? 'damage' : index === 1 ? 'range' : 'pierce',
            operation: 'add',
            value: 1,
          },
        ],
      };
    }
    paths[path] = {
      name: path,
      theme: ['Damage', 'Reach', 'Coverage'][index]!,
      rationale: 'Develop the sourced Spark attack.',
      sourceFactIndices: [0],
      tiers,
    };
  }
  paths.path2.tiers.tier4.changes = [
    {
      kind: 'unlockBoost',
      target: 'base',
      boost: {
        name: 'Focus',
        durationSeconds: 8,
        cooldownSeconds: 30,
        damageMultiplier: 2,
        intervalMultiplier: 0.75,
        rangeBonus: 5,
      },
    },
  ];
  paths.path2.tiers.tier5.changes = [
    { kind: 'modifyBoost', target: 'base', stat: 'damageMultiplier', operation: 'add', value: 1 },
  ];
  return {
    name: 'Mira',
    role: 'Aimed Spark damage',
    weakness: 'Short range and blocked delivery.',
    sourceFacts: [
      {
        documentId: 'E1',
        quote: 'Mira senses presences behind walls and fires a Spark at one target.',
      },
    ],
    constraintCoverage: [
      {
        constraintId: 'clear-path',
        implementation: 'The base attack follows the Definition clear-path requirement.',
      },
    ],
    baseAttack: {
      name: 'Spark',
      cost: 250,
      delivery: 'projectile',
      damageType: 'energy',
      targeting: 'first',
      camo: false,
      stats: {
        damage: 10,
        intervalSeconds: 1,
        range: 20,
        pierce: 1,
        projectiles: 1,
        splashRadius: 0,
        slowPercent: 0,
        slowSeconds: 0,
        burnDamagePerSecond: 0,
        burnSeconds: 0,
        stunSeconds: 0,
      },
    },
    paths,
    proposals: [
      {
        name: 'Wall perception',
        reason: 'Sensing through walls requires a separate detection geometry contract.',
      },
    ],
    reservedTechniques: [
      { name: 'Remote sensing', reason: 'The supported attack has no remote detection origin.' },
    ],
  };
}

function modelOutput(unit: UnitBlueprint): z.infer<ReturnType<typeof modelOutputSchema>> {
  const { sourceFacts, proposals, ...fields } = structuredClone(unit);
  const ids = sourceFacts.map(
    (fact) =>
      evidenceSpans(request()).find(
        (span) => span.documentId === fact.documentId && span.text === fact.quote,
      )?.id ?? 'invalid-source-id',
  );
  const output = {
    ...fields,
    unsupportedMechanics: proposals,
    baseSourceIds: ids.slice(0, 2),
    paths: Object.fromEntries(
      pathKeys.map((key) => {
        const { sourceFactIndices, ...path } = fields.paths[key];
        return [
          key,
          {
            ...path,
            sourceIds: sourceFactIndices.map((index) => ids[index] ?? 'invalid-source-id'),
          },
        ];
      }),
    ),
  } as unknown as z.infer<ReturnType<typeof modelOutputSchema>>;
  for (const path of pathKeys)
    for (const tier of tierKeys) {
      const { name, cost, changes } = unit.paths[path].tiers[tier];
      const wire: z.infer<
        ReturnType<typeof modelOutputSchema>
      >['paths']['path1']['tiers']['tier4'] = {
        name,
        cost,
        statChanges: [],
        slow: null,
        burn: null,
        camo: null,
        delivery: null,
        damageType: null,
        targeting: null,
        distribution: null,
        followUp: null,
        activeFollowUp: null,
        unlockBoost: null,
        boostChanges: [],
      };
      for (const change of changes) {
        if (change.kind === 'stat') {
          if (change.stat === 'slowPercent' || change.stat === 'slowSeconds') {
            wire.slow ??= {
              percent: unit.baseAttack.stats.slowPercent,
              durationSeconds: unit.baseAttack.stats.slowSeconds,
            };
            wire.slow[change.stat === 'slowPercent' ? 'percent' : 'durationSeconds'] = change.value;
          } else if (change.stat === 'burnDamagePerSecond' || change.stat === 'burnSeconds') {
            wire.burn ??= {
              damagePerSecond: unit.baseAttack.stats.burnDamagePerSecond,
              durationSeconds: unit.baseAttack.stats.burnSeconds,
            };
            wire.burn[
              change.stat === 'burnDamagePerSecond' ? 'damagePerSecond' : 'durationSeconds'
            ] = change.value;
          } else
            wire.statChanges.push({
              stat: change.stat,
              operation: change.operation,
              value: change.value,
            });
        } else if (change.kind === 'modifyBoost')
          wire.boostChanges.push({
            stat: change.stat,
            operation: change.operation,
            value: change.value,
          });
        else if (change.kind === 'unlockBoost') wire.unlockBoost = change.boost;
        else if (change.kind === 'camo') wire.camo = change.value;
        else if (change.kind === 'delivery') wire.delivery = change.value;
        else if (change.kind === 'distribution') wire.distribution = change.value;
        else if (change.kind === 'followUp') {
          if (change.target === 'boost') wire.activeFollowUp = change.value;
          else wire.followUp = change.value;
        } else if (change.kind === 'damageType') wire.damageType = change.value;
        else if (change.kind === 'targeting') wire.targeting = change.value;
      }
      const tiers = output.paths[path].tiers as Record<string, unknown>;
      tiers[tier] = wire;
    }
  return output;
}

test('an explicit strict BTD6 policy rejects repeated early effects and repairs a weak capstone through the shared workflow', async () => {
  const input = applyDefaultProfile(request());
  input.mechanicsDefinition!.profile.authoringMode = 'direct';
  input.mechanicsDefinition!.profile.designPolicy!.minTier5SpecialtyMultiplier = 3;
  const unit = blueprint();
  unit.paths.path1.tiers.tier3.changes.push({ kind: 'targeting', target: 'base', value: 'strong' });
  unit.paths.path2.tiers.tier3.changes.push(
    { kind: 'stat', target: 'base', stat: 'projectiles', operation: 'add', value: 1 },
    { kind: 'distribution', target: 'base', value: 'distinct-targets' },
  );
  unit.paths.path3.tiers.tier3.changes.push(
    { kind: 'delivery', target: 'base', value: 'area' },
    { kind: 'stat', target: 'base', stat: 'splashRadius', operation: 'add', value: 3 },
  );
  unit.paths.path1.specialization = 'direct-damage';
  unit.paths.path2.specialization = 'ability-burst';
  unit.paths.path3.specialization = 'group-damage';
  unit.paths.path1.tiers.tier5.changes = [
    { kind: 'stat', target: 'base', stat: 'damage', operation: 'multiply', value: 3 },
  ];
  unit.paths.path2.tiers.tier5.changes = [
    {
      kind: 'modifyBoost',
      target: 'base',
      stat: 'damageMultiplier',
      operation: 'multiply',
      value: 3,
    },
  ];
  unit.paths.path3.tiers.tier5.changes = [
    { kind: 'stat', target: 'base', stat: 'pierce', operation: 'multiply', value: 3 },
  ];
  assert.deepEqual(validateBlueprintRequest(unit, input), []);
  const weak = structuredClone(unit);
  weak.paths.path1.tiers.tier5.changes = [
    { kind: 'stat', target: 'base', stat: 'damage', operation: 'multiply', value: 1.5 },
  ];
  weak.paths.path3.tiers.tier1.changes = structuredClone(unit.paths.path1.tiers.tier1.changes);
  const raw = modelOutput(weak);
  const valid = modelOutput(unit);
  const model = new ResponseModel([
    { output: raw },
    {
      output: {
        paths: {
          path1: { tiers: { tier5: valid.paths.path1.tiers.tier5 } },
          path3: {
            tiers: {
              tier1: valid.paths.path3.tiers.tier1,
              tier5: valid.paths.path3.tiers.tier5,
            },
          },
        },
      },
    },
  ]);
  const draft = await draftUnit(await prepareRequest(input), model);
  assert.equal(draft.run.attempts?.length, 2);
  assert.ok(draft.run.attempts?.[0]?.issues.some((issue) => /duplicates path1/.test(issue)));
  assert.ok(draft.run.attempts?.[0]?.issues.some((issue) => /at least 3x/.test(issue)));
  assert.equal(draft.candidate.blueprint?.paths.path1.specialization, 'direct-damage');
  const repairContext = JSON.parse(model.requests[1]!.prompt.split('\n\n')[1]!);
  assert.deepEqual(repairContext.dependentCapstones, ['path3.tier5']);
  assert.deepEqual(draft.candidate.blueprint?.paths.path2, unit.paths.path2);
  assert.deepEqual(draft.candidate.blueprint?.sourceFacts, unit.sourceFacts);
  assert.ok(model.requests.every((call) => /At most 1 paths/.test(call.prompt)));
  const checked = await checkDraft(draft);
  assert.ok(!checked.findings.some((finding) => finding.outcome === 'fail'));
  const omitted = structuredClone(valid);
  Reflect.deleteProperty(omitted.paths.path1, 'specialization');
  assert.equal(modelOutputSchema(input).safeParse(omitted).success, false);
});

function usage(id: string): ModelUsage {
  return {
    inputTokens: 100,
    outputTokens: 40,
    totalTokens: 140,
    reasoningTokens: 10,
    cachedInputTokens: 0,
    costUsd: 0.01,
    actualModel: 'test/blueprint',
    provider: 'fixture',
    generationId: id,
  };
}

class ResponseModel implements ModelClient {
  readonly id = 'test/blueprint';
  readonly requests: ModelRequest[] = [];
  constructor(private readonly responses: (ModelResponse | Error)[]) {}
  async generate(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (!response) throw new Error('Unexpected model call');
    if (response instanceof Error) throw response;
    const copy = structuredClone(response);
    if (
      copy.output &&
      typeof copy.output === 'object' &&
      'sourceFacts' in copy.output &&
      'paths' in copy.output &&
      'changes' in (copy.output as UnitBlueprint).paths.path1.tiers.tier1
    ) {
      copy.output = modelOutput(copy.output as UnitBlueprint);
    }
    return copy;
  }
}

test('typed authoring compiles source-backed mechanics and preserves its definition through review and serialization', async () => {
  const input = request();
  const prepared = await prepareRequest(input);
  const document = definitionDocument(defaultMechanicsDefinition);
  assert.deepEqual(prepared.request.documents.at(-1), document);
  assert.deepEqual((await prepareRequest(prepared.request)).request, prepared.request);
  const model = new ResponseModel([
    { output: blueprint(), usage: usage('draft') },
    {
      output: { summary: 'The scoped draft requires runtime evaluation.', findings: [] },
      usage: usage('review'),
    },
  ]);
  const draft = await draftUnit(prepared, model);
  assert.equal(model.requests.length, 1);
  assert.deepEqual(draft.candidate, compileBlueprint(blueprint(), prepared.request));
  assert.equal(draft.candidate.paths.length, 3);
  assert.equal(draft.candidate.paths.flatMap((path) => path.tiers).length, 15);
  assert.deepEqual(
    draft.run.attempts?.map(({ purpose, issues }) => ({ purpose, issues })),
    [{ purpose: 'design', issues: [] }],
  );
  assert.equal(
    draft.candidate.abilities.find((ability) => ability.id === 'path-2-active')?.tier,
    4,
  );
  assert.equal(
    draft.candidate.abilities.find((ability) => ability.id === 'reserved-1')?.placement,
    'reserved',
  );
  assert.equal(
    draft.candidate.mechanics.find((mechanic) => mechanic.id === 'proposal-1')?.status,
    'proposed_extension',
  );
  const built = resolveBuild(blueprint(), [2, 5, 0]);
  const representative = draft.candidate.representativeBuilds.find(
    (build) => build.name === '2-5-0',
  )!;
  assert.ok(representative.rationale.includes(`${built.cumulativeCost} Gold`));
  assert.match(draft.candidate.paths[1]!.tiers[4]!.benefit, /active damage multiplier 2 to 3/);
  const checked = await checkDraft(draftArtifactSchema.parse(JSON.parse(JSON.stringify(draft))));
  assert.ok(
    checked.findings.some(
      (finding) =>
        finding.rule === 'typed-mechanics' &&
        finding.outcome === 'pass' &&
        finding.message.includes('64 legal builds'),
    ),
  );
  assert.equal(
    checked.findings.some((finding) => finding.outcome === 'fail'),
    false,
  );
  const result = await reviewDraft(checked, model);
  const saved = resultSchema.parse(JSON.parse(JSON.stringify(result)));
  assert.deepEqual(saved.candidate.blueprint, blueprint());
  assert.equal(saved.run.draft.usage?.generationId, 'draft');
  assert.equal(saved.run.review.usage?.generationId, 'review');
  assert.ok(Object.isFrozen(result.candidate.blueprint));
  assert.match(model.requests[0]!.prompt, /baseSourceIds/);
  assert.ok(!model.requests[0]!.prompt.includes(`"id":"${document.id}"`));
  assert.ok(model.requests[1]!.prompt.includes(document.id));
});

test('an invalid evidence selection gets one bounded repair and both billed attempts remain inspectable', async () => {
  const invalid = blueprint();
  invalid.sourceFacts[0]!.quote = 'Mira can teleport any distance instantly.';
  const model = new ResponseModel([
    { output: invalid, usage: usage('first') },
    { output: blueprint(), usage: usage('second') },
  ]);
  const draft = await draftUnit(await prepareRequest(request()), model);
  assert.equal(model.requests.length, 2);
  assert.match(model.requests[1]!.prompt, /baseSourceIds/);
  assert.ok(model.requests[1]!.prompt.includes('invalid-source-id'));
  assert.deepEqual(
    draft.run.attempts?.map(({ purpose }) => purpose),
    ['design', 'repair'],
  );
  assert.equal(draft.run.attempts?.[0]?.usage?.generationId, 'first');
  assert.equal(draft.run.usage?.totalTokens, 280);
  assert.equal(draft.run.usage?.costUsd, 0.02);
  assert.equal(draft.run.usage?.generationId, null);
});

test('unknown usage stays unknown in totals while reported repair usage remains attached', async () => {
  const model = new ResponseModel([
    { output: {} },
    { output: blueprint(), usage: usage('repair') },
  ]);
  const draft = await draftUnit(await prepareRequest(request()), model);
  assert.equal(draft.run.usage?.totalTokens, null);
  assert.equal(draft.run.usage?.costUsd, null);
  assert.equal(draft.run.attempts?.[1]?.usage?.costUsd, 0.01);
});

test('exhausted repair publishes no invalid draft and retains aggregate billed usage', async () => {
  const model = new ResponseModel([
    { output: {}, usage: usage('first') },
    { output: {}, usage: usage('second') },
    { output: blueprint() },
  ]);
  await assert.rejects(draftUnit(await prepareRequest(request()), model), (error) => {
    assert.ok(error instanceof ModelExecutionError);
    assert.equal(error.failure?.code, 'MODEL_OUTPUT_INVALID');
    assert.equal(error.failure?.stage, 'draft');
    assert.equal(error.usage?.totalTokens, 280);
    assert.match(error.message, /after 2 attempts/);
    return true;
  });
  assert.equal(model.requests.length, 2);
  const noRepair = new ResponseModel([{ output: {}, usage: usage('only') }]);
  await assert.rejects(
    draftUnit(await prepareRequest(request()), noRepair, { maxRepairAttempts: 0 }),
    /after 1 attempts/,
  );
  assert.equal(noRepair.requests.length, 1);
  const none = new ResponseModel([]);
  await assert.rejects(
    draftUnit(await prepareRequest(request()), none, { maxRepairAttempts: 3 }),
    /maxRepairAttempts/,
  );
  assert.equal(none.requests.length, 0);
});

test('transport and provider cancellation failures are not retried as design repair', async () => {
  for (const code of ['NETWORK_ERROR', 'CANCELLED', 'AUTHENTICATION', 'RATE_LIMIT'] as const) {
    const error = new ModelExecutionError('Known provider failure.', usage(code), {
      failure: { code, message: 'Known provider failure.' },
    });
    const model = new ResponseModel([error, { output: blueprint() }]);
    await assert.rejects(
      draftUnit(await prepareRequest(request()), model, { maxRepairAttempts: 2 }),
      (caught) => {
        assert.ok(caught instanceof ModelExecutionError);
        assert.equal(caught.failure?.code, code);
        assert.equal(caught.usage?.totalTokens, 140);
        return true;
      },
    );
    assert.equal(model.requests.length, 1);
  }
});

test('an abort after a billed model response is classified as cancellation and retains usage', async () => {
  const controller = new AbortController();
  let calls = 0;
  const model: ModelClient = {
    id: 'test/abort',
    async generate(input) {
      calls++;
      assert.equal(input.signal, controller.signal);
      controller.abort();
      return { output: modelOutput(blueprint()), usage: usage('aborted') };
    },
  };
  await assert.rejects(
    draftUnit(await prepareRequest(request()), model, { signal: controller.signal }),
    (error) => {
      assert.ok(error instanceof ModelExecutionError);
      assert.equal(error.failure?.code, 'CANCELLED');
      assert.equal(error.usage?.totalTokens, 140);
      return true;
    },
  );
  assert.equal(calls, 1);
  const preAborted = new ResponseModel([]);
  await assert.rejects(
    draftUnit(await prepareRequest(request()), preAborted, { signal: AbortSignal.abort() }),
  );
  assert.equal(preAborted.requests.length, 0);
});

test('check detects edited compiled prose and missing retained blueprints, while review verifies its inputs', async () => {
  const original = await draftUnit(
    await prepareRequest(request()),
    new ResponseModel([{ output: blueprint() }]),
  );
  const edited = structuredClone(original);
  edited.candidate.basicAttack.behavior = 'One million damage and ignored walls.';
  const checked = await checkDraft(edited);
  assert.ok(
    checked.findings.some(
      (finding) =>
        finding.outcome === 'fail' &&
        finding.message.includes('differs from its compiled blueprint'),
    ),
  );
  const omitted = structuredClone(original);
  delete omitted.candidate.blueprint;
  assert.ok(
    (await checkDraft(omitted)).findings.some(
      (finding) => finding.outcome === 'fail' && finding.subject === 'blueprint',
    ),
  );
  const spoofed = structuredClone(await checkDraft(original));
  spoofed.findings[0]!.message = 'Changed check result';
  const reviewer = new ResponseModel([]);
  await assert.rejects(reviewDraft(spoofed, reviewer), /findings do not match/);
  assert.equal(reviewer.requests.length, 0);
});

test('source quoting and constraint coverage reject fabricated references and duplicated constraint claims', () => {
  const input = request();
  const unit = blueprint();
  assert.deepEqual(validateBlueprintRequest(unit, input), []);
  unit.sourceFacts[0]!.documentId = 'R1';
  unit.sourceFacts[0]!.quote = input.documents.find(({ id }) => id === 'R1')!.text;
  assert.ok(validateBlueprintRequest(unit, input).some(({ path }) => path === 'sourceFacts.0'));
  const missing = blueprint();
  missing.constraintCoverage = [];
  assert.ok(
    validateBlueprintRequest(missing, input).some(({ path }) => path === 'constraintCoverage'),
  );
  const duplicate = blueprint();
  duplicate.constraintCoverage.push(structuredClone(duplicate.constraintCoverage[0]!));
  assert.ok(
    validateBlueprintRequest(duplicate, input).some(({ path }) => path === 'constraintCoverage'),
  );
});

test('a supplied Definition cannot disagree with progression or its generated evidence', async () => {
  const mismatch = request();
  mismatch.progression!.maxActivePaths = 3;
  await assert.rejects(prepareRequest(mismatch), /Progression must match/);
  const forged = request();
  const document = definitionDocument(defaultMechanicsDefinition);
  document.text = 'All attacks bypass walls.';
  forged.documents.push(document);
  await assert.rejects(prepareRequest(forged), /mechanics evidence document differs/);
});

test('old requests and drafts stay on the existing model protocol without new fields or repairs', async () => {
  const input = miraRequest();
  const parsed = requestSchema.parse(JSON.parse(JSON.stringify(input)));
  assert.equal(Object.hasOwn(parsed, 'mechanicsDefinition'), false);
  const model = new FakeModel([miraCandidate()]);
  const draft = await draftUnit(await prepareRequest(parsed), model);
  assert.equal(Object.hasOwn(draft.candidate, 'blueprint'), false);
  assert.equal(Object.hasOwn(draft.run, 'attempts'), false);
  assert.deepEqual(draft.candidate, miraCandidate());
  assert.equal(model.requests.length, 1);
  assert.equal(
    (await checkDraft(draft)).findings.some((finding) => finding.rule === 'typed-mechanics'),
    false,
  );
});

test('provider wire format decodes explicit effect groups and rejects omitted fields or excess combined effects', () => {
  const input = request();
  const output = modelOutput(blueprint());
  assert.deepEqual(decodeBlueprintOutput(output, input), blueprint());
  const omitted = structuredClone(output) as unknown as Record<string, unknown>;
  delete omitted.constraintCoverage;
  assert.equal(modelOutputSchema(input).safeParse(omitted).success, false);
  output.paths.path1.tiers.tier1.statChanges.push(
    { stat: 'range', operation: 'add', value: 1 },
    { stat: 'pierce', operation: 'add', value: 1 },
  );
  output.paths.path1.tiers.tier1.camo = true;
  assert.equal(modelOutputSchema(input).safeParse(output).success, true);
  assert.throws(() => decodeBlueprintOutput(output, input), /Total must be 1 to 3/);
  const noConstraints = request();
  noConstraints.constraints = [];
  assert.equal(modelOutputSchema(noConstraints).safeParse(modelOutput(blueprint())).success, false);
});

test('wire attack extensions preserve authored volleys and accept legacy omissions or explicit nulls', () => {
  const unit = blueprint();
  const legacy = modelOutput(unit);
  for (const path of pathKeys)
    for (const tier of tierKeys) {
      delete legacy.paths[path].tiers[tier].distribution;
      delete legacy.paths[path].tiers[tier].followUp;
      delete legacy.paths[path].tiers[tier].activeFollowUp;
    }
  assert.deepEqual(decodeBlueprintOutput(legacy, request()), unit);
  const nullable = modelOutput(unit);
  nullable.baseAttack.distribution = null;
  nullable.baseAttack.followUp = null;
  assert.deepEqual(decodeBlueprintOutput(nullable, request()), unit);
  const followUp = {
    name: 'Secondary sparks',
    count: 3,
    damageMultiplier: 0.5,
    radius: 12,
    inheritStatuses: false,
  };
  unit.baseAttack.distribution = 'distinct-targets';
  unit.baseAttack.followUp = followUp;
  unit.paths.path1.tiers.tier3.changes = [
    { kind: 'distribution', target: 'base', value: 'distinct-targets' },
    { kind: 'followUp', target: 'base', value: { ...followUp, count: 4 } },
  ];
  unit.paths.path2.tiers.tier5.changes = [
    { kind: 'followUp', target: 'boost', value: { ...followUp, count: 6 } },
  ];
  const extended = request();
  extended.mechanicsDefinition!.rules.attackExtensions = ['distinct-volley', 'volley-follow-up'];
  assert.deepEqual(decodeBlueprintOutput(modelOutput(unit), extended), unit);
});

test('one tier with several operations on the same stat displays its net change once', () => {
  const unit = blueprint();
  unit.paths.path1.tiers.tier1.changes = [
    { kind: 'stat', target: 'base', stat: 'damage', operation: 'add', value: 2 },
    { kind: 'stat', target: 'base', stat: 'damage', operation: 'multiply', value: 1.5 },
  ];
  const candidate = compileBlueprint(unit, request());
  const benefit = candidate.paths[0]!.tiers[0]!.benefit;
  assert.equal(benefit.match(/damage 10 to 18/g)?.length, 1);
  assert.match(benefit, /\+2/);
  assert.match(benefit, /multiply by 1\.5/);
});

test('compact rendering explains a T4 boost once and distinguishes pulse attacks from projectiles', async () => {
  const prepared = await prepareRequest(request());
  const draft = await draftUnit(prepared, new ResponseModel([{ output: blueprint() }]));
  const tier4 = draft.candidate.paths[1]!.tiers[3]!;
  const ability = draft.candidate.abilities.find(({ id }) => id === 'path-2-active')!;
  assert.equal(tier4.benefit, '400 Gold. Unlock Focus.');
  assert.match(ability.description, /^At tier 4:/);
  const rendered = renderArtifact(draft);
  assert.equal(rendered.match(/multiply the purchased attack's damage by 2/g)?.length, 1);
  assert.match(rendered, /active damage multiplier 2 to 3/);
  const unit = blueprint();
  unit.baseAttack.delivery = 'beam';
  unit.paths.path1.tiers.tier1.changes = [
    { kind: 'stat', target: 'base', stat: 'projectiles', operation: 'add', value: 1 },
  ];
  const candidate = compileBlueprint(unit, request());
  assert.match(candidate.basicAttack.behavior, /1 pulse\(s\) per attack/);
  assert.match(candidate.basicAttack.behavior, /selected primary target/);
  assert.match(candidate.paths[0]!.tiers[0]!.benefit, /pulses per attack 1 to 2/);
  assert.doesNotMatch(candidate.basicAttack.behavior, /projectile/);
});

test('provider numeric grammar permits fractions while runtime checks keep positive bounds', () => {
  const schema = modelOutputJsonSchema(request());
  function inspect(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node.type === 'number') {
      assert.equal(node.minimum, undefined);
      assert.equal(node.exclusiveMinimum, undefined);
    }
    if (node.type === 'array') assert.ok(node.items, 'Strict provider arrays need item schemas.');
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false);
      assert.deepEqual(
        new Set(node.required as string[]),
        new Set(Object.keys(node.properties as object)),
      );
    }
    Object.values(node).forEach(inspect);
  }
  inspect(schema);
  const output = modelOutput(blueprint());
  output.baseAttack.stats.intervalSeconds = 0.5;
  assert.equal(decodeBlueprintOutput(output, request()).baseAttack.stats.intervalSeconds, 0.5);
  output.baseAttack.stats.intervalSeconds = 0;
  assert.throws(() => decodeBlueprintOutput(output, request()));
});

test('evidence passages retain exact source text across long sentences and exclude rules', () => {
  const input = request();
  input.documents[0]!.text =
    'A short source. ' + 'Long original evidence text '.repeat(40) + '. Another complete fact.';
  const spans = evidenceSpans(input);
  assert.ok(spans.length > 2);
  assert.equal(new Set(spans.map(({ id }) => id)).size, spans.length);
  for (const span of spans) {
    assert.equal(span.documentId, input.documents[0]!.id);
    assert.ok(span.text.length >= 15 && span.text.length <= 450);
    assert.ok(input.documents[0]!.text.includes(span.text));
  }
});

test('direct catalogue citations become an ordered fact union with code-owned path indices', () => {
  const input = request();
  input.documents[0]!.text = [
    'Mira focuses light into a precise Spark.',
    'Her bright attacks can reach distant targets.',
    'She directs the light toward nearby targets.',
    'Her concentration improves the attack cadence.',
    'She briefly intensifies the existing light attack.',
  ].join(' ');
  const spans = evidenceSpans(input);
  const output = modelOutput(blueprint());
  output.baseSourceIds = [spans[2]!.id, spans[0]!.id];
  output.paths.path1.sourceIds = [spans[1]!.id];
  output.paths.path2.sourceIds = [spans[2]!.id, spans[3]!.id];
  output.paths.path3.sourceIds = [spans[4]!.id, spans[1]!.id];
  const decoded = decodeBlueprintOutput(output, input);
  assert.deepEqual(
    decoded.sourceFacts.map(({ quote }) => quote),
    [2, 0, 1, 3, 4].map((index) => spans[index]!.text),
  );
  assert.deepEqual(decoded.paths.path1.sourceFactIndices, [2]);
  assert.deepEqual(decoded.paths.path2.sourceFactIndices, [0, 3]);
  assert.deepEqual(decoded.paths.path3.sourceFactIndices, [4, 2]);
  assert.equal('baseSourceIds' in decoded, false);
  assert.equal('sourceIds' in decoded.paths.path1, false);
  output.paths.path1.sourceIds = ['invented'];
  assert.equal(modelOutputSchema(input).safeParse(output).success, false);
  output.paths.path1.sourceIds = [spans[1]!.id];
  const oldIndex = structuredClone(output);
  Object.assign(oldIndex.paths.path1, { sourceFactIndices: [99] });
  assert.equal(modelOutputSchema(input).safeParse(oldIndex).success, false);
});

test('large-source wire citations use only the author catalogue while preserving its original IDs', () => {
  const input = request();
  input.documents[0]!.text = Array.from(
    { length: 100 },
    (_, index) =>
      `Passage ${index} describes the character's attack technique, including its limits and combat purpose in enough detail for a quotation.`,
  ).join(' ');
  const all = evidenceSpans(input);
  const selected = authorEvidence(input);
  assert.ok(selected.length < all.length);
  assert.ok(
    selected.every((span) => all.some((entry) => entry.id === span.id && entry.text === span.text)),
  );
  const output = modelOutput(blueprint());
  output.baseSourceIds = [selected[0]!.id];
  for (const path of pathKeys) output.paths[path].sourceIds = [selected.at(-1)!.id];
  const decoded = decodeBlueprintOutput(output, input);
  assert.deepEqual(
    decoded.sourceFacts.map(({ quote }) => quote),
    [selected[0]!.text, selected.at(-1)!.text],
  );
  assert.deepEqual(decoded.paths.path1.sourceFactIndices, [1]);
  const omitted = all.find((span) => !selected.some((entry) => entry.id === span.id))!;
  output.paths.path3.sourceIds = [omitted.id];
  assert.equal(modelOutputSchema(input).safeParse(output).success, false);
});

function overloadedTierOutput() {
  const output = modelOutput(blueprint());
  output.paths.path1.tiers.tier5.statChanges = [
    { stat: 'damage', operation: 'add', value: 1 },
    { stat: 'range', operation: 'add', value: 1 },
    { stat: 'pierce', operation: 'add', value: 1 },
    { stat: 'projectiles', operation: 'add', value: 1 },
  ];
  output.paths.path1.tiers.tier5.camo = true;
  return output;
}

test('a five-effect tier receives a bounded model-selected subset schema', async () => {
  const invalid = overloadedTierOutput();
  assert.equal(modelOutputSchema(request()).safeParse(invalid).success, true);
  const patch = { paths: { path1: { tiers: { tier5: { choice: 'option-1' } } } } };
  const model = new ResponseModel([
    { output: invalid, usage: usage('design') },
    { output: patch, usage: usage('patch') },
  ]);
  const draft = await draftUnit(await prepareRequest(request()), model);
  const expected = structuredClone(invalid);
  expected.paths.path1.tiers.tier5.camo = null;
  assert.deepEqual(draft.candidate.blueprint, decodeBlueprintOutput(expected, request()));
  assert.equal(model.requests.length, 2);
  type Shape = { properties: Record<string, Shape> };
  const schema = model.requests[1]!.schema as Shape;
  assert.deepEqual(Object.keys(schema.properties), ['paths']);
  assert.deepEqual(Object.keys(schema.properties.paths!.properties), ['path1']);
  assert.deepEqual(
    Object.keys(schema.properties.paths!.properties.path1!.properties.tiers!.properties),
    ['tier5'],
  );
  const tierSchema = schema.properties.paths!.properties.path1!.properties.tiers!.properties.tier5!;
  assert.deepEqual(Object.keys(tierSchema.properties), ['choice']);
  assert.doesNotMatch(model.requests[1]!.prompt, /Fill all three paths/);
  const ending = JSON.parse(model.requests[1]!.prompt.split('\n\n').at(-1)!);
  assert.deepEqual(ending.violations, draft.run.attempts![0]!.issues);
  assert.match(ending.violations[0], /contains 5 effects/);
  assert.equal(JSON.stringify(schema).includes('exclusiveMinimum'), false);
  assert.equal(draft.run.usage?.totalTokens, 280);
  assert.equal(draft.run.usage?.costUsd, 0.02);
  assert.deepEqual(
    draft.run.attempts?.map(({ usage }) => usage?.generationId),
    ['design', 'patch'],
  );
  assert.deepEqual(
    draft.run.attempts?.map(({ purpose }) => purpose),
    ['design', 'repair'],
  );
});

test('targeted patches cannot retain an invalid tier or change unrelated source fields', async () => {
  const invalid = overloadedTierOutput();
  const validTier = modelOutput(blueprint()).paths.path1.tiers.tier5;
  const patches = [
    { paths: { path1: { tiers: { tier5: invalid.paths.path1.tiers.tier5 } } } },
    { paths: { path1: { tiers: { tier5: { choice: 'invented-option' } } } } },
    { paths: { path1: { tiers: { tier5: {} } } } },
    { paths: { path1: { tiers: { tier5: validTier } } }, baseSourceIds: ['invented'] },
    {
      paths: {
        path1: {
          tiers: {
            tier5: {
              ...validTier,
              statChanges: [{ stat: 'damage', operation: 'add', value: -100 }],
            },
          },
        },
      },
    },
  ];
  for (const patch of patches) {
    const model = new ResponseModel([
      { output: invalid, usage: usage('first') },
      { output: patch, usage: usage('second') },
    ]);
    await assert.rejects(draftUnit(await prepareRequest(request()), model), (error) => {
      assert.ok(error instanceof ModelExecutionError);
      assert.equal(error.failure?.code, 'MODEL_OUTPUT_INVALID');
      assert.equal(error.usage?.totalTokens, 280);
      assert.match(error.message, /after 2 attempts/);
      return true;
    });
    assert.equal(model.requests.length, 2);
  }
});

test('malformed wire tiers and non-tier issues keep whole-output repair', async () => {
  const malformed = overloadedTierOutput();
  malformed.paths.path1.tiers.tier5.statChanges.push({ stat: 'range', operation: 'add', value: 1 });
  const nonTier = modelOutput(blueprint());
  nonTier.baseSourceIds = ['invented'];
  for (const invalid of [malformed, nonTier]) {
    const model = new ResponseModel([{ output: invalid }, { output: blueprint() }]);
    const draft = await draftUnit(await prepareRequest(request()), model);
    assert.deepEqual(draft.candidate.blueprint, blueprint());
    assert.ok(Object.hasOwn(model.requests[1]!.schema.properties as object, 'baseSourceIds'));
    assert.match(model.requests[1]!.prompt, /all three paths/);
    assert.equal(model.requests.length, 2);
  }
});

test('wire slow and burn are complete atomic pairs with their real primitive change cost', () => {
  const input = request();
  const output = modelOutput(blueprint());
  output.paths.path1.tiers.tier1.statChanges = [];
  output.paths.path1.tiers.tier1.slow = { percent: 20, durationSeconds: 2 };
  output.paths.path2.tiers.tier1.statChanges = [];
  output.paths.path2.tiers.tier1.burn = { damagePerSecond: 3, durationSeconds: 4 };
  const decoded = decodeBlueprintOutput(output, input);
  assert.deepEqual(decoded.paths.path1.tiers.tier1.changes, [
    { kind: 'stat', target: 'base', stat: 'slowPercent', operation: 'set', value: 20 },
    { kind: 'stat', target: 'base', stat: 'slowSeconds', operation: 'set', value: 2 },
  ]);
  assert.deepEqual(decoded.paths.path2.tiers.tier1.changes, [
    { kind: 'stat', target: 'base', stat: 'burnDamagePerSecond', operation: 'set', value: 3 },
    { kind: 'stat', target: 'base', stat: 'burnSeconds', operation: 'set', value: 4 },
  ]);
  assert.deepEqual(validateBlueprintRequest(decoded, input), []);
  const incomplete = structuredClone(output);
  delete (incomplete.paths.path1.tiers.tier1.slow as Partial<{ durationSeconds: number }>)
    .durationSeconds;
  assert.equal(modelOutputSchema(input).safeParse(incomplete).success, false);
  const separate = structuredClone(output);
  (separate.paths.path1.tiers.tier1.statChanges as unknown[]).push({
    stat: 'slowPercent',
    operation: 'set',
    value: 20,
  });
  assert.equal(modelOutputSchema(input).safeParse(separate).success, false);
  output.paths.path1.tiers.tier1.burn = { damagePerSecond: 1, durationSeconds: 2 };
  assert.throws(() => decodeBlueprintOutput(output, input), /4 slow\/burn primitive changes/);
});

test('ordinary compiled gameplay text excludes unsupported lore claims while retaining real deltas', async () => {
  const unit = blueprint();
  unit.role = 'Reduces incoming blade damage and improves survivability.';
  unit.weakness = 'Armor bypass is needed against defensive opponents.';
  for (const path of pathKeys) {
    unit.paths[path].theme = 'Improves survivability against incoming blade damage.';
    unit.paths[path].rationale = 'The character gains armor bypass from this technique.';
  }
  const prepared = await prepareRequest(request());
  const candidate = compileBlueprint(unit, prepared.request);
  const unsupported = /incoming blade damage|survivability|armor bypass/i;
  assert.doesNotMatch(candidate.role, unsupported);
  for (const path of candidate.paths) assert.doesNotMatch(path.theme, unsupported);
  assert.match(candidate.paths[0]!.tiers[0]!.benefit, /damage 10 to 11/);
  const artifact = draftArtifactSchema.parse({
    schemaVersion: '1',
    kind: 'draft',
    prepared,
    candidate,
    run: {
      id: 'compiled-fixture',
      modelId: 'test/compile',
      startedAt: '2026-09-20T00:00:00.000Z',
      completedAt: '2026-09-20T00:00:00.000Z',
    },
  });
  const rendered = renderArtifact(artifact);
  assert.doesNotMatch(rendered, unsupported);
  assert.match(rendered, /damage 10 to 11/);
  assert.equal(candidate.blueprint!.role, unit.role);
});

function budgetIssues(output: ReturnType<typeof modelOutput>, input = request()): string[] {
  try {
    decodeBlueprintOutput(output, input);
    assert.fail('Expected an overbudget output');
  } catch (error) {
    assert.ok(error instanceof z.ZodError);
    return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  }
}

test('subset repair preserves authored values and atomic control pairs across early and late tiers', () => {
  const input = request();
  const invalid = overloadedTierOutput();
  const early = invalid.paths.path1.tiers.tier2;
  early.statChanges.push({ stat: 'range', operation: 'add', value: 3 });
  early.slow = { percent: 23, durationSeconds: 2.5 };
  early.burn = { damagePerSecond: 7, durationSeconds: 3.25 };
  const repair = targetedTierRepair(input, invalid, budgetIssues(invalid))!;
  const context = JSON.parse(repair.request.prompt.split('\n\n')[1]!);
  const choices = context.effectSubsetChoices as Record<string, { id: string; keep: string[] }[]>;
  assert.ok(choices['path1.tier2']!.length > 1 && choices['path1.tier2']!.length <= 64);
  assert.ok(choices['path1.tier5']!.length > 1 && choices['path1.tier5']!.length <= 64);
  const late = choices['path1.tier5']![0]!;
  for (const option of choices['path1.tier2']!) {
    const repaired = repair.apply({
      paths: {
        path1: {
          tiers: {
            tier2: { choice: option.id },
            tier5: { choice: late.id },
          },
        },
      },
    });
    const decoded = decodeBlueprintOutput(repaired, input);
    assert.ok(decoded.paths.path1.tiers.tier2.changes.length <= 3);
    assert.ok(decoded.paths.path1.tiers.tier5.changes.length <= 4);
    assert.deepEqual(repaired.paths.path2, invalid.paths.path2);
    assert.deepEqual(repaired.paths.path3, invalid.paths.path3);
    assert.deepEqual(repaired.baseAttack, invalid.baseAttack);
    assert.deepEqual(repaired.baseSourceIds, invalid.baseSourceIds);
    assert.deepEqual(repaired.paths.path1.tiers.tier1, invalid.paths.path1.tiers.tier1);
    const actual = repaired.paths.path1.tiers.tier2;
    assert.equal(actual.name, early.name);
    assert.equal(actual.cost, early.cost);
    assert.deepEqual(actual.slow, option.keep.includes('slow') ? early.slow : null);
    assert.deepEqual(actual.burn, option.keep.includes('burn') ? early.burn : null);
    assert.deepEqual(
      actual.statChanges,
      early.statChanges.filter((_, index) => option.keep.includes(`statChanges.${index}`)),
    );
    assert.deepEqual(validateBlueprintRequest(decoded, input), []);
  }
});

test('subset menus respect tighter Definition limits and keep replacement fallback for other faults', () => {
  const input = request();
  input.mechanicsDefinition!.profile.earlyTierMaxChanges = 2;
  const invalid = modelOutput(blueprint());
  invalid.paths.path1.tiers.tier2.slow = { percent: 20, durationSeconds: 2 };
  const repair = targetedTierRepair(input, invalid, budgetIssues(invalid, input))!;
  const context = JSON.parse(repair.request.prompt.split('\n\n')[1]!);
  const options = context.effectSubsetChoices['path1.tier2'] as { id: string; keep: string[] }[];
  assert.deepEqual(
    options.map(({ keep }) => keep),
    [['statChanges.0'], ['slow']],
  );
  for (const { id } of options) {
    const repaired = repair.apply({ paths: { path1: { tiers: { tier2: { choice: id } } } } });
    assert.ok(decodeBlueprintOutput(repaired, input).paths.path1.tiers.tier2.changes.length <= 2);
  }
  const original = modelOutput(blueprint());
  const fallback = targetedTierRepair(request(), original, [
    'paths.path1.tiers.tier2.changes: invalid benefit',
  ])!;
  assert.deepEqual(
    fallback.apply({ paths: { path1: { tiers: { tier2: original.paths.path1.tiers.tier2 } } } }),
    original,
  );
  assert.throws(() =>
    fallback.apply({ paths: { path1: { tiers: { tier2: { choice: 'option-1' } } } } }),
  );
});

test('a selected budget-valid subset with harmful mechanics is withheld with both attempts billed', async () => {
  const invalid = overloadedTierOutput();
  invalid.paths.path1.tiers.tier5.statChanges[0]!.value = -10000;
  const model = new ResponseModel([
    { output: invalid, usage: usage('first') },
    {
      output: { paths: { path1: { tiers: { tier5: { choice: 'option-1' } } } } },
      usage: usage('second'),
    },
  ]);
  await assert.rejects(draftUnit(await prepareRequest(request()), model), (error) => {
    assert.ok(error instanceof ModelExecutionError);
    assert.equal(error.failure?.code, 'MODEL_OUTPUT_INVALID');
    assert.equal(error.usage?.totalTokens, 280);
    assert.match(error.message, /after 2 attempts/);
    return true;
  });
  assert.equal(model.requests.length, 2);
});

test('CLI-shared draft and Lab preserve usage and review without reusing them on a new draft', async () => {
  const prepared = await prepareRequest(request());
  const model = new ResponseModel([
    { output: blueprint(), usage: usage('draft') },
    { output: { summary: 'Advisory review.', findings: [] }, usage: usage('review') },
    { output: blueprint() },
  ]);
  const draft = draftArtifactSchema.parse(
    await executeLabOperation('draft', { prepared }, model, new AbortController().signal),
  );
  assert.deepEqual(draft.candidate, compileBlueprint(blueprint(), prepared.request));
  const result = await reviewDraft(await checkDraft(draft), model);
  const reviewInput = await inputBeforeStage(result, 'review');
  assert.equal(reviewInput?.kind, 'checked');
  const totals = summarizeUsage(result);
  assert.deepEqual(totals.tokens, { value: 280, partial: false });
  assert.deepEqual(totals.cost, { value: 0.02, partial: false });
  const rerun = await draftUnit(prepared, model);
  assert.deepEqual(rerun.candidate, draft.candidate);
});

test('fractional projectiles reach repair with actionable arithmetic evidence and remain rejected if unchanged', async () => {
  const invalid = blueprint();
  invalid.paths.path2.tiers.tier2.changes = [
    { kind: 'stat', target: 'base', stat: 'projectiles', operation: 'multiply', value: 1.5 },
  ];
  const corrected = structuredClone(invalid);
  corrected.paths.path2.tiers.tier2.changes = [
    { kind: 'stat', target: 'base', stat: 'projectiles', operation: 'add', value: 1 },
  ];
  const model = new ResponseModel([{ output: invalid }, { output: corrected }]);
  const draft = await draftUnit(await prepareRequest(request()), model);
  assert.match(
    model.requests[0]!.prompt,
    /projectiles and pierce must resolve to positive integers/,
  );
  assert.match(model.requests[1]!.prompt, /Resolved projectiles is 1\.5/);
  assert.match(model.requests[1]!.prompt, /paths\.path2\.tiers\.tier2\.changes\.0: multiply 1\.5/);
  assert.equal(resolveBuild(draft.candidate.blueprint!, [0, 2, 0]).baseAttack.stats.projectiles, 2);
  assert.equal(draft.run.attempts?.length, 2);
  const unchanged = new ResponseModel([{ output: invalid }, { output: invalid }]);
  await assert.rejects(draftUnit(await prepareRequest(request()), unchanged), (error) => {
    assert.ok(error instanceof ModelExecutionError);
    assert.match(error.message, /after 2 attempts/);
    assert.match(error.message, /Resolved projectiles is 1\.5/);
    assert.match(error.message, /paths\.path2\.tiers\.tier2\.changes\.0: multiply 1\.5\./);
    assert.match(
      error.message,
      /Correct the authored projectiles upgrades so every legal build has a positive whole-number count\./,
    );
    assert.match(error.message, /Counts are never rounded\./);
    assert.match(error.message, /\d+ additional projectiles count checks failed\./);
    assert.equal(error.message.match(/Resolved projectiles/g)?.length, 1);
    assert.equal(error.message.match(/paths\.path2\.tiers\.tier2\.changes\.0/g)?.length, 1);
    assert.ok(error.message.length < 650);
    return true;
  });
});

test('repairing a legacy tier-four boost includes its dependent tier-five replacement', () => {
  const input = request();
  const original = modelOutput(blueprint());
  const invalid = structuredClone(original);
  const tier4 = invalid.paths.path2.tiers.tier4;
  tier4.statChanges = [
    { stat: 'damage', operation: 'add', value: 1 },
    { stat: 'range', operation: 'add', value: 1 },
    { stat: 'pierce', operation: 'add', value: 1 },
    { stat: 'projectiles', operation: 'add', value: 1 },
  ];
  const repair = targetedTierRepair(input, invalid, budgetIssues(invalid, input))!;
  const context = JSON.parse(repair.request.prompt.split('\n\n')[1]!);
  assert.deepEqual(context.dependentCapstones, ['path2.tier5']);
  const choices = context.effectSubsetChoices['path2.tier4'] as { id: string; keep: string[] }[];
  const withoutBoost = choices.find(({ keep }) => !keep.includes('unlockBoost'))!;
  assert.ok(withoutBoost);
  assert.equal(context.effectSubsetChoices['path2.tier5'], undefined);
  const tier5 = structuredClone(original.paths.path2.tiers.tier5);
  tier5.boostChanges = [];
  tier5.statChanges = [{ stat: 'range', operation: 'add', value: 2 }];
  const repaired = repair.apply({
    paths: { path2: { tiers: { tier4: { choice: withoutBoost.id }, tier5 } } },
  });
  assert.deepEqual(validateBlueprintRequest(decodeBlueprintOutput(repaired, input), input), []);
  assert.equal(repaired.paths.path2.tiers.tier4.unlockBoost, null);
  assert.deepEqual(repaired.paths.path1, original.paths.path1);
  assert.deepEqual(repaired.paths.path3, original.paths.path3);
  assert.deepEqual(repaired.baseSourceIds, original.baseSourceIds);
  assert.throws(() =>
    repair.apply({
      paths: { path2: { tiers: { tier4: { choice: withoutBoost.id } } } },
    }),
  );
});

test('policy-dependent capstones always require full replacements rather than implicit budget menus', () => {
  const input = applyDefaultProfile(request());
  input.mechanicsDefinition!.profile.authoringMode = 'direct';
  input.mechanicsDefinition!.profile.designPolicy!.minTier5SpecialtyMultiplier = 3;
  const unit = blueprint();
  unit.paths.path1.specialization = 'direct-damage';
  unit.paths.path2.specialization = 'ability-burst';
  unit.paths.path3.specialization = 'group-damage';
  const invalid = modelOutput(unit);
  invalid.paths.path1.tiers.tier5.statChanges = [
    { stat: 'damage', operation: 'add', value: 1 },
    { stat: 'range', operation: 'add', value: 1 },
    { stat: 'pierce', operation: 'add', value: 1 },
    { stat: 'projectiles', operation: 'add', value: 1 },
  ];
  invalid.paths.path1.tiers.tier5.camo = true;
  const repair = targetedTierRepair(input, invalid, [
    'paths.path1.tiers.tier1: Resolved tier 1 behavior duplicates path3.',
  ])!;
  const context = JSON.parse(repair.request.prompt.split('\n\n')[1]!);
  assert.deepEqual(context.dependentCapstones, ['path1.tier5']);
  assert.equal(context.effectSubsetChoices['path1.tier5'], undefined);
  assert.throws(() =>
    repair.apply({
      paths: {
        path1: {
          tiers: {
            tier1: invalid.paths.path1.tiers.tier1,
            tier5: { choice: 'option-1' },
          },
        },
      },
    }),
  );
  const replacement = structuredClone(invalid.paths.path1.tiers.tier5);
  replacement.camo = null;
  const repaired = repair.apply({
    paths: {
      path1: {
        tiers: {
          tier1: invalid.paths.path1.tiers.tier1,
          tier5: replacement,
        },
      },
    },
  });
  assert.deepEqual(repaired.paths.path2, invalid.paths.path2);
  assert.deepEqual(repaired.paths.path3, invalid.paths.path3);
  assert.deepEqual(repaired.baseSourceIds, invalid.baseSourceIds);
});

test('the default schema permits only an optional middle-path boost in drafting and targeted repair', () => {
  const input = applyDefaultProfile(request());
  input.mechanicsDefinition!.profile.authoringMode = 'direct';
  input.mechanicsDefinition!.profile.designPolicy!.minTier5SpecialtyMultiplier = 3;
  const unit = blueprint();
  unit.paths.path1.specialization = 'direct-damage';
  unit.paths.path2.specialization = 'ability-burst';
  unit.paths.path3.specialization = 'group-damage';
  const output = modelOutput(unit);
  assert.equal(modelOutputSchema(input).safeParse(output).success, true);
  type JsonSchema = { type?: string; properties: Record<string, JsonSchema>; anyOf?: JsonSchema[] };
  for (const path of pathKeys)
    for (const tier of tierKeys) {
      const repair = targetedTierRepair(input, output, [
        `paths.${path}.tiers.${tier}: Correct this purchase.`,
      ])!;
      const schema = repair.request.schema as JsonSchema;
      const active =
        schema.properties.paths!.properties[path]!.properties.tiers!.properties[tier]!.properties
          .activeFollowUp!;
      if (path === 'path2' && (tier === 'tier4' || tier === 'tier5'))
        assert.ok(active.anyOf?.some((choice) => choice.type === 'object'));
      else assert.equal(active.type, 'null');
    }
  for (const path of ['path1', 'path3'] as const) {
    const badUnlock = structuredClone(output);
    badUnlock.paths[path].tiers.tier4.unlockBoost = output.paths.path2.tiers.tier4.unlockBoost;
    assert.equal(modelOutputSchema(input).safeParse(badUnlock).success, false);
    const badModification = structuredClone(output);
    badModification.paths[path].tiers.tier5.boostChanges =
      output.paths.path2.tiers.tier5.boostChanges;
    assert.equal(modelOutputSchema(input).safeParse(badModification).success, false);
    const repair = targetedTierRepair(input, output, [
      `paths.${path}.tiers.tier4: This upgrade needs a coherent benefit.`,
    ])!;
    assert.throws(() =>
      repair.apply({
        paths: {
          [path]: {
            tiers: {
              tier4: badUnlock.paths[path].tiers.tier4,
              tier5: output.paths[path].tiers.tier5,
            },
          },
        },
      }),
    );
    assert.throws(() =>
      repair.apply({
        paths: {
          [path]: {
            tiers: {
              tier4: output.paths[path].tiers.tier4,
              tier5: badModification.paths[path].tiers.tier5,
            },
          },
        },
      }),
    );
  }
  const automatic = structuredClone(output);
  automatic.paths.path2.tiers.tier4 = structuredClone(output.paths.path1.tiers.tier4);
  automatic.paths.path2.tiers.tier5 = structuredClone(output.paths.path1.tiers.tier5);
  assert.equal(modelOutputSchema(input).safeParse(automatic).success, true);
  input.mechanicsDefinition!.profile.designPolicy!.manualAbilityPath = null;
  assert.equal(modelOutputSchema(input).safeParse(automatic).success, true);
  assert.equal(modelOutputSchema(input).safeParse(output).success, false);
});

test('custom manual slots and explicit legacy policies retain their intended wire behavior', () => {
  const input = applyDefaultProfile(request());
  input.mechanicsDefinition!.profile.authoringMode = 'direct';
  input.mechanicsDefinition!.profile.designPolicy!.minTier5SpecialtyMultiplier = 3;
  const unit = blueprint();
  unit.paths.path1.specialization = 'direct-damage';
  unit.paths.path2.specialization = 'group-damage';
  unit.paths.path3.specialization = 'ability-burst';
  const output = modelOutput(unit);
  [output.paths.path2.tiers, output.paths.path3.tiers] = [
    output.paths.path3.tiers,
    output.paths.path2.tiers,
  ];
  assert.equal(modelOutputSchema(input).safeParse(output).success, false);
  input.mechanicsDefinition!.profile.designPolicy!.manualAbilityPath = 'path3';
  assert.equal(modelOutputSchema(input).safeParse(output).success, true);
  delete input.mechanicsDefinition!.profile.designPolicy!.manualAbilityPath;
  assert.equal(modelOutputSchema(input).safeParse(output).success, true);
  output.paths.path1.tiers.tier4.unlockBoost = output.paths.path3.tiers.tier4.unlockBoost;
  output.paths.path1.tiers.tier5.boostChanges = output.paths.path3.tiers.tier5.boostChanges;
  // Legacy grammar retains its old behavior; its independent count validator still applies.
  assert.equal(modelOutputSchema(input).safeParse(output).success, true);
  assert.equal(modelOutputSchema(request()).safeParse(modelOutput(blueprint())).success, true);
});

test('targeted repair receives exact source evidence and resolved capstone minima without mutating inputs', () => {
  const input = applyDefaultProfile(request());
  input.mechanicsDefinition!.profile.authoringMode = 'direct';
  input.mechanicsDefinition!.profile.designPolicy!.minTier5SpecialtyMultiplier = 3;
  const unit = blueprint();
  unit.paths.path1.specialization = 'direct-damage';
  unit.paths.path2.specialization = 'ability-burst';
  unit.paths.path3.specialization = 'group-damage';
  const output = modelOutput(unit);
  const originalOutput = structuredClone(output);
  const originalInput = structuredClone(input);
  const repair = targetedTierRepair(input, output, [
    'paths.path1.tiers.tier5: The capstone needs at least 3x direct damage rate.',
  ])!;
  const context = JSON.parse(repair.request.prompt.split('\n\n')[1]!);
  assert.deepEqual(context.evidenceSpans, authorEvidence(input));
  assert.ok(
    context.evidenceSpans.some(
      (span: { text: string }) =>
        span.text === 'Mira senses presences behind walls and fires a Spark at one target.',
    ),
  );
  const path1 = context.resolvedCapstoneChecks.find(
    (entry: { path: string }) => entry.path === 'path1',
  );
  assert.equal(path1.tier4Attack.damage, 14);
  assert.equal(path1.tier5Attack.damage, 15);
  assert.equal(path1.tier4HasManualBoost, false);
  assert.deepEqual(path1.metrics, [
    {
      metric: 'direct damage rate',
      tier4: 14,
      tier5: 15,
      minimumTier5: 42,
    },
  ]);
  assert.equal(
    context.resolvedCapstoneChecks.find((entry: { path: string }) => entry.path === 'path2')
      .tier4HasManualBoost,
    true,
  );
  const replacement = structuredClone(output.paths.path1.tiers.tier5);
  replacement.statChanges = [{ stat: 'damage', operation: 'multiply', value: 3 }];
  const repaired = repair.apply({ paths: { path1: { tiers: { tier5: replacement } } } });
  assert.equal(
    decodeBlueprintOutput(repaired, input).paths.path1.tiers.tier5.changes[0]!.kind,
    'stat',
  );
  assert.deepEqual(output, originalOutput);
  assert.deepEqual(input, originalInput);
  assert.deepEqual(repaired.paths.path2, originalOutput.paths.path2);
  assert.deepEqual(repaired.baseSourceIds, originalOutput.baseSourceIds);
});

test('undecodable repair output safely omits arithmetic context while retaining source evidence', () => {
  const input = applyDefaultProfile(request());
  input.mechanicsDefinition!.profile.authoringMode = 'direct';
  input.mechanicsDefinition!.profile.designPolicy!.minTier5SpecialtyMultiplier = 3;
  assert.deepEqual(wireRepairContext(null, input), []);
  assert.deepEqual(wireRepairContext({ paths: 'malformed' }, input), []);
  const unit = blueprint();
  unit.paths.path1.specialization = 'direct-damage';
  unit.paths.path2.specialization = 'ability-burst';
  unit.paths.path3.specialization = 'group-damage';
  const output = modelOutput(unit);
  output.paths.path1.tiers.tier5.statChanges = [
    { stat: 'damage', operation: 'add', value: 1 },
    { stat: 'range', operation: 'add', value: 1 },
    { stat: 'pierce', operation: 'add', value: 1 },
    { stat: 'projectiles', operation: 'add', value: 1 },
  ];
  output.paths.path1.tiers.tier5.camo = true;
  const before = structuredClone(output);
  assert.equal(modelOutputSchema(input).safeParse(output).success, true);
  assert.deepEqual(wireRepairContext(output, input), []);
  const repair = targetedTierRepair(input, output, budgetIssues(output, input))!;
  const context = JSON.parse(repair.request.prompt.split('\n\n')[1]!);
  assert.deepEqual(context.resolvedCapstoneChecks, []);
  assert.deepEqual(context.evidenceSpans, authorEvidence(input));
  assert.deepEqual(output, before);
});

function plannedRequest(): AuthorRequest {
  const input = request();
  input.mechanicsDefinition!.profile.authoringMode = 'planned-v1';
  return input;
}

function plannedDesign() {
  const sourceIds = [authorEvidence(request())[0]!.id];
  return {
    upgradeIntents: Object.fromEntries(
      pathKeys.map((path) => [
        path,
        Object.fromEntries(
          tierKeys.map((tier) => [
            tier,
            path === 'path2' && tier === 'tier4'
              ? { improves: [], unlock: 'manual-boost' }
              : {
                  improves: [
                    path === 'path1'
                      ? 'damage'
                      : path === 'path3'
                        ? 'pierce'
                        : tier === 'tier5'
                          ? 'active-damage'
                          : 'range',
                  ],
                  unlock: 'none',
                },
          ]),
        ),
      ]),
    ) as NonNullable<
      import('../src/core/planned-v1/plan-schema.js').UnitDesignPlan['upgradeIntents']
    >,
    concept: 'Mira develops her sourced Spark in three directions.',
    signature: { name: 'Spark', sourceIds, adaptation: 'A clear-path energy shot.' },
    repertoire: [{ name: 'Spark', sourceIds, limitation: 'Only this attack is established.' }],
    base: { name: 'Mira Spark', sourceIds, behavior: 'Fire one energy shot.' },
    paths: Object.fromEntries(
      pathKeys.map((path) => [
        path,
        {
          name: `Mira ${path}`,
          sourceIds,
          buyFor: `Develop ${path} Spark pressure.`,
          weakness: 'Requires clear delivery.',
          milestones: {
            tier1: 'Improve the Spark.',
            tier2: 'Develop the same improvement.',
            tier3: 'Focus this branch.',
            tier4: 'Sustain this branch.',
            tier5: 'Strengthen its sustained tactical value.',
          },
          capstoneValue: 'Maintain useful pressure in the chosen role.',
          crosspaths: pathKeys
            .filter((other) => other !== path)
            .map((other) => ({ path: other, contribution: 'Use its early Spark improvements.' })),
          referenceExample: 'Crossbow develops the purchased attack.',
        },
      ]),
    ) as Record<
      (typeof pathKeys)[number],
      {
        name: string;
        sourceIds: string[];
        buyFor: string;
        weakness: string;
        milestones: Record<(typeof tierKeys)[number], string>;
        capstoneValue: string;
        crosspaths: { path: (typeof pathKeys)[number]; contribution: string }[];
        referenceExample: string;
      }
    >,
    omittedTechniques: [{ name: 'Wall perception', reason: 'No remote detection geometry.' }],
    scopeLimits: ['Limited to the supplied Spark evidence.'],
  };
}

test('planned drafting retains character decisions, revision context and each billed call exactly once', async () => {
  const input = plannedRequest();
  input.feedback = 'Keep Spark but clarify the final upgrade purpose.';
  input.constraints.push({ id: 'signature', text: 'Keep the Spark identity.' });
  const plan = plannedDesign();
  const unit = blueprint();
  unit.constraintCoverage.push({
    constraintId: 'signature',
    implementation: 'The basic attack remains Spark.',
  });
  const model = new ResponseModel([
    { output: plan, usage: usage('plan') },
    { output: unit, usage: usage('mechanics') },
  ]);
  const draft = await draftUnit(await prepareRequest(input), model);
  assert.deepEqual(draft.run.designPlan, plan);
  assert.equal(draft.prepared.request.mechanicsDefinition!.profile.authoringMode, 'planned-v1');
  assert.deepEqual(
    draft.run.attempts?.map(({ purpose }) => purpose),
    ['plan', 'design'],
  );
  assert.equal(draft.run.usage?.totalTokens, 280);
  assert.equal(draft.run.usage?.costUsd, 0.02);
  assert.equal(draft.run.usage?.generationId, null);
  assert.equal(model.requests.length, 2);
  const planningContext = JSON.parse(model.requests[0]!.prompt.split('\n\n').at(-1)!);
  assert.equal(planningContext.feedback, input.feedback);
  assert.deepEqual(planningContext.constraints, input.constraints);
  assert.match(model.requests[1]!.prompt, /Implement the supplied designPlan/);
  assert.equal(draft.candidate.blueprint!.baseAttack.name, plan.base.name);
  assert.deepEqual(draft.candidate.blueprint!.baseAttack.stats, unit.baseAttack.stats);
  for (const path of pathKeys) {
    const compiled = draft.candidate.blueprint!.paths[path];
    assert.equal(compiled.name, plan.paths[path].name);
    assert.equal(compiled.theme, plan.paths[path].buyFor);
    assert.equal(
      compiled.rationale,
      `${plan.paths[path].weakness} ${plan.paths[path].capstoneValue}`,
    );
    assert.deepEqual(compiled.tiers, unit.paths[path].tiers);
  }
});

test('planned mechanics omit code-owned labels and retain verifiable purchase evidence without extra model calls', async () => {
  const plan = plannedDesign();
  const wire = modelOutput(blueprint());
  const slim = JSON.parse(JSON.stringify(wire));
  delete slim.baseSourceIds;
  delete slim.baseAttack.name;
  for (const path of pathKeys)
    for (const field of ['name', 'sourceIds', 'theme', 'rationale']) delete slim.paths[path][field];
  const model = new ResponseModel([{ output: plan }, { output: slim }]);
  const draft = await draftUnit(await prepareRequest(plannedRequest()), model);
  assert.equal(model.requests.length, 2);
  const grammar = model.requests[1]!.schema as {
    properties: Record<string, { properties: Record<string, unknown> }>;
  };
  assert.equal(grammar.properties.baseSourceIds, undefined);
  assert.equal(grammar.properties.baseAttack!.properties.name, undefined);
  assert.equal(draft.candidate.blueprint!.baseAttack.name, plan.base.name);
  assert.equal(draft.run.designEvaluation!.scope, 'analytical-not-simulation');
  assert.equal(draft.run.designEvaluation!.paths[0]!.crosspaths.length, 12);
  assert.match(renderArtifact(draft, { details: true }), /Purchase evidence/);
  assert.doesNotMatch(renderArtifact(draft), /Purchase evidence/);
  const reordered = structuredClone(draft);
  const reverseKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reverseKeys);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .reverse()
          .map(([key, entry]) => [key, reverseKeys(entry)]),
      );
    return value;
  };
  reordered.run.designEvaluation = reverseKeys(
    reordered.run.designEvaluation,
  ) as typeof reordered.run.designEvaluation;
  assert.deepEqual(reordered.run.designEvaluation, draft.run.designEvaluation);
  assert.equal(
    (await checkDraft(reordered)).findings.some((finding) => finding.outcome === 'fail'),
    false,
  );
  const edited = structuredClone(draft);
  edited.run.designEvaluation!.paths[0]!.capstoneComparison.tier5.totalGold += 1;
  assert.ok(
    (await checkDraft(edited)).findings.some(
      (finding) => finding.subject === 'run.designEvaluation' && finding.outcome === 'fail',
    ),
  );
  delete edited.run.designEvaluation;
  assert.equal(
    (await checkDraft(edited)).findings.some((finding) => finding.outcome === 'fail'),
    false,
  );
});

test('planning source correction is bounded and retains both planning charges before mechanics', async () => {
  const invalid = plannedDesign();
  invalid.signature.sourceIds = ['fabricated'];
  const model = new ResponseModel([
    { output: invalid, usage: usage('bad-plan') },
    { output: plannedDesign(), usage: usage('corrected-plan') },
    { output: blueprint(), usage: usage('mechanics') },
  ]);
  const draft = await draftUnit(await prepareRequest(plannedRequest()), model);
  assert.deepEqual(
    draft.run.attempts?.map(({ purpose }) => purpose),
    ['plan', 'plan', 'design'],
  );
  assert.deepEqual(
    draft.run.attempts?.map(({ number }) => number),
    [1, 2, 3],
  );
  assert.match(draft.run.attempts![0]!.issues.join(' '), /Unknown character evidence ID/);
  assert.match(model.requests[1]!.prompt, /Correct this invalid design plan/);
  assert.equal(draft.run.usage?.totalTokens, 420);
  assert.equal(draft.run.usage?.costUsd, 0.03);
  const exhausted = new ResponseModel([
    { output: invalid, usage: usage('first') },
    { output: invalid, usage: usage('second') },
  ]);
  await assert.rejects(draftUnit(await prepareRequest(plannedRequest()), exhausted), (error) => {
    assert.ok(error instanceof ModelExecutionError);
    assert.equal(error.failure?.code, 'MODEL_OUTPUT_INVALID');
    assert.match(error.message, /design plan could not be validated/);
    assert.equal(error.usage?.totalTokens, 280);
    return true;
  });
  assert.equal(exhausted.requests.length, 2);
});

test('planned mechanics repair and exhausted failure include planning usage once', async () => {
  const model = new ResponseModel([
    { output: plannedDesign(), usage: usage('plan') },
    { output: {}, usage: usage('bad-mechanics') },
    { output: blueprint(), usage: usage('repair') },
  ]);
  const draft = await draftUnit(await prepareRequest(plannedRequest()), model);
  assert.deepEqual(
    draft.run.attempts?.map(({ purpose }) => purpose),
    ['plan', 'design', 'repair'],
  );
  assert.equal(draft.run.usage?.totalTokens, 420);
  assert.equal(draft.run.usage?.costUsd, 0.03);
  assert.equal(draft.run.designPlan!.base.name, 'Mira Spark');
  const exhausted = new ResponseModel([
    { output: plannedDesign(), usage: usage('plan') },
    { output: {}, usage: usage('first') },
    { output: {}, usage: usage('second') },
  ]);
  await assert.rejects(draftUnit(await prepareRequest(plannedRequest()), exhausted), (error) => {
    assert.ok(error instanceof ModelExecutionError);
    assert.equal(error.usage?.totalTokens, 420);
    assert.equal(error.usage?.costUsd, 0.03);
    assert.match(error.message, /after 2 attempts/);
    return true;
  });
  assert.equal(exhausted.requests.length, 3);
});

test('a mechanically valid plan mismatch enters bounded tier repair and retains all usage', async () => {
  const unit = blueprint();
  unit.paths.path2.tiers.tier5.changes = [
    { kind: 'stat', target: 'base', stat: 'range', operation: 'add', value: 8 },
  ];
  const valid = modelOutput(blueprint());
  const model = new ResponseModel([
    { output: plannedDesign(), usage: usage('plan') },
    { output: unit, usage: usage('mismatch') },
    {
      output: { paths: { path2: { tiers: { tier5: valid.paths.path2.tiers.tier5 } } } },
      usage: usage('repair'),
    },
  ]);
  const draft = await draftUnit(await prepareRequest(plannedRequest()), model);
  assert.deepEqual(
    draft.run.attempts?.map(({ purpose }) => purpose),
    ['plan', 'design', 'repair'],
  );
  assert.match(draft.run.attempts![1]!.issues.join(' '), /plan promises improved active-damage/);
  assert.match(model.requests[2]!.prompt, /Preserve the retained character plan/);
  assert.equal(draft.run.usage?.costUsd, 0.03);
  assert.equal(draft.run.usage?.totalTokens, 420);
  assert.deepEqual(
    draft.candidate.blueprint!.paths.path2.tiers.tier5.changes,
    blueprint().paths.path2.tiers.tier5.changes,
  );
});

test('one repair receives policy defects and independent plan mismatches together', async () => {
  const input = plannedRequest();
  input.mechanicsDefinition!.profile.designPolicy = {
    version: '1',
    distinctPathSpecializations: false,
    distinctFirstUpgrades: true,
    distinctCapstones: false,
    maxManualAbilityPaths: 1,
    tier5Uniqueness: 'one-per-player-unit-type-and-path',
  };
  const unit = blueprint();
  unit.paths.path1.specialization = 'direct-damage';
  unit.paths.path2.specialization = 'ability-burst';
  unit.paths.path3.specialization = 'group-damage';
  const broken = structuredClone(unit);
  broken.paths.path2.tiers.tier1.changes = structuredClone(unit.paths.path1.tiers.tier1.changes);
  broken.paths.path2.tiers.tier5.changes = [
    { kind: 'stat', target: 'base', stat: 'range', operation: 'add', value: 8 },
  ];
  const wire = modelOutput(unit);
  const model = new ResponseModel([
    { output: plannedDesign(), usage: usage('plan') },
    { output: broken, usage: usage('mismatch') },
    {
      output: {
        paths: {
          path2: {
            tiers: {
              tier1: wire.paths.path2.tiers.tier1,
              tier5: wire.paths.path2.tiers.tier5,
            },
          },
        },
      },
      usage: usage('repair'),
    },
  ]);
  const draft = await draftUnit(await prepareRequest(input), model);
  const issues = draft.run.attempts![1]!.issues.join(' ');
  assert.match(issues, /duplicates/);
  assert.match(issues, /improved range/);
  assert.match(issues, /improved active-damage/);
  assert.equal(model.requests.length, 3);
  assert.equal(draft.run.usage!.costUsd, 0.03);
});

test('cancelling a billed planning response never calls mechanics and retains the planning charge', async () => {
  const controller = new AbortController();
  let calls = 0;
  const model: ModelClient = {
    id: 'test/plan-abort',
    async generate(call) {
      calls++;
      assert.equal(call.signal, controller.signal);
      controller.abort();
      return { output: plannedDesign(), usage: usage('cancelled-plan') };
    },
  };
  await assert.rejects(
    draftUnit(await prepareRequest(plannedRequest()), model, { signal: controller.signal }),
    (error) => {
      assert.ok(error instanceof ModelExecutionError);
      assert.equal(error.failure?.code, 'CANCELLED');
      assert.equal(error.usage?.totalTokens, 140);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test('a billed provider failure after planning retains the total cost of both calls', async () => {
  const model = new ResponseModel([
    { output: plannedDesign(), usage: usage('plan') },
    new ModelExecutionError('Provider failed.', usage('failed-mechanics'), {
      failure: { code: 'NETWORK_ERROR', message: 'Provider failed.' },
    }),
  ]);
  await assert.rejects(draftUnit(await prepareRequest(plannedRequest()), model), (error) => {
    assert.ok(error instanceof ModelExecutionError);
    assert.equal(error.failure?.code, 'NETWORK_ERROR');
    assert.equal(error.usage?.totalTokens, 280);
    assert.equal(error.usage?.costUsd, 0.02);
    return true;
  });
  assert.equal(model.requests.length, 2);
});

test('one bounded repair sees a seven-effect capstone and an independent missing tier-two promise', async () => {
  const input = plannedRequest();
  const plan = plannedDesign();
  plan.upgradeIntents.path1.tier2.improves = ['damage', 'range'];
  const unit = blueprint();
  unit.paths.path1.tiers.tier2.changes.push({
    kind: 'stat',
    target: 'base',
    stat: 'range',
    operation: 'add',
    value: 2,
  });
  const valid = modelOutput(unit);
  const broken = structuredClone(valid);
  broken.paths.path1.tiers.tier2.statChanges = [
    { stat: 'pierce', operation: 'add', value: 1 },
    { stat: 'range', operation: 'add', value: 2 },
  ];
  broken.paths.path2.tiers.tier5.statChanges = [
    { stat: 'range', operation: 'add', value: 12 },
    { stat: 'damage', operation: 'add', value: 2 },
    { stat: 'pierce', operation: 'add', value: 1 },
  ];
  broken.paths.path2.tiers.tier5.boostChanges = [
    { stat: 'durationSeconds', operation: 'add', value: 2 },
    { stat: 'cooldownSeconds', operation: 'add', value: -5 },
    { stat: 'damageMultiplier', operation: 'multiply', value: 1.25 },
    { stat: 'rangeBonus', operation: 'add', value: 4 },
  ];
  assert.throws(() => decodeBlueprintOutput(broken, input), /This tier contains 7 effects/);
  const diagnostics = decodeBlueprintOutputForDiagnostics(broken, input);
  assert.equal(diagnostics.blueprint.paths.path2.tiers.tier5.changes.length, 7);
  assert.equal(diagnostics.budgetIssues.length, 1);
  assert.ok(
    validateBlueprintRequest(diagnostics.blueprint, input).some(({ message }) =>
      message.includes('change budget'),
    ),
  );
  const budget = diagnostics.budgetIssues.map(
    (issue) => `${issue.path.join('.')}: ${issue.message}`,
  );
  const repair = targetedTierRepair(input, broken, [
    ...budget,
    'paths.path1.tiers.tier2.planIntent: Missing promised damage.',
  ])!;
  const context = JSON.parse(repair.request.prompt.split('\n\n')[1]!);
  const choice = context.effectSubsetChoices['path2.tier5'].find((entry: { keep: string[] }) =>
    entry.keep.includes('boostChanges.2'),
  );
  assert.ok(choice);
  const model = new ResponseModel([
    { output: plan, usage: usage('plan') },
    { output: broken, usage: usage('mechanics') },
    {
      output: {
        paths: {
          path1: { tiers: { tier2: valid.paths.path1.tiers.tier2 } },
          path2: { tiers: { tier5: { choice: choice.id } } },
        },
      },
      usage: usage('repair'),
    },
  ]);
  const draft = await draftUnit(await prepareRequest(input), model);
  assert.equal(model.requests.length, 3);
  assert.equal(draft.run.usage!.totalTokens, 420);
  const issues = draft.run.attempts![1]!.issues.join(' ');
  assert.match(issues, /This tier contains 7 effects/);
  assert.match(issues, /paths.path1.tiers.tier2.planIntent.*improved damage/);
  const sentContext = JSON.parse(model.requests[2]!.prompt.split('\n\n')[1]!);
  assert.ok(sentContext.effectSubsetChoices['path2.tier5']);
  assert.equal(draft.candidate.blueprint!.paths.path2.tiers.tier5.changes.length, 4);
});

test('diagnostic decoding preserves excess effects without bypassing structural or domain validation', () => {
  const input = request();
  const output = modelOutput(blueprint());
  output.paths.path1.tiers.tier5.statChanges = [
    { stat: 'damage', operation: 'add', value: 1 },
    { stat: 'range', operation: 'add', value: 1 },
    { stat: 'pierce', operation: 'add', value: 1 },
    { stat: 'projectiles', operation: 'add', value: 1 },
  ];
  output.paths.path1.tiers.tier5.camo = true;
  output.paths.path3.tiers.tier3.statChanges = [{ stat: 'damage', operation: 'add', value: -100 }];
  const original = structuredClone(output);
  const decoded = decodeBlueprintOutputForDiagnostics(output, input);
  assert.equal(decoded.blueprint.paths.path1.tiers.tier5.changes.length, 5);
  const issues = validateBlueprintRequest(decoded.blueprint, input);
  assert.ok(issues.some(({ message }) => message.includes('change budget')));
  assert.ok(issues.some(({ path }) => path.includes('baseAttack.stats.damage')));
  assert.throws(() => decodeBlueprintOutput(output, input), /This tier contains 5 effects/);
  assert.deepEqual(output, original);
  output.paths.path1.tiers.tier5.cost = -1;
  assert.throws(() => decodeBlueprintOutputForDiagnostics(output, input));
  output.paths.path1.tiers.tier5.cost = 100;
  output.baseSourceIds = ['fabricated'];
  assert.throws(() => decodeBlueprintOutputForDiagnostics(output, input));
});
