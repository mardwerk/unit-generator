import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { distance, type Point } from './geometry.js';
import type { CombatTarget } from './combat.js';

const objectOptions = { additionalProperties: false };
const coordinate = () => Type.Number({ minimum: -1e9, maximum: 1e9 });
const speed = () => Type.Number({ exclusiveMinimum: 0, maximum: 100000 });
const pointSchema = Type.Object({ x: coordinate(), y: coordinate() }, objectOptions);
const angle = () => Type.Number({ minimum: -360000, maximum: 360000 });

/** Positions use caller distance units; times use seconds and headings use degrees CCW from +x. */
export const motionProfileSchema = Type.Union([
  Type.Object({ kind: Type.Literal('fixed') }, objectOptions),
  Type.Object(
    {
      kind: Type.Literal('straight'),
      speed: speed(),
      headingDegrees: Type.Optional(angle()),
      // Absolute world bounds. Movement stops at the first edge, without sliding or bouncing.
      bounds: Type.Optional(
        Type.Object(
          { minX: coordinate(), maxX: coordinate(), minY: coordinate(), maxY: coordinate() },
          objectOptions
        )
      )
    },
    objectOptions
  ),
  Type.Object(
    {
      kind: Type.Literal('circle'),
      radius: Type.Number({ exclusiveMinimum: 0, maximum: 100000 }),
      speed: speed(),
      initialAngleDegrees: angle(),
      clockwise: Type.Boolean()
    },
    objectOptions
  ),
  Type.Object(
    {
      kind: Type.Literal('waypoints'),
      points: Type.Array(pointSchema, { minItems: 1, maxItems: 1024 }),
      speed: speed(),
      loop: Type.Boolean()
    },
    objectOptions
  )
]);
export type MotionProfile = Static<typeof motionProfileSchema>;
export interface MotionPose extends Point {
  headingDegrees: number;
}
export interface Motion {
  poseAt(time: number): MotionPose;
}
const degrees = (radians: number) => ((((radians * 180) / Math.PI) % 360) + 360) % 360;
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const normalizeHeading = (heading: number) => ((heading % 360) + 360) % 360;

/**
 * Samples on the caller's clock without scheduling another simulator loop.
 * Circle origin is its center. Waypoints are offsets from origin; the path starts
 * at origin and a loop closes back to origin. These are normalized policies, not
 * an inference of game flight geometry from a display name.
 * Repositioning creates a new motion with the new origin and start timestamp.
 */
export function createMotion(
  input: MotionProfile,
  origin: Point & { headingDegrees?: number },
  startedAt: number
): Motion {
  if (
    !Value.Check(motionProfileSchema, input) ||
    !Number.isFinite(startedAt) ||
    !Number.isFinite(origin.x) ||
    !Number.isFinite(origin.y) ||
    !Number.isFinite(origin.headingDegrees ?? 0)
  )
    throw new Error('Invalid motion profile, origin, or start time.');
  const profile = structuredClone(input);
  const base = { x: origin.x, y: origin.y };
  const heading = normalizeHeading(origin.headingDegrees ?? 0);
  let sample: (elapsed: number) => MotionPose;

  if (profile.kind === 'fixed') {
    sample = () => ({ ...base, headingDegrees: heading });
  } else if (profile.kind === 'straight') {
    const headingDegrees = normalizeHeading(profile.headingDegrees ?? heading);
    const direction = {
      x: Math.cos(radians(headingDegrees)),
      y: Math.sin(radians(headingDegrees))
    };
    // Cardinal headings must not drift beyond an edge due to trigonometric roundoff.
    if (Math.abs(direction.x) < 1e-14) direction.x = 0;
    if (Math.abs(direction.y) < 1e-14) direction.y = 0;
    let stopDistance = Infinity;
    const bounds = profile.bounds;
    if (bounds) {
      if (
        bounds.minX > bounds.maxX ||
        bounds.minY > bounds.maxY ||
        base.x < bounds.minX ||
        base.x > bounds.maxX ||
        base.y < bounds.minY ||
        base.y > bounds.maxY
      )
        throw new Error('Invalid motion bounds or origin outside bounds.');
      for (const [position, component, min, max] of [
        [base.x, direction.x, bounds.minX, bounds.maxX],
        [base.y, direction.y, bounds.minY, bounds.maxY]
      ] as const) {
        if (component !== 0)
          stopDistance = Math.min(
            stopDistance,
            ((component > 0 ? max : min) - position) / component
          );
      }
    }
    sample = (elapsed) => {
      const traveled = Math.min(stopDistance, elapsed * profile.speed);
      return {
        x: base.x + direction.x * traveled,
        y: base.y + direction.y * traveled,
        headingDegrees
      };
    };
  } else if (profile.kind === 'circle') {
    const sign = profile.clockwise ? -1 : 1;
    const period = (2 * Math.PI * profile.radius) / profile.speed;
    sample = (elapsed) => {
      const phase =
        radians(profile.initialAngleDegrees) + sign * ((elapsed % period) / period) * 2 * Math.PI;
      return {
        x: base.x + Math.cos(phase) * profile.radius,
        y: base.y + Math.sin(phase) * profile.radius,
        headingDegrees: degrees(phase + (sign * Math.PI) / 2)
      };
    };
  } else {
    const points = [
      base,
      ...profile.points.map((point) => ({ x: base.x + point.x, y: base.y + point.y }))
    ];
    if (profile.loop) points.push(base);
    const segments = points.slice(1).flatMap((end, index) => {
      const start = points[index]!;
      const length = distance(start, end);
      return length === 0
        ? []
        : [
            {
              start,
              end,
              length,
              headingDegrees: degrees(Math.atan2(end.y - start.y, end.x - start.x))
            }
          ];
    });
    const totalLength = segments.reduce((total, segment) => total + segment.length, 0);
    sample = (elapsed) => {
      if (totalLength === 0) return { ...base, headingDegrees: heading };
      let remaining = elapsed * profile.speed;
      if (profile.loop) remaining %= totalLength;
      for (const segment of segments) {
        if (remaining < segment.length)
          return {
            x: segment.start.x + ((segment.end.x - segment.start.x) * remaining) / segment.length,
            y: segment.start.y + ((segment.end.y - segment.start.y) * remaining) / segment.length,
            headingDegrees: segment.headingDegrees
          };
        remaining -= segment.length;
      }
      const last = segments[segments.length - 1]!;
      return { ...last.end, headingDegrees: last.headingDegrees };
    };
  }
  return {
    poseAt(time) {
      if (!Number.isFinite(time)) throw new Error('Invalid motion sample time.');
      return sample(Math.max(0, time - startedAt));
    }
  };
}

const displacementTags = Type.Array(Type.String({ minLength: 1, maxLength: 128 }), {
  maxItems: 64,
  uniqueItems: true
});
export const pathDisplacementSchema = Type.Object(
  {
    distance: Type.Number({ minimum: 0, maximum: 1e9 }),
    direction: Type.Union([Type.Literal('backward'), Type.Literal('forward')]),
    requiresDamage: Type.Optional(Type.Boolean()),
    requiresTags: Type.Optional(displacementTags),
    immuneTo: Type.Optional(displacementTags),
    // First matching entry wins. This makes class precedence explicit for targets with many tags.
    distanceScaleByTag: Type.Optional(
      Type.Array(
        Type.Object(
          {
            tag: Type.String({ minLength: 1, maxLength: 128 }),
            multiplier: Type.Number({ minimum: 0, maximum: 1000 })
          },
          objectOptions
        ),
        { maxItems: 64 }
      )
    )
  },
  objectOptions
);
export type PathDisplacement = Static<typeof pathDisplacementSchema>;
export interface PathDisplacementTarget extends CombatTarget {
  pathPosition?: number;
  displaceable?: boolean;
}
export interface PathDisplacementContext<T extends PathDisplacementTarget> {
  /** The caller supplies path bounds. An unbounded path may use positive Infinity for max. */
  bounds: { min: number; max: number };
  /** Resolves position on this target's path, including branches and coordinate offsets. */
  pointAt(position: number, target: T): Point;
  damageApplied?: number;
}
export interface PathDisplacementResult {
  from: number;
  to: number;
  delta: number;
  distance: number;
  point: Point;
}

/**
 * Applies an immediate displacement in caller-defined path distance units. The
 * caller maps source scalars to those units and supplies topology. This does not
 * infer a native map, travel speed, random distance, or timed knockback velocity.
 * Callers refresh pending collision/targeting events after a nonzero result.
 */
export function applyPathDisplacement<T extends PathDisplacementTarget>(
  profile: PathDisplacement,
  target: T,
  context: PathDisplacementContext<T>
): PathDisplacementResult | null {
  if (!Value.Check(pathDisplacementSchema, profile))
    throw new Error('Invalid path displacement profile.');
  if (
    !Number.isFinite(target.health) ||
    !Number.isFinite(target.x) ||
    !Number.isFinite(target.y) ||
    !Number.isFinite(context.damageApplied ?? 0) ||
    (context.damageApplied ?? 0) < 0
  )
    throw new Error('Invalid path displacement target or damage.');
  if (
    target.displaceable !== true ||
    target.health <= 1e-8 ||
    target.invulnerable ||
    (profile.requiresDamage && (context.damageApplied ?? 0) <= 1e-8) ||
    profile.requiresTags?.some((tag) => !target.tags?.includes(tag)) ||
    profile.immuneTo?.some((tag) => target.tags?.includes(tag))
  )
    return null;
  const from = target.pathPosition;
  const { min, max } = context.bounds;
  if (
    from === undefined ||
    !Number.isFinite(from) ||
    !Number.isFinite(min) ||
    !(Number.isFinite(max) || max === Infinity) ||
    min > max ||
    from < min ||
    from > max ||
    typeof context.pointAt !== 'function'
  )
    throw new Error('Path displacement requires a valid position, bounds, and topology resolver.');
  const multiplier =
    profile.distanceScaleByTag?.find((entry) => target.tags?.includes(entry.tag))?.multiplier ?? 1;
  const requestedDelta =
    profile.distance * multiplier * (profile.direction === 'backward' ? -1 : 1);
  const to = Math.max(min, Math.min(max, from + requestedDelta));
  if (!Number.isFinite(to)) throw new Error('Invalid displaced path position.');
  if (to === from) return { from, to, delta: 0, distance: 0, point: { x: target.x, y: target.y } };
  const resolved = context.pointAt(to, target);
  if (!resolved || !Number.isFinite(resolved.x) || !Number.isFinite(resolved.y))
    throw new Error('Path displacement topology returned an invalid point.');
  const point = { x: resolved.x, y: resolved.y };
  target.pathPosition = to;
  target.x = point.x;
  target.y = point.y;
  return { from, to, delta: to - from, distance: Math.abs(to - from), point };
}
