import type { MangaUnit, MangaForm, MangaTechnique, MangaModifier, MangaShape } from './schemas.js';
const single: MangaShape = { kind: 'single' };
const area = (radius: number, cap: number): MangaShape => ({ kind: 'area', radius, cap });
function technique(
  id: string,
  name: string,
  unlockTier: number,
  damage: number,
  windup: number,
  recovery: number,
  shape: MangaShape = single,
  hits = 1,
  hitSpan = 0,
  control?: MangaTechnique['control']
): MangaTechnique {
  return {
    id,
    name,
    unlockTier,
    damage,
    windup,
    recovery,
    shape,
    hits,
    hitSpan,
    ...(control ? { control } : {})
  };
}
function form(
  id: string,
  name: string,
  unlockTier: number,
  damage: number,
  period: number,
  windup: number,
  reach: number,
  drainPerSecond: number,
  shape: MangaShape,
  techniques: MangaTechnique[],
  attackName = name
): MangaForm {
  return {
    id,
    name,
    unlockTier,
    drainPerSecond,
    primary: { name: attackName, delivery: 'direct-contact', damage, period, windup, reach, shape },
    techniques
  };
}
const purchaseDescriptions: Record<string, string> = {
  'Overwhelming presence':
    'Damaging contacts stun weak-willed, stunnable enemies for 0.15 seconds. Stun protection prevents repeated interruption.',
  "Conqueror's burst":
    'Every three successful primary cycles can release a radius-12 pulse, stunning up to six eligible enemies for 0.4 seconds. Pulses are at least two seconds apart.',
  'Commanding presence':
    'Increase pulse radius to 18, target cap to eight and stun duration to 0.75 seconds.',
  "Conqueror's coating":
    'Multiply primary and Technique contact damage by 1.20, including against control-immune targets.',
  'Supreme conqueror':
    'Pulse after two successful primary cycles, with radius 24, twelve targets and 1.2-second stuns. Keep the two-second minimum interval.',
  'Sense presence':
    'Acquire and damage concealed enemies within reach. Obstacles still block contact.',
  'Read the movement':
    'Multiply primary period and windup by 0.85. Technique timing stays unchanged.',
  'Future Sight':
    'If a primary target is lost during windup, select one eligible replacement at resolution without restarting the cycle.',
  'Wider awareness': 'Add 12 reach to every primary profile and its contextual Technique.',
  'Unbroken focus':
    'Multiply primary timing by another 0.75, reaching 0.6375 of original period and windup.',
  'Hardened fists':
    'Add four physical damage to every primary and Technique contact before damage multipliers.',
  'Hardened impact':
    'Ignore 25 percent of target armor reduction. A 40 percent reduction becomes 30 percent.',
  Emission:
    'Every third successful primary cycle deals a 30-damage Haki impact to up to three enemies along an eight-unit extension from contact. It excludes the flat damage addition.',
  'Internal Destruction':
    'Convert 20 percent of contact damage into armor-bypassing internal damage. Unarmored damage stays unchanged.',
  'Mastered Armament':
    'Increase internal conversion to 35 percent and multiply contact and Emission damage by 1.35.'
};
function path(
  id: string,
  name: string,
  upgrades: [string, number, MangaModifier][]
): MangaUnit['paths'][number] {
  return {
    id,
    name,
    upgrades: upgrades.map(([name, cost, modifiers]) => ({
      name,
      cost,
      modifiers,
      description:
        purchaseDescriptions[name] ??
        (modifiers.flatDamage
          ? `Add ${modifiers.flatDamage} damage to each contact.`
          : modifiers.reachAdd
            ? `Add ${modifiers.reachAdd} reach.`
            : `Multiply primary timing by ${modifiers.primaryTimingMultiplier}.`)
    }))
  };
}
/** Authored development fixture. Values are provisional, not measured canon or balance. */
export function createLuffyUnit(): MangaUnit {
  return {
    schema: 'mardwerk.manga-mayhem.unit',
    version: '0.1',
    id: 'monkey-d-luffy',
    name: 'Monkey D. Luffy',
    description:
      'Long-range direct melee with three Haki paths, shared Gear unlocks and stamina-limited transformations. Numerical tuning remains provisional.',
    cost: 650,
    baseForm: 'base',
    stunProtectionSeconds: 2,
    stamina: {
      unlockTier: 1,
      maximum: 100,
      entryMinimum: 30,
      recoveryPerSecond: 5,
      reentrySeconds: 6,
      techniqueCost: 25,
      techniqueCooldown: 20
    },
    forms: [
      form('base', 'Base', 0, 20, 1, 0.12, 45, 0, single, [], 'Gum-Gum Pistol'),
      form(
        'second',
        'Gear Second',
        1,
        12,
        0.35,
        0.06,
        45,
        3,
        single,
        [
          technique('jet-gatling', 'Jet Gatling', 1, 15, 0.15, 0.85, single, 6, 0.6),
          technique('second-third', 'Second + Third', 2, 140, 0.25, 0.75, area(5, 6))
        ],
        'Jet Pistol'
      ),
      form(
        'third',
        'Gear Third',
        2,
        100,
        2.5,
        0.6,
        45,
        4,
        area(4, 4),
        [
          technique('giant-sweep', 'Giant sweep', 2, 180, 0.7, 1.3, {
            kind: 'sweep',
            width: 8,
            cap: 8
          })
        ],
        'Giant Pistol'
      ),
      form(
        'boundman',
        'Gear Fourth, Boundman',
        3,
        80,
        0.8,
        0.14,
        48,
        8,
        single,
        [technique('king-kong-gun', 'King Kong Gun', 3, 360, 0.6, 0.6, area(4, 4))],
        'Compressed punch'
      ),
      form(
        'snakeman',
        'Gear Fourth, Snakeman',
        3,
        24,
        0.3,
        0.05,
        60,
        8,
        single,
        [technique('black-mamba', 'Black Mamba', 3, 20, 0.1, 1.1, single, 12, 1)],
        'Extended punch'
      ),
      form(
        'tankman',
        'Gear Fourth, Tankman',
        3,
        110,
        2,
        0.4,
        25,
        8,
        area(6, 6),
        [
          technique('cannonball', 'Cannonball', 3, 240, 0.4, 0.8, area(6, 6), 1, 0, {
            displacement: 5
          })
        ],
        'Broad close impact'
      ),
      form(
        'fifth',
        'Gear Fifth',
        5,
        70,
        0.55,
        0.1,
        55,
        12,
        area(5, 5),
        [
          technique('bajrang-gun', 'Bajrang Gun', 5, 700, 1, 1, area(10, 12), 1, 0, {
            slow: { fraction: 0.4, seconds: 3 }
          })
        ],
        'Enlarged elastic impact'
      )
    ],
    paths: [
      path('conqueror', "Conqueror's Haki", [
        ['Overwhelming presence', 150, { contactStun: 0.15 }],
        [
          "Conqueror's burst",
          300,
          { pulse: { cycles: 3, radius: 12, cap: 6, stun: 0.4, interval: 2 } }
        ],
        [
          'Commanding presence',
          650,
          { pulse: { cycles: 3, radius: 18, cap: 8, stun: 0.75, interval: 2 } }
        ],
        ["Conqueror's coating", 1600, { damageMultiplier: 1.2 }],
        [
          'Supreme conqueror',
          4500,
          { pulse: { cycles: 2, radius: 24, cap: 12, stun: 1.2, interval: 2 } }
        ]
      ]),
      path('observation', 'Observation Haki', [
        ['Sense presence', 180, { detectConcealed: true }],
        ['Read the movement', 350, { primaryTimingMultiplier: 0.85 }],
        ['Future Sight', 700, { retargetPrimary: true }],
        ['Wider awareness', 1700, { reachAdd: 12 }],
        ['Unbroken focus', 4500, { primaryTimingMultiplier: 0.75 }]
      ]),
      path('armament', 'Armament Haki', [
        ['Hardened fists', 200, { flatDamage: 4 }],
        ['Hardened impact', 400, { armorIgnore: 0.25 }],
        ['Emission', 850, { emission: { cycles: 3, damage: 30, width: 3, length: 8, cap: 3 } }],
        ['Internal Destruction', 2000, { internalFraction: 0.2 }],
        ['Mastered Armament', 5000, { internalFraction: 0.35, damageMultiplier: 1.35 }]
      ])
    ]
  };
}
/** Neutral original fixture, deliberately authored separately from the Luffy reference. */
export function createMangaFixture(subject = 'Clockwork sentry'): MangaUnit {
  return {
    schema: 'mardwerk.manga-mayhem.unit',
    version: '0.1',
    id: 'clockwork-sentry',
    name: subject,
    description:
      'An original stationary sentry with a contact hammer and a short stamina-powered overdrive.',
    cost: 400,
    baseForm: 'watch',
    stunProtectionSeconds: 2,
    stamina: {
      unlockTier: 1,
      maximum: 60,
      entryMinimum: 15,
      recoveryPerSecond: 4,
      reentrySeconds: 3,
      techniqueCost: 10,
      techniqueCooldown: 12
    },
    forms: [
      form('watch', 'Watch', 0, 10, 1.2, 0.2, 20, 0, single, []),
      form('overdrive', 'Overdrive', 1, 14, 0.8, 0.1, 22, 5, single, [
        technique('hammer', 'Hammer strike', 1, 50, 0.3, 0.7)
      ])
    ],
    paths: [
      path(
        'hammer',
        'Hammer',
        Array.from({ length: 5 }, (_, i) => [`Hammer ${i + 1}`, 100 * (i + 1), { flatDamage: 2 }])
      ),
      path(
        'sensor',
        'Sensor',
        Array.from({ length: 5 }, (_, i) => [`Sensor ${i + 1}`, 100 * (i + 1), { reachAdd: 2 }])
      ),
      path(
        'motor',
        'Motor',
        Array.from({ length: 5 }, (_, i) => [
          `Motor ${i + 1}`,
          100 * (i + 1),
          { primaryTimingMultiplier: 0.95 }
        ])
      )
    ]
  };
}
