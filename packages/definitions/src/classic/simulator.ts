import { createHash } from 'node:crypto';

import { canonicalJson } from '@mardwerk/manifest';

import type { Action, Ability, Effect, Resource, Status } from './schemas.js';
import type {
  ScenarioEnemy,
  SimulationReport,
  SimulationScenario,
  UnitBuild,
  ValidationIssue,
  ValidationReport
} from './reports.js';
import { simulationScenarioSchema, UNIT_EXECUTION_LIMITS } from './schemas.js';
import { sortAndLimitIssues, validateSchema } from './schema-validation.js';

const MAX_EVENTS = 100_000;
const MAX_DEPTH = 16;
const MAX_QUEUED_EVENTS = 100_000;
const MAX_SUMMONS = 10_000;
const MAX_REPORT_MAGNITUDE = Number.MAX_SAFE_INTEGER;
const EPSILON = 1e-9;

type ScenarioId = 'durable' | 'grouped' | 'fast' | 'armoured' | 'burst' | 'support';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export const BUILT_IN_SCENARIOS: Record<ScenarioId, SimulationScenario> = deepFreeze({
  durable: {
    schemaVersion: '0.1',
    id: 'durable',
    purpose: 'Sustained output against one durable target.',
    durationSeconds: 30,
    seed: 101,
    abilityPolicy: 'automatic',
    enemies: [enemy('durable-1', 0, 18, 0.25, 20_000)]
  },
  grouped: {
    schemaVersion: '0.1',
    id: 'grouped',
    purpose: 'Bounded multi-target output against grouped weak targets.',
    durationSeconds: 20,
    seed: 202,
    abilityPolicy: 'automatic',
    enemies: Array.from({ length: 8 }, (_, index) =>
      enemy(`grouped-${index + 1}`, index * 0.25, 12 + index, 0.6, 80)
    )
  },
  fast: {
    schemaVersion: '0.1',
    id: 'fast',
    purpose: 'Acquisition and projectile timing against fast targets.',
    durationSeconds: 15,
    seed: 303,
    abilityPolicy: 'automatic',
    enemies: Array.from({ length: 5 }, (_, index) =>
      enemy(`fast-${index + 1}`, index * 1.5, 100, 8, 120, ['fast'])
    )
  },
  armoured: {
    schemaVersion: '0.1',
    id: 'armoured',
    purpose: 'Damage-type resistance against one armoured target.',
    durationSeconds: 30,
    seed: 404,
    abilityPolicy: 'automatic',
    enemies: [enemy('armoured-1', 0, 18, 0.25, 20_000, ['armoured'], { '*': 0.5 })]
  },
  burst: {
    schemaVersion: '0.1',
    id: 'burst',
    purpose: 'Short ability window with on-cooldown activation.',
    durationSeconds: 8,
    seed: 505,
    abilityPolicy: 'on-cooldown',
    enemies: [enemy('burst-1', 0, 18, 0.25, 20_000)]
  },
  support: {
    schemaVersion: '0.1',
    id: 'support',
    purpose: 'Resource, status, and economy contribution over a sustained window.',
    durationSeconds: 30,
    seed: 606,
    abilityPolicy: 'on-cooldown',
    enemies: [enemy('support-1', 0, 15, 0.25, 20_000)]
  }
});

interface Contribution {
  ability: boolean;
  summon: boolean;
}

interface BaseEvent {
  time: number;
  order: number;
}

type SimulationEvent =
  | (BaseEvent & {
      kind: 'action';
      actionId: string;
      depth: number;
      contribution: Contribution;
      repeatSeconds?: number;
      summonInstanceId?: number;
      cycleId?: number;
      abilityId?: string;
    })
  | (BaseEvent & {
      kind: 'resolve';
      actionId: string;
      depth: number;
      contribution: Contribution;
      cycleId: number;
      summonInstanceId?: number;
    })
  | (BaseEvent & {
      kind: 'impact';
      actionId: string;
      targetId: string;
      depth: number;
      contribution: Contribution;
      cycleId: number;
      summonInstanceId?: number;
    })
  | (BaseEvent & { kind: 'ability'; abilityId: string })
  | (BaseEvent & { kind: 'ability-recharge'; abilityId: string })
  | (BaseEvent & { kind: 'resource'; resourceId: string; generationIndex: number })
  | (BaseEvent & { kind: 'resource-expiry'; resourceId: string; lotId: number })
  | (BaseEvent & {
      kind: 'dot';
      targetId: string;
      key: string;
      version: number;
    })
  | (BaseEvent & {
      kind: 'status-expiry';
      targetId: string;
      statusId: string;
      version: number;
    })
  | (BaseEvent & { kind: 'state-expiry'; stateId: string; version: number })
  | (BaseEvent & { kind: 'automatic-summon'; summonId: string });

type UnqueuedEvent = SimulationEvent extends infer Event
  ? Event extends SimulationEvent
    ? Omit<Event, 'order'>
    : never
  : never;

interface AppliedStatus {
  spec: Status;
  stacks: number;
  expiresAt: number;
  version: number;
}

interface AppliedDot {
  actionId: string;
  amount: number;
  damageType: string;
  interval: number;
  expiresAt: number;
  stacks: number;
  abilityStacks: number;
  summonStacks: number;
  version: number;
}

interface TargetState {
  spec: ScenarioEnemy;
  health: number;
  distance: number;
  lastUpdate: number;
  dead: boolean;
  escaped: boolean;
  revealedUntil: number;
  statuses: Map<string, AppliedStatus>;
  dots: Map<string, AppliedDot>;
  forcedMovementApplications: Map<string, number>;
}

interface ResourceState {
  spec: Resource;
  amount: number;
  nextLotId: number;
  expiringLots: Map<number, { amount: number; expiresAt: number }>;
}

interface AbilityState {
  spec: Ability;
  maximumCharges: number;
  charges: number;
  lastCastAt: number | null;
  nextAttemptAt: number | null;
}

interface SummonInstance {
  id: number;
  summonId: string;
  expiresAt: number;
  contribution: Contribution;
  lastActionAt?: number;
  nextActionAt?: number;
}

function enemy(
  id: string,
  spawnSeconds: number,
  startDistanceWorldUnits: number,
  speedWorldUnitsPerSecond: number,
  healthHitPoints: number,
  tags: string[] = [],
  resistances: Record<string, number> = {}
): ScenarioEnemy {
  return {
    id,
    spawnSeconds,
    startDistanceWorldUnits,
    speedWorldUnitsPerSecond,
    healthHitPoints,
    tags,
    resistances
  };
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function fingerprintUnitBuild(build: UnitBuild): string {
  return fingerprint(build);
}

export function fingerprintSimulationScenario(scenario: SimulationScenario): string {
  return fingerprint(scenario);
}

export function validateSimulationScenario(value: unknown): ValidationReport<SimulationScenario> {
  const validation = validateSchema(simulationScenarioSchema, value);
  if (!validation.valid || validation.value === undefined) return validation;

  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  validation.value.enemies.forEach(({ id }, index) => {
    if (seen.has(id)) {
      issues.push({
        code: 'SCENARIO_ENEMY_ID_DUPLICATE',
        path: `/enemies/${index}/id`,
        message: `Enemy ID '${id}' is duplicated.`,
        category: 'simulation'
      });
    }
    seen.add(id);
  });

  return issues.length === 0
    ? { valid: true, value: validation.value, issues }
    : { valid: false, issues: sortAndLimitIssues(issues) };
}

function assertSimulationScenario(value: unknown): asserts value is SimulationScenario {
  const validation = validateSimulationScenario(value);
  if (validation.valid) return;
  const first = validation.issues[0];
  throw new TypeError(
    first === undefined
      ? 'Invalid simulation scenario.'
      : `Invalid simulation scenario: ${first.code} at ${first.path}: ${first.message}`
  );
}

export function simulateBuild(build: UnitBuild, scenario: SimulationScenario): SimulationReport {
  assertSimulationScenario(scenario);
  const buildFingerprint = fingerprintUnitBuild(build);
  const scenarioFingerprint = fingerprintSimulationScenario(scenario);
  const actions = new Map(build.actions.map((action) => [action.id, action]));
  const abilities = new Map(
    build.abilities
      .filter((ability) => ability.unlockedByDefault)
      .map((ability) => [ability.id, ability])
  );
  const summons = new Map(
    build.summons.filter((summon) => summon.unlockedByDefault).map((summon) => [summon.id, summon])
  );
  const statuses = new Map(build.statuses.map((status) => [status.id, status]));
  const resources = new Map<string, ResourceState>(
    build.resources
      .filter((resource) => resource.unlockedByDefault)
      .map((resource) => [
        resource.id,
        {
          spec: resource,
          amount: Math.min(resource.cap, resource.startingAmount),
          nextLotId: 0,
          expiringLots: new Map()
        }
      ])
  );
  const targets = new Map<string, TargetState>();
  const warnings = new Set<string>();

  for (const spec of scenario.enemies) {
    if (targets.has(spec.id)) warnings.add(`Duplicate scenario enemy id ignored: ${spec.id}.`);
    else {
      targets.set(spec.id, {
        spec,
        health: spec.healthHitPoints,
        distance: spec.startDistanceWorldUnits,
        lastUpdate: spec.spawnSeconds,
        dead: false,
        escaped: spec.startDistanceWorldUnits === 0,
        revealedUntil: -1,
        statuses: new Map(),
        dots: new Map(),
        forcedMovementApplications: new Map()
      });
    }
  }

  const resourceGenerated = new Map([...resources.keys()].map((id) => [id, 0]));
  const resourceSpent = new Map([...resources.keys()].map((id) => [id, 0]));
  const damageByAction = new Map<string, number>();
  const affectedTargets = new Set<string>();
  const secondaryCounts = new Map<string, number>();
  const states = new Map(build.states.map((state) => [state.id, state.initialValue]));
  const stateSpecs = new Map(build.states.map((state) => [state.id, state]));
  const stateVersions = new Map(build.states.map((state) => [state.id, 0]));
  const summonInstances = new Map<number, SummonInstance>();
  const summonReadyAt = new Map<string, number>();
  const abilityStates = new Map<string, AbilityState>();
  const resourceWaiters = new Set<AbilityState>();
  const events: SimulationEvent[] = [];
  let randomState = scenario.seed >>> 0;
  let order = 0;
  let cycleId = 0;
  let nextSummonId = 0;
  let totalSummons = 0;
  let now = 0;
  let lastResourceUpdate = 0;
  let eventCount = 0;
  let damage = 0;
  let kills = 0;
  let hits = 0;
  let statusUptime = 0;
  let economy = build.economy.incomePerWaveCredits ?? 0;
  let abilityDamage = 0;
  let summonDamage = 0;
  let targetingFailures = 0;
  let firstEffect: number | null = economy > 0 ? 0 : null;
  if (economy > 0) {
    warnings.add(
      'Passive incomePerWaveCredits is credited once at time 0; each scenario models one wave.'
    );
  }

  const schedule = (event: UnqueuedEvent) => {
    if (!Number.isFinite(event.time) || event.time < -EPSILON) return;
    if (events.length >= MAX_QUEUED_EVENTS) {
      warnings.add(`Queued event limit ${MAX_QUEUED_EVENTS} reached.`);
      return;
    }
    const queued = { ...event, order: order++ } as SimulationEvent;
    let low = 0;
    let high = events.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      const other = events[middle];
      if (
        other &&
        (other.time < queued.time || (other.time === queued.time && other.order < queued.order))
      ) {
        low = middle + 1;
      } else high = middle;
    }
    events.splice(low, 0, queued);
  };

  const random = () => {
    randomState += 0x6d2b79f5;
    let value = randomState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  const noteEffect = (time: number) => {
    if (firstEffect === null || time < firstEffect) firstEffect = time;
  };

  const activeStatusCount = (target: TargetState) => {
    let count = 0;
    for (const status of target.statuses.values()) {
      if (status.expiresAt > target.lastUpdate + EPSILON) count++;
    }
    return count;
  };

  const targetSpeed = (target: TargetState) => {
    let slow = 0;
    let stunned = false;
    for (const applied of target.statuses.values()) {
      if (applied.expiresAt <= target.lastUpdate + EPSILON) continue;
      if (applied.spec.kind === 'slow') slow += applied.spec.magnitude * applied.stacks;
      if (applied.spec.kind === 'stun') stunned = true;
    }
    return stunned ? 0 : target.spec.speedWorldUnitsPerSecond * Math.max(0, 1 - Math.min(1, slow));
  };

  const syncTarget = (target: TargetState, time: number) => {
    if (target.dead || target.escaped || time <= target.spec.spawnSeconds) return;
    const from = Math.max(target.lastUpdate, target.spec.spawnSeconds);
    const elapsed = Math.max(0, time - from);
    if (elapsed === 0) return;
    const speed = targetSpeed(target);
    const activeElapsed = speed > 0 ? Math.min(elapsed, target.distance / speed) : elapsed;
    statusUptime = finiteAdd(
      statusUptime,
      activeStatusCount(target) * activeElapsed,
      'Status uptime'
    );
    target.distance -= speed * elapsed;
    target.lastUpdate = time;
    if (target.distance <= 0) target.escaped = true;
  };

  const sync = (time: number) => {
    for (const resource of resources.values()) {
      for (const [lotId, lot] of resource.expiringLots) {
        if (lot.expiresAt > time) continue;
        resource.amount = Math.max(0, resource.amount - lot.amount);
        resource.expiringLots.delete(lotId);
      }
    }
    const elapsed = Math.max(0, time - lastResourceUpdate);
    if (elapsed > 0) {
      for (const resource of resources.values()) {
        if (resource.spec.recovery.type !== 'regeneration') continue;
        addResource(resource.spec.id, resource.spec.recovery.amountPerSecond * elapsed);
      }
      lastResourceUpdate = time;
    }
    for (const target of targets.values()) syncTarget(target, time);
  };

  const addResource = (resourceId: string, requested: number, expires = true) => {
    const resource = resources.get(resourceId);
    if (!resource) {
      warnings.add(`Resource effect references unavailable resource: ${resourceId}.`);
      return 0;
    }
    const amount = Math.max(0, Math.min(requested, resource.spec.cap - resource.amount));
    if (amount === 0) return 0;
    resource.amount += amount;
    resourceGenerated.set(
      resourceId,
      finiteAdd(resourceGenerated.get(resourceId) ?? 0, amount, `Resource ${resourceId} generated`)
    );
    if (expires && resource.spec.expirySeconds !== undefined) {
      const lotId = resource.nextLotId++;
      resource.expiringLots.set(lotId, {
        amount,
        expiresAt: now + resource.spec.expirySeconds
      });
      schedule({
        kind: 'resource-expiry',
        time: now + resource.spec.expirySeconds,
        resourceId,
        lotId
      });
    }
    return amount;
  };

  const spendResource = (resourceId: string, requested: number) => {
    const resource = resources.get(resourceId);
    if (!resource || requested <= 0) return 0;
    let remaining = Math.min(resource.amount, requested);
    const spent = remaining;
    for (const [lotId, lot] of [...resource.expiringLots].sort(
      ([leftId, left], [rightId, right]) => left.expiresAt - right.expiresAt || leftId - rightId
    )) {
      if (remaining <= 0) break;
      const fromLot = Math.min(lot.amount, remaining);
      lot.amount -= fromLot;
      remaining -= fromLot;
      if (lot.amount <= 0) resource.expiringLots.delete(lotId);
    }
    resource.amount -= spent;
    resourceSpent.set(
      resourceId,
      finiteAdd(resourceSpent.get(resourceId) ?? 0, spent, `Resource ${resourceId} spent`)
    );
    return spent;
  };

  const generateResources = (event: Resource['generation'][number]['event'], actionId?: string) => {
    for (const resource of resources.values()) {
      resource.spec.generation.forEach((generation) => {
        if (
          generation.event === event &&
          (generation.actionId === undefined || generation.actionId === actionId)
        ) {
          addResource(resource.spec.id, generation.amount);
        }
      });
    }
  };

  const comparison = (left: unknown, operator: string, right: unknown) => {
    switch (operator) {
      case 'eq':
        return left === right;
      case 'neq':
        return left !== right;
      case 'gt':
        return typeof left === 'number' && typeof right === 'number' && left > right;
      case 'gte':
        return typeof left === 'number' && typeof right === 'number' && left >= right;
      case 'lt':
        return typeof left === 'number' && typeof right === 'number' && left < right;
      case 'lte':
        return typeof left === 'number' && typeof right === 'number' && left <= right;
      case 'contains':
        return Array.isArray(left) ? left.includes(right) : String(left).includes(String(right));
      default:
        return false;
    }
  };

  const invalidCondition = (action: Action, index: number) => {
    warnings.add(
      `Action ${action.id} condition ${index} is not executable; condition fails closed.`
    );
    return false;
  };

  const conditionsPass = (
    action: Action,
    target?: TargetState,
    deferTarget = false,
    paid = false
  ) =>
    action.conditions.every((condition, index) => {
      switch (condition.subject) {
        case 'resource': {
          // Resource preconditions were satisfied before payment; spending must not cancel output.
          if (paid) return true;
          if (
            condition.referenceId === undefined ||
            !resources.has(condition.referenceId) ||
            typeof condition.value !== 'number' ||
            condition.operator === 'contains'
          ) {
            return invalidCondition(action, index);
          }
          return comparison(
            resources.get(condition.referenceId)?.amount,
            condition.operator,
            condition.value
          );
        }
        case 'state': {
          if (condition.referenceId === undefined || !states.has(condition.referenceId)) {
            return invalidCondition(action, index);
          }
          const state = states.get(condition.referenceId);
          const compatible =
            typeof state === typeof condition.value &&
            (typeof state === 'number'
              ? condition.operator !== 'contains'
              : typeof state === 'string'
                ? condition.operator === 'eq' ||
                  condition.operator === 'neq' ||
                  condition.operator === 'contains'
                : condition.operator === 'eq' || condition.operator === 'neq');
          return compatible
            ? comparison(state, condition.operator, condition.value)
            : invalidCondition(action, index);
        }
        case 'target-tag':
          if (
            condition.referenceId !== undefined ||
            condition.operator !== 'contains' ||
            typeof condition.value !== 'string'
          ) {
            return invalidCondition(action, index);
          }
          return deferTarget && !target
            ? true
            : comparison(target?.spec.tags ?? [], condition.operator, condition.value);
        case 'health-fraction':
          if (
            condition.referenceId !== undefined ||
            condition.operator === 'contains' ||
            typeof condition.value !== 'number'
          ) {
            return invalidCondition(action, index);
          }
          return deferTarget && !target
            ? true
            : comparison(
                target ? target.health / target.spec.healthHitPoints : undefined,
                condition.operator,
                condition.value
              );
        default:
          return invalidCondition(action, index);
      }
    });

  const boundedCount = (value: number, limit: number, label: string) => {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value < 0) {
      const truncated = value > 0 ? limit : 0;
      warnings.add(`${label} is not a safe non-negative integer; truncated to ${truncated}.`);
      return truncated;
    }
    if (value > limit) {
      warnings.add(`${label} exceeds simulator cap ${limit}; truncated.`);
      return limit;
    }
    return value;
  };

  const finiteAdd = (current: number, delta: number, label: string) => {
    const value = current + delta;
    if (Number.isFinite(value) && Math.abs(value) <= MAX_REPORT_MAGNITUDE) return value;
    warnings.add(`${label} exceeded the finite report range; capped.`);
    return value < 0 || (value === -Infinity && delta < 0)
      ? -MAX_REPORT_MAGNITUDE
      : MAX_REPORT_MAGNITUDE;
  };

  const summonIsActive = (summonInstanceId?: number) => {
    if (summonInstanceId === undefined) return true;
    const instance = summonInstances.get(summonInstanceId);
    return instance !== undefined && instance.expiresAt > now + EPSILON;
  };

  const actionCosts = (action: Action, abilityId?: string) => {
    const costs = new Map(
      action.resourceCosts.map((cost) => [cost.resourceId, cost.amountPerCycle])
    );
    for (const resource of resources.values()) {
      for (const spend of resource.spec.spend) {
        if (
          (spend.event === 'action' && spend.referenceId === action.id) ||
          (spend.event === 'ability' && spend.referenceId === abilityId)
        ) {
          costs.set(resource.spec.id, Math.max(costs.get(resource.spec.id) ?? 0, spend.amount));
        }
      }
    }
    return costs;
  };

  const payCosts = (costs: Map<string, number>) => {
    for (const [resourceId, amount] of costs) {
      if ((resources.get(resourceId)?.amount ?? -1) < amount) return false;
    }
    for (const [resourceId, amount] of costs) {
      spendResource(resourceId, amount);
    }
    return true;
  };

  const updateStates = (action: Action) => {
    for (const interaction of action.stateInteractions) {
      const spec = stateSpecs.get(interaction.stateId);
      if (!spec) {
        warnings.add(`Action ${action.id} references unavailable state: ${interaction.stateId}.`);
        continue;
      }
      const version = (stateVersions.get(spec.id) ?? 0) + 1;
      stateVersions.set(spec.id, version);
      if (interaction.operation === 'clear') states.set(spec.id, spec.initialValue);
      else if (interaction.operation === 'set')
        states.set(spec.id, interaction.value ?? spec.initialValue);
      else {
        const previous = states.get(spec.id);
        const increment = typeof interaction.value === 'number' ? interaction.value : 1;
        if (typeof previous !== 'number') continue;
        states.set(
          spec.id,
          Math.max(
            spec.minimum ?? -Infinity,
            Math.min(spec.maximum ?? Infinity, previous + increment)
          )
        );
      }
      if (interaction.operation !== 'clear' && spec.expirySeconds !== undefined) {
        schedule({
          kind: 'state-expiry',
          time: now + spec.expirySeconds,
          stateId: spec.id,
          version
        });
      }
    }
  };

  const isTargeted = (effect: Effect) =>
    effect.type === 'damage' ||
    effect.type === 'damage-over-time' ||
    effect.type === 'status' ||
    effect.type === 'forced-movement' ||
    effect.type === 'reveal' ||
    effect.type === 'secondary-action';

  const targetEffectPhase = (effect: Effect) => {
    if (effect.type === 'status' || effect.type === 'reveal') return 0;
    if (effect.type === 'damage') return 1;
    if (effect.type === 'damage-over-time' || effect.type === 'forced-movement') return 2;
    return 3;
  };

  const orderedTargetEffects = (action: Action) =>
    action.effects
      .map((effect, index) => ({ effect, index }))
      .filter(({ effect }) => isTargeted(effect))
      .sort(
        (left, right) =>
          targetEffectPhase(left.effect) - targetEffectPhase(right.effect) ||
          left.index - right.index
      )
      .map(({ effect }) => effect);

  const requiresViableTarget = (action: Action) =>
    action.conditions.some(
      (condition) => condition.subject === 'target-tag' || condition.subject === 'health-fraction'
    ) ||
    (action.targeting.type !== 'self' &&
      action.targeting.type !== 'ally' &&
      action.targeting.type !== 'position' &&
      action.effects.some(isTargeted));

  const candidatesFor = (
    action: Action,
    maximumTargets: number,
    orderTargets = true,
    paid = false
  ) => {
    if (
      action.targeting.type === 'self' ||
      action.targeting.type === 'ally' ||
      action.targeting.type === 'position'
    ) {
      return [];
    }
    let candidates = [...targets.values()].filter((target) => {
      if (
        target.dead ||
        target.escaped ||
        now + EPSILON < target.spec.spawnSeconds ||
        target.distance > (action.rangeWorldUnits ?? build.baseStats.rangeWorldUnits)
      ) {
        return false;
      }
      if (action.targeting.includeTags.some((tag) => !target.spec.tags.includes(tag))) return false;
      if (action.targeting.excludeTags.some((tag) => target.spec.tags.includes(tag))) return false;
      if (
        target.spec.tags.includes('concealed') &&
        target.revealedUntil <= now + EPSILON &&
        !action.tags.includes('detect-concealed')
      ) {
        return false;
      }
      if (action.targeting.type === 'marked') {
        const marked = [...target.statuses.values()].some(
          (status) => status.spec.kind === 'mark' && status.expiresAt > now + EPSILON
        );
        if (!marked) return false;
      }
      return conditionsPass(action, target, false, paid);
    });

    if (!orderTargets) return candidates.slice(0, maximumTargets);

    const byId = (left: TargetState, right: TargetState) =>
      compareText(left.spec.id, right.spec.id);
    switch (action.targeting.type) {
      case 'last':
        candidates.sort((left, right) => right.distance - left.distance || byId(left, right));
        break;
      case 'strongest':
        candidates.sort((left, right) => right.health - left.health || byId(left, right));
        break;
      case 'weakest':
        candidates.sort((left, right) => left.health - right.health || byId(left, right));
        break;
      case 'random': {
        candidates.sort(byId);
        const shuffled: TargetState[] = [];
        while (candidates.length > 0) {
          shuffled.push(candidates.splice(Math.floor(random() * candidates.length), 1)[0]!);
        }
        candidates = shuffled;
        break;
      }
      default:
        candidates.sort((left, right) => left.distance - right.distance || byId(left, right));
    }
    return candidates.slice(0, maximumTargets);
  };

  const vulnerability = (target: TargetState) => {
    let amount = 0;
    for (const status of target.statuses.values()) {
      if (status.spec.kind === 'vulnerability' && status.expiresAt > now + EPSILON) {
        amount = Math.min(MAX_REPORT_MAGNITUDE, amount + status.spec.magnitude * status.stacks);
      }
    }
    return 1 + amount;
  };

  const dealDamage = (
    target: TargetState,
    amount: number,
    damageType: string,
    actionId: string,
    contribution: Contribution
  ) => {
    if (target.dead || target.escaped) return 0;
    const resistance = Object.hasOwn(target.spec.resistances, damageType)
      ? target.spec.resistances[damageType]!
      : Object.hasOwn(target.spec.resistances, '*')
        ? target.spec.resistances['*']!
        : 0;
    const effective = Math.max(0, amount * Math.max(0, 1 - resistance) * vulnerability(target));
    const applied = Math.min(target.health, effective);
    if (applied <= 0) return 0;
    target.health -= applied;
    damage = finiteAdd(damage, applied, 'Total damage');
    damageByAction.set(
      actionId,
      finiteAdd(damageByAction.get(actionId) ?? 0, applied, `Action ${actionId} damage`)
    );
    if (contribution.ability) {
      abilityDamage = finiteAdd(abilityDamage, applied, 'Ability damage');
    }
    if (contribution.summon) {
      summonDamage = finiteAdd(summonDamage, applied, 'Summon damage');
    }
    affectedTargets.add(target.spec.id);
    noteEffect(now);
    if (target.health <= 0 && !target.dead) {
      target.dead = true;
      kills++;
      generateResources('on-kill', actionId);
    }
    return applied;
  };

  const hitRemovalSnapshot = (target: TargetState) =>
    new Map(
      [...target.statuses]
        .filter(([, status]) => status.spec.removal === 'hit')
        .map(([id, status]) => [id, status.version])
    );

  const removeHitStatuses = (target: TargetState, snapshot: Map<string, number>) => {
    for (const [statusId, version] of snapshot) {
      if (target.statuses.get(statusId)?.version === version) target.statuses.delete(statusId);
    }
  };

  const applyStatus = (target: TargetState, effect: Extract<Effect, { type: 'status' }>) => {
    const spec = statuses.get(effect.statusId);
    if (!spec) {
      warnings.add(`Status effect references unavailable status: ${effect.statusId}.`);
      return;
    }
    if (spec.removal === 'manual') {
      warnings.add(`Status ${spec.id} uses unsupported manual removal; application skipped.`);
      return;
    }
    const stored = target.statuses.get(spec.id);
    const previous = stored && stored.expiresAt > now + EPSILON ? stored : undefined;
    const version = (stored?.version ?? 0) + 1;
    const maximumStacks = boundedCount(
      spec.maximumStacks,
      UNIT_EXECUTION_LIMITS.maximumStacks,
      `Status ${spec.id} maximum stacks`
    );
    const appliedStacks = boundedCount(
      effect.stacks,
      UNIT_EXECUTION_LIMITS.maximumStacks,
      `Effect ${effect.id} stacks`
    );
    if (maximumStacks === 0 || appliedStacks === 0) return;
    const stacks =
      effect.stacking === 'stack'
        ? Math.min(maximumStacks, (previous?.stacks ?? 0) + appliedStacks)
        : effect.stacking === 'refresh'
          ? Math.min(maximumStacks, previous?.stacks ?? appliedStacks)
          : Math.min(maximumStacks, appliedStacks);
    target.statuses.set(spec.id, {
      spec,
      stacks,
      expiresAt: now + effect.durationSeconds,
      version
    });
    schedule({
      kind: 'status-expiry',
      time: now + effect.durationSeconds,
      targetId: target.spec.id,
      statusId: spec.id,
      version
    });
    affectedTargets.add(target.spec.id);
    noteEffect(now);
  };

  const applyDot = (
    target: TargetState,
    action: Action,
    effect: Extract<Effect, { type: 'damage-over-time' }>,
    contribution: Contribution
  ) => {
    const key = `${action.id}:${effect.id}`;
    const stored = target.dots.get(key);
    const previous = stored && stored.expiresAt > now + EPSILON ? stored : undefined;
    const version = (stored?.version ?? 0) + 1;
    const maximumStacks = boundedCount(
      effect.maximumStacks,
      UNIT_EXECUTION_LIMITS.maximumStacks,
      `Damage-over-time effect ${effect.id} maximum stacks`
    );
    if (maximumStacks === 0) return;
    const previousStacks = previous?.stacks ?? 0;
    const stacks =
      effect.stacking === 'stack'
        ? Math.min(maximumStacks, previousStacks + 1)
        : effect.stacking === 'refresh'
          ? Math.min(maximumStacks, previous?.stacks ?? 1)
          : 1;
    const admittedStacks = Math.max(0, stacks - previousStacks);
    target.dots.set(key, {
      actionId: action.id,
      amount: effect.amountHitPointsPerTick,
      damageType: effect.damageType,
      interval: effect.tickIntervalSeconds,
      expiresAt: now + effect.durationSeconds,
      stacks,
      abilityStacks:
        effect.stacking === 'stack'
          ? (previous?.abilityStacks ?? 0) + (contribution.ability ? admittedStacks : 0)
          : contribution.ability
            ? stacks
            : 0,
      summonStacks:
        effect.stacking === 'stack'
          ? (previous?.summonStacks ?? 0) + (contribution.summon ? admittedStacks : 0)
          : contribution.summon
            ? stacks
            : 0,
      version
    });
    affectedTargets.add(target.spec.id);
    noteEffect(now);
    if (effect.tickIntervalSeconds <= effect.durationSeconds + EPSILON) {
      schedule({
        kind: 'dot',
        time: now + effect.tickIntervalSeconds,
        targetId: target.spec.id,
        key,
        version
      });
    }
  };

  const spawnSummon = (
    summonId: string,
    requested: number,
    duration: number,
    contribution: Contribution
  ) => {
    const summon = summons.get(summonId);
    if (!summon) {
      warnings.add(`Spawn effect references unavailable summon: ${summonId}.`);
      return;
    }
    if ((summonReadyAt.get(summon.id) ?? 0) > now + EPSILON) return;
    for (const [id, instance] of summonInstances) {
      if (instance.expiresAt <= now + EPSILON) summonInstances.delete(id);
    }
    const spawnCount = boundedCount(
      requested,
      UNIT_EXECUTION_LIMITS.maximumSpawnInstances,
      `Summon ${summon.id} instances per cycle`
    );
    const maximumConcurrent = boundedCount(
      summon.maximumConcurrentInstances,
      UNIT_EXECUTION_LIMITS.maximumConcurrentSummons,
      `Summon ${summon.id} maximum concurrent instances`
    );
    if (maximumConcurrent === 0) return;
    for (let index = 0; index < spawnCount; index++) {
      if (totalSummons >= MAX_SUMMONS) {
        warnings.add(`Summon creation limit ${MAX_SUMMONS} reached.`);
        break;
      }
      const sameType = [...summonInstances.values()]
        .filter((instance) => instance.summonId === summon.id)
        .sort((left, right) => left.id - right.id);
      if (sameType.length >= maximumConcurrent) {
        const oldest = sameType[0]!;
        if (summon.replacement === 'reject') break;
        if (summon.replacement === 'refresh') {
          oldest.expiresAt = now + Math.min(duration, summon.durationSeconds);
          if (oldest.nextActionAt === undefined) {
            const action = actions.get(summon.actionId);
            const repeat = action ? actionPeriod(action) : 0;
            if (repeat > 0) {
              const nextActionAt = Math.max(now, (oldest.lastActionAt ?? now) + repeat);
              if (nextActionAt < oldest.expiresAt - EPSILON) {
                oldest.nextActionAt = nextActionAt;
                schedule({
                  kind: 'action',
                  time: nextActionAt,
                  actionId: summon.actionId,
                  depth: 0,
                  contribution: oldest.contribution,
                  summonInstanceId: oldest.id
                });
              }
            }
          }
          continue;
        }
        summonInstances.delete(oldest.id);
      }
      const id = nextSummonId++;
      const instance: SummonInstance = {
        id,
        summonId: summon.id,
        expiresAt: now + Math.min(duration, summon.durationSeconds),
        contribution: { ability: contribution.ability, summon: true },
        nextActionAt: now
      };
      summonInstances.set(id, instance);
      totalSummons++;
      schedule({
        kind: 'action',
        time: now,
        actionId: summon.actionId,
        depth: 0,
        contribution: instance.contribution,
        summonInstanceId: id
      });
      noteEffect(now);
    }
    summonReadyAt.set(summon.id, now + summon.cooldownSeconds);
  };

  const invokeSecondary = (
    effect: Extract<Effect, { type: 'secondary-action' }>,
    depth: number,
    contribution: Contribution,
    actionCycleId: number,
    summonInstanceId?: number
  ) => {
    const key = `${actionCycleId}:${effect.id}`;
    const used = secondaryCounts.get(key) ?? 0;
    const maximumTriggers = boundedCount(
      effect.maximumTriggersPerCycle,
      UNIT_EXECUTION_LIMITS.maximumSecondaryTriggersPerCycle,
      `Secondary effect ${effect.id} triggers per cycle`
    );
    if (used >= maximumTriggers) return;
    secondaryCounts.set(key, used + 1);
    schedule({
      kind: 'action',
      time: now,
      actionId: effect.actionId,
      depth: depth + 1,
      contribution,
      cycleId: actionCycleId,
      summonInstanceId
    });
  };

  const applyGlobalEffect = (
    effect: Effect,
    depth: number,
    contribution: Contribution,
    actionCycleId: number,
    summonInstanceId?: number
  ) => {
    switch (effect.type) {
      case 'resource-change': {
        const resource = resources.get(effect.resourceId);
        if (!resource) {
          warnings.add(`Resource effect references unavailable resource: ${effect.resourceId}.`);
          return;
        }
        if (effect.operation === 'add') addResource(effect.resourceId, effect.amount);
        else if (effect.operation === 'spend') spendResource(effect.resourceId, effect.amount);
        else {
          const next = Math.min(resource.spec.cap, effect.amount);
          const difference = next - resource.amount;
          if (difference >= 0) addResource(effect.resourceId, difference);
          else spendResource(effect.resourceId, -difference);
        }
        noteEffect(now);
        break;
      }
      case 'spawn':
        spawnSummon(effect.summonId, effect.instances, effect.durationSeconds, contribution);
        break;
      case 'secondary-action':
        invokeSecondary(effect, depth, contribution, actionCycleId, summonInstanceId);
        break;
      case 'economy-change':
        economy = finiteAdd(economy, effect.amountCredits, 'Economy contribution');
        noteEffect(now);
        break;
      case 'stat-modifier':
      case 'heal':
      case 'shield':
      case 'transform':
        warnings.add(`Effect ${effect.id} (${effect.type}) is not modelled by simulator 0.1.`);
        break;
      default:
        break;
    }
  };

  const applyTargetEffect = (
    target: TargetState,
    action: Action,
    effect: Effect,
    contribution: Contribution,
    depth: number,
    actionCycleId: number,
    summonInstanceId?: number
  ) => {
    if (effect.type === 'secondary-action') {
      invokeSecondary(effect, depth, contribution, actionCycleId, summonInstanceId);
      return;
    }
    if (target.dead || target.escaped) return;
    switch (effect.type) {
      case 'damage':
        dealDamage(target, effect.amountHitPoints, effect.damageType, action.id, contribution);
        break;
      case 'damage-over-time':
        applyDot(target, action, effect, contribution);
        break;
      case 'status':
        applyStatus(target, effect);
        break;
      case 'forced-movement': {
        const key = `${action.id}:${effect.id}`;
        const used = target.forcedMovementApplications.get(key) ?? 0;
        const maximumApplications = boundedCount(
          effect.maximumApplicationsPerTarget,
          UNIT_EXECUTION_LIMITS.maximumForcedMovementApplicationsPerTarget,
          `Forced movement effect ${effect.id} applications per target`
        );
        if (used >= maximumApplications) break;
        target.forcedMovementApplications.set(key, used + 1);
        target.distance = Math.max(0, target.distance + effect.distanceWorldUnits);
        if (target.distance <= 0) target.escaped = true;
        affectedTargets.add(target.spec.id);
        noteEffect(now);
        break;
      }
      case 'reveal':
        target.revealedUntil = Math.max(target.revealedUntil, now + effect.durationSeconds);
        affectedTargets.add(target.spec.id);
        noteEffect(now);
        break;
      default:
        break;
    }
  };

  const invokeAction = (
    actionId: string,
    depth: number,
    contribution: Contribution,
    actionCycleId: number,
    abilityId?: string,
    summonInstanceId?: number
  ) => {
    if (depth > MAX_DEPTH) {
      warnings.add(`Secondary action depth limit ${MAX_DEPTH} reached.`);
      return false;
    }
    if (!summonIsActive(summonInstanceId)) return false;
    const action = actions.get(actionId);
    if (!action) {
      warnings.add(`Simulation references unavailable action: ${actionId}.`);
      return false;
    }
    if (!conditionsPass(action, undefined, true)) return false;
    const globalOutput =
      action.stateInteractions.some((interaction) => states.has(interaction.stateId)) ||
      action.effects.some(
        (effect) =>
          effect.type === 'economy-change' ||
          (effect.type === 'resource-change' && resources.has(effect.resourceId)) ||
          (effect.type === 'spawn' && summons.has(effect.summonId))
      );
    const targetedOutput = action.effects.some(isTargeted);
    const targetRequired = requiresViableTarget(action);
    let viableTarget = false;
    if (targetRequired) {
      const maximumTargets = boundedCount(
        action.targeting.maximumTargets,
        UNIT_EXECUTION_LIMITS.maximumTargets,
        `Action ${action.id} primary target count`
      );
      viableTarget = candidatesFor(action, maximumTargets, false).length > 0;
    }
    if (targetRequired && !viableTarget) {
      targetingFailures++;
      return false;
    }
    if (!globalOutput && !viableTarget) {
      if (targetedOutput) targetingFailures++;
      else warnings.add(`Action ${action.id} has no supported viable output; skipped.`);
      return false;
    }
    if (!payCosts(actionCosts(action, abilityId))) {
      return false;
    }
    schedule({
      kind: 'resolve',
      time: now + action.timing.windupSeconds,
      actionId,
      depth,
      contribution,
      cycleId: actionCycleId,
      summonInstanceId
    });
    return true;
  };

  const abilityCooldown = (ability: Ability, action: Action | undefined) =>
    Math.max(ability.cooldownSeconds, action?.timing.cooldownSeconds ?? 0);

  const actionPeriod = (action: Action) =>
    action.trigger.type === 'interval'
      ? Math.max(action.trigger.intervalSeconds, action.timing.cooldownSeconds)
      : 0;

  const abilityIsEligible = (ability: Ability) =>
    scenario.abilityPolicy === 'on-cooldown'
      ? ability.type === 'active' ||
        ability.type === 'automatic' ||
        ability.type === 'transformation'
      : scenario.abilityPolicy === 'automatic' && ability.type === 'automatic';

  const scheduleAbilityAttempt = (state: AbilityState, time: number) => {
    if (state.nextAttemptAt !== null && state.nextAttemptAt <= time + EPSILON) return;
    state.nextAttemptAt = time;
    schedule({ kind: 'ability', time, abilityId: state.spec.id });
  };

  for (const ability of abilities.values()) {
    const maximumCharges = boundedCount(
      ability.maximumCharges,
      UNIT_EXECUTION_LIMITS.maximumAbilityCharges,
      `Ability ${ability.id} maximum charges`
    );
    abilityStates.set(ability.id, {
      spec: ability,
      maximumCharges,
      charges: maximumCharges,
      lastCastAt: null,
      nextAttemptAt: null
    });
  }

  generateResources('on-wave-start');
  for (const resource of resources.values()) {
    if (resource.spec.generation.some((generation) => generation.event === 'on-damage')) {
      warnings.add(
        `Resource ${resource.spec.id} on-damage generation is unsupported and will not execute.`
      );
    }
    if (resource.spec.recovery.type === 'refill-on-wave') {
      addResource(resource.spec.id, resource.spec.recovery.amount);
    }
    resource.spec.generation.forEach((generation, generationIndex) => {
      if (generation.event === 'time' && generation.intervalSeconds !== undefined) {
        schedule({
          kind: 'resource',
          time: generation.intervalSeconds,
          resourceId: resource.spec.id,
          generationIndex
        });
      }
    });
  }

  for (const action of build.actions) {
    if (!action.unlockedByDefault) continue;
    if (action.trigger.type !== 'interval') {
      if (action.trigger.type !== 'manual')
        warnings.add(`Primary trigger ${action.trigger.type} is not scheduled by simulator 0.1.`);
      continue;
    }
    schedule({
      kind: 'action',
      time: 0,
      actionId: action.id,
      depth: 0,
      contribution: { ability: false, summon: false },
      repeatSeconds: actionPeriod(action)
    });
  }

  for (const ability of abilities.values()) {
    if (abilityIsEligible(ability)) {
      const state = abilityStates.get(ability.id);
      if (state && state.maximumCharges > 0) {
        scheduleAbilityAttempt(state, ability.initialCooldownSeconds);
      }
    }
  }

  for (const summon of summons.values()) {
    if (summon.activation === 'automatic') {
      schedule({ kind: 'automatic-summon', time: 0, summonId: summon.id });
    }
  }

  while (events.length > 0 && eventCount < MAX_EVENTS) {
    const event = events.shift()!;
    if (event.time > scenario.durationSeconds + EPSILON) break;
    now = Math.max(0, event.time);
    sync(now);
    eventCount++;

    switch (event.kind) {
      case 'action': {
        if (event.summonInstanceId !== undefined) {
          const instance = summonInstances.get(event.summonInstanceId);
          if (!summonIsActive(event.summonInstanceId) || !instance) break;
          if (
            instance.nextActionAt === undefined ||
            Math.abs(instance.nextActionAt - now) > EPSILON
          ) {
            break;
          }
          instance.lastActionAt = now;
          instance.nextActionAt = undefined;
          const action = actions.get(event.actionId);
          const repeat = action ? actionPeriod(action) : 0;
          if (repeat > 0 && now + repeat < instance.expiresAt - EPSILON) {
            instance.nextActionAt = now + repeat;
            schedule({ ...event, time: now + repeat });
          }
        } else if (event.repeatSeconds && event.repeatSeconds > 0) {
          schedule({ ...event, time: now + event.repeatSeconds });
        }
        invokeAction(
          event.actionId,
          event.depth,
          event.contribution,
          event.cycleId ?? ++cycleId,
          event.abilityId,
          event.summonInstanceId
        );
        break;
      }
      case 'resolve': {
        if (!summonIsActive(event.summonInstanceId)) break;
        const action = actions.get(event.actionId);
        if (!action) break;
        if (requiresViableTarget(action)) {
          const maximumTargets = boundedCount(
            action.targeting.maximumTargets,
            UNIT_EXECUTION_LIMITS.maximumTargets,
            `Action ${action.id} primary target count`
          );
          if (candidatesFor(action, maximumTargets, false, true).length === 0) {
            targetingFailures++;
            break;
          }
        }
        updateStates(action);
        for (const effect of action.effects) {
          if (!isTargeted(effect)) {
            applyGlobalEffect(
              effect,
              event.depth,
              event.contribution,
              event.cycleId,
              event.summonInstanceId
            );
          }
        }
        const targetedEffects = action.effects.filter(isTargeted);
        if (targetedEffects.length === 0) break;
        if (
          action.targeting.type === 'self' ||
          action.targeting.type === 'ally' ||
          action.targeting.type === 'position'
        ) {
          warnings.add(
            `Action ${action.id} cannot apply enemy-targeted effects with ${action.targeting.type} targeting; skipped.`
          );
          targetingFailures++;
          break;
        }
        const maximumPrimaryTargets = boundedCount(
          action.targeting.maximumTargets,
          UNIT_EXECUTION_LIMITS.maximumTargets,
          `Action ${action.id} primary target count`
        );
        const pierce = boundedCount(
          action.delivery.maximumTargetsPerProjectile,
          UNIT_EXECUTION_LIMITS.maximumTargets,
          `Delivery ${action.delivery.id} targets per projectile`
        );
        const eligiblePoolLimit = Math.min(
          UNIT_EXECUTION_LIMITS.maximumTargetApplicationsPerCycle,
          maximumPrimaryTargets + Math.max(0, pierce - 1)
        );
        // Targeting bounds primary aims; delivery walks deterministic collateral after each aim.
        const candidates = candidatesFor(action, eligiblePoolLimit, true, true);
        const primaryTargetCount = Math.min(maximumPrimaryTargets, candidates.length);
        if (primaryTargetCount === 0) {
          targetingFailures++;
          break;
        }
        let projectileCount = 0;
        if (action.emitters.length > UNIT_EXECUTION_LIMITS.maximumEmitters) {
          warnings.add(
            `Action ${action.id} emitter definitions exceed cap ${UNIT_EXECUTION_LIMITS.maximumEmitters}; truncated.`
          );
        }
        for (const emitter of action.emitters.slice(0, UNIT_EXECUTION_LIMITS.maximumEmitters)) {
          const emitterCount = boundedCount(
            emitter.emitterCount,
            UNIT_EXECUTION_LIMITS.maximumEmitterCount,
            `Emitter ${emitter.id} count`
          );
          const projectilesPerCycle = boundedCount(
            emitter.projectilesPerCycle,
            UNIT_EXECUTION_LIMITS.maximumProjectilesPerCycle,
            `Emitter ${emitter.id} projectiles per cycle`
          );
          const remaining = UNIT_EXECUTION_LIMITS.maximumEmissionsPerCycle - projectileCount;
          const requested =
            projectilesPerCycle * (action.timing.rateScope === 'per-emitter' ? emitterCount : 1);
          const emitted = Math.min(remaining, requested);
          projectileCount += emitted;
          if (emitted < requested) {
            warnings.add(
              `Action ${action.id} emissions exceed per-cycle cap ${UNIT_EXECUTION_LIMITS.maximumEmissionsPerCycle}; truncated.`
            );
          }
          if (projectileCount === UNIT_EXECUTION_LIMITS.maximumEmissionsPerCycle) break;
        }
        const applicationsPerProjectile = Math.min(pierce, candidates.length);
        const requestedApplications = projectileCount * applicationsPerProjectile;
        const applicationCount = Math.min(
          requestedApplications,
          UNIT_EXECUTION_LIMITS.maximumTargetApplicationsPerCycle
        );
        if (applicationCount < requestedApplications) {
          warnings.add(
            `Action ${action.id} target applications exceed per-cycle cap ${UNIT_EXECUTION_LIMITS.maximumTargetApplicationsPerCycle}; truncated.`
          );
        }
        for (let application = 0; application < applicationCount; application++) {
          const projectile = Math.floor(application / applicationsPerProjectile);
          const collateralIndex = application % applicationsPerProjectile;
          const primaryIndex = projectile % primaryTargetCount;
          const target = candidates[(primaryIndex + collateralIndex) % candidates.length];
          if (!target) continue;
          const projectileDelivery =
            action.delivery.type === 'projectile' ||
            action.delivery.type === 'homing-projectile' ||
            action.delivery.type === 'arc-projectile';
          const speed = action.delivery.projectileSpeedWorldUnitsPerSecond;
          if (projectileDelivery && speed === undefined) {
            warnings.add(
              `Projectile action ${action.id} has no projectile speed; impact is immediate.`
            );
          }
          schedule({
            kind: 'impact',
            time: now + (projectileDelivery && speed ? target.distance / speed : 0),
            actionId: action.id,
            targetId: target.spec.id,
            depth: event.depth,
            contribution: event.contribution,
            cycleId: event.cycleId,
            summonInstanceId: event.summonInstanceId
          });
        }
        break;
      }
      case 'impact': {
        if (!summonIsActive(event.summonInstanceId)) break;
        const action = actions.get(event.actionId);
        const target = targets.get(event.targetId);
        if (!action || !target || target.dead || target.escaped) break;
        const statusesRemovedOnHit = hitRemovalSnapshot(target);
        hits++;
        for (const effect of orderedTargetEffects(action)) {
          applyTargetEffect(
            target,
            action,
            effect,
            event.contribution,
            event.depth,
            event.cycleId,
            event.summonInstanceId
          );
        }
        removeHitStatuses(target, statusesRemovedOnHit);
        generateResources('on-hit', action.id);
        break;
      }
      case 'ability': {
        const state = abilityStates.get(event.abilityId);
        if (
          !state ||
          state.nextAttemptAt === null ||
          Math.abs(state.nextAttemptAt - now) > EPSILON
        ) {
          break;
        }
        state.nextAttemptAt = null;
        resourceWaiters.delete(state);
        if (state.charges <= 0) break;
        const action = actions.get(state.spec.actionId);
        const cooldown = abilityCooldown(state.spec, action);
        const cast = invokeAction(
          state.spec.actionId,
          0,
          { ability: true, summon: false },
          ++cycleId,
          state.spec.id
        );
        if (!cast) {
          const requirements = action
            ? actionCosts(action, state.spec.id)
            : new Map<string, number>();
          for (const condition of action?.conditions ?? []) {
            if (
              condition.subject !== 'resource' ||
              condition.referenceId === undefined ||
              typeof condition.value !== 'number' ||
              !['eq', 'gte', 'gt'].includes(condition.operator)
            )
              continue;
            const threshold =
              condition.value +
              (condition.operator === 'gt'
                ? Math.max(EPSILON, Math.abs(condition.value) * Number.EPSILON * 2)
                : 0);
            requirements.set(
              condition.referenceId,
              Math.max(requirements.get(condition.referenceId) ?? 0, threshold)
            );
          }
          const deficits = [...requirements].filter(
            ([id, required]) => (resources.get(id)?.amount ?? 0) < required
          );
          if (deficits.length > 0) {
            resourceWaiters.add(state);
            // Regeneration is continuous; schedule a threshold, never a polling loop.
            for (const [id, required] of deficits) {
              const resource = resources.get(id);
              if (
                resource?.spec.recovery.type !== 'regeneration' ||
                resource.spec.recovery.amountPerSecond <= 0 ||
                required > resource.spec.cap
              )
                continue;
              const delay = (required - resource.amount) / resource.spec.recovery.amountPerSecond;
              scheduleAbilityAttempt(state, now + Math.max(EPSILON, delay));
            }
          } else {
            const retry = cooldown > 0 ? cooldown : state.spec.rechargeSeconds;
            if (retry > 0) scheduleAbilityAttempt(state, now + retry);
          }
          break;
        }
        state.charges--;
        state.lastCastAt = now;
        if (state.spec.rechargeSeconds > 0) {
          schedule({
            kind: 'ability-recharge',
            time: now + state.spec.rechargeSeconds,
            abilityId: state.spec.id
          });
        } else if (cooldown > 0) {
          state.charges = Math.min(state.maximumCharges, state.charges + 1);
        } else {
          warnings.add(
            `Ability ${state.spec.id} has zero cooldown and recharge; only initial charges execute.`
          );
        }
        if (state.charges > 0) scheduleAbilityAttempt(state, now + cooldown);
        break;
      }
      case 'ability-recharge': {
        const state = abilityStates.get(event.abilityId);
        if (!state) break;
        state.charges = Math.min(state.maximumCharges, state.charges + 1);
        if (state.charges > 0 && state.nextAttemptAt === null && abilityIsEligible(state.spec)) {
          const cooldown = abilityCooldown(state.spec, actions.get(state.spec.actionId));
          const readyAt = Math.max(now, (state.lastCastAt ?? now) + cooldown);
          scheduleAbilityAttempt(state, readyAt);
        }
        break;
      }
      case 'resource': {
        const resource = resources.get(event.resourceId);
        const generation = resource?.spec.generation[event.generationIndex];
        if (!resource || !generation || generation.event !== 'time') break;
        addResource(resource.spec.id, generation.amount);
        if (generation.intervalSeconds !== undefined) {
          schedule({ ...event, time: now + generation.intervalSeconds });
        }
        break;
      }
      case 'resource-expiry': {
        const resource = resources.get(event.resourceId);
        const lot = resource?.expiringLots.get(event.lotId);
        if (resource && lot) {
          resource.amount = Math.max(0, resource.amount - lot.amount);
          resource.expiringLots.delete(event.lotId);
        }
        break;
      }
      case 'dot': {
        const target = targets.get(event.targetId);
        const dot = target?.dots.get(event.key);
        if (!target || !dot || dot.version !== event.version || target.dead || target.escaped)
          break;
        if (now > dot.expiresAt + EPSILON) break;
        const statusesRemovedOnHit = hitRemovalSnapshot(target);
        hits++;
        const applied = dealDamage(target, dot.amount * dot.stacks, dot.damageType, dot.actionId, {
          ability: false,
          summon: false
        });
        if (applied > 0 && dot.abilityStacks > 0) {
          abilityDamage = finiteAdd(
            abilityDamage,
            applied * (dot.abilityStacks / dot.stacks),
            'Ability damage'
          );
        }
        if (applied > 0 && dot.summonStacks > 0) {
          summonDamage = finiteAdd(
            summonDamage,
            applied * (dot.summonStacks / dot.stacks),
            'Summon damage'
          );
        }
        removeHitStatuses(target, statusesRemovedOnHit);
        generateResources('on-hit', dot.actionId);
        if (!target.dead && now + dot.interval <= dot.expiresAt + EPSILON) {
          schedule({ ...event, time: now + dot.interval });
        }
        break;
      }
      case 'status-expiry': {
        const target = targets.get(event.targetId);
        const status = target?.statuses.get(event.statusId);
        if (target && status?.version === event.version) target.statuses.delete(event.statusId);
        break;
      }
      case 'state-expiry': {
        const spec = stateSpecs.get(event.stateId);
        if (spec && stateVersions.get(event.stateId) === event.version) {
          states.set(event.stateId, spec.initialValue);
          stateVersions.set(event.stateId, event.version + 1);
        }
        break;
      }
      case 'automatic-summon': {
        const summon = summons.get(event.summonId);
        if (!summon) break;
        spawnSummon(summon.id, 1, summon.durationSeconds, { ability: false, summon: true });
        if (summon.cooldownSeconds > 0) schedule({ ...event, time: now + summon.cooldownSeconds });
        break;
      }
    }
    // Resource events, on-hit generation and resource effects can make a failed cast ready.
    for (const state of resourceWaiters) {
      const action = actions.get(state.spec.actionId);
      if (
        !action ||
        state.charges <= 0 ||
        !abilityIsEligible(state.spec) ||
        !conditionsPass(action, undefined, true) ||
        [...actionCosts(action, state.spec.id)].some(
          ([id, amount]) => (resources.get(id)?.amount ?? 0) < amount
        )
      )
        continue;
      const readyAt = Math.max(
        now,
        state.spec.initialCooldownSeconds,
        state.lastCastAt === null ? 0 : state.lastCastAt + abilityCooldown(state.spec, action)
      );
      scheduleAbilityAttempt(state, readyAt);
    }
  }

  if (eventCount >= MAX_EVENTS && events.length > 0)
    warnings.add(`Event limit ${MAX_EVENTS} reached.`);
  now = scenario.durationSeconds;
  sync(now);

  const reportValue = (value: number, label: string) => {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_REPORT_MAGNITUDE) {
      warnings.add(`${label} is outside the finite report range; capped.`);
    }
    return clean(value);
  };
  const reportRecord = (values: Map<string, number>, label: string) =>
    sortedRecord(values, (value, key) => reportValue(value, `${label} ${key}`));

  return {
    schemaVersion: '0.1',
    unitId: build.unitId,
    buildFingerprint,
    scenarioFingerprint,
    scenarioId: scenario.id,
    seed: reportValue(scenario.seed, 'Scenario seed'),
    durationSeconds: reportValue(scenario.durationSeconds, 'Scenario duration'),
    damageHitPoints: reportValue(damage, 'Total damage'),
    kills,
    hits,
    targetsAffected: affectedTargets.size,
    statusUptimeTargetSeconds: reportValue(statusUptime, 'Status uptime'),
    resourcesGenerated: reportRecord(resourceGenerated, 'Generated resource'),
    resourcesSpent: reportRecord(resourceSpent, 'Spent resource'),
    economyGeneratedCredits: reportValue(economy, 'Economy contribution'),
    abilityContributionHitPoints: reportValue(abilityDamage, 'Ability damage'),
    summonContributionHitPoints: reportValue(summonDamage, 'Summon damage'),
    firstEffectSeconds: firstEffect === null ? null : reportValue(firstEffect, 'First effect time'),
    targetingFailures,
    damageByAction: reportRecord(damageByAction, 'Action damage'),
    eventCount,
    warnings: [...warnings].sort()
  };
}

function clean(value: number): number {
  const finite = Number.isFinite(value)
    ? Math.max(-MAX_REPORT_MAGNITUDE, Math.min(MAX_REPORT_MAGNITUDE, value))
    : value < 0
      ? -MAX_REPORT_MAGNITUDE
      : MAX_REPORT_MAGNITUDE;
  const rounded = Math.round(finite * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function sortedRecord(
  values: Map<string, number>,
  normalize: (value: number, key: string) => number = clean
): Record<string, number> {
  return Object.fromEntries(
    [...values]
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, value]) => [key, normalize(value, key)])
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
