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
import type { StatChange } from '../../api/contract.js';
import { cn } from '../../ui/utils.js';

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
      className="kit-cost my-1.5 inline-flex items-center gap-1 text-[13px] text-warning tabular-nums"
      title={`${currency}: purchase cost`}
      aria-label={`${currency} ${value}`}
    >
      <Coins className="size-[15px]" aria-hidden="true" />
      <span>{value.toLocaleString('en-US')}</span>
    </span>
  );
}
export function StatValues({ changes }: { changes: StatChange[] }) {
  return (
    <ul className="kit-stats relative z-[2] mt-2 grid gap-1.5 text-xs">
      {changes.map((change) => {
        const key = change.key as StatKey;
        const Icon = icons[key];
        const label = statLabels[key];
        return (
          <li
            key={change.key}
            className="flex flex-wrap items-center gap-1.5"
            title={label}
            data-improvement={change.improvement}
          >
            <Icon className="size-[15px] text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">{label}</span>
            <span className="inline-flex flex-wrap items-center gap-1.5 tabular-nums">
              {change.before !== undefined && (
                <>
                  <span className="text-destructive">
                    <span className="sr-only">Previous: </span>
                    {statValue(key, change.before)}
                  </span>
                  <ArrowRight className="size-3" aria-hidden="true" />
                </>
              )}
              <span className={cn(change.before !== undefined && 'text-success')}>
                <span className="sr-only">{change.before === undefined ? '' : 'New: '}</span>
                {statValue(key, change.after)}
              </span>
            </span>
            {(change.key === 'intervalSeconds' || change.key === 'intervalMultiplier') &&
              change.improvement !== undefined && (
                <span
                  className={cn(
                    'text-[11px] text-muted-foreground',
                    change.improvement === false && 'text-warning',
                  )}
                >
                  {change.improvement ? 'Faster' : 'Slower'}
                </span>
              )}
            {change.improvement === false &&
              change.key !== 'intervalSeconds' &&
              change.key !== 'intervalMultiplier' && (
                <span className="text-[11px] text-warning">
                  {change.key === 'cooldownSeconds' ? 'Longer wait' : 'Reduced'}
                </span>
              )}
          </li>
        );
      })}
    </ul>
  );
}
