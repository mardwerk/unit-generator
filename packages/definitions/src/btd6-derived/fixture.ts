import type { Btd6Attack, Btd6Unit } from './schema.js';

/** Original authored fixture. No captured game payload or character claims. */
export function createBtd6Fixture(name = 'Clockwork sentry'): Btd6Unit {
  const attack: Btd6Attack = {
    id: 'bolt',
    delivery: 'projectile',
    intervalSeconds: 1,
    reach: { kind: 'radius', radius: 40, throughWalls: false },
    detectsCamo: false,
    damage: 2,
    pierce: 1,
    projectiles: 1,
    immuneTo: ['lead']
  };
  return {
    schemaVersion: 'btd6-derived/0.1',
    id: 'clockwork-sentry',
    name,
    description: 'An original sentry with power, overdrive and detection upgrades.',
    placementCost: 300,
    resolution: 'upgrades',
    base: {
      displayRange: 40,
      targeting: { modes: ['first', 'last', 'close', 'strong'], default: 'first' },
      attacks: [attack],
      abilities: []
    },
    paths: ['Power', 'Overdrive', 'Detection'].map((path, p) => ({
      id: `path-${p}`,
      name: path,
      upgrades: Array.from({ length: 5 }, (_, i) => ({
        id: `upgrade-${p}-${i + 1}`,
        name: `${path} ${i + 1}`,
        description:
          p === 0
            ? 'Raises bolt damage.'
            : p === 1
              ? i === 3
                ? 'Unlocks a temporary overdrive attack.'
                : 'Shortens the bolt attack cycle.'
              : i === 0
                ? 'Detects camouflaged targets.'
                : 'Extends attack reach.',
        cost: (i + 1) * 100,
        operations:
          p === 0
            ? [
                {
                  kind: 'attack-stat',
                  attackId: 'bolt',
                  stat: 'damage',
                  operator: 'add',
                  value: i + 1
                }
              ]
            : p === 1
              ? i === 3
                ? [
                    {
                      kind: 'grant-ability',
                      ability: {
                        id: 'overdrive',
                        name: 'Overdrive',
                        cooldownSeconds: 20,
                        durationSeconds: 4,
                        effect: {
                          kind: 'transform',
                          attacks: [
                            {
                              ...structuredClone(attack),
                              id: 'overdrive-bolt',
                              damage: 12,
                              intervalSeconds: 0.25
                            }
                          ]
                        }
                      }
                    }
                  ]
                : [
                    {
                      kind: 'attack-stat',
                      attackId: 'bolt',
                      stat: 'intervalSeconds',
                      operator: 'multiply',
                      value: 0.85
                    }
                  ]
              : i === 0
                ? [{ kind: 'detect-camo', attackId: 'bolt' }]
                : [
                    {
                      kind: 'attack-stat',
                      attackId: 'bolt',
                      stat: 'radius',
                      operator: 'add',
                      value: 10
                    },
                    { kind: 'display-range', operator: 'add', value: 10 }
                  ]
      }))
    })),
    endpoints: [],
    adaptations: ['Original fixture authored for the candidate BTD6-derived contract.'],
    unsupported: ['Projectile flight and collision require a game runtime.']
  };
}
