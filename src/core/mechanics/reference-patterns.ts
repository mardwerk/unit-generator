/**
 * Opt-in complete arrangements for reference-pattern authoring, not character adaptations.
 * Source context: research/btd6/raw/btd6_towers.json, mixed unpinned snapshots.
 * Costs below are proposed Gold purchases within the broad Dart/Boomerang/Glue/
 * Wizard reference ranges, not copied BTD6 combat values or balanced prices.
 * The current 3x gate is retained for comparison, not asserted as a BTD6 law.
 *
 * A future model may select a COMPLETE recipe ID and supply source-grounded names,
 * citations and adaptation notes. It may not mix arbitrary paths, overwrite user
 * constraints, or silently convert unsupported powers into these mechanics.
 * This placeholder source fact MUST be replaced by real evidence before authoring.
 * Validation covers static builds and boosts, not waves, maps, fun, balance, or canon.
 */
import {
  defaultMechanicsDefinition,
  mechanicsDefinitionSchema,
  type MechanicsDefinition,
  type Attack,
  type Change,
  type UnitBlueprint,
  pathKeys,
  tierKeys,
} from './schemas.js';

/** Pattern prose and fixed values assume these rules and scale, not just a matching ID. */
export function referencePatternCompatible(definition: MechanicsDefinition): boolean {
  const parsed = mechanicsDefinitionSchema.safeParse(definition);
  if (!parsed.success) return false;
  const invariant = (value: MechanicsDefinition) => {
    const { attackExtensions: _extensions, ...rules } = value.rules;
    const properties = (entries: readonly string[]) => [...new Set(entries)].sort();
    return {
      id: value.id,
      progression: value.progression,
      rules: {
        ...rules,
        damageImmunities: {
          sharp: properties(rules.damageImmunities.sharp),
          normal: properties(rules.damageImmunities.normal),
          explosive: properties(rules.damageImmunities.explosive),
          energy: properties(rules.damageImmunities.energy),
        },
        slowImmune: properties(rules.slowImmune),
        stunImmune: properties(rules.stunImmune),
      },
      currency: value.profile.currency,
      referenceScale: value.profile.referenceScale,
    };
  };
  // Schema parsing also gives invariant object fields a stable order.
  const baseline = mechanicsDefinitionSchema.parse(defaultMechanicsDefinition);
  return JSON.stringify(invariant(parsed.data)) === JSON.stringify(invariant(baseline));
}

export interface ReferenceRecipe {
  id: string;
  version: '2';
  provenance: { source: string; sourceSha256: string; valueBasis: string; limitations: string };
  definitionId: string;
  definitionRevision: string;
  selectionDescription: string;
  blueprint: UnitBlueprint;
  purchaseRationale: Record<(typeof pathKeys)[number], string[]>;
  limitations: string[];
}

type Stat = Extract<Change, { kind: 'stat' }>['stat'];
type Path = UnitBlueprint['paths']['path1'];
type Purchase = [name: string, cost: number, explanation: string, ...changes: Change[]];
const add = (stat: Stat, value: number): Change => ({
  kind: 'stat',
  target: 'base',
  stat,
  operation: 'add',
  value,
});
const multiply = (stat: Stat, value: number): Change => ({
  kind: 'stat',
  target: 'base',
  stat,
  operation: 'multiply',
  value,
});
const distinct: Change = { kind: 'distribution', target: 'base', value: 'distinct-targets' };
const deliveryChange = (value: Attack['delivery']): Change => ({
  kind: 'delivery',
  target: 'base',
  value,
});
const strong: Change = { kind: 'targeting', target: 'base', value: 'strong' };
const followUp = (
  name: string,
  count: number,
  radius: number,
  inheritStatuses = false,
  target: 'base' | 'boost' = 'base',
): Change => ({
  kind: 'followUp',
  target,
  value: { name, count, radius, damageMultiplier: 1, inheritStatuses },
});
const camo: Change = { kind: 'camo', target: 'base', value: true };
const burst = (
  name: string,
  durationSeconds: number,
  cooldownSeconds: number,
  intervalMultiplier: number,
): Change => ({
  kind: 'unlockBoost',
  target: 'base',
  boost: {
    name,
    durationSeconds,
    cooldownSeconds,
    damageMultiplier: 2,
    intervalMultiplier,
    rangeBonus: 0,
  },
});
const strongerBurst: Change = {
  kind: 'modifyBoost',
  target: 'base',
  stat: 'damageMultiplier',
  operation: 'multiply',
  value: 3,
};

function path(
  name: string,
  specialization: NonNullable<Path['specialization']>,
  theme: string,
  rationale: string,
  purchases: [Purchase, Purchase, Purchase, Purchase, Purchase],
) {
  return {
    path: {
      name,
      specialization,
      theme,
      rationale,
      sourceFactIndices: [0],
      tiers: Object.fromEntries(
        purchases.map(([name, cost, , ...changes], index) => [
          tierKeys[index],
          { name, cost, changes },
        ]),
      ) as Path['tiers'],
    } satisfies Path,
    notes: purchases.map((purchase) => purchase[2]),
  };
}
function attack(
  name: string,
  cost: number,
  delivery: Attack['delivery'],
  damageType: Attack['damageType'],
  intervalSeconds: number,
  range: number,
  pierce: number,
  splashRadius = 0,
): Attack {
  return {
    name,
    cost,
    delivery,
    damageType,
    targeting: 'first',
    camo: false,
    stats: {
      damage: 1,
      intervalSeconds,
      range,
      pierce,
      projectiles: 1,
      splashRadius,
      slowPercent: 0,
      slowSeconds: 0,
      burnDamagePerSecond: 0,
      burnSeconds: 0,
      stunSeconds: 0,
    },
  };
}
function flameAttack(): Attack {
  const value = attack('Aimed flame', 450, 'projectile', 'energy', 1.2, 38, 1);
  value.stats.burnDamagePerSecond = 1;
  value.stats.burnSeconds = 2;
  return value;
}

function recipe(
  id: string,
  selectionDescription: string,
  baseAttack: Attack,
  weakness: string,
  paths: [ReturnType<typeof path>, ReturnType<typeof path>, ReturnType<typeof path>],
  limitations: string[],
): ReferenceRecipe {
  return {
    id,
    version: '2',
    definitionId: defaultMechanicsDefinition.id,
    definitionRevision: defaultMechanicsDefinition.revision,
    provenance: {
      source: 'research/btd6/raw/btd6_towers.json',
      sourceSha256: 'a2a5e2bb4591a6278f079a6796d06f76428716080bd4a42453f898cb1403f8f6',
      valueBasis:
        'Authored proposed stats and incremental Gold prices, inspired by source progression and broad price ranges. Not transcribed BTD6 combat balance.',
      limitations:
        'Mixed unpinned source patches; no game simulation, balance certification or character fidelity certification.',
    },
    selectionDescription,
    blueprint: {
      name: id,
      role: selectionDescription,
      weakness,
      baseAttack,
      paths: Object.fromEntries(
        paths.map((entry, index) => [pathKeys[index], entry.path]),
      ) as UnitBlueprint['paths'],
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
    },
    purchaseRationale: Object.fromEntries(
      paths.map((entry, index) => [pathKeys[index], entry.notes]),
    ) as ReferenceRecipe['purchaseRationale'],
    limitations,
  };
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export const referenceRecipes: readonly ReferenceRecipe[] = freeze([
  recipe(
    'piercing-projectile-v2',
    'Aimed sharp projectiles develop strong-target penetrators, a distributed barrage, or area impacts. Capstones deepen focused damage, burst output or secondary group impacts. Detection requires path3 tier2.',
    attack('Aimed projectile', 200, 'projectile', 'sharp', 0.95, 32, 2),
    'Sharp attacks cannot damage Lead or Frozen. Detection requires path3 tier2. No homing, wall ricochet or independent attackers.',
    [
      path(
        'Heavy impact',
        'direct-damage',
        'Reliable damage per hit',
        'T3 converts the shot into a slower strong-target penetrator. T4 develops its impact; T5 delivers overwhelming damage with the same strong-target focus. Sharp-type exclusions remain.',
        [
          ['Sharper hit', 140, 'Add one damage before specialization.', add('damage', 1)],
          ['Weighted hit', 260, 'Add one more damage as a useful crosspath.', add('damage', 1)],
          [
            'Heavy penetrator',
            850,
            'Replace ordinary shots with slower strong-target penetrators.',
            add('damage', 2),
            add('range', 4),
            strong,
            multiply('intervalSeconds', 1.15),
          ],
          ['Crushing projectile', 3200, 'Double the preceding damage increment.', add('damage', 4)],
          [
            'Ultimate penetrator',
            24000,
            'Triple established penetrator damage while retaining strong-target focus and its cadence cost.',
            multiply('damage', 3),
          ],
        ],
      ),
      path(
        'Timed volley',
        'ability-burst',
        'Short windows of distributed projectile hits',
        'T3 distributes the volley across distinct targets. T4 unlocks a timed self boost; T5 triples damage within the same distributed burst. Downtime remains.',
        [
          [
            'Quick release',
            120,
            'Improve firing rhythm modestly.',
            multiply('intervalSeconds', 0.9),
          ],
          [
            'Steady rhythm',
            250,
            'Improve cadence again for either other main path.',
            multiply('intervalSeconds', 0.85),
          ],
          [
            'Distributed volley',
            900,
            'Replace the single projectile with a volley aimed at distinct targets.',
            add('projectiles', 1),
            distinct,
          ],
          [
            'Focused burst',
            6000,
            'Buy eight seconds of stronger, faster attacks every forty seconds.',
            burst('Focused burst', 8, 40, 0.8),
          ],
          [
            'Overwhelming barrage',
            36000,
            'Triple active distributed-volley damage while preserving its target distribution and downtime.',
            strongerBurst,
          ],
        ],
      ),
      path(
        'Piercing coverage',
        'group-damage',
        'Higher target capacity with detection access',
        'T3 converts the attack to area impact. T4 develops capacity and repeated impact; T5 adds secondary hits beyond the primary hit set. No bounce is granted.',
        [
          ['Extra pierce', 180, 'Add two targets of projectile capacity.', add('pierce', 2)],
          ['Clear sight', 300, 'Gain personal detection and modest reach.', camo, add('range', 4)],
          [
            'Impact coverage',
            950,
            'Convert the projectile into an area impact with increased target capacity.',
            add('pierce', 4),
            deliveryChange('area'),
            add('splashRadius', 5),
          ],
          [
            'Paired penetration',
            4200,
            'Add six capacity and a second projectile, not a spread.',
            add('pierce', 6),
            add('projectiles', 1),
          ],
          [
            'Cascading impacts',
            26000,
            'Triple primary capacity and add six secondary hits against nearby enemies missed by the primary volley.',
            multiply('pierce', 3),
            followUp('Secondary impacts', 6, 14),
          ],
        ],
      ),
    ],
    [
      'Distributed volleys select distinct eligible targets; area impacts and secondary hits do not implement Dart wall ricochet or radial trajectories.',
      'The scalar pierce cap does not model collision geometry; secondary hits acquire distinct nearby targets and never recurse.',
    ],
  ),

  recipe(
    'close-area-control-v2',
    'A short-range area pulse chooses broader crowds, automatic slowing and brief stun, or heavier individual hits. All three paths remain automatic.',
    attack('Close pulse', 350, 'area', 'normal', 1.5, 18, 4, 8),
    'Short reach and slow pulse cadence. No detection. Slow and stun do not affect blimps or bosses.',
    [
      path(
        'Crowd coverage',
        'group-damage',
        'Larger area and greater target capacity',
        'T3 distributes two area pulses across distinct targets. T4 develops their damage and capacity; T5 adds secondary aftershocks. Reach and cadence remain limited.',
        [
          ['Wider capacity', 200, 'Raise the pulse target cap by two.', add('pierce', 2)],
          [
            'Larger pulse',
            320,
            'Add two splash radius without extra damage.',
            add('splashRadius', 2),
          ],
          [
            'Twin area pulses',
            1200,
            'Convert one pulse into two distinct-target area pulses.',
            add('splashRadius', 3),
            add('pierce', 4),
            distinct,
            add('projectiles', 1),
          ],
          [
            'Dense crowd pulse',
            5000,
            'Add one damage and six target capacity.',
            add('damage', 1),
            add('pierce', 6),
          ],
          [
            'Echoing field',
            28000,
            'Triple primary capacity and add six secondary aftershocks against enemies missed by the primary volley.',
            multiply('pierce', 3),
            followUp('Field aftershock', 6, 16),
          ],
        ],
      ),
      path(
        'Automatic hindrance',
        'control',
        'Repeated slowing with a brief impact stun',
        'T3 introduces sustained slowing and brief stun. T4 develops stun and capacity; T5 intensifies the same slowing field. Immune targets remain immune.',
        [
          [
            'Longer pulse reach',
            220,
            'Improve existing pulse reach before specializing in control.',
            add('range', 2),
          ],
          [
            'Regular pulses',
            300,
            'Shorten pulse interval as a useful crosspath.',
            multiply('intervalSeconds', 0.9),
          ],
          [
            'Staggering field',
            1500,
            'Add automatic brief stun while developing sustained slowing.',
            add('slowPercent', 30),
            add('slowSeconds', 1.5),
            add('stunSeconds', 0.1),
          ],
          [
            'Staggering pulse',
            5500,
            'Extend the purchased stun by a quarter second and add four target capacity.',
            add('stunSeconds', 0.25),
            add('pierce', 4),
          ],
          [
            'Crippling field',
            24000,
            'Raise the established field slow from thirty to ninety percent while retaining stun and immunity limits.',
            multiply('slowPercent', 3),
          ],
        ],
      ),
      path(
        'Heavy pulse',
        'direct-damage',
        'High damage per pulse with slower delivery',
        'T3 replaces the broad pulse with focused instant impact and slower cadence. T4 strengthens it; T5 delivers an overwhelming focused impact. No manual ability is granted.',
        [
          ['Stronger pulse', 250, 'Add one damage per target.', add('damage', 1)],
          [
            'Extended pulse reach',
            350,
            'Add four range for either other main path.',
            add('range', 4),
          ],
          [
            'Focused discharge',
            1800,
            'Replace the broad pulse with a concentrated instant impact and a cadence tradeoff.',
            add('damage', 2),
            multiply('intervalSeconds', 1.2),
            deliveryChange('instant'),
            { kind: 'stat', target: 'base', stat: 'splashRadius', operation: 'set', value: 0 },
          ],
          [
            'Power discharge',
            6500,
            'Add four damage while retaining the cadence cost.',
            add('damage', 4),
          ],
          [
            'Ultimate focused impact',
            32000,
            'Triple focused impact damage without restoring the old broad pulse.',
            multiply('damage', 3),
          ],
        ],
      ),
    ],
    [
      'Ninety-percent slow passes the current heuristic but is not a claim of good gameplay balance.',
      'This does not import BTD6 frozen layers, MOAB stun eligibility, vulnerability or radial trajectories.',
    ],
  ),

  recipe(
    'pulsed-energy-pressure-v2',
    'An aimed flame develops area ignition, a timed heavy eruption, or distributed flame volleys. Ultimates add bounded secondary flames; no summoned creature or persistent ground fire is implied.',
    flameAttack(),
    'Energy flames cannot affect Purple enemies. The base is single-target and has no detection. Every attack requires clear delivery; there is no continuous beam or teleport.',
    [
      path(
        'Lingering pressure',
        'direct-damage',
        'Damage over time with modest impact damage',
        'T3 converts aimed flame into an area ignition burst. T4 intensifies its burn; T5 ignites additional nearby enemies with secondary flames. Burn refreshes without stacking.',
        [
          [
            'Hotter impact',
            300,
            'Improve the impact of the existing burning flame.',
            add('damage', 1),
          ],
          [
            'Piercing ignition',
            450,
            'Improve capacity of the existing flame before area specialization.',
            add('pierce', 3),
          ],
          [
            'Ignition burst',
            1600,
            'Replace the aimed flame with an area ignition burst carrying stronger burn.',
            add('burnDamagePerSecond', 2),
            add('burnSeconds', 1),
            deliveryChange('area'),
            add('splashRadius', 6),
          ],
          [
            'Intense burn',
            7000,
            'Raise burn to eight damage per second and impact to three.',
            add('burnDamagePerSecond', 5),
            add('damage', 1),
          ],
          [
            'Spreading ignition',
            34000,
            'Quadruple purchased burn and ignite six nearby enemies missed by the primary volley; secondary flames do not spread again.',
            multiply('burnDamagePerSecond', 4),
            followUp('Secondary ignition', 6, 14, true),
          ],
        ],
      ),
      path(
        'Flame eruption',
        'ability-burst',
        'Heavy flame impacts with personal detection and temporary eruption',
        'T3 converts flame into heavy area impact. T4 unlocks a six-second eruption window; T5 adds secondary flame impacts while active. No new actor is created.',
        [
          ['Long pulse', 200, 'Add six reach without changing delivery.', add('range', 6)],
          ['Personal detection', 400, 'Grant Camo access to this Unit only.', camo],
          [
            'Heavy flame impact',
            2000,
            'Replace the small flame projectile with a heavy area impact.',
            add('damage', 1),
            add('pierce', 1),
            deliveryChange('area'),
            add('splashRadius', 4),
          ],
          [
            'Eruption window',
            7500,
            'Buy six seconds of stronger, faster pulses every thirty seconds.',
            burst('Eruption window', 6, 30, 0.75),
          ],
          [
            'Eruption cascade',
            42000,
            'Triple active damage and add six secondary flame impacts only during the eruption window.',
            strongerBurst,
            followUp('Eruption impacts', 6, 12, true, 'boost'),
          ],
        ],
      ),
      path(
        'Flame barrage',
        'attack-speed',
        'Rapid automatic flames spread across distinct targets',
        'T3 converts the single flame into a distributed volley. T4 accelerates the barrage; T5 adds secondary flame hits after each successful volley. No recursive spreading.',
        [
          [
            'Quick pulse',
            160,
            'Reduce interval by twenty percent.',
            multiply('intervalSeconds', 0.8),
          ],
          [
            'Piercing flame',
            500,
            'Improve target capacity of the existing single flame.',
            add('pierce', 1),
          ],
          [
            'Distributed flames',
            1700,
            'Replace the single aimed flame with rapid flames aimed at distinct targets.',
            multiply('intervalSeconds', 0.7),
            add('projectiles', 1),
            distinct,
          ],
          [
            'Fast rhythm',
            6000,
            'Reduce it by forty percent again.',
            multiply('intervalSeconds', 0.6),
          ],
          [
            'Flame crossfire',
            30000,
            'Triple firing frequency and add four secondary flames against enemies missed by each primary volley.',
            multiply('intervalSeconds', 1 / 3),
            followUp('Crossfire flames', 4, 12, true),
          ],
        ],
      ),
    ],
    [
      'Burn uses the existing strongest-only refresh operator; no separate stacking damage, armor bypass or source-specific fire rules are implied.',
      'Aimed flame, area ignition and secondary flame hits are proposed attack shapes, not a persistent ground hazard or a summoned actor.',
    ],
  ),
  recipe(
    'kinetic-striker-v2',
    'Physical strikes become area shockwaves, distributed combinations, or automatic staggering hits. Ultimates add bounded secondary impacts. Physical impact is not assigned sharp immunity.',
    attack('Kinetic strike', 350, 'instant', 'normal', 1.1, 24, 1),
    'Moderate reach, no Camo detection and initially one target. Control excludes blimps and bosses. Instant delivery still needs a clear path.',
    [
      path(
        'Heavy impact',
        'direct-damage',
        'High per-hit impact with a cadence tradeoff',
        'T3 replaces the strike with a slower area shockwave. T4 develops its impact; T5 adds secondary aftershocks. Detection and reach limits remain.',
        [
          ['Firm impact', 180, 'Add one damage per hit.', add('damage', 1)],
          [
            'Broad strike',
            300,
            'Improve the existing strike capacity before shockwave specialization.',
            add('pierce', 2),
          ],
          [
            'Crushing shockwave',
            1400,
            'Replace the narrow strike with a short-range area shockwave and slower cadence.',
            add('damage', 3),
            multiply('intervalSeconds', 1.15),
            deliveryChange('area'),
            add('splashRadius', 5),
          ],
          [
            'Forceful strike',
            5200,
            'Add five damage to the established heavy hit.',
            add('damage', 5),
          ],
          [
            'Echoing shockwave',
            30000,
            'Triple impact damage and add three secondary aftershock hits beyond the primary hit set.',
            multiply('damage', 3),
            followUp('Impact aftershock', 3, 10),
          ],
        ],
      ),
      path(
        'Timed tempo',
        'ability-burst',
        'Repeated hits during a temporary self boost',
        'T3 distributes a combination across distinct targets. T4 unlocks a tempo window; T5 adds finishing secondary impacts only while active. No autonomous copies.',
        [
          [
            'Quick response',
            150,
            'Shorten attack interval by ten percent.',
            multiply('intervalSeconds', 0.9),
          ],
          [
            'Follow-through capacity',
            350,
            'Add one eligible target of attack capacity.',
            add('pierce', 1),
          ],
          [
            'Distributed combination',
            1700,
            'Replace the single strike with a distinct-target combination.',
            add('projectiles', 1),
            add('range', 2),
            distinct,
          ],
          [
            'Tempo window',
            6500,
            'Buy eight seconds of doubled damage and attack frequency every forty seconds.',
            burst('Tempo window', 8, 40, 0.5),
          ],
          [
            'Finishing combination',
            36000,
            'Triple active frequency and finish each successful active volley with four secondary impacts.',
            {
              kind: 'modifyBoost',
              target: 'base',
              stat: 'intervalMultiplier',
              operation: 'multiply',
              value: 1 / 3,
            },
            followUp('Finishing impacts', 4, 9, false, 'boost'),
          ],
        ],
      ),
      path(
        'Disrupting impact',
        'control',
        'Automatic hindrance of susceptible targets',
        'T3 introduces sustained slowing and brief stun. T4 increases stun and capacity; T5 intensifies the established slowing strike. Boss and blimp immunity remains.',
        [
          [
            'Extended impact',
            240,
            'Improve reach of the existing strike before control specialization.',
            add('range', 2),
          ],
          [
            'Broad follow-through',
            380,
            'Improve target capacity of the existing strike.',
            add('pierce', 1),
          ],
          [
            'Staggering strike',
            1800,
            'Add a brief stun to the established slowing strike.',
            add('slowPercent', 20),
            add('slowSeconds', 1.2),
            add('stunSeconds', 0.1),
          ],
          [
            'Staggering impact',
            6000,
            'Extend the purchased stun by two tenths of a second and add two targets of capacity.',
            add('stunSeconds', 0.2),
            add('pierce', 2),
          ],
          [
            'Crippling strike',
            26000,
            'Triple the established slow strength while retaining the staggering strike and target immunities.',
            multiply('slowPercent', 3),
          ],
        ],
      ),
    ],
    [
      'Normal damage is an explicit adaptation choice, not a claim that every physical technique bypasses all source protections.',
      'Instant delivery, target capacity and repeated hits do not implement attached limbs, grappling, knockback or movement.',
    ],
  ),
  recipe(
    'pulsed-energy-impact-v2',
    'A direct energy pulse develops concentrated area blasts, a timed distributed barrage, or broad area discharge. Capstones deepen impact or add bounded secondary energy hits. No burn, slow, stun, detection or independent actors.',
    attack('Energy strike', 400, 'beam', 'energy', 1.1, 34, 2),
    'Energy cannot affect Purple enemies. No Camo detection or control. Every pulse needs clear delivery; the beam is a repeating attack rather than a continuous sweep.',
    [
      path(
        'Heavy energy impact',
        'direct-damage',
        'Strong individual energy hits with modest reach',
        'T3 replaces the narrow pulse with an area-impact blast. T4 doubles impact; T5 delivers overwhelming damage through the same blast. Detection and energy-type exclusions remain.',
        [
          [
            'Stronger pulse',
            180,
            'Add one damage per hit before specialization.',
            add('damage', 1),
          ],
          [
            'Extended pulse',
            280,
            'Add four range as a useful crosspath improvement.',
            add('range', 4),
          ],
          [
            'Concentrated blast',
            1300,
            'Replace the narrow pulse with a concentrated area-impact energy blast.',
            add('damage', 2),
            add('range', 6),
            deliveryChange('area'),
            add('splashRadius', 5),
          ],
          [
            'Forceful pulse',
            4800,
            'Add four damage to the established heavy hit.',
            add('damage', 4),
          ],
          [
            'Overwhelming blast',
            28000,
            'Triple the concentrated blast impact without adding burn or an unrelated attack.',
            multiply('damage', 3),
          ],
        ],
      ),
      path(
        'Timed energy burst',
        'ability-burst',
        'Paired energy hits with a temporary self boost',
        'T3 converts the single energy pulse into a distributed volley. T4 unlocks an eight-second window; T5 adds secondary energy hits only while active. Recharge remains.',
        [
          [
            'Quick emission',
            150,
            'Shorten attack interval by ten percent.',
            multiply('intervalSeconds', 0.9),
          ],
          [
            'Piercing emission',
            450,
            'Improve target capacity of the existing single pulse.',
            add('pierce', 1),
          ],
          [
            'Distributed energy volley',
            1500,
            'Convert the single energy pulse into a distinct-target volley.',
            add('damage', 1),
            multiply('intervalSeconds', 0.8),
            add('projectiles', 1),
            distinct,
          ],
          [
            'Energy window',
            6200,
            'Buy eight seconds of stronger, faster energy hits every forty seconds.',
            burst('Energy window', 8, 40, 0.8),
          ],
          [
            'Cascading energy barrage',
            35000,
            'Triple active damage and add five secondary energy hits only during the burst window.',
            strongerBurst,
            followUp('Barrage echoes', 5, 12, false, 'boost'),
          ],
        ],
      ),
      path(
        'Multi-target energy',
        'group-damage',
        'Higher target capacity without explosions or branching',
        'T3 replaces the narrow beam with area discharge. T4 develops capacity and reach; T5 adds a secondary pulse beyond the primary hit set. No bounce or homing.',
        [
          [
            'Extra capacity',
            200,
            'Add two eligible targets of capacity per pulse.',
            add('pierce', 2),
          ],
          [
            'Greater capacity',
            360,
            'Add two more targets as a useful crosspath.',
            add('pierce', 2),
          ],
          [
            'Broad discharge',
            1100,
            'Replace the narrow beam with an area energy discharge.',
            add('pierce', 4),
            deliveryChange('area'),
            add('splashRadius', 7),
          ],
          [
            'High-capacity pulse',
            4500,
            'Add eight targets of capacity and four range.',
            add('pierce', 8),
            add('range', 4),
          ],
          [
            'Echoing discharge',
            30000,
            'Triple primary capacity and add six secondary energy hits against nearby enemies missed by the discharge.',
            multiply('pierce', 3),
            followUp('Discharge echoes', 6, 16),
          ],
        ],
      ),
    ],
    [
      'Progression borrows numeric attack development from Wizard Arcane upgrades, early stat choices from Dart, and a timed self-boost pattern from Boomerang Turbo Charge. These are design patterns, not copied combat stats or canon upgrade sequences.',
      'Proposed prices and damage remain unbalanced. Scalar pulse capacity does not establish collision geometry, a continuous beam, a charged projectile, gathering external energy or source-specific transformations.',
    ],
  ),
]);
