import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import {
  authorUnit,
  checkDraft,
  draftUnit,
  prepareRequest,
  reviewDraft,
  requestSchema,
  candidateSchema,
  type AuthorRequest,
  type UnitCandidate,
} from '../src/core/index.js';
import { FakeModel, miraCandidate, miraRequest, miraReview } from './fixtures/core-fixtures.js';
async function checked(
  candidate: UnitCandidate = miraCandidate(),
  request: AuthorRequest = miraRequest(),
) {
  return checkDraft(await draftUnit(await prepareRequest(request), new FakeModel([candidate])));
}
test(
  'prepared inputs preserve exact source text, are isolated and frozen, and detect ' +
    'edited provenance',
  async () => {
    const request = miraRequest();
    request.documents[0]!.text = '  Supplied evidence.\n';
    const prepared = await prepareRequest(request);
    request.documents[0]!.text = 'Later edit';
    assert.equal(prepared.request.documents[0]!.text, '  Supplied evidence.\n');
    assert.ok(Object.isFrozen(prepared.request.documents[0]!.origin));
    const repeat = await prepareRequest({
      ...request,
      documents: [
        {
          ...request.documents[0]!,
          text: '  Supplied evidence.\n',
        },
        ...request.documents.slice(1),
      ],
    });
    assert.equal(repeat.inputHash, prepared.inputHash);
    const edited = structuredClone(prepared);
    edited.request.documents[0]!.text = 'Changed after hashing';
    await assert.rejects(draftUnit(edited, new FakeModel()), /hash does not match/);
  },
);
test(
  'input validation rejects character-only evidence, duplicate IDs, contradictory ' +
    'progression and unknown schema versions',
  async () => {
    const request = miraRequest();
    await assert.rejects(
      prepareRequest({
        ...request,
        documents: request.documents.filter((document) => document.kind !== 'source'),
      }),
      /source document/,
    );
    await assert.rejects(
      prepareRequest({
        ...request,
        documents: [...request.documents, request.documents[0]],
      }),
      /unique/,
    );
    await assert.rejects(
      prepareRequest({
        ...request,
        schemaVersion: '2',
      }),
    );
    await assert.rejects(
      prepareRequest({
        ...request,
        progression: {
          ...request.progression,
          allowedTierCombinations: [[3, 3, 0]],
        },
      }),
      /contradicts/,
    );
  },
);
test('staged and combined operations produce the same candidate, provenance and findings', async () => {
  const combinedClient = new FakeModel();
  const combined = await authorUnit(miraRequest(), combinedClient);
  const stagedClient = new FakeModel();
  const prepared = await prepareRequest(miraRequest());
  const draft = await draftUnit(prepared, stagedClient);
  const checks = await checkDraft(JSON.parse(JSON.stringify(draft)));
  const staged = await reviewDraft(JSON.parse(JSON.stringify(checks)), stagedClient);
  assert.deepEqual(staged.prepared, combined.prepared);
  assert.deepEqual(staged.candidate, combined.candidate);
  assert.deepEqual(staged.findings, combined.findings);
  assert.equal(staged.reviewSummary, combined.reviewSummary);
  assert.equal(stagedClient.requests.length, 2);
  assert.match(stagedClient.requests[1]!.system, /fresh reviewer/);
  assert.ok(staged.findings.some((finding) => finding.method === 'model'));
  assert.ok(
    staged.findings.some(
      (finding) => finding.rule === 'declared-mechanic-support' && finding.outcome === 'unresolved',
    ),
  );
  assert.ok(
    staged.findings.some(
      (finding) => finding.rule === 'validation-scope' && finding.outcome === 'not_checked',
    ),
  );
  assert.equal(staged.run.draft.modelId, 'test/fake');
});
test('Mira progression independently accepts 2-2-0 and rejects 3-3-0 and 2-2-1', async () => {
  const candidate = miraCandidate();
  for (const tiers of [
    [3, 3, 0],
    [2, 2, 1],
  ]) {
    candidate.representativeBuilds.push({
      name: tiers.join('-'),
      selections: candidate.paths.map((path, index) => ({
        pathId: path.id,
        tier: tiers[index]!,
      })),
      rationale: 'Deliberately invalid selection.',
    });
  }
  const artifact = await checked(candidate);
  const builds = artifact.findings.filter(
    (finding) => finding.rule === 'representative-build-legality',
  );
  assert.deepEqual(
    builds.map((finding) => [finding.subject, finding.outcome]),
    [
      ['build.2-2-0', 'pass'],
      ['build.3-3-0', 'fail'],
      ['build.2-2-1', 'fail'],
    ],
  );
});
test('caller-specific progression supports one path and explicit combination and total limits', async () => {
  const request = miraRequest();
  request.progression = {
    paths: [
      {
        id: 'focus',
        tiers: [1, 2],
      },
    ],
    maxActivePaths: 1,
    maxPathsAboveTier: null,
    maxTotalTiers: 2,
    allowedTierCombinations: [[0], [2]],
  };
  const candidate = miraCandidate();
  candidate.paths = [
    {
      ...candidate.paths[0]!,
      id: 'focus',
      tiers: candidate.paths[0]!.tiers.slice(0, 2),
    },
  ];
  candidate.abilities = [];
  candidate.representativeBuilds = [0, 1, 2, 3].map((tier) => ({
    name: String(tier),
    selections: [
      {
        pathId: 'focus',
        tier,
      },
    ],
    rationale: 'Caller-specific progression fixture.',
  }));
  const artifact = await checked(candidate, request);
  assert.deepEqual(
    artifact.findings
      .filter((finding) => finding.rule === 'representative-build-legality')
      .map((finding) => finding.outcome),
    ['pass', 'fail', 'pass', 'fail'],
  );
  assert.ok(
    artifact.findings.some(
      (finding) => finding.rule === 'declared-path-tier-coverage' && finding.outcome === 'pass',
    ),
  );
});
test('missing progression is an explicit unexecuted check, not an inherited game default', async () => {
  const request = miraRequest();
  request.progression = null;
  const artifact = await checked(miraCandidate(), request);
  assert.ok(
    artifact.findings.some(
      (finding) => finding.rule === 'declared-progression' && finding.outcome === 'not_checked',
    ),
  );
  assert.equal(
    artifact.findings.filter((finding) => finding.rule === 'representative-build-legality').length,
    0,
  );
});
test(
  'checks report missing tiers, unknown references, unsupported mechanics and ' +
    'uncovered constraints',
  async () => {
    const candidate = miraCandidate();
    candidate.paths[0]!.tiers.pop();
    candidate.basicAttack.evidence.push('invented-source');
    candidate.basicAttack.mechanicIds.push('absent-mechanic');
    candidate.mechanics[0]!.status = 'unsupported';
    candidate.constraintCoverage = [];
    candidate.abilities[0]!.decisionRefs = [];
    const findings = (await checked(candidate)).findings;
    for (const rule of [
      'declared-path-tier-coverage',
      'known-document-reference',
      'mechanic-dependency',
      'declared-constraint-coverage',
      'confirmed-decision-reference',
    ]) {
      assert.ok(
        findings.some((finding) => finding.rule === rule && finding.outcome === 'fail'),
        rule,
      );
    }
    assert.ok(
      findings.some(
        (finding) => finding.category === 'unsupported' && finding.outcome === 'unresolved',
      ),
    );
  },
);
test('checks reveal cycles and conditional ability prerequisites in representative builds', async () => {
  const candidate = miraCandidate();
  candidate.mechanics[0]!.dependencies = ['wall-detection'];
  candidate.mechanics[1]!.dependencies = ['projectile'];
  candidate.abilities.push({
    ...candidate.abilities[0]!,
    id: 'late-form',
    pathId: 'offense',
    tier: 5,
    prerequisiteAbilityIds: [],
  });
  candidate.paths[0]!.tiers[4]!.abilityIds = ['late-form'];
  candidate.abilities[0]!.prerequisiteAbilityIds = ['late-form'];
  const findings = (await checked(candidate)).findings;
  assert.ok(
    findings.some(
      (finding) => finding.rule === 'acyclic-dependencies' && finding.outcome === 'fail',
    ),
  );
  assert.ok(
    findings.some(
      (finding) =>
        finding.rule === 'build-ability-prerequisite' && finding.outcome === 'unresolved',
    ),
  );
});
test('shared purchase unlocks remain conditional and are not falsely treated as innate or a path tier', async () => {
  const candidate = miraCandidate();
  candidate.abilities.push({
    ...candidate.abilities[0]!,
    id: 'shared-form',
    name: 'Shared form',
    placement: 'conditional',
    pathId: null,
    tier: null,
    availability:
      'Unlocks after three total purchases across paths. Activation readiness is unspecified.',
    prerequisiteAbilityIds: [],
  });
  candidate.abilities[0]!.prerequisiteAbilityIds = ['shared-form'];
  const artifact = await checked(candidate);
  assert.ok(
    artifact.findings.some(
      (finding) =>
        finding.rule === 'conditional-ability-availability' && finding.outcome === 'not_checked',
    ),
  );
  const prerequisites = artifact.findings.filter(
    (finding) => finding.rule === 'build-ability-prerequisite',
  );
  assert.ok(prerequisites.length > 0);
  for (const finding of prerequisites) {
    assert.equal(finding.outcome, 'unresolved');
    assert.match(
      finding.message,
      /availability of conditional prerequisite shared-form cannot be determined/,
    );
    assert.doesNotMatch(finding.message, /without prerequisite/);
  }
  assert.equal(
    artifact.findings.some(
      (finding) =>
        finding.rule === 'ability-assignment' && finding.subject === 'ability.shared-form',
    ),
    false,
  );
});
test('semantic wall-delivery conflict is model review and never inferred from a legal build', async () => {
  const candidate = miraCandidate();
  candidate.basicAttack.delivery =
    'Spark travels through walls when personal detection is unlocked.';
  const review = miraReview();
  review.findings[0] = {
    ...review.findings[0]!,
    category: 'conflict',
    outcome: 'fail',
    severity: 'error',
    message: 'Wall perception cannot grant projectile delivery through walls.',
    action: 'Restore the clear projectile path requirement.',
  };
  const result = await authorUnit(miraRequest(), new FakeModel([candidate, review]));
  assert.ok(
    result.findings.some(
      (finding) => finding.rule === 'representative-build-legality' && finding.outcome === 'pass',
    ),
  );
  assert.ok(
    result.findings.some(
      (finding) =>
        finding.method === 'model' && finding.outcome === 'fail' && finding.category === 'conflict',
    ),
  );
  assert.ok(
    result.findings.some(
      (finding) =>
        finding.rule === 'declared-constraint-coverage' &&
        finding.message.includes('not established'),
    ),
  );
});
test('revision retains explicit bounded prior context and feedback without recursive results', async () => {
  const first = await authorUnit(miraRequest(), new FakeModel());
  const request = miraRequest();
  request.previous = {
    resultId: first.id,
    draft: first.candidate,
    findings: first.findings,
  };
  request.feedback = 'Keep ordinary Spark delivery and improve the open tier descriptions.';
  const model = new FakeModel();
  const revised = await authorUnit(request, model);
  assert.equal(revised.prepared.request.previous!.resultId, first.id);
  assert.match(model.requests[0]!.prompt, /improve the open tier descriptions/);
  assert.equal('prepared' in revised.prepared.request.previous!, false);
  assert.equal(
    requestSchema.safeParse({
      ...request,
      previous: first,
    }).success,
    false,
  );
  await assert.rejects(
    prepareRequest({
      ...request,
      feedback: null,
    }),
    /explicit feedback/,
  );
});
test(
  'model failures and malformed responses reject the operation instead of producing ' +
    'a completed result',
  async () => {
    await assert.rejects(
      authorUnit(miraRequest(), new FakeModel([new Error('transport unavailable')])),
      /Draft model execution failed.*could not complete/,
    );
    await assert.rejects(
      authorUnit(miraRequest(), new FakeModel([miraCandidate(), new Error('review failed')])),
      /Review model execution failed.*could not complete/,
    );
    const blank = miraCandidate();
    blank.basicAttack.delivery = '  ';
    await assert.rejects(
      authorUnit(miraRequest(), new FakeModel([blank])),
      /Draft model execution failed/,
    );
    const badReview = miraReview();
    badReview.findings[0]!.evidence = ['invented'];
    await assert.rejects(
      authorUnit(miraRequest(), new FakeModel([miraCandidate(), badReview])),
      /invalid finding or evidence references/,
    );
  },
);
test('review rejects altered deterministic findings and aborted runs do not call the model', async () => {
  const artifact = structuredClone(await checked());
  artifact.findings = [];
  const model = new FakeModel();
  await assert.rejects(reviewDraft(artifact, model), /do not match deterministic checks/);
  assert.equal(model.requests.length, 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(authorUnit(miraRequest(), model, { signal: controller.signal }));
  assert.equal(model.requests.length, 0);
});
test('review response schema exposes the permitted evidence IDs and complete finding IDs', async () => {
  const model = new FakeModel();
  const request = miraRequest();
  await authorUnit(request, model);
  const schema = JSON.parse(JSON.stringify(model.requests[1]!.schema));
  const finding = schema.properties.findings.items.properties;
  assert.deepEqual(
    finding.evidence.items.enum,
    request.documents.map(({ id }) => id),
  );
  const idPattern = new RegExp(finding.id.pattern);
  assert.ok(idPattern.test('model.001'));
  assert.equal(idPattern.test('model-001'), false);
  assert.equal(idPattern.test('model.'), false);
});

test('model output schemas require all object keys and reject additional properties', async () => {
  const model = new FakeModel();
  await authorUnit(miraRequest(), model);
  const inspect = (value: unknown): void => {
    if (value === null || typeof value !== 'object') {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(inspect);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false);
      assert.deepEqual(
        new Set(node.required as string[]),
        new Set(Object.keys(node.properties as Record<string, unknown>)),
      );
    }
    Object.values(node).forEach(inspect);
  };
  model.requests.forEach((request) => inspect(request.schema));
});

test('draft request requires concrete purchased-tier changes without changing the artifact contract', async () => {
  const request = miraRequest();
  request.documents[1]!.text +=
    ' Experimental reference: base Spark attack interval is 1 second; proposed changes need balancing.';
  const model = new FakeModel([miraCandidate()]);
  const artifact = await draftUnit(await prepareRequest(request), model);
  const sent = model.requests[0]!;
  for (const instruction of [
    'Each tier benefit must stand alone as the exact change bought at that tier.',
    'compare its behavior immediately before and after this purchase',
    'state the newly available action, trigger, targets and material limits',
    'before and after values with units, or an exact delta or multiplier and its named baseline',
    'explicitly mark that detail unspecified in the benefit',
    'Do not invent numbers',
    'do not repeat the same full ability description across tiers',
    'Gate each change by its purchased tier and any explicit prerequisites',
    'separate the immediate benefit from conditional synergy',
  ]) {
    assert.ok(sent.prompt.includes(instruction), instruction);
  }
  const retained = JSON.parse(sent.prompt.split('\n\n').at(-1)!);
  assert.deepEqual(retained, artifact.prepared.request);
  assert.match(retained.documents[1]!.text, /base Spark attack interval is 1 second/);
  const legacyOutput = candidateSchema.omit({ blueprint: true, crosspaths: true }).extend({
    paths: z.array(candidateSchema.shape.paths.element.omit({ limitation: true })),
    abilities: z.array(candidateSchema.shape.abilities.element.omit({ activation: true })),
  });
  assert.deepEqual(sent.schema, z.toJSONSchema(legacyOutput));
  const output = JSON.parse(JSON.stringify(sent.schema));
  assert.ok(!('crosspaths' in output.properties));
  assert.ok(!('limitation' in output.properties.paths.items.properties));
  assert.ok(!('activation' in output.properties.abilities.items.properties));
  assert.deepEqual(
    candidateSchema.parse(JSON.parse(JSON.stringify(artifact.candidate))),
    miraCandidate(),
  );
});

test('review requests tier-specific missing details and retains a scoped model finding for a vague upgrade', async () => {
  const candidate = miraCandidate();
  candidate.paths[0]!.tiers[1]!.benefit = 'Improves Spark.';
  const review = miraReview();
  review.findings = [
    {
      id: 'model.offense-tier-2',
      method: 'model',
      category: 'missing_specification',
      severity: 'warning',
      outcome: 'unresolved',
      subject: 'path.offense.tier.2',
      rule: 'Each purchased tier needs its own operational change.',
      message: 'Improves Spark does not specify the changed property or its resulting behavior.',
      evidence: ['R1'],
      action: 'Specify the before and after Spark behavior. Leave unsupported values unspecified.',
    },
  ];
  const model = new FakeModel([candidate, review]);
  const result = await authorUnit(miraRequest(), model);
  const sent = model.requests[1]!;
  for (const instruction of [
    'Inspect every tier benefit against the basic attack, preceding tiers and linked abilities',
    'Evaluate meaning, not particular words',
    'Identify missing tier-specific specifications by path ID and tier',
    'Missing specifications are unresolved, not a pass',
    'Check numerical changes against their supplied rules or Profile reference basis',
    'do not invent numbers, approvals or balance evidence',
    'Flag basic attack or lower-tier text that already grants an unpurchased higher-tier effect',
    'not proof that every legal build executes correctly',
  ]) {
    assert.ok(sent.prompt.includes(instruction), instruction);
  }
  const retained = JSON.parse(sent.prompt.split('\n\n').at(-1)!);
  assert.equal(retained.candidate.paths[0].tiers[1].benefit, 'Improves Spark.');
  assert.deepEqual(result.candidate, candidate);
  assert.deepEqual(
    result.findings.find((finding) => finding.id === 'model.offense-tier-2'),
    review.findings[0],
  );
});
