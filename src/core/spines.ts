import type { Attack } from './mechanics/schemas.js';
import type { pathSpecializations } from './mechanics/schemas.js';

export type Specialization = (typeof pathSpecializations)[number];

/** Five-line character summary built from the name alone. No network, no canon claims. */
export interface TropePacket {
  archetype: string;
  attackShape: string;
  quirk: string;
  strength: string;
  weakness: string;
  work: string;
}

export interface SpinePathTemplate {
  specialization: Specialization;
  theme: string;
  rationale: string;
  tierCosts: [number, number, number, number, number];
  guidance: string;
}

export interface Spine {
  id: string;
  label: string;
  baseCost: number;
  base: Omit<Attack, 'name' | 'cost'>;
  paths: [SpinePathTemplate, SpinePathTemplate, SpinePathTemplate];
}

const sharp = (
  damage: number,
  intervalSeconds: number,
  range: number,
  pierce: number,
  extra: Partial<Attack['stats']> = {},
): Omit<Attack, 'name' | 'cost'> => ({
  delivery: 'projectile',
  damageType: 'sharp',
  targeting: 'first',
  camo: false,
  stats: {
    damage,
    intervalSeconds,
    range,
    pierce,
    projectiles: 1,
    splashRadius: 0,
    slowPercent: 0,
    slowSeconds: 0,
    burnDamagePerSecond: 0,
    burnSeconds: 0,
    stunSeconds: 0,
    ...extra,
  },
});

const boostLine =
  'T4 unlocks the manual boost with a positive duration below its cooldown. T5 modifies that boost and must raise peak output or uptime, not duty fraction alone.';

export const spines: Spine[] = [
  {
    id: 'aimed',
    label: 'cheap aimed projectile with three careers',
    baseCost: 200,
    base: sharp(1, 0.95, 32, 2),
    paths: [
      {
        specialization: 'group-damage',
        theme: 'Piercing shots that reach grouped enemies',
        rationale: 'Rewards placement on lanes where one shot can pass through several targets.',
        tierCosts: [140, 200, 320, 1800, 15000],
        guidance:
          'T1 and T2 add pierce. T3 switches to a distinct-target volley. T4 raises damage and volley count. T5 adds a bounded follow-up or a larger volley.',
      },
      {
        specialization: 'ability-burst',
        theme: 'Scheduled burst fire on a manual timer',
        rationale: 'Gives the player one timed window to clear a dense wave.',
        tierCosts: [140, 200, 400, 2500, 16000],
        guidance:
          'T1 and T2 shorten the attack interval. T3 adds projectiles aimed at the same target. ' +
          boostLine,
      },
      {
        specialization: 'range',
        theme: 'Long reach and clean hits on evasive targets',
        rationale: 'Answers camo and range pressure while staying single target.',
        tierCosts: [140, 200, 350, 2000, 14000],
        guidance:
          'T1 adds range. T2 adds range and personal camo detection. T3 raises damage and range. T4 and T5 raise damage, interval and camo-limited pierce.',
      },
    ],
  },
  {
    id: 'chain',
    label: 'curved projectile that chains between targets',
    baseCost: 315,
    base: sharp(1, 1.2, 43, 4),
    paths: [
      {
        specialization: 'group-damage',
        theme: 'Chaining hits across clustered enemies',
        rationale: 'Pays off against groups and rewards bends in the track.',
        tierCosts: [200, 280, 600, 2000, 32500],
        guidance:
          'T1 and T2 add pierce. T3 switches to a distinct-target volley. T4 adds a bounded follow-up. T5 raises follow-up count, radius and damage.',
      },
      {
        specialization: 'ability-burst',
        theme: 'Overdrive attack speed on a manual timer',
        rationale: 'Turns steady output into a scheduled spike for heavy waves.',
        tierCosts: [200, 280, 700, 2800, 30000],
        guidance:
          'T1 and T2 shorten the attack interval. T3 adds damage against tough targets. ' +
          boostLine,
      },
      {
        specialization: 'control',
        theme: 'Heavy hits that stall tough targets',
        rationale: 'Trades group coverage for slow and stun pressure on strong enemies.',
        tierCosts: [200, 280, 650, 2400, 28000],
        guidance:
          'T1 and T2 add damage and pierce. T3 adds slow with both percent and duration. T4 adds stun. T5 extends stun and slow coverage.',
      },
    ],
  },
  {
    id: 'heavy',
    label: 'slow explosive area attack',
    baseCost: 525,
    base: {
      delivery: 'projectile',
      damageType: 'explosive',
      targeting: 'close',
      camo: false,
      stats: {
        damage: 2,
        intervalSeconds: 2.2,
        range: 40,
        pierce: 8,
        projectiles: 1,
        splashRadius: 8,
        slowPercent: 0,
        slowSeconds: 0,
        burnDamagePerSecond: 0,
        burnSeconds: 0,
        stunSeconds: 0,
      },
    },
    paths: [
      {
        specialization: 'group-damage',
        theme: 'Wider blasts for dense waves',
        rationale: 'Covers grouped enemies while staying slow and readable.',
        tierCosts: [300, 400, 800, 3200, 35000],
        guidance:
          'T1 and T2 widen splash and pierce. T3 raises damage and splash together. T4 adds burn with damage and duration. T5 extends burn and splash.',
      },
      {
        specialization: 'ability-burst',
        theme: 'Timed bombardment on a manual timer',
        rationale: 'Concentrates slow area damage into a player chosen window.',
        tierCosts: [300, 400, 900, 4000, 38000],
        guidance:
          'T1 and T2 shorten the attack interval. T3 adds projectiles aimed at the same target. ' +
          boostLine,
      },
      {
        specialization: 'control',
        theme: 'Concussive blasts that stall strong targets',
        rationale: 'Answers tough enemies the area path splashes without stopping.',
        tierCosts: [300, 400, 850, 3600, 34000],
        guidance:
          'T1 and T2 add damage and pierce. T3 adds stun. T4 extends stun and adds slow with percent and duration. T5 widens stun coverage.',
      },
    ],
  },
  {
    id: 'deadeye',
    label: 'long range single shot with map wide sight',
    baseCost: 350,
    base: sharp(2, 1.8, 90, 1),
    paths: [
      {
        specialization: 'direct-damage',
        theme: 'Heavy precise hits on priority targets',
        rationale: 'Kills strong single targets at any range while staying single target.',
        tierCosts: [250, 350, 900, 4500, 40000],
        guidance:
          'T1 and T2 add damage. T3 raises damage further. T4 adds stun against tough targets. T5 adds a damage amplification window through higher peak damage.',
      },
      {
        specialization: 'ability-burst',
        theme: 'Rapid fire discipline on a manual timer',
        rationale: 'Trades precision for a scheduled stream of shots.',
        tierCosts: [250, 350, 1000, 5000, 42000],
        guidance:
          'T1 shortens the attack interval. T2 adds personal camo detection. T3 shortens the interval further. ' +
          boostLine,
      },
      {
        specialization: 'group-damage',
        theme: 'Shots that fragment onto nearby enemies',
        rationale: 'Gives the lone marksman a group answer without moving the tower.',
        tierCosts: [250, 350, 950, 4800, 41000],
        guidance:
          'T1 adds damage and pierce. T2 adds personal camo detection. T3 adds a bounded follow-up. T4 and T5 raise follow-up count and damage.',
      },
    ],
  },
  {
    id: 'element',
    label: 'energy bolt with lingering burn',
    baseCost: 400,
    base: {
      delivery: 'projectile',
      damageType: 'energy',
      targeting: 'first',
      camo: false,
      stats: {
        damage: 1,
        intervalSeconds: 1.1,
        range: 38,
        pierce: 3,
        projectiles: 1,
        splashRadius: 0,
        slowPercent: 0,
        slowSeconds: 0,
        burnDamagePerSecond: 1,
        burnSeconds: 2,
        stunSeconds: 0,
      },
    },
    paths: [
      {
        specialization: 'group-damage',
        theme: 'Spreading flames across the wave',
        rationale: 'Burn ticks punish groups that outrun the direct hit.',
        tierCosts: [250, 350, 700, 3000, 33000],
        guidance:
          'T1 and T2 raise burn damage and duration. T3 switches to a distinct-target volley. T4 raises volley count and burn. T5 adds a bounded follow-up with inherited burn.',
      },
      {
        specialization: 'ability-burst',
        theme: 'Unleashed channel on a manual timer',
        rationale: 'Converts steady pressure into a scheduled burn spike.',
        tierCosts: [250, 350, 800, 3800, 36000],
        guidance: 'T1 and T2 shorten the attack interval. T3 raises burn and damage. ' + boostLine,
      },
      {
        specialization: 'control',
        theme: 'Crippling heat that slows the push',
        rationale: 'Holds enemies inside the burn instead of chasing raw damage.',
        tierCosts: [250, 350, 750, 3400, 32000],
        guidance:
          'T1 adds range and pierce. T2 adds personal camo detection. T3 adds slow with percent and duration. T4 adds stun. T5 extends control coverage.',
      },
    ],
  },
  {
    id: 'ward',
    label: 'control first attack that stalls the wave',
    baseCost: 300,
    base: sharp(1, 1.0, 30, 3, { slowPercent: 30, slowSeconds: 1 }),
    paths: [
      {
        specialization: 'control',
        theme: 'Deepening stall on everything touched',
        rationale: 'Buys time for allied attackers; never becomes raw damage.',
        tierCosts: [200, 260, 550, 2600, 26000],
        guidance:
          'T1 and T2 raise slow percent and duration. T3 widens pierce and slow. T4 adds stun. T5 extends stun and slow coverage.',
      },
      {
        specialization: 'ability-burst',
        theme: 'Total lockdown on a manual timer',
        rationale: 'One scheduled window where nothing advances.',
        tierCosts: [200, 260, 600, 3200, 30000],
        guidance: 'T1 and T2 shorten the attack interval. T3 adds damage and pierce. ' + boostLine,
      },
      {
        specialization: 'group-damage',
        theme: 'Chilling spread across clustered enemies',
        rationale: 'Pairs the stall with modest area damage for groups.',
        tierCosts: [200, 260, 580, 2800, 27000],
        guidance:
          'T1 and T2 add damage and pierce. T3 adds splash with pierce of at least 2. T4 raises splash and damage. T5 extends splash and slow.',
      },
    ],
  },
];

interface KeywordRule {
  match: RegExp;
  archetype: string;
  attackShape: string;
  quirk: string;
  strength: string;
  weakness: string;
  spine: string;
}

const rules: KeywordRule[] = [
  {
    match: /flam|fire|pyro|blaze|inferno|torch|ember|magma|lava/,
    archetype: 'fire wielder',
    attackShape: 'energy bolt with lingering burn',
    quirk: 'burn keeps hurting after the hit',
    strength: 'pressure on grouped enemies over time',
    weakness: 'short reach and weak instant hits',
    spine: 'element',
  },
  {
    match: /frost|ice|glacier|blizzard|snow|winter/,
    archetype: 'frost wielder',
    attackShape: 'chilling projectile that slows',
    quirk: 'chill stalls what it touches',
    strength: 'stalling fast groups for allies',
    weakness: 'low direct damage',
    spine: 'ward',
  },
  {
    match: /lightning|thunder|storm|volt|electro|railgun/,
    archetype: 'storm caller',
    attackShape: 'fast energy strike with chaining sparks',
    quirk: 'sparks jump to nearby targets',
    strength: 'burst against clustered enemies',
    weakness: 'falls off against single tough targets',
    spine: 'chain',
  },
  {
    match: /shadow|assassin|ninja|sniper|eye|hawk|sight|deadeye|rifle|gunslinger/,
    archetype: 'deadeye',
    attackShape: 'long range single shot',
    quirk: 'sees across the map',
    strength: 'killing priority targets at any distance',
    weakness: 'no group coverage',
    spine: 'deadeye',
  },
  {
    match:
      /bomb|blast|cannon|mortar|tank|buster|wrecker|juggernaut|titan|giant|colossus|quake|meteor/,
    archetype: 'siege brute',
    attackShape: 'slow explosive area attack',
    quirk: 'every hit shakes the ground',
    strength: 'clearing dense waves',
    weakness: 'slow shots and weak precision',
    spine: 'heavy',
  },
  {
    match: /wind|blade|dancer|boomerang|ricochet|chain|whip|stretch|elastic|dance/,
    archetype: 'skirmisher',
    attackShape: 'curved projectile that chains between targets',
    quirk: 'shots bend toward the next target',
    strength: 'coverage on bends and clusters',
    weakness: 'weak against spread out tough targets',
    spine: 'chain',
  },
  {
    match: /time|clock|chrono|trap|warden|guardian|wall|shield|frostbite|slow/,
    archetype: 'warden',
    attackShape: 'control first attack that stalls the wave',
    quirk: 'enemies slow down around it',
    strength: 'buying time for allied attackers',
    weakness: 'depends on allies for kills',
    spine: 'ward',
  },
  {
    match: /mage|wizard|witch|sorcer|spell|arcane|curse|demon|dragon|spirit|ghost|phoenix|star/,
    archetype: 'spellcaster',
    attackShape: 'energy bolt with lingering burn',
    quirk: 'spells linger after impact',
    strength: 'scaling damage over long fights',
    weakness: 'fragile positioning and modest reach',
    spine: 'element',
  },
  {
    match: /pirate|monkey|goku|gokuu|luffy|naruto|ichigo|slayer|pirat/,
    archetype: 'brawler',
    attackShape: 'cheap aimed projectile',
    quirk: 'straightforward hits that keep coming',
    strength: 'reliable early damage anywhere',
    weakness: 'no built in answer to camo or crowds',
    spine: 'aimed',
  },
];

/** Build the five-line trope packet from the name alone. Keywords are hints, not canon. */
export function tropePacketForName(name: string): TropePacket {
  const lowered = name.toLowerCase();
  const rule = rules.find((entry) => entry.match.test(lowered));
  if (rule)
    return {
      archetype: rule.archetype,
      attackShape: rule.attackShape,
      quirk: rule.quirk,
      strength: rule.strength,
      weakness: rule.weakness,
      work: 'Unspecified source work',
    };
  return {
    archetype: 'brawler',
    attackShape: 'cheap aimed projectile',
    quirk: 'straightforward hits that keep coming',
    strength: 'reliable early damage anywhere',
    weakness: 'no built in answer to camo or crowds',
    work: 'Unspecified source work',
  };
}

/** Pick the spine whose base loop fits the trope packet. Pure lookup, no model call. */
export function pickSpine(trope: TropePacket): Spine {
  const shape = trope.attackShape;
  const wanted = shape.includes('burn')
    ? 'element'
    : shape.includes('chain') || shape.includes('curved') || shape.includes('bend')
      ? 'chain'
      : shape.includes('explosive') || shape.includes('area')
        ? 'heavy'
        : shape.includes('long range')
          ? 'deadeye'
          : shape.includes('stall') || shape.includes('slow') || shape.includes('control')
            ? 'ward'
            : 'aimed';
  const spine = spines.find((entry) => entry.id === wanted);
  if (!spine) throw new Error(`Unknown spine ${wanted}.`);
  return spine;
}

/** Verbatim trope document lines. Quotes in the blueprint cite these exact lines. */
export function tropeDocumentText(name: string, trope: TropePacket, spine: Spine): string {
  return [
    `Trope: ${name} reads as a ${trope.archetype} known for ${trope.attackShape}.`,
    `Signature quirk: ${trope.quirk}.`,
    `Strength in play: ${trope.strength}.`,
    `Weakness in play: ${trope.weakness}.`,
    `Spine: ${spine.label}; keep the base ${trope.attackShape} readable at every tier.`,
  ].join('\n');
}
