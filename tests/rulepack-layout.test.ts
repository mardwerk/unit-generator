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
import { luffyReferencePack, plainSwordsmanReference } from './fixtures/luffy-reference.js';

function hakiCandidates(): LayoutCandidate[] {
  return [
    {
      id: 'haki-paths',
      description: 'Armament, observation and conquerors as parallel paths.',
      paths: ['reference.armament', 'reference.observation', 'reference.conquerors'],
      sharedForms: null,
    },
    {
      id: 'combat-role-paths',
      description: 'Speed, damage and returning attacks as paths.',
      paths: ['reference.elastic_fighting', 'reference.armament', 'reference.observation'],
      sharedForms: null,
    },
  ];
}

test('explicit caller selection is recorded; relabeled duplicates are rejected', () => {
  const reference = luffyReferencePack();
  const selection = selectLayout(reference, publicThreePathPack, hakiCandidates(), 'haki-paths');
  assert.equal(selection.selected.id, 'haki-paths');
  assert.deepEqual(
    selection.rejected.map((candidate) => candidate.id),
    ['combat-role-paths'],
  );
  const relabeled = hakiCandidates();
  relabeled[1] = { ...relabeled[0]!, id: 'haki-paths-again' };
  assert.throws(
    () => selectLayout(reference, publicThreePathPack, relabeled, 'haki-paths'),
    /repeats another candidate's bindings/,
  );
  assert.throws(
    () => selectLayout(reference, publicThreePathPack, hakiCandidates(), 'missing'),
    /not among the candidates/,
  );
  assert.throws(
    () => selectLayout(reference, publicThreePathPack, [], 'haki-paths'),
    /at least one/,
  );
  const unknown = hakiCandidates();
  unknown[0] = { ...unknown[0]!, paths: [...unknown[0]!.paths.slice(0, 2), 'reference.missing'] };
  assert.throws(
    () => selectLayout(reference, publicThreePathPack, unknown, 'haki-paths'),
    /unknown concept/,
  );
  const short = [{ ...hakiCandidates()[0]!, paths: hakiCandidates()[0]!.paths.slice(0, 2) }];
  assert.throws(() => selectLayout(reference, publicThreePathPack, short, 'haki-paths'), /needs 3/);
});

test('unsupported shared forms stay in the plan and are reported, never dropped', () => {
  const reference = luffyReferencePack();
  const layout: LayoutCandidate = {
    ...hakiCandidates()[0]!,
    sharedForms: 'reference.gear_progression',
  };
  const plan = planFromLayout(reference, publicThreePathPack, layout);
  assert.equal(plan.bindings.shared_forms, 'reference.gear_progression');
  const issues = validateLayoutPlan(plan, reference, publicThreePathPack);
  assert.equal(issues.length, 1);
  assert.match(issues[0]!.message, /Unsupported design binding: shared_forms/);
  assert.match(issues[0]!.message, /td-three-path@1\.0\.0/);
  assert.match(issues[0]!.message, /shared-forms@1\.0\.0/);
});

test('apex and subject bindings follow the active pack and reference', () => {
  const reference = luffyReferencePack();
  const noApex = rulePackSchema.parse({
    ...structuredClone(publicThreePathPack),
    id: 'no-apex',
    apex: { enabled: false, composition: 'explicit_synthesis' },
  });
  const plan = planFromLayout(reference, noApex, hakiCandidates()[0]!);
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
  const reference = luffyReferencePack();
  assert.doesNotThrow(() => assertReferencePackCoherent(reference));
  const duplicate = structuredClone(reference);
  duplicate.concepts.push(structuredClone(duplicate.concepts[0]!));
  assert.throws(() => assertReferencePackCoherent(duplicate), /unique identifiers/);
  const dangling = structuredClone(reference);
  dangling.relationships.push({
    from: 'reference.armament',
    kind: 'requires',
    to: 'reference.missing',
    status: 'evidence',
  });
  assert.throws(() => assertReferencePackCoherent(dangling), /unknown concept/);
  assert.deepEqual(danglingReferenceEvidence(reference, []), [
    'luffy-source-1',
    'luffy-source-2',
    'luffy-source-3',
  ]);
  assert.deepEqual(
    danglingReferenceEvidence(reference, ['luffy-source-1', 'luffy-source-2', 'luffy-source-3']),
    [],
  );
});

function interpretedRequest(): AuthorRequest {
  const definition = structuredClone(defaultAuthoringDefinition);
  const reference = {
    subject: 'test.luffy',
    concepts: [
      {
        id: 'test.elastic',
        label: 'Elastic fighting identity',
        status: 'evidence' as const,
        description: 'Stretching close-range brawling.',
        evidenceIds: ['haki-source'],
      },
      {
        id: 'test.armament',
        label: 'Armament hardening',
        status: 'evidence' as const,
        description: 'Hardening discipline.',
        evidenceIds: ['haki-source'],
      },
      {
        id: 'test.observation',
        label: 'Observation sensing',
        status: 'evidence' as const,
        description: 'Perception discipline.',
        evidenceIds: ['sensing-source'],
      },
      {
        id: 'test.conquerors',
        label: 'Conqueror presence',
        status: 'evidence' as const,
        description: 'Dominance discipline.',
        evidenceIds: ['haki-source'],
      },
    ],
    relationships: [
      {
        from: 'test.elastic',
        kind: 'expresses_identity' as const,
        to: 'test.elastic',
        status: 'interpretation' as const,
      },
      {
        from: 'test.armament',
        kind: 'can_coexist_with' as const,
        to: 'test.observation',
        status: 'evidence' as const,
      },
      {
        from: 'test.observation',
        kind: 'can_coexist_with' as const,
        to: 'test.conquerors',
        status: 'evidence' as const,
      },
    ],
  };
  return {
    schemaVersion: '1',
    task: 'Plan a sourced unit while honoring the pinned interpretation.',
    character: { name: 'Test Luffy', work: 'Test brief', scope: 'Supplied brief only' },
    documents: [
      {
        id: 'haki-source',
        kind: 'source',
        text: 'The fighter hardens fists with armament and overwhelms groups with conqueror presence.',
        origin: { location: 'test', access: 'supplied', note: null },
      },
      {
        id: 'sensing-source',
        kind: 'source',
        text: 'The fighter senses enemies with observation before they strike.',
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
        subject: 'test.luffy',
        rulePack: 'td-three-path@1.0.0',
        bindings: {
          base_identity: 'test.elastic',
          specialization_paths: {
            A: 'test.armament',
            B: 'test.observation',
            C: 'test.conquerors',
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
  assert.equal(prepared.request.interpretation?.layout.bindings.base_identity, 'test.elastic');
  const call = designPlanRequest(prepared);
  assert.match(call.prompt, /pinned interpretation/);
  assert.match(call.prompt, /test\.armament/);
  const spans = authorEvidence(prepared.request);
  const haki = spans.find((span) => span.documentId === 'haki-source')!;
  const sensing = spans.find((span) => span.documentId === 'sensing-source')!;
  assert.deepEqual(
    interpretationCitationIssues(
      {
        path1: { sourceIds: [haki.id] },
        path2: { sourceIds: [sensing.id] },
        path3: { sourceIds: [haki.id] },
      },
      prepared.request,
    ),
    [],
  );
  const missing = interpretationCitationIssues(
    {
      path1: { sourceIds: [haki.id] },
      path2: { sourceIds: [] },
      path3: { sourceIds: [haki.id] },
    },
    prepared.request,
  );
  assert.equal(missing.length, 1);
  assert.equal(missing[0]!.path, 'paths.path2');
  const crossed = interpretationCitationIssues(
    {
      path1: { sourceIds: [sensing.id] },
      path2: { sourceIds: [sensing.id] },
      path3: { sourceIds: [haki.id] },
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
