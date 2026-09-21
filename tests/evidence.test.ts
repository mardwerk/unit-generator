import assert from 'node:assert/strict';
import test from 'node:test';
import { authorEvidence, evidenceSpans } from '../src/core/blueprint/evidence.js';
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

test('authoring caps long sources at 6000 characters while keeping identity first', () => {
  const request = miraRequest();
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
  assert.ok(all.reduce((total, span) => total + span.text.length, 0) > 6_000);
  const selected = authorEvidence(request);
  assert.ok(selected.length > 0 && selected.length < all.length);
  assert.ok(selected.reduce((total, span) => total + span.text.length, 0) <= 6_000);
  assert.ok(selected.some(({ text }) => text.startsWith('Mira keeps')));
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

test('authoring keeps its character budget when many long passages exceed it', () => {
  const request = miraRequest();
  request.documents[0]!.text = Array.from(
    { length: 120 },
    (_, index) => `Passage ${index} describes ${'the same old village festival '.repeat(12)}.`,
  ).join(' ');
  const all = evidenceSpans(request);
  const selected = authorEvidence(request);
  assert.ok(selected.length > 0 && selected.length < all.length);
  assert.ok(selected.reduce((total, span) => total + span.text.length, 0) <= 6_000);
  for (const span of selected)
    assert.deepEqual(
      span,
      all.find(({ id }) => id === span.id),
    );
});

test('authoring applies no span count cap to short passages', () => {
  const request = miraRequest();
  request.documents[0]!.text = Array.from(
    { length: 110 },
    (_, index) => `Festival record number ${index}.`,
  ).join(' ');
  assert.equal(authorEvidence(request).length, 110);
  assert.deepEqual(authorEvidence(request), evidenceSpans(request));
});
