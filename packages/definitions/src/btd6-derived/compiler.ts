import { jsonCopy, type Issue } from '@mardwerk/unit-core';
import { Value } from '@sinclair/typebox/value';
import type { TSchema } from '@sinclair/typebox';
import {
  btd6ModelSchema,
  btd6UnitSchema,
  type Btd6Build,
  type Btd6Model,
  type Btd6Tiers,
  type Btd6Unit
} from './schema.js';

function schemaLeafIssues(schema: TSchema, value: unknown, prefix = ''): Issue[] {
  const issues: Issue[] = [];
  for (const error of Value.Errors(schema, value)) {
    const path = prefix + error.path;
    const branches = error.schema.anyOf as TSchema[] | undefined;
    let expanded = false;
    if (Array.isArray(branches) && branches.length > 0) {
      for (const discriminator of [['kind'], ['effect', 'kind']]) {
        const kinds = branches.map((branch) => {
          let property: TSchema | undefined = branch;
          for (const key of discriminator) property = property?.properties?.[key];
          return property?.const as unknown;
        });
        if (!kinds.every((kind): kind is string => typeof kind === 'string')) continue;
        let actual: unknown = error.value;
        for (const key of discriminator) {
          actual =
            actual !== null && typeof actual === 'object'
              ? (actual as Record<string, unknown>)[key]
              : undefined;
        }
        const matching = branches.filter((_branch, index) => kinds[index] === actual);
        if (matching.length === 1) {
          issues.push(...schemaLeafIssues(matching[0]!, error.value, path));
          expanded = true;
        } else if (matching.length === 0) {
          issues.push({
            code: 'schema',
            path: `${path}/${discriminator.join('/')}`,
            message: `Expected ${discriminator.join('.')} to be one of: ${[...new Set(kinds)].map((kind) => JSON.stringify(kind)).join(', ')}.`
          });
          expanded = true;
        }
        if (expanded) break;
      }
    }
    if (!expanded) issues.push({ code: 'schema', path: path || '/', message: error.message });
    if (issues.length >= 64) break;
  }
  return issues.slice(0, 64);
}

function schemaIssues(schema: TSchema, value: unknown): Issue[] {
  try {
    jsonCopy(value);
  } catch (error) {
    return [{ code: 'invalid-json', path: '/', message: String(error) }];
  }
  return schemaLeafIssues(schema, value);
}

export function isLegalBtd6Build(tiers: readonly number[]): boolean {
  return (
    tiers.length === 3 &&
    tiers.every((n) => Number.isInteger(n) && n >= 0 && n <= 5) &&
    tiers.filter((n) => n > 0).length <= 2 &&
    tiers.filter((n) => n > 2).length <= 1
  );
}
export function enumerateBtd6Builds(): Btd6Tiers[] {
  const builds: Btd6Tiers[] = [];
  for (let a = 0; a <= 5; a++)
    for (let b = 0; b <= 5; b++)
      for (let c = 0; c <= 5; c++) if (isLegalBtd6Build([a, b, c])) builds.push([a, b, c]);
  return builds;
}
function modelIssues(model: Btd6Model): Issue[] {
  const errors = schemaIssues(btd6ModelSchema, model);
  if (errors.length) return errors;
  if (!model.targeting.modes.includes(model.targeting.default))
    errors.push({
      code: 'target-mode',
      path: '/targeting/default',
      message: 'Default target mode must be available.'
    });
  const checkIds = (ids: string[], path: string) => {
    if (new Set(ids).size !== ids.length)
      errors.push({
        code: 'duplicate-id',
        path,
        message: 'IDs must be unique within this collection.'
      });
  };
  checkIds(
    model.attacks.map((a) => a.id),
    '/attacks'
  );
  checkIds(
    model.abilities.map((a) => a.id),
    '/abilities'
  );
  for (const ability of model.abilities)
    checkIds(
      ability.effect.attacks.map((a) => a.id),
      `/abilities/${ability.id}/effect/attacks`
    );
  for (const attack of [...model.attacks, ...model.abilities.flatMap((a) => a.effect.attacks)]) {
    for (const effect of attack.onHit ?? [])
      if (effect.kind === 'stun' && effect.speedMultiplier !== 0)
        errors.push({
          code: 'invalid-stun',
          path: `/attacks/${attack.id}/onHit`,
          message: 'A stun must set speedMultiplier to zero.'
        });
  }
  return errors;
}
export function validateBtd6Model(value: unknown): Issue[] {
  const errors = schemaIssues(btd6ModelSchema, value);
  return errors.length ? errors : modelIssues(value as Btd6Model);
}
// Object key order is JSON presentation, never a purchase effect. Array order is retained.
function comparable(value: unknown): string {
  const sort = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(sort)
      : item !== null && typeof item === 'object'
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, sort(v)])
          )
        : item;
  return JSON.stringify(sort(value));
}

function combatState(model: Btd6Model) {
  return { targeting: model.targeting, attacks: model.attacks, abilities: model.abilities };
}
const numeric = (prior: number, op: 'add' | 'multiply' | 'set', value: number) =>
  op === 'add' ? prior + value : op === 'multiply' ? prior * value : value;
function resolveModel(unit: Btd6Unit, tiers: Btd6Tiers): Btd6Model {
  const endpoint = unit.endpoints.find((e) => e.tiers.every((n, i) => n === tiers[i]));
  if (endpoint) return structuredClone(endpoint.model);
  if (unit.resolution === 'captured-endpoints')
    throw new Error(`Unsupported captured endpoint ${tiers.join('')}.`);
  const model = structuredClone(unit.base);
  for (const [p, count] of tiers.entries())
    for (const upgrade of unit.paths[p]!.upgrades.slice(0, count))
      for (const operation of upgrade.operations) {
        if (operation.kind === 'display-range')
          model.displayRange = numeric(model.displayRange, operation.operator, operation.value);
        else if (operation.kind === 'grant-ability') {
          const index = model.abilities.findIndex((a) => a.id === operation.ability.id);
          if (index === -1) model.abilities.push(structuredClone(operation.ability));
          else model.abilities[index] = structuredClone(operation.ability);
        } else if (operation.kind === 'replace-attack') {
          const index = model.attacks.findIndex((a) => a.id === operation.attack.id);
          if (index === -1) model.attacks.push(structuredClone(operation.attack));
          else model.attacks[index] = structuredClone(operation.attack);
        } else {
          const attack = model.attacks.find((a) => a.id === operation.attackId);
          if (!attack)
            throw new Error(`Missing attack ${operation.attackId} in upgrade ${upgrade.id}.`);
          if (operation.kind === 'detect-camo') attack.detectsCamo = true;
          else if (operation.kind === 'damage-immunities')
            attack.immuneTo = [...operation.immuneTo];
          else if (operation.stat === 'radius')
            attack.reach.radius = numeric(attack.reach.radius, operation.operator, operation.value);
          else
            attack[operation.stat] = numeric(
              attack[operation.stat],
              operation.operator,
              operation.value
            );
        }
      }
  return model;
}
export function validateBtd6Unit(value: unknown): Issue[] {
  const errors = schemaIssues(btd6UnitSchema, value);
  if (errors.length) return errors;
  const unit = value as Btd6Unit;
  const ids = [unit.id, ...unit.paths.flatMap((p) => [p.id, ...p.upgrades.map((u) => u.id)])];
  if (new Set(ids).size !== ids.length)
    errors.push({
      code: 'duplicate-id',
      path: '/paths',
      message: 'Unit, path and upgrade IDs must be unique.'
    });
  const keys = unit.endpoints.map((e) => e.tiers.join(''));
  if (new Set(keys).size !== keys.length)
    errors.push({
      code: 'duplicate-endpoint',
      path: '/endpoints',
      message: 'Each endpoint occurs once.'
    });
  for (const endpoint of unit.endpoints)
    if (!isLegalBtd6Build(endpoint.tiers))
      errors.push({
        code: 'illegal-build',
        path: '/endpoints',
        message: `Illegal endpoint ${endpoint.tiers.join('')}.`
      });
  errors.push(...modelIssues(unit.base));
  if (unit.resolution === 'captured-endpoints' && !keys.includes('000'))
    errors.push({
      code: 'missing-base-endpoint',
      path: '/endpoints',
      message: 'Captured mode requires the explicit 000 endpoint.'
    });
  const selections =
    unit.resolution === 'captured-endpoints'
      ? unit.endpoints.map((e) => e.tiers as Btd6Tiers)
      : enumerateBtd6Builds();
  const resolvedModels = new Map<string, string>();
  for (const tiers of selections) {
    try {
      const model = resolveModel(unit, tiers);
      resolvedModels.set(tiers.join(''), JSON.stringify(model));
      errors.push(
        ...modelIssues(model).map((e) => ({
          ...e,
          path: `/builds/${tiers.join('')}${e.path}`
        }))
      );
    } catch (error) {
      errors.push({
        code: 'build-failed',
        path: `/builds/${tiers.join('')}`,
        message: String(error)
      });
    }
    if (errors.length >= 64) break;
  }
  if (!errors.length && unit.resolution === 'upgrades') {
    for (const [path, branch] of unit.paths.entries())
      for (const [index, upgrade] of branch.upgrades.entries()) {
        const changesModel = selections
          .filter((tiers) => tiers[path] === index + 1)
          .some((tiers) => {
            const before = [...tiers];
            before[path]!--;
            return resolvedModels.get(before.join('')) !== resolvedModels.get(tiers.join(''));
          });
        if (!changesModel)
          errors.push({
            code: 'ineffective-purchase',
            path: `/paths/${path}/upgrades/${index}`,
            message: `Purchase ${upgrade.id} changes no resolved combat model in any legal build. Gameplay usefulness still requires encounter checks.`
          });
      }
  }
  return errors.slice(0, 64);
}
export interface Btd6PurchaseEdge {
  before: Btd6Tiers;
  after: Btd6Tiers;
  pathIndex: number;
  tier: number;
  upgradeId: string;
  modelChanged: boolean;
  displayChanged: boolean;
  costDelta: number;
  resolution: 'composed' | 'endpoint-override' | 'captured-endpoint';
}

/** Reports every available legal purchase, including crosspaths masked by exact snapshots.
 * Structural failures throw; ineffective purchases remain inspectable in the report.
 */
export function inspectBtd6PurchaseEdges(unit: Btd6Unit): Btd6PurchaseEdge[] {
  const errors = validateBtd6Unit(unit).filter((issue) => issue.code !== 'ineffective-purchase');
  if (errors.length)
    throw new Error(`Invalid BTD6-derived unit: ${errors.map((e) => e.message).join('; ')}`);
  const selections =
    unit.resolution === 'captured-endpoints'
      ? unit.endpoints.map((endpoint) => endpoint.tiers as Btd6Tiers)
      : enumerateBtd6Builds();
  const models = new Map(selections.map((tiers) => [tiers.join(''), resolveModel(unit, tiers)]));
  const edges: Btd6PurchaseEdge[] = [];
  for (const after of selections)
    for (const [pathIndex, tier] of after.entries()) {
      if (!tier) continue;
      const before = [...after] as Btd6Tiers;
      before[pathIndex]!--;
      const previous = models.get(before.join(''));
      if (!previous) continue;
      const model = models.get(after.join(''))!;
      const upgrade = unit.paths[pathIndex]!.upgrades[tier - 1]!;
      edges.push({
        before,
        after: [...after],
        pathIndex,
        tier,
        upgradeId: upgrade.id,
        modelChanged: comparable(combatState(previous)) !== comparable(combatState(model)),
        displayChanged: previous.displayRange !== model.displayRange,
        costDelta: upgrade.cost,
        resolution:
          unit.resolution === 'captured-endpoints'
            ? 'captured-endpoint'
            : unit.endpoints.some((endpoint) => endpoint.tiers.every((n, i) => n === after[i]))
              ? 'endpoint-override'
              : 'composed'
      });
    }
  return edges;
}
export function compileBtd6Build(unit: Btd6Unit, tiers: Btd6Tiers): Btd6Build {
  const errors = validateBtd6Unit(unit);
  if (errors.length)
    throw new Error(`Invalid BTD6-derived unit: ${errors.map((e) => e.message).join('; ')}`);
  if (!isLegalBtd6Build(tiers)) throw new Error(`Illegal build ${tiers.join('')}.`);
  return {
    schemaVersion: 'btd6-derived.build/0.1',
    unitId: unit.id,
    tiers: [...tiers],
    cost:
      unit.placementCost +
      tiers.reduce(
        (total, count, path) =>
          total + unit.paths[path]!.upgrades.slice(0, count).reduce((sum, u) => sum + u.cost, 0),
        0
      ),
    model: resolveModel(unit, tiers),
    adaptations: [...unit.adaptations],
    unsupported: [...unit.unsupported]
  };
}
