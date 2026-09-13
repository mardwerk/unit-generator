import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { Type } from '@sinclair/typebox';
import { schemaIssues, type JsonSchema } from '@mardwerk/unit-core';
import {
  localizeTargetingSchema,
  MissingTargetFactsError,
  type TargetPredicate
} from '../src/mechanics/targeting.js';
import { applyDamage } from '../src/mechanics/combat.js';
import {
  applyModifiers,
  applyContactDamageModifiers,
  contactDamageModifierSchema,
  statModifierSchema,
  type ModifierProfile,
  type ModifierProvider
} from '../src/mechanics/modifiers.js';

const recipient = { id: 'recipient', x: 5, y: 0, tags: ['primary'], parentId: null };
const modifier = (patch: Partial<ModifierProfile> = {}): ModifierProfile =>
  ({
    id: 'synthetic-modifier',
    stat: 'attack.range',
    operation: 'add',
    value: 2,
    group: 'synthetic-range',
    stacking: 'unique',
    maxStacks: 1,
    radius: 5,
    includesOwner: false,
    includesSubordinates: false,
    ...patch
  }) as ModifierProfile;
const provider = (id = 'source', modifiers = [modifier()]): ModifierProvider => ({
  id,
  x: 0,
  y: 0,
  modifiers
});

const contactModifier = (patch: Partial<ModifierProfile> = {}): ModifierProfile =>
  modifier({
    stat: 'attack.damage',
    radius: null,
    includesOwner: true,
    includesSubordinates: true,
    recipientFilter: {
      kind: 'membership',
      field: 'tags',
      mode: 'all',
      values: ['synthetic-armored']
    },
    ...patch
  });

describe('contact damage uses the same modifier policy', () => {
  it('reads target tags at each contact without changing base damage or profiles', () => {
    const profiles = [contactModifier()];
    const before = structuredClone(profiles);
    const target = { ...recipient, tags: [] as string[] };
    expect(applyContactDamageModifiers(3, target, provider(), profiles).value).toBe(3);
    target.tags.push('synthetic-armored');
    expect(applyContactDamageModifiers(3, target, provider(), profiles).value).toBe(5);
    target.tags.length = 0;
    expect(applyContactDamageModifiers(3, target, provider(), profiles).value).toBe(3);
    expect(profiles).toEqual(before);
  });

  it('supports all, any and exclusion conditions without treating unknown tags as absent', () => {
    const owner = provider();
    const target = { ...recipient, tags: ['a'] };
    const all: TargetPredicate = {
      kind: 'membership',
      field: 'tags',
      mode: 'all',
      values: ['a', 'b']
    };
    const any: TargetPredicate = { ...all, mode: 'any' };
    for (const [predicate, expected] of [
      [all, 3],
      [any, 5],
      [{ kind: 'not', predicate: any }, 3]
    ] as const)
      expect(
        applyContactDamageModifiers(3, target, owner, [
          contactModifier({ recipientFilter: predicate })
        ]).value
      ).toBe(expected);
    expect(() =>
      applyContactDamageModifiers(3, { id: 'unknown', x: 0, y: 0 }, owner, [
        contactModifier({ recipientFilter: { kind: 'not', predicate: any } })
      ])
    ).toThrow(MissingTargetFactsError);
  });

  it('retains normalized set, multiply, add order and emitted-owner attribution', () => {
    const target = { ...recipient, tags: ['synthetic-armored'] };
    const owner = { id: 'emitted-owner', ownerId: 'player', x: 0, y: 0 };
    const profiles = [
      contactModifier({ id: 'add', group: 'a', value: 2 }),
      contactModifier({ id: 'multiply', group: 'm', operation: 'multiply', value: 3 }),
      contactModifier({ id: 'set', group: 'z', operation: 'set', value: 4 })
    ];
    const result = applyContactDamageModifiers(1, target, owner, profiles);
    expect(result.value).toBe(14);
    expect(result.appliedSources.map((source) => [source.providerId, source.modifierId])).toEqual([
      ['emitted-owner', 'set'],
      ['emitted-owner', 'multiply'],
      ['emitted-owner', 'add']
    ]);
    expect(applyContactDamageModifiers(1, target, owner, profiles.toReversed())).toEqual(result);
  });

  it('passes contact-time numeric facts and frozen source identity to the shared matcher', () => {
    const owner = { id: 'emitter', ownerId: 'player', x: 0, y: 0 };
    const target = { ...recipient, ownerId: 'player', contactHealth: 40 };
    const profile = contactModifier({
      recipientFilter: {
        kind: 'all',
        predicates: [
          { kind: 'source-relation', field: 'ownerId', sourceField: 'ownerId' },
          { kind: 'numeric', fact: 'health', comparison: 'gte', value: 20 }
        ]
      }
    });
    const context = { numericFact: (entity: typeof target) => entity.contactHealth };
    expect(applyContactDamageModifiers(3, target, owner, [profile], context).value).toBe(5);
    target.contactHealth = 10;
    expect(applyContactDamageModifiers(3, target, owner, [profile], context).value).toBe(3);
  });

  it('leaves vulnerability, immunity and health mutation to the existing damage resolver', () => {
    const target = {
      ...recipient,
      tags: ['synthetic-armored'],
      health: 100,
      damageTaken: { additive: 1, multiplier: 2 }
    };
    const raw = applyContactDamageModifiers(3, target, provider(), [contactModifier()]).value;
    expect(raw).toBe(5);
    expect(target.health).toBe(100);
    expect(applyDamage(target, raw).applied).toBe(12);
    expect(target.health).toBe(88);
    const immune = { ...target, invulnerable: true };
    expect(applyDamage(immune, raw).applied).toBe(0);
    expect(immune.health).toBe(88);
  });

  it('restricts schema and runtime to attack.damage and rejects untranslated source flags', () => {
    const profile = contactModifier();
    expect(Value.Check(contactDamageModifierSchema, profile)).toBe(true);
    expect(Value.Check(contactDamageModifierSchema, modifier())).toBe(false);
    expect(Value.Check(contactDamageModifierSchema, { ...profile, applyOverMaxDamage: true })).toBe(
      false
    );
    expect(() => applyContactDamageModifiers(3, recipient, provider(), [modifier()])).toThrow(
      'attack.damage'
    );
    const schema = localizeTargetingSchema(
      Type.Object({ a: contactDamageModifierSchema, b: contactDamageModifierSchema })
    );
    expect(
      schemaIssues(JSON.parse(JSON.stringify(schema)) as JsonSchema, { a: profile, b: profile })
    ).toEqual([]);
  });
});

describe('shared stat modifiers under the normalized composition policy', () => {
  it('applies set, multiply, add with stable source receipts and no input mutation', () => {
    const providers = [
      provider('z', [modifier({ operation: 'add', value: -2, group: 'add' })]),
      provider('m', [modifier({ operation: 'multiply', value: 0.5, group: 'factor' })]),
      provider('a', [modifier({ operation: 'set', value: 20, group: 'base' })])
    ];
    const before = structuredClone(providers);
    const result = applyModifiers(1, 'attack.range', recipient, providers);
    expect(result.value).toBe(8);
    expect(result.appliedSources.map((s) => s.providerId)).toEqual(['a', 'm', 'z']);
    expect(applyModifiers(1, 'attack.range', recipient, providers.toReversed())).toEqual(result);
    expect(providers).toEqual(before);
  });

  it('uses unique groups once and rejects conflicts without choosing a stronger buff', () => {
    expect(applyModifiers(10, 'attack.range', recipient, [provider('b'), provider('a')])).toEqual({
      value: 12,
      appliedSources: [
        { providerId: 'a', modifierId: 'synthetic-modifier', group: 'synthetic-range' }
      ]
    });
    for (const patch of [
      { value: 3 },
      { operation: 'multiply' as const },
      { stacking: 'stack' as const, maxStacks: 2 }
    ])
      expect(() =>
        applyModifiers(10, 'attack.range', recipient, [
          provider('a'),
          provider('b', [modifier(patch)])
        ])
      ).toThrow('Conflicting modifier group');
  });

  it('caps explicitly stackable effects and deterministically reports the selected sources', () => {
    const providers = Array.from({ length: 8 }, (_, i) =>
      provider(`source-${i}`, [modifier({ stacking: 'stack', maxStacks: 5 })])
    ).reverse();
    const result = applyModifiers(10, 'attack.range', recipient, providers);
    expect(result.value).toBe(20);
    expect(result.appliedSources.map((s) => s.providerId)).toEqual([
      'source-0',
      'source-1',
      'source-2',
      'source-3',
      'source-4'
    ]);
    expect(applyModifiers(10, 'attack.range', recipient, providers.slice(0, 2)).value).toBe(14);
  });

  it('uses an inclusive radius and recomputes range, movement, removal and expiry each call', () => {
    const source = provider();
    expect(applyModifiers(10, 'attack.range', recipient, [source]).value).toBe(12);
    source.x = -0.001;
    expect(applyModifiers(10, 'attack.range', recipient, [source]).value).toBe(10);
    source.modifiers = [modifier({ radius: null })];
    expect(applyModifiers(10, 'attack.range', recipient, [source]).value).toBe(12);
    source.active = false;
    expect(applyModifiers(10, 'attack.range', recipient, [source]).value).toBe(10);
    expect(applyModifiers(10, 'attack.range', recipient, []).value).toBe(10);
    source.active = true;
    expect(applyModifiers(10, 'attack.range', recipient, [source]).value).toBe(12);
  });

  it('separately controls the provider itself and direct subordinates through parentId', () => {
    const source = provider();
    expect(applyModifiers(10, 'attack.range', source, [source]).value).toBe(10);
    const child = { ...recipient, parentId: source.id };
    expect(applyModifiers(10, 'attack.range', child, [source]).value).toBe(10);
    expect(() =>
      applyModifiers(
        10,
        'attack.range',
        {
          id: 'unknown-parent',
          x: 0,
          y: 0,
          ownerId: 'player'
        },
        [source]
      )
    ).toThrow(MissingTargetFactsError);
    // ownerId can identify a player and does not establish a subtower relationship.
    expect(
      applyModifiers(10, 'attack.range', { ...recipient, ownerId: source.id }, [source]).value
    ).toBe(12);
    source.modifiers = [modifier({ includesOwner: true, includesSubordinates: true })];
    expect(applyModifiers(10, 'attack.range', source, [source]).value).toBe(12);
    expect(applyModifiers(10, 'attack.range', child, [source]).value).toBe(12);
    expect(
      applyModifiers(
        10,
        'attack.range',
        {
          id: 'unknown-parent',
          x: 0,
          y: 0
        },
        [source]
      ).value
    ).toBe(12);
  });

  it('shares targeting predicates and refuses unknown recipient facts', () => {
    const source = provider('source', [
      modifier({
        recipientFilter: {
          kind: 'all',
          predicates: [
            { kind: 'membership', field: 'tags', mode: 'any', values: ['primary'] },
            { kind: 'source-relation', field: 'ownerId', sourceField: 'ownerId' }
          ]
        }
      })
    ]);
    source.ownerId = 'player';
    expect(
      applyModifiers(10, 'attack.range', { ...recipient, ownerId: 'player' }, [source]).value
    ).toBe(12);
    expect(
      applyModifiers(10, 'attack.range', { ...recipient, ownerId: 'other' }, [source]).value
    ).toBe(10);
    expect(() => applyModifiers(10, 'attack.range', recipient, [source])).toThrow(
      MissingTargetFactsError
    );
  });

  it('handles canonical numeric stats independently and grants boolean detection', () => {
    for (const stat of [
      'attack.damage',
      'attack.intervalSeconds',
      'attack.range',
      'attack.pierce',
      'ability.cooldownSeconds',
      'income.amount',
      'progression.xpMultiplier',
      'purchase.cost'
    ] as const) {
      const source = provider('source', [modifier({ stat, operation: 'multiply', value: 0.8 })]);
      expect(applyModifiers(10, stat, recipient, [source]).value).toBe(8);
      expect(applyModifiers(false, 'attack.detectConcealed', recipient, [source]).value).toBe(
        false
      );
    }
    const source = provider('source', [
      modifier({ stat: 'attack.detectConcealed', operation: 'set', value: true })
    ]);
    expect(applyModifiers(false, 'attack.detectConcealed', recipient, [source]).value).toBe(true);
  });

  it('validates boolean operations, numeric domains, caps, IDs and local positions', () => {
    for (const patch of [
      { stat: 'attack.detectConcealed', value: true, operation: 'add' },
      { value: true },
      { value: NaN },
      { value: Infinity },
      { radius: -1 },
      { maxStacks: 0 },
      { maxStacks: 1.5 },
      { maxStacks: 2 },
      { operation: 'multiply', value: -1 }
    ]) {
      const invalid = modifier(patch as Partial<ModifierProfile>);
      expect(() =>
        applyModifiers(10, 'attack.range', recipient, [provider('source', [invalid])])
      ).toThrow();
    }
    expect(() => applyModifiers(-1, 'attack.range', recipient, [])).toThrow();
    expect(() =>
      applyModifiers(1, 'attack.intervalSeconds', recipient, [
        provider('source', [
          modifier({ stat: 'attack.intervalSeconds', operation: 'multiply', value: 0 })
        ])
      ])
    ).toThrow('positive');
    expect(() => applyModifiers(1, 'attack.range', recipient, [provider(), provider()])).toThrow(
      'unique IDs'
    );
    expect(() =>
      applyModifiers(1, 'attack.range', recipient, [provider('source', [modifier(), modifier()])])
    ).toThrow('duplicate');
    expect(() => applyModifiers(1, 'attack.range', { ...recipient, x: NaN }, [provider()])).toThrow(
      'finite'
    );
    expect(() =>
      applyModifiers(Number.MAX_VALUE, 'attack.range', recipient, [
        provider('source', [modifier({ operation: 'multiply', value: 2 })])
      ])
    ).toThrow('finite');
  });

  it('localizes repeated nested target schemas for strict serialized validation', () => {
    const profile = modifier({
      recipientFilter: { kind: 'not', predicate: { kind: 'constant', value: false } }
    });
    expect(Value.Check(statModifierSchema, profile)).toBe(true);
    const schema = localizeTargetingSchema(
      Type.Object({ a: statModifierSchema, b: statModifierSchema })
    );
    expect(
      schemaIssues(JSON.parse(JSON.stringify(schema)) as JsonSchema, { a: profile, b: profile })
    ).toEqual([]);
    expect(Value.Check(statModifierSchema, { ...profile, extra: true })).toBe(false);
  });
});

// Source files stay private. Captured scalars are executed under this module's explicit
// normalized policy. These checks do not establish native phase order or mixed-buff math.
const villageFile = process.env.BTD6_MODIFIER_VILLAGE_REFERENCE_FILE;
const skywardenFile = process.env.BTD6_MODIFIER_SKYWARDEN_REFERENCE_FILE;
const contactFile = process.env.BTD6_MODIFIER_CONTACT_REFERENCE_FILE;
it.skipIf(!contactFile)(
  'executes captured tag damage scalars with explicit normalized phases',
  () => {
    const source = JSON.parse(readFileSync(contactFile!, 'utf8')) as {
      behaviors: { weapons?: { projectile: { behaviors: Record<string, unknown>[] } }[] }[];
    };
    const fields = source.behaviors[13]!.weapons![0]!.projectile.behaviors.find((node) =>
      String(node.$type).includes('.DamageModifierForTagModel,')
    )!;
    expect(fields).toBeDefined();
    // These are qualification guards. The generic helper does not implement native
    // collision passes or max-damage exceptions from untranslated source flags.
    expect(fields.applyOverMaxDamage).toBe(false);
    expect(fields.ignoreTag).toBe(false);
    expect(fields.collisionPass).toBe(0);
    const values = fields.tags as string[];
    const predicate: TargetPredicate = {
      kind: 'membership',
      field: 'tags',
      mode: fields.mustIncludeAllTags ? 'all' : 'any',
      values
    };
    const execute = (tags: string[], additive: number, factor: number) =>
      applyContactDamageModifiers(3, { ...recipient, tags }, provider('captured-owner'), [
        contactModifier({
          id: 'captured-factor',
          group: 'captured-factor',
          operation: 'multiply',
          value: factor,
          recipientFilter: predicate
        }),
        contactModifier({
          id: 'captured-add',
          group: 'captured-add',
          value: additive,
          recipientFilter: predicate
        })
      ]).value;
    const additive = fields.damageAddative as number,
      factor = fields.damageMultiplier as number;
    expect(execute([], additive, factor)).toBe(3);
    expect(execute(values, additive, factor)).toBe(3 * factor + additive);
    expect(execute(values, additive + 1, factor)).toBe(3 * factor + additive + 1);
    expect(execute(values, additive, factor * 2)).toBe(3 * factor * 2 + additive);
  }
);
it.skipIf(!villageFile)('executes captured rate multiplier and responds to its mutation', () => {
  const source = JSON.parse(readFileSync(villageFile!, 'utf8')) as {
    behaviors: Record<string, unknown>[];
  };
  const rate = source.behaviors.find((node) => String(node.$type).includes('.RateSupportModel,'))!;
  expect(rate).toBeDefined();
  const execute = (factor: number) =>
    applyModifiers(10, 'attack.intervalSeconds', recipient, [
      provider('captured', [
        modifier({
          stat: 'attack.intervalSeconds',
          operation: 'multiply',
          value: factor,
          group: rate.mutatorId as string,
          stacking: rate.isUnique ? 'unique' : 'stack',
          maxStacks: 1,
          includesOwner: rate.appliesToOwningTower as boolean
        })
      ])
    ]).value;
  expect(execute(rate.multiplier as number)).toBe(10 * (rate.multiplier as number));
  expect(execute((rate.multiplier as number) / 2)).toBe(execute(rate.multiplier as number) / 2);
});
it.skipIf(!skywardenFile)(
  'executes captured additive range and stack cap with source mutations',
  () => {
    const source = JSON.parse(readFileSync(skywardenFile!, 'utf8')) as {
      behaviors: Record<string, unknown>[];
    };
    const range = source.behaviors.find(
      (node) => String(node.$type).includes('.RangeSupportModel,') && node.isUnique === false
    )!;
    expect(range).toBeDefined();
    const execute = (additive: number, maxStacks: number) =>
      applyModifiers(
        10,
        'attack.range',
        recipient,
        Array.from({ length: 8 }, (_, i) =>
          provider(`captured-${i}`, [
            modifier({
              value: additive,
              group: range.mutatorId as string,
              stacking: range.isUnique ? 'unique' : 'stack',
              maxStacks,
              includesOwner: range.appliesToOwningTower as boolean,
              includesSubordinates: !(range.excludeAddToSubtower as boolean)
            })
          ])
        )
      ).value;
    const additive = range.additive as number,
      maxStacks = range.maxStacks as number;
    expect(execute(additive, maxStacks)).toBe(10 + additive * maxStacks);
    expect(execute(additive + 1, maxStacks)).toBe(10 + (additive + 1) * maxStacks);
    expect(execute(additive, maxStacks - 1)).toBe(10 + additive * (maxStacks - 1));
  }
);
