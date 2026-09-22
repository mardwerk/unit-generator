import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { conceptOutputSchema } from '../src/core/concept-output.js';
import type { UnitCandidate } from '../src/core/schemas.js';
import {
  alternateConceptRequest,
  conceptCandidate,
  conceptRequest,
} from './fixtures/concept-fixtures.js';

test('concept output preserves complete concepts under either supplied progression', () => {
  for (const request of [conceptRequest(), alternateConceptRequest()]) {
    const candidate = conceptCandidate(request);
    assert.deepEqual(conceptOutputSchema(request).parse(candidate), candidate);
  }
});

const referenceMutations: Record<string, (candidate: UnitCandidate) => void> = {
  'basic attack evidence': (candidate) => (candidate.basicAttack.evidence = ['/source']),
  'tier evidence': (candidate) => (candidate.paths[0]!.tiers[0]!.evidence = ['/source']),
  'ability evidence': (candidate) => (candidate.abilities[0]!.evidence = ['/source']),
  'mechanic evidence': (candidate) => (candidate.mechanics[0]!.evidence = ['/source']),
  'source document': (candidate) => (candidate.sources[0]!.documentId = '/source'),
  'question evidence': (candidate) =>
    candidate.unresolvedQuestions.push({
      id: 'question',
      question: 'Does the disc retain its budget?',
      affected: 'disc-budget',
      evidence: ['/source'],
    }),
  'attack decision': (candidate) => (candidate.basicAttack.decisionRefs = ['iona-source']),
  'tier decision': (candidate) => (candidate.paths[0]!.tiers[0]!.decisionRefs = ['iona-source']),
  'ability decision': (candidate) => (candidate.abilities[0]!.decisionRefs = ['iona-source']),
  'constraint coverage': (candidate) =>
    candidate.constraintCoverage.push({ constraintId: 'invented', implementation: 'Claim' }),
  path: (candidate) => (candidate.paths[0]!.id = 'invented'),
  'ability path': (candidate) => (candidate.abilities[0]!.pathId = 'invented'),
  'build path': (candidate) =>
    (candidate.representativeBuilds[0]!.selections[0]!.pathId = 'invented'),
  'main crosspath': (candidate) => (candidate.crosspaths![0]!.mainPathId = 'invented'),
  'secondary crosspath': (candidate) => (candidate.crosspaths![0]!.secondaryPathId = 'invented'),
};

for (const [field, mutate] of Object.entries(referenceMutations)) {
  test(`concept output rejects an unsupplied ${field} reference`, () => {
    const request = conceptRequest();
    const candidate = conceptCandidate(request);
    mutate(candidate);
    assert.equal(conceptOutputSchema(request).safeParse(candidate).success, false);
  });
}

test('decision references admit supplied constraints and decision documents, not source or rules IDs', () => {
  const request = conceptRequest();
  request.constraints.push({ id: 'keep-budget', text: 'Keep the projectile budget.' });
  request.documents.push({
    id: 'owner-decisions',
    kind: 'decisions',
    text: 'The mirror keeps the projectile budget.',
    origin: { location: 'supplied:decisions', access: 'supplied', note: null },
  });
  const candidate = conceptCandidate(request);
  candidate.basicAttack.decisionRefs = ['keep-budget', 'owner-decisions'];
  candidate.basicAttack.evidence.push('owner-decisions');
  candidate.constraintCoverage.push({
    constraintId: 'keep-budget',
    implementation: 'The mirror retains travel and hit capacity.',
  });
  const schema = conceptOutputSchema(request);
  assert.deepEqual(schema.parse(candidate), candidate);
  for (const id of ['iona-source', request.documents.find((doc) => doc.kind === 'rules')!.id]) {
    candidate.basicAttack.decisionRefs = [id];
    assert.equal(schema.safeParse(candidate).success, false);
  }
});

test('provider schema exposes finite IDs and forbids decision references when none exist', () => {
  const request = alternateConceptRequest();
  const shape = conceptOutputSchema(request).shape;
  assert.deepEqual(z.toJSONSchema(shape.basicAttack.shape.evidence).items, {
    type: 'string',
    enum: ['iona-source', 'two-path-rules'],
  });
  assert.equal(z.toJSONSchema(shape.basicAttack.shape.decisionRefs).maxItems, 0);
  assert.equal(z.toJSONSchema(shape.constraintCoverage).maxItems, 0);
  assert.deepEqual(z.toJSONSchema(shape.paths.element.shape.id).enum, ['reach', 'hold']);
});
