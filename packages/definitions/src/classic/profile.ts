export const classicThreePathProfile = {
  id: 'classic-three-path',
  version: '0.1',
  pathCount: 3,
  tiersPerPath: 5,
  maximumPrimaryPathTier: 5,
  maximumCrossPathTier: 2,
  maximumCrossPaths: 1,
  nativeActiveLimit: 1,
  prominentMechanicLimit: 3,
  roles: ['damage', 'control', 'burst', 'support', 'economy'],
  allowedMechanics: [
    'damage',
    'damage-over-time',
    'status',
    'resource-change',
    'spawn',
    'forced-movement',
    'reveal',
    'secondary-action',
    'economy-change',
    'active-ability',
    'resource',
    'form',
    'projectile',
    'beam',
    'area',
    'control'
  ],
  allowedEffects: [
    'damage',
    'damage-over-time',
    'status',
    'resource-change',
    'spawn',
    'forced-movement',
    'reveal',
    'secondary-action',
    'economy-change'
  ],
  allowedTriggers: ['interval', 'manual'],
  allowedDeliveries: [
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
  ],
  allowedAbilities: ['active', 'automatic'],
  forms: {
    activation: 'external',
    persistence: 'encounter',
    reversion: 'none',
    requirements: 'empty; grant-form upgrade or explicit external unlock'
  },
  numericBands: {
    placementCostCredits: { low: [200, 400], medium: [450, 750], high: [800, 1200] },
    rangeWorldUnits: [8, 80],
    selfRangeWorldUnits: [0, 80],
    attackIntervalSeconds: [0.15, 30],
    effectDurationSeconds: [0.1, 60]
  },
  limitations: [
    'Healing, shields, stat modifiers and runtime transformations are outside this default contract.',
    'Forms are explicit encounter build selections, not runtime transformations.',
    'Balance estimates use neutral scenarios and do not establish competitive balance.'
  ]
} as const;

export type ClassicProfile = Omit<
  typeof classicThreePathProfile,
  'nativeActiveLimit' | 'prominentMechanicLimit'
> & {
  nativeActiveLimit: number;
  prominentMechanicLimit: number;
};
