import { createHash } from 'node:crypto';
import { canonicalStringify } from './compiler.js';
import { classicThreePathProfile } from './profile.js';
import type { UnitSpec, UpgradeOperation, Action } from './schemas.js';
export interface NormalizedGenerationRequest {
  concept: string;
  profile?: 'classic-three-path';
  sourceNotes?: string;
  designNotes?: string;
  seed: number;
  constraints: {
    allowedMechanics?: string[];
    excludedMechanics?: string[];
    preferredMechanics?: string[];
    complexity?: 'low' | 'medium' | 'high';
    prominentMechanicLimit?: number;
    nativeActiveLimit?: number;
    placementCostBand?: 'low' | 'medium' | 'high';
    desiredRoles?: string[];
  };
}
const allows = (request: NormalizedGenerationRequest, mechanic: string) =>
  !request.constraints.excludedMechanics?.includes(mechanic) &&
  (!request.constraints.allowedMechanics ||
    request.constraints.allowedMechanics.includes(mechanic));

/** Demo families vary mechanics and numbers; they do not infer fictional canon. */
export function generateFixtureUnit(request: NormalizedGenerationRequest): UnitSpec {
  let randomState = request.seed;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const text =
    `${request.concept} ${request.sourceNotes ?? ''} ${request.designNotes ?? ''}`.toLowerCase();
  const family = request.constraints.preferredMechanics?.includes('damage-over-time')
    ? 'ember'
    : request.constraints.preferredMechanics?.some(
          (value) => value === 'status' || value === 'control' || value === 'beam'
        )
      ? 'clock'
      : /fire|volcan|dragon|lava/.test(text)
        ? 'ember'
        : /ice|clock|time|frost|control|road/.test(text)
          ? 'clock'
          : /cannon|goblin|machine|robot|gun/.test(text)
            ? 'engine'
            : /heal|support|probab|plant|forest/.test(text)
              ? 'grove'
              : ['ember', 'clock', 'engine', 'grove'][Math.floor(random() * 4)]!;
  const damage = 7 + Math.floor(random() * 7);
  const interval = Math.round((0.8 + random() * 0.7) * 100) / 100;
  const range = 20 + Math.floor(random() * 12);
  const band = request.constraints.placementCostBand ?? 'medium';
  const costBand = classicThreePathProfile.numericBands.placementCostCredits[band];
  const cost = Math.round((costBand[0] + random() * (costBand[1] - costBand[0])) / 5) * 5;
  const budget = Math.min(
    request.constraints.complexity === 'low' ? 1 : 3,
    request.constraints.prominentMechanicLimit ?? 3
  );
  const special = budget > 0;
  const preferred = new Set(request.constraints.preferredMechanics ?? []);
  const prioritizeAbility = preferred.has('active-ability') || preferred.has('resource');
  const prioritizeForm = preferred.has('form');
  const dot =
    ((!prioritizeAbility && !prioritizeForm) || preferred.has('damage-over-time')) &&
    family === 'ember' &&
    special &&
    allows(request, 'damage-over-time');
  const control =
    ((!prioritizeAbility && !prioritizeForm) ||
      preferred.has('control') ||
      preferred.has('status') ||
      request.constraints.desiredRoles?.includes('control') === true) &&
    special &&
    !dot &&
    allows(request, 'status') &&
    allows(request, 'control');
  const ability =
    budget > Number(control) + Number(dot) + Number(prioritizeForm) &&
    (request.constraints.nativeActiveLimit ?? 1) > 0 &&
    allows(request, 'active-ability');
  const resource = ability && allows(request, 'resource');
  const form = budget > Number(control) + Number(ability) + Number(dot) && allows(request, 'form');
  const beam = !preferred.has('projectile') && family === 'clock' && allows(request, 'beam');
  const projectile = !beam && allows(request, 'projectile');
  const action = (
    id: string,
    name: string,
    amount: number,
    seconds: number,
    options: Partial<Action> = {}
  ): Action => ({
    id,
    name,
    summary: `Deals ${amount} hit points per hit; ${seconds} seconds between casts.`,
    unlockedByDefault: false,
    tags: ['damage'],
    trigger: { type: 'interval', intervalSeconds: 0.05 },
    targeting: {
      id: `${id}-target`,
      type: 'first',
      maximumTargets: 1,
      includeTags: [],
      excludeTags: []
    },
    delivery: {
      id: `${id}-delivery`,
      type: beam ? 'beam' : projectile ? 'projectile' : 'direct-strike',
      maximumTargetsPerProjectile: 1,
      ...(projectile ? { projectileSpeedWorldUnitsPerSecond: 35 } : {})
    },
    timing: { cooldownSeconds: seconds, windupSeconds: 0, rateScope: 'aggregate' },
    rangeWorldUnits: range,
    emitters: [{ id: `${id}-emitter`, emitterCount: 1, projectilesPerCycle: 1 }],
    effects: [
      {
        id: `${id}-damage`,
        type: 'damage',
        amountHitPoints: amount,
        damageType: family === 'ember' ? 'fire' : family === 'engine' ? 'kinetic' : 'energy'
      }
    ],
    conditions: [],
    resourceCosts: [],
    stateInteractions: [],
    ...options
  });
  const base = action(
    'primary',
    { ember: 'Cinder shot', clock: 'Measured pulse', engine: 'Rivet volley', grove: 'Seed needle' }[
      family
    ]!,
    damage,
    interval,
    {
      unlockedByDefault: true,
      summary:
        'Attacks the first enemy in range. Upgrade operations change the displayed base values cumulatively.'
    }
  );
  if (dot)
    base.effects.push({
      id: 'ember-dot',
      type: 'damage-over-time',
      amountHitPointsPerTick: 2,
      tickIntervalSeconds: 1,
      durationSeconds: 3,
      damageType: 'fire',
      stacking: 'refresh',
      maximumStacks: 1
    });
  const surge = action('surge', 'Stored release', damage * 4, 12, {
    trigger: { type: 'manual' },
    summary: resource
      ? 'Spends 4 charge for one burst; recovers after 12 seconds.'
      : 'One burst with a 12 second cooldown.',
    resourceCosts: resource ? [{ resourceId: 'charge', amountPerCycle: 4 }] : []
  });
  const sentinel = action('sentinel', 'Long watch', damage * 2, interval * 2, {
    rangeWorldUnits: range + 14,
    targeting: {
      id: 'sentinel-target',
      type: 'strongest',
      maximumTargets: 1,
      includeTags: [],
      excludeTags: []
    },
    summary: 'An independent long range attack selects the strongest enemy.'
  });
  const unit: UnitSpec = {
    schemaVersion: '0.1',
    id: `unit-${createHash('sha256').update(canonicalStringify(request)).digest('hex').slice(0, 16)}`,
    name: request.concept,
    summary: `Fixture demo using the ${family} family. ${dot ? 'Burning projectiles add a short damage-over-time effect.' : control ? 'A precision attack develops crowd control through upgrades.' : 'A precision attack develops range and sustained damage through upgrades.'} This demo uses keywords and seed, not source-character knowledge.`,
    roles: control ? ['damage', 'control'] : ['damage'],
    tags: ['fixture-demo', family],
    placement: {
      footprintRadiusWorldUnits: family === 'engine' ? 1.4 : 0.9,
      allowedSurfaces: ['ground'],
      rules: []
    },
    economy: { baseCostCredits: cost, costProfile: request.profile ?? 'classic-three-path' },
    baseStats: { rangeWorldUnits: range, durabilityHitPoints: family === 'engine' ? 140 : 80 },
    actions: [base, sentinel, ...(ability ? [surge] : [])],
    resources: resource
      ? [
          {
            id: 'charge',
            name: family === 'engine' ? 'Pressure' : 'Charge',
            unlockedByDefault: false,
            ownershipScope: 'unit',
            startingAmount: 0,
            cap: 8,
            generation: [{ event: 'on-hit', actionId: 'primary', amount: 1 }],
            spend: [{ event: 'action', referenceId: 'surge', amount: 4 }],
            recovery: { type: 'regeneration', amountPerSecond: 0.25 },
            persistence: 'encounter'
          }
        ]
      : [],
    abilities: ability
      ? [
          {
            id: 'release',
            name: 'Stored release',
            summary: surge.summary,
            unlockedByDefault: false,
            type: 'active',
            actionId: 'surge',
            cooldownSeconds: 12,
            initialCooldownSeconds: 0,
            maximumCharges: 1,
            rechargeSeconds: 12,
            playerComplexity: 1,
            ...(resource ? { resourceId: 'charge' } : {})
          }
        ]
      : [],
    states: [],
    statuses: control
      ? [
          {
            id: 'slow',
            name: 'Drag',
            kind: 'slow',
            magnitude: 0.25,
            maximumStacks: 1,
            refresh: 'refresh',
            removal: 'expiry'
          }
        ]
      : [],
    summons: [],
    forms: form
      ? [
          {
            id: 'focused-form',
            name: 'Focused configuration',
            summary:
              'After the tier 5 unlock, select this encounter configuration for 25% faster primary cooldown.',
            externallyUnlocked: false,
            requirements: [],
            activation: 'external',
            operations: [
              {
                type: 'modify-action',
                actionId: 'primary',
                parameter: 'cooldownSeconds',
                operation: 'multiply',
                value: 0.75
              }
            ],
            persistence: 'encounter',
            reversion: 'none'
          }
        ]
      : [],
    upgradeGraph: {
      profile: request.profile ?? 'classic-three-path',
      paths: [
        {
          id: 'force',
          name: 'Focused force',
          summary:
            'Single-target pressure and a bounded additional projectile; few control options.'
        },
        {
          id: 'control',
          name: control ? 'Traffic control' : 'Long watch',
          summary: control
            ? 'Slows enemies, then adds a long range watcher; lower direct burst.'
            : 'Extends coverage and adds a separate watcher; fewer damage multipliers.'
        },
        {
          id: 'reserve',
          name: ability ? 'Stored power' : 'Rapid cycle',
          summary: ability
            ? 'Builds a manual burst loop with recovery; depends on activation timing.'
            : 'Improves sustained attack rate; no manual burst.'
        }
      ],
      nodes: [],
      selectionRules: {
        maximumPrimaryPathTier: 5,
        maximumCrossPathTier: 2,
        maximumCrossPaths: 1,
        maximumSelectedNodes: 7
      }
    },
    requirements: {
      visuals: [
        { id: 'unit-visual', description: `A readable silhouette for ${request.concept}.` }
      ],
      animations: [
        { id: 'attack-animation', description: 'Primary attack anticipation and release.' }
      ],
      audio: [{ id: 'attack-audio', description: 'A short attack cue.' }]
    }
  };
  const damageOp = (value: number, actionId = 'primary'): UpgradeOperation => ({
    type: 'modify-effect',
    actionId,
    effectId: `${actionId}-damage`,
    parameter: 'amountHitPoints',
    operation: 'multiply',
    value
  });
  const modify = (
    parameter: 'cooldownSeconds' | 'rangeWorldUnits' | 'projectilesPerCycle',
    operation: 'add' | 'multiply' | 'set',
    value: number
  ): UpgradeOperation => ({
    type: 'modify-action',
    actionId: 'primary',
    parameter,
    operation,
    value
  });
  const rows: {
    path: string;
    names: string[];
    summaries: string[];
    operations: UpgradeOperation[][];
  }[] = [
    {
      path: 'force',
      names: ['Dense impact', 'Clean cycle', 'Heavy strike', 'Breaking point', 'Double release'],
      summaries: [
        'Primary damage ×1.25.',
        'Primary damage ×1.2.',
        'Primary damage ×1.7 establishes a single-target role.',
        'Primary damage ×1.45 is useful immediately.',
        'Two projectiles per cycle is the fixed cap.'
      ],
      operations: [
        [damageOp(1.25)],
        [damageOp(1.2)],
        [damageOp(1.7)],
        [damageOp(1.45)],
        [modify('projectilesPerCycle', 'set', 2)]
      ]
    },
    {
      path: 'control',
      names: [
        'Wider watch',
        'Far sight',
        control ? 'Holding pattern' : 'Watch station',
        'Long watch',
        'Deep coverage'
      ],
      summaries: [
        'Primary range +4 world units.',
        'Primary range +5 world units.',
        control
          ? 'Hits apply 25% slow for 2 seconds, one stack, refreshed on hit.'
          : 'Primary range +8 world units establishes the coverage role.',
        'Adds an independent strongest-target watcher with its own range.',
        'Watcher damage ×2; its emitter and target caps remain one.'
      ],
      operations: [
        [modify('rangeWorldUnits', 'add', 4)],
        [modify('rangeWorldUnits', 'add', 5)],
        control
          ? [
              {
                type: 'add-effect',
                actionId: 'primary',
                effect: {
                  id: 'slow-effect',
                  type: 'status',
                  statusId: 'slow',
                  durationSeconds: 2,
                  stacks: 1,
                  stacking: 'refresh'
                }
              }
            ]
          : [modify('rangeWorldUnits', 'add', 8)],
        [{ type: 'enable-action', actionId: 'sentinel' }],
        [damageOp(2, 'sentinel')]
      ]
    },
    {
      path: 'reserve',
      names: [
        resource ? 'Charge cell' : 'Quick recovery',
        'Prepared cycle',
        ability ? 'Stored release' : 'Rapid cycle',
        'Useful reserve',
        form ? 'Focused configuration' : 'Final cadence'
      ],
      summaries: [
        resource
          ? 'Unlocks charge: cap 8, +1 per primary hit and +0.25 per second.'
          : 'Primary cooldown ×0.9.',
        'Primary cooldown ×0.85.',
        ability ? surge.summary : 'Primary cooldown ×0.75 establishes sustained fire.',
        ability ? 'Stored release damage ×1.6.' : 'Primary cooldown ×0.8.',
        form
          ? 'Unlocks the optional encounter form with primary cooldown ×0.75.'
          : 'Primary cooldown ×0.8; fixed emitters prevent an unbounded loop.'
      ],
      operations: [
        resource
          ? [{ type: 'enable-resource', resourceId: 'charge' }]
          : [modify('cooldownSeconds', 'multiply', 0.9)],
        [modify('cooldownSeconds', 'multiply', 0.85)],
        ability
          ? [{ type: 'grant-ability', abilityId: 'release' }]
          : [modify('cooldownSeconds', 'multiply', 0.75)],
        ability ? [damageOp(1.6, 'surge')] : [modify('cooldownSeconds', 'multiply', 0.8)],
        form
          ? [{ type: 'grant-form', formId: 'focused-form' }]
          : [modify('cooldownSeconds', 'multiply', 0.8)]
      ]
    }
  ];
  for (const row of rows)
    for (let index = 0; index < 5; index++)
      unit.upgradeGraph.nodes.push({
        id: `${row.path}-${index + 1}`,
        name: row.names[index]!,
        summary: row.summaries[index]!,
        path: row.path,
        tier: index + 1,
        costCredits: Math.round(cost * [0.2, 0.4, 0.8, 1.5, 3][index]!),
        prerequisites: index ? [`${row.path}-${index}`] : [],
        tags: [row.path],
        operations: row.operations[index]!
      });
  return unit;
}
