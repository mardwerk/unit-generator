import type { UnitCandidate } from '../core/index.js';
import {
  resolveBuild,
  pathKeys,
  statKeys,
  boostStatKeys,
  tierKeys,
  type MechanicsDefinition,
  type BuildSelection,
  type Attack,
} from '../core/mechanics/index.js';

export const statLabels = {
  damage: 'Damage',
  intervalSeconds: 'Attack interval',
  range: 'Range',
  pierce: 'Targets per hit',
  projectiles: 'Hits per attack',
  splashRadius: 'Splash radius',
  slowPercent: 'Slow',
  slowSeconds: 'Slow duration',
  burnDamagePerSecond: 'Burn damage per second',
  burnSeconds: 'Burn duration',
  stunSeconds: 'Stun duration',
  durationSeconds: 'Active duration',
  cooldownSeconds: 'Cooldown',
  damageMultiplier: 'Active damage multiplier',
  intervalMultiplier: 'Active interval multiplier',
  rangeBonus: 'Active range bonus',
  camo: 'Camo detection',
  delivery: 'Delivery',
  damageType: 'Damage type',
  targeting: 'Targeting',
  ability: 'Manual ability',
  distribution: 'Volley targets',
  followUp: 'Secondary attack',
  activeFollowUp: 'During activation',
} as const;
export type StatKey = keyof typeof statLabels;
export type StatChange = {
  key: StatKey;
  before?: number | string;
  after: number | string;
  improvement?: boolean;
};
export type TierStats = { cost: number; changes: StatChange[] };
export type KitStats = { base: Attack; tiers: Map<string, TierStats> };
export const tierStatKey = (pathId: string, tier: number) => `${pathId}:${tier}`;

/** Only resolved mechanics supply numbers. Legacy or invalid drafts keep their authored prose. */
export function kitStats(
  candidate: UnitCandidate,
  definition?: MechanicsDefinition,
): KitStats | undefined {
  if (!candidate.blueprint) return;
  const blueprint = candidate.blueprint;
  try {
    const base = resolveBuild(blueprint, [0, 0, 0], definition).baseAttack;
    const tiers = new Map<string, TierStats>();
    pathKeys.forEach((path, index) => {
      const pathId = `path-${index + 1}`;
      if (!candidate.paths.some((entry) => entry.id === pathId)) return;
      const selection = (tier: number): BuildSelection => [
        index === 0 ? tier : 0,
        index === 1 ? tier : 0,
        index === 2 ? tier : 0,
      ];
      let before = resolveBuild(blueprint, selection(0), definition);
      tierKeys.forEach((tierKey, tierIndex) => {
        const after = resolveBuild(blueprint, selection(tierIndex + 1), definition);
        const changes: StatChange[] = [];
        for (const key of statKeys) {
          const prior = before.baseAttack.stats[key];
          const next = after.baseAttack.stats[key];
          if (prior !== next)
            changes.push({
              key,
              before: prior,
              after: next,
              improvement: key === 'intervalSeconds' ? next < prior : next > prior,
            });
        }
        for (const key of ['camo', 'delivery', 'damageType', 'targeting'] as const) {
          const prior = before.baseAttack[key];
          const next = after.baseAttack[key];
          if (prior !== next)
            changes.push({
              key,
              before: typeof prior === 'boolean' ? (prior ? 'Yes' : 'No') : prior,
              after: typeof next === 'boolean' ? (next ? 'Yes' : 'No') : next,
            });
        }
        const priorBoost = before.abilities[0];
        const nextBoost = after.abilities[0];
        if (before.baseAttack.distribution !== after.baseAttack.distribution)
          changes.push({
            key: 'distribution',
            before:
              before.baseAttack.distribution === 'distinct-targets'
                ? 'Distinct enemies'
                : 'Same enemy',
            after:
              after.baseAttack.distribution === 'distinct-targets'
                ? 'Distinct enemies'
                : 'Same enemy',
          });
        for (const [key, prior, next] of [
          ['followUp', before.baseAttack.followUp, after.baseAttack.followUp],
          ['activeFollowUp', priorBoost?.boostedAttack.followUp, nextBoost?.boostedAttack.followUp],
        ] as const) {
          if (
            next &&
            JSON.stringify(prior) !== JSON.stringify(next) &&
            !(
              key === 'activeFollowUp' &&
              JSON.stringify(next) === JSON.stringify(after.baseAttack.followUp)
            )
          )
            changes.push({
              key,
              ...(prior ? { before: `${prior.count} nearby hits ×${prior.damageMultiplier}` } : {}),
              after: `${next.count} nearby hits ×${next.damageMultiplier}; ${next.radius} range${next.inheritStatuses ? '; carries status effects' : ''}`,
            });
        }
        if (nextBoost && !priorBoost) changes.push({ key: 'ability', after: nextBoost.name });
        if (nextBoost)
          for (const key of boostStatKeys) {
            if (!priorBoost || priorBoost[key] !== nextBoost[key])
              changes.push({
                key,
                ...(priorBoost ? { before: priorBoost[key] } : {}),
                after: nextBoost[key],
                ...(priorBoost
                  ? {
                      improvement:
                        key === 'intervalMultiplier' || key === 'cooldownSeconds'
                          ? nextBoost[key] < priorBoost[key]
                          : nextBoost[key] > priorBoost[key],
                    }
                  : {}),
              });
          }
        tiers.set(tierStatKey(pathId, tierIndex + 1), {
          cost: blueprint.paths[path].tiers[tierKey].cost,
          changes,
        });
        before = after;
      });
    });
    return { base, tiers };
  } catch {
    return undefined;
  }
}

export function statValue(key: StatKey, value: string | number): string {
  if (typeof value === 'string') return value;
  const number = Number(value.toFixed(4)).toString();
  if (key.endsWith('Seconds')) return `${number} s`;
  if (key === 'slowPercent') return `${number}%`;
  if (key.endsWith('Multiplier')) return `×${number}`;
  return number;
}
