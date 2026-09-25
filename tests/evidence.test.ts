import assert from 'node:assert/strict';
import test from 'node:test';
import { authorEvidence, evidenceSpans } from '../src/core/planned-v1/evidence.js';
import { miraRequest } from './fixtures/core-fixtures.js';
import { defaultMechanicsDefinition } from '../src/core/index.js';

function passages(text: string) {
  const request = miraRequest();
  request.documents[0]!.text = text;
  return evidenceSpans(request);
}

function retained(text: string) {
  const spans = passages(text);
  assert.ok(spans.length > 0);
  assert.equal(
    spans
      .map((span) => span.text)
      .join('')
      .replace(/\s/g, ''),
    text.replace(/\s/g, ''),
  );
  for (const span of spans) {
    assert.ok(text.includes(span.text));
    assert.ok(span.text.length <= 450);
  }
  return spans;
}

test('short source limitations stay attached to exact neighboring passages', () => {
  const text = 'Mira fires sparks at detected targets. She is blind. No flight.';
  const spans = retained(text);
  assert.ok(spans.some(({ text }) => text.includes('She is blind.')));
  assert.ok(spans.some(({ text }) => text.includes('No flight.')));
  assert.ok(spans.every(({ text }) => text.length >= 15));
  retained('No flight. Mira fires sparks at detected targets.');
  retained('Mira fires sparks at detected targets. No flight.');
  retained('No flight. No armor. No healing.');
});

test('long passages retain short final chunks and preserve original whitespace inside each quote', () => {
  const text = 'Mira attacks with precise light bolts '.repeat(14) + 'No flight.';
  const spans = retained(text);
  assert.ok(spans.length > 1);
  assert.ok(spans.every(({ text }) => text.length >= 15));
  assert.ok(spans.some(({ text }) => text.endsWith('No flight.')));
  retained('x'.repeat(460));
  const spaced = retained('Mira fires sparks at detected targets.\n\nNo flight.\t No armor.');
  assert.ok(spaced.some(({ text }) => text.includes('No flight.\t No armor.')));
});

test('a wholly short source remains visible and span IDs are stable without including rules', () => {
  assert.deepEqual(retained('No flight.'), [
    { id: 'source1:0', documentId: 'E1', text: 'No flight.' },
  ]);
  const request = miraRequest();
  request.documents[0]!.text = 'No flight.';
  request.documents.push({
    ...request.documents[0]!,
    id: 'extra-source',
    text: 'Her attack requires direct visual contact.',
  });
  const spans = evidenceSpans(request);
  assert.deepEqual(spans, evidenceSpans(request));
  assert.deepEqual(
    spans.map(({ documentId }) => documentId),
    ['E1', 'extra-source'],
  );
  assert.equal(new Set(spans.map(({ id }) => id)).size, spans.length);
});

test('authoring selects bounded exact passages while preserving full input and source identity', () => {
  const request = miraRequest();
  request.documents[0]!.text = [
    'Mira is the keeper of the observatory.',
    ...Array.from({ length: 200 }, (_, i) => `The village celebrated festival number ${i}.`),
    'Her spark attack uses light beams, but cannot pass through an obstruction.',
  ].join(' ');
  request.documents.push({
    ...request.documents[0]!,
    id: 'source-limits',
    text: 'Mira cannot fly and has no healing powers.',
  });
  const original = structuredClone(request);
  const all = evidenceSpans(request);
  const selected = authorEvidence(request);
  assert.ok(selected.length < all.length);
  assert.ok(selected.reduce((size, span) => size + span.text.length, 0) <= 6_000);
  assert.ok(selected.some(({ text }) => text.startsWith('Mira is the keeper')));
  assert.ok(selected.some(({ text }) => text.includes('cannot pass through')));
  assert.ok(selected.some(({ documentId }) => documentId === 'source-limits'));
  const positions = selected.map((span) => all.findIndex(({ id }) => id === span.id));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );
  for (const span of selected)
    assert.deepEqual(
      span,
      all.find(({ id }) => id === span.id),
    );
  assert.deepEqual(selected, authorEvidence(request));
  assert.deepEqual(request, original);
});

test('small source sets reach authoring without filtering', () => {
  const request = miraRequest();
  assert.deepEqual(authorEvidence(request), evidenceSpans(request));
});

test('planned evidence caps short wiki fragments while retaining identity, signature and limitations', () => {
  const request = miraRequest();
  request.mechanicsDefinition = structuredClone(defaultMechanicsDefinition);
  request.documents[0]!.text = [
    'Mira keeps the old observatory.',
    ...Array.from({ length: 319 }, (_, index) => `Archive entry ${index} lists a festival.`),
    'Her characteristic primary attack fires a signature Spark projectile.',
    'This technique requires direct sight and cannot strike through solid walls.',
  ].join(' ');
  request.documents.push({
    ...request.documents[0]!,
    id: 'period-limits',
    text: 'Her former attack is unavailable in the current period.',
  });
  const original = structuredClone(request);
  const all = evidenceSpans(request);
  assert.ok(all.length > 96);
  assert.ok(all.reduce((total, span) => total + span.text.length, 0) < 18_000);
  const selected = authorEvidence(request);
  assert.equal(selected.length, 96);
  assert.ok(selected.reduce((total, span) => total + span.text.length, 0) <= 18_000);
  assert.ok(selected.some(({ text }) => text.startsWith('Mira keeps')));
  assert.ok(selected.some(({ text }) => text.includes('signature Spark')));
  assert.ok(selected.some(({ text }) => text.includes('cannot strike')));
  assert.ok(selected.some(({ documentId }) => documentId === 'period-limits'));
  const positions = selected.map((span) => all.findIndex(({ id }) => id === span.id));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );
  for (const span of selected)
    assert.deepEqual(
      span,
      all.find(({ id }) => id === span.id),
    );
  assert.deepEqual(authorEvidence(request), selected);
  assert.deepEqual(request, original);
});

test('planned evidence keeps its character budget even when 96 long passages would exceed it', () => {
  const request = miraRequest();
  request.mechanicsDefinition = structuredClone(defaultMechanicsDefinition);
  request.documents[0]!.text = Array.from(
    { length: 120 },
    (_, index) => `Passage ${index} describes ${'the same old village festival '.repeat(12)}.`,
  ).join(' ');
  const all = evidenceSpans(request);
  const selected = authorEvidence(request);
  assert.ok(selected.length > 0 && selected.length < 96);
  assert.ok(selected.reduce((total, span) => total + span.text.length, 0) <= 18_000);
  for (const span of selected)
    assert.deepEqual(
      span,
      all.find(({ id }) => id === span.id),
    );
});

test('planned evidence keeps technique behavior with ownership and exceptions beside repetitive inventories', () => {
  const request = miraRequest();
  request.mechanicsDefinition = structuredClone(defaultMechanicsDefinition);
  request.documents[0]!.text = [
    'Mira keeps the observatory.',
    ...Array.from(
      { length: 160 },
      (_, index) => `Skills\nFormer\nExtra skills\nInventory entry ${index}.`,
    ),
  ].join('\n\n');
  const technique = {
    ...request.documents[0]!,
    id: 'character-technique:example:Prism',
    text: [
      "Observed link on Mira's article: https://example.org/Prism",
      'Section: Skills > Former > Extra skills',
      'Link text: Prism',
      'Parent passage: Mira formerly used Prism.',
      'Former entries do not establish current availability.',
      "Other users' powers do not transfer to Mira.",
      'Prism converts stored light into colored ribbons.',
      'These ribbons bend freely around the user.',
      'They remain visible inside a dark room.',
      'However, they disappear inside a sealed crystal chamber.',
    ].join('\n\n'),
  };
  request.documents.push(technique);
  const original = structuredClone(request);
  const all = evidenceSpans(request);
  const selected = authorEvidence(request);
  assert.ok(all.length > 96);
  assert.ok(selected.length <= 96);
  assert.ok(selected.reduce((total, span) => total + span.text.length, 0) <= 18_000);
  assert.deepEqual(
    selected.filter((span) => span.documentId === technique.id),
    all.filter((span) => span.documentId === technique.id),
  );
  // Exact repeated headings can remain as context, but cannot fill the budget
  // ahead of the inventory's distinct passages or the complete technique packet.
  assert.equal(selected.filter((span) => span.text === 'Skills\nFormer\nExtra skills').length, 1);
  const positions = selected.map((span) => all.findIndex(({ id }) => id === span.id));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );
  for (const span of selected)
    assert.deepEqual(
      span,
      all.find(({ id }) => id === span.id),
    );
  assert.deepEqual(authorEvidence(request), selected);
  assert.deepEqual(request, original);
});
