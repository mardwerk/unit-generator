import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { schemaIssues, type JsonSchema } from '@mardwerk/unit-core';
import {
  mechanicalModelSchema,
  mechanicalModelJsonSchema,
  type MechanicalModel
} from '../src/mechanics/model.js';
import {
  btd6AttackV2Schema,
  btd6UnitV2Schema,
  btd6ModelV2Schema
} from '../src/btd6-derived/v2-schema.js';
import { createBtd6FixtureV2 } from '../src/btd6-derived/v2-fixture.js';
import { mangaUnitSchema } from '../src/manga-mayhem/schemas.js';
import { createMangaFixture } from '../src/manga-mayhem/fixture.js';
import { applyDamage } from '../src/mechanics/combat.js';
import { createMechanicsScheduler } from '../src/mechanics/scheduler.js';
import { createStatusRuntime, type StatusEffect } from '../src/mechanics/status.js';
import type { ContactDamageModifier } from '../src/mechanics/modifiers.js';
import {
  emitProjectile,
  localizeProjectileSchema,
  projectileDefinitionJsonSchema,
  projectileDefinitionSchema,
  type ProjectileDefinition,
  type ProjectileCollider,
  type ProjectileContact
} from '../src/mechanics/projectiles.js';

const shot = (overrides: Partial<ProjectileDefinition> = {}): ProjectileDefinition => ({
  id: 'synthetic-shot',
  damage: 2,
  detectConcealed: false,
  radius: 0,
  pierce: 2,
  throughWalls: true,
  flight: { kind: 'straight', speed: 10, lifetimeSeconds: 2 },
  ...overrides
});
const target = (id: string, x: number, y = 0): ProjectileCollider => ({ id, x, y, health: 100 });
const slow: StatusEffect = {
  id: 'child-slow',
  kind: 'slow',
  durationSeconds: 1,
  speedMultiplier: 0.5,
  combine: 'strongest',
  immuneTo: [],
  stacking: { scope: 'source', reapply: 'refresh', maxStacks: 1 }
};
const bonus: ContactDamageModifier = {
  id: 'conditional-bonus',
  group: 'conditional-bonus',
  stat: 'attack.damage',
  operation: 'add',
  value: 10,
  stacking: 'unique',
  maxStacks: 1,
  radius: null,
  includesOwner: true,
  includesSubordinates: true
};
function scene(
  projectile: ProjectileDefinition,
  targets: ProjectileCollider[],
  aim = { x: 20, y: 0, id: 'a' }
) {
  const scheduler = createMechanicsScheduler();
  const contacts: ProjectileContact<ProjectileCollider>[] = [];
  const ends: { reason: string; at: number; point: { x: number; y: number } }[] = [];
  const actor = emitProjectile({
    projectile,
    origin: { x: 0, y: 0 },
    aim,
    scheduler,
    targets: () => targets,
    onContact(event) {
      contacts.push(event);
      applyDamage(event.target, event.damage);
    },
    onEnd(event) {
      ends.push(event);
    }
  });
  return { scheduler, contacts, ends, actor };
}

describe('shared projectile actors', () => {
  it('publishes one local recursive definition when graphs occur in multiple schema branches', () => {
    const schema = localizeProjectileSchema(
      Type.Object({ first: projectileDefinitionSchema, second: projectileDefinitionSchema })
    );
    const graph = shot({ children: [{ trigger: 'contact', count: 1, projectile: shot() }] });
    expect(schemaIssues(schema as JsonSchema, { first: graph, second: graph })).toEqual([]);
    expect(
      schemaIssues(schema as JsonSchema, { first: graph, second: { ...graph, pierce: -1 } })
    ).not.toEqual([]);
    expect(localizeProjectileSchema(schema)).toEqual(schema);
    expect(JSON.stringify(schema)).not.toContain('"$id":"SharedProjectileDefinition"');
  });

  it('validates nested graphs through raw TypeBox and both published adapter unit schemas', () => {
    const graph = shot({
      targetFilter: { kind: 'not', predicate: { kind: 'constant', value: false } },
      children: [
        {
          trigger: 'contact',
          count: 1,
          projectile: shot({
            id: 'child',
            hitReset: { intervalSeconds: 0.25, mode: 'all' },
            pierceRefresh: { intervalSeconds: 0.5 },
            damageModifiers: [bonus],
            onHit: [slow],
            targetFilter: {
              kind: 'all',
              predicates: [{ kind: 'membership', field: 'tags', mode: 'any', values: ['allowed'] }]
            }
          })
        }
      ]
    });
    const mechanics: MechanicalModel = {
      attacks: [
        {
          id: 'nested',
          damage: 2,
          shape: { kind: 'single' },
          range: 20,
          detectConcealed: false,
          delivery: 'projectile',
          projectile: graph,
          intervalSeconds: 1,
          projectiles: 1
        }
      ],
      actors: [],
      passiveSummons: [],
      income: [],
      rangeSupport: []
    };
    expect(Value.Check(projectileDefinitionSchema, graph)).toBe(true);
    expect(TypeCompiler.Compile(projectileDefinitionSchema).Check(graph)).toBe(true);
    expect(Value.Check(mechanicalModelSchema, mechanics)).toBe(true);
    expect(TypeCompiler.Compile(mechanicalModelSchema).Check(mechanics)).toBe(true);
    expect(schemaIssues(JSON.parse(JSON.stringify(projectileDefinitionJsonSchema)), graph)).toEqual(
      []
    );
    expect(schemaIssues(JSON.parse(JSON.stringify(mechanicalModelJsonSchema)), mechanics)).toEqual(
      []
    );
    const manga = createMangaFixture();
    manga.mechanics = mechanics;
    const btd = createBtd6FixtureV2();
    btd.base!.attacks[0]!.projectile = graph;
    expect(Value.Check(btd6AttackV2Schema, btd.base!.attacks[0])).toBe(true);
    expect(TypeCompiler.Compile(btd6AttackV2Schema).Check(btd.base!.attacks[0])).toBe(true);
    expect(schemaIssues(JSON.parse(JSON.stringify(mangaUnitSchema)), manga)).toEqual([]);
    expect(schemaIssues(JSON.parse(JSON.stringify(btd6UnitV2Schema)), btd)).toEqual([]);
    expect(schemaIssues(JSON.parse(JSON.stringify(btd6ModelV2Schema)), btd.base)).toEqual([]);
    const invalid = structuredClone(graph);
    invalid.children![0]!.projectile.pierce = -1;
    btd.base!.attacks[0]!.projectile = invalid;
    manga.mechanics.attacks[0]!.projectile = invalid;
    expect(Value.Check(mechanicalModelSchema, manga.mechanics)).toBe(false);
    expect(TypeCompiler.Compile(btd6AttackV2Schema).Check(btd.base!.attacks[0])).toBe(false);
    expect(
      schemaIssues(JSON.parse(JSON.stringify(mangaUnitSchema)), manga).some((issue) =>
        issue.path.includes('/projectile')
      )
    ).toBe(true);
    expect(
      schemaIssues(JSON.parse(JSON.stringify(btd6UnitV2Schema)), btd).some((issue) =>
        issue.path.includes('/projectile')
      )
    ).toBe(true);
  });
  it('travels through circular contacts in time order and exhausts pierce', () => {
    const near = { ...target('near', 5), collisionRadius: 1 };
    const far = target('far', 10);
    const beyond = target('beyond', 15);
    const s = scene(shot(), [beyond, far, near]);
    s.scheduler.advance(0.39, true);
    expect(s.contacts).toHaveLength(0);
    s.scheduler.advance(2, true);
    expect(s.contacts.map((c) => [c.target.id, c.at])).toEqual([
      ['near', 0.4],
      ['far', 1]
    ]);
    expect(s.actor.alive).toBe(false);
    expect(s.actor.position).toEqual({ x: 10, y: 0 });
    expect(beyond.health).toBe(100);
    expect(s.ends.map((e) => e.reason)).toEqual(['exhaust']);
  });

  it('creates a child blast at contact instead of assigning blast damage to the carrier', () => {
    const blast = shot({
      id: 'blast',
      damage: 7,
      radius: 3,
      pierce: 5,
      flight: { kind: 'stationary', lifetimeSeconds: 0 }
    });
    const carrier = shot({
      damage: 0,
      pierce: 1,
      children: [{ trigger: 'contact', count: 1, atTarget: true, projectile: blast }]
    });
    const targets = [target('a', 5), target('beside', 5, 2), target('outside', 5, 4)];
    const s = scene(carrier, targets);
    s.scheduler.advance(1, true);
    expect(s.contacts.map((c) => [c.node.id, c.target.id])).toEqual([
      ['synthetic-shot', 'a'],
      ['blast', 'a'],
      ['blast', 'beside']
    ]);
    expect(s.contacts.map((c) => c.root)).toEqual([true, false, false]);
    expect(targets.map((t) => t.health)).toEqual([93, 93, 100]);
    const narrower = scene(
      {
        ...carrier,
        children: [{ trigger: 'contact', count: 1, projectile: { ...blast, radius: 1 } }]
      },
      targets.map((t) => ({ ...t, health: 100 }))
    );
    narrower.scheduler.advance(1, true);
    expect(narrower.contacts.map((c) => c.target.id)).toEqual(['a', 'a']);
  });

  it('emits expiry children at the lifetime endpoint and excludes endpoint contacts', () => {
    const child = shot({
      id: 'expiry-blast',
      damage: 4,
      radius: 2,
      flight: { kind: 'stationary', lifetimeSeconds: 0 }
    });
    const s = scene(
      shot({
        flight: { kind: 'straight', speed: 10, lifetimeSeconds: 1 },
        children: [{ trigger: 'expire', count: 1, projectile: child }]
      }),
      [target('a', 10)]
    );
    s.scheduler.advance(1, true);
    expect(s.contacts.map((c) => c.node.id)).toEqual(['expiry-blast']);
    expect(s.ends[0]).toMatchObject({ reason: 'expire', at: 1, point: { x: 10, y: 0 } });
  });

  it('fires exhaust children only after the last eligible collision', () => {
    const concealed = { ...target('hidden', 2), concealed: true };
    const child = shot({
      id: 'exhaust-blast',
      radius: 1,
      flight: { kind: 'stationary', lifetimeSeconds: 0 }
    });
    const s = scene(
      shot({
        children: [{ trigger: 'exhaust', count: 1, inheritHitTargets: true, projectile: child }]
      }),
      [concealed, target('a', 5), target('b', 10), target('c', 10, 0.5)]
    );
    s.scheduler.advance(2, true);
    expect(s.contacts.map((c) => [c.node.id, c.target.id])).toEqual([
      ['synthetic-shot', 'a'],
      ['synthetic-shot', 'b'],
      ['exhaust-blast', 'c']
    ]);
    expect(concealed.health).toBe(100);
  });

  it('keeps aimed impacts locked to the launch coordinates and misses moved targets', () => {
    const targets = [target('a', 10), target('b', 10)];
    const s = scene(
      shot({ pierce: 1, radius: 0.5, flight: { kind: 'aimed-impact', speed: 10 } }),
      targets,
      { x: 10, y: 0, id: 'a' }
    );
    targets[0]!.y = 1;
    s.scheduler.advance(1, true);
    expect(s.contacts).toHaveLength(0);
    expect(s.ends[0]?.reason).toBe('expire');
  });

  it('freezes launch damage and speed and gives each launch a distinct actor ID', () => {
    const definition = shot({ pierce: 1, flight: { kind: 'aimed-impact', speed: 10 } });
    const s = scene(definition, [target('a', 10)], { x: 10, y: 0, id: 'a' });
    definition.damage = 90;
    definition.flight = { kind: 'aimed-impact', speed: 100 };
    const second = emitProjectile({
      projectile: definition,
      origin: { x: 0, y: 0 },
      aim: { x: 10, y: 0, id: 'a' },
      scheduler: s.scheduler,
      targets: () => [],
      onContact() {}
    });
    expect(second.id).not.toBe(s.actor.id);
    s.scheduler.advance(0.9, true);
    expect(s.contacts).toHaveLength(0);
    s.scheduler.advance(1, true);
    expect(s.contacts[0]?.node.damage).toBe(2);
  });

  it('recomputes swept contacts when a target moves, without duplicate hits', () => {
    const moving = target('a', 8, 5);
    const s = scene(shot(), [moving]);
    s.scheduler.advance(0.5, true);
    moving.y = 0;
    s.actor.refresh();
    s.actor.refresh();
    s.scheduler.advance(0.8, true);
    expect(s.contacts.map((c) => c.at)).toEqual([0.8]);
    s.actor.refresh();
    s.scheduler.advance(2, true);
    expect(s.contacts).toHaveLength(1);
  });

  it('consumes pierce when a caller rejects damage due to immunity', () => {
    const scheduler = createMechanicsScheduler();
    const targets = [target('immune', 5), target('behind', 10)];
    const hits: string[] = [];
    emitProjectile({
      projectile: shot({ pierce: 1, immuneTo: ['metal'] }),
      origin: { x: 0, y: 0 },
      aim: { x: 10, y: 0 },
      scheduler,
      targets: () => targets,
      onContact({ target: victim }) {
        hits.push(victim.id);
        if (victim.id !== 'immune') applyDamage(victim, 5);
      }
    });
    scheduler.advance(2, true);
    expect(hits).toEqual(['immune']);
    expect(targets.map((t) => t.health)).toEqual([100, 100]);
  });

  it('stops at a wall and emits blocker children at the wall', () => {
    const scheduler = createMechanicsScheduler();
    const contacts: string[] = [];
    const ends: string[] = [];
    const actor = emitProjectile({
      projectile: shot({
        throughWalls: false,
        children: [
          {
            trigger: 'blocker',
            count: 1,
            projectile: shot({ radius: 1, flight: { kind: 'stationary', lifetimeSeconds: 0 } })
          }
        ]
      }),
      origin: { x: 0, y: 0 },
      aim: { x: 10, y: 0 },
      scheduler,
      targets: () => [target('before', 4.5, 0.5), target('behind', 10)],
      obstacles: [{ x1: 5, y1: -1, x2: 5, y2: 1 }],
      onContact({ target: victim }) {
        contacts.push(victim.id);
      },
      onEnd(e) {
        ends.push(e.reason);
      }
    });
    scheduler.advance(2, true);
    expect(actor.position.x).toBeCloseTo(5);
    expect(contacts).toEqual(['before']);
    expect(ends).toContain('blocker');
  });

  it('rejects invalid geometry and a misspelled child trigger in the public schema', () => {
    expect(Value.Check(projectileDefinitionSchema, shot())).toBe(true);
    expect(
      Value.Check(projectileDefinitionSchema, {
        ...shot(),
        children: [{ trigger: 'unknown', count: 1, projectile: shot() }]
      })
    ).toBe(false);
    expect(() =>
      scene(shot({ flight: { kind: 'straight', speed: 0, lifetimeSeconds: 1 } }), [])
    ).toThrow('Invalid projectile');
  });

  it('supports noncolliding carriers and explicit exhaustion bypass', () => {
    const hiddenCarrier = scene(shot({ collides: false }), [target('a', 5)]);
    hiddenCarrier.scheduler.advance(2, true);
    expect(hiddenCarrier.contacts).toHaveLength(0);
    expect(hiddenCarrier.ends[0]?.reason).toBe('expire');
    const bypass = scene(shot({ pierce: 0, ignorePierceExhaustion: true }), [
      target('a', 5),
      target('b', 10)
    ]);
    bypass.scheduler.advance(2, true);
    expect(bypass.contacts.map((c) => c.target.id)).toEqual(['a', 'b']);
    expect(bypass.ends[0]?.reason).toBe('expire');
    const exhausted = scene(shot({ pierce: 0 }), [target('a', 5)]);
    exhausted.scheduler.advance(2, true);
    expect(exhausted.contacts).toHaveLength(0);
    expect(exhausted.ends[0]).toMatchObject({ reason: 'exhaust', at: 0 });
  });

  it('emits a full circle without duplicating the first direction', () => {
    const child = shot({
      id: 'radial',
      pierce: 1,
      flight: { kind: 'straight', speed: 10, lifetimeSeconds: 1 }
    });
    const targets = [
      target('east', 5),
      target('west', -5),
      target('north', 0, 5),
      target('south', 0, -5)
    ];
    const s = scene(
      shot({
        collides: false,
        flight: { kind: 'stationary', lifetimeSeconds: 0 },
        children: [{ trigger: 'expire', count: 4, spreadDegrees: 360, projectile: child }]
      }),
      targets
    );
    s.scheduler.advance(1, true);
    expect(s.contacts.map((c) => c.target.id).sort()).toEqual(['east', 'north', 'south', 'west']);
  });

  it('keeps travel blocker policy separate from local contact visibility', () => {
    const scheduler = createMechanicsScheduler();
    const contacts: string[] = [];
    emitProjectile({
      projectile: shot({ throughWalls: false, ignoreBlockers: true, radius: 1 }),
      origin: { x: 0, y: 0 },
      aim: { x: 10, y: 0 },
      scheduler,
      targets: () => [target('behind', 10)],
      obstacles: [{ x1: 5, y1: -1, x2: 5, y2: 1 }],
      onContact({ target: victim }) {
        contacts.push(victim.id);
      }
    });
    scheduler.advance(2, true);
    expect(contacts).toEqual(['behind']);
  });

  it('filters contacts before consuming pierce and evaluates range at the contact position', () => {
    const s = scene(
      shot({
        pierce: 1,
        targetFilter: {
          kind: 'all',
          predicates: [
            { kind: 'membership', field: 'tags', mode: 'any', values: ['allowed'] },
            { kind: 'range', minimum: 0, maximum: 0.1 }
          ]
        }
      }),
      [
        { ...target('excluded', 5), tags: [] },
        { ...target('allowed', 10), tags: ['allowed'] }
      ]
    );
    s.scheduler.advance(2, true);
    expect(s.contacts.map((c) => [c.target.id, c.at])).toEqual([['allowed', 1]]);
    expect(s.ends[0]?.reason).toBe('exhaust');
  });

  it('fails on missing contact facts instead of treating unknown tags as empty', () => {
    const s = scene(
      shot({
        targetFilter: { kind: 'membership', field: 'tags', mode: 'any', values: ['allowed'] }
      }),
      [target('unknown', 5)]
    );
    expect(() => s.scheduler.advance(1, true)).toThrow('requires facts: tags');
    expect(s.contacts).toHaveLength(0);
  });

  it('checks concealment and predicate tags at collision time after intervening status changes', () => {
    const victim = { ...target('changed', 5), concealed: true, tags: [] as string[] };
    const s = scene(
      shot({
        targetFilter: { kind: 'membership', field: 'tags', mode: 'any', values: ['allowed'] }
      }),
      [victim]
    );
    s.scheduler.advance(0.25, true);
    victim.concealed = false;
    victim.tags.push('allowed');
    s.scheduler.advance(0.5, true);
    expect(s.contacts.map((c) => c.target.id)).toEqual(['changed']);
  });

  it('keeps child statuses and predicates local to their node', () => {
    const scheduler = createMechanicsScheduler();
    const targets = [
      { ...target('carrier-target', 5), tags: ['carrier'] },
      { ...target('child-target', 5, 1), tags: ['child'] }
    ];
    const statuses = createStatusRuntime(scheduler, targets);
    const contacts: string[] = [];
    emitProjectile({
      projectile: shot({
        damage: 0,
        appliesDamage: false,
        pierce: 1,
        targetFilter: { kind: 'membership', field: 'tags', mode: 'any', values: ['carrier'] },
        children: [
          {
            trigger: 'contact',
            count: 1,
            projectile: shot({
              id: 'child',
              damage: 3,
              radius: 2,
              onHit: [slow],
              targetFilter: { kind: 'membership', field: 'tags', mode: 'any', values: ['child'] },
              flight: { kind: 'stationary', lifetimeSeconds: 0 }
            })
          }
        ]
      }),
      origin: { x: 0, y: 0 },
      aim: targets[0]!,
      scheduler,
      targets: () => targets,
      onContact(event) {
        contacts.push(`${event.node.id}/${event.target.id}`);
        const applied =
          event.node.appliesDamage === false
            ? 0
            : applyDamage(event.target, event.node.damage).applied;
        for (const effect of event.node.onHit ?? [])
          statuses.apply(event.node.id, event.target.id, effect, { damageApplied: applied });
      }
    });
    scheduler.advance(0.6, true);
    expect(contacts).toEqual(['synthetic-shot/carrier-target', 'child/child-target']);
    expect(targets.map((t) => t.health)).toEqual([100, 97]);
    expect(statuses.snapshot().map((s) => [s.targetId, s.speedMultiplier])).toEqual([
      ['carrier-target', 1],
      ['child-target', 0.5]
    ]);
    scheduler.advance(1.5, true);
    expect(statuses.snapshot().map((s) => s.speedMultiplier)).toEqual([1, 1]);
  });

  it('uses the frozen shot owner and modifiers with live enemy facts, then applies vulnerability once', () => {
    const scheduler = createMechanicsScheduler();
    const owner = { id: 'owner-at-launch', x: 0, y: 0 };
    const victim = {
      ...target('victim', 10),
      ownerId: owner.id,
      tags: [] as string[],
      damageTaken: { additive: 3, multiplier: 2 }
    };
    const graph = shot({
      pierce: 1,
      damageModifiers: [
        {
          ...bonus,
          recipientFilter: {
            kind: 'all',
            predicates: [
              { kind: 'membership', field: 'tags', mode: 'any', values: ['reinforced'] },
              { kind: 'source-relation', field: 'ownerId', sourceField: 'id' }
            ]
          }
        }
      ]
    });
    const contacts: ProjectileContact<typeof victim>[] = [];
    emitProjectile({
      projectile: graph,
      origin: owner,
      aim: victim,
      scheduler,
      targets: () => [victim],
      targetContext: { source: owner },
      onContact(event) {
        contacts.push(event);
        applyDamage(event.target, event.damage);
      }
    });
    owner.id = 'changed-owner';
    graph.damage = 90;
    graph.damageModifiers![0]!.value = 99;
    victim.tags.push('reinforced');
    scheduler.advance(1, true);
    expect(contacts[0]?.damage).toBe(12);
    expect(contacts[0]?.damageModifierSources).toEqual([
      { providerId: 'owner-at-launch', modifierId: 'conditional-bonus', group: 'conditional-bonus' }
    ]);
    expect(victim.health).toBe(70);
  });

  it('does not apply carrier modifiers to child damage or create damage for an absent DamageModel', () => {
    const scheduler = createMechanicsScheduler();
    const victim = target('victim', 5);
    const hits: number[] = [];
    emitProjectile({
      projectile: shot({
        damage: 0,
        appliesDamage: false,
        pierce: 1,
        damageModifiers: [bonus],
        children: [
          {
            trigger: 'contact',
            count: 1,
            projectile: shot({
              id: 'child',
              pierce: 1,
              damageModifiers: [{ ...bonus, value: 3 }],
              radius: 1,
              flight: { kind: 'stationary', lifetimeSeconds: 0 }
            })
          }
        ]
      }),
      origin: { x: 0, y: 0 },
      aim: victim,
      scheduler,
      targets: () => [victim],
      targetContext: { source: { id: 'owner', x: 0, y: 0 } },
      onContact(event) {
        hits.push(event.damage);
        if (event.node.appliesDamage !== false) applyDamage(victim, event.damage);
      }
    });
    scheduler.advance(1, true);
    expect(hits).toEqual([0, 5]);
    expect(victim.health).toBe(95);
    const carrierOnly = scene(
      shot({ damage: 0, appliesDamage: false, damageModifiers: [bonus] }),
      []
    );
    carrierOnly.scheduler.advance(2, true);
    expect(carrierOnly.contacts).toHaveLength(0);
  });

  it('requires owner facts for contact damage modifiers and rejects modifiers for unrelated stats', () => {
    expect(() => scene(shot({ damageModifiers: [bonus] }), [target('victim', 5)])).toThrow(
      'require launch owner facts'
    );
    expect(
      Value.Check(projectileDefinitionSchema, {
        ...shot(),
        damageModifiers: [{ ...bonus, stat: 'attack.range' }]
      })
    ).toBe(false);
  });

  it('clears hit history on the launch clock while repeated contacts still consume pierce', () => {
    const s = scene(
      shot({
        pierce: 3,
        radius: 1,
        flight: { kind: 'stationary', lifetimeSeconds: 2 },
        hitReset: { intervalSeconds: 0.25, mode: 'all' }
      }),
      [target('a', 0)]
    );
    s.scheduler.advance(2, true);
    expect(s.contacts.map((c) => c.at)).toEqual([0, 0.25, 0.5]);
    expect(s.ends).toEqual([expect.objectContaining({ reason: 'exhaust', at: 0.5 })]);
    expect(s.actor.alive).toBe(false);
  });

  it('refreshes pierce before equal-time hit resets and never revives an exhausted actor', () => {
    const graph = shot({
      pierce: 2,
      radius: 1,
      flight: { kind: 'stationary', lifetimeSeconds: 1 },
      hitReset: { intervalSeconds: 0.25, mode: 'all' },
      pierceRefresh: { intervalSeconds: 0.25 }
    });
    const refreshed = scene(graph, [target('a', 0)]);
    refreshed.scheduler.advance(2, true);
    expect(refreshed.contacts.map((c) => c.at)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(refreshed.ends[0]).toMatchObject({ reason: 'expire', at: 1 });
    const without = structuredClone(graph);
    delete without.pierceRefresh;
    const exhausted = scene(without, [target('a', 0)]);
    exhausted.scheduler.advance(2, true);
    expect(exhausted.contacts.map((c) => c.at)).toEqual([0, 0.25]);
    const tooLate = scene({ ...graph, pierce: 1 }, [target('a', 0)]);
    tooLate.scheduler.advance(2, true);
    expect(tooLate.contacts.map((c) => c.at)).toEqual([0]);
    expect(tooLate.ends[0]).toMatchObject({ reason: 'exhaust', at: 0 });
    const withoutReset = structuredClone(graph);
    delete withoutReset.hitReset;
    const sameVictim = scene(withoutReset, [target('a', 0)]);
    sameVictim.scheduler.advance(2, true);
    expect(sameVictim.contacts).toHaveLength(1);
  });

  it('clears outside-contact history only after the target leaves the collision radius at a reset pulse', () => {
    const victim = target('a', 0);
    const s = scene(
      shot({
        pierce: 3,
        radius: 1,
        flight: { kind: 'stationary', lifetimeSeconds: 2 },
        hitReset: { intervalSeconds: 0.5, mode: 'outside-contact' }
      }),
      [victim]
    );
    s.scheduler.advance(0.5, true);
    expect(s.contacts).toHaveLength(1);
    victim.y = 2;
    s.scheduler.advance(1, true);
    s.scheduler.advance(1.1, true);
    victim.y = 0;
    s.actor.refresh();
    s.scheduler.advance(2, true);
    expect(s.contacts.map((c) => c.at)).toEqual([0, 1.1]);
  });

  it('emits interval children at the moving parent position and excludes the expiry boundary', () => {
    const graph = shot({
      collides: false,
      flight: { kind: 'straight', speed: 10, lifetimeSeconds: 1 },
      children: [
        {
          trigger: 'interval',
          count: 1,
          schedule: { initialDelaySeconds: 0.25, intervalSeconds: 0.25, maxEmissions: null },
          projectile: shot({
            id: 'pulse',
            damage: 3,
            radius: 0.1,
            pierce: 1,
            flight: { kind: 'stationary', lifetimeSeconds: 0 }
          })
        }
      ]
    });
    const victims = [target('a', 2.5), target('b', 5), target('c', 7.5), target('expiry', 10)];
    const s = scene(graph, victims);
    s.scheduler.advance(1, true);
    expect(s.contacts.map((c) => [c.node.id, c.at, c.point.x])).toEqual([
      ['pulse', 0.25, 2.5],
      ['pulse', 0.5, 5],
      ['pulse', 0.75, 7.5]
    ]);
    expect(victims.map((t) => t.health)).toEqual([97, 97, 97, 100]);
    expect(schemaIssues(JSON.parse(JSON.stringify(projectileDefinitionJsonSchema)), graph)).toEqual(
      []
    );
    expect(Value.Check(projectileDefinitionSchema, graph)).toBe(true);
  });

  it('honors one-shot and finite interval emission limits and cancels pending pulses on exhaustion', () => {
    const graph = shot({
      collides: false,
      flight: { kind: 'stationary', lifetimeSeconds: 2 },
      children: [
        {
          trigger: 'interval',
          count: 1,
          schedule: { initialDelaySeconds: 0.25, intervalSeconds: 0.25, maxEmissions: 1 },
          projectile: shot({
            id: 'pulse',
            radius: 1,
            pierce: 1,
            flight: { kind: 'stationary', lifetimeSeconds: 0 }
          })
        }
      ]
    });
    const once = scene(graph, [target('a', 0)]);
    once.scheduler.advance(2, true);
    expect(once.contacts.map((c) => c.at)).toEqual([0.25]);
    const twice = structuredClone(graph);
    const emission = twice.children![0]!;
    if (emission.trigger !== 'interval') throw new Error('Expected interval fixture.');
    emission.schedule.maxEmissions = 2;
    const repeated = scene(twice, [target('a', 0)]);
    repeated.scheduler.advance(2, true);
    expect(repeated.contacts.map((c) => c.at)).toEqual([0.25, 0.5]);
    const ended = scene({ ...graph, collides: true, pierce: 1 }, [target('a', 0)]);
    ended.scheduler.advance(2, true);
    expect(ended.contacts.map((c) => c.node.id)).toEqual(['synthetic-shot']);
  });

  it('keeps an emitted child alive after its parent expires', () => {
    const s = scene(
      shot({
        collides: false,
        flight: { kind: 'stationary', lifetimeSeconds: 0.5 },
        children: [
          {
            trigger: 'interval',
            count: 1,
            schedule: { initialDelaySeconds: 0.25, intervalSeconds: 0.25, maxEmissions: 1 },
            projectile: shot({
              id: 'persistent-child',
              pierce: 10,
              radius: 1,
              flight: { kind: 'stationary', lifetimeSeconds: 1 },
              hitReset: { intervalSeconds: 0.25, mode: 'all' }
            })
          }
        ]
      }),
      [target('a', 0)]
    );
    s.scheduler.advance(2, true);
    expect(s.contacts.map((c) => c.at)).toEqual([0.25, 0.5, 0.75, 1]);
    expect(s.ends.map((e) => e.at)).toEqual([0.5, 1.25]);
  });

  it('rejects invalid timer intervals and target-positioned interval emissions', () => {
    expect(() => scene(shot({ hitReset: { intervalSeconds: 0, mode: 'all' } }), [])).toThrow(
      'Invalid projectile timer'
    );
    const child = {
      trigger: 'interval',
      count: 1,
      schedule: { initialDelaySeconds: 0, intervalSeconds: 0.1, maxEmissions: null },
      projectile: shot()
    };
    expect(
      Value.Check(projectileDefinitionSchema, {
        ...shot(),
        children: [{ ...child, atTarget: true }]
      })
    ).toBe(false);
    expect(
      Value.Check(projectileDefinitionSchema, {
        ...shot(),
        children: [{ ...child, schedule: { ...child.schedule, maxEmissions: 0 } }]
      })
    ).toBe(false);
  });
});
