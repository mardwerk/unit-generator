import {
  ArrowRight,
  Coins,
  Crosshair,
  Timer,
  Sword,
  Target,
  Layers,
  Expand,
  Snowflake,
  Flame,
  Zap,
  Eye,
  Sparkles,
  MoveUpRight,
  type LucideIcon,
} from 'lucide-react';
import type { StatChange } from './contract.js';

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

export function statValue(key: StatKey, value: string | number): string {
  if (typeof value === 'string') return value;
  const number = Number(value.toFixed(4)).toString();
  if (key.endsWith('Seconds')) return `${number} s`;
  if (key === 'slowPercent') return `${number}%`;
  if (key.endsWith('Multiplier')) return `×${number}`;
  return number;
}

const icons: Record<StatKey, LucideIcon> = {
  damage: Sword,
  intervalSeconds: Timer,
  range: Crosshair,
  pierce: Layers,
  projectiles: Target,
  splashRadius: Expand,
  slowPercent: Snowflake,
  slowSeconds: Snowflake,
  burnDamagePerSecond: Flame,
  burnSeconds: Flame,
  stunSeconds: Zap,
  durationSeconds: Timer,
  cooldownSeconds: Timer,
  damageMultiplier: Sword,
  intervalMultiplier: Timer,
  rangeBonus: Crosshair,
  camo: Eye,
  delivery: MoveUpRight,
  damageType: Sparkles,
  targeting: Target,
  ability: Zap,
  distribution: Target,
  followUp: Sparkles,
  activeFollowUp: Sparkles,
};
export function Cost({ value, currency }: { value: number; currency: string }) {
  return (
    <span
      className="kit-cost"
      title={`${currency}: purchase cost`}
      aria-label={`${currency} ${value}`}
    >
      <Coins size={15} aria-hidden="true" />
      <span>{value.toLocaleString('en-US')}</span>
    </span>
  );
}
export function StatValues({ changes }: { changes: StatChange[] }) {
  return (
    <ul className="kit-stats">
      {changes.map((change) => {
        const key = change.key as StatKey;
        const Icon = icons[key];
        const label = statLabels[key];
        return (
          <li key={change.key} title={label} data-improvement={change.improvement}>
            <Icon size={15} aria-hidden="true" />
            <span className="stat-label">{label}</span>
            <span className="stat-values">
              {change.before !== undefined && (
                <>
                  <span className="stat-before">
                    <span className="sr-only">Previous: </span>
                    {statValue(key, change.before)}
                  </span>
                  <ArrowRight size={12} aria-hidden="true" />
                </>
              )}
              <span className={change.before === undefined ? 'stat-current' : 'stat-after'}>
                <span className="sr-only">{change.before === undefined ? '' : 'New: '}</span>
                {statValue(key, change.after)}
              </span>
            </span>
            {(change.key === 'intervalSeconds' || change.key === 'intervalMultiplier') &&
              change.improvement !== undefined && (
                <span className="stat-effect">{change.improvement ? 'Faster' : 'Slower'}</span>
              )}
            {change.improvement === false &&
              change.key !== 'intervalSeconds' &&
              change.key !== 'intervalMultiplier' && (
                <span className="stat-effect">
                  {change.key === 'cooldownSeconds' ? 'Longer wait' : 'Reduced'}
                </span>
              )}
          </li>
        );
      })}
    </ul>
  );
}
