import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import {
  compileTargetPredicate,
  MissingTargetFactsError,
  targetPredicateSchema,
  type TargetContext,
  type TargetEntity
} from './targeting.js';

const id = Type.String({ minLength: 1, maxLength: 128 });
const choices = <const T extends string>(values: T[]) =>
  Type.Union(values.map((value) => Type.Literal(value)));
const numericStatSchema = choices([
  'attack.damage',
  'attack.intervalSeconds',
  'attack.range',
  'attack.pierce',
  'ability.cooldownSeconds',
  'income.amount',
  'progression.xpMultiplier',
  'purchase.cost'
]);
const shared = {
  id,
  group: id,
  stacking: choices(['unique', 'stack']),
  maxStacks: Type.Integer({ minimum: 1, maximum: 10000 }),
  radius: Type.Union([Type.Number({ minimum: 0, maximum: 1e12 }), Type.Null()]),
  includesOwner: Type.Boolean(),
  includesSubordinates: Type.Boolean(),
  recipientFilter: Type.Optional(targetPredicateSchema)
};
const strict = { additionalProperties: false };
export const statModifierSchema = Type.Union([
  Type.Object(
    {
      ...shared,
      stat: numericStatSchema,
      operation: Type.Literal('add'),
      value: Type.Number({ minimum: -1e12, maximum: 1e12 })
    },
    strict
  ),
  Type.Object(
    {
      ...shared,
      stat: numericStatSchema,
      operation: choices(['multiply', 'set']),
      value: Type.Number({ minimum: 0, maximum: 1e12 })
    },
    strict
  ),
  Type.Object(
    {
      ...shared,
      stat: Type.Literal('attack.detectConcealed'),
      operation: Type.Literal('set'),
      value: Type.Boolean()
    },
    strict
  )
]);

export type ModifierProfile = Static<typeof statModifierSchema>;
export type ModifierStat = ModifierProfile['stat'];
/** Contact profiles reuse the scalar policy and recipient predicates. */
export const contactDamageModifierSchema = Type.Intersect([
  statModifierSchema,
  Type.Object({ stat: Type.Literal('attack.damage') })
]);
export type ContactDamageModifier = ModifierProfile & { stat: 'attack.damage' };
export interface ModifierProvider extends TargetEntity {
  modifiers: readonly ModifierProfile[];
  /** The caller removes expired providers or sets active to false. */
  active?: boolean;
}
export interface AppliedModifierSource {
  providerId: string;
  modifierId: string;
  group: string;
}
export interface ModifierResult<T extends number | boolean = number | boolean> {
  value: T;
  appliedSources: AppliedModifierSource[];
}

/** Normalized composition policy, not a claim about a source engine's ordering.
 * Each phase sorts groups, then providers and modifier IDs by code-point order.
 * A later set replaces an earlier set. Multipliers are direct factors, so .85
 * means multiply by .85. Additive range fields use the add operation separately.
 */
export const MODIFIER_PHASE_ORDER = ['set', 'multiply', 'add'] as const;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;

function validateStatValue(value: number | boolean, stat: ModifierStat) {
  if (stat === 'attack.detectConcealed') {
    if (typeof value !== 'boolean') throw new Error('Concealment detection requires a boolean.');
  } else {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
      throw new Error(`Modifier stat ${stat} requires a finite nonnegative number.`);
    if (stat === 'attack.intervalSeconds' && value === 0)
      throw new Error('Attack interval must be positive.');
  }
}

export function applyModifiers<T extends TargetEntity>(
  baseStat: boolean,
  stat: 'attack.detectConcealed',
  recipient: T,
  providers: readonly ModifierProvider[],
  context?: TargetContext<T>
): ModifierResult<boolean>;
export function applyModifiers<T extends TargetEntity>(
  baseStat: number,
  stat: Exclude<ModifierStat, 'attack.detectConcealed'>,
  recipient: T,
  providers: readonly ModifierProvider[],
  context?: TargetContext<T>
): ModifierResult<number>;
export function applyModifiers<T extends TargetEntity>(
  baseStat: number | boolean,
  stat: ModifierStat,
  recipient: T,
  providers: readonly ModifierProvider[],
  context: TargetContext<T> = {}
): ModifierResult {
  if (stat !== 'attack.detectConcealed' && !Value.Check(numericStatSchema, stat))
    throw new Error('Unknown modifier stat.');
  validateStatValue(baseStat, stat);
  if (!validId(recipient.id)) throw new Error('Modifier recipient requires an ID.');
  if (providers.length > 10000) throw new Error('Modifier provider limit exceeded.');
  const providerIds = new Set<string>();
  const groups = new Map<string, { profile: ModifierProfile; sources: AppliedModifierSource[] }>();
  for (const provider of providers) {
    if (!validId(provider.id) || providerIds.has(provider.id))
      throw new Error('Modifier providers require unique IDs.');
    providerIds.add(provider.id);
    if (provider.active !== undefined && typeof provider.active !== 'boolean')
      throw new Error('Modifier provider active must be boolean.');
    if (provider.active === false) continue;
    if (!Array.isArray(provider.modifiers) || provider.modifiers.length > 256)
      throw new Error('Modifier provider profile limit exceeded.');
    const modifierIds = new Set<string>();
    for (const profile of provider.modifiers) {
      // Validate recursive filters with their bounded compiler before schema traversal.
      const filter =
        profile.recipientFilter === undefined
          ? undefined
          : compileTargetPredicate(profile.recipientFilter);
      if (!Value.Check(statModifierSchema, profile) || modifierIds.has(profile.id))
        throw new Error('Invalid modifier profile or duplicate modifier ID.');
      modifierIds.add(profile.id);
      if (profile.stacking === 'unique' && profile.maxStacks !== 1)
        throw new Error('Unique modifier groups require maxStacks 1.');
      if (profile.stat !== stat) continue;
      if (provider.id === recipient.id && !profile.includesOwner) continue;
      // parentId denotes a direct subordinate. null establishes no parent, while
      // undefined is unknown. ownerId can instead denote a player.
      if (provider.id !== recipient.id && !profile.includesSubordinates) {
        if (recipient.parentId === undefined)
          throw new MissingTargetFactsError(recipient.id, ['parentId']);
        if (recipient.parentId === provider.id) continue;
      }
      if (profile.radius !== null) {
        if (![provider.x, provider.y, recipient.x, recipient.y].every(Number.isFinite))
          throw new Error('Local modifiers require finite provider and recipient positions.');
        if (Math.hypot(provider.x - recipient.x, provider.y - recipient.y) > profile.radius)
          continue;
      }
      if (filter && !filter.test(recipient, { ...context, origin: provider, source: provider }))
        continue;
      const previous = groups.get(profile.group);
      if (
        previous &&
        (previous.profile.operation !== profile.operation ||
          previous.profile.value !== profile.value ||
          previous.profile.stacking !== profile.stacking ||
          previous.profile.maxStacks !== profile.maxStacks)
      )
        throw new Error(
          `Conflicting modifier group ${profile.group}; explicit source stacking policy is required.`
        );
      const group = previous ?? { profile, sources: [] };
      group.sources.push({ providerId: provider.id, modifierId: profile.id, group: profile.group });
      groups.set(profile.group, group);
    }
  }
  let value = baseStat;
  const appliedSources: AppliedModifierSource[] = [];
  for (const phase of MODIFIER_PHASE_ORDER) {
    for (const [, group] of [...groups].sort(([a], [b]) => compare(a, b))) {
      if (group.profile.operation !== phase) continue;
      const sources = group.sources
        .sort((a, b) => compare(a.providerId, b.providerId) || compare(a.modifierId, b.modifierId))
        .slice(0, group.profile.maxStacks);
      for (const source of sources) {
        if (group.profile.operation === 'set') value = group.profile.value;
        else {
          if (typeof value !== 'number') throw new Error('Numeric modifier requires a number.');
          value =
            group.profile.operation === 'multiply'
              ? value * group.profile.value
              : value + group.profile.value;
        }
        validateStatValue(value, stat);
        appliedSources.push(source);
      }
    }
  }
  return { value, appliedSources };
}

/** Compute contact damage against current recipient facts. The projectile caller owns
 * the launch snapshot of owner, profiles and baseDamage. This helper does not apply
 * armor, vulnerability, immunity, health changes or game-specific damage caps.
 */
export function applyContactDamageModifiers<T extends TargetEntity>(
  baseDamage: number,
  recipient: T,
  owner: TargetEntity,
  profiles: readonly ModifierProfile[],
  context: TargetContext<T> = {}
): ModifierResult<number> {
  if (profiles.some((profile) => profile.stat !== 'attack.damage'))
    throw new Error('Contact damage modifiers require attack.damage.');
  return applyModifiers(
    baseDamage,
    'attack.damage',
    recipient,
    [{ ...owner, modifiers: profiles }],
    context
  );
}
