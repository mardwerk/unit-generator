import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import {
  applyPathDisplacement,
  pathDisplacementSchema,
  type PathDisplacement,
  type PathDisplacementTarget
} from '../src/mechanics/motion.js';
import { createMechanicsScheduler } from '../src/mechanics/scheduler.js';
import { emitProjectile } from '../src/mechanics/projectiles.js';

const profile = (changes: Partial<PathDisplacement> = {}): PathDisplacement => ({
  distance: 4,
  direction: 'backward',
  ...changes
});
const target = (changes: Partial<PathDisplacementTarget> = {}): PathDisplacementTarget => ({
  id: 'victim',
  health: 10,
  x: 10,
  y: 2,
  pathPosition: 12,
  displaceable: true,
  ...changes
});
// Explicit synthetic path turns at progress 10. It is not a native game map.
const path = {
  bounds: { min: 0, max: 20 },
  pointAt: (position: number) =>
    position <= 10 ? { x: position, y: 0 } : { x: 10, y: position - 10 }
};

describe('shared path displacement', () => {
  it('moves backward around a path corner and reports actual distance without changing health', () => {
    const victim = target();
    expect(applyPathDisplacement(profile(), victim, path)).toEqual({
      from: 12,
      to: 8,
      delta: -4,
      distance: 4,
      point: { x: 8, y: 0 }
    });
    expect(victim).toMatchObject({ x: 8, y: 0, pathPosition: 8, health: 10 });
  });

  it('clamps both directions to caller bounds and supports explicit unbounded paths', () => {
    const victim = target();
    expect(applyPathDisplacement(profile({ distance: 100 }), victim, path)?.distance).toBe(12);
    expect(victim.pathPosition).toBe(0);
    expect(
      applyPathDisplacement(profile({ distance: 100, direction: 'forward' }), victim, path)
        ?.distance
    ).toBe(20);
    expect(victim).toMatchObject({ x: 10, y: 10, pathPosition: 20 });
    applyPathDisplacement(profile({ distance: 100, direction: 'forward' }), victim, {
      bounds: { min: 0, max: Infinity },
      pointAt: (position) => ({ x: 3, y: position })
    });
    expect(victim).toMatchObject({ x: 3, y: 120, pathPosition: 120 });
  });

  it('honors damage, tag, capability, invulnerability and survival gates', () => {
    const effect = profile({
      requiresTags: ['large'],
      immuneTo: ['anchored'],
      requiresDamage: true
    });
    for (const victim of [
      target(),
      target({ tags: ['large', 'anchored'] }),
      target({ tags: ['large'], health: 0 }),
      target({ tags: ['large'], displaceable: false }),
      target({ tags: ['large'], invulnerable: true })
    ]) {
      const before = structuredClone(victim);
      expect(applyPathDisplacement(effect, victim, { ...path, damageApplied: 1 })).toBeNull();
      expect(victim).toEqual(before);
    }
    const victim = target({ tags: ['large'] });
    expect(applyPathDisplacement(effect, victim, path)).toBeNull();
    expect(applyPathDisplacement(effect, victim, { ...path, damageApplied: 0 })).toBeNull();
    expect(applyPathDisplacement(effect, victim, { ...path, damageApplied: 1 })?.distance).toBe(4);
  });

  it('uses explicit first-match tag scaling without multiplying overlapping classes', () => {
    const effect = profile({
      distanceScaleByTag: [
        { tag: 'heavy', multiplier: 0.5 },
        { tag: 'large', multiplier: 0.25 }
      ]
    });
    expect(
      applyPathDisplacement(effect, target({ tags: ['large', 'heavy'] }), path)?.distance
    ).toBe(2);
    expect(applyPathDisplacement(effect, target({ tags: ['large'] }), path)?.distance).toBe(1);
    expect(applyPathDisplacement(effect, target(), path)?.distance).toBe(4);
    expect(
      applyPathDisplacement(
        profile({ distanceScaleByTag: [{ tag: 'heavy', multiplier: 0 }] }),
        target({ tags: ['heavy'] }),
        path
      )?.distance
    ).toBe(0);
  });

  it('refreshes projectile contacts using displaced coordinates on the existing clock', () => {
    const clock = createMechanicsScheduler();
    const victim = target();
    const hits: number[] = [];
    const shot = emitProjectile({
      projectile: {
        id: 'synthetic',
        damage: 1,
        detectConcealed: false,
        pierce: 1,
        radius: 0,
        throughWalls: true,
        flight: { kind: 'straight', speed: 10, lifetimeSeconds: 2 }
      },
      origin: { x: 0, y: 0 },
      aim: { x: 20, y: 0 },
      scheduler: clock,
      targets: () => [victim],
      onContact: (event) => hits.push(event.at)
    });
    clock.advance(0.2, true);
    applyPathDisplacement(profile(), victim, path);
    shot.refresh();
    clock.advance(1, true);
    expect(hits).toEqual([0.8]);
  });

  it('fails without topology or valid path state and validates the result before mutation', () => {
    expect(Value.Check(pathDisplacementSchema, profile({ distance: -1 }))).toBe(false);
    expect(() =>
      applyPathDisplacement(profile(), target({ pathPosition: undefined }), path)
    ).toThrow('topology resolver');
    expect(() => applyPathDisplacement(profile(), target({ pathPosition: 21 }), path)).toThrow(
      'topology resolver'
    );
    const victim = target();
    const before = structuredClone(victim);
    expect(() =>
      applyPathDisplacement(profile(), victim, { ...path, pointAt: () => ({ x: NaN, y: 0 }) })
    ).toThrow('invalid point');
    expect(victim).toEqual(before);
    expect(
      applyPathDisplacement(profile({ distance: 0 }), victim, {
        ...path,
        pointAt: () => {
          throw new Error('Zero displacement should not resolve another point.');
        }
      })?.distance
    ).toBe(0);
    expect(victim).toEqual(before);
  });
});

const sourceFile = process.env.BTD6_DISPLACEMENT_REFERENCE_FILE;
it.skipIf(!sourceFile)(
  'executes captured PushBack scalars under an explicit scenario distance conversion',
  () => {
    const rows = JSON.parse(readFileSync(sourceFile!, 'utf8')) as {
      type: string;
      examples: { pointer: string; fields: Record<string, unknown> }[];
    }[];
    const source = rows.find((row) => row.type.includes('.PushBackModel,'))!.examples[0]!;
    const fields = source.fields as {
      pushAmount: number;
      tag: string;
      multiplierBFB: number;
      onlyIfDamaged: boolean;
    };
    expect(source.pointer).toMatch(/\/projectile\/behaviors\//);
    // Explicit adaptation: 1 source pushAmount unit = 1 scenario path unit, applied immediately.
    // Native distance units and travel duration are not established by the captured fields.
    const effect = profile({
      distance: fields.pushAmount,
      requiresTags: fields.tag ? [fields.tag] : [],
      requiresDamage: fields.onlyIfDamaged,
      distanceScaleByTag: [{ tag: 'BFB', multiplier: fields.multiplierBFB }]
    });
    const victim = target({ pathPosition: 100, x: 50, y: 50, tags: [fields.tag, 'BFB'] });
    const sourcePath = {
      bounds: { min: 0, max: 200 },
      pointAt: (position: number) =>
        position <= 50 ? { x: position, y: 0 } : { x: 50, y: position - 50 }
    };
    const result = applyPathDisplacement(effect, victim, sourcePath)!;
    expect(result.distance).toBe(fields.pushAmount * fields.multiplierBFB);
    expect(victim.pathPosition).toBe(99);
    expect(victim).toMatchObject({ x: 50, y: 49, health: 10 });
    const changed = target({ pathPosition: 100, tags: [fields.tag, 'BFB'] });
    applyPathDisplacement({ ...effect, distance: effect.distance * 2 }, changed, sourcePath);
    expect(changed.pathPosition).toBe(98);
    const nearStart = target({ pathPosition: 0.25, tags: [fields.tag, 'BFB'] });
    expect(applyPathDisplacement(effect, nearStart, sourcePath)?.distance).toBe(0.25);
    expect(nearStart.pathPosition).toBe(0);
  }
);
