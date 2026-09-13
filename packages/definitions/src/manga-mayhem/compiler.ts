import type { ProjectileDefinition } from '../mechanics/projectiles.js';
import { validateMechanicalModel } from '../mechanics/model.js';
import { combatDamage } from '../mechanics/combat.js';
import { schemaIssues, type Issue } from '@mardwerk/unit-core';
import { mangaUnitSchema, type MangaUnit, type MangaTiers, type MangaModifier } from './schemas.js';
export function validateMangaUnit(value: unknown): Issue[] {
  const issues = schemaIssues(mangaUnitSchema, value);
  if (issues.length) return issues;
  const unit = value as MangaUnit;
  if (unit.mechanics)
    issues.push(
      ...validateMechanicalModel(unit.mechanics).map((issue) => ({
        ...issue,
        path: `/mechanics${issue.path}`
      }))
    );
  const add = (path: string, message: string) =>
    issues.push({ code: 'MANGA_CONTRACT', path, message });
  for (const [key, entries] of [
    ['forms', unit.forms],
    ['paths', unit.paths]
  ] as const) {
    if (new Set(entries.map((e) => e.id)).size !== entries.length)
      add(`/${key}`, 'IDs must be unique.');
  }
  const statusProfiles = [
    ...unit.forms.flatMap((f, i) => [
      { path: `/forms/${i}/primary`, profile: f.primary },
      ...f.techniques.map((profile, j) => ({ path: `/forms/${i}/techniques/${j}`, profile }))
    ]),
    ...(unit.mechanics?.attacks.map((profile, i) => ({
      path: `/mechanics/attacks/${i}`,
      profile
    })) ?? []),
    ...(unit.mechanics?.actors.flatMap((a, i) =>
      a.attacks.map((profile, j) => ({ path: `/mechanics/actors/${i}/attacks/${j}`, profile }))
    ) ?? [])
  ];
  const statusLocations = statusProfiles.map(({ profile, path }) => ({
    path: `${path}/onHit`,
    effects: profile.onHit ?? []
  }));
  const visitProjectile = (node: ProjectileDefinition, path: string) => {
    statusLocations.push({ path: `${path}/onHit`, effects: node.onHit ?? [] });
    node.children?.forEach((child, i) =>
      visitProjectile(child.projectile, `${path}/children/${i}/projectile`)
    );
  };
  for (const { profile, path } of statusProfiles)
    if ('projectile' in profile && profile.projectile)
      visitProjectile(profile.projectile as ProjectileDefinition, `${path}/projectile`);
  for (const [i, zone] of (unit.mechanics?.zones ?? []).entries())
    statusLocations.push({ path: `/mechanics/zones/${i}/statuses`, effects: zone.statuses ?? [] });
  for (const [i, modifier] of (unit.mechanics?.modifiers ?? []).entries()) {
    if (!modifier.stat.startsWith('attack.') && modifier.stat !== 'income.amount')
      add(
        `/mechanics/modifiers/${i}/stat`,
        'Manga mechanical modifiers currently target scheduled attack stats or income.amount.'
      );
  }
  for (const { effects, path } of statusLocations)
    for (const [index, effect] of effects.entries()) {
      if (effect.kind === 'damage-over-time' && !effect.onDestroy) {
        const firstTick =
          effect.initialDelaySeconds + (effect.triggerImmediate ? 0 : effect.intervalSeconds);
        if (
          firstTick > effect.durationSeconds ||
          (firstTick === effect.durationSeconds && !effect.tickOnExpiry)
        )
          add(
            `${path}/${index}`,
            'Damage-over-time effects must have a reachable tick or destruction payload.'
          );
      }
      if (effect.kind === 'damage-over-time' && effect.onDestroy?.delivery === 'callback')
        add(
          `${path}/${index}`,
          'Destruction callback effects require a host action not exposed by Manga; use explicit replacement delivery.'
        );
    }
  for (const [i, trigger] of (unit.mechanics?.triggers ?? []).entries()) {
    const action = trigger.action;
    const path = `/mechanics/triggers/${i}/action`;
    if (action.kind === 'activate-ability' || action.kind === 'apply-modifier')
      add(path, 'Manga trigger actions currently support attack and spawn-actor.');
    if (action.kind === 'attack' && !unit.mechanics?.attacks.some((a) => a.id === action.attackId))
      add(path, 'Trigger attack ID must name a declared mechanical attack.');
    if (
      action.kind === 'spawn-actor' &&
      !unit.mechanics?.actors.some((a) => a.id === action.actorId)
    )
      add(path, 'Trigger actor ID must name a declared actor.');
  }
  for (const actor of unit.mechanics?.actors ?? []) {
    if (
      !unit.mechanics?.passiveSummons.some((summon) => summon.actorId === actor.id) &&
      !unit.mechanics?.triggers?.some(
        (trigger) => trigger.action.kind === 'spawn-actor' && trigger.action.actorId === actor.id
      )
    )
      add(
        '/mechanics/actors',
        `Actor ${actor.id} is unreachable; Manga actors require a passive summon or trigger declaration.`
      );
  }
  const base = unit.forms.find((f) => f.id === unit.baseForm);
  if (!base || base.unlockTier !== 0 || base.drainPerSecond !== 0)
    add('/baseForm', 'Base must be tier zero without drain.');
  if (unit.stamina && unit.stamina.entryMinimum > unit.stamina.maximum)
    add('/stamina', 'Entry minimum exceeds capacity.');
  for (const [i, form] of unit.forms.entries()) {
    const path = `/forms/${i}`;
    for (const profile of [form.primary, ...form.techniques]) {
      if (profile.delivery === 'projectile') {
        if (!profile.projectileSpeed || !profile.projectileRadius)
          add(path, 'Projectiles need speed and collision radius.');
        if (profile.shape.kind === 'sweep')
          add(path, 'Projectile impacts use single or area shapes.');
      } else if (profile.projectileSpeed !== undefined || profile.projectileRadius !== undefined)
        add(path, 'Projectile fields require projectile delivery.');
    }
    if (form.techniques.length && !unit.stamina) add(path, 'Techniques require stamina.');
    if (form.primary.windup > form.primary.period) add(path, 'Primary windup must fit its period.');
    if (form.id !== unit.baseForm && form.unlockTier < 1)
      add(path, 'Alternate forms unlock at tier one or later.');
    if (form.drainPerSecond > 0 && (!unit.stamina || form.unlockTier < unit.stamina.unlockTier))
      add(path, 'Draining forms need stamina unlocked by their tier.');
    if (new Set(form.techniques.map((t) => t.id)).size !== form.techniques.length)
      add(path, 'Technique IDs must be unique within a form.');
    if (new Set(form.techniques.map((t) => t.unlockTier)).size !== form.techniques.length)
      add(path, 'Contextual Technique tiers must be distinct.');
    if (
      form.drainPerSecond > 0 &&
      form.techniques.length &&
      !form.techniques.some((t) => t.unlockTier <= form.unlockTier)
    )
      add(path, 'A Technique must be available when its form unlocks.');
    for (const t of form.techniques) {
      if (unit.stamina && t.unlockTier < unit.stamina.unlockTier)
        add(path, 'Technique cannot unlock before stamina.');
      if (
        t.hitSpan > t.recovery ||
        (t.hits === 1 && t.hitSpan !== 0) ||
        (t.hits > 1 && (t.hitSpan <= 0 || t.shape.kind !== 'single'))
      )
        add(path, 'Hit schedule must fit the cycle; multi-hit Techniques use one locked target.');
      if (t.windup + t.recovery < 0.05) add(path, 'Technique cycle must be at least 0.05 seconds.');
      if (
        unit.stamina &&
        unit.stamina.techniqueCost + form.drainPerSecond * (t.windup + t.hitSpan) >
          unit.stamina.maximum
      )
        add(path, 'Technique cannot be funded at full stamina.');
    }
  }
  if (
    unit.stamina &&
    !unit.forms.some(
      (f) =>
        (f.unlockTier === unit.stamina!.unlockTier && f.drainPerSecond > 0) ||
        f.techniques.some(
          (t) => t.unlockTier === unit.stamina!.unlockTier && f.unlockTier <= t.unlockTier
        )
    )
  )
    add('/stamina/unlockTier', 'Stamina must unlock a usable form or Technique immediately.');
  for (const [p, path] of unit.paths.entries())
    for (const [t, upgrade] of path.upgrades.entries()) {
      const before: MangaTiers = [0, 0, 0];
      before[p] = t;
      const after: MangaTiers = [...before];
      after[p] = t + 1;
      if (
        !Object.keys(upgrade.modifiers).length ||
        JSON.stringify(compose(unit, before).modifiers) ===
          JSON.stringify(compose(unit, after).modifiers)
      )
        add(`/paths/${p}/upgrades/${t}`, 'Every purchase must change an effective modifier.');
    }
  for (const key of ['pulse', 'emission', 'support'] as const) {
    if (unit.paths.filter((p) => p.upgrades.some((u) => u.modifiers[key])).length > 1)
      add(
        '/paths',
        `${key} configuration must belong to one path; later purchases on that path replace it.`
      );
  }
  for (let main = 0; main < 3; main++)
    for (let secondary = 0; secondary < 3; secondary++) {
      if (main === secondary) continue;
      const tiers: MangaTiers = [0, 0, 0];
      tiers[main] = 5;
      tiers[secondary] = 2;
      const timing = compose(unit, tiers).modifiers.primaryTimingMultiplier!;
      if (unit.forms.some((f) => f.primary.period * timing < 0.01)) {
        add('/paths', 'Composed primary periods must remain at least 0.01 seconds.');
        return issues;
      }
    }
  return issues;
}
export function legalMangaTiers(tiers: readonly number[]): tiers is MangaTiers {
  const sorted = [...tiers].sort((a, b) => b - a);
  return (
    tiers.length === 3 &&
    tiers.every((t) => Number.isInteger(t) && t >= 0 && t <= 5) &&
    sorted[1]! <= 2 &&
    sorted[2] === 0
  );
}
function compose(unit: MangaUnit, tiers: MangaTiers) {
  const modifiers: MangaModifier = {
    flatDamage: 0,
    damageMultiplier: 1,
    primaryTimingMultiplier: 1,
    reachAdd: 0,
    armorIgnore: 0,
    internalFraction: 0,
    ...(unit.support ? { support: structuredClone(unit.support) } : {})
  };
  let cost = unit.cost;
  unit.paths.forEach((path, p) =>
    path.upgrades.slice(0, tiers[p]).forEach((u) => {
      cost += u.cost;
      for (const [key, value] of Object.entries(u.modifiers)) {
        if (key === 'flatDamage' || key === 'reachAdd')
          modifiers[key] = (modifiers[key] ?? 0) + (value as number);
        else if (key === 'damageMultiplier' || key === 'primaryTimingMultiplier')
          modifiers[key] = (modifiers[key] ?? 1) * (value as number);
        else if (key === 'armorIgnore' || key === 'internalFraction' || key === 'contactStun')
          modifiers[key] = Math.max(modifiers[key] ?? 0, value as number);
        else Object.assign(modifiers, { [key]: structuredClone(value) });
      }
    })
  );
  return { modifiers, cost };
}
export function compileMangaBuild(unit: MangaUnit, tiers: MangaTiers = [0, 0, 0]) {
  const issues = validateMangaUnit(unit);
  if (issues.length) throw new Error(issues.map((i) => `${i.path}: ${i.message}`).join('\n'));
  if (!legalMangaTiers(tiers))
    throw new Error('Illegal MangaMayhem progression; maximum is 5-2-0 in any order.');
  const { modifiers, cost } = compose(unit, tiers);
  const highestTier = Math.max(...tiers);
  return {
    unit: structuredClone(unit),
    tiers: [...tiers] as MangaTiers,
    highestTier,
    cost,
    modifiers,
    ...((modifiers.support ?? unit.support)
      ? { support: structuredClone((modifiers.support ?? unit.support)!) }
      : {}),
    forms: unit.forms
      .filter((f) => f.unlockTier <= highestTier)
      .map((f) => ({
        ...structuredClone(f),
        primary: {
          ...structuredClone(f.primary),
          reach: f.primary.reach + modifiers.reachAdd!,
          period: f.primary.period * modifiers.primaryTimingMultiplier!,
          windup: f.primary.windup * modifiers.primaryTimingMultiplier!
        }
      }))
  };
}
export type MangaBuild = ReturnType<typeof compileMangaBuild>;
export function mangaContactDamage(
  raw: number,
  armor: number,
  modifiers: MangaModifier,
  emission = false
) {
  return combatDamage(raw, armor, modifiers, emission);
}
