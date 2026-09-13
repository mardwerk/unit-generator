import { scaleProgressionStat, type ProgressionStatPolicy } from '../mechanics/progression.js';
import type { ProjectileDefinition } from '../mechanics/projectiles.js';
import type { Btd6ModelV2, Btd6AttackV2 } from './v2-schema.js';
import { validateBtd6ModelV2 } from './v2-compiler.js';

const source =
  'https://github.com/hemisemidemipresent/cyberquincy/blob/0901e279c20a6f5af27ee4a669d2c9deb82ebcf7/helpers/paragon.js';
export interface Btd6DegreeScalingCapture {
  degreeCount: number;
  attackCooldownReductionX: number;
  piercePercentPerDegree: number;
  pierceIncreasePerDegree: number;
  damagePercentPerDegree: number;
  damageIncreasePerDegree: number;
  damageIncreaseForDegrees: number;
}
export interface Btd6DegreeScaling {
  damage: ProgressionStatPolicy;
  damageBonus: ProgressionStatPolicy;
  pierce: ProgressionStatPolicy;
  interval: ProgressionStatPolicy;
  cooldown: ProgressionStatPolicy;
}

/** Normalizes the pinned formula into neutral tables. This does not establish a capture's baseline degree. */
export function createBtd6DegreeScaling(
  capture: Btd6DegreeScalingCapture,
  sourceReference: string
): Btd6DegreeScaling {
  if (
    capture.degreeCount !== 100 ||
    [
      'attackCooldownReductionX',
      'piercePercentPerDegree',
      'pierceIncreasePerDegree',
      'damagePercentPerDegree',
      'damageIncreasePerDegree',
      'damageIncreaseForDegrees'
    ].some((field) => {
      const value = capture[field as keyof Btd6DegreeScalingCapture];
      return !Number.isFinite(value) || value < 0;
    }) ||
    capture.damageIncreaseForDegrees <= 0 ||
    !sourceReference.trim()
  )
    throw new Error('Documented scaling requires a complete 100-degree capture.');
  const qualification = {
    kind: 'documented-policy' as const,
    reference: `${sourceReference}; ${source}`
  };
  const table = (profile: keyof Btd6DegreeScaling): ProgressionStatPolicy => ({
    qualification,
    levels: Array.from({ length: 100 }, (_, index) => {
      const degree = index + 1;
      if (profile === 'interval' || profile === 'cooldown')
        return {
          level: degree,
          factor:
            1 / (1 + Math.round(Math.sqrt(index * capture.attackCooldownReductionX) * 10) / 1000),
          offset: 0,
          floorProduct: false,
          decimalPlaces: profile === 'cooldown' ? 1 : 4
        };
      const isPierce = profile === 'pierce';
      const percent = isPierce ? capture.piercePercentPerDegree : capture.damagePercentPerDegree;
      return {
        level: degree,
        factor: degree === 100 ? 2 : 1 + (index * percent) / 100,
        offset:
          profile === 'damageBonus'
            ? 0
            : degree === 100
              ? 10
              : isPierce
                ? capture.pierceIncreasePerDegree * index
                : Math.floor(index / capture.damageIncreaseForDegrees) *
                  capture.damageIncreasePerDegree,
        floorProduct: isPierce && degree !== 100,
        decimalPlaces: 1
      };
    })
  });
  const result = {
    damage: table('damage'),
    damageBonus: table('damageBonus'),
    pierce: table('pierce'),
    interval: table('interval'),
    cooldown: table('cooldown')
  };
  for (const policy of Object.values(result)) scaleProgressionStat(0, 1, policy);
  return result;
}

export interface Btd6DegreeAttackSelection {
  attackId: string;
  damage: boolean;
  pierce: boolean;
  interval: boolean;
  childProjectileIds: string[];
}
export interface Btd6DegreeSelection {
  /** The source exporter does not capture this annotation; the caller must supply its evidence. */
  baselineDegree: 1;
  baselineReference: string;
  attacks: Btd6DegreeAttackSelection[];
  abilities?: Array<{ abilityId: string; cooldown: boolean; attacks: Btd6DegreeAttackSelection[] }>;
  actors?: Array<{ actorId: string; attacks: Btd6DegreeAttackSelection[] }>;
}

/** Scales only explicitly selected fields, preserving unclassified projectiles and behaviors. */
export function scaleBtd6DegreeModel(
  baseline: Btd6ModelV2,
  degree: number,
  policy: Btd6DegreeScaling,
  selection: Btd6DegreeSelection
) {
  if (selection.baselineDegree !== 1 || !selection.baselineReference.trim())
    throw new Error('Degree scaling requires explicit evidence for a degree-1 baseline.');
  const model = structuredClone(baseline);
  const scaleAttacks = (attacks: Btd6AttackV2[], selections: Btd6DegreeAttackSelection[]) => {
    if (new Set(selections.map((entry) => entry.attackId)).size !== selections.length)
      throw new Error('Degree scaling attack selections must be distinct.');
    for (const selected of selections) {
      const attack = attacks.find((entry) => entry.id === selected.attackId);
      if (!attack) throw new Error(`Missing scaling attack ${selected.attackId}.`);
      if (selected.damage)
        attack.damage = scaleProgressionStat(attack.damage, degree, policy.damage);
      if (selected.pierce)
        attack.pierce = scaleProgressionStat(attack.pierce, degree, policy.pierce);
      if (selected.interval)
        attack.intervalSeconds = scaleProgressionStat(
          attack.intervalSeconds,
          degree,
          policy.interval
        );
      const found = new Set<string>();
      const visit = (projectile: ProjectileDefinition, root: boolean) => {
        if (root || selected.childProjectileIds.includes(projectile.id)) {
          found.add(projectile.id);
          if (selected.damage)
            projectile.damage = scaleProgressionStat(projectile.damage, degree, policy.damage);
          if (selected.pierce)
            projectile.pierce = scaleProgressionStat(projectile.pierce, degree, policy.pierce);
        }
        for (const child of projectile.children ?? []) visit(child.projectile, false);
      };
      if (attack.projectile) visit(attack.projectile, true);
      if (selected.childProjectileIds.some((id) => !found.has(id)))
        throw new Error('Missing selected child projectile for degree scaling.');
    }
  };
  for (const ids of [
    (selection.abilities ?? []).map((entry) => entry.abilityId),
    (selection.actors ?? []).map((entry) => entry.actorId)
  ])
    if (new Set(ids).size !== ids.length)
      throw new Error('Degree scaling entity selections must be distinct.');
  scaleAttacks(model.attacks, selection.attacks);
  for (const selected of selection.abilities ?? []) {
    const ability = model.abilities.find((entry) => entry.id === selected.abilityId);
    if (!ability) throw new Error(`Missing scaling ability ${selected.abilityId}.`);
    if (selected.cooldown)
      ability.cooldownSeconds = scaleProgressionStat(
        ability.cooldownSeconds,
        degree,
        policy.cooldown
      );
    if ('attacks' in ability.effect) scaleAttacks(ability.effect.attacks, selected.attacks);
    else if (selected.attacks.length)
      throw new Error('Selected ability has no direct attack model.');
  }
  for (const selected of selection.actors ?? []) {
    const actor = model.actors.find((entry) => entry.id === selected.actorId);
    if (!actor) throw new Error(`Missing scaling actor ${selected.actorId}.`);
    scaleAttacks(actor.attacks, selected.attacks);
  }
  const errors = validateBtd6ModelV2(model);
  if (errors.length)
    throw new Error(
      `Invalid scaled combat model: ${errors.map((error) => error.message).join('; ')}`
    );
  return model;
}
