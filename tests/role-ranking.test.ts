import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  rankUnitRoles,
  roleCriteria,
  roleBuildIds,
  unitRoles,
  type RoleRankingClient,
  type RoleBuildDescription,
  type RoleAnswer,
} from '../src/core/roles.js';
import { createRoleRankingClient } from '../src/node/role-ranking.js';
import {
  defaultMechanicsDefinition,
  pathKeys,
  tierKeys,
  type UnitBlueprint,
} from '../src/core/mechanics/index.js';
import { miraCandidate } from './fixtures/core-fixtures.js';
import { roleRows } from '../src/presentation/roles.js';

function candidate() {
  const unit = miraCandidate();
  const paths = {} as UnitBlueprint['paths'];
  for (const [index, key] of pathKeys.entries()) {
    const tiers = {} as UnitBlueprint['paths']['path1']['tiers'];
    for (const tier of tierKeys)
      tiers[tier] = {
        name: 'UNSUPPORTED summon',
        cost: 100,
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
    paths[key] = {
      name: 'UNSUPPORTED economy',
      theme: 'UNSUPPORTED support',
      rationale: 'UNSUPPORTED status',
      sourceFactIndices: [0],
      tiers,
    };
  }
  unit.blueprint = {
    name: 'UNSUPPORTED Tank',
    role: 'UNSUPPORTED summoner',
    weakness: 'UNSUPPORTED',
    sourceFacts: [{ documentId: 'E1', quote: 'UNSUPPORTED future powers' }],
    constraintCoverage: [],
    baseAttack: {
      name: 'UNSUPPORTED freeze',
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
    proposals: [{ name: 'UNSUPPORTED summoning', reason: 'UNSUPPORTED' }],
    reservedTechniques: [{ name: 'UNSUPPORTED economy', reason: 'UNSUPPORTED' }],
  };
  return unit;
}
const answer: RoleAnswer = {
  role: 'basic_dps',
  confidence: 0.8,
  probabilities: Object.fromEntries(
    unitRoles.map((role) => [role, role === 'basic_dps' ? 1 : 0]),
  ) as RoleAnswer['probabilities'],
};
function answers() {
  return Object.fromEntries(roleBuildIds.map((id) => [id, structuredClone(answer)])) as Record<
    (typeof roleBuildIds)[number],
    RoleAnswer
  >;
}
const descriptions: RoleBuildDescription[] = roleBuildIds.map((id) => ({
  id,
  selection: [0, 0, 0],
  description: 'Mechanical attack.',
}));
function typesafeResponse() {
  return {
    model: 'jev-1.13.0',
    answers: Object.fromEntries(
      roleBuildIds.map((id) => [
        id,
        {
          type: 'choice',
          choice: answer.role,
          confidence: answer.confidence,
          probabilities: answer.probabilities,
        },
      ]),
    ),
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}

test('role catalogue matches the ten documented build categories', async () => {
  const catalogue = JSON.parse(
    await readFile('research/btd6/btd6-reference-candidates.json', 'utf8'),
  );
  assert.deepEqual(roleCriteria, catalogue.roleQuestion.criteria);
});

test('ranking describes four independently resolved builds without narrative or proposal leakage', async () => {
  const unit = candidate();
  const before = structuredClone(unit);
  const client: RoleRankingClient = {
    id: 'fixture:jev',
    async rank(builds) {
      assert.deepEqual(
        builds.map((build) => build.selection),
        [
          [0, 0, 0],
          [5, 0, 0],
          [0, 5, 0],
          [0, 0, 5],
        ],
      );
      assert.doesNotMatch(JSON.stringify(builds), /UNSUPPORTED/);
      const values = builds.map((build) => JSON.parse(build.description));
      assert.deepEqual(
        values.map((v) => [
          v.baseAttack.stats.damage,
          v.baseAttack.stats.range,
          v.baseAttack.stats.pierce,
        ]),
        [
          [10, 20, 1],
          [15, 20, 1],
          [10, 25, 1],
          [10, 20, 6],
        ],
      );
      assert.equal(values[0].rules.detection, 'camo-is-target-access-only');
      assert.deepEqual(
        values[0].referenceScale,
        defaultMechanicsDefinition.profile.referenceScale ?? null,
      );
      return { answers: answers() };
    },
  };
  const result = await rankUnitRoles(unit, defaultMechanicsDefinition, client);
  assert.equal(result.status, 'completed');
  assert.equal(result.builds.length, 4);
  assert.equal(result.provider, 'fixture:jev');
  assert.ok(roleRows(result, unit).every((row) => row.role === 'Generalist damage'));
  assert.ok(result.builds.every((build) => build.role === 'basic_dps'));
  assert.deepEqual(unit, before);
});

test('unconfigured and blueprint-free ranking is skipped; provider errors are safe and nonfatal', async () => {
  assert.equal((await rankUnitRoles(candidate(), defaultMechanicsDefinition)).status, 'skipped');
  const failing: RoleRankingClient = {
    id: 'fixture:jev',
    async rank() {
      throw new Error('PRIVATE_KEY');
    },
  };
  assert.equal(
    (await rankUnitRoles(miraCandidate(), defaultMechanicsDefinition, failing)).status,
    'skipped',
  );
  const unavailable = await rankUnitRoles(candidate(), defaultMechanicsDefinition, failing);
  assert.equal(unavailable.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(unavailable), /PRIVATE_KEY/);
  const invalid = candidate();
  invalid.blueprint!.baseAttack.stats.damage = -1;
  assert.equal(
    (
      await rankUnitRoles(invalid, defaultMechanicsDefinition, {
        id: 'test',
        async rank() {
          assert.fail('Invalid mechanics must not reach classifier');
        },
      })
    ).status,
    'unavailable',
  );
});

test('role answers reject nonfinite confidence, bad distributions, missing builds and contradictory choices', async () => {
  for (const mutate of [
    (a: ReturnType<typeof answers>) => {
      a.base.confidence = NaN;
    },
    (a: ReturnType<typeof answers>) => {
      a.base.probabilities.basic_dps = Infinity;
    },
    (a: ReturnType<typeof answers>) => {
      a.base.probabilities.basic_dps = 0.4;
    },
    (a: ReturnType<typeof answers>) => {
      a.base.role = 'sniper';
    },
    (a: ReturnType<typeof answers>) => {
      Reflect.deleteProperty(a, 'path3');
    },
  ]) {
    const response = answers();
    mutate(response);
    assert.equal(
      (
        await rankUnitRoles(candidate(), defaultMechanicsDefinition, {
          id: 'test',
          async rank() {
            return { answers: response };
          },
        })
      ).status,
      'unavailable',
    );
  }
});

test('provider selection never invents OpenRouter JEV availability or falls back to another model', async () => {
  for (const env of [
    {},
    { UNIT_ROLE_PROVIDER: 'off', TYPESAFE_API_KEY: 'private' },
    { UNIT_ROLE_PROVIDER: 'typesafe' },
    { UNIT_ROLE_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'private' },
    { OPENROUTER_API_KEY: 'private', OPENROUTER_MODEL: 'openrouter/free' },
  ])
    assert.equal(createRoleRankingClient({ env }), undefined);
  const client = createRoleRankingClient({
    env: {
      TYPESAFE_API_KEY: 'private',
      OPENROUTER_API_KEY: 'other',
      OPENROUTER_JEV_MODEL: 'typesafe/jev-1.13',
    },
  });
  assert.equal(client?.id, 'typesafe:jev-1.13.0');
  const invalid = createRoleRankingClient({
    env: {
      UNIT_ROLE_PROVIDER: 'openrouter',
      OPENROUTER_API_KEY: 'private',
      OPENROUTER_JEV_MODEL: 'openrouter/free',
    },
  })!;
  assert.equal(
    (await rankUnitRoles(candidate(), defaultMechanicsDefinition, invalid)).status,
    'unavailable',
  );
});

test('Typesafe uses documented System One questions and retains usage separately from cost estimate', async () => {
  let calls = 0;
  const client = createRoleRankingClient({
    env: { TYPESAFE_API_KEY: 'private' },
    fetch: async (input, init) => {
      calls++;
      assert.equal(String(input), 'https://api.typesafe.ai/v1/systemone');
      assert.equal(init?.redirect, 'error');
      assert.ok(init?.signal);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'jev-1.13.0');
      assert.deepEqual(Object.keys(body.questions), roleBuildIds);
      assert.deepEqual(body.questions.base.criteria, roleCriteria);
      assert.equal(body.state.builds.length, 4);
      return Response.json(typesafeResponse());
    },
  })!;
  const result = await rankUnitRoles(candidate(), defaultMechanicsDefinition, client);
  assert.equal(calls, 1);
  assert.equal(result.status, 'completed');
  assert.equal(result.usage?.costUsd, null);
  assert.equal(result.usage?.totalTokens, 120);
  assert.ok(Math.abs(result.estimatedCostUsd! - 0.0000042) < 1e-12);
  assert.doesNotMatch(JSON.stringify(result), /private/);
});

test('Typesafe HTTP, malformed and mismatched-model responses remain sanitized without retries', async () => {
  for (const response of [
    new Response('PRIVATE', { status: 401 }),
    new Response('PRIVATE', { status: 429 }),
    new Response('PRIVATE', { status: 529 }),
    Response.json({ ...typesafeResponse(), model: 'OTHER' }),
    Response.json({ ...typesafeResponse(), answers: {} }),
    new Response('PRIVATE'),
  ]) {
    let calls = 0;
    const client = createRoleRankingClient({
      env: { TYPESAFE_API_KEY: 'private' },
      fetch: async () => {
        calls++;
        return response;
      },
    })!;
    const result = await rankUnitRoles(candidate(), defaultMechanicsDefinition, client);
    assert.equal(result.status, 'unavailable');
    assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE|private/);
  }
});

test('OpenRouter uses Decisions for the latest alias and direct JEV IDs without fallback', async () => {
  for (const model of ['~typesafe/jev-latest', 'typesafe/jev-1.13', 'typesafe/jev-1.13-20260917']) {
    let calls = 0;
    const client = createRoleRankingClient({
      env: {
        UNIT_ROLE_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: 'private',
        OPENROUTER_JEV_MODEL: model,
      },
      fetch: async (input, init) => {
        calls++;
        assert.equal(String(input), 'https://openrouter.ai/api/alpha/decisions');
        assert.equal(init?.redirect, 'error');
        const body = JSON.parse(String(init?.body));
        assert.equal(body.model, model);
        assert.deepEqual(body.provider, { allow_fallbacks: false });
        assert.equal(body.messages, undefined);
        assert.deepEqual(body.questions.base.criteria, roleCriteria);
        assert.equal(body.state.builds.length, 4);
        return Response.json({
          ...typesafeResponse(),
          model: 'typesafe/jev-1.13-20260917',
          id: 'gen-dec-test',
          provider: 'TypeSafe',
          usage: { input_tokens: 30, output_tokens: 10, cost: 0.001 },
        });
      },
    })!;
    const result = await rankUnitRoles(candidate(), defaultMechanicsDefinition, client);
    assert.equal(result.status, 'completed');
    assert.equal(result.usage?.costUsd, 0.001);
    assert.equal(result.usage?.actualModel, 'typesafe/jev-1.13-20260917');
    assert.equal(result.usage?.generationId, 'gen-dec-test');
    assert.equal(result.estimatedCostUsd, undefined);
    assert.equal(calls, 1);
  }
});

test('OpenRouter unavailable or mismatched JEV does not fall back to Typesafe or another model', async () => {
  for (const response of [
    Response.json({ error: { code: 404, message: 'PRIVATE' } }, { status: 404 }),
    Response.json({ ...typesafeResponse(), model: 'other/model' }),
    Response.json({ ...typesafeResponse(), model: 'typesafe/jev-1.14-20260918' }),
  ]) {
    let calls = 0;
    const client = createRoleRankingClient({
      env: {
        UNIT_ROLE_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: 'private',
        OPENROUTER_JEV_MODEL: 'typesafe/jev-1.13',
        TYPESAFE_API_KEY: 'other',
      },
      fetch: async () => {
        calls++;
        return response;
      },
    })!;
    const result = await rankUnitRoles(candidate(), defaultMechanicsDefinition, client);
    assert.equal(result.status, 'unavailable');
    assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  }
});

test('cancellation propagates through core and Typesafe transport', async () => {
  await assert.rejects(
    rankUnitRoles(candidate(), defaultMechanicsDefinition, undefined, AbortSignal.abort()),
    { name: 'AbortError' },
  );
  const controller = new AbortController();
  const client = createRoleRankingClient({
    env: { TYPESAFE_API_KEY: 'private' },
    fetch: async (_input, init) => {
      assert.ok(init?.signal);
      controller.abort();
      assert.equal(init.signal.aborted, true);
      throw new Error('PRIVATE');
    },
  })!;
  await assert.rejects(
    rankUnitRoles(candidate(), defaultMechanicsDefinition, client, controller.signal),
    { name: 'AbortError' },
  );
  const fake: RoleRankingClient = {
    id: 'test',
    async rank() {
      controller.abort();
      return { answers: answers() };
    },
  };
  await assert.rejects(
    rankUnitRoles(candidate(), defaultMechanicsDefinition, fake, controller.signal),
    { name: 'AbortError' },
  );
  await assert.rejects(client.rank(descriptions, AbortSignal.abort()), { name: 'AbortError' });
});

test('artifact schema rejects duplicate, missing, wrong-selection and incomplete build answers', async () => {
  const { unitRoleRankingSchema } = await import('../src/core/roles.js');
  const completed = await rankUnitRoles(candidate(), defaultMechanicsDefinition, {
    id: 'test',
    async rank() {
      return { answers: answers() };
    },
  });
  assert.equal(unitRoleRankingSchema.safeParse(completed).success, true);
  for (const change of [
    { ...completed, builds: completed.builds.slice(0, 3) },
    {
      ...completed,
      builds: [completed.builds[0], completed.builds[0], ...completed.builds.slice(2)],
    },
    { ...completed, builds: completed.builds.map((build) => ({ ...build, selection: [0, 0, 0] })) },
    { ...completed, status: 'unavailable' },
    { ...completed, status: 'skipped' },
  ])
    assert.equal(unitRoleRankingSchema.safeParse(change).success, false);
});

test('OpenRouter billed failures and invalid decisions retain usage without raw errors', async () => {
  for (const failure of ['http', 'envelope', 'answers']) {
    const client = createRoleRankingClient({
      env: {
        UNIT_ROLE_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: 'PRIVATE_KEY',
        OPENROUTER_JEV_MODEL: '~typesafe/jev-latest',
      },
      fetch: async () =>
        Response.json(
          {
            ...typesafeResponse(),
            model: 'typesafe/jev-1.13-20260917',
            ...(failure !== 'answers'
              ? { error: { code: 502, message: 'PRIVATE_REMOTE' } }
              : { answers: {} }),
            usage: { input_tokens: 30, output_tokens: 10, cost: 0.002 },
          },
          { status: failure === 'http' ? 502 : 200 },
        ),
    })!;
    const result = await rankUnitRoles(candidate(), defaultMechanicsDefinition, client);
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.builds, []);
    assert.equal(result.usage?.costUsd, 0.002);
    assert.equal(result.usage?.totalTokens, 40);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  }
});

test('Typesafe invalid answers retain validated usage and separate estimates', async () => {
  const client = createRoleRankingClient({
    env: { TYPESAFE_API_KEY: 'PRIVATE_KEY' },
    fetch: async () =>
      Response.json({ ...typesafeResponse(), answers: { PRIVATE: 'PRIVATE_REMOTE' } }),
  })!;
  const result = await rankUnitRoles(candidate(), defaultMechanicsDefinition, client);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.usage?.totalTokens, 120);
  assert.equal(result.usage?.costUsd, null);
  assert.ok(Math.abs(result.estimatedCostUsd! - 0.0000042) < 1e-12);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  const { RoleRankingError } = await import('../src/core/roles.js');
  const bad = new RoleRankingError({ ...result.usage, costUsd: Infinity }, NaN);
  assert.equal(bad.usage, undefined);
  assert.equal(bad.estimatedCostUsd, undefined);
  assert.equal(bad.cause, undefined);
});
