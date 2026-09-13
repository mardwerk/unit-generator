import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { distance, type Point } from './geometry.js';

const id = Type.String({ minLength: 1, maxLength: 128 });
const ids = Type.Array(id, { maxItems: 64, uniqueItems: true });
const positive = Type.Number({ exclusiveMinimum: 0, maximum: 1e9 });
const point = Type.Object({ x: Type.Number(), y: Type.Number() }, { additionalProperties: false });
const circle = Type.Object(
  { kind: Type.Literal('circle'), radius: positive },
  { additionalProperties: false }
);
export const footprintSchema = Type.Union([
  circle,
  Type.Object(
    { kind: Type.Literal('rectangle'), width: positive, height: positive },
    { additionalProperties: false }
  )
]);
export const placementProfileSchema = Type.Object(
  {
    footprint: footprintSchema,
    areaTypes: Type.Array(id, { minItems: 1, maxItems: 64, uniqueItems: true }),
    category: id,
    size: id,
    blocksPlacement: Type.Boolean(),
    ignoreOverlap: Type.Boolean()
  },
  { additionalProperties: false }
);
const removalPolicy = Type.Union([Type.Literal('retain'), Type.Literal('remove')]);
export const createdAreaSchema = Type.Object(
  {
    id,
    shape: Type.Union([
      circle,
      Type.Object(
        {
          kind: Type.Literal('convex-polygon'),
          points: Type.Array(point, { minItems: 3, maxItems: 65 })
        },
        { additionalProperties: false }
      )
    ]),
    areaType: id,
    allowedCategories: ids,
    allowedSizes: ids,
    excludedModelIds: ids,
    onOwnerRemoved: removalPolicy,
    onAreaChanged: removalPolicy
  },
  { additionalProperties: false }
);
export type Footprint = Static<typeof footprintSchema>;
export type PlacementProfile = Static<typeof placementProfileSchema>;
export type CreatedArea = Static<typeof createdAreaSchema>;
export interface PlacementRequest {
  id: string;
  modelId: string;
  profile: PlacementProfile;
  position: Point;
  supportAreaId: string;
}
export interface PlacedActor extends Omit<PlacementRequest, 'supportAreaId'> {
  supportAreaId: string | null;
}
export type PlacementRejection = {
  ok: false;
  reason:
    | 'duplicate-actor'
    | 'missing-area'
    | 'area-type'
    | 'category'
    | 'size'
    | 'excluded-model'
    | 'outside-area'
    | 'overlap';
  blockerId?: string;
};
export type PlacementCheck = { ok: true } | PlacementRejection;
interface AreaEntry {
  profile: CreatedArea;
  origin: Point;
  ownerId: string | null;
}
const validPoint = (p: Point) => [p.x, p.y].every(Number.isFinite);
const corners = (p: Point, f: Extract<Footprint, { kind: 'rectangle' }>) => [
  { x: p.x - f.width / 2, y: p.y - f.height / 2 },
  { x: p.x + f.width / 2, y: p.y - f.height / 2 },
  { x: p.x + f.width / 2, y: p.y + f.height / 2 },
  { x: p.x - f.width / 2, y: p.y + f.height / 2 }
];
const cross = (a: Point, b: Point, p: Point) =>
  (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
function polygon(points: Point[]) {
  const vertices = points.slice();
  if (vertices.length > 1 && distance(vertices[0]!, vertices.at(-1)!) === 0) vertices.pop();
  const signedArea = vertices.reduce((sum, a, i) => {
    const b = vertices[(i + 1) % vertices.length]!;
    return sum + a.x * b.y - a.y * b.x;
  }, 0);
  const direction = Math.sign(signedArea);
  if (
    vertices.length < 3 ||
    vertices.length > 64 ||
    !direction ||
    vertices.some((a, i) => {
      const b = vertices[(i + 1) % vertices.length]!;
      return (
        !validPoint(a) ||
        distance(a, b) === 0 ||
        vertices.some((p) => cross(a, b, p) * direction < 0)
      );
    })
  )
    throw new Error('Placement areas require a finite convex polygon.');
  return { vertices, direction };
}

/** Footprints use centers and axis-aligned dimensions. Tangency is legal; positive overlap blocks. */
export function footprintsOverlap(a: Footprint, at: Point, b: Footprint, bt: Point): boolean {
  if (a.kind === 'circle' && b.kind === 'circle') return distance(at, bt) < a.radius + b.radius;
  if (a.kind === 'rectangle' && b.kind === 'rectangle')
    return (
      Math.abs(at.x - bt.x) < (a.width + b.width) / 2 &&
      Math.abs(at.y - bt.y) < (a.height + b.height) / 2
    );
  if (a.kind === 'rectangle') return footprintsOverlap(b, bt, a, at);
  if (b.kind !== 'rectangle') return false;
  const nearest = {
    x: Math.max(bt.x - b.width / 2, Math.min(at.x, bt.x + b.width / 2)),
    y: Math.max(bt.y - b.height / 2, Math.min(at.y, bt.y + b.height / 2))
  };
  return distance(at, nearest) < a.radius;
}

/** The whole footprint must fit inside one explicitly selected supporting area, including its edge. */
export function areaContainsFootprint(
  area: CreatedArea,
  origin: Point,
  footprint: Footprint,
  position: Point
) {
  const local = { x: position.x - origin.x, y: position.y - origin.y };
  if (area.shape.kind === 'circle') {
    const radius = area.shape.radius;
    return footprint.kind === 'circle'
      ? distance({ x: 0, y: 0 }, local) + footprint.radius <= radius
      : corners(local, footprint).every((p) => distance({ x: 0, y: 0 }, p) <= radius);
  }
  const { vertices, direction } = polygon(area.shape.points);
  return vertices.every((a, i) => {
    const b = vertices[(i + 1) % vertices.length]!;
    return footprint.kind === 'circle'
      ? cross(a, b, local) * direction >= footprint.radius * distance(a, b)
      : corners(local, footprint).every((p) => cross(a, b, p) * direction >= 0);
  });
}

/** The host supplies terrain labels, local area coordinates and recipient categories explicitly.
 * Empty include lists allow all recipients. No overlay precedence or alternate-support search is
 * inferred. Retained dependents detach from removed support. Removal callbacks run after registry
 * cleanup and should stop the corresponding host runtime. Source Z, rotation, track constraints and
 * interactions between native sale/change flags need separate adapter qualification.
 */
export function createPlacementRuntime(
  callbacks: {
    onRemove?: (actor: PlacedActor, reason: 'requested' | 'support-removed') => void;
  } = {}
) {
  const actors = new Map<string, PlacedActor>();
  const areas = new Map<string, AreaEntry>();
  type Removed = { actor: PlacedActor; reason: 'requested' | 'support-removed' };
  function removeArea(
    areaId: string,
    reason: 'owner-removed' | 'area-changed',
    removed: Removed[]
  ) {
    const area = areas.get(areaId);
    if (!area) return false;
    areas.delete(areaId);
    const policy =
      reason === 'owner-removed' ? area.profile.onOwnerRemoved : area.profile.onAreaChanged;
    for (const actor of [...actors.values()])
      if (actor.supportAreaId === areaId) {
        if (policy === 'remove') removeActor(actor.id, 'support-removed', removed);
        else actor.supportAreaId = null;
      }
    return true;
  }
  function removeActor(actorId: string, reason: Removed['reason'], removed: Removed[]) {
    const actor = actors.get(actorId);
    if (!actor) return false;
    actors.delete(actorId);
    for (const [id, area] of [...areas])
      if (area.ownerId === actorId) removeArea(id, 'owner-removed', removed);
    removed.push({ actor, reason });
    return true;
  }
  const notify = (removed: Removed[]) => {
    for (const { actor, reason } of removed) callbacks.onRemove?.(structuredClone(actor), reason);
  };
  function check(request: PlacementRequest): PlacementCheck {
    if (
      !Value.Check(placementProfileSchema, request.profile) ||
      !request.id ||
      !request.modelId ||
      !request.supportAreaId ||
      !validPoint(request.position)
    )
      throw new Error('Invalid placement request.');
    if (actors.has(request.id)) return { ok: false, reason: 'duplicate-actor' };
    const area = areas.get(request.supportAreaId);
    if (!area) return { ok: false, reason: 'missing-area' };
    const { profile } = area;
    if (!request.profile.areaTypes.includes(profile.areaType))
      return { ok: false, reason: 'area-type' };
    if (
      profile.allowedCategories.length &&
      !profile.allowedCategories.includes(request.profile.category)
    )
      return { ok: false, reason: 'category' };
    if (profile.allowedSizes.length && !profile.allowedSizes.includes(request.profile.size))
      return { ok: false, reason: 'size' };
    if (profile.excludedModelIds.includes(request.modelId))
      return { ok: false, reason: 'excluded-model' };
    if (!areaContainsFootprint(profile, area.origin, request.profile.footprint, request.position))
      return { ok: false, reason: 'outside-area' };
    if (!request.profile.ignoreOverlap)
      for (const actor of actors.values())
        if (
          actor.profile.blocksPlacement &&
          footprintsOverlap(
            request.profile.footprint,
            request.position,
            actor.profile.footprint,
            actor.position
          )
        )
          return { ok: false, reason: 'overlap', blockerId: actor.id };
    return { ok: true };
  }
  return {
    addArea(input: CreatedArea, origin: Point, ownerId?: string) {
      if (!Value.Check(createdAreaSchema, input) || !validPoint(origin))
        throw new Error('Invalid placement area.');
      if (areas.has(input.id)) throw new Error('Duplicate placement area.');
      if (ownerId !== undefined && !actors.has(ownerId))
        throw new Error('Missing placement area owner.');
      if (areas.size >= 256) throw new Error('Placement area budget exceeded.');
      const profile = structuredClone(input);
      if (profile.shape.kind === 'convex-polygon')
        profile.shape.points = polygon(profile.shape.points).vertices;
      areas.set(profile.id, { profile, origin: { ...origin }, ownerId: ownerId ?? null });
      return profile.id;
    },
    check,
    place(request: PlacementRequest): { ok: true; actor: PlacedActor } | PlacementRejection {
      const result = check(request);
      if (!result.ok) return result;
      if (actors.size >= 256) throw new Error('Placement actor budget exceeded.');
      const actor = structuredClone(request);
      actors.set(actor.id, actor);
      return { ok: true, actor: structuredClone(actor) };
    },
    removeActor(actorId: string) {
      const removed: Removed[] = [];
      const result = removeActor(actorId, 'requested', removed);
      notify(removed);
      return result;
    },
    removeArea(areaId: string, reason: 'owner-removed' | 'area-changed' = 'area-changed') {
      const removed: Removed[] = [];
      const result = removeArea(areaId, reason, removed);
      notify(removed);
      return result;
    },
    snapshot() {
      return {
        actors: structuredClone([...actors.values()]),
        areas: structuredClone([...areas.values()])
      };
    }
  };
}
