import type { Attack, MechanicsDefinition } from '../mechanics/schemas.js';
import type { ResolvedBuild } from '../mechanics/index.js';

/** Gameplay summaries come from resolved behavior, not unverified character lore. */
export function unitSummary(attack: Attack, definition: MechanicsDefinition): string {
  const shape = {
    projectile: 'projectile',
    instant: 'instant-hit',
    area: 'area',
    beam: 'pulsed beam',
  }[attack.delivery];
  const limits = ['Requires a clear delivery path.'];
  if (!attack.camo) limits.push('Starts without Camo detection.');
  const immunities = definition.rules.damageImmunities[attack.damageType];
  if (immunities.length) limits.push(`Base damage cannot affect ${immunities.join(', ')} enemies.`);
  return `${attack.stats.pierce === 1 ? 'Single-target' : 'Multiple-target'} ${shape} attacker. ${limits.join(' ')}`;
}

export function pathSummary(base: Attack, build: ResolvedBuild): string {
  const after = build.baseAttack;
  const changed: string[] = [];
  if (after.stats.damage > base.stats.damage) changed.push('higher damage per hit');
  if (after.stats.intervalSeconds < base.stats.intervalSeconds) changed.push('faster attacks');
  if (after.stats.projectiles > base.stats.projectiles)
    changed.push(
      after.distribution === 'distinct-targets'
        ? 'volleys across distinct targets'
        : 'more hits on the primary target',
    );
  if (after.followUp) changed.push('secondary hits on nearby enemies');
  if (build.abilities.some((ability) => ability.boostedAttack.followUp && !after.followUp))
    changed.push('secondary hits during activation');
  if (
    after.stats.pierce > base.stats.pierce ||
    (after.stats.pierce > 1 && after.stats.splashRadius > base.stats.splashRadius)
  )
    changed.push('wider coverage');
  if (after.stats.range > base.stats.range) changed.push('longer reach');
  if (
    after.stats.slowPercent > base.stats.slowPercent ||
    after.stats.slowSeconds > base.stats.slowSeconds ||
    after.stats.stunSeconds > base.stats.stunSeconds
  )
    changed.push('enemy control');
  if (
    after.stats.burnDamagePerSecond > base.stats.burnDamagePerSecond ||
    after.stats.burnSeconds > base.stats.burnSeconds
  )
    changed.push('burn damage');
  if (after.camo && !base.camo) changed.push('Camo detection');
  if (after.damageType !== base.damageType) changed.push(`${after.damageType} damage`);
  if (after.delivery !== base.delivery) changed.push(`${after.delivery} delivery`);
  if (build.abilities.length) changed.push('a manual attack boost');
  if (!changed.length) changed.push('changes to the base attack');
  const text = changed.join(', ');
  const drawbacks: string[] = [];
  if (after.stats.damage < base.stats.damage) drawbacks.push('lower damage per hit');
  if (after.stats.intervalSeconds > base.stats.intervalSeconds) drawbacks.push('slower attacks');
  if (after.stats.range < base.stats.range) drawbacks.push('shorter reach');
  if (after.stats.pierce < base.stats.pierce) drawbacks.push('fewer targets per hit');
  if (after.stats.projectiles < base.stats.projectiles) drawbacks.push('fewer hits per attack');
  if (after.stats.splashRadius < base.stats.splashRadius) drawbacks.push('smaller splash area');
  if (
    after.stats.slowPercent < base.stats.slowPercent ||
    after.stats.slowSeconds < base.stats.slowSeconds ||
    after.stats.stunSeconds < base.stats.stunSeconds
  )
    drawbacks.push('reduced enemy control');
  if (
    after.stats.burnDamagePerSecond < base.stats.burnDamagePerSecond ||
    after.stats.burnSeconds < base.stats.burnSeconds
  )
    drawbacks.push('reduced burn damage');
  if (base.camo && !after.camo) drawbacks.push('loss of Camo detection');
  return `${text[0]!.toUpperCase()}${text.slice(1)}.${drawbacks.length ? ` Tradeoffs: ${drawbacks.join(', ')}.` : ''}`;
}
