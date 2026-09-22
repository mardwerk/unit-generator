import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyConceptProfile,
  checkDraft,
  conceptCandidateSchema,
  conceptSkillVersion,
  draftUnit,
  prepareRequest,
  requiredConceptCrosspaths,
  reviewDraft,
  type AuthorRequest,
  type UnitCandidate,
} from '../src/core/index.js';
import { renderArtifact } from '../src/presentation/markdown.js';
import {
  conceptCandidate,
  conceptRequest,
  alternateConceptRequest,
} from './fixtures/concept-fixtures.js';
import { FakeModel, miraCandidate, miraRequest } from './fixtures/core-fixtures.js';
import { defaultAuthoringDefinition } from '../src/core/default-profile.js';

async function run(request = conceptRequest(), candidate = conceptCandidate(request)) {
  const model = new FakeModel([candidate]);
  const draft = await draftUnit(await prepareRequest(request), model);
  return { draft, checked: await checkDraft(draft), model };
}

for (const [label, input] of [
  ['public three-path policy', conceptRequest],
  ['external two-path policy', alternateConceptRequest],
] as const) {
  test(`concept generate, reload, revise, check and render: ${label}`, async () => {
    const request = input();
    const original = conceptCandidate(request);
    const { checked, model } = await run(request, original);
    assert.deepEqual(
      checked.findings.filter((finding) => finding.outcome === 'fail'),
      [],
    );
    const reloaded = JSON.parse(JSON.stringify(checked));
    const reviewer = new FakeModel([
      {
        summary:
          'An allied disc reaches the mirror with unused travel and pierce. Turning it toward an enemy changes its route without replenishing either budget. This is a predicted interaction, not executed gameplay.',
        findings: [],
      },
    ]);
    const result = await reviewDraft(reloaded, reviewer);
    assert.deepEqual(result.candidate, original);
    assert.match(reviewer.requests[0]!.prompt, /First describe one concrete interaction/);
    assert.match(reviewer.requests[0]!.prompt, /Missing numerical balance is intentional/);
    assert.match(model.requests[0]!.prompt, new RegExp(conceptSkillVersion));
    assert.match(model.requests[0]!.prompt, /A prose edit is not a redesign/);
    assert.match(model.requests[0]!.prompt, /A bounce or retarget does not/);
    assert.match(model.requests[0]!.prompt, /Do not force behavior into a sentence limit/);
    assert.doesNotMatch(model.requests[0]!.prompt, /at most one sentence/);
    assert.equal(result.candidate.blueprint, undefined);
    const schema = model.requests[0]!.schema as { properties: Record<string, unknown> };
    assert.ok(!('blueprint' in schema.properties));
    const markdown = renderArtifact(JSON.parse(JSON.stringify(result)));
    assert.match(markdown, /Redirection does not replenish remaining pierce or travel/);
    assert.match(markdown, /copies shares a temporary immunity/);
    assert.equal(
      (markdown.match(/### Crosspath:/g) ?? []).length,
      requiredConceptCrosspaths(request).length,
    );
    assert.doesNotMatch(
      markdown,
      /Structural checks|Model review|Generation usage|Review findings|\| Tier \|/,
    );
    assert.match(
      renderArtifact(result, { details: true }),
      /Concept checks inspect declared path and crosspath coverage/,
    );

    const revision: AuthorRequest = {
      ...request,
      operation: 'prose-edit',
      previous: { resultId: result.id, draft: result.candidate, findings: result.findings },
      feedback: 'Make the starting attack name clearer without changing behavior.',
    };
    const edited = structuredClone(original);
    edited.basicAttack.name = 'Returning glass disc';
    const next = await run(revision, edited);
    assert.deepEqual(
      next.checked.findings.filter((finding) => finding.outcome === 'fail'),
      [],
    );
    assert.ok(
      next.checked.findings.some(
        (finding) => finding.rule === 'prose-edit-meaning' && finding.outcome === 'not_checked',
      ),
    );
    assert.deepEqual(next.draft.prepared.request.previous?.draft, original);
    assert.match(renderArtifact(next.checked), /Returning glass disc/);
  });
}

test('concept dispatch stays qualitative with numeric source references and rejects numerical blueprints', async () => {
  const request = conceptRequest();
  request.documents[0]!.text +=
    ' Historical reference: another game assigns 10 damage and a 5 second cooldown. These numbers are not requested design values.';
  const { model } = await run(request);
  assert.match(model.requests[0]!.prompt, /qualitative concept even when/);
  assert.match(model.requests[0]!.prompt, /Historical reference: another game assigns 10 damage/);
  const bad = { ...conceptCandidate(request), blueprint: {} };
  assert.equal(conceptCandidateSchema.safeParse(bad).success, false);
  await assert.rejects(draftUnit(await prepareRequest(request), new FakeModel([bad])));
  await assert.rejects(
    prepareRequest({ ...request, mechanicsDefinition: defaultAuthoringDefinition }),
    /cannot contain a mechanicsDefinition/,
  );
  await assert.rejects(
    prepareRequest({ ...request, conceptRules: undefined }),
    /require explicit progression and conceptRules/,
  );
});

test('preset conversion removes numerical rules and is idempotent for externally supplied concept policies', async () => {
  const request = conceptRequest();
  const converted = applyConceptProfile({
    ...request,
    deliverable: 'mechanics',
    mechanicsDefinition: defaultAuthoringDefinition,
    documents: [
      ...request.documents,
      {
        id: `mechanics:${defaultAuthoringDefinition.id}`,
        kind: 'rules',
        text: 'Numerical definition.',
        origin: { location: 'definition', access: 'supplied', note: null },
      },
    ],
  });
  assert.equal(converted.mechanicsDefinition, undefined);
  assert.ok(!converted.documents.some((document) => document.id.startsWith('mechanics:')));
  const alternate = alternateConceptRequest();
  assert.deepEqual(applyConceptProfile(alternate), alternate);
  await prepareRequest(alternate);
});

test('directional coverage follows legal combinations and total-tier limits instead of fixed six pairs', () => {
  const request = conceptRequest();
  assert.equal(requiredConceptCrosspaths(request).length, 6);
  const alternate = alternateConceptRequest();
  assert.deepEqual(requiredConceptCrosspaths(alternate), [
    { mainPathId: 'reach', secondaryPathId: 'hold', borrowedTiers: [1] },
    { mainPathId: 'hold', secondaryPathId: 'reach', borrowedTiers: [1] },
  ]);
  alternate.progression!.allowedTierCombinations = [
    [0, 0],
    [3, 1],
  ];
  assert.deepEqual(requiredConceptCrosspaths(alternate), [
    { mainPathId: 'reach', secondaryPathId: 'hold', borrowedTiers: [1] },
  ]);
  alternate.progression!.allowedTierCombinations = null;
  alternate.progression!.maxTotalTiers = 2;
  assert.deepEqual(requiredConceptCrosspaths(alternate), []);
});

test('valid controls and deliberately defective concepts distinguish declared coverage and controls', async () => {
  const { checked } = await run();
  assert.deepEqual(
    checked.findings.filter((finding) => finding.outcome === 'fail'),
    [],
  );
  const defects: [string, (candidate: UnitCandidate) => void, string][] = [
    ['missing direction', (c) => c.crosspaths!.pop(), 'concept-crosspath-coverage'],
    [
      'duplicate direction',
      (c) => c.crosspaths!.push(structuredClone(c.crosspaths![0]!)),
      'concept-crosspath-coverage',
    ],
    [
      'missing borrowed purchase',
      (c) => c.crosspaths![0]!.borrowedTiers.pop(),
      'concept-crosspath-coverage',
    ],
    [
      'undeclared activation slot',
      (c) => {
        c.abilities[0]!.pathId = 'path-1';
      },
      'concept-activation',
    ],
    [
      'missing path limitation',
      (c) => {
        delete c.paths[0]!.limitation;
      },
      'concept-path-limitation',
    ],
  ];
  for (const [label, change, rule] of defects) {
    const altered = structuredClone(checked.draft);
    change(altered.candidate);
    const result = await checkDraft(altered);
    assert.ok(
      result.findings.some((finding) => finding.rule === rule && finding.outcome === 'fail'),
      label,
    );
  }
  const alternate = await run(alternateConceptRequest());
  const missingRequired = structuredClone(alternate.draft);
  missingRequired.candidate.abilities[0]!.activation = 'automatic';
  assert.ok(
    (await checkDraft(missingRequired)).findings.some(
      (f) => f.rule === 'concept-activation' && f.outcome === 'fail',
    ),
  );
});

test('prose-only edits catch declared dependency removal but expose the limit of free-text conservation checks', async () => {
  const request = conceptRequest();
  const original = conceptCandidate(request);
  const revision: AuthorRequest = {
    ...request,
    operation: 'prose-edit',
    previous: { resultId: 'original', draft: original, findings: [] },
    feedback: 'Shorten the mirror description, preserving all behavior.',
  };
  const structural = structuredClone(original);
  structural.abilities[0]!.mechanicIds = [];
  const structuralResult = await run(revision, structural);
  assert.ok(
    structuralResult.checked.findings.some(
      (f) => f.rule === 'prose-edit-structure' && f.outcome === 'fail',
    ),
  );

  for (const defect of [
    'A bounce replenishes all pierce.',
    'Different copies may hold the same enemy forever.',
    'The kick only occurs after the disc connects.',
  ]) {
    const semantic = structuredClone(original);
    semantic.mechanics[0]!.behavior = defect;
    const result = await run(revision, semantic);
    assert.ok(
      result.checked.findings.some(
        (f) => f.rule === 'prose-edit-meaning' && f.outcome === 'not_checked',
      ),
    );
    assert.ok(
      result.checked.findings.some(
        (f) => f.rule === 'concept-semantic-scope' && f.outcome === 'not_checked',
      ),
    );
    assert.ok(
      !result.checked.findings.some((f) => f.rule === 'prose-edit-meaning' && f.outcome === 'pass'),
    );
  }
});

test('legacy requests and artifacts remain on their existing flexible path', async () => {
  const model = new FakeModel([miraCandidate()]);
  const draft = await draftUnit(await prepareRequest(miraRequest()), model);
  assert.equal(draft.prepared.request.deliverable, undefined);
  assert.equal(draft.candidate.crosspaths, undefined);
  assert.ok(!model.requests[0]!.prompt.includes(conceptSkillVersion));
});

test('revision intent rejects missing prior candidates and invalid activation declarations', async () => {
  const request = conceptRequest();
  await assert.rejects(
    prepareRequest({ ...request, operation: 'prose-edit' }),
    /previous candidate/,
  );
  request.conceptRules!.manualActivation.allowedSlots = [{ pathId: 'missing', tiers: [9] }];
  await assert.rejects(prepareRequest(request), /declared paths/);
});

test('both Markdown views expose declared activation and borrowed upgrades without relying on model prose', async () => {
  const { draft } = await run();
  const manual = structuredClone(draft);
  for (const pair of manual.candidate.crosspaths!)
    pair.interaction = 'The borrowed effects apply only to the main disc.';
  const automatic = structuredClone(manual);
  automatic.candidate.abilities[0]!.activation = 'automatic';
  const legacy = await draftUnit(
    await prepareRequest(miraRequest()),
    new FakeModel([miraCandidate()]),
  );
  for (const options of [{}, { details: true }]) {
    const manualText = renderArtifact(manual, options);
    const automaticText = renderArtifact(automatic, options);
    assert.match(manualText, /Manually activated\./);
    assert.match(automaticText, /Automatic\./);
    assert.doesNotMatch(automaticText, /Manually activated\./);
    assert.notEqual(manualText, automaticText);
    assert.match(manualText, /Borrowed upgrades: Relay 1, Relay 2\./);
    assert.doesNotMatch(renderArtifact(legacy, options), /Manually activated\.|Automatic\./);
  }
});
