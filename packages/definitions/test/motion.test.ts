import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { createMotion, motionProfileSchema, type MotionProfile } from '../src/mechanics/motion.js';
import { emitProjectile, type ProjectileDefinition } from '../src/mechanics/projectiles.js';
import { createMechanicsScheduler } from '../src/mechanics/scheduler.js';

describe('shared motion', () => {
  it('freezes the supplied origin and profile, with deterministic out-of-order samples', () => {
    const origin = { x: 3, y: 4, headingDegrees: -90 };
    const fixed = createMotion({ kind: 'fixed' }, origin, 2);
    origin.x = 100;
    expect(fixed.poseAt(50)).toEqual({ x: 3, y: 4, headingDegrees: 270 });
    const profile: MotionProfile = { kind: 'straight', speed: 2 };
    const straight = createMotion(profile, { x: 3, y: 4 }, 2);
    profile.speed = 100;
    expect(straight.poseAt(5)).toEqual({ x: 9, y: 4, headingDegrees: 0 });
    expect(straight.poseAt(1)).toEqual({ x: 3, y: 4, headingDegrees: 0 });
    expect(straight.poseAt(5)).toEqual({ x: 9, y: 4, headingDegrees: 0 });
  });

  it('stops at the first world boundary without sliding along it', () => {
    const motion = createMotion(
      {
        kind: 'straight',
        speed: 10,
        headingDegrees: 45,
        bounds: { minX: -10, maxX: 5, minY: -10, maxY: 20 }
      },
      { x: 0, y: 0 },
      0
    );
    expect(motion.poseAt(0.1).x).toBeCloseTo(Math.SQRT1_2);
    expect(motion.poseAt(100).x).toBeCloseTo(5);
    expect(motion.poseAt(100).y).toBeCloseTo(5);
    const vertical = createMotion(
      {
        kind: 'straight',
        speed: 1,
        headingDegrees: 90,
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 10 }
      },
      { x: 0, y: 0 },
      0
    );
    expect(vertical.poseAt(5)).toEqual({ x: 0, y: 5, headingDegrees: 90 });
  });

  it('samples circles by arc speed, direction, radius and initial phase', () => {
    const profile: MotionProfile = {
      kind: 'circle',
      speed: Math.PI,
      radius: 2,
      initialAngleDegrees: 0,
      clockwise: false
    };
    const motion = createMotion(profile, { x: 5, y: 7 }, 0);
    expect(motion.poseAt(0)).toEqual({ x: 7, y: 7, headingDegrees: 90 });
    expect(motion.poseAt(1).x).toBeCloseTo(5);
    expect(motion.poseAt(1).y).toBeCloseTo(9);
    expect(motion.poseAt(1).headingDegrees).toBeCloseTo(180);
    expect(motion.poseAt(4)).toEqual(motion.poseAt(0));
    const clockwise = createMotion(
      { ...profile, clockwise: true, initialAngleDegrees: -360000 },
      { x: 5, y: 7 },
      0
    );
    expect(clockwise.poseAt(1).y).toBeCloseTo(5);
    expect(clockwise.poseAt(1).headingDegrees).toBeCloseTo(180);
  });

  it('follows waypoint segment lengths, changes heading, stops and closes loops', () => {
    const profile: MotionProfile = {
      kind: 'waypoints',
      speed: 1,
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 4 }
      ],
      loop: false
    };
    const motion = createMotion(profile, { x: 10, y: 20 }, 0);
    expect(motion.poseAt(3)).toEqual({ x: 13, y: 20, headingDegrees: 90 });
    expect(motion.poseAt(5)).toEqual({ x: 13, y: 22, headingDegrees: 90 });
    expect(motion.poseAt(20)).toEqual({ x: 13, y: 24, headingDegrees: 90 });
    const loop = createMotion({ ...profile, loop: true }, { x: 10, y: 20 }, 0);
    expect(loop.poseAt(9.5).x).toBeCloseTo(11.5);
    expect(loop.poseAt(9.5).y).toBeCloseTo(22);
    expect(loop.poseAt(12)).toEqual(loop.poseAt(0));
    const still = createMotion(
      { ...profile, points: [{ x: 0, y: 0 }], loop: true },
      { x: 1, y: 2 },
      0
    );
    expect(still.poseAt(10)).toEqual({ x: 1, y: 2, headingDegrees: 0 });
  });

  it('repositions with a new origin and epoch without rewriting an earlier trajectory', () => {
    const profile: MotionProfile = { kind: 'straight', speed: 2, headingDegrees: 90 };
    const first = createMotion(profile, { x: 0, y: 0 }, 0);
    const repositioned = createMotion(profile, { x: 20, y: 20 }, 5);
    expect(first.poseAt(6)).toEqual({ x: 0, y: 12, headingDegrees: 90 });
    expect(repositioned.poseAt(6)).toEqual({ x: 20, y: 22, headingDegrees: 90 });
  });

  it('emits from the moving actor position on the same clock and freezes that launch origin', () => {
    const clock = createMechanicsScheduler();
    const motion = createMotion(
      { kind: 'straight', speed: 4, headingDegrees: 90 },
      { x: 0, y: 0 },
      clock.now
    );
    const target = { id: 'victim', x: 5, y: 8, health: 10 };
    const projectile: ProjectileDefinition = {
      id: 'synthetic',
      damage: 1,
      detectConcealed: false,
      radius: 0,
      pierce: 1,
      throughWalls: true,
      flight: { kind: 'straight', speed: 10, lifetimeSeconds: 1 }
    };
    const hits: number[] = [];
    clock.advance(2, true);
    const shot = emitProjectile({
      projectile,
      origin: motion.poseAt(clock.now),
      aim: target,
      scheduler: clock,
      targets: () => [target],
      onContact: (event) => hits.push(event.at)
    });
    expect(shot.position).toEqual({ x: 0, y: 8 });
    clock.advance(2.5, true);
    expect(hits).toEqual([2.5]);
    expect(shot.position).toEqual({ x: 5, y: 8 });
    expect(motion.poseAt(clock.now).y).toBe(10);
  });

  it('rejects invalid inputs and unsupported native steering claims', () => {
    for (const profile of [
      { kind: 'straight', speed: 0 },
      { kind: 'circle', speed: 1, radius: 0, initialAngleDegrees: 0, clockwise: false },
      { kind: 'waypoints', points: [], speed: 1, loop: true },
      { kind: 'homing', speed: 1, turnRate: 360 }
    ])
      expect(Value.Check(motionProfileSchema, profile)).toBe(false);
    expect(() => createMotion({ kind: 'straight', speed: -1 }, { x: 0, y: 0 }, 0)).toThrow(
      'Invalid motion'
    );
    expect(() =>
      createMotion(
        { kind: 'straight', speed: 1, bounds: { minX: 1, maxX: 0, minY: 0, maxY: 1 } },
        { x: 0, y: 0 },
        0
      )
    ).toThrow('Invalid motion bounds');
    expect(() => createMotion({ kind: 'fixed' }, { x: 0, y: 0 }, 0).poseAt(NaN)).toThrow(
      'Invalid motion sample time'
    );
  });
});

// The audit retains exact private source fields and pointers. This test executes
// the captured path speed under an explicit constant-speed waypoint policy; it
// does not qualify native turn, takeoff, acceleration or path supplier semantics.
const sourceFile = process.env.BTD6_MOTION_REFERENCE_FILE;
it.skipIf(!sourceFile)(
  'executes private captured movement speed with explicit path geometry',
  () => {
    const rows = JSON.parse(readFileSync(sourceFile!, 'utf8')) as {
      type: string;
      examples: { pointer: string; fields: Record<string, unknown> }[];
    }[];
    const row = rows.find((row) => row.type.includes('.PathMovementModel,'));
    expect(row).toBeDefined();
    const example = row!.examples[0]!;
    const speed = example.fields.speed as number;
    expect(speed).toBeGreaterThan(0);
    expect(example.pointer).toMatch(/^\/behaviors\//);
    const motion = createMotion(
      { kind: 'waypoints', speed, points: [{ x: speed * 10, y: 0 }], loop: false },
      { x: 0, y: 0 },
      0
    );
    expect(motion.poseAt(2)).toEqual({ x: speed * 2, y: 0, headingDegrees: 0 });
    const changed = createMotion(
      { kind: 'waypoints', speed: speed / 2, points: [{ x: speed * 10, y: 0 }], loop: false },
      { x: 0, y: 0 },
      0
    );
    expect(changed.poseAt(2).x).toBe(speed);
  }
);
