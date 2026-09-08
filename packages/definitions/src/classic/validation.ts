import {
  MAXIMUM_ACCUMULATOR_MAGNITUDE,
  referenceProvenanceSchema,
  SOURCE_POINTER_PATTERN,
  UNIT_EXECUTION_LIMITS,
  unitBuildSchema,
  unitSpecSchema,
  VALIDATION_LIMITS
} from './schemas.js';
import type {
  Action,
  Effect,
  Form,
  ReferenceProvenance,
  Resource,
  UnitSpec,
  UpgradeNode,
  UpgradeOperation
} from './schemas.js';
import type { BuildSelection, UnitBuild, ValidationIssue, ValidationReport } from './reports.js';
import { sortAndLimitIssues, validateSchema } from './schema-validation.js';
import { selectionViabilityIssues } from './compiler.js';

type IssueCategory = ValidationIssue['category'];
type Condition = Action['conditions'][number];
type ModifyEffectOperation = Extract<UpgradeOperation, { type: 'modify-effect' }>;
type EffectParameter = ModifyEffectOperation['parameter'];

interface References {
  actions: Map<string, Action>;
  abilities: Map<string, UnitSpec['abilities'][number]>;
  forms: Map<string, Form>;
  resources: Map<string, Resource>;
  states: Map<string, UnitSpec['states'][number]>;
  statuses: Map<string, UnitSpec['statuses'][number]>;
  summons: Map<string, UnitSpec['summons'][number]>;
}

type MechanicDefinitions = Pick<
  UnitSpec,
  'actions' | 'abilities' | 'forms' | 'resources' | 'states' | 'statuses' | 'summons'
>;

const unsupportedEffects = new Set<Effect['type']>([
  'heal',
  'shield',
  'stat-modifier',
  'transform'
]);

const effectParameters: Record<Effect['type'], ReadonlySet<EffectParameter>> = {
  damage: new Set(['amountHitPoints']),
  'damage-over-time': new Set(['amountHitPointsPerTick', 'durationSeconds']),
  status: new Set(['durationSeconds']),
  'stat-modifier': new Set(['amount', 'durationSeconds']),
  heal: new Set(['amountHitPoints']),
  shield: new Set(['amountHitPoints', 'durationSeconds']),
  'resource-change': new Set(['amount']),
  spawn: new Set(['durationSeconds']),
  'forced-movement': new Set(),
  reveal: new Set(['durationSeconds']),
  transform: new Set(['durationSeconds']),
  'secondary-action': new Set(),
  'economy-change': new Set(['amountCredits'])
};

const issue = (
  code: string,
  path: string,
  message: string,
  category: IssueCategory
): ValidationIssue => ({ code, path, message, category });

const byId = <T extends { id: string }>(values: readonly T[]): Map<string, T> =>
  new Map(values.map((value) => [value.id, value]));
const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

const sortIssues = (issues: ValidationIssue[]): ValidationIssue[] => sortAndLimitIssues(issues);

const sameType = (left: unknown, right: unknown) => typeof left === typeof right;

export const actionEmissionsPerCycle = (action: Action): number =>
  action.emitters.reduce(
    (total, emitter) =>
      total +
      emitter.projectilesPerCycle *
        (action.timing.rateScope === 'per-emitter' ? emitter.emitterCount : 1),
    0
  );

function requireReference<T>(
  map: ReadonlyMap<string, T>,
  id: string,
  path: string,
  kind: string,
  issues: ValidationIssue[]
): T | undefined {
  const value = map.get(id);
  if (value === undefined) {
    issues.push(
      issue(
        `REFERENCE_MISSING_${kind.toUpperCase()}`,
        path,
        `${kind[0]?.toUpperCase()}${kind.slice(1)} '${id}' does not exist.`,
        'reference'
      )
    );
  }
  return value;
}

function makeReferences(
  unit: Pick<
    UnitSpec,
    'actions' | 'abilities' | 'forms' | 'resources' | 'states' | 'statuses' | 'summons'
  >
): References {
  return {
    actions: byId(unit.actions),
    abilities: byId(unit.abilities),
    forms: byId(unit.forms),
    resources: byId(unit.resources),
    states: byId(unit.states),
    statuses: byId(unit.statuses),
    summons: byId(unit.summons)
  };
}

function validateCondition(
  condition: Condition,
  path: string,
  references: References,
  issues: ValidationIssue[]
): void {
  const equalityOperators = new Set<Condition['operator']>(['eq', 'neq']);
  const numericOperators = new Set<Condition['operator']>(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);
  const needsReference = condition.subject === 'resource' || condition.subject === 'state';
  if (needsReference && condition.referenceId === undefined) {
    issues.push(
      issue(
        'MECHANIC_CONDITION_REFERENCE_REQUIRED',
        `${path}/referenceId`,
        `${condition.subject} conditions require referenceId.`,
        'mechanic'
      )
    );
  } else if (!needsReference && condition.referenceId !== undefined) {
    issues.push(
      issue(
        'MECHANIC_CONDITION_REFERENCE_NOT_APPLICABLE',
        `${path}/referenceId`,
        `${condition.subject} conditions cannot use referenceId.`,
        'mechanic'
      )
    );
  }

  if (condition.subject === 'resource' && condition.referenceId !== undefined) {
    requireReference(
      references.resources,
      condition.referenceId,
      `${path}/referenceId`,
      'resource',
      issues
    );
    if (typeof condition.value !== 'number') {
      issues.push(
        issue(
          'MECHANIC_CONDITION_VALUE_TYPE',
          `${path}/value`,
          'Resource conditions require a numeric value.',
          'mechanic'
        )
      );
    }
    if (!numericOperators.has(condition.operator)) {
      issues.push(
        issue(
          'MECHANIC_CONDITION_OPERATOR',
          `${path}/operator`,
          'Resource conditions require a numeric comparison operator.',
          'mechanic'
        )
      );
    }
  }
  if (condition.subject === 'state' && condition.referenceId !== undefined) {
    const state = requireReference(
      references.states,
      condition.referenceId,
      `${path}/referenceId`,
      'state',
      issues
    );
    if (state !== undefined && !sameType(state.initialValue, condition.value)) {
      issues.push(
        issue(
          'MECHANIC_CONDITION_VALUE_TYPE',
          `${path}/value`,
          `State '${state.id}' conditions must compare against ${typeof state.initialValue} values.`,
          'mechanic'
        )
      );
    }
    const stateOperatorSupported =
      state === undefined ||
      typeof state.initialValue === 'number' ||
      equalityOperators.has(condition.operator) ||
      (typeof state.initialValue === 'string' && condition.operator === 'contains');
    if (!stateOperatorSupported) {
      issues.push(
        issue(
          'MECHANIC_CONDITION_OPERATOR',
          `${path}/operator`,
          `${typeof state?.initialValue} state conditions do not support '${condition.operator}'.`,
          'mechanic'
        )
      );
    }
    if (
      state !== undefined &&
      typeof state.initialValue === 'number' &&
      !numericOperators.has(condition.operator)
    ) {
      issues.push(
        issue(
          'MECHANIC_CONDITION_OPERATOR',
          `${path}/operator`,
          'Numeric state conditions require a numeric comparison operator.',
          'mechanic'
        )
      );
    }
  }
  if (condition.subject === 'health-fraction') {
    if (typeof condition.value !== 'number' || condition.value < 0 || condition.value > 1) {
      issues.push(
        issue(
          'MECHANIC_CONDITION_VALUE_RANGE',
          `${path}/value`,
          'Health-fraction condition values must be between 0 and 1.',
          'mechanic'
        )
      );
    }
    if (!numericOperators.has(condition.operator)) {
      issues.push(
        issue(
          'MECHANIC_CONDITION_OPERATOR',
          `${path}/operator`,
          'Health-fraction conditions require a numeric comparison operator.',
          'mechanic'
        )
      );
    }
  }
  if (condition.subject === 'target-tag' && typeof condition.value !== 'string') {
    issues.push(
      issue(
        'MECHANIC_CONDITION_VALUE_TYPE',
        `${path}/value`,
        'Target-tag conditions require a string value.',
        'mechanic'
      )
    );
  }
  if (condition.subject === 'target-tag' && condition.operator !== 'contains') {
    issues.push(
      issue(
        'MECHANIC_CONDITION_OPERATOR',
        `${path}/operator`,
        'Target-tag conditions only support contains.',
        'mechanic'
      )
    );
  } else if (condition.operator === 'contains' && condition.subject !== 'target-tag') {
    issues.push(
      issue(
        'MECHANIC_CONDITION_OPERATOR',
        `${path}/operator`,
        "The 'contains' operator is only supported for target-tag conditions.",
        'mechanic'
      )
    );
  }
}

function validateEffect(
  effect: Effect,
  path: string,
  references: References,
  issues: ValidationIssue[]
): void {
  switch (effect.type) {
    case 'damage-over-time':
      if (effect.durationSeconds < effect.tickIntervalSeconds) {
        issues.push(
          issue(
            'MECHANIC_EFFECT_INCOMPLETE',
            `${path}/durationSeconds`,
            'Damage-over-time duration must include at least one tick.',
            'mechanic'
          )
        );
      }
      break;
    case 'status': {
      const status = requireReference(
        references.statuses,
        effect.statusId,
        `${path}/statusId`,
        'status',
        issues
      );
      if (status !== undefined) {
        if (effect.stacks > status.maximumStacks) {
          issues.push(
            issue(
              'MECHANIC_STATUS_STACK_LIMIT',
              `${path}/stacks`,
              `Effect applies ${effect.stacks} stacks, above status '${status.id}' limit ${status.maximumStacks}.`,
              'mechanic'
            )
          );
        }
        if (effect.stacking !== status.refresh) {
          issues.push(
            issue(
              'MECHANIC_STATUS_STACKING_MISMATCH',
              `${path}/stacking`,
              `Effect stacking must match status '${status.id}' refresh behaviour '${status.refresh}'.`,
              'mechanic'
            )
          );
        }
      }
      break;
    }
    case 'stat-modifier':
      if (effect.recipient === 'allies' && effect.radiusWorldUnits === undefined) {
        issues.push(
          issue(
            'MECHANIC_EFFECT_INCOMPLETE',
            `${path}/radiusWorldUnits`,
            'An allies stat modifier requires a finite radius.',
            'mechanic'
          )
        );
      }
      break;
    case 'resource-change':
      requireReference(
        references.resources,
        effect.resourceId,
        `${path}/resourceId`,
        'resource',
        issues
      );
      break;
    case 'spawn': {
      const summon = requireReference(
        references.summons,
        effect.summonId,
        `${path}/summonId`,
        'summon',
        issues
      );
      if (summon !== undefined && effect.durationSeconds !== summon.durationSeconds) {
        issues.push(
          issue(
            'MECHANIC_SUMMON_DURATION_MISMATCH',
            `${path}/durationSeconds`,
            `Spawn duration must match summon '${summon.id}' durationSeconds (${summon.durationSeconds}).`,
            'mechanic'
          )
        );
      }
      break;
    }
    case 'transform': {
      const form = requireReference(
        references.forms,
        effect.formId,
        `${path}/formId`,
        'form',
        issues
      );
      if (
        form !== undefined &&
        form.persistence === 'timed' &&
        form.durationSeconds !== effect.durationSeconds
      ) {
        issues.push(
          issue(
            'MECHANIC_FORM_DURATION_MISMATCH',
            `${path}/durationSeconds`,
            `Transform duration must match form '${form.id}' durationSeconds (${form.durationSeconds}).`,
            'mechanic'
          )
        );
      }
      break;
    }
    case 'secondary-action':
      requireReference(references.actions, effect.actionId, `${path}/actionId`, 'action', issues);
      break;
  }
}

function validateAction(
  action: Action,
  path: string,
  references: References,
  issues: ValidationIssue[]
): void {
  const emissions = actionEmissionsPerCycle(action);
  if (emissions > UNIT_EXECUTION_LIMITS.maximumEmissionsPerCycle) {
    issues.push(
      issue(
        'MECHANIC_EXECUTION_LIMIT',
        `${path}/emitters`,
        `Action emits ${emissions} projectiles per cycle; maximum is ${UNIT_EXECUTION_LIMITS.maximumEmissionsPerCycle}.`,
        'mechanic'
      )
    );
  }
  const applications = emissions * action.delivery.maximumTargetsPerProjectile;
  if (applications > UNIT_EXECUTION_LIMITS.maximumTargetApplicationsPerCycle) {
    issues.push(
      issue(
        'MECHANIC_EXECUTION_LIMIT',
        `${path}/delivery/maximumTargetsPerProjectile`,
        `Action permits ${applications} target applications per cycle; maximum is ${UNIT_EXECUTION_LIMITS.maximumTargetApplicationsPerCycle}.`,
        'mechanic'
      )
    );
  }
  if (action.trigger.type === 'resource-threshold') {
    const resource = requireReference(
      references.resources,
      action.trigger.resourceId,
      `${path}/trigger/resourceId`,
      'resource',
      issues
    );
    if (resource !== undefined && action.trigger.amount > resource.cap) {
      issues.push(
        issue(
          'MECHANIC_RESOURCE_THRESHOLD_RANGE',
          `${path}/trigger/amount`,
          `Threshold exceeds resource '${resource.id}' cap ${resource.cap}.`,
          'mechanic'
        )
      );
    }
  } else if (action.trigger.type === 'state-change') {
    const state = requireReference(
      references.states,
      action.trigger.stateId,
      `${path}/trigger/stateId`,
      'state',
      issues
    );
    if (state !== undefined && typeof state.initialValue !== 'string') {
      issues.push(
        issue(
          'MECHANIC_STATE_TRIGGER_TYPE',
          `${path}/trigger/to`,
          `State-change trigger string value is incompatible with ${typeof state.initialValue} state '${state.id}'.`,
          'mechanic'
        )
      );
    }
  } else if ('sourceActionId' in action.trigger && action.trigger.sourceActionId !== undefined) {
    requireReference(
      references.actions,
      action.trigger.sourceActionId,
      `${path}/trigger/sourceActionId`,
      'action',
      issues
    );
  }

  if (action.targeting.type === 'self' && action.targeting.maximumTargets !== 1) {
    issues.push(
      issue(
        'MECHANIC_TARGETING_CONTRACT',
        `${path}/targeting/maximumTargets`,
        'Self targeting must select exactly one target.',
        'mechanic'
      )
    );
  }
  const overlappingTag = action.targeting.includeTags.find((tag) =>
    action.targeting.excludeTags.includes(tag)
  );
  if (overlappingTag !== undefined) {
    issues.push(
      issue(
        'MECHANIC_TARGETING_CONTRACT',
        `${path}/targeting`,
        `Target tag '${overlappingTag}' cannot be both included and excluded.`,
        'mechanic'
      )
    );
  }
  if (action.targeting.type === 'marked') {
    const hasMark = [...references.statuses.values()].some((status) => status.kind === 'mark');
    if (!hasMark) {
      issues.push(
        issue(
          'MECHANIC_TARGETING_CONTRACT',
          `${path}/targeting/type`,
          'Marked targeting requires a declared mark status.',
          'mechanic'
        )
      );
    }
  }

  const projectileDelivery =
    action.delivery.type === 'projectile' ||
    action.delivery.type === 'homing-projectile' ||
    action.delivery.type === 'arc-projectile';
  if (projectileDelivery && action.delivery.projectileSpeedWorldUnitsPerSecond === undefined) {
    issues.push(
      issue(
        'MECHANIC_DELIVERY_INCOMPLETE',
        `${path}/delivery/projectileSpeedWorldUnitsPerSecond`,
        `${action.delivery.type} delivery requires projectile speed.`,
        'mechanic'
      )
    );
  }
  if (
    (action.delivery.type === 'aura' ||
      action.delivery.type === 'zone' ||
      action.delivery.type === 'trap') &&
    action.delivery.radiusWorldUnits === undefined
  ) {
    issues.push(
      issue(
        'MECHANIC_DELIVERY_INCOMPLETE',
        `${path}/delivery/radiusWorldUnits`,
        `${action.delivery.type} delivery requires a finite radius.`,
        'mechanic'
      )
    );
  }
  if (
    (action.delivery.type === 'zone' || action.delivery.type === 'trap') &&
    action.delivery.lifetimeSeconds === undefined
  ) {
    issues.push(
      issue(
        'MECHANIC_DELIVERY_INCOMPLETE',
        `${path}/delivery/lifetimeSeconds`,
        `${action.delivery.type} delivery requires a finite lifetime.`,
        'mechanic'
      )
    );
  }
  if (
    action.delivery.type === 'summon' &&
    !action.effects.some((effect) => effect.type === 'spawn')
  ) {
    issues.push(
      issue(
        'MECHANIC_ACTION_INCOMPLETE',
        `${path}/effects`,
        'Summon delivery requires a spawn effect.',
        'mechanic'
      )
    );
  }
  if (
    (action.targeting.type === 'self' ||
      action.targeting.type === 'ally' ||
      action.targeting.type === 'position') &&
    action.effects.some((effect) =>
      [
        'damage',
        'damage-over-time',
        'status',
        'forced-movement',
        'reveal',
        'secondary-action'
      ].includes(effect.type)
    )
  ) {
    issues.push(
      issue(
        'MECHANIC_TARGETING_EFFECT_MISMATCH',
        `${path}/targeting/type`,
        `Targeting '${action.targeting.type}' cannot resolve enemy-targeted effects.`,
        'mechanic'
      )
    );
  }

  action.effects.forEach((effect, index) =>
    validateEffect(effect, `${path}/effects/${index}`, references, issues)
  );
  action.conditions.forEach((condition, index) =>
    validateCondition(condition, `${path}/conditions/${index}`, references, issues)
  );

  const resourceCosts = new Set<string>();
  action.resourceCosts.forEach((cost, index) => {
    const resource = requireReference(
      references.resources,
      cost.resourceId,
      `${path}/resourceCosts/${index}/resourceId`,
      'resource',
      issues
    );
    if (resourceCosts.has(cost.resourceId)) {
      issues.push(
        issue(
          'MECHANIC_DUPLICATE_RESOURCE_COST',
          `${path}/resourceCosts/${index}/resourceId`,
          `Action '${action.id}' declares resource '${cost.resourceId}' more than once.`,
          'mechanic'
        )
      );
    }
    resourceCosts.add(cost.resourceId);
    if (resource !== undefined) {
      const spend = resource.spend.find(
        (entry) => entry.event === 'action' && entry.referenceId === action.id
      );
      if (spend === undefined) {
        issues.push(
          issue(
            'MECHANIC_RESOURCE_SPEND_INCOMPLETE',
            `${path}/resourceCosts/${index}`,
            `Resource '${resource.id}' must declare the spend event for action '${action.id}'.`,
            'mechanic'
          )
        );
      } else if (spend.amount !== cost.amountPerCycle) {
        issues.push(
          issue(
            'MECHANIC_RESOURCE_SPEND_MISMATCH',
            `${path}/resourceCosts/${index}/amountPerCycle`,
            `Action cost must match resource '${resource.id}' spend amount ${spend.amount}.`,
            'mechanic'
          )
        );
      }
    }
  });

  action.stateInteractions.forEach((interaction, index) => {
    const interactionPath = `${path}/stateInteractions/${index}`;
    const state = requireReference(
      references.states,
      interaction.stateId,
      `${interactionPath}/stateId`,
      'state',
      issues
    );
    if (interaction.operation === 'clear' && interaction.value !== undefined) {
      issues.push(
        issue(
          'MECHANIC_STATE_INTERACTION_VALUE',
          `${interactionPath}/value`,
          'Clear interactions cannot carry a value.',
          'mechanic'
        )
      );
    }
    if (interaction.operation !== 'clear' && interaction.value === undefined) {
      issues.push(
        issue(
          'MECHANIC_STATE_INTERACTION_VALUE',
          `${interactionPath}/value`,
          `${interaction.operation} interactions require a value.`,
          'mechanic'
        )
      );
    }
    if (state !== undefined && interaction.value !== undefined) {
      if (interaction.operation === 'increment' && typeof state.initialValue !== 'number') {
        issues.push(
          issue(
            'MECHANIC_STATE_INTERACTION_TYPE',
            `${interactionPath}/operation`,
            `Only numeric state '${state.id}' can be incremented.`,
            'mechanic'
          )
        );
      } else if (!sameType(state.initialValue, interaction.value)) {
        issues.push(
          issue(
            'MECHANIC_STATE_INTERACTION_TYPE',
            `${interactionPath}/value`,
            `State '${state.id}' interactions require ${typeof state.initialValue} values.`,
            'mechanic'
          )
        );
      } else if (interaction.operation === 'set' && typeof interaction.value === 'number') {
        if (
          (state.minimum !== undefined && interaction.value < state.minimum) ||
          (state.maximum !== undefined && interaction.value > state.maximum)
        ) {
          issues.push(
            issue(
              'MECHANIC_STATE_INTERACTION_BOUNDS',
              `${interactionPath}/value`,
              `Set value is outside state '${state.id}' bounds.`,
              'mechanic'
            )
          );
        }
      } else if (interaction.operation === 'increment' && typeof interaction.value === 'number') {
        if (
          (interaction.value > 0 && state.maximum === undefined) ||
          (interaction.value < 0 && state.minimum === undefined)
        ) {
          issues.push(
            issue(
              'MECHANIC_STATE_INTERACTION_BOUNDS',
              `${interactionPath}/value`,
              `Incremented state '${state.id}' requires a bound in the direction of change.`,
              'mechanic'
            )
          );
        }
      }
    }
  });
}

function validateResource(
  resource: Resource,
  path: string,
  references: References,
  issues: ValidationIssue[]
): void {
  if (resource.startingAmount > resource.cap) {
    issues.push(
      issue(
        'MECHANIC_RESOURCE_CAP',
        `${path}/startingAmount`,
        `Resource '${resource.id}' starts above its cap ${resource.cap}.`,
        'mechanic'
      )
    );
  }
  resource.generation.forEach((generation, index) => {
    const generationPath = `${path}/generation/${index}`;
    if (generation.event === 'on-damage') {
      issues.push(
        issue(
          'SIMULATION_UNSUPPORTED_RESOURCE_GENERATION',
          `${generationPath}/event`,
          "Simulator does not support 'on-damage' resource generation.",
          'simulation'
        )
      );
    }
    if (generation.event === 'time' && generation.intervalSeconds === undefined) {
      issues.push(
        issue(
          'MECHANIC_RESOURCE_GENERATION_INCOMPLETE',
          `${generationPath}/intervalSeconds`,
          'Time-based resource generation requires intervalSeconds.',
          'mechanic'
        )
      );
    }
    if (generation.event !== 'time' && generation.intervalSeconds !== undefined) {
      issues.push(
        issue(
          'MECHANIC_RESOURCE_GENERATION_CONTRACT',
          `${generationPath}/intervalSeconds`,
          'intervalSeconds is only valid for time-based generation.',
          'mechanic'
        )
      );
    }
    if (generation.actionId !== undefined) {
      requireReference(
        references.actions,
        generation.actionId,
        `${generationPath}/actionId`,
        'action',
        issues
      );
    }
  });
  const spendContracts = new Set<string>();
  resource.spend.forEach((spend, index) => {
    const spendContract = `${spend.event}\u0000${spend.referenceId}`;
    if (spendContracts.has(spendContract)) {
      issues.push(
        issue(
          'MECHANIC_DUPLICATE_RESOURCE_SPEND',
          `${path}/spend/${index}/referenceId`,
          `Resource '${resource.id}' declares '${spend.event}' spend for '${spend.referenceId}' more than once.`,
          'mechanic'
        )
      );
    }
    spendContracts.add(spendContract);
    const spendPath = `${path}/spend/${index}/referenceId`;
    const target =
      spend.event === 'action'
        ? requireReference(references.actions, spend.referenceId, spendPath, 'action', issues)
        : spend.event === 'ability'
          ? requireReference(references.abilities, spend.referenceId, spendPath, 'ability', issues)
          : requireReference(references.forms, spend.referenceId, spendPath, 'form', issues);
    if (target !== undefined && spend.amount > resource.cap) {
      issues.push(
        issue(
          'MECHANIC_RESOURCE_SPEND_RANGE',
          `${path}/spend/${index}/amount`,
          `Spend amount exceeds resource '${resource.id}' cap ${resource.cap}.`,
          'mechanic'
        )
      );
    }
  });
  if (resource.recovery.type === 'regeneration' && resource.expirySeconds !== undefined) {
    issues.push(
      issue(
        'SIMULATION_UNSUPPORTED_RESOURCE_EXPIRY',
        `${path}/expirySeconds`,
        `Simulator does not support regeneration combined with expiry for resource '${resource.id}'.`,
        'simulation'
      )
    );
  }
  if (
    resource.persistence === 'until-spent' &&
    resource.spend.length === 0 &&
    ![...references.actions.values()].some((action) =>
      action.effects.some(
        (effect) =>
          effect.type === 'resource-change' &&
          effect.resourceId === resource.id &&
          effect.operation === 'spend'
      )
    )
  ) {
    issues.push(
      issue(
        'MECHANIC_RESOURCE_SPEND_INCOMPLETE',
        `${path}/spend`,
        "A resource with 'until-spent' persistence requires a spend event.",
        'mechanic'
      )
    );
  }
}

function validateStateDefinition(
  state: UnitSpec['states'][number],
  path: string,
  issues: ValidationIssue[]
): void {
  if (
    (state.minimum !== undefined || state.maximum !== undefined) &&
    typeof state.initialValue !== 'number'
  ) {
    issues.push(
      issue(
        'MECHANIC_STATE_BOUNDS_TYPE',
        path,
        `Non-numeric state '${state.id}' cannot declare numeric bounds.`,
        'mechanic'
      )
    );
  }
  if (state.minimum !== undefined && state.maximum !== undefined && state.minimum > state.maximum) {
    issues.push(
      issue(
        'MECHANIC_STATE_BOUNDS',
        `${path}/minimum`,
        `State '${state.id}' minimum exceeds its maximum.`,
        'mechanic'
      )
    );
  }
  if (typeof state.initialValue !== 'number') return;
  if (state.minimum !== undefined && state.initialValue < state.minimum) {
    issues.push(
      issue(
        'MECHANIC_STATE_BOUNDS',
        `${path}/initialValue`,
        `State '${state.id}' starts below its minimum.`,
        'mechanic'
      )
    );
  }
  if (state.maximum !== undefined && state.initialValue > state.maximum) {
    issues.push(
      issue(
        'MECHANIC_STATE_BOUNDS',
        `${path}/initialValue`,
        `State '${state.id}' starts above its maximum.`,
        'mechanic'
      )
    );
  }
}

function validateAbilityDefinition(
  ability: UnitSpec['abilities'][number],
  path: string,
  references: References,
  issues: ValidationIssue[]
): void {
  const action = requireReference(
    references.actions,
    ability.actionId,
    `${path}/actionId`,
    'action',
    issues
  );
  if (ability.resourceId !== undefined) {
    const resource = requireReference(
      references.resources,
      ability.resourceId,
      `${path}/resourceId`,
      'resource',
      issues
    );
    const actionCost = action?.resourceCosts.some((cost) => cost.resourceId === ability.resourceId);
    const abilitySpend = resource?.spend.some(
      (spend) => spend.event === 'ability' && spend.referenceId === ability.id
    );
    if (resource !== undefined && actionCost !== true && abilitySpend !== true) {
      issues.push(
        issue(
          'MECHANIC_RESOURCE_SPEND_INCOMPLETE',
          `${path}/resourceId`,
          `Ability '${ability.id}' resource '${resource.id}' has no matching spend contract.`,
          'mechanic'
        )
      );
    }
  }
  if (
    (ability.type === 'active' || ability.type === 'transformation') &&
    action !== undefined &&
    action.trigger.type !== 'manual'
  ) {
    issues.push(
      issue(
        'MECHANIC_ABILITY_TRIGGER',
        `${path}/actionId`,
        `${ability.type} ability '${ability.id}' must use a manual action.`,
        'mechanic'
      )
    );
  }
  if (
    ability.type === 'transformation' &&
    action !== undefined &&
    !action.effects.some((effect) => effect.type === 'transform')
  ) {
    issues.push(
      issue(
        'MECHANIC_ABILITY_INCOMPLETE',
        `${path}/actionId`,
        `Transformation ability '${ability.id}' requires a transform effect.`,
        'mechanic'
      )
    );
  }
  if (
    (ability.type === 'active' ||
      ability.type === 'automatic' ||
      ability.type === 'transformation') &&
    ability.cooldownSeconds === 0 &&
    ability.rechargeSeconds === 0
  ) {
    issues.push(
      issue(
        'MECHANIC_ABILITY_UNBOUNDED',
        path,
        `Ability '${ability.id}' requires a positive cooldown or recharge time.`,
        'mechanic'
      )
    );
  }
}

function validateFormDefinition(
  form: Form,
  path: string,
  references: References,
  issues: ValidationIssue[]
): void {
  form.requirements.forEach((condition, index) =>
    validateCondition(condition, `${path}/requirements/${index}`, references, issues)
  );
  if (form.persistence === 'timed') {
    if (form.durationSeconds === undefined || form.reversion !== 'automatic') {
      issues.push(
        issue(
          'MECHANIC_FORM_INCOMPLETE',
          path,
          `Timed form '${form.id}' requires durationSeconds and automatic reversion.`,
          'mechanic'
        )
      );
    }
  } else if (form.durationSeconds !== undefined) {
    issues.push(
      issue(
        'MECHANIC_FORM_CONTRACT',
        `${path}/durationSeconds`,
        `Only timed form '${form.id}' may declare durationSeconds.`,
        'mechanic'
      )
    );
  }
  if (form.persistence === 'until-reverted' && form.reversion !== 'manual') {
    issues.push(
      issue(
        'MECHANIC_FORM_INCOMPLETE',
        `${path}/reversion`,
        `Until-reverted form '${form.id}' requires manual reversion.`,
        'mechanic'
      )
    );
  }
}

function validateMechanicDefinitions(
  definitions: MechanicDefinitions,
  references: References,
  issues: ValidationIssue[]
): void {
  definitions.actions.forEach((action, index) =>
    validateAction(action, `/actions/${index}`, references, issues)
  );
  definitions.resources.forEach((resource, index) =>
    validateResource(resource, `/resources/${index}`, references, issues)
  );
  definitions.states.forEach((state, index) =>
    validateStateDefinition(state, `/states/${index}`, issues)
  );
  definitions.abilities.forEach((ability, index) =>
    validateAbilityDefinition(ability, `/abilities/${index}`, references, issues)
  );
  definitions.summons.forEach((summon, index) =>
    requireReference(
      references.actions,
      summon.actionId,
      `/summons/${index}/actionId`,
      'action',
      issues
    )
  );
  definitions.forms.forEach((form, index) =>
    validateFormDefinition(form, `/forms/${index}`, references, issues)
  );
}

function unsupportedSelectedFormIssue(form: Form, path: string): ValidationIssue | undefined {
  if (
    form.activation === 'external' &&
    form.requirements.length === 0 &&
    form.persistence === 'encounter' &&
    form.durationSeconds === undefined &&
    form.reversion === 'none'
  ) {
    return undefined;
  }
  return issue(
    'SIMULATION_UNSUPPORTED_FORM',
    path,
    `Selectable form '${form.id}' must be an external, unconditional encounter form with no duration or reversion.`,
    'simulation'
  );
}

function rejectTransitiveFormGrant(
  operation: UpgradeOperation,
  path: string,
  issues: ValidationIssue[]
): void {
  if (operation.type !== 'grant-form') return;
  issues.push(
    issue(
      'SIMULATION_UNSUPPORTED_FORM_GRANT',
      `${path}/type`,
      'Forms cannot grant other forms in simulator 0.1.',
      'simulation'
    )
  );
}

function operationTarget(operation: UpgradeOperation): string {
  if ('actionId' in operation) return operation.actionId;
  if ('resourceId' in operation) return operation.resourceId;
  if ('abilityId' in operation) return operation.abilityId;
  if ('summonId' in operation) return operation.summonId;
  if ('formId' in operation) return operation.formId;
  return operation.type === 'modify-placement' ? 'placement' : 'economy';
}

function validationMutationKeys(
  operation: UpgradeOperation,
  aliases: ReadonlyMap<string, string>
): string[] {
  const action = (id: string, property: string) =>
    `action:${resolveValidationActionId(aliases, id)}:${property}`;
  switch (operation.type) {
    case 'enable-action':
    case 'disable-action':
      return [action(operation.actionId, 'enabled')];
    case 'replace-action':
      return [
        action(operation.actionId, 'enabled'),
        action(operation.replacementActionId, 'enabled'),
        action(operation.actionId, 'replacement')
      ];
    case 'modify-action':
      return [action(operation.actionId, operation.parameter)];
    case 'add-effect':
      return [action(operation.actionId, `effect:${operation.effect.id}`)];
    case 'modify-effect':
      return [action(operation.actionId, `effect:${operation.effectId}:${operation.parameter}`)];
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

function resolveValidationActionId(aliases: ReadonlyMap<string, string>, actionId: string): string {
  let resolved = actionId;
  const visited = new Set<string>();
  while (aliases.has(resolved) && !visited.has(resolved)) {
    visited.add(resolved);
    resolved = aliases.get(resolved) ?? resolved;
  }
  return resolved;
}

function validateOperation(
  operation: UpgradeOperation,
  path: string,
  references: References,
  effectsByAction: ReadonlyMap<string, ReadonlyMap<string, Effect>>,
  issues: ValidationIssue[],
  aliases: ReadonlyMap<string, string> = new Map()
): void {
  const actionId =
    'actionId' in operation ? resolveValidationActionId(aliases, operation.actionId) : undefined;
  switch (operation.type) {
    case 'enable-action':
    case 'disable-action':
      requireReference(
        references.actions,
        actionId ?? operation.actionId,
        `${path}/actionId`,
        'action',
        issues
      );
      break;
    case 'replace-action':
      requireReference(
        references.actions,
        actionId ?? operation.actionId,
        `${path}/actionId`,
        'action',
        issues
      );
      requireReference(
        references.actions,
        operation.replacementActionId,
        `${path}/replacementActionId`,
        'action',
        issues
      );
      if (operation.actionId === operation.replacementActionId) {
        issues.push(
          issue(
            'OPERATION_INVALID_REPLACEMENT',
            path,
            'An action cannot replace itself.',
            'operation'
          )
        );
      }
      break;
    case 'modify-action': {
      const action = requireReference(
        references.actions,
        actionId ?? operation.actionId,
        `${path}/actionId`,
        'action',
        issues
      );
      if (
        action !== undefined &&
        (operation.parameter === 'emitterCount' || operation.parameter === 'projectilesPerCycle') &&
        action.emitters.length !== 1
      ) {
        issues.push(
          issue(
            'OPERATION_AMBIGUOUS_TARGET',
            `${path}/parameter`,
            `Action '${action.id}' has ${action.emitters.length} emitters; the operation has no emitterId.`,
            'operation'
          )
        );
      }
      if (
        action !== undefined &&
        operation.parameter === 'rangeWorldUnits' &&
        action.rangeWorldUnits === undefined &&
        operation.operation !== 'set'
      ) {
        issues.push(
          issue(
            'OPERATION_TYPE_MISMATCH',
            `${path}/parameter`,
            `Action '${action.id}' inherits range; only a set operation can create an explicit range.`,
            'operation'
          )
        );
      }
      break;
    }
    case 'add-effect':
      requireReference(
        references.actions,
        actionId ?? operation.actionId,
        `${path}/actionId`,
        'action',
        issues
      );
      validateEffect(operation.effect, `${path}/effect`, references, issues);
      if (unsupportedEffects.has(operation.effect.type)) {
        issues.push(
          issue(
            'SIMULATION_UNSUPPORTED_EFFECT',
            `${path}/effect/type`,
            `Simulator does not support executable '${operation.effect.type}' effects.`,
            'simulation'
          )
        );
      }
      break;
    case 'modify-effect': {
      requireReference(
        references.actions,
        actionId ?? operation.actionId,
        `${path}/actionId`,
        'action',
        issues
      );
      const effect = effectsByAction.get(actionId ?? operation.actionId)?.get(operation.effectId);
      if (effect === undefined) {
        issues.push(
          issue(
            'REFERENCE_MISSING_EFFECT',
            `${path}/effectId`,
            `Effect '${operation.effectId}' does not exist on action '${operation.actionId}'.`,
            'reference'
          )
        );
      } else if (!effectParameters[effect.type].has(operation.parameter)) {
        issues.push(
          issue(
            'OPERATION_TYPE_MISMATCH',
            `${path}/parameter`,
            `Effect '${effect.id}' of type '${effect.type}' has no numeric '${operation.parameter}' parameter.`,
            'operation'
          )
        );
      }
      break;
    }
    case 'enable-resource':
    case 'modify-resource': {
      const resource = requireReference(
        references.resources,
        operation.resourceId,
        `${path}/resourceId`,
        'resource',
        issues
      );
      if (
        operation.type === 'modify-resource' &&
        operation.parameter === 'generationAmount' &&
        resource !== undefined &&
        resource.generation.length !== 1
      ) {
        issues.push(
          issue(
            'OPERATION_AMBIGUOUS_TARGET',
            `${path}/parameter`,
            `Resource '${resource.id}' has ${resource.generation.length} generation entries; the operation has no generation selector.`,
            'operation'
          )
        );
      }
      break;
    }
    case 'grant-ability':
      requireReference(
        references.abilities,
        operation.abilityId,
        `${path}/abilityId`,
        'ability',
        issues
      );
      break;
    case 'enable-summon':
      requireReference(
        references.summons,
        operation.summonId,
        `${path}/summonId`,
        'summon',
        issues
      );
      break;
    case 'grant-form':
      requireReference(references.forms, operation.formId, `${path}/formId`, 'form', issues);
      break;
    case 'modify-placement':
      if (operation.addSurface === undefined && operation.removeSurface === undefined) {
        issues.push(
          issue(
            'OPERATION_INCOMPLETE',
            path,
            'modify-placement requires addSurface or removeSurface.',
            'operation'
          )
        );
      }
      if (operation.addSurface !== undefined && operation.addSurface === operation.removeSurface) {
        issues.push(
          issue(
            'OPERATION_CONFLICT',
            path,
            `Surface '${operation.addSurface}' cannot be added and removed by one operation.`,
            'operation'
          )
        );
      }
      break;
  }
}

function collectStableIdIssues(unit: UnitSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, string>();
  const add = (id: string, path: string): void => {
    const previous = seen.get(id);
    if (previous !== undefined) {
      issues.push(
        issue(
          'REFERENCE_DUPLICATE_ID',
          path,
          `Stable ID '${id}' is already declared at ${previous}.`,
          'reference'
        )
      );
    } else {
      seen.set(id, path);
    }
  };

  add(unit.id, '/id');
  unit.upgradeGraph.paths.forEach((path, index) => add(path.id, `/upgradeGraph/paths/${index}/id`));
  unit.resources.forEach((resource, index) => add(resource.id, `/resources/${index}/id`));
  unit.states.forEach((state, index) => add(state.id, `/states/${index}/id`));
  unit.statuses.forEach((status, index) => add(status.id, `/statuses/${index}/id`));
  unit.actions.forEach((action, actionIndex) => {
    add(action.id, `/actions/${actionIndex}/id`);
    add(action.targeting.id, `/actions/${actionIndex}/targeting/id`);
    add(action.delivery.id, `/actions/${actionIndex}/delivery/id`);
    action.emitters.forEach((emitter, emitterIndex) =>
      add(emitter.id, `/actions/${actionIndex}/emitters/${emitterIndex}/id`)
    );
    action.effects.forEach((effect, effectIndex) =>
      add(effect.id, `/actions/${actionIndex}/effects/${effectIndex}/id`)
    );
  });
  unit.abilities.forEach((ability, index) => add(ability.id, `/abilities/${index}/id`));
  unit.summons.forEach((summon, index) => add(summon.id, `/summons/${index}/id`));
  unit.forms.forEach((form, formIndex) => {
    add(form.id, `/forms/${formIndex}/id`);
    form.operations.forEach((operation, operationIndex) => {
      if (operation.type === 'add-effect') {
        add(operation.effect.id, `/forms/${formIndex}/operations/${operationIndex}/effect/id`);
      }
    });
  });
  unit.upgradeGraph.nodes.forEach((node, nodeIndex) => {
    add(node.id, `/upgradeGraph/nodes/${nodeIndex}/id`);
    node.operations.forEach((operation, operationIndex) => {
      if (operation.type === 'add-effect') {
        add(
          operation.effect.id,
          `/upgradeGraph/nodes/${nodeIndex}/operations/${operationIndex}/effect/id`
        );
      }
    });
  });
  unit.requirements.visuals.forEach((requirement, index) =>
    add(requirement.id, `/requirements/visuals/${index}/id`)
  );
  unit.requirements.animations.forEach((requirement, index) =>
    add(requirement.id, `/requirements/animations/${index}/id`)
  );
  (unit.requirements.audio ?? []).forEach((requirement, index) =>
    add(requirement.id, `/requirements/audio/${index}/id`)
  );
  return issues;
}

export function topologicalUpgrades(nodes: readonly UpgradeNode[]): UpgradeNode[] | undefined {
  const nodeById = byId(nodes);
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const dependents = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const node of nodes) {
    for (const prerequisite of node.prerequisites) {
      if (nodeById.has(prerequisite)) {
        indegree.set(node.id, (indegree.get(node.id) ?? 0) + 1);
        dependents.get(prerequisite)?.push(node.id);
      }
    }
  }
  const ready = [...nodes]
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id)
    .sort();
  const ordered: UpgradeNode[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) break;
    const node = nodeById.get(id);
    if (node === undefined) continue;
    ordered.push(node);
    for (const dependent of (dependents.get(id) ?? []).sort()) {
      const next = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, next);
      if (next === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }
  return ordered.length === nodes.length ? ordered : undefined;
}

function ancestorIds(nodeId: string, nodes: ReadonlyMap<string, UpgradeNode>): Set<string> {
  const ancestors = new Set<string>();
  const visit = (id: string): void => {
    const node = nodes.get(id);
    if (node === undefined) return;
    for (const prerequisite of node.prerequisites) {
      if (!ancestors.has(prerequisite)) {
        ancestors.add(prerequisite);
        visit(prerequisite);
      }
    }
  };
  visit(nodeId);
  return ancestors;
}

function validateUpgradeGraph(unit: UnitSpec, issues: ValidationIssue[]): void {
  const paths = byId(unit.upgradeGraph.paths);
  const nodes = byId(unit.upgradeGraph.nodes);
  const tierOwner = new Map<string, string>();

  unit.upgradeGraph.nodes.forEach((node, index) => {
    const path = `/upgradeGraph/nodes/${index}`;
    node.prerequisites.forEach((prerequisite, prerequisiteIndex) => {
      requireReference(
        nodes,
        prerequisite,
        `${path}/prerequisites/${prerequisiteIndex}`,
        'upgrade',
        issues
      );
      if (prerequisite === node.id) {
        issues.push(
          issue(
            'GRAPH_SELF_DEPENDENCY',
            `${path}/prerequisites/${prerequisiteIndex}`,
            `Upgrade '${node.id}' cannot require itself.`,
            'graph'
          )
        );
      }
    });
    (node.exclusions ?? []).forEach((excluded, exclusionIndex) => {
      requireReference(nodes, excluded, `${path}/exclusions/${exclusionIndex}`, 'upgrade', issues);
      if (excluded === node.id) {
        issues.push(
          issue(
            'GRAPH_SELF_EXCLUSION',
            `${path}/exclusions/${exclusionIndex}`,
            `Upgrade '${node.id}' cannot exclude itself.`,
            'graph'
          )
        );
      }
    });

    if ((node.path === undefined) !== (node.tier === undefined)) {
      issues.push(
        issue(
          'GRAPH_TIER_PATH_PAIR',
          path,
          'Upgrade path and tier must either both be present or both be absent.',
          'graph'
        )
      );
    }
    if (node.path !== undefined) {
      requireReference(paths, node.path, `${path}/path`, 'path', issues);
    }
    if (node.path !== undefined && node.tier !== undefined) {
      const key = `${node.path}\u0000${node.tier}`;
      const owner = tierOwner.get(key);
      if (owner !== undefined) {
        issues.push(
          issue(
            'GRAPH_DUPLICATE_TIER',
            `${path}/tier`,
            `Path '${node.path}' tier ${node.tier} is already occupied by upgrade '${owner}'.`,
            'graph'
          )
        );
      } else {
        tierOwner.set(key, node.id);
      }
      if (node.tier > unit.upgradeGraph.selectionRules.maximumPrimaryPathTier) {
        issues.push(
          issue(
            'GRAPH_TIER_LIMIT',
            `${path}/tier`,
            `Tier ${node.tier} exceeds maximumPrimaryPathTier ${unit.upgradeGraph.selectionRules.maximumPrimaryPathTier}.`,
            'graph'
          )
        );
      }
    }
  });

  const ordered = topologicalUpgrades(unit.upgradeGraph.nodes);
  if (ordered === undefined) {
    issues.push(
      issue(
        'GRAPH_CYCLE',
        '/upgradeGraph/nodes',
        'Upgrade prerequisites must form a directed acyclic graph.',
        'graph'
      )
    );
    return;
  }

  unit.upgradeGraph.nodes.forEach((node, index) => {
    const ancestors = ancestorIds(node.id, nodes);
    if ((node.exclusions ?? []).some((excluded) => ancestors.has(excluded))) {
      issues.push(
        issue(
          'GRAPH_PREREQUISITE_EXCLUDED',
          `/upgradeGraph/nodes/${index}/exclusions`,
          `Upgrade '${node.id}' excludes one of its prerequisites.`,
          'graph'
        )
      );
    }
    if (node.path !== undefined && node.tier !== undefined) {
      for (const prerequisiteId of node.prerequisites) {
        const prerequisite = nodes.get(prerequisiteId);
        if (
          prerequisite?.path === node.path &&
          prerequisite.tier !== undefined &&
          prerequisite.tier >= node.tier
        ) {
          issues.push(
            issue(
              'GRAPH_TIER_ORDER',
              `/upgradeGraph/nodes/${index}/prerequisites`,
              `Upgrade '${node.id}' cannot require same-path tier ${prerequisite.tier}.`,
              'graph'
            )
          );
        }
      }
      if (node.tier > 1) {
        const hasPreviousTier = [...ancestors].some((ancestorId) => {
          const ancestor = nodes.get(ancestorId);
          return ancestor?.path === node.path && ancestor?.tier === node.tier! - 1;
        });
        if (!hasPreviousTier) {
          issues.push(
            issue(
              'GRAPH_TIER_PREREQUISITE',
              `/upgradeGraph/nodes/${index}/prerequisites`,
              `Path '${node.path}' tier ${node.tier} must inherit tier ${node.tier - 1}.`,
              'graph'
            )
          );
        }
      }
    }
  });

  unit.upgradeGraph.nodes.forEach((node, index) => {
    const upgradeIds = [...ancestorIds(node.id, nodes), node.id];
    const selectionIssues = validateBuildSelection(unit, { upgradeIds });
    if (selectionIssues.length > 0) {
      issues.push(
        issue(
          'GRAPH_UNREACHABLE_UPGRADE',
          `/upgradeGraph/nodes/${index}`,
          `Upgrade '${node.id}' cannot appear in a valid selection: ${selectionIssues[0]?.message ?? 'unknown reason'}`,
          'graph'
        )
      );
    }
  });
}

function baseEffects(unit: Pick<UnitSpec, 'actions'>): Map<string, Map<string, Effect>> {
  return new Map(
    unit.actions.map((action) => [
      action.id,
      new Map(action.effects.map((effect) => [effect.id, effect]))
    ])
  );
}

function replayOperationDefinitions(
  effects: Map<string, Map<string, Effect>>,
  aliases: Map<string, string>,
  operation: UpgradeOperation
): void {
  if (operation.type === 'replace-action') {
    const source = resolveValidationActionId(aliases, operation.actionId);
    const replacement = resolveValidationActionId(aliases, operation.replacementActionId);
    for (const [alias, target] of aliases) {
      if (resolveValidationActionId(aliases, target) === source) aliases.set(alias, replacement);
    }
    aliases.set(source, replacement);
    aliases.set(operation.actionId, replacement);
  } else if (operation.type === 'add-effect') {
    const actionId = resolveValidationActionId(aliases, operation.actionId);
    effects.get(actionId)?.set(operation.effect.id, operation.effect);
  }
}

function definitionContext(
  unit: Pick<UnitSpec, 'actions'>,
  operations: readonly UpgradeOperation[]
): { effects: Map<string, Map<string, Effect>>; aliases: Map<string, string> } {
  const effects = baseEffects(unit);
  const aliases = new Map<string, string>();
  for (const operation of operations) replayOperationDefinitions(effects, aliases, operation);
  return { effects, aliases };
}

interface AvailabilityContext {
  actions: Map<string, boolean>;
  actionDefinitions: Map<string, Action>;
  abilities: Map<string, boolean>;
  resources: Map<string, boolean>;
  resourceDefinitions: Map<string, Resource>;
  summons: Map<string, boolean>;
  forms: Set<string>;
  surfaces: Set<string>;
  aliases: Map<string, string>;
  baseCostCredits: number;
}

function availabilityContext(unit: UnitSpec): AvailabilityContext {
  return {
    actions: new Map(unit.actions.map((value) => [value.id, value.unlockedByDefault])),
    actionDefinitions: byId(structuredClone(unit.actions)),
    abilities: new Map(unit.abilities.map((value) => [value.id, value.unlockedByDefault])),
    resources: new Map(unit.resources.map((value) => [value.id, value.unlockedByDefault])),
    resourceDefinitions: byId(structuredClone(unit.resources)),
    summons: new Map(unit.summons.map((value) => [value.id, value.unlockedByDefault])),
    forms: new Set(unit.forms.filter((value) => value.externallyUnlocked).map((value) => value.id)),
    surfaces: new Set(unit.placement.allowedSurfaces),
    aliases: new Map(),
    baseCostCredits: unit.economy.baseCostCredits
  };
}

const calculate = (current: number, operation: 'add' | 'multiply' | 'set', value: number) =>
  operation === 'add' ? current + value : operation === 'multiply' ? current * value : value;

function operationNumberIssue(
  value: number,
  path: string,
  label: string,
  options: { integer?: boolean; positive?: boolean; nonNegative?: boolean; maximum?: number } = {}
): ValidationIssue | undefined {
  if (!Number.isFinite(value)) {
    return issue('OPERATION_INVALID_RESULT', path, `${label} must remain finite.`, 'operation');
  }
  if (Math.abs(value) > MAXIMUM_ACCUMULATOR_MAGNITUDE) {
    return issue(
      'OPERATION_INVALID_RESULT',
      path,
      `${label} magnitude must not exceed ${MAXIMUM_ACCUMULATOR_MAGNITUDE}.`,
      'operation'
    );
  }
  if (options.integer === true && !Number.isInteger(value)) {
    return issue('OPERATION_INVALID_RESULT', path, `${label} must remain an integer.`, 'operation');
  }
  if (options.positive === true && value <= 0) {
    return issue(
      'OPERATION_INVALID_RESULT',
      path,
      `${label} must remain greater than zero.`,
      'operation'
    );
  }
  if (options.nonNegative === true && value < 0) {
    return issue(
      'OPERATION_INVALID_RESULT',
      path,
      `${label} must remain non-negative.`,
      'operation'
    );
  }
  if (options.maximum !== undefined && value > options.maximum) {
    return issue(
      'OPERATION_EXECUTION_LIMIT',
      path,
      `${label} must not exceed ${options.maximum}.`,
      'operation'
    );
  }
  return undefined;
}

function applyAvailability(
  context: AvailabilityContext,
  operation: UpgradeOperation,
  path: string,
  issues?: ValidationIssue[]
): void {
  const conflict = (message: string, suffix = ''): void => {
    issues?.push(issue('OPERATION_CONFLICT', `${path}${suffix}`, message, 'operation'));
  };
  switch (operation.type) {
    case 'enable-action':
    case 'disable-action': {
      const id = resolveValidationActionId(context.aliases, operation.actionId);
      const enabled = operation.type === 'enable-action';
      if (context.actions.get(id) === enabled) {
        conflict(`Action '${id}' is already ${enabled ? 'enabled' : 'disabled'}.`);
      }
      context.actions.set(id, enabled);
      break;
    }
    case 'replace-action': {
      const source = resolveValidationActionId(context.aliases, operation.actionId);
      const replacement = resolveValidationActionId(context.aliases, operation.replacementActionId);
      if (
        source === replacement ||
        context.actions.get(source) !== true ||
        context.actions.get(replacement) === true
      ) {
        conflict(
          'Replacement requires an enabled source and a distinct disabled replacement action.'
        );
        break;
      }
      context.actions.set(replacement, context.actions.get(source) ?? false);
      context.actions.set(source, false);
      for (const [alias, target] of context.aliases) {
        if (resolveValidationActionId(context.aliases, target) === source) {
          context.aliases.set(alias, replacement);
        }
      }
      context.aliases.set(source, replacement);
      context.aliases.set(operation.actionId, replacement);
      break;
    }
    case 'modify-action': {
      const id = resolveValidationActionId(context.aliases, operation.actionId);
      const action = context.actionDefinitions.get(id);
      if (action === undefined) break;
      let current: number | undefined;
      let assign: (value: number) => void;
      let limits: Parameters<typeof operationNumberIssue>[3] = { nonNegative: true };
      if (operation.parameter === 'cooldownSeconds') {
        current = action.timing.cooldownSeconds;
        assign = (value) => (action.timing.cooldownSeconds = value);
      } else if (operation.parameter === 'rangeWorldUnits') {
        current = action.rangeWorldUnits;
        assign = (value) => (action.rangeWorldUnits = value);
      } else if (operation.parameter === 'maximumTargetsPerProjectile') {
        current = action.delivery.maximumTargetsPerProjectile;
        assign = (value) => (action.delivery.maximumTargetsPerProjectile = value);
        limits = {
          integer: true,
          positive: true,
          maximum: UNIT_EXECUTION_LIMITS.maximumTargets
        };
      } else {
        const emitter = action.emitters.length === 1 ? action.emitters[0] : undefined;
        if (emitter === undefined) break;
        const parameter =
          operation.parameter === 'emitterCount' ? 'emitterCount' : 'projectilesPerCycle';
        current = emitter[parameter];
        assign = (value) => (emitter[parameter] = value);
        limits = {
          integer: true,
          positive: true,
          maximum:
            parameter === 'emitterCount'
              ? UNIT_EXECUTION_LIMITS.maximumEmitterCount
              : UNIT_EXECUTION_LIMITS.maximumProjectilesPerCycle
        };
      }
      if (current === undefined) {
        if (operation.operation !== 'set') break;
        current = 0;
      }
      const result = calculate(current, operation.operation, operation.value);
      const invalid = operationNumberIssue(result, `${path}/value`, operation.parameter, limits);
      if (invalid !== undefined) issues?.push(invalid);
      else {
        assign(result);
        const emissions = actionEmissionsPerCycle(action);
        if (
          emissions > UNIT_EXECUTION_LIMITS.maximumEmissionsPerCycle ||
          emissions * action.delivery.maximumTargetsPerProjectile >
            UNIT_EXECUTION_LIMITS.maximumTargetApplicationsPerCycle
        ) {
          issues?.push(
            issue(
              'OPERATION_EXECUTION_LIMIT',
              `${path}/value`,
              `Mutation exceeds per-cycle execution limits (${UNIT_EXECUTION_LIMITS.maximumEmissionsPerCycle} emissions and ${UNIT_EXECUTION_LIMITS.maximumTargetApplicationsPerCycle} target applications).`,
              'operation'
            )
          );
        }
      }
      break;
    }
    case 'add-effect': {
      const id = resolveValidationActionId(context.aliases, operation.actionId);
      const action = context.actionDefinitions.get(id);
      if (action !== undefined) {
        if (action.effects.length >= VALIDATION_LIMITS.maximumCollectionItems) {
          issues?.push(
            issue(
              'OPERATION_COLLECTION_LIMIT',
              `${path}/effect`,
              `Action '${action.id}' cannot exceed ${VALIDATION_LIMITS.maximumCollectionItems} effects.`,
              'operation'
            )
          );
        } else {
          action.effects.push(structuredClone(operation.effect));
        }
      }
      break;
    }
    case 'modify-effect': {
      const id = resolveValidationActionId(context.aliases, operation.actionId);
      const effect = context.actionDefinitions
        .get(id)
        ?.effects.find((candidate) => candidate.id === operation.effectId);
      if (effect === undefined || !effectParameters[effect.type].has(operation.parameter)) break;
      const record = effect as unknown as Record<string, unknown>;
      const current = record[operation.parameter];
      if (typeof current !== 'number') break;
      const result = calculate(current, operation.operation, operation.value);
      const invalid = operationNumberIssue(result, `${path}/value`, operation.parameter, {
        positive: operation.parameter === 'durationSeconds',
        nonNegative:
          operation.parameter !== 'durationSeconds' &&
          operation.parameter !== 'amountCredits' &&
          !(effect.type === 'stat-modifier' && operation.parameter === 'amount')
      });
      if (invalid !== undefined) issues?.push(invalid);
      else record[operation.parameter] = result;
      break;
    }
    case 'enable-resource':
      if (context.resources.get(operation.resourceId) === true) {
        conflict(`Resource '${operation.resourceId}' is already enabled.`);
      }
      context.resources.set(operation.resourceId, true);
      break;
    case 'modify-resource': {
      const resource = context.resourceDefinitions.get(operation.resourceId);
      if (resource === undefined) break;
      let current: number;
      let assign: (value: number) => void;
      if (operation.parameter === 'startingAmount') {
        current = resource.startingAmount;
        assign = (value) => (resource.startingAmount = value);
      } else if (operation.parameter === 'cap') {
        current = resource.cap;
        assign = (value) => (resource.cap = value);
      } else {
        const generation = resource.generation.length === 1 ? resource.generation[0] : undefined;
        if (generation === undefined) break;
        current = generation.amount;
        assign = (value) => (generation.amount = value);
      }
      const result = calculate(current, operation.operation, operation.value);
      const invalid = operationNumberIssue(result, `${path}/value`, operation.parameter, {
        positive: operation.parameter !== 'startingAmount',
        nonNegative: operation.parameter === 'startingAmount'
      });
      if (invalid !== undefined) issues?.push(invalid);
      else {
        assign(result);
        if (resource.startingAmount > resource.cap) {
          issues?.push(
            issue(
              'OPERATION_INVALID_RESULT',
              path,
              `Resource '${resource.id}' startingAmount exceeds cap after mutation.`,
              'operation'
            )
          );
        }
      }
      break;
    }
    case 'grant-ability':
      if (context.abilities.get(operation.abilityId) === true) {
        conflict(`Ability '${operation.abilityId}' is already granted.`);
      }
      context.abilities.set(operation.abilityId, true);
      break;
    case 'enable-summon':
      if (context.summons.get(operation.summonId) === true) {
        conflict(`Summon '${operation.summonId}' is already enabled.`);
      }
      context.summons.set(operation.summonId, true);
      break;
    case 'grant-form':
      if (context.forms.has(operation.formId)) {
        conflict(`Form '${operation.formId}' is already granted.`);
      }
      context.forms.add(operation.formId);
      break;
    case 'modify-placement':
      if (operation.addSurface !== undefined) {
        if (context.surfaces.has(operation.addSurface)) {
          conflict(`Surface '${operation.addSurface}' is already allowed.`, '/addSurface');
        }
        const removesExistingSurface =
          operation.removeSurface !== undefined && context.surfaces.has(operation.removeSurface);
        if (
          context.surfaces.size >= VALIDATION_LIMITS.maximumCollectionItems &&
          !removesExistingSurface
        ) {
          issues?.push(
            issue(
              'OPERATION_COLLECTION_LIMIT',
              `${path}/addSurface`,
              `Placement cannot exceed ${VALIDATION_LIMITS.maximumCollectionItems} allowed surfaces.`,
              'operation'
            )
          );
        } else {
          context.surfaces.add(operation.addSurface);
        }
      }
      if (operation.removeSurface !== undefined) {
        if (!context.surfaces.has(operation.removeSurface)) {
          issues?.push(
            issue(
              'OPERATION_TARGET_MISSING',
              `${path}/removeSurface`,
              `Surface '${operation.removeSurface}' is not allowed.`,
              'operation'
            )
          );
        }
        context.surfaces.delete(operation.removeSurface);
      }
      if (context.surfaces.size === 0) {
        issues?.push(
          issue(
            'OPERATION_INVALID_RESULT',
            path,
            'A unit must retain at least one allowed surface.',
            'operation'
          )
        );
      }
      break;
    case 'modify-economy': {
      const result = calculate(
        context.baseCostCredits,
        operation.operation,
        operation.valueCredits
      );
      const invalid = operationNumberIssue(result, `${path}/valueCredits`, 'baseCostCredits', {
        nonNegative: true
      });
      if (invalid !== undefined) issues?.push(invalid);
      else context.baseCostCredits = result;
      break;
    }
  }
}

function actionEdges(
  actions: readonly Action[],
  summons: readonly UnitSpec['summons'][number][]
): Map<string, Set<string>> {
  const summonActions = new Map(summons.map((summon) => [summon.id, summon.actionId]));
  const edges = new Map(actions.map((action) => [action.id, new Set<string>()]));
  for (const action of actions) {
    for (const effect of action.effects) {
      if (effect.type === 'secondary-action') edges.get(action.id)?.add(effect.actionId);
      if (effect.type === 'spawn') {
        const target = summonActions.get(effect.summonId);
        if (target !== undefined) edges.get(action.id)?.add(target);
      }
    }
  }
  return edges;
}

function reachableActions(
  roots: ReadonlySet<string>,
  edges: ReadonlyMap<string, ReadonlySet<string>>
): Set<string> {
  const reachable = new Set<string>();
  const pending = [...roots].sort().reverse();
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || reachable.has(id)) continue;
    reachable.add(id);
    for (const target of [...(edges.get(id) ?? [])].sort().reverse()) pending.push(target);
  }
  return reachable;
}

function findActionCycle(
  edges: ReadonlyMap<string, ReadonlySet<string>>,
  included: ReadonlySet<string>
): string[] | undefined {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  let cycle: string[] | undefined;
  const visit = (id: string): void => {
    if (cycle !== undefined || !included.has(id) || visited.has(id)) return;
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      cycle = [...stack.slice(start), id];
      return;
    }
    visiting.add(id);
    stack.push(id);
    for (const target of [...(edges.get(id) ?? [])].sort()) visit(target);
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of [...included].sort()) visit(id);
  return cycle;
}

function validateSimulationCapabilities(
  actions: readonly Action[],
  abilities: readonly UnitSpec['abilities'][number][],
  summons: readonly UnitSpec['summons'][number][],
  statuses: readonly UnitSpec['statuses'][number][],
  potentialActionIds: ReadonlySet<string>,
  potentialAbilityIds: ReadonlySet<string>,
  issues: ValidationIssue[],
  basePath = ''
): void {
  const actionIndex = new Map(actions.map((action, index) => [action.id, index]));
  const statusById = byId(statuses);
  const abilityActions = new Set(
    abilities
      .filter((ability) => potentialAbilityIds.has(ability.id))
      .map((ability) => ability.actionId)
  );
  const edges = actionEdges(actions, summons);
  const reachable = reachableActions(new Set([...potentialActionIds, ...abilityActions]), edges);
  const cycle = findActionCycle(edges, reachable);
  if (cycle !== undefined) {
    issues.push(
      issue(
        'MECHANIC_ACTION_CYCLE',
        `${basePath}/actions`,
        `Action execution cycle is unbounded: ${cycle.join(' -> ')}.`,
        'mechanic'
      )
    );
  }

  for (const actionId of [...reachable].sort()) {
    const action = actions.find((candidate) => candidate.id === actionId);
    if (action === undefined) continue;
    const index = actionIndex.get(action.id) ?? 0;
    action.effects.forEach((effect, effectIndex) => {
      if (unsupportedEffects.has(effect.type)) {
        issues.push(
          issue(
            'SIMULATION_UNSUPPORTED_EFFECT',
            `${basePath}/actions/${index}/effects/${effectIndex}/type`,
            `Simulator does not support executable '${effect.type}' effects.`,
            'simulation'
          )
        );
      }
      if (effect.type === 'status' && statusById.get(effect.statusId)?.removal === 'manual') {
        issues.push(
          issue(
            'SIMULATION_UNSUPPORTED_STATUS_REMOVAL',
            `${basePath}/actions/${index}/effects/${effectIndex}/statusId`,
            `Simulator does not support manual removal for executable status '${effect.statusId}'.`,
            'simulation'
          )
        );
      }
    });
  }

  abilities.forEach((ability, index) => {
    if (
      potentialAbilityIds.has(ability.id) &&
      (ability.type === 'reactive' || ability.type === 'passive')
    ) {
      issues.push(
        issue(
          'SIMULATION_UNSUPPORTED_ABILITY',
          `${basePath}/abilities/${index}/type`,
          `Simulator does not schedule '${ability.type}' abilities.`,
          'simulation'
        )
      );
    }
  });

  for (const actionId of potentialActionIds) {
    const action = actions.find((candidate) => candidate.id === actionId);
    if (action === undefined || action.trigger.type === 'interval') continue;
    if (action.trigger.type === 'manual' && abilityActions.has(action.id)) continue;
    const index = actionIndex.get(action.id) ?? 0;
    issues.push(
      issue(
        'SIMULATION_UNSUPPORTED_TRIGGER',
        `${basePath}/actions/${index}/trigger/type`,
        `Simulator cannot schedule executable '${action.trigger.type}' action '${action.id}' as a primary action.`,
        'simulation'
      )
    );
  }
}

function validateMechanics(unit: UnitSpec, issues: ValidationIssue[]): void {
  const references = makeReferences(unit);
  validateMechanicDefinitions(unit, references, issues);

  unit.summons.forEach((summon, index) => {
    const path = `/summons/${index}`;
    if (
      summon.activation === 'spawn-effect' &&
      !unit.actions.some((action) =>
        action.effects.some((effect) => effect.type === 'spawn' && effect.summonId === summon.id)
      ) &&
      ![...unit.upgradeGraph.nodes, ...unit.forms].some((owner) =>
        owner.operations.some(
          (operation) =>
            operation.type === 'add-effect' &&
            operation.effect.type === 'spawn' &&
            operation.effect.summonId === summon.id
        )
      )
    ) {
      issues.push(
        issue(
          'MECHANIC_SUMMON_ACTIVATION_INCOMPLETE',
          `${path}/activation`,
          `Summon '${summon.id}' has no spawn effect.`,
          'mechanic'
        )
      );
    }
  });

  const grantedForms = new Set<string>();

  const nodeById = byId(unit.upgradeGraph.nodes);
  const orderedNodes = topologicalUpgrades(unit.upgradeGraph.nodes) ?? [];
  const contextOperations = (node: UpgradeNode): UpgradeOperation[] => {
    const ancestors = ancestorIds(node.id, nodeById);
    return orderedNodes
      .filter((candidate) => ancestors.has(candidate.id) || candidate.id === node.id)
      .flatMap((candidate) => candidate.operations);
  };

  unit.upgradeGraph.nodes.forEach((node, nodeIndex) => {
    const priorOperations = contextOperations(node).slice(0, -node.operations.length);
    const { effects: availableEffects, aliases } = definitionContext(unit, priorOperations);
    const availability = availabilityContext(unit);
    const ownerMutations = new Set<string>();
    priorOperations.forEach((operation) => applyAvailability(availability, operation, ''));
    node.operations.forEach((operation, operationIndex) => {
      const path = `/upgradeGraph/nodes/${nodeIndex}/operations/${operationIndex}`;
      for (const key of validationMutationKeys(operation, aliases)) {
        if (ownerMutations.has(key)) {
          issues.push(
            issue(
              'OPERATION_CONFLICT',
              path,
              `Upgrade '${node.id}' mutates '${key}' more than once.`,
              'operation'
            )
          );
        }
        ownerMutations.add(key);
      }
      validateOperation(operation, path, references, availableEffects, issues, aliases);
      applyAvailability(availability, operation, path, issues);
      replayOperationDefinitions(availableEffects, aliases, operation);
      if (operation.type === 'grant-form') grantedForms.add(operation.formId);
    });
  });

  unit.forms.forEach((form, formIndex) => {
    const contexts: UpgradeOperation[][] = [];
    if (form.externallyUnlocked) contexts.push([]);
    for (const node of orderedNodes) {
      if (
        node.operations.some(
          (operation) => operation.type === 'grant-form' && operation.formId === form.id
        )
      ) {
        contexts.push(contextOperations(node));
      }
    }
    if (contexts.length === 0) contexts.push([]);
    for (const operations of contexts) {
      const { effects, aliases } = definitionContext(unit, operations);
      const availability = availabilityContext(unit);
      const ownerMutations = new Set<string>();
      operations.forEach((operation) => applyAvailability(availability, operation, ''));
      form.operations.forEach((operation, operationIndex) => {
        const path = `/forms/${formIndex}/operations/${operationIndex}`;
        rejectTransitiveFormGrant(operation, path, issues);
        for (const key of validationMutationKeys(operation, aliases)) {
          if (ownerMutations.has(key)) {
            issues.push(
              issue(
                'OPERATION_CONFLICT',
                path,
                `Form '${form.id}' mutates '${key}' more than once.`,
                'operation'
              )
            );
          }
          ownerMutations.add(key);
        }
        validateOperation(operation, path, references, effects, issues, aliases);
        applyAvailability(availability, operation, path, issues);
        replayOperationDefinitions(effects, aliases, operation);
      });
    }
  });

  unit.forms.forEach((form, index) => {
    const available = form.externallyUnlocked || grantedForms.has(form.id);
    if (!available) {
      issues.push(
        issue(
          'MECHANIC_FORM_UNREACHABLE',
          `/forms/${index}`,
          `Form '${form.id}' is neither externally unlocked nor granted.`,
          'mechanic'
        )
      );
    } else {
      const unsupported = unsupportedSelectedFormIssue(form, `/forms/${index}`);
      if (unsupported !== undefined) issues.push(unsupported);
    }
  });

  const possibleAbilityIds = new Set(
    unit.abilities
      .filter(
        (ability) =>
          ability.unlockedByDefault ||
          unit.upgradeGraph.nodes.some((node) =>
            node.operations.some(
              (operation) =>
                operation.type === 'grant-ability' && operation.abilityId === ability.id
            )
          )
      )
      .map((ability) => ability.id)
  );
  const possibleSummonIds = new Set(
    unit.summons
      .filter(
        (summon) =>
          summon.unlockedByDefault ||
          unit.upgradeGraph.nodes.some((node) =>
            node.operations.some(
              (operation) => operation.type === 'enable-summon' && operation.summonId === summon.id
            )
          ) ||
          unit.actions.some((action) =>
            action.effects.some(
              (effect) => effect.type === 'spawn' && effect.summonId === summon.id
            )
          )
      )
      .map((summon) => summon.id)
  );
  const possibleActionIds = new Set(
    unit.actions
      .filter(
        (action) =>
          action.unlockedByDefault ||
          unit.upgradeGraph.nodes.some((node) =>
            node.operations.some(
              (operation) =>
                (operation.type === 'enable-action' && operation.actionId === action.id) ||
                (operation.type === 'replace-action' && operation.replacementActionId === action.id)
            )
          )
      )
      .map((action) => action.id)
  );
  for (const ability of unit.abilities) {
    if (possibleAbilityIds.has(ability.id)) possibleActionIds.add(ability.actionId);
  }
  for (const summon of unit.summons) {
    if (possibleSummonIds.has(summon.id) && summon.activation === 'automatic') {
      possibleActionIds.add(summon.actionId);
    }
  }
  validateSimulationCapabilities(
    unit.actions,
    unit.abilities,
    unit.summons,
    unit.statuses,
    possibleActionIds,
    possibleAbilityIds,
    issues
  );
}

export function validateBuildSelection(
  unit: UnitSpec,
  selection: BuildSelection
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(selection.upgradeIds)) {
    return [
      issue(
        'GRAPH_SELECTION_TYPE',
        '/selection/upgradeIds',
        'upgradeIds must be an array.',
        'graph'
      )
    ];
  }
  const nodeById = byId(unit.upgradeGraph.nodes);
  const selected = new Set<string>();
  selection.upgradeIds.forEach((id, index) => {
    if (typeof id !== 'string' || !nodeById.has(id)) {
      issues.push(
        issue(
          'GRAPH_SELECTION_UNKNOWN',
          `/selection/upgradeIds/${index}`,
          `Upgrade '${String(id)}' does not exist.`,
          'graph'
        )
      );
    } else if (selected.has(id)) {
      issues.push(
        issue(
          'GRAPH_SELECTION_DUPLICATE',
          `/selection/upgradeIds/${index}`,
          `Upgrade '${id}' is selected more than once.`,
          'graph'
        )
      );
    }
    if (typeof id === 'string') selected.add(id);
  });

  for (const id of selected) {
    const node = nodeById.get(id);
    if (node === undefined) continue;
    const missing = node.prerequisites.find((prerequisite) => !selected.has(prerequisite));
    if (missing !== undefined) {
      issues.push(
        issue(
          'GRAPH_SELECTION_MISSING_PREREQUISITE',
          '/selection/upgradeIds',
          `Upgrade '${id}' requires '${missing}'.`,
          'graph'
        )
      );
    }
    const excluded = (node.exclusions ?? []).find((candidate) => selected.has(candidate));
    if (excluded !== undefined) {
      issues.push(
        issue(
          'GRAPH_SELECTION_EXCLUSION',
          '/selection/upgradeIds',
          `Upgrade '${id}' excludes '${excluded}'.`,
          'graph'
        )
      );
    }
    const reverseExcluded = unit.upgradeGraph.nodes.find(
      (candidate) => selected.has(candidate.id) && (candidate.exclusions ?? []).includes(id)
    );
    if (reverseExcluded !== undefined) {
      issues.push(
        issue(
          'GRAPH_SELECTION_EXCLUSION',
          '/selection/upgradeIds',
          `Upgrade '${reverseExcluded.id}' excludes '${id}'.`,
          'graph'
        )
      );
    }
  }

  const rules = unit.upgradeGraph.selectionRules;
  if (selected.size > rules.maximumSelectedNodes) {
    issues.push(
      issue(
        'GRAPH_SELECTION_LIMIT',
        '/selection/upgradeIds',
        `Selection has ${selected.size} nodes; maximumSelectedNodes is ${rules.maximumSelectedNodes}.`,
        'graph'
      )
    );
  }

  const tiersByPath = new Map<string, number>();
  for (const id of selected) {
    const node = nodeById.get(id);
    if (node?.path !== undefined && node.tier !== undefined) {
      tiersByPath.set(node.path, Math.max(tiersByPath.get(node.path) ?? 0, node.tier));
      if (node.tier > rules.maximumPrimaryPathTier) {
        issues.push(
          issue(
            'GRAPH_SELECTION_TIER_LIMIT',
            '/selection/upgradeIds',
            `Upgrade '${id}' exceeds maximumPrimaryPathTier ${rules.maximumPrimaryPathTier}.`,
            'graph'
          )
        );
      }
    }
  }
  const forcedPrimaryPaths = [...tiersByPath].filter(
    ([, tier]) => tier > rules.maximumCrossPathTier
  );
  if (forcedPrimaryPaths.length > 1) {
    issues.push(
      issue(
        'GRAPH_SELECTION_CROSS_PATH',
        '/selection/upgradeIds',
        `Only one path may exceed maximumCrossPathTier ${rules.maximumCrossPathTier}.`,
        'graph'
      )
    );
  }
  const primaryPath =
    forcedPrimaryPaths[0]?.[0] ??
    [...tiersByPath].sort(
      (left, right) => right[1] - left[1] || compareText(left[0], right[0])
    )[0]?.[0];
  const crossPaths = [...tiersByPath].filter(([path]) => path !== primaryPath);
  if (crossPaths.length > rules.maximumCrossPaths) {
    issues.push(
      issue(
        'GRAPH_SELECTION_CROSS_PATH',
        '/selection/upgradeIds',
        `Selection uses ${crossPaths.length} cross paths; maximumCrossPaths is ${rules.maximumCrossPaths}.`,
        'graph'
      )
    );
  }
  for (const [path, tier] of crossPaths) {
    if (tier > rules.maximumCrossPathTier) {
      issues.push(
        issue(
          'GRAPH_SELECTION_CROSS_PATH',
          '/selection/upgradeIds',
          `Cross path '${path}' reaches tier ${tier}; maximumCrossPathTier is ${rules.maximumCrossPathTier}.`,
          'graph'
        )
      );
    }
  }

  const formIds = selection.formIds ?? [];
  if (!Array.isArray(formIds)) {
    issues.push(
      issue('GRAPH_SELECTION_TYPE', '/selection/formIds', 'formIds must be an array.', 'graph')
    );
  } else {
    const selectedForms = new Set<string>();
    const forms = byId(unit.forms);
    const granted = new Set<string>();
    for (const id of selected) {
      for (const operation of nodeById.get(id)?.operations ?? []) {
        if (operation.type === 'grant-form') granted.add(operation.formId);
      }
    }
    formIds.forEach((id, index) => {
      const form = typeof id === 'string' ? forms.get(id) : undefined;
      if (form === undefined) {
        issues.push(
          issue(
            'GRAPH_SELECTION_UNKNOWN_FORM',
            `/selection/formIds/${index}`,
            `Form '${String(id)}' does not exist.`,
            'graph'
          )
        );
      } else if (selectedForms.has(id)) {
        issues.push(
          issue(
            'GRAPH_SELECTION_DUPLICATE_FORM',
            `/selection/formIds/${index}`,
            `Form '${id}' is selected more than once.`,
            'graph'
          )
        );
      } else if (!form.externallyUnlocked && !granted.has(id)) {
        issues.push(
          issue(
            'GRAPH_SELECTION_FORM_LOCKED',
            `/selection/formIds/${index}`,
            `Form '${id}' is not unlocked by this selection.`,
            'graph'
          )
        );
      }
      if (form !== undefined) {
        const unsupported = unsupportedSelectedFormIssue(form, `/selection/formIds/${index}`);
        if (unsupported !== undefined) issues.push(unsupported);
      }
      if (typeof id === 'string') selectedForms.add(id);
    });
  }
  return sortIssues(issues);
}

export function validateUnitSemantics(unit: UnitSpec): ValidationIssue[] {
  const issues = collectStableIdIssues(unit);
  validateUpgradeGraph(unit, issues);
  validateMechanics(unit, issues);
  return sortIssues(issues);
}

export function validateUnitSpec(value: unknown): ValidationReport<UnitSpec> {
  const schema = validateSchema(unitSpecSchema, value);
  if (!schema.valid || schema.value === undefined) {
    return { valid: false, issues: sortIssues(schema.issues) };
  }
  const semanticIssues = validateUnitSemantics(schema.value);
  const issues =
    semanticIssues.length === 0
      ? sortIssues(selectionViabilityIssues(schema.value))
      : semanticIssues;
  return issues.length === 0
    ? { valid: true, value: schema.value, issues }
    : { valid: false, issues };
}

const sourcePointerExpression = new RegExp(SOURCE_POINTER_PATTERN, 'u');

function jsonPointerTokens(pointer: string): string[] | undefined {
  if (pointer === '') return [];
  if (!pointer.startsWith('/') || /~(?![01])/u.test(pointer)) return undefined;
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function validSourcePointer(pointer: string): boolean {
  if (!sourcePointerExpression.test(pointer)) return false;
  try {
    return jsonPointerTokens(decodeURIComponent(pointer.slice(1))) !== undefined;
  } catch {
    return false;
  }
}

function containsLocalPath(value: string): boolean {
  const boundary = String.raw`(?:^|[\s'"()[\]{}=,;]|:(?!//))`;
  return (
    /\bfile:/iu.test(value) ||
    new RegExp(`${boundary}/+[^\\s,;)\\]}]*`, 'u').test(value) ||
    new RegExp(`${boundary}[A-Za-z]:[\\\\/]`, 'u').test(value) ||
    new RegExp(`${boundary}\\\\\\\\[^\\\\\\s]+\\\\`, 'u').test(value)
  );
}

function jsonPointerResolves(value: unknown, pointer: string): boolean {
  const tokens = jsonPointerTokens(pointer);
  if (tokens === undefined) return false;
  let current = value;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(token)) return false;
      const index = Number(token);
      if (!Number.isSafeInteger(index) || index >= current.length) return false;
      current = current[index];
    } else if (typeof current === 'object' && current !== null && Object.hasOwn(current, token)) {
      current = (current as Record<string, unknown>)[token];
    } else {
      return false;
    }
  }
  return true;
}

function provenanceRecordIssues(
  provenance: ReferenceProvenance,
  unit?: UnitSpec
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  provenance.records.forEach((record, index) => {
    const path = `/provenance/records/${index}`;
    if (jsonPointerTokens(record.targetPointer) === undefined) {
      issues.push(
        issue(
          'SCHEMA_PATTERN',
          `${path}/targetPointer`,
          'targetPointer must be an RFC 6901 JSON Pointer.',
          'schema'
        )
      );
    } else if (unit !== undefined && !jsonPointerResolves(unit, record.targetPointer)) {
      issues.push(
        issue(
          'REFERENCE_PROVENANCE_TARGET_MISSING',
          `${path}/targetPointer`,
          `targetPointer '${record.targetPointer}' does not resolve in UnitSpec '${unit.id}'.`,
          'reference'
        )
      );
    }
    if (record.sourcePointer !== undefined && !validSourcePointer(record.sourcePointer)) {
      issues.push(
        issue(
          'SCHEMA_PATTERN',
          `${path}/sourcePointer`,
          'sourcePointer must be an RFC 6901 URI-fragment JSON Pointer.',
          'schema'
        )
      );
    }
    for (const field of ['sourceArtifact', 'derivation', 'note'] as const) {
      const text = record[field];
      if (text !== undefined && containsLocalPath(text)) {
        issues.push(
          issue(
            'PROVENANCE_LOCAL_PATH',
            `${path}/${field}`,
            `${field} must not contain an absolute local path or file URI.`,
            'reference'
          )
        );
      }
    }
  });
  return issues;
}

export function validateProvenance(
  value: unknown,
  expectedUnit?: string | UnitSpec
): ValidationReport<ReferenceProvenance> {
  const schema = validateSchema(referenceProvenanceSchema, value);
  const issues = schema.issues.map((entry) => ({
    ...entry,
    path: entry.path.startsWith('/provenance')
      ? entry.path
      : `/provenance${entry.path === '/' ? '' : entry.path}`
  }));
  const unitId = typeof expectedUnit === 'string' ? expectedUnit : expectedUnit?.id;
  if (
    schema.valid &&
    schema.value !== undefined &&
    unitId !== undefined &&
    schema.value.unitId !== unitId
  ) {
    issues.push(
      issue(
        'REFERENCE_PROVENANCE_UNIT_MISMATCH',
        '/provenance/unitId',
        `Provenance unitId '${schema.value.unitId}' does not match unit '${unitId}'.`,
        'reference'
      )
    );
  }
  if (schema.valid && schema.value !== undefined) {
    issues.push(
      ...provenanceRecordIssues(
        schema.value,
        typeof expectedUnit === 'object' ? expectedUnit : undefined
      )
    );
  }
  return issues.length === 0 && schema.value !== undefined
    ? { valid: true, value: schema.value, issues: [] }
    : { valid: false, issues: sortIssues(issues) };
}

function validateBuildFormOperations(
  build: UnitBuild,
  references: References,
  issues: ValidationIssue[]
): void {
  build.forms.forEach((form, formIndex) => {
    const { effects, aliases } = definitionContext(build, []);
    form.operations.forEach((operation, operationIndex) => {
      const path = `/forms/${formIndex}/operations/${operationIndex}`;
      rejectTransitiveFormGrant(operation, path, issues);
      validateOperation(operation, path, references, effects, issues, aliases);
      replayOperationDefinitions(effects, aliases, operation);
    });
  });
}

function validateExecutableDependencies(
  build: UnitBuild,
  references: References,
  reachable: ReadonlySet<string>,
  issues: ValidationIssue[]
): void {
  const enabledResources = new Set(
    build.resources.filter((resource) => resource.unlockedByDefault).map((resource) => resource.id)
  );
  const enabledSummons = new Set(
    build.summons.filter((summon) => summon.unlockedByDefault).map((summon) => summon.id)
  );
  const lockedResource = (resourceId: string, path: string, owner: string): void => {
    if (references.resources.has(resourceId) && !enabledResources.has(resourceId)) {
      issues.push(
        issue(
          'MECHANIC_LOCKED_RESOURCE',
          path,
          `${owner} uses locked resource '${resourceId}'.`,
          'mechanic'
        )
      );
    }
  };

  build.actions.forEach((action, actionIndex) => {
    if (!reachable.has(action.id)) return;
    const owner = `Executable action '${action.id}'`;
    action.resourceCosts.forEach((cost, index) =>
      lockedResource(
        cost.resourceId,
        `/actions/${actionIndex}/resourceCosts/${index}/resourceId`,
        owner
      )
    );
    action.conditions.forEach((condition, index) => {
      if (condition.subject === 'resource' && condition.referenceId !== undefined) {
        lockedResource(
          condition.referenceId,
          `/actions/${actionIndex}/conditions/${index}/referenceId`,
          owner
        );
      }
    });
    if (action.trigger.type === 'resource-threshold') {
      lockedResource(
        action.trigger.resourceId,
        `/actions/${actionIndex}/trigger/resourceId`,
        owner
      );
    }
    action.effects.forEach((effect, effectIndex) => {
      if (effect.type === 'resource-change') {
        lockedResource(
          effect.resourceId,
          `/actions/${actionIndex}/effects/${effectIndex}/resourceId`,
          owner
        );
      } else if (
        effect.type === 'spawn' &&
        references.summons.has(effect.summonId) &&
        !enabledSummons.has(effect.summonId)
      ) {
        issues.push(
          issue(
            'MECHANIC_LOCKED_SUMMON',
            `/actions/${actionIndex}/effects/${effectIndex}/summonId`,
            `${owner} spawns locked summon '${effect.summonId}'.`,
            'mechanic'
          )
        );
      }
    });
  });

  build.abilities.forEach((ability, index) => {
    if (ability.unlockedByDefault && ability.resourceId !== undefined) {
      lockedResource(
        ability.resourceId,
        `/abilities/${index}/resourceId`,
        `Executable ability '${ability.id}'`
      );
    }
  });

  build.summons.forEach((summon, index) => {
    if (
      summon.unlockedByDefault &&
      summon.activation === 'spawn-effect' &&
      !build.actions.some(
        (action) =>
          reachable.has(action.id) &&
          action.effects.some((effect) => effect.type === 'spawn' && effect.summonId === summon.id)
      )
    ) {
      issues.push(
        issue(
          'MECHANIC_SUMMON_ACTIVATION_INCOMPLETE',
          `/summons/${index}/activation`,
          `Executable summon '${summon.id}' has no reachable spawn effect.`,
          'mechanic'
        )
      );
    }
  });

  const selectedForms = new Set(build.selectedFormIds);
  build.forms.forEach((form, formIndex) => {
    if (!selectedForms.has(form.id)) return;
    form.requirements.forEach((condition, conditionIndex) => {
      if (condition.subject === 'resource' && condition.referenceId !== undefined) {
        lockedResource(
          condition.referenceId,
          `/forms/${formIndex}/requirements/${conditionIndex}/referenceId`,
          `Selected form '${form.id}'`
        );
      }
    });
  });
}

function validateUnitBuildValue(value: unknown): ValidationReport<UnitBuild> {
  const schema = validateSchema(unitBuildSchema, value);
  if (!schema.valid || schema.value === undefined) {
    return { valid: false, issues: sortIssues(schema.issues) };
  }
  return validateCompiledUnitBuild(schema.value as UnitBuild);
}

/** @internal Validates a compiler-produced build whose schema-safe inputs were already checked. */
export function validateCompiledUnitBuild(build: UnitBuild): ValidationReport<UnitBuild> {
  const issues: ValidationIssue[] = [];
  const references = makeReferences(build);
  const seen = new Map<string, string>();
  const add = (id: string, path: string): void => {
    const previous = seen.get(id);
    if (previous === undefined) seen.set(id, path);
    else
      issues.push(
        issue(
          'REFERENCE_DUPLICATE_ID',
          path,
          `Stable ID '${id}' is already declared at ${previous}.`,
          'reference'
        )
      );
  };
  add(build.unitId, '/unitId');
  build.resources.forEach((resource, index) => add(resource.id, `/resources/${index}/id`));
  build.states.forEach((state, index) => add(state.id, `/states/${index}/id`));
  build.statuses.forEach((status, index) => add(status.id, `/statuses/${index}/id`));
  build.actions.forEach((action, actionIndex) => {
    add(action.id, `/actions/${actionIndex}/id`);
    add(action.targeting.id, `/actions/${actionIndex}/targeting/id`);
    add(action.delivery.id, `/actions/${actionIndex}/delivery/id`);
    action.emitters.forEach((emitter, index) =>
      add(emitter.id, `/actions/${actionIndex}/emitters/${index}/id`)
    );
    action.effects.forEach((effect, index) =>
      add(effect.id, `/actions/${actionIndex}/effects/${index}/id`)
    );
  });
  build.abilities.forEach((ability, index) => add(ability.id, `/abilities/${index}/id`));
  build.summons.forEach((summon, index) => add(summon.id, `/summons/${index}/id`));
  build.forms.forEach((form, index) => add(form.id, `/forms/${index}/id`));
  validateMechanicDefinitions(build, references, issues);
  validateBuildFormOperations(build, references, issues);

  const selectedOperationOwners = new Set([...build.selection, ...build.selectedFormIds]);
  build.appliedOperations.forEach((operation, index) => {
    if (!selectedOperationOwners.has(operation.upgradeId)) {
      issues.push(
        issue(
          'GRAPH_APPLIED_OPERATION_OWNER',
          `/appliedOperations/${index}/upgradeId`,
          `Applied operation owner '${operation.upgradeId}' is not selected in this build.`,
          'graph'
        )
      );
    }
  });
  const selectedUpgrades = new Set(build.selection);
  const grantedForms = new Set(
    build.appliedOperations
      .filter(
        (operation) => operation.type === 'grant-form' && selectedUpgrades.has(operation.upgradeId)
      )
      .map((operation) => operation.target)
  );
  build.selectedFormIds.forEach((formId, index) => {
    const path = `/selectedFormIds/${index}`;
    const form = requireReference(references.forms, formId, path, 'form', issues);
    if (form === undefined) return;
    if (!form.externallyUnlocked && !grantedForms.has(form.id)) {
      issues.push(
        issue(
          'GRAPH_SELECTION_FORM_LOCKED',
          path,
          `Form '${form.id}' is not unlocked by this build.`,
          'graph'
        )
      );
    }
    const unsupported = unsupportedSelectedFormIssue(form, path);
    if (unsupported !== undefined) issues.push(unsupported);
  });

  const potentialAbilities = new Set(
    build.abilities.filter((ability) => ability.unlockedByDefault).map((ability) => ability.id)
  );
  const potentialActions = new Set(
    build.actions.filter((action) => action.unlockedByDefault).map((action) => action.id)
  );
  for (const ability of build.abilities)
    if (potentialAbilities.has(ability.id)) potentialActions.add(ability.actionId);
  for (const summon of build.summons) {
    if (summon.unlockedByDefault && summon.activation === 'automatic')
      potentialActions.add(summon.actionId);
  }
  const enabledSummons = build.summons.filter((summon) => summon.unlockedByDefault);
  const reachable = reachableActions(potentialActions, actionEdges(build.actions, enabledSummons));
  validateExecutableDependencies(build, references, reachable, issues);

  validateSimulationCapabilities(
    build.actions,
    build.abilities,
    enabledSummons,
    build.statuses,
    potentialActions,
    potentialAbilities,
    issues
  );

  return issues.length === 0
    ? { valid: true, value: build, issues: [] }
    : { valid: false, issues: sortIssues(issues) };
}

export function validateUnitBuild(value: unknown): ValidationReport<UnitBuild> {
  try {
    return validateUnitBuildValue(value);
  } catch (error) {
    return {
      valid: false,
      issues: [
        issue(
          'SCHEMA_INVALID',
          '/',
          `UnitBuild validation failed safely: ${error instanceof Error ? error.message : 'unknown malformed value'}.`,
          'schema'
        )
      ]
    };
  }
}

export { operationTarget };
