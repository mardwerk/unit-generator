import { interpretationFor } from './fixtures/interpretation-fixtures.js';
import { miraRequest } from './fixtures/core-fixtures.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPackImmutable,
  getRulePack,
  publicThreePathPack,
  fourPathPack,
  rulePackSchema,
} from '../src/core/rulepack.js';
import { assertReferencePackCoherent, danglingReferenceEvidence } from '../src/core/reference.js';
import {
  assertSupportedBehavior,
  planFromLayout,
  selectLayout,
  validateLayoutPlan,
  type LayoutCandidate,
} from '../src/core/design.js';
import { designPlanRequest, interpretationCitationIssues } from '../src/core/blueprint/plan.js';
import { defaultMechanicsDefinition } from '../src/core/mechanics/schemas.js';
import { defaultAuthoringDefinition } from '../src/core/default-profile.js';
import { definitionProgression, prepareRequest, type AuthorRequest } from '../src/core/index.js';
import { authorEvidence } from '../src/core/blueprint/evidence.js';
import { miraLayoutReference, plainSwordsmanReference } from './fixtures/layout-reference.js';

function layoutCandidates(): LayoutCandidate[] {
  return [
    {
      id: 'property-paths',
      description: 'Impact, reach and capacity as parallel paths.',
      paths: ['reference.impact', 'reference.reach', 'reference.capacity'],
      sharedForms: null,
    },
    {
      id: 'combat-role-paths',
      description: 'Base attack, impact and reach as paths.',
      paths: ['reference.spark', 'reference.impact', 'reference.reach'],
      sharedForms: null,
    },
  ];
}

test('explicit caller selection is recorded; relabeled duplicates are rejected', () => {
  const reference = miraLayoutReference();
  const selection = selectLayout(
    reference,
    publicThreePathPack,
    layoutCandidates(),
    'property-paths',
  );
  assert.equal(selection.selected.id, 'property-paths');
  assert.deepEqual(
    selection.rejected.map((candidate) => candidate.id),
    ['combat-role-paths'],
  );
  const relabeled = layoutCandidates();
  relabeled[1] = { ...relabeled[0]!, id: 'property-paths-again' };
  assert.throws(
    () => selectLayout(reference, publicThreePathPack, relabeled, 'property-paths'),
    /repeats another candidate's bindings/,
  );
  assert.throws(
    () => selectLayout(reference, publicThreePathPack, layoutCandidates(), 'missing'),
    /not among the candidates/,
  );
  assert.throws(
    () => selectLayout(reference, publicThreePathPack, [], 'property-paths'),
    /at least one/,
  );
  const unknown = layoutCandidates();
  unknown[0] = { ...unknown[0]!, paths: [...unknown[0]!.paths.slice(0, 2), 'reference.missing'] };
  assert.throws(
    () => selectLayout(reference, publicThreePathPack, unknown, 'property-paths'),
    /unknown concept/,
  );
  const short = [{ ...layoutCandidates()[0]!, paths: layoutCandidates()[0]!.paths.slice(0, 2) }];
  assert.throws(
    () => selectLayout(reference, publicThreePathPack, short, 'property-paths'),
    /needs 3/,
  );
});

test('unsupported shared forms stay in the plan and are reported, never dropped', () => {
  const reference = miraLayoutReference();
  const layout: LayoutCandidate = {
    ...layoutCandidates()[0]!,
    sharedForms: 'reference.lens_modes',
  };
  const plan = planFromLayout(reference, publicThreePathPack, layout);
  assert.equal(plan.bindings.shared_forms, 'reference.lens_modes');
  const issues = validateLayoutPlan(plan, reference, publicThreePathPack);
  assert.equal(issues.length, 1);
  assert.match(issues[0]!.message, /Unsupported design binding: shared_forms/);
  assert.match(issues[0]!.message, /td-three-path@1\.0\.0/);
  assert.match(issues[0]!.message, /shared-forms@1\.0\.0/);
});

test('apex and subject bindings follow the active pack and reference', () => {
  const reference = miraLayoutReference();
  const noApex = rulePackSchema.parse({
    ...structuredClone(publicThreePathPack),
    id: 'no-apex',
    apex: { enabled: false, composition: 'explicit_synthesis' },
  });
  const plan = planFromLayout(reference, noApex, layoutCandidates()[0]!);
  assert.equal(plan.bindings.apex.specialization_policy, 'none');
  assert.deepEqual(validateLayoutPlan(plan, reference, noApex), []);
  const withPolicy = structuredClone(plan);
  withPolicy.bindings.apex.specialization_policy = 'integrate_all_paths';
  withPolicy.bindings.apex.form_policy = 'permanent_highest_form_when_present';
  const issues = validateLayoutPlan(withPolicy, reference, noApex);
  assert.ok(issues.some((issue) => issue.path === 'bindings.apex.specialization_policy'));
  assert.ok(issues.some((issue) => issue.path === 'bindings.apex.form_policy'));
  const wrongSubject = structuredClone(plan);
  wrongSubject.subject = 'other.character';
  const subjectIssues = validateLayoutPlan(wrongSubject, reference, noApex);
  assert.ok(subjectIssues.some((issue) => issue.path === 'subject'));
});

test('capability checks follow the active definition extensions', () => {
  const bare = structuredClone(defaultMechanicsDefinition);
  assert.throws(
    () => assertSupportedBehavior('follow-up', bare),
    /Unsupported behavior: follow-up/,
  );
  assert.throws(() => assertSupportedBehavior('follow-up', bare), /under this Definition/);
  assert.throws(() => assertSupportedBehavior('distinct-volley', bare), /Unsupported behavior/);
  const extended = structuredClone(defaultAuthoringDefinition);
  assert.doesNotThrow(() => assertSupportedBehavior('follow-up', extended));
  assert.doesNotThrow(() => assertSupportedBehavior('distinct-volley', extended));
  assert.doesNotThrow(() => assertSupportedBehavior('manual-boost', bare));
  assert.doesNotThrow(() => assertSupportedBehavior('damage', bare));
  assert.throws(
    () => assertSupportedBehavior('future_sight', extended),
    /Unsupported behavior: future_sight/,
  );
  assert.throws(() => assertSupportedBehavior('future_sight', extended), /reserved technique/);
});

test('pack immutability compares resolved content, not reference strings', () => {
  assert.doesNotThrow(() =>
    assertPackImmutable(publicThreePathPack, structuredClone(publicThreePathPack)),
  );
  const edited = structuredClone(publicThreePathPack);
  edited.apex.enabled = false;
  assert.throws(() => assertPackImmutable(publicThreePathPack, edited), /cannot edit/);
  assert.throws(() => assertPackImmutable(publicThreePathPack, fourPathPack), /cannot edit/);
  assert.equal(getRulePack('td-three-path@1.0.0').id, 'td-three-path');
  assert.throws(() => getRulePack('no-such-pack@1.0.0'), /Unknown RulePack/);
});

test('reference coherence needs unique ids and resolvable evidence', () => {
  const reference = miraLayoutReference();
  assert.doesNotThrow(() => assertReferencePackCoherent(reference));
  const duplicate = structuredClone(reference);
  duplicate.concepts.push(structuredClone(duplicate.concepts[0]!));
  assert.throws(() => assertReferencePackCoherent(duplicate), /unique identifiers/);
  const dangling = structuredClone(reference);
  dangling.relationships.push({
    from: 'reference.impact',
    kind: 'requires',
    to: 'reference.missing',
    status: 'evidence',
  });
  assert.throws(() => assertReferencePackCoherent(dangling), /unknown concept/);
  assert.deepEqual(danglingReferenceEvidence(reference, []), [
    'mira-source-1',
    'mira-source-2',
    'mira-source-3',
  ]);
  assert.deepEqual(
    danglingReferenceEvidence(reference, ['mira-source-1', 'mira-source-2', 'mira-source-3']),
    [],
  );
});

function interpretedRequest(): AuthorRequest {
  const definition = structuredClone(defaultAuthoringDefinition);
  const reference = {
    subject: 'test.mira',
    concepts: [
      {
        id: 'test.spark',
        label: 'Spark identity',
        status: 'evidence' as const,
        description: 'An aimed magical projectile requiring a clear delivery path.',
        evidenceIds: ['spark-source'],
      },
      {
        id: 'test.impact',
        label: 'Focused impact',
        status: 'interpretation' as const,
        description: 'Concentrated Spark impact.',
        evidenceIds: ['spark-source'],
      },
      {
        id: 'test.reach',
        label: 'Extended reach',
        status: 'interpretation' as const,
        description: 'Longer firing reach.',
        evidenceIds: ['sensing-source'],
      },
      {
        id: 'test.capacity',
        label: 'Crowd capacity',
        status: 'interpretation' as const,
        description: 'Larger finite target capacity.',
        evidenceIds: ['spark-source'],
      },
    ],
    relationships: [
      {
        from: 'test.spark',
        kind: 'expresses_identity' as const,
        to: 'test.spark',
        status: 'interpretation' as const,
      },
      {
        from: 'test.impact',
        kind: 'can_coexist_with' as const,
        to: 'test.reach',
        status: 'interpretation' as const,
      },
      {
        from: 'test.reach',
        kind: 'can_coexist_with' as const,
        to: 'test.capacity',
        status: 'interpretation' as const,
      },
    ],
  };
  return {
    schemaVersion: '1',
    task: 'Plan a sourced unit while honoring the pinned interpretation.',
    character: { name: 'Test Mira', work: 'Test brief', scope: 'Supplied brief only' },
    documents: [
      {
        id: 'spark-source',
        kind: 'source',
        text: 'Mira fires a Spark along a clear path and can focus its impact on a detected target.',
        origin: { location: 'test', access: 'supplied', note: null },
      },
      {
        id: 'sensing-source',
        kind: 'source',
        text: 'Mira can adjust the Spark firing reach without granting delivery through obstacles.',
        origin: { location: 'test', access: 'supplied', note: null },
      },
      {
        id: 'test-rules',
        kind: 'rules',
        text: 'Three paths with five tiers and crosspath caps.',
        origin: { location: 'test', access: 'supplied', note: null },
      },
    ],
    constraints: [],
    progression: definitionProgression(definition),
    mechanicsDefinition: definition,
    previous: null,
    feedback: null,
    interpretation: {
      reference,
      layout: {
        subject: 'test.mira',
        rulePack: 'td-three-path@1.0.0',
        bindings: {
          base_identity: 'test.spark',
          specialization_paths: {
            A: 'test.impact',
            B: 'test.reach',
            C: 'test.capacity',
          },
          shared_forms: null,
          apex: { specialization_policy: 'integrate_all_paths', form_policy: 'none' },
        },
        design_invariants: ['Every normal build retains the base fighting identity.'],
      },
    },
  };
}

test('prepare accepts a valid pinned interpretation and the planner pins it', async () => {
  const prepared = await prepareRequest(interpretedRequest());
  assert.equal(prepared.request.interpretation?.layout.bindings.base_identity, 'test.spark');
  const call = designPlanRequest(prepared);
  assert.match(call.prompt, /pinned interpretation/);
  assert.match(call.prompt, /test\.impact/);
  const spans = authorEvidence(prepared.request);
  const spark = spans.find((span) => span.documentId === 'spark-source')!;
  const sensing = spans.find((span) => span.documentId === 'sensing-source')!;
  assert.deepEqual(
    interpretationCitationIssues(
      {
        path1: { sourceIds: [spark.id] },
        path2: { sourceIds: [sensing.id] },
        path3: { sourceIds: [spark.id] },
      },
      prepared.request,
    ),
    [],
  );
  const missing = interpretationCitationIssues(
    {
      path1: { sourceIds: [spark.id] },
      path2: { sourceIds: [] },
      path3: { sourceIds: [spark.id] },
    },
    prepared.request,
  );
  assert.equal(missing.length, 1);
  assert.equal(missing[0]!.path, 'paths.path2');
  const crossed = interpretationCitationIssues(
    {
      path1: { sourceIds: [sensing.id] },
      path2: { sourceIds: [sensing.id] },
      path3: { sourceIds: [spark.id] },
    },
    prepared.request,
  );
  assert.equal(crossed.length, 1);
  assert.equal(crossed[0]!.path, 'paths.path1');
});

test('prepare rejects interpretations outside the supported route contract', async () => {
  const legacy = interpretedRequest();
  const plain = structuredClone(defaultMechanicsDefinition);
  legacy.mechanicsDefinition = plain;
  legacy.progression = definitionProgression(plain);
  await assert.rejects(() => prepareRequest(legacy), /planned-v1/);
  const unknownPack = interpretedRequest();
  unknownPack.interpretation!.layout.rulePack = 'no-pack@9.9.9';
  await assert.rejects(() => prepareRequest(unknownPack), /Unknown RulePack/);
  const dangling = interpretedRequest();
  dangling.interpretation!.reference.concepts[0]!.evidenceIds = ['ghost-passage'];
  await assert.rejects(() => prepareRequest(dangling), /unknown evidence/);
  const wrongSubject = interpretedRequest();
  wrongSubject.interpretation!.layout.subject = 'other.character';
  await assert.rejects(() => prepareRequest(wrongSubject), /interpretation record is invalid/);
});

test('a form-less reference with conflicting groupings uses the same interface', () => {
  const reference = plainSwordsmanReference();
  const candidates: LayoutCandidate[] = [
    {
      id: 'form-first',
      description: 'Swordplay supported by footwork and parry.',
      paths: ['reference.swordplay', 'reference.footwork', 'reference.parry'],
      sharedForms: null,
    },
    {
      id: 'guard-first',
      description: 'Parry supported by swordplay and footwork.',
      paths: ['reference.parry', 'reference.swordplay', 'reference.footwork'],
      sharedForms: null,
    },
  ];
  const selection = selectLayout(reference, publicThreePathPack, candidates, 'guard-first');
  assert.equal(selection.selected.id, 'guard-first');
  const plan = planFromLayout(reference, publicThreePathPack, selection.selected);
  assert.equal(plan.bindings.shared_forms, null);
  assert.deepEqual(validateLayoutPlan(plan, reference, publicThreePathPack), []);
});

test('opaque interpretation concepts deliver meaning, evidence status and relationships over shared source evidence', async () => {
  const request = miraRequest();
  request.mechanicsDefinition = structuredClone(defaultAuthoringDefinition);
  request.progression = definitionProgression(request.mechanicsDefinition);
  request.interpretation = interpretationFor(request);
  const first = designPlanRequest(await prepareRequest(request)).prompt;
  assert.match(first, /Concentrated impact/);
  assert.match(first, /Develop the force of each aimed Spark/);
  assert.match(first, /can_coexist_with/);
  assert.match(first, /They develop different properties/);
  assert.match(first, /"status":"interpretation"/);
  request.interpretation.reference.concepts[1]!.description =
    'Use the existing Spark only after another attack connects.';
  request.interpretation.reference.relationships[0]!.kind = 'requires';
  const second = designPlanRequest(await prepareRequest(request)).prompt;
  assert.notEqual(first, second);
  assert.match(second, /only after another attack connects/);
  assert.match(second, /"kind":"requires"/);
  assert.doesNotMatch(second, /Develop the force of each aimed Spark/);
});

test('same-document wrong spans cannot satisfy specialization or base-identity fallback coverage', () => {
  const request = miraRequest();
  request.documents[0]!.text =
    'Mira launches an aimed energy Spark through a clear firing lane. Cooking soup is unrelated to these powers.';
  request.interpretation = interpretationFor(request);
  const [allowed, unrelated] = authorEvidence(request).filter((span) => span.documentId === 'E1');
  assert.ok(allowed && unrelated);
  const branches = {
    path1: { sourceIds: [unrelated.id] },
    path2: { sourceIds: [unrelated.id] },
    path3: { sourceIds: [unrelated.id] },
  };
  assert.equal(interpretationCitationIssues(branches, request).length, 3);
  for (const branch of Object.values(branches)) branch.sourceIds = [allowed.id];
  assert.deepEqual(interpretationCitationIssues(branches, request), []);
  // Explicit whole-document evidence broadens only the corresponding concept.
  request.interpretation.reference.concepts[1]!.evidenceIds = ['E1'];
  for (const branch of Object.values(branches)) branch.sourceIds = [unrelated.id];
  assert.deepEqual(
    interpretationCitationIssues(branches, request).map((issue) => issue.path),
    ['paths.path2', 'paths.path3'],
  );
  // Base identity is an intentional fallback, with the same span precision.
  request.interpretation.reference.concepts[0]!.evidenceIds = [unrelated.id];
  assert.deepEqual(interpretationCitationIssues(branches, request), []);
  for (const branch of Object.values(branches)) branch.sourceIds = ['E1'];
  assert.equal(
    interpretationCitationIssues(branches, request).length,
    3,
    'branch citations must remain exact spans',
  );
});
