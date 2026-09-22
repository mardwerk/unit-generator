import {
  pathKeys,
  tierKeys,
  type Attack,
  type BuildSelection,
  type MechanicsIssue,
  type UnitBlueprint,
} from './schemas.js';
import { resolveUnchecked } from './resolve.js';

export interface WaveSpec {
  id: string;
  count: number;
  hp: number;
  speed: number;
  spacing: number;
  camo: boolean;
  lead: boolean;
}

/** Reference waves. Fixed contract for usefulness gates, not a balance model. */
export const referenceWaves: WaveSpec[] = [
  { id: 'stream', count: 20, hp: 1, speed: 10, spacing: 6, camo: false, lead: false },
  { id: 'horde', count: 80, hp: 2, speed: 12, spacing: 1.2, camo: false, lead: false },
  { id: 'tough', count: 6, hp: 25, speed: 6, spacing: 15, camo: false, lead: false },
  { id: 'fast', count: 20, hp: 3, speed: 22, spacing: 5, camo: false, lead: false },
  { id: 'lead', count: 12, hp: 6, speed: 7, spacing: 6, camo: false, lead: true },
  { id: 'camo', count: 12, hp: 2, speed: 9, spacing: 5, camo: true, lead: false },
  { id: 'siege', count: 3, hp: 80, speed: 5, spacing: 20, camo: false, lead: false },
  { id: 'titan', count: 1, hp: 400, speed: 4, spacing: 0, camo: false, lead: false },
];

export interface WaveResult {
  wave: string;
  kills: number;
  leaked: number;
  shots: number;
  /** Time of the last kill. -1 when nothing dies. Faster clears are real value. */
  time: number;
}

export interface ActiveAbility {
  boostedAttack: Attack;
  durationSeconds: number;
  cooldownSeconds: number;
}

const laneLength = 120;
const towerOffset = 24;
const maxAttacks = 20000;

function slowFactor(attack: Attack): number {
  const s = attack.stats;
  const interval = Math.max(s.intervalSeconds, 0.001);
  const slow = 1 - (s.slowPercent / 100) * Math.min(1, s.slowSeconds / interval);
  const stun = 1 - Math.min(0.9, s.stunSeconds / interval);
  return Math.max(0.05, slow * stun);
}

function reachOf(attack: Attack): number {
  return Math.sqrt(Math.max(0, attack.stats.range ** 2 - towerOffset ** 2));
}

/**
 * Straight lane, fixed placement, coordinated active cycling, slow applied
 * from the first attack. Deterministic simplifications, documented here.
 */
export function simulateWave(
  base: Attack,
  ability: ActiveAbility | null,
  wave: WaveSpec,
): WaveResult {
  const current = (t: number): Attack => {
    if (!ability) return base;
    return t % ability.cooldownSeconds < ability.durationSeconds ? ability.boostedAttack : base;
  };
  const factor = slowFactor(ability?.boostedAttack ?? base);
  const hp = new Array<number>(wave.count).fill(wave.hp);
  const dead = new Array<boolean>(wave.count).fill(false);
  let kills = 0;
  let shots = 0;
  let lastKill = -1;
  const horizon =
    ((wave.count - 1) * wave.spacing) / wave.speed + laneLength / (wave.speed * factor);
  for (let k = 0; k < maxAttacks; k++) {
    const t = k * base.stats.intervalSeconds;
    if (t > horizon) break;
    const cur = current(t);
    const reach = reachOf(cur);
    const alive: number[] = [];
    for (let i = 0; i < wave.count; i++) {
      if (dead[i]) continue;
      const travel = (t - (i * wave.spacing) / wave.speed) * wave.speed * factor;
      if (travel < 0 || travel > laneLength) continue;
      if (Math.abs(travel - laneLength / 2) > reach) continue;
      if (wave.camo && !cur.camo) continue;
      alive.push(i);
    }
    // Attacks fire on cadence even with no target, matching an automatic loop.
    shots++;
    if (!alive.length) continue;
    const hit = (index: number, damage: number) => {
      if (dead[index]) return;
      if (wave.lead && cur.damageType === 'sharp') return;
      hp[index]! -= damage;
      if (hp[index]! <= 0) {
        dead[index] = true;
        kills++;
        lastKill = t;
      }
    };
    const s = cur.stats;
    const burnBonus = s.burnDamagePerSecond * Math.min(s.burnSeconds, s.intervalSeconds);
    const splashExtra = s.splashRadius > 0 ? Math.floor(s.pierce / 2) : 0;
    const snapshot = (): number[] => alive.filter((i) => !dead[i]);
    const strikeFrom = (start: number) => {
      const order = snapshot();
      const from = order.indexOf(start);
      const chain = from >= 0 ? [...order.slice(from), ...order.slice(0, from)] : order;
      let hits = 0;
      for (const i of chain) {
        if (hits >= s.pierce) break;
        if (dead[i]) continue;
        hit(i, s.damage + (hits === 0 ? burnBonus : 0));
        hits++;
      }
      for (let h = 0; h < splashExtra; h++) {
        const target = snapshot()[0];
        if (target === undefined) break;
        hit(target, s.damage / 2);
      }
    };
    if (cur.distribution === 'distinct-targets') {
      for (let j = 0; j < s.projectiles; j++) {
        const start = snapshot()[j] ?? snapshot()[0];
        if (start === undefined) break;
        strikeFrom(start);
      }
    } else {
      const primary = snapshot()[0];
      if (primary !== undefined) for (let j = 0; j < s.projectiles; j++) strikeFrom(primary);
    }
  }
  return { wave: wave.id, kills, leaked: wave.count - kills, shots, time: lastKill };
}

function abilityOf(blueprint: UnitBlueprint, selection: BuildSelection): ActiveAbility | null {
  const build = resolveUnchecked(blueprint, selection);
  const first = build.abilities[0];
  if (!first) return null;
  const { boostedAttack, durationSeconds, cooldownSeconds } = first;
  return { boostedAttack, durationSeconds, cooldownSeconds };
}

/** Kills per reference wave for one resolved build. */
export function killsByWave(blueprint: UnitBlueprint, selection: BuildSelection): WaveResult[] {
  const build = resolveUnchecked(blueprint, selection);
  const ability = abilityOf(blueprint, selection);
  return referenceWaves.map((wave) => simulateWave(build.baseAttack, ability, wave));
}

/** Minimum useful follow-up radius. Below this a secondary hit is noise on 30-plus ranges. */
// ponytail: fixed threshold, raise it when maps or ranges change what counts as coverage.
export const minUsefulFollowUpRadius = 4;

function pureSelection(pathIndex: number, tier: number): BuildSelection {
  const selection: BuildSelection = [0, 0, 0];
  selection[pathIndex] = tier;
  return selection;
}

/** Usefulness gates: every paid tier must add kills somewhere; follow-ups must matter. */
export function usefulnessIssues(blueprint: UnitBlueprint): MechanicsIssue[] {
  const issues: MechanicsIssue[] = [];
  const kills = new Map<string, number[]>();
  const times = new Map<string, number[]>();
  const key = (pathIndex: number, tier: number) => `${pathIndex}-${tier}`;
  for (let pathIndex = 0; pathIndex < 3; pathIndex++)
    for (let tier = 0; tier <= 5; tier++) {
      const results = killsByWave(blueprint, pureSelection(pathIndex, tier));
      kills.set(
        key(pathIndex, tier),
        results.map((r) => r.kills),
      );
      times.set(
        key(pathIndex, tier),
        results.map((r) => r.time),
      );
    }
  const baseKills = [0, 1, 2].map((pathIndex) => kills.get(key(pathIndex, 0))!);
  if (baseKills.every((row) => row.every((k) => k === 0)))
    issues.push({
      path: 'baseAttack',
      message:
        'The base attack kills nothing on any reference wave. Establish a working base loop.',
    });
  pathKeys.forEach((path, pathIndex) => {
    // Tiers 1 and 2 are affordable foundations judged by distinctness and the
    // paths they unlock. Tiers 3 and up must move the needle in combat.
    const burstHint =
      blueprint.paths[path].specialization === 'ability-burst'
        ? ' On a burst path whose peak already clears, longer active duration or shorter cooldown adds uptime; peak damage alone shows nothing.'
        : '';
    for (let tier = 3; tier <= 5; tier++) {
      const before = kills.get(key(pathIndex, tier - 1))!;
      const after = kills.get(key(pathIndex, tier))!;
      const beforeTime = times.get(key(pathIndex, tier - 1))!;
      const afterTime = times.get(key(pathIndex, tier))!;
      const gains = after.some(
        (k, i) => k > before[i]! || (k === before[i] && k > 0 && afterTime[i]! < beforeTime[i]!),
      );
      if (!gains)
        issues.push({
          path: `paths.${path}.tiers.${tierKeys[tier - 1]}`,
          message: `Tier ${tier} kills no more enemies, no faster, than the previous tier on any reference wave. Add combat value; a price alone is not an upgrade.${burstHint}`,
        });
    }
  });
  const checkRadius = (where: string, radius: number | undefined) => {
    if (radius !== undefined && radius < minUsefulFollowUpRadius)
      issues.push({
        path: where,
        message: `Follow-up radius ${radius} is below the useful minimum of ${minUsefulFollowUpRadius} map units. Secondary hits must reach beyond the primary impact.`,
      });
  };
  if (blueprint.baseAttack.followUp)
    checkRadius('baseAttack.followUp', blueprint.baseAttack.followUp.radius);
  pathKeys.forEach((path) => {
    const branch = blueprint.paths[path];
    tierKeys.forEach((tierKey) => {
      branch.tiers[tierKey].changes.forEach((change, index) => {
        if (change.kind === 'followUp')
          checkRadius(`paths.${path}.tiers.${tierKey}.changes.${index}`, change.value.radius);
      });
    });
  });
  return issues;
}
