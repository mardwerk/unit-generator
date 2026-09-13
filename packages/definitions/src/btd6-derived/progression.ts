import {
  advanceProgression,
  fusionDegree,
  resolveFusion,
  type FusionInput,
  type FusionPolicy,
  type RoundExperiencePolicy,
  type ProgressionPolicy
} from '../mechanics/progression.js';
import { isLegalBtd6Build } from './compiler.js';

const documentationRoot =
  'https://github.com/hemisemidemipresent/cyberquincy/blob/0901e279c20a6f5af27ee4a669d2c9deb82ebcf7';
export const btd6ProgressionDocumentation = {
  qualification: 'secondary-documented' as const,
  retrievedOn: '2026-09-09',
  sourceCommitDate: '2026-08-30T09:07:15Z',
  fusion: `${documentationRoot}/slash_commands/paragon.js#L194-L287`,
  experience: `${documentationRoot}/helpers/heroes.js#L7-L116`,
  gaps: [
    'The documented calculator is not a game observation or a version-56.3 parity test.',
    'Unlocks, mode restrictions, ownership, active-Paragon limits and selection of the three original tier-5 towers require caller eligibility checks.',
    'Cash-earned contribution semantics are not established by this calculator; nonzero cash-earned inputs are rejected.',
    'Hero XP gain distribution, map and knowledge modifiers, manual-level pricing and ability activation on level-up are outside the level-cost policy.',
    'Degree-specific combat models must be supplied; this policy does not infer attack scaling.'
  ]
};

export interface Btd6HeroXpStep {
  level: number;
  xpCost: number;
  upgradeId: string;
}

/** Uses each captured cost directly, including hero-specific rounding already present in the table. */
export function createBtd6HeroProgression(
  steps: Btd6HeroXpStep[],
  sourceReference: string
): ProgressionPolicy {
  if (steps.length !== 19 || !sourceReference.trim())
    throw new Error(
      'Captured hero progression requires levels 2 through 20 and a source reference.'
    );
  const policy: ProgressionPolicy = {
    qualification: {
      kind: 'documented-policy',
      reference: `${sourceReference}; ${btd6ProgressionDocumentation.experience}`
    },
    initialLevel: 1,
    steps: steps.map((step) => ({ level: step.level, cost: step.xpCost, unlock: step.upgradeId })),
    // Overflow cannot unlock anything beyond the captured final level.
    overflow: 'retain'
  };
  advanceProgression({ level: 1, experience: 0 }, 0, policy);
  return policy;
}

export interface Btd6FusionCapture {
  degreeCount: number;
  powerDegreeRequirements: number[];
  maxInvestment: number;
  maxPowerFromPops: number;
  maxPowerFromMoneySpent: number;
  maxPowerFromNonTier5Count: number;
  maxPowerFromTier5Count: number;
  popsOverX: number;
  moneySpentOverX: number;
  nonTier5TowersMultByX: number;
  tier5TowersMultByX: number;
  paidContributionPenalty: number;
}
const originals = ['original-path-0', 'original-path-1', 'original-path-2'];
const extraKinds = ['extra-tier-5', 'lower-tier'];

/** Capture supplies coefficients and thresholds; the pinned secondary source supplies arithmetic. */
export function createBtd6FusionPolicy(
  capture: Btd6FusionCapture,
  purchaseCost: number,
  sourceReference: string
): FusionPolicy {
  if (!Number.isFinite(purchaseCost) || purchaseCost <= 0 || !sourceReference.trim())
    throw new Error(
      'Fusion policy requires a positive difficulty-adjusted purchase cost and source reference.'
    );
  if (
    capture.degreeCount !== capture.powerDegreeRequirements.length ||
    capture.powerDegreeRequirements.at(-1) !== capture.maxInvestment
  )
    throw new Error('Fusion degree capture is incomplete.');
  const policy: FusionPolicy = {
    qualification: {
      kind: 'documented-policy',
      reference: `${sourceReference}; ${btd6ProgressionDocumentation.fusion}`
    },
    requirements: originals.map((kind) => ({ kind, minimum: 1 })),
    contributions: [
      {
        id: 'pops',
        source: { kind: 'sacrifices', metric: 'damage', kinds: [...originals, ...extraKinds] },
        operations: [
          { kind: 'divide', value: capture.popsOverX },
          { kind: 'cap', value: capture.maxPowerFromPops }
        ]
      },
      {
        id: 'money-spent',
        source: {
          kind: 'sum',
          terms: [
            {
              source: { kind: 'sacrifices', metric: 'cashSpent', kinds: extraKinds },
              operations: []
            },
            {
              source: { kind: 'input', key: 'injectedCash' },
              operations: [
                { kind: 'divide', value: 1 + capture.paidContributionPenalty },
                { kind: 'ceil' }
              ]
            }
          ]
        },
        operations: [
          { kind: 'divide', value: purchaseCost / capture.moneySpentOverX },
          { kind: 'cap', value: capture.maxPowerFromMoneySpent }
        ]
      },
      {
        id: 'non-tier-5-upgrades',
        source: { kind: 'sacrifices', metric: 'upgradeCount', kinds: ['lower-tier'] },
        operations: [
          { kind: 'multiply', value: capture.nonTier5TowersMultByX },
          { kind: 'cap', value: capture.maxPowerFromNonTier5Count }
        ]
      },
      {
        id: 'extra-tier-5',
        source: { kind: 'sacrifices', metric: 'count', kinds: ['extra-tier-5'] },
        operations: [
          { kind: 'multiply', value: capture.tier5TowersMultByX },
          { kind: 'cap', value: capture.maxPowerFromTier5Count }
        ]
      },
      {
        id: 'totems',
        source: { kind: 'input', key: 'totems' },
        operations: [{ kind: 'multiply', value: 2000 }]
      }
    ],
    maximumPower: capture.maxInvestment,
    degrees: capture.powerDegreeRequirements.map((minimumPower, i) => ({
      degree: i + 1,
      minimumPower
    }))
  };
  fusionDegree(0, policy);
  return policy;
}

export interface Btd6FusionTower {
  id: string;
  family: string;
  tiers: [number, number, number];
  damage: number;
  cashSpent: number;
  cashEarned?: number;
}
export interface Btd6FusionRequest {
  family: string;
  /** IDs in top, middle, bottom path order. Selection and unlock/mode permission come from the caller. */
  originalIds: [string, string, string];
  towers: Btd6FusionTower[];
  injectedCash: number;
  totems: number;
}

/** Maps selected captured towers to neutral sacrifice counters; all arithmetic runs in shared operations. */
export function prepareBtd6FusionInput(request: Btd6FusionRequest): FusionInput {
  if (
    !request.family ||
    request.originalIds.length !== 3 ||
    new Set(request.originalIds).size !== 3
  )
    throw new Error('Fusion requires three distinct original tier-5 identities.');
  if (!Number.isSafeInteger(request.totems) || request.totems < 0)
    throw new Error('Fusion totem count must be a non-negative integer.');
  const input: FusionInput = {
    inputs: { injectedCash: request.injectedCash, totems: request.totems },
    sacrifices: request.towers.map((tower) => {
      if (tower.family !== request.family || !isLegalBtd6Build(tower.tiers))
        throw new Error('Fusion sacrifices must be legal ordinary towers of the selected family.');
      if (tower.cashEarned !== undefined && tower.cashEarned !== 0)
        throw new Error('Cash-earned fusion contribution requires additional documented policy.');
      const originalPath = request.originalIds.indexOf(tower.id);
      if (originalPath >= 0 && tower.tiers[originalPath] !== 5)
        throw new Error('Each original fusion tower must have tier 5 on its selected path.');
      return {
        id: tower.id,
        kind:
          originalPath >= 0
            ? originals[originalPath]!
            : tower.tiers.includes(5)
              ? 'extra-tier-5'
              : 'lower-tier',
        metrics: {
          damage: tower.damage,
          cashSpent: tower.cashSpent,
          upgradeCount: tower.tiers.reduce((a, b) => a + b, 0),
          count: 1
        }
      };
    })
  };
  return input;
}

export function resolveBtd6Fusion(request: Btd6FusionRequest, policy: FusionPolicy) {
  return resolveFusion(prepareBtd6FusionInput(request), policy);
}

/** Single-recipient baseline from the pinned calculator. Multiple-recipient distribution needs an explicit provided policy. */
export function createBtd6RoundExperiencePolicy(
  mapDifficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert' = 'beginner'
): RoundExperiencePolicy {
  const multiplier = { beginner: 1, intermediate: 1.1, advanced: 1.2, expert: 1.3 }[mapDifficulty];
  if (!multiplier) throw new Error('Unknown map experience difficulty.');
  return {
    qualification: {
      kind: 'documented-policy',
      reference: btd6ProgressionDocumentation.experience
    },
    bands: [
      { fromRound: 1, toRound: 20, initialAward: 40, increment: 20 },
      { fromRound: 21, toRound: 50, initialAward: 460, increment: 40 },
      { fromRound: 51, toRound: 99, initialAward: 1710, increment: 90 }
    ],
    multiplier,
    distribution: 'each'
  };
}
