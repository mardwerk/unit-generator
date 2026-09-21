import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareRequest } from '../src/core/index.js';
import { pathKeys, tierKeys } from '../src/core/mechanics/schemas.js';
import { authorEvidence } from '../src/core/blueprint/evidence.js';
import { bindDesignPlan, decodeDesignPlan, designPlanRequest } from '../src/core/blueprint/plan.js';
import { designPlanSchema, type UnitDesignPlan } from '../src/core/blueprint/plan-schema.js';
import { miraCandidate, miraRequest } from './fixtures/core-fixtures.js';
import { defaultAuthoringDefinition } from '../src/core/default-profile.js';

function fixture(): UnitDesignPlan {
  const sourceIds = [authorEvidence(miraRequest())[0]!.id];
  const branch = {
    name: 'Spark discipline',
    sourceIds,
    buyFor: 'Hold a narrow lane.',
    weakness: 'Needs a clear firing path.',
    milestones: {
      tier1: 'Stronger Spark.',
      tier2: 'Faster Spark.',
      tier3: 'Concentrate the Spark on durable targets.',
      tier4: 'Sustain the focused attack.',
      tier5: 'Maintain pressure on durable targets through a long firing window.',
    },
    capstoneValue: 'Sustained focused pressure reduces gaps against durable targets.',
    crosspaths: [],
    referenceExample:
      'Crossbow develops a focused weapon; its critical counter is not implemented here.',
  };
  return {
    concept: 'A focused light attacker.',
    signature: { name: 'Spark', sourceIds, adaptation: 'An aimed light projectile.' },
    repertoire: [
      { name: 'Spark', sourceIds, limitation: 'Only this sourced attack is established.' },
    ],
    base: { name: 'Spark', sourceIds, behavior: 'Fire one aimed light projectile.' },
    paths: Object.fromEntries(
      pathKeys.map((key) => [
        key,
        {
          ...structuredClone(branch),
          crosspaths: pathKeys
            .filter((other) => other !== key)
            .map((path) => ({
              path,
              contribution: 'Improve the purchased attack through early upgrades.',
            })),
        },
      ]),
    ) as UnitDesignPlan['paths'],
    omittedTechniques: [
      { name: 'Wall perception', reason: 'The attack contract requires a clear path.' },
    ],
    scopeLimits: ['The supplied repertoire is sparse.'],
    upgradeIntents: Object.fromEntries(
      pathKeys.map((path) => [
        path,
        Object.fromEntries(
          tierKeys.map((tier) => [tier, { improves: ['damage'], unlock: 'none' }]),
        ),
      ]),
    ) as NonNullable<UnitDesignPlan['upgradeIntents']>,
  };
}

test('plans retain complete capstone purpose while allowing sparse sourced repertoires', () => {
  const plan = fixture();
  assert.deepEqual(decodeDesignPlan(plan, miraRequest()), plan);
  plan.paths.path1.capstoneValue = '';
  assert.equal(designPlanSchema.safeParse(plan).success, false);
});

test('planning rejects unknown evidence in every source-backed section and illegal crosspath descriptions', () => {
  for (const section of ['signature', 'base', 'repertoire', ...pathKeys]) {
    const plan = fixture();
    const entry =
      section === 'signature'
        ? plan.signature
        : section === 'base'
          ? plan.base
          : section === 'repertoire'
            ? plan.repertoire[0]!
            : plan.paths[section as (typeof pathKeys)[number]];
    entry.sourceIds = ['invented'];
    assert.throws(() => decodeDesignPlan(plan, miraRequest()), /Unknown character evidence ID/);
  }
  const plan = fixture();
  plan.paths.path1.crosspaths[0]!.path = 'path1';
  assert.throws(() => decodeDesignPlan(plan, miraRequest()), /exactly the other two/);
});

test('planning prompt preserves revision context and supplies complete bounded worked examples', async () => {
  const request = miraRequest();
  request.feedback = 'Keep the signature and make the final upgrade useful against groups.';
  request.constraints = [{ id: 'period', text: 'Use only the early story period.' }];
  request.previous = { resultId: 'previous-result', draft: miraCandidate(), findings: [] };
  const signal = new AbortController().signal;
  const call = designPlanRequest(await prepareRequest(request), signal);
  const context = JSON.parse(call.prompt.split('\n\n').at(-1)!);
  assert.equal(context.feedback, request.feedback);
  assert.deepEqual(context.previous, request.previous!.draft);
  assert.deepEqual(context.constraints, request.constraints);
  assert.equal(call.signal, signal);
  assert.equal(context.workedExamples.length, 3);
  for (const example of context.workedExamples) {
    assert.equal(Object.keys(example.milestones).length, 5);
    assert.ok(example.capstoneValue && example.limitations && example.crosspaths);
  }
  assert.match(call.prompt, /3-3-0 and 3-2-1 are illegal/);
  assert.match(call.prompt, /do not introduce new status, delivery, distribution/);
  assert.match(call.prompt, /unsupported signature elements/);
});

test('historical selected evidence retains its period limitation in the decoded proposal', () => {
  const request = miraRequest();
  request.documents[0]!.id = 'character-technique:spark';
  request.documents[0]!.text =
    'Section: Former techniques\nLink text: Spark\nMira formerly fired Spark at her opponents.';
  const plan = fixture();
  const id = authorEvidence(request)[0]!.id;
  plan.signature.sourceIds = [id];
  plan.base.sourceIds = [id];
  plan.repertoire[0]!.sourceIds = [id];
  for (const path of pathKeys) plan.paths[path].sourceIds = [id];
  const decoded = decodeDesignPlan(plan, request);
  assert.ok(
    decoded.scopeLimits.some((limit) =>
      /Former techniques.*does not establish current availability/.test(limit),
    ),
  );
});

test('binding retains mechanics and missing structural fields for ordinary validation', () => {
  const plan = fixture();
  const input = {
    baseAttack: { name: 'Generic', stats: { damage: 2 } },
    paths: { path1: { name: 'Generic', tiers: { tier1: { cost: 4 } } } },
  };
  const bound = bindDesignPlan(input, plan) as typeof input;
  assert.equal(bound.baseAttack.name, 'Spark');
  assert.deepEqual(bound.baseAttack.stats, input.baseAttack.stats);
  assert.deepEqual(bound.paths.path1.tiers, input.paths.path1.tiers);
  assert.equal(input.baseAttack.name, 'Generic');
  assert.equal(Object.hasOwn(bound.paths, 'path2'), false);
  assert.equal(bindDesignPlan(null, plan), null);
});

test('every planning citation field uses the supplied evidence ID enum without changing retained schema', async () => {
  const request = miraRequest();
  const prepared = await prepareRequest(request);
  const call = designPlanRequest(prepared);
  const ids = authorEvidence(prepared.request).map(({ id }) => id);
  let citationFields = 0;
  function inspect(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'sourceIds') {
        const field = child as {
          items: { type: string; enum: string[] };
          minItems?: number;
          maxItems?: number;
        };
        assert.equal(field.items.type, 'string');
        assert.deepEqual(field.items.enum, ids);
        assert.equal(field.minItems, undefined);
        assert.equal(field.maxItems, undefined);
        citationFields++;
      } else inspect(child);
    }
  }
  inspect(call.schema);
  const grammar = JSON.stringify(call.schema);
  assert.equal(grammar.includes('"minLength"'), false);
  assert.equal(grammar.includes('"maxLength"'), false);
  assert.equal(grammar.includes('"pattern"'), false);
  assert.equal(citationFields, 6);
  assert.ok(
    call.prompt.startsWith(`Requested character: ${JSON.stringify(request.character.name)}.`),
  );
  assert.ok(call.prompt.includes(`${ids.length} selected evidence passages`));
  assert.match(call.prompt, /limitation or refusal in scopeLimits/);
  const unknown = fixture();
  unknown.signature.sourceIds = ['missing-evidence'];
  assert.equal(designPlanSchema.safeParse(unknown).success, true);
  assert.throws(() => decodeDesignPlan(unknown, prepared.request), /Unknown character evidence ID/);
  const other = miraRequest();
  other.documents[0]!.text = 'Her one documented attack fires a spark at a visible target.';
  const next = designPlanRequest(await prepareRequest(other));
  assert.notDeepEqual(next.schema, call.schema);
});

test('new authoring rejects placeholder descriptions while retained historical plans stay readable', () => {
  for (const placeholder of [':0', ',', '12345', '!!!', 'a']) {
    const plan = fixture();
    plan.paths.path1.milestones.tier1 = placeholder;
    assert.equal(designPlanSchema.safeParse(plan).success, true);
    assert.throws(
      () => decodeDesignPlan(plan, miraRequest()),
      /in words, not punctuation or numeric placeholders/,
    );
  }
  const plan = fixture();
  plan.paths.path1.capstoneValue = ':0';
  assert.throws(
    () => decodeDesignPlan(plan, miraRequest()),
    /in words, not punctuation or numeric placeholders/,
  );
  plan.paths.path1.capstoneValue = '持続的な火力を高める。';
  plan.paths.path1.milestones.tier1 = '攻击速度提高。';
  plan.paths.path1.milestones.tier2 = 'Усилить атаку.';
  assert.deepEqual(decodeDesignPlan(plan, miraRequest()), plan);
});

test('compact provider grammar retains all local plan lengths, array bounds and citation joins', () => {
  const request = miraRequest();
  const changes: ((plan: UnitDesignPlan) => void)[] = [
    (plan) => {
      plan.concept = 'Long '.repeat(161);
    },
    (plan) => {
      plan.base.name = 'Long '.repeat(17);
    },
    (plan) => {
      plan.base.sourceIds = [];
    },
    (plan) => {
      plan.base.sourceIds = Array(3).fill(plan.base.sourceIds[0]);
    },
    (plan) => {
      plan.base.sourceIds = ['invented'];
    },
    (plan) => {
      plan.repertoire = Array(9).fill(plan.repertoire[0]);
    },
    (plan) => {
      plan.paths.path1.crosspaths = [];
    },
    (plan) => {
      plan.scopeLimits = Array(25).fill('A supported scope limitation.');
    },
    (plan) => {
      plan.upgradeIntents!.path1.tier1.improves = Array(5).fill('damage');
    },
  ];
  for (const change of changes) {
    const plan = fixture();
    change(plan);
    assert.throws(() => decodeDesignPlan(plan, request));
  }
  assert.deepEqual(decodeDesignPlan(fixture(), request), fixture());
});

test('complete long explanations remain in the plan while binding a complete bounded rationale', () => {
  const plan = fixture();
  const branch = plan.paths.path1;
  branch.weakness =
    'The focused attack needs uninterrupted sight of its selected target and cannot reach enemies behind cover, so placement and nearby support still determine whether the purchased upgrades can contribute throughout a wave.';
  branch.capstoneValue =
    'The final upgrade extends the established focused attack over a longer engagement, helping the player maintain pressure on durable targets without repeatedly losing damage while the attack recovers between useful firing windows.';
  assert.ok(branch.weakness.length > 149 && branch.capstoneValue.length > 150);
  assert.ok(`${branch.weakness} ${branch.capstoneValue}`.length > 300);
  const decoded = decodeDesignPlan(plan, miraRequest());
  assert.deepEqual(decoded, plan);
  const wire = { paths: { path1: { rationale: 'Temporary mechanics explanation.' } } };
  const bound = bindDesignPlan(wire, decoded) as typeof wire;
  assert.equal(bound.paths.path1.rationale, branch.buyFor);
  assert.ok(bound.paths.path1.rationale.length <= 300);
  assert.equal(decoded.paths.path1.weakness, branch.weakness);
  assert.equal(decoded.paths.path1.capstoneValue, branch.capstoneValue);
  assert.equal(wire.paths.path1.rationale, 'Temporary mechanics explanation.');
});

test('fresh plans require explicit supported tier intents while old retained plans remain parseable', () => {
  const old = fixture();
  delete old.upgradeIntents;
  assert.equal(designPlanSchema.safeParse(old).success, true);
  assert.throws(() => decodeDesignPlan(old, miraRequest()), /upgradeIntents/);
  const plan = fixture();
  plan.upgradeIntents!.path1.tier3 = { improves: [], unlock: 'delivery-change' };
  assert.deepEqual(decodeDesignPlan(plan, miraRequest()), plan);
  plan.upgradeIntents!.path1.tier3 = { improves: [], unlock: 'none' };
  assert.throws(() => decodeDesignPlan(plan, miraRequest()), /at least one supported improvement/);
});

test('planning distinguishes omitted technique aspects and source-period exceptions', async () => {
  const call = designPlanRequest(await prepareRequest(miraRequest()));
  assert.match(call.prompt, /unsupported aspect from an entire technique/);
  assert.match(call.prompt, /later period removing an earlier drawback/);
  assert.match(call.prompt, /unsupported wishes remain explicit omissions/);
  const schema = call.schema as { required: string[] };
  assert.ok(schema.required.includes('upgradeIntents'));
});

test('unsupported extension and premature active intents are corrected before mechanics authoring', () => {
  const input = miraRequest();
  for (const [unlock, message] of [
    ['manual-boost', /only at tier 4/],
    ['active-follow-up', /tier 4 or later/],
    ['distinct-volley', /does not enable distinct-volley/],
    ['follow-up', /does not enable volley-follow-up/],
  ] as const) {
    const plan = fixture();
    plan.upgradeIntents!.path1.tier2 = { improves: [], unlock };
    assert.throws(() => decodeDesignPlan(plan, input), message);
  }
});

test('active improvement intents respect the supplied manual path and earliest boost tier', () => {
  const input = miraRequest();
  input.mechanicsDefinition = structuredClone(defaultAuthoringDefinition);
  for (const intent of [
    { improves: ['active-damage'] as const, unlock: 'none' as const },
    { improves: [] as const, unlock: 'active-follow-up' as const },
    { improves: [] as const, unlock: 'manual-boost' as const },
  ]) {
    const plan = fixture();
    plan.upgradeIntents!.path3.tier4 = { improves: [...intent.improves], unlock: intent.unlock };
    assert.throws(() => decodeDesignPlan(plan, input), /only on path2/);
    // A custom Definition can authorize another path; the check is not hardcoded.
    input.mechanicsDefinition.profile.designPolicy!.manualAbilityPath = 'path3';
    assert.deepEqual(decodeDesignPlan(plan, input), plan);
    input.mechanicsDefinition.profile.designPolicy!.manualAbilityPath = 'path2';
  }
  const plan = fixture();
  plan.upgradeIntents!.path2.tier3 = {
    improves: ['active-damage', 'active-attack-rate', 'active-duration'],
    unlock: 'none',
  };
  plan.upgradeIntents!.path2.tier4 = { improves: [], unlock: 'manual-boost' };
  assert.throws(
    () => decodeDesignPlan(plan, input),
    /Active improvements require.*tier 4 or later/,
  );
});

test('manual ability count and prohibition apply even when only active improvement intents reveal the need', () => {
  const input = miraRequest();
  input.mechanicsDefinition = structuredClone(defaultAuthoringDefinition);
  const policy = input.mechanicsDefinition.profile.designPolicy!;
  delete policy.manualAbilityPath;
  const plan = fixture();
  for (const path of ['path1', 'path2'] as const)
    plan.upgradeIntents![path].tier5 = { improves: ['active-damage'], unlock: 'none' };
  assert.throws(() => decodeDesignPlan(plan, input), /active boosts on 2 paths.*at most 1/);
  policy.maxManualAbilityPaths = 2;
  assert.deepEqual(decodeDesignPlan(plan, input), plan);
  policy.manualAbilityPath = null;
  assert.throws(() => decodeDesignPlan(plan, input), /does not permit manual boosts/);
});

test('early identity checks reject explicit new capabilities but allow existing-effect improvements and detection', () => {
  const input = miraRequest();
  input.mechanicsDefinition = structuredClone(defaultAuthoringDefinition);
  for (const unlock of [
    'slow',
    'burn',
    'stun',
    'splash',
    'follow-up',
    'distinct-volley',
    'delivery-change',
    'damage-type-change',
    'targeting-change',
  ] as const) {
    const plan = fixture();
    plan.upgradeIntents!.path3.tier2 = { improves: [], unlock };
    assert.throws(() => decodeDesignPlan(plan, input), /T1 and T2 must preserve/);
    input.mechanicsDefinition.profile.designPolicy!.preserveEarlyAttackIdentity = false;
    assert.deepEqual(decodeDesignPlan(plan, input), plan);
    input.mechanicsDefinition.profile.designPolicy!.preserveEarlyAttackIdentity = true;
  }
  // The qualitative plan has no typed base stats: these may improve existing effects.
  // Actual mechanics validation determines whether the base already owns them.
  for (const dimension of ['slow', 'burn', 'stun', 'splash', 'projectiles'] as const) {
    const plan = fixture();
    plan.upgradeIntents!.path3.tier2 = { improves: [dimension], unlock: 'camo' };
    assert.deepEqual(decodeDesignPlan(plan, input), plan);
  }
});
