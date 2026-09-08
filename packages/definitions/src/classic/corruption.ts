import type {
  CorruptedUnit,
  CorruptionDescriptor,
  DiagnosticMetricId,
  ValidationIssue
} from './reports.js';
import {
  VALIDATION_LIMITS,
  type Ability,
  type Action,
  type Effect,
  type UnitSpec,
  type UpgradeNode
} from './schemas.js';
import { canonicalStringify } from './compiler.js';
import { validateUnitSpec } from './validation.js';

export const VALID_CORRUPTION_IDS = [
  'duplicate-path-identity',
  'flatten-upgrade',
  'unrelated-complexity-effect',
  'disconnect-ability',
  'zero-cost-power'
] as const;

export const INVALID_CORRUPTION_IDS = [
  'missing-action-reference',
  'upgrade-cycle',
  'missing-effect-target',
  'incompatible-operation-value',
  'conflicting-replacement',
  'undefined-state'
] as const;

export type CorruptionId =
  (typeof VALID_CORRUPTION_IDS)[number] | (typeof INVALID_CORRUPTION_IDS)[number];

const descriptor = (
  id: CorruptionId,
  category: CorruptionDescriptor['category'],
  seed: number,
  expectedAffectedMetrics: DiagnosticMetricId[],
  changedNodes: string[]
): CorruptionDescriptor => ({
  id,
  category,
  seed,
  expectedHardValidation: category === 'valid-diagnostic',
  expectedAffectedMetrics,
  changedNodes
});

/** Stable catalog metadata; applyCorruption replaces wildcard paths with exact JSON pointers. */
export const CORRUPTION_CATALOG: readonly CorruptionDescriptor[] = [
  descriptor(
    'duplicate-path-identity',
    'valid-diagnostic',
    11_101,
    ['pathDistinctness'],
    ['/actions', '/upgradeGraph/nodes/*/operations']
  ),
  descriptor(
    'flatten-upgrade',
    'valid-diagnostic',
    11_203,
    ['progressionCoherence'],
    ['/upgradeGraph/nodes/*/operations']
  ),
  descriptor(
    'unrelated-complexity-effect',
    'valid-diagnostic',
    11_309,
    ['complexityEconomy'],
    ['/actions/*/effects']
  ),
  descriptor(
    'disconnect-ability',
    'valid-diagnostic',
    11_419,
    ['complexityEconomy'],
    ['/actions', '/abilities']
  ),
  descriptor(
    'zero-cost-power',
    'valid-diagnostic',
    11_527,
    ['crossPathHealth'],
    ['/upgradeGraph/nodes/*/costCredits']
  ),
  descriptor('missing-action-reference', 'hard-invalid', 21_101, [], ['/abilities/*/actionId']),
  descriptor('upgrade-cycle', 'hard-invalid', 21_203, [], ['/upgradeGraph/nodes/*/prerequisites']),
  descriptor(
    'missing-effect-target',
    'hard-invalid',
    21_307,
    [],
    ['/upgradeGraph/nodes/*/operations']
  ),
  descriptor(
    'incompatible-operation-value',
    'hard-invalid',
    21_409,
    [],
    ['/upgradeGraph/nodes/*/operations']
  ),
  descriptor(
    'conflicting-replacement',
    'hard-invalid',
    21_511,
    [],
    ['/actions', '/upgradeGraph/nodes/*/operations']
  ),
  descriptor('undefined-state', 'hard-invalid', 21_613, [], ['/actions/*/stateInteractions'])
];

export const EXPECTED_CORRUPTION_FAILURE_CATEGORIES: Readonly<
  Partial<Record<CorruptionId, ValidationIssue['category']>>
> = {
  'missing-action-reference': 'reference',
  'upgrade-cycle': 'graph',
  'missing-effect-target': 'reference',
  'incompatible-operation-value': 'operation',
  'conflicting-replacement': 'operation',
  'undefined-state': 'reference'
};

export const EXPECTED_CORRUPTION_FAILURE_CODES: Readonly<Partial<Record<CorruptionId, string>>> = {
  'missing-action-reference': 'REFERENCE_MISSING_ACTION',
  'upgrade-cycle': 'GRAPH_CYCLE',
  'missing-effect-target': 'REFERENCE_MISSING_EFFECT',
  'incompatible-operation-value': 'OPERATION_INVALID_RESULT',
  'conflicting-replacement': 'OPERATION_CONFLICT',
  'undefined-state': 'REFERENCE_MISSING_STATE'
};

export class CorruptionNotApplicableError extends Error {
  readonly code = 'CORRUPTION_NOT_APPLICABLE';

  constructor(id: CorruptionId, reason: string) {
    super(`Corruption '${id}' is not applicable: ${reason}`);
    this.name = 'CorruptionNotApplicableError';
  }
}

const catalogById = new Map(CORRUPTION_CATALOG.map((item) => [item.id as CorruptionId, item]));
const pointer = (collection: string, index: number, field?: string) =>
  `/${collection}/${index}${field ? `/${field}` : ''}`;
const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

function mixedSeed(seed: number, salt: string) {
  let hash = seed >>> 0;
  for (const character of salt) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619) >>> 0;
  return hash;
}

function pickIndex<T extends { id: string }>(items: readonly T[], seed: number, salt: string) {
  if (items.length === 0) throw new Error(`Corruption requires at least one ${salt}.`);
  const ordered = items
    .map((value, index) => ({ value, index }))
    .sort((a, b) => compareText(a.value.id, b.value.id));
  return ordered[mixedSeed(seed, salt) % ordered.length]!;
}

function uniqueId(unit: UnitSpec, stem: string, seed: number) {
  const used = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        if (key === 'id' && typeof nested === 'string') used.add(nested);
        visit(nested);
      }
    }
  };
  visit(unit);
  const base = `corrupt.${stem}.${seed >>> 0}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}.${suffix++}`;
  return candidate;
}

function copyDescriptor(
  base: CorruptionDescriptor,
  seed: number,
  changedNodes: string[]
): CorruptionDescriptor {
  return {
    id: base.id,
    category: base.category,
    seed,
    expectedHardValidation: base.expectedHardValidation,
    expectedAffectedMetrics: [...base.expectedAffectedMetrics],
    changedNodes: sortedUnique(changedNodes)
  };
}

const sortedUnique = (values: readonly string[]) => [...new Set(values)].sort();

function requireAppendCapacity(values: readonly unknown[], additional: number, label: string) {
  if (values.length + additional > VALIDATION_LIMITS.maximumCollectionItems) {
    throw new Error(
      `${label} requires ${additional} free schema collection slot${additional === 1 ? '' : 's'}.`
    );
  }
}

function requireAppliedOperationCapacity(unit: UnitSpec, additional: number) {
  const defined = [...unit.upgradeGraph.nodes, ...unit.forms].reduce(
    (total, owner) => total + owner.operations.length,
    0
  );
  if (defined + additional > VALIDATION_LIMITS.maximumCollectionItems) {
    throw new Error(
      `resolved build applied operations requires ${additional} free schema collection slot${additional === 1 ? '' : 's'}.`
    );
  }
}

function requireOperationAppendCapacity(unit: UnitSpec, node: UpgradeNode, additional: number) {
  requireAppendCapacity(node.operations, additional, `upgrade '${node.id}' operations`);
  requireAppliedOperationCapacity(unit, additional);
}

function duplicatePathIdentity(unit: UnitSpec, seed: number) {
  const eligible = unit.upgradeGraph.paths
    .map((path) => ({
      path,
      nodes: unit.upgradeGraph.nodes.filter((node) => node.path === path.id)
    }))
    .filter(({ nodes }) => nodes.length > 0)
    .sort((left, right) => compareText(left.path.id, right.path.id));
  if (eligible.length < 2)
    throw new Error('duplicate-path-identity requires two populated upgrade paths.');
  const sourceIndex = mixedSeed(seed, 'source path') % eligible.length;
  const targetOffset = 1 + (mixedSeed(seed, 'target path') % (eligible.length - 1));
  const source = eligible[sourceIndex]!;
  const target = eligible[(sourceIndex + targetOffset) % eligible.length]!;
  const sourceNodes = [...source.nodes].sort(
    (left, right) => (left.tier ?? 0) - (right.tier ?? 0) || compareText(left.id, right.id)
  );
  const targetNodes = [...target.nodes].sort(
    (left, right) => (left.tier ?? 0) - (right.tier ?? 0) || compareText(left.id, right.id)
  );
  const template = pickIndex(
    unit.actions.filter(
      (action) =>
        action.unlockedByDefault &&
        action.trigger.type === 'interval' &&
        action.resourceCosts.length === 0
    ),
    seed,
    'unconditional executable action'
  ).value;
  const changed: string[] = [];
  const count = Math.max(sourceNodes.length, targetNodes.length);
  requireAppendCapacity(unit.actions, count * 2, 'actions');
  requireAppliedOperationCapacity(unit, count * 2);
  const additions = new Map<UpgradeNode, number>();
  for (let index = 0; index < count; index += 1) {
    for (const node of [
      sourceNodes[index % sourceNodes.length]!,
      targetNodes[index % targetNodes.length]!
    ]) {
      additions.set(node, (additions.get(node) ?? 0) + 1);
    }
  }
  for (const [node, additional] of additions) {
    requireAppendCapacity(node.operations, additional, `upgrade '${node.id}' operations`);
  }
  for (let index = 0; index < count; index += 1) {
    for (const [pathId, node] of [
      [source.path.id, sourceNodes[index % sourceNodes.length]!],
      [target.path.id, targetNodes[index % targetNodes.length]!]
    ] as const) {
      const actionId = uniqueId(unit, `duplicate-${pathId}-${index}`, seed);
      const action = clonedReplacement(unit, template, actionId, seed + index);
      action.name = 'Duplicated path mechanic';
      action.summary = 'A valid repeated mechanic introduced to erase path identity.';
      action.unlockedByDefault = false;
      action.timing.windupSeconds = 1_000_000;
      action.effects = [
        {
          id: uniqueId(unit, `${actionId}-effect`, seed + index),
          type: 'damage',
          amountHitPoints: 0,
          damageType: 'neutral'
        }
      ];
      unit.actions.push(action);
      node.operations.push({ type: 'enable-action', actionId });
      changed.push(
        pointer('upgradeGraph/nodes', unit.upgradeGraph.nodes.indexOf(node), 'operations')
      );
    }
  }
  return ['/actions', ...changed];
}

function flattenUpgrade(unit: UnitSpec, seed: number) {
  const flattenable = (
    operation: UpgradeNode['operations'][number]
  ): operation is Extract<
    UpgradeNode['operations'][number],
    { type: 'modify-action' | 'modify-effect' | 'modify-resource' | 'modify-economy' }
  > =>
    (operation.type === 'modify-action' &&
      (operation.parameter === 'cooldownSeconds' || operation.parameter === 'rangeWorldUnits')) ||
    operation.type === 'modify-effect' ||
    operation.type === 'modify-resource' ||
    operation.type === 'modify-economy';
  const candidates = unit.upgradeGraph.nodes.filter((node) => node.operations.some(flattenable));
  const chosen = pickIndex(candidates, seed, 'numeric upgrade node');
  const operation = chosen.value.operations.find(flattenable);
  if (!operation) throw new Error('flatten-upgrade requires a numeric upgrade operation.');
  if (operation.type === 'modify-economy') {
    operation.operation = operation.operation === 'multiply' ? 'multiply' : 'add';
    operation.valueCredits = operation.operation === 'multiply' ? 1.000001 : 0.000001;
  } else {
    operation.operation = operation.operation === 'multiply' ? 'multiply' : 'add';
    operation.value = operation.operation === 'multiply' ? 1.000001 : 0.000001;
  }
  const actualIndex = unit.upgradeGraph.nodes.indexOf(chosen.value);
  return [pointer('upgradeGraph/nodes', actualIndex, 'operations')];
}

function unrelatedComplexityEffect(unit: UnitSpec, seed: number) {
  const chosen = pickIndex(unit.actions, seed, 'action');
  requireAppendCapacity(chosen.value.effects, 1, `action '${chosen.value.id}' effects`);
  const supportOrEconomy = unit.roles.some((role) => /(support|econom|resource)/i.test(role));
  const damageRole = unit.roles.some((role) => /(damage|attack|strik|burst)/i.test(role));
  const effect: Effect =
    supportOrEconomy && !damageRole
      ? {
          id: uniqueId(unit, 'unrelated-attrition', seed),
          type: 'damage-over-time',
          amountHitPointsPerTick: 0.000001,
          tickIntervalSeconds: 1,
          durationSeconds: 1,
          damageType: 'neutral',
          stacking: 'refresh',
          maximumStacks: 1
        }
      : {
          id: uniqueId(unit, 'unrelated-economy', seed),
          type: 'economy-change',
          amountCredits: 0.000001,
          recipient: 'owner'
        };
  chosen.value.effects = [...chosen.value.effects, effect];
  return [pointer('actions', chosen.index, 'effects')];
}

function isolatedAction(unit: UnitSpec, seed: number): Action {
  const actionId = uniqueId(unit, 'isolated-action', seed);
  return {
    id: actionId,
    name: 'Isolated action',
    summary: 'A mechanically isolated action introduced by a deterministic corruption.',
    unlockedByDefault: false,
    tags: ['isolated'],
    trigger: { type: 'manual' },
    targeting: {
      id: uniqueId(unit, 'isolated-targeting', seed),
      type: 'self',
      maximumTargets: 1,
      includeTags: [],
      excludeTags: []
    },
    delivery: {
      id: uniqueId(unit, 'isolated-delivery', seed),
      type: 'aura',
      maximumTargetsPerProjectile: 1,
      radiusWorldUnits: 1,
      lifetimeSeconds: 0.01
    },
    timing: { cooldownSeconds: 30, windupSeconds: 0, rateScope: 'aggregate' },
    rangeWorldUnits: 0,
    emitters: [
      {
        id: uniqueId(unit, 'isolated-emitter', seed),
        emitterCount: 1,
        projectilesPerCycle: 1
      }
    ],
    effects: [
      {
        id: uniqueId(unit, 'isolated-economy', seed),
        type: 'economy-change',
        amountCredits: 0.000001,
        recipient: 'owner'
      }
    ],
    conditions: [],
    resourceCosts: [],
    stateInteractions: []
  };
}

function disconnectAbility(unit: UnitSpec, seed: number) {
  requireAppendCapacity(unit.actions, 1, 'actions');
  requireAppendCapacity(unit.abilities, 1, 'abilities');
  const action = isolatedAction(unit, seed);
  unit.actions.push(action);
  const ability: Ability = {
    id: uniqueId(unit, 'isolated-ability', seed),
    name: 'Isolated ability',
    summary: 'A valid ability disconnected from the established unit loop.',
    unlockedByDefault: true,
    type: 'active',
    actionId: action.id,
    cooldownSeconds: 30,
    initialCooldownSeconds: 0,
    maximumCharges: 1,
    rechargeSeconds: 30,
    playerComplexity: 2
  };
  unit.abilities.push(ability);
  return ['/actions', '/abilities'];
}

function zeroCostPower(unit: UnitSpec, seed: number) {
  const candidates = unit.upgradeGraph.nodes.filter(({ costCredits }) => costCredits > 0);
  const chosen = pickIndex(
    candidates.length > 0 ? candidates : unit.upgradeGraph.nodes,
    seed,
    'upgrade node'
  );
  const actualIndex = unit.upgradeGraph.nodes.indexOf(chosen.value);
  chosen.value.costCredits = 0;
  return [pointer('upgradeGraph/nodes', actualIndex, 'costCredits')];
}

function missingActionReference(unit: UnitSpec, seed: number) {
  const missing = uniqueId(unit, 'missing-action', seed);
  if (unit.abilities.length > 0) {
    const chosen = pickIndex(unit.abilities, seed, 'ability');
    chosen.value.actionId = missing;
    return [pointer('abilities', chosen.index, 'actionId')];
  }
  requireAppendCapacity(unit.abilities, 1, 'abilities');
  const ability: Ability = {
    id: uniqueId(unit, 'broken-ability', seed),
    name: 'Broken ability',
    summary: 'References an action that does not exist.',
    unlockedByDefault: true,
    type: 'active',
    actionId: missing,
    cooldownSeconds: 1,
    initialCooldownSeconds: 0,
    maximumCharges: 1,
    rechargeSeconds: 1,
    playerComplexity: 1
  };
  unit.abilities.push(ability);
  return ['/abilities'];
}

function upgradeCycle(unit: UnitSpec, seed: number) {
  if (unit.upgradeGraph.nodes.length === 0)
    throw new Error('upgrade-cycle requires an upgrade node.');
  const first = pickIndex(unit.upgradeGraph.nodes, seed, 'first upgrade node');
  const remaining = unit.upgradeGraph.nodes.filter(({ id }) => id !== first.value.id);
  if (remaining.length === 0) {
    requireAppendCapacity(
      first.value.prerequisites,
      1,
      `upgrade '${first.value.id}' prerequisites`
    );
    first.value.prerequisites = sortedUnique([...first.value.prerequisites, first.value.id]);
    return [pointer('upgradeGraph/nodes', first.index, 'prerequisites')];
  }
  const second = pickIndex(remaining, seed, 'second upgrade node');
  const secondIndex = unit.upgradeGraph.nodes.indexOf(second.value);
  requireAppendCapacity(
    first.value.prerequisites,
    first.value.prerequisites.includes(second.value.id) ? 0 : 1,
    `upgrade '${first.value.id}' prerequisites`
  );
  requireAppendCapacity(
    second.value.prerequisites,
    second.value.prerequisites.includes(first.value.id) ? 0 : 1,
    `upgrade '${second.value.id}' prerequisites`
  );
  first.value.prerequisites = sortedUnique([...first.value.prerequisites, second.value.id]);
  second.value.prerequisites = sortedUnique([...second.value.prerequisites, first.value.id]);
  return [
    pointer('upgradeGraph/nodes', first.index, 'prerequisites'),
    pointer('upgradeGraph/nodes', secondIndex, 'prerequisites')
  ];
}

function operationNode(unit: UnitSpec, seed: number) {
  return pickIndex(unit.upgradeGraph.nodes, seed, 'upgrade node');
}

function missingEffectTarget(unit: UnitSpec, seed: number) {
  const node = operationNode(unit, seed);
  requireOperationAppendCapacity(unit, node.value, 1);
  const action = pickIndex(unit.actions, seed, 'action').value;
  node.value.operations.push({
    type: 'modify-effect',
    actionId: action.id,
    effectId: uniqueId(unit, 'missing-effect', seed),
    parameter: 'amountHitPoints',
    operation: 'add',
    value: 1
  });
  return [pointer('upgradeGraph/nodes', node.index, 'operations')];
}

function incompatibleOperationValue(unit: UnitSpec, seed: number) {
  const node = operationNode(unit, seed);
  requireOperationAppendCapacity(unit, node.value, 1);
  const action = pickIndex(unit.actions, seed, 'action').value;
  node.value.operations.push({
    type: 'modify-action',
    actionId: action.id,
    parameter: 'emitterCount',
    operation: 'set',
    value: 1.5
  });
  return [pointer('upgradeGraph/nodes', node.index, 'operations')];
}

function clonedReplacement(unit: UnitSpec, source: Action, id: string, seed: number): Action {
  const replacement = structuredClone(source);
  replacement.id = id;
  replacement.name = 'Conflicting replacement';
  replacement.targeting.id = uniqueId(unit, `${id}-targeting`, seed);
  replacement.delivery.id = uniqueId(unit, `${id}-delivery`, seed);
  replacement.emitters = replacement.emitters.map((emitter, index) => ({
    ...emitter,
    id: uniqueId(unit, `${id}-emitter-${index}`, seed)
  }));
  replacement.effects = replacement.effects.map((effect, index) => ({
    ...effect,
    id: uniqueId(unit, `${id}-effect-${index}`, seed)
  }));
  replacement.resourceCosts = [];
  return replacement;
}

function conflictingReplacement(unit: UnitSpec, seed: number) {
  const node = operationNode(unit, seed);
  requireAppendCapacity(unit.actions, 2, 'actions');
  requireOperationAppendCapacity(unit, node.value, 2);
  const source = pickIndex(
    unit.actions.filter((action) => action.unlockedByDefault && action.trigger.type === 'interval'),
    seed,
    'executable interval action'
  ).value;
  const firstId = uniqueId(unit, 'replacement-a', seed);
  const first = clonedReplacement(unit, source, firstId, seed);
  first.unlockedByDefault = true;
  unit.actions.push(first);
  const secondId = uniqueId(unit, 'replacement-b', seed);
  const second = clonedReplacement(unit, source, secondId, seed + 1);
  second.unlockedByDefault = false;
  unit.actions.push(second);
  node.value.operations.push(
    { type: 'replace-action', actionId: source.id, replacementActionId: first.id },
    { type: 'replace-action', actionId: source.id, replacementActionId: second.id }
  );
  return ['/actions', pointer('upgradeGraph/nodes', node.index, 'operations')];
}

function undefinedState(unit: UnitSpec, seed: number) {
  const action = pickIndex(unit.actions, seed, 'action');
  requireAppendCapacity(
    action.value.stateInteractions,
    1,
    `action '${action.value.id}' state interactions`
  );
  action.value.stateInteractions.push({
    stateId: uniqueId(unit, 'undefined-state', seed),
    operation: 'set',
    value: true
  });
  return [pointer('actions', action.index, 'stateInteractions')];
}

function assertValidQualityCorruption(unit: UnitSpec, id: CorruptionId) {
  const validation = validateUnitSpec(unit);
  if (!validation.valid) {
    throw new CorruptionNotApplicableError(
      id,
      `result is not hard-valid (${validation.issues[0]?.code ?? 'unknown validation issue'})`
    );
  }
}

function resolveCorruption(id: CorruptionId, seed?: number) {
  const base = catalogById.get(id);
  if (!base) throw new Error(`Unknown corruption: ${id as string}.`);
  const actualSeed = seed ?? base.seed;
  if (!Number.isSafeInteger(actualSeed)) throw new Error('Corruption seed must be a safe integer.');
  return { base, actualSeed };
}

function applyValidatedCorruption(
  source: UnitSpec,
  id: CorruptionId,
  base: CorruptionDescriptor,
  actualSeed: number
): CorruptedUnit {
  const unit = structuredClone(source);
  let changedNodes: string[];
  try {
    switch (id) {
      case 'duplicate-path-identity':
        changedNodes = duplicatePathIdentity(unit, actualSeed);
        break;
      case 'flatten-upgrade':
        changedNodes = flattenUpgrade(unit, actualSeed);
        break;
      case 'unrelated-complexity-effect':
        changedNodes = unrelatedComplexityEffect(unit, actualSeed);
        break;
      case 'disconnect-ability':
        changedNodes = disconnectAbility(unit, actualSeed);
        break;
      case 'zero-cost-power':
        changedNodes = zeroCostPower(unit, actualSeed);
        break;
      case 'missing-action-reference':
        changedNodes = missingActionReference(unit, actualSeed);
        break;
      case 'upgrade-cycle':
        changedNodes = upgradeCycle(unit, actualSeed);
        break;
      case 'missing-effect-target':
        changedNodes = missingEffectTarget(unit, actualSeed);
        break;
      case 'incompatible-operation-value':
        changedNodes = incompatibleOperationValue(unit, actualSeed);
        break;
      case 'conflicting-replacement':
        changedNodes = conflictingReplacement(unit, actualSeed);
        break;
      case 'undefined-state':
        changedNodes = undefinedState(unit, actualSeed);
        break;
    }
  } catch (error) {
    if (error instanceof CorruptionNotApplicableError) throw error;
    throw new CorruptionNotApplicableError(
      id,
      error instanceof Error ? error.message : 'operator prerequisites are absent'
    );
  }
  if (canonicalStringify(unit) === canonicalStringify(source))
    throw new CorruptionNotApplicableError(id, 'operator produced no data change');
  if (base.category === 'valid-diagnostic') assertValidQualityCorruption(unit, id);
  return { descriptor: copyDescriptor(base, actualSeed, changedNodes), unit };
}

/** Applies one corruption to a structured clone; the source UnitSpec is never mutated. */
export function applyCorruption(source: UnitSpec, id: CorruptionId, seed?: number): CorruptedUnit {
  const { base, actualSeed } = resolveCorruption(id, seed);
  const sourceValidation = validateUnitSpec(source);
  if (!sourceValidation.valid)
    throw new CorruptionNotApplicableError(id, 'source UnitSpec is not hard-valid');
  return applyValidatedCorruption(source, id, base, actualSeed);
}

export function generateCorruptions(
  source: UnitSpec,
  ids: readonly CorruptionId[] = CORRUPTION_CATALOG.map(({ id }) => id as CorruptionId)
) {
  const resolved = ids.map((id) => ({ id, ...resolveCorruption(id) }));
  if (resolved.length === 0) return [];
  const sourceValidation = validateUnitSpec(source);
  if (!sourceValidation.valid)
    throw new CorruptionNotApplicableError(resolved[0]!.id, 'source UnitSpec is not hard-valid');
  return resolved.map(({ id, base, actualSeed }) =>
    applyValidatedCorruption(source, id, base, actualSeed)
  );
}
