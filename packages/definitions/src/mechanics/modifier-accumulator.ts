import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { statModifierSchema, type ModifierProfile } from './modifiers.js';
import { compileTargetPredicate } from './targeting.js';

export const modifierAccumulatorSchema = Type.Object(
  {
    id: Type.String({ minLength: 1, maxLength: 100 }),
    threshold: Type.Number({ exclusiveMinimum: 0, maximum: 1e12 }),
    // One provider accepts at most 256 modifier profiles in the existing stat runtime.
    maxStacks: Type.Integer({ minimum: 1, maximum: 256 }),
    inactivitySeconds: Type.Union([
      Type.Number({ exclusiveMinimum: 0, maximum: 1e12 }),
      Type.Null()
    ]),
    modifier: Type.Intersect([
      statModifierSchema,
      Type.Object({
        operation: Type.Union([Type.Literal('add'), Type.Literal('multiply')]),
        value: Type.Number(),
        stacking: Type.Literal('stack')
      })
    ])
  },
  { additionalProperties: false }
);

export type ModifierAccumulatorProfile = Static<typeof modifierAccumulatorSchema>;
export interface ModifierAccumulatorSnapshot {
  id: string;
  at: number;
  earned: number;
  stacks: number;
  lastEarnedAt: number | null;
  expiresAt: number | null;
  modifiers: ModifierProfile[];
}

/** The caller supplies earned amounts. This helper does not decide damage attribution,
 * overkill credit, live RBE, frame conversion or source reset rules. Numeric stacks
 * use applyModifiers unchanged, including its explicit multiply/add phase policy.
 * Positive earning refreshes inactivity even at the cap; zero earning does not.
 * Expiry is inclusive and settles before an event at the same timestamp.
 */
export function createModifierAccumulator(input: ModifierAccumulatorProfile) {
  // Bound recursive predicate validation before walking the enclosing schema.
  if (input.modifier?.recipientFilter !== undefined)
    compileTargetPredicate(input.modifier.recipientFilter);
  if (
    !Value.Check(modifierAccumulatorSchema, input) ||
    input.modifier.maxStacks !== input.maxStacks
  )
    throw new Error('Invalid modifier accumulator profile or mismatched stack cap.');
  const profile = structuredClone(input);
  const capacity = profile.threshold * profile.maxStacks;
  let earned = 0;
  let time = 0;
  let lastEarnedAt: number | null = null;
  let expiresAt: number | null = null;
  const checkTime = (at: number) => {
    if (!Number.isFinite(at) || at < time)
      throw new Error('Modifier accumulator time must be finite and nondecreasing.');
  };
  const clear = () => {
    earned = 0;
    lastEarnedAt = null;
    expiresAt = null;
  };
  const settle = (at: number) => {
    time = at;
    if (expiresAt !== null && at >= expiresAt) clear();
  };
  const snapshot = (): ModifierAccumulatorSnapshot => {
    const stacks = earned === capacity ? profile.maxStacks : Math.floor(earned / profile.threshold);
    return {
      id: profile.id,
      at: time,
      earned,
      stacks,
      lastEarnedAt,
      expiresAt,
      modifiers: Array.from({ length: stacks }, (_, index) => ({
        ...structuredClone(profile.modifier),
        id: `${profile.id}/stack/${index + 1}`
      }))
    };
  };
  return {
    earn(amount: number, at: number): ModifierAccumulatorSnapshot {
      checkTime(at);
      if (!Number.isFinite(amount) || amount < 0)
        throw new Error('Earned modifier amount must be finite and nonnegative.');
      const nextExpiry = profile.inactivitySeconds === null ? null : at + profile.inactivitySeconds;
      if (amount > 0 && nextExpiry !== null && !Number.isFinite(nextExpiry))
        throw new Error('Modifier accumulator expiry exceeds finite time.');
      settle(at);
      if (amount > 0) {
        earned = Math.min(capacity, earned + Math.min(amount, capacity));
        lastEarnedAt = at;
        expiresAt = nextExpiry;
      }
      return snapshot();
    },
    reset(at: number): ModifierAccumulatorSnapshot {
      checkTime(at);
      settle(at);
      clear();
      return snapshot();
    },
    snapshot(at: number): ModifierAccumulatorSnapshot {
      checkTime(at);
      settle(at);
      return snapshot();
    }
  };
}
