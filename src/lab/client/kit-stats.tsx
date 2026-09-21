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
import {
  statLabels,
  statValue,
  type StatKey,
  type StatChange,
} from '../../presentation/kit-stats.js';
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
        const Icon = icons[change.key];
        const label = statLabels[change.key];
        return (
          <li key={change.key} title={label} data-improvement={change.improvement}>
            <Icon size={15} aria-hidden="true" />
            <span className="stat-label">{label}</span>
            <span className="stat-values">
              {change.before !== undefined && (
                <>
                  <span className="stat-before">
                    <span className="sr-only">Previous: </span>
                    {statValue(change.key, change.before)}
                  </span>
                  <ArrowRight size={12} aria-hidden="true" />
                </>
              )}
              <span className={change.before === undefined ? 'stat-current' : 'stat-after'}>
                <span className="sr-only">{change.before === undefined ? '' : 'New: '}</span>
                {statValue(change.key, change.after)}
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
