import type {
  Action,
  Effect,
  ReferenceAnnotation,
  ReferenceCoverage,
  ReferenceProvenance,
  ReferenceSet,
  UnitSpec,
  UpgradeOperation
} from '@mardwerk/unit-definitions/diagnostics';

type ActionInput = {
  id: string;
  name: string;
  summary: string;
  delivery: Action['delivery']['type'];
  effects: Effect[];
  unlocked?: boolean;
  trigger?: Action['trigger'];
  target?: Action['targeting']['type'];
  maximumTargets?: number;
  maximumTargetsPerProjectile?: number;
  cooldown?: number;
  range?: number;
  projectileSpeed?: number;
  radius?: number;
  tags?: string[];
  resourceCosts?: Action['resourceCosts'];
};

type UpgradeEntry = readonly [
  name: string,
  summary: string,
  operations: UpgradeOperation[],
  tags?: string[]
];

const action = ({
  id,
  name,
  summary,
  delivery,
  effects,
  unlocked = false,
  trigger = { type: 'interval', intervalSeconds: 1 },
  target = 'first',
  maximumTargets = 1,
  maximumTargetsPerProjectile = 1,
  cooldown = 1,
  range = 24,
  projectileSpeed,
  radius,
  tags = [],
  resourceCosts = []
}: ActionInput): Action => ({
  id,
  name,
  summary,
  unlockedByDefault: unlocked,
  tags,
  trigger,
  targeting: {
    id: `${id}-targeting`,
    type: target,
    maximumTargets,
    includeTags: [],
    excludeTags: []
  },
  delivery: {
    id: `${id}-delivery`,
    type: delivery,
    maximumTargetsPerProjectile,
    ...(projectileSpeed === undefined
      ? {}
      : { projectileSpeedWorldUnitsPerSecond: projectileSpeed }),
    ...(radius === undefined ? {} : { radiusWorldUnits: radius })
  },
  timing: { cooldownSeconds: cooldown, windupSeconds: 0, rateScope: 'aggregate' },
  rangeWorldUnits: range,
  emitters: [{ id: `${id}-emitter`, emitterCount: 1, projectilesPerCycle: 1 }],
  effects,
  conditions: [],
  resourceCosts,
  stateInteractions: []
});

const damage = (id: string, amountHitPoints: number, damageType = 'neutral'): Effect => ({
  id,
  type: 'damage',
  amountHitPoints,
  damageType
});

const pathNodes = (
  unitPrefix: string,
  path: string,
  entries: readonly UpgradeEntry[]
): UnitSpec['upgradeGraph']['nodes'] => {
  const costs = [90, 165, 285, 470, 760] as const;
  return entries.map(([name, summary, operations, tags], index) => ({
    id: `${unitPrefix}-${path}-${index + 1}`,
    name,
    summary,
    path,
    tier: index + 1,
    costCredits: costs[index]!,
    prerequisites: index === 0 ? [] : [`${unitPrefix}-${path}-${index}`],
    exclusions: [],
    operations,
    tags: tags ?? [path]
  }));
};

const graph = (
  unitPrefix: string,
  paths: readonly [string, string, string],
  entries: readonly [readonly UpgradeEntry[], readonly UpgradeEntry[], readonly UpgradeEntry[]]
): UnitSpec['upgradeGraph'] => ({
  profile: 'classic-three-path',
  paths: paths.map((name) => ({
    id: name.toLowerCase(),
    name,
    summary: `${name} develops a distinct ${unitPrefix} play pattern.`
  })),
  nodes: paths.flatMap((name, index) => pathNodes(unitPrefix, name.toLowerCase(), entries[index]!)),
  selectionRules: {
    maximumPrimaryPathTier: 5,
    maximumCrossPathTier: 2,
    maximumCrossPaths: 1,
    maximumSelectedNodes: 7
  }
});

const requirements = (prefix: string): UnitSpec['requirements'] => ({
  visuals: [{ id: `${prefix}-visual`, description: 'A readable silhouette at normal play scale.' }],
  animations: [
    { id: `${prefix}-action-animation`, description: 'A clear anticipation and release cue.' }
  ],
  audio: [{ id: `${prefix}-audio`, description: 'A short, non-verbal activation cue.' }]
});

export const VECTOR_KITE: UnitSpec = {
  schemaVersion: '0.1',
  id: 'vector-kite',
  name: 'Vector Kite',
  summary: 'A mobile-range controller that builds charge with precise projectiles.',
  roles: ['damage', 'control'],
  tags: ['projectile', 'resource', 'form'],
  placement: {
    footprintRadiusWorldUnits: 0.8,
    allowedSurfaces: ['ground', 'platform'],
    rules: ['Requires open air above its anchor.']
  },
  economy: { baseCostCredits: 515, costProfile: 'standard' },
  baseStats: { rangeWorldUnits: 25, durabilityHitPoints: 70 },
  resources: [
    {
      id: 'kite-charge',
      name: 'Tension',
      unlockedByDefault: false,
      ownershipScope: 'unit',
      startingAmount: 0,
      cap: 10,
      generation: [
        { event: 'on-hit', amount: 1, actionId: 'kite-needle' },
        { event: 'time', amount: 0.5, intervalSeconds: 2 }
      ],
      spend: [
        { event: 'action', referenceId: 'kite-release', amount: 4 },
        { event: 'ability', referenceId: 'kite-release-ability', amount: 4 }
      ],
      recovery: { type: 'regeneration', amountPerSecond: 0.2 },
      persistence: 'encounter'
    }
  ],
  states: [],
  statuses: [
    {
      id: 'kite-trace',
      name: 'Trace',
      kind: 'mark',
      magnitude: 1,
      maximumStacks: 1,
      refresh: 'refresh',
      removal: 'expiry'
    }
  ],
  actions: [
    action({
      id: 'kite-needle',
      name: 'Needle Flight',
      summary: 'Launches one fast needle at the leading target.',
      delivery: 'projectile',
      effects: [damage('kite-needle-damage', 8, 'kinetic')],
      unlocked: true,
      cooldown: 1.1,
      range: 25,
      projectileSpeed: 46,
      tags: ['base', 'precision']
    }),
    action({
      id: 'kite-thread',
      name: 'Return Thread',
      summary: 'A bounded follow-up snaps into the same target.',
      delivery: 'direct-strike',
      effects: [damage('kite-thread-damage', 5, 'kinetic')],
      cooldown: 0,
      tags: ['secondary', 'control']
    }),
    action({
      id: 'kite-beam',
      name: 'Guide Line',
      summary: 'Maintains a narrow beam against a durable target.',
      delivery: 'beam',
      effects: [damage('kite-beam-damage', 24, 'energy')],
      target: 'strongest',
      cooldown: 1.8,
      range: 30,
      tags: ['beam', 'precision']
    }),
    action({
      id: 'kite-release',
      name: 'Tension Release',
      summary: 'Spends stored tension for a compact shock around the target.',
      delivery: 'direct-strike',
      effects: [damage('kite-release-damage', 28, 'energy')],
      trigger: { type: 'manual' },
      target: 'area',
      maximumTargets: 4,
      maximumTargetsPerProjectile: 4,
      cooldown: 12,
      radius: 5,
      resourceCosts: [{ resourceId: 'kite-charge', amountPerCycle: 4 }],
      tags: ['ability', 'resource']
    })
  ],
  abilities: [
    {
      id: 'kite-release-ability',
      name: 'Tension Release',
      summary: 'The player releases four tension to strike a small area.',
      unlockedByDefault: false,
      type: 'active',
      actionId: 'kite-release',
      cooldownSeconds: 12,
      initialCooldownSeconds: 3,
      maximumCharges: 1,
      rechargeSeconds: 12,
      playerComplexity: 2,
      resourceId: 'kite-charge'
    }
  ],
  summons: [],
  forms: [
    {
      id: 'kite-taut-form',
      name: 'Taut Geometry',
      summary: 'An explicitly selected encounter configuration tightens the base flight cycle.',
      externallyUnlocked: false,
      requirements: [],
      activation: 'external',
      operations: [
        {
          type: 'modify-action',
          actionId: 'kite-needle',
          parameter: 'cooldownSeconds',
          operation: 'multiply',
          value: 0.65
        }
      ],
      persistence: 'encounter',
      reversion: 'none'
    }
  ],
  upgradeGraph: graph(
    'kite',
    ['Precision', 'Reserve', 'Echo'],
    [
      [
        [
          'Weighted Needle',
          'Needles land with greater force.',
          [
            {
              type: 'modify-effect',
              actionId: 'kite-needle',
              effectId: 'kite-needle-damage',
              parameter: 'amountHitPoints',
              operation: 'add',
              value: 3
            }
          ]
        ],
        [
          'Shorter Line',
          'The primary cycle recovers sooner.',
          [
            {
              type: 'modify-action',
              actionId: 'kite-needle',
              parameter: 'cooldownSeconds',
              operation: 'multiply',
              value: 0.82
            }
          ]
        ],
        [
          'Visible Trace',
          'Needles mark targets for later control.',
          [
            {
              type: 'add-effect',
              actionId: 'kite-needle',
              effect: {
                id: 'kite-trace-effect',
                type: 'status',
                statusId: 'kite-trace',
                durationSeconds: 3,
                stacks: 1,
                stacking: 'refresh'
              }
            }
          ]
        ],
        [
          'Forked Aim',
          'One flight may pass through a second target.',
          [
            {
              type: 'modify-action',
              actionId: 'kite-needle',
              parameter: 'maximumTargetsPerProjectile',
              operation: 'set',
              value: 2
            }
          ]
        ],
        [
          'Guide Line',
          'Adds a deliberate beam for durable targets.',
          [{ type: 'enable-action', actionId: 'kite-beam' }]
        ]
      ],
      [
        [
          'Tension Cell',
          'Unlocks the complete tension cycle.',
          [{ type: 'enable-resource', resourceId: 'kite-charge' }]
        ],
        [
          'Elastic Reserve',
          'The reserve holds two more tension.',
          [
            {
              type: 'modify-resource',
              resourceId: 'kite-charge',
              parameter: 'cap',
              operation: 'add',
              value: 2
            }
          ]
        ],
        [
          'Release Grip',
          'Unlocks the player-triggered release.',
          [{ type: 'grant-ability', abilityId: 'kite-release-ability' }]
        ],
        [
          'Focused Release',
          'The stored-energy strike gains force.',
          [
            {
              type: 'modify-effect',
              actionId: 'kite-release',
              effectId: 'kite-release-damage',
              parameter: 'amountHitPoints',
              operation: 'multiply',
              value: 1.5
            }
          ]
        ],
        [
          'Taut Geometry',
          'Grants the encounter configuration for explicit build selection.',
          [{ type: 'grant-form', formId: 'kite-taut-form' }]
        ]
      ],
      [
        [
          'Long Bridle',
          'Extends the primary action range.',
          [
            {
              type: 'modify-action',
              actionId: 'kite-needle',
              parameter: 'rangeWorldUnits',
              operation: 'add',
              value: 5
            }
          ]
        ],
        [
          'Friction Thread',
          'Adds a short damage-over-time thread.',
          [
            {
              type: 'add-effect',
              actionId: 'kite-needle',
              effect: {
                id: 'kite-friction',
                type: 'damage-over-time',
                amountHitPointsPerTick: 1,
                tickIntervalSeconds: 1,
                durationSeconds: 3,
                damageType: 'kinetic',
                stacking: 'refresh',
                maximumStacks: 1
              }
            }
          ]
        ],
        [
          'Return Thread',
          'Each primary hit gains one bounded follow-up.',
          [
            {
              type: 'add-effect',
              actionId: 'kite-needle',
              effect: {
                id: 'kite-return-effect',
                type: 'secondary-action',
                actionId: 'kite-thread',
                maximumTriggersPerCycle: 1
              }
            }
          ]
        ],
        [
          'Tensed Return',
          'The follow-up strikes harder.',
          [
            {
              type: 'modify-effect',
              actionId: 'kite-thread',
              effectId: 'kite-thread-damage',
              parameter: 'amountHitPoints',
              operation: 'multiply',
              value: 2
            }
          ]
        ],
        [
          'Twin Flight',
          'The primary emitter releases two needles per cycle.',
          [
            {
              type: 'modify-action',
              actionId: 'kite-needle',
              parameter: 'projectilesPerCycle',
              operation: 'set',
              value: 2
            }
          ]
        ]
      ]
    ]
  ),
  requirements: requirements('kite')
};

export const RESONANCE_ANVIL: UnitSpec = {
  schemaVersion: '0.1',
  id: 'resonance-anvil',
  name: 'Resonance Anvil',
  summary: 'A close direct striker whose deliberate impacts open beam and status patterns.',
  roles: ['damage', 'control'],
  tags: ['direct-strike', 'beam', 'status'],
  placement: {
    footprintRadiusWorldUnits: 1.1,
    allowedSurfaces: ['ground'],
    rules: ['Requires stable ground.']
  },
  economy: { baseCostCredits: 590, costProfile: 'front-loaded' },
  baseStats: { rangeWorldUnits: 18, durabilityHitPoints: 125 },
  resources: [],
  states: [],
  statuses: [
    {
      id: 'anvil-resonance',
      name: 'Resonance',
      kind: 'vulnerability',
      magnitude: 0.15,
      maximumStacks: 2,
      refresh: 'stack',
      removal: 'expiry'
    },
    {
      id: 'anvil-hush',
      name: 'Hush',
      kind: 'slow',
      magnitude: 0.25,
      maximumStacks: 1,
      refresh: 'refresh',
      removal: 'expiry'
    }
  ],
  actions: [
    action({
      id: 'anvil-tap',
      name: 'Measured Tap',
      summary: 'Strikes the strongest nearby target without travel time.',
      delivery: 'direct-strike',
      effects: [damage('anvil-tap-damage', 14, 'impact')],
      unlocked: true,
      target: 'strongest',
      cooldown: 1.35,
      range: 18,
      tags: ['base', 'impact']
    }),
    action({
      id: 'anvil-line',
      name: 'Harmonic Line',
      summary: 'Projects a beam through a bounded group.',
      delivery: 'beam',
      effects: [damage('anvil-line-damage', 11, 'energy')],
      maximumTargets: 3,
      maximumTargetsPerProjectile: 3,
      cooldown: 1.8,
      range: 28,
      tags: ['beam', 'group']
    }),
    action({
      id: 'anvil-overtone',
      name: 'Overtone',
      summary: 'Automatically applies a short hush around the anvil.',
      delivery: 'aura',
      effects: [
        {
          id: 'anvil-hush-effect',
          type: 'status',
          statusId: 'anvil-hush',
          durationSeconds: 3,
          stacks: 1,
          stacking: 'refresh'
        }
      ],
      trigger: { type: 'interval', intervalSeconds: 7 },
      target: 'area',
      maximumTargets: 6,
      maximumTargetsPerProjectile: 6,
      cooldown: 7,
      radius: 7,
      tags: ['automatic', 'control']
    })
  ],
  abilities: [
    {
      id: 'anvil-overtone-ability',
      name: 'Overtone',
      summary: 'A periodic automatic field slows nearby targets.',
      unlockedByDefault: false,
      type: 'automatic',
      actionId: 'anvil-overtone',
      cooldownSeconds: 7,
      initialCooldownSeconds: 2,
      maximumCharges: 1,
      rechargeSeconds: 7,
      playerComplexity: 0
    }
  ],
  summons: [],
  forms: [],
  upgradeGraph: graph(
    'anvil',
    ['Impact', 'Harmonic', 'Hush'],
    [
      [
        [
          'Dense Head',
          'Direct impacts deal more damage.',
          [
            {
              type: 'modify-effect',
              actionId: 'anvil-tap',
              effectId: 'anvil-tap-damage',
              parameter: 'amountHitPoints',
              operation: 'add',
              value: 5
            }
          ]
        ],
        [
          'Ready Grip',
          'Direct impacts recover faster.',
          [
            {
              type: 'modify-action',
              actionId: 'anvil-tap',
              parameter: 'cooldownSeconds',
              operation: 'multiply',
              value: 0.82
            }
          ]
        ],
        [
          'Resonant Dent',
          'Impacts make later damage more effective.',
          [
            {
              type: 'add-effect',
              actionId: 'anvil-tap',
              effect: {
                id: 'anvil-resonance-effect',
                type: 'status',
                statusId: 'anvil-resonance',
                durationSeconds: 4,
                stacks: 1,
                stacking: 'stack'
              }
            }
          ]
        ],
        [
          'Double Measure',
          'Two emitters alternate direct impacts.',
          [
            {
              type: 'modify-action',
              actionId: 'anvil-tap',
              parameter: 'emitterCount',
              operation: 'set',
              value: 2
            }
          ]
        ],
        [
          'Final Cadence',
          'The mature impact cadence accelerates again.',
          [
            {
              type: 'modify-action',
              actionId: 'anvil-tap',
              parameter: 'cooldownSeconds',
              operation: 'multiply',
              value: 0.68
            }
          ]
        ]
      ],
      [
        [
          'Long Fork',
          'Extends the direct striking reach.',
          [
            {
              type: 'modify-action',
              actionId: 'anvil-tap',
              parameter: 'rangeWorldUnits',
              operation: 'add',
              value: 4
            }
          ]
        ],
        [
          'Open Chord',
          'The direct impact reaches a second target.',
          [
            {
              type: 'modify-action',
              actionId: 'anvil-tap',
              parameter: 'maximumTargetsPerProjectile',
              operation: 'set',
              value: 2
            }
          ]
        ],
        [
          'Harmonic Line',
          'Unlocks a bounded group beam.',
          [{ type: 'enable-action', actionId: 'anvil-line' }]
        ],
        [
          'Wide Harmonic',
          'The beam reaches one more target.',
          [
            {
              type: 'modify-action',
              actionId: 'anvil-line',
              parameter: 'maximumTargetsPerProjectile',
              operation: 'add',
              value: 1
            }
          ]
        ],
        [
          'Held Chord',
          'The mature beam delivers heavier pulses.',
          [
            {
              type: 'modify-effect',
              actionId: 'anvil-line',
              effectId: 'anvil-line-damage',
              parameter: 'amountHitPoints',
              operation: 'multiply',
              value: 2.2
            }
          ]
        ]
      ],
      [
        [
          'Soft Ring',
          'Adds a short slowing status to direct impacts.',
          [
            {
              type: 'add-effect',
              actionId: 'anvil-tap',
              effect: {
                id: 'anvil-soft-ring',
                type: 'status',
                statusId: 'anvil-hush',
                durationSeconds: 1.5,
                stacks: 1,
                stacking: 'refresh'
              }
            }
          ]
        ],
        [
          'Lingering Ring',
          'The direct strike gains a small timed echo.',
          [
            {
              type: 'add-effect',
              actionId: 'anvil-tap',
              effect: {
                id: 'anvil-ring-dot',
                type: 'damage-over-time',
                amountHitPointsPerTick: 2,
                tickIntervalSeconds: 1,
                durationSeconds: 3,
                damageType: 'energy',
                stacking: 'refresh',
                maximumStacks: 1
              }
            }
          ]
        ],
        [
          'Overtone',
          'Unlocks an automatic control pulse.',
          [{ type: 'grant-ability', abilityId: 'anvil-overtone-ability' }]
        ],
        [
          'Broad Hush',
          'The overtone affects a wider bounded group.',
          [
            {
              type: 'modify-action',
              actionId: 'anvil-overtone',
              parameter: 'maximumTargetsPerProjectile',
              operation: 'set',
              value: 8
            }
          ]
        ],
        [
          'Quiet Interval',
          'The mature automatic pulse recovers sooner.',
          [
            {
              type: 'modify-action',
              actionId: 'anvil-overtone',
              parameter: 'cooldownSeconds',
              operation: 'multiply',
              value: 0.65
            }
          ]
        ]
      ]
    ]
  ),
  requirements: requirements('anvil')
};

export const MOSSLIGHT_EXCHANGE: UnitSpec = {
  schemaVersion: '0.1',
  id: 'mosslight-exchange',
  name: 'Mosslight Exchange',
  summary: 'A support station that converts a bounded light reserve into helpers and income.',
  roles: ['support', 'economy'],
  tags: ['support', 'economy', 'summon'],
  placement: {
    footprintRadiusWorldUnits: 1.25,
    allowedSurfaces: ['ground', 'platform'],
    rules: ['Must not overlap a route.']
  },
  economy: { baseCostCredits: 640, costProfile: 'support', incomePerWaveCredits: 12 },
  baseStats: { rangeWorldUnits: 20, durabilityHitPoints: 95 },
  resources: [
    {
      id: 'exchange-light',
      name: 'Mosslight',
      unlockedByDefault: true,
      ownershipScope: 'unit',
      startingAmount: 2,
      cap: 8,
      generation: [
        { event: 'time', amount: 1, intervalSeconds: 3 },
        { event: 'on-wave-start', amount: 2 }
      ],
      spend: [
        { event: 'action', referenceId: 'exchange-courier-action', amount: 3 },
        { event: 'ability', referenceId: 'exchange-courier-ability', amount: 3 }
      ],
      recovery: { type: 'refill-on-wave', amount: 2 },
      persistence: 'wave',
      expirySeconds: 60
    }
  ],
  states: [],
  statuses: [],
  actions: [
    action({
      id: 'exchange-seed',
      name: 'Seed Signal',
      summary: 'Sends a modest homing signal into the leading target.',
      delivery: 'homing-projectile',
      effects: [damage('exchange-seed-damage', 5, 'organic')],
      unlocked: true,
      cooldown: 1.6,
      range: 20,
      projectileSpeed: 32,
      tags: ['base', 'signal']
    }),
    action({
      id: 'exchange-courier-action',
      name: 'Courier Dispatch',
      summary: 'Spends mosslight to create one temporary courier.',
      delivery: 'summon',
      effects: [
        {
          id: 'exchange-spawn-courier',
          type: 'spawn',
          summonId: 'exchange-courier',
          instances: 1,
          durationSeconds: 8
        }
      ],
      trigger: { type: 'interval', intervalSeconds: 9 },
      target: 'position',
      cooldown: 9,
      range: 12,
      resourceCosts: [{ resourceId: 'exchange-light', amountPerCycle: 3 }],
      tags: ['automatic', 'summon', 'resource']
    }),
    action({
      id: 'exchange-courier-tick',
      name: 'Courier Spark',
      summary: 'A temporary courier strikes one nearby target.',
      delivery: 'direct-strike',
      effects: [damage('exchange-courier-damage', 4, 'organic')],
      cooldown: 1,
      range: 14,
      tags: ['summon-output']
    }),
    action({
      id: 'exchange-aura',
      name: 'Shared Glow',
      summary: 'Provides a bounded credit benefit to nearby allies.',
      delivery: 'aura',
      effects: [
        {
          id: 'exchange-cadence-support',
          type: 'economy-change',
          amountCredits: 2,
          recipient: 'ally'
        }
      ],
      target: 'ally',
      maximumTargets: 4,
      maximumTargetsPerProjectile: 4,
      cooldown: 2,
      range: 10,
      radius: 10,
      tags: ['support', 'aura']
    }),
    action({
      id: 'exchange-dividend',
      name: 'Measured Dividend',
      summary: 'Creates a small fixed owner credit return.',
      delivery: 'direct-strike',
      effects: [
        {
          id: 'exchange-income',
          type: 'economy-change',
          amountCredits: 6,
          recipient: 'owner'
        }
      ],
      target: 'self',
      cooldown: 5,
      range: 0,
      tags: ['economy']
    })
  ],
  abilities: [
    {
      id: 'exchange-courier-ability',
      name: 'Courier Cycle',
      summary: 'Automatically spends three mosslight when a courier can be created.',
      unlockedByDefault: false,
      type: 'automatic',
      actionId: 'exchange-courier-action',
      cooldownSeconds: 9,
      initialCooldownSeconds: 3,
      maximumCharges: 1,
      rechargeSeconds: 9,
      playerComplexity: 0,
      resourceId: 'exchange-light'
    }
  ],
  summons: [
    {
      id: 'exchange-courier',
      name: 'Mosslight Courier',
      unlockedByDefault: false,
      targetType: 'enemy',
      selection: 'nearest',
      activation: 'spawn-effect',
      actionId: 'exchange-courier-tick',
      durationSeconds: 8,
      placementRangeWorldUnits: 12,
      maximumConcurrentInstances: 2,
      cooldownSeconds: 9,
      replacement: 'oldest',
      removal: 'expiry'
    }
  ],
  forms: [],
  upgradeGraph: graph(
    'exchange',
    ['Couriers', 'Commons', 'Ledger'],
    [
      [
        [
          'Stored Light',
          'The station begins with more mosslight.',
          [
            {
              type: 'modify-resource',
              resourceId: 'exchange-light',
              parameter: 'startingAmount',
              operation: 'add',
              value: 1
            }
          ]
        ],
        [
          'Brighter Cycle',
          'The mosslight reserve holds two more points.',
          [
            {
              type: 'modify-resource',
              resourceId: 'exchange-light',
              parameter: 'cap',
              operation: 'add',
              value: 2
            }
          ]
        ],
        [
          'Courier Cycle',
          'Unlocks the automatic courier dispatch.',
          [
            { type: 'enable-summon', summonId: 'exchange-courier' },
            { type: 'grant-ability', abilityId: 'exchange-courier-ability' }
          ]
        ],
        [
          'Charged Courier',
          'Courier sparks deal more damage.',
          [
            {
              type: 'modify-effect',
              actionId: 'exchange-courier-tick',
              effectId: 'exchange-courier-damage',
              parameter: 'amountHitPoints',
              operation: 'multiply',
              value: 1.75
            }
          ]
        ],
        [
          'Frequent Routes',
          'Courier dispatch recovers faster.',
          [
            {
              type: 'modify-action',
              actionId: 'exchange-courier-action',
              parameter: 'cooldownSeconds',
              operation: 'multiply',
              value: 0.65
            }
          ]
        ]
      ],
      [
        [
          'Open Lantern',
          'The base signal reaches farther.',
          [
            {
              type: 'modify-action',
              actionId: 'exchange-seed',
              parameter: 'rangeWorldUnits',
              operation: 'add',
              value: 4
            }
          ]
        ],
        [
          'Shared Signal',
          'The base signal reaches a second target.',
          [
            {
              type: 'modify-action',
              actionId: 'exchange-seed',
              parameter: 'maximumTargetsPerProjectile',
              operation: 'set',
              value: 2
            }
          ]
        ],
        [
          'Shared Glow',
          'Unlocks the nearby ally credit field.',
          [{ type: 'enable-action', actionId: 'exchange-aura' }]
        ],
        [
          'Steady Commons',
          'The support field refreshes more often.',
          [
            {
              type: 'modify-action',
              actionId: 'exchange-aura',
              parameter: 'cooldownSeconds',
              operation: 'multiply',
              value: 0.72
            }
          ]
        ],
        [
          'Wide Commons',
          'The mature field reaches more allies.',
          [
            {
              type: 'modify-action',
              actionId: 'exchange-aura',
              parameter: 'maximumTargetsPerProjectile',
              operation: 'set',
              value: 8
            }
          ]
        ]
      ],
      [
        [
          'Patient Book',
          'Lowers the station purchase cost.',
          [{ type: 'modify-economy', operation: 'multiply', valueCredits: 0.92 }]
        ],
        [
          'Seed Dividend',
          'Adds a small fixed economy cycle.',
          [{ type: 'enable-action', actionId: 'exchange-dividend' }]
        ],
        [
          'Balanced Return',
          'Each economy cycle returns more credits.',
          [
            {
              type: 'modify-effect',
              actionId: 'exchange-dividend',
              effectId: 'exchange-income',
              parameter: 'amountCredits',
              operation: 'add',
              value: 4
            }
          ]
        ],
        [
          'Quick Accounting',
          'The economy cycle resolves sooner.',
          [
            {
              type: 'modify-action',
              actionId: 'exchange-dividend',
              parameter: 'cooldownSeconds',
              operation: 'multiply',
              value: 0.72
            }
          ]
        ],
        [
          'Public Reserve',
          'Mature bookkeeping lowers the station cost again.',
          [
            {
              type: 'modify-economy',
              operation: 'multiply',
              valueCredits: 0.85
            }
          ]
        ]
      ]
    ]
  ),
  requirements: requirements('exchange')
};

export const SYNTHETIC_UNITS = [VECTOR_KITE, RESONANCE_ANVIL, MOSSLIGHT_EXCHANGE] as const;
export const SYNTHETIC_REFERENCE_SET_ID = 'synthetic-development' as const;

export const SYNTHETIC_REFERENCE_SET: ReferenceSet = {
  schemaVersion: '0.1',
  id: SYNTHETIC_REFERENCE_SET_ID,
  version: '0.1.0',
  unitSpecSchemaVersion: '0.1',
  partition: 'development',
  members: SYNTHETIC_UNITS.map((unit) => ({
    unitId: unit.id,
    familyId: unit.id,
    unitArtifactId: `${unit.id}-unit`,
    annotationArtifactId: `${unit.id}-annotation`,
    coverageArtifactId: `${unit.id}-coverage`,
    provenanceArtifactId: `${unit.id}-provenance`
  })),
  normalizationVersion: 'synthetic-authoring-0.1'
};

const mechanicsByUnit: Record<(typeof SYNTHETIC_UNITS)[number]['id'], string[]> = {
  'vector-kite': [
    'active-ability',
    'beam',
    'bounded-secondary-action',
    'complete-resource-cycle',
    'form',
    'projectile',
    'status'
  ],
  'resonance-anvil': ['automatic-ability', 'beam', 'direct-strike', 'status'],
  'mosslight-exchange': [
    'automatic-ability',
    'bounded-summon',
    'complete-resource-cycle',
    'economy',
    'support'
  ]
};

export const SYNTHETIC_ANNOTATIONS: readonly ReferenceAnnotation[] = SYNTHETIC_UNITS.map(
  (unit) => ({
    schemaVersion: '0.1',
    unitId: unit.id,
    qualityClass: 'mature-reference',
    expectedHardAcceptance: true,
    expectedProfile: 'classic-three-path-quality',
    declaredRoles: [...unit.roles],
    mechanicFamilies: mechanicsByUnit[unit.id]!,
    knownLimitations: [],
    annotationVersion: '0.1.0'
  })
);

export const SYNTHETIC_COVERAGE: readonly ReferenceCoverage[] = SYNTHETIC_UNITS.map((unit) => ({
  schemaVersion: '0.1',
  unitId: unit.id,
  status: 'complete',
  supportedMechanics: mechanicsByUnit[unit.id]!,
  approximatedMechanics: [],
  opaqueMechanics: [],
  unsupportedMechanics: [],
  warnings: []
}));

export const SYNTHETIC_PROVENANCE: readonly ReferenceProvenance[] = SYNTHETIC_UNITS.map((unit) => ({
  schemaVersion: '0.1',
  unitId: unit.id,
  normalizationVersion: 'synthetic-authoring-0.1',
  sourceSnapshotId: `original-synthetic-${unit.id}-0.1`,
  records: [
    {
      targetPointer: '',
      status: 'exact',
      sourceArtifact: `original-synthetic-${unit.id}`,
      derivation: 'Authored directly against UnitSpec 0.1.',
      confidence: 1,
      note: 'Original public synthetic fixture; no external source content.'
    }
  ]
}));

export const SYNTHETIC_MECHANIC_COVERAGE = [
  ...new Set(SYNTHETIC_COVERAGE.flatMap((coverage) => coverage.supportedMechanics))
].sort();

export function getSyntheticUnit(unitId: string): UnitSpec {
  const unit = SYNTHETIC_UNITS.find((candidate) => candidate.id === unitId);
  if (!unit) throw new Error(`Unknown synthetic unit: ${unitId}`);
  return unit;
}
