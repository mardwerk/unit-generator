import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clusterOf,
  deriveIntel,
  extractTechniques,
  intelIssues,
  weaknessHint,
  type Intel,
} from '../src/core/index.js';

type Request = Parameters<typeof deriveIntel>[0];

function request(): Request {
  return {
    documents: [
      {
        id: 'character-reference',
        kind: 'source',
        text: 'Natsu is a cheerful mage of the Fairy Tail guild. He suffers motion sickness on any transportation.',
      },
      {
        id: 'character-technique:wiki:Fire_Dragons_Roar',
        kind: 'source',
        text: [
          'Link text: Fire Dragon Roar',
          'Natsu gathers flames in his mouth and releases a destructive breath blast.',
          'The roar can sweep across a wide field in a continuous stream.',
        ].join('\n'),
      },
      {
        id: 'character-technique:wiki:Iron_Fist',
        kind: 'source',
        text: [
          'Link text: Iron Fist',
          'Natsu engulfs his fists in flames and punches the target at close range.',
        ].join('\n'),
      },
      {
        id: 'character-technique:wiki:Dragon_Force',
        kind: 'source',
        text: [
          'Link text: Dragon Force',
          'This transformation mode greatly enhances strength and speed but drains magic power afterward.',
        ].join('\n'),
      },
      {
        id: 'character-technique:wiki:Phoenix_Blade',
        kind: 'source',
        text: [
          'Link text: Phoenix Blade',
          'A secret art finisher usable only while in Dragon Force, trading explosive power for piercing force.',
        ].join('\n'),
      },
      {
        id: 'character-technique:wiki:Fire_Eating',
        kind: 'source',
        text: [
          'Link text: Fire Eating',
          'Natsu consumes ambient flames to replenish his magic reserves during a fight.',
        ].join('\n'),
      },
    ],
  } as unknown as Request;
}

describe('technique intel', () => {
  it('extracts named techniques while skipping link headers', () => {
    const items = extractTechniques(request());
    assert.ok(items.length >= 5);
    assert.ok(
      items.every(
        (item) => !/^(Section|Link text|Observed link|Ownership|Parent passage):/.test(item.text),
      ),
    );
    assert.ok(items.some((item) => item.name === 'Fire Dragon Roar'));
  });

  it('clusters signatures into breath, melee, finisher, mode and consume', () => {
    assert.equal(clusterOf('releases a destructive breath blast from his mouth'), 'breath');
    assert.equal(clusterOf('engulfs his fists in flames and punches'), 'melee');
    assert.equal(clusterOf('a secret art finisher for piercing force'), 'finisher');
    assert.equal(clusterOf('transformation mode enhances strength'), 'mode');
    assert.equal(clusterOf('consumes ambient flames to replenish reserves'), 'consume');
    assert.equal(clusterOf('teleports behind the target instantly'), 'mobility');
    assert.equal(clusterOf('a cheerful day at the guild hall'), null);
  });

  it('derives breath-led base shape, path briefs, weakness and proposals', () => {
    const intel = deriveIntel(request());
    assert.ok(intel);
    assert.deepEqual(intel.baseShape, {
      delivery: 'area',
      damageType: 'energy',
      targeting: 'first',
    });
    assert.equal(intel.rangeCap, null);
    assert.ok(intel.weaknessHint?.includes('motion sickness'));
    assert.ok(intel.pathBriefs[1].includes('Dragon Force'));
    assert.ok(intel.pathBriefs[1].includes('Phoenix Blade'));
    assert.ok(intel.proposals.some((p) => p.name === 'Fire Eating'));
    assert.ok(!intel.proposals.some((p) => p.name === 'Fire Dragon Roar'));
  });

  it('keeps assigned techniques out of economy proposals with a cluster fallback', () => {
    const doc = (id: string, name: string, text: string) => ({
      id,
      kind: 'source',
      text: `Link text: ${name}\n${text}`,
    });
    const req = {
      documents: [
        doc(
          'character-technique:w:Roar',
          'Fire Roar',
          'The warrior releases a destructive breath blast from his mouth.',
        ),
        doc(
          'character-technique:w:Eat',
          'Fire Roar',
          'He consumes ambient flames to replenish reserves. He releases a destructive breath blast from his mouth.',
        ),
      ],
    } as unknown as Request;
    const intel = deriveIntel(req)!;
    assert.ok(intel.proposals.some((p) => p.name === 'Element consumption loop'));
  });

  it('requires repeated energy evidence before overriding damage type', () => {
    const doc = (id: string, text: string) => ({ id, kind: 'source', text });
    const single = {
      documents: [
        doc(
          'character-technique:w:Sword',
          'Link text: Sword\nA swift steel cut channels spirit energy once.',
        ),
      ],
    } as unknown as Request;
    assert.equal(deriveIntel(single)?.baseShape, null);
    const repeated = {
      documents: [
        doc(
          'character-technique:w:Bolt',
          'Link text: Bolt\nWreathes fists in fire and magic ki energy burn.',
        ),
      ],
    } as unknown as Request;
    assert.equal(deriveIntel(repeated)?.baseShape?.damageType, 'energy');
  });

  it('returns null without technique documents', () => {
    const empty = {
      documents: [{ id: 'bio', kind: 'source', text: 'A cheerful mage.' }],
    } as unknown as Request;
    assert.equal(deriveIntel(empty), null);
  });

  it('gates evidence-directed base shape and melee reach', () => {
    const intel = deriveIntel(request())!;
    const good = {
      baseAttack: {
        delivery: 'area',
        damageType: 'energy',
        targeting: 'first',
        stats: { range: 38 },
      },
    };
    assert.deepEqual(intelIssues(good as never, intel), []);
    const wrong = {
      baseAttack: {
        delivery: 'projectile',
        damageType: 'sharp',
        targeting: 'first',
        stats: { range: 38 },
      },
    };
    assert.ok(intelIssues(wrong as never, intel).some((i) => i.includes('delivery')));
    const melee: Intel = { ...intel, rangeCap: 25 };
    const far = {
      baseAttack: {
        delivery: 'area',
        damageType: 'energy',
        targeting: 'first',
        stats: { range: 40 },
      },
    };
    assert.ok(intelIssues(far as never, melee).some((i) => i.includes('melee reach')));
  });

  it('finds weakness limits in source prose', () => {
    assert.ok(weaknessHint(request())?.includes('motion sickness'));
    const plain = {
      documents: [{ id: 'bio', kind: 'source', text: 'A cheerful mage of the guild.' }],
    } as unknown as Request;
    assert.equal(weaknessHint(plain), null);
  });
});
