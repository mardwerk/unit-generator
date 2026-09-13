import { advanceProgression, fusionDegree } from '../mechanics/progression.js';
import { jsonCopy, schemaIssues, type Issue } from '@mardwerk/unit-core';
import type { TSchema } from '@sinclair/typebox';
import { enumerateBtd6Builds, isLegalBtd6Build } from './compiler.js';
import type { Btd6Tiers } from './schema.js';
import {
  btd6ModelV2Schema,
  btd6UnitV2Schema,
  type Btd6ModelV2,
  type Btd6UnitV2,
  type Btd6BuildV2
} from './v2-schema.js';

const issue = (code: string, path: string, message: string): Issue => ({ code, path, message });
function schemaErrors(schema: TSchema, value: unknown): Issue[] {
  try {
    jsonCopy(value);
  } catch {
    return [issue('invalid-json', '/', 'Expected finite JSON data.')];
  }
  return schemaIssues(schema, value);
}
export function validateBtd6ModelV2(value: unknown): Issue[] {
  const errors = schemaErrors(btd6ModelV2Schema, value);
  if (errors.length) return errors;
  const model = value as Btd6ModelV2;
  const unique = (items: { id: string }[], path: string) => {
    if (new Set(items.map((a) => a.id)).size !== items.length)
      errors.push(issue('duplicate-id', path, 'IDs must be unique within this collection.'));
  };
  if (!model.targeting.modes.includes(model.targeting.default))
    errors.push(issue('target-mode', '/targeting/default', 'Default targeting must be available.'));
  for (const name of [
    'attacks',
    'abilities',
    'actors',
    'passiveSummons',
    'income',
    'support'
  ] as const)
    unique(model[name], `/${name}`);
  unique(model.accounts ?? [], '/accounts');
  unique(model.triggers ?? [], '/triggers');
  unique(model.zones ?? [], '/zones');
  const checkStatuses = (value: unknown, path: string) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => checkStatuses(v, `${path}/${i}`));
      return;
    }
    const record = value as Record<string, unknown>;
    if (
      record.kind === 'damage-over-time' &&
      (record.onDestroy as { delivery?: string } | undefined)?.delivery === 'callback'
    )
      errors.push(
        issue(
          'status-destruction-policy',
          path,
          'This encounter requires replacement-target destruction delivery; callback payloads have no host handler.'
        )
      );
    for (const [key, child] of Object.entries(record)) checkStatuses(child, `${path}/${key}`);
  };
  checkStatuses(model, '');
  const checkAttacks = (attacks: Btd6ModelV2['attacks'], path: string) => {
    unique(attacks, path);
    for (const [i, attack] of attacks.entries()) {
      if (attack.projectile && (attack.delivery !== 'projectile' || attack.impact))
        errors.push(
          issue(
            'projectile-policy',
            `${path}/${i}`,
            'A projectile graph requires projectile delivery and owns its child impacts.'
          )
        );
      if (
        attack.projectile &&
        (attack.damage !== attack.projectile.damage || attack.pierce !== attack.projectile.pierce)
      )
        errors.push(
          issue(
            'projectile-policy',
            `${path}/${i}`,
            'Root projectile damage and pierce must agree with attack fields.'
          )
        );
      for (const [field, effects] of [
        ['onHit', attack.onHit],
        ['impact/onHit', attack.impact?.onHit]
      ] as const)
        for (const [j, effect] of (effects ?? []).entries())
          if (effect.kind === 'stun' && effect.speedMultiplier !== 0)
            errors.push(
              issue(
                'invalid-stun',
                `${path}/${i}/${field}/${j}`,
                'A stun must set speedMultiplier to zero.'
              )
            );
    }
  };
  checkAttacks(model.attacks, '/attacks');
  model.actors.forEach((actor, i) => checkAttacks(actor.attacks, `/actors/${i}/attacks`));
  const actors = new Set(model.actors.map((actor) => actor.id));
  model.abilities.forEach((ability, i) => {
    if (ability.effect.kind === 'summon') {
      if (!actors.has(ability.effect.actorId))
        errors.push(
          issue(
            'missing-actor',
            `/abilities/${i}/effect/actorId`,
            'Summon must reference an actor template.'
          )
        );
    } else if (ability.effect.kind === 'account') {
      const op = ability.effect.operation;
      if ('accountId' in op && !model.accounts?.some((a) => a.id === op.accountId))
        errors.push(
          issue(
            'missing-account',
            `/abilities/${i}/effect/operation/accountId`,
            'Account ability must reference a model account.'
          )
        );
    } else checkAttacks(ability.effect.attacks, `/abilities/${i}/effect/attacks`);
  });
  model.passiveSummons.forEach((summon, i) => {
    if (!actors.has(summon.actorId))
      errors.push(
        issue(
          'missing-actor',
          `/passiveSummons/${i}/actorId`,
          'Passive summon must reference an actor template.'
        )
      );
    if ((summon.maxAlive === undefined) !== (summon.limitPolicy === undefined))
      errors.push(
        issue(
          'actor-limit-policy',
          `/passiveSummons/${i}`,
          'Actor limits require an explicit skip or replacement policy.'
        )
      );
  });
  model.triggers?.forEach((trigger, i) => {
    const action = trigger.action;
    const valid =
      action.kind === 'activate-ability'
        ? model.abilities.some((a) => a.id === action.abilityId)
        : action.kind === 'spawn-actor'
          ? actors.has(action.actorId)
          : action.kind === 'attack'
            ? model.attacks.some((a) => a.id === action.attackId)
            : false;
    if (!valid)
      errors.push(
        issue(
          'trigger-reference',
          `/triggers/${i}/action`,
          'Trigger action must reference an executable ability, actor or attack. Modifier triggers require a modifier policy.'
        )
      );
  });
  if (
    !model.attacks.length &&
    !model.income.length &&
    !model.support.length &&
    !model.passiveSummons.length &&
    !model.abilities.length &&
    !model.zones?.length &&
    !model.modifiers?.length &&
    !model.accounts?.length
  )
    errors.push(
      issue(
        'empty-model',
        '/',
        'A model needs an executable attack, ability, summon, income or support effect.'
      )
    );
  return errors.slice(0, 64);
}
const numeric = (prior: number, op: string, value: number) =>
  op === 'add' ? prior + value : op === 'multiply' ? prior * value : value;
const upsert = <T extends { id: string }>(items: T[], item: T) => {
  const index = items.findIndex((prior) => prior.id === item.id);
  if (index < 0) items.push(structuredClone(item));
  else items[index] = structuredClone(item);
};
function resolve(unit: Btd6UnitV2, tiers: Btd6Tiers): Btd6ModelV2 {
  const endpoint = unit.endpoints.find((e) => e.tiers.every((tier, i) => tier === tiers[i]));
  if (endpoint) {
    if (!endpoint.model) throw new Error(`Unresolved captured endpoint ${tiers.join('')}.`);
    return structuredClone(endpoint.model);
  }
  if (unit.resolution === 'captured-endpoints')
    throw new Error(`Unsupported captured endpoint ${tiers.join('')}.`);
  if (!unit.base) throw new Error('Authored upgrades require a resolved base model.');
  const model = structuredClone(unit.base);
  for (const [path, count] of tiers.entries())
    for (const upgrade of unit.paths[path]!.upgrades.slice(0, count))
      for (const op of upgrade.operations) {
        switch (op.kind) {
          case 'display-range':
            model.displayRange = numeric(model.displayRange, op.operator, op.value);
            break;
          case 'replace-attack':
            upsert(model.attacks, op.attack);
            break;
          case 'grant-ability':
            upsert(model.abilities, op.ability);
            break;
          case 'grant-actor':
            upsert(model.actors, op.actor);
            break;
          case 'grant-account':
            model.accounts ??= [];
            upsert(model.accounts, op.account);
            break;
          case 'grant-income':
            upsert(model.income, op.income);
            break;
          case 'grant-support':
            upsert(model.support, op.support);
            break;
          case 'grant-passive-summon':
            upsert(model.passiveSummons, op.summon);
            break;
          default: {
            const attack = model.attacks.find((a) => a.id === op.attackId);
            if (!attack) throw new Error(`Missing attack ${op.attackId} in upgrade ${upgrade.id}.`);
            if (op.kind === 'detect-camo') {
              attack.detectsCamo = true;
              if (attack.projectile) attack.projectile.detectConcealed = true;
            } else if (op.kind === 'damage-immunities') {
              attack.immuneTo = [...op.immuneTo];
              if (attack.projectile) attack.projectile.immuneTo = [...op.immuneTo];
            } else if (op.stat === 'radius')
              attack.reach.radius = numeric(attack.reach.radius, op.operator, op.value);
            else {
              const stat = op.stat as 'damage' | 'intervalSeconds' | 'pierce' | 'projectiles';
              attack[stat] = numeric(attack[stat], op.operator, op.value);
              if (attack.projectile && (stat === 'damage' || stat === 'pierce'))
                attack.projectile[stat] = attack[stat];
            }
          }
        }
      }
  return model;
}
function comparable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(comparable).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${comparable(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function combat(model: Btd6ModelV2) {
  const { displayRange: _displayRange, ...state } = model;
  return comparable(state);
}
function selections(unit: Btd6UnitV2): Btd6Tiers[] {
  return unit.resolution === 'captured-endpoints'
    ? unit.endpoints.map((e) => e.tiers as Btd6Tiers)
    : enumerateBtd6Builds();
}
export function validateBtd6UnitV2(
  value: unknown,
  options: { allowUnresolved?: boolean } = {}
): Issue[] {
  const errors = schemaErrors(btd6UnitV2Schema, value);
  if (errors.length) return errors;
  const unit = value as Btd6UnitV2;
  if (unit.heroProgression) {
    const hero = unit.heroProgression;
    try {
      advanceProgression(hero.initialState, 0, hero.policy);
    } catch (error) {
      errors.push(issue('hero-progression', '/heroProgression', String(error)));
    }
    for (const step of hero.policy.steps)
      if (!hero.unlocks[step.unlock])
        errors.push(
          issue(
            'missing-unlock',
            `/heroProgression/unlocks/${step.unlock}`,
            'Every progression step requires a resolved model.'
          )
        );
    for (const [key, model] of Object.entries(hero.unlocks))
      errors.push(
        ...validateBtd6ModelV2(model).map((e) => ({
          ...e,
          path: `/heroProgression/unlocks/${key}${e.path}`
        }))
      );
  }
  if (unit.fusionPolicy)
    try {
      fusionDegree(0, unit.fusionPolicy);
    } catch (error) {
      errors.push(issue('fusion-policy', '/fusionPolicy', String(error)));
    }
  for (const [key, model] of Object.entries(unit.fusionModels ?? {}))
    errors.push(
      ...validateBtd6ModelV2(model).map((e) => ({ ...e, path: `/fusionModels/${key}${e.path}` }))
    );
  const ids = [unit.id, ...unit.paths.flatMap((p) => [p.id, ...p.upgrades.map((u) => u.id)])];
  if (new Set(ids).size !== ids.length)
    errors.push(issue('duplicate-id', '/paths', 'Unit, path and upgrade IDs must be unique.'));
  const keys = unit.endpoints.map((e) => e.tiers.join(''));
  if (new Set(keys).size !== keys.length)
    errors.push(issue('duplicate-endpoint', '/endpoints', 'Each endpoint occurs once.'));
  for (const [i, endpoint] of unit.endpoints.entries())
    if (!isLegalBtd6Build(endpoint.tiers))
      errors.push(issue('illegal-build', `/endpoints/${i}/tiers`, 'Illegal three-path endpoint.'));
  if (unit.resolution === 'captured-endpoints' && !keys.includes('000'))
    errors.push(
      issue(
        'missing-base-endpoint',
        '/endpoints',
        'Captured mode requires the explicit 000 endpoint.'
      )
    );
  if (!unit.base) {
    if (unit.resolution !== 'captured-endpoints' || !options.allowUnresolved)
      errors.push(
        issue(
          unit.resolution === 'captured-endpoints' ? 'unresolved-model' : 'missing-base',
          '/base',
          'Base model is unresolved.'
        )
      );
  } else
    errors.push(...validateBtd6ModelV2(unit.base).map((e) => ({ ...e, path: `/base${e.path}` })));
  for (const [i, endpoint] of unit.endpoints.entries())
    if (
      !endpoint.model &&
      (unit.resolution !== 'captured-endpoints' || !endpoint.unsupported?.length)
    )
      errors.push(
        issue(
          'missing-endpoint-model',
          `/endpoints/${i}`,
          'Only captured endpoints with explicit unsupported reasons may have an unresolved model.'
        )
      );
  const models = new Map<string, string>();
  for (const tiers of selections(unit)) {
    if (
      unit.endpoints.some(
        (endpoint) => endpoint.model === null && endpoint.tiers.every((n, i) => n === tiers[i])
      )
    ) {
      if (!options.allowUnresolved)
        errors.push(
          issue(
            'unresolved-model',
            `/builds/${tiers.join('')}`,
            'Captured endpoint has no qualified executable model.'
          )
        );
      continue;
    }
    try {
      const model = resolve(unit, tiers);
      models.set(tiers.join(''), combat(model));
      errors.push(
        ...validateBtd6ModelV2(model).map((e) => ({
          ...e,
          path: `/builds/${tiers.join('')}${e.path}`
        }))
      );
    } catch (error) {
      errors.push(issue('build-failed', `/builds/${tiers.join('')}`, String(error)));
    }
    if (errors.length >= 64) break;
  }
  if (!errors.length && unit.resolution === 'upgrades')
    for (const [path, branch] of unit.paths.entries())
      for (const [index, upgrade] of branch.upgrades.entries()) {
        const changed = selections(unit)
          .filter((t) => t[path] === index + 1)
          .some((after) => {
            const before = [...after];
            before[path]!--;
            return models.get(before.join('')) !== models.get(after.join(''));
          });
        if (!changed)
          errors.push(
            issue(
              'ineffective-purchase',
              `/paths/${path}/upgrades/${index}`,
              `Purchase ${upgrade.id} changes no resolved combat model. Cost and display range do not count.`
            )
          );
      }
  return errors.slice(0, 64);
}
function compiledBuild(unit: Btd6UnitV2, tiers: Btd6Tiers): Btd6BuildV2 {
  if (!isLegalBtd6Build(tiers)) throw new Error('Illegal build.');
  return {
    schemaVersion: 'btd6-derived.build/0.2',
    unitId: unit.id,
    tiers: [...tiers],
    cost:
      unit.placementCost +
      tiers.reduce(
        (sum, count, path) =>
          sum + unit.paths[path]!.upgrades.slice(0, count).reduce((n, u) => n + u.cost, 0),
        0
      ),
    ...(unit.heroProgression ? { heroProgression: structuredClone(unit.heroProgression) } : {}),
    ...(unit.fusionPolicy ? { fusionPolicy: structuredClone(unit.fusionPolicy) } : {}),
    ...(unit.fusionModels ? { fusionModels: structuredClone(unit.fusionModels) } : {}),
    model: resolve(unit, tiers),
    adaptations: [...unit.adaptations],
    unsupported: [...unit.unsupported]
  };
}

/** Validates once and owns a private snapshot for repeated legal-build evaluation. */
export function prepareBtd6CompilerV2(input: Btd6UnitV2) {
  const unit = jsonCopy(input);
  const errors = validateBtd6UnitV2(unit, { allowUnresolved: true });
  if (errors.length) throw new Error(errors.map((e) => `${e.path}: ${e.message}`).join('; '));
  return (tiers: Btd6Tiers) => compiledBuild(unit, tiers);
}
export function compileBtd6BuildV2(unit: Btd6UnitV2, tiers: Btd6Tiers): Btd6BuildV2 {
  return prepareBtd6CompilerV2(unit)(tiers);
}
