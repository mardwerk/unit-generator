import {
  DIAGNOSTIC_METRIC_IDS,
  type DiagnosticMetricEvidence,
  type DiagnosticMetricId,
  type DiagnosticReviewFinding,
  type BuildSelection,
  type UnitDiagnosticReport,
  type DiagnosticProfile,
  type SimulationReport,
  type UnitBuild
} from './reports.js';
import { compileResolvedSelection } from './compiler.js';
import { finiteJsonIssues } from './schema-validation.js';
import {
  DIAGNOSTIC_PROFILE_VERSION,
  type Effect,
  type UnitSpec,
  type UpgradeNode
} from './schemas.js';
import { fingerprintUnitBuild } from './simulator.js';
import { validateBuildSelection, validateUnitBuild, validateUnitSpec } from './validation.js';

export interface DiagnosticFormula {
  kind: 'static' | 'dynamic';
  description: string;
  formula: string;
}

export interface ExplainableDiagnosticProfile extends DiagnosticProfile {
  title: string;
  description: string;
  formulas: Record<DiagnosticMetricId, DiagnosticFormula>;
}

export interface BuildEvaluation {
  build: UnitBuild;
  simulations: readonly SimulationReport[];
  parentSelection?: readonly string[];
}

export interface UnitDiagnosticOptions {
  evaluations?: readonly BuildEvaluation[];
  profile?: DiagnosticProfile;
}

const NORMALIZATION = Object.fromEntries(
  DIAGNOSTIC_METRIC_IDS.map((metric) => [metric, { minimum: 0, maximum: 1 }])
) as Record<DiagnosticMetricId, { minimum: number; maximum: number }>;

/** Source-neutral, deliberately uncalibrated Step 1 defaults. */
export const DEFAULT_DIAGNOSTIC_PROFILE: ExplainableDiagnosticProfile = {
  // Persisted in reference annotations; this historical ID is not a general-quality claim.
  id: 'classic-three-path-quality',
  version: DIAGNOSTIC_PROFILE_VERSION,
  title: 'Classic three-path diagnostics (synthetic prior)',
  description:
    'Eleven bounded diagnostics for mechanics and supplied scenarios. They do not rate general quality.',
  calibrationStatus: 'uncalibrated',
  maximumMetricWeight: 0.12,
  weights: {
    pathIdentity: 0.09,
    pathDistinctness: 0.09,
    progressionCoherence: 0.1,
    baseContinuity: 0.08,
    abilityIntegration: 0.08,
    complexityEconomy: 0.09,
    marginalUpgradeValue: 0.11,
    powerCurveShape: 0.1,
    crossPathHealth: 0.1,
    roleConsistency: 0.08,
    scenarioRobustness: 0.08
  },
  normalization: NORMALIZATION,
  formulas: {
    pathIdentity: {
      kind: 'static',
      description: 'Mechanic or role features recur within each path, with room for hybrids.',
      formula: 'mean_path(0.7 * nodes_sharing_a_repeated_feature + 0.3 * strongest_feature_support)'
    },
    pathDistinctness: {
      kind: 'static',
      description: 'Path feature distance is capped at a heuristic threshold.',
      formula: 'mean_pair(min(1, weighted_jaccard_distance(path_a, path_b) / 0.65))'
    },
    progressionCoherence: {
      kind: 'static',
      description:
        'Declared upgrade changes are non-no-op, tier-contiguous, and connected to earlier tiers.',
      formula:
        '0.5 * meaningful_operation_ratio + 0.25 * tier_continuity + 0.25 * dependency_continuity'
    },
    baseContinuity: {
      kind: 'static',
      description:
        'Upgrade operations develop unlocked base mechanics or explicitly bridge to new ones.',
      formula: 'mean(operation_connection_to_base_loop)'
    },
    abilityIntegration: {
      kind: 'static',
      description:
        'Abilities connect through actions, resources, shared effect mechanics, or upgrades.',
      formula: 'mean_ability(reference + resource_link + mechanic_overlap + unlock_link)'
    },
    complexityEconomy: {
      kind: 'static',
      description:
        'Weighted mechanic atoms are checked for declared output and connection to available mechanics.',
      formula: 'valuable_weighted_mechanic_atoms / all_weighted_mechanic_atoms'
    },
    marginalUpgradeValue: {
      kind: 'dynamic',
      description: 'One-upgrade build edges improve multi-category utility in common scenarios.',
      formula: 'mean_edge(clamp((relative_scenario_utility_gain + 0.01) / 0.09, 0, 1))'
    },
    powerCurveShape: {
      kind: 'dynamic',
      description:
        'Aggregate utility avoids dead steps, regressions, and a single overwhelming jump.',
      formula: '1 - regression_penalty - dead_step_penalty - gain_concentration_penalty'
    },
    crossPathHealth: {
      kind: 'dynamic',
      description:
        'Comparable cross-path builds avoid strict observable dominance and zero-cost power.',
      formula:
        'min(structural_health, 1 - dominated_pairs / equal_depth_distinct_allocation_pairs_within_25_percent_cost)'
    },
    roleConsistency: {
      kind: 'dynamic',
      description: 'Declared generic roles have matching scenario observables.',
      formula: 'mean_declared_recognized_role(signal_aggregated_over_all_deepest_builds)'
    },
    scenarioRobustness: {
      kind: 'dynamic',
      description:
        'Builds engage relevant scenarios without requiring specialists to be generalists.',
      formula:
        'mean_all_scenarios(mean_deepest_build(materiality * mean(timeliness, targeting_reliability)))'
    }
  }
};

interface MetricResult {
  raw: number;
  summary: string;
  facts: string[];
}

interface EvaluationEdge {
  parent: BuildEvaluation;
  child: BuildEvaluation;
  relativeGain: number;
  scenarioIds: string[];
}

const clamp = (value: number, minimum = 0, maximum = 1) =>
  Math.min(maximum, Math.max(minimum, value));
const round = (value: number) => {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
};
const mean = (values: readonly number[], fallback = 0) =>
  values.length === 0 ? fallback : values.reduce((sum, value) => sum + value, 0) / values.length;
const sortedUnique = (values: readonly string[]) => [...new Set(values)].sort();
const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

function operationFeatures(unit: UnitSpec, node: UpgradeNode): Map<string, number> {
  const features = new Map<string, number>();
  const add = (key: string, weight: number) => features.set(key, (features.get(key) ?? 0) + weight);
  const addAction = (actionId: string) => {
    const action = unit.actions.find(({ id }) => id === actionId);
    if (!action) return;
    add(`trigger:${action.trigger.type}`, 1);
    add(`delivery:${action.delivery.type}`, 2);
    for (const effect of action.effects) add(`effect:${effect.type}`, 2);
  };
  for (const operation of node.operations) {
    add(`operation:${operation.type}`, 2);
    switch (operation.type) {
      case 'enable-action':
      case 'disable-action':
      case 'modify-action':
      case 'add-effect':
        addAction(operation.actionId);
        if (operation.type === 'modify-action') add(`action-parameter:${operation.parameter}`, 2);
        if (operation.type === 'add-effect') add(`effect:${operation.effect.type}`, 3);
        break;
      case 'replace-action':
        addAction(operation.actionId);
        addAction(operation.replacementActionId);
        break;
      case 'modify-effect':
        addAction(operation.actionId);
        add(`effect-parameter:${operation.parameter}`, 2);
        const effect = unit.actions
          .find(({ id }) => id === operation.actionId)
          ?.effects.find(({ id }) => id === operation.effectId);
        if (effect) add(`effect:${effect.type}`, 2);
        break;
      case 'enable-resource':
      case 'modify-resource': {
        const resource = unit.resources.find(({ id }) => id === operation.resourceId);
        add('system:resource', 2);
        if (resource) {
          add(`resource-recovery:${resource.recovery.type}`, 1);
          for (const generation of resource.generation)
            add(`resource-generation:${generation.event}`, 1);
        }
        break;
      }
      case 'grant-ability': {
        const ability = unit.abilities.find(({ id }) => id === operation.abilityId);
        add(`ability:${ability?.type ?? 'unknown'}`, 2);
        if (ability) addAction(ability.actionId);
        break;
      }
      case 'enable-summon':
        add('system:summon', 2);
        break;
      case 'grant-form':
        add('system:form', 2);
        break;
      case 'modify-placement':
        add('system:placement', 2);
        break;
      case 'modify-economy':
        add('system:economy', 2);
        break;
    }
  }
  return features;
}

function aggregateFeatures(unit: UnitSpec, nodes: readonly UpgradeNode[]): Map<string, number> {
  const aggregate = new Map<string, number>();
  for (const node of nodes) {
    for (const [feature, weight] of operationFeatures(unit, node)) {
      aggregate.set(feature, (aggregate.get(feature) ?? 0) + weight);
    }
  }
  return aggregate;
}

function weightedJaccard(left: ReadonlyMap<string, number>, right: ReadonlyMap<string, number>) {
  const keys = new Set([...left.keys(), ...right.keys()]);
  let intersection = 0;
  let union = 0;
  for (const key of keys) {
    intersection += Math.min(left.get(key) ?? 0, right.get(key) ?? 0);
    union += Math.max(left.get(key) ?? 0, right.get(key) ?? 0);
  }
  return union === 0 ? 0 : intersection / union;
}

function pathNodes(unit: UnitSpec) {
  return unit.upgradeGraph.paths.map((path) => ({
    id: path.id,
    nodes: unit.upgradeGraph.nodes
      .filter((node) => node.path === path.id)
      .sort((left, right) => (left.tier ?? 0) - (right.tier ?? 0) || compareText(left.id, right.id))
  }));
}

function pathIdentity(unit: UnitSpec): MetricResult {
  const paths = pathNodes(unit);
  const scores = paths.map(({ id, nodes }) => {
    if (nodes.length === 0) return { id, score: 0, repeated: 0 };
    if (nodes.length === 1) return { id, score: 1, repeated: 1 };
    const occurrences = new Map<string, number>();
    const nodeFeatureSets = nodes.map((node) => new Set(operationFeatures(unit, node).keys()));
    for (const features of nodeFeatureSets) {
      for (const feature of features) occurrences.set(feature, (occurrences.get(feature) ?? 0) + 1);
    }
    const repeated = new Set([...occurrences].filter(([, count]) => count > 1).map(([key]) => key));
    const covered = nodeFeatureSets.filter((features) =>
      [...features].some((key) => repeated.has(key))
    ).length;
    const strongest = Math.max(...occurrences.values()) / nodes.length;
    return { id, score: 0.7 * (covered / nodes.length) + 0.3 * strongest, repeated: repeated.size };
  });
  return {
    raw: mean(
      scores.map(({ score }) => score),
      0
    ),
    summary: `${scores.filter(({ score }) => score >= 0.7).length}/${scores.length} paths meet the feature-recurrence threshold.`,
    facts: scores.map(
      ({ id, score, repeated }) =>
        `${id}: identity ${round(score)}, ${repeated} recurring mechanic/role features.`
    )
  };
}

function pathDistinctness(unit: UnitSpec): MetricResult {
  const paths = pathNodes(unit).map(({ id, nodes }) => ({
    id,
    features: aggregateFeatures(unit, nodes)
  }));
  const facts: string[] = [];
  const scores: number[] = [];
  for (let left = 0; left < paths.length; left += 1) {
    for (let right = left + 1; right < paths.length; right += 1) {
      const a = paths[left]!;
      const b = paths[right]!;
      const distance = 1 - weightedJaccard(a.features, b.features);
      scores.push(clamp(distance / 0.65));
      facts.push(`${a.id} vs ${b.id}: weighted mechanic distance ${round(distance)}.`);
    }
  }
  return {
    raw: mean(scores, paths.length <= 1 ? 1 : 0),
    summary: `${scores.filter((score) => score >= 1).length}/${scores.length} path pairs reach the heuristic feature-distance threshold.`,
    facts:
      facts.length > 0
        ? facts
        : ['Fewer than two upgrade paths; pairwise distinctness is not applicable.']
  };
}

function baseOperationValue(
  unit: UnitSpec,
  operation: UpgradeNode['operations'][number]
): number | undefined {
  if (operation.type === 'modify-action') {
    const action = unit.actions.find(({ id }) => id === operation.actionId);
    if (!action) return;
    if (operation.parameter === 'cooldownSeconds') return action.timing.cooldownSeconds;
    if (operation.parameter === 'rangeWorldUnits')
      return action.rangeWorldUnits ?? unit.baseStats.rangeWorldUnits;
    if (operation.parameter === 'maximumTargetsPerProjectile')
      return action.delivery.maximumTargetsPerProjectile;
    if (action.emitters.length !== 1) return;
    return action.emitters[0]?.[operation.parameter];
  }
  if (operation.type === 'modify-effect') {
    const effect = unit.actions
      .find(({ id }) => id === operation.actionId)
      ?.effects.find(({ id }) => id === operation.effectId);
    const value = (effect as unknown as Record<string, unknown> | undefined)?.[operation.parameter];
    return typeof value === 'number' ? value : undefined;
  }
  if (operation.type === 'modify-resource') {
    const resource = unit.resources.find(({ id }) => id === operation.resourceId);
    if (!resource) return;
    if (operation.parameter === 'startingAmount') return resource.startingAmount;
    if (operation.parameter === 'cap') return resource.cap;
    return resource.generation.length === 1 ? resource.generation[0]?.amount : undefined;
  }
  return operation.type === 'modify-economy' ? unit.economy.baseCostCredits : undefined;
}

function numericOperationTarget(operation: UpgradeNode['operations'][number]) {
  if (operation.type === 'modify-action')
    return `action:${operation.actionId}:${operation.parameter}`;
  if (operation.type === 'modify-effect')
    return `effect:${operation.actionId}:${operation.effectId}:${operation.parameter}`;
  if (operation.type === 'modify-resource')
    return `resource:${operation.resourceId}:${operation.parameter}`;
  return operation.type === 'modify-economy' ? 'economy:baseCostCredits' : undefined;
}

function numericOperationValue(operation: UpgradeNode['operations'][number]) {
  return operation.type === 'modify-economy'
    ? { operation: operation.operation, value: operation.valueCredits }
    : operation.type === 'modify-action' ||
        operation.type === 'modify-effect' ||
        operation.type === 'modify-resource'
      ? { operation: operation.operation, value: operation.value }
      : undefined;
}

function operationBaseline(
  unit: UnitSpec,
  operation: UpgradeNode['operations'][number]
): number | undefined {
  let baseline = baseOperationValue(unit, operation);
  if (baseline === undefined) return;
  const target = numericOperationTarget(operation);
  const owner = unit.upgradeGraph.nodes.find(({ operations }) => operations.includes(operation));
  if (!target || !owner) return baseline;

  const nodes = new Map(unit.upgradeGraph.nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const preceding: UpgradeNode[] = [];
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodes.get(id);
    if (!node) return;
    [...node.prerequisites].sort(compareText).forEach(visit);
    preceding.push(node);
  };
  [...owner.prerequisites].sort(compareText).forEach(visit);
  const priorOperations = [
    ...preceding.flatMap(({ operations }) => operations),
    ...owner.operations.slice(0, owner.operations.indexOf(operation))
  ];
  for (const prior of priorOperations) {
    if (numericOperationTarget(prior) !== target) continue;
    const mutation = numericOperationValue(prior);
    if (!mutation) continue;
    baseline =
      mutation.operation === 'add'
        ? baseline + mutation.value
        : mutation.operation === 'multiply'
          ? baseline * mutation.value
          : mutation.value;
  }
  return baseline;
}

function operationIsMeaningful(unit: UnitSpec, operation: UpgradeNode['operations'][number]) {
  if (
    operation.type === 'modify-action' ||
    operation.type === 'modify-effect' ||
    operation.type === 'modify-resource'
  ) {
    if (operation.operation === 'multiply') return Math.abs(operation.value - 1) >= 0.01;
    if (operation.operation === 'add') return Math.abs(operation.value) >= 0.01;
    const baseline = operationBaseline(unit, operation);
    return (
      baseline === undefined ||
      Math.abs(operation.value - baseline) >= 0.01 * Math.max(1, Math.abs(baseline))
    );
  }
  if (operation.type === 'modify-economy') {
    if (operation.operation === 'multiply') return Math.abs(operation.valueCredits - 1) >= 0.01;
    if (operation.operation === 'add') return Math.abs(operation.valueCredits) >= 0.01;
    const baseline = operationBaseline(unit, operation);
    return (
      baseline === undefined ||
      Math.abs(operation.valueCredits - baseline) >= 0.01 * Math.max(1, Math.abs(baseline))
    );
  }
  if (operation.type === 'add-effect') return effectValue(unit, operation.effect) >= 0.01;
  return true;
}

function progressionCoherence(unit: UnitSpec): MetricResult {
  const nodes = unit.upgradeGraph.nodes;
  const meaningful = nodes.filter((node) =>
    node.operations.some((operation) => operationIsMeaningful(unit, operation))
  );
  const paths = pathNodes(unit).filter(({ nodes: path }) => path.length > 0);
  const tierScores = paths.map(({ nodes: path }) => {
    const tiers = path
      .map((node) => node.tier)
      .filter((tier): tier is number => tier !== undefined);
    if (tiers.length !== path.length) return 0.5;
    return tiers.every((tier, index) => index === 0 || tier === tiers[index - 1]! + 1) ? 1 : 0;
  });
  const dependencyChecks = paths.flatMap(({ nodes: path }) =>
    path.map((node, index) => {
      if (index === 0) return 1;
      const earlier = new Set(path.slice(0, index).map(({ id }) => id));
      return node.prerequisites.some((id) => earlier.has(id)) ? 1 : 0;
    })
  );
  const meaningfulRatio = nodes.length === 0 ? 0 : meaningful.length / nodes.length;
  const raw = 0.5 * meaningfulRatio + 0.25 * mean(tierScores, 0) + 0.25 * mean(dependencyChecks, 0);
  const flat = nodes
    .filter((node) => !node.operations.some((operation) => operationIsMeaningful(unit, operation)))
    .map(({ id }) => id);
  return {
    raw,
    summary: `${meaningful.length}/${nodes.length} upgrades declare non-no-op changes; the tier/dependency diagnostic is ${round(raw)}.`,
    facts: [
      `Tier continuity: ${round(mean(tierScores, 0))}; prerequisite continuity: ${round(mean(dependencyChecks, 0))}.`,
      flat.length === 0
        ? 'No near-no-op upgrades detected.'
        : `Near-no-op upgrades: ${flat.sort().join(', ')}.`
    ]
  };
}

function effectTypes(action: UnitSpec['actions'][number]) {
  return new Set(action.effects.map(({ type }) => type));
}

function abilityConnection(unit: UnitSpec, ability: UnitSpec['abilities'][number]) {
  const action = unit.actions.find(({ id }) => id === ability.actionId);
  if (!action) return 0;
  const baseActions = unit.actions.filter(
    ({ unlockedByDefault }) => unlockedByDefault && action.id !== ability.actionId
  );
  const baseOverlap = baseActions.some((base) =>
    [...effectTypes(base)].some((type) => effectTypes(action).has(type))
  );
  const grantingNodes = unit.upgradeGraph.nodes.filter((node) =>
    node.operations.some(
      (operation) => operation.type === 'grant-ability' && operation.abilityId === ability.id
    )
  );
  const resourceLinked =
    ability.resourceId !== undefined ||
    action.resourceCosts.length > 0 ||
    action.conditions.some(({ subject }) => subject === 'resource' || subject === 'state') ||
    action.stateInteractions.length > 0;
  const granted = ability.unlockedByDefault || grantingNodes.length > 0;
  const triggerLinked =
    ((ability.type === 'active' || ability.type === 'transformation') &&
      action.trigger.type === 'manual') ||
    (ability.type === 'automatic' && action.trigger.type === 'interval');
  return clamp(
    0.15 +
      (baseOverlap ? 0.25 : 0) +
      (resourceLinked ? 0.25 : 0) +
      (granted ? 0.25 : 0) +
      (triggerLinked ? 0.1 : 0)
  );
}

function operationBaseConnection(unit: UnitSpec, operation: UpgradeNode['operations'][number]) {
  const baseActionIds = new Set(
    unit.actions.filter(({ unlockedByDefault }) => unlockedByDefault).map(({ id }) => id)
  );
  const baseResourceIds = new Set(
    unit.resources.filter(({ unlockedByDefault }) => unlockedByDefault).map(({ id }) => id)
  );
  switch (operation.type) {
    case 'disable-action':
    case 'modify-action':
    case 'modify-effect':
    case 'add-effect':
      return baseActionIds.has(operation.actionId) ? 1 : 0.55;
    case 'replace-action':
      return baseActionIds.has(operation.actionId) ? 1 : 0.55;
    case 'enable-action': {
      const action = unit.actions.find(({ id }) => id === operation.actionId);
      const bases = unit.actions.filter(({ unlockedByDefault }) => unlockedByDefault);
      return action &&
        bases.some((base) => [...effectTypes(base)].some((type) => effectTypes(action).has(type)))
        ? 0.8
        : 0.45;
    }
    case 'enable-resource':
    case 'modify-resource':
      return baseResourceIds.has(operation.resourceId) ? 1 : 0.65;
    case 'grant-ability': {
      const ability = unit.abilities.find(({ id }) => id === operation.abilityId);
      return ability ? abilityConnection(unit, ability) : 0;
    }
    case 'enable-summon':
    case 'grant-form':
      return 0.7;
    case 'modify-placement':
    case 'modify-economy':
      return 1;
  }
}

function baseContinuity(unit: UnitSpec): MetricResult {
  const connections = unit.upgradeGraph.nodes.flatMap((node) =>
    node.operations.map((operation) => ({
      node: node.id,
      score: operationBaseConnection(unit, operation)
    }))
  );
  const weak = connections.filter(({ score }) => score < 0.6).map(({ node }) => node);
  return {
    raw: mean(
      connections.map(({ score }) => score),
      1
    ),
    summary: `${connections.length - weak.length}/${connections.length} upgrade operations match the base-loop connection rules.`,
    facts: [
      weak.length === 0
        ? 'No disconnected upgrade targets detected.'
        : `Weak base-loop connections: ${sortedUnique(weak).join(', ')}.`
    ]
  };
}

function abilityIntegration(unit: UnitSpec): MetricResult {
  const scores = unit.abilities.map((ability) => ({
    id: ability.id,
    score: abilityConnection(unit, ability)
  }));
  return {
    raw: mean(
      scores.map(({ score }) => score),
      1
    ),
    summary:
      scores.length === 0
        ? 'The unit declares no abilities, so ability integration is not applicable.'
        : `${scores.filter(({ score }) => score >= 0.7).length}/${scores.length} abilities meet the declared-mechanic integration threshold.`,
    facts:
      scores.length === 0
        ? ['No ability complexity was added.']
        : scores.map(({ id, score }) => `${id}: integration ${round(score)}.`)
  };
}

function effectValue(unit: UnitSpec, effect: Effect) {
  switch (effect.type) {
    case 'damage':
      return clamp(effect.amountHitPoints / 0.1);
    case 'damage-over-time':
      return clamp(
        (effect.amountHitPointsPerTick *
          Math.floor(effect.durationSeconds / effect.tickIntervalSeconds)) /
          0.1
      );
    case 'status': {
      const magnitude = unit.statuses.find(({ id }) => id === effect.statusId)?.magnitude ?? 0;
      return clamp((magnitude * effect.stacks * effect.durationSeconds) / 0.01);
    }
    case 'reveal':
    case 'transform':
      return clamp(effect.durationSeconds / 0.1);
    case 'spawn':
      return clamp((effect.instances * effect.durationSeconds) / 0.1);
    case 'stat-modifier':
      return clamp((Math.abs(effect.amount) * effect.durationSeconds) / 0.01);
    case 'heal':
    case 'shield':
      return clamp(effect.amountHitPoints / 0.1);
    case 'resource-change':
      return clamp(effect.amount / 0.1);
    case 'forced-movement':
      return clamp(Math.abs(effect.distanceWorldUnits) / 0.1);
    case 'secondary-action':
      return 1;
    case 'economy-change':
      return clamp(Math.abs(effect.amountCredits) / 0.1);
  }
}

function directActionOutput(unit: UnitSpec, actionId: string) {
  const action = unit.actions.find(({ id }) => id === actionId);
  return action
    ? Math.max(
        0,
        ...action.effects
          .filter(
            ({ type }) => type !== 'secondary-action' && type !== 'spawn' && type !== 'transform'
          )
          .map((effect) => effectValue(unit, effect))
      )
    : 0;
}

function complexityEffectValue(unit: UnitSpec, effect: Effect) {
  const direct = effectValue(unit, effect);
  if (effect.type === 'secondary-action') return direct * directActionOutput(unit, effect.actionId);
  if (effect.type === 'spawn') {
    const actionId = unit.summons.find(({ id }) => id === effect.summonId)?.actionId;
    return direct * (actionId ? directActionOutput(unit, actionId) : 0);
  }
  if (effect.type === 'transform') {
    const form = unit.forms.find(({ id }) => id === effect.formId);
    return (
      direct *
      (form
        ? mean(
            form.operations.map((operation) => (operationIsMeaningful(unit, operation) ? 1 : 0)),
            0
          )
        : 0)
    );
  }
  return direct;
}

function complexityEconomy(unit: UnitSpec): MetricResult {
  const operations = unit.upgradeGraph.nodes.flatMap(
    ({ operations: nodeOperations }) => nodeOperations
  );
  const availableAbilities = new Set(
    unit.abilities
      .filter(
        (ability) =>
          ability.unlockedByDefault ||
          operations.some(
            (operation) => operation.type === 'grant-ability' && operation.abilityId === ability.id
          )
      )
      .map(({ id }) => id)
  );
  const connectedSummons = new Set(
    unit.summons
      .filter(
        (summon) =>
          summon.unlockedByDefault ||
          operations.some(
            (operation) => operation.type === 'enable-summon' && operation.summonId === summon.id
          )
      )
      .map(({ id }) => id)
  );
  const connectedActions = new Set(
    unit.actions
      .filter(
        (action) =>
          action.unlockedByDefault ||
          operations.some(
            (operation) =>
              (operation.type === 'enable-action' && operation.actionId === action.id) ||
              (operation.type === 'replace-action' && operation.replacementActionId === action.id)
          ) ||
          unit.abilities.some(
            (ability) => availableAbilities.has(ability.id) && ability.actionId === action.id
          ) ||
          unit.summons.some(
            (summon) => connectedSummons.has(summon.id) && summon.actionId === action.id
          )
      )
      .map(({ id }) => id)
  );
  let grew = true;
  while (grew) {
    grew = false;
    for (const action of unit.actions) {
      if (!connectedActions.has(action.id)) continue;
      const effects = [
        ...action.effects,
        ...operations.flatMap((operation) =>
          operation.type === 'add-effect' && operation.actionId === action.id
            ? [operation.effect]
            : []
        )
      ];
      for (const effect of effects) {
        if (effect.type === 'spawn') connectedSummons.add(effect.summonId);
        const linkedActionId =
          effect.type === 'secondary-action'
            ? effect.actionId
            : effect.type === 'spawn'
              ? unit.summons.find(({ id }) => id === effect.summonId)?.actionId
              : undefined;
        if (linkedActionId && !connectedActions.has(linkedActionId)) {
          connectedActions.add(linkedActionId);
          grew = true;
        }
      }
    }
  }
  const stateReaders = new Set([
    ...unit.actions.flatMap((action) => [
      ...(action.trigger.type === 'state-change' ? [action.trigger.stateId] : []),
      ...action.conditions.flatMap((condition) =>
        condition.subject === 'state' && condition.referenceId ? [condition.referenceId] : []
      )
    ]),
    ...unit.forms.flatMap(({ requirements }) =>
      requirements.flatMap((condition) =>
        condition.subject === 'state' && condition.referenceId ? [condition.referenceId] : []
      )
    )
  ]);
  const availableResources = new Set(
    unit.resources
      .filter(
        (resource) =>
          resource.unlockedByDefault ||
          operations.some(
            (operation) =>
              operation.type === 'enable-resource' && operation.resourceId === resource.id
          )
      )
      .map(({ id }) => id)
  );
  const availableForms = new Set(
    unit.forms
      .filter(
        (form) =>
          form.externallyUnlocked ||
          operations.some(
            (operation) =>
              (operation.type === 'grant-form' && operation.formId === form.id) ||
              (operation.type === 'add-effect' &&
                connectedActions.has(operation.actionId) &&
                operation.effect.type === 'transform' &&
                operation.effect.formId === form.id)
          ) ||
          unit.actions.some(
            ({ id, effects }) =>
              connectedActions.has(id) &&
              effects.some((effect) => effect.type === 'transform' && effect.formId === form.id)
          )
      )
      .map(({ id }) => id)
  );
  let complexity = 0;
  let value = 0;
  const negligible: string[] = [];
  for (const action of unit.actions) {
    const connected = connectedActions.has(action.id);
    const hasOutput = action.effects.some((effect) => complexityEffectValue(unit, effect) >= 0.01);
    complexity += 0.25;
    value += connected && hasOutput ? 0.25 : 0;
    for (const effect of action.effects) {
      complexity += 1;
      const contribution = connected ? complexityEffectValue(unit, effect) : 0;
      value += contribution;
      if (contribution < 0.01) negligible.push(`${action.id}/${effect.id}`);
    }
    complexity += action.conditions.length * 0.25 + action.stateInteractions.length * 0.25;
    value +=
      action.stateInteractions.filter(({ stateId }) => connected && stateReaders.has(stateId))
        .length * 0.25;
  }
  for (const resource of unit.resources) {
    const weight = 1 + 0.2 * (resource.generation.length + resource.spend.length);
    complexity += weight;
    const supplied =
      resource.startingAmount > 0 ||
      resource.generation.length > 0 ||
      resource.recovery.type !== 'none';
    const used =
      availableResources.has(resource.id) &&
      supplied &&
      (resource.spend.length > 0 ||
        unit.actions.some(
          (action) =>
            connectedActions.has(action.id) &&
            action.resourceCosts.some(({ resourceId }) => resourceId === resource.id)
        ));
    value += used ? weight : 0;
  }
  for (const ability of unit.abilities) {
    const weight = 1 + ability.playerComplexity * 0.2;
    complexity += weight;
    if (availableAbilities.has(ability.id) && connectedActions.has(ability.actionId))
      value += weight * abilityConnection(unit, ability);
  }
  for (const summon of unit.summons) {
    complexity += 1.5;
    const action = unit.actions.find(({ id }) => id === summon.actionId);
    if (
      connectedSummons.has(summon.id) &&
      connectedActions.has(summon.actionId) &&
      action?.effects.some((effect) => complexityEffectValue(unit, effect) >= 0.01)
    ) {
      value += 1.5;
    }
  }
  for (const form of unit.forms) {
    complexity += 1.5;
    if (availableForms.has(form.id)) {
      value +=
        1.5 *
        mean(
          form.operations.map((operation) => (operationIsMeaningful(unit, operation) ? 1 : 0)),
          0
        );
    }
  }
  for (const node of unit.upgradeGraph.nodes) {
    for (const operation of node.operations) {
      complexity += 0.5;
      value += operationIsMeaningful(unit, operation)
        ? 0.5 * operationBaseConnection(unit, operation)
        : 0;
    }
  }
  return {
    raw: complexity === 0 ? 1 : clamp(value / complexity),
    summary: `${round(value)}/${round(complexity)} weighted mechanic atoms receive credit under declared-output and connection rules.`,
    facts: [
      negligible.length === 0
        ? 'No negligible or disconnected effects detected.'
        : `Negligible or disconnected effects: ${negligible.sort().join(', ')}.`
    ]
  };
}

function usefulResourceCycles(report: SimulationReport): number {
  const resourceIds = new Set([
    ...Object.keys(report.resourcesGenerated),
    ...Object.keys(report.resourcesSpent)
  ]);
  return [...resourceIds].reduce((sum, id) => {
    const generated = Object.hasOwn(report.resourcesGenerated, id)
      ? report.resourcesGenerated[id]!
      : 0;
    const spent = Object.hasOwn(report.resourcesSpent, id) ? report.resourcesSpent[id]! : 0;
    return sum + Math.min(Math.max(0, generated), Math.max(0, spent));
  }, 0);
}

function reportUtility(report: SimulationReport) {
  const positive =
    Math.log1p(Math.max(0, report.damageHitPoints)) +
    2 * Math.log1p(Math.max(0, report.kills)) +
    0.25 * Math.log1p(Math.max(0, report.hits)) +
    0.5 * Math.log1p(Math.max(0, report.targetsAffected)) +
    0.5 * Math.log1p(Math.max(0, report.statusUptimeTargetSeconds)) +
    0.75 * Math.log1p(Math.max(0, report.economyGeneratedCredits)) +
    0.25 * clamp(usefulResourceCycles(report) / 10);
  return Math.max(0, positive - 0.25 * Math.log1p(Math.max(0, report.targetingFailures)));
}

const SIMULATION_REPORT_KEYS = [
  'abilityContributionHitPoints',
  'buildFingerprint',
  'damageByAction',
  'damageHitPoints',
  'durationSeconds',
  'economyGeneratedCredits',
  'eventCount',
  'firstEffectSeconds',
  'hits',
  'kills',
  'resourcesGenerated',
  'resourcesSpent',
  'scenarioFingerprint',
  'scenarioId',
  'schemaVersion',
  'seed',
  'statusUptimeTargetSeconds',
  'summonContributionHitPoints',
  'targetingFailures',
  'targetsAffected',
  'unitId',
  'warnings'
] as const;
const SHA256_FINGERPRINT = /^[0-9a-f]{64}$/u;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const MAXIMUM_REPORT_MAGNITUDE = Number.MAX_SAFE_INTEGER;

type SimulationReportValidity = 'valid' | 'invalid' | 'non-finite';

function boundedNumber(value: unknown, minimum = -MAXIMUM_REPORT_MAGNITUDE) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= MAXIMUM_REPORT_MAGNITUDE
  );
}

function boundedRecord(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(([key, amount]) => STABLE_ID.test(key) && boundedNumber(amount, 0))
  );
}

function simulationReportValidity(value: unknown): SimulationReportValidity {
  const jsonIssues = finiteJsonIssues(value);
  if (jsonIssues.some(({ code }) => code === 'SCHEMA_NON_FINITE_NUMBER')) return 'non-finite';
  if (
    jsonIssues.length > 0 ||
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return 'invalid';
  }
  const report = value as Record<string, unknown>;
  const keys = Object.keys(report).sort(compareText);
  if (
    keys.length !== SIMULATION_REPORT_KEYS.length ||
    !SIMULATION_REPORT_KEYS.every((key, index) => key === keys[index])
  ) {
    return 'invalid';
  }
  const duration = report.durationSeconds;
  if (
    report.schemaVersion !== '0.1' ||
    typeof report.unitId !== 'string' ||
    !STABLE_ID.test(report.unitId) ||
    typeof report.scenarioId !== 'string' ||
    !STABLE_ID.test(report.scenarioId) ||
    typeof report.buildFingerprint !== 'string' ||
    !SHA256_FINGERPRINT.test(report.buildFingerprint) ||
    typeof report.scenarioFingerprint !== 'string' ||
    !SHA256_FINGERPRINT.test(report.scenarioFingerprint) ||
    !Number.isInteger(report.seed) ||
    !boundedNumber(report.seed, 0) ||
    (report.seed as number) > 4_294_967_295 ||
    !boundedNumber(duration, Number.MIN_VALUE) ||
    (duration as number) > 120 ||
    !boundedNumber(report.damageHitPoints, 0) ||
    !Number.isSafeInteger(report.kills) ||
    !boundedNumber(report.kills, 0) ||
    !Number.isSafeInteger(report.hits) ||
    !boundedNumber(report.hits, 0) ||
    !Number.isSafeInteger(report.targetsAffected) ||
    !boundedNumber(report.targetsAffected, 0) ||
    !boundedNumber(report.statusUptimeTargetSeconds, 0) ||
    !boundedRecord(report.resourcesGenerated) ||
    !boundedRecord(report.resourcesSpent) ||
    !boundedNumber(report.economyGeneratedCredits) ||
    !boundedNumber(report.abilityContributionHitPoints, 0) ||
    !boundedNumber(report.summonContributionHitPoints, 0) ||
    (report.firstEffectSeconds !== null &&
      (!boundedNumber(report.firstEffectSeconds, 0) ||
        (report.firstEffectSeconds as number) > (duration as number))) ||
    !Number.isSafeInteger(report.targetingFailures) ||
    !boundedNumber(report.targetingFailures, 0) ||
    !boundedRecord(report.damageByAction) ||
    !Number.isSafeInteger(report.eventCount) ||
    !boundedNumber(report.eventCount, 0) ||
    !Array.isArray(report.warnings) ||
    !report.warnings.every((warning) => typeof warning === 'string')
  ) {
    return 'invalid';
  }
  return 'valid';
}

function buildSelectionKey(build: UnitBuild) {
  return JSON.stringify([
    [...build.selection].sort(compareText),
    [...build.selectedFormIds].sort(compareText)
  ]);
}

function sameUpgradeSelection(left: readonly string[], right: readonly string[]) {
  const a = [...left].sort(compareText);
  const b = [...right].sort(compareText);
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function selectionLabel(build: UnitBuild) {
  const upgrades = [...build.selection].sort(compareText).join('+') || 'base';
  const forms = [...build.selectedFormIds].sort(compareText);
  return forms.length === 0 ? upgrades : `${upgrades} [forms:${forms.join('+')}]`;
}

function exactParent(unit: UnitSpec, parent: BuildEvaluation, child: BuildEvaluation) {
  if (
    parent.build.selection.length + 1 !== child.build.selection.length ||
    !parent.build.selection.every((id) => child.build.selection.includes(id)) ||
    validateBuildSelection(unit, {
      upgradeIds: parent.build.selection,
      formIds: parent.build.selectedFormIds
    }).length > 0 ||
    validateBuildSelection(unit, {
      upgradeIds: child.build.selection,
      formIds: child.build.selectedFormIds
    }).length > 0
  ) {
    return false;
  }
  const parentForms = new Set(parent.build.selectedFormIds);
  if ([...parentForms].some((id) => !child.build.selectedFormIds.includes(id))) return false;
  const addedUpgradeId = child.build.selection.find((id) => !parent.build.selection.includes(id));
  const grantedByAddedUpgrade = new Set(
    unit.upgradeGraph.nodes
      .find(({ id }) => id === addedUpgradeId)
      ?.operations.flatMap((operation) =>
        operation.type === 'grant-form' ? [operation.formId] : []
      ) ?? []
  );
  return child.build.selectedFormIds
    .filter((id) => !parentForms.has(id))
    .every((id) => grantedByAddedUpgrade.has(id));
}

function declaredParentCandidates(
  unit: UnitSpec,
  evaluations: readonly BuildEvaluation[],
  child: BuildEvaluation
) {
  if (child.parentSelection === undefined) return [];
  return evaluations.filter(
    (candidate) =>
      candidate !== child &&
      sameUpgradeSelection(candidate.build.selection, child.parentSelection!) &&
      exactParent(unit, candidate, child)
  );
}

function scenarioFingerprints(evaluation: BuildEvaluation) {
  return evaluation.simulations
    .map(({ scenarioFingerprint }) => scenarioFingerprint)
    .sort(compareText);
}

function completeScenarioSet(evaluation: BuildEvaluation) {
  const fingerprints = scenarioFingerprints(evaluation);
  return fingerprints.length > 0 && new Set(fingerprints).size === fingerprints.length;
}

function sameScenarioSet(left: BuildEvaluation, right: BuildEvaluation) {
  const leftFingerprints = scenarioFingerprints(left);
  const rightFingerprints = scenarioFingerprints(right);
  return (
    completeScenarioSet(left) &&
    completeScenarioSet(right) &&
    leftFingerprints.length === rightFingerprints.length &&
    leftFingerprints.every((fingerprint, index) => fingerprint === rightFingerprints[index])
  );
}

function evaluationEdges(
  unit: UnitSpec,
  evaluations: readonly BuildEvaluation[]
): EvaluationEdge[] {
  const ordered = [...evaluations].sort(
    (left, right) =>
      left.build.selection.length - right.build.selection.length ||
      compareText(buildSelectionKey(left.build), buildSelectionKey(right.build))
  );
  const edges: EvaluationEdge[] = [];
  for (const child of ordered) {
    let parent: BuildEvaluation | undefined;
    if (child.parentSelection !== undefined) {
      const declared = declaredParentCandidates(unit, ordered, child);
      if (declared.length === 1) parent = declared[0];
    }
    if (!parent && child.parentSelection === undefined && child.build.selection.length > 0) {
      const candidates = ordered.filter((candidate) => exactParent(unit, candidate, child));
      if (candidates.length === 1) parent = candidates[0];
    }
    if (!parent) continue;
    if (!sameScenarioSet(parent, child)) continue;
    const parentReports = new Map(
      parent.simulations.map((report) => [report.scenarioFingerprint, report])
    );
    const childReports = new Map(
      child.simulations.map((report) => [report.scenarioFingerprint, report])
    );
    const sharedFingerprints = scenarioFingerprints(parent);
    const parentUtility = mean(
      sharedFingerprints.map((fingerprint) => reportUtility(parentReports.get(fingerprint)!))
    );
    const childUtility = mean(
      sharedFingerprints.map((fingerprint) => reportUtility(childReports.get(fingerprint)!))
    );
    edges.push({
      parent,
      child,
      relativeGain: (childUtility - parentUtility) / Math.max(1, Math.abs(parentUtility)),
      scenarioIds: sharedFingerprints.map(
        (fingerprint) => parentReports.get(fingerprint)!.scenarioId
      )
    });
  }
  return edges;
}

function marginalUpgradeValue(edges: readonly EvaluationEdge[]): MetricResult {
  if (edges.length === 0) {
    return {
      raw: 0.5,
      summary:
        'No comparable parent-child simulations were supplied; the dynamic prior remains neutral.',
      facts: [
        'Scenario evidence required: simulate a base build and builds differing by one upgrade.'
      ]
    };
  }
  const scores = edges.map(({ relativeGain }) => clamp((relativeGain + 0.01) / 0.09));
  return {
    raw: mean(scores),
    summary: `${edges.filter(({ relativeGain }) => relativeGain > 0).length}/${scores.length} measured upgrade edges add observable utility.`,
    facts: edges.map(
      ({ parent, child, relativeGain, scenarioIds }) =>
        `${selectionLabel(parent.build)} -> ${selectionLabel(child.build)}: relative utility gain ${round(relativeGain)} across ${scenarioIds.join(', ')}.`
    )
  };
}

function powerCurveShape(edges: readonly EvaluationEdge[]): MetricResult {
  if (edges.length === 0) {
    return {
      raw: 0.5,
      summary: 'No measured upgrade edges were supplied; the dynamic prior remains neutral.',
      facts: ['Scenario evidence required: simulate successive valid builds.']
    };
  }
  const gains = edges.map(({ relativeGain }) => relativeGain);
  const regressions = gains.filter((gain) => gain < -0.01).length;
  const dead = gains.filter((gain) => Math.abs(gain) <= 0.01).length;
  const positive = gains.map((gain) => Math.max(0, gain));
  const total = positive.reduce((sum, gain) => sum + gain, 0);
  const largestShare = total === 0 ? 1 : Math.max(...positive) / total;
  const raw = clamp(
    1 -
      0.5 * (regressions / gains.length) -
      0.25 * (dead / gains.length) -
      0.25 * clamp((largestShare - 0.8) / 0.2)
  );
  return {
    raw,
    summary: `${regressions} utility losses greater than 1%; ${dead} edges within ±1% utility gain, across ${gains.length} measured edges.`,
    facts: [
      `Scenarios: ${sortedUnique(edges.flatMap(({ scenarioIds }) => scenarioIds)).join(', ')}.`,
      `Largest positive gain share: ${round(largestShare)}; aggregate curve score: ${round(raw)}.`
    ]
  };
}

function pathAllocation(unit: UnitSpec, selection: readonly string[]) {
  const nodes = new Map(unit.upgradeGraph.nodes.map((node) => [node.id, node]));
  const allocation = new Map<string, { count: number; highestTier: number }>();
  for (const id of selection) {
    const node = nodes.get(id);
    if (!node?.path) continue;
    const current = allocation.get(node.path) ?? { count: 0, highestTier: 0 };
    current.count += 1;
    current.highestTier = Math.max(current.highestTier, node.tier ?? 0);
    allocation.set(node.path, current);
  }
  return [...allocation]
    .sort(([left], [right]) => compareText(left, right))
    .map(([path, { count, highestTier }]) => `${path}:${count}:${highestTier}`)
    .join('+');
}

function comparableBuilds(unit: UnitSpec, left: BuildEvaluation, right: BuildEvaluation) {
  if (
    left.build.selection.length !== right.build.selection.length ||
    pathAllocation(unit, left.build.selection) === pathAllocation(unit, right.build.selection)
  ) {
    return false;
  }
  const lowerCost = Math.min(left.build.totalCostCredits, right.build.totalCostCredits);
  const upperCost = Math.max(left.build.totalCostCredits, right.build.totalCostCredits);
  if (lowerCost < 0 || upperCost > Math.max(1, lowerCost) * 1.25) return false;
  return sameScenarioSet(left, right);
}

function strictlyDominates(left: BuildEvaluation, right: BuildEvaluation) {
  if (left.build.totalCostCredits > right.build.totalCostCredits) return false;
  const rightReports = new Map(
    right.simulations.map((report) => [report.scenarioFingerprint, report])
  );
  if (!sameScenarioSet(left, right)) return false;
  const pairs = left.simulations.map(
    (report) => [report, rightReports.get(report.scenarioFingerprint)!] as const
  );
  let strictlyBetter = left.build.totalCostCredits < right.build.totalCostCredits;
  for (const [a, b] of pairs) {
    const higherIsBetter = [
      [a.damageHitPoints, b.damageHitPoints],
      [a.kills, b.kills],
      [a.targetsAffected, b.targetsAffected],
      [a.statusUptimeTargetSeconds, b.statusUptimeTargetSeconds],
      [a.economyGeneratedCredits, b.economyGeneratedCredits]
    ] as const;
    for (const [leftValue, rightValue] of higherIsBetter) {
      if (leftValue + 1e-9 < rightValue) return false;
      if (leftValue > rightValue * 1.05 + 1e-9) strictlyBetter = true;
    }
    if (a.targetingFailures > b.targetingFailures) return false;
    if (a.targetingFailures < b.targetingFailures) strictlyBetter = true;
  }
  return strictlyBetter;
}

function crossPathHealth(unit: UnitSpec, evaluations: readonly BuildEvaluation[]): MetricResult {
  const zeroCostPower = unit.upgradeGraph.nodes.filter(
    (node) =>
      node.costCredits === 0 &&
      node.operations.some((operation) => operationIsMeaningful(unit, operation))
  );
  const structuralHealth = clamp(1 - zeroCostPower.length * 0.65);
  const comparable: Array<readonly [BuildEvaluation, BuildEvaluation]> = [];
  for (let left = 0; left < evaluations.length; left += 1) {
    for (let right = left + 1; right < evaluations.length; right += 1) {
      const a = evaluations[left]!;
      const b = evaluations[right]!;
      if (comparableBuilds(unit, a, b)) comparable.push([a, b]);
    }
  }
  const dominated = comparable.filter(
    ([left, right]) => strictlyDominates(left, right) || strictlyDominates(right, left)
  );
  const dynamicHealth = comparable.length === 0 ? 0.5 : 1 - dominated.length / comparable.length;
  const raw = Math.min(structuralHealth, dynamicHealth);
  return {
    raw,
    summary: `${dominated.length}/${comparable.length} comparable cross-path build pairs show strict observable dominance.`,
    facts: [
      'Comparable builds have equal selected-node count, distinct per-path tier allocation, and costs within 25%.',
      zeroCostPower.length === 0
        ? 'No zero-cost upgrade with a declared non-no-op change was found.'
        : `Zero-cost upgrades with declared non-no-op changes: ${zeroCostPower
            .map(({ id }) => id)
            .sort()
            .join(', ')}.`,
      comparable.length === 0
        ? 'Scenario evidence required: simulate equal-depth builds using different paths.'
        : `Strictly dominated pairs: ${dominated.length}; structural health: ${round(structuralHealth)}; scenarios: ${sortedUnique(evaluations.flatMap(({ simulations }) => simulations.map(({ scenarioId }) => scenarioId))).join(', ')}.`
    ]
  };
}

function diagnosticSelection(build: UnitBuild): BuildSelection {
  return {
    upgradeIds: [...build.selection].sort(compareText),
    ...(build.selectedFormIds.length === 0
      ? {}
      : { formIds: [...build.selectedFormIds].sort(compareText) })
  };
}

function observationDifferences(before: BuildEvaluation, after: BuildEvaluation): string[] {
  const previous = new Map(
    before.simulations.map((report) => [report.scenarioFingerprint, report])
  );
  return [...after.simulations]
    .sort((left, right) => compareText(left.scenarioFingerprint, right.scenarioFingerprint))
    .map((report) => {
      const parent = previous.get(report.scenarioFingerprint)!;
      return `${report.scenarioId}: damage ${round(report.damageHitPoints - parent.damageHitPoints)} HP; kills ${report.kills - parent.kills}; hits ${report.hits - parent.hits}; targets ${report.targetsAffected - parent.targetsAffected}; status uptime ${round(report.statusUptimeTargetSeconds - parent.statusUptimeTargetSeconds)} target-seconds; economy ${round(report.economyGeneratedCredits - parent.economyGeneratedCredits)} credits; useful resource cycles ${round(usefulResourceCycles(report) - usefulResourceCycles(parent))}; targeting failures ${report.targetingFailures - parent.targetingFailures}.`;
    });
}

function reviewFindings(
  unit: UnitSpec,
  evaluations: readonly BuildEvaluation[],
  edges: readonly EvaluationEdge[]
): DiagnosticReviewFinding[] {
  const findings: DiagnosticReviewFinding[] = [];
  for (const { parent, child, relativeGain, scenarioIds } of edges) {
    if (relativeGain > 0.01) continue;
    const code =
      relativeGain < 0
        ? 'SCENARIO_REGRESSING_UPGRADE_EDGE'
        : relativeGain === 0
          ? 'SCENARIO_NO_UTILITY_GAIN'
          : 'SCENARIO_LOW_UTILITY_GAIN';
    const observation =
      relativeGain < 0
        ? 'Lower measured utility'
        : relativeGain === 0
          ? 'No measured utility gain'
          : 'Measured utility gain at most 1%';
    findings.push({
      code,
      summary: `${observation} for ${selectionLabel(parent.build)} -> ${selectionLabel(child.build)} in the supplied scenarios. Other situations and unmodeled benefits are not assessed.`,
      parentSelection: diagnosticSelection(parent.build),
      childSelection: diagnosticSelection(child.build),
      relativeUtilityGain: relativeGain,
      scenarioIds: [...scenarioIds],
      scenarioFingerprints: scenarioFingerprints(parent),
      facts: observationDifferences(parent, child)
    });
  }
  const ordered = [...evaluations].sort((left, right) =>
    compareText(buildSelectionKey(left.build), buildSelectionKey(right.build))
  );
  for (let left = 0; left < ordered.length; left += 1) {
    for (const right of ordered.slice(left + 1)) {
      const first = ordered[left]!;
      if (!comparableBuilds(unit, first, right)) continue;
      const pair = strictlyDominates(first, right)
        ? ([first, right] as const)
        : strictlyDominates(right, first)
          ? ([right, first] as const)
          : undefined;
      if (!pair) continue;
      const [dominant, dominated] = pair;
      findings.push({
        code: 'SCENARIO_DOMINATED_CROSS_PATH_BUILD',
        summary: `${selectionLabel(dominant.build)} dominates ${selectionLabel(dominated.build)} on the measured observables and costs in the supplied scenarios. This does not establish universal dominance.`,
        dominantSelection: diagnosticSelection(dominant.build),
        dominatedSelection: diagnosticSelection(dominated.build),
        dominantCostCredits: dominant.build.totalCostCredits,
        dominatedCostCredits: dominated.build.totalCostCredits,
        scenarioIds: [...dominant.simulations]
          .sort((a, b) => compareText(a.scenarioFingerprint, b.scenarioFingerprint))
          .map(({ scenarioId }) => scenarioId),
        scenarioFingerprints: scenarioFingerprints(dominant),
        facts: observationDifferences(dominated, dominant)
      });
    }
  }
  return findings;
}

function deepestEvaluations(evaluations: readonly BuildEvaluation[]) {
  const maximumDepth = Math.max(
    ...evaluations.map(({ build: { selection } }) => selection.length),
    -1
  );
  return evaluations
    .filter(({ build: { selection } }) => selection.length === maximumDepth)
    .sort((left, right) =>
      compareText(buildSelectionKey(left.build), buildSelectionKey(right.build))
    );
}

// Exact vocabulary prevents free text from changing which role observations count.
const ROLE_SIGNALS: Record<
  string,
  'damage' | 'control' | 'economy' | 'ability' | 'summon' | 'support'
> = Object.assign(Object.create(null), {
  damage: 'damage',
  attack: 'damage',
  strike: 'damage',
  burst: 'damage',
  'single-target': 'damage',
  crowd: 'damage',
  control: 'control',
  slow: 'control',
  stun: 'control',
  debuff: 'control',
  mark: 'control',
  economy: 'economy',
  income: 'economy',
  resource: 'economy',
  ability: 'ability',
  active: 'ability',
  summon: 'summon',
  spawn: 'summon',
  support: 'support',
  utility: 'support'
});

function roleConsistency(unit: UnitSpec, evaluations: readonly BuildEvaluation[]): MetricResult {
  const deepest = deepestEvaluations(evaluations);
  const reports = deepest.flatMap(({ simulations }) => simulations);
  if (reports.length === 0) {
    return {
      raw: 0.5,
      summary: 'No scenario observations were supplied for declared-role comparison.',
      facts: [`Declared roles: ${unit.roles.join(', ')}.`]
    };
  }
  const sum = (pick: (report: SimulationReport) => number) =>
    reports.reduce((total, report) => total + pick(report), 0);
  const signals = {
    damage: sum((report) => report.damageHitPoints + report.kills),
    control: sum((report) => report.statusUptimeTargetSeconds),
    economy: sum(
      (report) =>
        report.economyGeneratedCredits +
        Object.values(report.resourcesGenerated).reduce((a, b) => a + b, 0)
    ),
    ability: sum((report) => report.abilityContributionHitPoints),
    summon: sum((report) => report.summonContributionHitPoints),
    support: sum((report) => report.statusUptimeTargetSeconds + report.economyGeneratedCredits)
  };
  const recognized = unit.roles.flatMap((role) => {
    const signal = ROLE_SIGNALS[role];
    return signal ? [{ role, signal, observed: signals[signal] }] : [];
  });
  const scores = unit.roles.map((role) => {
    const signal = ROLE_SIGNALS[role];
    return signal && signals[signal] > 0 ? 1 : 0;
  });
  return {
    raw: mean(scores, 0),
    summary: `${scores.filter(Boolean).length}/${scores.length} recognized declared roles have matching observables.`,
    facts: recognized.length
      ? [
          `Aggregated ${deepest.length} deepest representative builds at selection depth ${deepest[0]?.build.selection.length ?? 0}.`,
          `Scenarios: ${sortedUnique(reports.map(({ scenarioId }) => scenarioId)).join(', ')}.`,
          ...recognized.map(
            ({ role, signal, observed }) =>
              `${role} -> ${signal}: observed signal ${round(observed)}.`
          )
        ]
      : [
          'No declared role matched the profile’s generic role vocabulary; no source-specific inference was made.'
        ]
  };
}

function scenarioRobustness(evaluations: readonly BuildEvaluation[]): MetricResult {
  const deepest = deepestEvaluations(evaluations);
  const reports = deepest.flatMap(({ simulations }) => simulations);
  if (reports.length === 0) {
    return {
      raw: 0.5,
      summary: 'No scenario observations were supplied; the dynamic prior remains neutral.',
      facts: [
        'Scenario evidence required: simulate the same resolved build in more than one relevant scenario.'
      ]
    };
  }
  const scoresByScenario = new Map<string, { id: string; scores: number[] }>();
  for (const report of reports) {
    const materiality = clamp(reportUtility(report) / 2);
    const timeliness =
      report.firstEffectSeconds === null
        ? 0
        : clamp(1 - report.firstEffectSeconds / Math.max(report.durationSeconds, 0.000001));
    const targetingReliability = 1 / (1 + Math.max(0, report.targetingFailures));
    const entry = scoresByScenario.get(report.scenarioFingerprint) ?? {
      id: report.scenarioId,
      scores: []
    };
    entry.scores.push(materiality * mean([timeliness, targetingReliability]));
    scoresByScenario.set(report.scenarioFingerprint, entry);
  }
  const scenarioScores = [...scoresByScenario]
    .map(([fingerprint, { id, scores }]) => ({ fingerprint, id, score: mean(scores) }))
    .sort((left, right) => right.score - left.score || compareText(left.id, right.id));
  return {
    raw: mean(
      scenarioScores.map(({ score }) => score),
      0
    ),
    summary: `${scenarioScores.filter(({ score }) => score >= 0.5).length}/${scenarioScores.length} supplied scenarios meet the engagement diagnostic threshold; all supplied scenarios are included.`,
    facts: [
      `Aggregated ${deepest.length} deepest representative builds at selection depth ${deepest[0]?.build.selection.length ?? 0}.`,
      ...scenarioScores.map(
        ({ id, score }) => `${id}: mean material engagement/targeting score ${round(score)}.`
      )
    ]
  };
}

interface EvaluationValidation {
  evaluations: BuildEvaluation[];
  invalidBuilds: number;
  invalidReports: number;
  nonFiniteReports: number;
  identityMismatches: number;
  scenarioIdentityMismatches: number;
}

function validateEvaluations(
  unit: UnitSpec,
  candidates: readonly BuildEvaluation[]
): EvaluationValidation {
  const result: EvaluationValidation = {
    evaluations: [],
    invalidBuilds: 0,
    invalidReports: 0,
    nonFiniteReports: 0,
    identityMismatches: 0,
    scenarioIdentityMismatches: 0
  };
  const scenarioIds = new Map<string, string>();
  const scenarioFingerprints = new Map<string, string>();
  for (const candidate of candidates) {
    let buildValue: unknown;
    let simulationsValue: unknown;
    let parentSelectionValue: unknown;
    try {
      if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
        result.invalidBuilds += 1;
        continue;
      }
      const record = candidate as unknown as Record<string, unknown>;
      buildValue = record.build;
      simulationsValue = record.simulations;
      parentSelectionValue = record.parentSelection;
    } catch {
      result.invalidBuilds += 1;
      continue;
    }
    const buildValidation = validateUnitBuild(buildValue);
    if (
      !buildValidation.valid ||
      buildValidation.value === undefined ||
      buildValidation.value.unitId !== unit.id ||
      (parentSelectionValue !== undefined &&
        (!Array.isArray(parentSelectionValue) ||
          !parentSelectionValue.every((id) => typeof id === 'string' && STABLE_ID.test(id))))
    ) {
      result.invalidBuilds += 1;
      continue;
    }
    const build = buildValidation.value;
    const expectedBuild = compileResolvedSelection(unit, {
      upgradeIds: build.selection,
      formIds: build.selectedFormIds
    });
    const buildFingerprint = fingerprintUnitBuild(build);
    if (!expectedBuild.ok || fingerprintUnitBuild(expectedBuild.build) !== buildFingerprint) {
      result.invalidBuilds += 1;
      continue;
    }
    if (!Array.isArray(simulationsValue)) {
      result.invalidReports += 1;
      continue;
    }
    const actionIds = new Set(build.actions.map(({ id }) => id));
    const resourceIds = new Set(build.resources.map(({ id }) => id));
    const reports: SimulationReport[] = [];
    let usable = true;
    for (const reportValue of simulationsValue) {
      const validity = simulationReportValidity(reportValue);
      if (validity !== 'valid') {
        result[validity === 'non-finite' ? 'nonFiniteReports' : 'invalidReports'] += 1;
        usable = false;
        continue;
      }
      const report = reportValue as SimulationReport;
      if (
        [...Object.keys(report.resourcesGenerated), ...Object.keys(report.resourcesSpent)].some(
          (id) => !resourceIds.has(id)
        ) ||
        Object.keys(report.damageByAction).some((id) => !actionIds.has(id))
      ) {
        result.invalidReports += 1;
        usable = false;
        continue;
      }
      if (report.unitId !== unit.id || report.buildFingerprint !== buildFingerprint) {
        result.identityMismatches += 1;
        usable = false;
        continue;
      }
      const priorFingerprint = scenarioIds.get(report.scenarioId);
      const priorId = scenarioFingerprints.get(report.scenarioFingerprint);
      if (
        (priorFingerprint !== undefined && priorFingerprint !== report.scenarioFingerprint) ||
        (priorId !== undefined && priorId !== report.scenarioId)
      ) {
        result.scenarioIdentityMismatches += 1;
        usable = false;
        continue;
      }
      scenarioIds.set(report.scenarioId, report.scenarioFingerprint);
      scenarioFingerprints.set(report.scenarioFingerprint, report.scenarioId);
      reports.push(report);
    }
    if (!usable) continue;
    result.evaluations.push({
      build,
      simulations: reports,
      ...(parentSelectionValue === undefined
        ? {}
        : { parentSelection: parentSelectionValue as string[] })
    });
  }
  return result;
}

function assertProfile(profile: DiagnosticProfile) {
  if (
    !Number.isFinite(profile.maximumMetricWeight) ||
    profile.maximumMetricWeight <= 0 ||
    profile.maximumMetricWeight * DIAGNOSTIC_METRIC_IDS.length < 1 - 1e-9
  ) {
    throw new Error(
      'Score profile maximumMetricWeight must be finite, positive, and large enough for normalized weights.'
    );
  }
  const weights = DIAGNOSTIC_METRIC_IDS.map((metric) => profile.weights[metric]);
  if (
    weights.some(
      (weight) => !Number.isFinite(weight) || weight < 0 || weight > profile.maximumMetricWeight
    )
  ) {
    throw new Error(
      'Score profile weights must be finite, non-negative, and at most maximumMetricWeight.'
    );
  }
  if (Math.abs(weights.reduce((sum, weight) => sum + weight, 0) - 1) > 1e-9) {
    throw new Error('Score profile weights must sum to 1.');
  }
  for (const metric of DIAGNOSTIC_METRIC_IDS) {
    const range = profile.normalization[metric];
    if (
      !range ||
      !Number.isFinite(range.minimum) ||
      !Number.isFinite(range.maximum) ||
      range.maximum <= range.minimum
    ) {
      throw new Error(
        `Score profile normalization for ${metric} must have a finite increasing range.`
      );
    }
  }
}

/**
 * Scores finished-unit mechanics only. Validation decides hardAcceptance; source,
 * provenance, annotations, prose, and extensions are intentionally not inputs.
 */
export function diagnoseUnit(
  unit: UnitSpec,
  options: UnitDiagnosticOptions = {}
): UnitDiagnosticReport {
  const profile = options.profile ?? DEFAULT_DIAGNOSTIC_PROFILE;
  assertProfile(profile);
  const unitValidation = validateUnitSpec(unit);
  const hardAcceptance = unitValidation.valid && unitValidation.value !== undefined;
  const scorableUnit = hardAcceptance ? unitValidation.value : undefined;
  const requestedEvaluations = Array.isArray(options.evaluations) ? options.evaluations : [];
  const invalidEvaluationCollection =
    options.evaluations !== undefined && !Array.isArray(options.evaluations);
  const validated = scorableUnit
    ? validateEvaluations(scorableUnit, requestedEvaluations)
    : {
        evaluations: [],
        invalidBuilds: 0,
        invalidReports: 0,
        nonFiniteReports: 0,
        identityMismatches: 0,
        scenarioIdentityMismatches: 0
      };
  const evaluations = validated.evaluations;
  const duplicateScenarioEvaluations = evaluations.filter(
    (evaluation) => !completeScenarioSet(evaluation)
  );
  const completeScenarioEvaluations = evaluations.filter(completeScenarioSet);
  const firstCompleteScenarioEvaluation = completeScenarioEvaluations[0];
  const mismatchedScenarioSets =
    firstCompleteScenarioEvaluation === undefined
      ? false
      : completeScenarioEvaluations
          .slice(1)
          .some((evaluation) => !sameScenarioSet(firstCompleteScenarioEvaluation, evaluation));
  const incompleteScenarioEvidence =
    duplicateScenarioEvaluations.length > 0 || mismatchedScenarioSets;
  const selectionCounts = new Map<string, number>();
  for (const evaluation of evaluations) {
    const key = buildSelectionKey(evaluation.build);
    selectionCounts.set(key, (selectionCounts.get(key) ?? 0) + 1);
  }
  const duplicateSelections = [...selectionCounts]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort(compareText);
  const invalidParentLinks = evaluations.filter(({ parentSelection, build }) => {
    if (parentSelection === undefined) return false;
    return (
      declaredParentCandidates(unit, evaluations, {
        build,
        simulations: [],
        parentSelection
      }).length !== 1
    );
  });
  const truncated = evaluations.flatMap((evaluation) =>
    evaluation.simulations.flatMap((report) =>
      report.warnings.some((warning) =>
        /(?:\btruncat\w*\b|\bcapped\b|\b(?:limit|cap)\b.*\b(?:breached|reached)\b)/i.test(warning)
      )
        ? [{ evaluation, report }]
        : []
    )
  );
  const unsupportedReports = evaluations
    .flatMap(({ simulations }) => simulations)
    .filter(({ warnings }) =>
      warnings.some((warning) =>
        /unsupported|not modelled|not scheduled|unavailable|skipped/i.test(warning)
      )
    );
  const invalidEvidence =
    invalidEvaluationCollection ||
    unsupportedReports.length > 0 ||
    validated.invalidBuilds > 0 ||
    validated.invalidReports > 0 ||
    validated.nonFiniteReports > 0 ||
    validated.identityMismatches > 0 ||
    validated.scenarioIdentityMismatches > 0;
  const dynamicEvaluations =
    hardAcceptance &&
    !invalidEvidence &&
    truncated.length === 0 &&
    !incompleteScenarioEvidence &&
    duplicateSelections.length === 0 &&
    invalidParentLinks.length === 0
      ? evaluations
      : [];
  const edges = scorableUnit ? evaluationEdges(scorableUnit, dynamicEvaluations) : [];
  const applicable = scorableUnit !== undefined && scorableUnit.upgradeGraph.paths.length === 3;
  const unknownRoles = scorableUnit?.roles.filter((role) => ROLE_SIGNALS[role] === undefined) ?? [];
  const coveredNodes = new Set(dynamicEvaluations.flatMap(({ build }) => build.selection));
  const missingNodes =
    scorableUnit?.upgradeGraph.nodes.filter(({ id }) => !coveredNodes.has(id)) ?? [];
  const measuredUpgradeIds = new Set(
    edges.flatMap(({ parent, child }) =>
      child.build.selection.filter((id) => !parent.build.selection.includes(id))
    )
  );
  const hasUpgradeEdgeCoverage =
    scorableUnit !== undefined &&
    scorableUnit.upgradeGraph.nodes.every(({ id }) => measuredUpgradeIds.has(id));
  const hasBase = dynamicEvaluations.some(({ build }) => build.selection.length === 0);
  const hasScenarioCoverage = (dynamicEvaluations[0]?.simulations.length ?? 0) >= 2;
  const hasCrossPathEvidence = dynamicEvaluations.some((left, index) =>
    dynamicEvaluations.slice(index + 1).some((right) => comparableBuilds(unit, left, right))
  );
  const eligibilityReasons = [
    ...(!hardAcceptance ? ['INVALID_UNIT'] : []),
    ...(hardAcceptance && !applicable ? ['UNSUPPORTED_TOPOLOGY'] : []),
    ...(unknownRoles.length > 0 ? ['UNSUPPORTED_ROLE'] : []),
    ...(unsupportedReports.length > 0 ? ['UNSUPPORTED_SIMULATION_EVIDENCE'] : []),
    ...(invalidEvidence ||
    truncated.length > 0 ||
    incompleteScenarioEvidence ||
    duplicateSelections.length > 0 ||
    invalidParentLinks.length > 0
      ? ['INVALID_DYNAMIC_EVIDENCE']
      : []),
    ...(dynamicEvaluations.length === 0 ? ['MISSING_DYNAMIC_EVIDENCE'] : []),
    ...(!hasBase || missingNodes.length > 0 ? ['INCOMPLETE_BUILD_COVERAGE'] : []),
    ...(!hasScenarioCoverage ? ['INCOMPLETE_SCENARIO_COVERAGE'] : []),
    ...(edges.length === 0 ? ['MISSING_UPGRADE_EDGES'] : []),
    ...(!hasUpgradeEdgeCoverage ? ['INCOMPLETE_UPGRADE_EDGE_COVERAGE'] : []),
    ...(!hasCrossPathEvidence ? ['MISSING_CROSS_PATH_EVIDENCE'] : [])
  ];
  const diagnosticEligibility = {
    eligible: eligibilityReasons.length === 0,
    reasons: eligibilityReasons
  };
  const metricStatus = (metric: DiagnosticMetricId): DiagnosticMetricEvidence['status'] => {
    if (!hardAcceptance) return 'unavailable';
    if (!applicable || (metric === 'roleConsistency' && unknownRoles.length > 0))
      return 'unsupported';
    if (DEFAULT_DIAGNOSTIC_PROFILE.formulas[metric].kind === 'static') return 'measured';
    if (unsupportedReports.length > 0) return 'unsupported';
    if (
      dynamicEvaluations.length === 0 ||
      !hasBase ||
      missingNodes.length > 0 ||
      !hasScenarioCoverage
    )
      return 'unavailable';
    if (
      (metric === 'marginalUpgradeValue' || metric === 'powerCurveShape') &&
      !hasUpgradeEdgeCoverage
    )
      return 'unavailable';
    if (metric === 'crossPathHealth' && !hasCrossPathEvidence) return 'unavailable';
    return 'measured';
  };
  const unavailable = (): MetricResult => ({
    raw: 0.5,
    summary: 'Metric unavailable because the UnitSpec failed strict validation.',
    facts: ['Strict UnitSpec validation is required before diagnostic metrics are interpreted.']
  });
  const results: Record<DiagnosticMetricId, MetricResult> = scorableUnit
    ? {
        pathIdentity: pathIdentity(scorableUnit),
        pathDistinctness: pathDistinctness(scorableUnit),
        progressionCoherence: progressionCoherence(scorableUnit),
        baseContinuity: baseContinuity(scorableUnit),
        abilityIntegration: abilityIntegration(scorableUnit),
        complexityEconomy: complexityEconomy(scorableUnit),
        marginalUpgradeValue: marginalUpgradeValue(edges),
        powerCurveShape: powerCurveShape(edges),
        crossPathHealth: crossPathHealth(scorableUnit, dynamicEvaluations),
        roleConsistency: roleConsistency(scorableUnit, dynamicEvaluations),
        scenarioRobustness: scenarioRobustness(dynamicEvaluations)
      }
    : (Object.fromEntries(DIAGNOSTIC_METRIC_IDS.map((metric) => [metric, unavailable()])) as Record<
        DiagnosticMetricId,
        MetricResult
      >);
  const rawMetrics = {} as Record<DiagnosticMetricId, number>;
  const normalizedMetrics = {} as Record<DiagnosticMetricId, number>;
  const evidence = DIAGNOSTIC_METRIC_IDS.map((metric) => {
    const result = results[metric];
    const range = profile.normalization[metric];
    const raw = round(clamp(Number.isFinite(result.raw) ? result.raw : 0.5));
    const normalized = round(clamp((raw - range.minimum) / (range.maximum - range.minimum)));
    rawMetrics[metric] = raw;
    normalizedMetrics[metric] = normalized;
    return {
      metric,
      status: metricStatus(metric),
      raw,
      normalized,
      summary: result.summary,
      facts: result.facts
    };
  });
  const warnings = [
    ...(!diagnosticEligibility.eligible
      ? [`Diagnostic comparison unavailable: ${eligibilityReasons.join(', ')}.`]
      : []),
    ...(unknownRoles.length > 0 ? [`Unsupported role IDs: ${unknownRoles.join(', ')}.`] : []),
    ...(requestedEvaluations.length === 0
      ? ['Dynamic scenario evidence was not supplied; five dynamic metrics retain neutral priors.']
      : []),
    ...(evaluations.some(({ simulations }) => simulations.length === 0)
      ? ['At least one build evaluation has no simulation reports.']
      : []),
    ...evaluations.flatMap(({ build, simulations }) =>
      simulations.flatMap((report) =>
        report.warnings.map(
          (warning) => `Simulation ${report.scenarioId} for ${selectionLabel(build)}: ${warning}`
        )
      )
    ),
    ...(truncated.length === 0
      ? []
      : [
          `Dynamic scenario evidence was neutralized because ${truncated.length} simulation report${truncated.length === 1 ? ' was' : 's were'} truncated or capped.`
        ]),
    ...(validated.nonFiniteReports === 0
      ? []
      : [
          `Dynamic scenario evidence was neutralized because ${validated.nonFiniteReports} simulation report${validated.nonFiniteReports === 1 ? ' contains' : 's contain'} non-finite measurements.`
        ]),
    ...(validated.invalidBuilds === 0 && !invalidEvaluationCollection
      ? []
      : [
          `Dynamic scenario evidence was neutralized because ${validated.invalidBuilds + (invalidEvaluationCollection ? 1 : 0)} build evaluation${validated.invalidBuilds + (invalidEvaluationCollection ? 1 : 0) === 1 ? ' is' : 's are'} invalid.`
        ]),
    ...(validated.invalidReports === 0
      ? []
      : [
          `Dynamic scenario evidence was neutralized because ${validated.invalidReports} simulation report${validated.invalidReports === 1 ? ' has' : 's have'} an invalid or incomplete shape.`
        ]),
    ...(validated.identityMismatches === 0
      ? []
      : [
          `Dynamic scenario evidence was neutralized because ${validated.identityMismatches} simulation report${validated.identityMismatches === 1 ? ' does' : 's do'} not match its unit and build fingerprint.`
        ]),
    ...(validated.scenarioIdentityMismatches === 0
      ? []
      : [
          `Dynamic scenario evidence was neutralized because ${validated.scenarioIdentityMismatches} simulation report${validated.scenarioIdentityMismatches === 1 ? ' has' : 's have'} inconsistent scenario identity.`
        ]),
    ...(duplicateScenarioEvaluations.length === 0
      ? []
      : [
          `Dynamic scenario evidence was neutralized because ${duplicateScenarioEvaluations.length} build evaluation${duplicateScenarioEvaluations.length === 1 ? ' has' : 's have'} empty or duplicate scenario fingerprints.`
        ]),
    ...(!mismatchedScenarioSets
      ? []
      : [
          'Dynamic scenario evidence was neutralized because build evaluations do not have identical scenario-fingerprint sets.'
        ]),
    ...(duplicateSelections.length === 0
      ? []
      : [
          `Dynamic scenario evidence was neutralized because ${duplicateSelections.length} selection key${duplicateSelections.length === 1 ? ' is' : 's are'} duplicated.`
        ]),
    ...(invalidParentLinks.length === 0
      ? []
      : [
          `${invalidParentLinks.length} declared parent selection${invalidParentLinks.length === 1 ? ' was' : 's were'} ignored because it was not an exact one-upgrade subset.`
        ]),
    ...(profile.calibrationStatus === 'uncalibrated'
      ? ['The diagnostic profile is uncalibrated.']
      : []),
    ...(!hardAcceptance
      ? [
          `Hard acceptance failed; strict UnitSpec validation reported ${unitValidation.issues.length} issue${unitValidation.issues.length === 1 ? '' : 's'}.`
        ]
      : [])
  ];
  const findings = scorableUnit ? reviewFindings(scorableUnit, dynamicEvaluations, edges) : [];
  let unitId = 'invalid-unit';
  try {
    if (typeof unit?.id === 'string' && unit.id.length > 0) unitId = unit.id;
  } catch {
    // Strict validation already records unsafe input; retain a stable report identity.
  }
  return {
    schemaVersion: '0.2',
    unitId,
    hardAcceptance,
    diagnosticEligibility,
    rawMetrics,
    normalizedMetrics,
    assessment: {
      status: !hardAcceptance ? 'invalid' : findings.length > 0 ? 'needs-review' : 'unrated',
      generalQuality: 'unrated',
      unknownDimensions: ['source-fidelity', 'gameplay-quality', 'competitive-balance']
    },
    reviewFindings: findings,
    evidence,
    warnings: sortedUnique(warnings),
    diagnosticProfileId: profile.id,
    diagnosticProfileVersion: profile.version,
    calibrationStatus: profile.calibrationStatus
  };
}
