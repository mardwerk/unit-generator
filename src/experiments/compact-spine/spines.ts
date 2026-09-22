import { freeze } from '../../core/prepare.js';
import type { Attack } from '../../core/mechanics/schemas.js';
import type { pathSpecializations } from '../../core/mechanics/schemas.js';

export type Specialization = (typeof pathSpecializations)[number];

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

/** Prescribed numerical recipe hints, selected explicitly by the caller. Not source facts or governing rules. */
export const spines: readonly Spine[] = freeze([
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
]);
