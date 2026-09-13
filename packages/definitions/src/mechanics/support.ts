import { Type, type Static } from '@sinclair/typebox';
const number = Type.Number({ minimum: 0, maximum: 1e9 });
const id = Type.String({ minLength: 1, maxLength: 128 });
export const rangeSupportSchema = Type.Object(
  {
    id,
    radius: number,
    global: Type.Boolean(),
    includesOwner: Type.Boolean(),
    stackGroup: id,
    rangeMultiplier: number,
    rangeAdditive: number
  },
  { additionalProperties: false }
);
export type RangeSupport = Static<typeof rangeSupportSchema>;
export interface SupportPlacement {
  id: string;
  x: number;
  y: number;
  support: RangeSupport[];
}
/** Unique groups cannot stack. Conflicting same-group values require an explicit stacking policy. */
export function supportedRange(
  baseRange: number,
  recipient: { id: string; x: number; y: number },
  placements: SupportPlacement[]
) {
  const groups = new Map<string, RangeSupport>();
  for (const placement of placements)
    for (const support of placement.support) {
      if (
        (!support.includesOwner && placement.id === recipient.id) ||
        (!support.global &&
          Math.hypot(placement.x - recipient.x, placement.y - recipient.y) > support.radius)
      )
        continue;
      const prior = groups.get(support.stackGroup);
      if (
        prior &&
        (prior.rangeMultiplier !== support.rangeMultiplier ||
          prior.rangeAdditive !== support.rangeAdditive)
      )
        throw new Error(
          `Conflicting unique support group ${support.stackGroup}; captured stacking policy is required.`
        );
      groups.set(support.stackGroup, support);
    }
  // Distinct groups compose in identifier order, keeping caller order immaterial.
  let range = baseRange;
  for (const [, support] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)))
    range = range * (1 + support.rangeMultiplier) + support.rangeAdditive;
  return range;
}
