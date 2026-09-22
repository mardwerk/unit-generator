import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  allLegalBuilds,
  checkDraft,
  compileCompactToBlueprint,
  compactJsonSchema,
  decodeCompact,
  draftSpineUnit,
  funIssues,
  generateUnit,
  pickSpine,
  prepareSpineRequest,
  resolveBuild,
  sourceAnchors,
  tropeDocumentText,
  tropePacketForName,
  type CompactBlueprint,
  type ModelClient,
  type ModelRequest,
  type ModelResponse,
  type Spine,
} from '../src/core/index.js';
import { validateBlueprintRequest } from '../src/core/blueprint/validate.js';

/** Deterministic stub: returns queued compact blueprints, never touches the network. */
class StubSpineModel implements ModelClient {
  readonly id = 'test/stub-spine';
  readonly requests: ModelRequest[] = [];
  constructor(private readonly outputs: unknown[]) {}
  async generate(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    const output = this.outputs.shift();
    if (output === undefined) throw new Error('No stub output configured');
    if (output instanceof Error) throw output;
    return { output: structuredClone(output) };
  }
}

type StatName =
  | 'damage'
  | 'intervalSeconds'
  | 'range'
  | 'pierce'
  | 'projectiles'
  | 'splashRadius'
  | 'slowPercent'
  | 'slowSeconds'
  | 'burnDamagePerSecond'
  | 'burnSeconds'
  | 'stunSeconds';
const stat = (statName: StatName, operation: 'add' | 'multiply' | 'set', value: number) => ({
  kind: 'stat' as const,
  target: 'base' as const,
  stat: statName,
  operation,
  value,
});

function validCompact(spine: Spine): CompactBlueprint {
  const tier = (
    index: number,
    name: string,
    changes: CompactBlueprint['paths']['path1']['tiers']['tier1']['changes'],
  ) => ({
    name,
    cost: spine.paths[0]!.tierCosts[index]!,
    changes,
  });
  const path1Control = spine.paths[0]!.specialization === 'control';
  const path1T4 = path1Control
    ? [stat('slowPercent', 'add', 10), stat('slowSeconds', 'add', 0.5)]
    : [stat('damage', 'add', 1)];
  const path1T5 = path1Control
    ? [stat('slowPercent', 'add', 10), stat('stunSeconds', 'set', 0.5)]
    : [
        stat('damage', 'add', 2),
        {
          kind: 'followUp' as const,
          target: 'base' as const,
          value: {
            name: 'Splinter hits',
            count: 3,
            damageMultiplier: 1,
            radius: 10,
            inheritStatuses: false,
          },
        },
      ];
  const controlT5 =
    spine.paths[2]!.specialization === 'control'
      ? [stat('slowPercent', 'add', 20), stat('slowSeconds', 'add', 0.5)]
      : spine.paths[2]!.specialization === 'range'
        ? [stat('damage', 'add', 3), stat('range', 'add', 6)]
        : [stat('damage', 'add', 3), stat('pierce', 'add', 2)];
  const controlT4 =
    spine.paths[2]!.specialization === 'control'
      ? [stat('slowPercent', 'set', 30), stat('slowSeconds', 'set', 1)]
      : [stat('damage', 'add', 2)];
  return {
    role: `A ${spine.label} unit.`,
    weakness: 'Falls apart without allied support against its counters.',
    baseAttack: { ...spine.base, name: 'Spine attack', cost: spine.baseCost },
    paths: {
      path1: {
        name: 'Group path',
        specialization: spine.paths[0]!.specialization,
        theme: 'Group coverage theme.',
        tiers: {
          tier1: tier(0, 'T1 group', [stat('pierce', 'add', 2)]),
          tier2: tier(1, 'T2 group', [stat('pierce', 'add', 2)]),
          tier3: tier(2, 'T3 group', [
            { kind: 'distribution', target: 'base', value: 'distinct-targets' },
            stat('projectiles', 'set', 2),
          ]),
          tier4: tier(3, 'T4 group', path1T4),
          tier5: tier(4, 'T5 group', path1T5),
        },
      },
      path2: {
        name: 'Burst path',
        specialization: spine.paths[1]!.specialization,
        theme: 'Scheduled burst theme.',
        tiers: {
          tier1: tier(0, 'T1 burst', [stat('intervalSeconds', 'multiply', 0.9)]),
          tier2: tier(1, 'T2 burst', [stat('intervalSeconds', 'multiply', 0.9)]),
          tier3: tier(2, 'T3 burst', [stat('damage', 'add', 1)]),
          tier4: tier(3, 'T4 burst', [
            {
              kind: 'unlockBoost',
              target: 'base',
              boost: {
                name: 'Overdrive',
                durationSeconds: 8,
                cooldownSeconds: 30,
                damageMultiplier: 2,
                intervalMultiplier: 0.7,
                rangeBonus: 0,
              },
            },
          ]),
          tier5: tier(4, 'T5 burst', [
            {
              kind: 'modifyBoost',
              target: 'base',
              stat: 'damageMultiplier',
              operation: 'multiply',
              value: 1.5,
            },
          ]),
        },
      },
      path3: {
        name: 'Third path',
        specialization: spine.paths[2]!.specialization,
        theme: 'Third theme.',
        tiers: {
          tier1: tier(0, 'T1 third', [stat('range', 'add', 6)]),
          tier2: tier(1, 'T2 third', [
            stat('range', 'add', 6),
            { kind: 'camo', target: 'base', value: true },
          ]),
          tier3: tier(2, 'T3 third', [stat('damage', 'add', 2)]),
          tier4: tier(3, 'T4 third', controlT4),
          tier5: tier(4, 'T5 third', controlT5),
        },
      },
    },
  };
}

describe('trope intake', () => {
  it('maps evocative names to spines without network calls', () => {
    assert.equal(pickSpine(tropePacketForName('Flame Alchemist')).id, 'element');
    assert.equal(pickSpine(tropePacketForName('Glacier Knight')).id, 'ward');
    assert.equal(pickSpine(tropePacketForName('Cannon Bertha')).id, 'heavy');
    assert.equal(pickSpine(tropePacketForName('Deadeye Dan')).id, 'deadeye');
    assert.equal(pickSpine(tropePacketForName('Storm Witch')).id, 'chain');
    assert.equal(pickSpine(tropePacketForName('Monkey D. Luffy')).id, 'aimed');
    assert.equal(pickSpine(tropePacketForName('Natsu Dragneel (fairytale)')).id, 'element');
    assert.equal(pickSpine(tropePacketForName('Roronoa Zoro (one piece)')).id, 'chain');
    assert.equal(pickSpine(tropePacketForName('Goku (dragon ball)')).id, 'element');
  });

  it('keeps trope quotes verbatim in the source document', async () => {
    const prepared = await prepareSpineRequest('Flame Alchemist');
    const document = prepared.request.documents.find((doc) => doc.id === 'trope-packet');
    assert.ok(document && document.kind === 'source');
    const trope = tropePacketForName('Flame Alchemist');
    for (const line of tropeDocumentText('Flame Alchemist', trope, pickSpine(trope)).split('\n'))
      assert.ok(document.text.includes(line));
    assert.ok(sourceAnchors(prepared.request).length > 0);
  });

  it('ranks technique passages above biography intros for anchors', () => {
    const request = {
      documents: [
        {
          id: 'bio',
          kind: 'source',
          text: 'Mira keeps the old observatory. She was born in a quiet village by the sea.',
        },
        {
          id: 'technique',
          kind: 'source',
          text: 'Prism converts stored light into burning ribbons that damage enemies on contact.',
        },
      ],
    } as unknown as Parameters<typeof sourceAnchors>[0];
    const anchors = sourceAnchors(request, 2);
    assert.ok(
      anchors.some(({ quote }) => quote.includes('burning ribbons')),
      `technique passage missing from ${JSON.stringify(anchors)}`,
    );
  });

  it('keeps anchors short enough for source-fact quotes', () => {
    const request = {
      documents: [
        {
          id: 'inventory',
          kind: 'source',
          text: `Skills attack damage combat power ${'technique power damage attack '.repeat(60)}.`,
        },
      ],
    } as unknown as Parameters<typeof sourceAnchors>[0];
    const anchors = sourceAnchors(request, 6);
    assert.ok(anchors.length > 0);
    for (const { documentId, quote } of anchors) {
      assert.equal(documentId, 'inventory');
      assert.ok(quote.length <= 500, `anchor too long: ${quote.length}`);
    }
  });
});

describe('compact decoding and fun gates', () => {
  it('rejects malformed model output with locations', () => {
    assert.throws(() => decodeCompact({}), /Invalid compact blueprint/);
  });

  it('ships a provider grammar that requires every declared property', () => {
    const missing: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((entry, index) => walk(entry, `${path}[${index}]`));
        return;
      }
      if (!node || typeof node !== 'object') return;
      const record = node as Record<string, unknown>;
      if (record.type === 'object' && record.properties && typeof record.properties === 'object') {
        const keys = Object.keys(record.properties);
        const required = record.required;
        if (!Array.isArray(required) || !keys.every((key) => required.includes(key)))
          missing.push(path);
      }
      for (const banned of ['oneOf', 'discriminator'])
        if (banned in record) missing.push(`${path}:${banned}`);
      for (const [key, value] of Object.entries(record)) walk(value, `${path}.${key}`);
    };
    walk(compactJsonSchema(), 'compact');
    assert.deepEqual(missing, []);
  });

  it('flags duplicate tier 1 purchases and unearned capstones', async () => {
    const prepared = await prepareSpineRequest('Cannon Bertha');
    const spine = pickSpine(tropePacketForName('Cannon Bertha'));
    const compact = validCompact(spine);
    const context = {
      characterName: 'Cannon Bertha',
      facts: sourceAnchors(prepared.request),
      spine,
      constraintIds: [] as string[],
    };
    assert.deepEqual(funIssues(compileCompactToBlueprint(compact, context)), []);
    const duplicate = structuredClone(compact);
    duplicate.paths.path2.tiers.tier1 = structuredClone(duplicate.paths.path1.tiers.tier1);
    duplicate.paths.path2.tiers.tier1.name = 'Renamed duplicate';
    const dupeIssues = funIssues(compileCompactToBlueprint(duplicate, context));
    assert.ok(dupeIssues.some((issue) => issue.includes('tier 1 resolves exactly like')));
    const weak = structuredClone(compact);
    weak.paths.path1.tiers.tier5 = {
      name: 'Renamed capstone',
      cost: spine.paths[0]!.tierCosts[4]!,
      changes: [stat('range', 'add', 50)],
    };
    assert.ok(
      funIssues(compileCompactToBlueprint(weak, context)).some((issue) => issue.includes('tier 5')),
    );
    const fancyBlueprint = compileCompactToBlueprint(compact, context);
    fancyBlueprint.baseAttack.followUp = {
      name: 'Free hit',
      count: 1,
      damageMultiplier: 0.1,
      radius: 0.1,
      inheritStatuses: false,
    };
    assert.ok(
      funIssues(fancyBlueprint).some((issue) => issue.includes('Base attack carries a follow-up')),
    );
  });
});

describe('spine generation', () => {
  for (const name of ['Monkey D. Luffy', 'Flame Alchemist', 'Glacier Knight']) {
    it(`generates a checked unit for ${name}`, async () => {
      const trope = tropePacketForName(name);
      const spine = pickSpine(trope);
      const model = new StubSpineModel([validCompact(spine)]);
      const checked = await generateUnit(name, model);
      assert.equal(checked.kind, 'checked');
      assert.ok(checked.findings.every((finding) => finding.outcome !== 'fail'));
      assert.equal(checked.draft.run.attempts?.length, 1);
      assert.equal(checked.draft.candidate.blueprint?.name, name);
      const blueprint = checked.draft.candidate.blueprint!;
      assert.deepEqual(validateBlueprintRequest(blueprint, checked.draft.prepared.request), []);
      for (const build of allLegalBuilds(checked.draft.prepared.request.mechanicsDefinition))
        resolveBuild(blueprint, build, checked.draft.prepared.request.mechanicsDefinition);
      const maxed = resolveBuild(
        blueprint,
        [5, 2, 0],
        checked.draft.prepared.request.mechanicsDefinition,
      );
      assert.ok(maxed.cumulativeCost > 0 && Number.isFinite(maxed.cumulativeCost));
      const rendered = await checkDraft(checked.draft);
      assert.ok(rendered.findings.length > 0);
    });
  }

  it('repairs a duplicate tier 1 once and records both attempts', async () => {
    const name = 'Cannon Bertha';
    const spine = pickSpine(tropePacketForName(name));
    const broken = validCompact(spine);
    broken.paths.path3.tiers.tier1 = structuredClone(broken.paths.path1.tiers.tier1);
    broken.paths.path3.tiers.tier1.name = 'Renamed duplicate';
    const model = new StubSpineModel([broken, validCompact(spine)]);
    const prepared = await prepareSpineRequest(name);
    const draft = await draftSpineUnit(prepared, model);
    assert.equal(draft.run.attempts?.length, 2);
    assert.equal(draft.run.attempts?.[1]?.purpose, 'repair');
    assert.equal(model.requests.length, 2);
  });

  it('fails after an unrepaired defect without silent substitution', async () => {
    const name = 'Cannon Bertha';
    const spine = pickSpine(tropePacketForName(name));
    const broken = validCompact(spine);
    broken.paths.path3.tiers.tier1 = structuredClone(broken.paths.path1.tiers.tier1);
    const model = new StubSpineModel([broken, broken]);
    const error = await draftSpineUnit(await prepareSpineRequest(name), model, {
      maxRepairAttempts: 1,
    }).then(
      () => null,
      (failure: unknown) => failure,
    );
    assert.ok(error instanceof Error);
    assert.match(String((error as { cause?: unknown }).cause), /tier 1 resolves exactly like/);
  });
});
