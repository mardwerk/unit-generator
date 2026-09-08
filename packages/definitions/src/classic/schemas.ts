import { Type, type Static, type TSchema } from '@sinclair/typebox';

export const UNIT_SPEC_SCHEMA_VERSION = '0.1' as const;
export const REFERENCE_BUNDLE_SCHEMA_VERSION = '0.1' as const;
export const DIAGNOSTIC_PROFILE_VERSION = 'synthetic-0.2' as const;
export const SOURCE_POINTER_PATTERN =
  "^#(?:/(?:[A-Za-z0-9._!$&'()*+,;=:@/?-]|~[01]|%[0-9A-Fa-f]{2})*)?$" as const;
export const TARGET_POINTER_PATTERN = '^(?:/(?:[^~/]|~[01])*)*$' as const;

/** Shared trust-boundary limits for schema and semantic validation. */
export const VALIDATION_LIMITS = {
  maximumIssues: 128,
  maximumDepth: 128,
  maximumCollectionItems: 256,
  maximumJsonNodes: 65_536
} as const;

/** Largest absolute input used by report and simulation accumulators. */
export const MAXIMUM_ACCUMULATOR_MAGNITUDE = 1_000_000_000_000;

export const UNIT_EXECUTION_LIMITS = {
  maximumTargets: 256,
  maximumEmitters: 64,
  maximumEmitterCount: 64,
  maximumProjectilesPerCycle: 256,
  maximumEmissionsPerCycle: 4_096,
  maximumTargetApplicationsPerCycle: 16_384,
  maximumStacks: 64,
  maximumSpawnInstances: 64,
  maximumForcedMovementApplicationsPerTarget: 64,
  maximumSecondaryTriggersPerCycle: 32,
  maximumAbilityCharges: 32,
  maximumConcurrentSummons: 64,
  maximumUpgradeTier: 64,
  maximumCrossPaths: 64,
  maximumSelectedNodes: 256
} as const;

const ID_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$';
const EXTENSION_KEY_PATTERN = '^[a-z0-9]+(?:[.-][a-z0-9]+)+$';
const id = () => Type.String({ pattern: ID_PATTERN });
const text = () => Type.String({ minLength: 1 });
const signed = () =>
  Type.Number({
    minimum: -MAXIMUM_ACCUMULATOR_MAGNITUDE,
    maximum: MAXIMUM_ACCUMULATOR_MAGNITUDE
  });
const nonNegative = () => Type.Number({ minimum: 0, maximum: MAXIMUM_ACCUMULATOR_MAGNITUDE });
const positive = () => Type.Number({ exclusiveMinimum: 0, maximum: MAXIMUM_ACCUMULATOR_MAGNITUDE });
const ratio = () => Type.Number({ minimum: 0, maximum: 1 });
const count = (maximum: number) => Type.Integer({ minimum: 1, maximum });
const list = <T extends TSchema>(
  items: T,
  options: { minItems?: number; maxItems?: number; uniqueItems?: boolean } = {}
) =>
  Type.Array(items, {
    ...options,
    maxItems: Math.min(
      options.maxItems ?? VALIDATION_LIMITS.maximumCollectionItems,
      VALIDATION_LIMITS.maximumCollectionItems
    )
  });
const strict = <T extends Record<string, TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });

export const simulationScenarioSchema = strict({
  schemaVersion: Type.Literal('0.1'),
  id: id(),
  purpose: Type.String({ minLength: 1, maxLength: 512 }),
  durationSeconds: Type.Number({ exclusiveMinimum: 0, maximum: 120 }),
  seed: Type.Integer({ minimum: 0, maximum: 4_294_967_295 }),
  abilityPolicy: Type.Union([
    Type.Literal('never'),
    Type.Literal('automatic'),
    Type.Literal('on-cooldown')
  ]),
  enemies: Type.Array(
    strict({
      id: id(),
      spawnSeconds: Type.Number({ minimum: 0, maximum: 120 }),
      startDistanceWorldUnits: Type.Number({ minimum: 0, maximum: 1_000_000 }),
      speedWorldUnitsPerSecond: Type.Number({ minimum: 0, maximum: 1_000_000 }),
      healthHitPoints: Type.Number({
        exclusiveMinimum: 0,
        maximum: MAXIMUM_ACCUMULATOR_MAGNITUDE
      }),
      tags: Type.Array(Type.String({ minLength: 1, maxLength: 128 }), {
        maxItems: 64,
        uniqueItems: true
      }),
      resistances: Type.Record(
        Type.String({ minLength: 1, maxLength: 128 }),
        Type.Number({ minimum: 0, maximum: 1 }),
        { maxProperties: 64 }
      )
    }),
    { maxItems: 256 }
  )
});

export const conditionSchema = strict({
  subject: Type.Union([
    Type.Literal('resource'),
    Type.Literal('target-tag'),
    Type.Literal('state'),
    Type.Literal('health-fraction')
  ]),
  referenceId: Type.Optional(id()),
  operator: Type.Union([
    Type.Literal('eq'),
    Type.Literal('neq'),
    Type.Literal('gt'),
    Type.Literal('gte'),
    Type.Literal('lt'),
    Type.Literal('lte'),
    Type.Literal('contains')
  ]),
  value: Type.Union([Type.String(), signed(), Type.Boolean()])
});

export const triggerSchema = Type.Union([
  strict({ type: Type.Literal('interval'), intervalSeconds: positive() }),
  strict({ type: Type.Literal('manual') }),
  strict({
    type: Type.Union([
      Type.Literal('on-hit'),
      Type.Literal('on-kill'),
      Type.Literal('on-wave-start'),
      Type.Literal('on-damage')
    ]),
    sourceActionId: Type.Optional(id())
  }),
  strict({ type: Type.Literal('health-threshold'), fraction: ratio() }),
  strict({
    type: Type.Literal('resource-threshold'),
    resourceId: id(),
    amount: nonNegative(),
    operator: Type.Union([Type.Literal('gte'), Type.Literal('lte')])
  }),
  strict({ type: Type.Literal('state-change'), stateId: id(), to: Type.String() })
]);

export const targetingSchema = strict({
  id: id(),
  type: Type.Union(
    [
      'self',
      'first',
      'last',
      'nearest',
      'strongest',
      'weakest',
      'random',
      'position',
      'area',
      'ally',
      'marked'
    ].map((value) => Type.Literal(value))
  ),
  maximumTargets: count(UNIT_EXECUTION_LIMITS.maximumTargets),
  includeTags: list(text(), { uniqueItems: true }),
  excludeTags: list(text(), { uniqueItems: true })
});

export const deliverySchema = strict({
  id: id(),
  type: Type.Union(
    [
      'direct-strike',
      'line-strike',
      'projectile',
      'homing-projectile',
      'arc-projectile',
      'beam',
      'aura',
      'chain',
      'zone',
      'trap',
      'summon'
    ].map((value) => Type.Literal(value))
  ),
  maximumTargetsPerProjectile: count(UNIT_EXECUTION_LIMITS.maximumTargets),
  projectileSpeedWorldUnitsPerSecond: Type.Optional(positive()),
  radiusWorldUnits: Type.Optional(positive()),
  lifetimeSeconds: Type.Optional(positive())
});

export const damageEffectSchema = strict({
  id: id(),
  type: Type.Literal('damage'),
  amountHitPoints: nonNegative(),
  damageType: text()
});
export const damageOverTimeEffectSchema = strict({
  id: id(),
  type: Type.Literal('damage-over-time'),
  amountHitPointsPerTick: nonNegative(),
  tickIntervalSeconds: positive(),
  durationSeconds: positive(),
  damageType: text(),
  stacking: Type.Union([Type.Literal('replace'), Type.Literal('refresh'), Type.Literal('stack')]),
  maximumStacks: count(UNIT_EXECUTION_LIMITS.maximumStacks)
});
export const statusEffectSchema = strict({
  id: id(),
  type: Type.Literal('status'),
  statusId: id(),
  durationSeconds: positive(),
  stacks: count(UNIT_EXECUTION_LIMITS.maximumStacks),
  stacking: Type.Union([Type.Literal('replace'), Type.Literal('refresh'), Type.Literal('stack')])
});
export const statModifierEffectSchema = strict({
  id: id(),
  type: Type.Literal('stat-modifier'),
  stat: text(),
  operation: Type.Union([Type.Literal('add'), Type.Literal('multiply')]),
  amount: signed(),
  durationSeconds: positive(),
  recipient: Type.Union([Type.Literal('self'), Type.Literal('target'), Type.Literal('allies')]),
  radiusWorldUnits: Type.Optional(positive())
});
export const healEffectSchema = strict({
  id: id(),
  type: Type.Literal('heal'),
  amountHitPoints: nonNegative(),
  recipient: Type.Union([Type.Literal('self'), Type.Literal('ally')])
});
export const shieldEffectSchema = strict({
  id: id(),
  type: Type.Literal('shield'),
  amountHitPoints: nonNegative(),
  durationSeconds: positive(),
  recipient: Type.Union([Type.Literal('self'), Type.Literal('ally')])
});
export const resourceChangeEffectSchema = strict({
  id: id(),
  type: Type.Literal('resource-change'),
  resourceId: id(),
  operation: Type.Union([Type.Literal('add'), Type.Literal('spend'), Type.Literal('set')]),
  amount: nonNegative()
});
export const spawnEffectSchema = strict({
  id: id(),
  type: Type.Literal('spawn'),
  summonId: id(),
  instances: count(UNIT_EXECUTION_LIMITS.maximumSpawnInstances),
  durationSeconds: positive()
});
export const forcedMovementEffectSchema = strict({
  id: id(),
  type: Type.Literal('forced-movement'),
  distanceWorldUnits: signed(),
  maximumApplicationsPerTarget: count(
    UNIT_EXECUTION_LIMITS.maximumForcedMovementApplicationsPerTarget
  )
});
export const revealEffectSchema = strict({
  id: id(),
  type: Type.Literal('reveal'),
  durationSeconds: positive()
});
export const transformEffectSchema = strict({
  id: id(),
  type: Type.Literal('transform'),
  formId: id(),
  durationSeconds: positive()
});
export const secondaryActionEffectSchema = strict({
  id: id(),
  type: Type.Literal('secondary-action'),
  actionId: id(),
  maximumTriggersPerCycle: count(UNIT_EXECUTION_LIMITS.maximumSecondaryTriggersPerCycle)
});
export const economyChangeEffectSchema = strict({
  id: id(),
  type: Type.Literal('economy-change'),
  amountCredits: signed(),
  recipient: Type.Union([Type.Literal('owner'), Type.Literal('ally')])
});

export const effectSchema = Type.Union([
  damageEffectSchema,
  damageOverTimeEffectSchema,
  statusEffectSchema,
  statModifierEffectSchema,
  healEffectSchema,
  shieldEffectSchema,
  resourceChangeEffectSchema,
  spawnEffectSchema,
  forcedMovementEffectSchema,
  revealEffectSchema,
  transformEffectSchema,
  secondaryActionEffectSchema,
  economyChangeEffectSchema
]);

export const actionSchema = strict({
  id: id(),
  name: text(),
  summary: text(),
  unlockedByDefault: Type.Boolean(),
  tags: list(text(), { uniqueItems: true }),
  trigger: triggerSchema,
  targeting: targetingSchema,
  delivery: deliverySchema,
  timing: strict({
    cooldownSeconds: nonNegative(),
    windupSeconds: nonNegative(),
    rateScope: Type.Union([Type.Literal('aggregate'), Type.Literal('per-emitter')])
  }),
  rangeWorldUnits: Type.Optional(nonNegative()),
  emitters: Type.Array(
    strict({
      id: id(),
      emitterCount: count(UNIT_EXECUTION_LIMITS.maximumEmitterCount),
      projectilesPerCycle: count(UNIT_EXECUTION_LIMITS.maximumProjectilesPerCycle)
    }),
    { minItems: 1, maxItems: UNIT_EXECUTION_LIMITS.maximumEmitters }
  ),
  effects: list(effectSchema, { minItems: 1 }),
  conditions: list(conditionSchema),
  resourceCosts: list(strict({ resourceId: id(), amountPerCycle: positive() }), {
    uniqueItems: true
  }),
  stateInteractions: list(
    strict({
      stateId: id(),
      operation: Type.Union([
        Type.Literal('set'),
        Type.Literal('increment'),
        Type.Literal('clear')
      ]),
      value: Type.Optional(Type.Union([Type.String(), signed(), Type.Boolean()]))
    })
  )
});

export const resourceSchema = strict({
  id: id(),
  name: text(),
  unlockedByDefault: Type.Boolean(),
  ownershipScope: Type.Union([Type.Literal('unit'), Type.Literal('owner'), Type.Literal('team')]),
  startingAmount: nonNegative(),
  cap: positive(),
  generation: list(
    strict({
      event: Type.Union([
        Type.Literal('time'),
        Type.Literal('on-hit'),
        Type.Literal('on-kill'),
        Type.Literal('on-wave-start'),
        Type.Literal('on-damage')
      ]),
      amount: positive(),
      intervalSeconds: Type.Optional(positive()),
      actionId: Type.Optional(id())
    })
  ),
  spend: list(
    strict({
      event: Type.Union([
        Type.Literal('action'),
        Type.Literal('ability'),
        Type.Literal('transform')
      ]),
      referenceId: id(),
      amount: positive()
    })
  ),
  recovery: Type.Union([
    strict({ type: Type.Literal('none') }),
    strict({ type: Type.Literal('regeneration'), amountPerSecond: positive() }),
    strict({ type: Type.Literal('refill-on-wave'), amount: positive() })
  ]),
  persistence: Type.Union([
    Type.Literal('encounter'),
    Type.Literal('wave'),
    Type.Literal('until-spent')
  ]),
  expirySeconds: Type.Optional(positive())
});

export const statusSchema = strict({
  id: id(),
  name: text(),
  kind: Type.Union([
    Type.Literal('slow'),
    Type.Literal('vulnerability'),
    Type.Literal('mark'),
    Type.Literal('stun')
  ]),
  magnitude: nonNegative(),
  maximumStacks: count(UNIT_EXECUTION_LIMITS.maximumStacks),
  refresh: Type.Union([Type.Literal('replace'), Type.Literal('refresh'), Type.Literal('stack')]),
  removal: Type.Union([Type.Literal('expiry'), Type.Literal('hit'), Type.Literal('manual')])
});

export const stateSchema = strict({
  id: id(),
  name: text(),
  initialValue: Type.Union([Type.String(), signed(), Type.Boolean()]),
  minimum: Type.Optional(signed()),
  maximum: Type.Optional(signed()),
  expirySeconds: Type.Optional(positive())
});

export const summonSchema = strict({
  id: id(),
  name: text(),
  unlockedByDefault: Type.Boolean(),
  targetType: Type.Union([Type.Literal('enemy'), Type.Literal('ally'), Type.Literal('position')]),
  selection: Type.Union([
    Type.Literal('owner-target'),
    Type.Literal('nearest'),
    Type.Literal('position')
  ]),
  activation: Type.Union([Type.Literal('spawn-effect'), Type.Literal('automatic')]),
  actionId: id(),
  durationSeconds: positive(),
  placementRangeWorldUnits: nonNegative(),
  maximumConcurrentInstances: count(UNIT_EXECUTION_LIMITS.maximumConcurrentSummons),
  cooldownSeconds: nonNegative(),
  replacement: Type.Union([
    Type.Literal('reject'),
    Type.Literal('oldest'),
    Type.Literal('refresh')
  ]),
  removal: Type.Union([
    Type.Literal('expiry'),
    Type.Literal('destroyed'),
    Type.Literal('owner-removed')
  ])
});

export const abilitySchema = strict({
  id: id(),
  name: text(),
  summary: text(),
  unlockedByDefault: Type.Boolean(),
  type: Type.Union([
    Type.Literal('active'),
    Type.Literal('automatic'),
    Type.Literal('reactive'),
    Type.Literal('passive'),
    Type.Literal('transformation')
  ]),
  actionId: id(),
  cooldownSeconds: nonNegative(),
  initialCooldownSeconds: nonNegative(),
  maximumCharges: count(UNIT_EXECUTION_LIMITS.maximumAbilityCharges),
  rechargeSeconds: nonNegative(),
  playerComplexity: Type.Integer({ minimum: 0, maximum: 5 }),
  resourceId: Type.Optional(id())
});

export const operationSchema = Type.Union([
  strict({ type: Type.Literal('enable-action'), actionId: id() }),
  strict({ type: Type.Literal('disable-action'), actionId: id() }),
  strict({
    type: Type.Literal('replace-action'),
    actionId: id(),
    replacementActionId: id()
  }),
  strict({
    type: Type.Literal('modify-action'),
    actionId: id(),
    parameter: Type.Union([
      Type.Literal('cooldownSeconds'),
      Type.Literal('rangeWorldUnits'),
      Type.Literal('emitterCount'),
      Type.Literal('projectilesPerCycle'),
      Type.Literal('maximumTargetsPerProjectile')
    ]),
    operation: Type.Union([Type.Literal('add'), Type.Literal('multiply'), Type.Literal('set')]),
    value: signed()
  }),
  strict({ type: Type.Literal('add-effect'), actionId: id(), effect: effectSchema }),
  strict({
    type: Type.Literal('modify-effect'),
    actionId: id(),
    effectId: id(),
    parameter: Type.Union([
      Type.Literal('amountHitPoints'),
      Type.Literal('amountHitPointsPerTick'),
      Type.Literal('durationSeconds'),
      Type.Literal('amount'),
      Type.Literal('amountCredits')
    ]),
    operation: Type.Union([Type.Literal('add'), Type.Literal('multiply'), Type.Literal('set')]),
    value: signed()
  }),
  strict({ type: Type.Literal('enable-resource'), resourceId: id() }),
  strict({
    type: Type.Literal('modify-resource'),
    resourceId: id(),
    parameter: Type.Union([
      Type.Literal('startingAmount'),
      Type.Literal('cap'),
      Type.Literal('generationAmount')
    ]),
    operation: Type.Union([Type.Literal('add'), Type.Literal('multiply'), Type.Literal('set')]),
    value: signed()
  }),
  strict({ type: Type.Literal('grant-ability'), abilityId: id() }),
  strict({ type: Type.Literal('enable-summon'), summonId: id() }),
  strict({ type: Type.Literal('grant-form'), formId: id() }),
  strict({
    type: Type.Literal('modify-placement'),
    addSurface: Type.Optional(text()),
    removeSurface: Type.Optional(text())
  }),
  strict({
    type: Type.Literal('modify-economy'),
    operation: Type.Union([Type.Literal('add'), Type.Literal('multiply'), Type.Literal('set')]),
    valueCredits: signed()
  })
]);

export const formSchema = strict({
  id: id(),
  name: text(),
  summary: text(),
  externallyUnlocked: Type.Boolean(),
  requirements: list(conditionSchema),
  activation: Type.Union([
    Type.Literal('ability'),
    Type.Literal('automatic'),
    Type.Literal('external')
  ]),
  operations: list(operationSchema, { minItems: 1 }),
  durationSeconds: Type.Optional(positive()),
  persistence: Type.Union([
    Type.Literal('timed'),
    Type.Literal('until-reverted'),
    Type.Literal('encounter')
  ]),
  reversion: Type.Union([Type.Literal('automatic'), Type.Literal('manual'), Type.Literal('none')])
});

export const upgradeNodeSchema = strict({
  id: id(),
  name: text(),
  summary: text(),
  path: Type.Optional(id()),
  tier: Type.Optional(count(UNIT_EXECUTION_LIMITS.maximumUpgradeTier)),
  costCredits: nonNegative(),
  prerequisites: list(id(), { uniqueItems: true }),
  exclusions: Type.Optional(list(id(), { uniqueItems: true })),
  operations: list(operationSchema, { minItems: 1 }),
  tags: list(text(), { minItems: 1, uniqueItems: true })
});

const requirementSchema = strict({ id: id(), description: text() });

export const unitSpecSchema = Type.Object(
  {
    schemaVersion: Type.Literal(UNIT_SPEC_SCHEMA_VERSION),
    id: id(),
    name: text(),
    summary: text(),
    roles: list(text(), { minItems: 1, uniqueItems: true }),
    tags: list(text(), { uniqueItems: true }),
    placement: strict({
      footprintRadiusWorldUnits: positive(),
      allowedSurfaces: list(text(), { minItems: 1, uniqueItems: true }),
      rules: list(text(), { uniqueItems: true })
    }),
    economy: strict({
      baseCostCredits: nonNegative(),
      costProfile: text(),
      incomePerWaveCredits: Type.Optional(nonNegative())
    }),
    baseStats: strict({
      rangeWorldUnits: nonNegative(),
      durabilityHitPoints: positive()
    }),
    resources: list(resourceSchema),
    states: list(stateSchema),
    statuses: list(statusSchema),
    actions: list(actionSchema, { minItems: 1 }),
    abilities: list(abilitySchema),
    summons: list(summonSchema),
    forms: list(formSchema),
    upgradeGraph: strict({
      profile: Type.Optional(id()),
      paths: list(strict({ id: id(), name: text(), summary: text() })),
      nodes: list(upgradeNodeSchema),
      selectionRules: strict({
        maximumPrimaryPathTier: Type.Integer({
          minimum: 1,
          maximum: UNIT_EXECUTION_LIMITS.maximumUpgradeTier
        }),
        maximumCrossPathTier: Type.Integer({
          minimum: 0,
          maximum: UNIT_EXECUTION_LIMITS.maximumUpgradeTier
        }),
        maximumCrossPaths: Type.Integer({
          minimum: 0,
          maximum: UNIT_EXECUTION_LIMITS.maximumCrossPaths
        }),
        maximumSelectedNodes: Type.Integer({
          minimum: 0,
          maximum: UNIT_EXECUTION_LIMITS.maximumSelectedNodes
        })
      })
    }),
    requirements: strict({
      visuals: list(requirementSchema),
      animations: list(requirementSchema),
      audio: Type.Optional(list(requirementSchema))
    }),
    extensions: Type.Optional(
      Type.Record(Type.String({ pattern: EXTENSION_KEY_PATTERN }), Type.Unknown(), {
        additionalProperties: false
      })
    )
  },
  {
    $id: 'https://mardwerk.org/schemas/unit-spec/0.1.json',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: false
  }
);

export const unitBuildSchema = Type.Object(
  {
    schemaVersion: Type.Literal(UNIT_SPEC_SCHEMA_VERSION),
    unitId: id(),
    name: text(),
    roles: list(text(), { minItems: 1, uniqueItems: true }),
    tags: list(text(), { uniqueItems: true }),
    selection: list(id(), {
      uniqueItems: true,
      maxItems: UNIT_EXECUTION_LIMITS.maximumSelectedNodes
    }),
    selectedFormIds: list(id(), {
      uniqueItems: true,
      maxItems: UNIT_EXECUTION_LIMITS.maximumSelectedNodes
    }),
    totalCostCredits: nonNegative(),
    placement: unitSpecSchema.properties.placement,
    economy: unitSpecSchema.properties.economy,
    baseStats: unitSpecSchema.properties.baseStats,
    actions: list(actionSchema, { minItems: 1 }),
    abilities: list(abilitySchema),
    resources: list(resourceSchema),
    summons: list(summonSchema),
    forms: list(formSchema),
    statuses: list(statusSchema),
    states: list(stateSchema),
    appliedOperations: list(
      strict({
        upgradeId: id(),
        operationIndex: Type.Integer({
          minimum: 0,
          maximum: VALIDATION_LIMITS.maximumCollectionItems - 1
        }),
        type: Type.Index(operationSchema, ['type']),
        target: id()
      })
    )
  },
  {
    $id: 'https://mardwerk.org/schemas/unit-build/0.1.json',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: false
  }
);

export const referenceSetSchema = Type.Object(
  {
    schemaVersion: Type.Literal(REFERENCE_BUNDLE_SCHEMA_VERSION),
    id: id(),
    version: text(),
    unitSpecSchemaVersion: Type.Literal(UNIT_SPEC_SCHEMA_VERSION),
    partition: Type.Union([
      Type.Literal('development'),
      Type.Literal('calibration'),
      Type.Literal('evaluation'),
      Type.Literal('holdout')
    ]),
    members: list(
      strict({
        unitId: id(),
        familyId: id(),
        unitArtifactId: id(),
        annotationArtifactId: id(),
        coverageArtifactId: id(),
        provenanceArtifactId: Type.Optional(id())
      }),
      { minItems: 1 }
    ),
    normalizationVersion: text(),
    sourceSnapshotId: Type.Optional(id())
  },
  {
    $id: 'https://mardwerk.org/schemas/unit-reference-set/0.1.json',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: false
  }
);

export const referenceAnnotationSchema = Type.Object(
  {
    schemaVersion: Type.Literal(REFERENCE_BUNDLE_SCHEMA_VERSION),
    unitId: id(),
    qualityClass: Type.Union([
      Type.Literal('mature-reference'),
      Type.Literal('generalization-reference'),
      Type.Literal('compatibility-only')
    ]),
    expectedHardAcceptance: Type.Boolean(),
    expectedProfile: Type.Optional(id()),
    declaredRoles: list(text(), { minItems: 1, uniqueItems: true }),
    mechanicFamilies: list(text(), { uniqueItems: true }),
    knownLimitations: list(text()),
    annotationVersion: text()
  },
  {
    $id: 'https://mardwerk.org/schemas/unit-reference-annotation/0.1.json',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: false
  }
);

export const referenceCoverageSchema = Type.Object(
  {
    schemaVersion: Type.Literal(REFERENCE_BUNDLE_SCHEMA_VERSION),
    unitId: id(),
    status: Type.Union([
      Type.Literal('complete'),
      Type.Literal('partial'),
      Type.Literal('unsupported')
    ]),
    supportedMechanics: list(text(), { uniqueItems: true }),
    approximatedMechanics: list(text(), { uniqueItems: true }),
    opaqueMechanics: list(text(), { uniqueItems: true }),
    unsupportedMechanics: list(text(), { uniqueItems: true }),
    warnings: list(text())
  },
  {
    $id: 'https://mardwerk.org/schemas/unit-reference-coverage/0.1.json',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: false
  }
);

export const provenanceRecordSchema = strict({
  targetPointer: Type.String({ pattern: TARGET_POINTER_PATTERN }),
  status: Type.Union([
    Type.Literal('exact'),
    Type.Literal('derived'),
    Type.Literal('inferred'),
    Type.Literal('approximate'),
    Type.Literal('unsupported')
  ]),
  sourceArtifact: id(),
  sourcePointer: Type.Optional(Type.String({ pattern: SOURCE_POINTER_PATTERN })),
  derivation: Type.Optional(text()),
  confidence: Type.Optional(ratio()),
  note: Type.Optional(text())
});

export const referenceProvenanceSchema = Type.Object(
  {
    schemaVersion: Type.Literal(REFERENCE_BUNDLE_SCHEMA_VERSION),
    unitId: id(),
    normalizationVersion: text(),
    sourceSnapshotId: id(),
    records: list(provenanceRecordSchema)
  },
  {
    $id: 'https://mardwerk.org/schemas/unit-reference-provenance/0.1.json',
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    additionalProperties: false
  }
);

export type UnitSpec = Static<typeof unitSpecSchema>;
export type Action = Static<typeof actionSchema>;
export type Effect = Static<typeof effectSchema>;
export type Resource = Static<typeof resourceSchema>;
export type Ability = Static<typeof abilitySchema>;
export type Summon = Static<typeof summonSchema>;
export type Form = Static<typeof formSchema>;
export type Status = Static<typeof statusSchema>;
export type UpgradeNode = Static<typeof upgradeNodeSchema>;
export type UpgradeOperation = Static<typeof operationSchema>;
export type ReferenceSet = Static<typeof referenceSetSchema>;
export type ReferenceAnnotation = Static<typeof referenceAnnotationSchema>;
export type ReferenceCoverage = Static<typeof referenceCoverageSchema>;
export type ReferenceProvenance = Static<typeof referenceProvenanceSchema>;

export const authoritativeSchemas = {
  'unit-spec-0.1.json': unitSpecSchema,
  'unit-build-0.1.json': unitBuildSchema,
  'unit-reference-set-0.1.json': referenceSetSchema,
  'unit-reference-annotation-0.1.json': referenceAnnotationSchema,
  'unit-reference-coverage-0.1.json': referenceCoverageSchema,
  'unit-reference-provenance-0.1.json': referenceProvenanceSchema
} as const;
