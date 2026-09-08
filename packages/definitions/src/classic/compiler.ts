import { canonicalJson } from './canonical.js';

import type {
  Action,
  Form,
  ReferenceProvenance,
  Resource,
  UnitSpec,
  UpgradeNode,
  UpgradeOperation
} from './schemas.js';
import type {
  AppliedOperation,
  BuildComparison,
  BuildSelection,
  CompileResult,
  UnitBuild,
  ValidationIssue
} from './reports.js';
import {
  MAXIMUM_ACCUMULATOR_MAGNITUDE,
  UNIT_EXECUTION_LIMITS,
  VALIDATION_LIMITS
} from './schemas.js';
import {
  actionEmissionsPerCycle,
  operationTarget,
  topologicalUpgrades,
  validateBuildSelection,
  validateCompiledUnitBuild,
  validateProvenance,
  validateUnitSpec
} from './validation.js';

export interface ResolvedActionGraphEdge {
  fromActionId: string;
  toActionId: string;
  via: 'secondary-action' | 'summon';
  referenceId: string;
}

export interface ResolvedActionGraph {
  actionIds: string[];
  rootActionIds: string[];
  reachableActionIds: string[];
  edges: ResolvedActionGraphEdge[];
  topologicalOrder: string[];
  cycles: string[][];
}

export class ValidSelectionLimitError extends RangeError {
  readonly code = 'GRAPH_ENUMERATION_LIMIT';

  constructor(maximumResults: number) {
    super(`Valid selection enumeration exceeded maximumResults ${maximumResults}.`);
    this.name = 'ValidSelectionLimitError';
  }
}

export const DEFAULT_MAXIMUM_VALID_SELECTIONS = 10_000;

type NumericOperation = 'add' | 'multiply' | 'set';

interface WorkingBuild {
  placement: UnitSpec['placement'];
  economy: UnitSpec['economy'];
  baseStats: UnitSpec['baseStats'];
  actions: Action[];
  abilities: UnitSpec['abilities'];
  resources: Resource[];
  summons: UnitSpec['summons'];
  forms: Form[];
  statuses: UnitSpec['statuses'];
  states: UnitSpec['states'];
}

const compileIssue = (
  code: string,
  path: string,
  message: string,
  category: ValidationIssue['category'] = 'operation'
): ValidationIssue => ({ code, path, message, category });

export function canonicalStringify(value: unknown): string {
  return canonicalJson(value).slice(0, -1);
}

const clone = <T>(value: T): T => structuredClone(value);
const byId = <T extends { id: string }>(values: readonly T[]): Map<string, T> =>
  new Map(values.map((value) => [value.id, value]));
const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
const sortStrings = (values: readonly string[]): string[] => [...values].sort();
const sortJson = <T>(values: readonly T[]): T[] =>
  [...values].sort((left, right) =>
    compareText(canonicalStringify(left), canonicalStringify(right))
  );

function canonicalAction(action: Action): Action {
  return {
    ...action,
    tags: sortStrings(action.tags),
    targeting: {
      ...action.targeting,
      includeTags: sortStrings(action.targeting.includeTags),
      excludeTags: sortStrings(action.targeting.excludeTags)
    },
    emitters: [...action.emitters].sort((left, right) => compareText(left.id, right.id)),
    effects: [...action.effects],
    conditions: sortJson(action.conditions),
    resourceCosts: [...action.resourceCosts].sort((left, right) =>
      compareText(left.resourceId, right.resourceId)
    ),
    stateInteractions: [...action.stateInteractions]
  };
}

function canonicalResource(resource: Resource): Resource {
  return {
    ...resource,
    generation: sortJson(resource.generation),
    spend: sortJson(resource.spend)
  };
}

function canonicalForm(form: Form): Form {
  return { ...form, requirements: sortJson(form.requirements) };
}

function numericResult(current: number, operation: NumericOperation, value: number): number {
  return operation === 'add' ? current + value : operation === 'multiply' ? current * value : value;
}

function equalResourceCosts(
  left: Action['resourceCosts'],
  right: Action['resourceCosts']
): boolean {
  return (
    left.length === right.length &&
    left.every((cost) =>
      right.some(
        (candidate) =>
          candidate.resourceId === cost.resourceId &&
          candidate.amountPerCycle === cost.amountPerCycle
      )
    )
  );
}

function numericIssue(
  value: number,
  path: string,
  label: string,
  options: {
    integer?: boolean;
    positive?: boolean;
    nonNegative?: boolean;
    maximum?: number;
  } = {}
): ValidationIssue | undefined {
  if (!Number.isFinite(value)) {
    return compileIssue('OPERATION_INVALID_RESULT', path, `${label} must remain finite.`);
  }
  if (Math.abs(value) > MAXIMUM_ACCUMULATOR_MAGNITUDE) {
    return compileIssue(
      'OPERATION_INVALID_RESULT',
      path,
      `${label} magnitude must not exceed ${MAXIMUM_ACCUMULATOR_MAGNITUDE}.`
    );
  }
  if (options.integer === true && !Number.isInteger(value)) {
    return compileIssue('OPERATION_INVALID_RESULT', path, `${label} must remain an integer.`);
  }
  if (options.positive === true && value <= 0) {
    return compileIssue(
      'OPERATION_INVALID_RESULT',
      path,
      `${label} must remain greater than zero.`
    );
  }
  if (options.nonNegative === true && value < 0) {
    return compileIssue('OPERATION_INVALID_RESULT', path, `${label} must remain non-negative.`);
  }
  if ('maximum' in options && typeof options.maximum === 'number' && value > options.maximum) {
    return compileIssue(
      'OPERATION_EXECUTION_LIMIT',
      path,
      `${label} must not exceed ${options.maximum}.`
    );
  }
  return undefined;
}

function mutationKeys(operation: UpgradeOperation): string[] {
  switch (operation.type) {
    case 'enable-action':
    case 'disable-action':
      return [`action:${operation.actionId}:enabled`];
    case 'replace-action':
      return [
        `action:${operation.actionId}:enabled`,
        `action:${operation.replacementActionId}:enabled`,
        `action:${operation.actionId}:replacement`
      ];
    case 'modify-action':
      return [`action:${operation.actionId}:${operation.parameter}`];
    case 'add-effect':
      return [`action:${operation.actionId}:effect:${operation.effect.id}`];
    case 'modify-effect':
      return [`action:${operation.actionId}:effect:${operation.effectId}:${operation.parameter}`];
    case 'enable-resource':
      return [`resource:${operation.resourceId}:enabled`];
    case 'modify-resource':
      return [`resource:${operation.resourceId}:${operation.parameter}`];
    case 'grant-ability':
      return [`ability:${operation.abilityId}:enabled`];
    case 'enable-summon':
      return [`summon:${operation.summonId}:enabled`];
    case 'grant-form':
      return [`form:${operation.formId}:enabled`];
    case 'modify-placement':
      return [
        ...(operation.addSurface === undefined ? [] : [`placement:${operation.addSurface}`]),
        ...(operation.removeSurface === undefined ? [] : [`placement:${operation.removeSurface}`])
      ];
    case 'modify-economy':
      return ['economy:baseCostCredits'];
  }
}

function rewriteActionReferences(working: WorkingBuild, from: string, to: string): void {
  for (const action of working.actions) {
    if ('sourceActionId' in action.trigger && action.trigger.sourceActionId === from) {
      action.trigger.sourceActionId = to;
    }
    for (const effect of action.effects) {
      if (effect.type === 'secondary-action' && effect.actionId === from) effect.actionId = to;
    }
  }
  for (const ability of working.abilities) if (ability.actionId === from) ability.actionId = to;
  for (const summon of working.summons) if (summon.actionId === from) summon.actionId = to;
  for (const resource of working.resources) {
    for (const generation of resource.generation) {
      if (generation.actionId === from) generation.actionId = to;
    }
    let hasReplacementSpend = resource.spend.some(
      (spend) => spend.event === 'action' && spend.referenceId === to
    );
    resource.spend = resource.spend.filter((spend) => {
      if (spend.event !== 'action' || spend.referenceId !== from) return true;
      if (hasReplacementSpend) return false;
      spend.referenceId = to;
      hasReplacementSpend = true;
      return true;
    });
  }
}

function resolveActionId(aliases: ReadonlyMap<string, string>, actionId: string): string {
  let resolved = actionId;
  const visited = new Set<string>();
  while (aliases.has(resolved) && !visited.has(resolved)) {
    visited.add(resolved);
    resolved = aliases.get(resolved) ?? resolved;
  }
  return resolved;
}

function resolvedMutationKeys(
  operation: UpgradeOperation,
  aliases: ReadonlyMap<string, string>
): string[] {
  const actionId = 'actionId' in operation ? operation.actionId : undefined;
  if (actionId === undefined) return mutationKeys(operation);
  const resolved = resolveActionId(aliases, actionId);
  return mutationKeys(operation).map((key) =>
    key.startsWith(`action:${actionId}:`)
      ? `action:${resolved}:${key.slice(actionId.length + 8)}`
      : key
  );
}

function applyOperation(
  working: WorkingBuild,
  operation: UpgradeOperation,
  path: string,
  availableForms: Set<string>,
  aliases: Map<string, string>
): ValidationIssue | undefined {
  const actions = byId(working.actions);
  const resources = byId(working.resources);
  switch (operation.type) {
    case 'enable-action':
    case 'disable-action': {
      const actionId = resolveActionId(aliases, operation.actionId);
      const action = actions.get(actionId);
      if (action === undefined) {
        return compileIssue(
          'OPERATION_TARGET_MISSING',
          `${path}/actionId`,
          `Action '${operation.actionId}' does not exist.`
        );
      }
      const enabled = operation.type === 'enable-action';
      if (action.unlockedByDefault === enabled) {
        return compileIssue(
          'OPERATION_CONFLICT',
          path,
          `Action '${action.id}' is already ${enabled ? 'enabled' : 'disabled'}.`
        );
      }
      action.unlockedByDefault = enabled;
      return undefined;
    }
    case 'replace-action': {
      const actionId = resolveActionId(aliases, operation.actionId);
      const replacementActionId = resolveActionId(aliases, operation.replacementActionId);
      const action = actions.get(actionId);
      const replacement = actions.get(replacementActionId);
      if (action === undefined || replacement === undefined) {
        return compileIssue(
          'OPERATION_TARGET_MISSING',
          path,
          `Replacement action '${action === undefined ? operation.actionId : operation.replacementActionId}' does not exist.`
        );
      }
      if (action === replacement || !action.unlockedByDefault || replacement.unlockedByDefault) {
        return compileIssue(
          'OPERATION_CONFLICT',
          path,
          `Replacement requires an enabled source and a distinct disabled replacement action.`
        );
      }
      if (
        replacement.resourceCosts.length > 0 &&
        !equalResourceCosts(action.resourceCosts, replacement.resourceCosts)
      ) {
        return compileIssue(
          'OPERATION_RESOURCE_COST_MISMATCH',
          path,
          `Replacement action '${replacement.id}' must declare the same resource costs as '${action.id}'.`
        );
      }
      if (replacement.resourceCosts.length === 0) {
        replacement.resourceCosts = clone(action.resourceCosts);
      }
      action.resourceCosts = [];
      replacement.unlockedByDefault = action.unlockedByDefault;
      action.unlockedByDefault = false;
      rewriteActionReferences(working, action.id, replacement.id);
      for (const [alias, target] of aliases) {
        if (resolveActionId(aliases, target) === action.id) aliases.set(alias, replacement.id);
      }
      aliases.set(action.id, replacement.id);
      aliases.set(operation.actionId, replacement.id);
      return undefined;
    }
    case 'modify-action': {
      const actionId = resolveActionId(aliases, operation.actionId);
      const action = actions.get(actionId);
      if (action === undefined) {
        return compileIssue(
          'OPERATION_TARGET_MISSING',
          `${path}/actionId`,
          `Action '${operation.actionId}' does not exist.`
        );
      }
      let current: number | undefined;
      let assign: (value: number) => void;
      let constraints: Parameters<typeof numericIssue>[3] = { nonNegative: true };
      if (operation.parameter === 'cooldownSeconds') {
        current = action.timing.cooldownSeconds;
        assign = (value) => (action.timing.cooldownSeconds = value);
      } else if (operation.parameter === 'rangeWorldUnits') {
        current = action.rangeWorldUnits;
        assign = (value) => (action.rangeWorldUnits = value);
      } else if (operation.parameter === 'maximumTargetsPerProjectile') {
        current = action.delivery.maximumTargetsPerProjectile;
        assign = (value) => (action.delivery.maximumTargetsPerProjectile = value);
        constraints = {
          integer: true,
          positive: true,
          maximum: UNIT_EXECUTION_LIMITS.maximumTargets
        };
      } else {
        if (action.emitters.length !== 1) {
          return compileIssue(
            'OPERATION_AMBIGUOUS_TARGET',
            `${path}/parameter`,
            `Action '${action.id}' does not have exactly one emitter.`
          );
        }
        const emitter = action.emitters[0];
        if (emitter === undefined) {
          return compileIssue(
            'OPERATION_TARGET_MISSING',
            path,
            `Action '${action.id}' has no emitter.`
          );
        }
        const parameter =
          operation.parameter === 'emitterCount' ? 'emitterCount' : 'projectilesPerCycle';
        current = emitter[parameter];
        assign = (value) => (emitter[parameter] = value);
        constraints = {
          integer: true,
          positive: true,
          maximum:
            parameter === 'emitterCount'
              ? UNIT_EXECUTION_LIMITS.maximumEmitterCount
              : UNIT_EXECUTION_LIMITS.maximumProjectilesPerCycle
        };
      }
      if (current === undefined) {
        if (operation.operation !== 'set') {
          return compileIssue(
            'OPERATION_TYPE_MISMATCH',
            `${path}/parameter`,
            `Cannot ${operation.operation} undefined ${operation.parameter}; use set.`
          );
        }
        current = 0;
      }
      const result = numericResult(current, operation.operation, operation.value);
      const invalid = numericIssue(result, `${path}/value`, operation.parameter, constraints);
      if (invalid !== undefined) return invalid;
      assign(result);
      const emissions = actionEmissionsPerCycle(action);
      if (
        emissions > UNIT_EXECUTION_LIMITS.maximumEmissionsPerCycle ||
        emissions * action.delivery.maximumTargetsPerProjectile >
          UNIT_EXECUTION_LIMITS.maximumTargetApplicationsPerCycle
      ) {
        return compileIssue(
          'OPERATION_EXECUTION_LIMIT',
          `${path}/value`,
          `Mutation exceeds per-cycle execution limits (${UNIT_EXECUTION_LIMITS.maximumEmissionsPerCycle} emissions and ${UNIT_EXECUTION_LIMITS.maximumTargetApplicationsPerCycle} target applications).`
        );
      }
      return undefined;
    }
    case 'add-effect': {
      const actionId = resolveActionId(aliases, operation.actionId);
      const action = actions.get(actionId);
      if (action === undefined) {
        return compileIssue(
          'OPERATION_TARGET_MISSING',
          `${path}/actionId`,
          `Action '${operation.actionId}' does not exist.`
        );
      }
      if (
        working.actions.some((candidate) =>
          candidate.effects.some((effect) => effect.id === operation.effect.id)
        )
      ) {
        return compileIssue(
          'OPERATION_CONFLICT',
          `${path}/effect/id`,
          `Effect ID '${operation.effect.id}' already exists.`
        );
      }
      if (action.effects.length >= VALIDATION_LIMITS.maximumCollectionItems) {
        return compileIssue(
          'OPERATION_COLLECTION_LIMIT',
          `${path}/effect`,
          `Action '${action.id}' cannot exceed ${VALIDATION_LIMITS.maximumCollectionItems} effects.`
        );
      }
      const effect = clone(operation.effect);
      if (effect.type === 'secondary-action') {
        effect.actionId = resolveActionId(aliases, effect.actionId);
      }
      action.effects.push(effect);
      return undefined;
    }
    case 'modify-effect': {
      const actionId = resolveActionId(aliases, operation.actionId);
      const action = actions.get(actionId);
      const effect = action?.effects.find((candidate) => candidate.id === operation.effectId);
      if (effect === undefined) {
        return compileIssue(
          'OPERATION_TARGET_MISSING',
          `${path}/effectId`,
          `Effect '${operation.effectId}' does not exist on action '${operation.actionId}'.`
        );
      }
      const record = effect as unknown as Record<string, unknown>;
      const current = record[operation.parameter];
      if (typeof current !== 'number') {
        return compileIssue(
          'OPERATION_TYPE_MISMATCH',
          `${path}/parameter`,
          `Effect '${effect.id}' has no numeric ${operation.parameter} parameter.`
        );
      }
      const result = numericResult(current, operation.operation, operation.value);
      const invalid = numericIssue(result, `${path}/value`, operation.parameter, {
        positive: operation.parameter === 'durationSeconds',
        nonNegative:
          operation.parameter !== 'durationSeconds' &&
          operation.parameter !== 'amountCredits' &&
          !(effect.type === 'stat-modifier' && operation.parameter === 'amount')
      });
      if (invalid !== undefined) return invalid;
      record[operation.parameter] = result;
      return undefined;
    }
    case 'enable-resource': {
      const resource = resources.get(operation.resourceId);
      if (resource === undefined) {
        return compileIssue(
          'OPERATION_TARGET_MISSING',
          `${path}/resourceId`,
          `Resource '${operation.resourceId}' does not exist.`
        );
      }
      if (resource.unlockedByDefault) {
        return compileIssue(
          'OPERATION_CONFLICT',
          path,
          `Resource '${resource.id}' is already enabled.`
        );
      }
      resource.unlockedByDefault = true;
      return undefined;
    }
    case 'modify-resource': {
      const resource = resources.get(operation.resourceId);
      if (resource === undefined) {
        return compileIssue(
          'OPERATION_TARGET_MISSING',
          `${path}/resourceId`,
          `Resource '${operation.resourceId}' does not exist.`
        );
      }
      let current: number;
      let assign: (value: number) => void;
      const positive = operation.parameter === 'cap' || operation.parameter === 'generationAmount';
      if (operation.parameter === 'startingAmount') {
        current = resource.startingAmount;
        assign = (value) => (resource.startingAmount = value);
      } else if (operation.parameter === 'cap') {
        current = resource.cap;
        assign = (value) => (resource.cap = value);
      } else {
        const generation = resource.generation[0];
        if (resource.generation.length !== 1 || generation === undefined) {
          return compileIssue(
            'OPERATION_AMBIGUOUS_TARGET',
            `${path}/parameter`,
            `Resource '${resource.id}' does not have exactly one generation entry.`
          );
        }
        current = generation.amount;
        assign = (value) => (generation.amount = value);
      }
      const result = numericResult(current, operation.operation, operation.value);
      const invalid = numericIssue(result, `${path}/value`, operation.parameter, {
        positive,
        nonNegative: !positive
      });
      if (invalid !== undefined) return invalid;
      assign(result);
      if (resource.startingAmount > resource.cap) {
        return compileIssue(
          'OPERATION_INVALID_RESULT',
          path,
          `Resource '${resource.id}' startingAmount exceeds cap after mutation.`
        );
      }
      return undefined;
    }
    case 'grant-ability': {
      const ability = working.abilities.find((candidate) => candidate.id === operation.abilityId);
      if (ability === undefined) {
        return compileIssue(
          'OPERATION_TARGET_MISSING',
          `${path}/abilityId`,
          `Ability '${operation.abilityId}' does not exist.`
        );
      }
      if (ability.unlockedByDefault) {
        return compileIssue(
          'OPERATION_CONFLICT',
          path,
          `Ability '${ability.id}' is already granted.`
        );
      }
      ability.unlockedByDefault = true;
      return undefined;
    }
    case 'enable-summon': {
      const summon = working.summons.find((candidate) => candidate.id === operation.summonId);
      if (summon === undefined) {
        return compileIssue(
          'OPERATION_TARGET_MISSING',
          `${path}/summonId`,
          `Summon '${operation.summonId}' does not exist.`
        );
      }
      if (summon.unlockedByDefault) {
        return compileIssue(
          'OPERATION_CONFLICT',
          path,
          `Summon '${summon.id}' is already enabled.`
        );
      }
      summon.unlockedByDefault = true;
      return undefined;
    }
    case 'grant-form':
      if (!working.forms.some((form) => form.id === operation.formId)) {
        return compileIssue(
          'OPERATION_TARGET_MISSING',
          `${path}/formId`,
          `Form '${operation.formId}' does not exist.`
        );
      }
      if (availableForms.has(operation.formId)) {
        return compileIssue(
          'OPERATION_CONFLICT',
          path,
          `Form '${operation.formId}' is already granted.`
        );
      }
      availableForms.add(operation.formId);
      return undefined;
    case 'modify-placement': {
      if (operation.addSurface !== undefined) {
        if (working.placement.allowedSurfaces.includes(operation.addSurface)) {
          return compileIssue(
            'OPERATION_CONFLICT',
            `${path}/addSurface`,
            `Surface '${operation.addSurface}' is already allowed.`
          );
        }
        const removesExistingSurface =
          operation.removeSurface !== undefined &&
          working.placement.allowedSurfaces.includes(operation.removeSurface);
        if (
          working.placement.allowedSurfaces.length >= VALIDATION_LIMITS.maximumCollectionItems &&
          !removesExistingSurface
        ) {
          return compileIssue(
            'OPERATION_COLLECTION_LIMIT',
            `${path}/addSurface`,
            `Placement cannot exceed ${VALIDATION_LIMITS.maximumCollectionItems} allowed surfaces.`
          );
        }
        working.placement.allowedSurfaces.push(operation.addSurface);
      }
      if (operation.removeSurface !== undefined) {
        const index = working.placement.allowedSurfaces.indexOf(operation.removeSurface);
        if (index < 0) {
          return compileIssue(
            'OPERATION_TARGET_MISSING',
            `${path}/removeSurface`,
            `Surface '${operation.removeSurface}' is not allowed.`
          );
        }
        working.placement.allowedSurfaces.splice(index, 1);
      }
      if (working.placement.allowedSurfaces.length === 0) {
        return compileIssue(
          'OPERATION_INVALID_RESULT',
          path,
          'A unit must retain at least one allowed surface.'
        );
      }
      return undefined;
    }
    case 'modify-economy': {
      const result = numericResult(
        working.economy.baseCostCredits,
        operation.operation,
        operation.valueCredits
      );
      const invalid = numericIssue(result, `${path}/valueCredits`, 'baseCostCredits', {
        nonNegative: true
      });
      if (invalid !== undefined) return invalid;
      working.economy.baseCostCredits = result;
      return undefined;
    }
  }
}

function dependencies(nodes: readonly UpgradeNode[]): Map<string, Set<string>> {
  const nodeById = byId(nodes);
  const result = new Map<string, Set<string>>();
  const visit = (id: string, seen = new Set<string>()): Set<string> => {
    const cached = result.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return new Set();
    seen.add(id);
    const all = new Set<string>();
    for (const prerequisite of nodeById.get(id)?.prerequisites ?? []) {
      all.add(prerequisite);
      for (const ancestor of visit(prerequisite, seen)) all.add(ancestor);
    }
    seen.delete(id);
    result.set(id, all);
    return all;
  };
  for (const node of nodes) visit(node.id);
  return result;
}

function operationPath(unit: UnitSpec, ownerId: string, operationIndex: number): string {
  if (ownerId.startsWith('form:')) {
    const formId = ownerId.slice(5);
    const formIndex = unit.forms.findIndex((form) => form.id === formId);
    return `/forms/${formIndex}/operations/${operationIndex}`;
  }
  const nodeIndex = unit.upgradeGraph.nodes.findIndex((node) => node.id === ownerId);
  return `/upgradeGraph/nodes/${nodeIndex}/operations/${operationIndex}`;
}

export function compileUnit(
  value: UnitSpec,
  selection: BuildSelection,
  provenance?: ReferenceProvenance
): CompileResult {
  const validation = validateUnitSpec(value);
  if (!validation.valid || validation.value === undefined)
    return { ok: false, issues: validation.issues };
  return compileResolvedSelection(validation.value, selection, provenance);
}

/** @internal Compiles a schema- and semantic-valid unit without re-entering UnitSpec validation. */
export function compileResolvedSelection(
  unit: UnitSpec,
  selection: BuildSelection,
  provenance?: ReferenceProvenance
): CompileResult {
  const selectionIssues = validateBuildSelection(unit, selection);
  if (selectionIssues.length > 0) return { ok: false, issues: selectionIssues };
  if (provenance !== undefined) {
    const provenanceValidation = validateProvenance(provenance, unit);
    if (!provenanceValidation.valid) return { ok: false, issues: provenanceValidation.issues };
  }

  const ordered = topologicalUpgrades(unit.upgradeGraph.nodes);
  if (ordered === undefined) {
    return {
      ok: false,
      issues: [
        compileIssue(
          'GRAPH_CYCLE',
          '/upgradeGraph/nodes',
          'Upgrade prerequisites must form a directed acyclic graph.',
          'graph'
        )
      ]
    };
  }
  const selected = new Set(selection.upgradeIds);
  const selectedNodes = ordered.filter((node) => selected.has(node.id));
  const working: WorkingBuild = {
    placement: clone(unit.placement),
    economy: clone(unit.economy),
    baseStats: clone(unit.baseStats),
    actions: clone(unit.actions),
    abilities: clone(unit.abilities),
    resources: clone(unit.resources),
    summons: clone(unit.summons),
    forms: clone(unit.forms),
    statuses: clone(unit.statuses),
    states: clone(unit.states)
  };
  const availableForms = new Set(
    working.forms.filter((form) => form.externallyUnlocked).map((form) => form.id)
  );
  const actionAliases = new Map<string, string>();
  const dependencyMap = dependencies(unit.upgradeGraph.nodes);
  const mutations = new Map<string, string>();
  const actionReplacementOwners = new Map<string, Set<string>>();
  const actionMutationOwners = new Map<string, Set<string>>();
  const appliedOperations: AppliedOperation[] = [];

  const followsOwner = (ownerId: string, previous: string): boolean =>
    ownerId === previous ||
    (ownerId.startsWith('form:') && !previous.startsWith('form:')) ||
    dependencyMap.get(ownerId)?.has(previous) === true;
  const addOwner = (owners: Map<string, Set<string>>, actionId: string, ownerId: string): void => {
    const current = owners.get(actionId) ?? new Set<string>();
    current.add(ownerId);
    owners.set(actionId, current);
  };

  const owners: { id: string; operations: UpgradeOperation[] }[] = [
    ...selectedNodes.map((node) => ({ id: node.id, operations: node.operations })),
    ...(selection.formIds ?? [])
      .slice()
      .sort()
      .map((formId) => ({
        id: `form:${formId}`,
        operations: unit.forms.find((form) => form.id === formId)?.operations ?? []
      }))
  ];

  for (const owner of owners) {
    for (const [operationIndex, operation] of owner.operations.entries()) {
      const path = operationPath(unit, owner.id, operationIndex);
      const actionIds =
        'actionId' in operation
          ? new Set([operation.actionId, resolveActionId(actionAliases, operation.actionId)])
          : new Set<string>();
      const competingOwners =
        operation.type === 'replace-action' ? actionMutationOwners : actionReplacementOwners;
      const competingOwner = [...actionIds]
        .flatMap((actionId) => [...(competingOwners.get(actionId) ?? [])])
        .find((previous) => !followsOwner(owner.id, previous));
      if (competingOwner !== undefined) {
        return {
          ok: false,
          issues: [
            compileIssue(
              'OPERATION_CONFLICT',
              path,
              `Action replacement conflicts with independently selected '${competingOwner}'.`
            )
          ]
        };
      }
      const keys = resolvedMutationKeys(operation, actionAliases);
      for (const key of keys) {
        const previous = mutations.get(key);
        const orderedMutation =
          previous === undefined ||
          (owner.id.startsWith('form:') && !previous.startsWith('form:')) ||
          dependencyMap.get(owner.id)?.has(previous) === true;
        if (!orderedMutation) {
          return {
            ok: false,
            issues: [
              compileIssue(
                'OPERATION_CONFLICT',
                path,
                `Mutation '${key}' conflicts with independently selected '${previous}'.`
              )
            ]
          };
        }
      }
      if (appliedOperations.length >= VALIDATION_LIMITS.maximumCollectionItems) {
        return {
          ok: false,
          issues: [
            compileIssue(
              'OPERATION_COLLECTION_LIMIT',
              path,
              `A build cannot exceed ${VALIDATION_LIMITS.maximumCollectionItems} applied operations.`
            )
          ]
        };
      }
      const failure = applyOperation(working, operation, path, availableForms, actionAliases);
      if (failure !== undefined) return { ok: false, issues: [failure] };
      for (const key of keys) mutations.set(key, owner.id);
      for (const actionId of actionIds) {
        addOwner(
          operation.type === 'replace-action' ? actionReplacementOwners : actionMutationOwners,
          actionId,
          owner.id
        );
      }
      appliedOperations.push({
        upgradeId: owner.id.startsWith('form:') ? owner.id.slice(5) : owner.id,
        operationIndex,
        type: operation.type,
        target: operationTarget(operation)
      });
    }
  }

  const totalCostCredits =
    working.economy.baseCostCredits +
    selectedNodes.reduce((total, node) => total + node.costCredits, 0);
  const totalCostIssue = numericIssue(totalCostCredits, '/totalCostCredits', 'totalCostCredits', {
    nonNegative: true
  });
  if (totalCostIssue !== undefined) return { ok: false, issues: [totalCostIssue] };

  const build: UnitBuild = {
    schemaVersion: '0.1',
    unitId: unit.id,
    name: unit.name,
    roles: sortStrings(unit.roles),
    tags: sortStrings(unit.tags),
    selection: selectedNodes.map((node) => node.id),
    selectedFormIds: sortStrings(selection.formIds ?? []),
    totalCostCredits,
    placement: {
      ...working.placement,
      allowedSurfaces: sortStrings(working.placement.allowedSurfaces),
      rules: sortStrings(working.placement.rules)
    },
    economy: working.economy,
    baseStats: working.baseStats,
    actions: working.actions
      .map(canonicalAction)
      .sort((left, right) => compareText(left.id, right.id)),
    abilities: working.abilities.sort((left, right) => compareText(left.id, right.id)),
    resources: working.resources
      .map(canonicalResource)
      .sort((left, right) => compareText(left.id, right.id)),
    summons: working.summons.sort((left, right) => compareText(left.id, right.id)),
    forms: working.forms.map(canonicalForm).sort((left, right) => compareText(left.id, right.id)),
    statuses: working.statuses.sort((left, right) => compareText(left.id, right.id)),
    states: working.states.sort((left, right) => compareText(left.id, right.id)),
    appliedOperations
  };
  const buildValidation = validateCompiledUnitBuild(build);
  if (!buildValidation.valid) return { ok: false, issues: buildValidation.issues };
  return provenance === undefined
    ? { ok: true, build }
    : { ok: true, build, provenance: clone(provenance) };
}

function compareSelections(left: BuildSelection, right: BuildSelection): number {
  return (
    left.upgradeIds.length - right.upgradeIds.length ||
    compareText(left.upgradeIds.join('\u0000'), right.upgradeIds.join('\u0000')) ||
    (left.formIds?.length ?? 0) - (right.formIds?.length ?? 0) ||
    compareText((left.formIds ?? []).join('\u0000'), (right.formIds ?? []).join('\u0000'))
  );
}

function walkSelectionCandidates(
  unit: UnitSpec,
  maximumResults: number,
  visit: (selection: BuildSelection, result: CompileResult) => boolean
): void {
  if (!Number.isSafeInteger(maximumResults) || maximumResults < 1) {
    throw new RangeError('maximumResults must be a positive safe integer.');
  }
  const ordered = topologicalUpgrades(unit.upgradeGraph.nodes);
  if (ordered === undefined) return;
  const nodeById = byId(unit.upgradeGraph.nodes);
  const selected: string[] = [];
  const selectedSet = new Set<string>();
  let candidateCount = 0;

  const enumerateForms = (): boolean => {
    const available = unit.forms
      .filter(
        (form) =>
          form.externallyUnlocked ||
          selected.some((id) =>
            nodeById
              .get(id)
              ?.operations.some(
                (operation) => operation.type === 'grant-form' && operation.formId === form.id
              )
          )
      )
      .map((form) => form.id)
      .sort();
    const formIds: string[] = [];
    const visitForm = (index: number): boolean => {
      if (index === available.length) {
        const candidate: BuildSelection = {
          upgradeIds: [...selected],
          ...(formIds.length === 0 ? {} : { formIds: [...formIds] })
        };
        candidateCount += 1;
        if (candidateCount > maximumResults) throw new ValidSelectionLimitError(maximumResults);
        return visit(candidate, compileResolvedSelection(unit, candidate));
      }
      if (!visitForm(index + 1)) return false;
      const formId = available[index];
      if (formId !== undefined) {
        formIds.push(formId);
        const keepGoing = visitForm(index + 1);
        formIds.pop();
        if (!keepGoing) return false;
      }
      return true;
    };
    return visitForm(0);
  };

  const visitUpgrade = (index: number): boolean => {
    if (index === ordered.length) {
      return enumerateForms();
    }
    if (!visitUpgrade(index + 1)) return false;
    const node = ordered[index];
    if (
      node === undefined ||
      node.prerequisites.some((prerequisite) => !selectedSet.has(prerequisite))
    ) {
      return true;
    }
    selected.push(node.id);
    selectedSet.add(node.id);
    let keepGoing = true;
    if (validateBuildSelection(unit, { upgradeIds: selected }).length === 0) {
      keepGoing = visitUpgrade(index + 1);
    }
    selected.pop();
    selectedSet.delete(node.id);
    return keepGoing;
  };
  visitUpgrade(0);
}

export function enumerateValidSelections(
  unit: UnitSpec,
  maximumResults = DEFAULT_MAXIMUM_VALID_SELECTIONS
): BuildSelection[] {
  const results: BuildSelection[] = [];
  walkSelectionCandidates(unit, maximumResults, (selection, result) => {
    if (result.ok) results.push(selection);
    return true;
  });
  return results.sort(compareSelections);
}

/** @internal Validates every reachable graph selection through the compiler's resolved path. */
export function selectionViabilityIssues(
  unit: UnitSpec,
  maximumResults = DEFAULT_MAXIMUM_VALID_SELECTIONS
): ValidationIssue[] {
  let failure: ValidationIssue[] = [];
  try {
    walkSelectionCandidates(unit, maximumResults, (_selection, result) => {
      if (result.ok) return true;
      failure = result.issues;
      return false;
    });
  } catch (error) {
    if (!(error instanceof ValidSelectionLimitError)) throw error;
    return [compileIssue(error.code, '/upgradeGraph/selectionRules', error.message, 'graph')];
  }
  return failure;
}

export function inspectResolvedActionGraph(build: UnitBuild): ResolvedActionGraph {
  const summonActions = new Map(build.summons.map((summon) => [summon.id, summon.actionId]));
  const edges: ResolvedActionGraphEdge[] = [];
  for (const action of build.actions) {
    for (const effect of action.effects) {
      if (effect.type === 'secondary-action') {
        edges.push({
          fromActionId: action.id,
          toActionId: effect.actionId,
          via: 'secondary-action',
          referenceId: effect.id
        });
      } else if (effect.type === 'spawn') {
        const actionId = summonActions.get(effect.summonId);
        if (actionId !== undefined) {
          edges.push({
            fromActionId: action.id,
            toActionId: actionId,
            via: 'summon',
            referenceId: effect.summonId
          });
        }
      }
    }
  }
  edges.sort(
    (left, right) =>
      compareText(left.fromActionId, right.fromActionId) ||
      compareText(left.toActionId, right.toActionId) ||
      compareText(left.via, right.via) ||
      compareText(left.referenceId, right.referenceId)
  );
  const actionIds = build.actions.map((action) => action.id).sort();
  const roots = new Set(
    build.actions.filter((action) => action.unlockedByDefault).map((action) => action.id)
  );
  for (const ability of build.abilities) if (ability.unlockedByDefault) roots.add(ability.actionId);
  for (const summon of build.summons) {
    if (summon.unlockedByDefault && summon.activation === 'automatic') roots.add(summon.actionId);
  }
  const outgoing = new Map(actionIds.map((id) => [id, [] as string[]]));
  const indegree = new Map(actionIds.map((id) => [id, 0]));
  for (const edge of edges) {
    outgoing.get(edge.fromActionId)?.push(edge.toActionId);
    indegree.set(edge.toActionId, (indegree.get(edge.toActionId) ?? 0) + 1);
  }
  const reachable = new Set<string>();
  const pending = [...roots].sort().reverse();
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || reachable.has(id)) continue;
    reachable.add(id);
    for (const target of [...(outgoing.get(id) ?? [])].sort().reverse()) pending.push(target);
  }
  const ready = actionIds.filter((id) => indegree.get(id) === 0).sort();
  const topologicalOrder: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) break;
    topologicalOrder.push(id);
    for (const target of [...(outgoing.get(id) ?? [])].sort()) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        ready.push(target);
        ready.sort();
      }
    }
  }
  const remaining = new Set(actionIds.filter((id) => !topologicalOrder.includes(id)));
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const index = stack.indexOf(id);
      const cycle = [...stack.slice(index), id];
      if (!cycles.some((candidate) => candidate.join('\u0000') === cycle.join('\u0000')))
        cycles.push(cycle);
      return;
    }
    visiting.add(id);
    stack.push(id);
    for (const target of [...(outgoing.get(id) ?? [])]
      .filter((target) => remaining.has(target))
      .sort()) {
      visit(target);
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of [...remaining].sort()) visit(id);

  return {
    actionIds,
    rootActionIds: [...roots].sort(),
    reachableActionIds: [...reachable].sort(),
    edges,
    topologicalOrder,
    cycles
  };
}

export function compareBuilds(left: UnitBuild, right: UnitBuild): BuildComparison {
  const leftEnabled = new Set(
    left.actions.filter((action) => action.unlockedByDefault).map((action) => action.id)
  );
  const rightEnabled = new Set(
    right.actions.filter((action) => action.unlockedByDefault).map((action) => action.id)
  );
  const leftActions = byId(left.actions);
  const rightActions = byId(right.actions);
  return {
    leftSelection: [...left.selection],
    rightSelection: [...right.selection],
    leftFormIds: [...left.selectedFormIds],
    rightFormIds: [...right.selectedFormIds],
    costDeltaCredits: right.totalCostCredits - left.totalCostCredits,
    actionIdsAdded: [...rightEnabled].filter((id) => !leftEnabled.has(id)).sort(),
    actionIdsRemoved: [...leftEnabled].filter((id) => !rightEnabled.has(id)).sort(),
    changedActions: [...leftActions.keys()]
      .filter((id) => {
        const rightAction = rightActions.get(id);
        return (
          rightAction !== undefined &&
          canonicalStringify(leftActions.get(id)) !== canonicalStringify(rightAction)
        );
      })
      .sort()
  };
}
