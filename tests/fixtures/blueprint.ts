import type { UnitBlueprint } from '../../src/core/mechanics/schemas.js';

/** A blueprint that passes every check under the bundled Definition. */
const blueprint: UnitBlueprint = {
  name: 'piercing-projectile-v2',
  role: 'Aimed sharp projectiles develop strong-target penetrators, a distributed barrage, or area impacts. Capstones deepen focused damage, burst output or secondary group impacts. Detection requires path3 tier2.',
  weakness:
    'Sharp attacks cannot damage Lead or Frozen. Detection requires path3 tier2. No homing, wall ricochet or independent attackers.',
  baseAttack: {
    name: 'Aimed projectile',
    cost: 200,
    delivery: 'projectile',
    damageType: 'sharp',
    targeting: 'first',
    camo: false,
    stats: {
      damage: 1,
      intervalSeconds: 0.95,
      range: 32,
      pierce: 2,
      projectiles: 1,
      splashRadius: 0,
      slowPercent: 0,
      slowSeconds: 0,
      burnDamagePerSecond: 0,
      burnSeconds: 0,
      stunSeconds: 0,
    },
  },
  paths: {
    path1: {
      name: 'Heavy impact',
      specialization: 'direct-damage',
      theme: 'Reliable damage per hit',
      rationale:
        'T3 converts the shot into a slower strong-target penetrator. T4 develops its impact; T5 delivers overwhelming damage with the same strong-target focus. Sharp-type exclusions remain.',
      sourceFactIndices: [0],
      tiers: {
        tier1: {
          name: 'Sharper hit',
          cost: 140,
          changes: [{ kind: 'stat', target: 'base', stat: 'damage', operation: 'add', value: 1 }],
        },
        tier2: {
          name: 'Weighted hit',
          cost: 260,
          changes: [{ kind: 'stat', target: 'base', stat: 'damage', operation: 'add', value: 1 }],
        },
        tier3: {
          name: 'Heavy penetrator',
          cost: 850,
          changes: [
            { kind: 'stat', target: 'base', stat: 'damage', operation: 'add', value: 2 },
            { kind: 'stat', target: 'base', stat: 'range', operation: 'add', value: 4 },
            { kind: 'targeting', target: 'base', value: 'strong' },
            {
              kind: 'stat',
              target: 'base',
              stat: 'intervalSeconds',
              operation: 'multiply',
              value: 1.15,
            },
          ],
        },
        tier4: {
          name: 'Crushing projectile',
          cost: 3200,
          changes: [{ kind: 'stat', target: 'base', stat: 'damage', operation: 'add', value: 4 }],
        },
        tier5: {
          name: 'Ultimate penetrator',
          cost: 24000,
          changes: [
            { kind: 'stat', target: 'base', stat: 'damage', operation: 'multiply', value: 3 },
          ],
        },
      },
    },
    path2: {
      name: 'Timed volley',
      specialization: 'ability-burst',
      theme: 'Short windows of distributed projectile hits',
      rationale:
        'T3 distributes the volley across distinct targets. T4 unlocks a timed self boost; T5 triples damage within the same distributed burst. Downtime remains.',
      sourceFactIndices: [0],
      tiers: {
        tier1: {
          name: 'Quick release',
          cost: 120,
          changes: [
            {
              kind: 'stat',
              target: 'base',
              stat: 'intervalSeconds',
              operation: 'multiply',
              value: 0.9,
            },
          ],
        },
        tier2: {
          name: 'Steady rhythm',
          cost: 250,
          changes: [
            {
              kind: 'stat',
              target: 'base',
              stat: 'intervalSeconds',
              operation: 'multiply',
              value: 0.85,
            },
          ],
        },
        tier3: {
          name: 'Distributed volley',
          cost: 900,
          changes: [
            { kind: 'stat', target: 'base', stat: 'projectiles', operation: 'add', value: 1 },
            { kind: 'distribution', target: 'base', value: 'distinct-targets' },
          ],
        },
        tier4: {
          name: 'Focused burst',
          cost: 6000,
          changes: [
            {
              kind: 'unlockBoost',
              target: 'base',
              boost: {
                name: 'Focused burst',
                durationSeconds: 8,
                cooldownSeconds: 40,
                damageMultiplier: 2,
                intervalMultiplier: 0.8,
                rangeBonus: 0,
              },
            },
          ],
        },
        tier5: {
          name: 'Overwhelming barrage',
          cost: 36000,
          changes: [
            {
              kind: 'modifyBoost',
              target: 'base',
              stat: 'damageMultiplier',
              operation: 'multiply',
              value: 3,
            },
          ],
        },
      },
    },
    path3: {
      name: 'Piercing coverage',
      specialization: 'group-damage',
      theme: 'Higher target capacity with detection access',
      rationale:
        'T3 converts the attack to area impact. T4 develops capacity and repeated impact; T5 adds secondary hits beyond the primary hit set. No bounce is granted.',
      sourceFactIndices: [0],
      tiers: {
        tier1: {
          name: 'Extra pierce',
          cost: 180,
          changes: [{ kind: 'stat', target: 'base', stat: 'pierce', operation: 'add', value: 2 }],
        },
        tier2: {
          name: 'Clear sight',
          cost: 300,
          changes: [
            { kind: 'camo', target: 'base', value: true },
            { kind: 'stat', target: 'base', stat: 'range', operation: 'add', value: 4 },
          ],
        },
        tier3: {
          name: 'Impact coverage',
          cost: 950,
          changes: [
            { kind: 'stat', target: 'base', stat: 'pierce', operation: 'add', value: 4 },
            { kind: 'delivery', target: 'base', value: 'area' },
            { kind: 'stat', target: 'base', stat: 'splashRadius', operation: 'add', value: 5 },
          ],
        },
        tier4: {
          name: 'Paired penetration',
          cost: 4200,
          changes: [
            { kind: 'stat', target: 'base', stat: 'pierce', operation: 'add', value: 6 },
            { kind: 'stat', target: 'base', stat: 'projectiles', operation: 'add', value: 1 },
          ],
        },
        tier5: {
          name: 'Cascading impacts',
          cost: 26000,
          changes: [
            { kind: 'stat', target: 'base', stat: 'pierce', operation: 'multiply', value: 3 },
            {
              kind: 'followUp',
              target: 'base',
              value: {
                name: 'Secondary impacts',
                count: 6,
                radius: 14,
                damageMultiplier: 1,
                inheritStatuses: false,
              },
            },
          ],
        },
      },
    },
  },
  sourceFacts: [
    {
      documentId: 'experimental-recipe-design',
      quote:
        'This is a proposed mechanical template, with no character identity or source-canon claim.',
    },
  ],
  constraintCoverage: [],
  proposals: [],
  reservedTechniques: [],
};

export function validBlueprint(): UnitBlueprint {
  return structuredClone(blueprint);
}
