import { z } from 'zod';

const text = z.string().trim().min(1);
const nonnegative = z.number().finite().nonnegative();
const positive = z.number().finite().positive();
export const pathKeys = ['path1', 'path2', 'path3'] as const;
export const tierKeys = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5'] as const;
export const statKeys = [
  'damage',
  'intervalSeconds',
  'range',
  'pierce',
  'projectiles',
  'splashRadius',
  'slowPercent',
  'slowSeconds',
  'burnDamagePerSecond',
  'burnSeconds',
  'stunSeconds',
] as const;
export const attackStatsSchema = z.strictObject({
  damage: nonnegative,
  intervalSeconds: positive,
  range: positive,
  pierce: positive.int(),
  projectiles: positive.int(),
  splashRadius: nonnegative,
  slowPercent: nonnegative.max(100),
  slowSeconds: nonnegative,
  burnDamagePerSecond: nonnegative,
  burnSeconds: nonnegative,
  stunSeconds: nonnegative,
});
const delivery = z.enum(['projectile', 'instant', 'area', 'beam']);
const damageType = z.enum(['sharp', 'normal', 'explosive', 'energy']);
const targeting = z.enum(['first', 'last', 'close', 'strong']);
export const distributionSchema = z.enum(['same-primary', 'distinct-targets']);
export const followUpSchema = z.strictObject({
  name: text.max(80),
  count: positive.int().max(12),
  damageMultiplier: positive,
  radius: positive,
  inheritStatuses: z.boolean(),
});
export const attackSchema = z.strictObject({
  name: text,
  cost: positive,
  delivery,
  damageType,
  targeting,
  camo: z.boolean(),
  stats: attackStatsSchema,
  distribution: distributionSchema.optional(),
  followUp: followUpSchema.optional(),
});
export const boostStatKeys = [
  'durationSeconds',
  'cooldownSeconds',
  'damageMultiplier',
  'intervalMultiplier',
  'rangeBonus',
] as const;
export const boostSchema = z.strictObject({
  name: text,
  durationSeconds: positive,
  cooldownSeconds: positive,
  damageMultiplier: positive,
  intervalMultiplier: positive,
  rangeBonus: nonnegative,
});
const operation = z.enum(['add', 'multiply', 'set']);
export const changeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('stat'),
    target: z.literal('base'),
    stat: z.enum(statKeys),
    operation,
    value: z.number().finite(),
  }),
  z.strictObject({ kind: z.literal('camo'), target: z.literal('base'), value: z.boolean() }),
  z.strictObject({ kind: z.literal('delivery'), target: z.literal('base'), value: delivery }),
  z.strictObject({ kind: z.literal('damageType'), target: z.literal('base'), value: damageType }),
  z.strictObject({ kind: z.literal('targeting'), target: z.literal('base'), value: targeting }),
  z.strictObject({
    kind: z.literal('distribution'),
    target: z.literal('base'),
    value: distributionSchema,
  }),
  z.strictObject({
    kind: z.literal('followUp'),
    target: z.enum(['base', 'boost']),
    value: followUpSchema,
  }),
  z.strictObject({ kind: z.literal('unlockBoost'), target: z.literal('base'), boost: boostSchema }),
  z.strictObject({
    kind: z.literal('modifyBoost'),
    target: z.literal('base'),
    stat: z.enum(boostStatKeys),
    operation,
    value: z.number().finite(),
  }),
]);
const tier = z.strictObject({
  name: text.max(80),
  cost: positive,
  changes: z.array(changeSchema).min(1).max(4),
});
export const pathSpecializations = [
  'direct-damage',
  'group-damage',
  'attack-speed',
  'control',
  'range',
  'ability-burst',
] as const;
const path = z.strictObject({
  name: text.max(80),
  specialization: z.enum(pathSpecializations).optional(),
  theme: text.max(300),
  rationale: text.max(300),
  sourceFactIndices: z.array(z.number().int().nonnegative()).min(1).max(8),
  tiers: z.strictObject({ tier1: tier, tier2: tier, tier3: tier, tier4: tier, tier5: tier }),
});
const proposal = z.strictObject({ name: text, reason: text });
export const blueprintSchema = z.strictObject({
  /** Records code-owned numerical authoring, distinct from model-authored mechanics. */
  referencePattern: z.strictObject({ id: text, version: z.enum(['1', '2']) }).optional(),
  name: text,
  role: text.max(300),
  weakness: text.max(300),
  sourceFacts: z
    .array(z.strictObject({ documentId: text, quote: text.max(500) }))
    .min(1)
    .max(8),
  constraintCoverage: z.array(
    z.strictObject({ constraintId: text, implementation: text.max(500) }),
  ),
  baseAttack: attackSchema,
  paths: z.strictObject({ path1: path, path2: path, path3: path }),
  proposals: z.array(proposal),
  reservedTechniques: z.array(proposal),
});
// Diagnostics may inspect an over-budget wire translation, but still validate
// every effect and bound its size. A wire tier can encode at most 20 effects.
const diagnosticTier = tier.extend({ changes: z.array(changeSchema).max(20) });
const diagnosticPath = path.extend({
  tiers: z.strictObject({
    tier1: diagnosticTier,
    tier2: diagnosticTier,
    tier3: diagnosticTier,
    tier4: diagnosticTier,
    tier5: diagnosticTier,
  }),
});
export const diagnosticBlueprintSchema = blueprintSchema.extend({
  paths: z.strictObject({ path1: diagnosticPath, path2: diagnosticPath, path3: diagnosticPath }),
});

const enemyProperty = z.enum(['lead', 'frozen', 'purple', 'black', 'zebra', 'blimp', 'boss']);
const properties = z.array(enemyProperty);
export const mechanicsDefinitionSchema = z.strictObject({
  version: z.literal('1'),
  id: text,
  revision: text,
  label: text,
  balanceStatus: z.literal('experimental-starter-scale'),
  progression: z.strictObject({
    pathCount: z.literal(3),
    tiersPerPath: z.literal(5),
    maxPurchasedPaths: z.number().int().min(1).max(2),
    maxAdvancedPaths: z.literal(1),
    crosspathTier: z.number().int().min(1).max(2),
  }),
  rules: z.strictObject({
    attackExtensions: z.array(z.enum(['distinct-volley', 'volley-follow-up'])).optional(),
    arithmetic: z.literal('highest-tier-set-then-add-then-multiply'),
    tieBreak: z.literal('path-order-then-change-order'),
    detection: z.literal('camo-is-target-access-only'),
    obstruction: z.literal('all-deliveries-require-clear-path'),
    projectileDistribution: z.literal('same-primary-target-per-volley'),
    targetCap: z.literal('per-projectile-including-primary-and-splash'),
    manualBoostUnlockTier: z.literal(4),
    manualBoostModifyTier: z.literal(5),
    abilityReadiness: z.literal(
      'ready-on-purchase-cooldown-starts-on-activation-no-reactivation-while-active',
    ),
    slowStacking: z.literal('strongest-only-refresh-duration'),
    burnStacking: z.literal('strongest-only-refresh-duration'),
    stunStacking: z.literal('refresh-duration'),
    damageImmunities: z.strictObject({
      sharp: properties,
      normal: properties,
      explosive: properties,
      energy: properties,
    }),
    slowImmune: properties,
    stunImmune: properties,
  }),
  profile: z.strictObject({
    currency: text,
    /** Explicit construction strategy, including edited requests and revisions. */
    authoringMode: z.enum(['direct', 'reference-patterns-v1', 'planned-v1']).optional(),
    /** Opt-in authoring policy. Existing explicit definitions retain their original checks. */
    designPolicy: z
      .strictObject({
        version: z.literal('1'),
        distinctPathSpecializations: z.boolean(),
        distinctFirstUpgrades: z.boolean(),
        distinctCapstones: z.boolean(),
        preserveEarlyAttackIdentity: z.boolean().optional(),
        maxManualAbilityPaths: z.number().int().min(0).max(3),
        /** Omission preserves count-only legacy policies; null forbids manual boosts. */
        manualAbilityPath: z.enum(pathKeys).nullable().optional(),
        minTier5SpecialtyMultiplier: z.number().finite().gt(1).max(20).optional(),
        requireTier3BehaviorChange: z.boolean().optional(),
        requireTier5BehaviorChange: z.boolean().optional(),
        tier5Uniqueness: z.literal('one-per-player-unit-type-and-path'),
      })
      .optional(),
    /** Optional so previously retained and custom definitions remain valid. */
    referenceScale: z
      .strictObject({
        healthResource: text,
        startingHealth: positive,
        ordinaryEnemyHealth: positive,
        baseCost: positive,
        baseDamage: positive,
        baseIntervalSeconds: positive,
        baseRange: positive,
        basePierce: positive.int(),
        incrementalUpgradeCosts: z.tuple([positive, positive, positive, positive, positive]),
      })
      .optional(),
    maxBaseCost: positive,
    maxUpgradeCost: positive,
    maxStatValue: positive,
    maxChangesPerTier: z.number().int().min(1).max(4),
    earlyTierMaxChanges: z.number().int().min(1).max(3),
    /** Omission preserves legacy change budgets through tier 3. */
    earlyTierThrough: z.number().int().min(1).max(3).optional(),
    earlyTierMaxNewCapabilities: z.number().int().min(0).max(1),
  }),
});
export type UnitBlueprint = z.infer<typeof blueprintSchema>;
export type MechanicsDefinition = z.infer<typeof mechanicsDefinitionSchema>;
export type Attack = z.infer<typeof attackSchema>;
export type AttackStats = z.infer<typeof attackStatsSchema>;
export type Boost = z.infer<typeof boostSchema>;
export type FollowUp = z.infer<typeof followUpSchema>;
export type Change = z.infer<typeof changeSchema>;
export type BuildSelection = [number, number, number];
export type MechanicsIssue = { path: string; message: string };
export type EnemyProperty = z.infer<typeof enemyProperty>;

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export const defaultMechanicsDefinition: MechanicsDefinition = freeze({
  version: '1',
  id: 'btd6-combat-v1',
  revision: '2026-09-20',
  label: 'BTD6-inspired Gold and Health starter',
  balanceStatus: 'experimental-starter-scale',
  progression: {
    pathCount: 3,
    tiersPerPath: 5,
    maxPurchasedPaths: 2,
    maxAdvancedPaths: 1,
    crosspathTier: 2,
  },
  rules: {
    arithmetic: 'highest-tier-set-then-add-then-multiply',
    tieBreak: 'path-order-then-change-order',
    detection: 'camo-is-target-access-only',
    obstruction: 'all-deliveries-require-clear-path',
    projectileDistribution: 'same-primary-target-per-volley',
    targetCap: 'per-projectile-including-primary-and-splash',
    manualBoostUnlockTier: 4,
    manualBoostModifyTier: 5,
    abilityReadiness:
      'ready-on-purchase-cooldown-starts-on-activation-no-reactivation-while-active',
    slowStacking: 'strongest-only-refresh-duration',
    burnStacking: 'strongest-only-refresh-duration',
    stunStacking: 'refresh-duration',
    damageImmunities: {
      sharp: ['lead', 'frozen'],
      normal: [],
      explosive: ['black', 'zebra'],
      energy: ['purple'],
    },
    slowImmune: ['blimp', 'boss'],
    stunImmune: ['blimp', 'boss'],
  },
  profile: {
    currency: 'Gold',
    referenceScale: {
      healthResource: 'Health',
      startingHealth: 150,
      ordinaryEnemyHealth: 1,
      baseCost: 200,
      baseDamage: 1,
      baseIntervalSeconds: 0.95,
      baseRange: 32,
      basePierce: 2,
      incrementalUpgradeCosts: [140, 200, 320, 1800, 15000],
    },
    maxBaseCost: 10000,
    maxUpgradeCost: 1000000,
    maxStatValue: 1000000,
    maxChangesPerTier: 4,
    earlyTierMaxChanges: 3,
    earlyTierMaxNewCapabilities: 1,
  },
});
