import { describe, expect, it } from 'vitest';
import { Type } from '@sinclair/typebox';
import { schemaIssues, type JsonSchema } from '@mardwerk/unit-core';
import {
  compileTargetPredicate,
  compileTargetSelection,
  MissingTargetFactsError,
  localizeTargetingSchema,
  targetSelectionSchema,
  targetSelectionJsonSchema,
  type TargetEntity,
  type TargetPredicate,
  type TargetSelection
} from '../src/mechanics/targeting.js';
import { blocked } from '../src/mechanics/geometry.js';
import { emitProjectile } from '../src/mechanics/projectiles.js';
import { createMechanicsScheduler } from '../src/mechanics/scheduler.js';

const origin = { x: 0, y: 0 };
const entity: TargetEntity = {
  id: 'enemy',
  x: 10,
  y: 0,
  health: 20,
  tags: ['Moabs', 'fortified'],
  properties: ['lead'],
  mutators: [],
  concealed: false,
  invulnerable: false
};
const selection = (
  by: TargetSelection['order'][number]['by'],
  direction: 'asc' | 'desc'
): TargetSelection => ({
  order: [{ by, direction }],
  tieBreak: 'id-ascending',
  limit: 1
});

describe('shared target predicates', () => {
  it('uses the shared projectile eligibility callback without treating damage immunity as a missed contact', () => {
    const contactFilter = compileTargetPredicate({
      kind: 'not',
      predicate: {
        kind: 'membership',
        field: 'tags',
        values: ['off-track'],
        mode: 'any'
      }
    });
    const damageFilter = compileTargetPredicate({
      kind: 'not',
      predicate: {
        kind: 'membership',
        field: 'properties',
        values: ['lead'],
        mode: 'any'
      }
    });
    const targets = [
      { ...entity, id: 'excluded', x: 2, tags: ['off-track'], properties: [] },
      { ...entity, id: 'immune', x: 5 },
      { ...entity, id: 'beyond', x: 8, properties: [] }
    ];
    const scheduler = createMechanicsScheduler();
    const contacts: string[] = [];
    const actor = emitProjectile({
      projectile: {
        id: 'shot',
        damage: 3,
        detectConcealed: false,
        radius: 0,
        pierce: 1,
        flight: { kind: 'straight', speed: 10, lifetimeSeconds: 1 }
      },
      origin,
      aim: targets[2]!,
      targets: () => targets,
      scheduler,
      eligible: (_, target) => contactFilter.test(target),
      onContact: ({ target }) => {
        contacts.push(target.id);
        if (damageFilter.test(target)) target.health -= 3;
      }
    });
    scheduler.advance(1, true);
    expect(contacts).toEqual(['immune']);
    expect(targets.map((target) => target.health)).toEqual([20, 20, 20]);
    expect(actor.alive).toBe(false);
  });
  it('exports repeated recursive filters as self-contained JSON schemas', () => {
    const policy = {
      ...selection('distance', 'asc'),
      filter: {
        kind: 'not',
        predicate: { kind: 'membership', field: 'tags', mode: 'any', values: ['Moabs'] }
      }
    };
    expect(schemaIssues(JSON.parse(JSON.stringify(targetSelectionJsonSchema)), policy)).toEqual([]);
    const schema = localizeTargetingSchema(
      Type.Object({ first: targetSelectionSchema, second: targetSelectionSchema })
    );
    expect(schemaIssues(schema as JsonSchema, { first: policy, second: policy })).toEqual([]);
    expect(
      schemaIssues(schema as JsonSchema, {
        first: policy,
        second: { ...policy, filter: { kind: 'not', predicate: { kind: 'guessed' } } }
      }).length
    ).toBeGreaterThan(0);
    expect(localizeTargetingSchema(schema)).toEqual(schema);
  });
  it('composes positive and negative tags without confusing damage immunity with selection', () => {
    // FilterWithTag inclusive/exclusive and DamageModel properties have separate owners.
    const attack = compileTargetPredicate({
      kind: 'all',
      predicates: [
        { kind: 'membership', field: 'tags', values: ['Moabs'], mode: 'any' },
        {
          kind: 'not',
          predicate: { kind: 'membership', field: 'tags', values: ['camo'], mode: 'any' }
        }
      ]
    });
    const damage = compileTargetPredicate({
      kind: 'not',
      predicate: {
        kind: 'membership',
        field: 'properties',
        values: ['lead', 'frozen'],
        mode: 'any'
      }
    });
    expect(attack.test(entity)).toBe(true);
    expect(damage.test(entity)).toBe(false);
    expect(attack.test({ ...entity, tags: ['Moabs', 'camo'] })).toBe(false);
    expect(damage.test({ ...entity, properties: [] })).toBe(true);
  });

  it('supports conditional tag exclusions disabled by an explicitly present support mutator', () => {
    const predicate = compileTargetPredicate({
      kind: 'any',
      predicates: [
        { kind: 'membership', field: 'mutators', values: ['allow-moab'], mode: 'any' },
        {
          kind: 'not',
          predicate: { kind: 'membership', field: 'tags', values: ['Moabs'], mode: 'any' }
        }
      ]
    });
    expect(predicate.test(entity)).toBe(false);
    expect(predicate.test({ ...entity, mutators: ['allow-moab'] })).toBe(true);
    expect(predicate.test({ ...entity, tags: [] })).toBe(true);
  });

  it('never turns unknown data into a passing negation or alternative', () => {
    const tag: TargetPredicate = {
      kind: 'membership',
      field: 'tags',
      values: ['Moabs'],
      mode: 'all'
    };
    const unknown = { id: 'unknown', x: 0, y: 0 };
    for (const predicate of [
      tag,
      { kind: 'not', predicate: tag },
      {
        kind: 'any',
        predicates: [{ kind: 'constant', value: true }, tag]
      }
    ]) {
      const compiled = compileTargetPredicate(predicate);
      expect(compiled.evaluate(unknown)).toEqual({ matches: false, missingFacts: ['tags'] });
      expect(() => compiled.test(unknown)).toThrow(MissingTargetFactsError);
    }
    expect(compileTargetPredicate(tag).test({ ...unknown, tags: [] })).toBe(false);
    expect(
      compileTargetPredicate({ kind: 'not', predicate: tag }).test({ ...unknown, tags: [] })
    ).toBe(true);
  });

  it('matches ownership, tower families and tier requirements independently', () => {
    const compiled = compileTargetPredicate({
      kind: 'all',
      predicates: [
        { kind: 'source-relation', field: 'ownerId', sourceField: 'ownerId' },
        { kind: 'not', predicate: { kind: 'source-relation', field: 'id', sourceField: 'id' } },
        { kind: 'identity', field: 'baseId', values: ['DartMonkey', 'BoomerangMonkey'] },
        { kind: 'numeric', fact: 'tier-3', comparison: 'gte', value: 3 }
      ]
    });
    const tower = { id: 'tower', x: 0, y: 0, ownerId: 'player-1', baseId: 'DartMonkey' };
    const context = {
      source: { id: 'village', x: 0, y: 0, ownerId: 'player-1' },
      numericFact: () => 3
    };
    expect(compiled.test(tower, context)).toBe(true);
    expect(compiled.test({ ...tower, ownerId: 'player-2' }, context)).toBe(false);
    expect(compiled.test(tower, { ...context, numericFact: () => 2 })).toBe(false);
  });

  it('distinguishes a known root actor from unknown parentage under exclusions', () => {
    const context = { source: { id: 'provider', x: 0, y: 0 } };
    const exclusion = compileTargetPredicate({
      kind: 'not',
      predicate: {
        kind: 'source-relation',
        field: 'parentId',
        sourceField: 'id'
      }
    });
    expect(exclusion.test({ ...entity, parentId: null }, context)).toBe(true);
    expect(exclusion.test({ ...entity, parentId: 'provider' }, context)).toBe(false);
    expect(exclusion.test({ ...entity, parentId: 'other' }, context)).toBe(true);
    expect(exclusion.evaluate(entity, context)).toEqual({
      matches: false,
      missingFacts: ['parentId']
    });
    const identity = compileTargetPredicate({
      kind: 'identity',
      field: 'parentId',
      values: ['provider']
    });
    expect(identity.test({ ...entity, parentId: null })).toBe(false);
    expect(() => identity.test(entity)).toThrow(MissingTargetFactsError);
  });

  it('uses explicit boolean and external facts instead of implicit missing-false defaults', () => {
    const concealed = compileTargetPredicate({ kind: 'boolean', fact: 'concealed', value: false });
    expect(concealed.test(entity)).toBe(true);
    expect(concealed.evaluate({ id: 'unknown', x: 0, y: 0 }).missingFacts).toEqual(['concealed']);
    expect(concealed.evaluate(entity, { booleanFact: () => undefined }).missingFacts).toEqual([
      'concealed'
    ]);
    const onTrack = compileTargetPredicate({ kind: 'boolean', fact: 'on-track', value: true });
    expect(onTrack.test(entity, { booleanFact: (_, fact) => fact === 'on-track' })).toBe(true);
    expect(onTrack.evaluate(entity).missingFacts).toEqual(['on-track']);
  });

  it('honors inclusive range and cone boundaries and delegates line of sight', () => {
    const range = compileTargetPredicate({ kind: 'range', minimum: 5, maximum: 10 });
    expect(range.test(entity, { origin })).toBe(true);
    expect(range.test({ ...entity, x: 5 }, { origin })).toBe(true);
    expect(range.test({ ...entity, x: 10.001 }, { origin })).toBe(false);
    const cone = compileTargetPredicate({ kind: 'cone', degrees: 90, offsetDegrees: 0 });
    expect(cone.test({ ...entity, x: 1, y: 1 }, { origin, headingDegrees: 0 })).toBe(true);
    expect(cone.test({ ...entity, x: 1, y: 1.001 }, { origin, headingDegrees: 0 })).toBe(false);
    expect(cone.test(entity, { origin, headingDegrees: 360 })).toBe(true);
    const sight = compileTargetPredicate({ kind: 'line-of-sight' });
    expect(sight.evaluate(entity, { origin }).missingFacts).toEqual(['line-of-sight']);
    const wall = [{ x1: 5, y1: -1, x2: 5, y2: 1 }];
    expect(
      sight.test(entity, { origin, lineOfSight: (from, target) => !blocked(from, target, wall) })
    ).toBe(false);
    expect(
      sight.test(
        { ...entity, y: 10 },
        { origin, lineOfSight: (from, target) => !blocked(from, target, wall) }
      )
    ).toBe(true);
  });

  it('rejects unknown fields, inverted ranges, malformed policies and recursive inputs', () => {
    for (const input of [
      { kind: 'source-class', class: 'FilterBadImmunityModel' },
      { kind: 'constant', value: true, unsupported: true },
      { kind: 'boolean', fact: 'guessed-property', value: true },
      { kind: 'range', minimum: 10, maximum: 5 },
      { kind: 'numeric', fact: 'strength', comparison: 'gte', value: NaN },
      { kind: 'all', predicates: [] }
    ])
      expect(() => compileTargetPredicate(input)).toThrow();
    const cycle: { kind: string; predicate?: unknown } = { kind: 'not' };
    cycle.predicate = cycle;
    expect(() => compileTargetPredicate(cycle)).toThrow('cycles');
    let nested: TargetPredicate = { kind: 'constant', value: true };
    for (let i = 0; i < 17; i++) nested = { kind: 'not', predicate: nested };
    expect(() => compileTargetPredicate(nested)).toThrow('nesting');
    const input = { kind: 'constant', value: true };
    const compiled = compileTargetPredicate(input);
    input.value = false;
    expect(compiled.test(entity)).toBe(true);
  });
});

describe('shared target selection', () => {
  const targets = [
    { ...entity, id: 'first', x: 20, health: 10, progress: 0.9, strength: 3 },
    { ...entity, id: 'last', x: 10, health: 50, progress: 0.1, strength: 4 },
    { ...entity, id: 'close', x: 2, health: 30, progress: 0.4, strength: 2 },
    { ...entity, id: 'strong', x: 15, health: 1, progress: 0.5, strength: 100 }
  ];
  const context = {
    origin,
    numericFact: (target: (typeof targets)[number], fact: string) =>
      fact === 'path-progress'
        ? target.progress
        : fact === 'strength'
          ? target.strength
          : target.health
  };
  it('distinguishes first, last, close and source-supplied strength rather than substituting health', () => {
    expect(
      compileTargetSelection(selection('path-progress', 'desc')).select(targets, context)[0]?.id
    ).toBe('first');
    expect(
      compileTargetSelection(selection('path-progress', 'asc')).select(targets, context)[0]?.id
    ).toBe('last');
    expect(
      compileTargetSelection(selection('distance', 'asc')).select(targets, context)[0]?.id
    ).toBe('close');
    expect(
      compileTargetSelection(selection('strength', 'desc')).select(targets, context)[0]?.id
    ).toBe('strong');
    expect(
      compileTargetSelection(selection('health', 'desc')).select(targets, context)[0]?.id
    ).toBe('last');
  });

  it('filters first, then applies preferences with deterministic fallback and codepoint ID ties', () => {
    const policy: TargetSelection = {
      ...selection('distance', 'asc'),
      filter: { kind: 'boolean', fact: 'invulnerable', value: false },
      preferences: [{ kind: 'membership', field: 'tags', values: ['camo'], mode: 'any' }],
      limit: 3
    };
    const candidates = [
      { ...entity, id: 'a', x: 1, tags: [] },
      { ...entity, id: 'B', x: 1, tags: [] },
      { ...entity, id: 'priority', x: 20, tags: ['camo'] },
      { ...entity, id: 'invalid', x: 0, invulnerable: true, tags: ['camo'] }
    ];
    const compiled = compileTargetSelection(policy);
    expect(compiled.select(candidates, { origin }).map((t) => t.id)).toEqual([
      'priority',
      'B',
      'a'
    ]);
    expect(compiled.select([...candidates].reverse(), { origin }).map((t) => t.id)).toEqual([
      'priority',
      'B',
      'a'
    ]);
    expect(
      compiled
        .select(
          candidates.filter((t) => t.id !== 'priority'),
          { origin }
        )
        .map((t) => t.id)
    ).toEqual(['B', 'a']);
    expect(compiled.select(candidates, { origin })[0]).toBe(candidates[2]);
  });

  it('evaluates an elite progress threshold explicitly without embedding a source-name heuristic', () => {
    const policy: TargetSelection = {
      ...selection('strength', 'desc'),
      preferences: [{ kind: 'numeric', fact: 'path-progress', comparison: 'gte', value: 0.75 }]
    };
    const compiled = compileTargetSelection(policy);
    expect(compiled.select(targets, context)[0]?.id).toBe('first');
    expect(
      compiled.select(
        targets.map((t) => ({ ...t, progress: 0.74 })),
        context
      )[0]?.id
    ).toBe('strong');
  });

  it('rejects missing sort facts, duplicate IDs and unsupported policies without default ordering', () => {
    expect(() =>
      compileTargetSelection(selection('path-progress', 'desc')).select([entity], { origin })
    ).toThrow(MissingTargetFactsError);
    expect(() =>
      compileTargetSelection(selection('health', 'desc')).select([entity], {
        numericFact: () => NaN
      })
    ).toThrow(MissingTargetFactsError);
    expect(() =>
      compileTargetSelection(selection('distance', 'asc')).select([entity, entity], { origin })
    ).toThrow('unique');
    expect(() =>
      compileTargetSelection({ ...selection('distance', 'asc'), tieBreak: 'input-order' })
    ).toThrow();
    expect(() =>
      compileTargetSelection({ ...selection('distance', 'asc'), guessedFilter: true })
    ).toThrow();
  });
});
