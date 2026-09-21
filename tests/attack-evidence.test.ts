import assert from 'node:assert/strict';
import test from 'node:test';
import { attackEvidenceCandidates } from '../src/core/blueprint/attack-evidence.js';
import { authorEvidence } from '../src/core/blueprint/evidence.js';
import { miraRequest } from './fixtures/core-fixtures.js';

function request(text: string) {
  const value = miraRequest();
  value.documents = value.documents.filter((document) => document.kind === 'source');
  value.documents[0]!.text = text;
  return value;
}

test('five concrete attack families retain stable IDs and exact full source passages', () => {
  for (const [modality, text] of [
    ['physical-impact', 'Mira uses Hammer Punch to strike enemies with a heavy physical punch.'],
    [
      'sharp-projectile',
      'Mira uses Water Blade to launch water at extreme pressure as a cutting blade.',
    ],
    ['nonburn-energy', 'Mira fires Spark as a concentrated concussive energy beam.'],
    ['fire', 'Mira projects Fire Wave, a flame attack that burns enemies.'],
    ['area-control', 'Mira uses Frost Field to freeze enemies across a surrounding area.'],
  ]) {
    const value = request(text!);
    const before = structuredClone(value);
    const span = authorEvidence(value)[0]!;
    assert.deepEqual(attackEvidenceCandidates(value), [
      {
        id: `${span.id}/${modality}`,
        sourceId: span.id,
        documentId: span.documentId,
        text: span.text,
        modality,
      },
    ]);
    assert.deepEqual(value, before);
  }
});

test('frozen sparse biography excerpts and bare skill names establish no attack candidates', () => {
  // Exact excerpts from the sparse Kakashi and Rimuru benchmark source documents.
  for (const text of [
    'He is voiced by Kazuhiko Inoue in the Japanese anime, and by Dave Wittenberg in English.',
    "Kakashi was a very vital key for Naruto's success, training him to be a great ninja.",
    'As a slime, Rimuru initially struggles to survive in this new world, but soon discovers that he has the power to absorb and mimic the abilities of any creature he consumes, eventually gaining an androgynous human form that resembles a younger version of Shizue Izawa.',
    'He eventually evolves into a Demon Lord and becomes a member of the Octagram after defeating rogue Demon Lord Clayman.',
    'Black Flame (Absorbed into Black Flame-Thunder)',
    'Skills\nFormer\nUltimate skills',
    'Hammer Punch and Fire Wave',
    'Mira is voiced by Fire Beam in the English adaptation.',
  ])
    assert.deepEqual(attackEvidenceCandidates(request(text)), [], text);
});

test('behavior descriptions can qualify without technique names or copied Unicode', () => {
  for (const [modality, text] of [
    ['physical-impact', 'His signature attack is a punch, called 技.'],
    ['sharp-projectile', 'She fires arrows at distant targets.'],
    [
      'nonburn-energy',
      'The Kamehameha is a concentration of energy, released as a concussive beam.',
    ],
    ['fire', 'Black Flame: Flame from the body.'],
    [
      'area-control',
      "Her specialty is freezing magic, and she can freeze a person's consciousness.",
    ],
  ])
    assert.ok(
      attackEvidenceCandidates(request(text!)).some((entry) => entry.modality === modality),
      text,
    );
  assert.deepEqual(
    attackEvidenceCandidates(request('She releases a burning energy beam.')).map(
      (entry) => entry.modality,
    ),
    ['fire'],
  );
});

test('flame resistance and nullification inventories are not attacks', () => {
  for (const text of [
    'Flame Attack Nullification (Absorbed into Thermal Fluctuation Nullification)',
    'Flame Attack Resistance (Absorbed into Thermal Fluctuation Resistance)',
    'Flame Attack',
    'Former skills: Flame Attack',
  ])
    assert.deepEqual(attackEvidenceCandidates(request(text)), [], text);
  for (const text of [
    'She projects flames toward nearby enemies.',
    'She produces super-heated flames from internal energy.',
    'Black Flame: Flame from the body.',
  ])
    assert.deepEqual(
      attackEvidenceCandidates(request(text)).map((entry) => entry.modality),
      ['fire'],
      text,
    );
});

test('lexical eligibility deliberately does not certify actor attribution or negation', () => {
  for (const text of [
    'Her brother fires a concussive energy beam.',
    'Mira cannot fire a concussive energy beam.',
  ]) {
    assert.equal(attackEvidenceCandidates(request(text))[0]?.modality, 'nonburn-energy');
  }
});
